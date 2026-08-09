"""Server-only Supabase Admin API client.

Uses the SERVICE-ROLE key (which must NEVER reach the client) to perform privileged auth
operations. Today that is exactly one thing: permanently deleting a user's auth identity, which
cascades the per-user application tables (profiles / saved_items / watchlist / user_preferences)
via the schema's ON DELETE CASCADE from auth.users.

The service-role key stays inside this process. Callers must NOT report success unless
delete_auth_user() returns cleanly.
"""
from __future__ import annotations

import logging

import httpx

from app.config import settings

log = logging.getLogger(__name__)

_TIMEOUT = httpx.Timeout(15.0)


class SupabaseAdminError(RuntimeError):
    """Raised on any failure of a privileged admin operation. The caller must treat this as a
    hard failure and never tell the user the operation succeeded."""


def delete_auth_user(user_id: str) -> None:
    """Permanently delete a Supabase Auth user by id (immediate, irreversible).

    Deleting the auth.users row cascades all per-user application rows. Raises SupabaseAdminError
    if the admin API is not configured or the delete does not succeed. Note: Supabase refuses to
    delete a user who still owns Storage objects; the app uses no Supabase Storage today, but that
    condition would surface here as an error rather than a false success.
    """
    base = settings.supabase_url.rstrip("/")
    key = settings.supabase_service_role_key
    if not base or not key:
        raise SupabaseAdminError("Supabase admin is not configured (missing URL or service-role key).")

    url = f"{base}/auth/v1/admin/users/{user_id}"
    headers = {"apikey": key, "Authorization": f"Bearer {key}"}
    try:
        with httpx.Client(timeout=_TIMEOUT) as client:
            resp = client.delete(url, headers=headers)
    except httpx.HTTPError as exc:
        raise SupabaseAdminError(f"admin delete-user request failed: {exc}") from exc

    if resp.status_code not in (200, 204):
        # Do not log the user id / email — keep admin logs PII-free.
        raise SupabaseAdminError(f"admin delete-user returned HTTP {resp.status_code}")
