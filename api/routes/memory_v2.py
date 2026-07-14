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

M3.2 additions:
  GET /api/memory/v2/entities/{uid}/snapshots        any entity's daily history
  GET /api/memory/v2/entities/{uid}/relationships    recorded relationship registry
  GET /api/memory/v2/narratives/{uid}/snapshots      narrative daily history
  GET /api/memory/v2/narratives/{uid}/transitions    narrative change ledger
  GET /api/memory/v2/relationships/{rel_uid}/snapshots
  GET /api/memory/v2/relationships/{rel_uid}/transitions
  GET /api/memory/v2/graph/at?date=YYYY-MM-DD        daily historical reconstruction

{theme_uid} accepts either the full canonical UID (theme:ontology:<id>) or a
bare pipeline theme id; entity/narrative/relationship routes take full UIDs
(URL-encode the '|' in relationship UIDs). Query params: date_from / date_to
(ISO dates), limit, order (asc|desc). Errors never expose secrets or raw
database exceptions — details go to the server log only.
"""

from __future__ import annotations

import logging
import re
from datetime import date

from fastapi import APIRouter, HTTPException, Query

from app.institutional_memory import build_repository, memory_config_status
from app.institutional_memory.identity import (
    coerce_theme_uid,
    parse_relationship_uid,
    parse_uid,
)
from app.institutional_memory.models import WRITER_VERSION
from app.institutional_memory.replay import build_historical_state
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


def _m32_counts(repo: SupabaseRepository) -> dict | None:
    """Counts for the M3.2 tables; None when they do not exist yet (migration
    005 not applied) so M3.1 status reporting is never broken."""
    try:
        return {
            "relationship_count": repo.count("institutional_relationships"),
            "relationship_snapshot_count": repo.count("relationship_snapshots"),
            "relationship_transition_count": repo.count("relationship_transitions"),
            "narrative_snapshot_count": repo.count("narrative_snapshots"),
        }
    except RepositoryError as exc:
        log.warning("[memory-v2] m3.2 tables unavailable (migration 005 pending?): %s", exc)
        return None


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
            # M3.2 tables — reported as null (not an error) until migration 005
            # is applied, so M3.1 status reporting is never broken by rollout order.
            "m3_2": _m32_counts(repo),
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


# ── M3.2: entities, narratives, relationships, replay ─────────────────────────

def _entity_uid_or_400(value: str, *, expect_type: str | None = None) -> str:
    try:
        etype, _ns, _key = parse_uid(value)
    except ValueError:
        raise HTTPException(status_code=400,
                            detail=f"Invalid entity UID: {value!r}. Expected the full "
                                   "canonical form type:namespace:key.")
    if expect_type and etype != expect_type:
        raise HTTPException(status_code=400,
                            detail=f"Expected a {expect_type} UID, got {etype!r}.")
    return value.strip()


def _rel_uid_or_400(value: str) -> str:
    try:
        parse_relationship_uid(value)
    except ValueError:
        raise HTTPException(status_code=400,
                            detail=f"Invalid relationship UID: {value!r}. Expected "
                                   "rel:{source_uid}|{type}|{target_uid} (URL-encode '|').")
    return value.strip()


@router.get("/entities/{uid}/snapshots")
def entity_snapshots(
    uid: str,
    date_from: str | None = Query(default=None),
    date_to: str | None = Query(default=None),
    limit: int = Query(default=90, ge=1, le=1000),
    order: str = Query(default="desc", pattern="^(asc|desc)$"),
) -> dict:
    entity_uid = _entity_uid_or_400(uid)
    dfrom, dto = _date_or_400(date_from, "date_from"), _date_or_400(date_to, "date_to")
    repo = _repository()
    rows = _guarded(
        lambda: repo.list_snapshots(entity_uid, date_from=dfrom, date_to=dto,
                                    order_desc=(order == "desc"), limit=limit),
        "entity list_snapshots",
    )
    return {"entity_uid": entity_uid, "count": len(rows), "snapshots": rows}


@router.get("/entities/{uid}/relationships")
def entity_relationships(uid: str,
                         limit: int = Query(default=200, ge=1, le=1000)) -> dict:
    entity_uid = _entity_uid_or_400(uid)
    repo = _repository()
    rows = _guarded(lambda: repo.relationships_for_entity(entity_uid, limit=limit),
                    "relationships_for_entity")
    return {"entity_uid": entity_uid, "count": len(rows), "relationships": rows}


@router.get("/narratives/{uid}/snapshots")
def narrative_snapshots(
    uid: str,
    date_from: str | None = Query(default=None),
    date_to: str | None = Query(default=None),
    limit: int = Query(default=90, ge=1, le=1000),
    order: str = Query(default="desc", pattern="^(asc|desc)$"),
) -> dict:
    narrative_uid = _entity_uid_or_400(uid, expect_type="narrative")
    dfrom, dto = _date_or_400(date_from, "date_from"), _date_or_400(date_to, "date_to")
    repo = _repository()
    rows = _guarded(
        lambda: repo.list_table_snapshots("narrative_snapshots", "entity_uid",
                                          narrative_uid, date_from=dfrom, date_to=dto,
                                          order_desc=(order == "desc"), limit=limit),
        "narrative list_snapshots",
    )
    return {"narrative_uid": narrative_uid, "count": len(rows), "snapshots": rows}


@router.get("/narratives/{uid}/transitions")
def narrative_transitions(
    uid: str,
    date_from: str | None = Query(default=None),
    date_to: str | None = Query(default=None),
    limit: int = Query(default=90, ge=1, le=1000),
    order: str = Query(default="desc", pattern="^(asc|desc)$"),
) -> dict:
    narrative_uid = _entity_uid_or_400(uid, expect_type="narrative")
    dfrom, dto = _date_or_400(date_from, "date_from"), _date_or_400(date_to, "date_to")
    repo = _repository()
    rows = _guarded(
        lambda: repo.list_transitions(narrative_uid, date_from=dfrom, date_to=dto,
                                      order_desc=(order == "desc"), limit=limit),
        "narrative list_transitions",
    )
    return {"narrative_uid": narrative_uid, "count": len(rows), "transitions": rows}


@router.get("/relationships/{rel_uid}/snapshots")
def relationship_snapshots(
    rel_uid: str,
    date_from: str | None = Query(default=None),
    date_to: str | None = Query(default=None),
    limit: int = Query(default=90, ge=1, le=1000),
    order: str = Query(default="desc", pattern="^(asc|desc)$"),
) -> dict:
    uid = _rel_uid_or_400(rel_uid)
    dfrom, dto = _date_or_400(date_from, "date_from"), _date_or_400(date_to, "date_to")
    repo = _repository()
    rows = _guarded(
        lambda: repo.list_table_snapshots("relationship_snapshots", "rel_uid", uid,
                                          date_from=dfrom, date_to=dto,
                                          order_desc=(order == "desc"), limit=limit),
        "relationship list_snapshots",
    )
    return {"rel_uid": uid, "count": len(rows), "snapshots": rows}


@router.get("/relationships/{rel_uid}/transitions")
def relationship_transitions(
    rel_uid: str,
    date_from: str | None = Query(default=None),
    date_to: str | None = Query(default=None),
    limit: int = Query(default=90, ge=1, le=1000),
    order: str = Query(default="desc", pattern="^(asc|desc)$"),
) -> dict:
    uid = _rel_uid_or_400(rel_uid)
    dfrom, dto = _date_or_400(date_from, "date_from"), _date_or_400(date_to, "date_to")
    repo = _repository()
    rows = _guarded(
        lambda: repo.list_table_transitions("relationship_transitions", "rel_uid", uid,
                                            date_from=dfrom, date_to=dto,
                                            order_desc=(order == "desc"), limit=limit),
        "relationship list_transitions",
    )
    return {"rel_uid": uid, "count": len(rows), "transitions": rows}


# ── M3.4: institutional reasoning (read-only, gated) ──────────────────────────

@router.get("/themes/{theme_uid}/historical-context")
def theme_historical_context(
    theme_uid: str,
    window: int = Query(default=5, ge=2, le=30),
    horizon: int = Query(default=10, ge=1, le=30),
    limit: int = Query(default=5, ge=1, le=10),
) -> dict:
    """Similar historical episodes + what happened next, computed from sealed
    institutional records only. Returns status=insufficient_history (with the
    exact gate shortfalls) until the pre-registered credibility gates pass —
    analog output is suppressed, never estimated."""
    from app.institutional_memory.reasoning import build_historical_context
    uid = _uid_or_400(theme_uid)
    repo = _repository()
    return _guarded(
        lambda: build_historical_context(repo, uid, window=window,
                                         horizon=horizon, max_episodes=limit),
        "historical_context",
    )


# ── M3.3: prediction & outcome ledger (read-only) ─────────────────────────────

_PREDICTION_UID_RE = re.compile(r"^prediction:v1:[0-9a-f]{32}$")

_SUPPORTED_PREDICTION_TYPES = {"relationship_persistence", "narrative_membership",
                               "conviction_threshold"}
_VERDICTS = {"confirmed", "partially_confirmed", "contradicted", "invalidated",
             "unresolved", "unresolvable_data_gap", "expired_without_test"}
_STATUSES = {"active", "pending_resolution", "resolved", "expired_unresolved",
             "invalidated", "withdrawn_due_to_data_error"}


def _prediction_uid_or_400(value: str) -> str:
    if not _PREDICTION_UID_RE.match((value or "").strip()):
        raise HTTPException(status_code=400,
                            detail=f"Invalid prediction UID: {value!r}. "
                                   "Expected prediction:v1:<32 hex>.")
    return value.strip()


def _enum_or_400(value: str | None, allowed: set[str], name: str) -> str | None:
    if value is not None and value not in allowed:
        raise HTTPException(status_code=400,
                            detail=f"Invalid {name}: {value!r}. Allowed: {sorted(allowed)}.")
    return value


@router.get("/predictions")
def list_predictions(
    subject_uid: str | None = Query(default=None),
    prediction_type: str | None = Query(default=None),
    status_filter: str | None = Query(default=None, alias="status"),
    date_from: str | None = Query(default=None),
    date_to: str | None = Query(default=None),
    limit: int = Query(default=90, ge=1, le=1000),
    order: str = Query(default="desc", pattern="^(asc|desc)$"),
) -> dict:
    subject = _entity_uid_or_400(subject_uid) if subject_uid else None
    ptype = _enum_or_400(prediction_type, _SUPPORTED_PREDICTION_TYPES, "prediction_type")
    pstatus = _enum_or_400(status_filter, _STATUSES, "status")
    dfrom, dto = _date_or_400(date_from, "date_from"), _date_or_400(date_to, "date_to")
    repo = _repository()
    rows = _guarded(
        lambda: repo.list_predictions(subject_uid=subject, prediction_type=ptype,
                                      status=pstatus, date_from=dfrom, date_to=dto,
                                      order_desc=(order == "desc"), limit=limit),
        "list_predictions",
    )
    return {"count": len(rows), "predictions": rows}


@router.get("/predictions/{prediction_uid}")
def get_prediction(prediction_uid: str) -> dict:
    uid = _prediction_uid_or_400(prediction_uid)
    repo = _repository()
    row = _guarded(lambda: repo.get_prediction(uid), "get_prediction")
    if row is None:
        raise HTTPException(status_code=404, detail=f"No prediction {uid}.")
    return {"prediction": row}


@router.get("/predictions/{prediction_uid}/outcome")
def get_prediction_outcome(prediction_uid: str) -> dict:
    uid = _prediction_uid_or_400(prediction_uid)
    repo = _repository()
    row = _guarded(lambda: repo.get_outcome_for_prediction(uid), "get_outcome")
    if row is None:
        raise HTTPException(status_code=404,
                            detail=f"No outcome for {uid} yet (unresolved or not due).")
    return {"outcome": row}


@router.get("/entities/{uid}/predictions")
def entity_predictions(
    uid: str,
    limit: int = Query(default=90, ge=1, le=1000),
    order: str = Query(default="desc", pattern="^(asc|desc)$"),
) -> dict:
    entity_uid = _entity_uid_or_400(uid)
    repo = _repository()
    rows = _guarded(
        lambda: repo.list_predictions(subject_uid=entity_uid,
                                      order_desc=(order == "desc"), limit=limit),
        "entity list_predictions",
    )
    return {"entity_uid": entity_uid, "count": len(rows), "predictions": rows}


@router.get("/outcomes")
def list_outcomes(
    prediction_type: str | None = Query(default=None),
    verdict: str | None = Query(default=None),
    subject_uid: str | None = Query(default=None),
    limit: int = Query(default=90, ge=1, le=1000),
    order: str = Query(default="desc", pattern="^(asc|desc)$"),
) -> dict:
    ptype = _enum_or_400(prediction_type, _SUPPORTED_PREDICTION_TYPES, "prediction_type")
    v = _enum_or_400(verdict, _VERDICTS, "verdict")
    subject = _entity_uid_or_400(subject_uid) if subject_uid else None
    repo = _repository()
    rows = _guarded(
        lambda: repo.list_outcomes(prediction_type=ptype, verdict=v,
                                   subject_uid=subject,
                                   order_desc=(order == "desc"), limit=limit),
        "list_outcomes",
    )
    return {"count": len(rows), "outcomes": rows}


@router.get("/calibration/status")
def calibration_status() -> dict:
    """Calibration prerequisites and gate status. Deliberately NOT an accuracy
    metric: figures are labeled diagnostics until the credibility gates pass."""
    from app.institutional_memory.outcomes import compute_calibration
    from app.institutional_memory.predictions import (
        enabled_prediction_types,
        prediction_ledger_status,
    )
    enabled, reason = prediction_ledger_status()
    repo = _repository()

    def collect() -> dict:
        rows = repo.fetch_calibration_rows()
        overall = compute_calibration(rows)
        open_predictions = repo.list_predictions(status="active", limit=1000)
        return {
            "ledger_enabled": enabled,
            "reason": reason,
            "enabled_prediction_types": sorted(enabled_prediction_types()),
            "open_predictions": len(open_predictions),
            "overall": overall,
        }

    return _guarded(collect, "calibration_status")


@router.get("/calibration/by-type")
def calibration_by_type(
    prediction_type: str = Query(alias="type"),
) -> dict:
    from app.institutional_memory.outcomes import compute_calibration
    ptype = _enum_or_400(prediction_type, _SUPPORTED_PREDICTION_TYPES, "prediction_type")
    repo = _repository()
    rows = _guarded(lambda: repo.fetch_calibration_rows(ptype), "calibration_by_type")
    result = compute_calibration(rows, ptype)
    if not result["credible"]:
        log.info("[calibration] type=%s n=%d credible=false", ptype, result["sample_size"])
    return result


@router.get("/graph/at")
def graph_at(date_param: str = Query(alias="date")) -> dict:
    """Daily historical reconstruction of the recorded intelligence state at
    or before the given UTC date. Never claims intraday precision."""
    as_of = _date_or_400(date_param, "date")
    repo = _repository()
    try:
        state = _guarded(lambda: build_historical_state(repo, as_of), "graph_at")
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    log.info("[institutional-memory:m3.2] replay date=%s completeness=%s "
             "entities=%d relationships=%d narratives=%d",
             as_of, state.completeness.get("status"), len(state.entities),
             len(state.relationships), len(state.narratives))
    return state.to_dict()
