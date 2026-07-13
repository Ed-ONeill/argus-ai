"""Replay: latest sealed records at or before a date, no future leaks,
honest partial/empty labeling, never claims intraday precision."""

from __future__ import annotations

from datetime import datetime, timezone

import pytest

from app.institutional_memory.replay import build_historical_state
from app.institutional_memory.writer import InstitutionalMemoryWriter
from tests.conftest import make_feed, make_theme

DAY1 = datetime(2026, 7, 10, 10, 0, tzinfo=timezone.utc)
DAY2 = datetime(2026, 7, 11, 10, 0, tzinfo=timezone.utc)
DAY3 = datetime(2026, 7, 12, 10, 0, tzinfo=timezone.utc)
NOW = datetime(2026, 7, 13, 9, 0, tzinfo=timezone.utc)


@pytest.fixture
def seeded(fake_repo, enabled_settings, fresh_theme_memory):
    """Three sealed days of history with a conviction move on day 3."""
    w = InstitutionalMemoryWriter(repo_factory=lambda: fake_repo)
    for now, conf in ((DAY1, 60), (DAY2, 65), (DAY3, 90)):
        feed = make_feed(themes=[make_theme(confidence=conf),
                                 make_feed().theme_intelligence[1]])
        w.record_cycle(feed.theme_intelligence, now=now, feed=feed)
    return fake_repo


def test_reconstructs_latest_sealed_at_or_before_date(seeded):
    state = build_historical_state(seeded, "2026-07-11", now=NOW)
    theme = next(e for e in state.entities
                 if e["entity_uid"] == "theme:ontology:ai-energy-demand")
    assert theme["snapshot_date"] == "2026-07-11"
    assert theme["conviction"] == 65                       # day 2 value, not day 3
    assert state.reconstruction_kind == "daily_historical_reconstruction"
    assert state.sealed_through == "2026-07-11"
    assert len(state.narratives) == 1
    assert len(state.relationships) > 0


def test_no_future_record_leaks_into_past(seeded):
    state = build_historical_state(seeded, "2026-07-10", now=NOW)
    assert all(r["snapshot_date"] <= "2026-07-10" for r in state.entities)
    assert all(r["snapshot_date"] <= "2026-07-10" for r in state.relationships)
    assert all(r["snapshot_date"] <= "2026-07-10" for r in state.narratives)
    theme = next(e for e in state.entities
                 if e["entity_uid"] == "theme:ontology:ai-energy-demand")
    assert theme["conviction"] == 60


def test_unsealed_today_is_clamped_and_labeled(seeded):
    state = build_historical_state(seeded, "2026-07-13", now=NOW)
    assert state.sealed_through == "2026-07-12"
    assert any("not sealed yet" in n for n in state.completeness["notes"])


def test_future_date_rejected(seeded):
    with pytest.raises(ValueError):
        build_historical_state(seeded, "2027-01-01", now=NOW)


def test_empty_history_is_honest(fake_repo):
    state = build_historical_state(fake_repo, "2026-07-11", now=NOW)
    assert state.completeness["status"] == "empty"
    assert state.entities == [] and state.relationships == []
    assert state.graph_version is None


def test_daily_limitation_always_stated(seeded):
    state = build_historical_state(seeded, "2026-07-11", now=NOW)
    assert any("intraday precision is not claimed" in n
               for n in state.completeness["notes"])


def test_partial_when_relationship_history_missing(fake_repo, enabled_settings,
                                                   fresh_theme_memory):
    # theme-only history (M3.1-era): no feed passed, so no M3.2 records
    w = InstitutionalMemoryWriter(repo_factory=lambda: fake_repo)
    w.record_cycle([make_theme()], now=DAY1)
    state = build_historical_state(fake_repo, "2026-07-11", now=NOW)
    assert state.completeness["status"] == "partial"
    assert any("does not yet cover" in n for n in state.completeness["notes"])


def test_graph_version_reported_from_newest_rows(seeded):
    state = build_historical_state(seeded, "2026-07-12", now=NOW)
    assert state.graph_version and state.graph_version.startswith("gv1-")
