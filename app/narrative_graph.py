"""
app/narrative_graph.py — Market Narrative Network graph builder.

Builds a curated, analyst-readable graph from the live ProcessedFeed cache.
No LLM calls.  Deterministic IDs.  Node/edge caps enforced.

Node budget (V1):
  1  regime node
  ≤4 macro factor nodes
  ≤6 theme driver nodes
  ≤7 sector/industry impact nodes
  ── max 18 total ──
Edge cap: 25
Chain cap: 5
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from app.processed_cache import ProcessedFeed

log = logging.getLogger(__name__)

_NON_ALNUM = re.compile(r"[^\w]+")


def _slug(text: str) -> str:
    return _NON_ALNUM.sub("-", text.lower()).strip("-")


# ── Data models ───────────────────────────────────────────────────────────────

@dataclass
class GraphNode:
    id:           str
    label:        str
    type:         str       # "regime" | "macro" | "theme" | "sector" | "asset"
    strength:     float     # 0–100
    sentiment:    str       # "bullish" | "bearish" | "neutral" | "mixed"
    description:  str
    source_count: int
    confidence:   float     # 0–100


@dataclass
class GraphEdge:
    id:           str
    source:       str
    target:       str
    relationship: str       # "drives" | "pressures" | "supports" | "benefits" | "correlates" | "rotates_into"
    weight:       float     # 0–1
    confidence:   float     # 0–1
    description:  str


@dataclass
class PropagationChain:
    id:         str
    title:      str
    confidence: float       # 0–100
    nodes:      list[str]   # ordered node IDs
    summary:    str


@dataclass
class NarrativeGraphResponse:
    dominant_regime: str
    nodes:           list[GraphNode]   = field(default_factory=list)
    edges:           list[GraphEdge]   = field(default_factory=list)
    chains:          list[PropagationChain] = field(default_factory=list)
    generated_at:    str               = ""
    source_count:    int               = 0


# ── Regime helpers ─────────────────────────────────────────────────────────────

_REGIME_SENTIMENT: dict[str, str] = {
    "AI Capex Expansion":          "bullish",
    "Risk-On Expansion":           "bullish",
    "Commodity Expansion":         "bullish",
    "Energy Infrastructure Cycle": "bullish",
    "Energy Supply Risk":          "neutral",
    "Macro Stabilization":         "neutral",
    "Neutral/Consolidating":       "neutral",
    "Risk-On Neutral":             "bullish",
    "Risk-On Dovish":              "bullish",
    "Yield Shock":                 "bearish",
    "Liquidity Tightening":        "bearish",
    "Defensive Rotation":          "bearish",
    "Geopolitical Premium":        "bearish",
    "Inflation Pressure":          "bearish",
    "Risk-Off Hawkish":            "bearish",
    "Risk-Off Neutral":            "bearish",
    "Stagflationary":              "bearish",
}

_REGIME_DESCRIPTION: dict[str, str] = {
    "AI Capex Expansion":          "AI infrastructure spending cycle is driving cross-sector allocation shifts and power demand.",
    "Risk-On Expansion":           "Risk appetite is expanding — macro conditions support growth assets and broad equity beta.",
    "Commodity Expansion":         "Commodity prices are in an expansionary cycle driven by supply constraints and demand.",
    "Energy Infrastructure Cycle": "Energy infrastructure investment is accelerating across nuclear and grid capacity.",
    "Energy Supply Risk":          "Energy supply constraints are elevating commodity prices and the geopolitical risk premium.",
    "Macro Stabilization":         "Markets are consolidating as macro signals remain mixed without clear directional conviction.",
    "Neutral/Consolidating":       "Markets are consolidating with no dominant macro thesis driving institutional positioning.",
    "Yield Shock":                 "Rising Treasury yields are repricing risk assets and pressuring rate-sensitive sectors.",
    "Liquidity Tightening":        "Credit conditions are tightening as monetary policy transmission accelerates across markets.",
    "Defensive Rotation":          "Capital is rotating toward defensive sectors as growth and earnings expectations soften.",
    "Geopolitical Premium":        "Geopolitical risk premium is being priced into energy, defense, and safe-haven assets.",
    "Inflation Pressure":          "Persistent inflation is compressing consumer margins and real purchasing power.",
    "Risk-Off Hawkish":            "Risk-off conditions with hawkish central bank guidance are pressuring duration and growth assets.",
    "Risk-Off Neutral":            "Risk appetite is contracting — defensive positioning and cash are outperforming.",
    "Risk-On Dovish":              "Dovish policy expectations are fuelling re-rating in rate-sensitive and growth sectors.",
    "Risk-On Neutral":             "Constructive macro backdrop with selective risk appetite across growth assets.",
    "Stagflationary":              "Stagflationary conditions — simultaneous inflation and growth deceleration — are compressing multiples.",
}


def _regime_sentiment(regime: str) -> str:
    return _REGIME_SENTIMENT.get(regime, "neutral")


def _regime_description(regime: str, sd: object | None) -> str:
    base = _REGIME_DESCRIPTION.get(regime, f"Current market regime: {regime}.")
    dominant = getattr(sd, "dominant_sector", None) if sd else None
    if dominant:
        base += f" {dominant} is the leading sector by signal intensity."
    return base


# ── Graph builder ─────────────────────────────────────────────────────────────

def build_narrative_graph(entry: "ProcessedFeed") -> NarrativeGraphResponse:
    """
    Build a curated narrative network from a ProcessedFeed cache entry.

    Priority:
      1. Regime node (always present)
      2. Top themes by confidence (strong/medium, conf ≥ 20)
      3. Macro factors extracted from top themes (by cross-theme frequency)
      4. Activated industries/sectors (score > 0, sorted by score)

    Edges (all deduplicated):
      regime  → macro         "drives"
      macro   → theme         "drives"
      theme   → sector        "supports" | "pressures" | "drives"
      theme   → theme         "correlates"  (strong overlap only)
      sector  → sector        "rotates_into"  (rotation signals)
    """
    now = datetime.now(timezone.utc).isoformat()

    sd  = getattr(entry, "sector_data",       None)
    mb  = getattr(entry, "market_brief",      None)
    raw_themes      = getattr(entry, "theme_intelligence",  []) or []
    raw_activations = getattr(entry, "industry_activation", []) or []
    raw_items       = getattr(entry, "items",               []) or []

    # ── Regime ────────────────────────────────────────────────────────────────
    regime_label = (
        (getattr(sd, "derived_regime", "") or "").strip()
        or (getattr(mb, "market_regime", "") or "").strip()
        or "Neutral/Consolidating"
    )
    regime_id   = f"regime--{_slug(regime_label)}"
    nodes: list[GraphNode] = [
        GraphNode(
            id           = regime_id,
            label        = regime_label,
            type         = "regime",
            strength     = 100.0,
            sentiment    = _regime_sentiment(regime_label),
            description  = _regime_description(regime_label, sd),
            source_count = len(raw_items),
            confidence   = 100.0,
        )
    ]

    # ── Top themes ─────────────────────────────────────────────────────────────
    top_themes = sorted(
        [t for t in raw_themes if t.signal_strength != "weak" and t.confidence >= 20],
        key=lambda t: t.confidence,
        reverse=True,
    )[:6]

    theme_node_ids: dict[str, str] = {}   # theme_id → node_id
    for t in top_themes:
        nid = f"theme--{t.id}"
        theme_node_ids[t.id] = nid
        nodes.append(GraphNode(
            id           = nid,
            label        = t.name,
            type         = "theme",
            strength     = float(t.confidence),
            sentiment    = t.momentum_direction,
            description  = t.description,
            source_count = t.contributing_story_count,
            confidence   = float(t.confidence),
        ))

    # ── Macro factor nodes (by cross-theme frequency) ─────────────────────────
    macro_freq: dict[str, int]        = {}
    theme_macros: dict[str, list[str]] = {}  # theme_id → macros
    for t in top_themes:
        macros = (t.related_macro_factors or [])[:3]
        theme_macros[t.id] = macros
        for m in macros:
            macro_freq[m] = macro_freq.get(m, 0) + 1

    top_macros = sorted(macro_freq, key=macro_freq.__getitem__, reverse=True)[:4]
    macro_node_ids: dict[str, str] = {}  # macro_name → node_id
    for macro in top_macros:
        mid = f"macro--{_slug(macro)}"
        macro_node_ids[macro] = mid
        nodes.append(GraphNode(
            id           = mid,
            label        = macro,
            type         = "macro",
            strength     = min(100.0, macro_freq[macro] * 25.0),
            sentiment    = "neutral",
            description  = f"Macro driver: {macro}",
            source_count = macro_freq[macro],
            confidence   = min(100.0, macro_freq[macro] * 25.0),
        ))

    # ── Sector / industry nodes (activated, score > 0) ────────────────────────
    active_industries = sorted(
        [ia for ia in raw_activations if ia.score > 0],
        key=lambda ia: ia.score,
        reverse=True,
    )[:7]

    sector_node_ids: dict[str, str] = {}  # industry_name → node_id
    for ia in active_industries:
        sid = f"sector--{_slug(ia.industry)}"
        sector_node_ids[ia.industry] = sid
        nodes.append(GraphNode(
            id           = sid,
            label        = ia.industry,
            type         = "sector",
            strength     = float(ia.score),
            sentiment    = ia.sentiment,
            description  = (
                f"{ia.industry}: {ia.confidence_label} signal, "
                f"{ia.momentum_label} momentum — "
                f"{ia.active_story_count} active stories."
            ),
            source_count = ia.active_story_count,
            confidence   = float(ia.score),
        ))

    # Enforce node cap
    nodes = nodes[:18]
    node_id_set = {n.id for n in nodes}

    # ── Edges ─────────────────────────────────────────────────────────────────
    edges: list[GraphEdge] = []
    _edge_ids: set[str] = set()

    def _add_edge(
        src: str, tgt: str, rel: str,
        weight: float, conf: float, desc: str,
    ) -> None:
        if src not in node_id_set or tgt not in node_id_set:
            return
        if src == tgt:
            return
        eid = f"{src}--{rel}--{tgt}"
        if eid in _edge_ids:
            return
        _edge_ids.add(eid)
        edges.append(GraphEdge(
            id           = eid,
            source       = src,
            target       = tgt,
            relationship = rel,
            weight       = round(min(weight, 1.0), 3),
            confidence   = round(min(conf,   1.0), 3),
            description  = desc,
        ))

    # Regime → macro factors
    for macro, mid in macro_node_ids.items():
        _add_edge(
            regime_id, mid, "drives",
            weight=0.80, conf=0.85,
            desc=f"{regime_label} is driving {macro}.",
        )

    # Macro → themes (max 2 macro→theme edges per theme)
    for t in top_themes:
        tnid = theme_node_ids.get(t.id)
        if not tnid or tnid not in node_id_set:
            continue
        linked_macros = [m for m in theme_macros.get(t.id, []) if m in macro_node_ids]
        for macro in linked_macros[:2]:
            mid = macro_node_ids[macro]
            _add_edge(
                mid, tnid, "drives",
                weight=0.75,
                conf=round(t.confidence / 100, 2),
                desc=f"{macro} is driving {t.name}.",
            )

    # Theme → sector (max 2 per theme, based on relationship_weights direction)
    for t in top_themes:
        tnid = theme_node_ids.get(t.id)
        if not tnid or tnid not in node_id_set:
            continue
        linked = [
            ind for ind in (t.related_industries or [])
            if ind in sector_node_ids and sector_node_ids[ind] in node_id_set
        ]
        added = 0
        for ind in linked:
            if added >= 2:
                break
            rel_data  = (t.relationship_weights or {}).get(ind, {})
            direction = rel_data.get("direction", "")
            w         = float(rel_data.get("weight", 0.5))
            rel = (
                "supports"  if direction == "positive" else
                "pressures" if direction == "negative" else
                "drives"
            )
            _add_edge(
                tnid, sector_node_ids[ind], rel,
                weight=w,
                conf=round(t.confidence / 100, 2),
                desc=f"{t.name} {rel} {ind}.",
            )
            added += 1

    # Theme ↔ theme correlations (strong overlap: 3+ shared industries)
    for i, ta in enumerate(top_themes):
        nid_a = theme_node_ids.get(ta.id)
        if not nid_a or nid_a not in node_id_set:
            continue
        for tb in top_themes[i + 1:]:
            nid_b = theme_node_ids.get(tb.id)
            if not nid_b or nid_b not in node_id_set:
                continue
            shared = set(ta.related_industries or []) & set(tb.related_industries or [])
            if len(shared) >= 3:
                _add_edge(
                    nid_a, nid_b, "correlates",
                    weight=round(len(shared) / 10, 2),
                    conf=round(min(ta.confidence, tb.confidence) / 100, 2),
                    desc=f"{ta.name} and {tb.name} overlap across {', '.join(list(shared)[:2])}.",
                )

    # Rotation signals: sector → sector (max 2)
    rotation_signals = getattr(sd, "rotation_signals", []) if sd else []
    added_rotations = 0
    for r in rotation_signals:
        if added_rotations >= 2:
            break
        # Rotation signals use GICS sector names; find matching industry node if any
        from_nid = sector_node_ids.get(r.from_sector)
        to_nid   = sector_node_ids.get(r.to_sector)
        # Fall back: scan nodes whose labels contain the sector name
        if not from_nid:
            for n in nodes:
                if n.type == "sector" and r.from_sector.lower() in n.label.lower():
                    from_nid = n.id
                    break
        if not to_nid:
            for n in nodes:
                if n.type == "sector" and r.to_sector.lower() in n.label.lower():
                    to_nid = n.id
                    break
        if from_nid and to_nid:
            _add_edge(
                from_nid, to_nid, "rotates_into",
                weight=r.confidence,
                conf=r.confidence,
                desc=r.reason,
            )
            added_rotations += 1

    # Enforce edge cap
    edges = edges[:25]

    # ── Propagation chains ────────────────────────────────────────────────────
    chains: list[PropagationChain] = []
    for i, t in enumerate(top_themes[:5]):
        tnid = theme_node_ids.get(t.id)
        if not tnid or tnid not in node_id_set:
            continue

        chain_nodes: list[str] = [regime_id]

        # Macro node that feeds this theme (first match)
        for macro in theme_macros.get(t.id, [])[:1]:
            mid = macro_node_ids.get(macro)
            if mid and mid in node_id_set:
                chain_nodes.append(mid)

        chain_nodes.append(tnid)

        # Up to 2 downstream sector nodes
        affected = [
            sector_node_ids[ind]
            for ind in (t.related_industries or [])
            if ind in sector_node_ids and sector_node_ids[ind] in node_id_set
        ]
        chain_nodes.extend(affected[:2])

        if len(chain_nodes) < 2:
            continue

        # Summary: prefer causal_narrative; fall back to label chain
        summary = t.causal_narrative or ""
        if not summary:
            labels = [
                next((n.label for n in nodes if n.id == nid), nid)
                for nid in chain_nodes
            ]
            summary = " → ".join(labels)

        chains.append(PropagationChain(
            id         = f"chain-{i}--{t.id}",
            title      = t.name,
            confidence = float(t.confidence),
            nodes      = chain_nodes,
            summary    = summary,
        ))

    chains = chains[:5]

    # ── Debug summary ─────────────────────────────────────────────────────────
    type_counts = {}
    for n in nodes:
        type_counts[n.type] = type_counts.get(n.type, 0) + 1

    log.info(
        "[narrative_graph] built  nodes=%d  edges=%d  chains=%d  regime=%r",
        len(nodes), len(edges), len(chains), regime_label,
    )
    log.info(
        "[narrative_graph] node breakdown  %s",
        "  ".join(f"{t}={c}" for t, c in sorted(type_counts.items())),
    )
    log.info(
        "[narrative_graph] top themes: %s",
        ", ".join(f"{t.name}({t.confidence})" for t in top_themes),
    )
    log.info(
        "[narrative_graph] top sectors: %s",
        ", ".join(f"{ia.industry}({ia.score})" for ia in active_industries),
    )

    return NarrativeGraphResponse(
        dominant_regime = regime_label,
        nodes           = nodes,
        edges           = edges,
        chains          = chains,
        generated_at    = now,
        source_count    = len(raw_items),
    )
