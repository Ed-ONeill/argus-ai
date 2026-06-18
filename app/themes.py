"""
app/themes.py — "What Matters Now" scoring and selection.

Scores each StoryCluster on a composite scale that heavily weights cross-asset
importance, recency, and multi-source confirmation.  Single-stock or single-
sector stories with no broader market implications score lower than macro,
geopolitical, or multi-asset themes even if their signal_strength is high.
"""

from __future__ import annotations

import math
import logging
import re
from datetime import datetime, timezone

from app.clustering import StoryCluster, WhatMattersNowItem

log = logging.getLogger(__name__)

# ── WMN prominence bar ──────────────────────────────────────────────────────────
# "What Matters Now" is driven by the emitted theme_intelligence (the structural
# ontology themes that already passed extract_themes' corroboration gates). A theme
# becomes prominent in WMN only when it is confirmed by multiple independent
# stories, multiple sources, AND cross-sector transmission — never a one-off.
_WMN_MIN_STORIES    = 2    # independent confirming stories (contributing_story_count)
_WMN_MIN_SOURCES    = 2    # distinct confirming sources (evidence_count)
_WMN_MIN_SECTORS    = 2    # sectors the theme transmits across (breadth_score)
_WMN_MIN_CONFIDENCE = 35   # only solid themes are promoted to the WMN strip


# ── Scoring weights ────────────────────────────────────────────────────────────

_CAT_WEIGHT: dict[str, float] = {
    "Geopolitical": 1.25,
    "Markets":      1.15,
    "M&A":          1.20,
    "Company":      0.85,
}
_STR_WEIGHT: dict[str, float] = {
    "strong": 1.00,
    "medium": 0.55,
    "weak":   0.15,
}

# Entities associated with specific asset classes (for cross-asset detection)
_BROAD: frozenset[str] = frozenset({
    "USD", "EUR", "GBP", "JPY", "S&P", "SPX", "Nasdaq", "Dow",
    "Fed", "FOMC", "ECB", "BoJ", "Markets", "Equities",
})
_FX:         frozenset[str] = frozenset({"USD", "EUR", "JPY", "GBP", "CNY", "FX", "Dollar", "Yen", "Euro", "DXY"})
_RATES:      frozenset[str] = frozenset({"Treasury", "Treasuries", "Bonds", "Yields", "Fed", "FOMC", "Rates", "10Y", "2Y", "30Y"})
_COMMODITIES: frozenset[str] = frozenset({"Oil", "WTI", "Brent", "Gold", "Silver", "Copper", "Commodities", "CL", "GC", "NG"})


# ── Public API ─────────────────────────────────────────────────────────────────

def select_what_matters_now(
    themes: list,                       # list[ThemeIntelligence] (duck-typed)
    clusters: list[StoryCluster],
    n: int = 5,
    now: datetime | None = None,        # accepted for signature stability; unused
) -> list[WhatMattersNowItem]:
    """
    Build "What Matters Now" from the emitted structural themes (theme_intelligence).

    Each WMN card is ONE ontology-backed structural theme — already the aggregation
    of every story that corroborates it — so duplicate stories collapse into a
    single intelligence card. A theme is promoted only when it clears the
    prominence bar: confirmed by ≥_WMN_MIN_STORIES independent stories, from
    ≥_WMN_MIN_SOURCES sources, transmitting across ≥_WMN_MIN_SECTORS sectors, at
    confidence ≥ _WMN_MIN_CONFIDENCE. Unmapped / under-corroborated narratives stay
    standalone stories and never appear here.
    """
    if not themes:
        return []

    by_id = {c.id: c for c in clusters}

    eligible = [
        t for t in themes
        if getattr(t, "evidence_count", 0)            >= _WMN_MIN_SOURCES
        and getattr(t, "breadth_score", 0)            >= _WMN_MIN_SECTORS
        and getattr(t, "contributing_story_count", 0) >= _WMN_MIN_STORIES
        and getattr(t, "confidence", 0)               >= _WMN_MIN_CONFIDENCE
    ]
    eligible.sort(key=lambda t: getattr(t, "confidence", 0), reverse=True)

    result: list[WhatMattersNowItem] = []
    rank = 1
    for t in eligible:
        if len(result) >= n:
            break
        # Anchor the card on the theme's top contributing cluster (one must be
        # present in the live cluster set to render the card).
        anchor = next(
            (by_id[cid] for cid in (getattr(t, "contributing_cluster_ids", None) or []) if cid in by_id),
            None,
        )
        if anchor is None:
            continue
        src_ct  = int(getattr(t, "evidence_count", 0))
        stories = int(getattr(t, "contributing_story_count", 0))
        sectors = int(getattr(t, "breadth_score", 0))
        result.append(WhatMattersNowItem(
            rank=rank,
            cluster=anchor,
            reason=f"{src_ct} sources · {stories} stories · {sectors} sectors",
            thesis=_make_thesis(anchor) or getattr(t, "description", ""),
            wmn_label=getattr(t, "name", ""),
            source_count=src_ct,
            confirming_count=stories,
            sector_count=sectors,
        ))
        rank += 1
    return result


def score_cluster(cluster: StoryCluster, now: datetime | None = None) -> float:
    """
    Composite score (0–∞, not bounded at 1.0).

    Components:
      recency     — exponential decay with 3-hour half-life
      strength    — signal_strength mapped to weight
      score_norm  — signal_score / 100
      cross       — cross-asset breadth multiplier (0.45–1.0)
      cat         — category importance weight
      size_bonus  — multi-source confirmation bonus
    """
    if now is None:
        now = datetime.now(timezone.utc)
    p = cluster.primary

    # 1. Recency — half-life varies by signal strength so breaking strong-signal
    # stories (major M&A, Fed decisions) stay prominent for longer than opinion pieces.
    sig = getattr(p, "signal_strength", "medium")
    half_life = 6.0 if sig == "strong" else 3.0 if sig == "medium" else 2.0
    if getattr(p, "published_dt", None):
        age_h   = (now - p.published_dt).total_seconds() / 3600
        recency = math.exp(-age_h / half_life)
    else:
        recency = 0.08  # no timestamp → heavily deprioritised

    # 2. Signal
    strength = _STR_WEIGHT.get(getattr(p, "signal_strength", "medium"), 0.55)
    score_n  = min(max(getattr(p, "signal_score", 0.0), 0.0) / 100.0, 1.0)

    # 3. Cross-asset (dominant differentiator)
    cross = _cross_asset_score(cluster)

    # 4. Category
    cat = _CAT_WEIGHT.get(getattr(p, "category", ""), 1.0)

    # 5. Cluster size bonus (each extra story = +15%, capped at 4 extras)
    size_bonus = 1.0 + 0.15 * min(cluster.story_count - 1, 4)

    # Cross-asset weighted heavily: a macro story with cross=0.8 outscores
    # a single-stock strong-signal story with cross=0.1 even at equal recency.
    base = recency * strength * score_n * cat * size_bonus * (0.45 + 0.55 * cross)

    # Relevance filter: heavily penalise single-company medium/weak stories
    # that don't justify a "What Matters Now" slot.
    if (
        cluster.story_count == 1
        and getattr(p, "category", "") == "Company"
        and getattr(p, "signal_strength", "medium") in ("medium", "weak")
    ):
        base *= 0.30

    # Consumer noise penalty: down-weight clusters driven by consumer/personal-
    # finance content so they never surface in What Matters Now.  Uses the
    # consumer_noise_penalty field set by score_item() — a 30-pt penalty maps
    # to a 0.50 multiplier (graceful, not binary).
    consumer_penalty = getattr(p, "consumer_noise_penalty", 0.0)
    if consumer_penalty > 0:
        base *= max(0.10, 1.0 - consumer_penalty / 60.0)

    return base


def _cross_asset_score(cluster: StoryCluster) -> float:
    """Return 0-1 reflecting how broadly the theme spans asset classes."""
    p = cluster.primary
    score = 0.0

    # Category-level base score
    cat = getattr(p, "category", "")
    if cat == "Geopolitical":
        score += 0.55   # wars, sanctions, elections → everything moves
    elif cat == "Markets":
        score += 0.40   # broad market news
    elif cat == "M&A":
        score += 0.20   # deal can ripple across sectors
    # Company defaults to 0 — needs entity breadth to lift score

    # Count distinct asset classes — check both extracted entities AND title text
    # so stories like "Dollar slides as yields fall" get full cross-asset credit
    # even when the entity extractor missed the asset-class tokens.
    asset_types: set[str] = set()
    for e in getattr(p, "affected_entities", []):
        if e in _FX:
            asset_types.add("fx")
        elif e in _RATES:
            asset_types.add("rates")
        elif e in _COMMODITIES:
            asset_types.add("commodities")
        elif e.startswith("$") or (len(e) <= 5 and e.isupper() and e not in _BROAD):
            asset_types.add("equity")

    title_lower = (getattr(p, "title", "") or "").lower()
    if "fx" not in asset_types and re.search(
        r"\b(dollar|yen|yuan|euro|sterling|pound|fx|currency|forex|dxy|usdx)\b", title_lower
    ):
        asset_types.add("fx")
    if "rates" not in asset_types and re.search(
        r"\b(yield|yields|rate\s+hike|rate\s+cut|bond|treasury|bund|gilt|duration|credit\s+spread)\b",
        title_lower,
    ):
        asset_types.add("rates")
    if "commodities" not in asset_types and re.search(
        r"\b(oil|brent|wti|crude|gold|silver|copper|gas|commodity|commodities|wheat|corn)\b",
        title_lower,
    ):
        asset_types.add("commodities")
    if "equity" not in asset_types and re.search(
        r"\b(stock|stocks|equit|nasdaq|s&p|dow|shares|sharemarket|index|indices|earnings)\b",
        title_lower,
    ):
        asset_types.add("equity")

    score += min(len(asset_types) * 0.15, 0.30)

    # Mixed-category cluster = confirmed multi-asset spillover (e.g. tariff story
    # causes both Company and Geopolitical coverage)
    if cluster.related:
        cats = {cat} | {getattr(r, "category", "") for r in cluster.related}
        if len(cats) > 1:
            score += 0.15

    return min(score, 1.0)


def _make_thesis(cluster: StoryCluster) -> str:
    """
    Return a 1-sentence interpretation of why this matters for markets.

    Priority:
      1. why_it_matters — LLM-written investment implication (most interpretive).
      2. First sentence of AI summary — factual fallback.
      3. Template fallback using category + affected entities.
    """
    p = cluster.primary

    # ── Try why_it_matters first (investment implication) ─────────────────────
    why = getattr(p, "why_it_matters", "").strip()
    if why and len(why) >= 20:
        return why[:180]

    # ── Try AI summary first sentence ─────────────────────────────────────────
    summary = getattr(p, "summary", "").strip()
    if summary:
        # Extract first sentence (ends with . ! or ?)
        m = re.match(r"^(.+?[.!?])\s", summary)
        if m:
            sentence = m.group(1).strip()
            if len(sentence) >= 25:
                return sentence[:180]
        # No punctuation boundary found — use the whole summary up to 180 chars
        if len(summary) >= 25:
            truncated = summary[:180]
            # Don't end mid-word
            if len(summary) > 180:
                truncated = truncated.rsplit(" ", 1)[0] + "…"
            return truncated

    # ── Template fallback ──────────────────────────────────────────────────────
    ents = [e for e in getattr(p, "affected_entities", []) if e not in _BROAD][:2]
    cat  = getattr(p, "category", "")
    ent_str = " and ".join(ents) if ents else ""

    if cat == "Geopolitical":
        return (
            f"{ent_str} tensions drive risk-off flows, pressuring equities and lifting safe-haven demand." if ent_str
            else "Geopolitical escalation drives risk-off positioning. Safe havens bid, risk assets pressured."
        )
    if cat == "M&A":
        return (
            f"Deal activity in {ent_str} signals sector re-rating and forces multiple repricing across peers." if ent_str
            else "M&A signals sector re-rating. Forces multiple repricing and lifts strategic premium expectations."
        )
    if cat == "Markets":
        return (
            f"Broad {ent_str} moves reflect macro repricing. Triggers positioning shifts across asset classes." if ent_str
            else "Macro repricing drives cross-asset positioning shifts. Risk appetite and credit spreads in focus."
        )
    if ent_str:
        return f"Developments at {ent_str} trigger sector repricing and pressure related exposures."
    return "Cross-asset theme driving positioning shifts. Monitor for macro spillover."


def _make_reason(cluster: StoryCluster) -> str:
    """Brief human-readable label for why this theme ranks highly."""
    parts: list[str] = []
    if cluster.story_count > 1:
        parts.append(f"{cluster.story_count} stories")
    if getattr(cluster.primary, "signal_strength", "") == "strong":
        parts.append("strong signal")
    ents = [e for e in getattr(cluster.primary, "affected_entities", []) if e not in _BROAD][:2]
    if ents:
        parts.append(" · ".join(ents))
    elif getattr(cluster.primary, "category", ""):
        parts.append(cluster.primary.category)
    return " · ".join(parts) if parts else "Market update"
