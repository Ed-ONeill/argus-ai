"""Bootstrap: one honest baseline per theme, idempotent, auditable,
no fabricated history."""

from __future__ import annotations

from datetime import datetime, timezone

import pytest

from app.institutional_memory.bootstrap import bootstrap_from_theme_memory
from app.institutional_memory.repository import RepositoryError
from tests.conftest import make_theme

NOW = datetime(2026, 7, 11, 15, 0, tzinfo=timezone.utc)
EARLIER = datetime(2026, 7, 10, 12, 0, tzinfo=timezone.utc)


@pytest.fixture
def seeded_memory(fresh_theme_memory):
    """ThemeMemory with two themes accrued from a simulated cycle."""
    fresh_theme_memory.update(
        [make_theme(), make_theme(id="treasury-yield-pressure", name="Higher-for-Longer")],
        clusters=[], now=EARLIER,
    )
    return fresh_theme_memory


def test_bootstrap_writes_one_baseline_per_theme(seeded_memory, fake_repo, enabled_settings):
    result = bootstrap_from_theme_memory(repo=fake_repo, now=NOW)
    assert result.status == "completed"
    assert result.snapshots_inserted == 2
    kinds = {r["snapshot_kind"] for r in fake_repo.snapshots.values()}
    assert kinds == {"bootstrap_baseline"}
    sources = {r["provenance"]["source"] for r in fake_repo.snapshots.values()}
    assert sources == {"theme_memory_bootstrap"}
    # not backdated: snapshot_date is the run date; observed_at is real last_seen
    for r in fake_repo.snapshots.values():
        assert r["snapshot_date"] == "2026-07-11"
        assert r["observed_at"].startswith("2026-07-10T12:00")
        assert r["completeness_status"] == "bootstrap"


def test_bootstrap_rerun_is_idempotent(seeded_memory, fake_repo, enabled_settings):
    first = bootstrap_from_theme_memory(repo=fake_repo, now=NOW)
    rerun = bootstrap_from_theme_memory(repo=fake_repo, now=NOW)
    assert first.snapshots_inserted == 2
    assert rerun.status in ("skipped", "completed")
    assert rerun.snapshots_inserted == 0
    assert len(fake_repo.snapshots) == 2

    # even on a later date, existing baselines are never re-minted
    later = datetime(2026, 7, 20, 15, 0, tzinfo=timezone.utc)
    again = bootstrap_from_theme_memory(repo=fake_repo, now=later)
    assert again.snapshots_inserted == 0
    assert len(fake_repo.snapshots) == 2


def test_dry_run_writes_nothing(seeded_memory, fake_repo, enabled_settings):
    result = bootstrap_from_theme_memory(dry_run=True, repo=fake_repo, now=NOW)
    assert result.status == "dry_run"
    assert result.themes_seen == 2
    assert fake_repo.snapshots == {}
    assert fake_repo.runs == {}


def test_bootstrap_requires_configuration(seeded_memory, monkeypatch):
    from app.config import settings
    monkeypatch.setattr(settings, "institutional_memory_enabled", False)
    with pytest.raises(RepositoryError):
        bootstrap_from_theme_memory()


def test_bootstrap_failure_is_loud_and_recorded(seeded_memory, fake_repo, enabled_settings):
    fake_repo.fail_on.add("insert_snapshot")
    with pytest.raises(RepositoryError):
        bootstrap_from_theme_memory(repo=fake_repo, now=NOW)
    run = next(iter(fake_repo.runs.values()))
    assert run["status"] == "failed"
