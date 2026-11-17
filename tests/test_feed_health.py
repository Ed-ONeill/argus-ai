from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from app.feed_health import readiness, snapshot_is_stale

NOW = datetime(2026, 11, 17, 12, tzinfo=timezone.utc)


def entry(age=0, refreshing=False):
    return SimpleNamespace(generated_at=NOW - timedelta(seconds=age), is_refreshing=refreshing)


def test_age_not_just_refresh_activity_controls_freshness():
    assert not snapshot_is_stale(entry(599), now=NOW)
    assert snapshot_is_stale(entry(600), now=NOW)
    assert snapshot_is_stale(entry(86400), now=NOW)
    assert snapshot_is_stale(entry(1, True), now=NOW)


def test_disk_snapshot_does_not_prove_new_process_completed_cycle():
    status = {"refresher_thread_alive": True, "last_success_at": None}
    result = readiness(entry(60), status, now=NOW)
    assert result == {"ready": False, "reason": "awaiting_successful_cycle", "snapshot_available": True}


def test_live_cycle_and_fresh_snapshot_are_ready():
    status = {"refresher_thread_alive": True, "last_success_at": NOW.isoformat()}
    assert readiness(entry(), status, now=NOW)["ready"]
    assert readiness(entry(60, True), status, now=NOW)["ready"]
    status["refresher_thread_alive"] = False
    assert not readiness(entry(), status, now=NOW)["ready"]


def test_missing_and_future_data_are_not_fresh():
    assert snapshot_is_stale(None, now=NOW)
    assert snapshot_is_stale(entry(-120), now=NOW)
