"""
app/materiality_activation.py — Wave 0.4 A1: activation architecture (ADVISORY).

Backend-only, advisory architecture by which the materiality engine could become
authoritative ONLY through deterministic configuration — never a code change. A1
RESOLVES and AUDITS an ActivationState but wires nothing into inference/ranking/
admission/Feed, so it changes no production behavior and activates nothing.

Authority model:
  • ActivationConfiguration is immutable OPERATOR INTENT (no kill switch inside it).
  • kill_signal is a separate OPERATIONAL resolver input, highest precedence;
    engaged / missing / malformed → resolved_effective_mode = disabled.
  • ActivationState records the resolved effect; ActivationAudit records the event.

Mode lattice: disabled < shadow < canary < active;
  resolved_effective_mode = min(requested_mode, evidence_ceiling), kill dominates.
Current engine → C4 readiness_status = insufficient_evidence → ceiling = shadow →
active/canary unreachable. Read-only over C1–C4; imported by no inference module.
"""

from __future__ import annotations

import hashlib
import json
import threading
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Callable

from app.materiality_evaluation import (
    canonical_json_bytes,
    canonical_json_text,
    utc_timestamp,
)

# ── Versions / modes ──────────────────────────────────────────────────────────
A1_CONTRACT_VERSION = "wave-0.4-a1"

MODE_DISABLED = "disabled"
MODE_SHADOW = "shadow"
MODE_CANARY = "canary"
MODE_ACTIVE = "active"
_MODE_ORDER = {MODE_DISABLED: 0, MODE_SHADOW: 1, MODE_CANARY: 2, MODE_ACTIVE: 3}
ACTIVATION_MODES = frozenset(_MODE_ORDER)

CANARY_SALT_PREFIX = "actcanary-v1"
CANARY_BUCKET_SPACE = 10000
CANARY_SUBJECT_KIND = "durable_event_uid"


def _min_mode(a: str, b: str) -> str:
    return a if _MODE_ORDER[a] <= _MODE_ORDER[b] else b


def _cid(prefix: str, value: object) -> str:
    return prefix + hashlib.sha256(canonical_json_bytes(value)).hexdigest()


# ══════════════════════════════════════════════════════════════════════════════
# Immutable artifacts — content-derived identity (version/metadata/timestamps excl).
# ══════════════════════════════════════════════════════════════════════════════
@dataclass(frozen=True)
class RollbackConfiguration:
    configuration_version: str                     # NON-identity
    safe_target_mode: str = MODE_DISABLED
    one_step: bool = True
    requires_migration: bool = False
    kill_switch_binding: bool = True
    cache_compatible: bool = True
    event_compatible: bool = True
    rollback_triggers: tuple = ()

    def _identity_content(self) -> dict:
        return {"safe_target_mode": self.safe_target_mode, "one_step": self.one_step,
                "requires_migration": self.requires_migration,
                "kill_switch_binding": self.kill_switch_binding,
                "cache_compatible": self.cache_compatible, "event_compatible": self.event_compatible,
                "rollback_triggers": list(self.rollback_triggers)}

    @property
    def rollback_configuration_id(self) -> str:
        return _cid("rbcfg_", self._identity_content())


ROLLBACK_CONFIGURATION_V1 = RollbackConfiguration(
    configuration_version="rbcfg-a1-v1",
    rollback_triggers=("kill_switch", "readiness_regression", "operator_directive"))


@dataclass(frozen=True)
class ActivationSpecification:
    specification_version: str                     # NON-identity
    allowed_modes: tuple = (MODE_DISABLED, MODE_SHADOW, MODE_CANARY, MODE_ACTIVE)
    required_readiness_status: str = "ready"
    required_engine_versions: tuple = ()           # empty = any
    required_policy_versions: tuple = ()
    canary_bounds: dict = field(default_factory=lambda: {"min_bps": 0, "max_bps": CANARY_BUCKET_SPACE})
    kill_switch_precedence: bool = True
    startup_validation_rules: tuple = (
        "schema", "spec_match", "rollback_present", "readiness_integrity",
        "mode_allowed", "canary_scope", "version_compatibility")

    def _identity_content(self) -> dict:
        return {"allowed_modes": sorted(self.allowed_modes),
                "required_readiness_status": self.required_readiness_status,
                "required_engine_versions": sorted(self.required_engine_versions),
                "required_policy_versions": sorted(self.required_policy_versions),
                "canary_bounds": self.canary_bounds,
                "kill_switch_precedence": self.kill_switch_precedence,
                "startup_validation_rules": sorted(self.startup_validation_rules)}

    @property
    def activation_specification_id(self) -> str:
        return _cid("actspec_", self._identity_content())


ACTIVATION_SPECIFICATION_V1 = ActivationSpecification(specification_version="actspec-a1-v1")


@dataclass(frozen=True)
class ActivationConfiguration:
    configuration_version: str                     # NON-identity (lineage)
    requested_mode: str
    evaluation_flag: bool
    activation_flag: bool
    canary_scope: dict
    engine_version: str
    policy_version: str
    activation_specification_id: str
    required_readiness_result_id: str
    required_readiness_hash: str
    rollback_configuration_id: str
    feature_flags: dict = field(default_factory=dict)
    metadata: str = ""                              # NON-identity
    # NOTE: there is intentionally NO kill_switch_engaged field — the kill switch is
    # an operational resolver input, never configuration.

    def __post_init__(self) -> None:
        if self.requested_mode not in ACTIVATION_MODES:
            raise ValueError(f"unknown requested_mode: {self.requested_mode!r}")

    def _identity_content(self) -> dict:
        return {"requested_mode": self.requested_mode, "evaluation_flag": self.evaluation_flag,
                "activation_flag": self.activation_flag,
                "canary_scope": {k: self.canary_scope[k] for k in sorted(self.canary_scope)},
                "engine_version": self.engine_version, "policy_version": self.policy_version,
                "activation_specification_id": self.activation_specification_id,
                "required_readiness_result_id": self.required_readiness_result_id,
                "required_readiness_hash": self.required_readiness_hash,
                "rollback_configuration_id": self.rollback_configuration_id,
                "feature_flags": {k: self.feature_flags[k] for k in sorted(self.feature_flags)}}

    @property
    def activation_configuration_id(self) -> str:
        return _cid("actcfg_", self._identity_content())


@dataclass(frozen=True)
class ActivationState:
    activation_configuration_id: str
    activation_specification_id: str
    requested_mode: str
    evidence_ceiling: str
    resolved_effective_mode: str
    kill_switch_engaged: bool                       # RESOLVED fact (in identity)
    readiness_result_id: str | None
    readiness_status: str | None
    validation_result: dict
    reason: str
    advisory: bool = True
    resolved_at: str | None = None                  # NON-identity operational timestamp

    def _identity_content(self) -> dict:
        payload = asdict(self)
        payload.pop("resolved_at")
        return payload

    @property
    def canonical_content_hash(self) -> str:
        return hashlib.sha256(canonical_json_bytes(self._identity_content())).hexdigest()

    @property
    def activation_state_id(self) -> str:
        return "actstate_" + self.canonical_content_hash

    def to_canonical_json(self) -> str:
        payload = self._identity_content()
        payload["resolved_at"] = self.resolved_at
        payload["activation_state_id"] = self.activation_state_id
        return canonical_json_text(payload)


@dataclass(frozen=True)
class ActivationAudit:
    from_effective_mode: str
    to_effective_mode: str
    activation_configuration_id: str
    activation_specification_id: str
    resolved_state_id: str
    actor: str
    reason: str
    transition_allowed: bool
    timestamp: str | None = None                    # NON-identity

    def _identity_content(self) -> dict:
        payload = asdict(self)
        payload.pop("timestamp")
        return payload

    @property
    def activation_audit_id(self) -> str:
        return _cid("actaudit_", self._identity_content())


# ══════════════════════════════════════════════════════════════════════════════
# Canary assignment — deterministic, replay-invariant, worker-independent.
# ══════════════════════════════════════════════════════════════════════════════
def canary_assignment_salt(activation_specification_id: str, engine_version: str,
                           policy_version: str) -> str:
    # Percentage-INDEPENDENT: excludes canary_bps so upward ramps never reshuffle.
    material = f"{CANARY_SALT_PREFIX}|{activation_specification_id}|{engine_version}|{policy_version}"
    return hashlib.sha256(material.encode("utf-8")).hexdigest()


def canary_bucket(salt: str, durable_event_uid: str) -> int:
    h = hashlib.sha256(f"{salt}|{durable_event_uid}".encode("utf-8")).hexdigest()
    return int(h[:16], 16) % CANARY_BUCKET_SPACE


def in_canary(config: ActivationConfiguration, spec: ActivationSpecification,
              durable_event_uid: str | None) -> bool:
    """Configured-bucket-share membership (NOT a guarantee of realized subject
    share, which is observational and may vary in finite populations)."""
    if not durable_event_uid:
        return False                                # identifier-less → always out-of-canary
    bps = config.canary_scope.get("canary_bps")
    if not isinstance(bps, int) or type(bps) is bool:
        return False
    salt = canary_assignment_salt(spec.activation_specification_id, config.engine_version,
                                  config.policy_version)
    return canary_bucket(salt, durable_event_uid) < bps


# ══════════════════════════════════════════════════════════════════════════════
# Deterministic resolver.
# ══════════════════════════════════════════════════════════════════════════════
def _kill_engaged(kill_signal) -> bool:
    # Engaged when true; missing (None) or malformed (non-bool) → engaged (fail-closed).
    if kill_signal is True:
        return True
    if kill_signal is False:
        return False
    return True


def _validate(config: ActivationConfiguration, spec: ActivationSpecification, readiness) -> tuple[bool, str]:
    if config.requested_mode not in spec.allowed_modes:
        return False, "mode_not_allowed"
    if config.activation_specification_id != spec.activation_specification_id:
        return False, "spec_mismatch"
    if not config.rollback_configuration_id:
        return False, "rollback_missing"
    if spec.required_engine_versions and config.engine_version not in spec.required_engine_versions:
        return False, "engine_incompatible"
    if spec.required_policy_versions and config.policy_version not in spec.required_policy_versions:
        return False, "policy_incompatible"
    # canary scope shape/bounds
    if config.requested_mode == MODE_CANARY or config.canary_scope.get("canary_bps") is not None:
        bps = config.canary_scope.get("canary_bps")
        if (type(bps) is not int or bps < spec.canary_bounds["min_bps"]
                or bps > spec.canary_bounds["max_bps"]
                or config.canary_scope.get("subject_kind") != CANARY_SUBJECT_KIND):
            return False, "invalid_canary_scope"
    # readiness integrity (required for authority-seeking modes)
    if config.requested_mode in (MODE_CANARY, MODE_ACTIVE):
        if not config.required_readiness_result_id:
            return False, "readiness_missing"
        if (readiness is None
                or getattr(readiness, "readiness_result_id", None) != config.required_readiness_result_id
                or getattr(readiness, "canonical_content_hash", None) != config.required_readiness_hash):
            return False, "readiness_integrity"
    elif config.required_readiness_result_id:
        # if a readiness is referenced at all, it must verify
        if readiness is not None and (
                readiness.readiness_result_id != config.required_readiness_result_id
                or readiness.canonical_content_hash != config.required_readiness_hash):
            return False, "readiness_integrity"
    return True, ""


def _evidence_ceiling(config: ActivationConfiguration, spec: ActivationSpecification, readiness) -> str:
    if not config.activation_flag:
        return MODE_SHADOW
    if readiness is None or getattr(readiness, "readiness_status", None) != spec.required_readiness_status:
        return MODE_SHADOW
    return MODE_ACTIVE      # min(requested, active) yields canary for a canary request


def resolve(config: ActivationConfiguration, spec: ActivationSpecification, readiness,
            kill_signal, *, resolved_at: str | None = None) -> ActivationState:
    """Pure, deterministic resolution (only resolved_at is operational, excluded from
    identity). Order: kill → validation → evidence ceiling → min(requested, ceiling)."""
    def _state(ceiling, effective, kill, valid, reason):
        return ActivationState(
            activation_configuration_id=config.activation_configuration_id,
            activation_specification_id=spec.activation_specification_id,
            requested_mode=config.requested_mode, evidence_ceiling=ceiling,
            resolved_effective_mode=effective, kill_switch_engaged=kill,
            readiness_result_id=getattr(readiness, "readiness_result_id", None),
            readiness_status=getattr(readiness, "readiness_status", None),
            validation_result=valid, reason=reason, advisory=True, resolved_at=resolved_at)

    if _kill_engaged(kill_signal):
        return _state(MODE_DISABLED, MODE_DISABLED, True,
                      {"ok": False, "reason": "kill_switch"}, "kill_switch")

    ok, vreason = _validate(config, spec, readiness)
    if not ok:
        return _state(MODE_DISABLED, MODE_DISABLED, False,
                      {"ok": False, "reason": vreason}, "validation_failed:" + vreason)

    ceiling = _evidence_ceiling(config, spec, readiness)
    effective = _min_mode(config.requested_mode, ceiling)
    return _state(ceiling, effective, False, {"ok": True, "reason": ""}, "resolved")


# ══════════════════════════════════════════════════════════════════════════════
# ActivationAuditStore — append-only, tamper-evident, coherence-validated.
# `resolve_and_audit` is the AUTHORITATIVE operational entry point: it resolves
# exactly once and appends exactly one audit built from that exact state. Raw
# appends validate full coherence with the state and are idempotent by audit id.
# ══════════════════════════════════════════════════════════════════════════════
class ActivationAuditError(RuntimeError):
    """Raised when audit persistence fails — the resolution is NOT recorded and the
    caller must treat it as un-audited (fail-closed; A1 is advisory, so inference is
    never involved)."""


class ActivationAuditStore:
    def __init__(self, directory: Path, *, clock: Callable[[], datetime] | None = None) -> None:
        self.directory = Path(directory)
        self.directory.mkdir(parents=True, exist_ok=True)
        self.path = self.directory / "activation-audit.jsonl"
        self._clock = clock or (lambda: datetime.now(timezone.utc))
        self._lock = threading.RLock()
        self._audits: list[ActivationAudit] = []
        self._by_id: dict[str, ActivationAudit] = {}
        self._load()

    def _load(self) -> None:
        if not self.path.exists():
            return
        with open(self.path, encoding="utf-8") as handle:
            for line in handle:
                if not line.strip():
                    continue
                data = json.loads(line)
                stored_id = data.pop("activation_audit_id")
                audit = ActivationAudit(
                    from_effective_mode=data["from_effective_mode"],
                    to_effective_mode=data["to_effective_mode"],
                    activation_configuration_id=data["activation_configuration_id"],
                    activation_specification_id=data["activation_specification_id"],
                    resolved_state_id=data["resolved_state_id"], actor=data["actor"],
                    reason=data["reason"], transition_allowed=data["transition_allowed"],
                    timestamp=data.get("timestamp"))
                if audit.activation_audit_id != stored_id:
                    raise ValueError("tampered activation audit: id/content mismatch")
                self._audits.append(audit)
                self._by_id[stored_id] = audit

    def _write_line(self, text: str) -> None:
        with open(self.path, "a", encoding="utf-8") as handle:
            handle.write(text + "\n")

    def _build_audit(self, from_effective_mode: str, state: ActivationState,
                     actor: str) -> ActivationAudit:
        return ActivationAudit(
            from_effective_mode=from_effective_mode,
            to_effective_mode=state.resolved_effective_mode,
            activation_configuration_id=state.activation_configuration_id,
            activation_specification_id=state.activation_specification_id,
            resolved_state_id=state.activation_state_id, actor=actor, reason=state.reason,
            transition_allowed=(state.resolved_effective_mode != from_effective_mode),
            timestamp=utc_timestamp(self._clock()))

    def append_audit(self, audit: ActivationAudit, state: ActivationState) -> ActivationAudit:
        """Raw append. Validates FULL coherence with the referenced state
        (config/spec/state ids) — an incoherent audit is rejected. Idempotent by
        activation_audit_id: re-appending the same resolution returns the existing
        audit (no duplicate). Fail-closed on persistence error."""
        if (audit.resolved_state_id != state.activation_state_id
                or audit.activation_configuration_id != state.activation_configuration_id
                or audit.activation_specification_id != state.activation_specification_id):
            raise ValueError("incoherent audit: does not match the referenced ActivationState")
        with self._lock:
            existing = self._by_id.get(audit.activation_audit_id)
            if existing is not None:
                return existing                       # idempotent by audit id
            row = asdict(audit)
            row["activation_audit_id"] = audit.activation_audit_id
            try:
                self._write_line(canonical_json_text(row))   # persist FIRST (fail-closed)
            except OSError as exc:
                raise ActivationAuditError("activation audit persistence failed") from exc
            self._audits.append(audit)
            self._by_id[audit.activation_audit_id] = audit
            return audit

    def record(self, *, from_effective_mode: str, state: ActivationState, actor: str) -> ActivationAudit:
        """Build + coherence-validate + append exactly one audit for a state."""
        return self.append_audit(self._build_audit(from_effective_mode, state, actor), state)

    def resolve_and_audit(self, config: ActivationConfiguration, spec: ActivationSpecification,
                          readiness, kill_signal, *, from_effective_mode: str, actor: str,
                          resolved_at: str | None = None) -> tuple[ActivationState, ActivationAudit]:
        """AUTHORITATIVE operational entry point: resolve EXACTLY once and append
        EXACTLY one audit built from that exact ActivationState. Using this path can
        never produce a zero-audit or duplicate-audit result. Returns (state, audit).
        Fail-closed: if persistence fails it raises ActivationAuditError and the
        resolution is treated as un-audited (advisory; no inference involved)."""
        state = resolve(config, spec, readiness, kill_signal, resolved_at=resolved_at)
        audit = self.append_audit(self._build_audit(from_effective_mode, state, actor), state)
        return state, audit

    @property
    def audits(self) -> tuple[ActivationAudit, ...]:
        return tuple(self._audits)
