"""M3.3 resolver: deterministic rules against sealed records, data gaps,
invalidation distinct from contradiction, idempotency, failure isolation."""

from __future__ import annotations

from datetime import datetime, timezone

import pytest

from app.institutional_memory.repository import RepositoryError
from app.institutional_memory.resolution import run_resolution
from app.institutional_memory.writer import InstitutionalMemoryWriter
from tests.conftest import make_feed, make_theme

DAY1 = datetime(2026, 7, 10, 10, 0, tzinfo=timezone.utc)   # issue (boundary=07-11)
DAY2 = datetime(2026, 7, 11, 10, 0, tzinfo=timezone.utc)   # boundary day records
DAY3 = datetime(2026, 7, 12, 6, 0, tzinfo=timezone.utc)    # boundary sealed → resolve


@pytest.fixture
def writer(fake_repo, ledger_settings, fresh_theme_memory):
    return InstitutionalMemoryWriter(repo_factory=lambda: fake_repo)


def _feed2():
    return make_feed()                                     # both themes


def _feed_solo(confidence=72):
    return make_feed(themes=[make_theme(confidence=confidence)])


def _cycle(writer, now, feed):
    return writer.record_cycle(feed.theme_intelligence, now=now, feed=feed)


def _verdicts(fake_repo, ptype):
    return {o["subject_uid"]: o["verdict"]
            for o in fake_repo.outcomes.values()
            if o["prediction_type"] == ptype}


def test_persistence_confirmed_when_state_holds(writer, fake_repo):
    _cycle(writer, DAY1, _feed2())                          # issues for boundary 07-11
    _cycle(writer, DAY2, _feed2())                          # boundary day: same state
    result = run_resolution(fake_repo, now=DAY3)
    assert result["due"] > 0 and result["unresolved"] == 0
    verdicts = {o["verdict"] for o in fake_repo.outcomes.values()}
    assert verdicts == {"confirmed"}
    # statuses updated without touching issued payloads
    for p in fake_repo.predictions.values():
        if p["issuance_boundary"] == "2026-07-10":
            assert p["status"] == "resolved"
            assert p["payload"]["issued"]["statement"]


def test_disappearance_contradicts(writer, fake_repo):
    _cycle(writer, DAY1, _feed2())
    _cycle(writer, DAY2, _feed_solo())                      # theme 2 vanishes on boundary day
    run_resolution(fake_repo, now=DAY3)
    rel = _verdicts(fake_repo, "relationship_persistence")
    # theme-2-sourced relationships disappeared while the writer was alive
    assert rel.get("theme:ontology:treasury-yield-pressure") == "contradicted"
    assert rel.get("theme:ontology:ai-energy-demand") == "confirmed"
    # narrative dissolved (needs >= 2 members) → membership contradicted
    narr = _verdicts(fake_repo, "narrative_membership")
    assert set(narr.values()) == {"contradicted"}


def test_conviction_threshold_confirmed_and_contradicted(writer, fake_repo):
    _cycle(writer, DAY1, _feed2())                          # thresholds 69 and 57
    themes = [make_theme(confidence=71),                    # >= 69 → confirmed
              make_feed().theme_intelligence[1]]
    themes[1].confidence = 40                               # < 57 → contradicted
    _cycle(writer, DAY2, make_feed(themes=themes))
    run_resolution(fake_repo, now=DAY3)
    conv = _verdicts(fake_repo, "conviction_threshold")
    assert conv["theme:ontology:ai-energy-demand"] == "confirmed"
    assert conv["theme:ontology:treasury-yield-pressure"] == "contradicted"


def test_writer_gap_is_data_gap_not_verdict(writer, fake_repo):
    _cycle(writer, DAY1, _feed2())
    # no records at all on the boundary day (writer down)
    result = run_resolution(fake_repo, now=DAY3)
    assert result["resolved"] == 0
    assert result["unresolved"] == result["due"]
    verdicts = {o["verdict"] for o in fake_repo.outcomes.values()}
    assert verdicts == {"unresolvable_data_gap"}
    for o in fake_repo.outcomes.values():
        assert o["resolution_rules"]["writer_alive_on_boundary"] is False
        assert o["score"] is None                           # never scored as zero


def test_invalidation_distinct_from_contradiction(writer, fake_repo):
    _cycle(writer, DAY1, _feed2())
    _cycle(writer, DAY2, _feed_solo())                      # theme 2 gone
    # but theme 2's identity was retired — assumption broke, not incorrectness
    fake_repo.entities["theme:ontology:treasury-yield-pressure"]["status"] = "retired"
    run_resolution(fake_repo, now=DAY3)
    by_subject = _verdicts(fake_repo, "conviction_threshold")
    assert by_subject["theme:ontology:treasury-yield-pressure"] == "invalidated"
    pred = next(p for p in fake_repo.predictions.values()
                if p["subject_uid"] == "theme:ontology:treasury-yield-pressure"
                and p["prediction_type"] == "conviction_threshold")
    assert pred["status"] == "invalidated"
    # invalidated outcomes carry no score and are not contradictions
    inv = [o for o in fake_repo.outcomes.values() if o["verdict"] == "invalidated"]
    assert inv and all(o["score"] is None for o in inv)


def test_no_future_snapshot_leaks_into_resolution(writer, fake_repo):
    _cycle(writer, DAY1, _feed2())
    _cycle(writer, DAY2, _feed2())                          # boundary day: conviction 72
    # day 3 collapse must not affect the boundary-day resolution
    collapsed = [make_theme(confidence=10), make_feed().theme_intelligence[1]]
    _cycle(writer, DAY3, make_feed(themes=collapsed))
    run_resolution(fake_repo, now=DAY3)
    conv = _verdicts(fake_repo, "conviction_threshold")
    assert conv["theme:ontology:ai-energy-demand"] == "confirmed"
    for o in fake_repo.outcomes.values():
        if o["prediction_type"] == "conviction_threshold" \
                and o["subject_uid"] == "theme:ontology:ai-energy-demand":
            assert o["observed_state"]["snapshot_date"] == "2026-07-11"


def test_unsealed_boundary_is_deferred_not_resolved(writer, fake_repo):
    _cycle(writer, DAY1, _feed2())
    # force a due prediction whose boundary is not sealed yet; clear the run
    # ledger entry the writer's own resolution pass already recorded for DAY1
    for p in fake_repo.predictions.values():
        p["resolve_after"] = DAY1.isoformat()
    fake_repo.resolution_runs.clear()
    result = run_resolution(fake_repo, now=DAY1)            # boundary 07-11 >= today 07-10
    assert result["deferred"] == result["due"] > 0
    assert fake_repo.outcomes == {}


def test_resolution_idempotent(writer, fake_repo):
    _cycle(writer, DAY1, _feed2())
    _cycle(writer, DAY2, _feed2())
    run_resolution(fake_repo, now=DAY3)
    n = len(fake_repo.outcomes)
    again = run_resolution(fake_repo, now=DAY3)             # same-day rerun: skipped
    assert again["status"] == "skipped"
    assert len(fake_repo.outcomes) == n
    # simulated retry with a fresh run key: dedup by outcome_uid + status
    del fake_repo.resolution_runs[f"resolve:v1:2026-07-12"]
    retry = run_resolution(fake_repo, now=DAY3)
    assert retry["due"] == 0                                # nothing active remains
    assert len(fake_repo.outcomes) == n


def test_resolution_failure_is_recorded_and_retryable(writer, fake_repo):
    _cycle(writer, DAY1, _feed2())
    _cycle(writer, DAY2, _feed2())
    fake_repo.fail_on.add("insert_outcomes")
    with pytest.raises(RepositoryError):
        run_resolution(fake_repo, now=DAY3)
    run_row = fake_repo.resolution_runs["resolve:v1:2026-07-12"]
    assert run_row["status"] == "failed"
    assert fake_repo.outcomes == {}
    # predictions were NOT marked resolved on partial failure
    assert all(p["status"] == "active" for p in fake_repo.predictions.values()
               if p["issuance_boundary"] == "2026-07-10")
    fake_repo.fail_on.clear()
    retry = run_resolution(fake_repo, now=DAY3)
    assert retry["status"] == "completed" and retry["resolved"] > 0


def test_writer_runs_resolver_daily_and_survives_its_failure(writer, fake_repo, caplog):
    _cycle(writer, DAY1, _feed2())
    _cycle(writer, DAY2, _feed2())
    fake_repo.fail_on.add("fetch_due_predictions")
    result = _cycle(writer, DAY3, _feed2())                 # must not raise
    assert "resolution_failed" in caplog.text
    fake_repo.fail_on.clear()
    result = _cycle(writer, datetime(2026, 7, 12, 6, 30, tzinfo=timezone.utc), _feed2())
    assert "m3_3_resolution" in result.extra
    assert result.extra["m3_3_resolution"]["resolved"] > 0
