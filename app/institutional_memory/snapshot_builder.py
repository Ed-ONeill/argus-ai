"""
app/institutional_memory/snapshot_builder.py — Canonical Theme Snapshot builder (M3.1).

Builds a deterministic EntitySnapshot payload from:
  • the current canonical theme result (ThemeIntelligence)
  • the ThemeMemory rolling summary for that theme
  • cycle metadata (provenance)

Honesty rules:
  • Nothing is fabricated to make the schema look complete: fields the backend
    cannot produce today (graph_version, forward_view, beneficiaries,
    narrative_memberships) are stored as null.
  • payload_hash covers ONLY payload['state'] — the deterministic facts — so
    observation time and provenance churn never register as a state change.
  • Volatile derived figures (hours-ago floats) are excluded from state.
  • List fields whose order is not meaningful are sorted before storage so
    ordering differences can never fire a transition.
"""

from __future__ import annotations

import os
from datetime import datetime

from app.institutional_memory.identity import theme_uid
from app.institutional_memory.models import (
    COMPLETENESS_BOOTSTRAP,
    COMPLETENESS_LIVE,
    COMPLETENESS_PARTIAL,
    SCHEMA_VERSION,
    SNAPSHOT_KIND_BOOTSTRAP,
    SNAPSHOT_KIND_DAILY,
    WRITER_VERSION,
    SnapshotRecord,
    payload_hash,
)


def _base_provenance(source: str, extra: dict | None = None) -> dict:
    prov = {
        "source": source,
        "writer_version": WRITER_VERSION,
        "deployment_id": os.getenv("RAILWAY_DEPLOYMENT_ID") or "local",
    }
    if extra:
        prov.update(extra)
    return prov


def _memory_state(memory_summary: dict | None) -> dict | None:
    """Stable ThemeMemory facts for the state object. Volatile derived floats
    (first_seen_days_ago, last_seen_hours_ago) are deliberately excluded."""
    if not memory_summary:
        return None
    return {
        "first_seen": memory_summary.get("first_seen"),
        "sessions_observed": memory_summary.get("sessions_observed"),
        "sessions_in_status": memory_summary.get("sessions_in_status"),
        "status": memory_summary.get("status"),
        "lifecycle": memory_summary.get("lifecycle"),
        "conviction_first": memory_summary.get("conviction_first"),
        "conviction_peak": memory_summary.get("conviction_peak"),
        "conviction_trough": memory_summary.get("conviction_trough"),
        "confirming_total": memory_summary.get("confirming_total"),
        "contradicting_total": memory_summary.get("contradicting_total"),
        "is_persistent_pattern": memory_summary.get("is_persistent_pattern"),
    }


def build_theme_snapshot(
    theme: object,
    memory_summary: dict | None,
    now: datetime,
    *,
    provenance_extra: dict | None = None,
    cluster_uid_map: dict[str, str] | None = None,
) -> SnapshotRecord:
    """Build the canonical daily snapshot for one active theme.

    Deterministic: identical (theme, memory_summary) inputs produce an
    identical state object and therefore an identical payload_hash,
    independent of `now`.
    """
    tid = getattr(theme, "id")
    uid = theme_uid(tid)
    name = getattr(theme, "name", tid) or tid

    conviction = int(getattr(theme, "confidence", 0) or 0)
    strength = getattr(theme, "signal_strength", None)
    momentum_label = getattr(theme, "momentum_label", None)
    momentum_delta = getattr(theme, "momentum_delta", None)
    breadth = getattr(theme, "breadth_score", None)
    causal = getattr(theme, "causal_narrative", "") or None
    evidence_verdict = getattr(theme, "signal_quality", None)          # confirmed|developing|speculative
    evidence_quality = getattr(theme, "confidence_label", None) or None
    story_count = getattr(theme, "contributing_story_count", None)
    source_count = getattr(theme, "evidence_count", None)              # unique contributing sources

    related_assets = sorted(getattr(theme, "related_assets", []) or [])
    related_industries = sorted(getattr(theme, "related_industries", []) or [])
    drivers = sorted(getattr(theme, "related_macro_factors", []) or [])
    risks = list(getattr(theme, "second_order_effects", []) or [])     # authored order kept
    contributing_clusters = sorted(getattr(theme, "contributing_cluster_ids", []) or [])

    mem = _memory_state(memory_summary)
    contradictions = None
    if memory_summary:
        contradictions = {
            "confirming_last_cycle": memory_summary.get("confirmations_today"),
            "contradicting_last_cycle": memory_summary.get("contradictions_today"),
            "confirming_total": memory_summary.get("confirming_total"),
            "contradicting_total": memory_summary.get("contradicting_total"),
            # M3.1 limitation: contradictions exist as counts only; there are
            # no itemized contradiction records in the pipeline yet.
            "itemized": None,
        }

    lifecycle = (memory_summary or {}).get("lifecycle")

    transmission = None
    rel_weights = getattr(theme, "relationship_weights", None)
    if causal or rel_weights:
        transmission = {
            "causal_narrative": causal,
            "relationship_weights": rel_weights or None,
        }

    state = {
        "uid": uid,
        "theme_id": tid,
        "display_label": name,
        "active": True,
        "conviction": conviction,
        "strength": strength,
        "lifecycle": lifecycle,
        "momentum_label": momentum_label,
        "momentum_delta": momentum_delta,
        "breadth": breadth,
        "evidence_verdict": evidence_verdict,
        "evidence_quality": evidence_quality,
        "evidence_count": story_count,
        "source_count": source_count,
        "persistence_cycles": getattr(theme, "persistence_cycles", None),
        "related_assets": related_assets,
        "related_industries": related_industries,
        "drivers": drivers,
        "risks": risks,
        "contradictions": contradictions,
        "causal_narrative": causal,
        "transmission": transmission,
        "contributing_cluster_ids": contributing_clusters,
        # OP2.2 [C8] — durable event uids alongside the legacy cluster ids
        # (additive; None until identity uids flow). Cluster ids stay for
        # existing consumers; the uid is the permanent reference.
        "contributing_event_uids": sorted({
            (cluster_uid_map or {})[cid] for cid in contributing_clusters
            if cid in (cluster_uid_map or {})
        }) or None,
        "memory": mem,
        # Honest nulls — the backend cannot produce these today:
        "forward_view": None,
        "beneficiaries": None,
        "narrative_memberships": None,
        "graph_version": None,
    }

    provenance = _base_provenance("background_cycle", provenance_extra)
    payload = {
        "state": state,
        "provenance": provenance,
        "observed_at": now.isoformat(),
    }
    completeness = COMPLETENESS_LIVE if memory_summary else COMPLETENESS_PARTIAL

    return SnapshotRecord(
        entity_uid=uid,
        snapshot_date=now.date().isoformat(),
        observed_at=now.isoformat(),
        snapshot_kind=SNAPSHOT_KIND_DAILY,
        schema_version=SCHEMA_VERSION,
        completeness_status=completeness,
        provenance=provenance,
        payload=payload,
        payload_hash=payload_hash(state),
        graph_version=None,
        conviction=conviction,
        evidence_verdict=evidence_verdict,
        evidence_quality=evidence_quality,
        evidence_count=story_count,
        source_count=source_count,
        breadth=breadth,
        momentum=float(momentum_delta) if momentum_delta is not None else None,
        lifecycle=lifecycle,
        strength=strength,
        causal_narrative=causal,
        forward_view=None,
        drivers=drivers or None,
        beneficiaries=None,
        risks=risks or None,
        contradictions=contradictions,
        related_assets=related_assets or None,
        narrative_memberships=None,
        transmission=transmission,
    )


def build_bootstrap_snapshot(
    theme_id: str,
    memory_summary: dict,
    memory_record: dict | None,
    now: datetime,
) -> SnapshotRecord:
    """One honest baseline snapshot from the current ThemeMemory state.

    Not a reconstruction of history: snapshot_date is the bootstrap run date,
    observed_at is the theme's real last_seen time, provenance.source is
    'theme_memory_bootstrap', and completeness is 'bootstrap'. Nothing is
    backdated or fabricated from ring-buffer observations.
    """
    uid = theme_uid(theme_id)
    mem = _memory_state(memory_summary)
    conviction = memory_summary.get("conviction_current")
    observed_at = memory_summary.get("last_seen") or now.isoformat()

    last_evidence = None
    if memory_record:
        trail = memory_record.get("evidence") or []
        if trail:
            e = trail[-1]
            last_evidence = {
                "sources": sorted(e.get("sources") or []),
                "sectors": sorted(e.get("sectors") or []),
                "tickers": sorted(e.get("tickers") or []),
                "transmission_path": e.get("transmission_path") or None,
            }

    state = {
        "uid": uid,
        "theme_id": theme_id,
        "display_label": memory_summary.get("name"),
        "active": not memory_summary.get("is_stale", False),
        "conviction": conviction,
        "strength": None,
        "lifecycle": memory_summary.get("lifecycle"),
        "momentum_label": memory_summary.get("momentum"),
        "momentum_delta": None,
        "breadth": None,
        "evidence_verdict": None,
        "evidence_quality": None,
        "evidence_count": None,
        "source_count": len(last_evidence["sources"]) if last_evidence else None,
        "persistence_cycles": None,
        "related_assets": memory_summary.get("historical_tickers") or [],
        "related_industries": memory_summary.get("historical_sectors") or [],
        "drivers": [],
        "risks": [],
        "contradictions": {
            "confirming_total": memory_summary.get("confirming_total"),
            "contradicting_total": memory_summary.get("contradicting_total"),
            "itemized": None,
        },
        "causal_narrative": (last_evidence or {}).get("transmission_path"),
        "transmission": None,
        "contributing_cluster_ids": [],
        "memory": mem,
        "last_evidence": last_evidence,
        "forward_view": None,
        "beneficiaries": None,
        "narrative_memberships": None,
        "graph_version": None,
    }

    provenance = _base_provenance("theme_memory_bootstrap")
    payload = {
        "state": state,
        "provenance": provenance,
        "observed_at": observed_at,
    }
    return SnapshotRecord(
        entity_uid=uid,
        snapshot_date=now.date().isoformat(),
        observed_at=observed_at,
        snapshot_kind=SNAPSHOT_KIND_BOOTSTRAP,
        schema_version=SCHEMA_VERSION,
        completeness_status=COMPLETENESS_BOOTSTRAP,
        provenance=provenance,
        payload=payload,
        payload_hash=payload_hash(state),
        conviction=int(conviction) if conviction is not None else None,
        source_count=state["source_count"],
        lifecycle=state["lifecycle"],
        causal_narrative=state["causal_narrative"],
        contradictions=state["contradictions"],
        related_assets=state["related_assets"] or None,
    )
