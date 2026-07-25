"""
tests/test_readiness.py — PH5 startup verification (audit C5/C6/C7).

Production fails fast on missing persistence, missing auth secret, and
Supabase migrations/RLS that were never applied; dev/test logs warnings but
never blocks. The Supabase probe is injected, so RLS/migration detection is
tested with no network.
"""

from __future__ import annotations

import pytest

from app import readiness
from app.config import settings
from app.readiness import (ReadinessError, check_auth_config,
                           check_supabase_security, run_startup_checks)

# A JWKS body that looks like this project's (ES256, one signing key).
_GOOD_JWKS = (200, '{"keys":[{"alg":"ES256","kty":"EC","use":"sig","kid":"k1"}]}')


@pytest.fixture
def prod(monkeypatch):
    monkeypatch.setattr(settings, "argus_env", "production")
    monkeypatch.setattr(settings, "argus_auth_disabled", False)
    monkeypatch.setattr(settings, "supabase_url", "https://proj.supabase.co")
    monkeypatch.setattr(settings, "supabase_anon_key", "sb_publishable_x")


def _persistent(monkeypatch, tmp_path):
    monkeypatch.setattr(readiness.storage, "DATA_DIR", tmp_path)
    monkeypatch.setattr(readiness.storage, "DATA_DIR_SOURCE", "volume")


def _all_green(**over):
    """Default injected probes for a healthy production boot."""
    kw = dict(anon_query=lambda t: (403, "permission denied for table"),
              jwks_probe=lambda u: _GOOD_JWKS)
    kw.update(over)
    return kw


# ── auth config check (JWKS reachability) ───────────────────────────────────────

def test_auth_config_ok_when_jwks_reachable(monkeypatch, prod):
    ok, _req, detail = check_auth_config(jwks_probe=lambda u: _GOOD_JWKS)
    assert ok is True and "ENFORCED" in detail


def test_auth_config_fails_when_jwks_unreachable(monkeypatch, prod):
    def boom(u): raise RuntimeError("dns fail")
    ok, req, _detail = check_auth_config(jwks_probe=boom)
    assert ok is False and req is True


def test_auth_config_fails_when_jwks_empty(monkeypatch, prod):
    ok, req, _detail = check_auth_config(jwks_probe=lambda u: (200, "{}"))
    assert ok is False and req is True


def test_auth_config_open_in_dev_without_url(monkeypatch):
    monkeypatch.setattr(settings, "argus_env", "development")
    monkeypatch.setattr(settings, "supabase_url", "")
    monkeypatch.setattr(settings, "supabase_jwt_secret", "")
    ok, req, detail = check_auth_config()
    assert ok is True and req is False and "open mode" in detail


# ── Supabase security probe classification (C7) ─────────────────────────────────

def test_probe_rls_in_force_is_ok():
    ok, _req, detail = check_supabase_security(lambda t: (403, "permission denied for table"))
    assert ok is True and "RLS in force" in detail


def test_probe_detects_missing_migrations():
    ok, _req, detail = check_supabase_security(lambda t: (404, "relation does not exist"))
    assert ok is False and "migrations NOT applied" in detail


def test_probe_detects_missing_rls_open_table():
    ok, _req, detail = check_supabase_security(lambda t: (200, "[{\"uid\":\"x\"}]"))
    assert ok is False and "RLS MISSING" in detail


def test_probe_empty_200_still_flags_rls_missing():
    # even an empty 200 means anon reached a backend table that must be revoked
    ok, _req, detail = check_supabase_security(lambda t: (200, "[]"))
    assert ok is False and "RLS MISSING" in detail


# ── production fail-fast ────────────────────────────────────────────────────────

def test_production_raises_on_missing_persistence(monkeypatch, prod):
    monkeypatch.setattr(readiness.storage, "DATA_DIR_SOURCE", "repo")  # ephemeral
    monkeypatch.setattr(readiness.storage, "is_persistent", lambda: False)
    with pytest.raises(ReadinessError, match="storage"):
        run_startup_checks(**_all_green())


def test_production_raises_on_unverifiable_auth(monkeypatch, prod, tmp_path):
    _persistent(monkeypatch, tmp_path)
    monkeypatch.setattr(settings, "supabase_url", "")   # auth would be OPEN
    with pytest.raises(ReadinessError, match="auth_config"):
        run_startup_checks(**_all_green())


def test_production_raises_on_unreachable_jwks(monkeypatch, prod, tmp_path):
    _persistent(monkeypatch, tmp_path)
    def boom(u): raise RuntimeError("dns fail")
    with pytest.raises(ReadinessError, match="auth_config"):
        run_startup_checks(**_all_green(jwks_probe=boom))


def test_production_raises_on_missing_rls(monkeypatch, prod, tmp_path):
    _persistent(monkeypatch, tmp_path)
    with pytest.raises(ReadinessError, match="supabase_security"):
        run_startup_checks(**_all_green(anon_query=lambda t: (200, "[]")))


def test_production_raises_on_missing_migrations(monkeypatch, prod, tmp_path):
    _persistent(monkeypatch, tmp_path)
    with pytest.raises(ReadinessError, match="supabase_security"):
        run_startup_checks(**_all_green(anon_query=lambda t: (404, "relation does not exist")))


def test_production_passes_when_all_green(monkeypatch, prod, tmp_path):
    _persistent(monkeypatch, tmp_path)
    report = run_startup_checks(**_all_green())
    assert report.ok and not report.required_failures


# ── dev/test never blocks ───────────────────────────────────────────────────────

def test_dev_never_raises_even_when_everything_missing(monkeypatch):
    monkeypatch.setattr(settings, "argus_env", "development")
    monkeypatch.setattr(settings, "supabase_jwt_secret", "")
    monkeypatch.setattr(settings, "supabase_url", "")
    monkeypatch.setattr(settings, "supabase_anon_key", "")
    monkeypatch.setattr(readiness.storage, "DATA_DIR_SOURCE", "repo")
    # must not raise; returns a report with non-required warnings
    report = run_startup_checks()
    assert report.ok  # no REQUIRED failures in dev
