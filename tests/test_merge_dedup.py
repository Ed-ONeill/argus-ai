"""
tests/test_merge_dedup.py — OP1.2 + OP1.3 (Sprint 2): corroboration-preserving
merge-dedup and corroboration spending in the event layer.

The review criterion: one event remains one event, but Argus stops throwing
away independent evidence. The dedup LAW (title-Jaccard ≥ 0.5 against the
freshest telling's anchor) is unchanged — only the fate of duplicates is:
fold-with-provenance instead of delete, best-tier survivor instead of
blindly-freshest, and the event layer counts the preserved attestations.
"""

from __future__ import annotations

import pickle
from datetime import datetime, timedelta, timezone

import pytest

from app.clustering import cluster_items
from app.config import settings
from app.events import build_market_events
from app.feeds import FeedItem, MergedSource, _dedup_items

NOW = datetime(2026, 7, 21, 15, 0, tzinfo=timezone.utc)

# All tier-1 unless stated: Bloomberg Markets/Financial Times/CNBC Economy
# map to tier 1, MarketWatch to tier 2, unknown sources to tier 4.
FED = "Fed signals September rate cut as inflation cools"


def _item(source: str, url: str, title: str = FED, age_min: int = 60,
          published: bool = True, snippet: str = "wire snippet") -> FeedItem:
    return FeedItem(
        title=title,
        url=url,
        source=source,
        category="Markets",
        published_dt=(NOW - timedelta(minutes=age_min)) if published else None,
        snippet=snippet,
    )


@pytest.fixture(autouse=True)
def _merge_mode(monkeypatch):
    monkeypatch.setattr(settings, "merge_dedup", True)


# ── OP1.2: folding ─────────────────────────────────────────────────────────────

def test_three_publishers_fold_into_one_canonical_item():
    items = [   # newest-first, as fetch_all sorts them
        _item("CNBC Economy", "https://t/cnbc", FED + " further", 30),
        _item("Financial Times", "https://t/ft", FED.replace("cools", "eases"), 60),
        _item("Bloomberg Markets", "https://t/bb", FED, 120),
    ]
    out = _dedup_items(items)

    assert len(out) == 1
    survivor = out[0]
    assert survivor.source == "CNBC Economy"        # all tier 1 → freshest tie-break
    rows = {r.url: r for r in survivor.merged_sources}
    assert set(rows) == {"https://t/ft", "https://t/bb"}
    # every provenance field preserved
    ft = rows["https://t/ft"]
    assert ft.source == "Financial Times"
    assert ft.title == FED.replace("cools", "eases")
    assert ft.published_dt == NOW - timedelta(minutes=60)
    assert ft.snippet == "wire snippet"
    assert ft.tier == 1
    # earliest valid timestamp wins
    assert survivor.first_seen_dt == NOW - timedelta(minutes=120)
    # published_dt semantics untouched: still this copy's publish time
    assert survivor.published_dt == NOW - timedelta(minutes=30)


def test_survivor_is_best_tier_not_freshest():
    items = [
        _item("MarketWatch", "https://t/mw", FED, 30),            # tier 2, freshest
        _item("Bloomberg Markets", "https://t/bb", FED, 120),     # tier 1, older
    ]
    out = _dedup_items(items)
    assert len(out) == 1
    assert out[0].source == "Bloomberg Markets"                   # tier beats recency
    assert [r.url for r in out[0].merged_sources] == ["https://t/mw"]
    assert out[0].first_seen_dt == NOW - timedelta(minutes=120)


def test_tier_tie_keeps_freshest_and_is_deterministic():
    def build():
        return [
            _item("CNBC Economy", "https://t/cnbc", FED, 30),
            _item("Financial Times", "https://t/ft", FED, 90),
        ]
    a, b = _dedup_items(build()), _dedup_items(build())
    for out in (a, b):
        assert out[0].source == "CNBC Economy"
    assert [r.url for r in a[0].merged_sources] == [r.url for r in b[0].merged_sources]


def test_survivor_swap_transfers_existing_provenance():
    """FT folds into CNBC first; then Bloomberg... all tier1 — use tiers to
    force a swap: MarketWatch anchor accumulates FT, then Bloomberg takes over
    and must inherit every earlier row."""
    items = [
        _item("MarketWatch", "https://t/mw", FED, 10),            # tier 2 anchor
        _item("Financial Times", "https://t/ft", FED, 60),        # tier 1 → swap #1
        _item("Bloomberg Markets", "https://t/bb", FED, 120),     # tier 1, older → no swap #2
    ]
    out = _dedup_items(items)
    assert len(out) == 1
    assert out[0].source == "Financial Times"                     # first tier-1 takes over
    assert {r.url for r in out[0].merged_sources} == {"https://t/mw", "https://t/bb"}
    assert out[0].first_seen_dt == NOW - timedelta(minutes=120)


def test_same_publisher_copies_fold_without_losing_provenance():
    items = [
        _item("Bloomberg Markets", "https://t/bb1", FED, 30),
        _item("Bloomberg Markets", "https://t/bb2", FED + " today", 90),
    ]
    out = _dedup_items(items)
    assert len(out) == 1
    assert [r.url for r in out[0].merged_sources] == ["https://t/bb2"]


def test_duplicate_urls_never_create_second_attestation():
    items = [
        _item("CNBC Economy", "https://t/same", FED, 30),
        _item("CNBC Economy", "https://t/same", FED, 60),          # same page again
        _item("Financial Times", "https://t/same", FED, 90),       # mirror of same page
    ]
    out = _dedup_items(items)
    assert len(out) == 1
    assert out[0].merged_sources == []                             # url already attested


def test_missing_timestamps_are_ignored_not_invented():
    items = [
        _item("CNBC Economy", "https://t/cnbc", FED, 30, published=False),
        _item("Financial Times", "https://t/ft", FED, 60),
        _item("Bloomberg Markets", "https://t/bb", FED, 45, published=False),
    ]
    out = _dedup_items(items)
    assert len(out) == 1
    assert out[0].first_seen_dt == NOW - timedelta(minutes=60)     # only valid time

    all_none = _dedup_items([
        _item("CNBC Economy", "https://t/a", FED, 0, published=False),
        _item("Financial Times", "https://t/b", FED, 0, published=False),
    ])
    assert all_none[0].first_seen_dt is None                       # nothing synthesized


def test_topically_distinct_stories_do_not_merge():
    items = [
        _item("CNBC Economy", "https://t/fed", FED, 30),
        _item("Financial Times", "https://t/opec",
              "Oil prices surge after OPEC announces production cuts", 60),
    ]
    out = _dedup_items(items)
    assert len(out) == 2
    assert all(i.merged_sources == [] for i in out)


def test_legacy_flag_restores_delete_dedup(monkeypatch):
    monkeypatch.setattr(settings, "merge_dedup", False)
    items = [
        _item("MarketWatch", "https://t/mw", FED, 30),
        _item("Bloomberg Markets", "https://t/bb", FED, 120),
    ]
    out = _dedup_items(items)
    assert len(out) == 1
    assert out[0].source == "MarketWatch"                          # legacy: freshest wins
    assert out[0].merged_sources == []
    assert out[0].first_seen_dt is None


def test_pre_sprint2_pickled_item_flows_through_merge_dedup():
    old = _item("Bloomberg Markets", "https://t/bb", FED, 120)
    for name in ("merged_sources", "first_seen_dt", "fetched_at"):
        del old.__dict__[name]
    healed = pickle.loads(pickle.dumps(old))                       # __setstate__ fills defaults

    out = _dedup_items([_item("CNBC Economy", "https://t/cnbc", FED, 30), healed])
    assert len(out) == 1
    assert {r.url for r in out[0].merged_sources} == {"https://t/bb"}


# ── OP1.3: corroboration spending ─────────────────────────────────────────────

def _fed_event(items: list[FeedItem]):
    survivors = _dedup_items(items)
    clusters = cluster_items(survivors)
    events = build_market_events(clusters, [], now=NOW)
    assert len(events) == 1
    return events[0]


def test_three_wire_story_is_corroborated_not_developing():
    ev = _fed_event([
        _item("CNBC Economy", "https://t/cnbc", FED + " further", 30),
        _item("Financial Times", "https://t/ft", FED.replace("cools", "eases"), 60),
        _item("Bloomberg Markets", "https://t/bb", FED, 120),
    ])
    assert ev.source_count == 3
    assert ev.corroboration_count == 3                # three qualified tier-1 publishers
    assert ev.developing is False                     # promoted out of the developing lane
    assert len(ev.evidence) == 3
    assert all(e.qualified for e in ev.evidence)
    assert ev.first_seen == (NOW - timedelta(minutes=120)).isoformat()
    assert ev.last_updated == (NOW - timedelta(minutes=30)).isoformat()


def test_single_source_stays_developing():
    ev = _fed_event([_item("CNBC Economy", "https://t/cnbc", FED, 30)])
    assert ev.corroboration_count == 1
    assert ev.developing is True


def test_same_publisher_syndication_does_not_inflate_corroboration():
    ev = _fed_event([
        _item("Bloomberg Markets", "https://t/bb1", FED, 30),
        _item("Bloomberg Markets", "https://t/bb2", FED + " today", 90),
    ])
    assert len(ev.evidence) == 2                      # both pages preserved as evidence
    assert ev.source_count == 1                       # one publisher
    assert ev.corroboration_count == 1                # no self-corroboration
    assert ev.developing is True


def test_unqualified_tier_does_not_corroborate():
    ev = _fed_event([
        _item("CNBC Economy", "https://t/cnbc", FED, 30),
        _item("Some Unknown Blog", "https://t/blog", FED, 90),     # tier 4
    ])
    tiers = {e.source: e.tier for e in ev.evidence}
    assert tiers["Some Unknown Blog"] == 4
    assert ev.source_count == 2                       # seen, recorded as evidence
    assert ev.corroboration_count == 1                # but never corroborating
    assert ev.developing is True


def test_corroboration_promotion_raises_editorial_score():
    """The existing corroboration multiplier — the only confidence factor tied
    to corroboration — now actually fires for multi-wire stories."""
    solo = _fed_event([_item("CNBC Economy", "https://t/cnbc", FED + " further", 30)])
    wired = _fed_event([
        _item("CNBC Economy", "https://t/cnbc", FED + " further", 30),
        _item("Financial Times", "https://t/ft", FED.replace("cools", "eases"), 60),
        _item("Bloomberg Markets", "https://t/bb", FED, 120),
    ])
    assert wired.editorial_score > solo.editorial_score
