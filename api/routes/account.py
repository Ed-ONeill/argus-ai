"""Account lifecycle — permanent, self-service account deletion (H6).

The user id comes ONLY from the verified JWT (require_user), so a caller can delete solely their
own identity; the service-role credential stays server-side in app.supabase_admin. Deletion is
immediate and irreversible — no soft-delete, no grace period. Deleting the Supabase Auth user
cascades profiles / saved_items / watchlist / user_preferences via the schema ON DELETE CASCADE.
"""
from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException, status

from app.auth import AuthedUser, require_user
from app.supabase_admin import SupabaseAdminError, delete_auth_user

log = logging.getLogger(__name__)
router = APIRouter()


@router.delete("/", status_code=status.HTTP_200_OK)
def delete_account(user: AuthedUser = Depends(require_user)) -> dict:
    """Permanently delete the authenticated caller's own account and all their per-user data."""
    # Never act on the dev/test open path's pseudo-identity — a real verified account is required.
    if not user.authenticated or not user.user_id or user.user_id == "dev-open":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account deletion requires a verified account.",
        )

    try:
        delete_auth_user(user.user_id)
    except SupabaseAdminError as exc:
        # PII-free log; surface a hard failure so the client keeps the session and never claims success.
        log.error("[account] delete failed: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Account deletion failed. No changes were made; please try again.",
        ) from exc

    return {"deleted": True}
