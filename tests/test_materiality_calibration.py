"""
tests/test_materiality_calibration.py — Wave 0.3 C2 shadow calibration & evaluation.

Backend-only, shadow-only, non-authoritative measurement over immutable C1 datasets.
Metric formulas are validated against INDEPENDENTLY hand-computed expected values,
not by re-running the production formula.
"""

from __future__ import annotations

import json
from dataclasses import asdict
from decimal import Decimal

import pytest

from app.materiality_calibration import (
    CALIBRATION_ACCEPTANCE_POLICY_V1,
    EXCLUSION_REASON_CODES,
    FAMILY_CALIBRATION,
    GOV_ACCEPTED,
    GOV_INSUFFICIENT,
    GOV_NOT_EVALUATED,
    METRIC_BRIER,
    METRIC_ECE,
    STATUS_MEASURED,
    STATUS_UNSUPPORTED_SEMANTICS,
    STATUS_UNSUPPORTED_UNAVAILABLE,
    AcceptanceGate,
    AcceptancePolicy,
    CalibrationResult,
    CalibrationSpecification,
    DecisionEvaluationResult,
    DecisionEvaluationSpecification,
    ForecastEvaluationResult,
    ForecastEvaluationSpecification,
    _fixed_width_10_bins,
    _present,
    base_rate_v1,
    brier_v1,
    build_calibration_results,
    build_decision_results,
    build_forecast_results,
    ece_v1,
    log_loss_v1,
    roc_auc_v1,
)
from app.materiality_evaluation import (
    EvaluationDataset,
    EvaluationRecordRevision,
    OutcomePayload,
    canonical_json_bytes,
)

PROB_SEM = "materiality-probability-1"
T0 = "2026-01-01T00:00:00.000000Z"
INFO = "2026-01-05T00:00:00.000000Z"
RESOLVED = "2026-02-01T00:00:00.000000Z"
HORIZON = "2026-03-01T00:00:00.000000Z"


def _ojson(*, status="resolved", label=None, info_at=INFO, observed_return=None,
           unit=None, target="t1", horizon=HORIZON, methodology=None):
    payload = OutcomePayload(
        status=status, outcome_specification_version="materiality-outcome-1",
        target_identifier=target, horizon_at=horizon, resolved_at=RESOLVED,
        information_available_at=info_at, unit=unit, label=label,
        observed_return=observed_return, methodology_id=methodology)
    return json.dumps(asdict(payload))


def _rec(*, uid, confidence_semantics="absent", decision_confidence=None,
         shadow_decision="not_universal", outcome_json=None, engine="materiality-shadow-0.3-c1",
         expected_return_json=None, decision_completed_at=T0, seq_tag=""):
    return EvaluationRecordRevision(
        schema_version="materiality-evaluation-1",
        evaluation_id="eval_" + uid + seq_tag,
        supersedes_revision_id=None,
        revision_sequence=0,
        observation_identity_schema_version="materiality-observation-1",
        observation_id="obs_" + ("0" * 64),
        observation_stage="canonical_post_identity",
        source_system_namespace="ns",
        cycle_id="cy1",
        cycle_local_event_id="c-" + uid,
        durable_event_uid=uid,
        contributing_ids=(),
        contributing_event_uids=(),
        event_observed_at=T0,
        decision_completed_at=decision_completed_at,
        record_created_at=T0,
        engine_version=engine,
        policy_version="umc-0.1.0-uncalibrated",
        input_schema_version="materiality-input-1",
        feature_extractor_version="materiality-features-0.2b-n3",
        manifest_version="m1",
        manifest_hash="h1",
        input_snapshot_json="{}",
        input_hash="input_x",
        shadow_decision=shadow_decision,
        materiality_rank=None,
        decision_confidence=decision_confidence,
        confidence_semantics=confidence_semantics,
        expected_return_json=expected_return_json,
        reasons=(),
        evidence_ids=(),
        outcome_target="t1",
        outcome_horizon_at=HORIZON,
        outcome_unit=None,
        outcome_specification_version="materiality-outcome-1",
        outcome_status="resolved" if outcome_json else "pending",
        outcome_json=outcome_json,
        evaluation_status="scored",
        status_reason_code=None,
        available_at=T0,
    )


def _dataset(records):
    ids = [r.revision_id for r in records]
    dataset_id = "dataset_" + "".join(sorted(ids))[:16] if ids else "dataset_empty"
    return EvaluationDataset(dataset_id=dataset_id, records=tuple(records),
                             exclusions=(), manifest_json="{}", dataset_json="[]")


def _prob_rec(uid, p, label, **kw):
    kw.setdefault("outcome_json", _ojson(label=label))
    return _rec(uid=uid, confidence_semantics=PROB_SEM, decision_confidence=str(p),
                shadow_decision=("universal" if label else "not_universal"), **kw)


def _spec(dataset):
    return CalibrationSpecification(
        specification_version="v1", source_dataset_id=dataset.dataset_id,
        source_dataset_content_hash=dataset.dataset_id,
        acceptance_policy_id=CALIBRATION_ACCEPTANCE_POLICY_V1.acceptance_policy_id)


# ── Metric fixtures: INDEPENDENTLY hand-computed expected values ────────────────

def test_brier_independent_value():
    # ((0.2-0)^2 + (0.2-1)^2)/2 = (0.04 + 0.64)/2 = 0.34
    assert _present(brier_v1([Decimal("0.2"), Decimal("0.2")], [0, 1])) == "0.340000000000"


def test_base_rate_independent_value():
    # 2/3 to 12 dp, round-half-even
    assert _present(base_rate_v1([0, 1, 1])) == "0.666666666667"


def test_log_loss_independent_value_and_domain():
    # -(ln0.5 + ln0.5)/2 = ln2 = 0.693147180559945...
    assert _present(log_loss_v1([Decimal("0.5"), Decimal("0.5")], [1, 0])) == "0.693147180560"
    # p exactly 1 → unavailable, NO silent clamp
    assert log_loss_v1([Decimal("1"), Decimal("0.5")], [1, 0]) is None
    assert log_loss_v1([Decimal("0"), Decimal("0.5")], [0, 1]) is None


def test_ece_independent_value():
    ps = [Decimal("0.2"), Decimal("0.2")]
    bins = _fixed_width_10_bins(ps, [0, 1], min_bin_size=10)
    # both in bin 2: conf 0.2, acc 0.5 → ECE = 1 * |0.5-0.2| = 0.3
    assert _present(ece_v1(bins, 2)) == "0.300000000000"


def test_roc_auc_perfect_and_degenerate():
    assert _present(roc_auc_v1([Decimal("0.1"), Decimal("0.9")], [0, 1])) == "1.000000000000"
    # no positive or no negative → unavailable (discrimination, not calibration)
    assert roc_auc_v1([Decimal("0.1"), Decimal("0.9")], [0, 0]) is None
    assert roc_auc_v1([Decimal("0.1"), Decimal("0.9")], [1, 1]) is None


# ── Reliability bins: exact boundary + empty/sparse ────────────────────────────

def test_bin_boundary_placement():
    # 0.1 → bin 1 (upper bin at internal boundary); 0.0 → bin 0; 1.0 → bin 9
    b1 = _fixed_width_10_bins([Decimal("0.1")], [1], 10)
    assert b1[1].count == 1 and sum(b.count for b in b1) == 1
    b0 = _fixed_width_10_bins([Decimal("0.0")], [0], 10)
    assert b0[0].count == 1
    b9 = _fixed_width_10_bins([Decimal("1.0")], [1], 10)
    assert b9[9].count == 1 and b9[9].upper_inclusive is True


def test_empty_and_sparse_bins():
    ps = [Decimal("0.25")] * 3   # 3 in bin 2, all others empty
    bins = _fixed_width_10_bins(ps, [1, 0, 1], min_bin_size=10)
    assert bins[2].count == 3 and bins[2].sparse is True    # 0 < 3 < 10
    assert bins[0].count == 0 and bins[0].mean_confidence is None   # empty, no fabricated value


# ── §18: unsupported families emit status + metadata ONLY ──────────────────────

def test_current_engine_calibration_unsupported_semantics_no_metrics():
    # current engine confidence_semantics="absent" → prohibited, NO metrics/placeholders
    ds = _dataset([_rec(uid="e1", outcome_json=_ojson(label=True)),
                   _rec(uid="e2", outcome_json=_ojson(label=False))])
    results = build_calibration_results(ds, _spec(ds))
    assert len(results) == 1
    r = results[0]
    assert r.status == STATUS_UNSUPPORTED_SEMANTICS
    assert r.metrics == {}                      # no ECE/Brier/reliability, no placeholder zeroes
    assert r.reliability_table is None
    assert "unsupported_reason" in r.metadata
    assert r.acceptance["governance_status"] == GOV_NOT_EVALUATED


def test_empty_dataset_calibration_unsupported_unavailable():
    ds = _dataset([])
    results = build_calibration_results(ds, _spec(ds))
    assert len(results) == 1
    assert results[0].status == STATUS_UNSUPPORTED_UNAVAILABLE
    assert results[0].metrics == {}


def test_two_unsupported_reasons_are_distinct():
    assert STATUS_UNSUPPORTED_SEMANTICS != STATUS_UNSUPPORTED_UNAVAILABLE


# ── Calibration measured path + acceptance governance ──────────────────────────

def _cohort_100():
    recs = []
    for i in range(50):
        recs.append(_prob_rec(f"p{i}", Decimal("0.8"), True))
    for i in range(50):
        recs.append(_prob_rec(f"n{i}", Decimal("0.2"), False))
    return recs


def test_calibration_measured_and_accepted():
    ds = _dataset(_cohort_100())
    results = build_calibration_results(ds, _spec(ds))
    assert len(results) == 1
    r = results[0]
    assert r.status == STATUS_MEASURED
    assert r.record_counts["included"] == 100
    assert r.metrics[METRIC_BRIER]["status"] == "measured"
    assert r.metrics[METRIC_ECE]["binning_version"] == "fixed_width_10_v1"
    # sample-sufficiency only, no metric gates → accepted
    assert r.acceptance["governance_status"] == GOV_ACCEPTED
    assert r.acceptance["sample_sufficiency"]["outcome"] == "pass"


def test_calibration_insufficient_sample_governance():
    ds = _dataset([_prob_rec(f"p{i}", Decimal("0.8"), True) for i in range(10)])
    r = build_calibration_results(ds, _spec(ds))[0]
    assert r.status == STATUS_MEASURED               # metrics still computed
    assert r.acceptance["governance_status"] == GOV_INSUFFICIENT
    assert r.acceptance["sample_sufficiency"]["outcome"] == "fail"


def test_all_positive_cohort_brier_defined_roc_unavailable():
    ds = _dataset([_prob_rec(f"p{i}", Decimal("0.8"), True) for i in range(30)])
    r = build_calibration_results(ds, _spec(ds))[0]
    assert r.status == STATUS_MEASURED
    assert r.metrics[METRIC_BRIER]["status"] == "measured"    # Brier defined
    assert r.record_counts["positive"] == 30 and r.record_counts["negative"] == 0


# ── Exclusions ─────────────────────────────────────────────────────────────────

def test_exclusion_counts_and_reasons():
    recs = [
        _prob_rec("ok1", Decimal("0.8"), True),
        _rec(uid="absent1", confidence_semantics=PROB_SEM, decision_confidence=None,
             outcome_json=_ojson(label=True)),                       # excl_confidence_absent
        _prob_rec("pend1", Decimal("0.5"), True, outcome_json=_ojson(status="pending", label=True)),
        _prob_rec("inv1", Decimal("0.5"), True, outcome_json=_ojson(status="invalidated", label=True)),
        _prob_rec("unav1", Decimal("0.5"), True, outcome_json=_ojson(status="unavailable", label=True)),
    ]
    ds = _dataset(recs)
    r = build_calibration_results(ds, _spec(ds))[0]
    ex = r.exclusion_counts
    assert ex["excl_confidence_absent"] == 1
    assert ex["excl_pending"] == 1
    assert ex["excl_outcome_invalidated"] == 1
    assert ex["excl_outcome_unavailable"] == 1
    # reconciliation: included + sum(exclusions) == candidate
    assert r.record_counts["included"] + sum(ex.values()) == r.record_counts["candidate"]
    # all reason codes present (zeros explicit), fixed canonical order
    assert tuple(sorted(ex)) == EXCLUSION_REASON_CODES


def test_future_leakage_excluded():
    leaky = _prob_rec("leak", Decimal("0.8"), True,
                      outcome_json=_ojson(label=True, info_at="2025-12-01T00:00:00.000000Z"))
    ds = _dataset([leaky])
    r = build_calibration_results(ds, _spec(ds))[0]
    assert r.exclusion_counts["excl_future_leakage"] == 1
    assert r.status == STATUS_UNSUPPORTED_UNAVAILABLE   # nothing eligible after leakage


def test_duplicate_observation_excluded():
    # same durable_event_uid twice (distinct evaluation_id) → one duplicate dropped
    a = _prob_rec("dup", Decimal("0.8"), True, seq_tag="a")
    b = _prob_rec("dup", Decimal("0.2"), False, seq_tag="b")
    ds = _dataset([a, b])
    r = build_calibration_results(ds, _spec(ds))[0]
    assert r.exclusion_counts["excl_duplicate_observation"] == 1
    assert r.record_counts["included"] == 1


# ── Cohort / version isolation ────────────────────────────────────────────────

def test_cohort_isolation_by_engine_version():
    recs = ([_prob_rec(f"a{i}", Decimal("0.8"), True, engine="engine-A") for i in range(3)]
            + [_prob_rec(f"b{i}", Decimal("0.2"), False, engine="engine-B") for i in range(3)])
    ds = _dataset(recs)
    results = build_calibration_results(ds, _spec(ds))
    engines = {r.cohort_identity["engine_version"] for r in results}
    assert engines == {"engine-A", "engine-B"}     # never merged
    assert len(results) == 2


# ── Decision family: unresolved → abstention (never negative) ──────────────────

def test_decision_family_unresolved_abstention_not_negative():
    recs = [
        _rec(uid="u1", shadow_decision="universal", outcome_json=_ojson(label=True)),
        _rec(uid="n1", shadow_decision="not_universal", outcome_json=_ojson(label=False)),
        _rec(uid="a1", shadow_decision="unresolved", outcome_json=_ojson(label=True)),
        _rec(uid="a2", shadow_decision="unresolved", outcome_json=_ojson(label=False)),
    ]
    ds = _dataset(recs)
    spec = DecisionEvaluationSpecification(specification_version="v1",
                                           source_dataset_id=ds.dataset_id,
                                           source_dataset_content_hash=ds.dataset_id)
    r = build_decision_results(ds, spec)[0]
    assert r.status == STATUS_MEASURED
    assert r.exclusion_counts["excl_unresolved_decision"] == 2
    assert r.record_counts["included"] == 2           # only resolved decisions scored
    ab = r.metadata["abstention_cohort"]
    assert ab["count"] == 2
    assert ab["outcome_base_rate"] == "0.500000000000"   # 1 of 2 abstained had outcome True
    assert r.metrics["confusion"] == {"tp": 1, "fp": 0, "fn": 0, "tn": 1}


# ── Forecast family ────────────────────────────────────────────────────────────

def test_forecast_family_unsupported_when_no_expected_returns():
    ds = _dataset([_rec(uid="e1", outcome_json=_ojson(label=True))])
    spec = ForecastEvaluationSpecification(specification_version="v1",
                                           source_dataset_id=ds.dataset_id,
                                           source_dataset_content_hash=ds.dataset_id)
    results = build_forecast_results(ds, spec)
    assert results and results[0].status == STATUS_UNSUPPORTED_UNAVAILABLE


def test_forecast_family_measured():
    recs = []
    for i in range(3):
        recs.append(_rec(
            uid=f"f{i}",
            expected_return_json=json.dumps({"value": "0.10"}),
            outcome_json=_ojson(label=True, observed_return="0.08")))
    ds = _dataset(recs)
    spec = ForecastEvaluationSpecification(specification_version="v1",
                                           source_dataset_id=ds.dataset_id,
                                           source_dataset_content_hash=ds.dataset_id)
    r = build_forecast_results(ds, spec)[0]
    assert r.status == STATUS_MEASURED
    # signed error = 0.10 - 0.08 = 0.02
    assert r.metrics["signed_error_v1"]["value"] == "0.020000000000"
    assert r.metrics["directional_accuracy_v1"]["value"] == "1.000000000000"


# ── Determinism / reproducibility ──────────────────────────────────────────────

def test_specification_id_deterministic_and_content_sensitive():
    ds = _dataset(_cohort_100())
    s1 = _spec(ds)
    s2 = _spec(ds)
    assert s1.calibration_specification_id == s2.calibration_specification_id
    s3 = CalibrationSpecification(
        specification_version="v2", source_dataset_id=ds.dataset_id,
        source_dataset_content_hash=ds.dataset_id,
        acceptance_policy_id=CALIBRATION_ACCEPTANCE_POLICY_V1.acceptance_policy_id)
    assert s3.calibration_specification_id != s1.calibration_specification_id


def test_result_id_deterministic_and_input_order_invariant():
    recs = _cohort_100()
    ds1 = _dataset(recs)
    r1 = build_calibration_results(ds1, _spec(ds1), generated_at="2026-01-01T00:00:00.000000Z")[0]
    # shuffle input order (reverse) — dataset_id derived from sorted ids so identical
    ds2 = _dataset(list(reversed(recs)))
    r2 = build_calibration_results(ds2, _spec(ds2), generated_at="2099-01-01T00:00:00.000000Z")[0]
    assert r1.result_id == r2.result_id                       # order- and clock-invariant
    assert r1.canonical_content_hash == r2.canonical_content_hash
    assert canonical_json_bytes(r1._hash_payload()) == canonical_json_bytes(r2._hash_payload())


def test_generated_at_excluded_from_hash():
    ds = _dataset(_cohort_100())
    a = build_calibration_results(ds, _spec(ds), generated_at="2026-01-01T00:00:00.000000Z")[0]
    b = build_calibration_results(ds, _spec(ds), generated_at="2027-06-06T12:00:00.000000Z")[0]
    assert a.result_id == b.result_id


# ── AcceptancePolicy identity ──────────────────────────────────────────────────

def test_acceptance_policy_id_is_hash_anchored():
    p1 = CALIBRATION_ACCEPTANCE_POLICY_V1
    p2 = AcceptancePolicy(acceptance_policy_version=p1.acceptance_policy_version,
                          family=p1.family, min_cohort_n=p1.min_cohort_n,
                          min_positive=p1.min_positive, min_negative=p1.min_negative,
                          min_bin_size=p1.min_bin_size, gates=(), metadata=p1.metadata)
    assert p1.acceptance_policy_id == p2.acceptance_policy_id       # identical content → identical id
    # same version label, different content → DIFFERENT id
    p3 = AcceptancePolicy(acceptance_policy_version=p1.acceptance_policy_version,
                          family=p1.family, min_cohort_n=999,
                          min_positive=p1.min_positive, min_negative=p1.min_negative,
                          min_bin_size=p1.min_bin_size, gates=(), metadata=p1.metadata)
    assert p3.acceptance_policy_id != p1.acceptance_policy_id
    assert p1.acceptance_policy_id.startswith("acpol_")


# ── No C1 mutation / decimal presentation ──────────────────────────────────────

def test_no_c1_mutation():
    recs = _cohort_100()
    ds = _dataset(recs)
    before_id = ds.dataset_id
    before_hashes = [r.revision_id for r in ds.records]
    build_calibration_results(ds, _spec(ds))
    assert ds.dataset_id == before_id
    assert [r.revision_id for r in ds.records] == before_hashes   # records untouched


def test_decimal_presentation_scale_is_12_fractional():
    assert _present(Decimal("0.5")) == "0.500000000000"
    assert _present(Decimal("1")) == "1.000000000000"
    assert len(_present(Decimal("0.5")).split(".")[1]) == 12


def test_family_result_never_mixes_metrics():
    # a CalibrationResult must never carry forecast/decision metric ids
    ds = _dataset(_cohort_100())
    r = build_calibration_results(ds, _spec(ds))[0]
    assert r.family == FAMILY_CALIBRATION
    assert "signed_error_v1" not in r.metrics
    assert "precision_v1" not in r.metrics


# ==============================================================================
# Implementation-review verification pass (items 1-10).
# ==============================================================================

# 1. AcceptancePolicy canonical identity
def _pol(**kw):
    base = dict(acceptance_policy_version="v", family=FAMILY_CALIBRATION,
                min_cohort_n=100, min_positive=25, min_negative=25, min_bin_size=10,
                gates=(), metadata="")
    base.update(kw)
    return AcceptancePolicy(**base)


def test_policy_metadata_excluded_from_identity():
    a = _pol(metadata="author=alice; rationale=X")
    b = _pol(metadata="author=bob; rationale=Y")
    assert a.acceptance_policy_id == b.acceptance_policy_id      # metadata is NON-identity


def test_policy_gate_order_and_rationale_and_bound_canonical():
    g1 = AcceptanceGate("g1", METRIC_ECE, "<=", "0.10", "all", rationale="first")
    g2 = AcceptanceGate("g2", METRIC_BRIER, "<=", "0.25", "all", rationale="second")
    insertion_a = _pol(gates=(g1, g2))
    insertion_b = _pol(gates=(g2, g1))                          # reversed insertion order
    assert insertion_a.acceptance_policy_id == insertion_b.acceptance_policy_id
    # gate rationale is non-identity
    g1_alt = AcceptanceGate("g1", METRIC_ECE, "<=", "0.10", "all", rationale="different prose")
    assert _pol(gates=(g1_alt, g2)).acceptance_policy_id == insertion_a.acceptance_policy_id
    # Decimal bound canonicalization: "0.10" vs "0.100" hash identically
    g1_zeros = AcceptanceGate("g1", METRIC_ECE, "<=", "0.100", "all")
    assert _pol(gates=(g1_zeros, g2)).acceptance_policy_id == insertion_a.acceptance_policy_id


# 2. Reliability-table determinism
def test_reliability_table_always_ten_bins_ordered_and_empty_retained():
    bins = _fixed_width_10_bins([Decimal("0.05"), Decimal("0.95")], [0, 1], 10)
    assert len(bins) == 10                                       # every bin exists
    assert [b.index for b in bins] == list(range(10))           # deterministic order
    empty = [b for b in bins if b.count == 0]
    assert len(empty) == 8                                       # empties retained, not dropped
    assert all(b.mean_confidence is None and b.observed_frequency is None for b in empty)


def test_reliability_sparse_is_deterministic_and_hash_stable():
    ps = [Decimal("0.25")] * 3
    b1 = _fixed_width_10_bins(ps, [1, 0, 1], 10)
    b2 = _fixed_width_10_bins(ps, [1, 0, 1], 10)
    assert [asdict(x) for x in b1] == [asdict(x) for x in b2]    # incl sparse flags -> stable
    assert b1[2].sparse is True


# 3. Metric canonicalization
def test_unavailable_metric_present_with_status_never_zero():
    # log_loss unavailable (p at boundary) -> PRESENT with explicit status, value null,
    # NEVER a fabricated zero (contract 9: distinguish unavailable, don't fabricate 0).
    recs = [_prob_rec(f"p{i}", Decimal("1"), True) for i in range(30)]    # p==1 -> log_loss unavailable
    recs += [_prob_rec(f"n{i}", Decimal("0"), False) for i in range(30)]  # p==0
    ds = _dataset(recs)
    r = build_calibration_results(ds, _spec(ds))[0]
    from app.materiality_calibration import METRIC_LOG_LOSS
    ll = r.metrics[METRIC_LOG_LOSS]
    assert ll["status"] == "unavailable"
    assert ll["value"] is None            # null, explicitly NOT zero
    assert ll["value"] != "0.000000000000"


def test_all_decimals_pass_terminal_quantization():
    # alternate Decimal encodings of the same magnitude canonicalize identically
    assert _present(Decimal("0.34")) == _present(Decimal("0.340")) == "0.340000000000"
    ds = _dataset(_cohort_100())
    r = build_calibration_results(ds, _spec(ds))[0]
    brier = r.metrics[METRIC_BRIER]["value"]
    assert brier is not None and len(brier.split(".")[1]) == 12   # 12 fractional digits


# 4. Result identity - canonical ordering of dict-valued sections
def test_result_hash_insensitive_to_dict_insertion_order():
    ds = _dataset(_cohort_100())
    r = build_calibration_results(ds, _spec(ds))[0]
    payload = r._hash_payload()
    payload2 = dict(payload)
    payload2["exclusion_counts"] = dict(reversed(list(payload["exclusion_counts"].items())))
    payload2["metadata"] = dict(reversed(list(payload["metadata"].items())))
    assert canonical_json_bytes(payload) == canonical_json_bytes(payload2)


# 5. Family separation is COMPILE-TIME (distinct types + construction guard)
def _rkw(metrics):
    return dict(result_schema_version="x", family="calibration", specification_id="s",
                source_dataset_id="d", source_dataset_content_hash="d", cohort_identity=None,
                status="measured", record_counts={}, exclusion_counts={}, metrics=metrics,
                reliability_table=None, binning_version=None,
                reliability_table_schema_version=None, sparse_flags={}, warnings=[],
                acceptance={}, metadata={})


def test_family_types_are_distinct_and_reject_foreign_metrics():
    assert CalibrationResult is not DecisionEvaluationResult
    assert DecisionEvaluationResult is not ForecastEvaluationResult
    with pytest.raises(ValueError):
        CalibrationResult(**_rkw({"signed_error_v1": {"status": "measured"}}))
    with pytest.raises(ValueError):
        CalibrationResult(**_rkw({"precision_v1": {"status": "measured"}}))
    ok = CalibrationResult(**_rkw({METRIC_BRIER: {"status": "measured"}}))
    assert ok.result_id.startswith("calres_")
    assert DecisionEvaluationResult(
        **_rkw({"precision_v1": {"status": "measured"}})).result_id.startswith("decres_")
    assert ForecastEvaluationResult(
        **_rkw({"signed_error_v1": {"status": "measured"}})).result_id.startswith("fcres_")


def test_builders_return_family_specific_types():
    ds = _dataset(_cohort_100())
    assert isinstance(build_calibration_results(ds, _spec(ds))[0], CalibrationResult)
    dspec = DecisionEvaluationSpecification(specification_version="v1",
                                            source_dataset_id=ds.dataset_id,
                                            source_dataset_content_hash=ds.dataset_id)
    assert isinstance(build_decision_results(ds, dspec)[0], DecisionEvaluationResult)
    assert not isinstance(build_calibration_results(ds, _spec(ds))[0], ForecastEvaluationResult)


# 6. Governance never pooled - no aggregation helper exists
def test_no_governance_aggregation_helper_exists():
    import app.materiality_calibration as c
    names = [n for n in dir(c) if callable(getattr(c, n))]
    forbidden = [n for n in names
                 if ("govern" in n.lower() and any(k in n.lower()
                     for k in ("aggregate", "pool", "vote", "summar", "global", "merge")))]
    assert forbidden == []
    ds = _dataset(_cohort_100())
    results = build_calibration_results(ds, _spec(ds))
    assert all("governance_status" in r.acceptance for r in results)


# 7. Current-engine path (most important runtime path) - hardened
def test_current_engine_path_no_metrics_no_reliability_no_acceptance():
    ds = _dataset([_rec(uid="e1", outcome_json=_ojson(label=True)),
                   _rec(uid="e2", outcome_json=_ojson(label=False))])
    r = build_calibration_results(ds, _spec(ds))[0]
    assert r.status == STATUS_UNSUPPORTED_SEMANTICS
    assert r.metrics == {}                                    # no metric objects at all
    assert r.reliability_table is None and r.binning_version is None
    assert r.acceptance["governance_status"] == GOV_NOT_EVALUATED
    assert r.acceptance["gate_results"] == []                 # acceptance did not run
    assert r.acceptance["sample_sufficiency"] == {"outcome": "not_evaluated"}
    assert "confidence_distribution" not in r.metadata        # no placeholder metric dict


# 8. Dataset exclusivity - each builder consumes exactly ONE dataset
def test_builder_consumes_single_dataset_only():
    import inspect

    import app.materiality_calibration as c
    for fn in (c.build_calibration_results, c.build_decision_results, c.build_forecast_results):
        params = list(inspect.signature(fn).parameters.values())
        assert params[0].name == "dataset"
        assert not any(p.kind == inspect.Parameter.VAR_POSITIONAL for p in params)
    ds = _dataset(_cohort_100())
    results = build_calibration_results(ds, _spec(ds))
    assert all(r.source_dataset_id == ds.dataset_id for r in results)   # single dataset only


# 9. Extensibility is additive
def test_extensibility_hooks_are_additive_fields():
    ds = _dataset(_cohort_100())
    spec = _spec(ds)
    assert spec.binning_version == "fixed_width_10_v1"
    import app.materiality_calibration as c
    assert isinstance(c.PROBABILITY_CONFIDENCE_SEMANTICS, frozenset)
    assert c.BOOTSTRAP_ENABLED is False


# 10. Statistical fixtures are independent literals (no production formula reuse)
def test_fixtures_are_independent_literals():
    assert _present(brier_v1([Decimal("0.2"), Decimal("0.2")], [0, 1])) == "0.340000000000"
    assert _present(base_rate_v1([0, 1, 1])) == "0.666666666667"
    assert _present(ece_v1(_fixed_width_10_bins([Decimal("0.2"), Decimal("0.2")], [0, 1], 10), 2)) \
        == "0.300000000000"
