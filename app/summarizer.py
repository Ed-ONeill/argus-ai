"""
app/summarizer.py — AI enrichment for Market Feed items

LEGACY-PATH (IRE-1, ARGUS_INSTITUTIONAL_REASONING_ENGINE_V1, audit R1/R2):
WHY IT MATTERS and IMPACT are LLM-minted interpretation, superseded as
reasoning by the canonical backend Explanation (app/explanations.py —
evidence/position/delta sections). They survive strictly as labeled voice
riding BESIDE the Explanation, never inside or as it, and are demoted when
Feed cards consume Explanations (IRE-5). Do not add new interpretive fields
here; new meaning lands in the reasoning engine.

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

# RC2-B1: MAX_AI_ITEMS is the maximum number of UNCACHED items that may consume a
# NEW enrichment call in one cycle. It is NOT "the first 15 positions in the feed".
# Cache restoration happens for EVERY item and costs no capacity, so a pool whose
# top-ranked items are already enriched still reaches 15 genuinely new items
# further down the candidate list.
MAX_AI_ITEMS = 15   # max NEW (uncached) enrichment calls per refresh

# Category-protected allocation. A floor is a maximum RESERVED OPPORTUNITY, never a
# quota: a category with fewer eligible uncached candidates than its floor
# immediately returns the unused capacity to the global overflow. Floors exist
# because the feed's display order buckets by publication hour, which structurally
# starves slower-cadence desks (M&A sources publish far less often than the wires),
# not because those desks score lower - the RC2-B audit measured 9 of 11 M&A items
# scoring ABOVE the weakest item the old positional cap selected.
#
# Centralized here: selection logic reads this table and nothing else.
CATEGORY_FLOORS: dict[str, int] = {
    "M&A":          4,
    "Company":      3,
    "Markets":      4,
    "Geopolitical": 2,
}
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
    new:     int   # items selected for a fresh LLM call
    cached:  int   # items restored from cache (cost no capacity)
    skipped: int   # uncached items that did not fit the new-call budget
    enriched: int = 0                              # calls that produced a VALID result
    by_category: dict[str, int] | None = None      # new-call selections per category


def enrichment_rank_key(item: FeedItem) -> tuple:
    """The ranking authority for enrichment selection.

    RC2-B1 deliberately reuses the feed's OWN quality composite -
    ``institutional_score * 0.45 + signal_score * 0.55`` - the exact expression
    app/feeds.py already uses as the quality term of its sort. No second scoring
    system is introduced here.

    What is NOT reused is the feed's leading sort term, the publication-hour
    bucket. That term is a DISPLAY ordering decision, and applying it to
    enrichment selection is precisely what starved slower-cadence categories.
    Feed ordering itself is untouched by this module.

    `url` is the final tiebreaker so identical inputs always select identically.
    """
    composite = item.institutional_score * 0.45 + item.signal_score * 0.55
    return (-composite, item.url or "", item.title or "")


def select_for_enrichment(
    candidates: list[FeedItem],
    max_new:    int = MAX_AI_ITEMS,
    floors:     dict[str, int] | None = None,
) -> list[FeedItem]:
    """Choose which UNCACHED items get a new enrichment call.

    Two passes, both over the same ranking authority:

      1. FLOORS - each configured category may claim up to its floor, taking its
         own strongest candidates first. A category with fewer candidates than its
         floor simply claims fewer; the remainder is not held in reserve.
      2. OVERFLOW - every remaining slot goes to the best remaining candidate
         regardless of category, so unused floor capacity is recovered
         automatically and no slot is ever left idle while work exists.

    Deterministic for identical inputs. Never selects more than `max_new`.
    """
    if max_new <= 0 or not candidates:
        return []
    table = CATEGORY_FLOORS if floors is None else floors
    ranked = sorted(candidates, key=enrichment_rank_key)

    chosen: list[FeedItem] = []
    taken: set[int] = set()

    # 1. floors, in a fixed category order so the outcome is reproducible
    for category in sorted(table):
        floor = table.get(category, 0)
        if floor <= 0:
            continue
        claimed = 0
        for item in ranked:
            if claimed >= floor or len(chosen) >= max_new:
                break
            if id(item) in taken or item.category != category:
                continue
            chosen.append(item)
            taken.add(id(item))
            claimed += 1

    # 2. global ranked overflow - reclaims every unfilled floor slot
    for item in ranked:
        if len(chosen) >= max_new:
            break
        if id(item) in taken:
            continue
        chosen.append(item)
        taken.add(id(item))

    return chosen


def summarize_items(
    items: list[FeedItem],
    model_name: str | None = None,
    max_items: int = MAX_AI_ITEMS,
    batch_size: int = _BATCH_SIZE,
    temperature: float = _TEMPERATURE,
    floors: dict[str, int] | None = None,
) -> SummarizeResult:
    """
    Enrich FeedItems in-place with summary, why_it_matters, and impact.

    RC2-B1 order of operations:
      1. restore the cache for EVERY item - free, and consumes no capacity, so an
         item enriched in an earlier cycle keeps its enrichment even after it has
         slid down the feed (the old code only restored the first 15 positions,
         so enrichment was silently lost as items aged);
      2. allocate the new-call budget across the UNCACHED remainder using category
         floors plus globally ranked overflow;
      3. cache ONLY results that satisfy the output contract, so a failure or a
         malformed response stays retryable instead of being frozen as an empty
         enrichment.

    Items outside the budget keep honest empty fields. Nothing is fabricated.
    """
    if not items:
        return SummarizeResult(0, 0, 0, 0, 0, {})

    # model_name is informational only when LLM_BACKEND=openai; get_client() uses
    # settings.active_model (openai_model) regardless of what's passed here.
    _ = model_name  # accepted for API compat; backend determines actual model

    # 1. cache restoration for the WHOLE pool - costs nothing, reserves nothing.
    #    Items sharing a cache key (byte-identical title+url republished by two
    #    sources) are collapsed to ONE unit of work: the first is enriched and its
    #    twins receive the same result, instead of each burning a separate slot.
    n_cached = 0
    uncached: list[FeedItem] = []
    twins: dict[str, list[FeedItem]] = {}
    for item in items:
        key = _item_cache_key(item)
        hit = _SUMMARY_CACHE.get(key)
        if hit is not None:
            item.summary, item.why_it_matters, item.impact = hit
            n_cached += 1
        elif key in twins:
            twins[key].append(item)
        else:
            twins[key] = []
            uncached.append(item)

    if not uncached:
        log.debug("All %d items served from summary cache", n_cached)
        return SummarizeResult(len(items), 0, n_cached, 0, 0, {})

    # 2. allocate the new-call budget.
    selected = select_for_enrichment(uncached, max_items, floors)
    skipped  = len(uncached) - len(selected)
    by_category: dict[str, int] = {}
    for item in selected:
        by_category[item.category] = by_category.get(item.category, 0) + 1

    # 3. enrich, caching only what actually succeeded.
    client = get_client()
    n_enriched = 0
    for i in range(0, len(selected), batch_size):
        batch = selected[i : i + batch_size]
        valid = _summarize_batch(batch, client, temperature)
        for item in valid:
            key = _item_cache_key(item)
            payload = (item.summary, item.why_it_matters, item.impact)
            _SUMMARY_CACHE[key] = payload
            n_enriched += 1
            for twin in twins.get(key, ()):          # same story, same enrichment
                twin.summary, twin.why_it_matters, twin.impact = payload

    log.info(
        "Summarization: %d selected, %d enriched, %d cached, %d skipped  alloc=%s",
        len(selected), n_enriched, n_cached, skipped, by_category,
    )
    return SummarizeResult(len(items), len(selected), n_cached, skipped, n_enriched, by_category)


# ── Internals ────────────────────────────────────────────────────────────────

def _is_valid_enrichment(item: FeedItem) -> bool:
    """The output contract an item must satisfy to be cacheable.

    `summary` alone is not enough: `_parse_response` back-fills `summary` from the
    item's own snippet/title when a block is missing, which is a DISPLAY fallback,
    not enrichment. `why_it_matters` is the field only the model can produce, so a
    result counts only when both are present.
    """
    return bool((item.summary or "").strip()) and bool((item.why_it_matters or "").strip())


def _summarize_batch(batch: list[FeedItem], client, temperature: float) -> list[FeedItem]:
    """Enrich one batch in place; return ONLY the items that produced a valid result.

    RC2-B1: the caller caches exactly what this returns. A transport failure, a
    timeout, a malformed response or a missing ITEM block therefore leaves the item
    UNCACHED and retryable on the next refresh, instead of freezing an empty
    enrichment forever. One bad item in a batch cannot invalidate its siblings, and
    nothing here ever invents a `why_it_matters`.
    """
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
    except Exception as exc:
        # Transport/timeout: nothing was produced. Fall back to the item's own text
        # for display only, cache nothing, and leave every item retryable.
        log.warning("Summarization batch failed (%d items retryable): %s", len(batch), exc)
        for item in batch:
            if not item.summary:
                item.summary = item.snippet or item.title
        return []

    try:
        _parse_response(response, batch)
    except Exception as exc:
        # A malformed payload is a parse failure, not an empty enrichment.
        log.warning("Summarization parse failed (%d items retryable): %s", len(batch), exc)
        for item in batch:
            if not item.summary:
                item.summary = item.snippet or item.title
        return []

    valid = [item for item in batch if _is_valid_enrichment(item)]
    if len(valid) < len(batch):
        log.info(
            "Batch of %d produced %d valid enrichments; %d stay retryable",
            len(batch), len(valid), len(batch) - len(valid),
        )
    return valid


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

    # Memory grounding: give the model the VERIFIED cross-session record of what
    # has strengthened / weakened / gone stale, with conviction trajectories, so
    # narrative_shift explains genuine change vs prior consensus instead of being
    # reactive to one day's headlines. These are stored facts — the instruction is
    # explicit that the model must NOT invent history beyond them.
    try:
        from app.theme_memory import brief_memory_context
        _mem_ctx = brief_memory_context()
    except Exception:
        _mem_ctx = ""

    user_blocks = ["Top market headlines today:\n" + "\n".join(lines)]
    if _mem_ctx:
        user_blocks.append(
            "Verified theme memory (how themes have evolved across prior sessions — "
            "use ONLY these facts to describe what changed/strengthened/weakened, "
            "do not invent any other prior history):\n" + _mem_ctx
        )
    messages = [
        Message.system(_BRIEF_SYSTEM),
        Message.user("\n\n".join(user_blocks)),
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
