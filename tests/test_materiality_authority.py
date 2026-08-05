"""Wave 0.4 A4 — controlled-authority CORE regressions.

Artifact identity (deterministic, content-derived, timestamp/metadata insensitive,
frozen), exhaustive eligibility (all blockers, sorted, no short-circuit), the
ceiling-vs-grant separation (A-1), and the granted/denied/revoked decision.
"""

from dataclasses import FrozenInstanceError, replace
from types import SimpleNamespace as NS

import pytest

from app.materiality_activation import MODE_ACTIVE, MODE_CANARY, MODE_DISABLED, MODE_SHADOW
from app.materiality_authority import (
    AUTHORITY_SPECIFICATION_V1 as SPEC,
    BLOCK_ACTIVATION_NOT_ACTIVE,
    BLOCK_CONFIG_VERSION,
    BLOCK_ENGINE,
    BLOCK_GATE,
    BLOCK_KILL,
    BLOCK_READINESS_MISSING,
    BLOCK_READINESS_SPEC_INTEGRITY,
    BLOCK_READINESS_TEMPLATE,
    BLOCK_ROUTING_NOT_ACTIVE,
    DECISION_DENIED,
    DECISION_GRANTED,
    DECISION_REVOKED,
    ELIGIBLE,
    INELIGIBLE,
    STATUS_GRANTED,
    STATUS_NEVER_GRANTED,
    STATUS_REVOKED,
    AuthoritySpecification,
    _sha,
    authority_status_from_last_decision,
    compute_authority_ceiling,
    decide,
    evaluate_eligibility,
    readiness_template_hash,
)
from app.materiality_readiness import readiness_specification_v1
from app.materiality_routing import ROUTE_ACTIVE, ROUTE_CANARY, ROUTE_LEGACY, ROUTE_SHADOW
from app.materiality_routing import ROUTING_SPECIFICATION_V1 as R

_H = "a" * 64
_CUTOFF = "2026-08-01T00:00:00.000000Z"


def _state(mode=MODE_ACTIVE, *, kill=False, spec_id=None):
    return NS(activation_state_id="actstate_x", activation_configuration_id="c",
              resolved_effective_mode=mode, kill_switch_engaged=kill,
              activation_specification_id=(spec_id or SPEC.activation_specification_id))


def _spec_content(cutoff=_CUTOFF, **override):
    content = dict(readiness_specification_v1(cutoff)._identity_content())
    content.update(override)
    return content


def _readiness(status="ready", *, prereqs=(), h=_H, cutoff=_CUTOFF, content=None, spec_id=None):
    content = content if content is not None else _spec_content(cutoff)
    return NS(readiness_result_id="rdres_" + h, canonical_content_hash=h,
              readiness_status=status, blocking_prerequisites=prereqs,
              readiness_specification_id=(spec_id or "rdspec_" + _sha(content)),
              readiness_specification_content=content)


def _route(route=ROUTE_ACTIVE, *, spec_id=None):
    return NS(proposed_route_id="rtprop_y", proposed_route=route,
              routing_specification_id=(spec_id or R.routing_specification_id))


def _config(engine="argus-current", policy="argus-current", version="a2-safe-default-v1"):
    return NS(engine_version=engine, policy_version=policy, configuration_version=version)


def _elig(**over):
    kw = dict(activation_state=_state(), readiness=_readiness(), proposed_route=_route(),
              config=_config(), gate_enabled=True)
    kw.update(over)
    return evaluate_eligibility(SPEC, **kw)


# ── Eligibility ───────────────────────────────────────────────────────────────
def test_full_eligible_path():
    e = _elig()
    assert e.eligibility_status == ELIGIBLE
    assert e.blocking_conditions == ()


def test_eligible_iff_empty_blockers():
    assert _elig(gate_enabled=False).eligibility_status == INELIGIBLE
    assert BLOCK_GATE in _elig(gate_enabled=False).blocking_conditions


@pytest.mark.parametrize("over,blocker", [
    ({"activation_state": _state(MODE_SHADOW)}, BLOCK_ACTIVATION_NOT_ACTIVE),
    ({"activation_state": _state(MODE_ACTIVE, kill=True)}, BLOCK_KILL),
    ({"readiness": None}, BLOCK_READINESS_MISSING),
    ({"proposed_route": _route(ROUTE_LEGACY)}, BLOCK_ROUTING_NOT_ACTIVE),
    ({"config": _config(engine="other")}, BLOCK_ENGINE),
    ({"config": _config(version="other")}, BLOCK_CONFIG_VERSION),
    ({"gate_enabled": False}, BLOCK_GATE),
])
def test_individual_blockers(over, blocker):
    e = _elig(**over)
    assert e.eligibility_status == INELIGIBLE
    assert blocker in e.blocking_conditions


def test_exhaustive_blockers_no_short_circuit():
    # three simultaneous failures must ALL appear, sorted and deduplicated.
    e = _elig(activation_state=_state(MODE_SHADOW, kill=True), proposed_route=_route(ROUTE_LEGACY))
    assert {BLOCK_ACTIVATION_NOT_ACTIVE, BLOCK_KILL, BLOCK_ROUTING_NOT_ACTIVE} <= set(e.blocking_conditions)
    assert list(e.blocking_conditions) == sorted(set(e.blocking_conditions))   # sorted, unique


def test_missing_everything_is_ineligible():
    e = evaluate_eligibility(SPEC, activation_state=None, readiness=None, proposed_route=None,
                             config=None, gate_enabled=True)
    assert e.eligibility_status == INELIGIBLE
    assert BLOCK_READINESS_MISSING in e.blocking_conditions


# ── Ceiling vs grant (A-1) ────────────────────────────────────────────────────
@pytest.mark.parametrize("state_mode,route,expected", [
    (MODE_ACTIVE, ROUTE_LEGACY, MODE_DISABLED),
    (MODE_SHADOW, ROUTE_ACTIVE, MODE_SHADOW),
    (MODE_ACTIVE, ROUTE_CANARY, MODE_CANARY),
    (MODE_ACTIVE, ROUTE_ACTIVE, MODE_ACTIVE),
])
def test_ceiling_reachable(state_mode, route, expected):
    c = compute_authority_ceiling(SPEC, activation_state=_state(state_mode),
                                  readiness=_readiness(), proposed_route=_route(route))
    assert c == expected


def test_ceiling_active_but_gate_off_denies_with_disabled_grant():
    e = _elig(gate_enabled=False)
    c = compute_authority_ceiling(SPEC, activation_state=_state(), readiness=_readiness(),
                                  proposed_route=_route())
    d = decide(SPEC, e, c, authority_status=STATUS_NEVER_GRANTED)
    assert c == MODE_ACTIVE                             # ceiling still records active
    assert d.decision == DECISION_DENIED
    assert d.granted_authority_level == MODE_DISABLED   # grant disabled despite active ceiling
    assert d.computed_authority_ceiling == MODE_ACTIVE


def test_grant_never_exceeds_ceiling_or_activation():
    order = {MODE_DISABLED: 0, MODE_SHADOW: 1, MODE_CANARY: 2, MODE_ACTIVE: 3}
    for smode in (MODE_DISABLED, MODE_SHADOW, MODE_CANARY, MODE_ACTIVE):
        for route in (ROUTE_LEGACY, ROUTE_SHADOW, ROUTE_CANARY, ROUTE_ACTIVE):
            st, rt = _state(smode), _route(route)
            e = _elig(activation_state=st, proposed_route=rt)
            c = compute_authority_ceiling(SPEC, activation_state=st, readiness=_readiness(),
                                          proposed_route=rt)
            d = decide(SPEC, e, c, authority_status=STATUS_NEVER_GRANTED)
            assert order[d.granted_authority_level] <= order[c] <= order[smode]


# ── Decision ──────────────────────────────────────────────────────────────────
def test_granted_path():
    e = _elig()
    c = compute_authority_ceiling(SPEC, activation_state=_state(), readiness=_readiness(),
                                  proposed_route=_route())
    d = decide(SPEC, e, c, authority_status=STATUS_NEVER_GRANTED)
    assert d.decision == DECISION_GRANTED and d.granted_authority_level == MODE_ACTIVE


def test_revoked_on_readiness_loss():
    e = _elig(readiness=_readiness("insufficient_evidence"))
    c = compute_authority_ceiling(SPEC, activation_state=_state(),
                                  readiness=_readiness("insufficient_evidence"), proposed_route=_route())
    d = decide(SPEC, e, c, authority_status=STATUS_GRANTED)
    assert d.decision == DECISION_REVOKED and d.granted_authority_level == MODE_DISABLED


def test_denied_when_no_prior_grant():
    e = _elig(proposed_route=_route(ROUTE_LEGACY))
    c = compute_authority_ceiling(SPEC, activation_state=_state(), readiness=_readiness(),
                                  proposed_route=_route(ROUTE_LEGACY))
    d = decide(SPEC, e, c, authority_status=STATUS_NEVER_GRANTED)
    assert d.decision == DECISION_DENIED and d.reason.startswith("denied:")


def test_two_denials_from_different_inputs_are_distinct():
    e1 = evaluate_eligibility(SPEC, activation_state=None, readiness=_readiness(),
                              proposed_route=_route(), config=_config(), gate_enabled=True)
    e2 = _elig(readiness=None)
    d1 = decide(SPEC, e1, MODE_DISABLED, authority_status=STATUS_NEVER_GRANTED)
    d2 = decide(SPEC, e2, MODE_DISABLED, authority_status=STATUS_NEVER_GRANTED)
    assert d1.decision == d2.decision == DECISION_DENIED
    assert e1.authority_eligibility_id != e2.authority_eligibility_id
    assert d1.authority_decision_id != d2.authority_decision_id   # distinct decisions


# ── Artifact identity ─────────────────────────────────────────────────────────
def test_spec_identity_version_metadata_insensitive():
    b = replace(SPEC, schema_version="authspec-a4-v999", metadata="note")
    assert SPEC.authority_specification_id == b.authority_specification_id


def test_eligibility_identity_excludes_generated_at():
    e = _elig()
    assert e.authority_eligibility_id == replace(e, generated_at="2027-01-01T00:00:00Z").authority_eligibility_id


def test_decision_identity_excludes_generated_at_and_is_content_sensitive():
    e = _elig()
    d = decide(SPEC, e, MODE_ACTIVE, authority_status=STATUS_NEVER_GRANTED)
    assert d.authority_decision_id == replace(d, generated_at="2099-01-01T00:00:00Z").authority_decision_id
    assert d.authority_decision_id != replace(d, granted_authority_level=MODE_DISABLED).authority_decision_id


def test_artifacts_frozen():
    e = _elig()
    with pytest.raises(FrozenInstanceError):
        e.eligibility_status = "x"


def test_spec_v1_binds_live_upstream_ids():
    from app.materiality_activation import ACTIVATION_SPECIFICATION_V1 as A
    from app.materiality_thresholds import COMPARISON_SPECIFICATION_V1, SUPPORT_CRITERION_V1
    assert SPEC.activation_specification_id == A.activation_specification_id
    assert SPEC.routing_specification_id == R.routing_specification_id
    assert SPEC.comparison_specification_id == COMPARISON_SPECIFICATION_V1.comparison_specification_id
    assert SPEC.support_criterion_id == SUPPORT_CRITERION_V1.support_criterion_id
    assert SPEC.grant_range == (MODE_DISABLED, MODE_ACTIVE)


def test_spec_is_authority_specification():
    assert isinstance(SPEC, AuthoritySpecification)


# ── Correction 1: readiness template compatibility + exact run binding ─────────
def test_two_cutoffs_compatible_and_distinct_ids_bound():
    r1 = _readiness(cutoff="2026-08-01T00:00:00.000000Z")
    r2 = _readiness(cutoff="2026-09-15T00:00:00.000000Z")
    e1, e2 = _elig(readiness=r1), _elig(readiness=r2)
    assert e1.eligibility_status == ELIGIBLE and e2.eligibility_status == ELIGIBLE   # both compatible
    assert r1.readiness_specification_id != r2.readiness_specification_id            # distinct run ids
    assert e1.readiness_specification_id == r1.readiness_specification_id            # exact binding
    assert e2.readiness_specification_id == r2.readiness_specification_id
    assert readiness_template_hash(r1.readiness_specification_content) == \
        readiness_template_hash(r2.readiness_specification_content) == SPEC.readiness_template_hash


@pytest.mark.parametrize("field,value", [
    ("gate_set_version", "GATESET-OTHER"),
    ("operational_evidence_freshness_policy_version", "freshpol-OTHER"),
    ("required_c3_statuses", {"recommendation_status": "weakened"}),
])
def test_changed_stable_field_is_template_incompatible(field, value):
    content = _spec_content(**{field: value})
    e = _elig(readiness=_readiness(content=content))
    assert e.eligibility_status == INELIGIBLE
    assert BLOCK_READINESS_TEMPLATE in e.blocking_conditions


def test_readiness_spec_integrity_invalid_when_id_not_content_derived():
    content = _spec_content()
    e = _elig(readiness=_readiness(content=content, spec_id="rdspec_forged"))
    assert BLOCK_READINESS_SPEC_INTEGRITY in e.blocking_conditions


def test_arbitrary_valid_looking_rdspec_denied():
    # integrity-valid (id == rdspec_ + hash(content)) but WRONG template → denied.
    content = _spec_content(gate_set_version="rogue")
    e = _elig(readiness=_readiness(content=content))
    assert e.eligibility_status == INELIGIBLE
    assert BLOCK_READINESS_TEMPLATE in e.blocking_conditions


# ── Correction 2: revocation persistence (episode semantics) ──────────────────
def test_authority_status_mapping():
    assert authority_status_from_last_decision(None) == STATUS_NEVER_GRANTED
    assert authority_status_from_last_decision(DECISION_DENIED) == STATUS_NEVER_GRANTED
    assert authority_status_from_last_decision(DECISION_GRANTED) == STATUS_GRANTED
    assert authority_status_from_last_decision(DECISION_REVOKED) == STATUS_REVOKED


def test_revoked_is_stable_and_denied_when_never_granted():
    lost = _readiness("insufficient_evidence")
    e = _elig(readiness=lost)
    c = compute_authority_ceiling(SPEC, activation_state=_state(), readiness=lost, proposed_route=_route())
    # after a grant → revoked; staying ineligible reproduces the SAME revoked decision
    d_rev = decide(SPEC, e, c, authority_status=STATUS_GRANTED)
    d_rev_again = decide(SPEC, e, c, authority_status=STATUS_REVOKED)
    assert d_rev.decision == d_rev_again.decision == DECISION_REVOKED
    assert d_rev.authority_decision_id == d_rev_again.authority_decision_id   # stable → no new audit
    # never granted → denied (distinct from revoked)
    d_den = decide(SPEC, e, c, authority_status=STATUS_NEVER_GRANTED)
    assert d_den.decision == DECISION_DENIED
    assert d_den.authority_decision_id != d_rev.authority_decision_id
