"""
app/processed_cache.py — Fully-processed feed cache with stale-while-revalidate.

Sits above the per-source RSS cache (FeedManager._cache).
Stores complete pipeline output: classified, scored, summarised items, top-story
slots, market take, and debug metadata.

Cache keys are hashes of the filter parameters.  API routes always read from
this cache; a background job writes to it asynchronously.
"""

from __future__ import annotations

import hashlib
import logging
import pickle
import threading
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path

from app.feeds import FeedItem
from app.clustering import StoryCluster, WhatMattersNowItem
from app.summarizer import MarketBrief
from app.sectors import SectorData
from app.theme_graph import ThemeIntelligence, IndustryActivation
from app.events import MarketEvent

log = logging.getLogger(__name__)

# Disk-persistence directory — PH1 (C5): volume-backed durable root.
from app.storage import FEED_CACHE_DIR as _CACHE_DIR


@dataclass
class ProcessedFeed:
    """One fully-processed feed snapshot."""
    items:            list[FeedItem]
    top_stories:      dict[str, FeedItem | None]
    market_take:      str
    errors:           dict[str, str]
    promo_excluded:   int
    debug_log:        list[str]
    generated_at:     datetime = field(
        default_factory=lambda: datetime.now(timezone.utc)
    )
    is_refreshing:    bool = False
    # Clustering layer (added after initial schema; default_factory ensures
    # old pickle files deserialise without error)
    clusters:         list[StoryCluster]       = field(default_factory=list)
    what_matters_now: list[WhatMattersNowItem] = field(default_factory=list)
    # Structured brief (added in Phase 1 upgrade — None means not yet generated)
    market_brief:     MarketBrief | None       = None
    # Sector intelligence (added in Sectors phase — None until first pipeline run)
    sector_data:      SectorData | None        = None
    # Theme intelligence graph (added in Phase 4 — empty list until first pipeline run)
    theme_intelligence: list[ThemeIntelligence] = field(default_factory=list)
    # Industry activation (added in Phase 7 — server-side per-industry signal aggregation)
    industry_activation: list[IndustryActivation] = field(default_factory=list)
    # Market Events (F1 — the editorial unit: ranked events, articles demoted to evidence)
    events: list[MarketEvent] = field(default_factory=list)
    # Canonical Explanations (IRE-1 — one per admitted event, keyed by event id;
    # stored as serialized dicts so old pickles deserialize without error)
    explanations: dict[str, dict] = field(default_factory=dict)


class ProcessedFeedCache:
    """Thread-safe LRU cache for ProcessedFeed objects keyed by filter-combo hash."""

    def __init__(self, max_entries: int = 20) -> None:
        self._store: dict[str, ProcessedFeed] = {}
        self._lock  = threading.RLock()
        self._max   = max_entries
        self._load_from_disk()

    # ── Public API ────────────────────────────────────────────────────────────

    def get(self, key: str) -> ProcessedFeed | None:
        with self._lock:
            return self._store.get(key)

    def set(self, key: str, feed: ProcessedFeed) -> None:
        with self._lock:
            self._store[key] = feed
            if len(self._store) > self._max:
                oldest = min(
                    self._store,
                    key=lambda k: self._store[k].generated_at,
                )
                del self._store[oldest]
                log.debug("ProcessedFeedCache: evicted key %s", oldest)
        # Persistence health (finding 7): in-memory publication is now durable;
        # disk save is a SEPARATE sink whose failure must not be implied "ok".
        try:
            from app.diagnostics import diagnostics
            diagnostics.mark_persistence(key, memory_cache="ok")
        except Exception:
            pass
        # Persist outside the lock so readers aren't blocked during I/O
        disk_ok = self._save_to_disk(key, feed)
        try:
            from app.diagnostics import diagnostics
            diagnostics.mark_persistence(key, disk_cache=("ok" if disk_ok else "failed"))
        except Exception:
            pass

    def mark_refreshing(self, key: str) -> None:
        """Signal that a background refresh is in progress (stale-while-revalidate)."""
        with self._lock:
            if key in self._store:
                self._store[key].is_refreshing = True

    def age_seconds(self, key: str) -> float | None:
        with self._lock:
            if key not in self._store:
                return None
            delta = datetime.now(timezone.utc) - self._store[key].generated_at
            return delta.total_seconds()

    def clear(self) -> None:
        with self._lock:
            self._store.clear()

    # ── Disk persistence ──────────────────────────────────────────────────────

    def _load_from_disk(self) -> None:
        """Pre-warm in-memory cache from disk files written by previous runs."""
        try:
            if not _CACHE_DIR.exists():
                return
            for pkl_path in sorted(_CACHE_DIR.glob("feed_*.pkl")):
                key = pkl_path.stem[5:]  # strip "feed_" prefix
                try:
                    with open(pkl_path, "rb") as fh:
                        feed: ProcessedFeed = pickle.load(fh)
                    feed.is_refreshing = False   # stale on restart; bg will refresh soon
                    # observability (finding 2): field -> reason_code.
                    # A MISSING required-derived field is NOT schema-compatible —
                    # it must be recorded, not silently patched to []. Present-but-
                    # empty is genuinely empty (no record). Present-but-old is
                    # structurally incompatible.
                    _cleared: dict[str, str] = {}
                    # Structural containers: patch silently (not derived intelligence).
                    if not hasattr(feed, "clusters"):
                        feed.clusters = []
                    if not hasattr(feed, "what_matters_now"):
                        feed.what_matters_now = []
                    if not hasattr(feed, "market_brief"):
                        feed.market_brief = None
                    if not hasattr(feed, "sector_data"):
                        feed.sector_data = None
                    # Required DERIVED fields: a field entirely absent from the
                    # persisted schema is a compatibility clear, not a healthy [].
                    for _fld in ("theme_intelligence", "industry_activation", "events"):
                        if not hasattr(feed, _fld):
                            setattr(feed, _fld, [])
                            _cleared[_fld] = "missing_from_persisted_schema"
                    # Phase 5: themes present but pre-relationship_weights structure.
                    if feed.theme_intelligence and not hasattr(feed.theme_intelligence[0], "relationship_weights"):
                        feed.theme_intelligence = []
                        _cleared["theme_intelligence"] = "incompatible_persisted_schema"
                    # Phase 7: activations present but pre-confidence_label structure.
                    if feed.industry_activation and not hasattr(feed.industry_activation[0], "confidence_label"):
                        log.info("ProcessedFeedCache: cleared stale industry_activation (pre-Phase-7)  key=%s", key)
                        feed.industry_activation = []
                        _cleared["industry_activation"] = "incompatible_persisted_schema"
                    if not feed.industry_activation:
                        log.info("ProcessedFeedCache: industry_activation empty on load  key=%s — pipeline will recompute", key)
                    # Phase 8: themes present but pre-competition_penalty structure (clears both).
                    if feed.theme_intelligence and not hasattr(feed.theme_intelligence[0], "competition_penalty"):
                        log.info("ProcessedFeedCache: cleared stale theme_intelligence (pre-Phase-8)  key=%s", key)
                        feed.theme_intelligence  = []
                        feed.industry_activation = []
                        _cleared["theme_intelligence"] = "incompatible_persisted_schema"
                        _cleared["industry_activation"] = "incompatible_persisted_schema"
                    # Orphaned activations (themes cleared, activations not) — do
                    # not override a missing/incompatible classification.
                    if not feed.theme_intelligence and feed.industry_activation:
                        log.info("ProcessedFeedCache: clearing orphaned industry_activation (no theme backing)  key=%s", key)
                        feed.industry_activation = []
                        _cleared.setdefault("industry_activation", "orphaned_no_theme_backing")
                    # Patch IndustrySignal fields added in Phase 3
                    if feed.sector_data is not None:
                        if not hasattr(feed.sector_data, "derived_regime"):
                            feed.sector_data.derived_regime = ""
                        for ind in (feed.sector_data.industries or []):
                            if not hasattr(ind, "momentum_direction"):
                                ind.momentum_direction = "neutral"
                                ind.primary_drivers    = []
                                ind.narrative          = ""
                                ind.regime_alignment   = "neutral"
                                ind.top_story_title    = None
                                ind.top_story_url      = None
                    self._store[key] = feed
                    try:
                        from app.diagnostics import diagnostics
                        diagnostics.record_cache_load(
                            key, pickle_filename=pkl_path.name,
                            generated_at=getattr(feed, "generated_at", None),
                            cleared=_cleared)
                    except Exception:
                        pass   # diagnostics must never affect cache loading
                    age = (datetime.now(timezone.utc) - feed.generated_at).total_seconds()
                    log.info(
                        "ProcessedFeedCache: loaded from disk  key=%s  items=%d  age=%.0fs",
                        key, len(feed.items), age,
                    )
                except Exception as exc:
                    log.warning("ProcessedFeedCache: failed to load %s: %s", pkl_path.name, exc)
        except Exception as exc:
            log.warning("ProcessedFeedCache: disk load error: %s", exc)

    def _save_to_disk(self, key: str, feed: ProcessedFeed) -> bool:
        """Persist a cache entry to disk (atomic write via temp file). Returns
        True on success, False on failure (never raises)."""
        try:
            _CACHE_DIR.mkdir(parents=True, exist_ok=True)
            tmp = _CACHE_DIR / f"feed_{key}.tmp"
            dst = _CACHE_DIR / f"feed_{key}.pkl"
            with open(tmp, "wb") as fh:
                pickle.dump(feed, fh, protocol=pickle.HIGHEST_PROTOCOL)
            tmp.replace(dst)  # atomic on POSIX; best-effort on Windows
            return True
        except Exception as exc:
            log.warning("ProcessedFeedCache: failed to save key %s: %s", key, exc)
            return False


def make_cache_key(
    categories: str  = "",
    sources:    str  = "",
    fresh_only: bool = False,
) -> str:
    """Stable 12-char hash over filter parameters → cache key."""
    raw = f"{categories.strip().lower()}|{sources.strip().lower()}|{fresh_only}"
    return hashlib.md5(raw.encode()).hexdigest()[:12]


# ── Module-level singleton ─────────────────────────────────────────────────────
feed_cache = ProcessedFeedCache()
