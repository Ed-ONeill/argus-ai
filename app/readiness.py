"""
app/readiness.py — startup verification (PH5, audit C5/C6/C7).

Before Argus serves a single request it must confirm the production
invariants the audit found unproven: durable storage is real and writable,
the auth secret exists, required env is present, and the Supabase archive has
its migrations + RLS actually applied (not just written in a file that may
never have been pasted into the SQL editor — C7).

Two modes:
  * production (settings.is_production) — any failed REQUIRED check raises
    ReadinessError; the app refuses to boot in a partially-secure state.
  * dev/test — every check runs and is logged, but failures are warnings only,
    so local development and the test suite are never blocked.

The Supabase probe is written against an INJECTED `anon_query` callable so it
is unit-testable offline: production wires it to a real anon PostgREST GET;
tests pass a fake that simulates missing tables / open RLS.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Callable

from app import storage
from app.config import settings

log = logging.getLogger(__name__)

# A backend, market-global table that migrations 004-006 both CREATE and
# `revoke all from anon`. Probing it proves BOTH that migrations ran (the
# table exists) and that RLS/revoke is in force (anon is denied).
_LOCKED_TABLE = "entity_snapshots"


class ReadinessError(RuntimeError):
    """A required production invariant failed. Raised only in production."""


@dataclass
class CheckResult:
    name: str
    ok: bool
    required: bool
    detail: str


@dataclass
class ReadinessReport:
    results: list[CheckResult] = field(default_factory=list)

    def add(self, name: str, ok: bool, required: bool, detail: str) -> None:
        self.results.append(CheckResult(name, ok, required, detail))

    @property
    def failures(self) -> list[CheckResult]:
        return [r for r in self.results if not r.ok]

    @property
    def required_failures(self) -> list[CheckResult]:
        return [r for r in self.failures if r.required]

    @property
    def ok(self) -> bool:
        return not self.required_failures


# ── individual checks ─────────────────────────────────────────────────────────

def check_storage() -> tuple[bool, bool, str]:
    """(ok, required, detail). In production the data dir MUST be a real
    volume mount and writable — otherwise the identity journal, registry and
    theme memory are ephemeral and every deploy silently wipes them (C5)."""
    st = storage.persistence_status()
    required = settings.is_production
    if not st["writable"]:
        return False, required, f"data dir NOT writable: {st['data_dir']}"
    if required and not st["persistent"]:
        return (False, True,
                f"data dir {st['data_dir']} is the ephemeral repo fallback "
                f"(source={st['source']}); attach a Railway volume and set "
                f"ARGUS_DATA_DIR to its mount path")
    return True, required, f"{st['data_dir']} (source={st['source']}, persistent={st['persistent']})"


def check_auth_config(jwks_probe: Callable[[str], tuple[int, str]] | None = None) -> tuple[bool, bool, str]:
    """Production must be able to VERIFY tokens, not merely have a config value.
    This project signs ES256, so auth needs SUPABASE_URL and a reachable JWKS
    with >=1 signing key. An unreachable/empty JWKS would boot "healthy" and
    then reject every request — so we probe it and fail fast (C1)."""
    required = settings.is_production
    if not settings.auth_enabled:
        if required:
            return False, True, "SUPABASE_URL missing in production — backend would run UNAUTHENTICATED"
        return True, False, "auth disabled (no SUPABASE_URL) — dev/test open mode"
    url = settings.jwks_url
    if not url:
        return (not required), required, "auth enabled but no JWKS URL derivable"
    try:
        status_code, body = (jwks_probe or _real_jwks_probe)(url)
    except Exception as exc:
        return (not required), required, f"JWKS unreachable: {exc}"
    if status_code == 200 and '"keys"' in (body or "") and '"alg"' in (body or ""):
        return True, required, f"auth ENFORCED; JWKS reachable with signing keys ({url})"
    return False, required, f"JWKS probe failed (HTTP {status_code}) at {url}"


def _real_jwks_probe(url: str) -> tuple[int, str]:
    import httpx
    resp = httpx.get(url, timeout=10.0)
    return resp.status_code, resp.text


def check_required_env() -> tuple[bool, bool, str]:
    """Production needs the Supabase coordinates to verify auth and RLS."""
    required = settings.is_production
    missing = [
        name for name, val in (
            ("SUPABASE_URL", settings.supabase_url),
            ("SUPABASE_ANON_KEY", settings.supabase_anon_key),
        ) if not val
    ]
    if missing and required:
        return False, True, f"missing required env: {', '.join(missing)}"
    if missing:
        return True, False, f"absent (dev): {', '.join(missing)}"
    return True, required, "SUPABASE_URL + SUPABASE_ANON_KEY present"


def check_supabase_security(
    anon_query: Callable[[str], tuple[int, str]],
) -> tuple[bool, bool, str]:
    """Prove migrations + RLS are actually applied (C7) by issuing an ANON
    PostgREST read against a locked backend table:

      * 401/403/permission-denied  → RLS/revoke in force            (OK)
      * 404/relation-does-not-exist → migrations NOT applied         (FAIL)
      * 200 (any rows, even empty)  → anon can read a backend table  (FAIL: RLS missing)

    `anon_query(table) -> (status_code, body_text)`.
    """
    required = settings.is_production
    try:
        status_code, body = anon_query(_LOCKED_TABLE)
    except Exception as exc:
        return (not required), required, f"probe could not run: {exc}"

    low = (body or "").lower()
    if status_code in (401, 403) or "permission denied" in low:
        return True, required, f"anon denied on {_LOCKED_TABLE} (RLS in force)"
    if status_code == 404 or "does not exist" in low or "pgrst205" in low:
        return False, required, f"migrations NOT applied — {_LOCKED_TABLE} missing (HTTP {status_code})"
    if status_code == 200:
        return False, required, (
            f"RLS MISSING — anon can read {_LOCKED_TABLE} (HTTP 200); "
            f"migrations 004-006 revoke/RLS statements did not run")
    return (not required), required, f"unexpected probe result HTTP {status_code}: {low[:120]}"


def _real_anon_query(table: str) -> tuple[int, str]:
    """Live anon PostgREST GET — production wiring for check_supabase_security.

    Sends ONLY the `apikey` header. This project uses the new publishable key
    (`sb_publishable_…`), which is NOT a JWT, so an `Authorization: Bearer`
    with it would trip PostgREST's token parsing instead of exercising true
    anonymous RLS. apikey-only is the correct anonymous probe."""
    import httpx
    url = f"{settings.supabase_url.rstrip('/')}/rest/v1/{table}"
    headers = {"apikey": settings.supabase_anon_key}
    resp = httpx.get(url, headers=headers, params={"select": "*", "limit": "1"}, timeout=10.0)
    return resp.status_code, resp.text


# ── orchestration ─────────────────────────────────────────────────────────────

def run_startup_checks(
    anon_query: Callable[[str], tuple[int, str]] | None = None,
    jwks_probe: Callable[[str], tuple[int, str]] | None = None,
) -> ReadinessReport:
    """Run every check, log a clear per-line verdict, and (in production)
    raise ReadinessError if any REQUIRED check failed. Returns the report so
    callers/tests can inspect it."""
    report = ReadinessReport()

    ok, required, detail = check_storage()
    report.add("storage", ok, required, detail)
    ok, required, detail = check_auth_config(jwks_probe)
    report.add("auth_config", ok, required, detail)
    ok, required, detail = check_required_env()
    report.add("required_env", ok, required, detail)

    # Supabase security probe: only when coordinates exist (else the env check
    # already recorded the gap). Skipping is non-fatal in dev, but in
    # production the required_env failure above already trips the fail-fast.
    if settings.supabase_url and settings.supabase_anon_key:
        q = anon_query or _real_anon_query
        ok, required, detail = check_supabase_security(q)
        report.add("supabase_security", ok, required, detail)
    else:
        report.add("supabase_security", not settings.is_production, settings.is_production,
                   "skipped — SUPABASE_URL/ANON_KEY absent")

    for r in report.results:
        level = logging.INFO if r.ok else (logging.ERROR if r.required else logging.WARNING)
        log.log(level, "[readiness] %-18s %s — %s",
                r.name, "OK" if r.ok else ("FAIL" if r.required else "WARN"), r.detail)

    if settings.is_production and report.required_failures:
        summary = "; ".join(f"{r.name}: {r.detail}" for r in report.required_failures)
        raise ReadinessError(
            f"Argus refused to start — {len(report.required_failures)} required "
            f"production check(s) failed: {summary}")

    return report
