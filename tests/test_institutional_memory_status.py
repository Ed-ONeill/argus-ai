"""
tests/test_institutional_memory_status.py — finding 1: the institutional-memory
persistence status reported to diagnostics must distinguish DISABLED from
FAILED. record_cycle() returns None both when disabled and (historically) after
an internal backstop, so `record_cycle_status()` decides "disabled" from the
authoritative config gate — never from the return value.

Exercised at the REAL writer boundary (memory_config_status + the module-level
record_cycle singleton), not a mock of the classifier.
"""

from __future__ import annotations

from datetime import datetime, timezone

import pytest

from app.institutional_memory import record_cycle_status
from app.institutional_memory import writer as wmod
from app.institutional_memory.writer import InstitutionalMemoryWriter
from tests.conftest import make_theme

T0 = datetime(2026, 7, 28, 10, 0, tzinfo=timezone.utc)


@pytest.fixture
def bound_writer(fake_repo, monkeypatch):
    """Point the module-level singleton (which record_cycle_status uses) at the
    in-memory fake repo, so the real writer path runs without network."""
    w = InstitutionalMemoryWriter(repo_factory=lambda: fake_repo)
    monkeypatch.setattr(wmod, "institutional_memory_writer", w)
    return w


def test_truly_disabled_reports_disabled(monkeypatch, fresh_theme_memory):
    from app.config import settings
    monkeypatch.setattr(settings, "institutional_memory_enabled", False)
    # The writer must never even be consulted when config says disabled.
    def _explode(*a, **k):
        raise AssertionError("record_cycle must not run when disabled")
    monkeypatch.setattr(wmod, "record_cycle", _explode)
    assert record_cycle_status([make_theme()], now=T0) == "disabled"


def test_enabled_success_reports_completed(bound_writer, enabled_settings,
                                           fresh_theme_memory, fake_repo):
    status = record_cycle_status([make_theme()], now=T0)
    assert status == "completed"
    assert len(fake_repo.snapshots) == 1        # a real write happened


def test_enabled_real_write_failure_reports_failed(bound_writer, enabled_settings,
                                                   fresh_theme_memory, fake_repo):
    # A genuine repository failure → writer returns a result whose status is
    # "failed" → classifier reports "failed" (NOT disabled).
    fake_repo.fail_on.add("insert_snapshot")
    assert record_cycle_status([make_theme()], now=T0) == "failed"


def test_enabled_but_writer_returns_none_reports_failed(enabled_settings,
                                                        fresh_theme_memory, monkeypatch):
    # Defensive against the ambiguous contract: if an enabled writer returns
    # None (a silent internal backstop), it must read as FAILED, never disabled.
    monkeypatch.setattr(wmod, "record_cycle", lambda *a, **k: None)
    assert record_cycle_status([make_theme()], now=T0) == "failed"


def test_enabled_but_writer_raises_reports_failed(enabled_settings,
                                                  fresh_theme_memory, monkeypatch):
    def _raise(*a, **k):
        raise RuntimeError("unexpected writer explosion")
    monkeypatch.setattr(wmod, "record_cycle", _raise)
    assert record_cycle_status([make_theme()], now=T0) == "failed"


def test_enabled_malformed_result_reports_unknown_failed(enabled_settings,
                                                         fresh_theme_memory, monkeypatch):
    from types import SimpleNamespace
    # A result object with no usable status string → unknown_failed, not disabled.
    monkeypatch.setattr(wmod, "record_cycle",
                        lambda *a, **k: SimpleNamespace(status=None))
    assert record_cycle_status([make_theme()], now=T0) == "unknown_failed"


def test_writer_backstop_returns_failed_result_not_none(enabled_settings,
                                                        fresh_theme_memory, monkeypatch, caplog):
    """Contract improvement: an UNEXPECTED (non-RepositoryError) failure inside
    the locked write no longer collapses to None (which meant disabled) — the
    writer returns an explicit failed result so callers can tell them apart."""
    w = InstitutionalMemoryWriter(repo_factory=lambda: (_ for _ in ()).throw(
        RuntimeError("boom")))
    # force _record_cycle_locked to hit the top-level backstop
    monkeypatch.setattr(w, "_record_cycle_locked",
                        lambda *a, **k: (_ for _ in ()).throw(RuntimeError("kaboom")))
    result = w.record_cycle([make_theme()], now=T0)
    assert result is not None
    assert result.status == "failed"
    # and no raw exception text leaks into the recorded error
    assert all("kaboom" not in e for e in result.errors)


def test_disabled_returns_none_from_writer(monkeypatch, fresh_theme_memory, fake_repo):
    """None from the writer still means DISABLED — and only disabled."""
    from app.config import settings
    monkeypatch.setattr(settings, "institutional_memory_enabled", False)
    w = InstitutionalMemoryWriter(repo_factory=lambda: fake_repo)
    assert w.record_cycle([make_theme()], now=T0) is None
