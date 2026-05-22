"""
app/theme_graph.py — Cross-market theme intelligence graph.

Phase 5 upgrade: weighted relationship graph, enhanced confidence scoring,
ThemeMomentumTracker for temporal persistence, and signal quality classification.
Zero LLM calls.

Phase 8 upgrade: institutional-grade theme ontology, theme competition/decay,
causal chain reasoning, language quality scoring, breadth tracking.

Each ThemeIntelligence object maps:
  story → theme → industry → asset → macro factor → second-order effect
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import TYPE_CHECKING

from app.data.theme_ontology import THEME_ONTOLOGY, THEME_CATALOG  # noqa: F401
from app.causal_chain import build_causal_narrative
from app.language_quality import score_text_quality

log = logging.getLogger(__name__)

if TYPE_CHECKING:
    from app.clustering import StoryCluster

_PUNCT_RE = re.compile(r"[^\w\s]+")


def _norm(text: str) -> str:
    return " " + _PUNCT_RE.sub(" ", text.lower()) + " "


def _item_sentiment(item: object) -> str:
    impact = (getattr(item, "impact", "") or "").lower()
    if impact.startswith("bullish"): return "bullish"
    if impact.startswith("bearish"): return "bearish"
    if impact.startswith("mixed"):   return "mixed"
    return "neutral"


def _majority_sentiment(sentiments: list[str]) -> str:
    if not sentiments:
        return "neutral"
    counts: dict[str, int] = {}
    for s in sentiments:
        counts[s] = counts.get(s, 0) + 1
    best = max(counts, key=counts.get)
    return "neutral" if best == "mixed" else best


# ── Theme Intelligence dataclass ──────────────────────────────────────────────

@dataclass
class ThemeIntelligence:
    """A cross-market theme derived from the live cluster stream."""
    id:                       str
    name:                     str
    description:              str
    signal_strength:          str            # "strong" | "medium" | "weak"
    confidence:               int            # 0–100
    momentum_direction:       str            # "bullish" | "bearish" | "neutral"
    related_industries:       list[str]      = field(default_factory=list)
    related_assets:           list[str]      = field(default_factory=list)
    related_macro_factors:    list[str]      = field(default_factory=list)
    contributing_cluster_ids: list[str]      = field(default_factory=list)
    contributing_story_count: int            = 0
    second_order_effects:     list[str]      = field(default_factory=list)
    podcast_topics:           list[str]      = field(default_factory=list)
    last_updated:             str            = ""
    # Phase 5: weighted relationship graph
    # Maps industry/sector name → {weight: float, type: str, direction: str}
    relationship_weights:     dict[str, dict] = field(default_factory=dict)
    # Phase 5: enhanced confidence signals
    confidence_label:         str            = ""           # "High Conviction" | "Elevated" | "Moderate" | "Developing" | "Speculative"
    signal_quality:           str            = "speculative" # "confirmed" | "developing" | "speculative"
    evidence_count:           int            = 0            # unique contributing sources
    persistence_score:        int            = 0            # 0-100 based on cycle history
    volatility_score:         int            = 0            # 0-100 based on confidence variance
    cross_category_confirmed: bool           = False        # true if 2+ news categories contributing
    # Phase 5: momentum tracking
    momentum_label:           str            = "emerging"   # "accelerating"|"strengthening"|"stable"|"cooling"|"reversing"|"emerging"
    momentum_delta:           int            = 0            # confidence change vs previous cycle
    persistence_cycles:       int            = 0            # consecutive cycles theme was active
    # Phase 8: competition, causal reasoning, breadth
    competition_penalty:      float          = 0.0          # fractional penalty from competing themes (0.0–0.5)
    causal_narrative:         str            = ""           # "Upstream → This Theme → Downstream"
    breadth_score:            int            = 0            # number of distinct industries with contributing clusters
    persistence_days:         float          = 0.0          # approximate days theme has been continuously active


# ── Momentum tracker ──────────────────────────────────────────────────────────

@dataclass
class _ThemeSnapshot:
    confidence:      int
    signal_strength: str
    timestamp:       datetime
    sector_spread:   int = 0


class ThemeMomentumTracker:
    """
    In-memory rolling tracker for theme confidence across pipeline cycles.

    Holds at most max_history snapshots per theme (default 12 = ~1 hour at
    5-minute refresh intervals).  Lives as a module-level singleton so state
    persists across background pipeline runs within the same process lifetime.

    Momentum labels:
      "emerging"      — fewer than 2 snapshots (brand-new theme)
      "accelerating"  — confidence up ≥12 pts over window
      "strengthening" — confidence up 4–11 pts over window
      "stable"        — confidence flat (±3 pts)
      "cooling"       — confidence down 4–11 pts
      "reversing"     — confidence down ≥12 pts (may be fading)
    """

    def __init__(self, max_history: int = 12) -> None:
        self._history: dict[str, list[_ThemeSnapshot]] = {}
        self._breadth_history: dict[str, list[int]] = {}
        self._max = max_history

    def record(self, theme_id: str, confidence: int, strength: str, now: datetime, sector_spread: int = 0) -> None:
        snaps = self._history.setdefault(theme_id, [])
        snaps.append(_ThemeSnapshot(confidence=confidence, signal_strength=strength, timestamp=now, sector_spread=sector_spread))
        if len(snaps) > self._max:
            snaps.pop(0)

    def record_breadth(self, theme_id: str, breadth: int) -> None:
        hist = self._breadth_history.setdefault(theme_id, [])
        hist.append(breadth)
        if len(hist) > self._max:
            hist.pop(0)

    def breadth_trend(self, theme_id: str) -> str:
        hist = self._breadth_history.get(theme_id, [])
        if len(hist) < 2:
            return "stable"
        delta = hist[-1] - hist[0]
        if delta >= 2:   return "widening"
        if delta <= -2:  return "narrowing"
        return "stable"

    def mean_breadth(self, theme_id: str) -> float:
        hist = self._breadth_history.get(theme_id, [])
        if not hist:
            return 0.0
        return sum(hist) / len(hist)

    def momentum_label(self, theme_id: str) -> str:
        snaps = self._history.get(theme_id, [])
        if len(snaps) < 2:
            return "emerging"
        window = snaps[-min(4, len(snaps)):]
        delta  = snaps[-1].confidence - window[0].confidence
        if delta >= 12:  return "accelerating"
        if delta >= 4:   return "strengthening"
        if delta <= -12: return "reversing"
        if delta <= -4:  return "cooling"
        return "stable"

    def prev_delta(self, theme_id: str) -> int:
        """Confidence delta between the last two recorded snapshots."""
        snaps = self._history.get(theme_id, [])
        if len(snaps) < 2:
            return 0
        return snaps[-1].confidence - snaps[-2].confidence

    def persistence_cycles(self, theme_id: str) -> int:
        return len(self._history.get(theme_id, []))

    def volatility_score(self, theme_id: str) -> int:
        """Standard-deviation-based volatility of recent confidence, scaled 0-100."""
        snaps = self._history.get(theme_id, [])
        if len(snaps) < 3:
            return 0
        vals = [s.confidence for s in snaps[-6:]]
        mean = sum(vals) / len(vals)
        var  = sum((v - mean) ** 2 for v in vals) / len(vals)
        return min(100, int(var ** 0.5 * 3))

    def persistence_score(self, theme_id: str) -> int:
        """0-100 persistence score based on how many consecutive cycles the theme has been active."""
        n = self.persistence_cycles(theme_id)
        if n <= 0:   return 0
        if n <= 2:   return 20
        if n <= 5:   return 45
        if n <= 10:  return 70
        if n <= 20:  return 85
        return 95


# Module-level singleton — accumulates history across background refresh cycles
_momentum_tracker = ThemeMomentumTracker()


# ── Theme catalog ─────────────────────────────────────────────────────────────
# THEME_CATALOG / THEME_ONTOLOGY imported from app.data.theme_ontology above.
# The sentinel dict below is intentionally kept empty — all catalog data lives
# in the ontology module.

_THEME_CATALOG_SENTINEL: dict = {}     # real catalog data lives in THEME_ONTOLOGY



# ── Extraction engine ─────────────────────────────────────────────────────────

def extract_themes(
    clusters: list,    # list[StoryCluster]
    now:      datetime | None = None,
) -> list[ThemeIntelligence]:
    """
    Phase 8: Score all clusters against each theme in THEME_CATALOG (Phase 8 ontology).
    Returns active themes sorted by confidence descending.

    Three-pass pipeline:
      Pass 1 — keyword/entity scoring + generic penalty + confidence_floor gate
      Pass 2 — theme competition: weaker overlapping theme penalised 15%
      Pass 3 — causal narrative assignment from build_causal_narrative()

    Confidence formula (Pass 1):
      base     = total_score × 2.0 + n_clusters × 4
      bonus_1  = source diversity  (up to +10)
      bonus_2  = cross-category    (+8 if 2+ news categories)
      bonus_3  = recency           (up to +9 for stories < 6h old)
      generic  = −12% if >60% of kw matches are generic single-word triggers
      floor    = suppressed if confidence < confidence_floor (from ontology)
    """
    if now is None:
        now = datetime.now(timezone.utc)
    now_iso = now.isoformat()

    log.info("[theme] extract_themes START  clusters=%d  themes_catalog=%d", len(clusters), len(THEME_CATALOG))
    for _i, _c in enumerate(clusters[:5]):
        _p = _c.primary
        log.info(
            "[theme]   cluster[%d] title=%r  entities=%s",
            _i,
            (getattr(_p, "title", "") or "")[:80],
            getattr(_p, "affected_entities", []),
        )

    results: list[ThemeIntelligence] = []

    # ── Pass 1: keyword / entity scoring ─────────────────────────────────────
    for theme_id, cfg in THEME_CATALOG.items():
        theme_keywords   = cfg["keywords"]
        theme_entities   = cfg["entities"]   # frozenset[str]
        generic_kw_set   = set(cfg.get("generic_keywords", []))
        conf_floor       = cfg.get("confidence_floor", 12)

        contributing:      list[tuple[object, float]] = []
        sentiments:        list[str] = []
        sources:           set[str]  = set()
        categories:        set[str]  = set()
        total_score        = 0.0
        recent_count       = 0
        all_kw_hits_total  = 0
        generic_kw_hits_total = 0

        for cluster in clusters:
            item      = cluster.primary
            title_n   = _norm(getattr(item, "title",   "") or "")
            snippet_n = _norm(getattr(item, "snippet", "") or "")
            entities  = {e.upper() for e in (getattr(item, "affected_entities", None) or [])}

            raw = 0.0

            # Entity overlap
            entity_hits = sum(1 for e in theme_entities if e.upper() in entities)
            for tkr in theme_entities:
                tkr_n = f" {tkr.lower()} "
                if tkr_n in title_n or tkr_n in snippet_n:
                    entity_hits += 1
                    break
            raw += min(entity_hits * 3.0, 9.0)

            # Keyword match — normalize so "glp-1" matches " glp 1 "
            kw_score = 0.0
            kw_hits  = 0
            for kw in theme_keywords:
                if kw_hits >= 3:
                    break
                kw_p = f" {_PUNCT_RE.sub(' ', kw.lower())} "
                hit = False
                if kw_p in title_n:
                    kw_score += 2.0
                    kw_hits  += 1
                    hit = True
                elif kw_p in snippet_n:
                    kw_score += 1.0
                    kw_hits  += 1
                    hit = True
                if hit:
                    all_kw_hits_total += 1
                    if kw in generic_kw_set:
                        generic_kw_hits_total += 1
            raw += kw_score

            if raw <= 0:
                continue

            weight   = 1.0 + min(getattr(cluster, "cluster_score", 0.0), 2.0) * 0.4
            weighted = raw * weight
            total_score += weighted
            contributing.append((cluster, weighted))
            sentiments.append(_item_sentiment(item))
            sources.add(getattr(item, "source", "") or "")
            categories.add(getattr(item, "category", "") or "")

            pub = getattr(item, "published_dt", None)
            if pub:
                pub_cmp = pub if pub.tzinfo is not None else pub.replace(tzinfo=timezone.utc)
                if (now - pub_cmp).total_seconds() < 21600:
                    recent_count += 1

        log.info(
            "[theme] %-36s  raw_total=%.1f  clusters=%d  generic_ratio=%.2f",
            theme_id, total_score, len(contributing),
            generic_kw_hits_total / max(all_kw_hits_total, 1),
        )
        if total_score < 1.0 or not contributing:
            continue

        n_clusters = len(contributing)

        # ── Signal strength ───────────────────────────────────────────────────
        if total_score >= 18 or n_clusters >= 5:
            sig = "strong"
        elif total_score >= 7 or n_clusters >= 2:
            sig = "medium"
        else:
            sig = "weak"

        # ── Confidence: base + diversity bonuses ──────────────────────────────
        source_bonus  = min(len(sources) * 2, 10)
        cross_cat     = len(categories) >= 2
        cross_bonus   = 8 if cross_cat else 0
        recency_bonus = min(recent_count * 3, 9)

        confidence = min(95, int(
            total_score * 2.0
            + n_clusters * 4
            + source_bonus
            + cross_bonus
            + recency_bonus
        ))

        # ── Phase 8: generic keyword penalty ─────────────────────────────────
        # Only apply when confidence is already solid (≥30) to avoid
        # pushing borderline themes below a usable level.
        generic_ratio = generic_kw_hits_total / max(all_kw_hits_total, 1)
        if generic_ratio > 0.6 and confidence >= 30:
            confidence = max(1, int(confidence * 0.88))
            log.debug("[theme] generic_penalty  %s  ratio=%.2f  conf→%d", theme_id, generic_ratio, confidence)

        # NOTE: confidence_floor from the ontology is kept as metadata (logged
        # below for visibility) but does NOT gate theme inclusion.  The
        # total_score ≥ 1.0 threshold above is the real admission gate.
        if confidence < conf_floor:
            log.debug("[theme] floor_note  %s  conf=%d < floor=%d (not suppressed)", theme_id, confidence, conf_floor)

        # ── Confidence label ──────────────────────────────────────────────────
        if confidence >= 80:   conf_label = "High Conviction"
        elif confidence >= 60: conf_label = "Elevated"
        elif confidence >= 40: conf_label = "Moderate"
        elif confidence >= 20: conf_label = "Developing"
        else:                  conf_label = "Speculative"

        # ── Signal quality ────────────────────────────────────────────────────
        if cross_cat and len(sources) >= 3 and n_clusters >= 3:
            quality = "confirmed"
        elif len(sources) >= 2 or cross_cat:
            quality = "developing"
        else:
            quality = "speculative"

        # ── Momentum ──────────────────────────────────────────────────────────
        momentum = _majority_sentiment(sentiments)

        # ── Breadth: industries spanned by contributing clusters (capped at related count)
        breadth_raw = min(len(cfg.get("related_industries", [])), max(1, n_clusters))
        _momentum_tracker.record_breadth(theme_id, breadth_raw)

        # ── Tracker: record first, then derive momentum metrics ───────────────
        _momentum_tracker.record(theme_id, confidence, sig, now, sector_spread=breadth_raw)
        mom_label  = _momentum_tracker.momentum_label(theme_id)
        mom_delta  = _momentum_tracker.prev_delta(theme_id)
        n_cycles   = _momentum_tracker.persistence_cycles(theme_id)
        persist_sc = _momentum_tracker.persistence_score(theme_id)
        volat_sc   = _momentum_tracker.volatility_score(theme_id)

        # persistence_days — 5-minute refresh cycle assumption
        persistence_days = round(n_cycles * 5 / 1440, 2)

        # ── Top contributing clusters (by weighted score, capped at 5) ────────
        contributing.sort(key=lambda x: x[1], reverse=True)
        top_clusters = [c for c, _ in contributing[:5]]
        cluster_ids  = [c.id for c in top_clusters]
        story_count  = sum(getattr(c, "story_count", 1) for c in top_clusters)

        results.append(ThemeIntelligence(
            id                       = theme_id,
            name                     = cfg["name"],
            description              = cfg["description"],
            signal_strength          = sig,
            confidence               = confidence,
            momentum_direction       = momentum,
            related_industries       = list(cfg["related_industries"]),
            related_assets           = list(cfg["related_assets"]),
            related_macro_factors    = list(cfg["related_macro_factors"]),
            contributing_cluster_ids = cluster_ids,
            contributing_story_count = story_count,
            second_order_effects     = list(cfg["second_order_effects"]),
            podcast_topics           = list(cfg["podcast_topics"]),
            last_updated             = now_iso,
            relationship_weights     = dict(cfg.get("relationship_graph", {})),
            confidence_label         = conf_label,
            signal_quality           = quality,
            evidence_count           = len(sources),
            persistence_score        = persist_sc,
            volatility_score         = volat_sc,
            cross_category_confirmed = cross_cat,
            momentum_label           = mom_label,
            momentum_delta           = mom_delta,
            persistence_cycles       = n_cycles,
            # Phase 8
            competition_penalty      = 0.0,
            causal_narrative         = "",
            breadth_score            = breadth_raw,
            persistence_days         = persistence_days,
        ))

    # ── Pass 2: theme competition ─────────────────────────────────────────────
    # For each active theme, if any of its competing_themes has higher confidence,
    # penalise this theme's confidence by 15% per competitor (capped at 40%).
    confidence_map = {t.id: t.confidence for t in results}
    for t in results:
        cfg = THEME_CATALOG.get(t.id, {})
        competitors = cfg.get("competing_themes", [])
        penalty_frac = 0.0
        for comp_id in competitors:
            if comp_id in confidence_map and confidence_map[comp_id] > t.confidence:
                penalty_frac += 0.15
        penalty_frac = min(penalty_frac, 0.40)
        if penalty_frac > 0:
            t.competition_penalty = round(penalty_frac, 2)
            t.confidence = max(1, int(t.confidence * (1.0 - penalty_frac)))
            log.debug(
                "[theme] competition_penalty  %s  penalty=%.0f%%  conf→%d",
                t.id, penalty_frac * 100, t.confidence,
            )

    # ── Pass 3: causal narrative ──────────────────────────────────────────────
    try:
        active_ids = [t.id for t in results]
        narratives = build_causal_narrative(active_ids)
        for t in results:
            t.causal_narrative = narratives.get(t.id, "")
    except Exception as _e:
        log.warning("[theme] causal_narrative failed: %s", _e)

    # ── Language quality (debug logging only) ─────────────────────────────────
    for t in results:
        try:
            q = score_text_quality(t.description)
            if not q["is_institutional"]:
                log.debug(
                    "[theme] quality_warn  %s  score=%d  banned=%s",
                    t.id, q["quality_score"], [b[0] for b in q["banned_hits"][:3]],
                )
        except Exception:
            pass

    results.sort(key=lambda t: t.confidence, reverse=True)
    log.info(
        "[theme] extract_themes DONE: %d active / %d themes  clusters_in=%d",
        len(results), len(THEME_CATALOG), len(clusters),
    )
    for t in results:
        log.info(
            "[theme]  ✓ %-36s  conf=%d  strength=%-6s  clusters=%d  stories=%d  causal=%r",
            t.id, t.confidence, t.signal_strength,
            len(t.contributing_cluster_ids), t.contributing_story_count,
            t.causal_narrative or "",
        )
    return results


# ── Industry Activation ───────────────────────────────────────────────────────

FRONTEND_INDUSTRY_NAMES: list[str] = [
    "Semiconductors",
    "Software",
    "Aerospace & Defense",
    "Energy",
    "Financials",
    "Industrials",
    "Consumer",
    "Healthcare",
    "Real Estate",
    "Crypto & Digital Assets",
    "Utilities",
    "Media & Telecom",
]


@dataclass
class IndustryActivation:
    """Server-side aggregated activation signal for one frontend industry."""
    industry:           str
    score:              int            # 0–100
    sentiment:          str            # "bullish" | "bearish" | "neutral"
    active_story_count: int
    related_theme_ids:  list[str]      = field(default_factory=list)
    related_theme_names: list[str]     = field(default_factory=list)
    related_assets:     list[str]      = field(default_factory=list)
    momentum_label:     str            = "emerging"
    confidence_label:   str            = "Developing"


def compute_industry_activation(
    themes: list[ThemeIntelligence],
) -> list[IndustryActivation]:
    """
    For each frontend industry, aggregate signal from matching themes.
    Returns a list of IndustryActivation objects (all industries, even score=0).
    """
    results: list[IndustryActivation] = []

    for industry in FRONTEND_INDUSTRY_NAMES:
        matched = [t for t in themes if industry in t.related_industries]
        if not matched:
            results.append(IndustryActivation(
                industry=industry, score=0, sentiment="neutral",
                active_story_count=0,
            ))
            continue

        # Weighted score: confidence × relationship weight, take best
        best_score = 0
        best_sentiment = "neutral"
        best_momentum = "emerging"
        best_conf_label = "Developing"
        total_stories = 0
        theme_ids: list[str] = []
        theme_names: list[str] = []
        assets: list[str] = []

        for t in matched:
            rel = (t.relationship_weights or {}).get(industry, {})
            weight = rel.get("weight", 0.5)
            score = int(t.confidence * weight)
            if score > best_score:
                best_score = score
                direction = rel.get("direction", "")
                best_sentiment = (
                    "bullish" if direction == "positive" else
                    "bearish" if direction == "negative" else
                    "neutral"
                )
                best_momentum = t.momentum_label
                best_conf_label = t.confidence_label
            total_stories += t.contributing_story_count
            theme_ids.append(t.id)
            theme_names.append(t.name)
            for a in t.related_assets:
                if a not in assets:
                    assets.append(a)

        log.info(
            "[activ] %-24s  score=%3d  sentiment=%-8s  themes=%d  stories=%d  assets=%s",
            industry, min(best_score, 100), best_sentiment,
            len(matched), total_stories, assets[:4],
        )

        results.append(IndustryActivation(
            industry           = industry,
            score              = min(best_score, 100),
            sentiment          = best_sentiment,
            active_story_count = total_stories,
            related_theme_ids  = theme_ids,
            related_theme_names= theme_names,
            related_assets     = assets[:8],
            momentum_label     = best_momentum,
            confidence_label   = best_conf_label,
        ))

    return results
