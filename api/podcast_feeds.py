"""
api/podcast_feeds.py — Podcast RSS ingestion for the Listen feature.

━━━ Where to tune ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Add / remove feeds          →  PODCAST_FEEDS list (with source_tier)
  Source tier weights         →  _SOURCE_TIER_MULT
  Freshness multipliers       →  _FRESH_MULT  (keyed by age-bracket in hours)
  Freshness bracket edges     →  _FRESH_STRONG_H / _FRESH_MODERATE_H / _FRESH_NEUTRAL_H / _FRESH_WEAK_H
  Global hard age cutoff      →  _MAX_AGE_GLOBAL_H  (episodes older than this are always excluded)
  Featured age preference     →  _MAX_AGE_FEATURED_PREFER_H (strongly prefer ≤ this)
  Featured hard max           →  _MAX_AGE_FEATURED_H (hard cap — no stale fallback beyond this)
  Per-topic hard age caps     →  _MAX_AGE_BY_TOPIC  (hard cutoffs; 0-result topics expand once to _TOPIC_FALLBACK_MAX_AGE_H)
  Sparse-topic fallback       →  _TOPIC_FALLBACK_MAX_AGE_H / _TOPIC_MIN_RESULTS / _SECONDARY_MIN_SCORE
  Minimum scores by topic     →  _MIN_SCORE_BY_TOPIC  (applied in topic-filtered API calls)
  Off-brand title filter      →  _OFFBRAND_TITLE_RE
  Per-topic keyword rules     →  _TOPIC_RULES  (strong=3pts, weak=1pt, min_score)
  Finance signal keywords     →  _FINANCE_SIGNAL_RE
  Minimum quality threshold   →  _MIN_FINANCE_SCORE
  Cache / fetch settings      →  _CACHE_TTL, _MAX_PER_FEED, _FETCH_WORKERS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
"""

from __future__ import annotations

import hashlib
import logging
import re
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any

import feedparser

log = logging.getLogger(__name__)


# ═══════════════════════════════════════════════════════════════════════════════
# 1.  FEED CONFIGURATION
# ═══════════════════════════════════════════════════════════════════════════════
#
#  source_tier  — content quality tier for this show (1–5, 5 = most finance-focused).
#                 Used as a multiplier in the final ranking formula.
#                 Tier 5: every episode is finance/markets-relevant.
#                 Tier 4: mostly finance, occasional off-topic.
#                 Tier 3: finance-adjacent storytelling, variable relevance.
#                 Tier 2: broad business/culture, often off-brand for Argus.
#                 Tier 1: reserved for low-signal filler (not currently used).
#
#  default_topics — fallback topic list, only used when keyword classification
#                   assigns NO topics but the episode passes the finance filter.

PODCAST_FEEDS: list[dict] = [

    # ── Tier 5: Every episode is finance/markets-relevant ──────────────────────

    {
        # WSJ What's News — twice-daily market and business briefing.
        # Most consistently finance-focused feed in the set.
        "rss_url":        "https://video-api.wsj.com/podcast/rss/wsj/whats-news",
        "show_name":      "WSJ What's News",
        "publisher":      "The Wall Street Journal",
        "default_topics": ["Markets", "Company"],
        "source_tier":    5,
    },
    {
        # Bloomberg Surveillance — weekday flagship markets/macro show.
        # Tom Keene, Jonathan Ferro, Lisa Abramowicz on rates, equities, macro.
        # Hosted on Omny Studio (moved from Megaphone in 2022).
        "rss_url":        "https://www.omnycontent.com/d/playlist/e73c998e-6e60-432f-8610-ae210140c5b1/8e704079-ca57-4eac-9741-ae27003e2b7f/9739700c-72c3-4176-ae55-ae27003e2b96/podcast.rss",
        "show_name":      "Bloomberg Surveillance",
        "publisher":      "Bloomberg",
        "default_topics": ["Macro", "Markets"],
        "source_tier":    5,
    },
    {
        # Goldman Sachs Exchanges — weekly conversations with GS leaders on macro,
        # markets, and corporate themes.  High signal, institutional perspective.
        "rss_url":        "https://feeds.megaphone.fm/GLD9218176758",
        "show_name":      "Goldman Sachs Exchanges",
        "publisher":      "Goldman Sachs",
        "default_topics": ["Markets", "Macro"],
        "source_tier":    5,
    },
    {
        # Morgan Stanley Thoughts on the Market — daily 5-min macro/equity takes
        # from MS strategists (Mike Wilson, Andrew Sheets, others).
        # Very high frequency; art19-hosted.
        "rss_url":        "https://rss.art19.com/thoughts-on-the-market",
        "show_name":      "Thoughts on the Market",
        "publisher":      "Morgan Stanley",
        "default_topics": ["Macro", "Markets"],
        "source_tier":    5,
    },

    # ── Tier 4: Mostly finance, occasional off-topic ───────────────────────────

    {
        # The Journal — WSJ daily narrative podcast (business, tech, markets).
        # High quality but covers some off-brand stories; content filter handles that.
        "rss_url":        "https://video-api.wsj.com/podcast/rss/wsj/the-journal",
        "show_name":      "The Journal",
        "publisher":      "The Wall Street Journal",
        "default_topics": ["Company", "Markets"],
        "source_tier":    4,
    },
    {
        # The Indicator — NPR's daily 10-min markets/economy briefing.
        # Finance-focused but occasionally covers consumer/policy stories.
        "rss_url":        "https://feeds.npr.org/510325/podcast.xml",
        "show_name":      "The Indicator",
        "publisher":      "NPR / Planet Money",
        "default_topics": ["Macro", "Markets"],
        "source_tier":    4,
    },
    {
        # FT News Briefing — Financial Times weekday morning briefing (~15 min).
        # Strong finance coverage; occasionally covers politics and society.
        # Hosted on Acast.
        "rss_url":        "https://rss.acast.com/ftnewsbriefing",
        "show_name":      "FT News Briefing",
        "publisher":      "Financial Times",
        "default_topics": ["Markets", "Company"],
        "source_tier":    4,
    },
    {
        # Reuters Breakingviews "The Big View" — weekly; BV columnists + senior
        # guests on the biggest deals and market questions of the moment.
        # Megaphone-hosted; repurposed from legacy "The Exchange" feed.
        # RC2-D1: URL verified working and deliberately LEFT UNCHANGED. It measured
        # 19d at audit time — a publishing gap, not evidence of a broken source.
        "rss_url":        "https://feeds.megaphone.fm/THRH1653885106",
        "show_name":      "The Big View",
        "publisher":      "Reuters Breakingviews",
        "default_topics": ["M&A", "Markets"],
        "source_tier":    4,
    },

    {
        # Bloomberg Odd Lots — Joe Weisenthal + Tracy Alloway on markets, macro,
        # and the plumbing of finance.  One of the highest-signal macro/markets feeds.
        # Omny-hosted (same platform as Surveillance).
        "rss_url":        "https://www.omnycontent.com/d/playlist/e73c998e-6e60-432f-8610-ae210140c5b1/8a94442e-5a74-4fa2-8b8d-ae27003a8d6b/982f5071-765c-403d-969d-ae27003a8d83/podcast.rss",
        "show_name":      "Odd Lots",
        "publisher":      "Bloomberg",
        "default_topics": ["Markets", "Macro"],
        "source_tier":    5,
    },

    # ── Tier 4: Mostly finance, occasional off-topic ───────────────────────────

    {
        # Invest Like the Best — Patrick O'Shaughnessy interviews investors, GPs,
        # and CEOs.  Strong private markets, M&A, and company analysis coverage.
        # Megaphone-hosted.
        "rss_url":        "https://feeds.megaphone.fm/investlikethebest",
        "show_name":      "Invest Like the Best",
        "publisher":      "Colossus",
        "default_topics": ["Private Markets", "Company"],
        "source_tier":    4,
    },
    {
        # Masters in Business — Barry Ritholtz long-form interviews with
        # investors, economists, and market strategists.  Bloomberg Media.
        "rss_url":        "https://www.omnycontent.com/d/playlist/e73c998e-6e60-432f-8610-ae210140c5b1/4e4cd910-40a1-4619-a5f3-ae2b0012ffff/5873a3cb-298f-40bc-b71f-ae2b0013000d/podcast.rss",
        "show_name":      "Masters in Business",
        "publisher":      "Bloomberg",
        "default_topics": ["Markets", "Company"],
        "source_tier":    4,
    },
    {
        # Macro Voices — Erik Townsend on global macro, rates, commodities, FX.
        # Weekly long-form; strong signal for Macro and Markets.
        "rss_url":        "https://feed.podbean.com/macrovoices/feed.xml",
        "show_name":      "Macro Voices",
        "publisher":      "Macro Voices",
        "default_topics": ["Macro", "Markets"],
        "source_tier":    4,
    },

    # ── Tier 3: Finance-adjacent; content filter needed ────────────────────────

    {
        # All-In Podcast — Chamath, Jason, David Sacks, David Friedberg on tech,
        # markets, geopolitics, and venture.  High volume; content filter removes
        # pure tech/culture episodes.
        "rss_url":        "https://rss.libsyn.com/shows/254861/destinations/1928300.xml",
        "show_name":      "All-In Podcast",
        "publisher":      "All-In",
        "default_topics": ["Tech / AI", "Markets"],
        "source_tier":    3,
    },
    {
        # Acquired — long-form deep dives on companies (tech, consumer, finance).
        # Excellent depth but covers sports teams, luxury brands, etc.
        "rss_url":        "https://feeds.transistor.fm/acquired",
        "show_name":      "Acquired",
        "publisher":      "Acquired",
        "default_topics": ["Company", "Tech / AI"],
        "source_tier":    3,
    },
    {
        # Planet Money — NPR economics storytelling.
        # Finance-adjacent; many episodes are human-interest with little market signal.
        "rss_url":        "https://feeds.npr.org/510289/podcast.xml",
        "show_name":      "Planet Money",
        "publisher":      "NPR",
        "default_topics": ["Macro", "Markets"],
        "source_tier":    3,
    },
    {
        # DealBook Summit — NYT/Andrew Ross Sorkin conversations from the annual
        # DealBook Summit (typically held in November).  Annual frequency only;
        # episodes will naturally age out of tight caps between events.
        # RC2-D1: RETAINED. This URL is the publisher's canonical feed and it
        # resolves; all 35 episodes cluster 2025-12-04..12-08, confirming an annual
        # event cadence rather than a dead source. It contributes each December and
        # sits outside the 14d cap the rest of the year — honest, not broken.
        "rss_url":        "https://feeds.simplecast.com/HZtr0HV5",
        "show_name":      "DealBook Summit",
        "publisher":      "The New York Times",
        "default_topics": ["M&A", "Company"],
        "source_tier":    3,
    },

    # ── Tier 4: Company deep dives + institutional allocators ────────────────────

    {
        # Business Breakdowns — Colossus | detailed per-company deep dives
        # covering unit economics, competitive moats, and operating model.
        # Same publisher as Invest Like the Best; consistently high finance signal.
        # RC2-D1: slug repaired `businessbreakdowns` -> `breakdowns` (the old slug
        # 404s). RETAINED DESPITE SITTING OUTSIDE THE 14d CAP at audit time
        # (newest 20d; cadence measured 20/78/93d). The feed resolves and the show
        # is active but irregular, so this is a publishing cadence, not URL rot.
        # It contributes whenever it publishes inside the cap.
        "rss_url":        "https://feeds.megaphone.fm/breakdowns",
        "show_name":      "Business Breakdowns",
        "publisher":      "Colossus",
        "default_topics": ["Company"],
        "source_tier":    4,
    },
    {
        # Capital Allocators — Ted Seides interviews LPs, endowment CIOs, and GPs.
        # Institutional private markets perspective; long-form, high-signal.
        "rss_url":        "https://rss.libsyn.com/shows/94820/destinations/482814.xml",
        "show_name":      "Capital Allocators",
        "publisher":      "Capital Allocators",
        "default_topics": ["Private Markets", "Company"],
        "source_tier":    4,
    },
    {
        # The Compound and Friends — Josh Brown + Michael Batnick (Ritholtz Wealth).
        # Daily market commentary, earnings reactions, macro takes. High cadence.
        "rss_url":        "https://feeds.megaphone.fm/TCP4771071679",
        "show_name":      "The Compound and Friends",
        "publisher":      "Ritholtz Wealth Management",
        "default_topics": ["Markets", "Company"],
        "source_tier":    4,
    },
    {
        # Animal Spirits — Michael Batnick + Ben Carlson on markets, portfolio
        # construction, and investor psychology. Weekly, 45-60 min.
        "rss_url":        "https://feeds.megaphone.fm/TCP6464651487",
        "show_name":      "Animal Spirits",
        "publisher":      "Ritholtz Wealth Management",
        "default_topics": ["Markets", "Macro"],
        "source_tier":    4,
    },

    # ── Tier 3: Venture / VC / Startup intelligence ───────────────────────────

    {
        # 20VC — Harry Stebbings interviews premier venture investors and founders.
        # Covers fund dynamics, deal flow, company building. Strong VC signal.
        # NOTE: verify RSS URL — show migrated platforms in 2023.
        "rss_url":        "https://rss.libsyn.com/shows/61840/destinations/240976.xml",
        "show_name":      "20VC",
        "publisher":      "20VC",
        "default_topics": ["Venture", "Private Markets"],
        "source_tier":    3,
    },
    {
        # a16z Podcast — Andreessen Horowitz institutional takes on AI, crypto,
        # bio, and enterprise software from a venture lens.
        "rss_url":        "https://feeds.simplecast.com/JGE3yC0V",
        "show_name":      "a16z Podcast",
        "publisher":      "Andreessen Horowitz",
        "default_topics": ["Venture", "Tech / AI"],
        "source_tier":    3,
    },
    {
        # My First Million — Sam Parr + Shaan Puri on startup business models,
        # emerging opportunities, and founder intelligence. High episode volume.
        "rss_url":        "https://feeds.megaphone.fm/HS2300184645",
        "show_name":      "My First Million",
        "publisher":      "Hubspot Podcast Network",
        "default_topics": ["Venture", "Company"],
        "source_tier":    3,
    },
    {
        # Bankless — Ryan Sean Adams + David Hoffman on crypto markets, DeFi,
        # and digital asset strategy from an institutional adoption lens.
        "rss_url":        "https://feeds.flightcast.com/p83fuj0y0u58o82l41xei7zo.xml",
        "show_name":      "Bankless",
        "publisher":      "Bankless",
        "default_topics": ["Venture", "Tech / AI"],
        "source_tier":    3,
    },

    # ── Tier 2: Broad business/culture; content filter essential ──────────────

    {
        # The Big Picture — Barry Ritholtz on markets and investing (when finance-focused).
        # Currently publishing mostly movie/culture content; tier 2 + content filter
        # ensures only the occasional finance episodes surface.
        "rss_url":        "https://feeds.megaphone.fm/the-big-picture",
        "show_name":      "The Big Picture",
        "publisher":      "Ritholtz Wealth Management",
        "default_topics": ["Markets", "Macro"],
        "source_tier":    2,
    },
]


# ═══════════════════════════════════════════════════════════════════════════════
# 2.  FETCH SETTINGS
# ═══════════════════════════════════════════════════════════════════════════════

_MAX_PER_FEED    = 20    # episodes fetched per source before quality filtering (raised from 12)
_FETCH_WORKERS   = 8     # parallel HTTP threads (raised for expanded feed set)
_CACHE_TTL       = 600   # in-memory cache lifetime (seconds) — 10 minutes

# Minimum finance signal score an episode must reach to be included.
# Set to 0 — the finance-signal gate is DISABLED for podcast ingestion.
# Episodes are no longer hard-dropped based on keyword density; they are
# ranked lower instead.  The only hard drops that remain are:
#   - no title
#   - matches _OFFBRAND_TITLE_RE (unambiguous non-finance content)
#   - older than _MAX_AGE_GLOBAL_H
# This ensures that episodes with terse RSS descriptions (e.g. daily
# briefings from Tier-5 shows that contain only a show-name + date) are not
# silently discarded before tier/freshness scoring has a chance to rank them.
_MIN_FINANCE_SCORE = 0

# ── Per-tier minimum signal floor ─────────────────────────────────────────────
# When an episode's finance_signal is 0 (or very low due to sparse RSS text),
# _final_score would collapse to max(1, round(0 × tier × fresh)) = 1 for every
# episode regardless of source quality or freshness.
#
# The floor prevents this by substituting a small proxy signal derived from the
# show's source tier.  A fresh Tier-5 episode with signal=0 scores ~14 (still
# well below a genuine signal=20 episode at ~36) while a Tier-2 zero-signal
# episode scores ~1.  Tier and freshness remain meaningful discriminators.
_MIN_SIGNAL_BY_TIER: dict[int, int] = {
    5: 8,   # Bloomberg Surveillance, GS Exchanges, Morgan Stanley, Odd Lots
    4: 5,   # The Journal, FT Briefing, Axios, Macro Voices, ILTB, MiB
    3: 3,   # Acquired, Planet Money, All-In, DealBook Summit
    2: 1,   # The Big Picture (mostly off-topic)
    1: 0,   # reserved
}

# ── Minimum finance signal to apply show-level default_topics as a fallback ───
# High-trust shows (tier 4–5) always deserve their defaults — their content is
# on-brand even when RSS text is terse (e.g. "Bloomberg Surveillance Apr 27").
# Broad shows (tier 2–3) must clear a higher bar before defaults are applied,
# preventing All-In "mailbag" or Acquired "sports team" episodes from inheriting
# "Tech / AI" or "Company" by default with no finance signal.
_MIN_SIGNAL_FOR_DEFAULT_TOPIC: dict[int, int] = {
    5: 0,   # always use defaults (Bloomberg, GS, MS, Odd Lots)
    4: 0,   # always use defaults (FT, Axios, Indicator, ILTB, MiB, Macro Voices)
    3: 4,   # require finance_signal ≥ 4 (All-In, Acquired, Planet Money, DealBook)
    2: 6,   # require finance_signal ≥ 6 (The Big Picture — mostly movies/culture)
    1: 8,   # reserved
}


# ═══════════════════════════════════════════════════════════════════════════════
# 2a.  FRESHNESS CONFIG
# ═══════════════════════════════════════════════════════════════════════════════
#
#  Freshness is multiplied into the final ranking score so that every rail that
#  sorts or selects by relevance_score automatically prefers fresh content.
#
#  Age bracket edges (hours):
_FRESH_STRONG_H   =  24   # ≤ 24h   → strong boost
_FRESH_MODERATE_H =  48   # ≤ 48h   → moderate boost
_FRESH_NEUTRAL_H  =  72   # ≤ 3d    → neutral — "current" window (tightened from 96h/4d)
_FRESH_WEAK_H     = 168   # ≤ 7d    → mild penalty (tightened from 240h/10d)
#                          # > 10d   → stale multiplier
#
#  Multipliers applied at each bracket:
_FRESH_MULT: dict[str, float] = {
    "strong":   1.50,   # ≤ 24h  — extra boost for very fresh content
    "moderate": 1.20,   # ≤ 48h
    "neutral":  1.00,   # ≤ 4d   — no penalty; "current" window
    "weak":     0.60,   # ≤ 10d  — mild penalty (raised from 0.45; keeps 4–10d eligible)
    "stale":    0.25,   # > 10d  — meaningful downrank but not invisible (raised from 0.15)
}

# ── Age limits (hours) ────────────────────────────────────────────────────────

# Featured: two-pass selection — strongly prefer ≤ PREFER, hard cap at H.
# No stale fallback beyond the hard cap.  If nothing qualifies, pick best available.
_MAX_AGE_FEATURED_PREFER_H = 48    # first-pass: strongly prefer ≤ 48h
_MAX_AGE_FEATURED_H        = 72    # hard cap: never feature an episode older than this

# Rail concepts (inform freshness scoring; Trending/Quick/Deep are client-side):
_MAX_AGE_TRENDING_H  =  72   # Trending Now — conceptual 72h window
_MAX_AGE_QUICK_H     = 168   # Quick Listens — 7d
_MAX_AGE_DEEP_H      = 336   # Deep Dives — 14d

# Global hard cutoff — always drop episodes older than this regardless of score.
_MAX_AGE_GLOBAL_H    = 336   # 14d absolute max (raised from 240h/10d to keep more supply)

# Per-topic hard age caps.  Applied in route handlers.
# If a topic returns 0 results within this cap, the route expands once to
# _TOPIC_FALLBACK_MAX_AGE_H before returning sparse/empty.
# To loosen a specific topic, raise its value here — nowhere else.
_MAX_AGE_BY_TOPIC: dict[str, int] = {
    "M&A":             240,   # 10d — deal news cycles slowly (raised from 7d)
    "Private Markets": 240,   # 10d — fundraising/PE cycles are long (raised from 7d)
    "Venture":         240,   # 10d — VC/startup deals cycle slowly
    "Company":         240,   # 10d — company events stay relevant longer (raised from 7d)
    "Tech / AI":       168,   # 7d  — raised from 5d
    "Geopolitical":    120,   # 5d  — keep tight; geopolitical news moves fast
    "Macro":           168,   # 7d  — raised from 5d
    "Markets":         168,   # 7d  — raised from 5d
}

# ── Sparse-topic fallback ─────────────────────────────────────────────────────
# When a topic returns 0 episodes within its hard cap, the window expands ONCE
# to _TOPIC_FALLBACK_MAX_AGE_H before the route returns empty.
# Set to 0 to disable expansion entirely.
_TOPIC_FALLBACK_MAX_AGE_H = 336    # 14d one-shot expansion (raised from 240h/10d)

# If the topic still has fewer than _TOPIC_MIN_RESULTS after any expansion,
# the route fills remaining slots with high-scoring cross-topic episodes tagged
# is_secondary=True so the UI can distinguish them from primary topic matches.
_TOPIC_MIN_RESULTS   = 8           # fill up to this many slots per topic tab before giving up
_SECONDARY_MIN_SCORE = 3           # minimum score for cross-topic secondary fill (lowered from 4)

# ── Minimum scores by topic (for topic-filtered API calls) ───────────────────
# Episodes below the topic's minimum score are excluded from topic-filtered
# results rather than filled in as weak matches.
# Lowered across the board to widen candidate pools — freshness multipliers
# already penalise stale content; we rely on scoring to rank rather than gate.
_MIN_SCORE_BY_TOPIC: dict[str, int] = {
    "M&A":             3,    # lowered from 4 — thin category; wider candidates needed
    "Private Markets": 3,    # lowered from 4 — thin category
    "Venture":         3,    # thin category; wider candidates needed
    "Tech / AI":       3,    # lowered from 4
    "Geopolitical":    3,    # lowered from 4
    "Macro":           3,    # lowered from 4
    "Company":         2,    # lowered from 3 — opens more single-name stories
    "Markets":         2,    # unchanged — broad catch-all; wide inclusion appropriate
}


# ═══════════════════════════════════════════════════════════════════════════════
# 2b.  EDITORIAL CONTROLS  ← tune these to adjust page feel
# ═══════════════════════════════════════════════════════════════════════════════
#
#  All constants here are PUBLIC (no leading underscore) so they can be imported
#  by route handlers and the frontend API.  Change these to reshape content mix.

# ── Section freshness caps (hours) ────────────────────────────────────────────
# Hard age cutoffs applied client-side when slicing episodes into page rails.
# The backend already scores freshness into relevance_score; these caps add a
# hard wall so stale episodes never appear in time-sensitive sections.
SECTION_FRESHNESS_CAPS: dict[str, int] = {
    "featured":  72,    # Featured hero: hard 72h max (unchanged)
    "trending":  72,    # Trending Now: 3 days (tightened from 96h — keeps rail actually fresh)
    "quick":     96,    # Quick Listens: 4 days (unchanged)
    "deep":     168,    # Deep Dives: 7 days (unchanged)
    "latest":   168,    # Latest Episodes: 7 days (unchanged)
}

# ── Category balancing for the All-tab pool ───────────────────────────────────
# Max episodes per primary topic in the combined All-tab API response.
# Prevents a high-inventory topic (Markets, Macro) from monopolising the page.
# Raise a value to allow more episodes from that topic; lower to cap it.
MAX_PER_TOPIC_ALL: dict[str, int] = {
    "Markets":         8,    # raised from 5
    "Macro":           8,    # raised from 5
    "Company":         6,    # raised from 4
    "Tech / AI":       6,    # raised from 4
    "Geopolitical":    5,    # raised from 3
    "M&A":             4,    # raised from 3
    "Private Markets": 3,    # raised from 2
    "Venture":         4,    # new category — VC/startup episodes
}

# ── Show diversity cap ────────────────────────────────────────────────────────
# Max episodes from the same show in a single All-tab API response.
# Prevents one prolific daily show (e.g. WSJ What's News) from dominating.
MAX_PER_SHOW = 2    # 2 per show prevents daily briefing shows from taking 3 slots each

# ── Fallback behavior ─────────────────────────────────────────────────────────
# When the live API returns nothing, the frontend may fall back to mock data.
# MOCK_FALLBACK_ENABLED: allow mock data for the All tab when API returns empty.
# TOPIC_MOCK_FALLBACK_ENABLED: disabled — prefer sparse real results over fake filler.
MOCK_FALLBACK_ENABLED       = True
TOPIC_MOCK_FALLBACK_ENABLED = False


# ═══════════════════════════════════════════════════════════════════════════════
# 3.  SOURCE TIER MULTIPLIERS
# ═══════════════════════════════════════════════════════════════════════════════
#
#  Applied to each episode's raw finance signal during final scoring.
#  A tier-5 episode with signal=10 scores 12.0 (×1.2).
#  A tier-2 episode with signal=10 scores 6.0 (×0.6) — same content, lower rank.

_SOURCE_TIER_MULT: dict[int, float] = {
    1: 0.40,
    2: 0.60,
    3: 0.85,
    4: 1.00,
    5: 1.20,
}


# ═══════════════════════════════════════════════════════════════════════════════
# 4.  OFF-BRAND HARD FILTER  (checked against title only)
# ═══════════════════════════════════════════════════════════════════════════════
#
#  If the episode title matches this pattern, the episode is dropped immediately
#  regardless of source tier or any other scoring.  This is the safety net for
#  entertainment/lifestyle content that leaks through from broad shows.
#
#  Intentionally conservative: only fires on unambiguous non-finance content.
#  Edge cases (e.g. "NFL Sunday Ticket antitrust case") are handled by the
#  finance signal minimum threshold further down.

_OFFBRAND_TITLE_RE = re.compile(
    r"""(?ix)
    # Movies / TV / awards
    \b(best\s+movies?\b
    |  movie\s+(?:review|of\s+the\s+year|draft|season|conversation)
    |  film\s+(?:review|season|conversation|is\s+)
    |  oscars?\b | emmys?\b | grammys?\b | academy\s+award
    |  box.?office
    |  watching\b.{0,20}\bfilm\b
    |  spielberg | scorsese | kubrick | tarantino
    |  hail\s+mary | dune\b.{0,15}\bpart\b    # specific sci-fi films
    )

    # Relationship / marriage / dating advice
    # Fires on clear advice/lifestyle framing — not on "divorce rate" (macro) or
    # "marriage penalty" (tax policy) which have market context.
    |  \b(marriage\s+(?:advice|counseling|counselor|coach|crisis|problem|secret)
    |  divorce\s+(?:advice|coach|attorney|lawyer|guide|tip)
    |  relationship\s+(?:advice|coach|tip|counseling|red\s+flag|goal)
    |  couples?\s+(?:therapy|counseling|counselor|retreat)
    |  dating\s+(?:advice|coach|guru|rule|tip|mistake)
    |  love\s+language
    )

    # Voicemail bag / mailbag / listener Q&A meta episodes
    # These are show-meta episodes with no market content.
    |  \b(voicemail\s*bag | mail\s*bag | mailbag\b
    |  listener\s+(?:question|mail|voicemail|q\s*[&a]\s*a)
    |  your\s+(?:questions?|voicemail)\s+answered
    |  all.in\s+mailbag                       # specific All-In meta format
    )

    # Sports (pure sports content, not business-of-sports)
    |  \b(nfl\s+draft | nba\s+draft | mlb\s+draft
    |  super\s+bowl | world\s+cup | stanley\s+cup\s+(?:final|playoff)
    |  march\s+madness | nba\s+(?:finals?|playoffs?)
    |  nfl\s+playoffs? | nfl\s+season\b
    |  sports\s+betting | fantasy\s+(?:football|basketball|sports?)
    |  movie\s+draft | film\s+draft               # fantasy draft for movies
    )

    # Celebrity / lifestyle (when clearly the main subject)
    |  \b(celebrity\s+gossip
    |  dating\s+app | tinder | bumble\b
    |  (?:ready|prepared)\s+for\s+sex\b   # "ChatGPT Ready for Sex" — word order fixed
    |  \bfor\s+sex\b                       # broader catch: "designed for sex", etc.
    |  fertility\s+(?:clinic|inc|treatment)               # consumer health, not pharma
    |  school\s+lunche?s?                               # policy, no market angle
    |  pokemon | pokémon | pok[eé]mon                   # gaming/collector, not finance
    |  recipe\b | chef\s+vs                             # food, not commodity prices
    )

    # Personal finance lifestyle fluff (non-market personal advice)
    # "Money tips", "budgeting hacks" etc. — no market angle.
    # Note: "budget deficit" is NOT caught here (no "tips/hacks/advice" suffix).
    |  \b(money\s+(?:hack|tip|mistake|saving\s+tip|saving\s+advice)
    |  budget(?:ing)?\s+(?:tip|hack|advice|guide|mistake)
    |  personal\s+finance\s+(?:tip|advice|hack|guide|mistake)
    |  weight\s+loss | self.?help\b | life\s+hack
    )

    # Award/cultural hangover episodes (specific pattern from The Big Picture)
    |  \b(oscar\s+hangover | movie\s+hangover | film\s+hangover)
    """,
    re.IGNORECASE | re.VERBOSE,
)


# ═══════════════════════════════════════════════════════════════════════════════
# 5.  TOPIC CLASSIFICATION RULES
# ═══════════════════════════════════════════════════════════════════════════════
#
#  Each TopicRule has:
#    strong  — regex patterns worth 3 points each (high-precision finance terms)
#    weak    — regex patterns worth 1 point each (general finance terms)
#    veto    — regex that cancels this topic even if score ≥ min_score
#    min_score — minimum cumulative score to assign the topic label
#
#  Topics with min_score=3 require at least one strong keyword hit.
#  Topics with min_score=2 can be assigned with two weak hits.
#  This asymmetry prevents weak/generic terms from flooding every episode.

@dataclass
class _TopicRule:
    label:     str
    strong:    re.Pattern          # worth 3 pts per match
    weak:      re.Pattern          # worth 1 pt per match
    veto:      re.Pattern | None = None
    min_score: int                 = 2

    def score(self, text: str) -> int:
        if self.veto and self.veto.search(text):
            return 0
        return (
            len(self.strong.findall(text)) * 3
            + len(self.weak.findall(text)) * 1
        )

    def matches(self, text: str) -> bool:
        return self.score(text) >= self.min_score


@dataclass
class _MATopicRule(_TopicRule):
    """
    M&A-specific variant with a two-tier veto:

      hard_veto  — always blocks regardless of any deal language (pure entertainment).
      veto       — blocks ONLY when there is no strong corporate deal term present.
                   This allows "Disney's $8B acquisition of a streaming platform"
                   to score M&A, while "Netflix streaming rights renewal" is vetoed.
    """
    hard_veto: re.Pattern | None = None

    def score(self, text: str) -> int:
        # Hard veto fires unconditionally (pure entertainment — Oscars, Grammys, etc.)
        if self.hard_veto and self.hard_veto.search(text):
            return 0
        strong_hits = len(self.strong.findall(text)) * 3
        weak_hits   = len(self.weak.findall(text)) * 1
        # Soft veto (self.veto) fires only when there is NO strong M&A term present.
        # Once explicit acquisition/merger language exists, media deal language is fine.
        if self.veto and self.veto.search(text) and strong_hits == 0:
            return 0
        return strong_hits + weak_hits


@dataclass
class _TechAITopicRule(_TopicRule):
    """
    Tech/AI variant: allows qualification when a strong company-catalyst event
    (earnings, revenue, CEO, analyst action, IPO) co-occurs with any AI/tech
    weak keyword — even if no standalone Tech/AI strong keyword is present.

    Scoring bonus: if company_ctx matches AND ≥1 weak tech/AI keyword is found,
    add +2 to weak_hits.  This lets "Apple earnings + AI" reach min_score=3
    without requiring a full strong hit like "OpenAI" or "semiconductor".

    Setting company_ctx=None disables the boost (falls back to standard scoring).
    """
    company_ctx: re.Pattern | None = None

    def score(self, text: str) -> int:
        if self.veto and self.veto.search(text):
            return 0
        strong_hits = len(self.strong.findall(text)) * 3
        weak_count  = len(self.weak.findall(text))
        weak_hits   = weak_count * 1
        # Company-context boost: strong company catalyst + any AI/tech weak keyword
        # together reach the min_score threshold without a standalone strong AI hit.
        if (self.company_ctx
                and self.company_ctx.search(text)
                and weak_count > 0):
            weak_hits += 2
        return strong_hits + weak_hits


_TOPIC_RULES: list[_TopicRule] = [

    # ── Venture ───────────────────────────────────────────────────────────────
    # Evaluated FIRST so startup/VC round stories own the Venture label before
    # Private Markets can absorb them via incidental "venture capital" vocabulary.
    _TopicRule(
        label     = "Venture",
        strong    = re.compile(
            r"\b(?:"
            r"series\s+[a-f]\s+(?:round|funding|raise|close|investment)"
            r"|seed\s+(?:round|funding|investment|stage)"
            r"|pre.?seed\s+(?:round|funding|raise)"
            r"|angel\s+(?:round|investor|investment|funding)"
            r"|y\s*combinator|ycombinator|yc\s+(?:batch|alum|backed|startup)"
            r"|accelerator\s+(?:program|batch|backed|alum)"
            r"|techstars\b|500\s+startups?\b"
            r"|startup\s+(?:funding|raises?|secures?|closes?)\s+\$"
            r"|founder.?led\b"
            r"|venture.?backed\s+startup"
            r"|term\s+sheet\b"
            r"|cap\s+table\b"
            r"|pitch\s+(?:deck|competition)"
            r"|pre.?money\s+valuation|post.?money\s+valuation"
            r")\b",
            re.IGNORECASE,
        ),
        weak      = re.compile(
            r"\b(?:"
            r"startup\b|founder\b|founders\b"
            r"|entrepreneur\b"
            r"|vc\b"
            r"|unicorn\b"
            r"|pre.?ipo\b"
            r"|incubator\b"
            r"|exits?\s+(?:strategy|path|route|to\s+ipo)"
            r")\b",
            re.IGNORECASE,
        ),
        min_score = 2,
    ),

    # ── Private Markets ────────────────────────────────────────────────────────
    # Evaluated AFTER Venture so institutional PE/credit/fund episodes own
    # Private Markets without competing with startup deal vocabulary.
    _TopicRule(
        label     = "Private Markets",
        strong    = re.compile(
            r"\b(?:"
            r"private\s+(?:equity|credit|markets?|debt|capital)"
            r"|pe\s+(?:firm|fund|buyout|deal|backed)"
            r"|venture\s+capital|vc\s+(?:fund|firm|backed)"
            r"|carried\s+interest|dry\s+powder"
            r"|fund\s+(?:raise|raising|close|closing)"
            r"|lp\s+(?:capital|investor|distribution)"
            r"|general\s+partner|limited\s+partner"
            r"|portfolio\s+company"
            r"|sponsor.?backed|financial\s+sponsor"
            r"|direct\s+lending|direct\s+lend"
            r"|leveraged\s+(?:loan|finance|lending)"
            r"|infrastructure\s+(?:fund|deal|investment|asset|investing)"
            r"|distressed\s+(?:debt|credit|assets?|fund|investing)"
            r"|clo\b|collateralized\s+loan\s+obligation"
            r"|nav\s+(?:loan|credit|facility|financing)"
            r"|gp.led\b|continuation\s+(?:fund|vehicle)"
            r"|credit\s+fund\b|private\s+fund\b"
            r")\b",
            re.IGNORECASE,
        ),
        weak      = re.compile(
            r"\b(?:"
            r"alternatives\b|illiquid\b|buyout\s+fund"
            r"|unicorn\b|pre.?ipo\b|secondary\s+(?:market|fund)"
            r"|infrastructure\b|sponsor\b|fundraising\b"
            r"|secondaries\b|distressed\b"
            r"|real\s+assets?\b|lp\b|gp\b"             # LP/GP used alone as fund context
            r")\b",
            re.IGNORECASE,
        ),
        min_score = 2,   # lowered from 3 — two weak hits sufficient (e.g. "sponsor + fundraising")
    ),

    # ── M&A ────────────────────────────────────────────────────────────────────
    # High bar (min_score=3) — must hit at least one strong transaction term.
    # Uses _MATopicRule for two-tier veto logic:
    #   hard_veto: always blocks (pure entertainment — awards, sports leagues, etc.)
    #   soft veto: blocks media/content deal language ONLY when no strong M&A term
    #              is present, so "Disney's acquisition of a streaming platform"
    #              still scores M&A while "Netflix streaming rights renewal" does not.
    # IPO added as weak keyword (1pt) — alone insufficient; triggers with deal language.
    _MATopicRule(
        label     = "M&A",
        strong    = re.compile(
            r"\b(?:"
            # Explicit acquisition language
            r"acqui(?:res?|ring|sition|sitions)"
            r"|acquired\s+(?:by|for|from)\b"
            r"|merger|mergers"
            r"|buyout\b|buy.?out\b"                     # company buyout (not fund buyout)
            r"|takeover|take.?over"
            r"|divestiture|divest(?:ing|ed|s)?"
            r"|lbo\b|mbo\b"                             # leveraged / mgmt buyout
            r"|going\s+private|take.?private"
            r"|sale\s+process|strategic\s+(?:review|alternatives?)"
            r"|definitive\s+agreement"
            r"|deal(?:making|flow)\b"
            r"|bidder\b|hostile\s+(?:bid|offer|takeover)"
            r"|agreed\s+to\s+(?:buy|acquire|purchase)"
            r"|in\s+talks\s+to\s+(?:buy|acquire|sell|divest)"
            r"|nears?\s+deal\b"
            r")\b",
            re.IGNORECASE,
        ),
        weak      = re.compile(
            r"\b(?:"
            r"deal\b|transaction\b"
            r"|consolidation\b|integration\b"
            r"|ipo\b|initial\s+public\s+offering"       # weak: needs deal context to score M&A
            r"|bid\b|bidding\b"                         # takeover bid language
            r"|dealmaking\b|dealflow\b"
            r")\b",
            re.IGNORECASE,
        ),
        # Soft veto — fires only when strong_hits == 0 (see _MATopicRule.score).
        # Blocks pure media/content licensing stories without acquisition language.
        veto      = re.compile(
            r"\b(?:"
            r"streaming\s+rights?|content\s+(?:deal|rights?)|licensing\s+deal"
            r"|film\s+rights?|tv\s+rights?|media\s+rights?"
            r"|sports\s+deal|music\s+deal|record\s+deal"
            r")\b",
            re.IGNORECASE,
        ),
        # Hard veto — always blocks: pure entertainment awards and sports league refs.
        hard_veto = re.compile(
            r"\b(?:oscar|grammy|emmy|nfl\b|nba\b|nhl\b|mlb\b|soccer)\b",
            re.IGNORECASE,
        ),
        min_score = 3,
    ),

    # ── Company ───────────────────────────────────────────────────────────────
    # Evaluated BEFORE Tech / AI so that single-name stories (earnings, IPO,
    # CEO, analyst actions) are owned by Company, not stolen by incidental
    # AI/tech vocabulary in the description.
    _TopicRule(
        label     = "Company",
        strong    = re.compile(
            r"\b(?:"
            r"earn(?:ings?)\s+(?:report|beat|miss|season|call|results?)"
            r"|quarterly\s+(?:results?|earnings?|report)"
            r"|revenue\s+(?:beat|miss|growth|decline|rose|fell)"
            r"|profit\s+(?:warning|margin|growth|decline)"
            r"|analyst\s+(?:upgrade|downgrade|raises?|cuts?|target)"
            r"|price\s+target"
            r"|ceo\s+(?:resign|depart|fired|hired|steps?\s+down|appoin)"
            r"|chief\s+executive\s+(?:resign|leave|appoin)"
            r"|stock\s+(?:buyback|repurchase|split)"
            r"|share\s+buyback|dividend\s+(?:cut|increase|special)"
            r"|full.year\s+(?:guidance|outlook|forecast|results?)"
            r"|ipo\b|initial\s+public\s+offering"
            r"|secondary\s+offering|secondary\s+stock"
            r"|spin.?off|spinoff|carve.?out"
            r"|capex\b|capital\s+expenditures?\b"
            r"|beat\s+(?:estimates?|expectations?|consensus)"
            r"|miss\s+(?:estimates?|expectations?|consensus)"
            r"|activist\s+(?:investor|stake|campaign|pressure)"
            r"|bankruptcy\b|chapter\s+11\b|restructur\w+"
            r"|margin\s+(?:expansion|compression|improvement)"
            r"|market\s+share\b"
            r")\b",
            re.IGNORECASE,
        ),
        weak      = re.compile(
            r"\b(?:"
            r"earnings?\b|revenue\b|guidance\b|profit\b|results?\b"
            r"|ceo\b|cfo\b|coo\b|shares?\b|valuation\b"
            r"|management\b|strategic\b|capex\b"
            r"|outlook\b|forecast\b|quarter\b|quarterly\b"
            r"|growth\b|layoffs?\b|workforce\b"          # company-catalyst signals
            r")\b",
            re.IGNORECASE,
        ),
        min_score = 2,
    ),

    # ── Tech / AI ─────────────────────────────────────────────────────────────
    # min_score=3 — normally requires one STRONG keyword hit (OpenAI, GPU, LLM…).
    # Exception via company_ctx boost: if a strong company-catalyst term (earnings,
    # revenue beat, CEO, analyst action, IPO) accompanies any tech/AI weak keyword,
    # weak_hits receives +2, allowing the combo to reach min_score=3.
    # Example: "Apple earnings beat + AI" → weak(1) + boost(2) = 3 ✓
    # Example: "ai" alone → 1 < 3 ✗  |  "tech + software" → 2 < 3 ✗
    _TechAITopicRule(
        label     = "Tech / AI",
        strong    = re.compile(
            r"\b(?:"
            r"artificial\s+intelligence|machine\s+learning"
            r"|large\s+language\s+model|llm\b|gpt.?\d|chatgpt"
            r"|gpu\b|nvidia|openai|anthropic|deepmind|mistral"
            r"|semiconductor|chip(?:maker)?\b|foundry\b"
            r"|data\s+center\b|hyperscaler\b"
            r"|agentic\b|ai\s+agent\b|foundation\s+model\b"
            r"|model\s+(?:training|inference|deployment)"
            r"|deepseek\b|gemini\b"
            # Added: specific tech domains that unambiguously signal the topic
            r"|cybersecurity\b|cyber\s+(?:attack|security|threat)"
            r"|quantum\s+computing\b"
            r"|robotics?\s+(?:company|startup|platform|sector|industry)"
            r")\b",
            re.IGNORECASE,
        ),
        weak      = re.compile(
            # Intentionally narrow: these alone are NOT sufficient for Tech / AI.
            # Three weak hits = min_score (3 pts) so words must co-occur.
            # Removed: technology (too generic — "The technology of bond markets"),
            #          platform (too generic — "investment platform"),
            #          hardware (too generic — "hardware store" etc.),
            #          cloud (too generic — "cloud of uncertainty"),
            #          automation (too generic — "automation of back-office tasks").
            # Kept: ai, tech (abbreviation), algorithm, startup, silicon valley, saas/paas.
            r"\b(?:"
            r"ai\b|tech\b"                               # abbreviations only; not "technology"
            r"|algorithm\b"
            r"|software\b"                               # kept: clearly tech when 3 hits occur
            r"|startup\b|silicon\s+valley"
            r"|saas\b|paas\b"                            # software business models
            r")\b",
            re.IGNORECASE,
        ),
        veto      = re.compile(
            r"\b(?:ai\s+(?:in\s+)?(?:movies?|film|sport|soccer|dating))\b",
            re.IGNORECASE,
        ),
        company_ctx = re.compile(
            r"\b(?:"
            r"earn(?:ings?)\s+(?:report|beat|miss|season|call|results?)"
            r"|quarterly\s+(?:results?|earnings?|report)"
            r"|revenue\s+(?:beat|miss|growth|decline|rose|fell)"
            r"|profit\s+(?:warning|margin|growth|decline)"
            r"|analyst\s+(?:upgrade|downgrade|raises?|cuts?|target)"
            r"|price\s+target"
            r"|ceo\s+(?:resign|depart|fired|hired|steps?\s+down|appoin)"
            r"|ipo\b|initial\s+public\s+offering"
            r")\b",
            re.IGNORECASE,
        ),
        min_score = 3,
    ),

    # ── Geopolitical ──────────────────────────────────────────────────────────
    _TopicRule(
        label     = "Geopolitical",
        strong    = re.compile(
            r"\b(?:"
            r"tariff|tariffs|sanction|sanctions"
            r"|trade\s+(?:war|barrier|dispute|tension|deal)"
            r"|geopolit\w+"
            r"|nuclear\b(?!\s+(?:family|medicine|plant\s+(?:closure|accident)))"
            r"|iran\b|north\s+korea|taiwan\s+strait"
            r"|export\s+(?:ban|control|restriction)"
            r"|strait\s+of\s+hormuz|red\s+sea"
            r")\b",
            re.IGNORECASE,
        ),
        weak      = re.compile(
            r"\b(?:"
            r"china\b|russia\b|ukraine\b|taiwan\b"
            r"|nato\b|g7\b|g20\b|opec\b"
            r"|military\b|diplomac\w+|conflict\b"
            r"|election\b|regime\b|invasion\b"
            r")\b",
            re.IGNORECASE,
        ),
        min_score = 2,
    ),

    # ── Macro ─────────────────────────────────────────────────────────────────
    # Covers monetary policy (Fed, ECB, BOJ), fiscal policy (deficits, spending),
    # and macroeconomic data (GDP, inflation).  Tariffs/trade added to weak so
    # that "tariff → Fed response → inflation" stories pick up both Geopolitical
    # (strong) AND Macro labels rather than silently losing the Macro angle.
    _TopicRule(
        label     = "Macro",
        strong    = re.compile(
            r"\b(?:"
            r"federal\s+reserve|the\s+fed\b"
            r"|fed\s+chair(?:man)?|jerome\s+powell|chair\s+powell"
            r"|interest\s+rate|rate\s+(?:cut|hike|pause|hold)"
            r"|inflation\s+(?:rate|data|report|surge|spike|eases?)"
            r"|monetary\s+(?:policy|tightening|easing)"
            r"|quantitative\s+(?:easing|tightening|tapering)"
            r"|dot\s+plot|jackson\s+hole"
            r"|gdp\s+(?:growth|data|report|contraction)"
            r"|recession\b|stagflation\b"
            r"|central\s+bank|bank\s+of\s+(?:japan|england|canada|china)"
            r"|ecb\b|boj\b|boe\b"
            r"|yield\s+curve|inverted\s+yield"
            r"|treasury\s+yield|10.year\s+(?:yield|note)"
            # Added: fiscal policy terms that are unambiguously macro
            r"|fiscal\s+(?:policy|stimulus|spending|deficit)"
            r"|debt\s+ceiling\b|national\s+debt\b"
            r"|budget\s+(?:deficit|surplus)"
            r")\b",
            re.IGNORECASE,
        ),
        weak      = re.compile(
            r"\b(?:"
            r"fed\b|rate\b|inflation\b|gdp\b"
            r"|recession\b|fiscal\b|monetary\b"
            r"|treasury\b|yield\b|economy\b|economic\b"
            r"|deficit\b|surplus\b"                      # added: fiscal balance terms
            r"|tariff\b"                                 # added: tariff policy is often Macro context
            r")\b",
            re.IGNORECASE,
        ),
        min_score = 2,
    ),

    # ── Markets ───────────────────────────────────────────────────────────────
    # Intentionally placed after more specific topics so M&A/Macro/Company
    # take priority; Markets is a catch-all for price-action / structure episodes.
    _TopicRule(
        label     = "Markets",
        strong    = re.compile(
            r"\b(?:"
            r"s&p\s*500|nasdaq\s+(?:\d|composite)|dow\s+jones"
            r"|stock\s+(?:market|rally|selloff|sell.off|crash|correction)"
            r"|equity\s+(?:market|rally|selloff)"
            r"|credit\s+(?:spread|market|crunch|crisis)"
            r"|vix\b|volatility\s+(?:spike|surge|index)"
            r"|yield\s+(?:curve|spread)"
            r"|hedge\s+fund|asset\s+(?:allocation|management|class)"
            r"|portfolio\s+(?:manager|allocation|rebalance)"
            r"|bull\s+market|bear\s+market"
            r"|market\s+(?:rally|selloff|correction|crash|bubble)"
            r"|oil\s+(?:price|market|rally|drop|crash|slump|surge)"
            r"|bond\s+(?:market|rally|selloff|rout)"
            r"|dollar\s+(?:rally|drop|weakness|strength|index|surge)"
            r"|commodit\w+\s+(?:price|market|rally|selloff)"
            r"|risk.off\b|risk.on\b"
            r"|equity\s+risk\s+premium|earnings?\s+yield\b"
            r")\b",
            re.IGNORECASE,
        ),
        weak      = re.compile(
            r"\b(?:"
            r"market\b|markets\b|stocks?\b|equit\w+\b"
            r"|bonds?\b|investors?\b|trading\b|index\b"
            r"|wall\s+street\b|investment\b"
            r"|yields?\b|commodit\w+\b|volatility\b"
            r"|rates?\b|dollar\b|fx\b|crude\b|brent\b"  # FX / commodity proxies
            r"|sector\b|rotation\b|selloff\b|correction\b"
            r")\b",
            re.IGNORECASE,
        ),
        min_score = 2,
    ),
]

# Evaluation order matters for two reasons:
#   1. The first matching topic becomes the primary label (drives why_it_matters).
#   2. Post-hoc arbitration uses scores, but the order sets the default winner.
#
# Ordering rationale:
#   Private Markets before M&A  — PE/credit/fundraising stories should own their
#                                  label before M&A can claim them via deal vocabulary.
#   Company before Tech / AI    — single-name catalysts (earnings, IPO, CEO) own
#                                  the episode; Tech/AI only wins if AI is the dominant subject.
#   Geopolitical before Macro   — trade/sanctions stories are geopolitical first.
#   Markets last                — broad catch-all for price-action episodes.
_TOPIC_ORDER = [
    "Venture", "Private Markets", "M&A", "Company", "Tech / AI",
    "Geopolitical", "Macro", "Markets",
]
_TOPIC_RULE_MAP: dict[str, _TopicRule] = {r.label: r for r in _TOPIC_RULES}


# ═══════════════════════════════════════════════════════════════════════════════
# 6.  FINANCE SIGNAL SCORE
# ═══════════════════════════════════════════════════════════════════════════════
#
#  Counts weighted keyword hits across all finance domains in title+description.
#  Used as the base for the final ranking score AND as the minimum-threshold gate.
#  Episodes below _MIN_FINANCE_SCORE are excluded from results.

_FINANCE_SIGNAL_STRONG = re.compile(
    r"\b(?:"
    # Capital markets / rates
    r"federal\s+reserve|interest\s+rate|rate\s+(?:cut|hike)"
    r"|inflation\s+(?:rate|data|report)"
    r"|gdp\b|recession\b|yield\s+curve"
    r"|s&p\s*500|nasdaq|dow\s+jones"
    r"|credit\s+spread|vix\b"
    r"|quantitative\s+(?:easing|tightening)"
    r"|wall\s+street\b"                     # market-shorthand term
    # M&A / deals
    r"|acqui(?:sition|res?|ring)|merger\b|buyout\b|takeover\b"
    r"|divestiture|spin.?off|carve.?out|lbo\b"
    r"|private\s+equity|private\s+credit|venture\s+capital"
    r"|dry\s+powder|carried\s+interest"
    # Company fundamentals
    r"|earnings?\s+(?:report|beat|miss|season)"
    r"|quarterly\s+(?:results?|earnings?)"
    r"|revenue\s+(?:beat|miss|growth|decline)"
    r"|analyst\s+(?:upgrade|downgrade)"
    r"|price\s+target|ipo\b"
    # Tech / AI  (finance-context specific — chatgpt etc. without lifestyle veto)
    r"|semiconductor|nvidia\b|gpu\b|chatgpt\b|llm\b"
    r"|ai\s+agents?\b|ai\s+model\b"          # AI-in-business framing
    # Geopolitical / trade
    r"|tariff|sanction|trade\s+war|geopolit\w+"
    r"|strait\s+of\s+hormuz|red\s+sea\s+(?:attack|shipping|conflict)"
    r"|oil\s+(?:price|market|supply|output|embargo)"
    # Economic health
    r"|econom(?:ic|y)\s+(?:collapse|crisis|slowdown|recession|contraction|sanction)"
    r"|currency\s+(?:crisis|collapse|devaluation)"
    r")\b",
    re.IGNORECASE,
)

_FINANCE_SIGNAL_WEAK = re.compile(
    r"\b(?:"
    r"market|stock|equity|bond|yield|treasury|fed\b|rate\b"
    r"|inflation|economy|economic|invest\w+|finance|financial"
    r"|capital\b|portfolio|hedge\s+fund|asset\b|valuation"
    r"|profit|revenue|earnings?|guidance|shares?\b"
    r"|deal\b|transaction\b|ipo\b"
    r"|china\b|russia\b|iran\b|tariff|sanction|oil\b|crypto\b"
    r"|gas\s+(?:price|market)|energy\s+(?:price|market|crisis)"
    r"|dollar\b|currency\b|trade\b|export\b|import\b"
    r"|ai\b|tech\b|startup\b"                       # low-weight for broad AI/tech terms
    r")\b",
    re.IGNORECASE,
)

def _finance_signal(title: str, description: str) -> int:
    """Compute a 0–100 finance relevance score for title + description combined."""
    text  = f"{title} {description}"
    score = (
        len(_FINANCE_SIGNAL_STRONG.findall(text)) * 4
        + len(_FINANCE_SIGNAL_WEAK.findall(text)) * 1
    )
    return min(score, 100)


# ═══════════════════════════════════════════════════════════════════════════════
# 7.  TOPIC CLASSIFICATION
# ═══════════════════════════════════════════════════════════════════════════════

def _classify_topics(
    title: str,
    description: str,
    default_topics: list[str],
    finance_signal: int,
    source_tier: int = 4,
) -> list[str]:
    """
    Assign up to 3 topic labels using scored keyword rules, with post-hoc
    arbitration to enforce mutual exclusivity between related topics.

    Evaluation order (see _TOPIC_ORDER):
      Private Markets → M&A → Company → Tech / AI → Geopolitical → Macro → Markets

    Arbitration rules applied after scoring:
      1. Private Markets beats M&A: if PM qualifies and its score >= M&A score,
         M&A is removed.  Both are kept only when M&A has a strictly higher score
         (i.e. explicit acquisition/merger language dominates).
      2. Company beats Tech / AI: if Company qualifies and the Tech/AI score comes
         entirely from weak keywords (no strong AI hit), Tech/AI is removed.
         Both are kept only when a strong AI keyword (OpenAI, nvidia, chatgpt…)
         is present alongside company-catalyst language.
      3. Macro beats Tech / AI: if Macro qualifies and the Tech/AI score comes
         entirely from weak keywords, Tech/AI is removed.  This prevents Fed /
         interest-rate / monetary-policy content from being mis-labelled Tech/AI
         just because the description mentions "ai" or "tech" generically.
         Both labels are kept when a genuine strong Tech/AI keyword (Nvidia, LLM,
         semiconductor…) co-occurs with macro language.

    Falls back to default_topics only when:
      - no topics passed their threshold AND
      - the episode's finance_signal meets the per-tier minimum
        (see _MIN_SIGNAL_FOR_DEFAULT_TOPIC).  Tier-2/3 shows with 0 finance
        signal do NOT inherit "Tech / AI" or "Company" by default — those
        are reserved for genuinely on-brand episodes.
    """
    text = f"{title} {description}"

    # Score all topics
    scores: dict[str, int] = {}
    for label in _TOPIC_ORDER:
        rule = _TOPIC_RULE_MAP[label]
        s = rule.score(text)
        if s >= rule.min_score:
            scores[label] = s

    # ── Arbitration 1: Private Markets beats M&A ─────────────────────────────
    if "Private Markets" in scores and "M&A" in scores:
        if scores["M&A"] <= scores["Private Markets"]:
            del scores["M&A"]

    # ── Arbitration 2: Company beats Tech / AI ───────────────────────────────
    # Require a strong Tech/AI hit when Company is also present.
    if "Company" in scores and "Tech / AI" in scores:
        tech_rule        = _TOPIC_RULE_MAP["Tech / AI"]
        tech_strong_hits = len(tech_rule.strong.findall(text))
        if tech_strong_hits == 0:
            log.debug(
                "topic arbitration: Company beats Tech/AI (no strong AI hit) — %r",
                title[:60],
            )
            del scores["Tech / AI"]

    # ── Arbitration 3: Macro beats Tech / AI ────────────────────────────────
    # Monetary policy / central-bank content should not inherit Tech/AI from
    # incidental mentions of "ai" or "tech" in the surrounding text.
    if "Macro" in scores and "Tech / AI" in scores:
        tech_rule        = _TOPIC_RULE_MAP["Tech / AI"]
        tech_strong_hits = len(tech_rule.strong.findall(text))
        if tech_strong_hits == 0:
            log.info(
                "topic arbitration: Macro beats Tech/AI (no strong AI hit) — %r",
                title[:60],
            )
            del scores["Tech / AI"]

    # Return up to 3 topics in evaluation order
    found = [label for label in _TOPIC_ORDER if label in scores][:3]

    if found:
        return found

    # ── Default-topic fallback — gated by per-tier minimum signal ────────────
    # Tier 4–5 shows are always on-brand; use their defaults freely.
    # Tier 2–3 shows (All-In, Acquired, Planet Money, The Big Picture) must
    # clear a finance-signal floor before inheriting "Tech / AI" or "Company"
    # by default.  Episodes below the floor receive topics=[] which places them
    # in the All-tab pool but not on any topic tab.
    min_signal = _MIN_SIGNAL_FOR_DEFAULT_TOPIC.get(source_tier, 4)
    if finance_signal >= min_signal:
        return default_topics[:2]

    log.info(
        "topic fallback blocked (tier=%d signal=%d < %d) — %r",
        source_tier, finance_signal, min_signal, title[:60],
    )
    return []


# ═══════════════════════════════════════════════════════════════════════════════
# 8.  WHY-IT-MATTERS TEMPLATES
# ═══════════════════════════════════════════════════════════════════════════════

_WIM: dict[str, str] = {
    "M&A":             "Deal activity signals shifting executive confidence and strategic capital allocation.",
    "Private Markets": "Private market dynamics lead public valuations and define the next wave of deal flow.",
    "Venture":         "Venture funding rounds reveal where capital is concentrating ahead of public market repricing.",
    "Tech / AI":       "Technology shifts are rewriting competitive moats and driving outsized earnings revisions.",
    "Geopolitical":    "Geopolitical developments simultaneously reprice commodities, supply chains, and risk premia.",
    "Macro":           "Macro variables set the discount rate and risk appetite for every asset class globally.",
    "Company":         "Company-specific catalysts drive the outsized single-stock moves that define active returns.",
    "Markets":         "Market structure and price action encode the aggregate of all current information.",
}

def _why_it_matters(topics: list[str], show_name: str) -> str:
    # LEGACY-PATH (IRE-1): canned per-topic prose — exactly the "generic prose
    # filling a gap" the reasoning contract bans (Part 8). Earliest safe
    # removal: IRE-2, replacing the string with a designed absence on the
    # episode card (Listen presents evidence density, not synthesized "why").
    # Do not add topics or new consumers.
    for t in topics:
        if t in _WIM:
            return _WIM[t]
    return f"A timely episode from {show_name} covering key developments for market participants."


# ═══════════════════════════════════════════════════════════════════════════════
# 9.  FRESHNESS HELPERS + FINAL RANKING SCORE
# ═══════════════════════════════════════════════════════════════════════════════
#
#  final_score = round(finance_signal × source_tier_multiplier × freshness_multiplier)
#
#  Freshness is now baked into relevance_score so every rail that sorts by
#  relevance_score automatically surfaces fresh content:
#    - Trending Now (top-4 by score): only fresh episodes can win top spots.
#    - Quick Listens / Deep Dives (API order preserved): fresh episodes appear first.
#    - Featured: server-side selection prefers ≤72h; stale only if exceptional score.
#    - Latest: client-side sorted by published_at — not affected by score.

def _freshness_mult(age_hours: float) -> float:
    """Map episode age to a freshness multiplier for final score."""
    if age_hours <= _FRESH_STRONG_H:   return _FRESH_MULT["strong"]
    if age_hours <= _FRESH_MODERATE_H: return _FRESH_MULT["moderate"]
    if age_hours <= _FRESH_NEUTRAL_H:  return _FRESH_MULT["neutral"]
    if age_hours <= _FRESH_WEAK_H:     return _FRESH_MULT["weak"]
    return _FRESH_MULT["stale"]


def _ep_age_hours(ep: dict) -> float:
    """Compute episode age in hours from its stored published_at ISO string.

    Used by route handlers after fetch_episodes() has stripped internal fields.
    Returns 168.0 (7d) on parse failure so unknown-age episodes are treated conservatively.
    """
    try:
        pub = datetime.fromisoformat(ep["published_at"].replace("Z", "+00:00"))
        return max(0.0, (datetime.now(timezone.utc) - pub).total_seconds() / 3600)
    except Exception:
        return 168.0


def _final_score(finance_signal: int, source_tier: int, age_hours: float) -> int:
    """Composite ranking score: effective_signal × source_quality × freshness.

    effective_signal = max(finance_signal, _MIN_SIGNAL_BY_TIER[source_tier])

    The floor prevents zero-signal episodes (sparse RSS text) from all collapsing
    to relevance_score=1.  A fresh Tier-5 zero-signal episode scores ~14; a fresh
    Tier-3 zero-signal episode scores ~4.  Both are well below a typical
    signal=20 episode (~36) so genuine content still dominates.
    """
    tier_mult        = _SOURCE_TIER_MULT.get(source_tier, 1.0)
    fresh_mult       = _freshness_mult(age_hours)
    floor_signal     = _MIN_SIGNAL_BY_TIER.get(source_tier, 0)
    effective_signal = max(finance_signal, floor_signal)
    return max(1, round(effective_signal * tier_mult * fresh_mult))


# ═══════════════════════════════════════════════════════════════════════════════
# 10.  HELPERS
# ═══════════════════════════════════════════════════════════════════════════════

_HTML_TAG_RE = re.compile(r"<[^>]+>")

def _strip_html(text: str) -> str:
    return _HTML_TAG_RE.sub("", text or "").strip()


def _parse_duration(raw: Any) -> int:
    if raw is None:
        return 0
    s = str(raw).strip()
    if not s:
        return 0
    parts = s.split(":")
    try:
        if len(parts) == 3:
            return int(parts[0]) * 3600 + int(parts[1]) * 60 + int(parts[2])
        if len(parts) == 2:
            return int(parts[0]) * 60 + int(parts[1])
        return int(float(s))
    except (ValueError, TypeError):
        return 0


def _parse_date(entry: Any) -> str:
    t = getattr(entry, "published_parsed", None) or getattr(entry, "updated_parsed", None)
    if t:
        try:
            return datetime(*t[:6], tzinfo=timezone.utc).isoformat()
        except Exception:
            pass
    return datetime.now(timezone.utc).isoformat()


def _episode_id(show_name: str, entry: Any) -> str:
    raw = getattr(entry, "id", None) or getattr(entry, "link", None) or getattr(entry, "title", "")
    return hashlib.md5(f"{show_name}:{raw}".encode()).hexdigest()[:12]


# ═══════════════════════════════════════════════════════════════════════════════
# 11.  ENTRY NORMALISATION
# ═══════════════════════════════════════════════════════════════════════════════

def _normalize(entry: Any, parsed_feed: feedparser.FeedParserDict, cfg: dict) -> dict | None:
    """
    Map a feedparser entry to an Episode dict.

    Returns None only if the episode:
      - has no title
      - matches _OFFBRAND_TITLE_RE (unambiguous non-finance content)
      - is older than _MAX_AGE_GLOBAL_H

    Finance signal is computed for ranking but NO LONGER gates inclusion.
    Low-signal episodes (sparse RSS text, terse daily briefings) pass through
    and receive a score derived from source tier + freshness via _final_score's
    _MIN_SIGNAL_BY_TIER floor.  This keeps every real podcast episode in the
    pool so the frontend ranking, source weighting, and diversity caps can work.
    """
    title = _strip_html(getattr(entry, "title", "") or "")
    if not title:
        return None

    # ── Hard off-brand filter (title only) ───────────────────────────────────
    if _OFFBRAND_TITLE_RE.search(title):
        m = _OFFBRAND_TITLE_RE.search(title)
        reason = m.group(0).strip() if m else "pattern match"
        log.info(
            "podcast rejected [off-brand] show=%r title=%r reason=%r",
            cfg.get("show_name", "?"), title[:80], reason,
        )
        return None

    description = _strip_html(
        getattr(entry, "summary", "")
        or getattr(entry, "description", "")
        or ""
    )[:500]

    # ── Finance signal — for ranking only, not for gating ────────────────────
    signal = _finance_signal(title, description)
    # _MIN_FINANCE_SCORE = 0; the gate below is intentionally a no-op.
    # Episodes are never dropped for low signal — they are ranked lower instead.
    if signal < _MIN_FINANCE_SCORE:
        log.debug("podcast low-signal excluded (score=%d): %r", signal, title)
        return None
    log.debug("podcast signal=%d show=%r title=%r", signal, cfg["show_name"], title[:60])

    # ── Compute publication date + age ───────────────────────────────────────
    pub_iso = _parse_date(entry)
    t       = getattr(entry, "published_parsed", None) or getattr(entry, "updated_parsed", None)
    if t:
        try:
            age_hours = max(0.0, (
                datetime.now(timezone.utc) - datetime(*t[:6], tzinfo=timezone.utc)
            ).total_seconds() / 3600)
        except Exception:
            age_hours = 168.0  # treat parse failure as 7d old
    else:
        age_hours = 168.0  # no timestamp → conservative default

    # ── Global hard age cutoff ────────────────────────────────────────────────
    if age_hours > _MAX_AGE_GLOBAL_H:
        log.debug("podcast too-old excluded (%.0fh): %r", age_hours, title)
        return None

    # ── Audio URL — only from a real audio enclosure ──────────────────────────
    audio_url: str | None = None
    for enc in getattr(entry, "enclosures", []):
        mime = (getattr(enc, "type", "") or "").lower()
        href = getattr(enc, "href", "") or getattr(enc, "url", "") or ""
        if href and "audio" in mime:
            audio_url = href
            break

    # ── External URL — episode page link from RSS <link> ─────────────────────
    external_url: str | None = getattr(entry, "link", None) or None

    # ── Show / episode image ──────────────────────────────────────────────────
    image_url: str | None = None
    entry_img = getattr(entry, "image", None)
    if entry_img:
        image_url = getattr(entry_img, "href", None)
    if not image_url:
        feed_img = getattr(parsed_feed.feed, "image", None)
        if feed_img:
            image_url = getattr(feed_img, "href", None)

    source_tier = cfg.get("source_tier", 3)
    topics      = _classify_topics(title, description, cfg["default_topics"], signal, source_tier)
    score       = _final_score(signal, source_tier, age_hours)

    return {
        "id":               _episode_id(cfg["show_name"], entry),
        "title":            title,
        "show_name":        cfg["show_name"],
        "publisher":        cfg["publisher"],
        "description":      description,
        "why_it_matters":   _why_it_matters(topics, cfg["show_name"]),
        "image_url":        image_url,
        "audio_url":        audio_url,
        "external_url":     external_url,
        "published_at":     pub_iso,
        "duration_seconds": _parse_duration(getattr(entry, "itunes_duration", None)),
        "topics":           topics,
        "entities":         [],
        "is_featured":      False,
        "is_secondary":     False,
        "secondary_label":  None,
        "is_briefing":      False,   # explicit — frontend source weighting depends on this
        "relevance_score":  score,
        # Internal fields — stripped before returning to the API
        "_finance_signal":  signal,
        "_source_tier":     source_tier,
        "_age_hours":       age_hours,
    }


# ═══════════════════════════════════════════════════════════════════════════════
# 12.  PER-FEED FETCHER
# ═══════════════════════════════════════════════════════════════════════════════

def _fetch_one(cfg: dict) -> list[dict]:
    """Fetch + parse one RSS feed.  Returns [] on any error so others still run.

    RC2-D1 observability: a source that FAILS is logged at WARNING so it is visible
    in production (which runs at INFO). Previously a dead feed logged at DEBUG, or
    fell through to the normal INFO line as `raw=0`, so 11 of 27 registered shows
    had been 404ing invisibly.

    A failure is a fetch/parse problem — HTTP error, malformed payload, or an empty
    feed. It is NOT the same as a healthy feed whose episodes are all older than the
    freshness cap; that stays on the INFO line, because contributing nothing on
    freshness grounds is an honest outcome and not a broken source.

    Batch resilience is unchanged: every path still returns [] for this source only,
    and never propagates an exception to the batch.
    """
    url       = cfg["rss_url"]
    show_name = cfg["show_name"]
    try:
        parsed = feedparser.parse(url)

        status = getattr(parsed, "status", None)
        if status is not None and status >= 400:
            log.warning(
                "podcast source FAILED  %-35s HTTP %s  %s", show_name, status, url,
            )
            return []
        if parsed.bozo and not parsed.entries:
            log.warning(
                "podcast source FAILED  %-35s unparseable (%s)  %s",
                show_name, type(parsed.bozo_exception).__name__, url,
            )
            return []
        if not parsed.entries:
            log.warning(
                "podcast source FAILED  %-35s feed carries 0 entries  %s",
                show_name, url,
            )
            return []
        raw_count = min(len(parsed.entries), _MAX_PER_FEED)
        results: list[dict] = []
        offbrand = 0
        too_old  = 0
        for entry in parsed.entries[:_MAX_PER_FEED]:
            try:
                ep = _normalize(entry, parsed, cfg)
                if ep is not None:
                    results.append(ep)
                else:
                    # Tally drop reasons via title check (off-brand) vs age
                    t = _strip_html(getattr(entry, "title", "") or "")
                    if t and _OFFBRAND_TITLE_RE.search(t):
                        offbrand += 1
                    else:
                        too_old += 1
            except Exception as exc:
                log.debug("podcast normalisation error (%s): %s", url, exc)
        log.info(
            "podcast %-35s raw=%d survived=%d (offbrand=%d too_old=%d)",
            show_name, raw_count, len(results), offbrand, too_old,
        )
        return results
    except Exception as exc:
        log.warning(
            "podcast source FAILED  %-35s %s: %s  %s",
            show_name, type(exc).__name__, exc, url,
        )
        return []


# ═══════════════════════════════════════════════════════════════════════════════
# 13.  IN-MEMORY TTL CACHE + PUBLIC API
# ═══════════════════════════════════════════════════════════════════════════════

_cache:    list[dict] = []
_cache_at: float      = 0.0


def fetch_episodes() -> list[dict]:
    """
    Fetch all configured feeds in parallel, apply quality filters, and return
    a curated, freshness-ranked episode list.

    Ranking: relevance_score desc (freshness is already baked into each score
    via the freshness multiplier, so sorting by score alone surfaces the best
    *current* content across all rails).

    Featured selection: the episode with the highest relevance_score among those
    published within _MAX_AGE_FEATURED_H (72h).  Falls back to the top scorer
    overall only if that scorer's relevance_score ≥ _FEATURED_STALE_MIN_SCORE;
    otherwise leaves featured=True on the best fresh-ish candidate we have.

    Results are cached for _CACHE_TTL seconds.  Returns [] if all feeds fail.
    """
    global _cache, _cache_at

    if _cache and (time.monotonic() - _cache_at) < _CACHE_TTL:
        return _cache

    all_eps: list[dict] = []
    with ThreadPoolExecutor(max_workers=_FETCH_WORKERS) as pool:
        futures = {pool.submit(_fetch_one, cfg): cfg for cfg in PODCAST_FEEDS}
        for fut in as_completed(futures):
            all_eps.extend(fut.result())

    if not all_eps:
        log.warning("podcast ingestion: all feeds returned no episodes after filtering")
        return []

    # ── Ingestion logging ─────────────────────────────────────────────────────
    topic_counts: dict[str, int] = {}
    for ep in all_eps:
        primary = (ep.get("topics") or ["Unknown"])[0]
        topic_counts[primary] = topic_counts.get(primary, 0) + 1
    log.info(
        "podcast ingestion: total=%d per_topic=%s",
        len(all_eps),
        {k: v for k, v in sorted(topic_counts.items())},
    )

    # ── Primary sort: relevance_score desc (freshness already embedded) ───────
    # This order is preserved by the frontend for Quick Listens and Deep Dives,
    # so fresh high-quality short/long episodes naturally float to the top of
    # their respective rails.
    all_eps.sort(key=lambda e: e["relevance_score"], reverse=True)

    # ── Featured selection — two-pass, hard 72h cap, no stale fallback ──────
    # Pass 1: strongly prefer ≤ _MAX_AGE_FEATURED_PREFER_H (48h).
    # Pass 2: relax to hard cap _MAX_AGE_FEATURED_H (72h).
    # If nothing qualifies within 72h, pick the highest-scored available episode
    # (freshness is already penalised in its score).  There is NO score-threshold
    # stale fallback — Featured will never intentionally surface old content.
    preferred = [e for e in all_eps if e.get("_age_hours", 999) <= _MAX_AGE_FEATURED_PREFER_H]
    if preferred:
        featured = max(preferred, key=lambda e: e["relevance_score"])
    else:
        within_cap = [e for e in all_eps if e.get("_age_hours", 999) <= _MAX_AGE_FEATURED_H]
        if within_cap:
            featured = max(within_cap, key=lambda e: e["relevance_score"])
        else:
            # Nothing within 72h — pick best available (its score is already stale-penalised)
            featured = all_eps[0]
            log.info(
                "podcast featured: no episode within %dh; best available is %.0fh old (score=%d)",
                _MAX_AGE_FEATURED_H,
                featured.get("_age_hours", 0),
                featured["relevance_score"],
            )
    featured["is_featured"] = True

    # ── Strip internal fields before caching and returning ───────────────────
    for ep in all_eps:
        ep.pop("_finance_signal", None)
        ep.pop("_source_tier",    None)
        ep.pop("_age_hours",      None)

    log.info(
        "podcast ingestion: returning %d episodes (featured=%r)",
        len(all_eps),
        featured.get("title", "")[:60],
    )

    _cache    = all_eps
    _cache_at = time.monotonic()
    return all_eps
