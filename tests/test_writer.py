"""Writer: idempotency, mutable-until-sealed updates, sealed-boundary
transitions, disabled mode, and failure behavior (never breaks the pipeline)."""

from __future__ import annotations

from datetime import datetime, timezone

import pytest

from app.institutional_memory.writer import InstitutionalMemoryWriter
from tests.conftest import FakeRepository, make_theme

T0 = datetime(2026, 7, 11, 10, 0, tzinfo=timezone.utc)
T1 = datetime(2026, 7, 11, 10, 5, tzinfo=timezone.utc)     # same UTC day
NEXT_DAY = datetime(2026, 7, 12, 0, 5, tzinfo=timezone.utc)
DAY_AFTER = datetime(2026, 7, 13, 0, 5, tzinfo=timezone.utc)


@pytest.fixture
def writer(fake_repo, enabled_settings, fresh_theme_memory):
    return InstitutionalMemoryWriter(repo_factory=lambda: fake_repo)


def test_disabled_mode_performs_no_writes(fake_repo, monkeypatch):
    from app.config import settings
    monkeypatch.setattr(settings, "institutional_memory_enabled", False)

    def exploding_factory():
        raise AssertionError("repository must not be constructed when disabled")

    w = InstitutionalMemoryWriter(repo_factory=exploding_factory)
    assert w.record_cycle([make_theme()]) is None
    assert fake_repo.snapshots == {}


def test_missing_config_reports_reason(monkeypatch):
    from app.config import settings
    from app.institutional_memory.writer import memory_config_status
    monkeypatch.setattr(settings, "institutional_memory_enabled", True)
    monkeypatch.setattr(settings, "supabase_url", "")
    assert memory_config_status() == (False, "missing_supabase_url")
    monkeypatch.setattr(settings, "supabase_url", "https://x.supabase.co")
    monkeypatch.setattr(settings, "supabase_service_role_key", "")
    assert memory_config_status() == (False, "missing_service_role_key")


def test_first_cycle_writes_one_snapshot_per_theme(writer, fake_repo):
    result = writer.record_cycle([make_theme(), make_theme(id="treasury-yield-pressure",
                                                           name="Higher-for-Longer")], now=T0)
    assert result.status == "completed"
    assert result.snapshots_inserted == 2
    assert len(fake_repo.snapshots) == 2
    assert set(fake_repo.entities) == {
        "theme:ontology:ai-energy-demand",
        "theme:ontology:treasury-yield-pressure",
    }
    run = fake_repo.runs[result.run_key]
    assert run["status"] == "completed"


def test_identical_rerun_is_skipped_not_duplicated(writer, fake_repo):
    first = writer.record_cycle([make_theme()], now=T0)
    again = writer.record_cycle([make_theme()], now=T1)   # identical state, later clock
    assert first.status == "completed"
    assert again.status == "skipped"                       # completed-run fast path
    assert again.run_key == first.run_key                  # deterministic run_key
    assert len(fake_repo.snapshots) == 1                   # still ONE snapshot


def test_changed_state_same_day_updates_in_place(writer, fake_repo):
    writer.record_cycle([make_theme(confidence=60)], now=T0)
    result = writer.record_cycle([make_theme(confidence=70)], now=T1)
    assert result.snapshots_updated == 1
    assert result.snapshots_inserted == 0
    assert len(fake_repo.snapshots) == 1                   # one row per theme per day
    row = next(iter(fake_repo.snapshots.values()))
    assert row["conviction"] == 70                          # mutable until sealed


def test_new_day_creates_new_row_and_seals_previous(writer, fake_repo):
    writer.record_cycle([make_theme(confidence=60)], now=T0)
    writer.record_cycle([make_theme(confidence=70)], now=NEXT_DAY)
    dates = sorted(r["snapshot_date"] for r in fake_repo.snapshots.values())
    assert dates == ["2026-07-11", "2026-07-12"]


def test_transitions_generated_once_at_seal_boundary(writer, fake_repo):
    writer.record_cycle([make_theme(confidence=60)], now=T0)          # day 1
    writer.record_cycle([make_theme(confidence=70)], now=NEXT_DAY)    # day 2
    # day 3: sealing day 2 compares sealed day2 (70) vs sealed day1 (60)
    writer.record_cycle([make_theme(confidence=70)], now=DAY_AFTER)
    keys = list(fake_repo.transitions)
    assert any("conviction_strengthened|2026-07-12" in k for k in keys)
    n = len(fake_repo.transitions)
    # rerun the same day — transition derivation must not duplicate
    writer._transitions_done_for = None                    # simulate process restart
    writer.record_cycle([make_theme(confidence=70)], now=DAY_AFTER)
    assert len(fake_repo.transitions) == n


def test_absence_emits_active_status_changed_once(writer, fake_repo):
    theme_a = make_theme()
    theme_b = make_theme(id="treasury-yield-pressure", name="Higher-for-Longer")
    writer.record_cycle([theme_a, theme_b], now=T0)
    writer.record_cycle([theme_a], now=NEXT_DAY)           # b goes absent on day 2
    writer.record_cycle([theme_a], now=DAY_AFTER)          # day 3 seals day 2
    absent = [r for r in fake_repo.transitions.values()
              if r["transition_type"] == "active_status_changed"
              and r["entity_uid"] == "theme:ontology:treasury-yield-pressure"]
    assert len(absent) == 1
    assert absent[0]["to_value"] == {"value": "absent"}


def test_supabase_failure_never_raises_and_is_recorded(writer, fake_repo, caplog):
    fake_repo.fail_on.add("insert_snapshot")
    result = writer.record_cycle([make_theme()], now=T0)   # must not raise
    assert result.status == "failed"
    assert result.error_count == 1
    assert "write_failed" in caplog.text
    run = fake_repo.runs[result.run_key]
    assert run["status"] == "failed"
    # next eligible cycle can retry successfully
    fake_repo.fail_on.clear()
    retry = writer.record_cycle([make_theme()], now=T1)
    assert retry.status == "completed"
    assert len(fake_repo.snapshots) == 1


def test_repo_totally_unreachable_never_raises(enabled_settings, fresh_theme_memory, caplog):
    from app.institutional_memory.repository import RepositoryError

    def dead_factory():
        raise RepositoryError("connection refused")

    w = InstitutionalMemoryWriter(repo_factory=dead_factory)
    result = w.record_cycle([make_theme()], now=T0)
    assert result.status == "failed"
    assert "write_failed" in caplog.text


def test_service_role_key_never_logged(writer, fake_repo, enabled_settings, caplog):
    fake_repo.fail_on.add("insert_snapshot")
    writer.record_cycle([make_theme()], now=T0)
    assert enabled_settings.supabase_service_role_key not in caplog.text


def test_theme_without_id_is_skipped_safely(writer, fake_repo):
    from types import SimpleNamespace
    result = writer.record_cycle([SimpleNamespace(id=None), make_theme()], now=T0)
    assert result.themes_seen == 1
    assert result.status == "completed"
