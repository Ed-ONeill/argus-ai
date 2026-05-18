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
import logging
import re
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
You are a market analyst writing for institutional investors. Write exactly 2 sentences. No preamble, no labels.

Sentence 1: State the dominant market catalyst right now and its direct effect on prices or credit.
Sentence 2: State the clearest near-term risk or opportunity this creates, and for which asset class.

Rules: Name specifics — instruments, sectors, figures. Cut all filler ("as investors digest", "amid uncertainty", "it is worth noting", "market participants"). Plain declarative sentences only.\
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
You are a concise financial news analyst serving private equity and investment professionals.

For each numbered news item, write exactly three labelled lines:

ITEM <n>
SUMMARY: <2 sentences — factual account of what happened>
WHY IT MATTERS: <1 sentence — the key investment or market implication>
IMPACT: <directional label — e.g. "Bullish for PE dealmaking", "Bearish for credit spreads", "Neutral — macro uncertainty">

Rules:
- Base everything strictly on the headline and snippet provided.
- Do not invent facts, statistics, or names not present in the source.
- Keep each field tight: SUMMARY ≤ 40 words, WHY IT MATTERS ≤ 20 words, IMPACT ≤ 10 words.
- WHY IT MATTERS must use active, market-driving language. Use verbs like: signals, drives, pressures, forces, triggers, lifts, weighs on, reflects, tightens, widens.
- Avoid ALL soft or hedging language in WHY IT MATTERS: never use "indicates", "suggests", "potential", "could", "may", "might", "possibly", "faces difficulties", "amid uncertainty", "it is worth noting", or "as investors digest".
- Name the specific asset class, sector, or instrument that moves — not just "markets" or "investors".
- Output ITEM blocks only — no preamble, commentary, or closing remarks.\
"""

_DEEP_SYSTEM_PROMPT = """\
You are a sell-side analyst writing a desk note for an equity trader.
Given a news headline and snippet, output EXACTLY these four labelled lines:

WHAT CHANGED: <the specific event, announcement, or development — 1 sentence>
WHY MARKETS CARE: <how this flows into prices or changes expectations — 1 sentence>
WHO WINS / LOSES: <specific companies, sectors, or asset classes with directional view — 1 sentence>
WHAT TO WATCH: <the next data point, event, or threshold that resolves uncertainty — 1 sentence>

Rules:
- Be specific: name tickers, sectors, instruments, or figures where relevant.
- Base everything strictly on the provided headline and snippet — no invented facts.
- Each line ≤ 30 words.
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

    model = model_name or settings.ollama_model
    settings.ollama_model = model

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

    model = model_name or settings.ollama_model
    settings.ollama_model = model

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

    Uses the top_n items that already have AI summaries.  Cached by content
    hash, so repeat refreshes with the same stories are instant.
    Returns "" on failure or when there are fewer than 2 summarised items.
    """
    candidates = [i for i in items if i.summary][:top_n]
    log.info(
        "[take] candidates=%d / items=%d  summaries=%d",
        len(candidates), len(items),
        sum(1 for i in items if i.summary),
    )
    if len(candidates) < 2:
        log.warning("[take] not enough summarised items (%d) — skipping", len(candidates))
        return ""

    key = _take_cache_key(candidates)
    if key in _TAKE_CACHE:
        cached = _TAKE_CACHE[key]
        log.info("[take] cache hit  chars=%d  preview=%.80r", len(cached), cached)
        return cached

    model = model_name or settings.ollama_model
    lines = [
        f"{n}. {(i.summary or i.title)[:120]}"
        for n, i in enumerate(candidates, 1)
    ]
    messages = [
        Message.system(_TAKE_SYSTEM),
        Message.user("Top headlines today:\n" + "\n".join(lines)),
    ]
    log.info("[take] calling LLM  backend=%s  candidates=%d", settings.llm_backend, len(candidates))

    try:
        client = get_client()
        settings.ollama_model = model
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
