"""M3.2 writer stage: all record families persist, idempotency holds across
tables, sealed-boundary transitions, and M3.2 failure isolation."""

from __future__ import annotations

from datetime import datetime, timezone

import pytest

from app.institutional_memory.writer import InstitutionalMemoryWriter
from tests.conftest import make_feed, make_theme

T0 = datetime(2026, 7, 13, 10, 0, tzinfo=timezone.utc)
T1 = datetime(2026, 7, 13, 10, 5, tzinfo=timezone.utc)
NEXT_DAY = datetime(2026, 7, 14, 0, 5, tzinfo=timezone.utc)
DAY_AFTER = datetime(2026, 7, 15, 0, 5, tzinfo=timezone.utc)


@pytest.fixture
def writer(fake_repo, enabled_settings, fresh_theme_memory):
    return InstitutionalMemoryWriter(repo_factory=lambda: fake_repo)


def _cycle(writer, now, feed=None, **feed_kwargs):
    feed = feed or make_feed(**feed_kwargs)
    return writer.record_cycle(feed.theme_intelligence, now=now, feed=feed)


def test_full_cycle_writes_all_record_families(writer, fake_repo):
    result = _cycle(writer, T0)
    assert result.status == "completed"
    # themes + industries share entity_snapshots
    kinds = {r["entity_uid"].split(":")[0] for r in fake_repo.snapshots.values()}
    assert kinds == {"theme", "industry"}
    assert len(fake_repo.rel_snapshots) > 0
    assert len(fake_repo.narr_snapshots) == 1
    assert len(fake_repo.relationships) == len(fake_repo.rel_snapshots)
    # registry has companies, drivers, regime, industries, narrative
    types = {r["entity_type"] for r in fake_repo.entities.values()}
    assert {"theme", "company", "industry", "driver", "regime", "narrative"} <= types
    # run metadata carries the M3.2 counters without touching M3.1 columns
    run = fake_repo.runs[result.run_key]
    assert run["metadata"]["stage"] == "m3.2"
    assert run["metadata"]["graph_version"].startswith("gv1-")


def test_identical_rerun_skipped_across_all_tables(writer, fake_repo):
    first = _cycle(writer, T0)
    counts = (len(fake_repo.snapshots), len(fake_repo.rel_snapshots),
              len(fake_repo.narr_snapshots))
    again = _cycle(writer, T1)
    assert again.status == "skipped"
    assert again.run_key == first.run_key
    assert (len(fake_repo.snapshots), len(fake_repo.rel_snapshots),
            len(fake_repo.narr_snapshots)) == counts


def test_changed_relationship_state_updates_open_day_in_place(writer, fake_repo):
    _cycle(writer, T0)
    n_rel = len(fake_repo.rel_snapshots)
    # exposure confidence follows theme confidence → rel state changes
    themes = [make_theme(confidence=90),
              make_feed().theme_intelligence[1]]
    result = _cycle(writer, T1, feed=make_feed(themes=themes))
    assert result.status == "completed"
    assert len(fake_repo.rel_snapshots) == n_rel          # updated, not duplicated
    exp = next(r for r in fake_repo.rel_snapshots.values()
               if r["rel_uid"].endswith("exposed_to|company:ticker:NVDA"))
    assert exp["confidence"] == 0.9


def test_sealed_rows_do_not_mutate(writer, fake_repo):
    _cycle(writer, T0)
    day1 = {r["id"]: dict(r) for r in fake_repo.rel_snapshots.values()}
    _cycle(writer, NEXT_DAY, feed=make_feed(themes=[make_theme(confidence=95),
                                                    make_feed().theme_intelligence[1]]))
    for rid, before in day1.items():
        after = fake_repo.rel_snapshots[rid]
        if after["snapshot_date"] == "2026-07-13":
            assert after == before                         # sealed row untouched


def test_seal_generates_narrative_and_relationship_transitions(writer, fake_repo):
    _cycle(writer, T0)                                     # day 1: both themes
    # day 2: second theme drops out → narrative loses eligibility, rels vanish
    solo = make_feed(themes=[make_theme()])
    writer_result = writer.record_cycle(solo.theme_intelligence, now=NEXT_DAY, feed=solo)
    assert writer_result.status == "completed"
    _cycle(writer, DAY_AFTER, feed=solo)                   # day 3 seals day 2
    rel_types = {r["transition_type"] for r in fake_repo.rel_transitions.values()}
    assert "relationship_disappeared" in rel_types
    ent_types = {r["transition_type"] for r in fake_repo.transitions.values()}
    assert "narrative_disappeared" in ent_types
    # rerun after simulated restart: no duplicates anywhere
    n_rel, n_ent = len(fake_repo.rel_transitions), len(fake_repo.transitions)
    writer._transitions_done_for = None
    _cycle(writer, DAY_AFTER, feed=solo)
    assert len(fake_repo.rel_transitions) == n_rel
    assert len(fake_repo.transitions) == n_ent


def test_m32_failure_does_not_break_m31_or_raise(writer, fake_repo, caplog):
    fake_repo.fail_on.add("upsert_relationships")          # M3.2-only method
    result = _cycle(writer, T0)                            # must not raise
    assert result is not None
    assert result.status == "failed"
    # M3.1 theme snapshots are durable despite the M3.2 failure
    theme_rows = [r for r in fake_repo.snapshots.values()
                  if r["entity_uid"].startswith("theme:")]
    assert len(theme_rows) == 2
    assert len(fake_repo.rel_snapshots) == 0
    assert "m3.2" in caplog.text and "write_failed" in caplog.text
    # retry next cycle succeeds
    fake_repo.fail_on.clear()
    retry = _cycle(writer, T1)
    assert retry.status == "completed"
    assert len(fake_repo.rel_snapshots) > 0


def test_graph_derivation_failure_falls_back_to_theme_only(writer, fake_repo, caplog):
    broken_feed = object()   # build_narrative_graph will fail on attribute access
    result = writer.record_cycle([make_theme()], now=T0, feed=broken_feed)
    assert result is not None and result.status == "completed"
    assert len(fake_repo.snapshots) == 1                   # theme write happened
    assert len(fake_repo.rel_snapshots) == 0


def test_theme_only_call_still_works_without_feed(writer, fake_repo):
    result = writer.record_cycle([make_theme()], now=T0)
    assert result.status == "completed"
    assert len(fake_repo.rel_snapshots) == 0
    assert len(fake_repo.narr_snapshots) == 0
