"""M3.4 reasoning engine: credibility gates, deterministic decomposed
similarity, honest outcome counting, no future leaks, no price claims."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest

from app.institutional_memory.reasoning import (
    ArchiveCorpus,
    EpisodeFeatures,
    _aggregate_outcomes,
    analog_credibility,
    build_historical_context,
    compute_similarity,
    episode_outcomes,
    extract_features,
)
from app.institutional_memory.writer import InstitutionalMemoryWriter
from tests.conftest import make_feed, make_theme

BASE = datetime(2026, 5, 1, 10, 0, tzinfo=timezone.utc)
ARCHIVE_DAYS = 70
NOW = BASE + timedelta(days=ARCHIVE_DAYS)          # sealed_through = day 69


def _seed_outcomes(fake_repo, n=12):
    for i in range(n):
        fake_repo.outcomes[f"outcome:v1:{i:032x}"] = {
            "outcome_uid": f"outcome:v1:{i:032x}",
            "prediction_uid": f"prediction:v1:{i:032x}",
            "subject_uid": "theme:ontology:ai-energy-demand",
            "prediction_type": "relationship_persistence",
            "verdict": "confirmed", "score": 1.0,
            "observed_at": (BASE + timedelta(days=i)).isoformat(),
            "schema_version": 1,
        }


@pytest.fixture
def archive(fake_repo, enabled_settings, fresh_theme_memory):
    """70 sealed days across two regimes, plus tested outcomes for the gate."""
    w = InstitutionalMemoryWriter(repo_factory=lambda: fake_repo)
    for i in range(ARCHIVE_DAYS):
        regime = "AI Capex Expansion" if i < 35 else "Yield Shock"
        feed = make_feed(regime=regime)
        w.record_cycle(feed.theme_intelligence, now=BASE + timedelta(days=i),
                       feed=feed)
    _seed_outcomes(fake_repo)
    return fake_repo


# ── Credibility gates ───────────────────────────────────────────────────────────

def test_insufficient_history_is_honest(fake_repo, enabled_settings, fresh_theme_memory):
    w = InstitutionalMemoryWriter(repo_factory=lambda: fake_repo)
    for i in range(5):                                  # tiny archive
        feed = make_feed()
        w.record_cycle(feed.theme_intelligence, now=BASE + timedelta(days=i), feed=feed)
    ctx = build_historical_context(fake_repo, "theme:ontology:ai-energy-demand",
                                   now=BASE + timedelta(days=6))
    assert ctx["status"] == "insufficient_history"
    assert ctx["episodes"] == [] and ctx["aggregate"] is None
    gates = ctx["credibility"]["gates"]
    assert gates["min_archive_days"]["actual"] == 5
    assert gates["min_archive_days"]["met"] is False
    assert "min_archive_days" in ctx["note"]
    assert "suppressed" in ctx["note"]


def test_outcome_gate_required_even_with_long_archive(archive):
    archive.outcomes.clear()                            # no tested outcomes
    ctx = build_historical_context(archive, "theme:ontology:ai-energy-demand", now=NOW)
    assert ctx["status"] == "insufficient_history"
    assert ctx["credibility"]["gates"]["min_tested_prediction_outcomes"]["met"] is False


def test_two_regimes_recorded_and_counted(archive):
    ctx = build_historical_context(archive, "theme:ontology:ai-energy-demand", now=NOW)
    assert ctx["credibility"]["gates"]["min_distinct_regimes"]["actual"] == 2
    assert ctx["credibility"]["met"] is True


# ── Episodes ────────────────────────────────────────────────────────────────────

def test_episodes_returned_with_decomposition_and_why(archive):
    ctx = build_historical_context(archive, "theme:ontology:ai-energy-demand", now=NOW)
    assert ctx["status"] == "ok"
    assert 1 <= len(ctx["episodes"]) <= 5
    for e in ctx["episodes"]:
        assert e["similarity"] >= 60
        assert set(e["components"]) == {"conviction_level", "trajectory",
                                        "relationships", "narratives",
                                        "transitions", "regime"}
        assert e["why"]                                  # the explanation lines
        assert e["outcomes"]["anchor_date"] == e["anchor_date"]
    sims = [e["similarity"] for e in ctx["episodes"]]
    assert sims == sorted(sims, reverse=True)


def test_current_window_never_compared_against_itself(archive):
    ctx = build_historical_context(archive, "theme:ontology:ai-energy-demand", now=NOW)
    anchor = ctx["current_state"]["anchor_date"]
    for e in ctx["episodes"]:
        if e["subject_uid"] == "theme:ontology:ai-energy-demand":
            assert e["anchor_date"] < anchor
            gap = (datetime.fromisoformat(anchor).date()
                   - datetime.fromisoformat(e["anchor_date"]).date()).days
            assert gap > 5                               # outside the window


def test_episode_horizon_fully_sealed_no_future_leak(archive):
    ctx = build_historical_context(archive, "theme:ontology:ai-energy-demand", now=NOW)
    sealed_through = datetime.fromisoformat(ctx["sealed_through"]).date()
    for e in ctx["episodes"]:
        anchor = datetime.fromisoformat(e["anchor_date"]).date()
        assert (sealed_through - anchor).days >= 10      # full horizon exists


def test_deterministic_for_fixed_archive(archive):
    a = build_historical_context(archive, "theme:ontology:ai-energy-demand", now=NOW)
    b = build_historical_context(archive, "theme:ontology:ai-energy-demand", now=NOW)
    a.pop("generated_at"), b.pop("generated_at")
    assert a == b


def test_aggregate_counts_are_n_of_m_never_bare_percentages(archive):
    ctx = build_historical_context(archive, "theme:ontology:ai-energy-demand", now=NOW)
    agg = ctx["aggregate"]
    assert agg["episode_count"] == len(ctx["episodes"])
    for item in agg["what_happened_next"]:
        assert item["episodes_observed"] <= item["episodes_total"]
        assert item["frequency"].endswith(f"of {agg['episode_count']} episodes")
    assert ctx["disclaimers"]
    assert any("not predictions" in d for d in ctx["disclaimers"])


def test_unknown_theme_reports_no_subject_history(archive):
    ctx = build_historical_context(archive, "theme:ontology:private-credit-expansion",
                                   now=NOW)
    assert ctx["status"] == "no_subject_history"
    assert ctx["episodes"] == []


# ── Similarity unit tests ───────────────────────────────────────────────────────

def _features(**overrides) -> EpisodeFeatures:
    base = dict(
        subject_uid="theme:ontology:ai-energy-demand",
        anchor_date="2026-05-20",
        conviction=72,
        deltas=[1, -1, 2],
        relationships={("supports", "out", "industry:taxonomy:utilities"),
                       ("exposed_to", "out", "company:ticker:NVDA")},
        drivers={"driver:ontology:power-load-growth"},
        transitions={"conviction_strengthened"},
        regime="regime:taxonomy:ai-capex-expansion",
        lifecycle="building",
    )
    base.update(overrides)
    return EpisodeFeatures(**base)


def test_identical_features_score_100():
    score, components, why = compute_similarity(_features(), _features())
    assert score == 100.0
    assert all(v == 100.0 for v in components.values())
    assert why


def test_regime_mismatch_lowers_score():
    full, *_ = compute_similarity(_features(), _features())
    other, components, _ = compute_similarity(
        _features(), _features(regime="regime:taxonomy:yield-shock"))
    assert components["regime"] == 0.0
    assert other < full


def test_conviction_distance_penalized():
    _, components, _ = compute_similarity(_features(), _features(conviction=52))
    assert components["conviction_level"] == 60.0        # 100 - 2*20


def test_no_evidence_components_are_null_not_inflated():
    _, components, _ = compute_similarity(
        _features(drivers=set(), transitions=set()),
        _features(drivers=set(), transitions=set()))
    assert components["narratives"] is None
    assert components["transitions"] is None


def test_incomparable_candidates_skipped():
    sparse_a = _features(conviction=None, deltas=[], drivers=set(),
                         transitions=set(), regime=None)
    sparse_b = _features(conviction=None, deltas=[], drivers=set(),
                         transitions=set(), regime=None)
    assert compute_similarity(sparse_a, sparse_b) is None


# ── Outcome unit tests ──────────────────────────────────────────────────────────

def _mini_corpus() -> ArchiveCorpus:
    theme = "theme:ontology:ai-energy-demand"
    entity_rows, rel_rows, narr_rows = [], [], []
    for i in range(15):
        d = f"2026-05-{i + 1:02d}"
        if i < 12:                                       # absent from day 13
            entity_rows.append({"entity_uid": theme, "snapshot_date": d,
                                "conviction": 60 + i, "lifecycle": "building",
                                "payload": {"state": {}}})
        entity_rows.append({"entity_uid": "industry:taxonomy:utilities",
                            "snapshot_date": d,
                            "conviction": 40 + (15 if i >= 8 else 0),
                            "payload": {"state": {}}})
        rel_rows.append({"snapshot_date": d,
                         "source_uid": "regime:taxonomy:ai-capex-expansion",
                         "target_uid": "driver:ontology:power-load-growth",
                         "relationship_type": "drives"})
    narr_rows.append({"entity_uid": "narrative:driverset:00000000deadbeef",
                      "snapshot_date": "2026-05-08", "title": "Power Demand",
                      "driver_set_key": "driver:ontology:power-load-growth",
                      "member_uids": [theme]})
    return ArchiveCorpus(entity_rows, rel_rows, narr_rows, [])


def test_episode_outcomes_duration_and_follow_ups():
    corpus = _mini_corpus()
    o = episode_outcomes(corpus, "theme:ontology:ai-energy-demand",
                         "2026-05-05", horizon=10)
    assert o["duration_days_observed"] == 8              # day 5 → day 12, absent day 13
    assert o["duration_censored"] is False
    assert o["industry_moves"]["industry:taxonomy:utilities"] == "activation_strengthened"
    assert o["narratives_emerged"][0]["title"] == "Power Demand"
    assert o["conviction_change_over_horizon"] == 7      # 71 (day 12) - 64 (day 5)


def test_censored_duration_flagged_not_averaged():
    corpus = _mini_corpus()
    live = episode_outcomes(corpus, "theme:ontology:ai-energy-demand",
                            "2026-05-01", horizon=5)
    assert live["duration_censored"] is False
    agg = _aggregate_outcomes([live, dict(live, duration_censored=True,
                                          duration_days_observed=3)])
    assert agg["censored_durations"] == 1
    assert agg["average_duration_days_observed"] == live["duration_days_observed"]


def test_gate_helper_counts():
    corpus = _mini_corpus()
    cred = analog_credibility(corpus, tested_outcome_count=3)
    assert cred["met"] is False
    assert cred["gates"]["min_archive_days"]["actual"] == 15
    assert cred["gates"]["min_distinct_regimes"]["actual"] == 1
    assert cred["gates"]["min_tested_prediction_outcomes"]["actual"] == 3


def test_extract_features_reads_recorded_state():
    corpus = _mini_corpus()
    f = extract_features(corpus, "theme:ontology:ai-energy-demand",
                         "2026-05-10", window=5)
    assert f.conviction == 69
    assert f.deltas == [1, 1, 1, 1]
    assert f.regime == "regime:taxonomy:ai-capex-expansion"
    assert "driver:ontology:power-load-growth" not in f.drivers  # narrative on 05-08 only
