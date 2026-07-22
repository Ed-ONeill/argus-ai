"""
tests/test_cluster_overflow.py — OP1.4 (Sprint 3): members past the related
cap survive as identity rows and the event layer spends them.

The audit-I6 invariant: story_count == len(event.evidence).
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from app.clustering import _MAX_RELATED, _build_cluster
from app.events import build_market_events
from app.feeds import FeedItem, MergedSource

NOW = datetime(2026, 7, 21, 15, 0, tzinfo=timezone.utc)

SOURCES = ["Bloomberg Markets", "Financial Times", "CNBC Economy",
           "Reuters", "Reuters Business", "CNBC Companies",
           "MarketWatch", "Nikkei Asia", "Bloomberg Markets", "Financial Times"]


def _items(n: int = 10) -> list[FeedItem]:
    return [
        FeedItem(
            title=f"Fed decision angle {i}: {'rates ' * (i % 3)}reaction",
            url=f"https://t/story{i}",
            source=SOURCES[i % len(SOURCES)],
            category="Markets",
            published_dt=NOW - timedelta(minutes=30 + i * 10),
            snippet=f"snippet {i}",
        )
        for i in range(n)
    ]


def test_overflow_members_survive_as_identity_rows():
    items = _items(10)
    cluster = _build_cluster(items)

    assert len(cluster.related) == _MAX_RELATED
    assert cluster.story_count == 10
    overflow = cluster.overflow_sources
    assert len(overflow) == 10 - 1 - _MAX_RELATED           # primary + capped related
    assert all(isinstance(r, MergedSource) for r in overflow)
    row = overflow[0]
    original = items[1 + _MAX_RELATED]
    assert (row.source, row.title, row.url) == (original.source, original.title, original.url)
    assert row.published_dt == original.published_dt


def test_event_layer_spends_overflow_and_invariant_holds():
    cluster = _build_cluster(_items(10))
    events = build_market_events([cluster], [], now=NOW)
    assert len(events) == 1
    ev = events[0]

    # I6 closed: every member attests, full-item or identity-row alike
    assert len(ev.evidence) == cluster.story_count == 10
    overflow_urls = {r.url for r in cluster.overflow_sources}
    assert overflow_urls <= {e.url for e in ev.evidence}
    # distinct qualified publishers include overflow tier-1/2 sources
    assert ev.source_count == len({e.source for e in ev.evidence})
    assert ev.corroboration_count >= 3


def test_no_overflow_below_cap():
    cluster = _build_cluster(_items(4))
    assert cluster.overflow_sources == []
    assert cluster.story_count == 4
