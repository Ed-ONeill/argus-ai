"""
api/routes/memory_v2.py — Institutional memory read API (M3.1).

Read-only queries over the permanent Supabase archive written by
app/institutional_memory. The frontend never talks to these tables directly —
this FastAPI surface is the only read path, and the service-role key stays
server-side.

  GET /api/memory/v2/status                          writer/archive health
  GET /api/memory/v2/themes/{theme_uid}/snapshots    historical daily snapshots
  GET /api/memory/v2/themes/{theme_uid}/transitions  transition events
  GET /api/memory/v2/themes/{theme_uid}/latest       most recent snapshot

{theme_uid} accepts either the full canonical UID (theme:ontology:<id>) or a
bare pipeline theme id. Query params: date_from / date_to (ISO dates),
limit, order (asc|desc). Errors never expose secrets or raw database
exceptions — details go to the server log only.
"""

from __future__ import annotations

import logging
import re
from datetime import date

from fastapi import APIRouter, HTTPException, Query

from app.institutional_memory import build_repository, memory_config_status
from app.institutional_memory.identity import coerce_theme_uid
from app.institutional_memory.models import WRITER_VERSION
from app.institutional_memory.repository import RepositoryError, SupabaseRepository

log = logging.getLogger(__name__)
router = APIRouter()

_DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")

_repo: SupabaseRepository | None = None


def _repository() -> SupabaseRepository:
    """Lazy read-side repository (503 when institutional memory is not configured)."""
    global _repo
    enabled, reason = memory_config_status()
    if not enabled:
        raise HTTPException(status_code=503,
                            detail=f"Institutional memory is not enabled ({reason}).")
    if _repo is None:
        _repo = build_repository()
    return _repo


def _uid_or_400(theme_uid: str) -> str:
    try:
        return coerce_theme_uid(theme_uid)
    except ValueError:
        raise HTTPException(status_code=400,
                            detail=f"Invalid theme UID: {theme_uid!r}. Expected "
                                   "theme:ontology:<id>, theme:legacy:<slug>, or a bare theme id.")


def _date_or_400(value: str | None, name: str) -> str | None:
    if value is None:
        return None
    if not _DATE_RE.match(value):
        raise HTTPException(status_code=400, detail=f"{name} must be an ISO date (YYYY-MM-DD).")
    try:
        date.fromisoformat(value)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"{name} is not a valid calendar date.")
    return value


def _guarded(fn, what: str):
    try:
        return fn()
    except RepositoryError as exc:
        log.error("[memory-v2] %s failed: %s", what, exc)
        raise HTTPException(status_code=502,
                            detail="Institutional memory archive is temporarily unavailable.")


@router.get("/status")
def status() -> dict:
    enabled, reason = memory_config_status()
    body: dict = {
        "enabled": enabled,
        "reason": reason,
        "backend_configured": reason not in ("missing_supabase_url", "missing_service_role_key"),
        "writer_version": WRITER_VERSION,
    }
    if not enabled:
        return body
    repo = _repository()

    def collect() -> dict:
        latest_run = repo.latest_run(status="completed")
        return {
            "latest_successful_run": {
                "run_key": latest_run.get("run_key"),
                "started_at": latest_run.get("started_at"),
                "completed_at": latest_run.get("completed_at"),
                "themes_seen": latest_run.get("themes_seen"),
                "snapshots_inserted": latest_run.get("snapshots_inserted"),
                "transitions_inserted": latest_run.get("transitions_inserted"),
            } if latest_run else None,
            "latest_snapshot_date": repo.latest_snapshot_date(),
            "entity_count": repo.count("institutional_entities"),
            "snapshot_count": repo.count("entity_snapshots"),
            "transition_count": repo.count("transition_events"),
            "recent_write_errors": [
                {
                    "run_key": r.get("run_key"),
                    "started_at": r.get("started_at"),
                    "error_count": r.get("error_count"),
                    "errors": r.get("errors"),
                }
                for r in repo.recent_run_errors(limit=5)
            ],
        }

    body.update(_guarded(collect, "status"))
    return body


@router.get("/themes/{theme_uid}/snapshots")
def theme_snapshots(
    theme_uid: str,
    date_from: str | None = Query(default=None),
    date_to: str | None = Query(default=None),
    limit: int = Query(default=90, ge=1, le=1000),
    order: str = Query(default="desc", pattern="^(asc|desc)$"),
) -> dict:
    uid = _uid_or_400(theme_uid)
    dfrom = _date_or_400(date_from, "date_from")
    dto = _date_or_400(date_to, "date_to")
    repo = _repository()
    rows = _guarded(
        lambda: repo.list_snapshots(uid, date_from=dfrom, date_to=dto,
                                    order_desc=(order == "desc"), limit=limit),
        "list_snapshots",
    )
    return {"theme_uid": uid, "count": len(rows), "snapshots": rows}


@router.get("/themes/{theme_uid}/transitions")
def theme_transitions(
    theme_uid: str,
    date_from: str | None = Query(default=None),
    date_to: str | None = Query(default=None),
    limit: int = Query(default=90, ge=1, le=1000),
    order: str = Query(default="desc", pattern="^(asc|desc)$"),
) -> dict:
    uid = _uid_or_400(theme_uid)
    dfrom = _date_or_400(date_from, "date_from")
    dto = _date_or_400(date_to, "date_to")
    repo = _repository()
    rows = _guarded(
        lambda: repo.list_transitions(uid, date_from=dfrom, date_to=dto,
                                      order_desc=(order == "desc"), limit=limit),
        "list_transitions",
    )
    return {"theme_uid": uid, "count": len(rows), "transitions": rows}


@router.get("/themes/{theme_uid}/latest")
def theme_latest(theme_uid: str) -> dict:
    uid = _uid_or_400(theme_uid)
    repo = _repository()
    row = _guarded(lambda: repo.latest_snapshot(uid), "latest_snapshot")
    if row is None:
        raise HTTPException(status_code=404,
                            detail=f"No institutional snapshots for {uid} yet.")
    return {"theme_uid": uid, "snapshot": row}
