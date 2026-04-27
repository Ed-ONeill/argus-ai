"""
api/routes/saved.py — Saved/bookmarked items endpoints

In-memory store for the single-user local deployment.
Swap for a DB-backed store when multi-user support is needed.
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter()

# Module-level store: id → item payload
_saved: dict[str, dict] = {}


class SaveRequest(BaseModel):
    id:             str
    title:          str
    url:            str
    source:         str
    category:       str
    published:      str
    signal_score:   float
    summary:        str
    why_it_matters: str
    impact:         str
    snippet:        str


@router.get("/")
def list_saved() -> list[dict]:
    return list(_saved.values())


@router.post("/")
def save_item(item: SaveRequest) -> dict:
    _saved[item.id] = item.model_dump()
    return {"saved": True, "id": item.id}


@router.delete("/{item_id}/")
def delete_saved(item_id: str) -> dict:
    if item_id not in _saved:
        raise HTTPException(status_code=404, detail="Item not found")
    del _saved[item_id]
    return {"deleted": True, "id": item_id}


@router.get("/ids/")
def saved_ids() -> list[str]:
    """Fast check — returns just the IDs so cards can show saved state."""
    return list(_saved.keys())
