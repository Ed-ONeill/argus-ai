"""M3.3 calibration: transparent, gated, honest about exclusions."""

from __future__ import annotations

from app.institutional_memory.outcomes import (
    VERDICT_SCORES,
    compute_calibration,
    probability_bucket,
)


def _rows(spec: dict[str, int], probability=None) -> list[dict]:
    rows = []
    for verdict, n in spec.items():
        for _ in range(n):
            rows.append({"prediction_type": "relationship_persistence",
                         "verdict": verdict, "probability": probability,
                         "score": VERDICT_SCORES[verdict], "schema_version": 1})
    return rows


def test_untested_excluded_from_confirmation_rate():
    cal = compute_calibration(_rows({"confirmed": 6, "contradicted": 2,
                                     "unresolvable_data_gap": 4}))
    assert cal["tested"] == 8
    assert cal["untested"] == 4
    assert cal["confirmation_rate_of_tested"] == 0.75      # 6/8, gaps excluded


def test_invalidated_not_counted_as_failure():
    with_inv = compute_calibration(_rows({"confirmed": 5, "contradicted": 5,
                                          "invalidated": 10}))
    assert with_inv["confirmation_rate_of_tested"] == 0.5   # invalidated excluded
    assert with_inv["invalidated_reported_separately"] == 10
    assert with_inv["by_verdict"]["invalidated"] == 10


def test_sample_gates_enforced():
    small = compute_calibration(_rows({"confirmed": 5}))
    assert small["credible"] is False
    assert "NOT met" in small["note"]
    assert small["credibility_gates"]["min_resolved_per_type"]["met"] is False

    big = compute_calibration(_rows({"confirmed": 30, "contradicted": 10}))
    assert big["credibility_gates"]["min_resolved_per_type"]["met"] is True
    assert big["credible"] is True
    assert big["note"] is None


def test_untested_rate_gate():
    cal = compute_calibration(_rows({"confirmed": 30, "contradicted": 10,
                                     "unresolvable_data_gap": 20}))
    assert cal["credibility_gates"]["max_untested_rate"]["met"] is False
    assert cal["credible"] is False


def test_probability_calibration_not_applicable_without_probabilities():
    cal = compute_calibration(_rows({"confirmed": 40}))
    assert cal["probability_buckets"] is None
    assert cal["brier_score"] is None
    assert cal["credibility_gates"]["min_per_probability_bucket"]["applicable"] is False


def test_probability_buckets_and_brier_deterministic():
    rows = (_rows({"confirmed": 8, "contradicted": 2}, probability=0.8)
            + _rows({"confirmed": 3, "contradicted": 7}, probability=0.3))
    cal = compute_calibration(rows)
    assert cal["probability_buckets"]["0.8-0.9"] == {"n": 10, "confirmed": 8}
    assert cal["probability_buckets"]["0.3-0.4"] == {"n": 10, "confirmed": 3}
    # brier = mean((p - outcome)^2): 0.8-bucket: 8*(0.04)+2*(0.64); 0.3: 3*(0.49)+7*(0.09)
    expected = (8 * 0.04 + 2 * 0.64 + 3 * 0.49 + 7 * 0.09) / 20
    assert cal["brier_score"] == round(expected, 4)


def test_probability_bucket_edges():
    assert probability_bucket(0.0) == "0.0-0.1"
    assert probability_bucket(0.05) == "0.0-0.1"
    assert probability_bucket(0.65) == "0.6-0.7"
    assert probability_bucket(1.0) == "0.9-1.0"


def test_scoring_map_never_scores_untested_as_zero():
    for verdict in ("invalidated", "unresolved", "unresolvable_data_gap",
                    "expired_without_test"):
        assert VERDICT_SCORES[verdict] is None
    assert VERDICT_SCORES["confirmed"] == 1.0
    assert VERDICT_SCORES["partially_confirmed"] == 0.5
    assert VERDICT_SCORES["contradicted"] == 0.0


def test_rules_stability_gate():
    rows = _rows({"confirmed": 30, "contradicted": 10})
    rows[0]["schema_version"] = 2
    cal = compute_calibration(rows)
    assert cal["credibility_gates"]["resolution_rules_stable"]["met"] is False
    assert cal["credible"] is False
