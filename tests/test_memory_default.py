"""
tests/test_memory_default.py — OP3.3 (Sprint 2): institutional-memory default.

Contract: when the flag is not explicitly configured, it derives from
credential presence (creds → archive accrues; no creds → off, incomplete
deployments still can never write). An explicit env/kwarg value is respected,
ARGUS_MEMORY_DISABLED force-disables regardless, and enablement without
working credentials fails honestly through memory_config_status — the system
never silently claims durable memory.
"""

from __future__ import annotations

from app.config import Settings
from app.institutional_memory.writer import memory_config_status


def _settings(**kwargs) -> Settings:
    # _env_file=None keeps developer .env files out of these assertions
    return Settings(_env_file=None, **kwargs)


# ── Derived default ────────────────────────────────────────────────────────────

def test_default_on_when_credentials_present():
    s = _settings(supabase_url="https://x.supabase.co", supabase_service_role_key="k")
    assert s.institutional_memory_enabled is True


def test_default_off_without_credentials():
    assert _settings().institutional_memory_enabled is False


def test_default_off_with_partial_credentials():
    assert _settings(supabase_url="https://x.supabase.co").institutional_memory_enabled is False
    assert _settings(supabase_service_role_key="k").institutional_memory_enabled is False


# ── Explicit override behavior preserved ───────────────────────────────────────

def test_explicit_false_wins_over_credentials():
    s = _settings(supabase_url="https://x.supabase.co", supabase_service_role_key="k",
                  institutional_memory_enabled=False)
    assert s.institutional_memory_enabled is False


def test_explicit_true_is_respected_even_without_credentials():
    # ...but see test_enabled_without_credentials_fails_honestly: the writer
    # still refuses, loudly, rather than pretending to persist.
    s = _settings(institutional_memory_enabled=True)
    assert s.institutional_memory_enabled is True


def test_env_var_override_still_works(monkeypatch):
    monkeypatch.setenv("INSTITUTIONAL_MEMORY_ENABLED", "false")
    s = Settings(_env_file=None,
                 supabase_url="https://x.supabase.co", supabase_service_role_key="k")
    assert s.institutional_memory_enabled is False


# ── Escape hatch ───────────────────────────────────────────────────────────────

def test_escape_hatch_forces_off_regardless(monkeypatch):
    s = _settings(supabase_url="https://x.supabase.co", supabase_service_role_key="k",
                  institutional_memory_enabled=True, argus_memory_disabled=True)
    assert s.institutional_memory_enabled is False

    monkeypatch.setenv("ARGUS_MEMORY_DISABLED", "true")
    s2 = Settings(_env_file=None,
                  supabase_url="https://x.supabase.co", supabase_service_role_key="k")
    assert s2.institutional_memory_enabled is False


# ── Honest failure when persistence is unavailable ─────────────────────────────

def test_enabled_without_credentials_fails_honestly(monkeypatch):
    """memory_config_status is the writer's gate: flag on but creds missing →
    (False, reason). record_cycle no-ops on it and logs the reason — durable
    memory is never silently claimed."""
    import app.config as config_mod
    monkeypatch.setattr(config_mod, "settings", _settings(institutional_memory_enabled=True))
    enabled, reason = memory_config_status()
    assert enabled is False
    assert reason == "missing_supabase_url"


def test_disabled_reports_reason(monkeypatch):
    import app.config as config_mod
    monkeypatch.setattr(config_mod, "settings", _settings())
    enabled, reason = memory_config_status()
    assert enabled is False
    assert reason == "disabled_by_flag"


def test_credentialed_default_reports_enabled(monkeypatch):
    import app.config as config_mod
    monkeypatch.setattr(
        config_mod, "settings",
        _settings(supabase_url="https://x.supabase.co", supabase_service_role_key="k"),
    )
    enabled, reason = memory_config_status()
    assert enabled is True
    assert reason == "enabled"
