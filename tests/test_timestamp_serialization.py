"""
tests/test_timestamp_serialization.py — OP4.0 (Sprint 3): canonical timestamps
cross the boundary additively; missing values stay honestly missing.
"""

from __future__ import annotations

from datetime import datetime, timezone

from api.routes.feed import FeedItemSchema
from app.feeds import FeedItem

PUB = datetime(2026, 7, 21, 9, 30, tzinfo=timezone.utc)
FETCH = datetime(2026, 7, 21, 9, 45, tzinfo=timezone.utc)


def _item(**overrides) -> FeedItem:
    base = dict(
        title="Fed signals September rate cut as inflation cools",
        url="https://t/fed", source="Bloomberg Markets", category="Markets",
        published_dt=PUB, published="2h ago", fetched_at=FETCH,
    )
    base.update(overrides)
    return FeedItem(**base)


def test_timestamps_serialized_with_distinct_meanings():
    s = FeedItemSchema.from_item(_item())
    assert s.published_ts == PUB.isoformat()          # publisher's clock
    assert s.fetched_at == FETCH.isoformat()          # Argus's first observation
    assert s.published == "2h ago"                    # display string untouched


def test_missing_values_remain_honestly_missing():
    s = FeedItemSchema.from_item(_item(published_dt=None, fetched_at=None, published=""))
    assert s.published_ts is None
    assert s.fetched_at is None                       # never fabricated


def test_fields_are_additive_for_old_clients():
    payload = FeedItemSchema.from_item(_item()).model_dump()
    # every pre-OP4.0 field still present under its old name
    for legacy in ("id", "title", "url", "source", "category", "published",
                   "signal_score", "signal_strength", "affected_entities",
                   "summary", "why_it_matters", "impact", "snippet"):
        assert legacy in payload
