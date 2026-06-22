"""
api/routes/memory.py — Thematic Intelligence Memory endpoints.

Read-only views over the persistent theme memory built by the background
pipeline (app/theme_memory.py). No LLM calls; every figure traces back to stored
observations / evidence. All responses are instant (in-memory store).

  GET /api/memory/ping                      health check
  GET /api/memory/themes                    UI-ready summary for every remembered theme
  GET /api/memory/changes?limit=            themes with the biggest recent change
  GET /api/memory/strengthening?limit=      themes strengthening across sessions
  GET /api/memory/weakening?limit=          themes weakening across sessions
  GET /api/memory/stale?limit=              themes not seen past the TTL
  GET /api/memory/theme/{theme_id}          full record (memory + observations + evidence)
  GET /api/memory/theme/{theme_id}/summary  UI-ready facts for one theme
  GET /api/memory/theme/{theme_id}/evidence evidence trail for one theme
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException, Query

from app import theme_memory as tm

log    = logging.getLogger(__name__)
router = APIRouter()


@router.get("/ping")
def ping() -> dict:
    return {"ok": True, "router": "memory"}


@router.get("/themes")
def list_themes() -> dict:
    """UI-ready memory summary for every remembered theme."""
    summaries = tm.get_all_summaries()
    return {"count": len(summaries), "themes": summaries}


@router.get("/changes")
def recent_changes(limit: int = Query(default=10, ge=1, le=100)) -> dict:
    return {"themes": tm.get_recent_changes(limit)}


@router.get("/strengthening")
def strengthening(limit: int = Query(default=10, ge=1, le=100)) -> dict:
    return {"themes": tm.get_strengthening(limit)}


@router.get("/weakening")
def weakening(limit: int = Query(default=10, ge=1, le=100)) -> dict:
    return {"themes": tm.get_weakening(limit)}


@router.get("/stale")
def stale(limit: int = Query(default=20, ge=1, le=200)) -> dict:
    return {"themes": tm.get_stale(limit)}


@router.get("/theme/{theme_id}")
def theme_record(theme_id: str) -> dict:
    """Full persisted record: rolling memory + observation series + evidence trail."""
    rec = tm.get_theme_memory(theme_id)
    if rec is None:
        raise HTTPException(status_code=404, detail=f"No memory for theme '{theme_id}' yet.")
    return rec


@router.get("/theme/{theme_id}/summary")
def theme_summary(theme_id: str) -> dict:
    s = tm.summarize_theme(theme_id)
    if s is None:
        raise HTTPException(status_code=404, detail=f"No memory for theme '{theme_id}' yet.")
    return s


@router.get("/theme/{theme_id}/evidence")
def theme_evidence(theme_id: str, limit: int = Query(default=30, ge=1, le=60)) -> dict:
    rec = tm.get_theme_memory(theme_id)
    if rec is None:
        raise HTTPException(status_code=404, detail=f"No memory for theme '{theme_id}' yet.")
    return {"theme_id": theme_id, "evidence": tm.get_evidence_trail(theme_id, limit)}
