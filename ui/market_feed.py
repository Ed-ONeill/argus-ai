"""
ui/market_feed.py — Market Feed tab for Argus AI

Card layout (each story):
  ┌─ [Category]  Source  ·  2h ago  ──────────────────┐
  │  Headline (linked)                                  │
  │  WHAT HAPPENED   summary text                       │
  │  WHY IT MATTERS  why text          (blue border)    │
  │  IMPACT          Bullish for...    (coloured chip)  │
  └─────────────────────────────────────────────────────┘

Top Stories banner (if ≥ 1 category has items with summaries):
  Top Deal · Top Macro Story · Top Market Move

Three-phase generator refresh:
  1. Loading spinner (instant)
  2. Raw headlines (after parallel RSS fetch completes)
  3. Full summaries (after LLM batch finishes)

Failed sources shown as a quiet footer note, not terminal spam.
"""

from __future__ import annotations

import hashlib
import logging
import re
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterator

import gradio as gr

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.config     import settings
from app.feeds      import (
    FEED_REGISTRY, FeedItem, STALE_HOURS,
    feed_manager, format_age,
    _title_words, _jaccard,          # used for clustering & cross-slot dedup
)
from app.summarizer import (
    MAX_AI_ITEMS, summarize_items, summary_cache_size,
    generate_market_take,
)

log = logging.getLogger(__name__)

# ── Colour palette ────────────────────────────────────────────────────────────

_CAT_COLOURS = {
    "Markets":      "#1F3864",
    "M&A":          "#2d6a4f",
    "Geopolitical": "#7f4f24",
}

# Impact chip colours keyed by first word of the impact string
_IMPACT_COLOURS = {
    "bullish":  ("#d1fae5", "#065f46"),   # green bg, green text
    "bearish":  ("#fee2e2", "#991b1b"),   # red bg, red text
    "neutral":  ("#f3f4f6", "#4b5563"),   # grey
    "mixed":    ("#fef9c3", "#854d0e"),   # amber
    "negative": ("#fee2e2", "#991b1b"),
    "positive": ("#d1fae5", "#065f46"),
    "cautious": ("#fef9c3", "#854d0e"),
}


def _impact_colours(impact_text: str) -> tuple[str, str]:
    first = impact_text.strip().split()[0].lower().rstrip(".:") if impact_text.strip() else ""
    return _IMPACT_COLOURS.get(first, ("#f3f4f6", "#374151"))


# ── Card HTML ─────────────────────────────────────────────────────────────────

def _render_card(
    item: FeedItem,
    pending_ai: bool = False,
    cluster_size: int = 1,
    is_new: bool = False,
) -> str:
    cat_colour = _CAT_COLOURS.get(item.category, "#374151")
    is_saved   = item.url in _bookmark_store

    # ── Bookmark button ───────────────────────────────────────────────────────
    url_safe   = (item.url or "").replace("'", "%27")
    btn_id     = hashlib.md5(url_safe.encode("utf-8", errors="ignore")).hexdigest()[:8]
    save_icon  = "\u2605" if is_saved else "\u2606"   # ★ / ☆
    save_color = "#f59e0b" if is_saved else "#9ca3af"
    save_btn   = (
        f"<button id='abm-{btn_id}' data-url='{url_safe}' "
        f"data-saved='{'1' if is_saved else '0'}' "
        f"onclick='argusBookmark(this)' "
        f"style='background:none;border:none;cursor:pointer;color:{save_color};"
        f"font-size:15px;padding:0;line-height:1;margin-left:auto;flex-shrink:0'>"
        f"{save_icon}</button>"
    )

    # ── "New" badge ────────────────────────────────────────────────────────────
    new_badge = (
        "<span style='background:#dcfce7;color:#15803d;border-radius:8px;"
        "padding:1px 7px;font-size:9px;font-weight:800;letter-spacing:.6px;"
        "text-transform:uppercase'>New</span> "
        if is_new else ""
    )

    # ── Header row ────────────────────────────────────────────────────────────
    header = (
        f"<div style='display:flex;align-items:center;gap:10px;margin-bottom:8px'>"
        f"<span style='background:{cat_colour};color:#fff;border-radius:12px;"
        f"padding:2px 10px;font-size:11px;font-weight:700'>{item.category}</span>"
        f"{new_badge}"
        f"<span style='font-size:11px;color:#9ca3af'>{item.source}  ·  {item.published}</span>"
        f"{save_btn}"
        f"</div>"
    )

    # ── Headline ──────────────────────────────────────────────────────────────
    url     = item.url or "#"
    title   = (
        f"<a href='{url}' target='_blank' "
        f"style='font-size:15px;font-weight:600;color:#111827;text-decoration:none;"
        f"line-height:1.4;display:block;margin-bottom:10px'>"
        f"{item.title}</a>"
    )

    # ── Body sections ─────────────────────────────────────────────────────────
    body = ""

    if pending_ai and not item.summary:
        body = (
            "<p style='font-size:12px;color:#d1d5db;font-style:italic;margin:0 0 6px'>Summarizing…</p>"
        )
    elif item.summary:
        body += (
            f"<div style='margin-bottom:8px'>"
            f"<span style='font-size:10px;font-weight:700;color:#9ca3af;"
            f"text-transform:uppercase;letter-spacing:.7px;display:block;margin-bottom:3px'>"
            f"What happened</span>"
            f"<p style='font-size:13px;color:#374151;margin:0;line-height:1.55'>{item.summary}</p>"
            f"</div>"
        )
    elif item.snippet:
        body = (
            f"<p style='font-size:13px;color:#6b7280;margin:0 0 6px;line-height:1.5'>"
            f"{item.snippet[:200]}</p>"
        )

    # Why it matters
    if item.why_it_matters:
        body += (
            f"<div style='background:#f0f4ff;border-left:3px solid #1F3864;"
            f"border-radius:0 6px 6px 0;padding:7px 10px;margin-bottom:8px'>"
            f"<span style='font-size:10px;font-weight:700;color:#1F3864;"
            f"text-transform:uppercase;letter-spacing:.7px;display:block;margin-bottom:2px'>"
            f"Why it matters</span>"
            f"<p style='font-size:12px;color:#374151;margin:0;line-height:1.5'>{item.why_it_matters}</p>"
            f"</div>"
        )

    # Impact chip
    if item.impact:
        bg, fg = _impact_colours(item.impact)
        body += (
            f"<span style='display:inline-block;background:{bg};color:{fg};"
            f"border-radius:20px;padding:3px 12px;font-size:11px;font-weight:600'>"
            f"{item.impact}</span>"
        )

    # Cluster badge — show if other related stories were grouped behind this one
    if cluster_size > 1:
        n = cluster_size - 1
        label = "story" if n == 1 else "stories"
        body += (
            f"<div style='margin-top:8px'>"
            f"<span style='font-size:10px;color:#6b7280;background:#f3f4f6;"
            f"border-radius:10px;padding:2px 10px;border:1px solid #e5e7eb'>"
            f"+ {n} related {label}</span>"
            f"</div>"
        )

    return (
        f"<div style='border:1px solid #e5e7eb;border-radius:10px;padding:14px 18px;"
        f"margin-bottom:12px;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.05)'>"
        f"{header}{title}{body}"
        f"</div>"
    )


# ── Top Stories banner ────────────────────────────────────────────────────────

_MACRO_KW   = frozenset({"fed", "federal reserve", "rate", "inflation", "gdp", "recession",
                          "ecb", "central bank", "treasury", "yield", "macro"})

# Stricter macro vocabulary for the Top Macro Story slot only.
# Excludes ambiguous single tokens ("rate", "yield") that appear in consumer
# articles ("car loan rates", "dividend yield") and requires terms that are
# unambiguously institutional / policy-driven.
_STRICT_MACRO_KW: frozenset[str] = frozenset({
    # Federal Reserve — policy signals and communications
    "federal reserve", "fed funds", "rate cut", "rate hike", "interest rate",
    "rate decision", "fed decision", "fedspeak", "fed minutes", "fed pivot",
    "monetary policy", "fomc", "jerome powell", "fed chair", "fed meeting",
    # Inflation data
    "inflation", "cpi", "pce", "core inflation", "deflation", "disinflation",
    "consumer price", "producer price", "ppi",
    # Growth / labour
    "gdp", "recession", "unemployment rate", "jobless", "jobs report",
    "nonfarm payroll", "payroll", "labor market", "labour market",
    # Other major central banks
    "ecb", "bank of england", "bank of japan", "central bank", "boe", "boj",
    "rate decision",
    # Rates / bond markets
    "treasury yield", "bond yield", "yield curve", "10-year yield",
    # Fiscal / macro policy levers
    "fiscal policy", "federal deficit", "national debt", "debt ceiling",
    "tariff", "sanction",
})
_MOVE_KW    = frozenset({"surge", "soar", "plunge", "crash", "rally", "drop", "fall",
                          "tumble", "spike", "dive", "climb", "slump"})
_DEAL_KW    = frozenset({"acqui", "merger", "buyout", "takeover", "deal", "lbo", "acquire"})

# Company / earnings slot — company-specific operational and financial news.
# Deliberately excludes macro-level terms so this slot captures firm-level
# signal (beats, misses, guidance cuts, spin-offs) rather than echoing the
# Macro Story or Market Move slot.
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

# Stricter deal keywords for Top Deal slot — excludes the generic "deal" token
# so that e.g. "a new deal for..." doesn't win over a genuine acquisition headline.
_STRONG_DEAL_KW = frozenset({"acqui", "merger", "buyout", "takeover", "lbo"})

# PR Newswire is deprioritized in Top Stories — it can still appear in the feed
# for genuine deals but should not win a spotlight slot unless nothing better exists.
_PR_NEWSWIRE_SOURCE = "PR Newswire M&A"

# ── Freshness gates for deal and company slots ─────────────────────────────────
# Top Deal and Top Single Name should stay fresh — stale M&A / company headlines
# look wrong on a live product.  The hard cap is enforced on BOTH the primary
# pass AND all fallback tiers; slots are left empty rather than showing stale
# content.
_DEAL_MAX_AGE_HOURS      = 72   # hard cap for Top Deal (primary + all fallbacks)
_DEAL_PREFER_AGE_HOURS   = 36   # preferred age within that cap (1.5 days)
_SINGLE_MAX_AGE_HOURS    = 48   # hard cap for Top Single Name (primary + fallbacks)
_SINGLE_PREFER_AGE_HOURS = 36   # preferred age for Top Single Name


def _age_hours(i: "FeedItem") -> float:
    """Hours since publication; items with no timestamp are treated as 24h old."""
    if not i.published_dt:
        return 24.0
    return max(0.0, (datetime.now(timezone.utc) - i.published_dt).total_seconds() / 3600)

# ── Bookmarks ─────────────────────────────────────────────────────────────────
# Module-level in-memory store (single-user local app; clears on restart).
_bookmark_store: dict[str, FeedItem] = {}   # url → FeedItem

# ── "New since last refresh" tracking ─────────────────────────────────────────
_seen_item_keys: set[str] = set()   # keys from the *previous* successful refresh

# ── Clustering ────────────────────────────────────────────────────────────────
_CLUSTER_THRESHOLD = 0.30   # softer than dedup (0.50); groups related stories

# ── Top Stories quality gate ──────────────────────────────────────────────────
# Items below this signal score are excluded from spotlight slots even as fallbacks.
# The -50 noise penalty means most low-signal items naturally fall below this.
_MIN_TOP_STORIES_SCORE = 40

# Hard subject-based exclusions for Top Stories only.
# These match articles whose *subject* is consumer personal finance, insurance
# lifestyle, or how-to advice — even when those articles contain finance
# vocabulary like "rates", "costs", or "surge" that would otherwise pass
# keyword-presence checks.  Feed cards are unaffected.
_TS_EXCLUDE_RE = re.compile(
    r"(?:"
    # ── Consumer insurance as subject ────────────────────────────────────────
    # "Car insurance rates surge" has finance vocab but the wrong subject.
    # Match any insurance type as the main noun phrase (not just tips/quotes).
    r"(?:car|auto|home(?:owner)?s?|life|health|pet|renters?|umbrella)\s+insurance\b"
    # ── How-to framing ────────────────────────────────────────────────────────
    r"|\bhow\s+to\b"
    # ── Listicle / "best X" framing ──────────────────────────────────────────
    r"|\b(?:best|top)\s+(?:\d+\s+)?(?:states?|places?|cities|towns?|ways?\s+to|"
    r"credit\s+cards?|savings?\s+accounts?|checking\s+accounts?|brokerages?)\b"
    # ── Consumer budget / personal finance framing ────────────────────────────
    r"|\bsave\s+(?:more\s+)?money\b"
    r"|\bbudgeting\b"
    r"|\bcost\s+of\s+living\b"
    r"|\bpersonal\s+finance\b"
    r"|\bfinancial\s+(?:advice|planning|wellness|literacy)\b"
    r"|\bcar\s+(?:loan|payment|buying|leasing)\b"
    # ── Mortgage — consumer tips and rate-watching framing ────────────────────
    # "mortgage tips/advice" already broad; add consumer rate-tracking phrasing
    # ("mortgage rates today", "mortgage rates fall this week", etc.).
    r"|\bmortgage\s+(?:tip|advice|application)\b"
    r"|\bmortgage\s+rates?\s+(?:today|this\s+week|fall|rise|drop|climb|tick|edge|ease|jump|dip)\b"
    # ── Savings accounts — consumer product framing ───────────────────────────
    # "High-yield savings account APY", "best savings account rates" etc.
    # Does NOT catch "Fed's balance sheet shrinks as savings surplus reverses".
    r"|\bsavings\s+account\s+(?:rates?|apy|interest|tips?|comparison|guide|option|open)\b"
    r"|\bhigh.yield\s+savings\b"
    # ── Credit cards — consumer product framing ───────────────────────────────
    r"|\bcredit\s+card\s+(?:rates?|interest|apr\b|tips?|comparison|rewards?|cash\s+back|sign.?up)\b"
    # ── 401(k) / IRA / retirement account consumer advice ─────────────────────
    r"|\b401\s*[(\s]?\s*k\b.{0,60}(?:rollover|roll\s+over|withdrawal|contribut|tips?|advice|limit|should)"
    r"|\bira\s+(?:rollover|roll\s+over|contribut|limit|tips?|vs\.?\s)"
    r"|\brollover\s+(?:your\s+)?(?:401|ira|pension|retirement)\b"
    r"|\bshould\s+(?:you|i)\b.{0,30}(?:roll\s+over|rollover|401|ira|retire)\b"
    r"|\bretirement\s+(?:account|savings?|fund)\s+(?:tips?|advice|guide|mistake|should)\b"
    # ── Retirement-audience advice framing ────────────────────────────────────
    # "How Retirees Can Stay Ahead of Inflation" — consumer personal finance, not
    # institutional macro news.  Catches "retirees can/should/need/face/are".
    r"|\bretirees?\s+(?:can|should|may|might|need|want|could|are|who|face)\b"
    # Worried-about framing — consumer anxiety framing, not institutional reporting.
    # "Worried About Inflation? Here's How…" is personal finance, not macro news.
    r"|\bworried\s+about\s+(?:inflation|rates?|the\s+(?:economy|market|fed))\b"
    # ── Personal advice / Q&A / forum-style framing ───────────────────────────
    # First- and second-person questions, anecdotes, and trust-seeking language
    # that appear in personal finance columns, Reddit threads, and Q&A pages —
    # never in institutional market reporting.
    #
    # First-person questions
    r"|\bshould\s+i\b"                      # "Should I invest / trust my advisor"
    r"|\bhow\s+do\s+i\b"                    # "How do I open a brokerage account"
    r"|\bwhat\s+should\s+i\b"              # "What should I do with my inheritance"
    r"|\bcan\s+i\s+trust\b"                 # "Can I trust my financial adviser"
    r"|\bscam\b"                             # "Is this investment a scam" / "crypto scam"
    # Personal anecdote framing
    r"|\bmy\s+(?:advisor|adviser|broker|accountant|financial\s+(?:advisor|adviser|planner))\b"
    r"|\bmy\s+friend\b"                     # "My friend says I should put it all in..."
    # Second-person advice questions (Q&A framing, often with trailing "?")
    r"|\bshould\s+you\s+(?:invest|buy|sell|switch|open|trust|put|move|roll|use|hire)\b"
    r"|\bdo\s+you\s+need\s+a\b.{0,30}(?:advisor|adviser|broker|planner|accountant)\b"
    # Value / worth questions
    r"|\bis\s+it\s+worth\b"                 # "Is it worth investing in gold right now"
    # "What's the best…" consumer-advice framing
    r"|\bwhat'?s?\s+the\s+best\s+(?:way\s+to|time\s+to|account|fund|broker|invest|buy|sell)\b"
    # ── Newsletter / subscription CTAs (second-line defence) ──────────────────
    # Hard-excluded at scoring level; this catches any that slip through.
    r"|^sign\s+up\b"
    r"|^subscribe\b"
    r"|\bsign\s+up\s+(?:for|to)\b"
    # ── Commentary / opinion / essay framing (second-line defence) ────────────
    # These patterns indicate no concrete market event — pure editorial perspective.
    r"|\bweighing\s+the\b"
    r"|\bwhat\s+(?:this|it)\s+means\s+for\b"
    r"|\bmaking\s+sense\s+of\b"
    r"|\ba\s+(?:closer\s+)?look\s+at\b"
    r"|^(?:opinion|commentary|perspective|column)\s*:"
    r")",
    re.IGNORECASE,
)

# Finance relevance keywords — at least one must appear in title+snippet
# for an item to qualify for a Top Stories slot.
# _COMPANY_KW is included so that analyst actions, earnings, and guidance
# items pass the relevance gate and can fill the Top Company slot.
_TS_RELEVANCE_KW: frozenset[str] = (
    _MACRO_KW                                          # Fed, rates, inflation, yield…
    | _MOVE_KW                                         # surge, plunge, rally, crash…
    | _DEAL_KW                                         # acqui, merger, buyout, lbo…
    | _COMPANY_KW                                      # earning, guidance, upgrade…
    | frozenset({
        # Broad market / asset class
        "stock", "equit", "market", "bond", "oil", "commodit", "revenue",
        "gdp", "unemployment", "credit", "sanction", "tariff", "geopolit",
        # Policy / regulatory — ensures Top Policy / Risk items pass the gate
        "regulation", "regulatory", "crackdown", "enforcement",
        "legislation", "legislative", "antitrust", "investigation", "probe",
        "medicare", "medicaid", "executive order",
    })
)

# Move-slot vocabulary anchored to actual asset classes and market infrastructure.
# Narrower than _MOVE_KW — consumer cost articles like "insurance rates surge"
# have move verbs but no asset-class anchor, so they fail here.
_TS_MARKET_MOVE_KW: frozenset[str] = frozenset({
    # Equity markets
    "stock", "stocks", "share", "shares", "equit",
    "s&p", "nasdaq", "dow", "nikkei", "ftse", "russell", "index", "indices",
    # Commodities
    "oil", "crude", "brent", "wti", "gold", "silver", "copper", "commodit",
    # Fixed income
    "treasury", "treasuries", "yield", "bond", "bonds", "note", "t-bill",
    # Strong market-action verbs (paired with asset context from above)
    "rally", "plunge", "selloff", "sell-off", "rout", "melt",
    # Corporate performance
    "earning", "earnings", "guidance", "profit", "revenue",
    # Policy / macro events that move markets
    "sanction", "tariff",
})

# ── Top Price Move — subject-level instrument check ──────────────────────────
# Anchored to the title start; requires the grammatical subject of the headline
# to be a tradeable asset. Broader than _PRICE_ACTION_SUBJ_RE (feeds.py) because
# the qualified[] gate has already stripped consumer-finance noise.
_PRICE_MOVE_SUBJ_RE = re.compile(
    r"^(?:"
    # Equities — bare and qualified
    r"stocks?\b|shares?\b|equit(?:y|ies)\b"
    r"|s&p\s*500|nasdaq|dow\s+jones|stock\s+market|equity\s+markets?"
    r"|u\.?s\.?\s+stocks?|global\s+stocks?|asian\s+stocks?|european\s+stocks?"
    # Oil / energy — bare "Oil" and qualified phrases
    r"|oil\b|brent|wti|crude\s+oil|crude\s+prices?|oil\s+prices?|oil\s+futures?"
    # Fixed income — bare "Bonds"/"Treasuries" and qualified phrases
    r"|bonds?\b|treasuries\b|treasury\s+yields?|bond\s+yields?"
    r"|10.year\s+(?:yield|note)|yield\s+curve"
    # Metals / commodities — bare and qualified
    r"|gold\b|silver\b|copper\b"
    r"|gold\s+prices?|gold\s+futures?|copper\s+prices?|silver\s+prices?"
    # FX
    r"|dollar\b|euro\b|yen\b|pound\b|currency|currencies"
    # Crypto
    r"|bitcoin|crypto(?:currency|currencies)?"
    # Generic "markets" ONLY when immediately followed by a price-action verb
    r"|markets?\s+(?:fall|rise|drop|rally|plunge|surge|slip|tick|dip|jump|tumble|rebound)\b"
    r")",
    re.IGNORECASE,
)

# ── Top Policy / Risk — regulatory / legislative / geopolitical vocabulary ────
# Covers government actions, sector crackdowns, trade / sanctions policy,
# and geopolitical risk that falls outside the Macro (economic data) and
# Single Name (company catalyst) slots.
_POLICY_RISK_KW: frozenset[str] = frozenset({
    # Regulatory enforcement
    "crackdown", "enforcement", "antitrust", "monopoly",
    "investigation", "probe",
    "regulation", "regulatory", "deregulation",
    "ftc", "fda", "doj", "cfpb", "cftc",
    # Legislation / government action
    "legislation", "legislative",
    "executive order", "white house",
    "congress", "senate", "parliament",
    # Tax / fiscal policy (narrower than macro — policy lever, not economic data)
    "tax holiday", "gas tax", "carbon tax", "tax break",
    "tariff", "sanction",
    # Sector policy
    "medicare", "medicaid",
    "drug pricing", "drug price",
    "energy policy", "climate policy",
    # Geopolitical risk (category handles most; keywords as fallback)
    "geopolit", "escalation",
})

# ── Bookmark JS (injected once per HTML render) ───────────────────────────────
_BOOKMARK_JS = (
    "<script>"
    "function argusBookmark(btn){"
    "var s=btn.getAttribute('data-saved')==='1';"
    "btn.setAttribute('data-saved',s?'0':'1');"
    "btn.textContent=s?'\u2606':'\u2605';"
    "btn.style.color=s?'#9ca3af':'#f59e0b';"
    "if(!s){"
    "var el=document.querySelector('.argus-save-input textarea');"
    "if(el){el.value=btn.getAttribute('data-url');"
    "el.dispatchEvent(new Event('input',{bubbles:true}));}"
    "}"
    "}"
    "</script>"
)


def _item_key(item: FeedItem) -> str:
    """Stable string key for a FeedItem — used for deduplication without hashing the object."""
    return item.url.strip() if item.url and item.url.strip() else item.title.strip().lower()


def _mark_new_items(items: list[FeedItem]) -> frozenset[str]:
    """
    Compare items against the previous refresh and return keys that are genuinely new.

    On the first call (empty _seen_item_keys) returns an empty frozenset so that
    the "N new" indicator is not shown until there is a baseline to compare against.
    The module-level _seen_item_keys is updated to the current item set.
    """
    global _seen_item_keys
    current_keys = {_item_key(i) for i in items}
    if not _seen_item_keys:
        _seen_item_keys = current_keys
        return frozenset()
    new_keys = frozenset(current_keys - _seen_item_keys)
    _seen_item_keys = current_keys
    return new_keys


def _cluster_feed(items: list[FeedItem]) -> list[tuple[FeedItem, int]]:
    """
    Group items into topic clusters using title Jaccard similarity.

    Returns (representative, cluster_size) pairs.  Items are expected to arrive
    already sorted best-first, so each cluster's first item is its highest-quality
    representative.  Cluster members are not discarded — their count is surfaced as
    a "+N related" badge on the representative card.
    """
    clusters:      list[list[FeedItem]] = []
    cluster_words: list[set[str]]       = []

    for item in items:
        words = _title_words(item.title)
        best_sim, best_idx = 0.0, -1
        for idx, cw in enumerate(cluster_words):
            s = _jaccard(words, cw)
            if s > best_sim:
                best_sim, best_idx = s, idx

        if best_sim >= _CLUSTER_THRESHOLD:
            clusters[best_idx].append(item)
        else:
            clusters.append([item])
            cluster_words.append(words)

    return [(c[0], len(c)) for c in clusters]


def _render_today_take(take_text: str) -> str:
    """Dark navy intelligence banner shown above Top Stories when AI is done."""
    if not take_text:
        return ""
    return (
        "<div style='background:#1F3864;border-radius:12px;"
        "padding:16px 20px;margin-bottom:20px'>"
        "<div style='font-size:10px;font-weight:800;color:#93c5fd;"
        "text-transform:uppercase;letter-spacing:1.3px;margin-bottom:9px'>"
        "Today's Take</div>"
        f"<p style='font-size:13px;line-height:1.7;margin:0;color:#e2e8f0'>"
        f"{take_text}</p>"
        "</div>"
    )


def _select_top_stories(
    items:     list[FeedItem],
    debug_log: list[str] | None = None,
) -> dict[str, FeedItem | None]:
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
    top: dict[str, FeedItem | None] = {
        "Top Deal":          None,
        "Top Macro Story":   None,
        "Top Single Name":   None,   # was Top Company — now requires Company category
        "Top Price Move":    None,   # was Top Market Move — requires instrument subject
        "Top Policy / Risk": None,   # new — regulation, geo risk, sector crackdowns
    }

    def _text(i: FeedItem) -> str:
        return (i.title + " " + i.snippet).lower()

    def _echoes_filled(candidate: FeedItem) -> bool:
        w = _title_words(candidate.title)
        return any(
            _jaccard(w, _title_words(filled.title)) > 0.28
            for filled in top.values()
            if filled is not None
        )

    def _dbg(slot: str, item: FeedItem, accepted: bool, reason: str) -> None:
        if debug_log is not None:
            status = "ACCEPT" if accepted else "REJECT"
            t = item.title[:58] + "…" if len(item.title) > 58 else item.title
            debug_log.append(f"[{slot}] {status}: \"{t}\" — {reason}")

    def _has_finance_kw(i: FeedItem) -> bool:
        text = (i.title + " " + i.snippet).lower()
        return any(kw in text for kw in _TS_RELEVANCE_KW)

    def _ts_excluded(i: FeedItem) -> bool:
        return bool(_TS_EXCLUDE_RE.search(i.title + " " + i.snippet))

    qualified = [
        i for i in items
        if i.signal_score >= _MIN_TOP_STORIES_SCORE
        and _has_finance_kw(i)
        and not _ts_excluded(i)
    ]

    # PR Newswire / press-release sources sorted to the back within each bucket;
    # fresher items promoted within the same quality tier (bucket 0=<24h, 1=24–48h, 2=>48h).
    ordered = sorted(qualified, key=lambda i: (
        0 if i.summary else 1,
        1 if i.source == _PR_NEWSWIRE_SOURCE else 0,
        min(2, int(_age_hours(i) / 24)),   # freshness bucket — newer = lower number = earlier
        -i.signal_score,
    ))

    for item in ordered:
        txt          = _text(item)
        key          = _item_key(item)
        claimed_keys = {_item_key(v) for v in top.values() if v is not None}

        # ── Top Deal: M&A with substantive deal vocabulary ────────────────────
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

        # ── Top Macro Story: central bank / rates / economic data ─────────────
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

        # ── Top Single Name: explicit single-company catalyst ──────────────────
        # Requires Company category (set by _reclassify_category when earnings,
        # guidance, analyst action, CEO/CFO, layoffs, or similar fire on title).
        # Broad sector regulation and government-policy stories are excluded
        # because they don't get tagged Company — they stay Markets or Geo.
        if top["Top Single Name"] is None and key not in claimed_keys:
            if item.category != "Company":
                _dbg("Top Single Name", item, False,
                     f"category={item.category}, requires Company (earnings/guidance/CEO/analyst)")
            elif _echoes_filled(item):
                _dbg("Top Single Name", item, False, "echoes filled slot")
            else:
                _dbg("Top Single Name", item, True, "Company category — single-company catalyst")
                top["Top Single Name"] = item

        # ── Top Price Move: tradeable instrument as grammatical subject ────────
        # Uses _PRICE_MOVE_SUBJ_RE anchored to the title start so that the
        # headline's subject is the instrument itself, not a geo/policy actor.
        # "Brent crude rises on Iran news" → accepts (oil is the subject).
        # "Iran tensions push oil higher"  → rejects (geo actor is the subject).
        if top["Top Price Move"] is None and key not in claimed_keys:
            if not _PRICE_MOVE_SUBJ_RE.search(item.title):
                _dbg("Top Price Move", item, False,
                     "title does not open with tradeable instrument (oil/stocks/yields/FX/crypto)")
            elif _echoes_filled(item):
                _dbg("Top Price Move", item, False, "echoes filled slot")
            else:
                _dbg("Top Price Move", item, True, "price-action subject in title")
                top["Top Price Move"] = item

        # ── Top Policy / Risk: regulation, legislation, geo risk ──────────────
        # Accepts Geopolitical-category items OR items with policy/regulatory
        # vocabulary from _POLICY_RISK_KW.  Fires AFTER Macro and Single Name so
        # those slots aren't polluted by broad policy stories.
        # M&A and Company items are excluded even if their snippet mentions a
        # policy keyword in passing (e.g. an LBO financing article that references
        # "geopolitical uncertainty" should stay in Deal / Single Name, not here).
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

    # ── Fallbacks — respect quality gate, log outcomes ────────────────────────

    def _fb(slot: str, winner: FeedItem | None) -> None:
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
            # Prefer: fresh (<= 36h), editorial source
            next((i for i in qualified
                  if i.category == "M&A" and _item_key(i) not in fk
                  and i.source != _PR_NEWSWIRE_SOURCE
                  and _age_hours(i) <= _DEAL_PREFER_AGE_HOURS), None)
            # Allow: up to hard 72h cap, editorial source
            or next((i for i in qualified
                     if i.category == "M&A" and _item_key(i) not in fk
                     and i.source != _PR_NEWSWIRE_SOURCE
                     and _age_hours(i) <= _DEAL_MAX_AGE_HOURS), None)
            # Last resort: any M&A item within hard 72h cap
            or next((i for i in qualified
                     if i.category == "M&A" and _item_key(i) not in fk
                     and _age_hours(i) <= _DEAL_MAX_AGE_HOURS), None)
            # Slot stays None — no stale fallback beyond hard cap
        )
        _fb("Top Deal", top["Top Deal"])

    if top["Top Macro Story"] is None:
        fk  = {_item_key(v) for v in top.values() if v is not None}
        _mt = lambda i: (i.title + " " + i.snippet).lower()
        # Strict — slot stays None when no genuine macro signal exists.
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
            # Prefer fresh company catalyst (<= 36h)
            next((i for i in qualified
                  if i.category == "Company" and _item_key(i) not in fk
                  and _age_hours(i) <= _SINGLE_PREFER_AGE_HOURS), None)
            # Allow: up to hard 48h cap
            or next((i for i in qualified
                     if i.category == "Company" and _item_key(i) not in fk
                     and _age_hours(i) <= _SINGLE_MAX_AGE_HOURS), None)
            # Slot stays None — no stale fallback beyond hard cap
        )
        _fb("Top Single Name", top["Top Single Name"])

    if top["Top Price Move"] is None:
        fk  = {_item_key(v) for v in top.values() if v is not None}
        _pt = lambda i: (i.title + " " + i.snippet).lower()
        # First try subject-anchored check; then fall back to keyword presence.
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


def _render_top_stories(stories: dict[str, FeedItem | None]) -> str:
    """Render the Top Stories intelligence banner above the feed stream."""
    items = [(label, item) for label, item in stories.items() if item is not None]
    if not items:
        return ""

    cards_html = ""
    for label, item in items:
        cat_colour  = _CAT_COLOURS.get(item.category, "#374151")
        url         = item.url or "#"
        short_title = item.title if len(item.title) <= 90 else item.title[:87] + "…"

        # Category pill
        cat_pill = (
            f"<span style='background:{cat_colour};color:#fff;border-radius:8px;"
            f"padding:1px 7px;font-size:10px;font-weight:700'>{item.category}</span>"
        )

        # Why it matters — slightly larger and darker for emphasis
        if item.why_it_matters:
            w = item.why_it_matters
            why_short = w if len(w) <= 82 else w[:79] + "…"
            why_html  = (
                f"<p style='font-size:12px;color:#374151;margin:6px 0 8px;"
                f"line-height:1.45;font-style:italic;font-weight:500'>{why_short}</p>"
            )
        else:
            why_html = "<div style='margin-bottom:8px'></div>"

        cards_html += (
            # Card: white, category-coloured top accent bar (min-width supports 5 slots)
            f"<div style='flex:1;min-width:168px;background:#fff;border-radius:8px;"
            f"padding:14px 16px;border:1px solid #e0e4ef;"
            f"border-top:3px solid {cat_colour}'>"
            # Slot label + category pill on same row
            f"<div style='display:flex;align-items:center;gap:7px;margin-bottom:8px'>"
            f"<span style='font-size:10px;font-weight:800;color:{cat_colour};"
            f"text-transform:uppercase;letter-spacing:1px'>{label}</span>"
            f"{cat_pill}"
            f"</div>"
            # Headline link
            f"<a href='{url}' target='_blank' "
            f"style='font-size:13px;font-weight:600;color:#111827;text-decoration:none;"
            f"line-height:1.4;display:block'>{short_title}</a>"
            # Why it matters (emphasised)
            f"{why_html}"
            # Source meta
            f"<span style='font-size:11px;color:#9ca3af'>{item.source}  ·  {item.published}</span>"
            f"</div>"
        )

    return (
        f"<div style='background:linear-gradient(135deg,#eef2fc 0%,#f8f9fb 100%);"
        f"border:1px solid #d8e0f0;border-radius:12px;"
        f"padding:16px 18px;margin-bottom:22px'>"
        # Section header
        f"<div style='font-size:10px;font-weight:800;color:#1F3864;"
        f"text-transform:uppercase;letter-spacing:1.3px;margin-bottom:13px;"
        f"display:flex;align-items:center;gap:8px'>"
        f"<span style='flex:1;height:1px;background:#c7d2ec'></span>"
        f"Top Stories"
        f"<span style='flex:1;height:1px;background:#c7d2ec'></span>"
        f"</div>"
        f"<div style='display:flex;gap:12px;flex-wrap:wrap'>{cards_html}</div>"
        f"</div>"
    )


# ── Feed header + error footer ────────────────────────────────────────────────

def _feed_header(
    items: list[FeedItem],
    last_updated: str,
    fresh_only: bool,
    n_new: int = 0,
) -> str:
    n_sources   = len({i.source for i in items})
    n_cats      = len({i.category for i in items})
    freshness   = f"  ·  fresh only ≤{STALE_HOURS}h" if fresh_only else ""
    new_badge   = (
        f"  ·  <span style='color:#15803d;font-weight:700'>&#9679; {n_new} new</span>"
        if n_new > 0 else ""
    )
    return (
        f"<div style='display:flex;justify-content:space-between;align-items:center;"
        f"padding:6px 2px 14px;border-bottom:2px solid #e5e7eb;margin-bottom:20px'>"
        f"<span style='font-size:11px;color:#6b7280;font-weight:500'>"
        f"{len(items)} stories  ·  {n_sources} sources  ·  {n_cats} categories"
        f"{freshness}{new_badge}</span>"
        f"<span style='font-size:11px;color:#9ca3af'>Updated {last_updated}</span>"
        f"</div>"
    )


def _error_footer(errors: dict[str, str]) -> str:
    """Compact notice at the bottom listing unavailable sources (no verbose messages)."""
    if not errors:
        return ""
    names = ", ".join(errors.keys())
    return (
        f"<div style='margin-top:12px;padding:8px 12px;border-radius:6px;"
        f"background:#fafafa;border:1px solid #e5e7eb;"
        f"font-size:11px;color:#9ca3af'>"
        f"⚠️  {len(errors)} source{'s' if len(errors) > 1 else ''} temporarily unavailable: "
        f"<span style='color:#6b7280'>{names}</span>"
        f"</div>"
    )


# ── Master render ─────────────────────────────────────────────────────────────

def _loading_html(msg: str = "Fetching latest headlines…") -> str:
    return (
        f"<div style='padding:60px 40px;text-align:center;color:#6b7280'>"
        f"<div style='font-size:32px;margin-bottom:14px'>📡</div>"
        f"<p style='font-size:14px;font-weight:600;margin:0'>{msg}</p>"
        f"</div>"
    )


def _error_html(msg: str) -> str:
    return (
        f"<div style='padding:24px;border-radius:8px;background:#fef2f2;"
        f"border:1px solid #fecaca;color:#991b1b;font-size:13px'>"
        f"⚠️  {msg}<br>"
        f"<small style='color:#6b7280'>Check your internet connection or try Force Refresh.</small>"
        f"</div>"
    )


def _render_all(
    items: list[FeedItem],
    last_updated: str = "",
    fresh_only: bool = False,
    pending_ai: bool = False,
    fetch_errors: dict[str, str] | None = None,
    show_top_stories: bool = True,
    today_take: str = "",
    new_keys: frozenset[str] = frozenset(),
) -> str:
    if not items:
        msg = (
            f"No items found in the last {STALE_HOURS}h. "
            f"Try disabling <b>Fresh only</b> or clicking <b>Force Refresh</b>."
        )
        return f"<p style='color:#9ca3af;padding:20px'>{msg}</p>"

    n_new     = len(new_keys)
    header    = _feed_header(items, last_updated, fresh_only, n_new=n_new) if last_updated else ""
    take_html = _render_today_take(today_take) if today_take and not pending_ai else ""

    top_html      = ""
    stream_header = ""
    if show_top_stories and not pending_ai:
        _dbg_lines: list[str] = []
        stories  = _select_top_stories(items, debug_log=_dbg_lines)
        for line in _dbg_lines:
            log.debug("TopStories %s", line)
        top_html = _render_top_stories(stories)
        if top_html:
            stream_header = (
                "<div style='font-size:10px;font-weight:800;color:#9ca3af;"
                "text-transform:uppercase;letter-spacing:1.2px;"
                "padding-bottom:10px;border-bottom:2px solid #e5e7eb;"
                "margin-bottom:16px'>"
                "Live Market Stream"
                "</div>"
            )

    # Cluster for display (skip during pending-AI phase to avoid CPU cost)
    if pending_ai:
        card_data = [(i, 1) for i in items]
    else:
        card_data = _cluster_feed(items)

    cards  = "\n".join(
        _render_card(
            item,
            pending_ai=pending_ai,
            cluster_size=size,
            is_new=(_item_key(item) in new_keys),
        )
        for item, size in card_data
    )
    footer = _error_footer(fetch_errors or {})

    return _BOOKMARK_JS + header + take_html + top_html + stream_header + cards + footer


# ── Filter helpers ────────────────────────────────────────────────────────────

def _category_options() -> list[str]:
    return ["All"] + sorted({c for _, _, c in FEED_REGISTRY})


def _source_options() -> list[str]:
    return ["All"] + sorted({n for n, _, _ in FEED_REGISTRY})


def _apply_registry_filters(cat: str, src: str) -> list[tuple[str, str, str]]:
    reg = FEED_REGISTRY
    if cat and cat != "All":
        reg = [(n, u, c) for n, u, c in reg if c == cat]
    if src and src != "All":
        reg = [(n, u, c) for n, u, c in reg if n == src]
    return reg


# ── Core refresh generator ────────────────────────────────────────────────────

def _refresh_gen(
    model_name: str,
    cat_filter: str,
    src_filter: str,
    use_ai: bool,
    fresh_only: bool,
    force_refresh: bool,
) -> Iterator[tuple[str, str, list]]:
    """
    Yields (html, status, items) in up to four phases for responsive loading.
    The items value is used to keep gr.State current for bookmark lookups.
    """
    now_str = datetime.now().strftime("%H:%M")

    # ── Phase 1: instant loading state ────────────────────────────────────────
    yield _loading_html("Fetching latest headlines…"), "Fetching latest headlines…", []

    # ── Phase 2: parallel RSS fetch ───────────────────────────────────────────
    registry = _apply_registry_filters(cat_filter, src_filter)
    if not registry:
        yield _error_html("No feeds match the selected filters."), "No feeds selected.", []
        return

    items = feed_manager.fetch_all(
        registry=registry,
        force_refresh=force_refresh,
        fresh_only=fresh_only,
    )
    errors = dict(feed_manager.fetch_errors)

    if not items:
        msg = (
            f"No items found in the last {STALE_HOURS}h — try disabling Fresh only."
            if fresh_only else "Could not retrieve any feed items."
        )
        yield _error_html(msg) + _error_footer(errors), "No items retrieved.", []
        return

    new_keys    = _mark_new_items(items)
    n_sources   = len({i.source for i in items})
    base_status = f"Loaded {len(items)} items from {n_sources} sources"
    err_note    = f"  ·  {len(errors)} source(s) unavailable" if errors else ""

    if not use_ai:
        yield (
            _render_all(items, now_str, fresh_only, fetch_errors=errors,
                        new_keys=new_keys),
            f"{base_status}{err_note}  ·  Updated {now_str}",
            items,
        )
        return

    # ── Phase 3a: raw cards while AI summarizes ───────────────────────────────
    ai_count = min(len(items), MAX_AI_ITEMS)
    yield (
        _render_all(items, now_str, fresh_only, pending_ai=True, fetch_errors=errors,
                    new_keys=new_keys),
        f"{base_status}{err_note}  ·  Summarizing top {ai_count} stories…",
        items,
    )

    # ── Phase 3b: AI summarization ────────────────────────────────────────────
    try:
        settings.ollama_model = model_name
        result = summarize_items(items, model_name=model_name)
    except Exception as exc:
        log.warning("Summarization failed: %s", exc)
        yield (
            _render_all(items, now_str, fresh_only, fetch_errors=errors,
                        new_keys=new_keys),
            f"{base_status}{err_note}  ·  AI failed: {exc}  ·  Updated {now_str}",
            items,
        )
        return

    # ── Phase 3c: Today's Take + final render ─────────────────────────────────
    take_text  = generate_market_take(items, model_name=model_name)
    cache_note = f"  ·  {result.cached} from cache" if result.cached else ""
    take_note  = "  ·  Today's Take ready" if take_text else ""
    n_new_note = f"  ·  {len(new_keys)} new" if new_keys else ""
    status     = (
        f"{base_status}{err_note}"
        f"  ·  {result.new} summarized{cache_note}"
        f"{take_note}"
        f"{n_new_note}"
        f"  ·  Updated {now_str}"
    )
    yield (
        _render_all(items, now_str, fresh_only, today_take=take_text, fetch_errors=errors,
                    new_keys=new_keys),
        status,
        items,
    )


# ── Build tab layout ──────────────────────────────────────────────────────────

def build_feed_tab(models: list[str], default_model: str) -> None:
    """Call inside `with gr.Tab("📰 Market Feed"):` from chat_ui.py."""
    with gr.Row():
        gr.Markdown(
            "### Market Intelligence Feed\n"
            "<span style='font-size:11px;background:#1F3864;border-radius:6px;"
            "padding:3px 11px;color:#fff;font-weight:600;letter-spacing:.4px'>"
            "Live headlines  ·  AI summaries  ·  Why it matters  ·  Market impact</span>"
        )

    with gr.Row(equal_height=False):

        # ── Left: controls ─────────────────────────────────────────────────
        with gr.Column(scale=1, min_width=230):

            feed_model_dd = gr.Dropdown(
                label="Model for AI summaries",
                choices=models,
                value=default_model,
                interactive=True,
                allow_custom_value=True,
            )
            cat_filter = gr.Dropdown(
                label="Category",
                choices=_category_options(),
                value="All",
                interactive=True,
            )
            src_filter = gr.Dropdown(
                label="Source",
                choices=_source_options(),
                value="All",
                interactive=True,
            )
            use_ai_toggle = gr.Checkbox(
                label="AI summaries & insights",
                value=True,
                info="Disable for instant raw headlines.",
            )
            fresh_toggle = gr.Checkbox(
                label=f"Fresh only  (≤{STALE_HOURS}h)",
                value=True,
                info=f"Hide items older than {STALE_HOURS} hours.",
            )

            gr.Markdown("---")

            with gr.Row():
                refresh_btn = gr.Button("Refresh Feed",  variant="primary",  size="sm")
                force_btn   = gr.Button("Force Refresh", variant="secondary", size="sm")

            feed_status = gr.Markdown("", elem_id="feed-status")

            gr.Markdown(
                "<small>"
                "**Refresh** uses 15-min cache · repeats are instant from summary cache.<br>"
                "**Force Refresh** fetches live RSS."
                "</small>"
            )

        # ── Right: feed cards ──────────────────────────────────────────────
        with gr.Column(scale=3):
            feed_html = gr.HTML(
                value=(
                    "<p style='color:#9ca3af;padding:20px'>"
                    "Click <b>Refresh Feed</b> to load headlines.</p>"
                ),
            )

    # ── Bookmark state & hidden bridge ────────────────────────────────────────
    # gr.State holds the current items list so the bookmark handler can look up
    # FeedItem objects by URL.  The hidden textbox receives URL strings written
    # by the in-card JS bookmark buttons.
    current_items_state = gr.State([])
    save_url_input      = gr.Textbox(
        elem_classes=["argus-save-input"],
        visible=False,
        label="",
        max_lines=1,
    )

    # ── Event wiring (must be generator functions, not lambdas) ───────────────

    def _on_refresh(m, c, s, ai, fr):
        yield from _refresh_gen(m, c, s, ai, fr, force_refresh=False)

    def _on_force(m, c, s, ai, fr):
        yield from _refresh_gen(m, c, s, ai, fr, force_refresh=True)

    def _on_bookmark(url: str, items: list) -> tuple[str, list]:
        if url:
            item = next((i for i in items if i.url == url), None)
            if item:
                _bookmark_store[url] = item
                log.debug("Bookmarked: %.60s", item.title)
        return f"⭐ {len(_bookmark_store)} saved", items

    _inputs  = [feed_model_dd, cat_filter, src_filter, use_ai_toggle, fresh_toggle]
    _outputs = [feed_html, feed_status, current_items_state]

    refresh_btn.click(fn=_on_refresh, inputs=_inputs, outputs=_outputs)
    force_btn.click(fn=_on_force,    inputs=_inputs, outputs=_outputs)

    save_url_input.change(
        fn=_on_bookmark,
        inputs=[save_url_input, current_items_state],
        outputs=[feed_status, current_items_state],
    )
