"""
app/institutional_memory/models.py — Typed records + deterministic serialization (M3.1).

All timestamps are UTC. All hashing goes through canonical_json() so ordering
differences can never produce a different payload_hash or a false transition.
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass, field
from datetime import date, datetime, timezone
from typing import Any

SCHEMA_VERSION = 1
WRITER_VERSION = "m3.1.0"

SNAPSHOT_KIND_DAILY = "daily_utc"
SNAPSHOT_KIND_BOOTSTRAP = "bootstrap_baseline"

COMPLETENESS_LIVE = "live"
COMPLETENESS_PARTIAL = "partial"
COMPLETENESS_BOOTSTRAP = "bootstrap"


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def canonical_json(obj: Any) -> str:
    """Deterministic JSON: sorted keys at every level, compact separators.

    json.dumps sorts nested dict keys recursively; list order is preserved
    (lists are ordered data — writers must sort them before storing when the
    order is not meaningful).
    """
    return json.dumps(obj, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def payload_hash(state: dict) -> str:
    """sha256 over the canonical JSON of the deterministic state object."""
    return hashlib.sha256(canonical_json(state).encode("utf-8")).hexdigest()


@dataclass
class EntityRecord:
    """Row shape for institutional_entities."""
    uid: str
    entity_type: str
    namespace: str
    canonical_key: str
    display_label: str | None = None
    aliases: list[str] = field(default_factory=list)
    first_seen_at: str | None = None   # ISO-8601 UTC
    last_seen_at: str | None = None


@dataclass
class SnapshotRecord:
    """Row shape for entity_snapshots. `payload` holds {state, provenance,
    observed_at}; payload_hash covers payload['state'] ONLY, so observation
    time and provenance churn never masquerade as a state change."""
    entity_uid: str
    snapshot_date: str                 # ISO date (UTC)
    observed_at: str                   # ISO-8601 UTC
    snapshot_kind: str
    schema_version: int
    completeness_status: str
    provenance: dict
    payload: dict
    payload_hash: str
    graph_version: str | None = None
    conviction: int | None = None
    evidence_verdict: str | None = None
    evidence_quality: str | None = None
    evidence_count: int | None = None
    source_count: int | None = None
    breadth: int | None = None
    momentum: float | None = None
    lifecycle: str | None = None
    strength: str | None = None
    causal_narrative: str | None = None
    forward_view: dict | None = None
    drivers: list | None = None
    beneficiaries: list | None = None
    risks: list | None = None
    contradictions: dict | None = None
    related_assets: list | None = None
    narrative_memberships: list | None = None
    transmission: dict | None = None

    def to_row(self) -> dict:
        return {
            "entity_uid": self.entity_uid,
            "snapshot_date": self.snapshot_date,
            "observed_at": self.observed_at,
            "snapshot_kind": self.snapshot_kind,
            "schema_version": self.schema_version,
            "graph_version": self.graph_version,
            "conviction": self.conviction,
            "evidence_verdict": self.evidence_verdict,
            "evidence_quality": self.evidence_quality,
            "evidence_count": self.evidence_count,
            "source_count": self.source_count,
            "breadth": self.breadth,
            "momentum": self.momentum,
            "lifecycle": self.lifecycle,
            "strength": self.strength,
            "causal_narrative": self.causal_narrative,
            "forward_view": self.forward_view,
            "drivers": self.drivers,
            "beneficiaries": self.beneficiaries,
            "risks": self.risks,
            "contradictions": self.contradictions,
            "related_assets": self.related_assets,
            "narrative_memberships": self.narrative_memberships,
            "transmission": self.transmission,
            "completeness_status": self.completeness_status,
            "provenance": self.provenance,
            "payload": self.payload,
            "payload_hash": self.payload_hash,
        }


@dataclass
class TransitionEvent:
    """Row shape for transition_events. event_key is deterministic:
    {uid}|{type}|{effective_date}|v{schema_version} — at most one event of a
    given type per entity per sealed day."""
    entity_uid: str
    transition_type: str
    effective_at: str                  # ISO-8601 UTC
    basis: dict
    schema_version: int
    event_key: str
    from_snapshot_id: str | None = None
    to_snapshot_id: str | None = None
    from_value: dict | None = None
    to_value: dict | None = None
    magnitude: float | None = None

    def to_row(self, uid_column: str = "entity_uid") -> dict:
        return {
            uid_column: self.entity_uid,
            "transition_type": self.transition_type,
            "effective_at": self.effective_at,
            "from_snapshot_id": self.from_snapshot_id,
            "to_snapshot_id": self.to_snapshot_id,
            "from_value": self.from_value,
            "to_value": self.to_value,
            "magnitude": self.magnitude,
            "basis": self.basis,
            "schema_version": self.schema_version,
            "event_key": self.event_key,
        }


@dataclass
class RelationshipRecord:
    """Row shape for institutional_relationships (identity registry)."""
    rel_uid: str
    source_uid: str
    target_uid: str
    relationship_type: str
    direction: str                     # directed | symmetric
    first_seen_at: str | None = None
    last_seen_at: str | None = None


@dataclass
class RelationshipSnapshotRecord:
    """Row shape for relationship_snapshots. Same payload discipline as
    entity snapshots: payload_hash covers payload['state'] only."""
    rel_uid: str
    snapshot_date: str
    observed_at: str
    snapshot_kind: str
    schema_version: int
    source_uid: str
    target_uid: str
    relationship_type: str
    direction: str
    completeness_status: str
    provenance: dict
    payload: dict
    payload_hash: str
    strength: float | None = None      # backend graph weight, 0-1 scale, verbatim
    confidence: float | None = None    # backend graph confidence, 0-1 scale
    evidence_count: int | None = None
    source_count: int | None = None
    evidence_refs: list | None = None
    active: bool = True
    graph_version: str | None = None

    def to_row(self) -> dict:
        return {
            "rel_uid": self.rel_uid,
            "snapshot_date": self.snapshot_date,
            "observed_at": self.observed_at,
            "snapshot_kind": self.snapshot_kind,
            "schema_version": self.schema_version,
            "source_uid": self.source_uid,
            "target_uid": self.target_uid,
            "relationship_type": self.relationship_type,
            "direction": self.direction,
            "strength": self.strength,
            "confidence": self.confidence,
            "evidence_count": self.evidence_count,
            "source_count": self.source_count,
            "evidence_refs": self.evidence_refs,
            "active": self.active,
            "graph_version": self.graph_version,
            "completeness_status": self.completeness_status,
            "provenance": self.provenance,
            "payload": self.payload,
            "payload_hash": self.payload_hash,
        }


@dataclass
class NarrativeSnapshotRecord:
    """Row shape for narrative_snapshots. Member convictions are listed
    individually — never blended into a narrative-level conviction."""
    entity_uid: str
    snapshot_date: str
    observed_at: str
    snapshot_kind: str
    schema_version: int
    driver_set_key: str
    member_uids: list
    completeness_status: str
    provenance: dict
    payload: dict
    payload_hash: str
    title: str | None = None
    thesis: str | None = None          # null in M3.2: no deterministic backend thesis
    member_convictions: list | None = None
    coherence: float | None = None
    coherence_components: dict | None = None
    evidence_refs: list | None = None
    contradictions: dict | None = None
    dominance_status: str | None = None
    rank: int | None = None
    graph_version: str | None = None

    def to_row(self) -> dict:
        return {
            "entity_uid": self.entity_uid,
            "snapshot_date": self.snapshot_date,
            "observed_at": self.observed_at,
            "snapshot_kind": self.snapshot_kind,
            "schema_version": self.schema_version,
            "driver_set_key": self.driver_set_key,
            "title": self.title,
            "thesis": self.thesis,
            "member_uids": self.member_uids,
            "member_convictions": self.member_convictions,
            "coherence": self.coherence,
            "coherence_components": self.coherence_components,
            "evidence_refs": self.evidence_refs,
            "contradictions": self.contradictions,
            "dominance_status": self.dominance_status,
            "rank": self.rank,
            "graph_version": self.graph_version,
            "completeness_status": self.completeness_status,
            "provenance": self.provenance,
            "payload": self.payload,
            "payload_hash": self.payload_hash,
        }


def transition_event_key(entity_uid: str, transition_type: str,
                         effective_date: date | str,
                         schema_version: int = SCHEMA_VERSION) -> str:
    d = effective_date.isoformat() if isinstance(effective_date, date) else str(effective_date)
    return f"{entity_uid}|{transition_type}|{d}|v{schema_version}"


@dataclass
class WriteRunResult:
    """Outcome of one writer invocation (mirrors a memory_write_runs row)."""
    run_key: str
    status: str = "completed"          # running | completed | failed | skipped | disabled
    themes_seen: int = 0
    entities_upserted: int = 0
    snapshots_inserted: int = 0
    snapshots_updated: int = 0
    snapshots_unchanged: int = 0
    transitions_inserted: int = 0
    error_count: int = 0
    errors: list[str] = field(default_factory=list)
    # M3.2 stage counters (relationships/narratives/industries) — reported via
    # memory_write_runs.metadata so the M3.1 column contract stays unchanged.
    extra: dict = field(default_factory=dict)

    def add_error(self, message: str) -> None:
        self.error_count += 1
        # Keep messages bounded and free of secrets (callers pass exception
        # summaries, never raw responses which could echo headers).
        self.errors.append(message[:500])


def run_key_for(snapshot_date: str, uid_hash_pairs: list[tuple[str, str]],
                writer_version: str = WRITER_VERSION,
                schema_version: int = SCHEMA_VERSION) -> str:
    """Deterministic run key: identical cycle state → identical run_key, so a
    retried or duplicated cycle is recognized and skipped once completed."""
    basis = canonical_json({
        "writer_version": writer_version,
        "schema_version": schema_version,
        "snapshot_date": snapshot_date,
        "snapshots": sorted(uid_hash_pairs),
    })
    digest = hashlib.sha256(basis.encode("utf-8")).hexdigest()[:32]
    return f"run:{snapshot_date}:{digest}"
