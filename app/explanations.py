"""
app/explanations.py — IRE-1: canonical backend Explanation assembly.

ARGUS_INSTITUTIONAL_REASONING_ENGINE_V1 (M7.0), first production layer. One
Explanation object per admitted MarketEvent, built at the spine, consumed by
every surface. Stages implemented here:

    R0 Identify     — what happened, to whom (recorded facts only)
    R1 Corroborate  — how we know (the Wire desk's work, consumed verbatim)
    R2 Locate       — where it sits in the model (typed transmission chains of
                      recorded/curated hops with relationship UIDs — the
                      replacement for the MarketEvent.transmission prose)
    R3 Assess       — what it changes AND what cuts against it (symmetric)

Stages R4 (memory), R5 (stakes) and R6's falsifier attachment are reserved:
their sections ship as honest `gated` states — never synthesized, never
padded, never filled with prose.

Every Explanation carries all nine contract sections (identity, evidence,
position, delta, counter, confidence, memory, stakes, falsifiers), each with
an explicit status from the closed vocabulary below. No section is ever
silently omitted.

Laws (from the M7.0 contract):
  • Deterministic: same inputs, byte-identical output (content-hashed; no
    wall clock, no randomness, no LLM).
  • Every hop in a transmission chain is a recorded graph edge or a curated
    ontology association, carrying its relationship UID; nothing is invented.
  • Counterevidence is searched with the same machinery as support, and its
    absence is stated, never implied ("no counterevidence" is a coverage
    statement, not proof of consensus).
  • "No material change" is a complete, first-class answer.
  • Predictions are never evidence: nothing from the prediction ledger may
    inform any section here (stakes will REPORT ledger entries in IRE-4/5).
  • Confidence is a decomposed verdict band, capped by contradictions and by
    the weakest transmission hop; no probability is ever issued.

Pure module: no I/O, no Supabase, no imports with side effects.
"""

from __future__ import annotations

import hashlib
import logging
from dataclasses import dataclass, field

from app.institutional_memory.identity import (
    company_uid,
    driver_uid,
    industry_uid,
    regime_uid,
    relationship_uid,
    theme_uid,
)
from app.institutional_memory.models import canonical_json

log = logging.getLogger(__name__)

EXPLANATION_SCHEMA_VERSION = 1
ENGINE_VERSION = "ire-1.0"

# ── Status vocabulary (closed set — the IRE-1 contract) ───────────────────────

STATUS_AVAILABLE = "available"
STATUS_INSUFFICIENT = "insufficient_evidence"
STATUS_NOT_APPLICABLE = "not_applicable"
STATUS_CONFLICTING = "conflicting"
STATUS_UNAVAILABLE = "unavailable"
STATUS_GATED = "gated"
STATUS_UNCHANGED = "unchanged"
STATUS_DEVELOPING = "developing"

STATUSES = frozenset({
    STATUS_AVAILABLE, STATUS_INSUFFICIENT, STATUS_NOT_APPLICABLE,
    STATUS_CONFLICTING, STATUS_UNAVAILABLE, STATUS_GATED,
    STATUS_UNCHANGED, STATUS_DEVELOPING,
})

SECTION_NAMES = (
    "identity", "evidence", "position", "delta", "counter",
    "confidence", "memory", "stakes", "falsifiers",
)

# Material-change deadband, in conviction points: mirrors ThemeMemory's
# _TREND_DELTA and the momentum tracker's "stable" band (±3). A move must
# EXCEED the deadband to count as material.
MATERIAL_DELTA = 3

# Verdict bands, weakest to strongest (shared grammar with the evidence
# engine's frontend verdicts; numbers are deliberately absent — a band plus
# its decomposition, never fake precision).
BAND_INSUFFICIENT = "insufficient_signal"
BAND_WEAK = "weak"
BAND_MODERATE = "moderate"
BAND_STRONG = "strong"
_BAND_ORDER = [BAND_INSUFFICIENT, BAND_WEAK, BAND_MODERATE, BAND_STRONG]


def event_uid(event_id: str) -> str:
    """Canonical Market Event UID (KNOWLEDGE_MODEL V1 decision 1): the
    namespace wraps the existing cluster id losslessly."""
    return f"event:cluster:{event_id}"


# ── Contract objects ───────────────────────────────────────────────────────────

@dataclass
class Section:
    """One status-wrapped Explanation section. `data` is structure, never
    prose paragraphs; `note` states the honesty context in one sentence."""
    status: str
    data: dict = field(default_factory=dict)
    note: str = ""

    def to_dict(self) -> dict:
        return {"status": self.status, "data": self.data, "note": self.note}


@dataclass
class Explanation:
    """The canonical Explanation for one admitted MarketEvent."""
    event_id: str
    event_uid: str
    sections: dict[str, Section]
    provenance: dict
    schema_version: int = EXPLANATION_SCHEMA_VERSION
    engine_version: str = ENGINE_VERSION
    content_hash: str = ""

    def to_dict(self) -> dict:
        return {
            "event_id": self.event_id,
            "event_uid": self.event_uid,
            "schema_version": self.schema_version,
            "engine_version": self.engine_version,
            "sections": {k: s.to_dict() for k, s in self.sections.items()},
            "provenance": self.provenance,
            "content_hash": self.content_hash,
        }


# ── Graph indexing (read-only; the recorded backend graph, verbatim) ──────────

def _node_uid(node_id: str) -> str | None:
    """Backend graph node id → canonical UID (same grammar as the M3.2 graph
    adapter; sector-- nodes are curated-industry activations). None for
    anything outside the known grammar — never guessed."""
    try:
        if node_id.startswith("theme--"):
            return theme_uid(node_id[len("theme--"):])
        if node_id.startswith("macro--"):
            return driver_uid(node_id[len("macro--"):])
        if node_id.startswith("sector--"):
            return industry_uid(node_id[len("sector--"):])
        if node_id.startswith("regime--"):
            return regime_uid(node_id[len("regime--"):])
    except ValueError:
        return None
    return None


class _GraphIndex:
    """Pre-indexed view of one NarrativeGraphResponse (duck-typed)."""

    def __init__(self, graph: object | None) -> None:
        self.present = graph is not None
        self.regime_label: str = (getattr(graph, "dominant_regime", "") or "") if graph else ""
        self.nodes_by_id: dict[str, object] = {}
        self.edges_into: dict[str, list] = {}
        for n in (getattr(graph, "nodes", []) or []):
            self.nodes_by_id[n.id] = n
        for e in sorted((getattr(graph, "edges", []) or []), key=lambda e: e.id):
            self.edges_into.setdefault(e.target, []).append(e)
        self.graph_version: str | None = None
        if graph is not None:
            try:
                from app.institutional_memory.graph_adapter import compute_graph_version
                self.graph_version = compute_graph_version(graph)
            except Exception:                      # pragma: no cover - defensive
                self.graph_version = None

    def upstream_hops(self, theme_id: str) -> list[dict]:
        """Recorded edges into a theme node, as typed hops (verbatim types,
        rel UIDs preserved). Ordering is deterministic (edge id sort above)."""
        node_id = f"theme--{theme_id}"
        t_uid = theme_uid(theme_id)
        hops: list[dict] = []
        for e in self.edges_into.get(node_id, []):
            src_uid = _node_uid(e.source)
            if src_uid is None:
                continue
            try:
                rel_uid, src, tgt, _direction = relationship_uid(src_uid, e.relationship, t_uid)
            except ValueError:
                continue
            src_node = self.nodes_by_id.get(e.source)
            hops.append({
                "source_uid": src,
                "relationship": e.relationship,          # verbatim, never mapped
                "target_uid": tgt,
                "rel_uid": rel_uid,
                "basis": "recorded_graph",
                "strength": float(getattr(e, "weight", 0.0) or 0.0),
                "confidence": float(getattr(e, "confidence", 0.0) or 0.0),
                "source_label": getattr(src_node, "label", None) if src_node else None,
            })
        return hops

    def pressures_into(self, theme_id: str) -> list[dict]:
        """Recorded `pressures` edges into a theme node — the recorded
        counter-structure for R3's symmetric search."""
        return [h for h in self.upstream_hops(theme_id) if h["relationship"] == "pressures"]


# ── Section builders (R0-R3) ───────────────────────────────────────────────────

def _identity_section(event: object, linked: list) -> Section:
    """R0 — recorded facts only. Attribution is explicit and never inferred:
    direct = resolver-named; everything else names the recorded reason
    (theme exposure) or is honestly `unattributed` (EI1.1 doctrine)."""
    direct = list(getattr(event, "companies_direct", []) or [])
    attribution: list[dict] = []
    for c in direct:
        attribution.append({"company": c, "uid": company_uid(c), "class": "direct"})
    for c in (getattr(event, "companies", []) or []):
        if c in direct:
            continue
        via = sorted(
            t.name for t in linked
            if c in (getattr(t, "related_assets", None) or [])
        )
        attribution.append({
            "company": c,
            "uid": company_uid(c),
            "class": "theme_exposure" if via else "unattributed",
            "reason": f"Theme exposure: {via[0]}" if via else None,
        })
    data = {
        "event_uid": event_uid(event.id),
        "title": event.title,
        "event_type": event.event_type,
        "lane": "developing" if getattr(event, "developing", False) else "corroborated",
        "first_seen": event.first_seen,
        "last_updated": event.last_updated,
        "reporting_period": getattr(event, "reporting_period", None),
        "subjects": {
            "companies": [a["uid"] for a in attribution],
            "industries": sorted(
                industry_uid(i) for i in (getattr(event, "industries", None) or [])
            ),
            "themes": [theme_uid(t.id) for t in linked],
        },
        "attribution": attribution,
    }
    return Section(STATUS_AVAILABLE, data,
                   note="Recorded event facts; attribution classes are recorded reasons, never inferred.")


def _evidence_section(event: object) -> Section:
    """R1 — the Wire desk's corroboration, consumed verbatim. Evidence
    references are the cluster ids the archive already records."""
    items = [
        {
            "source": e.source, "title": e.title, "url": e.url,
            "published": e.published, "tier": e.tier,
            "kind": getattr(e, "kind", "news"),
            "qualified": bool(getattr(e, "qualified", False)),
        }
        for e in (getattr(event, "evidence", None) or [])
    ]
    # E5 specificity upgrade mirrors the editorial scorer: a qualified tier-3
    # specialist earns tier-2 treatment.
    best_tier = min(
        (2 if (i["tier"] == 3 and i["qualified"]) else i["tier"] for i in items),
        default=4)
    corroboration = int(getattr(event, "corroboration_count", 0) or 0)
    data = {
        "items": items,
        "source_count": int(getattr(event, "source_count", 0) or 0),
        "corroboration_count": corroboration,
        "best_tier": best_tier,
        "evidence_refs": [event.id, *list(getattr(event, "merged_event_ids", []) or [])],
    }
    if corroboration <= 0:
        return Section(STATUS_INSUFFICIENT, data,
                       note="No qualified source. Below the admission bar; nothing may be asserted from this record.")
    if corroboration == 1:
        return Section(STATUS_DEVELOPING, data,
                       note="One qualified source; not yet corroborated. Promoted automatically when a second qualified source lands.")
    return Section(STATUS_AVAILABLE, data,
                   note=f"{corroboration} distinct qualified sources; independence counted by source, not by article.")


def _position_section(event: object, linked: list, gix: _GraphIndex) -> Section:
    """R2 — the event's location in the model: linked themes, regime context,
    and typed transmission chains (driver → theme → exposed company), every
    hop a recorded graph edge or a curated ontology association with its
    relationship UID. Replaces the `transmission` prose string."""
    regime = (
        {"label": gix.regime_label, "uid": regime_uid(gix.regime_label)}
        if gix.present and gix.regime_label else None
    )
    if not linked:
        return Section(
            STATUS_NOT_APPLICABLE,
            {"themes": [], "chains": [], "regime": regime},
            note="Not connected to any active recorded theme. A finding, not a failure: this event feeds no standing thesis.")

    themes_data = [
        {
            "uid": theme_uid(t.id),
            "name": t.name,
            "confidence": int(getattr(t, "confidence", 0) or 0),
            "momentum_label": getattr(t, "momentum_label", "") or "",
            "signal_quality": getattr(t, "signal_quality", "") or "",
        }
        for t in linked
    ]

    event_companies = list(getattr(event, "companies", []) or [])
    direct = set(getattr(event, "companies_direct", []) or [])
    chains: list[dict] = []
    for t in linked[:3]:
        t_uid = theme_uid(t.id)
        hops = gix.upstream_hops(t.id) if gix.present else []
        # Downstream: only companies this event actually touches AND the
        # curated ontology exposes through this theme — resolver-named
        # companies first, then theme-transmitted, capped for legibility.
        exposed = [c for c in event_companies
                   if c in (getattr(t, "related_assets", None) or [])]
        exposed.sort(key=lambda c: (c not in direct, c))
        theme_conf = round(int(getattr(t, "confidence", 0) or 0) / 100, 2)
        for c in exposed[:3]:
            c_uid = company_uid(c)
            rel_uid, src, tgt, _d = relationship_uid(t_uid, "exposed_to", c_uid)
            hops.append({
                "source_uid": src,
                "relationship": "exposed_to",
                "target_uid": tgt,
                "rel_uid": rel_uid,
                "basis": "curated_ontology",
                "strength": None,          # the curated link records no strength — never invented
                "confidence": theme_conf,
                "source_label": t.name,
            })
        if hops:
            hop_confs = [h["confidence"] for h in hops if h["confidence"] is not None]
            chains.append({
                "theme_uid": t_uid,
                "theme": t.name,
                "hops": hops,
                # weakest-hop rule: a chain is as strong as its weakest recorded hop
                "weakest_hop_confidence": min(hop_confs) if hop_confs else None,
            })

    data = {"themes": themes_data, "chains": chains, "regime": regime}
    if not chains:
        return Section(
            STATUS_INSUFFICIENT, data,
            note="Linked to recorded themes but no transmission hop is recorded for this event (no recorded upstream edge; no exposed company named by the event).")
    return Section(STATUS_AVAILABLE, data,
                   note="Every hop is a recorded graph edge or a curated ontology association, carried with its relationship UID.")


def _delta_section(linked: list) -> Section:
    """R3a — what the record says changed on the themes this event feeds.
    Reads recorded per-cycle trend state; recomputes nothing."""
    if not linked:
        return Section(STATUS_NOT_APPLICABLE, {"changes": [], "deadband": MATERIAL_DELTA},
                       note="No linked theme; there is no recorded state for this event to change.")
    changes = []
    any_known = False
    for t in linked:
        delta = getattr(t, "momentum_delta", None)
        if delta is None:
            continue
        any_known = True
        changes.append({
            "theme_uid": theme_uid(t.id),
            "theme": t.name,
            "momentum_delta": int(delta),
            "momentum_label": getattr(t, "momentum_label", "") or "",
            "material": abs(int(delta)) > MATERIAL_DELTA,
        })
    data = {"changes": changes, "deadband": MATERIAL_DELTA}
    if not any_known:
        return Section(STATUS_UNAVAILABLE, data,
                       note="Linked themes carry no recorded trend delta this cycle.")
    material = [c for c in changes if c["material"]]
    if material:
        return Section(STATUS_AVAILABLE, data,
                       note=f"{len(material)} linked theme(s) moved beyond the ±{MATERIAL_DELTA} deadband this cycle.")
    return Section(STATUS_UNCHANGED, data,
                   note=f"No material change: every linked theme is within the ±{MATERIAL_DELTA} point deadband this cycle. A complete answer, not a gap.")


# The searches the symmetric pass actually executes — stated in the output so
# "no counterevidence" is always a claim about THESE searches, nothing more.
_COUNTER_SEARCHES = ["recorded_pressures_edges", "recorded_theme_trend_deltas"]


def _counter_section(linked: list, gix: _GraphIndex) -> Section:
    """R3b — the symmetric search. Counterevidence is looked for with the
    same machinery as support: recorded `pressures` edges into the themes
    this event feeds, and recorded weakening trends on those same themes."""
    if not linked:
        return Section(STATUS_NOT_APPLICABLE,
                       {"searched": _COUNTER_SEARCHES, "items": []},
                       note="No linked theme; the event asserts no thesis for the record to cut against.")
    items: list[dict] = []
    for t in linked:
        if gix.present:
            for hop in gix.pressures_into(t.id):
                items.append({
                    "kind": "recorded_pressure",
                    "rel_uid": hop["rel_uid"],
                    "source_uid": hop["source_uid"],
                    "source_label": hop["source_label"],
                    "target_uid": hop["target_uid"],
                    "theme": t.name,
                    "strength": hop["strength"],
                    "confidence": hop["confidence"],
                    "basis": "recorded_graph",
                })
        delta = getattr(t, "momentum_delta", None)
        if delta is not None and int(delta) < -MATERIAL_DELTA:
            items.append({
                "kind": "recorded_weakening_trend",
                "theme_uid": theme_uid(t.id),
                "theme": t.name,
                "momentum_delta": int(delta),
                "momentum_label": getattr(t, "momentum_label", "") or "",
                "basis": "recorded_trend",
            })
    data = {"searched": _COUNTER_SEARCHES, "items": items}
    if items:
        return Section(STATUS_CONFLICTING, data,
                       note="Recorded counterevidence exists against a thesis this event feeds; the confidence verdict is capped accordingly.")
    return Section(STATUS_INSUFFICIENT, data,
                   note="Symmetric search executed (recorded pressures edges; recorded trend deltas); no recorded counterevidence found. Absence of recorded counterevidence is a coverage statement, not proof of consensus.")


def _confidence_section(evidence: Section, position: Section,
                        counter: Section) -> Section:
    """R6 (partial) — the decomposed verdict band over R1-R3. Bands, not
    numbers; every input named; contradictions cap; the weakest hop caps a
    chain claim. Predictions are never inputs. No probability is issued."""
    corroboration = evidence.data.get("corroboration_count", 0)
    best_tier = evidence.data.get("best_tier", 4)
    weakest = None
    for chain in position.data.get("chains", []):
        w = chain.get("weakest_hop_confidence")
        if w is not None:
            weakest = w if weakest is None else min(weakest, w)

    if corroboration <= 0:
        band = BAND_INSUFFICIENT
    elif corroboration == 1:
        band = BAND_WEAK
    elif corroboration >= 3 and best_tier <= 2 and position.status == STATUS_AVAILABLE:
        band = BAND_STRONG
    else:
        band = BAND_MODERATE

    cap = None
    if counter.status == STATUS_CONFLICTING and _BAND_ORDER.index(band) > _BAND_ORDER.index(BAND_MODERATE):
        cap = {
            "capped_to": BAND_MODERATE,
            "reason": "Unresolved recorded counterevidence caps the verdict (contradictions cap; they never merely subtract).",
        }
        band = BAND_MODERATE

    factors = [
        {"factor": "corroboration", "value": corroboration,
         "detail": "distinct qualified sources; independence beats repetition"},
        {"factor": "best_evidence_tier", "value": best_tier,
         "detail": "best source tier in the cluster (qualified tier-3 specificity earns tier-2 treatment)"},
        {"factor": "transmission_weakest_hop", "value": weakest,
         "detail": "a chain claim is capped by its weakest recorded hop"},
        {"factor": "contradiction_cap", "value": cap is not None,
         "detail": "recorded counterevidence caps the verdict at moderate"},
    ]
    data = {
        "band": band,
        "factors": factors,
        "cap": cap,
        "basis_sections": ["evidence", "position", "counter"],
        "probability": None,   # no decomposable canonical method exists; never issued
    }
    if band == BAND_INSUFFICIENT:
        return Section(STATUS_INSUFFICIENT, data,
                       note="Below the evidence floor: a state, not a small number.")
    if cap is not None:
        return Section(STATUS_CONFLICTING, data,
                       note="Verdict capped by recorded counterevidence; both sides are cited in the counter section.")
    return Section(STATUS_AVAILABLE, data,
                   note="Verdict band with full decomposition. Predictions are never inputs; no probability is issued.")


def _gated(note: str) -> Section:
    return Section(STATUS_GATED, {}, note=note)


# ── Assembly ───────────────────────────────────────────────────────────────────

def build_explanation(event: object, themes_by_id: dict[str, object],
                      gix: _GraphIndex) -> Explanation:
    """Assemble the canonical Explanation for one admitted MarketEvent.
    Pure and deterministic for fixed inputs."""
    linked = [themes_by_id[tid] for tid in (getattr(event, "theme_ids", None) or [])
              if tid in themes_by_id]
    linked.sort(key=lambda t: (-(getattr(t, "confidence", 0) or 0), t.id))

    identity = _identity_section(event, linked)
    evidence = _evidence_section(event)
    position = _position_section(event, linked, gix)
    delta = _delta_section(linked)
    counter = _counter_section(linked, gix)
    confidence = _confidence_section(evidence, position, counter)

    sections = {
        "identity": identity,
        "evidence": evidence,
        "position": position,
        "delta": delta,
        "counter": counter,
        "confidence": confidence,
        "memory": _gated(
            "Reserved (IRE-4): archive context and gated analogs (M3.4) are not consumed at assembly time. Nothing is synthesized in their place."),
        "stakes": _gated(
            "Reserved (IRE-4/5): prediction-ledger linkage. Predictions are never treated as evidence; when this section ships it reports stakes, never inputs."),
        "falsifiers": _gated(
            "Reserved (IRE-2): recorded invalidation conditions and weakens-edges. No recorded falsifier is attached yet — a stated weakness (humility rule), never an implied endorsement."),
    }

    provenance = {
        "engine_version": ENGINE_VERSION,
        "schema_version": EXPLANATION_SCHEMA_VERSION,
        "event_id": event.id,
        "theme_ids": sorted(getattr(event, "theme_ids", None) or []),
        "graph_version": gix.graph_version,
    }
    explanation = Explanation(
        event_id=event.id,
        event_uid=event_uid(event.id),
        sections=sections,
        provenance=provenance,
    )
    hash_basis = {
        "event_uid": explanation.event_uid,
        "sections": {k: s.to_dict() for k, s in sections.items()},
        "provenance": provenance,
    }
    explanation.content_hash = hashlib.sha256(
        canonical_json(hash_basis).encode("utf-8")).hexdigest()[:32]
    return explanation


def build_explanations(events: list, themes: list,
                       graph: object | None = None) -> dict[str, Explanation]:
    """Build the canonical Explanation for every admitted event and populate
    each event's typed `transmission_chain` (the strongest theme's chain; the
    legacy `transmission` prose string is retained untouched for
    compatibility). Returns {event_id: Explanation}."""
    themes_by_id = {getattr(t, "id", None): t for t in (themes or [])}
    themes_by_id.pop(None, None)
    gix = _GraphIndex(graph)

    out: dict[str, Explanation] = {}
    for event in (events or []):
        try:
            ex = build_explanation(event, themes_by_id, gix)
        except Exception:
            log.exception("[explanations] assembly failed for event %s — skipped",
                          getattr(event, "id", "?"))
            continue
        out[event.id] = ex
        chains = ex.sections["position"].data.get("chains", [])
        if hasattr(event, "transmission_chain"):
            event.transmission_chain = chains[0]["hops"] if chains else []
    if out:
        log.info("[explanations] built %d explanations (engine %s)", len(out), ENGINE_VERSION)
    return out
