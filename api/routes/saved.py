"""
api/routes/saved.py — RETIRED (PH3, audit C4).

The old implementation was a single process-global in-memory dict with no user
scoping: every user could list, overwrite, and delete every other user's saved
research (a structural IDOR). It is removed.

Saved items now live ONLY in the RLS-protected Supabase `saved_items` table,
which the frontend reads and writes directly with the user's own session
(hooks/useSaved.ts). One user's saves are invisible to another by policy
(`auth.uid() = user_id`), enforced by Postgres, not by this process.

These endpoints remain registered but hold NO state and serve NO data: they
return 410 Gone so that any forgotten caller fails loudly and safely instead of
silently sharing a global store. The router is auth-gated in api/main.py, so an
unauthenticated caller gets 401 before ever reaching the 410.
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, status

router = APIRouter()

_GONE_DETAIL = (
    "The backend saved-items store has been retired. Saved research is stored "
    "per-user in Supabase (RLS-protected) and accessed directly by the client."
)


def _gone() -> None:
    raise HTTPException(status_code=status.HTTP_410_GONE, detail=_GONE_DETAIL)


@router.get("/")
def list_saved() -> list[dict]:
    _gone()


@router.post("/")
def save_item() -> dict:
    _gone()


@router.delete("/{item_id}/")
def delete_saved(item_id: str) -> dict:
    _gone()


@router.get("/ids/")
def saved_ids() -> list[str]:
    _gone()
