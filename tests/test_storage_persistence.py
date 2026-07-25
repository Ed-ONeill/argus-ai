"""
tests/test_storage_persistence.py — PH1 durable storage (audit C5).

Data-dir resolution honors the Railway volume / explicit env over the
ephemeral repo fallback, persistence is reported honestly, and durable state
written under a volume dir survives a "redeploy" (a fresh process/container
pointed at the same directory).
"""

from __future__ import annotations

import importlib
from pathlib import Path

import pytest


def _reload_storage(monkeypatch, **env):
    import app.storage as storage
    for k in ("ARGUS_DATA_DIR", "RAILWAY_VOLUME_MOUNT_PATH"):
        monkeypatch.delenv(k, raising=False)
    for k, v in env.items():
        monkeypatch.setenv(k, v)
    return importlib.reload(storage)


def test_explicit_env_wins(monkeypatch, tmp_path):
    s = _reload_storage(monkeypatch, ARGUS_DATA_DIR=str(tmp_path / "vol"))
    try:
        assert s.DATA_DIR == (tmp_path / "vol").resolve()
        assert s.DATA_DIR_SOURCE == "env"
        assert s.is_persistent() is True
        assert s.LEDGER_DIR == s.DATA_DIR / "ledger"
        assert s.REGISTRY_PATH == s.DATA_DIR / "event_registry.json"
    finally:
        _reload_storage(monkeypatch)  # restore repo default for other tests


def test_railway_volume_used_when_no_explicit(monkeypatch, tmp_path):
    s = _reload_storage(monkeypatch, RAILWAY_VOLUME_MOUNT_PATH=str(tmp_path / "railway-vol"))
    try:
        assert s.DATA_DIR == (tmp_path / "railway-vol").resolve()
        assert s.DATA_DIR_SOURCE == "volume"
        assert s.is_persistent() is True
    finally:
        _reload_storage(monkeypatch)


def test_repo_fallback_is_not_persistent(monkeypatch):
    s = _reload_storage(monkeypatch)  # no env
    assert s.DATA_DIR_SOURCE == "repo"
    assert s.is_persistent() is False
    assert s.persistence_status()["persistent"] is False


def test_persistence_status_reports_writable(monkeypatch, tmp_path):
    s = _reload_storage(monkeypatch, ARGUS_DATA_DIR=str(tmp_path / "vol"))
    try:
        st = s.persistence_status()
        assert st["writable"] is True and st["persistent"] is True
        assert Path(st["data_dir"]) == (tmp_path / "vol").resolve()
    finally:
        _reload_storage(monkeypatch)


def test_durable_state_survives_redeploy_on_same_volume(monkeypatch, tmp_path):
    """A ledger written by one 'container' is read back by a fresh
    LedgerStream pointed at the same volume dir — the redeploy-survival proof."""
    from datetime import datetime, timezone
    from app.observation_ledger import LedgerStream

    vol = tmp_path / "vol" / "ledger"
    now = datetime(2026, 7, 25, 12, 0, tzinfo=timezone.utc)

    container_a = LedgerStream("identity", vol)
    container_a.append("mint", {"uid": "ev_KEEP"}, ts=now, cycle_id="c1")

    # simulate redeploy: brand-new stream object (new process) same directory
    container_b = LedgerStream("identity", vol)
    rows = [r for _, r in container_b.read_rows()]
    assert [r["uid"] for r in rows] == ["ev_KEEP"]
    # and the next append continues the sequence deterministically
    assert container_b.append("mint", {"uid": "ev_NEXT"}, ts=now, cycle_id="c2")[1] == 2
