"""
app/events.py — the canonical Market Event and the editorial engine (F1).

Argus no longer ranks articles; it ranks MARKET EVENTS. An event is the
editorial elevation of a story cluster: one real-world occurrence (an FOMC
decision, an earnings report, a confirmed deal) with its articles demoted to
EVIDENCE. Everything downstream consumes events; articles never lead again.

Identity (load-bearing): MarketEvent.id == StoryCluster.id — the exact ids
that theme extraction already records as contributing_cluster_ids and that
the M3 institutional archive, the graph adapter, and the prediction ledger
already persist as evidence references. Elevating the cluster to an Event
therefore makes every existing memory/prediction evidence reference an EVENT
reference with zero migration.

EDITORIAL SCORE (ARGUS_FEED_EDITORIAL_STANDARD_V1 §3.1):

    EventScore = Base × Corroboration × Relevance × Decay

  Base           best-source tier in the cluster (0-40) + event-class weight
                 (0-30). Keywords ROUTE to a class; they never add points
                 (the E4 fix — headline stuffing pays nothing).
  Corroboration  1 + min(log2(distinct qualified sources), 2) × 0.25, ≤1.5×.
                 Qualified = source tier ≤ 2. Two independent confirmations
                 are a different animal; five are not much more than three.
  Relevance      theme linkage at the spine: 0.6 + 0.4·(max linked
                 conviction/100) when the event feeds an active theme;
                 floored at 0.6 for macro/policy classes so a genuine
                 off-thesis shock still surfaces; 0.35 otherwise
                 (discounted, never zeroed).
  Decay          exponential from the EVENT's first observation (earliest
                 member publish time — never the latest re-report; the E1/E2
                 fix: recency belongs to events, and "latest article wins"
                 is dead), with class-specific half-lives.

Suppression (opinion/retail/PR) remains upstream at stage 1 — an article
that score_item killed never reaches a cluster, so events inherit the
events-not-articles doctrine for free.
"""

from __future__ import annotations

import logging
import math
import re
from dataclasses import dataclass, field
from datetime import datetime, timezone

from app.companies import looks_like_ticker, resolve_companies

log = logging.getLogger(__name__)

EVENT_SCHEMA_VERSION = 1

# ── Event classes: weights + half-lives (routing, not scoring — E4) ───────────
# Ranked as a markets desk ranks them. price_echo decays by lunch; a macro
# shock still leads the afternoon.

CLASS_WEIGHT: dict[str, float] = {
    "macro":       30.0,   # central bank / hard macro release
    "policy":      26.0,   # policy, regulation, geopolitics
    "ma":          24.0,   # confirmed transaction events
    "earnings":    20.0,   # earnings / guidance events
    "single_name": 12.0,   # company catalyst
    "price_echo":   6.0,   # market-move echo coverage
    "market_event": 10.0,  # corroborated but unclassified market news
}

CLASS_HALF_LIFE_H: dict[str, float] = {
    "macro": 18.0, "policy": 18.0, "ma": 24.0, "earnings": 12.0,
    "single_name": 8.0, "price_echo": 3.0, "market_event": 10.0,
}

# class ROUTERS — deterministic, anchored on the event headline
_MACRO_RE = re.compile(
    r"\b(fed|fomc|ecb|boj|boe|pboc|rate (?:decision|cut|hike)|cpi|ppi|pce"
    r"|payrolls|jobs report|nonfarm|gdp|inflation (?:data|report|print)"
    r"|treasury auction|central bank)\b", re.I)
_POLICY_RE = re.compile(
    r"\b(tariffs?|sanctions?|regulat\w+|antitrust|white house|congress|senate"
    r"|executive order|export controls?|geopolit\w+|election|ban\b|subsid\w+)\b", re.I)
_MA_RE = re.compile(
    r"\b(acquir\w+|merger|takeover|buyout|to buy\b|agrees to (?:buy|acquire)"
    r"|all-cash deal|tender offer|acquisition)\b", re.I)
_EARNINGS_RE = re.compile(
    r"\b(earnings"                                     # earnings / release / call / report
    r"|quarterly (?:results|report|revenue|profit|update)"
    r"|financial results|reports? results|annual results"
    r"|trading update|investor presentation"
    r"|q[1-4] (?:results|revenue|profit|earnings|report)"
    r"|(?:fiscal )?(?:first|second|third|fourth)[ -]quarter"
    r"|full[- ]year (?:results|outlook|forecast|guidance)"
    r"|guidance|(?:beats?|miss(?:es)?) (?:estimates?|expectations?)"
    r"|10-[kq]\b|eps\b"
    r"|(?<!tax )revenue (?:guidance|outlook|beats?|misses?|rose|fell|grew|tops?|jumps?)"
    r")\b", re.I)
_PRICE_ECHO_RE = re.compile(
    r"\b(shares? (?:jump|surge|slide|sink|fall|rise|climb|drop|plunge|soar)\w*"
    r"|stock (?:jumps?|surges?|slides?|sinks?|falls?|rises?|drops?|plunges?)"
    r"|movers?|premarket|after.hours)\b", re.I)
_TICKERISH_RE = re.compile(r"\$[A-Z]{1,5}\b|\b[A-Z]{2,5}\b(?=\s+(?:shares|stock|earnings))")


def classify_event(title: str, snippet: str = "") -> str:
    """Route a headline to its event class. Precedence mirrors desk priority;
    a headline matching nothing specific is a plain market_event."""
    text = f"{title} {snippet}"
    if _MACRO_RE.search(text):
        return "macro"
    if _MA_RE.search(title):            # deals classify on the headline only
        return "ma"
    if _POLICY_RE.search(text):
        return "policy"
    if _EARNINGS_RE.search(text):
        return "earnings"
    if _PRICE_ECHO_RE.search(title):
        return "price_echo"
    if _TICKERISH_RE.search(title):
        return "single_name"
    return "market_event"


# ── The canonical Event object ─────────────────────────────────────────────────

# evidence document kinds — deterministic classification, no inference.
# "Management commentary" honesty rule: a transcript/filing/ir_release kind is
# the ONLY basis for attributing explanations to management; if none is
# present, the surface must say so rather than invent one.
_FILING_TITLE_RE = re.compile(r"\b(10-k|10-q|8-k|20-f|6-k|s-1|form 10)\b", re.I)
_TRANSCRIPT_RE = re.compile(
    r"\b(transcript|earnings call|conference call|prepared remarks)\b", re.I)
_IR_SOURCE_RE = re.compile(
    r"investor relations|business wire|pr newswire|globenewswire|newswire", re.I)


def evidence_kind(source: str, title: str) -> str:
    """Classify an evidence article: sec_filing | transcript | ir_release | news."""
    if "sec" in source.lower() or _FILING_TITLE_RE.search(title):
        return "sec_filing"
    if _TRANSCRIPT_RE.search(title):
        return "transcript"
    if _IR_SOURCE_RE.search(source) or "press release" in title.lower():
        return "ir_release"
    return "news"


@dataclass
class EventEvidence:
    """One article, demoted to evidence. Articles are never first-class again."""
    source: str
    title: str
    url: str
    published: str | None
    tier: int                     # 1 (wire) … 4 (aggregator)
    kind: str = "news"            # sec_filing | transcript | ir_release | news


@dataclass
class MarketEvent:
    id: str                       # == StoryCluster.id — the archive's evidence ref
    title: str
    event_type: str
    first_seen: str               # earliest member publish time (ISO, UTC)
    last_updated: str             # latest member publish time
    corroboration_count: int      # DISTINCT qualified sources (tier <= 2)
    source_count: int             # distinct sources of any tier
    evidence: list[EventEvidence] = field(default_factory=list)
    companies: list[str] = field(default_factory=list)
    industries: list[str] = field(default_factory=list)
    theme_ids: list[str] = field(default_factory=list)       # internal only
    narrative_keys: list[str] = field(default_factory=list)  # reserved (M3.2 records own narrative links)
    confidence: int = 0           # max linked theme conviction (0 when unthemed)
    editorial_score: float = 0.0
    why_it_matters: str = ""
    transmission: str | None = None   # strongest linked theme's causal narrative
    dominant: bool = False        # feeds the current dominant thesis
    developing: bool = False      # single qualified source, awaiting corroboration (F2 lane)
    reporting_period: str | None = None       # earnings events: "Q1".."Q4" | "FY" when stated
    merged_event_ids: list[str] = field(default_factory=list)  # cluster ids folded into this event
    schema_version: int = EVENT_SCHEMA_VERSION

    def to_dict(self) -> dict:
        return {
            "id": self.id, "title": self.title, "event_type": self.event_type,
            "first_seen": self.first_seen, "last_updated": self.last_updated,
            "corroboration_count": self.corroboration_count,
            "source_count": self.source_count,
            "evidence": [vars(e) for e in self.evidence],
            "companies": self.companies, "industries": self.industries,
            "theme_ids": self.theme_ids, "narrative_keys": self.narrative_keys,
            "confidence": self.confidence,
            "editorial_score": self.editorial_score,
            "why_it_matters": self.why_it_matters,
            "transmission": self.transmission,
            "dominant": self.dominant, "developing": self.developing,
            "reporting_period": self.reporting_period,
            "merged_event_ids": self.merged_event_ids,
            "schema_version": self.schema_version,
        }


# ── Reporting period (earnings events only) ───────────────────────────────────

_QUARTER_WORDS = {"first": "Q1", "second": "Q2", "third": "Q3", "fourth": "Q4"}
_PERIOD_WORD_RE = re.compile(
    r"\b(?:fiscal )?(first|second|third|fourth)[ -]quarter\b", re.I)
_PERIOD_Q_RE = re.compile(r"\bQ([1-4])\b", re.I)
_PERIOD_FY_RE = re.compile(
    r"\b(?:full[- ]year|annual results|10-k|fy ?20\d\d)\b", re.I)


def reporting_period(text: str) -> str | None:
    """Extract an explicitly stated reporting period — Q1..Q4 or FY. Returns
    None when the text names no period; nothing is inferred from dates."""
    m = _PERIOD_WORD_RE.search(text)
    if m:
        return _QUARTER_WORDS[m.group(1).lower()]
    m = _PERIOD_Q_RE.search(text)
    if m:
        return f"Q{m.group(1)}"
    if _PERIOD_FY_RE.search(text):
        return "FY"
    return None


# ── The editorial engine ────────────────────────────────────────────────────────

def _source_tier(source: str) -> int:
    from app.feeds import _source_tier as tier
    return tier(source)


def _members(cluster) -> list:
    return [cluster.primary, *(cluster.related or [])]


def editorial_score(event: MarketEvent, now: datetime) -> float:
    """EventScore = Base × Corroboration × Relevance × Decay (0-100)."""
    best_tier = min((e.tier for e in event.evidence), default=4)
    base_source = {1: 40.0, 2: 30.0, 3: 18.0, 4: 8.0}[best_tier]
    base = base_source + CLASS_WEIGHT.get(event.event_type, 10.0)

    corroboration = 1.0 + min(math.log2(max(event.corroboration_count, 1)), 2.0) * 0.25

    if event.theme_ids:
        relevance = 0.6 + 0.4 * (event.confidence / 100.0)
    elif event.event_type in ("macro", "policy"):
        relevance = 0.6      # a genuine off-thesis shock must still surface
    else:
        relevance = 0.35     # discounted, never zeroed

    try:
        first = datetime.fromisoformat(event.first_seen)
        age_h = max(0.0, (now - first).total_seconds() / 3600.0)
    except ValueError:
        age_h = 0.0
    half_life = CLASS_HALF_LIFE_H.get(event.event_type, 10.0)
    decay = 0.5 ** (age_h / half_life)

    return round(min(100.0, base * corroboration * relevance * decay), 1)


def _fold_duplicate_earnings(events: list[MarketEvent],
                             now: datetime) -> list[MarketEvent]:
    """One company, one reporting period, one Feed appearance: fold earnings
    events that name the same single company and the same explicit period into
    the strongest one, carrying all source documents as evidence. Conservative
    by design — multi-company roundups and events with no stated period are
    never folded (upstream clustering owns fuzzier merges)."""
    keepers: dict[tuple[str, str], MarketEvent] = {}
    out: list[MarketEvent] = []
    for ev in sorted(events, key=lambda e: (-e.editorial_score, e.id)):
        if not (ev.event_type == "earnings"
                and len(ev.companies) == 1
                and ev.reporting_period):
            out.append(ev)
            continue
        key = (ev.companies[0], ev.reporting_period)
        keeper = keepers.get(key)
        if keeper is None:
            keepers[key] = ev
            out.append(ev)
            continue
        # fold ev into keeper: evidence union (by url), clocks, linkage
        known_urls = {e.url for e in keeper.evidence}
        keeper.evidence.extend(e for e in ev.evidence if e.url not in known_urls)
        keeper.merged_event_ids.append(ev.id)
        keeper.first_seen = min(keeper.first_seen, ev.first_seen)
        keeper.last_updated = max(keeper.last_updated, ev.last_updated)
        keeper.source_count = len({e.source for e in keeper.evidence})
        keeper.corroboration_count = len(
            {e.source for e in keeper.evidence if e.tier <= 2})
        keeper.developing = keeper.corroboration_count <= 1 and keeper.source_count <= 1
        for tid in ev.theme_ids:
            if tid not in keeper.theme_ids:
                keeper.theme_ids.append(tid)
        keeper.confidence = max(keeper.confidence, ev.confidence)
        keeper.dominant = keeper.dominant or ev.dominant
        keeper.transmission = keeper.transmission or ev.transmission
        keeper.why_it_matters = keeper.why_it_matters or ev.why_it_matters
    for keeper in keepers.values():
        if keeper.merged_event_ids:
            keeper.editorial_score = editorial_score(keeper, now)
    return out


def build_market_events(clusters: list, themes: list,
                        now: datetime | None = None) -> list[MarketEvent]:
    """Elevate story clusters into ranked Market Events (one event per
    cluster, exactly once). Pure and deterministic for fixed inputs."""
    now = now or datetime.now(timezone.utc)

    # theme linkage: contributing_cluster_ids are event ids by identity
    themes_by_event: dict[str, list] = {}
    for t in themes or []:
        for cid in (getattr(t, "contributing_cluster_ids", None) or []):
            themes_by_event.setdefault(cid, []).append(t)
    top_theme_id = None
    if themes:
        top_theme_id = max(themes, key=lambda t: (getattr(t, "confidence", 0) or 0)).id

    events: list[MarketEvent] = []
    for cluster in clusters or []:
        members = _members(cluster)
        if not members:
            continue

        evidence: list[EventEvidence] = []
        seen_urls: set[str] = set()
        for m in members:
            url = getattr(m, "url", "") or ""
            if url in seen_urls:
                continue
            seen_urls.add(url)
            src = getattr(m, "source", "") or "?"
            ttl = getattr(m, "title", "") or ""
            evidence.append(EventEvidence(
                source=src,
                title=ttl,
                url=url,
                published=m.published_dt.isoformat() if getattr(m, "published_dt", None) else None,
                tier=_source_tier(src),
                kind=evidence_kind(src, ttl),
            ))

        published = [m.published_dt for m in members if getattr(m, "published_dt", None)]
        first_seen = min(published).isoformat() if published else now.isoformat()
        last_updated = max(published).isoformat() if published else now.isoformat()

        sources = {e.source for e in evidence}
        qualified = {e.source for e in evidence if e.tier <= 2}

        linked = sorted(themes_by_event.get(cluster.id, []),
                        key=lambda t: -(getattr(t, "confidence", 0) or 0))
        strongest = linked[0] if linked else None

        # Companies come from the canonical registry resolver over the event's
        # own text (an uppercase token is not a company until it resolves), plus
        # theme ontology assets — a curated source that is not re-litigated.
        member_text = " ".join(
            f"{getattr(m, 'title', '') or ''} {getattr(m, 'snippet', '') or ''}"
            for m in members
        )
        entity_hints = [
            ent for m in members
            for ent in (getattr(m, "affected_entities", None) or [])
        ]
        companies: list[str] = resolve_companies(member_text, entities=entity_hints)
        industries: list[str] = []
        for t in linked:
            for a in (getattr(t, "related_assets", None) or []):
                if looks_like_ticker(a) and a not in companies:
                    companies.append(a)
            for ind in (getattr(t, "related_industries", None) or []):
                if ind not in industries:
                    industries.append(ind)

        etype = classify_event(getattr(cluster.primary, "title", "") or "",
                               getattr(cluster.primary, "snippet", "") or "")
        event = MarketEvent(
            id=cluster.id,
            title=getattr(cluster.primary, "title", "") or cluster.theme_label,
            event_type=etype,
            first_seen=first_seen,
            last_updated=last_updated,
            corroboration_count=len(qualified),
            source_count=len(sources),
            evidence=evidence,
            companies=companies[:8],
            industries=industries[:6],
            theme_ids=[t.id for t in linked],
            confidence=int(getattr(strongest, "confidence", 0) or 0) if strongest else 0,
            why_it_matters=getattr(cluster.primary, "why_it_matters", "") or "",
            transmission=(getattr(strongest, "causal_narrative", "") or None) if strongest else None,
            dominant=bool(strongest and top_theme_id and strongest.id == top_theme_id),
            developing=len(qualified) == 1 and len(sources) == 1,
            reporting_period=reporting_period(member_text) if etype == "earnings" else None,
        )
        event.editorial_score = editorial_score(event, now)
        events.append(event)

    events = _fold_duplicate_earnings(events, now)
    events.sort(key=lambda e: (-e.editorial_score, e.id))
    if events:
        log.info("[events] built %d market events  top=%r score=%.1f type=%s sources=%d",
                 len(events), events[0].title[:60], events[0].editorial_score,
                 events[0].event_type, events[0].source_count)
    return events
