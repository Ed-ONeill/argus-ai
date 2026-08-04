"""
app/materiality_routing_runtime.py — Wave 0.4 A3: safe-routing SEAM (ADVISORY).

Once per pipeline cycle, WHEN the A3 gate is enabled, this seam:

  1. reads A2's latest successful ActivationState (no A1/A2 re-resolution) and the
     current ActivationConfiguration (read-only, for engine/policy/canary facts);
  2. builds an immutable RoutingContext (cycle-level, subject = null);
  3. calls the PURE resolve_route();
  4. sets applied_route = legacy (enforced; the resolver already caps it);
  5. records a bounded, coalescing per-decision observation;
  6. appends a transition-only, content-addressed cycle-level RoutingAudit;
  7. updates the read-only latest-ProposedRoute accessor only after a successful
     resolution and audit handling;
  8. returns without changing any production object.

The routing result GOVERNS NOTHING: it is read by no production consumer, and the
legacy path remains the only applied path. Re-entry within the same cycle is a
no-op. Every failure is isolated into diagnostics and preserves the legacy result.
A1/A2 are frozen and imported read-only; C4 is never computed here.
"""

from __future__ import annotations

import copy
import hashlib
import json
import threading
from collections import OrderedDict
from dataclasses import dataclass, replace
from datetime import datetime, timezone
from pathlib import Path

from app.materiality_activation import (
    ACTIVATION_SPECIFICATION_V1,
    MODE_CANARY,
    canary_assignment_salt,
    in_canary,
)
from app.materiality_activation_config import ActivationConfigurationStore
from app.materiality_activation_runtime import DEFAULT_CONFIG_PATH, latest_activation_state
from app.materiality_evaluation import canonical_json_bytes, canonical_json_text, utc_timestamp
from app.materiality_routing import (
    FALLBACK_ENFORCEMENT_CAP,
    FALLBACK_MATERIALITY_UNAVAILABLE,
    ROUTE_LEGACY,
    ROUTING_SPECIFICATION_V1,
    ProposedRoute,
    RoutingContext,
    RoutingSpecification,
    resolve_route,
)
from app.storage import ROUTING_DIR

DEFAULT_ROUTING_AUDIT_DIR = ROUTING_DIR
_ROUTING_AUDIT_FILENAME = "routing-audit.jsonl"


def _now() -> datetime:
    return datetime.now(timezone.utc)


# ══════════════════════════════════════════════════════════════════════════════
# Bounded, coalescing observation ring (R-6): max 128, oldest-first eviction.
# ══════════════════════════════════════════════════════════════════════════════
@dataclass(frozen=True)
class RoutingObservation:
    proposed_route: str
    applied_route: str
    reason_code: str
    fallback_reason: str
    activation_state_id: str
    routing_specification_id: str
    occurrence_count: int
    last_seen_at: str


class RoutingObservations:
    MAX_ENTRIES = 128

    def __init__(self) -> None:
        self._entries: OrderedDict[tuple, RoutingObservation] = OrderedDict()
        self._lock = threading.RLock()

    def record(self, proposed: ProposedRoute, activation_state_id: str, *,
               observed_at: datetime | None = None) -> RoutingObservation:
        key = (proposed.proposed_route, proposed.applied_route, proposed.reason_code,
               proposed.fallback_reason or "", activation_state_id,
               proposed.routing_specification_id)
        stamp = utc_timestamp(observed_at or _now())
        with self._lock:
            existing = self._entries.get(key)
            if existing is None:
                entry = RoutingObservation(*key, occurrence_count=1, last_seen_at=stamp)
                self._entries[key] = entry
                if len(self._entries) > self.MAX_ENTRIES:
                    self._entries.popitem(last=False)          # oldest-first eviction
            else:
                entry = replace(existing, occurrence_count=existing.occurrence_count + 1,
                                last_seen_at=stamp)
                self._entries[key] = entry
            return entry

    def snapshot(self) -> tuple[RoutingObservation, ...]:
        with self._lock:
            return tuple(self._entries.values())

    def clear(self) -> None:
        with self._lock:
            self._entries.clear()


OBSERVATIONS = RoutingObservations()


def _diag(code: str, detail: str) -> None:
    # Operational failure diagnostics as a coalesced observation of legacy fallback.
    OBSERVATIONS.record(
        ProposedRoute(routing_specification_id=ROUTING_SPECIFICATION_V1.routing_specification_id,
                      routing_context_id="", requested_route=ROUTE_LEGACY,
                      proposed_route=ROUTE_LEGACY, eligibility_result={}, reason_code=code,
                      applied_route=ROUTE_LEGACY, fallback_reason=detail),
        activation_state_id="")


# ══════════════════════════════════════════════════════════════════════════════
# Transition-only, chain-coherent cycle-level RoutingAudit (J-2/J-3).
#
# The audit identity is TRANSITION-AWARE: it binds previous_routing_audit_id +
# from_summary_hash + to_summary_hash + the summary content. This distinguishes a
# recurrence such as A → B → A — the returning A hashes DIFFERENTLY from the baseline
# A (its predecessor/from differ), so each genuine summary transition is exactly one
# new logical artifact. Reload verifies both content-integrity and chain contiguity.
# ══════════════════════════════════════════════════════════════════════════════
class RoutingAuditError(RuntimeError):
    """Routing-audit persistence failed — isolated into diagnostics; the applied
    legacy route is unaffected and the latest snapshot is left unchanged."""


def _summary_content(routing_specification_id: str, activation_state_id: str | None,
                     proposed_route_counts: dict, applied_route_counts: dict,
                     reason_code_counts: dict, fallback_reason_counts: dict,
                     eligible_decision_count: int) -> dict:
    def _s(counts: dict) -> dict:
        return {k: counts[k] for k in sorted(counts)}
    return {
        "routing_specification_id": routing_specification_id,
        "activation_state_id": activation_state_id,
        "proposed_route_counts": _s(proposed_route_counts),
        "applied_route_counts": _s(applied_route_counts),
        "reason_code_counts": _s(reason_code_counts),
        "fallback_reason_counts": _s(fallback_reason_counts),
        "eligible_decision_count": eligible_decision_count,
    }


@dataclass(frozen=True)
class RoutingCycleSummary:
    routing_specification_id: str
    activation_state_id: str | None
    proposed_route_counts: dict
    applied_route_counts: dict
    reason_code_counts: dict
    fallback_reason_counts: dict
    eligible_decision_count: int
    observation_cycle_id: str = ""                      # NON-identity (operational)

    def _content(self) -> dict:
        return _summary_content(
            self.routing_specification_id, self.activation_state_id, self.proposed_route_counts,
            self.applied_route_counts, self.reason_code_counts, self.fallback_reason_counts,
            self.eligible_decision_count)

    @property
    def summary_content_hash(self) -> str:
        return hashlib.sha256(canonical_json_bytes(self._content())).hexdigest()


@dataclass(frozen=True)
class RoutingAudit:
    previous_routing_audit_id: str | None              # chain link (null for baseline)
    from_summary_hash: str | None                      # predecessor summary hash (null for baseline)
    to_summary_hash: str                               # this summary's content hash
    routing_specification_id: str
    activation_state_id: str | None
    proposed_route_counts: dict
    applied_route_counts: dict
    reason_code_counts: dict
    fallback_reason_counts: dict
    eligible_decision_count: int
    generated_at: str | None = None                    # NON-identity
    observation_cycle_id: str = ""                      # NON-identity

    def _identity_content(self) -> dict:
        return {
            "previous_routing_audit_id": self.previous_routing_audit_id,
            "from_summary_hash": self.from_summary_hash,
            "to_summary_hash": self.to_summary_hash,
            **_summary_content(self.routing_specification_id, self.activation_state_id,
                               self.proposed_route_counts, self.applied_route_counts,
                               self.reason_code_counts, self.fallback_reason_counts,
                               self.eligible_decision_count),
        }

    @property
    def routing_audit_id(self) -> str:
        return "rtaud_" + hashlib.sha256(canonical_json_bytes(self._identity_content())).hexdigest()


def build_cycle_summary(proposed_routes: list[ProposedRoute], *, activation_state_id: str | None,
                        spec: RoutingSpecification, cycle_id: str = "") -> RoutingCycleSummary:
    def _tally(values) -> dict:
        counts: dict = {}
        for value in values:
            counts[value] = counts.get(value, 0) + 1
        return counts

    return RoutingCycleSummary(
        routing_specification_id=spec.routing_specification_id,
        activation_state_id=activation_state_id,
        proposed_route_counts=_tally(p.proposed_route for p in proposed_routes),
        applied_route_counts=_tally(p.applied_route for p in proposed_routes),
        reason_code_counts=_tally(p.reason_code for p in proposed_routes),
        fallback_reason_counts=_tally(p.fallback_reason or "none" for p in proposed_routes),
        eligible_decision_count=len(proposed_routes),
        observation_cycle_id=cycle_id)


class RoutingAuditStore:
    """Append-only, tamper-evident, transition-only, chain-coherent audit journal."""

    def __init__(self, directory: Path, *, clock=None) -> None:
        self.directory = Path(directory)
        self.path = self.directory / _ROUTING_AUDIT_FILENAME
        self._clock = clock or _now
        self._lock = threading.RLock()
        self._audits: list[RoutingAudit] = []
        self._load()

    def _reconstruct(self, data: dict) -> RoutingAudit:
        return RoutingAudit(
            previous_routing_audit_id=data["previous_routing_audit_id"],
            from_summary_hash=data["from_summary_hash"], to_summary_hash=data["to_summary_hash"],
            routing_specification_id=data["routing_specification_id"],
            activation_state_id=data["activation_state_id"],
            proposed_route_counts=data["proposed_route_counts"],
            applied_route_counts=data["applied_route_counts"],
            reason_code_counts=data["reason_code_counts"],
            fallback_reason_counts=data["fallback_reason_counts"],
            eligible_decision_count=data["eligible_decision_count"],
            generated_at=data.get("generated_at"),
            observation_cycle_id=data.get("observation_cycle_id", ""))

    def _load(self) -> None:
        self._audits = []
        if not self.path.exists():
            return
        prev: RoutingAudit | None = None
        with open(self.path, encoding="utf-8") as handle:
            for line in handle:
                if not line.strip():
                    continue
                data = json.loads(line)
                stored_id = data.pop("routing_audit_id")
                audit = self._reconstruct(data)
                if audit.routing_audit_id != stored_id:
                    raise ValueError("tampered routing audit: id/content mismatch")
                expected_prev = prev.routing_audit_id if prev is not None else None
                expected_from = prev.to_summary_hash if prev is not None else None
                if (audit.previous_routing_audit_id != expected_prev
                        or audit.from_summary_hash != expected_from):
                    raise ValueError("noncontiguous routing audit chain")
                self._audits.append(audit)
                prev = audit

    def _write_line(self, text: str) -> None:
        with open(self.path, "a", encoding="utf-8") as handle:
            handle.write(text + "\n")

    def record_if_changed(self, summary: RoutingCycleSummary) -> RoutingAudit | None:
        """Transition-only + chain-coherent: append one artifact for the first summary
        and for each genuine change of the resulting summary (compared to the last
        durable summary hash). Identical repeats — including after restart — append
        nothing; a recurrence to an earlier summary is a NEW, distinct artifact because
        its predecessor link differs. Fail-closed on persistence error."""
        with self._lock:
            last = self._audits[-1] if self._audits else None
            to_hash = summary.summary_content_hash
            if last is not None and last.to_summary_hash == to_hash:
                return None                                # unchanged → no new artifact
            audit = RoutingAudit(
                previous_routing_audit_id=(last.routing_audit_id if last else None),
                from_summary_hash=(last.to_summary_hash if last else None),
                to_summary_hash=to_hash,
                routing_specification_id=summary.routing_specification_id,
                activation_state_id=summary.activation_state_id,
                proposed_route_counts=summary.proposed_route_counts,
                applied_route_counts=summary.applied_route_counts,
                reason_code_counts=summary.reason_code_counts,
                fallback_reason_counts=summary.fallback_reason_counts,
                eligible_decision_count=summary.eligible_decision_count,
                generated_at=utc_timestamp(self._clock()),
                observation_cycle_id=summary.observation_cycle_id)
            row = audit._identity_content()
            row["generated_at"] = audit.generated_at
            row["observation_cycle_id"] = audit.observation_cycle_id
            row["routing_audit_id"] = audit.routing_audit_id
            self.directory.mkdir(parents=True, exist_ok=True)   # create dir only on write
            try:
                self._write_line(canonical_json_text(row))
            except OSError as exc:
                raise RoutingAuditError("routing audit persistence failed") from exc
            self._audits.append(audit)
            return audit

    @property
    def audits(self) -> tuple[RoutingAudit, ...]:
        return tuple(self._audits)


# ══════════════════════════════════════════════════════════════════════════════
# Read-only accessor — latest SUCCESSFUL advisory ProposedRoute, defensive copy.
# ══════════════════════════════════════════════════════════════════════════════
_LATEST_LOCK = threading.RLock()
_latest_proposed: ProposedRoute | None = None

_CYCLE_LOCK = threading.RLock()
_last_cycle_id: str | None = None


def _set_latest(proposed: ProposedRoute) -> None:
    global _latest_proposed
    with _LATEST_LOCK:
        _latest_proposed = proposed


def latest_proposed_route() -> ProposedRoute | None:
    """A fresh deep-copied snapshot of the latest successfully resolved-and-audited
    advisory ProposedRoute, or None. Read by observability only — never by Feed, API,
    cache, MarketEvent, Morning Brief, Intelligence Network, or the frontend. A failed
    resolution/audit does not replace the prior snapshot."""
    with _LATEST_LOCK:
        proposed = _latest_proposed
    return copy.deepcopy(proposed) if proposed is not None else None


def reset_routing_state() -> None:
    """Test-only reset of process-local accessor and cycle guard."""
    global _latest_proposed, _last_cycle_id
    with _LATEST_LOCK:
        _latest_proposed = None
    with _CYCLE_LOCK:
        _last_cycle_id = None


# ── Context assembly (uses A1 canary helpers; no reimplementation) ─────────────
def _versions_ok(spec: RoutingSpecification, engine: str, policy: str) -> bool:
    ev = not spec.required_engine_versions or engine in spec.required_engine_versions
    pv = not spec.required_policy_versions or policy in spec.required_policy_versions
    return ev and pv


def build_context(state, config, activation_spec, spec: RoutingSpecification, *,
                  durable_event_uid: str | None, legacy_available: bool,
                  materiality_available: bool, gate_status: dict, cycle_id: str) -> RoutingContext:
    if state is None:
        return RoutingContext(
            activation_state_id="", activation_configuration_id="", resolved_effective_mode="",
            engine_version="", policy_version="", readiness_result_id=None, readiness_status=None,
            durable_event_uid=None, canary_membership=None, canary_assignment_salt=None,
            eligibility_facts={"version_match": False, "readiness_match": False, "spec_match": False},
            kill_switch_engaged=False, legacy_path_available=legacy_available,
            materiality_path_available=materiality_available, runtime_gate_status=gate_status,
            observation_cycle_id=cycle_id)

    engine = config.engine_version if config is not None else ""
    policy = config.policy_version if config is not None else ""
    spec_match = state.activation_specification_id == spec.required_activation_specification_id
    version_match = _versions_ok(spec, engine, policy)
    readiness_match = state.readiness_status == spec.required_readiness_scope.get("required_status")

    canary_membership = None
    salt = None
    if state.resolved_effective_mode == MODE_CANARY and durable_event_uid is not None \
            and config is not None:
        salt = canary_assignment_salt(activation_spec.activation_specification_id, engine, policy)
        canary_membership = in_canary(config, activation_spec, durable_event_uid)

    return RoutingContext(
        activation_state_id=state.activation_state_id,
        activation_configuration_id=state.activation_configuration_id,
        resolved_effective_mode=state.resolved_effective_mode,
        engine_version=engine, policy_version=policy,
        readiness_result_id=state.readiness_result_id, readiness_status=state.readiness_status,
        durable_event_uid=durable_event_uid, canary_membership=canary_membership,
        canary_assignment_salt=salt,
        eligibility_facts={"version_match": version_match, "readiness_match": readiness_match,
                           "spec_match": spec_match},
        kill_switch_engaged=state.kill_switch_engaged, legacy_path_available=legacy_available,
        materiality_path_available=materiality_available, runtime_gate_status=gate_status,
        observation_cycle_id=cycle_id)


def finalize_applied(proposed: ProposedRoute, *, materiality_available: bool) -> ProposedRoute:
    """Operational execution cap (never touches identity). applied_route is ALWAYS
    legacy in A3; the fallback_reason records WHY legacy was applied for a proposed
    materiality route: the runtime materiality path is unavailable
    (materiality_path_unavailable), or — if it existed — the A3 phase cap
    (a3_enforcement_cap). A legacy proposal is already applied=legacy with no fallback.
    This never invokes a materiality-authoritative implementation and never changes
    routing_context_id or proposed_route_id."""
    if proposed.proposed_route == ROUTE_LEGACY:
        return proposed
    fallback = FALLBACK_ENFORCEMENT_CAP if materiality_available else FALLBACK_MATERIALITY_UNAVAILABLE
    return replace(proposed, applied_route=ROUTE_LEGACY, fallback_reason=fallback)


def _read_current_config(config_path: Path):
    try:
        return ActivationConfigurationStore(config_path).current()
    except Exception:
        return None                                      # fail-closed; caller degrades to legacy


# ══════════════════════════════════════════════════════════════════════════════
# The once-per-cycle routing seam.
# ══════════════════════════════════════════════════════════════════════════════
def run_routing_cycle(enabled: bool, *, observation_cycle_id: str,
                      config_path: Path = DEFAULT_CONFIG_PATH,
                      audit_dir: Path = DEFAULT_ROUTING_AUDIT_DIR,
                      spec: RoutingSpecification = ROUTING_SPECIFICATION_V1,
                      legacy_available: bool = True, materiality_available: bool = False,
                      a2_enabled: bool = False, clock=None,
                      state_provider=None) -> ProposedRoute | None:
    """Resolve + observe + audit one advisory routing decision. When ``enabled`` is
    False this is a COMPLETE no-op. Re-entry under the same observation_cycle_id is a
    no-op. Returns the ProposedRoute on success, else None. Never raises; the applied
    route is always legacy and the pipeline is never affected."""
    if not enabled:
        return None

    global _last_cycle_id
    with _CYCLE_LOCK:
        if _last_cycle_id == observation_cycle_id:
            return latest_proposed_route()               # single execution per cycle
        _last_cycle_id = observation_cycle_id            # claim this cycle now

    try:
        state = (state_provider or latest_activation_state)()
        config = _read_current_config(config_path) if state is not None else None
        gate_status = {"a2_enabled": bool(a2_enabled), "a3_enabled": True}
        context = build_context(state, config, ACTIVATION_SPECIFICATION_V1, spec,
                                durable_event_uid=None, legacy_available=legacy_available,
                                materiality_available=materiality_available,
                                gate_status=gate_status, cycle_id=observation_cycle_id)
        proposed = resolve_route(spec, context)
        # Operational cap (never identity): applied is always legacy; the fallback
        # records materiality_path_unavailable when the runtime path is absent.
        proposed = finalize_applied(proposed, materiality_available=context.materiality_path_available)
        OBSERVATIONS.record(proposed, context.activation_state_id, observed_at=(clock or _now)())
        summary = build_cycle_summary([proposed], activation_state_id=context.activation_state_id,
                                      spec=spec, cycle_id=observation_cycle_id)
        RoutingAuditStore(audit_dir, clock=clock).record_if_changed(summary)
    except RoutingAuditError:
        _diag("audit_persist_failed", "fail_closed")
        return None                                      # snapshot unchanged; legacy preserved
    except Exception:
        _diag("routing_failed", "isolated")
        return None

    _set_latest(proposed)
    return proposed
