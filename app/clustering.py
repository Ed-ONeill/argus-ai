"""
app/clustering.py — Conservative story clustering for the processed feed.

Groups related FeedItem objects into StoryCluster objects with an auto-generated
theme label (e.g. "Japan Rate Shock", "NVDA Earnings Beat").

Design principles:
  - Prefer under-clustering over over-clustering.
  - Two distinct paths: entity-overlap (stronger) and title-similarity (weaker).
  - Both paths require a time-window gate; similarity path is stricter.
  - Generic entities (USD, Fed, S&P, etc.) are excluded from entity-overlap matching
    to prevent semantically unrelated stories from being grouped.
"""

from __future__ import annotations

import hashlib
import logging
import re
from dataclasses import dataclass, field
from datetime import datetime

log = logging.getLogger(__name__)


# ── Thresholds ─────────────────────────────────────────────────────────────────

_ENTITY_WINDOW_H  = 4     # max hours between items to cluster via shared entity
_JACCARD_WINDOW_H = 2     # tighter window for title-similarity path
_JACCARD_THRESH   = 0.50  # minimum Jaccard on non-stop title tokens (high = strict)
_JACCARD_MIN_TOKS = 4     # both titles must have ≥ N tokens to use Jaccard path
_MAX_RELATED      = 5     # max related stories stored per cluster (payload control)

# ── Entity blocklist ───────────────────────────────────────────────────────────
# Terms too broad to be used as cluster anchors.  Matching on these would
# group wholly unrelated stories under the same "cluster".

_BROAD_ENTITIES: frozenset[str] = frozenset({
    "USD", "EUR", "GBP", "JPY", "CNY", "CHF", "AUD", "CAD",
    "S&P", "S&P 500", "SPX", "Nasdaq", "NASDAQ", "Dow", "DJIA",
    "Fed", "FOMC", "ECB", "BoJ", "BoE", "RBA", "PBOC",
    "Markets", "Equities", "Bonds", "Treasuries", "Stocks",
    "Commodities", "Commodity",
    "Wall Street", "US", "UK", "EU", "China", "Europe",
})

# ── Stop words for Jaccard ─────────────────────────────────────────────────────

_STOP_WORDS: frozenset[str] = frozenset({
    "a", "an", "the", "of", "in", "on", "at", "to", "for", "and", "or",
    "is", "are", "was", "were", "with", "as", "by", "from", "up", "down",
    "its", "it", "be", "been", "will", "could", "would", "may", "might",
    "new", "after", "over", "than", "but", "amid", "says", "said", "has",
    "have", "had", "that", "this", "his", "her", "their", "into", "after",
    "report", "reports", "sources", "according",
})

# ── Label vocabulary ───────────────────────────────────────────────────────────
# High-value financial news nouns, checked left-to-right (higher priority first).

_NEWS_NOUNS: list[str] = [
    "Tariff", "Tariffs", "Sanctions", "Ban", "Default", "Crisis", "Shock",
    "Rate", "Rates", "Hike", "Cut", "Pause", "Pivot", "Inflation", "Recession",
    "Earnings", "Revenue", "Guidance", "Downgrade", "Upgrade",
    "Merger", "Acquisition", "Deal", "Buyout", "Takeover", "Offer", "Bid",
    "IPO", "Layoffs", "Buyback", "Dividend", "Settlement", "Probe",
    "Investigation", "Fine", "Spinoff", "Breakup",
    "Surge", "Rally", "Crash", "Selloff", "Correction", "Squeeze",
    "Warning", "Alert", "Reversal", "Momentum", "Breakout",
]
_NEWS_NOUNS_LOWER: dict[str, str] = {w.lower(): w for w in _NEWS_NOUNS}


# ── Data classes ───────────────────────────────────────────────────────────────

@dataclass
class StoryCluster:
    """A group of related stories sharing a theme or entity."""
    id:            str              # MD5(primary.title + primary.url)[:12]
    primary:       "FeedItem"       # noqa: F821  — highest-scored item
    related:       list["FeedItem"] # noqa: F821  — capped at _MAX_RELATED, score desc
    cluster_score: float            # 0–1, set by themes.select_what_matters_now()
    theme_label:   str              # e.g. "Japan Rate Shock"
    story_count:   int              # total items placed in this cluster (may exceed _MAX_RELATED)


@dataclass
class WhatMattersNowItem:
    rank:      int
    cluster:   StoryCluster
    reason:    str
    thesis:    str       # 1-sentence "why this matters for markets"
    wmn_label: str = "" # LLM-generated theme label, e.g. "Iron Ore Supply Constraints"


# ── Public API ─────────────────────────────────────────────────────────────────

def cluster_items(items: list["FeedItem"]) -> list[StoryCluster]:  # noqa: F821
    """
    Group FeedItems into StoryCluster objects using greedy first-match assignment.

    Items must be pre-sorted (strong → weak, recent → old within each tier).
    The first item assigned to a bucket becomes its primary story — this means
    the highest-signal, most-recent item anchors each cluster.

    Returns clusters in the same order as the primary stories appear in `items`.
    """
    buckets: list[list] = []

    for item in items:
        placed = False
        for bucket in buckets:
            if _should_cluster(item, bucket[0]):
                bucket.append(item)
                placed = True
                break
        if not placed:
            buckets.append([item])

    clusters = [_build_cluster(b) for b in buckets]
    log.debug(
        "[cluster] %d items → %d clusters  singleton=%d  multi=%d",
        len(items), len(clusters),
        sum(1 for c in clusters if c.story_count == 1),
        sum(1 for c in clusters if c.story_count > 1),
    )
    return clusters


# ── Clustering predicate ───────────────────────────────────────────────────────

def _should_cluster(candidate: "FeedItem", primary: "FeedItem") -> bool:  # noqa: F821
    # ── Time gate — fast, always first ────────────────────────────────────────
    dt_c, dt_p = getattr(candidate, "published_dt", None), getattr(primary, "published_dt", None)
    if dt_c and dt_p:
        delta_h = abs((dt_c - dt_p).total_seconds()) / 3600
    else:
        delta_h = 0.0

    # ── Path 1: Shared specific entity ────────────────────────────────────────
    # Both items must carry at least one specific (non-broad) entity in common.
    spec_c = {e for e in getattr(candidate, "affected_entities", []) if e not in _BROAD_ENTITIES}
    spec_p = {e for e in getattr(primary,   "affected_entities", []) if e not in _BROAD_ENTITIES}
    if spec_c and spec_p and (spec_c & spec_p) and delta_h <= _ENTITY_WINDOW_H:
        return True

    # ── Path 2: High title-token similarity (conservative fallback) ────────────
    # Requires same category, tighter time window, high Jaccard, minimum token count.
    if (
        delta_h <= _JACCARD_WINDOW_H
        and candidate.category == primary.category
    ):
        tok_c = _title_tokens(candidate.title)
        tok_p = _title_tokens(primary.title)
        if len(tok_c) >= _JACCARD_MIN_TOKS and len(tok_p) >= _JACCARD_MIN_TOKS:
            j = len(tok_c & tok_p) / len(tok_c | tok_p)
            if j >= _JACCARD_THRESH:
                return True

    return False


# ── Cluster builder ────────────────────────────────────────────────────────────

def _build_cluster(items: list) -> StoryCluster:
    primary     = items[0]
    all_related = items[1:]
    related     = all_related[:_MAX_RELATED]
    cid = hashlib.md5(
        (primary.title + primary.url).encode("utf-8", errors="ignore")
    ).hexdigest()[:12]
    return StoryCluster(
        id=cid,
        primary=primary,
        related=related,
        cluster_score=0.0,
        theme_label=_make_theme_label(primary),
        story_count=len(items),
    )


# ── Label generation ───────────────────────────────────────────────────────────

def _make_theme_label(primary: "FeedItem") -> str:  # noqa: F821
    """
    Build a short, readable editorial label (3–5 words max).

    Priority order:
      entity + news noun  →  "Japan Rate Hike", "NVDA Earnings Beat"
      entity + context    →  "Iran Sanctions Risk"
      news noun + context →  "Rate Hike Fears"
      fallback            →  first 4 meaningful title words, title-cased
    """
    # Filter: must be at least 3 chars and not a broad/generic term
    entities = [
        e for e in getattr(primary, "affected_entities", [])
        if e not in _BROAD_ENTITIES and len(e) >= 3
    ]
    lead      = entities[0] if entities else None
    news_word = _extract_news_word(primary.title)
    toks      = _title_tokens_ordered(primary.title)

    # Best case: entity + action noun
    if lead and news_word:
        return f"{lead} {news_word}"

    # Entity known but no specific news noun — supplement with 1–2 title words
    if lead:
        non_lead   = [w for w in toks if w.lower() != lead.lower()]  # keep order
        supplement = " ".join(non_lead[:2])                           # slice LIST, not string
        if supplement:
            return f"{lead} {supplement.title()}"
        return lead

    # News noun found but no specific entity — pair with 1–2 context words
    if news_word:
        non_noun = [w for w in toks if w.lower() != news_word.lower()]
        context  = " ".join(non_noun[:2]).title()
        return f"{news_word} {context}".strip() if context else news_word

    # Pure fallback: first 4 meaningful words from title
    words = toks[:4]
    label = " ".join(words).title()
    return (label + "…") if len(toks) > 4 else label


def _extract_news_word(title: str) -> str:
    tl = title.lower()
    for word_lower, word_proper in _NEWS_NOUNS_LOWER.items():
        if re.search(r"\b" + re.escape(word_lower) + r"\b", tl):
            return word_proper
    return ""


def _title_tokens(title: str) -> frozenset[str]:
    words = re.findall(r"[a-zA-Z]+", title.lower())
    return frozenset(w for w in words if w not in _STOP_WORDS and len(w) > 2)


def _title_tokens_ordered(title: str) -> list[str]:
    """Like _title_tokens but preserves order and original capitalisation."""
    words = re.findall(r"[a-zA-Z$\u2019\u2018'-]+", title)
    return [w for w in words if w.lower() not in _STOP_WORDS and len(w) > 2]
