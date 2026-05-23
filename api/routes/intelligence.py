"""
api/routes/intelligence.py — Market Narrative Network endpoint

GET /api/intelligence/ping
    Health check — confirms this router is registered and reachable.

GET /api/intelligence/network
    Returns a curated graph of the most important market relationships
    derived from the current processed feed cache.  No LLM calls.
    Response is instant (reads from cache; pipeline not re-run).

GET /api/intelligence/network?debug=true
    Same graph plus raw diagnostics: cache age, theme/sector counts, etc.
    Debug fields are always present; non-debug callers can ignore them.
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from app.processed_cache import feed_cache, make_cache_key
from app.narrative_graph  import build_narrative_graph

log    = logging.getLogger(__name__)
router = APIRouter()


# ── Pydantic response schemas ─────────────────────────────────────────────────
# Single flat schema for the network endpoint; debug fields default to 0/False
# so the same schema works for both normal and debug responses.

class GraphNodeSchema(BaseModel):
    id:           str
    label:        str
    type:         str
    strength:     float
    sentiment:    str
    description:  str
    source_count: int
    confidence:   float


class GraphEdgeSchema(BaseModel):
    id:           str
    source:       str
    target:       str
    relationship: str
    weight:       float
    confidence:   float
    description:  str


class PropagationChainSchema(BaseModel):
    id:         str
    title:      str
    confidence: float
    nodes:      list[str]
    summary:    str


class NarrativeNetworkResponse(BaseModel):
    """
    Market Narrative Network graph.
    Always includes debug fields; callers can ignore them.
    """
    dominant_regime:       str
    nodes:                 list[GraphNodeSchema]
    edges:                 list[GraphEdgeSchema]
    chains:                list[PropagationChainSchema]
    generated_at:          str
    source_count:          int
    # Debug / diagnostic fields (always present, non-debug callers may ignore)
    cache_age_seconds:     float = Field(default=0.0)
    is_stale:              bool  = Field(default=False)
    raw_theme_count:       int   = Field(default=0)
    raw_activation_count:  int   = Field(default=0)
    active_industry_count: int   = Field(default=0)
    scored_sector_count:   int   = Field(default=0)


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/ping")
def ping() -> dict:
    """Canary — confirms the intelligence router is registered and reachable."""
    return {"ok": True, "router": "intelligence"}


@router.get("/network", response_model=NarrativeNetworkResponse)
def get_network(
    debug: bool = Query(default=False, description="Include raw diagnostic metadata in response"),
) -> NarrativeNetworkResponse:
    """
    Return the current Market Narrative Network graph.

    Sources the shared ProcessedFeed cache (same data as /api/feed).
    Returns 503 if the cache is cold (pipeline has not run yet).

    Node budget:
      1  regime node, ≤4 macro factor nodes, ≤6 theme nodes, ≤7 sector nodes
      Max 18 nodes total.  Max 25 edges.  3–5 propagation chains.

    Edge relationships:
      drives · pressures · supports · benefits · correlates · rotates_into
    """
    key   = make_cache_key("", "", False)
    entry = feed_cache.get(key)

    if entry is None:
        raise HTTPException(
            status_code = 503,
            detail      = "Feed cache is cold — pipeline has not run yet. "
                          "Try again in 30–60 seconds or call /api/feed?refresh=true first.",
        )

    graph = build_narrative_graph(entry)

    # Debug fields — always computed, cheap
    age        = feed_cache.age_seconds(key) or 0.0
    raw_themes = getattr(entry, "theme_intelligence",  []) or []
    raw_acts   = getattr(entry, "industry_activation", []) or []
    sd         = getattr(entry, "sector_data",         None)

    return NarrativeNetworkResponse(
        dominant_regime       = graph.dominant_regime,
        nodes                 = [
            GraphNodeSchema(
                id           = n.id,
                label        = n.label,
                type         = n.type,
                strength     = n.strength,
                sentiment    = n.sentiment,
                description  = n.description,
                source_count = n.source_count,
                confidence   = n.confidence,
            )
            for n in graph.nodes
        ],
        edges                 = [
            GraphEdgeSchema(
                id           = e.id,
                source       = e.source,
                target       = e.target,
                relationship = e.relationship,
                weight       = e.weight,
                confidence   = e.confidence,
                description  = e.description,
            )
            for e in graph.edges
        ],
        chains                = [
            PropagationChainSchema(
                id         = c.id,
                title      = c.title,
                confidence = c.confidence,
                nodes      = c.nodes,
                summary    = c.summary,
            )
            for c in graph.chains
        ],
        generated_at          = graph.generated_at,
        source_count          = graph.source_count,
        cache_age_seconds     = round(age, 1),
        is_stale              = getattr(entry, "is_refreshing", False),
        raw_theme_count       = len(raw_themes),
        raw_activation_count  = len(raw_acts),
        active_industry_count = sum(1 for ia in raw_acts if ia.score > 0),
        scored_sector_count   = sum(
            1 for s in (sd.sectors if sd else []) if s.signal_score > 0
        ),
    )
