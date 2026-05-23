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
import logging
import re
import time
from concurrent.futures import ThreadPoolExecutor, as_completed, TimeoutError as FutureTimeoutError
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone

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
# Extracts up to 4 entities per item: $tickers first, bare all-caps tickers
# second, sector keywords as fallback.

_NON_TICKER_ACRONYMS: frozenset[str] = frozenset({
    # Geopolitical / org
    "AI", "US", "UK", "EU", "UN", "UAE", "KSA", "G7", "G20",
    "NATO", "OPEC", "ASEAN", "BRICS", "OECD", "WHO", "WTO",
    "IRAN", "CHINA", "INDIA", "RUSSIA",
    # Regulatory / financial institutions
    "FED", "SEC", "FTC", "DOJ", "IRS", "IMF", "ECB", "BOE", "BOJ", "RBA", "SNB", "BIS", "IEA",
    # C-suite / roles
    "CEO", "CFO", "COO", "CTO", "MD",
    # Corporate suffixes
    "LLC", "INC", "LTD", "PLC", "LP", "GP",
    # Finance acronyms
    "IPO", "PE", "VC", "ETF", "VIX", "SPV", "CDO", "CLO", "ABS",
    "LBO", "MBO", "EPS", "FCF", "ROI", "ROE",
    "YOY", "QOQ", "YTD", "FY", "H1", "H2",
    "Q1", "Q2", "Q3", "Q4",
    # News outlets
    "WSJ", "FT", "NYT", "BBC", "CNN", "AP", "IT",
    # Misc
    "OK", "RE", "BB", "AM", "PM", "ET", "PT", "ESG",
})

_BARE_TICKER_ENTITY_RE = re.compile(r'\b[A-Z]{2,5}\b')

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

    Priority: explicit $TICKER > bare all-caps in title > sector keyword.
    At most 1 sector label is appended (prevents noisy generic tags).
    """
    entities: list[str] = []
    seen:     set[str]  = set()

    def _add(name: str) -> None:
        if name not in seen and len(entities) < 4:
            seen.add(name)
            entities.append(name)

    text = item.title + " " + item.snippet

    # 1. Explicit $TICKER — highest precision
    for m in _TICKER_RE.finditer(text):
        _add(m.group(0)[1:])   # strip leading $

    # 2. Bare all-caps tokens in title (2–5 chars) that aren't known acronyms
    if len(entities) < 3:
        for tok in _BARE_TICKER_ENTITY_RE.findall(item.title):
            if tok not in _NON_TICKER_ACRONYMS:
                _add(tok)

    # 3. Sector keyword — at most one, only when space remains
    if len(entities) < 4:
        for pattern, sector in _SECTOR_ENTITY_MAP:
            if pattern.search(text):
                _add(sector)
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
    summary:               str        = ""        # AI: what happened
    why_it_matters:        str        = ""        # AI: investor implication
    impact:                str        = ""        # AI: directional market impact label
    # Quality scoring debug fields (set by score_item)
    source_quality_score:   float     = 0.0  # normalized source tier 0–100
    consumer_noise_penalty: float     = 0.0  # penalty applied for consumer framing
    institutional_score:    float     = 0.0  # composite institutional quality 0–120


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
]

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
_SOURCE_TIERS: dict[str, float] = {
    "Bloomberg Markets": 50,   # Bloomberg flagship — hard market/macro news
    "FT Deals":          48,   # FT M&A desk — pure deal journalism
    "FT Companies":      47,   # FT company desk — earnings, guidance, CEO/CFO
    "NYT DealBook":      44,   # strong deal journalism; reclassified by content
    "MarketWatch":       42,
    "CNBC Economy":      40,
    "BBC World":         40,   # authoritative international; geo/sanctions/trade
    "CNBC Companies":    38,   # earnings, guidance, exec changes
    "PE Hub":            36,   # PE deal flow — acquisitions, LBOs, growth investments
    "PE Wire":           34,   # PE industry news — fund closes, portfolio M&A
    "Yahoo Finance":     32,
    "Politico":          30,   # US policy and regulatory
    # Dead / replaced sources — kept so any stale-cache items still score correctly
    "WSJ Markets":       50,
    "AP Business":       44,
    "AP World":          43,
    "Benzinga":          36,
    "GlobeNewswire M&A": 14,
    "Reuters M&A":       48,
    "Reuters Business":  46,
    "Reuters World":     45,
    "Business Wire M&A": 14,
    "PR Newswire M&A":   12,
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

# Normalized source quality ceiling (0–100 scale, derived from _SOURCE_TIERS / 50 * 100)
# Used for institutional_score computation and Today's Take candidate filtering.
def _source_quality(source: str) -> float:
    """Return source quality 0–100 (scaled from source tier 0–50)."""
    return min(100.0, _SOURCE_TIERS.get(source, 20) * 2.0)


def score_item(item: "FeedItem") -> float:
    """
    Score a FeedItem for signal quality on a 0–100 scale.
    Also sets item.source_quality_score, item.consumer_noise_penalty,
    and item.institutional_score as debug/ranking fields.

    Components:
      Source tier   : 0–50  (editorial quality of the source)
      Keywords      : 0–40  (finance relevance of title + snippet)
      Recency       : 0–20  (linear decay over 48h)
      Ticker bonus  : +8    (explicit stock ticker in title)
      Noise penalty : −75   (PR boilerplate, hard exclusions)
      Consumer soft : −30   (consumer/personal finance framing — soft penalty)
    """
    text = (item.title + " " + item.snippet).lower()

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
        age_h       = max(0.0, (datetime.now(timezone.utc) - item.published_dt).total_seconds() / 3600)
        rec_score   = max(0.0, 20.0 * (1 - age_h / STALE_HOURS))
    else:
        rec_score   = 0.0

    # 4. Hard exclusions — newsletter CTAs, podcast promos, etc.
    if _HARD_EXCLUDE_RE.search(item.title):
        item.source_quality_score    = 0.0
        item.consumer_noise_penalty  = 0.0
        item.institutional_score     = 0.0
        return 0.0

    # 5. Noise penalty (raised to 75 so that even high-tier editorial sources
    #    cannot rescue a noisy/commentary title above the minimum threshold)
    noise = 75.0 if _NOISE_RE.search(item.title) else 0.0

    # 6. Consumer soft penalty — down-ranks consumer/personal-finance content
    #    without fully excluding it.  Applied after hard noise so a listicle
    #    ("10 Medicare Tips to Save Money") already hit by _NOISE_RE isn't
    #    double-counted.
    consumer_penalty = 0.0
    if noise == 0.0 and _CONSUMER_SOFT_RE.search(item.title + " " + item.snippet):
        consumer_penalty = 30.0

    # 7. Ticker bonus — a stock ticker in the title is an unambiguous single-
    #    company signal that improves relevance for company-news scoring.
    ticker_bonus = 8.0 if _TICKER_RE.search(item.title) else 0.0

    # 8. Institutional boost — explicit market-structure signals not covered by
    #    keyword matching (capex cycles, credit spreads, IPO windows, etc.)
    inst_boost = 8.0 if _INSTITUTIONAL_BOOST_RE.search(item.title + " " + item.snippet) else 0.0

    signal = max(0.0, min(100.0,
        src_score + kw_score + rec_score + ticker_bonus + inst_boost
        - noise - consumer_penalty
    ))

    # ── Set debug/ranking fields on the item ──────────────────────────────────
    src_quality = _source_quality(item.source)
    # institutional_score: source quality + keyword strength − consumer penalty
    # Used by downstream selectors (Today's Take, WMN) to prefer market-moving
    # institutional content over consumer finance from the same source pool.
    inst_score = max(0.0, src_quality + min(kw_score * 0.5, 20.0) + inst_boost - consumer_penalty)
    item.source_quality_score   = round(src_quality, 1)
    item.consumer_noise_penalty = round(consumer_penalty, 1)
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


def _dedup_items(items: list[FeedItem]) -> list[FeedItem]:
    """
    Remove near-duplicate headlines (sorted newest-first, so we keep freshest).
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

        # ── Sort newest-first ─────────────────────────────────────────────────
        _epoch = datetime.min.replace(tzinfo=timezone.utc)
        raw_items.sort(key=lambda i: i.published_dt or _epoch, reverse=True)

        # ── Staleness filter ──────────────────────────────────────────────────
        if fresh_only and max_age_hours > 0:
            cutoff    = datetime.now(timezone.utc) - timedelta(hours=max_age_hours)
            raw_items = [i for i in raw_items if i.published_dt and i.published_dt >= cutoff]

        # ── Deduplicate ───────────────────────────────────────────────────────
        items = _dedup_items(raw_items)

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
                log.debug("Signal filter dropped [%.1f]%s: %.80s",
                          item.signal_score,
                          " [PROMO]" if is_hard_promo else "",
                          item.title)

        # Re-sort within same-recency bucket: signal_strength tier first, then score.
        # Mapping: strong=0, medium=1, weak=2 so lower = earlier in list.
        _STRENGTH_RANK = {"strong": 0, "medium": 1, "weak": 2}
        scored.sort(key=lambda i: (
            -(i.published_dt or _epoch).timestamp() // 3600,   # bucket by hour
            _STRENGTH_RANK.get(i.signal_strength, 1),          # within hour: strong → medium → weak
            -i.signal_score,                                    # within tier: highest score first
        ))

        return scored

    def clear_cache(self) -> None:
        self._cache.clear()

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
