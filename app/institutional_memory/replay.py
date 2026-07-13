"""
app/institutional_memory/replay.py — Daily historical reconstruction (M3.2).

Rebuilds the most recent SEALED institutional records at or before a requested
date: entities (themes + industries), relationships, and narratives. This is a
**daily historical reconstruction** — one sealed record per subject per UTC
day — and never claims intraday precision. Intraday state is not persisted.

Honesty rules:
  • Only sealed rows participate (snapshot_date < current UTC date), so a
    request for "today" reconstructs through yesterday and says so.
  • No record with snapshot_date after the requested date is ever included —
    the future cannot leak into the past.
  • Subjects whose latest sealed snapshot is older than the lookback window
    (default 31 days) are treated as not part of the active state at that
    date; this bound is reported in `completeness`.
  • `graph_version` is reported from the reconstruction's newest rows and
    flagged when mixed (rows can straddle a graph topology change).
"""

from __future__ import annotations

import logging
from collections import Counter
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta

from app.institutional_memory.models import (
    SCHEMA_VERSION,
    SNAPSHOT_KIND_DAILY,
    WRITER_VERSION,
    utc_now,
)
from app.institutional_memory.repository import SupabaseRepository

log = logging.getLogger(__name__)

RECONSTRUCTION_KIND = "daily_historical_reconstruction"
DEFAULT_LOOKBACK_DAYS = 31


@dataclass
class HistoricalIntelligenceState:
    """Typed replay contract: what Argus's durable record says the
    intelligence state was on a given UTC date."""
    as_of_date: str
    reconstruction_kind: str
    sealed_through: str | None
    graph_version: str | None
    entities: list[dict] = field(default_factory=list)
    relationships: list[dict] = field(default_factory=list)
    narratives: list[dict] = field(default_factory=list)
    completeness: dict = field(default_factory=dict)
    provenance: dict = field(default_factory=dict)

    def to_dict(self) -> dict:
        return {
            "as_of_date": self.as_of_date,
            "reconstruction_kind": self.reconstruction_kind,
            "sealed_through": self.sealed_through,
            "graph_version": self.graph_version,
            "entities": self.entities,
            "relationships": self.relationships,
            "narratives": self.narratives,
            "completeness": self.completeness,
            "provenance": self.provenance,
        }


def _latest_per_uid(rows: list[dict], uid_col: str) -> list[dict]:
    """rows are ordered snapshot_date ascending; last write per uid wins."""
    latest: dict[str, dict] = {}
    for r in rows:
        latest[r[uid_col]] = r
    return [latest[k] for k in sorted(latest)]


def build_historical_state(
    repo: SupabaseRepository,
    as_of: str,
    *,
    now: datetime | None = None,
    lookback_days: int = DEFAULT_LOOKBACK_DAYS,
) -> HistoricalIntelligenceState:
    """Reconstruct the most recent sealed records at or before `as_of`
    (ISO date). Raises ValueError on invalid/future dates; RepositoryError
    when the archive is unreachable."""
    requested = date.fromisoformat(as_of)
    now = now or utc_now()
    today = now.date()
    if requested > today:
        raise ValueError(f"as_of {as_of} is in the future")

    notes: list[str] = []
    sealed_cutoff = min(requested, today - timedelta(days=1))
    if sealed_cutoff < requested:
        notes.append(
            f"Requested {requested.isoformat()} is not sealed yet; "
            f"reconstruction uses sealed data through {sealed_cutoff.isoformat()}."
        )

    window_start = (sealed_cutoff - timedelta(days=lookback_days)).isoformat()
    cutoff = sealed_cutoff.isoformat()

    entity_rows = repo.fetch_table_snapshots_between(
        "entity_snapshots", window_start, cutoff, SNAPSHOT_KIND_DAILY, SCHEMA_VERSION)
    narrative_rows = repo.fetch_table_snapshots_between(
        "narrative_snapshots", window_start, cutoff, SNAPSHOT_KIND_DAILY, SCHEMA_VERSION)
    relationship_rows = repo.fetch_table_snapshots_between(
        "relationship_snapshots", window_start, cutoff, SNAPSHOT_KIND_DAILY, SCHEMA_VERSION)

    entities = _latest_per_uid(entity_rows, "entity_uid")
    narratives = _latest_per_uid(narrative_rows, "entity_uid")
    relationships = _latest_per_uid(relationship_rows, "rel_uid")

    # graph_version from the newest included rows; flag mixed coverage
    newest_date = max((r["snapshot_date"] for r in entities + narratives + relationships),
                      default=None)
    versions = Counter(
        r.get("graph_version") for r in entities + narratives + relationships
        if r["snapshot_date"] == newest_date and r.get("graph_version")
    )
    graph_version = versions.most_common(1)[0][0] if versions else None
    if len(versions) > 1:
        notes.append("Included records straddle more than one graph version; "
                     "the most common version on the newest sealed day is reported.")
    if graph_version is None and (entities or narratives or relationships):
        notes.append("Some or all included records predate graph-version stamping "
                     "(M3.1-era theme snapshots carry graph_version=null).")

    status = "empty" if not (entities or narratives or relationships) else (
        "partial" if not (narratives and relationships) else "daily")
    if status == "empty":
        notes.append("No sealed institutional records exist at or before this date.")
    elif status == "partial":
        notes.append("Narrative and/or relationship history does not yet cover this "
                     "date (M3.2 records accrue only after deployment).")
    notes.append("Daily reconstruction: each record is the sealed end-of-UTC-day "
                 "state; intraday precision is not claimed or available.")

    return HistoricalIntelligenceState(
        as_of_date=requested.isoformat(),
        reconstruction_kind=RECONSTRUCTION_KIND,
        sealed_through=cutoff if entities or narratives or relationships else None,
        graph_version=graph_version,
        entities=entities,
        relationships=relationships,
        narratives=narratives,
        completeness={
            "status": status,
            "lookback_days": lookback_days,
            "entity_count": len(entities),
            "relationship_count": len(relationships),
            "narrative_count": len(narratives),
            "notes": notes,
        },
        provenance={
            "builder": "institutional_memory.replay",
            "writer_version": WRITER_VERSION,
            "schema_version": SCHEMA_VERSION,
            "generated_at": now.isoformat(),
        },
    )
