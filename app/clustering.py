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

_ENTITY_WINDOW_H  = 6     # max hours between items to cluster via shared entity
_JACCARD_WINDOW_H = 3     # window for title-similarity path
_JACCARD_THRESH   = 0.45  # minimum Jaccard on non-stop title tokens (high = strict)
_JACCARD_MIN_TOKS = 4     # both titles must have ≥ N tokens to use Jaccard path
_MAX_RELATED      = 6     # max related stories stored per cluster (payload control)

# Topic-anchor path — groups stories about the same event/company/catalyst that
# share a salient topic word (e.g. "Iran", "Broadcom", "inflation", "ceasefire")
# but have low overall title overlap. Salient tokens are found data-driven: a
# token is an anchor when it appears in 2..N distinct titles in the current feed
# (rare enough to denote a specific subject, common enough to link coverage).
_ANCHOR_WINDOW_H   = 8    # macro/geopolitical coverage spreads over many hours
_ANCHOR_MAX_DF     = 6    # token in more than this many titles is too generic
_ANCHOR_MIN_LEN    = 4    # minimum token length to qualify as an anchor

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

# ── Sector / industry labels ────────────────────────────────────────────────────
# The entity extractor frequently tags stories with a SECTOR name rather than a
# company. Sectors are far too coarse to anchor a cluster on (every energy story
# would merge), so they are excluded from the shared-entity path alongside the
# broad-entity blocklist.
_SECTOR_LABELS: frozenset[str] = frozenset({
    "Energy", "Utilities", "Financials", "Banks", "Bank", "Insurance",
    "Semiconductors", "Software", "Technology", "Tech", "Healthcare",
    "Biotech", "Pharma", "Pharmaceuticals", "Defense", "Aerospace",
    "Industrials", "Materials", "Mining", "Consumer", "Retail", "Staples",
    "Discretionary", "Media", "Telecom", "Communications", "Crypto",
    "Real Estate", "Transports", "Airlines", "Automakers", "Autos",
    "CNBC", "Reuters", "Bloomberg",
})

_NON_SPECIFIC: frozenset[str] = _BROAD_ENTITIES | _SECTOR_LABELS

# ── Stop words for Jaccard ─────────────────────────────────────────────────────

_STOP_WORDS: frozenset[str] = frozenset({
    "a", "an", "the", "of", "in", "on", "at", "to", "for", "and", "or",
    "is", "are", "was", "were", "with", "as", "by", "from", "up", "down",
    "its", "it", "be", "been", "will", "could", "would", "may", "might",
    "new", "after", "over", "than", "but", "amid", "says", "said", "has",
    "have", "had", "that", "this", "his", "her", "their", "into", "after",
    "report", "reports", "sources", "according",
})

# ── Generic tokens excluded from topic anchors ──────────────────────────────────
# Words common enough across market headlines that sharing them does NOT imply two
# stories cover the same event. Anchors are additionally required to be capitalized
# (proper-noun-like) in BOTH titles, so this list mainly guards against shared
# proper-cased-but-generic words (regions, price-action verbs, deal boilerplate).
_GENERIC_TOKENS: frozenset[str] = frozenset({
    # finance generics
    "stock", "stocks", "share", "shares", "market", "markets", "economy",
    "economic", "growth", "fund", "funds", "money", "price", "prices",
    "rate", "rates", "yield", "yields", "investor", "investors", "trading",
    "trade", "trader", "traders", "deal", "deals", "profit", "profits",
    "sales", "revenue", "business", "stake", "firm", "group", "capital",
    "advisory", "partners", "asset", "assets", "tech", "technology",
    "company", "companies", "earnings", "quarter", "billion", "million",
    "percent", "dividend", "dividends", "bond", "bonds", "forex", "value",
    # regions / broad geographies (too coarse to anchor on)
    "asia", "asian", "america", "american", "americas", "europe", "european",
    "africa", "african", "global", "world", "worldwide", "international",
    # price-action / event verbs (capitalized in Title-Case sources)
    "boom", "rally", "rallies", "fall", "falls", "rise", "rises", "drop",
    "drops", "gain", "gains", "loss", "losses", "slide", "slides", "slip",
    "slips", "jump", "jumps", "soar", "soars", "plunge", "plunges", "tumble",
    "tumbles", "sink", "sinks", "beat", "beats", "miss", "misses", "tops",
    "climb", "climbs", "surge", "surges", "selloff", "rout", "swing", "swings",
    # M&A / deal boilerplate
    "acquires", "acquire", "acquisition", "acquisitions", "merger", "buyout",
    "completes", "complete", "agrees", "agree", "raises", "raise", "backed",
    "exit", "exits", "launches", "launch", "deal",
    # common verbs / fillers that survive Title-Case capitalization
    "seeks", "seek", "wants", "want", "takes", "take", "makes", "make",
    "gives", "give", "tells", "show", "shows", "says", "warns", "warn",
    "plans", "plan", "pledges", "pledge", "steps", "vow", "vows", "action",
    "accelerating", "balancing", "aligning", "thinks", "brace", "flags",
    "consumer", "consumers", "retailer", "investing", "record", "records",
    "historic", "biggest", "largest", "highest", "lowest", "ever", "first",
    "report", "reports", "update", "wrap", "data", "news", "today", "story",
    "director", "official", "officials", "senior", "amid", "over", "near",
    # abstract nouns common across unrelated geopolitics/markets headlines
    "security", "council", "powers", "power", "rebuke", "risk", "risks",
    "policy", "unrest", "talks", "deal", "crisis", "threat", "threats",
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
    salient_vocab = _build_salient_vocab(items)

    buckets: list[list] = []

    for item in items:
        placed = False
        for bucket in buckets:
            if _should_cluster(item, bucket[0], salient_vocab):
                bucket.append(item)
                placed = True
                break
        if not placed:
            buckets.append([item])

    clusters = [_build_cluster(b) for b in buckets]
    log.info(
        "[cluster] %d items -> %d clusters  singleton=%d  multi=%d  anchors=%d",
        len(items), len(clusters),
        sum(1 for c in clusters if c.story_count == 1),
        sum(1 for c in clusters if c.story_count > 1),
        len(salient_vocab),
    )
    return clusters


_CAP_TOKEN_RE = re.compile(r"[A-Za-z][A-Za-z'’]*")


def _name_tokens(title: str) -> set[str]:
    """
    Proper-noun-like tokens from a title: words that are Capitalized in the
    original headline (denoting a name, place, or specific catalyst), normalized
    to lowercase, ≥ _ANCHOR_MIN_LEN chars, and not generic/stopwords. Requiring
    capitalization is what separates a real subject ("Iran", "Broadcom") from a
    common verb a Title-Case source happens to capitalize.
    """
    out: set[str] = set()
    for w in _CAP_TOKEN_RE.findall(title or ""):
        if not w[0].isupper():
            continue
        lw = re.sub(r"[^a-z]", "", w.lower())
        if len(lw) >= _ANCHOR_MIN_LEN and lw not in _STOP_WORDS and lw not in _GENERIC_TOKENS:
            out.add(lw)
    return out


def _build_salient_vocab(items: list) -> frozenset[str]:
    """
    Identify salient topic anchors across the feed: proper-noun-like title tokens
    that appear in 2.._ANCHOR_MAX_DF distinct titles. These denote specific
    subjects (companies, places, catalysts) shared by stories covering the same
    event, without merging stories that merely share a generic word.
    """
    df: dict[str, int] = {}
    for item in items:
        for t in _name_tokens(getattr(item, "title", "") or ""):
            df[t] = df.get(t, 0) + 1
    return frozenset(t for t, n in df.items() if 2 <= n <= _ANCHOR_MAX_DF)


# ── Clustering predicate ───────────────────────────────────────────────────────

def _should_cluster(
    candidate: "FeedItem",                  # noqa: F821
    primary:   "FeedItem",                  # noqa: F821
    salient_vocab: frozenset[str] = frozenset(),
) -> bool:
    # ── Time gate — fast, always first ────────────────────────────────────────
    dt_c, dt_p = getattr(candidate, "published_dt", None), getattr(primary, "published_dt", None)
    if dt_c and dt_p:
        delta_h = abs((dt_c - dt_p).total_seconds()) / 3600
    else:
        delta_h = 0.0

    # ── Path 1: Shared specific entity ────────────────────────────────────────
    # Both items must carry at least one specific (non-broad, non-sector) entity in
    # common. Sector labels are excluded so unrelated same-sector stories don't merge.
    spec_c = {e for e in getattr(candidate, "affected_entities", []) if e not in _NON_SPECIFIC}
    spec_p = {e for e in getattr(primary,   "affected_entities", []) if e not in _NON_SPECIFIC}
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

    # ── Path 3: Shared salient topic anchor ────────────────────────────────────
    # Catches same-event/same-catalyst coverage that shares a specific topic word
    # (e.g. "Iran", "Broadcom", "inflation") but not enough of the rest of the
    # headline to clear the Jaccard bar. Precision comes from the anchor vocabulary
    # (generic finance words are excluded; anchors must denote a specific subject).
    if (
        salient_vocab
        and delta_h <= _ANCHOR_WINDOW_H
        and candidate.category == primary.category   # same-category guard (precision)
    ):
        anc_c = _name_tokens(candidate.title) & salient_vocab
        anc_p = _name_tokens(primary.title)   & salient_vocab
        if anc_c & anc_p:
            # Guard: if both name DIFFERENT specific (ticker-like) entities, they
            # are about different subjects despite a shared catalyst word.
            tickers_c = {e for e in spec_c if e.isupper() and len(e) <= 5}
            tickers_p = {e for e in spec_p if e.isupper() and len(e) <= 5}
            if tickers_c and tickers_p and not (tickers_c & tickers_p):
                return False
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
