"""
app/summarizer.py — AI enrichment for Market Feed items

Produces three structured fields per article:
  SUMMARY       — 2-sentence factual "what happened"
  WHY IT MATTERS — 1-sentence investor implication
  IMPACT        — directional label, e.g. "Bullish for logistics REITs"

Also generates a "Today's Take": a 2-3 sentence macro environment summary
derived from the day's top-ranked stories, cached by content hash.

All results are cached in-memory so repeat refreshes within a session are instant.
"""

from __future__ import annotations

import hashlib
import json
import logging
import re
from dataclasses import dataclass, field
from typing import NamedTuple

from app.config import settings
from app.feeds  import FeedItem
from app.model  import Message, get_client

log = logging.getLogger(__name__)

# ── Configuration ─────────────────────────────────────────────────────────────

MAX_AI_ITEMS = 15   # only the N newest items receive AI summaries per refresh
_BATCH_SIZE  = 3    # items per LLM call (3 gives reliable structured output)
_TEMPERATURE = 0.2  # low = factual and deterministic

# ── In-memory summary cache ───────────────────────────────────────────────────
# key → (summary, why_it_matters, impact)

_SUMMARY_CACHE: dict[str, tuple[str, str, str]] = {}

# ── In-memory deep-analysis cache ─────────────────────────────────────────────
# key → (what_changed, why_markets_care, who_wins_loses, what_to_watch)

_DEEP_CACHE: dict[str, tuple[str, str, str, str]] = {}

# ── In-memory Today's Take cache ──────────────────────────────────────────────
# key → 2-3 sentence market environment summary

_TAKE_CACHE: dict[str, str] = {}

_TAKE_SYSTEM = """\
You are the head of macro strategy at a top-tier multi-strategy hedge fund. Write exactly 2 sentences. No labels, no headers.

Sentence 1: Name the single dominant catalyst, state what instrument or rate it moved and by how much (if available), and explain the transmission mechanism in one clause.
Sentence 2: State the clearest near-term positioning implication — direction, specific instrument, and the one event that would invalidate the thesis.

Banned words and phrases: "as investors digest", "amid uncertainty", "it is worth noting", "market participants", "could", "may", "might", "suggests", "indicates", "potential", "appears to", "faces headwinds". Write declarative sentences only. Name instruments, sectors, and figures.\
"""


def _item_cache_key(item: FeedItem) -> str:
    raw = (item.title + item.url).encode("utf-8", errors="ignore")
    return hashlib.md5(raw).hexdigest()


def clear_summary_cache() -> int:
    n = len(_SUMMARY_CACHE)
    _SUMMARY_CACHE.clear()
    return n


def summary_cache_size() -> int:
    return len(_SUMMARY_CACHE)


# ── Prompts ───────────────────────────────────────────────────────────────────

_SYSTEM_PROMPT = """\
You are a sell-side analyst on a cross-asset macro desk writing flash notes for institutional portfolio managers.
For each numbered news item, write exactly three labelled lines:

ITEM <n>
SUMMARY: <2 sentences — subject + verb + object. Sentence 1: what happened and to which entity. Sentence 2: immediate financial or market consequence.>
WHY IT MATTERS: <1 sentence — the direct transmission: what this forces, triggers, or compels in a named instrument, sector, or credit market>
IMPACT: <directional label — start with Bullish/Bearish/Neutral, then "for" + the specific asset class or sector>

Good vs. bad examples (always write like the GOOD column):
  GOOD SUMMARY: "Apple cut iPhone production guidance 10% citing weak China demand. The revision forces consensus EPS cuts across the semiconductor supply chain."
  BAD SUMMARY: "Apple announced changes to its production amid challenging market conditions. This could affect the company and related sectors."

  GOOD WHY IT MATTERS: "Forces 10Y UST yields higher, pressuring duration-heavy bond funds and lifting USD against EM currencies."
  BAD WHY IT MATTERS: "This could indicate potential uncertainty for markets and investors may face difficulties."

  GOOD IMPACT: "Bearish for US investment-grade credit spreads"
  BAD IMPACT: "Mixed for markets overall"

Hard rules:
- SUMMARY <= 40 words. Lead with subject. No passive voice. No filler phrases.
- WHY IT MATTERS <= 20 words. Name one instrument or sector. Active verbs only: forces, pressures, triggers, lifts, weighs on, tightens, widens, drives, signals, compels, reprices.
- NEVER use: "indicates", "suggests", "potential", "could", "may", "might", "possibly", "faces difficulties", "amid uncertainty", "as investors digest", "market participants", "it is worth noting".
- IMPACT <= 10 words. Bullish/Bearish/Neutral/Mixed + "for" + specific asset class (not just "markets").
- Base everything strictly on the headline and snippet. Do not invent facts.
- Output ITEM blocks only — no preamble, no commentary, no closing remarks.\
"""

_DEEP_SYSTEM_PROMPT = """\
You are a sell-side analyst writing a flash desk note for an equity and credit trader.
Given a news headline and snippet, output EXACTLY these four labelled lines:

WHAT CHANGED: <the specific event, announcement, or development — 1 sentence, lead with subject>
WHY MARKETS CARE: <how this reprices a specific asset or changes positioning — name the instrument and the direction>
WHO WINS / LOSES: <name specific tickers, sectors, or asset classes with directional view, both sides if possible>
WHAT TO WATCH: <the next scheduled event, data release, or price level that resolves uncertainty — be specific>

Good vs. bad examples:
  GOOD WHAT CHANGED: "TSMC cut 2025 revenue guidance 8% citing weaker-than-expected AI server demand in H2."
  BAD WHAT CHANGED: "TSMC announced updates to its revenue expectations for the year ahead."

  GOOD WHY MARKETS CARE: "Forces consensus cuts to semiconductor earnings, widening HY credit spreads and pressuring AI capex cycle stocks."
  BAD WHY MARKETS CARE: "This could impact technology companies and investors may need to reconsider their positions."

  GOOD WHO WINS / LOSES: "Long: AMD, Intel (beneficiaries of TSMC share loss). Short: ASML, NVDA supply-chain names."
  BAD WHO WINS / LOSES: "Various companies in the technology sector could be affected in different ways."

  GOOD WHAT TO WATCH: "Q3 earnings call Oct 17; NVDA quarterly guidance Nov 20; ASML order book as leading indicator."
  BAD WHAT TO WATCH: "Future developments in the market and company announcements going forward."

Hard rules:
- Name tickers (AAPL), sectors (IG credit, EM equities), instruments (10Y UST, WTI crude), or spreads (HY-IG).
- Each line <= 30 words. No passive constructions. No hedging language.
- Base everything strictly on the provided headline and snippet — no invented facts.
- Output the four labelled lines only — no preamble, no closing remarks.\
"""


# ── Public interface ──────────────────────────────────────────────────────────

class SummarizeResult(NamedTuple):
    total:   int   # items passed in
    new:     int   # items that needed a fresh LLM call
    cached:  int   # items served from cache
    skipped: int   # items beyond MAX_AI_ITEMS cap


def summarize_items(
    items: list[FeedItem],
    model_name: str | None = None,
    max_items: int = MAX_AI_ITEMS,
    batch_size: int = _BATCH_SIZE,
    temperature: float = _TEMPERATURE,
) -> SummarizeResult:
    """
    Enrich FeedItems in-place with summary, why_it_matters, and impact.

    Items beyond max_items are left unsummarized (cards show raw snippet).
    Already-cached items are populated instantly without calling the LLM.
    """
    if not items:
        return SummarizeResult(0, 0, 0, 0)

    # model_name is informational only when LLM_BACKEND=openai; get_client() uses
    # settings.active_model (openai_model) regardless of what's passed here.
    _ = model_name  # accepted for API compat; backend determines actual model

    to_summarize = items[:max_items]
    skipped      = max(0, len(items) - max_items)

    n_cached  = 0
    needs_llm: list[FeedItem] = []

    for item in to_summarize:
        key = _item_cache_key(item)
        if key in _SUMMARY_CACHE:
            item.summary, item.why_it_matters, item.impact = _SUMMARY_CACHE[key]
            n_cached += 1
        else:
            needs_llm.append(item)

    if not needs_llm:
        log.debug("All %d items served from summary cache", n_cached)
        return SummarizeResult(len(items), 0, n_cached, skipped)

    client = get_client()
    for i in range(0, len(needs_llm), batch_size):
        batch = needs_llm[i : i + batch_size]
        _summarize_batch(batch, client, temperature)
        for item in batch:
            _SUMMARY_CACHE[_item_cache_key(item)] = (
                item.summary, item.why_it_matters, item.impact,
            )

    n_new = len(needs_llm)
    log.info("Summarization: %d new, %d cached, %d skipped", n_new, n_cached, skipped)
    return SummarizeResult(len(items), n_new, n_cached, skipped)


# ── Internals ────────────────────────────────────────────────────────────────

def _summarize_batch(batch: list[FeedItem], client, temperature: float) -> None:
    lines: list[str] = []
    for idx, item in enumerate(batch, 1):
        lines.append(f"ITEM {idx}")
        lines.append(f"Headline: {item.title}")
        if item.snippet:
            lines.append(f"Snippet: {item.snippet}")
        lines.append("")

    messages = [
        Message.system(_SYSTEM_PROMPT),
        Message.user("\n".join(lines)),
    ]

    try:
        response = "".join(client.chat(messages, stream=True, temperature=temperature))
        _parse_response(response, batch)
        log.debug("Summarized batch of %d", len(batch))
    except Exception as exc:
        log.warning("Summarization batch failed: %s", exc)
        for item in batch:
            if not item.summary:
                item.summary = item.snippet or item.title
            item.why_it_matters = ""
            item.impact         = ""


def _parse_response(text: str, batch: list[FeedItem]) -> None:
    """
    Parse ITEM blocks from the LLM response.

    Expected per-item format:
        ITEM <n>
        SUMMARY: <text>
        WHY IT MATTERS: <text>
        IMPACT: <text>
    """
    blocks = re.split(r"ITEM\s+(\d+)", text)
    parsed: dict[int, tuple[str, str, str]] = {}

    for j in range(1, len(blocks) - 1, 2):
        try:
            idx  = int(blocks[j])
            body = blocks[j + 1]

            sum_m = re.search(
                r"SUMMARY:\s*(.+?)(?=WHY IT MATTERS:|IMPACT:|$)",
                body, re.DOTALL | re.IGNORECASE,
            )
            why_m = re.search(
                r"WHY IT MATTERS:\s*(.+?)(?=IMPACT:|$)",
                body, re.DOTALL | re.IGNORECASE,
            )
            imp_m = re.search(
                r"IMPACT:\s*(.+?)$",
                body, re.DOTALL | re.IGNORECASE,
            )

            parsed[idx] = (
                sum_m.group(1).strip() if sum_m else "",
                why_m.group(1).strip() if why_m else "",
                imp_m.group(1).strip() if imp_m else "",
            )
        except Exception:
            pass

    for idx, item in enumerate(batch, 1):
        if idx in parsed:
            item.summary, item.why_it_matters, item.impact = parsed[idx]
        else:
            if not item.summary:
                item.summary = item.snippet or item.title


# ── On-demand deep analysis ───────────────────────────────────────────────────

class DeepAnalysis:
    """Result of an on-demand deep-analysis call (desk-note format)."""
    __slots__ = ("what_changed", "why_markets_care", "who_wins_loses", "what_to_watch")

    def __init__(
        self,
        what_changed:     str,
        why_markets_care: str,
        who_wins_loses:   str,
        what_to_watch:    str,
    ) -> None:
        self.what_changed     = what_changed
        self.why_markets_care = why_markets_care
        self.who_wins_loses   = who_wins_loses
        self.what_to_watch    = what_to_watch


def analyze_item_deep(
    title:      str,
    snippet:    str = "",
    model_name: str | None = None,
) -> DeepAnalysis:
    """
    Generate WHO BENEFITS/LOSES and TRADE ANGLE for a single news item.

    Results are cached by (title, snippet) hash.  The LLM is only called
    once per unique item; subsequent calls for the same content are instant.
    """
    raw = (title + "|" + snippet).encode("utf-8", errors="ignore")
    key = hashlib.md5(raw).hexdigest()

    if key in _DEEP_CACHE:
        log.debug("Deep analysis cache hit: %.60s", title)
        changed, why_care, who_wins, watch = _DEEP_CACHE[key]
        return DeepAnalysis(changed, why_care, who_wins, watch)

    _ = model_name  # informational only; backend determines actual model

    user_text = f"Headline: {title}"
    if snippet:
        user_text += f"\nSnippet: {snippet[:300]}"

    messages = [
        Message.system(_DEEP_SYSTEM_PROMPT),
        Message.user(user_text),
    ]

    changed = why_care = who_wins = watch = ""
    try:
        client   = get_client()
        response = "".join(client.chat(messages, stream=True, temperature=0.2)).strip()

        changed, why_care, who_wins, watch = _parse_deep_response(response)
        log.debug("Deep analysis done: %.60s", title)
    except Exception as exc:
        log.warning("Deep analysis failed for %.60s: %s", title, exc)

    _DEEP_CACHE[key] = (changed, why_care, who_wins, watch)
    return DeepAnalysis(changed, why_care, who_wins, watch)


def _parse_deep_response(text: str) -> tuple[str, str, str, str]:
    """
    Parse four labelled fields from a deep-analysis LLM response.

    Returns (what_changed, why_markets_care, who_wins_loses, what_to_watch).
    Missing or unparseable sections degrade gracefully to empty strings.
    If no labels are found at all, the raw text goes into what_changed.
    """
    _ANCHORS = r"(?:WHAT CHANGED|WHY MARKETS CARE|WHO WINS|WHAT TO WATCH)"

    def _extract(label_pattern: str) -> str:
        m = re.search(
            label_pattern + r"\s*[:/\-]\s*(.+?)(?=" + _ANCHORS + r"|$)",
            text, re.IGNORECASE | re.DOTALL,
        )
        return m.group(1).strip() if m else ""

    changed   = _extract(r"WHAT CHANGED")
    why_care  = _extract(r"WHY MARKETS CARE")
    who_wins  = _extract(r"WHO WINS\s*/?\s*LOSES?")
    watch     = _extract(r"WHAT TO WATCH(?:\s*NEXT)?")

    # Fallback: if nothing matched, surface raw text rather than empty desk note
    if not any((changed, why_care, who_wins, watch)):
        changed = text.strip()[:400]

    return changed, why_care, who_wins, watch


def clear_deep_cache() -> int:
    n = len(_DEEP_CACHE)
    _DEEP_CACHE.clear()
    return n


# ── Today's Take ──────────────────────────────────────────────────────────────

def _take_cache_key(items: list[FeedItem]) -> str:
    """Stable hash over the top-N summaries used as Take input."""
    raw = "|".join(
        (i.summary or i.title)[:80] for i in items
    ).encode("utf-8", errors="ignore")
    return hashlib.md5(raw).hexdigest()


def generate_market_take(
    items: list[FeedItem],
    model_name: str | None = None,
    top_n: int = 6,
) -> str:
    """
    Generate a 2-3 sentence market environment summary from top-scored stories.

    Selects the top_n items that already have AI summaries, ranked by
    institutional_score descending so consumer/personal-finance content
    is deprioritised even when it has a high raw signal_score.
    Cached by content hash — repeat refreshes with same stories are instant.
    Returns "" on failure or when there are fewer than 2 summarised items.
    """
    summarised = [i for i in items if i.summary]

    # Three-component sort: institutional quality + graph alignment + signal.
    # Consumer/retail items have low institutional_score so they rank last
    # even with high raw signal_score.  Bloomberg macro + graph-aligned stories lead.
    summarised.sort(
        key=lambda i: -(
            getattr(i, "institutional_score", 0.0) * 0.40
            + getattr(i, "graph_alignment_score", 0.0) * 0.20
            + i.signal_score * 0.40
        )
    )
    candidates = summarised[:top_n]

    log.info(
        "[take] candidates=%d / items=%d  summaries=%d",
        len(candidates), len(items),
        len(summarised),
    )
    for n, c in enumerate(candidates, 1):
        log.info(
            "[take]   #%d  inst=%.1f  qual=%.1f  noise=%.1f  source=%s  title=%.60s",
            n,
            getattr(c, "institutional_score", 0.0),
            getattr(c, "source_quality_score", 0.0),
            getattr(c, "consumer_noise_penalty", 0.0),
            c.source,
            c.title,
        )
    if len(candidates) < 2:
        log.warning("[take] not enough summarised items (%d) — skipping", len(candidates))
        return ""

    key = _take_cache_key(candidates)
    if key in _TAKE_CACHE:
        cached = _TAKE_CACHE[key]
        log.info("[take] cache hit  chars=%d  preview=%.80r", len(cached), cached)
        return cached

    lines = [
        f"{n}. {(i.summary or i.title)[:120]}"
        for n, i in enumerate(candidates, 1)
    ]
    messages = [
        Message.system(_TAKE_SYSTEM),
        Message.user("Top headlines today:\n" + "\n".join(lines)),
    ]
    log.info(
        "[take] calling LLM  backend=%s  model=%s  candidates=%d",
        settings.llm_backend, settings.active_model, len(candidates),
    )

    try:
        client = get_client()
        # stream=False — simpler error propagation; market take is short (2 sentences)
        raw = client.chat(messages, stream=False, temperature=0.3)
        take = (raw or "").strip()
        log.info("[take] raw response  chars=%d  preview=%.120r", len(take), take)
        if not take:
            log.warning("[take] LLM returned empty string — not caching")
            return ""
        _TAKE_CACHE[key] = take
        log.info("[take] done  chars=%d", len(take))
        return take
    except Exception:
        log.exception("[take] generation failed")
        return ""


def clear_take_cache() -> None:
    """Clear the Today's Take cache (e.g. for testing)."""
    _TAKE_CACHE.clear()


# ── Structured Market Brief ───────────────────────────────────────────────────

@dataclass
class MarketBrief:
    """Structured macro intelligence brief — replaces the plain market_take string."""
    primary_driver:    str
    market_regime:     str
    assets_impacted:   list[str] = field(default_factory=list)
    narrative_shift:   str       = ""
    trade_implication: str       = ""
    risk_scenario:     str       = ""
    confidence:        int       = 65   # 50–95


_BRIEF_SYSTEM = """\
You are the head of cross-asset strategy at a top-tier hedge fund, writing a structured brief for the CIO and portfolio managers.
From the market headlines provided, produce a structured brief. Output ONLY valid JSON — no markdown fences, no preamble, no explanation.

Required schema:
{
  "primary_driver":    "1 sentence — name the catalyst, what instrument or rate it moved (with magnitude if available), and the direct market effect",
  "market_regime":     "exactly one of: Risk-Off Hawkish | Risk-Off Neutral | Risk-On Dovish | Risk-On Neutral | Stagflationary | Neutral/Consolidating",
  "assets_impacted":   ["2–4 specific instruments or sectors, e.g. 10Y UST, EM equities, WTI crude, Nvidia"],
  "narrative_shift":   "1 sentence — how today's flow overturns or reinforces the prior consensus",
  "trade_implication": "1 sentence starting with long / short / overweight / underweight — name the exact instrument and the reason in one clause",
  "risk_scenario":     "1 sentence — name the specific event, data print, or policy move that would reverse this thesis",
  "confidence":        <integer 50–95>
}

Confidence: 50 = contradictory data, 65 = moderate conviction, 80 = strong consensus, 90–95 = overwhelming alignment.
Hard rules: Be specific — name instruments, figures, sectors. No hedging language. No filler. No "could", "may", "might", "suggests".\
"""

_BRIEF_CACHE: dict[str, MarketBrief] = {}


def _parse_market_brief(text: str) -> "MarketBrief | None":
    """Extract and validate JSON from LLM response."""
    m = re.search(r'\{.*\}', text, re.DOTALL)
    if not m:
        return None
    try:
        data = json.loads(m.group(0))
        return MarketBrief(
            primary_driver    = str(data.get("primary_driver", "")).strip(),
            market_regime     = str(data.get("market_regime", "Neutral/Consolidating")).strip(),
            assets_impacted   = [str(a).strip() for a in data.get("assets_impacted", [])[:4]],
            narrative_shift   = str(data.get("narrative_shift", "")).strip(),
            trade_implication = str(data.get("trade_implication", "")).strip(),
            risk_scenario     = str(data.get("risk_scenario", "")).strip(),
            confidence        = max(50, min(95, int(data.get("confidence", 65)))),
        )
    except Exception:
        return None


def generate_market_brief(
    items: list[FeedItem],
    top_n: int = 8,
) -> "MarketBrief | None":
    """
    Generate a structured macro intelligence brief from top-scored stories.

    Selects top_n items ranked by institutional_score descending, ensuring
    the brief is driven by market-moving institutional stories rather than
    consumer/personal-finance content.
    Returns None on failure or when there are fewer than 2 summarised items.
    Cached by content hash — repeat refreshes with same stories return instantly.
    """
    summarised = [i for i in items if i.summary]
    summarised.sort(
        key=lambda i: -(
            getattr(i, "institutional_score", 0.0) * 0.40
            + getattr(i, "graph_alignment_score", 0.0) * 0.20
            + i.signal_score * 0.40
        )
    )
    candidates = summarised[:top_n]
    if len(candidates) < 2:
        log.info("[brief] not enough summarised items (%d) — skipping", len(candidates))
        return None

    log.info("[brief] top candidates for market brief:")
    for n, c in enumerate(candidates, 1):
        log.info(
            "[brief]   #%d  inst=%.1f  qual=%.1f  noise=%.1f  score=%.1f  source=%s  title=%.55s",
            n,
            getattr(c, "institutional_score", 0.0),
            getattr(c, "source_quality_score", 0.0),
            getattr(c, "consumer_noise_penalty", 0.0),
            c.signal_score,
            c.source,
            c.title,
        )

    key = _take_cache_key(candidates)   # reuse same hash logic as market take
    if key in _BRIEF_CACHE:
        log.info("[brief] cache hit  regime=%s  confidence=%d",
                 _BRIEF_CACHE[key].market_regime, _BRIEF_CACHE[key].confidence)
        return _BRIEF_CACHE[key]

    lines = [
        f"{n}. {(i.summary or i.title)[:120]}"
        for n, i in enumerate(candidates, 1)
    ]
    messages = [
        Message.system(_BRIEF_SYSTEM),
        Message.user("Top market headlines today:\n" + "\n".join(lines)),
    ]
    log.info(
        "[brief] calling LLM  backend=%s  model=%s  candidates=%d",
        settings.llm_backend, settings.active_model, len(candidates),
    )

    try:
        client = get_client()
        raw = client.chat(messages, stream=False, temperature=0.2)
        brief = _parse_market_brief(raw or "")
        if brief and brief.primary_driver:
            _BRIEF_CACHE[key] = brief
            log.info("[brief] done  regime=%s  confidence=%d  assets=%s",
                     brief.market_regime, brief.confidence, brief.assets_impacted)
            return brief
        log.warning("[brief] parse failed or empty primary_driver  raw=%.120r", raw)
        return None
    except Exception:
        log.exception("[brief] generation failed")
        return None


def clear_brief_cache() -> None:
    _BRIEF_CACHE.clear()
