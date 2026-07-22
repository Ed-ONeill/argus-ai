"""
tests/test_feeditem_compat.py — OP1.1 (Sprint 1): additive FeedItem schema.

Verifies the plan's backward-compatibility contract: pre-change pickles
(written before merged_sources / first_seen_dt / fetched_at existed) must
deserialize into fully-populated items, and the new fields must round-trip.
"""

from __future__ import annotations

import pickle
from datetime import datetime, timezone

import pytest

from app.feeds import FeedItem, MergedSource


def _item(**overrides) -> FeedItem:
    base = dict(
        title="Fed signals September rate cut as inflation cools",
        url="https://example.test/fed",
        source="Bloomberg Markets",
        category="Markets",
        published_dt=datetime(2026, 7, 21, 12, 0, tzinfo=timezone.utc),
    )
    base.update(overrides)
    return FeedItem(**base)


def test_old_pickle_without_new_fields_gets_defaults():
    """Simulate a pre-change pickle: an instance whose __dict__ lacks the
    OP1.1 fields (pickle restores dataclasses via __dict__, so defaults do
    NOT apply on load — __setstate__ must fill them)."""
    item = _item()
    for name in ("merged_sources", "first_seen_dt", "fetched_at"):
        del item.__dict__[name]
    restored = pickle.loads(pickle.dumps(item))

    assert restored.merged_sources == []
    assert restored.first_seen_dt is None
    assert restored.fetched_at is None
    # untouched fields survive
    assert restored.title == item.title
    assert restored.published_dt == item.published_dt


def test_much_older_pickle_missing_scoring_fields_also_heals():
    """__setstate__ is generic: any field missing from an old payload is
    filled with its declared default, not just the OP1.1 trio."""
    item = _item()
    for name in ("merged_sources", "first_seen_dt", "fetched_at",
                 "institutional_score", "graph_alignment_score"):
        del item.__dict__[name]
    restored = pickle.loads(pickle.dumps(item))

    assert restored.institutional_score == 0.0
    assert restored.graph_alignment_score == 0.0
    assert restored.merged_sources == []


def test_new_fields_round_trip():
    fetched = datetime(2026, 7, 21, 12, 5, tzinfo=timezone.utc)
    first = datetime(2026, 7, 21, 9, 0, tzinfo=timezone.utc)
    merged = MergedSource(
        source="Financial Times",
        title="Fed signals September rate cut as inflation eases",
        url="https://example.test/fed-ft",
        published_dt=first,
        snippet="snippet",
        tier=1,
    )
    item = _item(merged_sources=[merged], first_seen_dt=first, fetched_at=fetched)
    restored = pickle.loads(pickle.dumps(item))

    assert restored.fetched_at == fetched
    assert restored.first_seen_dt == first
    assert restored.merged_sources == [merged]
    assert restored.merged_sources[0].tier == 1


def test_merged_source_is_frozen():
    ms = MergedSource(source="FT", title="t", url="u")
    with pytest.raises(Exception):
        ms.source = "other"  # type: ignore[misc]


def test_defaults_do_not_change_scoring_inputs():
    """OP1.1 must be pure schema: a fresh item's new fields are inert
    defaults, and nothing else about the dataclass changed."""
    item = _item()
    assert item.merged_sources == []
    assert item.first_seen_dt is None
    assert item.fetched_at is None
    assert item.signal_score == 0.0
