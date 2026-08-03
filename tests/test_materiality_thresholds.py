"""
tests/test_materiality_thresholds.py — Wave 0.3 C3 threshold validation (advisory).

Backend-only, shadow-only, advisory, read-only over C1/C2. Threshold-conditioned
metric fixtures are INDEPENDENTLY hand-computed.
"""

from __future__ import annotations

import json
from dataclasses import asdict
from decimal import Decimal
from types import SimpleNamespace

import pytest

from app.materiality_calibration import (
    METRIC_ACCURACY,
    METRIC_PRECISION,
    METRIC_RECALL,
    CalibrationResult,
    _cohort_identity,
    _cohort_key,
)
from app.materiality_evaluation import (
    EvaluationDataset,
    EvaluationRecordRevision,
    OutcomePayload,
)
from app.materiality_thresholds import (
    COMPARISON_SPECIFICATION_V1,
    SUPPORT_CRITERION_V1,
    THRESHOLD_FAMILY_CALIBRATION,
    THRESHOLD_FAMILY_DECISION_RANK,
    ComparisonSpecification,
    SupportCriterion,
    ThresholdCandidateSet,
    ThresholdEvaluationSpecification,
    ThresholdPolicy,
    _compare,
    _reproject,
    build_threshold_recommendations,
    threshold_metrics,
)

PROB_SEM = "materiality-probability-1"
T0 = "2026-01-01T00:00:00.000000Z"
INFO = "2026-01-05T00:00:00.000000Z"
RESOLVED = "2026-02-01T00:00:00.000000Z"
HORIZON = "2026-03-01T00:00:00.000000Z"


def _ojson(label, *, status="resolved", info_at=INFO):
    payload = OutcomePayload(status=status, outcome_specification_version="materiality-outcome-1",
                            target_identifier="t1", horizon_at=HORIZON, resolved_at=RESOLVED,
                            information_available_at=info_at, label=label)
    return json.dumps(asdict(payload))


def _rec(*, uid, confidence_semantics="absent", decision_confidence=None, label=True,
         info_at=INFO, outcome_status="resolved", engine="materiality-shadow-0.3-c1", seq=""):
    return EvaluationRecordRevision(
        schema_version="materiality-evaluation-1", evaluation_id="eval_" + uid + seq,
        supersedes_revision_id=None, revision_sequence=0,
        observation_identity_schema_version="materiality-observation-1",
        observation_id="obs_" + ("0" * 64), observation_stage="canonical_post_identity",
        source_system_namespace="ns", cycle_id="cy1", cycle_local_event_id="c-" + uid,
        durable_event_uid=uid, contributing_ids=(), contributing_event_uids=(),
        event_observed_at=T0, decision_completed_at=T0, record_created_at=T0,
        engine_version=engine, policy_version="umc-0.1.0-uncalibrated",
        input_schema_version="materiality-input-1",
        feature_extractor_version="materiality-features-0.2b-n3",
        manifest_version="m1", manifest_hash="h1", input_snapshot_json="{}", input_hash="input_x",
        shadow_decision="universal" if label else "not_universal", materiality_rank=None,
        decision_confidence=decision_confidence, confidence_semantics=confidence_semantics,
        expected_return_json=None, reasons=(), evidence_ids=(),
        outcome_target="t1", outcome_horizon_at=HORIZON, outcome_unit=None,
        outcome_specification_version="materiality-outcome-1",
        outcome_status=outcome_status, outcome_json=_ojson(label, status=outcome_status, info_at=info_at),
        evaluation_status="scored", status_reason_code=None, available_at=T0)


def _dataset(records):
    ids = "".join(sorted(r.revision_id for r in records))
    return EvaluationDataset(dataset_id="dataset_" + (ids[:16] if ids else "empty"),
                             records=tuple(records), exclusions=(), manifest_json="{}", dataset_json="[]")


def _cohort_of(records, c2_family):
    return _cohort_identity(_cohort_key(records[0], c2_family))


def _c2_calib(dataset, cohort, *, status="measured", governance="accepted"):
    return CalibrationResult(
        result_schema_version="calresult-1", family="calibration", specification_id="s",
        source_dataset_id=dataset.dataset_id, source_dataset_content_hash=dataset.dataset_id,
        cohort_identity=cohort, status=status, record_counts={}, exclusion_counts={}, metrics={},
        reliability_table=None, binning_version=None, reliability_table_schema_version=None,
        sparse_flags={}, warnings=[], acceptance={"governance_status": governance}, metadata={})


def _spec():
    return ThresholdEvaluationSpecification(
        specification_version="v1",
        comparison_specification_id=COMPARISON_SPECIFICATION_V1.comparison_specification_id,
        support_criterion_id=SUPPORT_CRITERION_V1.support_criterion_id)


def _policy(tau, provenance, ver="v1"):
    thresholds = {} if tau is None else {"tau": str(tau)}
    return ThresholdPolicy(threshold_policy_version=ver, family=THRESHOLD_FAMILY_CALIBRATION,
                           thresholds=thresholds, applicability={}, provenance=provenance)


def _prob_records(n_pos, n_neg, p_pos="0.8", p_neg="0.2"):
    recs = [_rec(uid=f"p{i}", confidence_semantics=PROB_SEM, decision_confidence=p_pos, label=True)
            for i in range(n_pos)]
    recs += [_rec(uid=f"n{i}", confidence_semantics=PROB_SEM, decision_confidence=p_neg, label=False)
             for i in range(n_neg)]
    return recs


# ── Metric fixtures: INDEPENDENTLY hand-computed ──────────────────────────────

def test_threshold_metrics_hand_computed():
    pairs = [(Decimal("0.2"), 0), (Decimal("0.4"), 1), (Decimal("0.6"), 0), (Decimal("0.8"), 1)]
    m = threshold_metrics(pairs, Decimal("0.5"))
    # tau=0.5: 0.6,0.8 positive → tp=1(0.8), fp=1(0.6), fn=1(0.4), tn=1(0.2)
    assert m["confusion"] == {"tp": 1, "fp": 1, "fn": 1, "tn": 1}
    assert m[METRIC_PRECISION]["value"] == "0.500000000000"   # 1/2
    assert m[METRIC_RECALL]["value"] == "0.500000000000"      # 1/2
    assert m[METRIC_ACCURACY]["value"] == "0.500000000000"    # 2/4


def test_threshold_metrics_precision_unavailable_when_no_positive_prediction():
    pairs = [(Decimal("0.2"), 1), (Decimal("0.3"), 0)]
    m = threshold_metrics(pairs, Decimal("0.9"))   # nothing predicted positive
    assert m[METRIC_PRECISION]["status"] == "unavailable"
    assert m[METRIC_PRECISION]["value"] is None


# ── Reprojection eligibility / exclusions ─────────────────────────────────────

def test_calibration_reprojection_eligible():
    recs = _prob_records(2, 2)
    pairs, excl = _reproject(recs, THRESHOLD_FAMILY_CALIBRATION, frozenset())
    assert len(pairs) == 4
    assert sum(excl.values()) == 0


def test_reprojection_excludes_absent_and_wrong_semantics():
    recs = [
        _rec(uid="a", confidence_semantics=PROB_SEM, decision_confidence=None, label=True),   # absent
        _rec(uid="b", confidence_semantics="absent", decision_confidence="0.5", label=True),   # wrong sem
        _rec(uid="c", confidence_semantics=PROB_SEM, decision_confidence="0.5", label=True),    # ok
    ]
    pairs, excl = _reproject(recs, THRESHOLD_FAMILY_CALIBRATION, frozenset())
    assert len(pairs) == 1
    assert excl["excl_threshold_input_absent"] == 1
    assert excl["excl_threshold_input_semantics"] == 1


def test_reprojection_future_leakage_rejected():
    recs = [_rec(uid="leak", confidence_semantics=PROB_SEM, decision_confidence="0.5", label=True,
                 info_at="2025-12-01T00:00:00.000000Z")]   # info available BEFORE decision
    pairs, excl = _reproject(recs, THRESHOLD_FAMILY_CALIBRATION, frozenset())
    assert pairs == [] and excl["excl_future_leakage"] == 1


def test_reprojection_duplicate_observation_rejected():
    a = _rec(uid="dup", confidence_semantics=PROB_SEM, decision_confidence="0.8", label=True, seq="a")
    b = _rec(uid="dup", confidence_semantics=PROB_SEM, decision_confidence="0.2", label=False, seq="b")
    pairs, excl = _reproject([a, b], THRESHOLD_FAMILY_CALIBRATION, frozenset())
    assert len(pairs) == 1 and excl["excl_duplicate_observation"] == 1


def test_synthetic_registered_rank_reprojection():
    # decision-by-rank: materiality_rank + a registered rank_semantics_id (via duck-typed record)
    def ns(uid, rank, label, sem="rank-1"):
        return SimpleNamespace(
            revision_id="rev_" + uid, durable_event_uid=uid, observation_id="obs",
            decision_completed_at=T0, materiality_rank=rank, rank_semantics_id=sem,
            confidence_semantics="absent", decision_confidence=None,
            outcome_json=_ojson(label))
    recs = [ns("a", "0.9", True), ns("b", "0.1", False), ns("c", "0.4", True)]
    pairs, excl = _reproject(recs, THRESHOLD_FAMILY_DECISION_RANK, frozenset({"rank-1"}))
    assert len(pairs) == 3 and sum(excl.values()) == 0
    m = threshold_metrics(pairs, Decimal("0.5"))
    # tau=0.5: rank>=0.5 → 0.9 positive; tp=1(0.9,T), fn=1(0.4,T), tn=1(0.1,F)
    assert m["confusion"] == {"tp": 1, "fp": 0, "fn": 1, "tn": 1}
    # empty registry (production default) → rank never eligible
    pairs2, excl2 = _reproject(recs, THRESHOLD_FAMILY_DECISION_RANK, frozenset())
    assert pairs2 == [] and excl2["excl_threshold_input_semantics"] == 3


# ── Current-engine path (Option B): not_evaluated / not_applicable / empty ────

def test_current_engine_recommendations_are_not_evaluated():
    recs = [_rec(uid="e1", label=True), _rec(uid="e2", label=False)]   # absent semantics, null rank
    ds = _dataset(recs)
    cohort = _cohort_of(recs, "calibration")
    # current-engine C2 calibration is unsupported_semantics_prohibited (not measured)
    c2 = _c2_calib(ds, cohort, status="unsupported_semantics_prohibited", governance="not_evaluated")
    cset = ThresholdCandidateSet("v1", (_policy("0.5", "current_production"),))
    recs_out = build_threshold_recommendations(cset, [(c2, ds)], _spec())
    assert len(recs_out) == 1
    r = recs_out[0]
    assert r.recommendation_status == "not_evaluated"
    assert r.evidence_governance == "not_applicable"
    assert r.advisory is True
    assert r.metrics == {} and r.comparison is None


# ── Full pipeline: accepted / supported / unsupported / insufficient / ungoverned

def _pipeline(governance, n_pos=50, n_neg=50, taus=(("0.5", "current_production"),
                                                    ("0.3", "manually_authored"),
                                                    ("0.1", "fixed_alternative"))):
    recs = _prob_records(n_pos, n_neg)
    ds = _dataset(recs)
    cohort = _cohort_of(recs, "calibration")
    c2 = _c2_calib(ds, cohort, status="measured", governance=governance)
    cset = ThresholdCandidateSet("v1", tuple(_policy(t, p) for t, p in taus))
    return {r.threshold_policy_id: r
            for r in build_threshold_recommendations(cset, [(c2, ds)], _spec())}, cset


def test_accepted_supported_and_unsupported():
    out, cset = _pipeline("accepted")
    by_prov = {}
    for r in out.values():
        by_prov[r.supporting_evidence["provenance"]] = r
    assert by_prov["current_production"].recommendation_status == "supported"   # baseline vs itself
    assert by_prov["manually_authored"].recommendation_status == "supported"    # equals baseline
    assert by_prov["fixed_alternative"].recommendation_status == "unsupported"  # worse accuracy
    assert by_prov["current_production"].evidence_governance == "accepted"


def test_ungoverned_capped_at_not_evaluated_with_metrics():
    out, _ = _pipeline("not_evaluated")
    for r in out.values():
        assert r.evidence_governance == "ungoverned"
        assert r.recommendation_status == "not_evaluated"          # capped
        assert r.metrics                                           # metrics present (exploration)
        assert r.recommendation_status not in ("supported", "unsupported")


def test_insufficient_sample_governance():
    out, _ = _pipeline("accepted", n_pos=10, n_neg=10)
    assert all(r.recommendation_status == "insufficient_sample" for r in out.values())


def test_all_five_statuses_reachable():
    seen = set()
    ne_recs = [_rec(uid="x", label=True)]
    ne_ds = _dataset(ne_recs)
    ne_c2 = _c2_calib(ne_ds, _cohort_of(ne_recs, "calibration"),
                      status="unsupported_semantics_prohibited", governance="not_evaluated")
    ne_cset = ThresholdCandidateSet("v1", (_policy("0.5", "current_production"),))
    seen.add(build_threshold_recommendations(ne_cset, [(ne_c2, ne_ds)], _spec())[0]
             .recommendation_status)   # not_evaluated
    out_a, _ = _pipeline("accepted")
    seen.update(r.recommendation_status for r in out_a.values())          # supported + unsupported
    out_i, _ = _pipeline("accepted", n_pos=10, n_neg=10)
    seen.update(r.recommendation_status for r in out_i.values())          # insufficient_sample
    # inconclusive: accepted, sufficient, but NO current_production baseline
    out_c, _ = _pipeline("accepted", taus=(("0.3", "manually_authored"),))
    seen.update(r.recommendation_status for r in out_c.values())
    assert {"supported", "unsupported", "insufficient_sample", "not_evaluated", "inconclusive"} <= seen


# ── Comparison: Pareto frontier + dominated_by provenance ─────────────────────

def test_compare_pareto_and_dominated_by():
    def m(a, p, r):
        return {METRIC_ACCURACY: {"metric_id": METRIC_ACCURACY, "status": "measured", "value": a},
                METRIC_PRECISION: {"metric_id": METRIC_PRECISION, "status": "measured", "value": p},
                METRIC_RECALL: {"metric_id": METRIC_RECALL, "status": "measured", "value": r}}
    scored = {"A": m("0.9", "0.9", "0.9"), "B": m("0.8", "0.8", "0.8")}
    views = _compare(scored, COMPARISON_SPECIFICATION_V1)
    assert views["A"]["on_pareto_frontier"] is True
    assert views["B"]["dominated"] is True
    assert views["B"]["dominated_by"][0]["dominating_threshold_policy_id"] == "A"
    assert set(views["B"]["dominated_by"][0]["dominating_metric_ids"]) == {
        METRIC_ACCURACY, METRIC_PRECISION, METRIC_RECALL}
    assert views["A"]["report_rank"] == 0 and views["B"]["report_rank"] == 1


# ── Artifact identity ─────────────────────────────────────────────────────────

def test_policy_identity_content_only():
    a = _policy("0.5", "fixed_alternative", ver="v1")
    b = _policy("0.5", "fixed_alternative", ver="v99")        # different version label
    assert a.threshold_policy_id == b.threshold_policy_id     # version is lineage, not identity
    # metadata excluded
    c = ThresholdPolicy("v1", THRESHOLD_FAMILY_CALIBRATION, {"tau": "0.5"}, {},
                        "fixed_alternative", metadata="author=x")
    assert c.threshold_policy_id == a.threshold_policy_id
    # Decimal canonicalization: "0.5" vs "0.50"
    d = ThresholdPolicy("v1", THRESHOLD_FAMILY_CALIBRATION, {"tau": "0.50"}, {}, "fixed_alternative")
    assert d.threshold_policy_id == a.threshold_policy_id
    # content change → different id
    e = _policy("0.6", "fixed_alternative")
    assert e.threshold_policy_id != a.threshold_policy_id


def test_provenance_enum_rejected():
    with pytest.raises(ValueError):
        _policy("0.5", "auto_optimized")


def test_contract_authored_v1_artifacts_exact():
    assert COMPARISON_SPECIFICATION_V1.metric_priority == (METRIC_ACCURACY, METRIC_PRECISION, METRIC_RECALL)
    assert COMPARISON_SPECIFICATION_V1.collapsed_score is None
    assert SUPPORT_CRITERION_V1.rule == "dominates_or_equals_current_production"
    assert (SUPPORT_CRITERION_V1.min_cohort_n, SUPPORT_CRITERION_V1.min_positive,
            SUPPORT_CRITERION_V1.min_negative) == (100, 25, 25)
    assert SUPPORT_CRITERION_V1.absolute_gates == ()
    # ids deterministic + content-sensitive
    assert ComparisonSpecification("relabel", COMPARISON_SPECIFICATION_V1.metric_priority,
                                   COMPARISON_SPECIFICATION_V1.dominance_metric_ids,
                                   "threshold_policy_id").comparison_specification_id \
        == COMPARISON_SPECIFICATION_V1.comparison_specification_id      # version not in identity
    assert SupportCriterion("relabel", "dominates_or_equals_current_production", 100, 25, 25) \
        .support_criterion_id == SUPPORT_CRITERION_V1.support_criterion_id


# ── Determinism / safety ──────────────────────────────────────────────────────

def test_recommendation_id_order_and_clock_invariant():
    out1, _ = _pipeline("accepted")
    out2, _ = _pipeline("accepted")
    for pid in out1:
        assert out1[pid].recommendation_id == out2[pid].recommendation_id
    # generated_at excluded from id
    recs = _prob_records(50, 50)
    ds = _dataset(recs)
    c2 = _c2_calib(ds, _cohort_of(recs, "calibration"))
    cset = ThresholdCandidateSet("v1", (_policy("0.5", "current_production"),))
    a = build_threshold_recommendations(cset, [(c2, ds)], _spec(), generated_at="2026-01-01T00:00:00.000000Z")[0]
    b = build_threshold_recommendations(cset, [(c2, ds)], _spec(), generated_at="2099-09-09T00:00:00.000000Z")[0]
    assert a.recommendation_id == b.recommendation_id


def test_dataset_hash_mismatch_hard_fail():
    recs = _prob_records(2, 2)
    ds = _dataset(recs)
    bad = CalibrationResult(
        result_schema_version="calresult-1", family="calibration", specification_id="s",
        source_dataset_id="dataset_WRONG", source_dataset_content_hash="dataset_WRONG",
        cohort_identity=_cohort_of(recs, "calibration"), status="measured", record_counts={},
        exclusion_counts={}, metrics={}, reliability_table=None, binning_version=None,
        reliability_table_schema_version=None, sparse_flags={}, warnings=[],
        acceptance={"governance_status": "accepted"}, metadata={})
    cset_bad = ThresholdCandidateSet("v1", (_policy("0.5", "current_production"),))
    with pytest.raises(ValueError):
        build_threshold_recommendations(cset_bad, [(bad, ds)], _spec())


def test_no_c1_c2_mutation():
    recs = _prob_records(50, 50)
    ds = _dataset(recs)
    c2 = _c2_calib(ds, _cohort_of(recs, "calibration"))
    cset = ThresholdCandidateSet("v1", (_policy("0.5", "current_production"),))
    before_ds = ds.dataset_id
    before_c2 = c2.result_id
    build_threshold_recommendations(cset, [(c2, ds)], _spec())
    assert ds.dataset_id == before_ds and c2.result_id == before_c2


def test_advisory_always_true_and_no_pooling_or_activation_helper():
    import app.materiality_thresholds as t
    recs = _prob_records(50, 50)
    ds = _dataset(recs)
    c2 = _c2_calib(ds, _cohort_of(recs, "calibration"))
    cset = ThresholdCandidateSet("v1", (_policy("0.5", "current_production"),))
    for r in build_threshold_recommendations(cset, [(c2, ds)], _spec()):
        assert r.advisory is True
    names = [n for n in dir(t) if callable(getattr(t, n))]
    assert [n for n in names if any(k in n.lower()
            for k in ("activate", "write_threshold", "apply_threshold", "pool", "aggregate_recommendation"))] == []


# ==============================================================================
# Implementation-review verification pass (items 1-10).
# ==============================================================================

# 1. ThresholdPolicy identity — all canonicalization paths converge
def test_policy_identity_all_threshold_encodings_converge():
    ids = set()
    for tau in ("0.5", "0.50", "0.500000000000", Decimal("0.5")):
        p = ThresholdPolicy("v1", THRESHOLD_FAMILY_CALIBRATION, {"tau": tau}, {}, "fixed_alternative")
        ids.add(p.threshold_policy_id)
    assert len(ids) == 1                                    # every encoding → one id


def test_candidate_set_id_order_invariant():
    a = _policy("0.5", "current_production")
    b = _policy("0.3", "fixed_alternative")
    s1 = ThresholdCandidateSet("v1", (a, b))
    s2 = ThresholdCandidateSet("v1", (b, a))               # reversed
    assert s1.candidate_set_id == s2.candidate_set_id


# 2. Dataset reprojection — reconciliation, no silent skips
def test_reprojection_exclusion_counts_reconcile_with_dataset_size():
    recs = [
        _rec(uid="ok1", confidence_semantics=PROB_SEM, decision_confidence="0.8", label=True),
        _rec(uid="ok2", confidence_semantics=PROB_SEM, decision_confidence="0.2", label=False),
        _rec(uid="absent", confidence_semantics=PROB_SEM, decision_confidence=None, label=True),
        _rec(uid="sem", confidence_semantics="absent", decision_confidence="0.5", label=True),
        _rec(uid="pend", confidence_semantics=PROB_SEM, decision_confidence="0.5", label=True,
             outcome_status="pending"),
        _rec(uid="leak", confidence_semantics=PROB_SEM, decision_confidence="0.5", label=True,
             info_at="2025-01-01T00:00:00.000000Z"),
        _rec(uid="dup", confidence_semantics=PROB_SEM, decision_confidence="0.8", label=True, seq="a"),
        _rec(uid="dup", confidence_semantics=PROB_SEM, decision_confidence="0.2", label=False, seq="b"),
    ]
    pairs, excl = _reproject(recs, THRESHOLD_FAMILY_CALIBRATION, frozenset())
    assert len(pairs) + sum(excl.values()) == len(recs)    # EXACT reconciliation, no silent skip


def test_each_exclusion_code_individually_reachable():
    def one(rec):
        _, e = _reproject([rec], THRESHOLD_FAMILY_CALIBRATION, frozenset())
        return {k for k, v in e.items() if v}
    assert one(_rec(uid="a", confidence_semantics=PROB_SEM, decision_confidence=None)) == {"excl_threshold_input_absent"}
    assert one(_rec(uid="b", confidence_semantics="absent", decision_confidence="0.5")) == {"excl_threshold_input_semantics"}
    assert one(_rec(uid="c", confidence_semantics=PROB_SEM, decision_confidence="0.5",
                    outcome_status="pending")) == {"excl_pending"}
    assert one(_rec(uid="d", confidence_semantics=PROB_SEM, decision_confidence="0.5",
                    outcome_status="invalidated")) == {"excl_outcome_invalidated"}
    assert one(_rec(uid="e", confidence_semantics=PROB_SEM, decision_confidence="0.5",
                    outcome_status="unavailable")) == {"excl_outcome_unavailable"}
    assert one(_rec(uid="f", confidence_semantics=PROB_SEM, decision_confidence="0.5",
                    info_at="2020-01-01T00:00:00.000000Z")) == {"excl_future_leakage"}


# 3/4. Pareto + recommendation identity independent of candidate order
def test_recommendation_ids_and_comparison_candidate_order_invariant():
    recs = _prob_records(50, 50)
    ds = _dataset(recs)
    c2 = _c2_calib(ds, _cohort_of(recs, "calibration"))
    a, b, c = (_policy("0.5", "current_production"), _policy("0.3", "manually_authored"),
               _policy("0.1", "fixed_alternative"))
    forward = {r.threshold_policy_id: r
               for r in build_threshold_recommendations(ThresholdCandidateSet("v1", (a, b, c)),
                                                        [(c2, ds)], _spec())}
    reverse = {r.threshold_policy_id: r
               for r in build_threshold_recommendations(ThresholdCandidateSet("v1", (c, b, a)),
                                                        [(c2, ds)], _spec())}
    assert set(forward) == set(reverse)
    for pid in forward:
        assert forward[pid].recommendation_id == reverse[pid].recommendation_id   # incl comparison/tie_group


def test_dominated_by_and_tie_group_are_canonical():
    def m(a, p, r):
        return {METRIC_ACCURACY: {"metric_id": METRIC_ACCURACY, "status": "measured", "value": a},
                METRIC_PRECISION: {"metric_id": METRIC_PRECISION, "status": "measured", "value": p},
                METRIC_RECALL: {"metric_id": METRIC_RECALL, "status": "measured", "value": r}}
    scored = {"Z": m("0.9", "0.9", "0.9"), "A": m("0.9", "0.9", "0.9"), "M": m("0.5", "0.5", "0.5")}
    v1 = _compare(scored, COMPARISON_SPECIFICATION_V1)
    v2 = _compare({"M": scored["M"], "A": scored["A"], "Z": scored["Z"]}, COMPARISON_SPECIFICATION_V1)
    assert v1["M"]["tie_group"] == v2["M"]["tie_group"]                 # canonical, order-independent
    assert v1["M"]["dominated_by"] == v2["M"]["dominated_by"]
    assert [d["dominating_threshold_policy_id"] for d in v1["M"]["dominated_by"]] == ["A", "Z"]  # sorted
    assert v1["A"]["tie_group"] == ["A", "Z"]                            # sorted tie group


# 5. Current engine — empty metrics never reconstructed downstream
def test_current_engine_metrics_are_identically_empty():
    recs = [_rec(uid="e1", label=True), _rec(uid="e2", label=False)]
    ds = _dataset(recs)
    c2 = _c2_calib(ds, _cohort_of(recs, "calibration"),
                   status="unsupported_semantics_prohibited", governance="not_evaluated")
    cset = ThresholdCandidateSet("v1", (_policy("0.5", "current_production"),
                                        _policy("0.3", "fixed_alternative")))
    for r in build_threshold_recommendations(cset, [(c2, ds)], _spec()):
        assert r.recommendation_status == "not_evaluated"
        assert r.evidence_governance == "not_applicable"
        assert r.metrics == {} and r.comparison is None
        assert "confusion" not in r.metrics                             # no reconstructed metric object


# 6/7. Contract-authored v1 artifacts — byte-for-byte, no inferred defaults/gates
def test_comparison_v1_byte_for_byte():
    authored = ComparisonSpecification("thcmp-c3-v1",
                                       (METRIC_ACCURACY, METRIC_PRECISION, METRIC_RECALL),
                                       (METRIC_ACCURACY, METRIC_PRECISION, METRIC_RECALL),
                                       "threshold_policy_id", None)
    assert authored.comparison_specification_id == COMPARISON_SPECIFICATION_V1.comparison_specification_id
    assert authored == COMPARISON_SPECIFICATION_V1


def test_support_criterion_v1_no_hidden_gates():
    authored = SupportCriterion("thsc-c3-v1", "dominates_or_equals_current_production", 100, 25, 25, ())
    assert authored == SUPPORT_CRITERION_V1
    assert SUPPORT_CRITERION_V1.absolute_gates == ()                    # no absolute metric bars


# 8. Synthetic rank path never activates for real production records
def test_rank_path_inert_for_real_records_even_with_registry():
    real = [_rec(uid="r1", label=True), _rec(uid="r2", label=False)]   # materiality_rank=None, no rank_semantics_id
    pairs, excl = _reproject(real, THRESHOLD_FAMILY_DECISION_RANK, frozenset({"rank-1"}))
    assert pairs == []                                                  # never eligible
    assert excl["excl_threshold_input_semantics"] == 2                 # no rank_semantics_id attribute


# 10. C3 consumes C2/C1 ids verbatim (never normalizes)
def test_c3_consumes_c2_ids_verbatim():
    recs = _prob_records(50, 50)
    ds = _dataset(recs)
    c2 = _c2_calib(ds, _cohort_of(recs, "calibration"))
    cset = ThresholdCandidateSet("v1", (_policy("0.5", "current_production"),))
    r = build_threshold_recommendations(cset, [(c2, ds)], _spec())[0]
    assert r.source_c2_result_ids == (c2.result_id,)                   # exact C2 id, not recomputed
    assert r.source_dataset_ids == (ds.dataset_id,)
    assert r.source_dataset_content_hashes == (ds.dataset_id,)
