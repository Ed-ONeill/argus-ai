"""
app/institutional_memory/predictions.py — Prediction ledger: contract,
admission, identity, candidate generation, issuance (M3.3).

This is an institutional accountability system, not a trading-signal product.
The ledger does not generate intelligence: candidate generation (deterministic
rules over recorded canonical state) is separated from persistence by the
PredictionCandidate contract, and only candidates passing the admission rules
are ever persisted.

ADMISSION RULES — a record qualifies as a Prediction only with:
  canonical subject UID · issued_at (UTC) · supported prediction type ·
  explicit statement · resolution window (resolve_after) · non-empty expected
  state · named assumptions · named invalidation conditions · provenance ·
  probability ONLY with a decomposable confidence_basis (none exists in M3.3,
  so probability is always null).
Generic risks, watch items, scenarios, opportunities, commentary, and
"could/may/might" prose are not predictions and are never admitted.

SUPPORTED TYPES (deterministic, structural, resolvable from sealed history):
  relationship_persistence — a relationship recorded today is expected to
      remain active at the next sealed daily boundary.
  narrative_membership — a member theme is expected to remain a member of the
      same driver-set narrative at the next sealed daily boundary.
  conviction_threshold — a theme's sealed conviction at the next boundary is
      expected to remain >= (today's conviction - 3), 3 being the canonical
      ThemeMemory trend deadband (_TREND_DELTA).
lifecycle_transition is deliberately NOT supported: no canonical engine emits
lifecycle expectations today, and inventing one here would violate admission.

IDENTITY: prediction_uid = "prediction:v1:" + sha256(canonical_json(semantic
content))[:32] over subject, type, expected_state, horizon window, assumptions,
probability, schema_version, and the issuance boundary (UTC date). Statement
wording is EXCLUDED — wording changes alone never mint a new prediction.

ISSUANCE POLICY: once per subject per prediction type per SCOPE per UTC day
(first eligible cycle of the day), where scope_key discriminates multiple
predictions of one type about one subject (rel_uid / narrative_uid /
'conviction'). Enforced three ways: an in-process day guard, a pre-insert
existence check, and the database unique constraint
(subject_uid, prediction_type, scope_key, issuance_boundary, schema_version).
Predictions are IMMUTABLE after issuance; only status columns may change.
"""

from __future__ import annotations

import hashlib
import logging
import os
from dataclasses import dataclass, field
from datetime import datetime, time, timedelta, timezone

from app.institutional_memory.identity import parse_uid
from app.institutional_memory.models import (
    SCHEMA_VERSION,
    canonical_json,
    payload_hash,
)
from app.institutional_memory.repository import SupabaseRepository

log = logging.getLogger(__name__)

LEDGER_WRITER_VERSION = "m3.3.0"

TYPE_RELATIONSHIP_PERSISTENCE = "relationship_persistence"
TYPE_NARRATIVE_MEMBERSHIP = "narrative_membership"
TYPE_CONVICTION_THRESHOLD = "conviction_threshold"
SUPPORTED_PREDICTION_TYPES = frozenset({
    TYPE_RELATIONSHIP_PERSISTENCE,
    TYPE_NARRATIVE_MEMBERSHIP,
    TYPE_CONVICTION_THRESHOLD,
})

CONVICTION_FLOOR_DELTA = 3       # canonical ThemeMemory _TREND_DELTA deadband
RESOLUTION_GRACE_DAYS = 7        # resolve_before = resolve_after + grace

STATUS_ACTIVE = "active"
STATUS_RESOLVED = "resolved"
STATUS_INVALIDATED = "invalidated"


def prediction_ledger_status() -> tuple[bool, str]:
    """(enabled, reason). Requires institutional memory to be enabled too."""
    from app.config import settings
    from app.institutional_memory.writer import memory_config_status
    mem_enabled, mem_reason = memory_config_status()
    if not mem_enabled:
        return False, f"institutional_memory_{mem_reason}"
    if not settings.prediction_ledger_enabled:
        return False, "disabled_by_flag"
    return True, "enabled"


def enabled_prediction_types() -> frozenset[str]:
    from app.config import settings
    raw = {t.strip() for t in (settings.prediction_types_enabled or "").split(",")}
    return frozenset(t for t in raw if t in SUPPORTED_PREDICTION_TYPES)


# ── Contract ────────────────────────────────────────────────────────────────────

@dataclass
class PredictionCandidate:
    """Backend-neutral admission object: generation is separate from
    persistence, and the ledger never generates intelligence itself."""
    subject_uid: str
    prediction_type: str
    scope_key: str
    expected_state: dict
    issued_at: datetime
    resolve_after: datetime
    statement: str
    assumptions: list[str]
    invalidation_conditions: list[str]
    evidence_refs: list
    source_snapshot_ids: list
    resolve_before: datetime | None = None
    horizon_label: str | None = None
    graph_version: str | None = None
    probability: float | None = None
    confidence_basis: dict | None = None


class AdmissionError(ValueError):
    """Candidate failed the prediction admission rules."""


def validate_candidate(c: PredictionCandidate) -> None:
    """Raise AdmissionError with the specific rule violated."""
    try:
        parse_uid(c.subject_uid)
    except ValueError:
        raise AdmissionError(f"subject_uid is not canonical: {c.subject_uid!r}")
    if c.prediction_type not in SUPPORTED_PREDICTION_TYPES:
        raise AdmissionError(f"unsupported prediction type: {c.prediction_type!r}")
    if not (c.scope_key or "").strip():
        raise AdmissionError("scope_key is required (rel_uid / narrative_uid / rule scope)")
    if not isinstance(c.expected_state, dict) or not c.expected_state:
        raise AdmissionError("expected_state must be a non-empty testable state")
    if not isinstance(c.issued_at, datetime) or c.issued_at.tzinfo is None:
        raise AdmissionError("issued_at must be a timezone-aware UTC datetime")
    if not isinstance(c.resolve_after, datetime) or c.resolve_after.tzinfo is None:
        raise AdmissionError("a horizon is required: resolve_after must be set (UTC)")
    if c.resolve_after <= c.issued_at:
        raise AdmissionError("resolve_after must be later than issued_at")
    if not (c.statement or "").strip():
        raise AdmissionError("an explicit statement is required")
    if not c.assumptions or not all((a or "").strip() for a in c.assumptions):
        raise AdmissionError("named assumptions are required")
    if not c.invalidation_conditions or not all((i or "").strip() for i in c.invalidation_conditions):
        raise AdmissionError("named invalidation conditions are required")
    if c.probability is not None:
        if not c.confidence_basis:
            raise AdmissionError("probability requires a decomposable confidence_basis")
        if not (0.0 <= float(c.probability) <= 1.0):
            raise AdmissionError("probability must be within [0, 1]")


# ── Identity ────────────────────────────────────────────────────────────────────

def prediction_uid(c: PredictionCandidate,
                   schema_version: int = SCHEMA_VERSION) -> str:
    """Deterministic semantic identity. Wording (statement) is excluded;
    materially changed expected state, horizon, assumptions, or probability
    produce a new UID. The issuance boundary (UTC date of issued_at) is part
    of identity so each daily boundary is a distinct, resolvable prediction."""
    semantic = {
        "subject_uid": c.subject_uid,
        "prediction_type": c.prediction_type,
        "scope_key": c.scope_key,
        "expected_state": c.expected_state,
        "issuance_boundary": c.issued_at.date().isoformat(),
        "resolve_after": c.resolve_after.isoformat(),
        "resolve_before": c.resolve_before.isoformat() if c.resolve_before else None,
        "assumptions": sorted(a.strip() for a in c.assumptions),
        "probability": c.probability,
        "schema_version": schema_version,
    }
    digest = hashlib.sha256(canonical_json(semantic).encode("utf-8")).hexdigest()[:32]
    return f"prediction:v1:{digest}"


def build_prediction_row(c: PredictionCandidate) -> dict:
    """Admitted candidate → immutable prediction_records row."""
    validate_candidate(c)
    uid = prediction_uid(c)
    subject_type = parse_uid(c.subject_uid)[0]
    provenance = {
        "source": "canonical_rule_generator",
        "writer_version": LEDGER_WRITER_VERSION,
        "deployment_id": os.getenv("RAILWAY_DEPLOYMENT_ID") or "local",
    }
    issued_payload = {
        "prediction_uid": uid,
        "subject_uid": c.subject_uid,
        "subject_type": subject_type,
        "prediction_type": c.prediction_type,
        "scope_key": c.scope_key,
        "issued_at": c.issued_at.isoformat(),
        "issuance_boundary": c.issued_at.date().isoformat(),
        "resolve_after": c.resolve_after.isoformat(),
        "resolve_before": c.resolve_before.isoformat() if c.resolve_before else None,
        "horizon_label": c.horizon_label,
        "statement": c.statement,
        "expected_state": c.expected_state,
        "probability": c.probability,
        "confidence_basis": c.confidence_basis,
        "assumptions": sorted(a.strip() for a in c.assumptions),
        "invalidation_conditions": [i.strip() for i in c.invalidation_conditions],
        "evidence_refs": c.evidence_refs,
        "source_snapshot_ids": c.source_snapshot_ids,
        "graph_version": c.graph_version,
        "schema_version": SCHEMA_VERSION,
        "writer_version": LEDGER_WRITER_VERSION,
    }
    row = dict(issued_payload)
    row.update({
        "status": STATUS_ACTIVE,
        "provenance": provenance,
        "payload": {"issued": issued_payload, "provenance": provenance},
        "payload_hash": payload_hash(issued_payload),
    })
    return row


# ── Candidate generation (deterministic canonical rules) ───────────────────────

def _boundaries(now: datetime) -> tuple[str, datetime, datetime]:
    """(predicted boundary date D+1, resolve_after, resolve_before).
    The predicted day D+1 seals at 00:00 UTC on D+2 — resolution may not run
    before the full observation window exists."""
    boundary = now.date() + timedelta(days=1)
    resolve_after = datetime.combine(boundary + timedelta(days=1), time.min,
                                     tzinfo=timezone.utc)
    resolve_before = resolve_after + timedelta(days=RESOLUTION_GRACE_DAYS)
    return boundary.isoformat(), resolve_after, resolve_before


def build_candidates(graph_state, theme_snapshots: list, now: datetime,
                     enabled_types: frozenset[str]) -> list[PredictionCandidate]:
    """Deterministic candidates from this cycle's recorded canonical state.
    Rules are pre-registered here and in ARGUS_PREDICTION_OUTCOME_LEDGER_V1.md;
    nothing is inferred ad hoc and nothing price-based is generated."""
    candidates: list[PredictionCandidate] = []
    boundary, resolve_after, resolve_before = _boundaries(now)

    if graph_state is not None and TYPE_RELATIONSHIP_PERSISTENCE in enabled_types:
        for snap in sorted(graph_state.relationship_snapshots, key=lambda s: s.rel_uid):
            candidates.append(PredictionCandidate(
                subject_uid=snap.source_uid,
                prediction_type=TYPE_RELATIONSHIP_PERSISTENCE,
                scope_key=snap.rel_uid,
                expected_state={
                    "rel_uid": snap.rel_uid,
                    "boundary_date": boundary,
                    "active": True,
                },
                issued_at=now,
                resolve_after=resolve_after,
                resolve_before=resolve_before,
                horizon_label="next_daily_boundary",
                statement=(f"Recorded relationship {snap.rel_uid} is expected to "
                           f"remain active in the sealed daily record for {boundary}."),
                assumptions=[
                    "The background pipeline records the graph on the boundary day.",
                    "The source and target entities remain active canonical identities.",
                ],
                invalidation_conditions=[
                    "Source or target entity is retired/absorbed before resolution.",
                    "No institutional records exist for the boundary day (writer gap).",
                ],
                evidence_refs=snap.evidence_refs or [],
                source_snapshot_ids=[{
                    "table": "relationship_snapshots", "uid": snap.rel_uid,
                    "snapshot_date": snap.snapshot_date,
                }],
                graph_version=graph_state.graph_version,
            ))

    if graph_state is not None and TYPE_NARRATIVE_MEMBERSHIP in enabled_types:
        for nsnap in sorted(graph_state.narrative_snapshots, key=lambda s: s.entity_uid):
            for member_uid in nsnap.member_uids:
                candidates.append(PredictionCandidate(
                    subject_uid=member_uid,
                    prediction_type=TYPE_NARRATIVE_MEMBERSHIP,
                    scope_key=nsnap.entity_uid,
                    expected_state={
                        "narrative_uid": nsnap.entity_uid,
                        "driver_set_key": nsnap.driver_set_key,
                        "boundary_date": boundary,
                        "member": True,
                    },
                    issued_at=now,
                    resolve_after=resolve_after,
                    resolve_before=resolve_before,
                    horizon_label="next_daily_boundary",
                    statement=(f"{member_uid} is expected to remain a member of "
                               f"narrative {nsnap.entity_uid} in the sealed daily "
                               f"record for {boundary}."),
                    assumptions=[
                        "The narrative's driver set continues to be derivable from "
                        "recorded theme macro drivers.",
                        "The background pipeline records narratives on the boundary day.",
                    ],
                    invalidation_conditions=[
                        "The member theme entity is retired/absorbed before resolution.",
                        "No institutional records exist for the boundary day (writer gap).",
                    ],
                    evidence_refs=nsnap.evidence_refs or [],
                    source_snapshot_ids=[{
                        "table": "narrative_snapshots", "uid": nsnap.entity_uid,
                        "snapshot_date": nsnap.snapshot_date,
                    }],
                    graph_version=graph_state.graph_version,
                ))

    if TYPE_CONVICTION_THRESHOLD in enabled_types:
        for snap in sorted(theme_snapshots or [], key=lambda s: s.entity_uid):
            if snap.conviction is None:
                continue
            threshold = int(snap.conviction) - CONVICTION_FLOOR_DELTA
            candidates.append(PredictionCandidate(
                subject_uid=snap.entity_uid,
                prediction_type=TYPE_CONVICTION_THRESHOLD,
                scope_key="conviction",
                expected_state={
                    "boundary_date": boundary,
                    "conviction_gte": threshold,
                    "rule": f"sealed conviction >= issued conviction - {CONVICTION_FLOOR_DELTA}",
                },
                issued_at=now,
                resolve_after=resolve_after,
                resolve_before=resolve_before,
                horizon_label="next_daily_boundary",
                statement=(f"{snap.entity_uid} sealed conviction for {boundary} is "
                           f"expected to remain >= {threshold} (issued conviction "
                           f"{snap.conviction} minus the canonical {CONVICTION_FLOOR_DELTA}-pt "
                           f"trend deadband)."),
                assumptions=[
                    "The theme remains active enough to be recorded on the boundary day.",
                    "The conviction scale and extraction rules are unchanged.",
                ],
                invalidation_conditions=[
                    "The theme entity is retired/absorbed before resolution.",
                    "No institutional records exist for the boundary day (writer gap).",
                ],
                evidence_refs=(snap.payload.get("state", {}) or {}).get(
                    "contributing_cluster_ids") or [],
                source_snapshot_ids=[{
                    "table": "entity_snapshots", "uid": snap.entity_uid,
                    "snapshot_date": snap.snapshot_date,
                }],
                graph_version=None,
            ))

    return candidates


# ── Issuance ────────────────────────────────────────────────────────────────────

def issue_predictions(repo: SupabaseRepository, candidates: list[PredictionCandidate],
                      now: datetime) -> dict:
    """Persist admitted candidates, once per subject/type per UTC day.
    Returns counters; raises RepositoryError on storage failure."""
    boundary = now.date().isoformat()
    counters = {"candidates": len(candidates), "issued": 0,
                "skipped_duplicate": 0, "rejected": 0}
    if not candidates:
        return counters

    existing = repo.fetch_predictions_issued_on(boundary)
    rows = []
    for c in candidates:
        try:
            row = build_prediction_row(c)
        except AdmissionError as exc:
            counters["rejected"] += 1
            log.warning("[prediction-ledger] rejected reason=%s subject=%s type=%s",
                        exc, c.subject_uid, c.prediction_type)
            continue
        if (c.subject_uid, c.prediction_type, c.scope_key) in existing:
            counters["skipped_duplicate"] += 1
            continue
        rows.append(row)

    if rows:
        repo.insert_predictions(rows)
        counters["issued"] = len(rows)
    log.info("[prediction-ledger] issued=%d skipped_duplicate=%d rejected=%d boundary=%s",
             counters["issued"], counters["skipped_duplicate"],
             counters["rejected"], boundary)
    return counters
