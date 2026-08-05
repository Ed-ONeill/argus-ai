"""
app/materiality_authority_runtime.py — Wave 0.4 A4: authority SEAM (ADVISORY).

Once per pipeline cycle, WHEN the A4 gate is enabled, this seam reads (read-only) A2's
latest ActivationState, A3's latest ProposedRoute, a durable C4 ReadinessResult, and the
current ActivationConfiguration version facts; evaluates AuthorityEligibility, decides an
AuthorityDecision, appends a transition-only chain-coherent AuthorityAudit, and updates a
read-only accessor. It APPLIES authority nowhere and branches production on nothing.

No upstream re-resolution, no C4 computation, no inference, no output mutation. Every
failure becomes bounded diagnostics and resolves/remains denied; nothing raises into the
pipeline. Gated dark by default; re-entry within a cycle is a no-op. A1–A3 and C1–C4 are
frozen and imported read-only.
"""

from __future__ import annotations

import copy
import hashlib
import json
import threading
from collections import OrderedDict
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

from app.materiality_activation_config import ActivationConfigurationStore
from app.materiality_activation_runtime import DEFAULT_CONFIG_PATH, latest_activation_state
from app.materiality_authority import (
    AUTHORITY_SPECIFICATION_V1,
    MODE_DISABLED,
    AuthorityDecision,
    AuthoritySpecification,
    authority_status_from_last_decision,
    compute_authority_ceiling,
    decide,
    evaluate_eligibility,
)
from app.materiality_evaluation import canonical_json_bytes, canonical_json_text, utc_timestamp
from app.materiality_routing_runtime import latest_proposed_route
from app.storage import AUTHORITY_DIR, EVALUATION_DIR

DEFAULT_AUTHORITY_AUDIT_DIR = AUTHORITY_DIR
_AUTHORITY_AUDIT_FILENAME = "authority-audit.jsonl"
# C4 readiness is READ-ONLY here and never written by A4. No durable readiness exists in
# the current engine, so this lookup yields None (→ denied).
DEFAULT_READINESS_PATH = EVALUATION_DIR / "readiness_snapshot.json"
_READINESS_ID_PREFIX = "rdres_"


def _now() -> datetime:
    return datetime.now(timezone.utc)


# ══════════════════════════════════════════════════════════════════════════════
# Bounded, coalescing operational diagnostics (stable tokens only).
# ══════════════════════════════════════════════════════════════════════════════
class AuthorityDiagnostics:
    MAX_ENTRIES = 128

    def __init__(self) -> None:
        self._entries: OrderedDict[tuple, tuple] = OrderedDict()
        self._lock = threading.RLock()

    def record(self, code: str, detail: str, *, observed_at: datetime | None = None) -> None:
        key = (str(code), str(detail))
        stamp = utc_timestamp(observed_at or _now())
        with self._lock:
            existing = self._entries.get(key)
            count = (existing[0] + 1) if existing else 1
            self._entries[key] = (count, stamp)
            if len(self._entries) > self.MAX_ENTRIES:
                self._entries.popitem(last=False)

    def snapshot(self) -> tuple[tuple, ...]:
        with self._lock:
            return tuple((k[0], k[1], v[0], v[1]) for k, v in self._entries.items())

    def clear(self) -> None:
        with self._lock:
            self._entries.clear()


DIAGNOSTICS = AuthorityDiagnostics()


# ══════════════════════════════════════════════════════════════════════════════
# Read-only durable C4 readiness provider (never computes C4).
# ══════════════════════════════════════════════════════════════════════════════
@dataclass(frozen=True)
class _ReadinessView:
    readiness_result_id: str
    canonical_content_hash: str
    readiness_status: str
    blocking_prerequisites: tuple
    readiness_specification_id: str
    readiness_specification_content: dict              # C4 spec identity content (incl. cutoff)


class DurableReadinessProvider:
    """Reads an already-persisted, immutable C4 ReadinessResult if one exists. Integrity
    gate: readiness_result_id == "rdres_" + canonical_content_hash. Absence / corruption /
    integrity failure → None (→ denied). Never triggers C4 computation."""

    def __init__(self, path: Path) -> None:
        self.path = Path(path)

    def get(self) -> _ReadinessView | None:
        try:
            raw = self.path.read_text(encoding="utf-8")
        except FileNotFoundError:
            DIAGNOSTICS.record("readiness_missing", "absent")
            return None
        except OSError:
            DIAGNOSTICS.record("readiness_missing", "unreadable")
            return None
        try:
            data = json.loads(raw)
        except (ValueError, TypeError):
            DIAGNOSTICS.record("readiness_invalid", "malformed")
            return None
        if not isinstance(data, dict):
            DIAGNOSTICS.record("readiness_invalid", "not_object")
            return None
        rid = data.get("readiness_result_id")
        chash = data.get("canonical_content_hash")
        status = data.get("readiness_status")
        if not (isinstance(rid, str) and isinstance(chash, str) and isinstance(status, str)):
            DIAGNOSTICS.record("readiness_invalid", "fields")
            return None
        if rid != _READINESS_ID_PREFIX + chash:
            DIAGNOSTICS.record("readiness_invalid", "hash")
            return None
        spec_content = data.get("readiness_specification_content")
        return _ReadinessView(
            readiness_result_id=rid, canonical_content_hash=chash, readiness_status=status,
            blocking_prerequisites=tuple(data.get("blocking_prerequisites", ()) or ()),
            readiness_specification_id=str(data.get("readiness_specification_id", "")),
            readiness_specification_content=(spec_content if isinstance(spec_content, dict) else {}))


# ══════════════════════════════════════════════════════════════════════════════
# Transition-only, chain-coherent AuthorityAudit (anchored to AuthorityDecision).
# ══════════════════════════════════════════════════════════════════════════════
class AuthorityAuditError(RuntimeError):
    """Authority-audit persistence failed — isolated into diagnostics; the applied
    legacy route is unaffected and the latest snapshot is left unchanged."""


@dataclass(frozen=True)
class AuthorityAudit:
    previous_authority_audit_id: str | None
    previous_authority_decision_id: str | None
    authority_decision_id: str
    from_granted_authority_level: str
    to_granted_authority_level: str
    decision: str
    reason: str
    generated_at: str | None = None                    # NON-identity
    observation_cycle_id: str = ""                      # NON-identity

    def _identity_content(self) -> dict:
        return {
            "previous_authority_audit_id": self.previous_authority_audit_id,
            "previous_authority_decision_id": self.previous_authority_decision_id,
            "authority_decision_id": self.authority_decision_id,
            "from_granted_authority_level": self.from_granted_authority_level,
            "to_granted_authority_level": self.to_granted_authority_level,
            "decision": self.decision,
            "reason": self.reason,
        }

    @property
    def authority_audit_id(self) -> str:
        return "authaud_" + hashlib.sha256(canonical_json_bytes(self._identity_content())).hexdigest()


class AuthorityAuditStore:
    """Append-only, tamper-evident, transition-only, chain-coherent authority journal.
    Each audit is anchored to its immutable AuthorityDecision; reload verifies content
    integrity AND both chain links (previous audit id + previous decision id)."""

    def __init__(self, directory: Path, *, clock=None) -> None:
        self.directory = Path(directory)
        self.path = self.directory / _AUTHORITY_AUDIT_FILENAME
        self._clock = clock or _now
        self._lock = threading.RLock()
        self._audits: list[AuthorityAudit] = []
        self._load()

    def _reconstruct(self, data: dict) -> AuthorityAudit:
        return AuthorityAudit(
            previous_authority_audit_id=data["previous_authority_audit_id"],
            previous_authority_decision_id=data["previous_authority_decision_id"],
            authority_decision_id=data["authority_decision_id"],
            from_granted_authority_level=data["from_granted_authority_level"],
            to_granted_authority_level=data["to_granted_authority_level"],
            decision=data["decision"], reason=data["reason"],
            generated_at=data.get("generated_at"),
            observation_cycle_id=data.get("observation_cycle_id", ""))

    def _load(self) -> None:
        self._audits = []
        if not self.path.exists():
            return
        prev: AuthorityAudit | None = None
        with open(self.path, encoding="utf-8") as handle:
            for line in handle:
                if not line.strip():
                    continue
                data = json.loads(line)
                stored_id = data.pop("authority_audit_id")
                audit = self._reconstruct(data)
                if audit.authority_audit_id != stored_id:
                    raise ValueError("tampered authority audit: id/content mismatch")
                expected_prev_audit = prev.authority_audit_id if prev is not None else None
                expected_prev_decision = prev.authority_decision_id if prev is not None else None
                if (audit.previous_authority_audit_id != expected_prev_audit
                        or audit.previous_authority_decision_id != expected_prev_decision):
                    raise ValueError("noncontiguous authority audit chain")
                self._audits.append(audit)
                prev = audit

    def _write_line(self, text: str) -> None:
        with open(self.path, "a", encoding="utf-8") as handle:
            handle.write(text + "\n")

    def record_if_changed(self, decision: AuthorityDecision) -> AuthorityAudit | None:
        """Append one artifact for the first decision and each genuine decision
        transition (new authority_decision_id vs the last durable one). Identical
        repeats — including after restart — append nothing. Fail-closed."""
        with self._lock:
            last = self._audits[-1] if self._audits else None
            if last is not None and last.authority_decision_id == decision.authority_decision_id:
                return None                                # unchanged → no new artifact
            audit = AuthorityAudit(
                previous_authority_audit_id=(last.authority_audit_id if last else None),
                previous_authority_decision_id=(last.authority_decision_id if last else None),
                authority_decision_id=decision.authority_decision_id,
                from_granted_authority_level=(last.to_granted_authority_level if last else MODE_DISABLED),
                to_granted_authority_level=decision.granted_authority_level,
                decision=decision.decision, reason=decision.reason,
                generated_at=utc_timestamp(self._clock()))
            row = audit._identity_content()
            row["generated_at"] = audit.generated_at
            row["observation_cycle_id"] = audit.observation_cycle_id
            row["authority_audit_id"] = audit.authority_audit_id
            self.directory.mkdir(parents=True, exist_ok=True)   # create dir only on write
            try:
                self._write_line(canonical_json_text(row))
            except OSError as exc:
                raise AuthorityAuditError("authority audit persistence failed") from exc
            self._audits.append(audit)
            return audit

    @property
    def audits(self) -> tuple[AuthorityAudit, ...]:
        return tuple(self._audits)


# ══════════════════════════════════════════════════════════════════════════════
# Read-only accessor — latest SUCCESSFUL AuthorityDecision, defensive copy.
# ══════════════════════════════════════════════════════════════════════════════
_LATEST_LOCK = threading.RLock()
_latest_decision: AuthorityDecision | None = None

_CYCLE_LOCK = threading.RLock()
_last_cycle_id: str | None = None


def _set_latest(decision: AuthorityDecision) -> None:
    global _latest_decision
    with _LATEST_LOCK:
        _latest_decision = decision


def latest_authority_decision() -> AuthorityDecision | None:
    """A fresh deep-copied snapshot of the latest successfully evaluated-and-audited
    AuthorityDecision, or None. Read by observability only — never by any production
    control flow (invariant A-2). A failed evaluation/audit does not replace it."""
    with _LATEST_LOCK:
        decision = _latest_decision
    return copy.deepcopy(decision) if decision is not None else None


def reset_authority_state() -> None:
    """Test-only reset of the process-local accessor and cycle guard."""
    global _latest_decision, _last_cycle_id
    with _LATEST_LOCK:
        _latest_decision = None
    with _CYCLE_LOCK:
        _last_cycle_id = None


def _read_current_config(config_path: Path):
    try:
        return ActivationConfigurationStore(config_path).current()
    except Exception:
        return None


# ══════════════════════════════════════════════════════════════════════════════
# The once-per-cycle authority seam.
# ══════════════════════════════════════════════════════════════════════════════
def run_authority_cycle(enabled: bool, *, observation_cycle_id: str,
                        config_path: Path = DEFAULT_CONFIG_PATH,
                        audit_dir: Path = DEFAULT_AUTHORITY_AUDIT_DIR,
                        spec: AuthoritySpecification = AUTHORITY_SPECIFICATION_V1,
                        readiness_provider: DurableReadinessProvider | None = None,
                        clock=None, state_provider=None, route_provider=None) -> AuthorityDecision | None:
    """Evaluate + audit one advisory authority decision. When ``enabled`` is False this
    is a COMPLETE no-op. Re-entry under the same observation_cycle_id is a no-op. Applies
    authority nowhere; returns the decision on success, else None. Never raises."""
    if not enabled:
        return None

    global _last_cycle_id
    with _CYCLE_LOCK:
        if _last_cycle_id == observation_cycle_id:
            return latest_authority_decision()             # single execution per cycle
        _last_cycle_id = observation_cycle_id              # claim this cycle now

    if readiness_provider is None:
        readiness_provider = DurableReadinessProvider(DEFAULT_READINESS_PATH)

    try:
        state = (state_provider or latest_activation_state)()
        proposed = (route_provider or latest_proposed_route)()
        readiness = readiness_provider.get()
        config = _read_current_config(config_path) if state is not None else None

        eligibility = evaluate_eligibility(spec, activation_state=state, readiness=readiness,
                                           proposed_route=proposed, config=config, gate_enabled=True)
        ceiling = compute_authority_ceiling(spec, activation_state=state, readiness=readiness,
                                            proposed_route=proposed)
        store = AuthorityAuditStore(audit_dir, clock=clock)
        prior = store.audits
        # Episode status from the durable chain (Correction 2), not process memory.
        status = authority_status_from_last_decision(prior[-1].decision if prior else None)
        decision = decide(spec, eligibility, ceiling, authority_status=status)
        store.record_if_changed(decision)
    except AuthorityAuditError:
        DIAGNOSTICS.record("audit_persist_failed", "fail_closed")
        return None                                        # snapshot unchanged; denied preserved
    except Exception:
        DIAGNOSTICS.record("authority_failed", "isolated")
        return None

    _set_latest(decision)
    return decision
