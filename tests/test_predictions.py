"""M3.3 prediction ledger: admission rules, semantic identity, issuance
idempotency, once-per-boundary policy, immutability."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest

from app.institutional_memory.predictions import (
    AdmissionError,
    PredictionCandidate,
    build_prediction_row,
    prediction_uid,
    validate_candidate,
)
from app.institutional_memory.writer import InstitutionalMemoryWriter
from tests.conftest import make_feed

ISSUED = datetime(2026, 7, 13, 10, 0, tzinfo=timezone.utc)
RESOLVE = datetime(2026, 7, 15, 0, 0, tzinfo=timezone.utc)
T0 = datetime(2026, 7, 13, 10, 0, tzinfo=timezone.utc)
T1 = datetime(2026, 7, 13, 16, 0, tzinfo=timezone.utc)


def make_candidate(**overrides) -> PredictionCandidate:
    base = dict(
        subject_uid="theme:ontology:ai-energy-demand",
        prediction_type="conviction_threshold",
        scope_key="conviction",
        expected_state={"boundary_date": "2026-07-14", "conviction_gte": 69},
        issued_at=ISSUED,
        resolve_after=RESOLVE,
        resolve_before=RESOLVE + timedelta(days=7),
        horizon_label="next_daily_boundary",
        statement="Conviction is expected to remain >= 69 at the 2026-07-14 boundary.",
        assumptions=["Theme remains recordable on the boundary day."],
        invalidation_conditions=["Subject entity retired before resolution."],
        evidence_refs=["c1"],
        source_snapshot_ids=[{"table": "entity_snapshots",
                              "uid": "theme:ontology:ai-energy-demand",
                              "snapshot_date": "2026-07-13"}],
    )
    base.update(overrides)
    return PredictionCandidate(**base)


# ── Admission ───────────────────────────────────────────────────────────────────

def test_valid_candidate_admitted():
    validate_candidate(make_candidate())   # no raise


@pytest.mark.parametrize("overrides,fragment", [
    (dict(subject_uid="Nvidia"), "not canonical"),
    (dict(prediction_type="market_commentary"), "unsupported prediction type"),
    (dict(prediction_type="lifecycle_transition"), "unsupported prediction type"),
    (dict(expected_state={}), "expected_state"),
    (dict(resolve_after=None), "horizon"),
    (dict(resolve_after=ISSUED), "later than issued_at"),
    (dict(statement="  "), "statement"),
    (dict(assumptions=[]), "assumptions"),
    (dict(invalidation_conditions=[]), "invalidation"),
    (dict(invalidation_conditions=["  "]), "invalidation"),
    (dict(probability=0.7), "confidence_basis"),
    (dict(probability=1.7, confidence_basis={"method": "x"}), "within"),
])
def test_admission_rejections(overrides, fragment):
    with pytest.raises(AdmissionError) as exc_info:
        validate_candidate(make_candidate(**overrides))
    assert fragment in str(exc_info.value)


def test_vague_commentary_shape_is_inadmissible():
    # "could/may/might" prose has no testable expected state → empty state fails
    with pytest.raises(AdmissionError):
        validate_candidate(make_candidate(
            expected_state={},
            statement="AI capex could continue to pressure power markets."))


# ── Identity ────────────────────────────────────────────────────────────────────

def test_identical_semantic_prediction_same_uid():
    assert prediction_uid(make_candidate()) == prediction_uid(make_candidate())


def test_wording_only_change_does_not_change_uid():
    a = prediction_uid(make_candidate())
    b = prediction_uid(make_candidate(
        statement="Reworded: conviction should hold above 69 through 2026-07-14."))
    assert a == b


def test_material_changes_mint_new_uid():
    base = prediction_uid(make_candidate())
    assert prediction_uid(make_candidate(
        expected_state={"boundary_date": "2026-07-14", "conviction_gte": 60})) != base
    assert prediction_uid(make_candidate(
        resolve_after=RESOLVE + timedelta(days=1))) != base
    assert prediction_uid(make_candidate(
        assumptions=["A different named assumption."])) != base
    assert prediction_uid(make_candidate(
        issued_at=ISSUED + timedelta(days=1),
        resolve_after=RESOLVE + timedelta(days=1))) != base   # new boundary


def test_assumption_ordering_does_not_change_uid():
    a = prediction_uid(make_candidate(assumptions=["A one.", "B two."]))
    b = prediction_uid(make_candidate(assumptions=["B two.", "A one."]))
    assert a == b


def test_row_shape_and_uid_format():
    row = build_prediction_row(make_candidate())
    assert row["prediction_uid"].startswith("prediction:v1:")
    assert len(row["prediction_uid"]) == len("prediction:v1:") + 32
    assert row["status"] == "active"
    assert row["probability"] is None
    assert row["issuance_boundary"] == "2026-07-13"
    assert row["payload"]["issued"]["expected_state"] == row["expected_state"]
    assert row["subject_type"] == "theme"


# ── Issuance via the writer (end to end) ───────────────────────────────────────

@pytest.fixture
def writer(fake_repo, ledger_settings, fresh_theme_memory):
    return InstitutionalMemoryWriter(repo_factory=lambda: fake_repo)


def test_cycle_issues_predictions_for_enabled_types(writer, fake_repo):
    feed = make_feed()
    result = writer.record_cycle(feed.theme_intelligence, now=T0, feed=feed)
    counters = result.extra["m3_3_issuance"]
    assert counters["issued"] > 0 and counters["rejected"] == 0
    types = {p["prediction_type"] for p in fake_repo.predictions.values()}
    assert types == {"relationship_persistence", "narrative_membership",
                     "conviction_threshold"}
    # every prediction carries auditability fields
    for p in fake_repo.predictions.values():
        assert p["source_snapshot_ids"] and p["assumptions"]
        assert p["invalidation_conditions"] and p["resolve_after"]


def test_issuance_once_per_boundary_even_when_state_changes(writer, fake_repo):
    feed = make_feed()
    writer.record_cycle(feed.theme_intelligence, now=T0, feed=feed)
    n = len(fake_repo.predictions)
    # later cycle same UTC day with drifted conviction — no reissuance
    from tests.conftest import make_theme
    feed2 = make_feed(themes=[make_theme(confidence=90),
                              make_feed().theme_intelligence[1]])
    writer.record_cycle(feed2.theme_intelligence, now=T1, feed=feed2)
    assert len(fake_repo.predictions) == n


def test_issuance_retry_after_restart_does_not_duplicate(writer, fake_repo,
                                                         ledger_settings,
                                                         fresh_theme_memory):
    feed = make_feed()
    writer.record_cycle(feed.theme_intelligence, now=T0, feed=feed)
    n = len(fake_repo.predictions)
    fresh = InstitutionalMemoryWriter(repo_factory=lambda: fake_repo)   # restart
    fresh.record_cycle(feed.theme_intelligence, now=T1, feed=feed)
    assert len(fake_repo.predictions) == n


def test_issued_payload_immutable_under_status_change(writer, fake_repo):
    feed = make_feed()
    writer.record_cycle(feed.theme_intelligence, now=T0, feed=feed)
    uid, row = next(iter(fake_repo.predictions.items()))
    issued_before = dict(row["payload"]["issued"])
    expected_before = dict(row["expected_state"])
    fake_repo.update_prediction_status(uid, "resolved", T1.isoformat())
    row = fake_repo.predictions[uid]
    assert row["status"] == "resolved"
    assert row["payload"]["issued"] == issued_before
    assert row["expected_state"] == expected_before


def test_disabled_ledger_issues_nothing(fake_repo, enabled_settings,
                                        fresh_theme_memory, monkeypatch):
    monkeypatch.setattr(enabled_settings, "prediction_ledger_enabled", False)
    w = InstitutionalMemoryWriter(repo_factory=lambda: fake_repo)
    feed = make_feed()
    result = w.record_cycle(feed.theme_intelligence, now=T0, feed=feed)
    assert result.status == "completed"
    assert fake_repo.predictions == {}
    assert "m3_3_issuance" not in result.extra


def test_type_allowlist_respected(fake_repo, ledger_settings,
                                  fresh_theme_memory, monkeypatch):
    monkeypatch.setattr(ledger_settings, "prediction_types_enabled",
                        "relationship_persistence")
    w = InstitutionalMemoryWriter(repo_factory=lambda: fake_repo)
    feed = make_feed()
    w.record_cycle(feed.theme_intelligence, now=T0, feed=feed)
    types = {p["prediction_type"] for p in fake_repo.predictions.values()}
    assert types == {"relationship_persistence"}
