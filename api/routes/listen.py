"""
api/routes/listen.py — Curated audio/podcast content endpoints

Phase 2: Live RSS ingestion via api/podcast_feeds.py.

Endpoints:
  GET /api/listen/           — all episodes (optionally filtered by topic / age)
  GET /api/listen/featured/  — the current featured episode
  GET /api/listen/topics/    — list of available topics
"""

from __future__ import annotations

import logging
import re

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from api.podcast_feeds import (
    fetch_episodes,
    _ep_age_hours,
    _MAX_AGE_BY_TOPIC,
    _MIN_SCORE_BY_TOPIC,
    _TOPIC_FALLBACK_MAX_AGE_H,
    _TOPIC_MIN_RESULTS,
    _SECONDARY_MIN_SCORE,
    MAX_PER_TOPIC_ALL,
    MAX_PER_SHOW,
)

_DEFAULT_TOPIC_AGE_H = 72   # fallback for topics not in _MAX_AGE_BY_TOPIC (3d)

# ── Per-topic secondary fill stages ──────────────────────────────────────────
# Maps each host topic to two fill stages:
#   Stage 0 (close):  highest thematic overlap — tried first.
#   Stage 1 (mid):    moderate overlap — tried only if Stage 0 leaves slots unfilled.
#
# Geopolitical is absent from Stage 0 AND Stage 1 for M&A, Company, and Private
# Markets.  Generic trade/sanctions/election episodes have almost no relevance to
# deal-making, single-name corporate events, or PE fundraising.  It appears in
# Stage 1 for Markets only, subject to _FILL_KEYWORD_GATE (market-moving terms only).
_TOPIC_RELATED_FILL: dict[str, list[list[str]]] = {
    "M&A":             [["Private Markets", "Company"], ["Markets"]],
    "Private Markets": [["M&A", "Markets"],             ["Macro"]],
    "Company":         [["Tech / AI", "Markets"],        ["Macro"]],
    "Markets":         [["Macro", "Company"],            ["Geopolitical"]],
    "Macro":           [["Markets"],                     ["Geopolitical"]],
    "Tech / AI":       [["Company", "Markets"],          []],
    "Geopolitical":    [["Markets", "Macro"],            []],
}

# ── Fill keyword gates ────────────────────────────────────────────────────────
# When filling host_topic with episodes tagged fill_topic, the candidate must
# contain at least one term from the gate pattern.  Absent key = no gate.
_FILL_KEYWORD_GATE: dict[tuple[str, str], re.Pattern] = {  # type: ignore[type-arg]
    # Geopolitical as Markets fill: only admit clearly market-moving stories
    # (price action, rates, commodities, dollar).  Keeps pure sanctions/election
    # episodes out of the Markets tab.
    ("Markets", "Geopolitical"): re.compile(
        r"\b(?:market|stock|equit\w*|bond|yield|commodit\w*|oil|dollar|rate|fed)\b",
        re.IGNORECASE,
    ),
}

# ── Secondary fill topic vetoes ───────────────────────────────────────────────
# For Stage 2c (general fallback), episodes whose PRIMARY topic is in this set
# are excluded when filling the named host topic.  Prevents high-scoring
# Geopolitical episodes from entering M&A/Company/Private Markets through the
# open-pool fallback even when the staged fill could not block them.
_SECONDARY_FILL_VETO: dict[str, set[str]] = {
    "M&A":             {"Geopolitical"},
    "Company":         {"Geopolitical"},
    "Private Markets": {"Geopolitical"},
    # Markets: Geopolitical is allowed in Stage 1 via keyword gate, so no veto.
}

log    = logging.getLogger(__name__)
router = APIRouter()


def _balance_all_tab(all_eps: list[dict]) -> list[dict]:
    """
    Apply per-topic and per-show diversity caps for the All-tab pool.

    Episodes are already sorted by relevance_score (best first).  We walk the
    list in order, admitting each episode only when both its primary topic and
    its show still have room under their respective caps.  This preserves
    quality ranking while preventing any single topic or show from monopolising
    the page.
    """
    topic_counts: dict[str, int] = {}
    show_counts:  dict[str, int] = {}
    balanced:     list[dict]     = []

    for ep in all_eps:
        show    = ep.get("show_name", "")
        topics  = ep.get("topics", [])
        primary = topics[0] if topics else ""

        # Show diversity cap
        if show_counts.get(show, 0) >= MAX_PER_SHOW:
            continue

        # Topic cap (keyed on primary topic only)
        topic_cap = MAX_PER_TOPIC_ALL.get(primary, 6)
        if topic_counts.get(primary, 0) >= topic_cap:
            continue

        topic_counts[primary] = topic_counts.get(primary, 0) + 1
        show_counts[show]     = show_counts.get(show, 0) + 1
        balanced.append(ep)

    log.info(
        "listen all-tab balance: %d → %d (topic dist: %s)",
        len(all_eps), len(balanced),
        {k: v for k, v in sorted(topic_counts.items())},
    )
    return balanced


# ── Schema ────────────────────────────────────────────────────────────────────

class Episode(BaseModel):
    id:               str
    title:            str
    show_name:        str
    publisher:        str
    description:      str
    why_it_matters:   str
    image_url:        str | None
    audio_url:        str | None
    external_url:     str | None
    published_at:     str           # ISO-8601
    duration_seconds: int
    topics:           list[str]
    entities:         list[str]
    is_featured:      bool
    is_secondary:     bool          = False
    secondary_label:  str | None    = None
    relevance_score:  int


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/", response_model=list[Episode])
def list_episodes(
    topic:         str = Query(default="",   description="Filter by topic label"),
    limit:         int = Query(default=50,   ge=1, le=200, description="Maximum results"),
    max_age_hours: int = Query(default=0,    ge=0, description="Hard age cutoff in hours (0 = no extra limit)"),
) -> list[dict]:
    """
    Return live episodes from RSS feeds, ranked by freshness-weighted relevance.

    Falls back to an empty list rather than crashing if all feeds are down.

    When a topic filter is active:
      - A per-topic age cap from _MAX_AGE_BY_TOPIC is applied (default 3d).
      - Stage 1: if 0 episodes pass the cap, expands once to _TOPIC_FALLBACK_MAX_AGE_H (7d).
      - Stage 2: if fewer than _TOPIC_MIN_RESULTS remain, fills remaining slots
        first from Markets/Macro episodes (labeled "Market context"), then from
        any high-scoring episode (labeled "Related").  All fillers carry
        is_secondary=True so the UI can render them distinctly.
      - Episodes below the topic's minimum quality score are excluded.

    The max_age_hours param overrides the default for any caller that needs
    a custom age window (e.g. a Trending Now API consumer).
    """
    all_eps  = fetch_episodes()
    episodes = all_eps

    log.info("listen topic=%r: all_eps=%d", topic, len(all_eps))

    # ── All-tab: age filter (optional) + topic/show balancing ────────────────
    if not topic:
        pool = [e for e in all_eps if _ep_age_hours(e) <= max_age_hours] \
               if max_age_hours > 0 else all_eps
        episodes = _balance_all_tab(pool)

    # ── Topic filter ──────────────────────────────────────────────────────────
    else:
        min_score = _MIN_SCORE_BY_TOPIC.get(topic, 4)
        age_cap   = max_age_hours if max_age_hours > 0 else _MAX_AGE_BY_TOPIC.get(topic, _DEFAULT_TOPIC_AGE_H)

        # Debug: log what topic labels the first few episodes actually have.
        if all_eps:
            sample = [(e.get("title", "")[:50], e.get("topics", [])) for e in all_eps[:5]]
            log.info("listen topic=%r: sample episode topics: %r", topic, sample)

        # Candidate pool: correct topic label + minimum quality score.
        candidates = [
            e for e in all_eps
            if topic in e.get("topics", [])
            and e.get("relevance_score", 0) >= min_score
        ]
        log.info("listen topic=%r: candidates=%d (age_cap=%dh, min_score=%d)",
                 topic, len(candidates), age_cap, min_score)

        # Primary: within the hard age cap.
        primary = [e for e in candidates if _ep_age_hours(e) <= age_cap]

        # Stage 1: if empty, expand once to the 7d fallback window.
        if not primary and _TOPIC_FALLBACK_MAX_AGE_H > 0:
            fallback_cap = max(age_cap, _TOPIC_FALLBACK_MAX_AGE_H)
            primary = [e for e in candidates if _ep_age_hours(e) <= fallback_cap]
            if primary:
                log.info(
                    "listen topic=%r: 0 results within %dh; expanded to %dh fallback (%d found)",
                    topic, age_cap, fallback_cap, len(primary),
                )

        # Stage 2: fill up to _TOPIC_MIN_RESULTS with secondary content.
        #
        # Three sub-stages in priority order:
        #   2a (close):   topics with highest thematic overlap (Stage 0 of fill map).
        #   2b (mid):     moderate-overlap topics (Stage 1 of fill map).
        #   2c (general): any high-scoring episode not vetoed for this host topic.
        #
        # _FILL_KEYWORD_GATE gates specific (host, fill) pairs so that e.g. a
        # Geopolitical episode only enters the Markets tab when it also contains
        # market-moving vocabulary.
        # _SECONDARY_FILL_VETO prevents vetoed primary topics (e.g. Geopolitical)
        # from entering through the open general-fallback pool in Stage 2c.
        if len(primary) < _TOPIC_MIN_RESULTS:
            primary_ids     = {e["id"] for e in primary}
            needed          = _TOPIC_MIN_RESULTS - len(primary)
            secondary: list[dict] = []
            first_fill_done = False   # first admitted source gets a "{X} context" label

            # 2a + 2b — staged related fill (close stage, then mid stage).
            for stage_topics in _TOPIC_RELATED_FILL.get(topic, []):
                if len(secondary) >= needed:
                    break
                for fill_topic in stage_topics:
                    if len(secondary) >= needed:
                        break
                    used_ids   = primary_ids | {e["id"] for e in secondary}
                    still_need = needed - len(secondary)
                    gate       = _FILL_KEYWORD_GATE.get((topic, fill_topic))
                    label      = f"{fill_topic} context" if not first_fill_done else "Related"

                    fill_pool = [
                        e for e in all_eps
                        if e["id"] not in used_ids
                        and e.get("relevance_score", 0) >= _SECONDARY_MIN_SCORE
                        and fill_topic in e.get("topics", [])
                        and (gate is None or gate.search(
                            e.get("title", "") + " " + e.get("description", "")
                        ))
                    ]
                    added = fill_pool[:still_need]
                    for ep in added:
                        secondary.append({**ep, "is_secondary": True, "secondary_label": label})
                    if added:
                        first_fill_done = True

            # 2c — general fallback: any high-scoring episode not in the veto set.
            if len(secondary) < needed:
                used_ids   = primary_ids | {e["id"] for e in secondary}
                still_need = needed - len(secondary)
                veto_set   = _SECONDARY_FILL_VETO.get(topic, set())
                gen_pool   = [
                    e for e in all_eps
                    if e["id"] not in used_ids
                    and e.get("relevance_score", 0) >= _SECONDARY_MIN_SCORE
                    and e.get("topics", [""])[0] not in veto_set
                ]
                for ep in gen_pool[:still_need]:
                    secondary.append({**ep, "is_secondary": True, "secondary_label": "Related"})

            if secondary:
                label_counts: dict[str, int] = {}
                for s in secondary:
                    lbl = s.get("secondary_label", "?")
                    label_counts[lbl] = label_counts.get(lbl, 0) + 1
                log.info(
                    "listen topic=%r: %d primary → adding %d secondary %s",
                    topic, len(primary), len(secondary), label_counts,
                )
            episodes = primary + secondary
        else:
            episodes = primary

    result = episodes[:limit]
    if topic:
        _sec   = sum(1 for e in result if e.get("is_secondary"))
        _prim  = len(result) - _sec
        log.info(
            "listen topic=%r: primary=%d secondary=%d final=%d",
            topic, _prim, _sec, len(result),
        )
    else:
        log.info("listen all-tab: returning %d episodes", len(result))
    return result


@router.get("/featured/", response_model=Episode)
def get_featured() -> dict:
    """
    Return the current featured episode.

    fetch_episodes() selects the featured episode preferring those published
    within _MAX_AGE_FEATURED_H (72h).  Raises 404 if no episodes are available.
    """
    episodes = fetch_episodes()
    if not episodes:
        raise HTTPException(status_code=404, detail="No episodes available")

    # fetch_episodes() already sets is_featured=True on the best episode;
    # fall back to the first item (highest score) if the flag is absent.
    featured = next((e for e in episodes if e.get("is_featured")), episodes[0])
    return featured


@router.get("/topics/", response_model=list[str])
def list_topics() -> list[str]:
    """
    Return the deduplicated ordered list of topics present in the live feed.
    """
    episodes = fetch_episodes()
    seen:   set[str]  = set()
    topics: list[str] = []
    for ep in episodes:
        for t in ep.get("topics", []):
            if t not in seen:
                seen.add(t)
                topics.append(t)
    return topics
