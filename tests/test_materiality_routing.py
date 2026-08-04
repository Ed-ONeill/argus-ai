"""Wave 0.4 A3 — routing CORE regressions.

Artifact identity (deterministic, content-derived, operational/version/timestamp
insensitive, frozen), the strict first-match resolution ladder with a single
reason_code and applied_route ≡ legacy, and equivalence-status logic.
"""

from dataclasses import FrozenInstanceError, replace

import pytest

from app.materiality_activation import (
    ACTIVATION_SPECIFICATION_V1 as ASPEC,
    MODE_ACTIVE,
    MODE_CANARY,
    MODE_DISABLED,
    MODE_SHADOW,
)
from app.materiality_routing import (
    EQUIVALENT,
    FALLBACK_ENFORCEMENT_CAP,
    INSUFFICIENT_COVERAGE,
    INVALID,
    NOT_EQUIVALENT,
    REASON_ACTIVE_MODE,
    REASON_CANARY_IN,
    REASON_CANARY_MISSING_SUBJECT,
    REASON_CANARY_OUT,
    REASON_DISABLED_MODE,
    REASON_ELIGIBILITY_MISMATCH,
    REASON_INVALID_CONTEXT,
    REASON_KILL_SWITCH,
    REASON_READINESS_MISMATCH,
    REASON_SHADOW_MODE,
    REASON_VERSION_MISMATCH,
    ROUTE_ACTIVE,
    ROUTE_CANARY,
    ROUTE_LEGACY,
    ROUTE_SHADOW,
    ROUTING_SPECIFICATION_V1 as SPEC,
    ProposedRoute,
    RoutingContext,
    RoutingEquivalenceReport,
    RoutingSpecification,
    evaluate_equivalence_status,
    resolve_route,
)


def _ctx(mode=MODE_SHADOW, *, kill=False, version=True, readiness=True, spec=True,
         uid=None, canary=None, state_id="actstate_x"):
    return RoutingContext(
        activation_state_id=state_id, activation_configuration_id="actcfg_y",
        resolved_effective_mode=mode, engine_version="e", policy_version="p",
        readiness_result_id=("rdres_1" if readiness else None),
        readiness_status=("ready" if readiness else None),
        durable_event_uid=uid, canary_membership=canary,
        canary_assignment_salt=(None if uid is None else "salt"),
        eligibility_facts={"version_match": version, "readiness_match": readiness, "spec_match": spec},
        kill_switch_engaged=kill)


# ── Resolution ladder (single reason, applied always legacy) ──────────────────
@pytest.mark.parametrize("ctx,route,reason", [
    (None, ROUTE_LEGACY, REASON_INVALID_CONTEXT),
    (_ctx(state_id=""), ROUTE_LEGACY, REASON_INVALID_CONTEXT),
    (_ctx(MODE_SHADOW, kill=True), ROUTE_LEGACY, REASON_KILL_SWITCH),
    (_ctx(MODE_DISABLED), ROUTE_LEGACY, REASON_DISABLED_MODE),
    (_ctx(MODE_SHADOW, version=False), ROUTE_LEGACY, REASON_VERSION_MISMATCH),
    (_ctx(MODE_ACTIVE, readiness=False), ROUTE_LEGACY, REASON_READINESS_MISMATCH),
    (_ctx(MODE_SHADOW, spec=False), ROUTE_LEGACY, REASON_ELIGIBILITY_MISMATCH),
    (_ctx(MODE_SHADOW), ROUTE_SHADOW, REASON_SHADOW_MODE),
    (_ctx(MODE_CANARY, uid=None), ROUTE_LEGACY, REASON_CANARY_MISSING_SUBJECT),
    (_ctx(MODE_CANARY, uid="e", canary=False), ROUTE_LEGACY, REASON_CANARY_OUT),
    (_ctx(MODE_CANARY, uid="e", canary=True), ROUTE_CANARY, REASON_CANARY_IN),
    (_ctx(MODE_ACTIVE), ROUTE_ACTIVE, REASON_ACTIVE_MODE),
])
def test_route_ladder(ctx, route, reason):
    p = resolve_route(SPEC, ctx)
    assert p.proposed_route == route
    assert p.reason_code == reason                     # single-valued (R-1)
    assert isinstance(p.reason_code, str)              # not a list/compound
    assert p.applied_route == ROUTE_LEGACY             # invariant
    if route != ROUTE_LEGACY:
        assert p.fallback_reason == FALLBACK_ENFORCEMENT_CAP
    else:
        assert p.fallback_reason is None
    assert p.fallback_reason != p.reason_code          # R-2: never duplicates


def test_availability_does_not_change_proposal():
    # materiality_path_available / legacy_path_available are operational, not identity;
    # the proposal is a pure function of identity facts.
    base = _ctx(MODE_SHADOW)
    off = replace(base, materiality_path_available=True, legacy_path_available=False)
    assert resolve_route(SPEC, base).proposed_route == resolve_route(SPEC, off).proposed_route


# ── Artifact identity ─────────────────────────────────────────────────────────
def test_spec_identity_version_and_metadata_insensitive():
    a = SPEC
    b = replace(SPEC, specification_version="rtspec-a3-v999", metadata="note")
    assert a.routing_specification_id == b.routing_specification_id


def test_context_identity_deterministic_and_order_invariant():
    a = _ctx(MODE_SHADOW)
    b = RoutingContext(
        activation_state_id="actstate_x", activation_configuration_id="actcfg_y",
        resolved_effective_mode=MODE_SHADOW, engine_version="e", policy_version="p",
        readiness_result_id="rdres_1", readiness_status="ready", durable_event_uid=None,
        canary_membership=None, canary_assignment_salt=None,
        eligibility_facts={"spec_match": True, "readiness_match": True, "version_match": True},  # reordered
        kill_switch_engaged=False)
    assert a.routing_context_id == b.routing_context_id


def test_context_identity_excludes_operational_fields():
    base = _ctx(MODE_SHADOW)
    mutated = replace(base, legacy_path_available=False, materiality_path_available=True,
                      runtime_gate_status={"a2_enabled": True, "a3_enabled": True},
                      observation_cycle_id="cycleZ")
    assert base.routing_context_id == mutated.routing_context_id


def test_context_identity_content_sensitive():
    assert _ctx(MODE_SHADOW).routing_context_id != _ctx(MODE_DISABLED).routing_context_id


def test_proposed_route_identity_excludes_applied_and_operational():
    p = resolve_route(SPEC, _ctx(MODE_SHADOW))
    q = replace(p, applied_route="materiality_shadow", fallback_reason="x",
                generated_at="2026-01-01T00:00:00Z", observation_cycle_id="c9", metadata="m")
    assert p.proposed_route_id == q.proposed_route_id  # applied/operational excluded (R-3)


def test_proposed_route_identity_content_sensitive():
    p = resolve_route(SPEC, _ctx(MODE_SHADOW))
    q = replace(p, proposed_route=ROUTE_LEGACY)
    assert p.proposed_route_id != q.proposed_route_id


def test_artifacts_are_frozen():
    ctx = _ctx(MODE_SHADOW)
    with pytest.raises(FrozenInstanceError):
        ctx.resolved_effective_mode = MODE_ACTIVE
    p = resolve_route(SPEC, ctx)
    with pytest.raises(FrozenInstanceError):
        p.applied_route = "materiality_active"


# ── Equivalence status logic ──────────────────────────────────────────────────
_REQ = {"shadow", "disabled"}


def test_equivalence_status_matrix():
    # invalid preconditions
    assert evaluate_equivalence_status(preconditions_met=False, required_cases=_REQ,
                                       covered_cases=_REQ, event_count_legacy=3, event_count_a3=3,
                                       all_equal=True, mismatch_details=()) == INVALID
    # insufficient coverage
    assert evaluate_equivalence_status(preconditions_met=True, required_cases=_REQ,
                                       covered_cases={"shadow"}, event_count_legacy=3,
                                       event_count_a3=3, all_equal=True,
                                       mismatch_details=()) == INSUFFICIENT_COVERAGE
    # zero events cannot be equivalent
    assert evaluate_equivalence_status(preconditions_met=True, required_cases=_REQ,
                                       covered_cases=_REQ, event_count_legacy=0, event_count_a3=0,
                                       all_equal=True, mismatch_details=()) == INSUFFICIENT_COVERAGE
    # not equivalent
    assert evaluate_equivalence_status(preconditions_met=True, required_cases=_REQ,
                                       covered_cases=_REQ, event_count_legacy=3, event_count_a3=3,
                                       all_equal=False, mismatch_details=("e1",)) == NOT_EQUIVALENT
    # equivalent
    assert evaluate_equivalence_status(preconditions_met=True, required_cases=_REQ,
                                       covered_cases=_REQ, event_count_legacy=3, event_count_a3=3,
                                       all_equal=True, mismatch_details=()) == EQUIVALENT


def _report(**over):
    base = dict(
        source_fixture_id="fx1", source_fixture_hash="h", logical_clock="2026-08-02T12:00:00Z",
        activation_snapshot_id="actstate_x", configuration_snapshot_id="actcfg_y",
        routing_specification_id=SPEC.routing_specification_id, activation_state_ids=("actstate_x",),
        mode_coverage=("shadow",), matrix_case_coverage=("shadow",), event_count_legacy=2,
        event_count_a3_present=2, ordered_event_identity_equal=True, serialized_output_equal=True,
        cache_equal=True, api_projection_equal=True, mismatch_details=(), result_status=EQUIVALENT)
    base.update(over)
    return RoutingEquivalenceReport(**base)


def test_equivalence_report_identity_excludes_generated_at_and_metadata():
    a = _report(generated_at="2026-08-02T12:00:00Z", metadata="a")
    b = _report(generated_at="2027-01-01T00:00:00Z", metadata="b")
    assert a.routing_equivalence_report_id == b.routing_equivalence_report_id


def test_spec_v1_binds_current_a1_spec():
    assert SPEC.required_activation_specification_id == ASPEC.activation_specification_id
    assert SPEC.applied_route_cap == ROUTE_LEGACY


def test_spec_v1_is_a_routing_specification():
    assert isinstance(SPEC, RoutingSpecification)
    assert isinstance(resolve_route(SPEC, _ctx(MODE_SHADOW)), ProposedRoute)
