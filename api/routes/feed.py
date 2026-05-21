"""
api/routes/feed.py — Feed, Top Stories, and Today's Take endpoints

All responses are served from the ProcessedFeedCache populated by the background
refresh daemon.  Page loads never block on feed fetching or summarization.

Stale-while-revalidate: if the cache is warming, callers receive the previous
snapshot immediately (is_stale=True) and poll again after the refresh completes.

For filter combos not pre-warmed by the background job, the pipeline runs
inline on first call and the result is cached for subsequent calls.
"""

from __future__ import annotations

import logging
import time
from typing import Any

from fastapi import APIRouter, Query, BackgroundTasks
from pydantic import BaseModel

from app.feeds           import FeedItem, FEED_REGISTRY, category_breakdown, source_breakdown
from app.config          import settings
from app.processed_cache import ProcessedFeed, feed_cache, make_cache_key
from app.background      import refresher, run_pipeline, WARM_TARGETS
from app.clustering      import StoryCluster, WhatMattersNowItem as _WMNItem
from app.summarizer      import MarketBrief

from app.top_stories import _select_top_stories
from app.theme_graph import ThemeIntelligence as _ThemeIntelligence

log = logging.getLogger(__name__)

router = APIRouter()


# ── Response models ───────────────────────────────────────────────────────────

class MarketBriefSchema(BaseModel):
    primary_driver:    str
    market_regime:     str
    assets_impacted:   list[str]
    narrative_shift:   str
    trade_implication: str
    risk_scenario:     str
    confidence:        int

class FeedItemSchema(BaseModel):
    id:                str
    title:             str
    url:               str
    source:            str
    category:          str
    published:         str
    signal_score:      float
    signal_strength:   str        # "strong" | "medium" | "weak"
    affected_entities: list[str]
    summary:           str
    why_it_matters:    str
    impact:            str
    snippet:           str

    @classmethod
    def from_item(cls, item: FeedItem) -> "FeedItemSchema":
        import hashlib
        item_id = hashlib.md5(
            (item.title + item.url).encode("utf-8", errors="ignore")
        ).hexdigest()
        return cls(
            id=item_id,
            title=item.title,
            url=item.url,
            source=item.source,
            category=item.category,
            published=item.published or "",
            signal_score=round(item.signal_score, 1),
            signal_strength=item.signal_strength,
            affected_entities=item.affected_entities,
            summary=item.summary,
            why_it_matters=item.why_it_matters,
            impact=item.impact,
            snippet=item.snippet,
        )


class TopStoriesSchema(BaseModel):
    top_deal:        FeedItemSchema | None
    top_macro:       FeedItemSchema | None
    top_single_name: FeedItemSchema | None
    top_price_move:  FeedItemSchema | None
    top_policy_risk: FeedItemSchema | None


class FeedResponse(BaseModel):
    items:              list[FeedItemSchema]
    top_stories:        TopStoriesSchema
    market_take:        str
    total:              int
    sources:            list[str]
    category_breakdown: dict[str, int]
    source_breakdown:   dict[str, dict[str, int]]
    promo_excluded:     int
    errors:             dict[str, str]
    top_stories_debug:  list[str]
    # Clustering layer
    clusters:           list[StoryClusterSchema]
    what_matters_now:   list[WhatMattersNowItemSchema]
    # Structured intelligence brief (None while being generated for the first time)
    market_brief:       MarketBriefSchema | None = None
    # Sector intelligence (None until first pipeline run completes)
    sector_data:        SectorDataSchema | None = None
    # Theme intelligence graph (empty until first pipeline run)
    theme_intelligence: list[ThemeIntelligenceSchema] = []
    # Cache metadata
    is_stale:           bool
    generated_at:       str
    cache_age_seconds:  float


class RelatedStorySchema(BaseModel):
    """Lightweight payload for related stories inside a cluster."""
    id:              str
    title:           str
    url:             str
    source:          str
    published:       str
    published_ts:    str    # ISO-8601 for client-side timeline sort
    signal_strength: str

    @classmethod
    def from_item(cls, item: FeedItem) -> "RelatedStorySchema":
        import hashlib
        return cls(
            id=hashlib.md5((item.title + item.url).encode("utf-8", errors="ignore")).hexdigest()[:12],
            title=item.title,
            url=item.url,
            source=item.source,
            published=item.published or "",
            published_ts=item.published_dt.isoformat() if item.published_dt else "",
            signal_strength=item.signal_strength,
        )


class StoryClusterSchema(BaseModel):
    id:            str
    primary:       FeedItemSchema
    related:       list[RelatedStorySchema]
    cluster_score: float
    theme_label:   str
    story_count:   int


class WhatMattersNowItemSchema(BaseModel):
    rank:      int
    cluster:   StoryClusterSchema
    reason:    str
    thesis:    str
    wmn_label: str


class SectorIntelligenceSchema(BaseModel):
    name:             str
    signal_score:     float
    signal_count:     int
    impact_sentiment: str
    top_entity:       str | None
    top_story_title:  str | None
    top_story_url:    str | None
    regime_alignment: str


class IndustrySignalSchema(BaseModel):
    name:               str
    sector:             str
    signal_score:       float
    signal_count:       int
    top_entity:         str | None
    momentum_direction: str       = "neutral"
    primary_drivers:    list[str] = []
    narrative:          str       = ""
    regime_alignment:   str       = "neutral"
    top_story_title:    str | None = None
    top_story_url:      str | None = None


class RotationSignalSchema(BaseModel):
    from_sector: str
    to_sector:   str
    confidence:  float
    reason:      str
    pattern:     str


class SectorDataSchema(BaseModel):
    sectors:          list[SectorIntelligenceSchema]
    industries:       list[IndustrySignalSchema]
    rotation_signals: list[RotationSignalSchema]
    dominant_sector:  str | None
    generated_at:     str    # ISO-8601
    derived_regime:   str    = ""  # Phase 5: deterministic extended regime label


class ThemeIntelligenceSchema(BaseModel):
    id:                       str
    name:                     str
    description:              str
    signal_strength:          str
    confidence:               int
    momentum_direction:       str
    related_industries:       list[str]       = []
    related_assets:           list[str]       = []
    related_macro_factors:    list[str]       = []
    contributing_cluster_ids: list[str]       = []
    contributing_story_count: int             = 0
    second_order_effects:     list[str]       = []
    podcast_topics:           list[str]       = []
    last_updated:             str             = ""
    # Phase 5: weighted relationship graph + confidence + momentum
    relationship_weights:     dict[str, dict] = {}
    confidence_label:         str             = ""
    signal_quality:           str             = "speculative"
    evidence_count:           int             = 0
    persistence_score:        int             = 0
    volatility_score:         int             = 0
    cross_category_confirmed: bool            = False
    momentum_label:           str             = "emerging"
    momentum_delta:           int             = 0
    persistence_cycles:       int             = 0


class FeedStatusResponse(BaseModel):
    cache_keys:    list[str]
    warm_targets:  list[dict[str, Any]]
    entries: list[dict[str, Any]]


class FeedFreshnessResponse(BaseModel):
    generated_at:      str    # ISO-8601; empty string if cache is cold
    is_stale:          bool
    cache_age_seconds: float
    item_count:        int


class SourceInfo(BaseModel):
    name:     str
    category: str


# ── Helpers ───────────────────────────────────────────────────────────────────

def _cluster_to_schema(c: StoryCluster) -> StoryClusterSchema:
    return StoryClusterSchema(
        id=c.id,
        primary=FeedItemSchema.from_item(c.primary),
        related=[RelatedStorySchema.from_item(r) for r in c.related],
        cluster_score=round(c.cluster_score, 4),
        theme_label=c.theme_label,
        story_count=c.story_count,
    )


def _build_response(entry: ProcessedFeed, age: float) -> FeedResponse:
    """Convert a ProcessedFeed cache entry into a FeedResponse."""
    items   = entry.items
    schemas = [FeedItemSchema.from_item(i) for i in items]

    def _s(key: str) -> FeedItemSchema | None:
        it = entry.top_stories.get(key)
        return FeedItemSchema.from_item(it) if it else None

    cluster_schemas = [_cluster_to_schema(c) for c in (entry.clusters or [])]
    wmn_schemas     = [
        WhatMattersNowItemSchema(
            rank=w.rank,
            cluster=_cluster_to_schema(w.cluster),
            reason=w.reason,
            thesis=w.thesis,
            wmn_label=w.wmn_label or w.cluster.theme_label,
        )
        for w in (entry.what_matters_now or [])
    ]

    log.info(
        "[feed] _build_response  market_take=%s  market_brief=%s",
        "EMPTY" if not entry.market_take else "OK",
        "OK" if getattr(entry, "market_brief", None) else "None",
    )

    brief = getattr(entry, "market_brief", None)
    brief_schema = MarketBriefSchema(
        primary_driver    = brief.primary_driver,
        market_regime     = brief.market_regime,
        assets_impacted   = brief.assets_impacted,
        narrative_shift   = brief.narrative_shift,
        trade_implication = brief.trade_implication,
        risk_scenario     = brief.risk_scenario,
        confidence        = brief.confidence,
    ) if brief else None

    sd = getattr(entry, "sector_data", None)
    sector_schema: SectorDataSchema | None = None
    if sd is not None:
        sector_schema = SectorDataSchema(
            sectors=[
                SectorIntelligenceSchema(
                    name             = s.name,
                    signal_score     = s.signal_score,
                    signal_count     = s.signal_count,
                    impact_sentiment = s.impact_sentiment,
                    top_entity       = s.top_entity,
                    top_story_title  = s.top_story_title,
                    top_story_url    = s.top_story_url,
                    regime_alignment = s.regime_alignment,
                )
                for s in sd.sectors
            ],
            industries=[
                IndustrySignalSchema(
                    name               = i.name,
                    sector             = i.sector,
                    signal_score       = i.signal_score,
                    signal_count       = i.signal_count,
                    top_entity         = i.top_entity,
                    momentum_direction = getattr(i, "momentum_direction", "neutral"),
                    primary_drivers    = getattr(i, "primary_drivers",    []),
                    narrative          = getattr(i, "narrative",          ""),
                    regime_alignment   = getattr(i, "regime_alignment",   "neutral"),
                    top_story_title    = getattr(i, "top_story_title",    None),
                    top_story_url      = getattr(i, "top_story_url",      None),
                )
                for i in sd.industries
            ],
            rotation_signals=[
                RotationSignalSchema(
                    from_sector = r.from_sector,
                    to_sector   = r.to_sector,
                    confidence  = r.confidence,
                    reason      = r.reason,
                    pattern     = r.pattern,
                )
                for r in sd.rotation_signals
            ],
            dominant_sector = sd.dominant_sector,
            generated_at    = sd.generated_at.isoformat(),
            derived_regime  = getattr(sd, "derived_regime", ""),
        )

    raw_themes = getattr(entry, "theme_intelligence", []) or []
    theme_schemas = [
        ThemeIntelligenceSchema(
            id                       = t.id,
            name                     = t.name,
            description              = t.description,
            signal_strength          = t.signal_strength,
            confidence               = t.confidence,
            momentum_direction       = t.momentum_direction,
            related_industries       = t.related_industries,
            related_assets           = t.related_assets,
            related_macro_factors    = t.related_macro_factors,
            contributing_cluster_ids = t.contributing_cluster_ids,
            contributing_story_count = t.contributing_story_count,
            second_order_effects     = t.second_order_effects,
            podcast_topics           = t.podcast_topics,
            last_updated             = t.last_updated,
            # Phase 5 fields (getattr with defaults for old pickled objects)
            relationship_weights     = getattr(t, "relationship_weights",     {}),
            confidence_label         = getattr(t, "confidence_label",         ""),
            signal_quality           = getattr(t, "signal_quality",           "speculative"),
            evidence_count           = getattr(t, "evidence_count",           0),
            persistence_score        = getattr(t, "persistence_score",        0),
            volatility_score         = getattr(t, "volatility_score",         0),
            cross_category_confirmed = getattr(t, "cross_category_confirmed", False),
            momentum_label           = getattr(t, "momentum_label",           "emerging"),
            momentum_delta           = getattr(t, "momentum_delta",           0),
            persistence_cycles       = getattr(t, "persistence_cycles",       0),
        )
        for t in raw_themes
    ]

    return FeedResponse(
        items=schemas,
        top_stories=TopStoriesSchema(
            top_deal=_s("Top Deal"),
            top_macro=_s("Top Macro Story"),
            top_single_name=_s("Top Single Name"),
            top_price_move=_s("Top Price Move"),
            top_policy_risk=_s("Top Policy / Risk"),
        ),
        market_take=entry.market_take,
        market_brief=brief_schema,
        sector_data=sector_schema,
        theme_intelligence=theme_schemas,
        total=len(items),
        sources=sorted({i.source for i in items}),
        category_breakdown=category_breakdown(items),
        source_breakdown=source_breakdown(items),
        promo_excluded=entry.promo_excluded,
        errors=entry.errors,
        top_stories_debug=entry.debug_log,
        clusters=cluster_schemas,
        what_matters_now=wmn_schemas,
        is_stale=entry.is_refreshing,
        generated_at=entry.generated_at.isoformat(),
        cache_age_seconds=round(age, 1),
    )


def _run_inline(
    categories: str,
    sources:    str,
    fresh_only: bool,
) -> ProcessedFeed:
    """
    Run the pipeline synchronously (blocking) for filter combos not pre-warmed.
    Result is written to the cache so subsequent calls are instant.
    """
    key = make_cache_key(categories, sources, fresh_only)
    log.info("[api] cold-start inline pipeline  key=%s", key)
    t0 = time.perf_counter()
    entry = run_pipeline(categories=categories, sources=sources, fresh_only=fresh_only)
    feed_cache.set(key, entry)
    log.info("[api] inline pipeline done in %.2fs", time.perf_counter() - t0)
    return entry


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/sources/", response_model=list[SourceInfo])
def list_sources() -> list[SourceInfo]:
    """All registered feed sources."""
    return [SourceInfo(name=name, category=cat) for name, _, cat in FEED_REGISTRY]


@router.get("/status", response_model=FeedStatusResponse)
def feed_status() -> FeedStatusResponse:
    """Cache health — ages, item counts, error counts per warm target."""
    warm = [
        {"categories": c, "sources": s, "fresh_only": f}
        for c, s, f in WARM_TARGETS
    ]
    entries_info: list[dict[str, Any]] = []
    for c, s, f in WARM_TARGETS:
        key   = make_cache_key(c, s, f)
        entry = feed_cache.get(key)
        age   = feed_cache.age_seconds(key)
        if entry:
            entries_info.append({
                "key":             key,
                "categories":      c or "(all)",
                "items":           len(entry.items),
                "errors":          len(entry.errors),
                "is_refreshing":   entry.is_refreshing,
                "generated_at":    entry.generated_at.isoformat(),
                "age_seconds":     round(age or 0, 1),
            })
        else:
            entries_info.append({
                "key":        key,
                "categories": c or "(all)",
                "status":     "cold",
            })
    return FeedStatusResponse(
        cache_keys=[make_cache_key(c, s, f) for c, s, f in WARM_TARGETS],
        warm_targets=warm,
        entries=entries_info,
    )


@router.get("/", response_model=FeedResponse)
def get_feed(
    background_tasks: BackgroundTasks,
    categories:       str  = Query(default="",    description="Comma-separated category filter"),
    sources:          str  = Query(default="",    description="Comma-separated source filter"),
    fresh_only:       bool = Query(default=False, description="Only show items from last 48h"),
    force_refresh:    bool = Query(default=False, description="Trigger an out-of-cycle background refresh"),
    use_ai:           bool = Query(default=True,  description="(ignored — background job always uses AI)"),
    model_name:       str  = Query(default="",    description="(ignored — model set via settings)"),
) -> FeedResponse:
    """
    Return the fully-processed feed from cache.  Responses are instant.

    If force_refresh=True the background job is woken immediately; the response
    still comes from the current cache snapshot (stale-while-revalidate).

    For filter combos not pre-warmed, the pipeline runs inline on first call
    and is cached for all subsequent calls.
    """
    t0  = time.perf_counter()
    key = make_cache_key(categories, sources, fresh_only)

    if force_refresh:
        refresher.trigger()
        log.info("[api] force-refresh triggered")

    entry = feed_cache.get(key)
    age   = feed_cache.age_seconds(key) or 0.0

    if entry is None:
        # Cold-start: run inline and cache (only happens for non-warm combos)
        entry = _run_inline(categories, sources, fresh_only)
        age   = 0.0

    log.info(
        "[api] GET /feed/ served in %.3fs  key=%s  items=%d  age=%.0fs  stale=%s",
        time.perf_counter() - t0, key, len(entry.items), age, entry.is_refreshing,
    )
    return _build_response(entry, age)


@router.get("/freshness/", response_model=FeedFreshnessResponse)
def feed_freshness(
    categories: str  = Query(default=""),
    sources:    str  = Query(default=""),
    fresh_only: bool = Query(default=False),
) -> FeedFreshnessResponse:
    """
    Lightweight polling endpoint — returns only freshness metadata, no feed data.
    Frontend polls this every 60 s to detect new stories without transferring full payload.
    """
    key   = make_cache_key(categories, sources, fresh_only)
    entry = feed_cache.get(key)
    age   = feed_cache.age_seconds(key) or 0.0
    if entry is None:
        return FeedFreshnessResponse(
            generated_at="",
            is_stale=True,
            cache_age_seconds=0.0,
            item_count=0,
        )
    return FeedFreshnessResponse(
        generated_at=entry.generated_at.isoformat(),
        is_stale=entry.is_refreshing,
        cache_age_seconds=round(age, 1),
        item_count=len(entry.items),
    )
