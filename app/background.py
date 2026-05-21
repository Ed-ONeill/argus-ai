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
        generate_market_take, summarize_items,
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
) -> "ProcessedFeed":  # type: ignore[name-defined]
    """
    Execute the full ingestion → classification → summarisation → ranking pipeline.

    Always runs in the background thread; never called on a hot API path.
    """
    (
        FEED_REGISTRY, feed_manager, source_breakdown,
        ProcessedFeed, feed_cache, make_cache_key,
        generate_market_take, summarize_items,
        settings, _select_top_stories,
    ) = _import_deps()

    t0 = time.perf_counter()
    log.info(
        "[bg] pipeline START  categories=%r  sources=%r  fresh_only=%s",
        categories, sources, fresh_only,
    )

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
    t_cluster = time.perf_counter()
    log.info(
        "[bg] cluster done in %.3fs  clusters=%d  multi=%d",
        t_cluster - t_sum,
        len(clusters),
        sum(1 for c in clusters if c.story_count > 1),
    )

    # ── 5. What Matters Now ───────────────────────────────────────────────────
    wmn = select_what_matters_now(clusters, n=5)
    t_wmn = time.perf_counter()
    log.info("[bg] WMN done in %.3fs  themes=%d", t_wmn - t_cluster, len(wmn))

    # ── 6. Market take + structured brief ────────────────────────────────────
    take  = generate_market_take(items, model_name=model)
    brief = generate_market_brief(items)
    t_take = time.perf_counter()
    log.info("[bg] market take done in %.2fs  brief=%s", t_take - t_wmn,
             "OK" if brief else "None")

    # ── 6b. Sector intelligence ───────────────────────────────────────────────
    from app.sectors import aggregate_sector_intelligence
    sector_data = aggregate_sector_intelligence(clusters, brief)
    t_sector = time.perf_counter()
    log.info(
        "[bg] sectors done in %.3fs  sectors=%d  industries=%d  rotations=%d",
        t_sector - t_take,
        len(sector_data.sectors),
        len(sector_data.industries),
        len(sector_data.rotation_signals),
    )

    # ── 6c. Theme intelligence graph ──────────────────────────────────────────
    from app.theme_graph import extract_themes
    theme_intelligence = extract_themes(clusters)
    t_themes = time.perf_counter()
    log.info(
        "[bg] themes done in %.3fs  active=%d  strong=%d",
        t_themes - t_sector,
        len(theme_intelligence),
        sum(1 for t in theme_intelligence if t.signal_strength == "strong"),
    )

    # ── 7. Top story selection ─────────────────────────────────────────────────
    debug_log: list[str] = []
    top = _select_top_stories(items, debug_log=debug_log)

    # ── Audit block ────────────────────────────────────────────────────────────
    from app.feeds import category_breakdown as _cb, source_breakdown as _sb
    from datetime  import timezone as _tz

    _now      = datetime.now(timezone.utc)
    _min_q    = 40
    _cat_cnts = _cb(items)   # {category: count} sorted by count desc
    _src_cnts = _sb(items)

    # Age histogram — buckets: 0–6h, 6–24h, 24–48h, 48h+
    _age_hist: dict[str, int] = {"0-6h": 0, "6-24h": 0, "24-48h": 0, "48h+": 0}
    for _i in items:
        if _i.published_dt:
            _ah = (_now - _i.published_dt).total_seconds() / 3600
            if   _ah <=  6: _age_hist["0-6h"]   += 1
            elif _ah <= 24: _age_hist["6-24h"]   += 1
            elif _ah <= 48: _age_hist["24-48h"]  += 1
            else:           _age_hist["48h+"]    += 1

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

    return ProcessedFeed(
        items=items,
        top_stories=top,
        market_take=take,
        market_brief=brief,
        errors=errors,
        promo_excluded=promo_excluded,
        debug_log=debug_log,
        generated_at=datetime.now(timezone.utc),
        clusters=clusters,
        what_matters_now=wmn,
        sector_data=sector_data,
        theme_intelligence=theme_intelligence,
    )


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
        self._refresh_all()
        while not self._stop.is_set():
            self._wake.wait(timeout=self._interval)
            self._wake.clear()
            if self._stop.is_set():
                break
            self._refresh_all()

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
        log.info(
            "[bg] refresh cycle #%d START  warm_targets=%d  cold_start=%s",
            cycle, len(WARM_TARGETS), is_cold,
        )

        try:
            for categories, sources, fresh_only in WARM_TARGETS:
                if self._stop.is_set():
                    return
                key = make_cache_key(categories, sources, fresh_only)
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
                    log.info(
                        "[bg] cache updated  key=%s  items=%d  new_this_cycle=%d",
                        key, len(feed.items), n_new,
                    )
                except Exception:
                    log.exception("[bg] pipeline failed  key=%s", key)
        finally:
            self._run_lock.release()

        elapsed = time.perf_counter() - t_cycle
        label   = "cold-start" if is_cold else "refresh"
        log.info("[bg] %s cycle #%d DONE in %.2fs", label, cycle, elapsed)


# ── Module-level singleton ─────────────────────────────────────────────────────
refresher = FeedRefresher()
