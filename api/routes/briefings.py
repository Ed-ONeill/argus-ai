"""
api/routes/briefings.py — Argus Briefings endpoint

Short AI-curated audio intelligence briefings derived from the live news cluster
pipeline.  Each briefing is shaped identically to a podcast Episode (same schema
+ is_briefing=True) so the frontend can merge both into a single unified feed
with no type gymnastics.

Endpoint:
  GET /api/briefings/
      topic   — filter by podcast-compatible topic label (optional)
      limit   — max items returned (default 20, max 100)
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Query
from pydantic import BaseModel

from app.processed_cache import feed_cache, make_cache_key
from app.clustering      import StoryCluster

# Reuse the podcast topic-classification rules so briefings and podcasts share
# identical topic labels across the whole product.
from api.podcast_feeds import _TOPIC_RULE_MAP, _TOPIC_ORDER

log    = logging.getLogger(__name__)
router = APIRouter()


# ══════════════════════════════════════════════════════════════════════════════
# TUNING CONSTANTS
# Change these to adjust briefing quality, freshness weighting, and duration.
# ══════════════════════════════════════════════════════════════════════════════

# Duration heuristic bounds (seconds).
BRIEFING_DURATION_MIN_S = 120   # 2 min — shortest possible briefing
BRIEFING_DURATION_MAX_S = 360   # 6 min — longest possible briefing

# Relevance bonuses (added on top of the raw feed signal_score, 0–100 scale).
BRIEFING_WMN_BONUS           = 15   # episode is a What Matters Now cluster
BRIEFING_FRESHNESS_6H_BONUS  = 12   # published within the last 6 hours
BRIEFING_FRESHNESS_24H_BONUS =  5   # published within the last 24 hours
BRIEFING_SIGNAL_STRONG_BONUS =  8   # feed signal_strength == "strong"
BRIEFING_CLUSTER_SIZE_MULT   =  2   # +N per related story (capped at 10 total)

# Feed category → primary podcast topic (direct mapping).
# Categories not in this map fall through to keyword-based classification.
_CATEGORY_TOPIC_MAP: dict[str, str] = {
    "Markets":      "Markets",
    "M&A":          "M&A",
    "Geopolitical": "Geopolitical",
    "Company":      "Company",
}


# ══════════════════════════════════════════════════════════════════════════════
# SCHEMA
# ══════════════════════════════════════════════════════════════════════════════
# BriefingEpisode mirrors the Episode schema from listen.py exactly, adding
# is_briefing=True and signal_strength for frontend differentiation.
# This means the same EpisodeCard / EpisodeSection components handle briefings
# with no extra prop-threading or union types.

class BriefingEpisode(BaseModel):
    id:               str
    title:            str
    show_name:        str             = "Argus Briefing"
    publisher:        str             = "Argus"
    description:      str
    why_it_matters:   str
    image_url:        str | None      = None
    audio_url:        str | None      = None
    external_url:     str | None      = None
    published_at:     str             # ISO-8601
    duration_seconds: int
    topics:           list[str]
    entities:         list[str]
    is_featured:      bool            = False
    is_secondary:     bool            = False
    secondary_label:  str | None      = None
    relevance_score:  int
    is_briefing:      bool            = True
    signal_strength:  str             = "medium"   # "strong" | "medium" | "weak"


# ══════════════════════════════════════════════════════════════════════════════
# TOPIC CLASSIFICATION
# ══════════════════════════════════════════════════════════════════════════════

def _classify_topics(category: str, text: str) -> list[str]:
    """
    Derive podcast-compatible topic labels for a briefing.

    1. Map the feed category directly (4 → 7 topic mapping).
    2. Run the full podcast _TOPIC_RULE_MAP over title+description to catch
       secondary topics (Macro, Tech/AI, Private Markets) that the coarser
       4-category feed system misses.
    3. Deduplicate and cap at 2 topics to avoid dilution.
    4. Default to ["Markets"] if classification produces nothing.
    """
    primary = _CATEGORY_TOPIC_MAP.get(category, "")
    topics: list[str] = [primary] if primary else []

    for label in _TOPIC_ORDER:
        if len(topics) >= 2:
            break
        if label in topics:
            continue
        rule = _TOPIC_RULE_MAP.get(label)
        if rule and rule.matches(text):
            topics.append(label)

    return topics or ["Markets"]


# ══════════════════════════════════════════════════════════════════════════════
# DURATION HEURISTIC
# ══════════════════════════════════════════════════════════════════════════════

def _estimate_duration(cluster: StoryCluster) -> int:
    """
    Estimate briefing playback length in seconds.

    Base: word count of summary + why_it_matters ÷ 150 WPM speaking rate.
    Depth: +30 s per related story (context, transitions) — capped at 4.
    Result is clamped to [BRIEFING_DURATION_MIN_S, BRIEFING_DURATION_MAX_S].
    """
    words = (
        len(cluster.primary.summary.split()) +
        len(cluster.primary.why_it_matters.split())
    )
    from_words = int(words / 150 * 60)          # seconds at 150 WPM
    from_depth = min(len(cluster.related), 4) * 30
    return max(BRIEFING_DURATION_MIN_S, min(BRIEFING_DURATION_MAX_S, from_words + from_depth))


# ══════════════════════════════════════════════════════════════════════════════
# RELEVANCE SCORING
# ══════════════════════════════════════════════════════════════════════════════

def _score(cluster: StoryCluster, is_wmn: bool, now: datetime) -> int:
    """
    Compute briefing relevance_score (0–100 int, same scale as podcast scores).

    Adds freshness, signal-strength, WMN-curation, and cluster-depth bonuses
    on top of the raw feed signal_score.
    """
    base = int(cluster.primary.signal_score)

    age_h: float = 999.0
    if cluster.primary.published_dt:
        dt = cluster.primary.published_dt
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        age_h = (now - dt).total_seconds() / 3600

    freshness = (
        BRIEFING_FRESHNESS_6H_BONUS  if age_h <= 6  else
        BRIEFING_FRESHNESS_24H_BONUS if age_h <= 24 else
        0
    )
    signal_bonus = BRIEFING_SIGNAL_STRONG_BONUS if cluster.primary.signal_strength == "strong" else 0
    wmn_bonus    = BRIEFING_WMN_BONUS if is_wmn else 0
    depth_bonus  = min(cluster.story_count * BRIEFING_CLUSTER_SIZE_MULT, 10)

    return max(0, min(100, base + freshness + signal_bonus + wmn_bonus + depth_bonus))


# ══════════════════════════════════════════════════════════════════════════════
# CLUSTER → BRIEFING CONVERSION
# ══════════════════════════════════════════════════════════════════════════════

def _cluster_to_briefing(
    cluster: StoryCluster,
    is_wmn:  bool,
    now:     datetime,
) -> dict:
    item = cluster.primary

    text = f"{item.title} {item.summary} {item.why_it_matters}"
    topics = _classify_topics(item.category, text)

    published_at = (
        item.published_dt.isoformat()
        if item.published_dt
        else now.isoformat()
    )

    # Prefer richer text fields with sensible fallbacks.
    description    = item.summary      or item.snippet or item.title
    why_it_matters = item.why_it_matters or item.summary or description

    return {
        "id":               f"briefing_{cluster.id}",
        "title":            item.title,
        "show_name":        "Argus Briefing",
        "publisher":        "Argus",
        "description":      description,
        "why_it_matters":   why_it_matters,
        "image_url":        None,
        "audio_url":        None,           # placeholder — TTS pipeline not yet wired
        "external_url":     item.url or None,
        "published_at":     published_at,
        "duration_seconds": _estimate_duration(cluster),
        "topics":           topics,
        "entities":         list(item.affected_entities or []),
        "is_featured":      False,
        "is_secondary":     False,
        "secondary_label":  None,
        "relevance_score":  _score(cluster, is_wmn, now),
        "is_briefing":      True,
        "signal_strength":  item.signal_strength or "medium",
    }


# ══════════════════════════════════════════════════════════════════════════════
# ENDPOINT
# ══════════════════════════════════════════════════════════════════════════════

@router.get("/", response_model=list[BriefingEpisode])
def list_briefings(
    topic: str = Query(default="",  description="Filter by podcast-compatible topic label"),
    limit: int = Query(default=20,  ge=1, le=100, description="Maximum results"),
) -> list[dict]:
    """
    Return Argus Briefings derived from the live news cluster pipeline.

    Sources:
      - clusters:         all story clusters from the latest processed feed
      - what_matters_now: top-5 curated clusters (receive a relevance score bonus)

    Briefings are de-duplicated by cluster ID (WMN items overlap with the main
    cluster list), then filtered by topic and sorted by relevance_score.

    Returns an empty list — never raises — if the feed cache is cold.
    """
    now = datetime.now(timezone.utc)
    key = make_cache_key()          # default key: no category/source filters
    feed = feed_cache.get(key)

    if not feed:
        log.warning("briefings: feed cache cold — returning empty list")
        return []

    # Index WMN cluster IDs so we can apply the curation bonus efficiently.
    wmn_ids: set[str] = {
        wmn.cluster.id
        for wmn in (feed.what_matters_now or [])
    }

    # Convert every cluster to a briefing, de-duplicating by cluster ID.
    seen:      set[str]   = set()
    briefings: list[dict] = []

    for cluster in (feed.clusters or []):
        if cluster.id in seen:
            continue
        seen.add(cluster.id)

        b = _cluster_to_briefing(cluster, cluster.id in wmn_ids, now)

        # Must have at least one topic and non-empty description to be surfaced.
        if not b["topics"] or not b["description"]:
            log.debug("briefings: dropped cluster %s — missing topics or description", cluster.id)
            continue

        briefings.append(b)

    # Topic filter.
    if topic:
        briefings = [b for b in briefings if topic in b["topics"]]

    # Sort by relevance_score descending (freshness already baked in via scoring).
    briefings.sort(key=lambda b: b["relevance_score"], reverse=True)

    log.info(
        "briefings topic=%r: clusters_total=%d after_filter=%d returning=%d",
        topic,
        len(feed.clusters or []),
        len(briefings),
        min(len(briefings), limit),
    )

    return briefings[:limit]
