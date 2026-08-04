"""
app/background.py — Background feed-refresh daemon.

Keeps the ProcessedFeedCache warm by running the full ingestion pipeline on a
configurable interval (default: 15 minutes) in a daemon thread.

Pipeline steps (all timed and logged):
  1. Fetch all sources in parallel  — FeedManager.fetch_all()
  2. Classify + score + extract     — happens inside fetch_all()
  3. Summarise new items only       — summarize_items() (cached; instant for unchanged items)
  4. Generate market take           — generate_market_take() (cached by content hash)
  5. Select top stories             — _select_top_stories()
  6. Write ProcessedFeed to cache   — ProcessedFeedCache.set()

All timings are logged at INFO level.  Source-level fetch errors are captured
in ProcessedFeed.errors and surfaced to the frontend via the API status endpoint.
"""

from __future__ import annotations

import logging
import threading
import time
from datetime import datetime, timezone
from typing import TYPE_CHECKING

from app import diagnostics as diag
from app.diagnostics import CycleRecord, EMPTY, FAILED, OK, signal_score_histogram

if TYPE_CHECKING:
    from app.processed_cache import ProcessedFeed

log = logging.getLogger(__name__)

# ── Lazy imports (avoid circular-import at module load time) ───────────────────
# These are resolved the first time run_pipeline() is called, not at import.

def _import_deps():
    """Return all pipeline dependencies (imported lazily to avoid circular imports)."""
    from app.feeds           import FEED_REGISTRY, feed_manager, source_breakdown
    from app.processed_cache import ProcessedFeed, feed_cache, make_cache_key
    from app.summarizer      import generate_market_take, generate_market_brief, summarize_items
    from app.config          import settings
    from app.top_stories     import _select_top_stories

    return (
        FEED_REGISTRY, feed_manager, source_breakdown,
        ProcessedFeed, feed_cache, make_cache_key,
        generate_market_take, generate_market_brief, summarize_items,
        settings, _select_top_stories,
    )


# ── Configuration ─────────────────────────────────────────────────────────────

REFRESH_INTERVAL = 5 * 60    # seconds between background refreshes (5 min)

# Filter combos to keep warm.  Format: (categories, sources, fresh_only).
# Homepage: all categories; Markets page: Markets only.
WARM_TARGETS: list[tuple[str, str, bool]] = [
    ("",        "", False),  # homepage / full feed
    ("Markets", "", False),  # markets page
]


# ── Helpers ───────────────────────────────────────────────────────────────────

def _cap_category(
    items: list,
    category: str,
    cap: int,
    multiplier: float,
) -> list:
    """
    Soft-cap the number of items in `category`.

    The ceiling is max(cap, multiplier × mean_count_of_other_categories).
    Items are already sorted strongest-first; the cap drops the tail only.
    """
    other_counts = {}
    for i in items:
        c = i.category
        if c != category:
            other_counts[c] = other_counts.get(c, 0) + 1

    if other_counts:
        mean_other = sum(other_counts.values()) / len(other_counts)
        ceiling    = max(cap, int(multiplier * mean_other))
    else:
        ceiling = cap

    result:   list = []
    cat_seen: int  = 0
    for i in items:
        if i.category == category:
            if cat_seen >= ceiling:
                continue
            cat_seen += 1
        result.append(i)

    if cat_seen > ceiling:   # shouldn't happen, but log if it does
        log.debug("[bg] _cap_category: trimmed %s from %d → %d", category, cat_seen, ceiling)
    else:
        log.debug("[bg] _cap_category: %s kept %d / ceiling %d", category, cat_seen, ceiling)

    return result


# ── Pipeline ──────────────────────────────────────────────────────────────────

def run_pipeline(
    categories: str  = "",
    sources:    str  = "",
    fresh_only: bool = False,
) -> "ProcessedFeed":
    """
    Execute the full ingestion → classification → summarisation → ranking pipeline.

    Always runs in the background thread; never called on a hot API path.
    """
    (
        FEED_REGISTRY, feed_manager, source_breakdown,
        ProcessedFeed, feed_cache, make_cache_key,
        generate_market_take, generate_market_brief, summarize_items,
        settings, _select_top_stories,
    ) = _import_deps()

    t0 = time.perf_counter()
    log.info(
        "[bg] pipeline START  categories=%r  sources=%r  fresh_only=%s",
        categories, sources, fresh_only,
    )
    # Diagnostics record for this cycle (observability only — never alters flow).
    # begin_cycle_stats() opens an invocation-scoped, thread-isolated stats
    # context so concurrent background/inline pipelines never exchange counts.
    _diag_key = make_cache_key(categories, sources, fresh_only)
    diag.begin_cycle_stats()
    _rec = CycleRecord(_diag_key,
                       cycle_id=datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ"))
    for _s in ("themes", "brief", "sector", "activation", "events",
               "explanations", "memory", "ledger"):
        _rec.stage(_s, diag.NOT_RUN)

    # ── 1. Build registry subset ──────────────────────────────────────────────
    cat_set = {c.strip() for c in categories.split(",") if c.strip()}
    src_set = {s.strip() for s in sources.split(",")    if s.strip()}
    registry = [
        (n, u, c) for n, u, c in FEED_REGISTRY
        if (not cat_set or c in cat_set) and (not src_set or n in src_set)
    ] or FEED_REGISTRY

    # ── 2. Fetch + classify + score ───────────────────────────────────────────
    items = feed_manager.fetch_all(
        registry=registry,
        force_refresh=False,
        fresh_only=fresh_only,
    )
    errors         = dict(feed_manager.fetch_errors)
    promo_excluded = feed_manager.promo_excluded
    _st = getattr(feed_manager, "last_source_stats", {}) or {}
    # finding 6: None only when NOT measured (no per-source stats); a real 0 is
    # preserved as 0, never collapsed to None.
    _measured = bool(_st)
    _rec.set(
        raw_items=(sum(getattr(s, "raw_fetched", 0) for s in _st.values()) if _measured else None),
        post_dedup_items=(sum(getattr(s, "post_dedup", 0) for s in _st.values()) if _measured else None),
        post_score_items=(sum(getattr(s, "kept", 0) for s in _st.values()) if _measured else None),
        source_errors_count=len(errors),
    )
    t_fetch = time.perf_counter()
    log.info(
        "[bg] fetch done in %.2fs  items=%d  sources_ok=%d  errors=%d",
        t_fetch - t0, len(items), len(registry) - len(errors), len(errors),
    )
    if errors:
        for src, msg in errors.items():
            log.debug("[bg] source error [%s]: %s", src, msg)

    # ── 2b. Markets soft cap ──────────────────────────────────────────────────
    # 4 of 11 sources are Markets-tier, so Markets items often outnumber every
    # other category combined.  We cap Markets at max(25, 2× the average count
    # of every non-Markets category) so the pool fed into top_stories and WMN
    # selection stays balanced.  Items are already sorted strongest-first, so
    # the cap drops the weakest Markets items only.
    items = _cap_category(items, "Markets", cap=25, multiplier=2.0)

    # ── 3. Summarise new items (cached items return instantly) ─────────────────
    # Use active_model (backend-aware) not ollama_model (always the Ollama model name)
    import os as _os
    model = settings.active_model
    log.info(
        "[bg] LLM config  backend=%s  model=%s  pydantic_key=%s  env_key=%s",
        settings.llm_backend,
        model,
        bool(settings.openai_api_key),
        bool(_os.environ.get("OPENAI_API_KEY")),
    )
    result = summarize_items(items, model_name=model)
    t_sum = time.perf_counter()
    log.info(
        "[bg] summarize done in %.2fs  new=%d  cached=%d  skipped=%d",
        t_sum - t_fetch, result.new, result.cached, result.skipped,
    )

    # ── 4. Cluster items ──────────────────────────────────────────────────────
    from app.clustering import cluster_items
    from app.themes     import select_what_matters_now

    clusters = cluster_items(items)
    _rec.set(clusters_total=len(clusters),
             clusters_multi=sum(1 for c in clusters if c.story_count > 1))
    _rec.signal_score_histogram = signal_score_histogram(
        [float(getattr(c.primary, "signal_score", 0) or 0) for c in clusters])
    t_cluster = time.perf_counter()
    log.info(
        "[bg] cluster done in %.3fs  clusters=%d  multi=%d",
        t_cluster - t_sum,
        len(clusters),
        sum(1 for c in clusters if c.story_count > 1),
    )

    # ── 5. Theme intelligence graph (must precede WMN — WMN is theme-driven) ──
    try:
        from app.theme_graph import extract_themes, last_extract_stats
        theme_intelligence = extract_themes(clusters)
        _ts = last_extract_stats()
        _rec.set(theme_candidates=_ts["candidates"], themes_emitted=_ts["emitted"])
        _rec.theme_suppressed_by_reason = _ts["suppressed_by_reason"]
        _rec.stage("themes", OK if theme_intelligence else EMPTY)
    except Exception as _e:
        log.exception("[bg] extract_themes FAILED — falling back to empty list")
        theme_intelligence = []
        _rec.set(themes_emitted=0)
        _rec.stage("themes", FAILED, _e)
        diag.diagnostics.mark_exception(_diag_key, "themes", _e)
    t_theme0 = time.perf_counter()
    log.info("[bg] themes done in %.3fs  active=%d", t_theme0 - t_cluster, len(theme_intelligence))

    # ── 5b. What Matters Now — corroborated structural themes only ────────────
    wmn = select_what_matters_now(theme_intelligence, clusters, n=5)
    t_wmn = time.perf_counter()
    log.info("[bg] WMN done in %.3fs  cards=%d", t_wmn - t_theme0, len(wmn))

    # ── 6. Market take + structured brief ────────────────────────────────────
    try:
        take  = generate_market_take(items, model_name=model)
        brief = generate_market_brief(items)
        _rec.stage("brief", OK if brief else EMPTY)
    except Exception as _e:
        log.exception("[bg] market take/brief FAILED — continuing with empty values")
        take  = ""
        brief = None
        _rec.stage("brief", FAILED, _e)
    t_take = time.perf_counter()
    log.info("[bg] market take done in %.2fs  brief=%s", t_take - t_wmn,
             "OK" if brief else "None")

    # ── 6b. Sector intelligence ───────────────────────────────────────────────
    try:
        from app.sectors import aggregate_sector_intelligence
        sector_data = aggregate_sector_intelligence(clusters, brief)
        _sp = sum(1 for s in (sector_data.sectors or []) if getattr(s, "signal_score", 0) > 0)
        _rec.set(sectors_positive=_sp)
        _rec.stage("sector", OK if _sp else EMPTY)
    except Exception as _e:
        log.exception("[bg] aggregate_sector_intelligence FAILED — using empty SectorData")
        from app.sectors import SectorData
        sector_data = SectorData(
            sectors=[], industries=[], rotation_signals=[],
            dominant_sector=None,
            generated_at=datetime.now(timezone.utc),
        )
        _rec.set(sectors_positive=0)
        _rec.stage("sector", FAILED, _e)
    t_sector = time.perf_counter()
    log.info(
        "[bg] sectors done in %.3fs  sectors=%d  industries=%d  rotations=%d",
        t_sector - t_take,
        len(sector_data.sectors),
        len(sector_data.industries),
        len(sector_data.rotation_signals),
    )

    # ── 6c. Theme intelligence graph (already computed in step 5, before WMN) ──
    t_themes = time.perf_counter()
    log.info(
        "[bg] themes active=%d  strong=%d",
        len(theme_intelligence),
        sum(1 for t in theme_intelligence if t.signal_strength == "strong"),
    )

    # ── 6d. Extended market regime ────────────────────────────────────────────
    try:
        from app.sectors import derive_extended_regime as _derive_regime
        _base_regime = getattr(brief, "market_regime", "Neutral/Consolidating") if brief else "Neutral/Consolidating"
        sector_data.derived_regime = _derive_regime(
            sector_data.sectors,
            [t.id for t in theme_intelligence],
            _base_regime,
        )
        log.debug("[bg] derived_regime=%s  (base=%s)", sector_data.derived_regime, _base_regime)
    except Exception:
        log.exception("[bg] derive_extended_regime FAILED — skipping")

    # ── 6d-ii. Graph alignment scoring ───────────────────────────────────────
    # Score every feed item against the narrative graph — how many active theme
    # and regime keywords appear in the item's title+snippet.  The resulting
    # graph_alignment_score (0–30) is used in the final composite feed sort
    # and in Today's Take candidate selection so the brief aligns with the graph.
    try:
        # Memory-weighted graph alignment: each theme's keywords are weighted by
        # how persistent / confirmed the theme is across sessions, so a story that
        # confirms a long-running theme scores higher than one attached only to a
        # brand-new, single-cycle theme. influence_weight() is an in-memory dict
        # lookup (no I/O), so this stays off the page-load path and is cheap.
        from app.theme_memory import influence_weight as _theme_weight
        _graph_kw_weight: dict[str, float] = {}
        for _t in theme_intelligence:
            try:
                _tw = _theme_weight(_t.id)
            except Exception:
                _tw = 1.0
            for _w in _t.name.lower().split():
                if len(_w) > 3:
                    _graph_kw_weight[_w] = max(_graph_kw_weight.get(_w, 0.0), _tw)
        _regime_str = sector_data.derived_regime or ""
        for _w in _regime_str.lower().split():
            if len(_w) > 3:
                _graph_kw_weight.setdefault(_w, 1.0)
        _graph_kw = set(_graph_kw_weight)   # kept for the audit block below

        for _item in items:
            _tl = (_item.title + " " + _item.snippet).lower()
            _score = sum(_wt for _kw, _wt in _graph_kw_weight.items() if _kw in _tl)
            _item.graph_alignment_score = round(min(30.0, _score * 5.0), 1)

        # Final composite re-sort: institutional_score (40%) + graph_alignment (20%) + signal_score (40%)
        _epoch2 = datetime.min.replace(tzinfo=timezone.utc)
        _SR2 = {"strong": 0, "medium": 1, "weak": 2}
        items.sort(key=lambda _i: (
            -(_i.published_dt or _epoch2).timestamp() // 3600,
            _SR2.get(_i.signal_strength, 1),
            -(_i.institutional_score * 0.40
              + _i.graph_alignment_score * 0.20
              + _i.signal_score * 0.40),
        ))
        log.info(
            "[bg] graph_align: regime_kw=%d  theme_kw=%d  top_item=%r  inst=%.1f  align=%.1f",
            len([w for w in _graph_kw if w in _regime_str.lower()]),
            len(_graph_kw),
            items[0].title[:50] if items else "",
            items[0].institutional_score if items else 0.0,
            items[0].graph_alignment_score if items else 0.0,
        )
    except Exception:
        log.exception("[bg] graph_alignment_score computation FAILED — skipping")

    # ── 6e. Industry activation (server-side per-industry signal aggregation) ──
    try:
        from app.theme_graph import compute_industry_activation
        industry_activation = compute_industry_activation(theme_intelligence)
        _ap = sum(1 for ia in industry_activation if getattr(ia, "score", 0) > 0)
        _rec.set(activations_total=len(industry_activation), activations_positive=_ap)
        _rec.stage("activation", OK if _ap else EMPTY)
    except Exception as _e:
        log.exception("[bg] compute_industry_activation FAILED — falling back to empty list")
        industry_activation = []
        _rec.set(activations_total=0, activations_positive=0)
        _rec.stage("activation", FAILED, _e)
        diag.diagnostics.mark_exception(_diag_key, "activation", _e)
    t_activ = time.perf_counter()
    active_industries = sum(1 for ia in industry_activation if ia.score > 0)
    log.info(
        "[bg] industry_activation done in %.3fs  active=%d / %d  themes_in=%d",
        t_activ - t_themes, active_industries, len(industry_activation),
        len(theme_intelligence),
    )
    if not theme_intelligence:
        log.warning(
            "[bg] WARNING: extract_themes returned 0 active themes — "
            "check cluster count (%d) and keyword/entity matches in [theme] log lines above",
            len(clusters),
        )
    for ia in industry_activation:
        if ia.score > 0:
            log.info(
                "[bg]   ✓ %-24s  score=%3d  sentiment=%-8s  stories=%d",
                ia.industry, ia.score, ia.sentiment, ia.active_story_count,
            )

    # ── 7. Top story selection ─────────────────────────────────────────────────
    debug_log: list[str] = []
    top = _select_top_stories(items, debug_log=debug_log)

    # ── 7b. Graph alignment audit ──────────────────────────────────────────────
    # Log how well Today's Take candidates align with the narrative graph regime.
    # graph_alignment_score: count of theme/sector keywords in candidate titles
    # that match active theme_intelligence names.
    _regime_name = sector_data.derived_regime or (
        getattr(brief, "market_regime", "") if brief else ""
    )
    _active_theme_kw: set[str] = set()
    for _t in theme_intelligence:
        for _w in _t.name.lower().split():
            if len(_w) > 3:
                _active_theme_kw.add(_w)

    def _graph_alignment(item_title: str) -> int:
        tl = item_title.lower()
        return sum(1 for kw in _active_theme_kw if kw in tl)

    _summarised_sorted = sorted(
        [i for i in items if i.summary],
        key=lambda i: (-getattr(i, "institutional_score", i.signal_score), -i.signal_score),
    )
    debug_log.append(
        f"GRAPH_ALIGN | regime={_regime_name!r}  active_themes={[t.name for t in theme_intelligence[:5]]}"
    )
    for _idx, _ci in enumerate(_summarised_sorted[:8], 1):
        _ga = _graph_alignment(_ci.title)
        debug_log.append(
            f"  take_candidate #{_idx}: graph_align={_ga}"
            f"  inst={getattr(_ci, 'institutional_score', 0.0):.1f}"
            f"  qual={getattr(_ci, 'source_quality_score', 0.0):.1f}"
            f"  noise={getattr(_ci, 'consumer_noise_penalty', 0.0):.1f}"
            f"  score={_ci.signal_score:.1f}"
            f"  source={_ci.source}"
            f"  title={_ci.title[:55]!r}"
        )

    # ── Audit block ────────────────────────────────────────────────────────────
    from app.feeds import category_breakdown as _cb, source_breakdown as _sb

    _now      = datetime.now(timezone.utc)
    _min_q    = 40
    _cat_cnts = _cb(items)   # {category: count} sorted by count desc
    _src_cnts = _sb(items)

    # Age histogram — buckets: 0–6h, 6–24h, 24–48h, 48h+
    _age_hist: dict[str, int] = {"0-6h": 0, "6-24h": 0, "24-48h": 0, "48h+": 0}
    for _i in items:
        if _i.published_dt:
            _ah = (_now - _i.published_dt).total_seconds() / 3600
            if _ah <= 6:
                _age_hist["0-6h"] += 1
            elif _ah <= 24:
                _age_hist["6-24h"] += 1
            elif _ah <= 48:
                _age_hist["24-48h"] += 1
            else:
                _age_hist["48h+"] += 1

    # Per-category qualified count (signal_score >= _min_q)
    _qual = {c: sum(1 for i in items if i.category == c and i.signal_score >= _min_q)
             for c in _cat_cnts}

    # WMN labels
    _wmn_labels = [w.wmn_label for w in wmn]

    # Top-stories slot summary
    _slot_map = {
        "Top Deal":          "top_deal",
        "Top Macro Story":   "top_macro",
        "Top Single Name":   "top_single",
        "Top Price Move":    "top_price",
        "Top Policy / Risk": "top_policy",
    }
    _slots = {
        abbr: (top[slot].title[:45] if top.get(slot) else "EMPTY")
        for slot, abbr in _slot_map.items()
    }

    debug_log.insert(0, (
        f"AUDIT | total={len(items)} promo_excluded={promo_excluded} | "
        f"age={_age_hist} | "
        f"categories={_cat_cnts} | "
        f"qualified(≥{_min_q})={_qual} | "
        f"wmn={_wmn_labels} | "
        f"slots={_slots} | "
        f"sources: {', '.join(f'{s}={sum(_src_cnts[s].values())}' for s in sorted(_src_cnts))}"
    ))

    t_end = time.perf_counter()
    log.info(
        "[bg] pipeline DONE in %.2fs  top_stories=%s",
        t_end - t0,
        {k: (v.title[:50] if v else None) for k, v in top.items()},
    )
    log.info(
        "[bg] AUDIT categories=%s  age=%s  wmn=%s",
        _cat_cnts, _age_hist, _wmn_labels,
    )

    # ── Thematic Intelligence Memory ───────────────────────────────────────────
    # Fold this cycle's themes into persistent memory so Argus remembers how each
    # theme evolves (new/recurring/strengthening/weakening/stale, confirm vs
    # contradict, persistent pattern vs one-off, historical sector/ticker links).
    # Runs here on the background thread — never on a page-load path. Wrapped so a
    # memory failure can never break the feed pipeline.
    try:
        from app.theme_memory import update_theme_memory
        _mem_n = update_theme_memory(theme_intelligence, clusters)
        log.info("[bg] theme_memory updated: %d themes", _mem_n)
        _rec.stage("memory", OK)
    except Exception as _e:
        log.exception("[bg] theme_memory update FAILED — continuing (feed unaffected)")
        _rec.stage("memory", FAILED, _e)

    # ── Market Events (F1) ─────────────────────────────────────────────────────
    # Elevate story clusters into ranked Market Events — the Feed's editorial
    # unit; articles become evidence. Event.id == cluster.id, so theme
    # contributing_cluster_ids and the M3 archive's evidence refs already point
    # at these events. Wrapped so an event-build failure never breaks the feed.
    # Wave 0.1 — resolve the (fail-safe) universal-materiality mode once; OFF by
    # default. `_mat_shadow_pre` is the isolated, transient side channel that
    # collects pre-admission candidate assessments (below-floor qualified ones
    # included). It never touches the events, ProcessedFeed, or any consumer.
    from app.materiality import MaterialityMode, effective_mode
    _mat_mode = effective_mode(settings.materiality_mode)
    _mat_shadow_pre: list | None = [] if _mat_mode is not MaterialityMode.OFF else None
    try:
        from app.events import build_market_events
        events = build_market_events(
            clusters, theme_intelligence, shadow_sink=_mat_shadow_pre)
        # OP1.5 — corroboration histogram of admitted events, one line per
        # cycle. The audit's OP1 success metrics are computed from this.
        _hist: dict[str, int] = {"1": 0, "2": 0, "3+": 0}
        for _e in events:
            _c = getattr(_e, "corroboration_count", 0)
            _hist["3+" if _c >= 3 else str(max(1, _c))] += 1
        log.info(
            "[events] corroboration histogram (admitted): 1-source=%d 2-source=%d 3+-source=%d of %d events",
            _hist["1"], _hist["2"], _hist["3+"], len(events),
        )
        from app.events import last_build_stats
        _bs = last_build_stats()
        _rec.set(events_built=_bs["built"], events_admitted=_bs["admitted"])
        _rec.stage("events", OK if events else EMPTY)
    except Exception as _e:
        log.exception("[bg] market event build FAILED — continuing (feed unaffected)")
        events = []
        _rec.set(events_built=0, events_admitted=0)
        _rec.stage("events", FAILED, _e)

    # ── Identity continuity (OP2.2/2.3/2.4, Sprint 4) ──────────────────────────
    # Full-feed cycles only [C6]: events receive their durable uid, decay
    # anchors to the registry's lifetime first observation (registry_decay),
    # and same-uid siblings fold into one institutional event
    # (registry_folding). Warm/partial runs serve uid="" events untouched.
    _cycle_now = datetime.now(timezone.utc)
    _cycle_id = _cycle_now.strftime("%Y%m%dT%H%M%SZ")
    if not categories and not sources:
        try:
            from app.event_identity import resolve_and_fold
            events = resolve_and_fold(events, now=_cycle_now, cycle_id=_cycle_id)
        except Exception:
            log.exception("[bg] identity continuity FAILED — continuing (feed unaffected)")

    # Wave 0.1 — now that identity resolution/folding has run, FRESHLY assess
    # each final canonical admitted event (never a mutation of the pre-admission
    # assessment) into the transient shadow result, emit the isolated
    # observation, and DISCARD it. `_shadow` is local and referenced by nothing
    # that follows — no feed / ProcessedFeed / identity / memory / API / cache
    # consumer. Best-effort; never breaks the pipeline. No-op when OFF.
    if _mat_mode is not MaterialityMode.OFF:
        try:
            from app.materiality import build_shadow_result, observe
            _shadow = build_shadow_result(_mat_shadow_pre or [], events)
            observe(_shadow)
            # Wave 0.3 C1: downstream-only, bounded, fail-open evaluation capture.
            # The queue receives immutable assessment values after inference has
            # completed. It cannot alter `_shadow`, events, or any returned feed.
            from app.materiality_evaluation import enqueue_shadow_evaluation
            enqueue_shadow_evaluation(
                _shadow,
                cycle_id=_cycle_id,
                decision_completed_at=datetime.now(timezone.utc),
            )
            del _shadow                       # explicit: never enters the object graph
        except Exception:
            log.exception("[bg] materiality shadow assess/observe FAILED — continuing (feed unaffected)")

    # ── Wave 0.4 A2 — Activation Integration (ADVISORY, read-only) ──────────────
    # After the shadow/evaluation block and before ProcessedFeed assembly. Resolves
    # the advisory ActivationState once per cycle and records it via A1's
    # authoritative audit path. It governs NOTHING: the resolved state is read by no
    # production consumer, and `_mat_mode` above remains the sole behavioral
    # authority. Fully gated (default off) and failure-isolated. When the gate is
    # off, nothing here runs — the block is a pure no-op, byte-identical to pre-A2.
    if settings.materiality_activation_runtime_enabled:
        try:
            from app.materiality_activation_runtime import run_activation_cycle
            run_activation_cycle(enabled=True)
        except Exception:
            log.exception("[bg] A2 activation integration FAILED — continuing (feed unaffected)")

    feed = ProcessedFeed(
        items=items,
        top_stories=top,
        market_take=take,
        market_brief=brief,
        errors=errors,
        promo_excluded=promo_excluded,
        debug_log=debug_log,
        generated_at=_cycle_now,
        clusters=clusters,
        what_matters_now=wmn,
        sector_data=sector_data,
        theme_intelligence=theme_intelligence,
        industry_activation=industry_activation,
        events=events,
    )

    # ── Canonical Explanations (IRE-1) ─────────────────────────────────────────
    # One backend Explanation per admitted event (stages R0-R3 live; memory,
    # stakes and falsifiers ship as honest gated sections). Also populates each
    # event's typed transmission_chain — the legacy `transmission` prose string
    # stays untouched for compatibility. Built from the same deterministic
    # narrative graph the M3.2 recorder derives. Wrapped so an assembly failure
    # never breaks the feed.
    try:
        from app.explanations import build_explanations
        from app.narrative_graph import build_narrative_graph
        explanations = build_explanations(
            events, theme_intelligence, graph=build_narrative_graph(feed))
        feed.explanations = {eid: ex.to_dict() for eid, ex in explanations.items()}
        # OP2.2 transition: every explanation reachable by uid as well as by
        # legacy id (same dict values — keys only; removed when consumers
        # complete the uid migration).
        from app.event_identity import dual_key_explanations
        dual_key_explanations(feed.explanations, events)
        _rec.stage("explanations", OK if feed.explanations else EMPTY)
    except Exception as _e:
        log.exception("[bg] explanation assembly FAILED — continuing (feed unaffected)")
        feed.explanations = {}
        _rec.stage("explanations", FAILED, _e)

    # ── Institutional memory (M3.1 themes + M3.2 graph/narratives) ─────────────
    # Persist the canonical daily snapshots to Supabase AFTER the ThemeMemory
    # update and full feed assembly, before the cache publish in _refresh_all —
    # and only for the full-feed target so the Markets-only warm run (a subset
    # of themes) never writes a partial market state. record_cycle() is a no-op
    # when disabled and never raises — a Supabase outage logs an error and
    # retries on the next eligible cycle.
    if not categories and not sources:
        # finding 1: DISABLED and FAILED must never be conflated. record_cycle's
        # None result is ambiguous, so the authoritative config gate — not the
        # return value — decides "disabled". record_cycle_status() applies that
        # contract (enabled + None / malformed / raise → "failed") and never
        # raises. finding 7: a successful in-memory cache publish must NOT imply
        # Supabase persistence succeeded, so this is a separate sink.
        try:
            from app.institutional_memory import record_cycle_status
            _im_status = record_cycle_status(theme_intelligence, feed=feed)
        except Exception:
            log.exception("[bg] institutional memory write FAILED — continuing (feed unaffected)")
            _im_status = "failed"
        diag.diagnostics.mark_persistence(_diag_key, institutional_memory=_im_status)

    # ── Observation ledger (OP3.1a observations + OP3.1b assessments) ──────────
    # Full-feed cycles only [C6]: partial/Markets-only warm runs never write
    # ledger rows. Identity resolution itself ran BEFORE feed assembly (the
    # continuity block above), so assessment rows carry canonical uids.
    # Best-effort — never breaks the pipeline.
    if not categories and not sources:
        try:
            from app.observation_ledger import observation_ledger
            _n_obs = observation_ledger.record_observations(
                items, now=_cycle_now, cycle_id=_cycle_id)
            _n_ass = observation_ledger.record_assessments(
                events, now=_cycle_now, cycle_id=_cycle_id)
            observation_ledger.compress_old(now=_cycle_now)
            if _n_obs or _n_ass:
                log.info("[ledger] appended %d observation + %d assessment row(s) (cycle %s)",
                         _n_obs, _n_ass, _cycle_id)
            _with_uid = sum(1 for e in events if getattr(e, "uid", ""))
            log.info("[identity] %d/%d admitted events carry a uid this cycle",
                     _with_uid, len(events))
            _rec.stage("ledger", OK)
        except Exception as _e:
            log.exception("[bg] observation ledger FAILED — continuing (feed unaffected)")
            _rec.stage("ledger", FAILED, _e)

    # ── Finalize the diagnostics record (observability only) ──────────────────
    _rec.set(market_brief_present=(feed.market_brief is not None))
    diag.diagnostics.record_cycle(_rec)

    return feed


# ── Daemon thread ──────────────────────────────────────────────────────────────

class FeedRefresher:
    """
    Daemon thread that keeps the ProcessedFeedCache warm.

    On startup it immediately refreshes all WARM_TARGETS so the first page load
    is served from cache.  Subsequent refreshes run on `interval` seconds.

    Call `trigger()` to force an out-of-cycle refresh (e.g. after a settings
    change or a manual force-refresh request from the UI).
    """

    def __init__(self, interval: int = REFRESH_INTERVAL) -> None:
        self._interval    = interval
        self._stop        = threading.Event()
        self._wake        = threading.Event()
        self._thread:     threading.Thread | None = None
        self._run_lock    = threading.Lock()               # prevents overlapping runs
        self._prev_fps:   dict[str, set[str]] = {}         # key → fingerprint set from last cycle
        self._cycle_count = 0

    # ── Lifecycle ─────────────────────────────────────────────────────────────

    def start(self) -> None:
        if self._thread and self._thread.is_alive():
            return
        self._stop.clear()
        self._thread = threading.Thread(
            target=self._loop,
            name="feed-refresher",
            daemon=True,
        )
        self._thread.start()
        diag.diagnostics.set_refresher_thread(self._thread)   # supervision visibility
        log.info("[bg] FeedRefresher started  interval=%ds  targets=%d",
                 self._interval, len(WARM_TARGETS))

    def stop(self) -> None:
        self._stop.set()
        self._wake.set()   # unblock any in-progress sleep
        if self._thread:
            self._thread.join(timeout=5)
        log.info("[bg] FeedRefresher stopped")

    def trigger(self) -> None:
        """Wake the loop immediately for an out-of-cycle refresh."""
        self._wake.set()
        log.debug("[bg] manual trigger received")

    # ── Loop ──────────────────────────────────────────────────────────────────

    def _loop(self) -> None:
        # Warm all targets immediately so the first page load hits cache.
        # Each _refresh_all is wrapped so a thread-fatal exception is RECORDED
        # (making a silent death observable via /api/feed/status) before it
        # propagates — the survival behavior is unchanged (re-raise → thread
        # exits, as today), we only add the record. Not a redesign.
        self._safe_refresh()
        while not self._stop.is_set():
            self._wake.wait(timeout=self._interval)
            self._wake.clear()
            if self._stop.is_set():
                break
            self._safe_refresh()

    def _safe_refresh(self) -> None:
        try:
            self._refresh_all()
        except Exception as exc:
            diag.diagnostics.mark_loop_exception(exc)
            log.exception("[bg] refresher loop FATAL — thread will exit")
            raise   # preserve existing behavior (thread dies); now it's recorded

    def _refresh_all(self) -> None:
        import hashlib
        from app.processed_cache import feed_cache, make_cache_key

        if not self._run_lock.acquire(blocking=False):
            log.warning("[bg] refresh already running — skipping overlap")
            return

        cycle    = self._cycle_count
        is_cold  = (cycle == 0)
        self._cycle_count += 1
        t_cycle  = time.perf_counter()
        _cycle_tag = f"cycle-{cycle}"
        log.info(
            "[bg] refresh cycle #%d START  warm_targets=%d  cold_start=%s",
            cycle, len(WARM_TARGETS), is_cold,
        )

        try:
            for categories, sources, fresh_only in WARM_TARGETS:
                if self._stop.is_set():
                    return
                key = make_cache_key(categories, sources, fresh_only)
                # PER-TARGET supervision (finding 3): each warm target owns its
                # own attempt/success/failure — a healthy Markets refresh can
                # never make a failed full-feed refresh look healthy.
                diag.diagnostics.mark_attempt(key, _cycle_tag)
                feed_cache.mark_refreshing(key)
                try:
                    feed = run_pipeline(
                        categories=categories,
                        sources=sources,
                        fresh_only=fresh_only,
                    )

                    # Count stories that weren't present in the previous cycle
                    fps = {
                        hashlib.md5(
                            (i.title + i.url).encode("utf-8", errors="ignore")
                        ).hexdigest()[:12]
                        for i in feed.items
                    }
                    prev      = self._prev_fps.get(key, set())
                    n_new     = len(fps - prev) if prev else 0
                    self._prev_fps[key] = fps

                    feed_cache.set(key, feed)
                    diag.diagnostics.mark_published(key, _cycle_tag)  # this target succeeded
                    log.info(
                        "[bg] cache updated  key=%s  items=%d  new_this_cycle=%d",
                        key, len(feed.items), n_new,
                    )
                except Exception as exc:
                    log.exception("[bg] pipeline failed  key=%s", key)
                    diag.diagnostics.mark_exception(key, "pipeline", exc)
        finally:
            self._run_lock.release()

        elapsed = time.perf_counter() - t_cycle
        label   = "cold-start" if is_cold else "refresh"
        log.info("[bg] %s cycle #%d DONE in %.2fs", label, cycle, elapsed)


# ── Module-level singleton ─────────────────────────────────────────────────────
refresher = FeedRefresher()
