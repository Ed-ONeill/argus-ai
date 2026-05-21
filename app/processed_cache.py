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

log = logging.getLogger(__name__)

# Disk-persistence directory (project_root/data/feed_cache/)
_CACHE_DIR = Path(__file__).resolve().parent.parent / "data" / "feed_cache"


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
        # Persist outside the lock so readers aren't blocked during I/O
        self._save_to_disk(key, feed)

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
                    # Patch fields added after initial schema (backwards compat)
                    if not hasattr(feed, "clusters"):
                        feed.clusters = []
                    if not hasattr(feed, "what_matters_now"):
                        feed.what_matters_now = []
                    if not hasattr(feed, "market_brief"):
                        feed.market_brief = None
                    if not hasattr(feed, "sector_data"):
                        feed.sector_data = None
                    # Patch IndustrySignal fields added in Phase 3
                    if feed.sector_data is not None:
                        for ind in (feed.sector_data.industries or []):
                            if not hasattr(ind, "momentum_direction"):
                                ind.momentum_direction = "neutral"
                                ind.primary_drivers    = []
                                ind.narrative          = ""
                                ind.regime_alignment   = "neutral"
                                ind.top_story_title    = None
                                ind.top_story_url      = None
                    self._store[key] = feed
                    age = (datetime.now(timezone.utc) - feed.generated_at).total_seconds()
                    log.info(
                        "ProcessedFeedCache: loaded from disk  key=%s  items=%d  age=%.0fs",
                        key, len(feed.items), age,
                    )
                except Exception as exc:
                    log.warning("ProcessedFeedCache: failed to load %s: %s", pkl_path.name, exc)
        except Exception as exc:
            log.warning("ProcessedFeedCache: disk load error: %s", exc)

    def _save_to_disk(self, key: str, feed: ProcessedFeed) -> None:
        """Persist a cache entry to disk (atomic write via temp file)."""
        try:
            _CACHE_DIR.mkdir(parents=True, exist_ok=True)
            tmp = _CACHE_DIR / f"feed_{key}.tmp"
            dst = _CACHE_DIR / f"feed_{key}.pkl"
            with open(tmp, "wb") as fh:
                pickle.dump(feed, fh, protocol=pickle.HIGHEST_PROTOCOL)
            tmp.replace(dst)  # atomic on POSIX; best-effort on Windows
        except Exception as exc:
            log.warning("ProcessedFeedCache: failed to save key %s: %s", key, exc)


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
