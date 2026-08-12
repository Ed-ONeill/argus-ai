"""
app/feeds.py — RSS feed ingestion for the Market Feed tab

Key capabilities:
  - Parallel fetching with ThreadPoolExecutor
  - Robust date parsing via feedparser's published_parsed → UTC datetime
  - Global sort newest-first, optional staleness filter (48h default)
  - Near-duplicate deduplication via Jaccard word-overlap
  - Signal scoring: source tier + keyword relevance + recency + noise penalty
  - PR Newswire filter: only passes genuine deal announcements (score ≥ 45)
  - Failed feeds logged at DEBUG, stale cache returned as fallback (quiet terminal)
"""

from __future__ import annotations

import calendar
import dataclasses
import logging
import re
import time
from concurrent.futures import ThreadPoolExecutor, as_completed, TimeoutError as FutureTimeoutError
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone

# RC2-A: the ONE canonical entity resolver. Market Events already resolved
# companies through app.companies; ingestion now uses the same authority so the
# product has a single definition of "this token is a company".
from app.companies import resolve_entities

log = logging.getLogger(__name__)

# ── Configuration ─────────────────────────────────────────────────────────────

STALE_HOURS       = 48    # items older than this excluded in fresh-only mode
_ITEMS_PER_FEED   = 12    # items fetched per source before age/signal filtering
_CACHE_TTL        = 300   # 5-minute feed cache TTL (seconds)
_FETCH_WORKERS    = 6     # parallel HTTP threads
_FETCH_TIMEOUT    = 8     # per-request timeout (seconds) — not yet used by feedparser
_DEDUP_THRESHOLD  = 0.50  # Jaccard similarity above which headlines are duplicates
_MAX_SNIPPET      = 500   # max chars to keep from RSS description

# Minimum signal score to include an item.
# PR Newswire has a higher bar because it mixes genuine deals with PR noise.
_MIN_SCORE_DEFAULT       = 10   # very permissive for curated sources
_MIN_SCORE_PRESS_RELEASE = 45   # press-release sources: requires keyword match to pass

# Sources that are press-release wires — held to the higher threshold.
_PRESS_RELEASE_SOURCES: frozenset[str] = frozenset({
    "PR Newswire M&A",
    "Business Wire M&A",
    "GlobeNewswire M&A",   # dead but kept so stale-cache items still apply the filter
})

_HTML_TAG_RE = re.compile(r"<[^>]+>")
_WORD_RE     = re.compile(r"[^\w\s]")
_TICKER_RE   = re.compile(r"\$[A-Z]{1,5}\b")   # stock ticker: $AAPL, $NVDA, $BRK

# ── Hard exclusions — score = 0 immediately, never enters the feed ─────────────
# These are zero-editorial-value content types that no keyword check can redeem:
# newsletter sign-up CTAs, subscription promos, and podcast/event invites.
# Checked against title only; matched items bypass all other scoring.
_HARD_EXCLUDE_RE = re.compile(
    r"(?:"
    # Newsletter / subscription CTAs
    r"^sign\s+up\b"                    # "Sign Up for DealBook", "Sign Up Now"
    r"|^subscribe\b"                    # "Subscribe to Our Newsletter"
    r"|\bsign\s+up\s+(?:for|to)\s+(?:the\s+)?(?:free\s+)?"
    r"(?:dealbook|newsletter|briefing|morning\s+brief|daily|weekly|update|digest|alert)\b"
    r"|\bnewsletter\s+(?:sign.?up|signup|subscribe)\b"
    r"|\bsubscribe\s+to\s+(?:get|receive|our|the)\b"
    # Podcast / webinar / event CTAs
    r"|^(?:listen|watch|register|join)\s+(?:now|here|today)\b"
    r"|\bpodcast\s+(?:episode|recap|listen)\b"
    # Sponsored / advertorial — paid placement, never consumes feed inventory.
    # Anchored to the start of the title (optional leading punctuation), matching
    # the standard publisher labels and their common variants.
    r"|^[\[(\s]*sponsored\b"                                  # "Sponsored:", "[Sponsored]", "Sponsored Content"
    r"|^[\[(\s]*partner\s+content\b"                          # "Partner Content"
    r"|^[\[(\s]*advertiser\s+content\b"                       # "Advertiser Content"
    r"|^[\[(\s]*presented\s+by\b"                             # "Presented By X"
    r"|^[\[(\s]*paid\s+(?:content|post|partnership)\b"        # common synonyms
    r"|^[\[(\s]*advertorial\b"
    r")",
    re.IGNORECASE,
)

# ── Generic retail-investor articles — hard exclude (score 0, before scoring) ─────
# These are retail/SEO investing articles, not market intelligence. High-precision,
# mostly title-start-anchored so they can be removed entirely (not just penalized).
# The softer/fuzzier opinion cases stay on the −60 _ARTICLE_OPINION_RE penalty.
_RETAIL_ARTICLE_HARD_RE = re.compile(
    r"(?:"
    # "Is [stock] a good stock to buy (now)?"
    r"\bis\s+[\w.\-&' ]{1,30}?\ba\s+(?:good|great|strong|smart|top|buy|solid)\s+(?:stock|buy|investment)\b"
    r"|\b(?:good|great|smart|strong|top|solid)\s+stock\s+to\s+buy\b"
    # "Should you / Should I buy/sell/own..."
    r"|\bshould\s+(?:you|i|investors?)\s+(?:buy|sell|own|hold|invest|dump|avoid)\b"
    # "Top stocks..." / "Best stocks..." (title start) + "N stocks to buy/watch"
    r"|^[\[(\s]*top\s+\d*\s*[\w/&'\- ]{0,30}?stocks?\b"
    r"|^[\[(\s]*best\s+[\w/&'\- ]{0,30}?stocks?\b"
    r"|\b(?:best|top)\s+stocks?\s+to\s+(?:buy|watch|own)\b"
    r"|\b\d{1,2}\s+(?:top\s+|best\s+)?[\w/&'\- ]{0,24}?stocks?\s+to\s+(?:buy|watch|own)\b"
    r"|\bstocks?\s+to\s+buy\s+(?:now|today|right\s+now|this\s+(?:week|month))\b"
    # "Why investors should..." / "Here's why..." (title start)
    r"|\bwhy\s+investors\s+should\b"
    r"|^[\[(\s]*here'?s\s+why\b|^[\[(\s]*here\s+is\s+why\b"
    r")",
    re.IGNORECASE,
)

# ── Off-topic hard-negative filter ──────────────────────────────────────────────
# Topic-level exclusion (score 0, before scoring) for content that would never come
# up on a hedge-fund morning call: personal finance, retirement planning, ETF/fund
# advice, stock-picking, portfolio tips, lifestyle/consumer investing, and trivia.
# Every pattern is anchored to ADVICE / LIFESTYLE framing so institutional stories
# that merely share vocabulary survive, e.g.:
#   keep: "IRA subsidies", "pension fund commits to private credit", "ETF inflows",
#         "Social Security trust fund insolvency", "mortgage rates climb", "Roth
#         IRA"→only as advice, "annuity sales hit record" (insurer flow).
#   drop: "Roth IRA conversion guide", "best ETFs to buy", "is Tesla stock a buy?",
#         "how to retire early", "build your emergency fund".
_OFF_TOPIC_HARD_RE = re.compile(
    r"(?:"
    # ── Retirement planning (consumer) — NOT pension/retirement funds as allocators
    r"\b401\s*\(?\s*k\s*\)?\b"
    r"|\broth\s+(?:ira|conversion|401\s*\(?k\)?)\b"
    r"|\bira\s+(?:contribution|rollover|roll\s+over|withdrawal|limit)\b"
    r"|\brequired\s+minimum\s+distribution\b|\brmds?\b"
    r"|\bnest\s+egg\b"
    r"|\bretire\s+(?:early|at\s+\d|comfortably|rich|by\s+\d)\b"
    r"|\bhow\s+(?:much|to)\b.{0,20}\bretire\b"
    r"|\bretirement\s+(?:savings?|account|plan(?:ning)?|tips?|advice|guide|strateg(?:y|ies)|mistakes?|calculator|readiness)\b"
    r"|\bretirees?\s+(?:should|can|need\s+to|guide|tips?|how\s+to|when\s+to)\b"
    r"|\bsocial\s+security\b.{0,18}(?:when\s+to\s+claim|claiming\s+strateg|benefits?\s+(?:guide|tips?|calculator|when)|how\s+(?:much|to)\s+(?:claim|collect|maximize))"
    r"|\bannuit(?:y|ies)\b.{0,24}(?:guide|tips?|should\s+you|worth\s+it|explained|best|for\s+retire)\b"
    r"|\bpension\s+(?:tips?|advice|guide|how\s+to)\b"
    # ── Personal / lifestyle finance ──────────────────────────────────────────
    r"|\bpersonal\s+finance\b|\bbudgeting\b"
    r"|\bhow\s+to\s+(?:save|budget)\b|\bsave\s+(?:money|on\s+your)\b"
    r"|\bemergency\s+fund\b|\bside\s+hustle\b|\bpassive\s+income\b"
    r"|\b(?:build|grow)\s+(?:your\s+)?wealth\b|\bget\s+rich\b|\bbecome\s+a\s+millionaire\b"
    r"|\bnet\s+worth\s+(?:by\s+age|goals?|tracker|calculator)\b"
    r"|\bfinancial\s+(?:freedom|independence|wellness|literacy)\b"
    r"|\bfrugal\b|\bmoney\s+(?:habits|moves|hacks)\b"
    r"|\bcredit\s+score\b|\bcredit\s+card\s+(?:debt|rewards?|points?|tips?|best|sign.?up\s+bonus)\b"
    r"|\bstudent\s+loan\s+(?:tips?|advice|refinanc|payoff|forgiveness\s+(?:guide|tips?|help))\b"
    r"|\bmortgage\s+(?:tips?|advice|calculator|how\s+much|application\s+guide)\b"
    # ── ETF / fund advice — NOT flows / launches / approvals ───────────────────
    r"|\b(?:best|top)\s+(?:\d+\s+)?(?:etfs?|index\s+funds?|mutual\s+funds?|dividend\s+(?:etfs?|funds?))\b"
    r"|\b(?:etfs?|index\s+funds?|mutual\s+funds?)\s+to\s+(?:buy|own|consider|watch|avoid)\b"
    r"|\bwhich\s+(?:etf|index\s+fund|mutual\s+fund|fund)\s+(?:should|to\s+buy|is\s+best)\b"
    r"|\b\d{1,2}\s+(?:etfs?|funds?)\s+to\s+(?:buy|own|watch)\b"
    # ── Stock-picking / "is X a buy" ──────────────────────────────────────────
    r"|\bis\s+[\w.\-&' ]{1,30}?\s+stock\s+a\s+(?:buy|sell|hold)\b"
    r"|\b(?:buy|sell)\s+or\s+(?:sell|hold)\b"
    r"|\b[\w.\-&']{2,20}\s+stock\s+(?:forecast|prediction|price\s+target)\b.{0,12}20\d\d"
    r"|\bbull\s+vs\.?\s+bear\b|\bbear\s+vs\.?\s+bull\b"
    r"|\b(?:over|under)valued\s+stock\b|\b(?:hidden\s+gem|under.the.radar)\s+stocks?\b"
    # ── Portfolio tips ────────────────────────────────────────────────────────
    r"|\b(?:your|diversify\s+your|rebalance\s+your|build\s+a)\s+portfolio\b"
    r"|\bportfolio\s+(?:tips?|advice|for\s+(?:beginners?|retirees?))\b"
    r"|\b60/40\s+portfolio\b|\basset\s+allocation\s+(?:guide|tips?|for\s+(?:beginners?|retirees?))\b"
    # ── Consumer / beginner investing ─────────────────────────────────────────
    r"|\binvesting\s+(?:101|for\s+beginners?|for\s+dummies|basics)\b"
    r"|\bhow\s+to\s+(?:start\s+)?invest(?:ing)?\b"
    r"|\b(?:best|top)\s+(?:brokerage|broker|robo.?advisor|investing\s+app)s?\b"
    r"|\bdollar.cost\s+averaging\b|\bbeginner'?s?\s+guide\s+to\b"
    # ── Trivia / lifestyle filler ─────────────────────────────────────────────
    r"|\bfun\s+facts?\b|\bdid\s+you\s+know\b|\btrivia\b|\bquiz\b"
    r"|\bthis\s+day\s+in\s+(?:market\s+|wall\s+street\s+|financial\s+)?history\b"
    r"|\bthings?\s+you\s+(?:probably\s+)?didn'?t\s+know\b"
    r"|\b(?:surprising|weird|crazy|shocking)\s+(?:facts?|stats?|charts?)\b"
    r")",
    re.IGNORECASE,
)


# ── Content-derived category classification ────────────────────────────────────
# Applied after fetch to every item, overriding the source-assigned category.
# Precedence: M&A → Geopolitical → Company → source default.
# This ensures a tariff story from WSJ Markets becomes Geopolitical, and an
# Apple earnings beat from MarketWatch becomes Company, rather than both
# defaulting to Markets.

_CAT_MA_RE = re.compile(
    r"\b(?:"
    r"acqui(?:res?|ring|sition|red)"   # acquire / acquisition
    r"|merger|merging|megadeal"
    r"|buyout|buy-out"
    r"|takeover|take-over"
    r"|lbo\b"                           # leveraged buyout
    r"|bidder|bid\s+for\b|bidding\s+war"   # bidding contest
    r"|sale\s+process"
    r"|going\s+private"
    r"|management\s+buyout|mbo\b"
    r"|divestiture|divest(?:ing|ed|s)?"
    r"|spinoff|spin-off|spin\s+off"
    r"|pe\s+(?:firm|fund|buyout)"       # private equity framing
    r"|private\s+equity\s+(?:firm|fund|deal|backs?|owner)"
    r"|sponsor.backed"                  # sponsor-backed deal
    r"|strategic\s+alternativ(?:e|es)"  # "exploring strategic alternatives"
    r"|activist\s+(?:stake|investor|campaign|fund|push|pressure)"
    r"|hostile\s+(?:bid|offer|takeover)"
    r"|definitive\s+agreement"          # deal announcement boilerplate
    # "Agrees / agreed to buy / purchase" — standard M&A headline phrasing
    r"|(?:agrees?\s+to|agreed\s+to|deal\s+to)\s+(?:buy|purchase)\b"
    r"|in\s+talks\s+to\s+(?:buy|purchase|sell|divest|offload)\b"
    r"|approach(?:es|ed)?\s+(?:to\s+buy|\w+\s+(?:about|over|on))\b"
    r"|take[\s\-]private\b"             # "take private" and "take-private"
    r"|take\s+over\b"                   # "take over" (two words)
    # Stake acquisitions — "acquires/buys a 30% stake", "to take stake in"
    r"|(?:acquires?|buys?)\s+(?:a\s+)?(?:[\d.]+\s*%\s+)?stake\b"
    r"|to\s+take\b.{0,25}\bstake\s+in\b"
    # "Nears deal / agreement" — pre-announcement phrasing ("nears $6bn deal")
    r"|nears?.{0,25}(?:deal|agreement|accord)\b"
    # "Buys / purchases [company] for $Xbn" — acquisition price-anchor
    r"|(?:buys?|purchases?)\b.{3,45}\bfor\s+(?:\$|€|£|¥|us\$)"
    # "Deal worth / valued at $X" — price-framing for announced deals
    r"|deal\s+(?:worth|valued\s+at)\b"
    r")\b",
    re.IGNORECASE,
)

_CAT_GEO_RE = re.compile(
    r"(?:"
    # Trailing \b removed from the outer group — handled per-token instead
    # to avoid blocking plurals ("sanctions", "tariffs", "troops").
    r"\bsanctions?\b|\btariffs?\b"
    r"|\btrade\s+(?:war|barrier|dispute|tension)\b"
    r"|\bwar\b|\bconflict\b"
    r"|\bmilitar(?:y|ies|ized|ily)\b"
    r"|\bdiplomac(?:y|ies)\b|\bdiplomat(?:ic|s)?\b"
    r"|\biran\b|\brussia\b|\bukraine\b|\bchina\b|\btaiwan\b|\bnorth\s+korea\b"
    r"|\bnato\b|\bg7\b|\bg20\b"
    r"|\bgeopolit\w*"
    r"|\bexport\s+(?:ban|restriction|control|curb)\b"
    r"|\bimport\s+(?:ban|restriction|tariff|duty)\b"
    r"|\bregime\b|\bcoup\b|\binvasion\b|\btroops?\b|\bmissiles?\b"
    r"|\bnuclear\b(?!\s+energy)"        # nuclear threat, not nuclear power plants
    r"|\belection\b.{0,30}(?:result|win|loss|outcome)"
    r"|\b(?:us|eu|uk)\s+(?:regulat|sanction|ban)\w*"
    r")",
    re.IGNORECASE,
)

_CAT_COMPANY_RE = re.compile(
    r"\b(?:"
    r"earn(?:ings?|ed)\b"
    r"|guid(?:ance)?\b"
    r"|eps\b"                           # earnings per share
    r"|ebitda\b"
    r"|revenue\b.{0,40}(?:beat|miss|rose|fell|grew|declined)"  # revenue result
    r"|(?:beat|miss(?:es|ed)?)\b.{0,25}(?:estimate|expectation|forecast|consensus)"
    r"|analyst\s+(?:upgrades?|downgrades?|cuts?|raises?|initiates?)"
    r"|price\s+target"
    r"|(?:raises?|cuts?|lowers?)\s+(?:full.year\s+)?(?:guidance|outlook|forecast)"
    r"|restructur(?:ing|ed|s)?"
    r"|layoffs?\b|lay-offs?\b|job\s+cuts?"
    r"|headcount\s+(?:reduction|cut)"
    r"|ceo\s+(?:resign|depart|step|appoin|named|hired|fired)"
    r"|cfo\s+(?:resign|depart|step|appoin|named|hired|fired)"
    r"|chief\s+executive\s+(?:resign|leaves?|appoin)"
    r"|product\s+(?:launch|recall|defect)\b"
    r"|recall\b.{0,30}(?:units?|vehicles?|product)"
    r"|ipo\b|initial\s+public\s+offering"
    r"|share\s+buyback|stock\s+repurchase|buyback\s+program"
    # Quarterly / annual results
    r"|(?:quarterly|annual|q[1-4])\s+(?:results?|earnings?|report)"
    r"|(?:first|second|third|fourth)[- ]quarter\s+(?:results?|earnings?|report)"
    # Annual/full-year financials — "full-year revenue", "annual profit"
    r"|full.year\s+(?:revenue|earnings?|profit|sales?|outlook|guidance)"
    r"|annual\s+(?:revenue|earnings?|profit|sales?|results?)"
    # Net income / profit lines
    r"|net\s+(?:income|profit|loss)\s+(?:rose?|fell?|grew|declined?|dropped?|increased?|decreased?|surged?|plunged?)"
    # Profit warnings and swings
    r"|(?:profit|earnings?)\s+warning"
    r"|(?:swings?\s+to|posts?\s+a?|reports?\s+a?)\s+(?:net\s+)?(?:profit|loss)"
    # Dividend events — company capital allocation catalyst
    r"|(?:raises?|cuts?|slashes?|suspends?|resumes?)\s+dividend"
    r"|special\s+dividend|dividend\s+(?:cut|increase|suspension)"
    # Stock events
    r"|(?:stock|share)\s+split"
    r"|\bbuyback\b"
    # Analyst / ratings actions — broader than just "analyst upgrades"
    r"|(?:upgrades?\s+to|downgrades?\s+to)\s+(?:buy|sell|hold|neutral|overweight|underweight|outperform|market\s*perform)"
    r"|initiates?\s+(?:coverage|at\s+(?:buy|sell|hold|overweight|neutral|outperform))"
    r"|(?:moody'?s|s&p|fitch|dbrs|kroll)\s+(?:cuts?|raises?|upgrades?|downgrades?|affirms?|places?|lowers?)"
    r"|credit\s+rating\s+(?:cut|raised?|upgraded?|downgraded?)"
    # Share price moves with a number — "shares drop 8%", "stock surges 12%"
    # Anchored to a numeric value so "shares rose on sentiment" doesn't fire.
    r"|(?:shares?|stock)\s+(?:surges?|plunges?|jumps?|drops?|falls?|rises?|rallies?|rebounds?|climbs?|slides?)\s+\d"
    r"|\d+(?:\.\d+)?%?\s+(?:in\s+)?(?:pre|after)[- ]?market"
    # Strategic actions
    r"|strategic\s+review"
    r"|capital\s+return"
    # Explicit beat/miss without requiring the estimate context
    r"|beats?\s+(?:on\s+)?(?:profit|revenue|earnings?|eps)"
    r"|misses?\s+(?:on\s+)?(?:profit|revenue|earnings?|eps)"
    r"|tops?\s+(?:analyst\s+)?(?:estimates?|expectations?|forecast|consensus)"
    # Warnings on specific financial lines
    r"|warns?\s+(?:of\s+)?(?:profit|revenue|earnings?|sales?)\s+(?:miss|shortfall|decline)"
    r"|issues?\s+(?:profit|revenue|earnings?)\s+warning"
    r")\b",
    re.IGNORECASE,
)

# ── High-precision Company override — fires BEFORE geo check ──────────────────
# These patterns unambiguously identify a single-company catalyst even when
# the title or snippet contains geo trigger words (tariffs, Iran, sanctions).
# "Apple shares drop 6% on tariff fears"  →  Company (ticker subject)
# "Meta CEO leaves amid restructuring"    →  Company (CEO change)
# "Fitch downgrades Moderna to BB+"       →  Company (rating action)
_CAT_COMPANY_STRONG_RE = re.compile(
    r"(?:"
    # Ticker symbol in the title — $AAPL, $NVDA, $BRK.B etc.
    r"\$[A-Z]{1,5}\b"
    # Shares / stock move with an explicit percentage or number
    r"|(?:shares?|stock)\s+(?:surges?|plunges?|jumps?|drops?|falls?|rises?|rallies?|climbs?|slides?)\s+\d"
    # Named credit / equity rating agency action
    r"|(?:moody'?s|standard\s+&\s+poor'?s|s&p\s+global|fitch|dbrs|kroll)\s+(?:cuts?|raises?|upgrades?|downgrades?|affirms?|places?|lowers?)"
    r")",
    re.IGNORECASE,
)

# ── Price-action subject override ─────────────────────────────────────────────
# Anchored to the START of the headline — only fires when the tradeable
# instrument IS the grammatical subject, not a contextual mention.
#
# "Brent crude rises as Iran tensions escalate"  →  subject=Brent  →  Markets
# "Iran tensions push oil prices higher"         →  subject=Iran   →  Geopolitical  ✓
# "Oil prices surge on Iran fears"               →  subject=Oil    →  Markets
#
# Checked BEFORE _CAT_GEO_RE so that price-action stories mentioning geo
# triggers (Iran, Russia, sanctions) are classified by what moved, not why.
_PRICE_ACTION_SUBJ_RE = re.compile(
    r"^(?:"
    # Crude oil
    r"brent|wti|crude\s+oil|crude\s+prices?|oil\s+prices?|oil\s+futures?"
    # Equity markets
    r"|u\.?s\.?\s+stocks?|global\s+stocks?|asian\s+stocks?|european\s+stocks?"
    r"|s&p\s*500|nasdaq|dow\s+jones|stock\s+market|equity\s+markets?"
    # Fixed income
    r"|treasury\s+yields?|bond\s+yields?|10.year\s+(?:yield|note|treasury)"
    r"|yield\s+curve"
    # Metals / commodities
    r"|gold\s+prices?|gold\s+futures?|copper\s+prices?|silver\s+prices?"
    # Digital assets
    r"|bitcoin|crypto\s+markets?"
    r")",
    re.IGNORECASE,
)


# ── Affected-entity extraction ────────────────────────────────────────────────
# Up to 4 entities per item: resolved companies first (app.companies), then at
# most one sector label. Typed non-company entities ride on item.typed_entities.

# RC2-A: the hand-maintained acronym blocklist and the bare-uppercase-token
# regex that used to live here are GONE. They were a denylist trying to hold
# back an open vocabulary, and every acronym they missed (FOMC, CPI, PJM,
# ERCOT, NERC, GW, LBNL...) became a company. Entity resolution now lives in
# app.companies: a token is a company only when it resolves against the
# registry, non-company tokens are typed, and unknown tokens stay unknown.

# (pattern, display_label) — first match wins, one sector per item max
_SECTOR_ENTITY_MAP: list[tuple[re.Pattern, str]] = [
    (re.compile(r'\b(?:chip|semiconductor|microchip)\b',        re.IGNORECASE), "Semiconductors"),
    (re.compile(r'\b(?:bank|banking|lender)\b',                 re.IGNORECASE), "Banks"),
    (re.compile(r'\b(?:insur(?:ance|er|s))\b',                  re.IGNORECASE), "Insurance"),
    (re.compile(r'\b(?:oil|crude|brent|wti|energy|petroleum)\b',re.IGNORECASE), "Energy"),
    (re.compile(r'\b(?:pharma(?:ceutical)?|biotech|drug)\b',    re.IGNORECASE), "Healthcare"),
    (re.compile(r'\b(?:defense|defence|aerospace|military)\b',  re.IGNORECASE), "Defense"),
    (re.compile(r'\b(?:auto(?:motive)?|carmaker|electric\s+vehicle)\b', re.IGNORECASE), "Autos"),
    (re.compile(r'\b(?:airline|aviation|aircraft)\b',           re.IGNORECASE), "Airlines"),
    (re.compile(r'\b(?:retail|consumer\s+goods)\b',             re.IGNORECASE), "Retail"),
    (re.compile(r'\b(?:software|cloud|saas)\b',                 re.IGNORECASE), "Technology"),
    (re.compile(r'\b(?:gold|silver|copper|mining|commodit)\b',  re.IGNORECASE), "Commodities"),
    (re.compile(r'\b(?:real\s+estate|reit|property)\b',         re.IGNORECASE), "Real Estate"),
    (re.compile(r'\b(?:telecom|wireless|carrier)\b',            re.IGNORECASE), "Telecom"),
    (re.compile(r'\b(?:media|streaming|broadcast)\b',           re.IGNORECASE), "Media"),
]


def _extract_entities(item: "FeedItem") -> list[str]:
    """
    Return up to 4 display names for entities affected by this story.

    RC2-A: this used to accept ANY 2-5 char uppercase token in the title that
    was not on a hand-maintained acronym blocklist, which turned FOMC, CPI,
    PJM, ERCOT, NERC and friends into "companies" everywhere downstream. It now
    delegates to the ONE canonical resolver (app.companies) that Market Events
    already use, so a token is a company only when it resolves against the
    registry. Non-company tokens are typed on `item.typed_entities` instead of
    being forced into this list, and unrecognized tokens stay unknown.

    Composition is unchanged: company entities first, then at most one sector
    label — so every existing consumer keeps the shape it expects.
    """
    text = item.title + " " + item.snippet

    resolved = resolve_entities(text, limit=4)
    entities: list[str] = list(resolved.companies)

    # Typed non-companies ride alongside (additive; never mixed into the
    # company channel). Recorded even when the company list is full.
    item.typed_entities = [
        {"token": t.token, "kind": t.kind} for t in resolved.typed
    ]

    # Sector keyword — at most one, only when space remains (unchanged).
    if len(entities) < 4:
        for pattern, sector in _SECTOR_ENTITY_MAP:
            if pattern.search(text):
                if sector not in entities:
                    entities.append(sector)
                break   # one sector label is enough

    return entities


# ── Signal-strength classification ────────────────────────────────────────────
# strong: hard catalysts — M&A deal terms, earnings beats/misses, guidance
#         changes, rating actions, profit warnings, activist positions, exec exits
# medium: sector / macro / commodity price moves (default when no match)
# weak:   commentary, opinion, roundups, or purely hypothetical framing

_STRONG_SIGNAL_RE = re.compile(
    r"(?:"
    r"\b(?:acqui(?:res?|ring|sition|red)|merger|buyout|takeover|take[\s\-]private|lbo)\b"
    r"|\bdefinitive\s+agreement\b"
    r"|\bactivist\s+(?:stake|investor|campaign|fund|push|position)\b"
    r"|\b(?:earnings?|eps|revenue|profit)\s+(?:beat|miss(?:es|ed)?|topped?|surpassed?|fell\s+short)\b"
    r"|\b(?:beat|miss(?:es|ed)?)\s+(?:estimates?|expectations?|consensus|forecast)\b"
    r"|\b(?:raises?|cuts?|lowers?|slashes?|suspends?)\s+(?:full.year\s+)?(?:guidance|outlook|forecast)\b"
    r"|\b(?:upgrades?\s+to|downgrades?\s+to)\s+(?:buy|sell|hold|neutral|overweight|underweight|outperform|market\s*perform)\b"
    r"|\b(?:moody'?s|standard\s+&\s+poor'?s|s&p\s+global|fitch|dbrs|kroll)\s+(?:cuts?|raises?|upgrades?|downgrades?|affirms?|places?|lowers?)\b"
    r"|\bcredit\s+rating\s+(?:cut|raised?|upgraded?|downgraded?)\b"
    r"|\bprofit\s+warning\b"
    r"|\bwarns?\s+(?:of\s+)?(?:profit|revenue|earnings?)\s+(?:miss|shortfall|decline)\b"
    r"|\b(?:swings?\s+to|posts?\s+a?|reports?\s+a?)\s+(?:net\s+)?(?:profit|loss)\b"
    r"|\bceo\s+(?:resign|depart|step|fired|ousted)\b"
    r"|\bcfo\s+(?:resign|depart|step|fired|ousted)\b"
    r"|\bchief\s+executive\s+(?:resign|leaves?|depart|ousted)\b"
    r"|\b(?:share\s+buyback|stock\s+repurchase|buyback\s+program)\b"
    r"|\bspecial\s+dividend\b"
    r"|\bipo\b.{0,40}(?:prices?|raises?|values?|floats?)"
    r"|\b(?:nears?|reaches?|closes?).{0,25}(?:deal|agreement|accord)\b"
    r")",
    re.IGNORECASE,
)

_WEAK_SIGNAL_RE = re.compile(
    r"(?:"
    r"\b(?:opinion|commentary|column|podcast|interview|q&a|explainer)\b"
    r"|\bwhat\s+(?:to\s+watch|investors?\s+(?:need|should|want)|it\s+means)\b"
    r"|\b(?:here.?s\s+why|what\s+(?:you|we)\s+(?:need|should)\s+(?:to\s+)?know)\b"
    r"|\bweekly\s+(?:roundup|recap|wrap)\b"
    r"|\bdaily\s+(?:brief|briefing|digest|roundup)\b"
    r"|\bmarket\s+(?:talk|chatter|whispers?)\b"
    r"|\bwhy\s+\w+\s+(?:could|might|may)\s+\w"  # "why markets might struggle"
    r"|\b(?:could|might)\s+(?:signal|mean|suggest)\b"
    r"|\b(?:top\s+\d+|five|three)\s+(?:things?|stocks?|picks?)\s+to\b"
    r")",
    re.IGNORECASE,
)


def _compute_signal_strength(item: "FeedItem") -> str:
    """
    Classify signal strength as 'strong', 'medium', or 'weak'.

    strong: hard catalysts — M&A deals, earnings beats/misses, guidance changes,
            analyst rating actions, profit warnings, activist positions, exec exits.
    medium: macro/sector/commodity moves, general company news (default).
    weak:   commentary, opinion, roundups, hypothetical framing.
    """
    text_norm = (
        (item.title + " " + item.snippet)
        .replace("\u2018", "'").replace("\u2019", "'").replace("\u02bc", "'")
    )
    title_norm = (
        item.title
        .replace("\u2018", "'").replace("\u2019", "'").replace("\u02bc", "'")
    )

    # M&A category is always a hard catalyst
    if item.category == "M&A":
        return "strong"

    if _STRONG_SIGNAL_RE.search(text_norm):
        return "strong"

    if _WEAK_SIGNAL_RE.search(title_norm):
        return "weak"

    return "medium"


def _reclassify_category(item: "FeedItem") -> str:
    """
    Derive a content-based category, overriding the source-assigned one.

    Precedence (first match wins):
      1. M&A              — deal vocabulary in title; highly unambiguous
      2. Company (strong) — ticker / explicit share move / named rating agency in
                            TITLE; fires before geo so that "Apple drops 6% on
                            tariff fears" stays Company, not Geopolitical
      3. Markets (subj)   — tradeable instrument IS the headline subject
                            (prevents geo trigger words from hijacking price-
                            action stories like "Brent crude rises on Iran news")
      4. Geopolitical     — sanctions/tariff/conflict keyword in title+snippet
      5. Company (broad)  — earnings, guidance, analyst action, CEO/CFO, layoffs
      6. Source default   — keeps registry category when no stronger signal

    Items already tagged M&A or Geopolitical from their source are only
    overridden when the content clearly contradicts (e.g. an earnings story
    published in Reuters M&A feed).
    """
    text = (item.title + " " + item.snippet).lower()
    # Normalise curly/typographic apostrophes (U+2018 ' and U+2019 ') that RSS
    # feeds commonly use, so that patterns like "moody'?s" match "Moody's".
    title_norm = (
        item.title
        .replace("\u2018", "'").replace("\u2019", "'")
        .replace("\u02bc", "'")
    )

    if _CAT_MA_RE.search(title_norm):       # title-only for M&A — high precision
        return "M&A"

    # Strong company signals in the title — overrides geo so that "Apple drops 6%
    # on tariff fears" (ticker + share move) stays Company, not Geopolitical.
    if _CAT_COMPANY_STRONG_RE.search(title_norm):
        return "Company"

    # Price-action subject: instrument leads the headline → always Markets
    if _PRICE_ACTION_SUBJ_RE.search(title_norm):
        return "Markets"

    if _CAT_GEO_RE.search(text):
        return "Geopolitical"

    # Broader company reclassification: earnings, guidance, analyst actions, etc.
    if _CAT_COMPANY_RE.search(text):
        return "Company"

    # M&A-source fallback guard: if the source is registered as M&A but
    # neither the title nor snippet contains explicit deal vocabulary, downgrade
    # to Markets.  This prevents DealBook newsletters, opinion essays, and
    # business-feature articles from defaulting to M&A by source assignment.
    # Example: "Weighing the Costs of Corporate Silence" from NYT DealBook
    #          has no deal terms → lands in Markets where it scores low and
    #          is eventually filtered; it never pollutes the M&A spotlight.
    text_norm = text.replace("\u2018", "'").replace("\u2019", "'").replace("\u02bc", "'")
    if item.category == "M&A" and not _CAT_MA_RE.search(text_norm):
        return "Markets"

    return item.category


# ── Data model ────────────────────────────────────────────────────────────────

@dataclass(frozen=True)
class MergedSource:
    """
    Provenance row for an article folded into another during dedup (OP1.1).

    Sprint 1 defines the shape only; nothing populates it until merge-dedup
    (OP1.2) replaces delete-dedup. Snippets are capped at _MAX_SNIPPET by the
    producer so provenance never re-inflates pickle size.
    """
    source:       str
    title:        str
    url:          str
    published_dt: datetime | None = None
    snippet:      str             = ""
    tier:         int             = 4


@dataclass
class FeedItem:
    title:          str
    url:            str
    source:         str
    category:       str
    published_dt:   datetime | None = None   # UTC datetime for sorting/filtering
    published:      str             = ""     # display string e.g. "2h ago"
    snippet:        str             = ""     # stripped RSS description
    signal_score:          float      = 0.0       # 0–100, higher = more relevant
    signal_strength:       str        = "medium"  # "strong" | "medium" | "weak"
    affected_entities:     list[str]  = field(default_factory=list)  # tickers / sectors
    # RC2-A: correctly-typed NON-company entities (indicator, institution,
    # market_operator, geography, unit, instrument, technology, finance_term,
    # publication). Additive and defaulted so pre-change pickles load; no
    # consumer reads it yet. These used to be silently mixed into
    # affected_entities as if they were companies.
    typed_entities:        list[dict] = field(default_factory=list)
    summary:               str        = ""        # AI: what happened
    why_it_matters:        str        = ""        # AI: investor implication
    impact:                str        = ""        # AI: directional market impact label
    # Quality scoring debug fields (set by score_item)
    source_quality_score:   float     = 0.0  # normalized source tier 0–100
    consumer_noise_penalty: float     = 0.0  # −30 for consumer framing
    retail_content_penalty: float     = 0.0  # −50 for obvious retail content
    macro_relevance_bonus:  float     = 0.0  # +10 for hard macro catalysts
    cross_asset_bonus:      float     = 0.0  # +8 for multi-asset-class stories
    event_article_penalty:  float     = 0.0  # −60 for opinion / SEO / "should I buy" articles
    event_signal_bonus:     float     = 0.0  # +6 for concrete event verbs (guidance, beats, files…)
    institutional_score:    float     = 0.0  # composite institutional quality 0–100
    graph_alignment_score:  float     = 0.0  # set post-graph; 0–30 regime keyword match
    # OP1.1 provenance (additive; all defaulted so pre-change pickles load).
    # merged_sources stays empty until merge-dedup (OP1.2) populates it.
    # first_seen_dt = earliest publish time across this item and everything
    # merged into it (None until OP1.2). published_dt keeps its existing
    # meaning (this copy's publish time) — recency scoring is untouched.
    merged_sources: list[MergedSource] = field(default_factory=list)
    first_seen_dt:  datetime | None    = None
    fetched_at:     datetime | None    = None   # when Argus first observed this URL (this process)

    def __setstate__(self, state: dict) -> None:
        # Old pickles restore via __dict__ and would lack fields added after
        # they were written; dataclass defaults only apply in __init__. Fill
        # any missing field with its declared default so pre-change
        # ProcessedFeed pickles yield fully-populated items.
        self.__dict__.update(state)
        for f in dataclasses.fields(self):
            if f.name not in self.__dict__:
                if f.default_factory is not dataclasses.MISSING:  # type: ignore[misc]
                    self.__dict__[f.name] = f.default_factory()   # type: ignore[misc]
                elif f.default is not dataclasses.MISSING:
                    self.__dict__[f.name] = f.default


# ── Per-source audit statistics ───────────────────────────────────────────────

@dataclass
class PerSourceStats:
    """
    Pipeline statistics for one RSS source, collected during fetch_all().

    Populated by FeedManager.fetch_all() and stored in
    FeedManager.last_source_stats so callers (scripts, API routes) can
    inspect what happened at each stage without re-running the pipeline.
    """
    source:          str
    raw_fetched:     int               = 0   # items from RSS (before dedup)
    post_dedup:      int               = 0   # items surviving cross-source dedup
    hard_excluded:   int               = 0   # killed by _HARD_EXCLUDE_RE
    noise_penalized: int               = 0   # hit by _NOISE_RE (score too low)
    below_threshold: int               = 0   # failed min_score (not noise / hard)
    kept:            int               = 0   # in final scored feed
    by_category:     dict[str, int]    = field(default_factory=dict)
    kept_titles:     list[str]         = field(default_factory=list)   # up to 5
    dropped_titles:  list[str]         = field(default_factory=list)   # up to 5
    error:           str               = ""  # fetch / parse error message


# ── Feed registry ─────────────────────────────────────────────────────────────
# Each entry: (display_name, rss_url, category)
# Sources are tried in parallel; failed ones fall back to stale cache silently.

FEED_REGISTRY: list[tuple[str, str, str]] = [
    # ── Markets — broad price action and macro ──────────────────────────────────
    # Bloomberg Markets — top-tier, fresh (0–21h), strong macro/price-action signal.
    (
        "Bloomberg Markets",
        "https://feeds.bloomberg.com/markets/news.rss",
        "Markets",
    ),
    # The Information — original tech / AI / deal scoops (flagship, Tier 1).
    (
        "The Information",
        "https://www.theinformation.com/feed",
        "Markets",   # reclassified by content (Company / M&A / Tech)
    ),
    (
        "CNBC Economy",
        "https://www.cnbc.com/id/20910258/device/rss/rss.html",
        "Markets",
    ),
    (
        "MarketWatch",
        "https://feeds.content.dowjones.io/public/rss/mw_topstories",
        "Markets",
    ),
    (
        "Yahoo Finance",
        "https://finance.yahoo.com/rss/topstories",
        "Markets",
    ),
    # ── Company / single-name — earnings, guidance, analyst actions ─────────────
    # FT Companies — Financial Times company desk; earnings, guidance, CEO/CFO,
    # analyst actions, and M&A announcements.  _reclassify_category routes each
    # item to Company / M&A / Geo as appropriate.
    (
        "FT Companies",
        "https://www.ft.com/companies?format=rss",
        "Markets",   # reclassified to Company / M&A / Geo by content
    ),
    # CNBC Companies — earnings, guidance, executive changes, product events.
    (
        "CNBC Companies",
        "https://www.cnbc.com/id/15839069/device/rss/rss.html",
        "Markets",   # reclassified to Company by content
    ),
    # ── M&A ────────────────────────────────────────────────────────────────────
    # FT Deals — Financial Times M&A / deals desk; pure deal journalism covering
    # acquisitions, take-privates, mergers, and deal financing.  High signal-to-noise.
    (
        "FT Deals",
        "https://www.ft.com/mergers-acquisitions?format=rss",
        "M&A",
    ),
    # NYT DealBook — deal journalism and M&A context; content reclassification
    # routes non-deal articles (commentary, geo) to their correct categories.
    (
        "NYT DealBook",
        "https://rss.nytimes.com/services/xml/rss/nyt/DealBook.xml",
        "M&A",
    ),
    # PE Hub — private equity deal announcements: acquisitions, LBOs, growth
    # investments.  Fresh (9–14h), high deal density.
    (
        "PE Hub",
        "https://www.pehub.com/feed/",
        "M&A",
    ),
    # PE Wire — private equity industry news: fund closes, portfolio company
    # announcements, M&A, and strategic moves.
    (
        "PE Wire",
        "https://www.privateequitywire.co.uk/feed/",
        "M&A",
    ),
    # ── Geopolitical ───────────────────────────────────────────────────────────
    # BBC World — authoritative international desk covering conflicts, sanctions,
    # trade policy, and geopolitical risk.
    (
        "BBC World",
        "https://feeds.bbci.co.uk/news/world/rss.xml",
        "Geopolitical",
    ),
    # Politico — US policy, regulation, and legislative developments.
    (
        "Politico",
        "https://rss.politico.com/politics-news.xml",
        "Geopolitical",
    ),

    # ── Tier 1: primary sources & official releases (event-driven) ──────────────
    # These ARE the events: central-bank decisions, auctions, data prints, energy
    # balances, and regulatory orders. Periodic releases (CPI, payrolls) only
    # surface while fresh (≤ STALE_HOURS), which is the desired event-driven behavior.
    # Verified live (feedparser) before wiring; see _SOURCE_TIERS for authority.

    # Federal Reserve — all press releases (FOMC, regulatory, supervisory).
    (
        "Federal Reserve",
        "https://www.federalreserve.gov/feeds/press_all.xml",
        "Markets",
    ),
    # ECB — Governing Council monetary-policy decisions and press releases.
    (
        "ECB",
        "https://www.ecb.europa.eu/rss/press.html",
        "Markets",
    ),
    # Nikkei Asia — Asia macro / markets / corporate (Tier 1).
    (
        "Nikkei Asia",
        "https://asia.nikkei.com/rss/feed/nar",
        "Markets",
    ),
    # US Treasury — auction announcements (TreasuryDirect). Captures the auction
    # calendar / sizing that drives the "Treasury auction weakens" type of event.
    (
        "US Treasury",
        "https://www.treasurydirect.gov/TA_WS/securities/announced/rss",
        "Markets",
    ),
    # BLS — the three market-moving releases, each its own feed (all labeled "BLS").
    ("BLS", "https://www.bls.gov/feed/cpi.rss",    "Markets"),   # CPI / inflation
    ("BLS", "https://www.bls.gov/feed/empsit.rss", "Markets"),   # Employment Situation (payrolls)
    ("BLS", "https://www.bls.gov/feed/ppi.rss",    "Markets"),   # PPI
    # EIA — Today in Energy: crude/nat-gas balances, supply/demand, capacity.
    (
        "EIA",
        "https://www.eia.gov/rss/todayinenergy.xml",
        "Markets",
    ),
    # FERC — no native RSS exists (all official endpoints 404 / serve HTML), so this
    # is a scoped Google-News query for FERC actions (transmission, interconnection,
    # orders, approvals). Lower authority than a primary feed — tiered accordingly.
    (
        "FERC",
        "https://news.google.com/rss/search?q=FERC+(transmission+OR+interconnection+OR+order+OR+approves)+when:7d&hl=en-US&gl=US&ceid=US:en",
        "Markets",
    ),

    # ── Tier 2: specialist industry intelligence (original reporting, low noise) ──
    # Primary domain coverage for the core theses (AI compute, power, data centers).
    # Verified live before wiring.
    (
        "SemiAnalysis",                                   # deep semiconductor / AI-compute research
        "https://semianalysis.com/feed/",
        "Markets",
    ),
    (
        "Utility Dive",                                   # utilities, grid, power demand
        "https://www.utilitydive.com/feeds/news/",
        "Markets",
    ),
    (
        "Data Center Dynamics",                           # data-center buildout primary coverage
        "https://www.datacenterdynamics.com/en/rss/",
        "Markets",
    ),
    # ── Energy / grid / power infrastructure ────────────────────────────────────
    (
        "Canary Media",                                   # energy transition, AI power demand
        "https://www.canarymedia.com/articles.rss",
        "Markets",
    ),
    (
        "RTO Insider",                                    # grid / ISO-RTO / FERC market regulation
        "https://www.rtoinsider.com/feed",
        "Markets",
    ),
    (
        "Power Magazine",                                 # power generation, utilities, projects
        "https://www.powermag.com/feed/",
        "Markets",
    ),
    # ── Private equity / private capital deals ──────────────────────────────────
    (
        "Buyouts",                                        # PE fund + buyout deal flow
        "https://www.buyoutsinsider.com/feed/",
        "M&A",
    ),
    # ── Data-center / infrastructure hardware ───────────────────────────────────
    (
        "Blocks & Files",                                 # data-center storage / infrastructure
        "https://blocksandfiles.com/feed/",
        "Markets",
    ),
]


# ── SEC EDGAR watchlist ─────────────────────────────────────────────────────────
# Curated, theme-aligned set of issuers — NOT all of EDGAR. We pull each name's
# 8-K stream (current reports = material events) and surface ONLY filings whose
# items are materially thesis-relevant (earnings, M&A, debt, control/exec changes,
# guidance). Routine filings (vote results, bylaw tweaks, exhibit-only) are dropped.
# CIKs verified against SEC's official company_tickers.json.
_SEC_UA = "Argus-AI/1.0 (contact: research@argus.example)"   # SEC fair-access: descriptive UA

_SEC_WATCHLIST: dict[str, str] = {
    # AI compute / hyperscaler / semis
    "NVDA":  "0001045810",  # NVIDIA
    "MSFT":  "0000789019",  # Microsoft
    "AMZN":  "0001018724",  # Amazon
    "META":  "0001326801",  # Meta Platforms
    "GOOGL": "0001652044",  # Alphabet
    "AVGO":  "0001730168",  # Broadcom
    "TSLA":  "0001318605",  # Tesla
    # Power / utilities (AI energy demand, nuclear)
    "NEE":   "0000753308",  # NextEra Energy
    "CEG":   "0001868275",  # Constellation Energy
    # Private capital (private credit / buyouts)
    "KKR":   "0001404912",  # KKR & Co.
    "BX":    "0001393818",  # Blackstone
    "APO":   "0001858681",  # Apollo Global Management
}

# Material 8-K item codes → short label. A filing is surfaced only if it carries at
# least one of these; filings whose items are entirely outside this set (e.g. 5.07
# annual-meeting votes, 5.03 bylaw amendments, 9.01 exhibits-only) are skipped.
_SEC_MATERIAL_8K_ITEMS: dict[str, str] = {
    "1.01": "Material Agreement",
    "1.03": "Bankruptcy",
    "2.01": "Acquisition / Disposition",
    "2.02": "Results of Operations",      # earnings
    "2.03": "Material Debt Obligation",
    "2.04": "Debt Triggering Event",
    "2.05": "Restructuring Costs",
    "2.06": "Material Impairment",
    "4.01": "Auditor Change",
    "4.02": "Restatement / Non-Reliance",
    "5.01": "Change in Control",
    "5.02": "Executive / Board Change",
    "7.01": "Reg FD Disclosure",          # guidance / selective disclosure
    "8.01": "Other Material Event",
}

_SEC_ITEM_RE      = re.compile(r"Item\s+(\d\.\d{2})\s*[:.\-]?\s*([^<\n]*)", re.IGNORECASE)
_SEC_8K_ATOM_URL  = (
    "https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK={cik}"
    "&type=8-K&dateb=&owner=include&count=20&output=atom"
)
_SEC_MAX_PER_CO   = 5     # cap material filings surfaced per company per refresh

# ── Dead / replaced sources (kept for reference, not active) ──────────────────
# WSJ Markets (feeds.a.dj.com/rss/RSSMarketsMain.xml): serving 421-day-old items
#   as of 2026-03; DJ legacy RSS endpoint is stale/broken.
# AP Business / AP World (feeds.apnews.com): DNS failure as of 2026-03.
# Benzinga (benzinga.com/feeds/news): malformed XML as of 2026-03.
# GlobeNewswire M&A: malformed XML as of 2026-03.
# Reuters Business, Reuters M&A, Reuters World: feeds.reuters.com DNS failure
#   as of 2025; Reuters deprecated their legacy RSS endpoints.
# Business Wire M&A: malformed XML; new API requires authentication.
# PR Newswire M&A: tagid=90 delivers earnings calls + grand openings, not M&A.
# Politico /politico44.xml / /politicopulse.xml: malformed XML; replaced with
#   rss.politico.com/politics-news.xml which returns clean XML.


# ── Signal scoring ────────────────────────────────────────────────────────────

# Source quality ceiling (out of 50 points — raised to widen Tier-1 vs PR gap)
# Source authority on a 0–50 scale. The numeric value places each source in a tier
# band used by _source_tier (≥46 → T1, ≥38 → T2, ≥30 → T3, <30 → T4) which drives
# both the per-source feed cap and the source-authority ranking factor. The feed
# heavily favors Tier 1 / Tier 2; Tier 3 (trade press) contributes selectively;
# Tier 4 (blogs / promotional / unknown) is hard-capped.
_SOURCE_TIERS: dict[str, float] = {

    # ── Tier 1: global wires, papers of record, central banks & primary releases ─
    "Bloomberg Markets":     50,
    "Reuters":               50,
    "Reuters M&A":           50,
    "Reuters Business":      48,
    "Reuters World":         48,
    "WSJ Markets":           50,
    "Wall Street Journal":   50,
    "FT Deals":              50,
    "FT Companies":          50,
    "Financial Times":       50,
    "Nikkei Asia":           48,   # Nikkei — Asia macro / markets / corporate
    "CNBC Economy":          46,
    "CNBC Companies":        46,
    "The Information":        48,   # original tech / AI / deal scoops (flagship)
    "AP Business":           48,
    "AP World":              47,
    # Central banks / multilaterals / primary government releases
    "Federal Reserve":       50,   # FOMC, H.15, press
    "US Treasury":           50,   # auctions, refunding, TIC
    "ECB":                   50,   # Governing Council decisions, press
    "BIS":                   48,   # (tier encoded; no native RSS wired)
    "IMF":                   48,   # (tier encoded; no native RSS wired)
    "World Bank":            46,   # (tier encoded; no native RSS wired)
    "SEC Filings":           50,   # 8-K / 10-Q / S-1 — the event itself
    "BLS":                   50,   # CPI, PPI, jobs report
    "EIA":                   48,   # crude / nat-gas balances, STEO

    # ── Tier 2: major financial media / quality general ─────────────────────────
    "NYT DealBook":          44,
    "BBC World":             42,   # authoritative international; geo/sanctions/trade
    "MarketWatch":           42,
    "Barron's":              42,
    "Yahoo Finance":         40,
    "Seeking Alpha":         38,   # crowd/analysis — low end of Tier 2

    # ── Tier 3: industry trade publications (specialist, secondary authority) ────
    "PitchBook":             36,   # private-capital deal data
    "SemiAnalysis":          36,   # semiconductor / AI-compute research
    "Private Debt Investor": 35,   # direct lending / private credit
    "Infrastructure Investor":35,  # infra funds
    "RTO Insider":           35,   # grid / ISO-RTO / FERC market regulation
    "Buyouts":               34,   # PE fund + buyout deal flow
    "PE Hub":                34,   # PE deal flow
    "PE Hub Wire":           34,
    "Utility Dive":          34,   # utilities, grid, power demand
    "Data Center Dynamics":  34,   # data-center buildout
    "Canary Media":          34,   # energy transition / AI power demand
    "FERC":                  34,   # transmission orders (Google-News-sourced)
    "Politico":              34,   # US policy / regulatory
    "Power Magazine":        32,   # power generation, utilities
    "PE Wire":               32,   # PE industry news
    "Benzinga":              32,
    "Blocks & Files":        30,   # data-center storage / infrastructure (niche/vendor)

    # ── Tier 4: PR wires / promotional (hard-capped; unknown sources default here)
    "GlobeNewswire M&A":     14,
    "Business Wire M&A":     14,
    "PR Newswire M&A":       12,
}

# High-value finance keywords (+15 per match, cap 40)
_HIGH_VALUE_KEYWORDS: frozenset[str] = frozenset({
    "acqui", "merger", "buyout", "takeover", "lbo",
    "bankrupt", "default", "restructur",
    "ipo", "listing", "public offering",
    "federal reserve", "fed funds", "rate cut", "rate hike",
    "recession", "gdp", "inflation data",
    "chapter 11", "chapter 7",
    "sanctions", "tariff",
})

# Medium-value keywords (+6 per match, cap 40 combined with high)
_MED_VALUE_KEYWORDS: frozenset[str] = frozenset({
    "billion", "deal", "fund", "private equity", "pe firm",
    "fed", "ecb", "central bank", "treasury", "yield",
    "inflation", "gdp", "macro",
    "earnings", "revenue", "guidance", "forecast",
    "china", "ukraine", "russia", "iran", "opec",
    "surge", "plunge", "crash", "rally", "soar",
    "layoff", "job", "unemployment",
    "rate", "spread", "credit",
})

# Noise patterns — press-release boilerplate that signals low editorial value
_NOISE_RE = re.compile(
    r"(?:"
    # Product/service/platform launches (allow adjective modifier: "new cloud platform")
    r"launch(?:es|ed|ing)?\b.{0,25}(?:product|service|platform|solution|initiative|program|suite)\b"
    r"|announc(?:es|ed|ing)\b.{0,25}(?:partnership|collaboration|integration|availability)\b"
    # Executive appointments ("appoints new CEO", "announcement of new CTO", "appointment of CEO")
    r"|appoint(?:s|ed|ment\b).{0,25}(?:chief|ceo|cfo|coo|cto|president|director\b|vp\b|vice\s+president|head\s+of)"
    # Awards and recognition
    r"|(?:wins?|receives?|named?|awarded?)\b.{0,15}(?:top\b|best\b|leading\b|award|honor|recogni)"
    r"|proud(?:ly)?\s+(?:to\s+)?(?:announce|introduce|present)"
    r"|certif(?:y|ies|ied|ication)\b"
    r"|expands?\b.{0,15}(?:presence|portfolio|offering|lineup|suite)\b"
    # ── Securities litigation / investor-alert spam ──────────────────────────
    # These flood M&A feeds and carry zero editorial value
    r"|investor\s+alert\b"
    r"|class\s+action\b"
    r"|shareholder\s+rights\s+(?:law\s+)?firm"
    r"|remind(?:s|ing)?\s+investors\b"
    r"|lawsuit\s+(?:filed\s+)?against\b"
    r"|announc(?:es|ed|ing)\s+(?:a\s+)?(?:securities\s+)?investigation"
    r"|securities\s+fraud\s+(?:class\s+action|lawsuit|investigation)"
    r"|(?:law\s+firm|attorney[s]?)\s+(?:files?|files?\s+a|investigat)"
    # ── Personal finance / listicle low-signal content ───────────────────────
    # Listicle format: "10 Tips to Save Money", "5 Ways to Budget"
    # Require number at start of title so "S&P rises 3 steps" is not caught.
    r"|^\d{1,2}\s+(?:tips?|ways?|steps?|strategies?|mistakes?|secrets?|ideas?|reasons?|things?|facts?)\b.{0,70}(?:money|saving|budget|invest|retire|insur|debt|credit|loan)\b"
    # Explicit personal finance framing
    r"|personal\s+finance\b"
    r"|(?:your|my)\s+(?:monthly\s+)?(?:budget|emergency\s+fund|savings?\s+account)\b"
    r"|how\s+to\s+(?:save\s+(?:more\s+)?money|pay\s+off\s+(?:your\s+)?(?:debt|student\s+loans?)|boost\s+your\s+credit\s+score|build\s+(?:an?\s+)?emergency\s+fund)\b"
    # Regional listicles: "5 States Where Taxes Are Lowest"
    r"|^\d{1,2}\s+states?\s+(?:where|to|with|that)\b.{0,40}(?:tax|retire|live|afford|income|save)\b"
    # Insurance lifestyle content (not rate/market news)
    r"|(?:life|home|auto|car|health|pet)\s+insurance\s+(?:tips?|quotes?|cheaper|affordable|savings?)\b"
    # ── Retirement account / 401(k) consumer advice ──────────────────────────
    # "Roll over your 401k", "IRA contribution limits", "should I roll over",
    # "retirement account tips" — personal finance, not institutional news.
    r"|401\s*[(\s]?\s*k\b.{0,60}(?:rollover|roll\s+over|withdrawal|contribut|tips?|advice|limit|should)"
    r"|\bira\s+(?:rollover|roll\s+over|contribut|limit|tips?|vs\.?\s)"
    r"|\brollover\s+(?:your\s+)?(?:401|ira|pension|retirement)\b"
    r"|\bshould\s+(?:you|i)\b.{0,30}(?:roll\s+over|rollover|401|ira|retire)\b"
    r"|\bretirement\s+(?:account|savings?|fund)\s+(?:tips?|advice|guide|mistake|should)\b"
    # ── Commentary / opinion / essay framing ─────────────────────────────────
    # Titles with these patterns are editorial perspective pieces, not
    # event-driven news — they carry no actionable signal for investors.
    # "Weighing the Costs of Corporate Silence", "What This Means for Tech"
    r"|\bweighing\s+the\b"              # "Weighing the..." — always framing/analysis
    r"|\bthe\s+(?:real\s+)?costs?\s+of\s+\w{4,}\s*$"  # "The Cost of Silence"
    r"|\bwhat\s+(?:this|it)\s+means\s+for\b"
    r"|\bmaking\s+sense\s+of\b"
    r"|\ba\s+(?:closer\s+)?look\s+at\b"
    # Explicit opinion/column labels (not Reuters "Analysis:" which is hard news)
    r"|^(?:opinion|commentary|perspective|column)\s*:"
    # ── General newsletter-flavour CTAs missed by hard exclude ────────────────
    r"|\bfree\s+(?:daily|weekly|morning)\s+(?:newsletter|briefing|digest)\b"
    r"|\bmorning\s+(?:brief|briefing|roundup)\b.{0,20}(?:sign\s+up|subscribe|free)\b"
    r")",
    re.IGNORECASE,
)


# ── Consumer topic soft penalty ────────────────────────────────────────────────
# These patterns identify consumer/personal-finance content that should rank
# lower but not be fully excluded.  Applied as a −30 penalty in score_item()
# and also sets consumer_noise_penalty on the item for downstream filtering.
#
# Designed to avoid false positives on market-moving stories that merely mention
# the same topic (e.g. "Medicare reimbursement cut hurts hospital stocks" is
# NOT caught because it lacks the consumer-advice framing anchors).
_CONSUMER_SOFT_RE = re.compile(
    r"(?:"
    # Medicare consumer tips / advice — NOT rate/reimbursement policy stories
    r"\bmedicare\b.{0,60}(?:tips?|advice|guide|enroll|enrolment|supplement|advantage\s+plan|open\s+enrollment|coverage\s+options?|mistakes?|confus|eligib|when\s+to|how\s+to|what\s+you|should\s+you)\b"
    r"|\b(?:tips?|guide|how\s+to|mistakes?\s+to\s+avoid)\b.{0,40}\bmedicare\b"
    # HSA / FSA personal savings advice
    r"|\b(?:hsa|fsa|health\s+savings\s+account)\b.{0,50}(?:tips?|advice|guide|benefit|how\s+to|use|spend|maximize|contribute|limit|worth\s+it|should\s+you|open)\b"
    # Scam / fraud / phishing / identity theft consumer alerts
    r"|\bscam\b|\bphishing\b|\bidentity\s+theft\b"
    r"|\bwatch\s+out\s+for\b.{0,25}(?:scam|fraud|scheme)\b"
    r"|\bfraud\s+alert\b.{0,30}(?:consumer|personal|you|your)\b"
    # Realtor / buyer agent commission — consumer home-buying (not REIT/real estate market)
    r"|\b(?:realtor|buyer'?s?\s+agent|listing\s+agent)\b.{0,50}(?:commission|fee|pay|cost|new\s+rule|settlement)\b"
    r"|\breal\s+estate\s+agent\s+(?:commission|fee)\b"
    r"|\b(?:nar|national\s+association\s+of\s+realtors)\b.{0,50}(?:settlement|commission|rule|fee|pay)\b"
    # Social Security consumer tips — not reform/policy stories
    r"|\bsocial\s+security\b.{0,60}(?:tips?|advice|how\s+to|when\s+to|should\s+i|should\s+you|check|benefit\s+you|claiming\s+strategy|mistake)\b"
    r"|\b(?:when|how)\s+to\s+(?:claim|take|collect)\b.{0,25}\bsocial\s+security\b"
    # Tax credit as personal savings advice — not legislative market-moving stories
    r"|\btax\s+credits?\b.{0,50}(?:you\s+(?:can|may|might|could)|eligible|qualify|claim\s+(?:on|for)\b|how\s+to|tips?|save\s+you|get\s+back)\b"
    r"|\bclaim\s+(?:a\s+)?tax\s+credit\b"
    # Generic personal savings tips
    r"|\bhow\s+(?:much\s+)?(?:you\s+)?(?:can\s+)?(?:save|saved?)\s+on\b"
    r"|\b(?:slash|cut|reduce)\s+your\s+(?:bills?|expenses?|costs?|taxes?)\b"
    r")",
    re.IGNORECASE,
)

# ── Retail content penalty ────────────────────────────────────────────────────
# Patterns for obvious retail/personal-finance content.  Harder than _CONSUMER_SOFT_RE
# (−50 vs −30) but softer than _NOISE_RE (−75) so items still appear in the feed
# but rank far below institutional stories.
_RETAIL_CONTENT_RE = re.compile(
    r"(?:"
    # Consumer savings products
    r"\bbest\s+(?:savings?|checking|money\s+market|high.yield)\s+(?:account|cd)\b"
    r"|\bcd\s+rates?\s+(?:today|this\s+week|comparison|guide|best|highest)\b"
    r"|\bapy\s+(?:comparison|today|rates?|guide|ranking|best)\b"
    # Consumer debt advice
    r"|\bstudent\s+loan\s+(?:refinanc|forgiven|payoff|forgiveness|tips?|consolid|relief|advice)\b"
    r"|\bcredit\s+card\s+debt\s+(?:payoff|consolid|help|relief|tips?)\b"
    r"|\bpay\s+off\s+(?:your\s+)?(?:credit\s+card|student\s+loan|mortgage\s+faster|debt\s+fast)\b"
    r"|\bdebt\s+(?:snowball|avalanche|consolid|payoff\s+plan|free)\b"
    # Retail investing advice (not market news)
    r"|\bbest\s+(?:robo.?advisors?|brokerage\s+accounts?|index\s+funds?|etfs?\s+to\s+buy)\b"
    r"|\b(?:which|what)\s+(?:brokerage|broker|fund|etf|stock)\s+should\s+(?:i|you)\b"
    r"|\bpassive\s+income\s+(?:streams?|ideas?|stocks?|investments?)\b"
    r"|\bdividend\s+stocks?\s+(?:for\s+income|to\s+buy|beginners?|retirees?|passive)\b"
    r"|\bsafe\s+investments?\s+for\s+(?:retirees?|beginners?|seniors?|conservative)\b"
    # Home buying / real estate consumer advice
    r"|\bfirst.time\s+(?:home\s+)?(?:buyer|homebuyer)\b"
    r"|\bhome\s+buying\s+(?:tips?|guide|advice|checklist|process|mistakes?)\b"
    r"|\bdown\s+payment\s+(?:tips?|help|assistance|how\s+much|savings?)\b"
    # Life insurance shopping
    r"|\blife\s+insurance\s+(?:quotes?|comparison|best|cheapest|affordable|shopping|should\s+you)\b"
    r"|\bhow\s+much\s+life\s+insurance\s+(?:do\s+i|do\s+you|should)\b"
    # Estate planning consumer advice
    r"|\bestate\s+planning\s+(?:tips?|guide|basics?|mistakes?|for\s+(?:families?|retirees?|you))\b"
    r"|\bwills?\s+and\s+trusts?\s+(?:guide|tips?|basics?|explained?)\b"
    # Fintech apps / budgeting tools (consumer)
    r"|\bbest\s+(?:budgeting|money\s+management|personal\s+finance)\s+apps?\b"
    r"|\b(?:mint|ynab|copilot|monarch)\s+(?:app|review|alternative|vs\.?)\b"
    r"|\bcash\s+back\s+(?:apps?|cards?|rewards?\s+comparison)\b"
    # Retail wealth advice
    r"|\bhow\s+to\s+(?:become\s+a\s+millionaire|build\s+wealth|get\s+rich|retire\s+early)\b"
    r"|\bfire\s+movement\b|\bfinancial\s+independence\s+retire\s+early\b"
    r"|\bnet\s+worth\s+(?:tracker|goals?|calculator|milestones?|by\s+age)\b"
    r")",
    re.IGNORECASE,
)

# ── Macro relevance bonus ──────────────────────────────────────────────────────
# Patterns that confirm hard macro / institutional relevance — scored +10 pts
# and also boost institutional_score.  These are catalysts that move multiple
# asset classes simultaneously and are the primary focus of institutional desks.
_MACRO_RELEVANCE_RE = re.compile(
    r"(?:"
    r"\b(?:federal\s+reserve|fomc|jerome\s+powell|fed\s+chair|fed\s+decision)\b"
    r"|\b(?:ecb|bank\s+of\s+japan|bank\s+of\s+england|boj|boe|pboc|rba|snb)\b"
    r"|\b(?:monetary\s+policy|quantitative\s+tightening|quantitative\s+easing|qt\b|qe\b)\b"
    r"|\b(?:treasury\s+auction|coupon\s+pass|t-bill\s+issuance|debt\s+ceiling)\b"
    r"|\b(?:nonfarm\s+payroll|cpi\s+data|pce\s+data|core\s+inflation\s+data|ppi\s+report)\b"
    r"|\b(?:fiscal\s+stimulus|fiscal\s+deficit|spending\s+bill|budget\s+reconciliation)\b"
    r"|\b(?:industrial\s+policy|chips\s+act|ira\s+subsidy|export\s+controls?)\b"
    r"|\b(?:capital\s+flows?|fund\s+flows?|positioning\s+data|cftc\s+data)\b"
    r"|\b(?:sovereign\s+debt|em\s+contagion|credit\s+contagion|systemic\s+risk)\b"
    r"|\b(?:geopolitical\s+escalat|military\s+escalat|sanctions?\s+regime|coup)\b"
    r"|\b(?:opec\+?\s+(?:cut|meeting|quota|output)|cartel\s+decision|crude\s+supply\s+shock)\b"
    r"|\b(?:ai\s+(?:infrastructure|capex\s+cycle|chip\s+demand)|data\s+center\s+(?:build|demand))\b"
    r"|\b(?:credit\s+market|leveraged\s+loan\s+market|clo\s+market|abs\s+market)\b"
    r"|\b(?:global\s+growth|synchronized\s+slowdown|soft\s+landing|hard\s+landing)\b"
    r"|\b(?:dollar\s+milkshake|dollar\s+wrecking\s+ball|yen\s+carry\s+trade|carry\s+unwind)\b"
    r")",
    re.IGNORECASE,
)

# ── Cross-asset class detection ────────────────────────────────────────────────
# Five distinct asset-class buckets.  +8 bonus when 2+ buckets are found in the
# same story — these are the macro transmission stories that institutional desks
# read first.
_CROSS_ASSET_CLASSES: list[re.Pattern] = [
    re.compile(r"\b(?:equity|equities|stocks?|shares?|s&p\s*500|nasdaq|dow\s+jones|nikkei|ftse|russell)\b", re.IGNORECASE),
    re.compile(r"\b(?:treasury|treasuries|bond|bonds?|yield|yields?|rate\s+hike|rate\s+cut|10.year|gilt|bund|duration)\b", re.IGNORECASE),
    re.compile(r"\b(?:dollar|yen|yuan|euro|sterling|pound|eur/usd|usd/jpy|dxy|fx|currencies?|forex|usd|jpy|gbp|cny)\b", re.IGNORECASE),
    re.compile(r"\b(?:oil|crude|brent|wti|gold|silver|copper|commodit|energy\s+prices?|nat\s+gas)\b", re.IGNORECASE),
    re.compile(r"\b(?:credit\s+spread|high.yield\s+spread|investment.grade|ig\s+spread|hy\s+spread|cds\b|credit\s+default)\b", re.IGNORECASE),
]

# ── Institutional signal boost ─────────────────────────────────────────────────
# Patterns that confirm market-moving institutional relevance — give +8 pts
# beyond keyword matching.  Applied only when NOT already covered by keywords.
_INSTITUTIONAL_BOOST_RE = re.compile(
    r"(?:"
    r"\b(?:capex|capital\s+expenditure)\b.{0,30}(?:ai|data\s+center|infrastructure|chips?)\b"
    r"|\bsector\s+rotation\b"
    r"|\b(?:credit\s+spread|cds\s+spread|high\s+yield\s+spread|ig\s+spread)\b"
    r"|\b(?:private\s+credit|private\s+debt|direct\s+lending)\b"
    r"|\bipo\s+(?:pricing|roadshow|debut|listing|market)\b"
    r"|\b(?:rights?\s+issue|secondary\s+offering|follow.on)\b"
    r"|\bcapital\s+markets\s+(?:activity|issuance|deal|window)\b"
    r"|\byield\s+curve\s+(?:inversion|steepen|flatten|control)\b"
    r"|\bterm\s+premium\b"
    r"|\bbreak.?even\s+inflation\b|\btips\s+(?:yield|spread)\b"
    r"|\bquantitative\s+(?:tightening|easing|qt|qe)\b"
    r"|\b(?:reverse\s+repo|repurchase\s+agreement|repo\s+rate)\b"
    r"|\benergy\s+(?:crisis|shock|transition\s+policy|sanctions?\s+impact)\b"
    r"|\b(?:opec\+?|cartel\s+cut|production\s+quota)\b"
    r")",
    re.IGNORECASE,
)

# ── Event-vs-article classifier ─────────────────────────────────────────────────
# Argus surfaces EVENTS, not ARTICLES. These patterns identify article-/opinion-/
# SEO-driven headlines — "Is X a good stock to buy?", "Top AI Stocks for 2026",
# "Why Investors Love X", "Can Tech Justify a Trillion-Dollar Valuation?" — which
# carry no discrete catalyst. Matching applies a heavy penalty (−60) so they fall
# below the conviction gate. Deliberately tuned NOT to hit event headlines like
# "Broadcom lowers guidance" or "FERC approves transmission project".
_ARTICLE_OPINION_RE = re.compile(
    r"(?:"
    # ── "Should I buy" / buy-sell advice framing ──────────────────────────────
    r"\bshould\s+(?:i|you|investors?|we)\s+(?:buy|sell|own|hold|invest|dump|avoid)\b"
    r"|\b(?:good|great|best|top|hot|smart|safe|cheap|undervalued)\s+stocks?\s+to\s+(?:buy|own|watch|consider|hold)\b"
    r"|\bstocks?\s+to\s+(?:buy|watch|own|consider|avoid|sell)\b"
    r"|\b(?:a\s+)?(?:good|great|smart|strong|solid)\s+stock\s+to\s+buy\b"
    r"|\bis\s+[\w.\-]+\s+(?:stock\s+)?a\s+(?:buy|sell|good\s+(?:stock|buy|investment)|smart\s+buy|bargain)\b"
    r"|\bis\s+(?:it\s+)?(?:too\s+late|time)\s+to\s+(?:buy|sell|invest)\b"
    r"|\bbuy\s+the\s+dip\b|\bworth\s+buying\b|\bbetter\s+buy\b|\bbuy[,\s]+sell[,\s]+or\s+hold\b"
    # ── Stock-pick listicles / SEO rankings ───────────────────────────────────
    r"|\btop\s+\d*\s*[\w\s/&'-]{0,24}?\bstocks?\b"            # "Top 10 AI Stocks", "Top AI Stocks"
    r"|\bbest\s+[\w\s/&'-]{0,24}?\bstocks?\b"                 # "Best Dividend Stocks for 2026"
    r"|\b\d{1,2}\s+[\w\s/&'-]{0,24}?\bstocks?\s+(?:to\s+buy|to\s+watch|for|of\s+20\d\d|right\s+now)\b"
    r"|\bstock\s+picks?\b|\bbest\s+stocks?\b|\btop\s+stocks?\b|\bstocks?\s+to\s+watch\b"
    r"|\bhot\s+stocks?\b|\bmust.own\s+stocks?\b"
    # ── Opinion / explainer / SEO framing ─────────────────────────────────────
    r"|\bwhy\s+(?:investors?|wall\s+street|the\s+market|markets?|everyone|traders?|you\s+should)\b"
    r"|\bhere'?s?\s+why\b|\bhere\s+is\s+why\b|\bthis\s+is\s+why\b"
    r"|\bwhat\s+(?:to\s+know|you\s+need\s+to\s+know|investors\s+need\s+to\s+know)\b"
    r"|\beverything\s+you\s+need\s+to\s+know\b"
    r"|\bthings?\s+to\s+(?:know|watch)\s+(?:about|before|this)\b"
    # ── Valuation-justification opinion ───────────────────────────────────────
    r"|\bcan\s+[\w\s'.\-]{0,30}?\bjustify\b"
    r"|\bjustify\s+(?:a\s+|its\s+|the\s+)?[\w\s$.\-]{0,20}\bvaluation\b"
    r"|\b(?:is|are|has)\s+[\w\s'.\-]{0,30}?\b(?:over|under)valued\b"
    r"|\bis\s+[\w\s'.\-]{0,30}?\ba\s+bubble\b"
    # ── Hype / prediction / forecast opinion ──────────────────────────────────
    r"|\b(?:could|might|will|may)\s+(?:soar|surge|double|triple|skyrocket|explode|plunge|crash|tank|moon)\b"
    r"|\bprice\s+(?:prediction|forecast)\b|\b(?:prediction|forecast)\s+for\s+20\d\d\b"
    r"|\bwhere\s+will\s+[\w\s'.\-]{0,30}?\b(?:be|go|head)\b"
    r"|\b(?:next\s+(?:big|hot)|the\s+next)\s+[\w\s'.\-]{0,20}?\b(?:stock|nvidia|amazon|apple|tesla)\b"
    # ── Generic rhetorical headline: Is/Can/Will/Should …<speculation>…? ───────
    r"|^(?:is|are|can|will|should|why|how|what)\b[^?]{0,80}\b(?:buy|sell|worth|bubble|overvalued|undervalued|justify|too\s+(?:high|cheap|late)|next|soar|rally|win|winner|crash|doomed|dead)\b[^?]*\?"
    r")",
    re.IGNORECASE,
)

# ── Event-signal bonus ──────────────────────────────────────────────────────────
# Concrete catalyst verbs with objects — the hallmark of an EVENT headline. Gives
# a modest boost so event-driven stories edge out article-style ones at the margin.
_EVENT_SIGNAL_RE = re.compile(
    r"(?:"
    r"\b(?:raises?|lowers?|cuts?|lifts?|boosts?|slashes?|trims?|reaffirms?|withdraws?)\s+(?:its\s+|full.?year\s+|fy\s*\d\d\s+)?(?:guidance|forecast|outlook|dividend|target|estimates?|price\s+target)\b"
    r"|\b(?:beats?|misses?|tops?|trails?|matches?)\s+(?:on\s+)?(?:estimates?|expectations?|forecasts?|views?|the\s+street|consensus)\b"
    r"|\b(?:reports?|posts?)\s+(?:q[1-4]\b|first|second|third|fourth|quarter|fy\s*\d|record|a\s+(?:loss|profit)|results?)\b"
    r"|\braises?\s+\$?\d"                                  # "raises $20B fund"
    r"|\b(?:approves?|rejects?|blocks?|clears?|grants?|denies?|fines?|charges?|sues?|halts?|orders?)\b"
    r"|\b(?:to\s+acquire|acquires?|to\s+buy|agrees?\s+to\s+(?:buy|acquire|merge)|merger\s+with|takeover\s+(?:bid|offer))\b"
    r"|\b(?:auction|issuance|prices?\s+(?:its\s+)?(?:ipo|bond|notes?|offering|debt))\b"
    r"|\b(?:downgrades?|upgrades?)\b"
    r"|\b(?:files?\s+for|filed\s+for|files?)\s+(?:ipo|bankruptcy|chapter\s+11|for\s+ipo)\b"
    r"|\b(?:announces?|unveils?|launches?)\s+\$?\d"        # quantified announcement
    r"|\b(?:surprises?|jumps?|climbs?|falls?|rises?|drops?)\s+(?:to|higher|lower|above|below|past)\b"
    r")",
    re.IGNORECASE,
)


# Normalized source quality ceiling (0–100 scale, derived from _SOURCE_TIERS / 50 * 100)
# Used for institutional_score computation and Today's Take candidate filtering.
def _source_quality(source: str) -> float:
    """Return source quality 0–100 (scaled from source tier 0–50)."""
    return min(100.0, _SOURCE_TIERS.get(source, 20) * 2.0)


# ── Source tiers & dominance caps ───────────────────────────────────────────────
# Formal tier bands over the 0–50 _SOURCE_TIERS quality scale. The per-source feed
# cap is how a publisher's authority translates into how much of the feed it may
# occupy: flagship wires / primary sources may dominate when they have genuine
# stories; low-authority publishers are hard-capped so they can never pad the feed.
#
#   Tier 1 (≥46)  flagship wires + primary releases (Bloomberg, FT, The Information,
#                 SEC, Fed, Treasury, BLS, EIA)          → effectively uncapped
#   Tier 2 (38–45) quality specialist / strong general   → up to 6
#   Tier 3 (30–37) solid but secondary                   → up to 3
#   Tier 4 (<30)   low-authority / aggregator (Yahoo …)  → up to 2
_TIER_FEED_CAP: dict[int, int] = {1: 12, 2: 6, 3: 3, 4: 2}


def _source_tier(source: str) -> int:
    """Classify a source into tier 1–4 from its quality score."""
    q = _SOURCE_TIERS.get(source, 20)
    if q >= 46: return 1
    if q >= 38: return 2
    if q >= 30: return 3
    return 4


def _per_source_cap(source: str) -> int:
    """Max items a single source may contribute to the final feed (by tier)."""
    return _TIER_FEED_CAP[_source_tier(source)]


def score_item(item: "FeedItem") -> float:
    """
    Score a FeedItem for signal quality on a 0–100 scale.
    Sets all quality-scoring debug fields on the item.

    Signal score components:
      Source tier        : 0–50   (editorial quality)
      Keywords           : 0–40   (finance relevance)
      Recency            : 0–20   (linear decay over 48h)
      Ticker bonus       : +8     (explicit stock ticker)
      Institutional boost: +8     (market-structure signals)
      Macro bonus        : +10    (hard macro catalyst)
      Cross-asset bonus  : +8     (2+ asset classes)
      Event bonus        : +6     (concrete catalyst verb in headline)
      Noise penalty      : −75    (PR boilerplate)
      Consumer soft      : −30    (personal finance framing)
      Retail penalty     : −50    (obvious retail content)
      Article penalty    : −60    (opinion / SEO / "should I buy" articles)

    institutional_score (0–100):
      A quality-only composite used by Today's Take / WMN selectors to
      prefer Bloomberg/FT macro stories over consumer finance content even
      when raw signal_score is similar.  Not capped the same way as signal;
      see formula below.
    """
    full_text = item.title + " " + item.snippet
    text      = full_text.lower()

    # 1. Source tier
    src_score = _SOURCE_TIERS.get(item.source, 20)

    # 2. Keyword relevance
    kw = 0
    for kw_str in _HIGH_VALUE_KEYWORDS:
        if kw_str in text:
            kw += 15
    for kw_str in _MED_VALUE_KEYWORDS:
        if kw_str in text:
            kw += 6
    kw_score = min(kw, 40)

    # 3. Recency (up to 20 pts, linear decay over STALE_HOURS)
    if item.published_dt:
        age_h     = max(0.0, (datetime.now(timezone.utc) - item.published_dt).total_seconds() / 3600)
        rec_score = max(0.0, 20.0 * (1 - age_h / STALE_HOURS))
    else:
        rec_score = 0.0

    # 4. Hard exclusions — newsletter/podcast/sponsored CTAs, generic retail
    #    investing articles, and off-topic content (personal finance, retirement,
    #    ETF/portfolio advice, stock-picking, lifestyle finance, trivia).
    if (_HARD_EXCLUDE_RE.search(item.title)
            or _RETAIL_ARTICLE_HARD_RE.search(item.title)
            or _OFF_TOPIC_HARD_RE.search(item.title)):
        item.source_quality_score   = 0.0
        item.consumer_noise_penalty = 0.0
        item.retail_content_penalty = 0.0
        item.macro_relevance_bonus  = 0.0
        item.cross_asset_bonus      = 0.0
        item.event_article_penalty  = 0.0
        item.event_signal_bonus     = 0.0
        item.institutional_score    = 0.0
        return 0.0

    # 5. Noise penalty — PR boilerplate, listicles, commentary
    noise = 75.0 if _NOISE_RE.search(item.title) else 0.0

    # 6. Consumer soft penalty (−30) — only when not already caught by _NOISE_RE
    consumer_penalty = 0.0
    if noise == 0.0 and _CONSUMER_SOFT_RE.search(full_text):
        consumer_penalty = 30.0

    # 7. Retail content penalty (−50) — stronger than consumer soft; obvious
    #    retail/personal-finance content that _CONSUMER_SOFT_RE didn't catch
    retail_penalty = 0.0
    if noise == 0.0 and consumer_penalty == 0.0 and _RETAIL_CONTENT_RE.search(full_text):
        retail_penalty = 50.0

    # 7b. Article/opinion/SEO penalty (−60) — event-vs-article classifier.
    #     Anchored on the TITLE (headline framing), applied when not already
    #     caught by harder penalties. Surfaces events, suppresses articles.
    article_penalty = 0.0
    if noise == 0.0 and consumer_penalty == 0.0 and retail_penalty == 0.0 \
            and _ARTICLE_OPINION_RE.search(item.title):
        article_penalty = 60.0

    # 7c. Event-signal bonus (+6) — concrete catalyst verb in the headline.
    event_bonus = 6.0 if _EVENT_SIGNAL_RE.search(item.title) else 0.0

    # 8. Ticker bonus — unambiguous single-company signal
    ticker_bonus = 8.0 if _TICKER_RE.search(item.title) else 0.0

    # 9. Institutional boost — market-structure signals not in keyword set
    inst_boost = 8.0 if _INSTITUTIONAL_BOOST_RE.search(full_text) else 0.0

    # 10. Macro relevance bonus — hard macro catalysts that move multiple classes
    macro_bonus = 10.0 if _MACRO_RELEVANCE_RE.search(full_text) else 0.0

    # 11. Cross-asset bonus — 2+ distinct asset classes in the same story
    asset_hits  = sum(1 for pat in _CROSS_ASSET_CLASSES if pat.search(full_text))
    cross_bonus = 8.0 if asset_hits >= 2 else 0.0

    # ── Signal score (0–100) ──────────────────────────────────────────────────
    signal = max(0.0, min(100.0,
        src_score + kw_score + rec_score + ticker_bonus + inst_boost + macro_bonus
        + cross_bonus + event_bonus
        - noise - consumer_penalty - retail_penalty - article_penalty
    ))

    # ── institutional_score (0–100) ────────────────────────────────────────────
    # Quality-only composite for Today's Take / WMN candidate ranking.
    # Weights: source tier (dominant) + keyword depth + macro/cross-asset bonuses
    # Penalties: consumer/retail framing subtract directly.
    src_quality = _source_quality(item.source)
    inst_score  = max(0.0, min(100.0,
        src_quality                          # 0–100: source prestige
        + min(kw_score * 0.5, 20.0)          # 0–20: keyword depth
        + inst_boost                         # +8  : market-structure signal
        + macro_bonus * 0.8                  # +8  : macro catalyst
        + cross_bonus * 0.6                  # +4.8: cross-asset breadth
        + event_bonus                        # +6  : concrete event catalyst
        - consumer_penalty * 1.2             # −36 : consumer framing
        - retail_penalty   * 1.5             # −75 : retail content
        - article_penalty  * 1.2             # −72 : opinion / SEO article
    ))

    item.source_quality_score   = round(src_quality, 1)
    item.consumer_noise_penalty = round(consumer_penalty, 1)
    item.retail_content_penalty = round(retail_penalty, 1)
    item.macro_relevance_bonus  = round(macro_bonus, 1)
    item.cross_asset_bonus      = round(cross_bonus, 1)
    item.event_article_penalty  = round(article_penalty, 1)
    item.event_signal_bonus     = round(event_bonus, 1)
    item.institutional_score    = round(inst_score, 1)

    return signal


# ── Date helpers ──────────────────────────────────────────────────────────────

def _parse_published_dt(entry: object) -> datetime | None:
    """Extract a UTC-aware datetime from a feedparser entry."""
    for attr in ("published_parsed", "updated_parsed", "created_parsed"):
        st = getattr(entry, attr, None)
        if st is None:
            st = entry.get(attr) if hasattr(entry, "get") else None
        if st is not None:
            try:
                return datetime.fromtimestamp(calendar.timegm(st), tz=timezone.utc)
            except Exception:
                pass
    return None


def format_age(dt: datetime | None) -> str:
    """Return a human-readable relative age: '5m ago', '3h ago', '2d ago'."""
    if dt is None:
        return "Recent"
    now   = datetime.now(timezone.utc)
    secs  = (now - dt).total_seconds()
    if secs < 0:
        return "Just now"
    if secs < 3600:
        return f"{max(1, int(secs / 60))}m ago"
    if secs < 86400:
        return f"{int(secs / 3600)}h ago"
    return f"{int(secs / 86400)}d ago"


# ── Deduplication ─────────────────────────────────────────────────────────────

def _title_words(title: str) -> set[str]:
    return set(_WORD_RE.sub("", title.lower()).split())


def _jaccard(a: set[str], b: set[str]) -> float:
    if not a or not b:
        return 0.0
    return len(a & b) / len(a | b)


_MAX_MERGED = 12   # provenance rows per survivor (OP1.1 pickle-size bound)


def _fold_into(survivor: FeedItem, loser: FeedItem) -> None:
    """
    Fold `loser` into `survivor` as MergedSource provenance (OP1.2).

    The loser's identity row and any provenance it already carries transfer
    to the survivor; duplicate URLs are skipped so syndicated copies and
    re-encounters can never create a second attestation for the same page.
    first_seen_dt becomes the earliest valid publish time seen so far.
    """
    rows = list(survivor.merged_sources)
    seen = {survivor.url} | {r.url for r in rows}

    candidates = [MergedSource(
        source=loser.source,
        title=loser.title,
        url=loser.url,
        published_dt=loser.published_dt,
        snippet=loser.snippet[:_MAX_SNIPPET],
        tier=_source_tier(loser.source),
    )] + list(loser.merged_sources)

    for row in candidates:
        if row.url in seen or len(rows) >= _MAX_MERGED:
            continue
        seen.add(row.url)
        rows.append(row)
    survivor.merged_sources = rows

    times = [t for t in (
        survivor.first_seen_dt, survivor.published_dt, loser.first_seen_dt,
        loser.published_dt, *(r.published_dt for r in rows),
    ) if t is not None]
    survivor.first_seen_dt = min(times) if times else None

    for ent in loser.affected_entities:
        if ent not in survivor.affected_entities:
            survivor.affected_entities.append(ent)


def _dedup_items(items: list[FeedItem]) -> list[FeedItem]:
    """
    Consolidate near-duplicate headlines (OP1.2 merge-dedup).

    The dedup LAW is unchanged: two items are the same real-world event iff
    their title-Jaccard ≥ _DEDUP_THRESHOLD against the bucket anchor (the
    first-encountered, i.e. freshest, telling — anchors never move, so
    grouping is identical to the legacy delete path). What changed is what
    happens to duplicates: they FOLD into the surviving item as MergedSource
    provenance instead of being deleted, and the survivor is the best
    SOURCE-TIER telling (tie → freshest) rather than blindly the freshest —
    the tier-1 wire's text is the canonical one.

    settings.merge_dedup=False restores the legacy delete behavior verbatim
    (instant rollback, not a long-lived mode).
    """
    from app.config import settings
    if not settings.merge_dedup:
        return _dedup_items_legacy(items)

    survivors:    list[FeedItem]  = []
    anchor_words: list[set[str]]  = []
    for item in items:
        words = _title_words(item.title)
        matched = False
        for i, aw in enumerate(anchor_words):
            if _jaccard(words, aw) >= _DEDUP_THRESHOLD:
                incumbent = survivors[i]
                if _source_tier(item.source) < _source_tier(incumbent.source):
                    # better tier wins; incumbent (and its provenance) folds in
                    _fold_into(item, incumbent)
                    survivors[i] = item
                    log.debug("Dedup folded (survivor swap → %s): %.80s",
                              item.source, incumbent.title)
                else:
                    _fold_into(incumbent, item)
                    log.debug("Dedup folded into [%s]: %.80s",
                              incumbent.source, item.title)
                matched = True
                break
        if not matched:
            survivors.append(item)
            anchor_words.append(words)
    return survivors


def _dedup_items_legacy(items: list[FeedItem]) -> list[FeedItem]:
    """
    Pre-OP1.2 behavior: remove near-duplicate headlines outright (sorted
    newest-first, so the freshest survives and corroboration is destroyed).
    Kept verbatim as the merge_dedup=False rollback path.
    """
    kept: list[FeedItem]       = []
    kept_words: list[set[str]] = []
    for item in items:
        words = _title_words(item.title)
        if any(_jaccard(words, kw) >= _DEDUP_THRESHOLD for kw in kept_words):
            log.debug("Dedup dropped: %.80s", item.title)
            continue
        kept.append(item)
        kept_words.append(words)
    return kept


# ── FeedManager ───────────────────────────────────────────────────────────────

class FeedManager:
    """Fetches, scores, deduplicates, and sorts RSS feed items."""

    def __init__(self, ttl: int = _CACHE_TTL) -> None:
        self._ttl = ttl
        self._cache: dict[str, tuple[float, list[FeedItem]]] = {}
        self.fetch_errors:   dict[str, str] = {}  # source → error msg, cleared each call
        self.promo_excluded: int            = 0   # items hard-excluded per fetch_all call
        # OP1.1: first time this process observed each item URL. TTL re-fetches
        # create new FeedItem objects for the same URL; this map keeps
        # fetched_at stable at the first observation (process lifetime).
        self._first_fetch: dict[str, datetime] = {}
        # OP1.5: per-source funnel stats from the most recent fetch_all().
        self.last_source_stats: dict[str, PerSourceStats] = {}

    # ── Public ────────────────────────────────────────────────────────────────

    def fetch_all(
        self,
        registry: list[tuple[str, str, str]] | None = None,
        max_per_feed: int = _ITEMS_PER_FEED,
        force_refresh: bool = False,
        fresh_only: bool = False,
        max_age_hours: int = STALE_HOURS,
    ) -> list[FeedItem]:
        """
        Fetch all feeds in parallel, score, deduplicate, and sort newest-first.

        If fresh_only=True, items older than max_age_hours are excluded.
        Failed feeds fall back to stale cache silently; errors tracked in
        self.fetch_errors for optional UI display.
        """
        if registry is None:
            registry = FEED_REGISTRY

        self.fetch_errors.clear()

        # ── Parallel fetch ────────────────────────────────────────────────────
        raw_items: list[FeedItem] = []
        with ThreadPoolExecutor(max_workers=min(len(registry), _FETCH_WORKERS)) as pool:
            futures = {
                pool.submit(self._fetch_one, name, url, cat, max_per_feed, force_refresh): name
                for name, url, cat in registry
            }
            for future in as_completed(futures):
                name = futures[future]
                try:
                    raw_items.extend(future.result(timeout=_FETCH_TIMEOUT))
                except FutureTimeoutError:
                    self.fetch_errors[name] = f"timeout after {_FETCH_TIMEOUT}s"
                    log.debug("Feed timeout [%s] after %ds", name, _FETCH_TIMEOUT)
                except Exception as exc:
                    msg = str(exc)
                    self.fetch_errors[name] = msg
                    log.debug("Feed future failed [%s]: %s", name, msg)

        # ── SEC watchlist (curated 8-K material events) ───────────────────────
        # Fetched outside the RSS pool so item-level materiality filtering and
        # title rewriting can run. Items merge into the same scoring/dedup path.
        try:
            sec_items = self._fetch_sec_watchlist(force_refresh=force_refresh)
            raw_items.extend(sec_items)
            log.debug("SEC watchlist contributed %d material filings", len(sec_items))
        except Exception as exc:
            self.fetch_errors["SEC Filings"] = str(exc)
            log.debug("SEC watchlist fetch failed: %s", exc)

        # ── First-observation stamp (OP1.1) ───────────────────────────────────
        # Stable per URL for the process lifetime; items returned from the
        # per-feed cache keep the fetched_at their object was created with.
        _now_utc = datetime.now(timezone.utc)
        if len(self._first_fetch) > 20_000:   # bound process-lifetime growth
            pruned = sorted(self._first_fetch.items(), key=lambda kv: kv[1])[10_000:]
            self._first_fetch = dict(pruned)
        for i in raw_items:
            if i.fetched_at is None:
                i.fetched_at = self._first_fetch.setdefault(i.url, _now_utc)

        # ── Per-source funnel stats (OP1.5): raw counts before any filtering ──
        stats: dict[str, PerSourceStats] = {}
        for i in raw_items:
            s = stats.setdefault(i.source, PerSourceStats(source=i.source))
            s.raw_fetched += 1
        for name, msg in self.fetch_errors.items():
            stats.setdefault(name, PerSourceStats(source=name)).error = msg

        # ── Sort newest-first ─────────────────────────────────────────────────
        _epoch = datetime.min.replace(tzinfo=timezone.utc)
        raw_items.sort(key=lambda i: i.published_dt or _epoch, reverse=True)

        # ── Staleness filter ──────────────────────────────────────────────────
        if fresh_only and max_age_hours > 0:
            cutoff    = datetime.now(timezone.utc) - timedelta(hours=max_age_hours)
            raw_items = [i for i in raw_items if i.published_dt and i.published_dt >= cutoff]

        # ── Deduplicate ───────────────────────────────────────────────────────
        _pre_dedup_n = len(raw_items)
        items = _dedup_items(raw_items)
        _dedup_removed = _pre_dedup_n - len(items)
        for i in items:
            stats.setdefault(i.source, PerSourceStats(source=i.source)).post_dedup += 1

        # ── Score, reclassify, and filter ─────────────────────────────────────
        self.promo_excluded = 0
        scored: list[FeedItem] = []
        for item in items:
            item.signal_score = score_item(item)
            is_hard_promo = bool(_HARD_EXCLUDE_RE.search(item.title))
            min_s = _MIN_SCORE_PRESS_RELEASE if item.source in _PRESS_RELEASE_SOURCES else _MIN_SCORE_DEFAULT
            if item.signal_score >= min_s:
                # Override source-assigned category with content-derived one.
                # Done after score_item() so scoring still uses source tier;
                # the reclassified category is purely for display and slot selection.
                item.category          = _reclassify_category(item)
                item.signal_strength   = _compute_signal_strength(item)
                item.affected_entities = _extract_entities(item)
                scored.append(item)
            else:
                if is_hard_promo:
                    self.promo_excluded += 1
                s = stats.setdefault(item.source, PerSourceStats(source=item.source))
                if is_hard_promo:
                    s.hard_excluded += 1
                else:
                    s.below_threshold += 1
                if len(s.dropped_titles) < 5:
                    s.dropped_titles.append(item.title)
                log.debug("Signal filter dropped [%.1f]%s: %.80s",
                          item.signal_score,
                          " [PROMO]" if is_hard_promo else "",
                          item.title)

        # Re-sort within same-recency bucket: signal_strength tier first, then
        # composite quality score (institutional_score weighted 45%, signal_score 55%).
        # This ensures Bloomberg macro stories rank above Yahoo Finance personal
        # finance items even when raw recency is similar.
        # graph_alignment_score is 0.0 here (set later in background.py after the
        # narrative graph is built); the final re-sort in background.py uses the full
        # three-component composite.
        _STRENGTH_RANK = {"strong": 0, "medium": 1, "weak": 2}
        scored.sort(key=lambda i: (
            -(i.published_dt or _epoch).timestamp() // 3600,   # bucket by hour
            _STRENGTH_RANK.get(i.signal_strength, 1),          # within hour: strong → medium → weak
            -(i.institutional_score * 0.45 + i.signal_score * 0.55),  # quality composite
        ))

        # ── Source-diversity cap ──────────────────────────────────────────────
        # Stop low-authority publishers from padding the feed: keep only each
        # source's best N items (N by tier — flagship/primary effectively
        # uncapped, aggregators hard-capped). Walks best-first, so the items kept
        # per source are its highest-quality ones. Composition control, not scoring.
        capped: list[FeedItem] = []
        per_source: dict[str, int] = {}
        dropped_by_cap = 0
        for i in scored:
            n = per_source.get(i.source, 0)
            if n >= _per_source_cap(i.source):
                dropped_by_cap += 1
                continue
            per_source[i.source] = n + 1
            capped.append(i)
        if dropped_by_cap:
            log.info(
                "[feed] source-diversity cap dropped %d item(s); kept %d across %d sources",
                dropped_by_cap, len(capped), len(per_source),
            )
        scored = capped

        # ── Funnel stats + per-cycle funnel line (OP1.5) ──────────────────────
        # Observation only — populates the audit dataclass this module has
        # promised since it was written, and one INFO line per fetch so the
        # ingestion funnel is measurable without DEBUG logs.
        for i in scored:
            s = stats.setdefault(i.source, PerSourceStats(source=i.source))
            s.kept += 1
            s.by_category[i.category] = s.by_category.get(i.category, 0) + 1
            if len(s.kept_titles) < 5:
                s.kept_titles.append(i.title)
        self.last_source_stats = stats
        _raw_total = sum(s.raw_fetched for s in stats.values())
        log.info(
            "[feed] funnel: %d raw → %d post-dedup (%d duplicates consolidated) → %d kept "
            "(%d hard-excluded, %d below threshold, %d capped) across %d sources",
            _raw_total, _pre_dedup_n - _dedup_removed, _dedup_removed, len(scored),
            sum(s.hard_excluded for s in stats.values()),
            sum(s.below_threshold for s in stats.values()),
            dropped_by_cap, len(per_source),
        )

        return scored

    def clear_cache(self) -> None:
        self._cache.clear()

    # ── SEC watchlist ───────────────────────────────────────────────────────────

    def _fetch_sec_watchlist(self, force_refresh: bool = False) -> list[FeedItem]:
        """
        Pull each watchlist issuer's 8-K stream from EDGAR and return material
        filings as FeedItems (source="SEC Filings"). Only 8-Ks carrying a material
        item (see _SEC_MATERIAL_8K_ITEMS) are kept; titles are rewritten to a
        readable "TICKER 8-K — <event>" form. Per-CIK responses are cached like
        any other feed (keyed by the EDGAR URL); failures fall back to stale cache.
        """
        import feedparser
        out: list[FeedItem] = []
        for ticker, cik in _SEC_WATCHLIST.items():
            url = _SEC_8K_ATOM_URL.format(cik=cik)
            now = time.time()
            if not force_refresh and url in self._cache:
                ts, cached = self._cache[url]
                if now - ts < self._ttl:
                    out.extend(cached)
                    continue
            try:
                feed = feedparser.parse(url, request_headers={"User-Agent": _SEC_UA})
                items: list[FeedItem] = []
                for entry in feed.entries:
                    summary = str(entry.get("summary", "") or "")
                    parsed  = _SEC_ITEM_RE.findall(summary)
                    material = [
                        (code, desc.strip())
                        for code, desc in parsed
                        if code in _SEC_MATERIAL_8K_ITEMS
                    ]
                    if not material:
                        continue   # routine filing (vote results, exhibits-only, etc.)

                    lead_code, lead_desc = material[0]
                    event   = lead_desc if len(lead_desc) >= 5 else _SEC_MATERIAL_8K_ITEMS[lead_code]
                    pub_dt  = _parse_published_dt(entry)
                    snippet = (
                        f"SEC 8-K filing by {ticker}: "
                        + "; ".join(f"Item {c} {_SEC_MATERIAL_8K_ITEMS[c]}" for c, _ in material[:3])
                    )
                    items.append(FeedItem(
                        title             = f"{ticker} 8-K — {event}",
                        url               = entry.get("link", ""),
                        source            = "SEC Filings",
                        category          = "Company",
                        published_dt      = pub_dt,
                        published         = format_age(pub_dt),
                        snippet           = snippet[:_MAX_SNIPPET],
                        affected_entities = [ticker],
                    ))
                    if len(items) >= _SEC_MAX_PER_CO:
                        break
                self._cache[url] = (now, items)
                out.extend(items)
                log.debug("SEC watchlist [%s]: %d material 8-K(s)", ticker, len(items))
            except Exception as exc:
                self.fetch_errors[f"SEC:{ticker}"] = str(exc)
                if url in self._cache:
                    out.extend(self._cache[url][1])
        return out

    # ── Internal ──────────────────────────────────────────────────────────────

    def _fetch_one(
        self,
        name: str,
        url: str,
        category: str,
        max_items: int,
        force_refresh: bool,
    ) -> list[FeedItem]:
        now = time.time()

        if not force_refresh and url in self._cache:
            ts, cached = self._cache[url]
            if now - ts < self._ttl:
                return cached

        try:
            import feedparser
            feed = feedparser.parse(url, request_headers={"User-Agent": "Argus-AI/1.0"})

            if feed.get("bozo") and not feed.entries:
                raise ValueError(f"Malformed feed ({feed.get('bozo_exception', '?')})")

            items: list[FeedItem] = []
            for entry in feed.entries[:max_items]:
                raw_snip = entry.get("summary", "") or entry.get("description", "") or ""
                snippet  = _HTML_TAG_RE.sub("", raw_snip).strip()[:_MAX_SNIPPET]
                pub_dt   = _parse_published_dt(entry)

                items.append(FeedItem(
                    title        = (entry.get("title", "") or "").strip() or "No title",
                    url          = entry.get("link", ""),
                    source       = name,
                    category     = category,
                    published_dt = pub_dt,
                    published    = format_age(pub_dt),
                    snippet      = snippet,
                ))

            self._cache[url] = (now, items)
            log.debug("Fetched %d items from %s", len(items), name)
            return items

        except Exception as exc:
            msg = str(exc)
            self.fetch_errors[name] = msg
            log.debug("Feed fetch failed [%s]: %s", name, msg)  # DEBUG not WARNING
            if url in self._cache:
                _, stale = self._cache[url]
                log.debug("Returning stale cache for %s (%d items)", name, len(stale))
                return stale
            return []


# Module-level singleton
feed_manager = FeedManager()


def category_breakdown(items: list[FeedItem]) -> dict[str, int]:
    """Return a count of items per category, sorted descending."""
    counts: dict[str, int] = {}
    for item in items:
        counts[item.category] = counts.get(item.category, 0) + 1
    return dict(sorted(counts.items(), key=lambda kv: kv[1], reverse=True))


def source_breakdown(items: list[FeedItem]) -> dict[str, dict[str, int]]:
    """
    Return per-source item counts broken down by final (reclassified) category.

    Example:
        {
            "Reuters M&A":      {"M&A": 6, "Company": 2},
            "Reuters Business": {"Company": 4, "Markets": 3, "M&A": 1},
        }
    Sorted alphabetically by source name.
    """
    result: dict[str, dict[str, int]] = {}
    for item in items:
        src = item.source
        cat = item.category
        if src not in result:
            result[src] = {}
        result[src][cat] = result[src].get(cat, 0) + 1
    return dict(sorted(result.items()))
