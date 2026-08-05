"""
app/materiality_authority.py — Wave 0.4 A4: controlled-authority CORE (ADVISORY).

The final governance-evaluation layer. A4 answers ONE deterministic question —
"has every prerequisite been satisfied for the engine to be PERMITTED authoritative?"
— and applies authority NOWHERE. Like A1–A3 it is advisory: no production consumer
reads its outputs and no production control flow branches on them (invariant A-2).

Pipeline: AuthorityEligibility -> AuthorityDecision -> AuthorityAudit.

A4 consumes only immutable upstream artifacts, read-only:
  • A1 ActivationState (resolved_effective_mode, kill, spec id)
  • A3 ProposedRoute (proposed_route, routing spec id)   [bound by proposed_route_id]
  • C4 ReadinessResult, TRANSITIVELY covering C1–C3 (status, blocking_prerequisites)
  • A2 ActivationConfiguration version facts (engine/policy/configuration)
A4 never authors, mutates, supersedes, or repairs upstream artifacts/ids (A-3).

For the current engine (no durable ready C4 result, activation ceiling <= shadow,
routing applied = legacy, gate default off) every decision resolves DENIED.

Identity: RFC 8785 / JCS canonical JSON + SHA-256, content-derived; timestamps and
version/metadata labels excluded. This module is pure and side-effect-free.
"""

from __future__ import annotations

import hashlib
from dataclasses import dataclass
from typing import Any, Protocol

from app.materiality_activation import (
    ACTIVATION_MODES,
    ACTIVATION_SPECIFICATION_V1,
    MODE_ACTIVE,
    MODE_CANARY,
    MODE_DISABLED,
    MODE_SHADOW,
    _min_mode,
)
from app.materiality_evaluation import canonical_json_bytes
from app.materiality_readiness import READY, readiness_specification_v1
from app.materiality_routing import (
    ROUTE_ACTIVE,
    ROUTE_CANARY,
    ROUTE_LEGACY,
    ROUTE_SHADOW,
    ROUTING_ROUTES,
    ROUTING_SPECIFICATION_V1,
)
from app.materiality_thresholds import COMPARISON_SPECIFICATION_V1, SUPPORT_CRITERION_V1

A4_CONTRACT_VERSION = "wave-0.4-a4"
AUTHORITY_EVALUATION_VERSION = "autheval-a4-v1"

# ── Decision / reason vocabulary ──────────────────────────────────────────────
DECISION_GRANTED = "granted"
DECISION_DENIED = "denied"
DECISION_REVOKED = "revoked"

ELIGIBLE = "eligible"
INELIGIBLE = "ineligible"

REASON_PROMOTED = "promoted"
REASON_REVOKED = "revoked"

# ── Blocking condition codes (stable tokens) ──────────────────────────────────
BLOCK_ACTIVATION_MISSING = "activation_state_missing"
BLOCK_ACTIVATION_NOT_ACTIVE = "activation_not_active"
BLOCK_ACTIVATION_SPEC = "activation_specification_mismatch"
BLOCK_KILL = "kill_switch_engaged"
BLOCK_READINESS_MISSING = "readiness_missing"
BLOCK_READINESS_INTEGRITY = "readiness_integrity_invalid"
BLOCK_READINESS_NOT_READY = "readiness_not_ready"
BLOCK_READINESS_PREREQS = "readiness_blocking_prerequisites"
BLOCK_READINESS_SPEC_INTEGRITY = "readiness_specification_integrity_invalid"
BLOCK_READINESS_TEMPLATE = "readiness_template_incompatible"
BLOCK_ROUTING_MISSING = "routing_missing"
BLOCK_ROUTING_NOT_ACTIVE = "routing_not_active"
BLOCK_ROUTING_SPEC = "routing_specification_mismatch"
BLOCK_COMPARISON_SPEC = "comparison_specification_mismatch"
BLOCK_SUPPORT_CRITERION = "support_criterion_mismatch"
BLOCK_ENGINE = "engine_version_mismatch"
BLOCK_POLICY = "policy_version_mismatch"
BLOCK_CONFIG_VERSION = "configuration_version_mismatch"
BLOCK_GATE = "runtime_gate_disabled"

_READINESS_ID_PREFIX = "rdres_"     # C4 ReadinessResult identity prefix
_READINESS_SPEC_ID_PREFIX = "rdspec_"     # C4 ReadinessSpecification identity prefix
_READINESS_RUN_SPECIFIC_FIELD = "as_of_cutoff"     # the ONLY per-run identity field


def _sha(content: object) -> str:
    return hashlib.sha256(canonical_json_bytes(content)).hexdigest()


def readiness_template_hash(spec_identity_content: dict) -> str:
    """The C4 readiness CONTRACT-TEMPLATE identity: every stable ReadinessSpecification
    identity field EXCEPT the explicitly run-specific as_of_cutoff. Two readiness specs
    that differ only by cutoff share this hash; changing any stable field (gate set,
    freshness policy/durations, required engine/policy/C1–C3 families, sample
    sufficiency, statuses) changes it. Exact-hash equality only — never loose."""
    template = {k: v for k, v in spec_identity_content.items()
                if k != _READINESS_RUN_SPECIFIC_FIELD}
    return _sha(template)


# Cutoff-independent canonical template of the contract-authored C4 readiness spec.
# The placeholder cutoff is irrelevant — readiness_template_hash excludes as_of_cutoff.
_CANONICAL_READINESS_TEMPLATE_HASH = readiness_template_hash(
    readiness_specification_v1("2000-01-01T00:00:00.000000Z")._identity_content())


# ══════════════════════════════════════════════════════════════════════════════
# Immutable artifacts.
# ══════════════════════════════════════════════════════════════════════════════
@dataclass(frozen=True)
class AuthoritySpecification:
    schema_version: str                                # NON-identity
    activation_specification_id: str
    comparison_specification_id: str
    support_criterion_id: str
    routing_specification_id: str
    readiness_template_hash: str                       # stable C4 template (excludes cutoff)
    required_readiness_status: str
    required_engine_version: str
    required_policy_version: str
    required_configuration_version: str
    authority_rules: tuple
    grant_range: tuple
    audit_schema_version: str
    metadata: str = ""                                 # NON-identity

    def _identity_content(self) -> dict:
        return {
            "activation_specification_id": self.activation_specification_id,
            "comparison_specification_id": self.comparison_specification_id,
            "support_criterion_id": self.support_criterion_id,
            "routing_specification_id": self.routing_specification_id,
            "readiness_template_hash": self.readiness_template_hash,
            "required_readiness_status": self.required_readiness_status,
            "required_engine_version": self.required_engine_version,
            "required_policy_version": self.required_policy_version,
            "required_configuration_version": self.required_configuration_version,
            "authority_rules": list(self.authority_rules),
            "grant_range": list(self.grant_range),
            "audit_schema_version": self.audit_schema_version,
        }

    @property
    def authority_specification_id(self) -> str:
        return "authspec_" + _sha(self._identity_content())


# Ordered predicate ladder (for provenance; evaluation is exhaustive, not short-circuit).
_AUTHORITY_RULES = (
    BLOCK_ACTIVATION_MISSING, BLOCK_ACTIVATION_NOT_ACTIVE, BLOCK_ACTIVATION_SPEC, BLOCK_KILL,
    BLOCK_READINESS_MISSING, BLOCK_READINESS_INTEGRITY, BLOCK_READINESS_NOT_READY,
    BLOCK_READINESS_PREREQS, BLOCK_ROUTING_MISSING, BLOCK_ROUTING_NOT_ACTIVE, BLOCK_ROUTING_SPEC,
    BLOCK_COMPARISON_SPEC, BLOCK_SUPPORT_CRITERION, BLOCK_ENGINE, BLOCK_POLICY,
    BLOCK_CONFIG_VERSION, BLOCK_GATE,
)

AUTHORITY_SPECIFICATION_V1 = AuthoritySpecification(
    schema_version="authspec-a4-v1",
    activation_specification_id=ACTIVATION_SPECIFICATION_V1.activation_specification_id,
    comparison_specification_id=COMPARISON_SPECIFICATION_V1.comparison_specification_id,
    support_criterion_id=SUPPORT_CRITERION_V1.support_criterion_id,
    routing_specification_id=ROUTING_SPECIFICATION_V1.routing_specification_id,
    readiness_template_hash=_CANONICAL_READINESS_TEMPLATE_HASH,
    required_readiness_status=READY,
    required_engine_version="argus-current",
    required_policy_version="argus-current",
    required_configuration_version="a2-safe-default-v1",
    authority_rules=_AUTHORITY_RULES,
    grant_range=(MODE_DISABLED, MODE_ACTIVE),          # active-only grant (J-6)
    audit_schema_version="authaud-a4-v1",
)


@dataclass(frozen=True)
class AuthorityEligibility:
    authority_specification_id: str
    activation_state_id: str
    readiness_result_id: str
    readiness_specification_id: str                    # EXACT consumed run-specific spec id
    routing_proposed_route_id: str
    evaluation_version: str
    eligibility_status: str
    blocking_conditions: tuple                         # SORTED, exhaustive
    generated_at: str | None = None                    # NON-identity

    def _identity_content(self) -> dict:
        return {
            "authority_specification_id": self.authority_specification_id,
            "activation_state_id": self.activation_state_id,
            "readiness_result_id": self.readiness_result_id,
            "readiness_specification_id": self.readiness_specification_id,
            "routing_proposed_route_id": self.routing_proposed_route_id,
            "evaluation_version": self.evaluation_version,
            "eligibility_status": self.eligibility_status,
            "blocking_conditions": list(self.blocking_conditions),
        }

    @property
    def authority_eligibility_id(self) -> str:
        return "autheli_" + _sha(self._identity_content())


@dataclass(frozen=True)
class AuthorityDecision:
    authority_eligibility_id: str
    decision: str
    reason: str
    computed_authority_ceiling: str                    # what prerequisites PERMIT (min ceilings)
    granted_authority_level: str                       # what A4 GRANTS (A-1: <= ceiling)
    generated_at: str | None = None                    # NON-identity

    def _identity_content(self) -> dict:
        return {
            "authority_eligibility_id": self.authority_eligibility_id,
            "decision": self.decision,
            "reason": self.reason,
            "computed_authority_ceiling": self.computed_authority_ceiling,
            "granted_authority_level": self.granted_authority_level,
        }

    @property
    def authority_decision_id(self) -> str:
        return "authdec_" + _sha(self._identity_content())


# ── Future authority-application interface — DEFINED ONLY, never invoked in A4 ──
AuthorityApplication = Any


class AuthorityApplier(Protocol):
    """A later wave MAY implement application of a granted AuthorityDecision. A4
    provides the interface only and never invokes it; a test double exists only in
    tests. No A4 code path branches on a decision (invariant A-2)."""

    def apply(self, decision: AuthorityDecision) -> AuthorityApplication:  # pragma: no cover
        ...


# ══════════════════════════════════════════════════════════════════════════════
# Pure evaluation.
# ══════════════════════════════════════════════════════════════════════════════
def _state_valid(state) -> bool:
    return (state is not None and bool(getattr(state, "activation_state_id", ""))
            and getattr(state, "resolved_effective_mode", None) in ACTIVATION_MODES)


def _route_valid(route) -> bool:
    return (route is not None and bool(getattr(route, "proposed_route_id", ""))
            and getattr(route, "proposed_route", None) in ROUTING_ROUTES)


def _readiness_integrity(readiness) -> bool:
    rid = getattr(readiness, "readiness_result_id", None)
    chash = getattr(readiness, "canonical_content_hash", None)
    return (isinstance(rid, str) and isinstance(chash, str)
            and rid == _READINESS_ID_PREFIX + chash)


def _readiness_spec_integrity(readiness) -> bool:
    sid = getattr(readiness, "readiness_specification_id", None)
    content = getattr(readiness, "readiness_specification_content", None)
    return (isinstance(sid, str) and isinstance(content, dict)
            and sid == _READINESS_SPEC_ID_PREFIX + _sha(content))


def _readiness_template_compatible(readiness, spec: AuthoritySpecification) -> bool:
    """Exact template compatibility: the consumed readiness spec matches the authorized
    template in EVERY stable identity field, ignoring only the run-specific as_of_cutoff.
    Requires spec integrity first; never compares labels loosely."""
    content = getattr(readiness, "readiness_specification_content", None)
    return (_readiness_spec_integrity(readiness) and isinstance(content, dict)
            and readiness_template_hash(content) == spec.readiness_template_hash)


def _readiness_ready(readiness, spec: AuthoritySpecification) -> bool:
    return (readiness is not None and _readiness_integrity(readiness)
            and getattr(readiness, "readiness_status", None) == spec.required_readiness_status
            and tuple(getattr(readiness, "blocking_prerequisites", ()) or ()) == ()
            and _readiness_template_compatible(readiness, spec))


def compute_authority_ceiling(spec: AuthoritySpecification, *, activation_state, readiness,
                              proposed_route) -> str:
    activation_ceiling = (activation_state.resolved_effective_mode
                          if _state_valid(activation_state) else MODE_DISABLED)
    readiness_ceiling = MODE_ACTIVE if _readiness_ready(readiness, spec) else MODE_SHADOW
    route = proposed_route.proposed_route if _route_valid(proposed_route) else ROUTE_LEGACY
    routing_ceiling = {ROUTE_LEGACY: MODE_DISABLED, ROUTE_SHADOW: MODE_SHADOW,
                       ROUTE_CANARY: MODE_CANARY, ROUTE_ACTIVE: MODE_ACTIVE}.get(route, MODE_DISABLED)
    return _min_mode(_min_mode(activation_ceiling, readiness_ceiling), routing_ceiling)


def evaluate_eligibility(spec: AuthoritySpecification, *, activation_state, readiness,
                         proposed_route, config, gate_enabled: bool) -> AuthorityEligibility:
    """Pure, deterministic, EXHAUSTIVE. Evaluates every predicate (no short-circuit);
    blocking_conditions is the complete, sorted set of ALL unmet prerequisites for the
    cycle. eligible ⇔ blocking_conditions == ()."""
    blockers: list[str] = []

    if not _state_valid(activation_state):
        blockers.append(BLOCK_ACTIVATION_MISSING)
    else:
        if activation_state.resolved_effective_mode != MODE_ACTIVE:
            blockers.append(BLOCK_ACTIVATION_NOT_ACTIVE)
        if activation_state.activation_specification_id != spec.activation_specification_id:
            blockers.append(BLOCK_ACTIVATION_SPEC)
        if getattr(activation_state, "kill_switch_engaged", False):
            blockers.append(BLOCK_KILL)

    if readiness is None:
        blockers.append(BLOCK_READINESS_MISSING)
    else:
        if not _readiness_integrity(readiness):
            blockers.append(BLOCK_READINESS_INTEGRITY)
        if getattr(readiness, "readiness_status", None) != spec.required_readiness_status:
            blockers.append(BLOCK_READINESS_NOT_READY)
        if tuple(getattr(readiness, "blocking_prerequisites", ()) or ()) != ():
            blockers.append(BLOCK_READINESS_PREREQS)
        if not _readiness_spec_integrity(readiness):
            blockers.append(BLOCK_READINESS_SPEC_INTEGRITY)
        elif not _readiness_template_compatible(readiness, spec):
            blockers.append(BLOCK_READINESS_TEMPLATE)

    if not _route_valid(proposed_route):
        blockers.append(BLOCK_ROUTING_MISSING)
    else:
        if proposed_route.proposed_route != ROUTE_ACTIVE:
            blockers.append(BLOCK_ROUTING_NOT_ACTIVE)
        if proposed_route.routing_specification_id != spec.routing_specification_id:
            blockers.append(BLOCK_ROUTING_SPEC)

    if spec.comparison_specification_id != COMPARISON_SPECIFICATION_V1.comparison_specification_id:
        blockers.append(BLOCK_COMPARISON_SPEC)
    if spec.support_criterion_id != SUPPORT_CRITERION_V1.support_criterion_id:
        blockers.append(BLOCK_SUPPORT_CRITERION)

    if config is None:
        blockers.extend((BLOCK_ENGINE, BLOCK_POLICY, BLOCK_CONFIG_VERSION))
    else:
        if getattr(config, "engine_version", None) != spec.required_engine_version:
            blockers.append(BLOCK_ENGINE)
        if getattr(config, "policy_version", None) != spec.required_policy_version:
            blockers.append(BLOCK_POLICY)
        if getattr(config, "configuration_version", None) != spec.required_configuration_version:
            blockers.append(BLOCK_CONFIG_VERSION)

    if not gate_enabled:
        blockers.append(BLOCK_GATE)

    blocking = tuple(sorted(set(blockers)))
    return AuthorityEligibility(
        authority_specification_id=spec.authority_specification_id,
        activation_state_id=(activation_state.activation_state_id if _state_valid(activation_state) else ""),
        readiness_result_id=(getattr(readiness, "readiness_result_id", "") or ""),
        readiness_specification_id=(getattr(readiness, "readiness_specification_id", "") or ""),
        routing_proposed_route_id=(proposed_route.proposed_route_id if _route_valid(proposed_route) else ""),
        evaluation_version=AUTHORITY_EVALUATION_VERSION,
        eligibility_status=(ELIGIBLE if not blocking else INELIGIBLE),
        blocking_conditions=blocking)


# ── Authority episode status (reconstructable from the durable audit chain) ────
STATUS_NEVER_GRANTED = "never_granted"
STATUS_GRANTED = "granted"
STATUS_REVOKED = "revoked"


def authority_status_from_last_decision(last_decision: str | None) -> str:
    """The current episode status derived from the last DURABLE decision (from the audit
    chain, not process memory). denied/absent ⇒ never_granted; a post-grant loss stays
    revoked until a new grant opens a new episode."""
    if last_decision == DECISION_GRANTED:
        return STATUS_GRANTED
    if last_decision == DECISION_REVOKED:
        return STATUS_REVOKED
    return STATUS_NEVER_GRANTED


def decide(spec: AuthoritySpecification, eligibility: AuthorityEligibility,
           computed_ceiling: str, *, authority_status: str) -> AuthorityDecision:
    """Pure. Episode semantics (Correction 2): granted iff eligible AND ceiling == active
    (active-only, J-6). Otherwise, if the current episode has entered a grant (status
    granted or revoked) the stable decision is REVOKED — repeated unchanged ineligible
    cycles reproduce the same decision and add no audit; a never-granted chain resolves
    DENIED. granted_authority_level <= computed_ceiling (A-1); reason is a single summary
    code; the exhaustive blocker list lives on the eligibility artifact."""
    if eligibility.eligibility_status == ELIGIBLE and computed_ceiling == MODE_ACTIVE:
        return AuthorityDecision(eligibility.authority_eligibility_id, DECISION_GRANTED,
                                 REASON_PROMOTED, computed_ceiling, MODE_ACTIVE)
    if authority_status in (STATUS_GRANTED, STATUS_REVOKED):
        return AuthorityDecision(eligibility.authority_eligibility_id, DECISION_REVOKED,
                                 REASON_REVOKED, computed_ceiling, MODE_DISABLED)
    reason = "denied:" + eligibility.blocking_conditions[0] if eligibility.blocking_conditions \
        else "denied"
    return AuthorityDecision(eligibility.authority_eligibility_id, DECISION_DENIED,
                             reason, computed_ceiling, MODE_DISABLED)
