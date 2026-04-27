"""
app/top_stories.py — Top-story selection logic (backend-safe, no UI imports).

Extracted from ui/market_feed.py so that the API and background pipeline can
import this without pulling in Gradio / Hugging Face / numpy at startup.
"""

from __future__ import annotations

import re
from datetime import datetime, timezone
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from app.feeds import FeedItem

# ── Keyword sets ──────────────────────────────────────────────────────────────

_MACRO_KW = frozenset({"fed", "federal reserve", "rate", "inflation", "gdp", "recession",
                        "ecb", "central bank", "treasury", "yield", "macro"})

_STRICT_MACRO_KW: frozenset[str] = frozenset({
    "federal reserve", "fed funds", "rate cut", "rate hike", "interest rate",
    "rate decision", "fed decision", "fedspeak", "fed minutes", "fed pivot",
    "monetary policy", "fomc", "jerome powell", "fed chair", "fed meeting",
    "inflation", "cpi", "pce", "core inflation", "deflation", "disinflation",
    "consumer price", "producer price", "ppi",
    "gdp", "recession", "unemployment rate", "jobless", "jobs report",
    "nonfarm payroll", "payroll", "labor market", "labour market",
    "ecb", "bank of england", "bank of japan", "central bank", "boe", "boj",
    "rate decision",
    "treasury yield", "bond yield", "yield curve", "10-year yield",
    "fiscal policy", "federal deficit", "national debt", "debt ceiling",
    "tariff", "sanction",
})

_MOVE_KW = frozenset({"surge", "soar", "plunge", "crash", "rally", "drop", "fall",
                       "tumble", "spike", "dive", "climb", "slump"})

_DEAL_KW = frozenset({"acqui", "merger", "buyout", "takeover", "deal", "lbo", "acquire"})

_COMPANY_KW = frozenset({
    "earning", "earnings", "revenue", "profit", "loss", "margin",
    "guidance", "outlook", "forecast", "beat", "miss",
    "eps", "ebitda", "free cash flow",
    "spin-off", "spinoff", "divestiture", "ipo", "listing",
    "layoff", "layoffs", "restructur", "headcount",
    "ceo", "cfo", "chief executive",
    "share buyback", "buyback", "dividend",
    "analyst", "downgrade", "upgrade", "price target",
})

_STRONG_DEAL_KW = frozenset({"acqui", "merger", "buyout", "takeover", "lbo"})

_PR_NEWSWIRE_SOURCE = "PR Newswire M&A"

_DEAL_MAX_AGE_HOURS      = 72
_DEAL_PREFER_AGE_HOURS   = 36
_SINGLE_MAX_AGE_HOURS    = 48
_SINGLE_PREFER_AGE_HOURS = 36

_MIN_TOP_STORIES_SCORE = 40

_TS_EXCLUDE_RE = re.compile(
    r"(?:"
    r"(?:car|auto|home(?:owner)?s?|life|health|pet|renters?|umbrella)\s+insurance\b"
    r"|\bhow\s+to\b"
    r"|\b(?:best|top)\s+(?:\d+\s+)?(?:states?|places?|cities|towns?|ways?\s+to|"
    r"credit\s+cards?|savings?\s+accounts?|checking\s+accounts?|brokerages?)\b"
    r"|\bsave\s+(?:more\s+)?money\b"
    r"|\bbudgeting\b"
    r"|\bcost\s+of\s+living\b"
    r"|\bpersonal\s+finance\b"
    r"|\bfinancial\s+(?:advice|planning|wellness|literacy)\b"
    r"|\bcar\s+(?:loan|payment|buying|leasing)\b"
    r"|\bmortgage\s+(?:tip|advice|application)\b"
    r"|\bmortgage\s+rates?\s+(?:today|this\s+week|fall|rise|drop|climb|tick|edge|ease|jump|dip)\b"
    r"|\bsavings\s+account\s+(?:rates?|apy|interest|tips?|comparison|guide|option|open)\b"
    r"|\bhigh.yield\s+savings\b"
    r"|\bcredit\s+card\s+(?:rates?|interest|apr\b|tips?|comparison|rewards?|cash\s+back|sign.?up)\b"
    r"|\b401\s*[(\s]?\s*k\b.{0,60}(?:rollover|roll\s+over|withdrawal|contribut|tips?|advice|limit|should)"
    r"|\bira\s+(?:rollover|roll\s+over|contribut|limit|tips?|vs\.?\s)"
    r"|\brollover\s+(?:your\s+)?(?:401|ira|pension|retirement)\b"
    r"|\bshould\s+(?:you|i)\b.{0,30}(?:roll\s+over|rollover|401|ira|retire)\b"
    r"|\bretirement\s+(?:account|savings?|fund)\s+(?:tips?|advice|guide|mistake|should)\b"
    r"|\bretirees?\s+(?:can|should|may|might|need|want|could|are|who|face)\b"
    r"|\bworried\s+about\s+(?:inflation|rates?|the\s+(?:economy|market|fed))\b"
    r"|\bshould\s+i\b"
    r"|\bhow\s+do\s+i\b"
    r"|\bwhat\s+should\s+i\b"
    r"|\bcan\s+i\s+trust\b"
    r"|\bscam\b"
    r"|\bmy\s+(?:advisor|adviser|broker|accountant|financial\s+(?:advisor|adviser|planner))\b"
    r"|\bmy\s+friend\b"
    r"|\bshould\s+you\s+(?:invest|buy|sell|switch|open|trust|put|move|roll|use|hire)\b"
    r"|\bdo\s+you\s+need\s+a\b.{0,30}(?:advisor|adviser|broker|planner|accountant)\b"
    r"|\bis\s+it\s+worth\b"
    r"|\bwhat'?s?\s+the\s+best\s+(?:way\s+to|time\s+to|account|fund|broker|invest|buy|sell)\b"
    r"|^sign\s+up\b"
    r"|^subscribe\b"
    r"|\bsign\s+up\s+(?:for|to)\b"
    r"|\bweighing\s+the\b"
    r"|\bwhat\s+(?:this|it)\s+means\s+for\b"
    r"|\bmaking\s+sense\s+of\b"
    r"|\ba\s+(?:closer\s+)?look\s+at\b"
    r"|^(?:opinion|commentary|perspective|column)\s*:"
    r")",
    re.IGNORECASE,
)

_TS_RELEVANCE_KW: frozenset[str] = (
    _MACRO_KW
    | _MOVE_KW
    | _DEAL_KW
    | _COMPANY_KW
    | frozenset({
        "stock", "equit", "market", "bond", "oil", "commodit", "revenue",
        "gdp", "unemployment", "credit", "sanction", "tariff", "geopolit",
        "regulation", "regulatory", "crackdown", "enforcement",
        "legislation", "legislative", "antitrust", "investigation", "probe",
        "medicare", "medicaid", "executive order",
    })
)

_TS_MARKET_MOVE_KW: frozenset[str] = frozenset({
    "stock", "stocks", "share", "shares", "equit",
    "s&p", "nasdaq", "dow", "nikkei", "ftse", "russell", "index", "indices",
    "oil", "crude", "brent", "wti", "gold", "silver", "copper", "commodit",
    "treasury", "treasuries", "yield", "bond", "bonds", "note", "t-bill",
    "rally", "plunge", "selloff", "sell-off", "rout", "melt",
    "earning", "earnings", "guidance", "profit", "revenue",
    "sanction", "tariff",
})

_PRICE_MOVE_SUBJ_RE = re.compile(
    r"^(?:"
    r"stocks?\b|shares?\b|equit(?:y|ies)\b"
    r"|s&p\s*500|nasdaq|dow\s+jones|stock\s+market|equity\s+markets?"
    r"|u\.?s\.?\s+stocks?|global\s+stocks?|asian\s+stocks?|european\s+stocks?"
    r"|oil\b|brent|wti|crude\s+oil|crude\s+prices?|oil\s+prices?|oil\s+futures?"
    r"|bonds?\b|treasuries\b|treasury\s+yields?|bond\s+yields?"
    r"|10.year\s+(?:yield|note)|yield\s+curve"
    r"|gold\b|silver\b|copper\b"
    r"|gold\s+prices?|gold\s+futures?|copper\s+prices?|silver\s+prices?"
    r"|dollar\b|euro\b|yen\b|pound\b|currency|currencies"
    r"|bitcoin|crypto(?:currency|currencies)?"
    r"|markets?\s+(?:fall|rise|drop|rally|plunge|surge|slip|tick|dip|jump|tumble|rebound)\b"
    r")",
    re.IGNORECASE,
)

_POLICY_RISK_KW: frozenset[str] = frozenset({
    "crackdown", "enforcement", "antitrust", "monopoly",
    "investigation", "probe",
    "regulation", "regulatory", "deregulation",
    "ftc", "fda", "doj", "cfpb", "cftc",
    "legislation", "legislative",
    "executive order", "white house",
    "congress", "senate", "parliament",
    "tax holiday", "gas tax", "carbon tax", "tax break",
    "tariff", "sanction",
    "medicare", "medicaid",
    "drug pricing", "drug price",
    "energy policy", "climate policy",
    "geopolit", "escalation",
})


# ── Helpers ───────────────────────────────────────────────────────────────────

def _age_hours(i: "FeedItem") -> float:
    """Hours since publication; items with no timestamp are treated as 24h old."""
    if not i.published_dt:
        return 24.0
    return max(0.0, (datetime.now(timezone.utc) - i.published_dt).total_seconds() / 3600)


def _item_key(item: "FeedItem") -> str:
    """Stable string key for a FeedItem — used for deduplication."""
    return item.url.strip() if item.url and item.url.strip() else item.title.strip().lower()


# ── Public API ────────────────────────────────────────────────────────────────

def _select_top_stories(
    items:     list["FeedItem"],
    debug_log: list[str] | None = None,
) -> "dict[str, FeedItem | None]":
    """
    Pick the best representative for each of five editorially distinct story types.

    Slot semantics:
      Top Deal          — M&A activity (strong deal vocabulary required)
      Top Macro Story   — Central bank / rates / economic data
      Top Single Name   — Single-company catalyst (earnings, guidance, analyst
                          action, CEO/CFO, product).  Requires Company category
                          from content-derived reclassification.
      Top Price Move    — Price action where a tradeable instrument is the
                          grammatical subject of the headline (oil, stocks,
                          yields, FX, crypto).
      Top Policy / Risk — Regulation, legislation, crackdowns, sector policy,
                          sanctions, and geopolitical risk with market implications.

    Diversity enforcement (all slots):
      - Items sorted: summarised first → non-PR-Newswire → signal score desc.
      - Each item fills at most one slot (tracked via _item_key() strings).
      - Cross-slot Jaccard guard (threshold 0.28) prevents thematically
        redundant headlines from claiming two spotlight cards.

    Eligibility gate (applied before slot selection AND all fallbacks):
      - signal_score >= _MIN_TOP_STORIES_SCORE (40)
      - Title+snippet contains at least one keyword from _TS_RELEVANCE_KW
      - Title+snippet does NOT match _TS_EXCLUDE_RE

    Debug: pass a list to debug_log to receive per-candidate decision records.
    Each line: "[SlotName] ACCEPT|REJECT|FALLBACK|EMPTY: 'title…' — reason"
    """
    from app.feeds import _title_words, _jaccard

    top: dict[str, "FeedItem | None"] = {
        "Top Deal":          None,
        "Top Macro Story":   None,
        "Top Single Name":   None,
        "Top Price Move":    None,
        "Top Policy / Risk": None,
    }

    def _text(i: "FeedItem") -> str:
        return (i.title + " " + i.snippet).lower()

    def _echoes_filled(candidate: "FeedItem") -> bool:
        w = _title_words(candidate.title)
        return any(
            _jaccard(w, _title_words(filled.title)) > 0.28
            for filled in top.values()
            if filled is not None
        )

    def _dbg(slot: str, item: "FeedItem", accepted: bool, reason: str) -> None:
        if debug_log is not None:
            status = "ACCEPT" if accepted else "REJECT"
            t = item.title[:58] + "…" if len(item.title) > 58 else item.title
            debug_log.append(f"[{slot}] {status}: \"{t}\" — {reason}")

    def _has_finance_kw(i: "FeedItem") -> bool:
        text = (i.title + " " + i.snippet).lower()
        return any(kw in text for kw in _TS_RELEVANCE_KW)

    def _ts_excluded(i: "FeedItem") -> bool:
        return bool(_TS_EXCLUDE_RE.search(i.title + " " + i.snippet))

    qualified = [
        i for i in items
        if i.signal_score >= _MIN_TOP_STORIES_SCORE
        and _has_finance_kw(i)
        and not _ts_excluded(i)
    ]

    ordered = sorted(qualified, key=lambda i: (
        0 if i.summary else 1,
        1 if i.source == _PR_NEWSWIRE_SOURCE else 0,
        min(2, int(_age_hours(i) / 24)),
        -i.signal_score,
    ))

    for item in ordered:
        txt          = _text(item)
        key          = _item_key(item)
        claimed_keys = {_item_key(v) for v in top.values() if v is not None}

        # ── Top Deal ──────────────────────────────────────────────────────────
        if top["Top Deal"] is None:
            age = _age_hours(item)
            if item.category != "M&A":
                _dbg("Top Deal", item, False, f"category={item.category}, not M&A")
            elif not any(k in txt for k in _STRONG_DEAL_KW):
                _dbg("Top Deal", item, False, "no strong deal kw (merger/buyout/acqui/takeover/lbo)")
            elif age > _DEAL_MAX_AGE_HOURS:
                _dbg("Top Deal", item, False,
                     f"stale: {age:.0f}h old (hard cap {_DEAL_MAX_AGE_HOURS}h)")
            elif _echoes_filled(item):
                _dbg("Top Deal", item, False, "echoes filled slot (Jaccard > 0.28)")
            else:
                freshness = f"fresh ({age:.0f}h)" if age <= _DEAL_PREFER_AGE_HOURS else f"{age:.0f}h old"
                _dbg("Top Deal", item, True, f"M&A category + strong deal keyword — {freshness}")
                top["Top Deal"] = item
                claimed_keys.add(key)

        # ── Top Macro Story ───────────────────────────────────────────────────
        if top["Top Macro Story"] is None and key not in claimed_keys:
            if item.category != "Markets":
                _dbg("Top Macro Story", item, False, f"category={item.category}, not Markets")
            elif not any(k in txt for k in _STRICT_MACRO_KW):
                _dbg("Top Macro Story", item, False,
                     "no strict macro kw (Fed/rate-cut/CPI/GDP/unemployment/FOMC)")
            elif _echoes_filled(item):
                _dbg("Top Macro Story", item, False, "echoes filled slot")
            else:
                kw = next(k for k in _STRICT_MACRO_KW if k in txt)
                _dbg("Top Macro Story", item, True, f"Markets + strict macro kw: '{kw}'")
                top["Top Macro Story"] = item
                claimed_keys.add(key)

        # ── Top Single Name ───────────────────────────────────────────────────
        if top["Top Single Name"] is None and key not in claimed_keys:
            if item.category != "Company":
                _dbg("Top Single Name", item, False,
                     f"category={item.category}, requires Company (earnings/guidance/CEO/analyst)")
            elif _echoes_filled(item):
                _dbg("Top Single Name", item, False, "echoes filled slot")
            else:
                _dbg("Top Single Name", item, True, "Company category — single-company catalyst")
                top["Top Single Name"] = item

        # ── Top Price Move ────────────────────────────────────────────────────
        if top["Top Price Move"] is None and key not in claimed_keys:
            if not _PRICE_MOVE_SUBJ_RE.search(item.title):
                _dbg("Top Price Move", item, False,
                     "title does not open with tradeable instrument (oil/stocks/yields/FX/crypto)")
            elif _echoes_filled(item):
                _dbg("Top Price Move", item, False, "echoes filled slot")
            else:
                _dbg("Top Price Move", item, True, "price-action subject in title")
                top["Top Price Move"] = item

        # ── Top Policy / Risk ─────────────────────────────────────────────────
        if top["Top Policy / Risk"] is None and key not in claimed_keys:
            is_geo       = item.category == "Geopolitical"
            policy_match = next((k for k in _POLICY_RISK_KW if k in txt), None)
            if item.category in ("M&A", "Company"):
                _dbg("Top Policy / Risk", item, False,
                     f"category={item.category}, excluded from policy/geo slot")
            elif not (is_geo or policy_match):
                _dbg("Top Policy / Risk", item, False,
                     f"category={item.category}, no policy/geo keyword")
            elif _echoes_filled(item):
                _dbg("Top Policy / Risk", item, False, "echoes filled slot")
            else:
                reason = ("Geopolitical category" if is_geo
                          else f"policy kw: '{policy_match}'")
                _dbg("Top Policy / Risk", item, True, reason)
                top["Top Policy / Risk"] = item

        if all(v is not None for v in top.values()):
            break

    # ── Fallbacks ─────────────────────────────────────────────────────────────

    def _fb(slot: str, winner: "FeedItem | None") -> None:
        if debug_log is None:
            return
        if winner:
            t = winner.title[:58] + "…" if len(winner.title) > 58 else winner.title
            debug_log.append(f"[{slot}] FALLBACK: \"{t}\"")
        else:
            debug_log.append(f"[{slot}] EMPTY — no qualifying item found")

    if top["Top Deal"] is None:
        fk = {_item_key(v) for v in top.values() if v is not None}
        top["Top Deal"] = (
            next((i for i in qualified
                  if i.category == "M&A" and _item_key(i) not in fk
                  and i.source != _PR_NEWSWIRE_SOURCE
                  and _age_hours(i) <= _DEAL_PREFER_AGE_HOURS), None)
            or next((i for i in qualified
                     if i.category == "M&A" and _item_key(i) not in fk
                     and i.source != _PR_NEWSWIRE_SOURCE
                     and _age_hours(i) <= _DEAL_MAX_AGE_HOURS), None)
            or next((i for i in qualified
                     if i.category == "M&A" and _item_key(i) not in fk
                     and _age_hours(i) <= _DEAL_MAX_AGE_HOURS), None)
        )
        _fb("Top Deal", top["Top Deal"])

    if top["Top Macro Story"] is None:
        fk  = {_item_key(v) for v in top.values() if v is not None}
        _mt = lambda i: (i.title + " " + i.snippet).lower()
        top["Top Macro Story"] = (
            next((i for i in qualified
                  if i.category == "Markets" and _item_key(i) not in fk
                  and any(k in _mt(i) for k in _STRICT_MACRO_KW)
                  and i.source != _PR_NEWSWIRE_SOURCE), None)
            or next((i for i in qualified
                     if i.category == "Markets" and _item_key(i) not in fk
                     and any(k in _mt(i) for k in _STRICT_MACRO_KW)), None)
        )
        _fb("Top Macro Story", top["Top Macro Story"])

    if top["Top Single Name"] is None:
        fk = {_item_key(v) for v in top.values() if v is not None}
        top["Top Single Name"] = (
            next((i for i in qualified
                  if i.category == "Company" and _item_key(i) not in fk
                  and _age_hours(i) <= _SINGLE_PREFER_AGE_HOURS), None)
            or next((i for i in qualified
                     if i.category == "Company" and _item_key(i) not in fk
                     and _age_hours(i) <= _SINGLE_MAX_AGE_HOURS), None)
        )
        _fb("Top Single Name", top["Top Single Name"])

    if top["Top Price Move"] is None:
        fk  = {_item_key(v) for v in top.values() if v is not None}
        _pt = lambda i: (i.title + " " + i.snippet).lower()
        top["Top Price Move"] = (
            next((i for i in qualified
                  if _PRICE_MOVE_SUBJ_RE.search(i.title)
                  and _item_key(i) not in fk), None)
            or next((i for i in qualified
                     if i.category == "Markets"
                     and any(k in _pt(i) for k in _TS_MARKET_MOVE_KW)
                     and _item_key(i) not in fk
                     and i.source != _PR_NEWSWIRE_SOURCE), None)
        )
        _fb("Top Price Move", top["Top Price Move"])

    if top["Top Policy / Risk"] is None:
        fk  = {_item_key(v) for v in top.values() if v is not None}
        _pt = lambda i: (i.title + " " + i.snippet).lower()
        top["Top Policy / Risk"] = (
            next((i for i in qualified
                  if i.category == "Geopolitical" and _item_key(i) not in fk), None)
            or next((i for i in qualified
                     if i.category not in ("M&A", "Company")
                     and any(k in _pt(i) for k in _POLICY_RISK_KW)
                     and _item_key(i) not in fk), None)
        )
        _fb("Top Policy / Risk", top["Top Policy / Risk"])

    return top
