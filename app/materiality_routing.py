"""
app/materiality_routing.py — Wave 0.4 A3: safe-routing CORE (ADVISORY).

Deterministic routing artifacts and the pure route resolver by which a later wave
COULD direct an eligible production decision down the legacy path or a future
materiality-authoritative path. Throughout A3 the ONLY applied path is legacy:

    applied_route == "legacy"   for every production decision.

This module is pure and side-effect-free. It imports only frozen A1 constants/spec
and the C1 canonical-JSON identity utilities. It performs NO I/O, reads no runtime
state, and is wired into no production decision. A1/A2 are frozen and unmodified.

Identity rules (RFC 8785 / JCS canonical JSON + SHA-256, content-derived):
  • RoutingSpecification  → rtspec_  (specification_version, metadata excluded)
  • RoutingContext        → rtctx_   (operational availability/gate/cycle-id excluded)
  • ProposedRoute         → rtprop_  (applied_route/fallback/generated_at/cycle-id/metadata excluded)
  • RoutingEquivalenceReport → rtequiv_ (generated_at/metadata excluded)
"""

from __future__ import annotations

import hashlib
from dataclasses import dataclass, field
from typing import Any, Protocol

from app.materiality_activation import (
    ACTIVATION_MODES,
    ACTIVATION_SPECIFICATION_V1,
    CANARY_SALT_PREFIX,
    MODE_ACTIVE,
    MODE_CANARY,
    MODE_DISABLED,
    MODE_SHADOW,
)
from app.materiality_evaluation import canonical_json_bytes

A3_CONTRACT_VERSION = "wave-0.4-a3"

# ── Routing routes (closed enum) ──────────────────────────────────────────────
ROUTE_LEGACY = "legacy"
ROUTE_SHADOW = "materiality_shadow"
ROUTE_CANARY = "materiality_canary"
ROUTE_ACTIVE = "materiality_active"
ROUTING_ROUTES = frozenset({ROUTE_LEGACY, ROUTE_SHADOW, ROUTE_CANARY, ROUTE_ACTIVE})

_MODE_TO_ROUTE = {
    MODE_DISABLED: ROUTE_LEGACY, MODE_SHADOW: ROUTE_SHADOW,
    MODE_CANARY: ROUTE_CANARY, MODE_ACTIVE: ROUTE_ACTIVE,
}

# ── Deterministic reason codes (single-valued; §6 first-match ladder) ──────────
REASON_INVALID_CONTEXT = "invalid_context"
REASON_KILL_SWITCH = "kill_switch"
REASON_DISABLED_MODE = "disabled_mode"
REASON_VERSION_MISMATCH = "version_mismatch"
REASON_READINESS_MISMATCH = "readiness_mismatch"
REASON_ELIGIBILITY_MISMATCH = "eligibility_mismatch"
REASON_SHADOW_MODE = "shadow_mode"
REASON_CANARY_MISSING_SUBJECT = "canary_missing_subject"
REASON_CANARY_OUT = "canary_out_of_cohort"
REASON_CANARY_IN = "canary_in_cohort"
REASON_ACTIVE_MODE = "active_mode"
REASON_UNRECOGNIZED_MODE = "unrecognized_mode"

FALLBACK_ENFORCEMENT_CAP = "a3_enforcement_cap"
FALLBACK_MATERIALITY_UNAVAILABLE = "materiality_path_unavailable"

_ROUTE_PRECEDENCE = (
    REASON_INVALID_CONTEXT, REASON_KILL_SWITCH, REASON_DISABLED_MODE,
    REASON_VERSION_MISMATCH, REASON_READINESS_MISMATCH, REASON_ELIGIBILITY_MISMATCH,
    REASON_SHADOW_MODE, REASON_CANARY_MISSING_SUBJECT, REASON_CANARY_OUT,
    REASON_CANARY_IN, REASON_ACTIVE_MODE, REASON_UNRECOGNIZED_MODE,
)

EQUIVALENT = "equivalent"
NOT_EQUIVALENT = "not_equivalent"
INSUFFICIENT_COVERAGE = "insufficient_coverage"
INVALID = "invalid"


def _sha(content: object) -> str:
    return hashlib.sha256(canonical_json_bytes(content)).hexdigest()


# ══════════════════════════════════════════════════════════════════════════════
# Immutable artifacts.
# ══════════════════════════════════════════════════════════════════════════════
@dataclass(frozen=True)
class RoutingSpecification:
    specification_version: str                         # NON-identity (label/lineage)
    allowed_proposed_routes: tuple
    applied_route_cap: str
    required_activation_specification_id: str
    required_activation_state_schema: str
    required_engine_versions: tuple
    required_policy_versions: tuple
    required_readiness_scope: dict
    canary_assignment_version: str
    eligibility_rules: dict
    route_precedence: tuple
    failure_behavior: str
    rollback_rules: dict
    observation_requirements: dict
    metadata: str = ""                                 # NON-identity

    def _identity_content(self) -> dict:
        return {
            "allowed_proposed_routes": sorted(self.allowed_proposed_routes),
            "applied_route_cap": self.applied_route_cap,
            "required_activation_specification_id": self.required_activation_specification_id,
            "required_activation_state_schema": self.required_activation_state_schema,
            "required_engine_versions": sorted(self.required_engine_versions),
            "required_policy_versions": sorted(self.required_policy_versions),
            "required_readiness_scope": self.required_readiness_scope,
            "canary_assignment_version": self.canary_assignment_version,
            "eligibility_rules": self.eligibility_rules,
            "route_precedence": list(self.route_precedence),
            "failure_behavior": self.failure_behavior,
            "rollback_rules": self.rollback_rules,
            "observation_requirements": self.observation_requirements,
        }

    @property
    def routing_specification_id(self) -> str:
        return "rtspec_" + _sha(self._identity_content())


ROUTING_SPECIFICATION_V1 = RoutingSpecification(
    specification_version="rtspec-a3-v1",
    allowed_proposed_routes=(ROUTE_LEGACY, ROUTE_SHADOW, ROUTE_CANARY, ROUTE_ACTIVE),
    applied_route_cap=ROUTE_LEGACY,
    required_activation_specification_id=ACTIVATION_SPECIFICATION_V1.activation_specification_id,
    required_activation_state_schema="actstate-a1",
    required_engine_versions=(),                       # () = any
    required_policy_versions=(),
    required_readiness_scope={"required_status": "ready", "require_binding": True},
    canary_assignment_version=CANARY_SALT_PREFIX,      # "actcanary-v1"
    eligibility_rules={"require_version_match": True,
                       "require_readiness_for": [ROUTE_CANARY, ROUTE_ACTIVE],
                       "require_spec_match": True},
    route_precedence=_ROUTE_PRECEDENCE,
    failure_behavior="fail_closed_legacy",
    rollback_rules={"kill_switch": "legacy", "gate_off": "legacy", "absent_state": "legacy",
                    "config_rollback": "next_cycle", "requires_migration": False},
    observation_requirements={"model": "diagnostics+transition_audit", "max_observations": 128},
)


@dataclass(frozen=True)
class RoutingContext:
    # ── IDENTITY content (immutable resolved / deterministic derived facts) ──
    activation_state_id: str
    activation_configuration_id: str
    resolved_effective_mode: str
    engine_version: str
    policy_version: str
    readiness_result_id: str | None
    readiness_status: str | None
    durable_event_uid: str | None
    canary_membership: bool | None
    canary_assignment_salt: str | None
    eligibility_facts: dict
    kill_switch_engaged: bool
    # ── OPERATIONAL (EXCLUDED from identity) ──
    legacy_path_available: bool = True
    materiality_path_available: bool = False
    runtime_gate_status: dict = field(default_factory=dict)
    observation_cycle_id: str = ""

    def _identity_content(self) -> dict:
        return {
            "activation_state_id": self.activation_state_id,
            "activation_configuration_id": self.activation_configuration_id,
            "resolved_effective_mode": self.resolved_effective_mode,
            "engine_version": self.engine_version,
            "policy_version": self.policy_version,
            "readiness_result_id": self.readiness_result_id,
            "readiness_status": self.readiness_status,
            "durable_event_uid": self.durable_event_uid,
            "canary_membership": self.canary_membership,
            "canary_assignment_salt": self.canary_assignment_salt,
            "eligibility_facts": self.eligibility_facts,
            "kill_switch_engaged": self.kill_switch_engaged,
        }

    @property
    def routing_context_id(self) -> str:
        return "rtctx_" + _sha(self._identity_content())


@dataclass(frozen=True)
class ProposedRoute:
    # ── IDENTITY content (intent / proposal / eligibility / reasoning) ──
    routing_specification_id: str
    routing_context_id: str
    requested_route: str
    proposed_route: str
    eligibility_result: dict
    reason_code: str
    advisory: bool = True
    # ── OPERATIONAL (EXCLUDED from identity) ──
    applied_route: str = ROUTE_LEGACY
    fallback_reason: str | None = None
    generated_at: str | None = None
    observation_cycle_id: str = ""
    metadata: str = ""

    def _identity_content(self) -> dict:
        return {
            "routing_specification_id": self.routing_specification_id,
            "routing_context_id": self.routing_context_id,
            "requested_route": self.requested_route,
            "proposed_route": self.proposed_route,
            "eligibility_result": self.eligibility_result,
            "reason_code": self.reason_code,
            "advisory": self.advisory,
        }

    @property
    def proposed_route_id(self) -> str:
        return "rtprop_" + _sha(self._identity_content())


@dataclass(frozen=True)
class RoutingEquivalenceReport:
    source_fixture_id: str
    source_fixture_hash: str
    logical_clock: str
    activation_snapshot_id: str
    configuration_snapshot_id: str
    routing_specification_id: str
    activation_state_ids: tuple
    mode_coverage: tuple
    matrix_case_coverage: tuple
    event_count_legacy: int
    event_count_a3_present: int
    ordered_event_identity_equal: bool
    serialized_output_equal: bool
    cache_equal: bool
    api_projection_equal: bool
    mismatch_details: tuple
    result_status: str
    generated_at: str | None = None                    # NON-identity
    metadata: str = ""                                 # NON-identity

    def _identity_content(self) -> dict:
        return {
            "source_fixture_id": self.source_fixture_id,
            "source_fixture_hash": self.source_fixture_hash,
            "logical_clock": self.logical_clock,
            "activation_snapshot_id": self.activation_snapshot_id,
            "configuration_snapshot_id": self.configuration_snapshot_id,
            "routing_specification_id": self.routing_specification_id,
            "activation_state_ids": sorted(self.activation_state_ids),
            "mode_coverage": sorted(self.mode_coverage),
            "matrix_case_coverage": sorted(self.matrix_case_coverage),
            "event_count_legacy": self.event_count_legacy,
            "event_count_a3_present": self.event_count_a3_present,
            "ordered_event_identity_equal": self.ordered_event_identity_equal,
            "serialized_output_equal": self.serialized_output_equal,
            "cache_equal": self.cache_equal,
            "api_projection_equal": self.api_projection_equal,
            "mismatch_details": list(self.mismatch_details),
            "result_status": self.result_status,
        }

    @property
    def routing_equivalence_report_id(self) -> str:
        return "rtequiv_" + _sha(self._identity_content())


# ── Future materiality-authority route — INTERFACE ONLY (no A3 implementation) ─
RouteOutput = Any     # contractually the legacy ProcessedFeed contract (J-7)


class MaterialityAuthorityRoute(Protocol):
    """A later wave MAY implement this. A3 provides the interface only and never
    invokes it in production; a deterministic test double exists only in tests."""

    def apply(self, context: RoutingContext) -> RouteOutput:  # pragma: no cover - interface
        ...


# ══════════════════════════════════════════════════════════════════════════════
# Pure route resolution — strict first-match ladder; exactly one reason_code.
# ══════════════════════════════════════════════════════════════════════════════
def requested_route_for_mode(mode: str) -> str:
    return _MODE_TO_ROUTE.get(mode, ROUTE_LEGACY)


def _context_valid(context: RoutingContext) -> bool:
    return bool(context.activation_state_id) and context.resolved_effective_mode in ACTIVATION_MODES


def _propose(spec: RoutingSpecification, context: RoutingContext | None, requested: str,
             proposed: str, reason: str) -> ProposedRoute:
    # A3 enforcement cap: applied is ALWAYS legacy; fallback_reason is set only when
    # the cap forces applied != proposed. It never duplicates reason_code.
    fallback = FALLBACK_ENFORCEMENT_CAP if proposed != ROUTE_LEGACY else None
    elig = dict(context.eligibility_facts) if context is not None else {}
    if context is not None:
        elig = {**elig, "canary": context.canary_membership}
    return ProposedRoute(
        routing_specification_id=spec.routing_specification_id,
        routing_context_id=(context.routing_context_id if context is not None else ""),
        requested_route=requested, proposed_route=proposed, eligibility_result=elig,
        reason_code=reason, applied_route=ROUTE_LEGACY, fallback_reason=fallback)


def resolve_route(spec: RoutingSpecification, context: RoutingContext | None) -> ProposedRoute:
    """Pure, deterministic. Reads ONLY the RoutingContext identity content (never
    operational availability/gate). Strict first-match ladder; the first matching
    predicate returns and evaluation stops, so exactly one reason_code is produced."""
    if context is None or not _context_valid(context):
        return _propose(spec, context, ROUTE_LEGACY, ROUTE_LEGACY, REASON_INVALID_CONTEXT)

    requested = requested_route_for_mode(context.resolved_effective_mode)
    mode = context.resolved_effective_mode
    elig = context.eligibility_facts

    if context.kill_switch_engaged:
        return _propose(spec, context, requested, ROUTE_LEGACY, REASON_KILL_SWITCH)
    if mode == MODE_DISABLED:
        return _propose(spec, context, requested, ROUTE_LEGACY, REASON_DISABLED_MODE)
    if not elig.get("version_match", False):
        return _propose(spec, context, requested, ROUTE_LEGACY, REASON_VERSION_MISMATCH)
    if mode in (MODE_CANARY, MODE_ACTIVE) and not elig.get("readiness_match", False):
        return _propose(spec, context, requested, ROUTE_LEGACY, REASON_READINESS_MISMATCH)
    if not elig.get("spec_match", False):
        return _propose(spec, context, requested, ROUTE_LEGACY, REASON_ELIGIBILITY_MISMATCH)
    if mode == MODE_SHADOW:
        return _propose(spec, context, requested, ROUTE_SHADOW, REASON_SHADOW_MODE)
    if mode == MODE_CANARY:
        if context.durable_event_uid is None:
            return _propose(spec, context, requested, ROUTE_LEGACY, REASON_CANARY_MISSING_SUBJECT)
        if not context.canary_membership:
            return _propose(spec, context, requested, ROUTE_LEGACY, REASON_CANARY_OUT)
        return _propose(spec, context, requested, ROUTE_CANARY, REASON_CANARY_IN)
    if mode == MODE_ACTIVE:
        return _propose(spec, context, requested, ROUTE_ACTIVE, REASON_ACTIVE_MODE)
    return _propose(spec, context, requested, ROUTE_LEGACY, REASON_UNRECOGNIZED_MODE)


# ══════════════════════════════════════════════════════════════════════════════
# Equivalence report construction — offline / tests only (never in production).
# ══════════════════════════════════════════════════════════════════════════════
def evaluate_equivalence_status(*, preconditions_met: bool, required_cases: set,
                                covered_cases: set, event_count_legacy: int,
                                event_count_a3: int, all_equal: bool,
                                mismatch_details: tuple) -> str:
    if not preconditions_met:
        return INVALID
    if not required_cases <= covered_cases:
        return INSUFFICIENT_COVERAGE
    if event_count_legacy <= 0 or event_count_a3 <= 0:
        return INSUFFICIENT_COVERAGE
    if all_equal and not mismatch_details:
        return EQUIVALENT
    return NOT_EQUIVALENT
