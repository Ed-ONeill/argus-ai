"""
app/institutional_memory/graph_adapter.py — Backend graph → institutional records (M3.2).

The smallest deterministic adapter between the backend's canonical cycle state
and durable history. Sources (ALL backend-computed, no frontend values):

  • app/narrative_graph.py::build_narrative_graph(feed) — the deterministic
    backend graph (regime/macro/theme/industry nodes; drives/pressures/
    supports/correlates/rotates_into edges, recorded verbatim)
  • feed.theme_intelligence — active themes (related_assets → exposure links,
    related_macro_factors → narrative driver sets)
  • feed.industry_activation — per-industry activation state

What this adapter deliberately does NOT do:
  • copy frontend-only engine outputs (IntelEdge evidenceCount, edge trends,
    member driver-link strengths, prediction reads) — no backend equivalent
  • blend member convictions into a narrative-level conviction
  • invent a narrative thesis (no deterministic backend thesis exists → null)

Graph version:
  graph_version = "gv1-" + sha256(canonical_json(topology))[:16], where
  topology = regime label + sorted (node id, type) + sorted (source, type,
  target). Same graph input → same version; a material topology change (node
  or edge appears/disappears, regime changes) → new version. Strength and
  confidence drift is STATE (captured by snapshots), not topology, so it does
  not churn the version. This durable identity is distinct from the frontend
  profile-cache version, which is a process-lifetime invalidation counter.
"""

from __future__ import annotations

import hashlib
import logging
from dataclasses import dataclass, field
from datetime import datetime

from app.institutional_memory.identity import (
    company_uid,
    driver_uid,
    industry_uid,
    narrative_uid,
    parse_uid,
    regime_uid,
    relationship_uid,
    theme_uid,
)
from app.institutional_memory.models import (
    COMPLETENESS_LIVE,
    SCHEMA_VERSION,
    SNAPSHOT_KIND_DAILY,
    EntityRecord,
    NarrativeSnapshotRecord,
    RelationshipRecord,
    RelationshipSnapshotRecord,
    SnapshotRecord,
    canonical_json,
    payload_hash,
)

log = logging.getLogger(__name__)

_MIN_NARRATIVE_MEMBERS = 2
_MAX_NARRATIVES = 12
_COHERENCE_ROUND = 1


@dataclass
class GraphCycleState:
    """Everything the M3.2 writer persists for one cycle."""
    graph_version: str
    regime_label: str
    entities: list[EntityRecord] = field(default_factory=list)
    industry_snapshots: list[SnapshotRecord] = field(default_factory=list)
    relationships: list[RelationshipRecord] = field(default_factory=list)
    relationship_snapshots: list[RelationshipSnapshotRecord] = field(default_factory=list)
    narrative_snapshots: list[NarrativeSnapshotRecord] = field(default_factory=list)

    def uid_hash_pairs(self) -> list[tuple[str, str]]:
        """(uid, payload_hash) pairs for the deterministic run key."""
        pairs = [(s.entity_uid, s.payload_hash) for s in self.industry_snapshots]
        pairs += [(s.rel_uid, s.payload_hash) for s in self.relationship_snapshots]
        pairs += [(s.entity_uid, s.payload_hash) for s in self.narrative_snapshots]
        return pairs


# ── Node id → canonical UID mapping ─────────────────────────────────────────────
# Backend graph node ids are deterministic: regime--<slug>, macro--<slug>,
# theme--<ontology-id>, sector--<slug>. NOTE: the graph's "sector" nodes are
# built from industry_activation and are industries in the curated taxonomy,
# hence industry:taxonomy:* — a naming quirk of narrative_graph, not a merge.


def _node_uid(node_id: str) -> str | None:
    """Map a backend graph node id to a canonical UID. Returns None for node
    ids outside the known grammar (never guessed)."""
    if node_id.startswith("theme--"):
        return theme_uid(node_id[len("theme--"):])
    if node_id.startswith("macro--"):
        return driver_uid(node_id[len("macro--"):])
    if node_id.startswith("sector--"):
        # backend graph "sector" nodes are curated-industry activations
        return industry_uid(node_id[len("sector--"):])
    if node_id.startswith("regime--"):
        return regime_uid(node_id[len("regime--"):])
    return None


def compute_graph_version(graph: object) -> str:
    """Deterministic content-derived graph version (topology only)."""
    topology = {
        "regime": getattr(graph, "dominant_regime", "") or "",
        "nodes": sorted((n.id, n.type) for n in (getattr(graph, "nodes", []) or [])),
        "edges": sorted((e.source, e.relationship, e.target)
                        for e in (getattr(graph, "edges", []) or [])),
    }
    digest = hashlib.sha256(canonical_json(topology).encode("utf-8")).hexdigest()[:16]
    return f"gv1-{digest}"


def _entity_from_uid(uid: str, display_label: str | None, now_iso: str) -> EntityRecord:
    etype, namespace, key = parse_uid(uid)
    return EntityRecord(uid=uid, entity_type=etype, namespace=namespace,
                        canonical_key=key, display_label=display_label,
                        aliases=[], last_seen_at=now_iso)


# ── Main builder ────────────────────────────────────────────────────────────────

def build_graph_cycle_state(
    feed: object,
    now: datetime,
    *,
    memory_summaries: dict[str, dict] | None = None,
    provenance_extra: dict | None = None,
    cluster_uid_map: dict[str, str] | None = None,
) -> GraphCycleState:
    """Build all M3.2 records for one cycle. Deterministic for a fixed feed."""
    from app.narrative_graph import build_narrative_graph

    graph = build_narrative_graph(feed)
    graph_version = compute_graph_version(graph)
    themes = list(getattr(feed, "theme_intelligence", []) or [])
    activations = list(getattr(feed, "industry_activation", []) or [])
    now_iso = now.isoformat()
    today = now.date().isoformat()

    import os
    provenance = {
        "source": "background_cycle",
        "writer_version": "m3.2.0",
        "deployment_id": os.getenv("RAILWAY_DEPLOYMENT_ID") or "local",
        "graph_version": graph_version,
    }
    if provenance_extra:
        provenance.update(provenance_extra)

    state = GraphCycleState(graph_version=graph_version,
                            regime_label=getattr(graph, "dominant_regime", "") or "")

    entities: dict[str, EntityRecord] = {}

    def register(uid: str, label: str | None) -> None:
        if uid not in entities:
            entities[uid] = _entity_from_uid(uid, label, now_iso)

    # ── entities from graph nodes (themes handled by the M3.1 stage) ─────────
    node_uid_by_id: dict[str, str] = {}
    node_label_by_id: dict[str, str] = {}
    for n in graph.nodes:
        uid = _node_uid(n.id)
        if uid is None:
            log.warning("[institutional-memory:m3.2] unmapped graph node %r — skipped", n.id)
            continue
        node_uid_by_id[n.id] = uid
        node_label_by_id[n.id] = n.label
        if not uid.startswith("theme:"):
            register(uid, n.label)

    # companies from active themes' related_assets (curated tradeable tickers)
    theme_by_id = {getattr(t, "id", None): t for t in themes}
    company_labels: dict[str, str] = {}
    for t in themes:
        for ticker in (getattr(t, "related_assets", []) or []):
            try:
                uid = company_uid(ticker)
            except ValueError:
                continue
            company_labels[uid] = ticker.strip().upper()
            register(uid, company_labels[uid])

    # ── industry activation snapshots (real backend per-industry state) ──────
    for ia in sorted(activations, key=lambda a: a.industry):
        if int(getattr(ia, "score", 0) or 0) <= 0:
            continue
        uid = industry_uid(ia.industry)
        register(uid, ia.industry)
        ia_state = {
            "uid": uid,
            "display_label": ia.industry,
            "active": True,
            "activation_score": int(ia.score),
            "sentiment": getattr(ia, "sentiment", None),
            "momentum_label": getattr(ia, "momentum_label", None),
            "confidence_label": getattr(ia, "confidence_label", None),
            "active_story_count": int(getattr(ia, "active_story_count", 0) or 0),
            "graph_version": graph_version,
        }
        payload = {"state": ia_state, "provenance": provenance, "observed_at": now_iso}
        state.industry_snapshots.append(SnapshotRecord(
            entity_uid=uid,
            snapshot_date=today,
            observed_at=now_iso,
            snapshot_kind=SNAPSHOT_KIND_DAILY,
            schema_version=SCHEMA_VERSION,
            completeness_status=COMPLETENESS_LIVE,
            provenance=provenance,
            payload=payload,
            payload_hash=payload_hash(ia_state),
            graph_version=graph_version,
            conviction=int(ia.score),
            evidence_count=ia_state["active_story_count"],
        ))

    # ── relationship records + snapshots ──────────────────────────────────────
    def theme_evidence_refs(node_or_theme_id: str) -> list[str] | None:
        t = theme_by_id.get(node_or_theme_id)
        if t is None:
            return None
        refs = sorted(getattr(t, "contributing_cluster_ids", []) or [])
        return refs or None

    seen_rels: dict[str, RelationshipSnapshotRecord] = {}

    def add_relationship(source_uid_raw: str, rtype: str, target_uid_raw: str, *,
                         strength: float | None, confidence: float | None,
                         evidence_refs: list[str] | None,
                         evidence_scope: str | None,
                         description: str | None) -> None:
        rel_uid, src, tgt, direction = relationship_uid(source_uid_raw, rtype, target_uid_raw)
        existing = seen_rels.get(rel_uid)
        if existing is not None:
            # duplicate assertion (e.g. symmetric edge from both sides): keep
            # the stronger recorded values; identity is unchanged.
            if strength is not None and (existing.strength or 0) < strength:
                existing.strength = strength
            return
        rel_state = {
            "rel_uid": rel_uid,
            "source_uid": src,
            "target_uid": tgt,
            "relationship_type": rtype,
            "direction": direction,
            "active": True,
            "strength": strength,
            "confidence": confidence,
            "evidence_refs": evidence_refs,
            "evidence_scope": evidence_scope,
            "description": description,
            "graph_version": graph_version,
        }
        payload = {"state": rel_state, "provenance": provenance, "observed_at": now_iso}
        snap = RelationshipSnapshotRecord(
            rel_uid=rel_uid,
            snapshot_date=today,
            observed_at=now_iso,
            snapshot_kind=SNAPSHOT_KIND_DAILY,
            schema_version=SCHEMA_VERSION,
            source_uid=src,
            target_uid=tgt,
            relationship_type=rtype,
            direction=direction,
            completeness_status=COMPLETENESS_LIVE,
            provenance=provenance,
            payload=payload,
            payload_hash=payload_hash(rel_state),
            strength=strength,
            confidence=confidence,
            evidence_count=len(evidence_refs) if evidence_refs else None,
            source_count=None,   # per-edge source counts are not recorded anywhere yet
            evidence_refs=evidence_refs,
            active=True,
            graph_version=graph_version,
        )
        seen_rels[rel_uid] = snap
        state.relationships.append(RelationshipRecord(
            rel_uid=rel_uid, source_uid=src, target_uid=tgt,
            relationship_type=rtype, direction=direction, last_seen_at=now_iso,
        ))

    # recorded backend graph edges, types verbatim
    for e in sorted(graph.edges, key=lambda e: e.id):
        src_uid = node_uid_by_id.get(e.source)
        tgt_uid = node_uid_by_id.get(e.target)
        if not src_uid or not tgt_uid:
            continue
        refs = None
        scope = None
        if e.source.startswith("theme--"):
            refs = theme_evidence_refs(e.source[len("theme--"):])
            scope = "theme_level" if refs else None
        add_relationship(src_uid, e.relationship, tgt_uid,
                         strength=float(e.weight), confidence=float(e.confidence),
                         evidence_refs=refs, evidence_scope=scope,
                         description=e.description or None)

    # theme → company exposure links (curated ontology associations; the edge
    # itself carries no recorded strength — stored as null, never invented)
    for t in sorted(themes, key=lambda t: getattr(t, "id", "") or ""):
        tid = getattr(t, "id", None)
        if not tid:
            continue
        t_uid = theme_uid(tid)
        refs = theme_evidence_refs(tid)
        for ticker in sorted(set(getattr(t, "related_assets", []) or [])):
            try:
                c_uid = company_uid(ticker)
            except ValueError:
                continue
            add_relationship(t_uid, "exposed_to", c_uid,
                             strength=None,
                             confidence=round(int(getattr(t, "confidence", 0) or 0) / 100, 2),
                             evidence_refs=refs,
                             evidence_scope="theme_level" if refs else None,
                             description=None)

    state.relationship_snapshots = [seen_rels[k] for k in sorted(seen_rels)]

    # ── derived narratives (backend re-derivation of the frontend algorithm) ──
    for snap in _derive_narrative_snapshots(themes, now, today, graph_version,
                                            provenance, memory_summaries or {},
                                            cluster_uid_map=cluster_uid_map):
        state.narrative_snapshots.append(snap)
        register(snap.entity_uid, snap.title)

    state.entities = [entities[uid] for uid in sorted(entities)]
    return state


# ── Narrative derivation (mirrors narrativeDerivation.ts semantics) ────────────

def _pairwise_jaccard(sets: list[set[str]]) -> float | None:
    """Average pairwise Jaccard similarity (0-100). None when no pair of
    members both have at least one element (honest absence)."""
    vals: list[float] = []
    for i in range(len(sets)):
        for j in range(i + 1, len(sets)):
            a, b = sets[i], sets[j]
            if not a or not b:
                continue
            inter = len(a & b)
            vals.append(inter / (len(a) + len(b) - inter))
    if not vals:
        return None
    return round(100 * sum(vals) / len(vals), _COHERENCE_ROUND)


def _derive_narrative_snapshots(
    themes: list,
    now: datetime,
    today: str,
    graph_version: str,
    provenance: dict,
    memory_summaries: dict[str, dict],
    *,
    cluster_uid_map: dict[str, str] | None = None,
) -> list[NarrativeSnapshotRecord]:
    """Group themes by shared macro drivers; driver groups with identical
    member sets merge into one narrative keyed by the combined driver set —
    the same construction as frontend deriveNarratives, computed from
    backend-available inputs only."""
    now_iso = now.isoformat()

    driver_members: dict[str, set[str]] = {}     # driver uid → theme ids
    driver_labels: dict[str, str] = {}
    theme_by_id: dict[str, object] = {}
    for t in themes:
        tid = getattr(t, "id", None)
        if not tid:
            continue
        theme_by_id[tid] = t
        for label in (getattr(t, "related_macro_factors", []) or []):
            try:
                d_uid = driver_uid(label)
            except ValueError:
                continue
            driver_members.setdefault(d_uid, set()).add(tid)
            driver_labels.setdefault(d_uid, label)

    groups: dict[str, list[str]] = {}            # member signature → driver uids
    for d_uid in sorted(driver_members):
        members = driver_members[d_uid]
        if len(members) < _MIN_NARRATIVE_MEMBERS:
            continue
        sig = "|".join(sorted(members))
        groups.setdefault(sig, []).append(d_uid)

    drafts: list[dict] = []
    for sig, driver_uids in groups.items():
        member_ids = sig.split("|")
        uid, key = narrative_uid(driver_uids)
        member_uids = sorted(theme_uid(tid) for tid in member_ids)
        member_convictions = [
            {"uid": theme_uid(tid),
             "conviction": int(getattr(theme_by_id[tid], "confidence", 0) or 0)}
            for tid in sorted(member_ids)
        ]
        asset_sets = [set(getattr(theme_by_id[tid], "related_assets", []) or [])
                      for tid in sorted(member_ids)]
        sector_sets = [set(getattr(theme_by_id[tid], "related_industries", []) or [])
                       for tid in sorted(member_ids)]
        asset_overlap = _pairwise_jaccard(asset_sets)
        sector_overlap = _pairwise_jaccard(sector_sets)
        components = [v for v in (asset_overlap, sector_overlap) if v is not None]
        coherence = round(sum(components) / len(components), _COHERENCE_ROUND) if components else None
        evidence_refs = sorted({
            cid for tid in member_ids
            for cid in (getattr(theme_by_id[tid], "contributing_cluster_ids", []) or [])
        }) or None
        # OP2.2 [C8] — durable uids alongside the legacy cluster-id refs
        evidence_uids = sorted({
            (cluster_uid_map or {})[cid] for cid in (evidence_refs or [])
            if cid in (cluster_uid_map or {})
        }) or None
        contradictions = {
            "per_member": [
                {"uid": theme_uid(tid),
                 "contradicting_total": (memory_summaries.get(tid) or {}).get("contradicting_total")}
                for tid in sorted(member_ids)
            ],
            "itemized": None,
        }
        title = " + ".join(driver_labels[d] for d in sorted(driver_uids))
        drafts.append({
            "uid": uid, "key": key, "title": title,
            "driver_uids": sorted(driver_uids),
            "member_uids": member_uids,
            "member_convictions": member_convictions,
            "coherence": coherence,
            "coherence_components": {
                "asset_overlap": asset_overlap,
                "sector_overlap": sector_overlap,
                # member→driver edge strengths exist only in the frontend
                # graph; there is no backend equivalent — stored null.
                "shared_driver_strength": None,
            },
            "evidence_refs": evidence_refs,
            "evidence_uids": evidence_uids,
            "contradictions": contradictions,
        })

    # deterministic ranking: breadth, then coherence, then key (frontend rule)
    drafts.sort(key=lambda d: (-len(d["member_uids"]), -(d["coherence"] or 0), d["key"]))
    drafts = drafts[:_MAX_NARRATIVES]

    snapshots: list[NarrativeSnapshotRecord] = []
    for rank, d in enumerate(drafts, start=1):
        dominance = "dominant" if rank == 1 else "secondary"
        n_state = {
            "uid": d["uid"],
            "driver_set_key": d["key"],
            "title": d["title"],
            "thesis": None,   # no deterministic backend thesis exists — never invented
            "driver_uids": d["driver_uids"],
            "member_uids": d["member_uids"],
            "member_convictions": d["member_convictions"],
            "coherence": d["coherence"],
            "coherence_components": d["coherence_components"],
            "evidence_refs": d["evidence_refs"],
            "evidence_uids": d["evidence_uids"],
            "contradictions": d["contradictions"],
            "dominance_status": dominance,
            "rank": rank,
            "active": True,
            "graph_version": graph_version,
        }
        payload = {"state": n_state, "provenance": provenance, "observed_at": now_iso}
        snapshots.append(NarrativeSnapshotRecord(
            entity_uid=d["uid"],
            snapshot_date=today,
            observed_at=now_iso,
            snapshot_kind=SNAPSHOT_KIND_DAILY,
            schema_version=SCHEMA_VERSION,
            driver_set_key=d["key"],
            member_uids=d["member_uids"],
            completeness_status=COMPLETENESS_LIVE,
            provenance=provenance,
            payload=payload,
            payload_hash=payload_hash(n_state),
            title=d["title"],
            thesis=None,
            member_convictions=d["member_convictions"],
            coherence=d["coherence"],
            coherence_components=d["coherence_components"],
            evidence_refs=d["evidence_refs"],
            contradictions=d["contradictions"],
            dominance_status=dominance,
            rank=rank,
            graph_version=graph_version,
        ))
    return snapshots
