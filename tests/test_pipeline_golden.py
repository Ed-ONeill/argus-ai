"""
tests/test_pipeline_golden.py — OP1.5 (Sprint 1): golden-fixture regression
harness for the observation pipeline.

Drives canned feedparser payloads through the real pipeline
(fetch_all → cluster_items → extract_themes → build_market_events →
build_explanations) with no network and a fixed event-time clock, and pins
the CURRENT behavior as the reviewable baseline.

RE-BASELINED IN SPRINT 2 (OP1.2/OP1.3): the Sprint 1 baseline deliberately
pinned the audit-I4 defect — the three-wire Fed story surviving dedup as one
item with corroboration_count == 1. Merge-dedup now folds the duplicate
tellings into the canonical survivor as MergedSource provenance, and the
event layer spends it:

  - one canonical item, best-tier survivor (tie → freshest), duplicates
    preserved as provenance with true first_seen_dt;
  - the three-wire story registers corroboration_count == 3, corroborated
    lane (developing == False);
  - per-source funnel stats (PerSourceStats) reconcile with the funnel;
  - fetched_at is stamped and stable across re-fetches;
  - the pipeline is deterministic for fixed inputs.

Assertions are structural (title sets, memberships, counts), not float
score equality — recency scoring reads the wall clock, so exact scores are
not stable, but survival, dedup, clustering, and corroboration are.
"""

from __future__ import annotations

import time
from datetime import datetime, timedelta, timezone

import pytest

import app.theme_graph as theme_graph
from app.clustering import cluster_items
from app.events import build_market_events
from app.explanations import build_explanations
from app.feeds import FeedManager
from app.theme_graph import ThemeMomentumTracker


# ── Canned feeds ───────────────────────────────────────────────────────────────
# Four real tier-mapped sources; published times are relative to test start so
# recency scoring behaves normally. The Fed story runs on three wires with
# title-Jaccard ≥ 0.5 — the classic corroboration signal dedup currently eats.

REGISTRY = [
    ("Bloomberg Markets", "https://fixtures.test/bloomberg", "Markets"),
    ("Financial Times",   "https://fixtures.test/ft",        "Markets"),
    ("CNBC Economy",      "https://fixtures.test/cnbc",      "Markets"),
    ("MarketWatch",       "https://fixtures.test/mw",        "Markets"),
]

FED_BB   = "Fed signals September rate cut as inflation cools"
FED_FT   = "Fed signals September rate cut as inflation eases"
FED_CNBC = "Fed signals September rate cut as inflation cools further"   # freshest → survivor
NVDA     = "Nvidia beats earnings estimates and raises guidance on data center demand"
OIL      = "Oil prices surge after OPEC announces production cuts"
YIELDS   = "Treasury yields climb as bond selloff deepens"
NOISE    = "10 best dividend stocks to buy now for retirement"


def _entry(title: str, url: str, age_minutes: int, now: datetime, snippet: str = "") -> dict:
    ts = (now - timedelta(minutes=age_minutes)).timestamp()
    return {
        "title": title,
        "link": url,
        "summary": snippet or f"{title}. Details from the wire.",
        "published_parsed": time.gmtime(ts),
    }


def _payloads(now: datetime) -> dict[str, list[dict]]:
    return {
        "https://fixtures.test/bloomberg": [
            _entry(FED_BB, "https://fixtures.test/bloomberg/fed", 120, now),
            _entry(NVDA, "https://fixtures.test/bloomberg/nvda", 180, now),
        ],
        "https://fixtures.test/ft": [
            _entry(FED_FT, "https://fixtures.test/ft/fed", 60, now),
            _entry(OIL, "https://fixtures.test/ft/oil", 300, now),
        ],
        "https://fixtures.test/cnbc": [
            _entry(FED_CNBC, "https://fixtures.test/cnbc/fed", 30, now),
        ],
        "https://fixtures.test/mw": [
            _entry(NOISE, "https://fixtures.test/mw/noise", 65, now),
            _entry(YIELDS, "https://fixtures.test/mw/yields", 240, now),
        ],
    }


class _FakeFeed:
    def __init__(self, entries: list[dict]):
        self.entries = entries

    def get(self, key, default=None):   # feed.get("bozo") in _fetch_one
        return default


@pytest.fixture()
def pipeline(monkeypatch):
    """A hermetic pipeline: mocked feedparser, no SEC fetch, fresh momentum
    tracker, and momentum persistence detached from the real store."""
    now = datetime.now(timezone.utc)
    payloads = _payloads(now)

    import feedparser
    monkeypatch.setattr(
        feedparser, "parse",
        lambda url, *a, **kw: _FakeFeed(payloads.get(url, [])),
    )
    monkeypatch.setattr(FeedManager, "_fetch_sec_watchlist",
                        lambda self, force_refresh=False: [])
    monkeypatch.setattr(theme_graph, "_momentum_tracker", ThemeMomentumTracker())
    monkeypatch.setattr(theme_graph, "_momentum_rehydrated", True)
    monkeypatch.setattr(theme_graph, "_persist_momentum_state", lambda now: None)
    return now


def _run_feed(now: datetime) -> tuple[FeedManager, list]:
    mgr = FeedManager()
    items = mgr.fetch_all(registry=REGISTRY, force_refresh=True)
    return mgr, items


# ── Golden: ingestion funnel ───────────────────────────────────────────────────

def test_merge_dedup_folds_corroboration_into_canonical_survivor(pipeline):
    now = pipeline
    _, items = _run_feed(pipeline)
    titles = {i.title for i in items}

    # One event remains one event: a single Fed telling survives. All three
    # wires are tier 1, so the tie-break keeps the freshest (CNBC) — but the
    # other two are FOLDED, not deleted.
    assert FED_CNBC in titles
    assert FED_BB not in titles and FED_FT not in titles
    assert {NVDA, OIL, YIELDS} <= titles
    assert NOISE not in titles
    assert len(titles) == 4

    fed = next(i for i in items if i.title == FED_CNBC)
    rows = {r.url: r for r in fed.merged_sources}
    assert set(rows) == {"https://fixtures.test/ft/fed", "https://fixtures.test/bloomberg/fed"}
    assert rows["https://fixtures.test/bloomberg/fed"].source == "Bloomberg Markets"
    assert rows["https://fixtures.test/bloomberg/fed"].title == FED_BB
    assert rows["https://fixtures.test/ft/fed"].tier == 1
    # first observation anchors to the EARLIEST wire (Bloomberg, 120m ago);
    # gmtime rounds to seconds, hence the tolerance
    assert fed.first_seen_dt is not None
    assert abs((fed.first_seen_dt - (now - timedelta(minutes=120))).total_seconds()) < 2
    # published_dt semantics untouched: the survivor's own publish time
    assert abs((fed.published_dt - (now - timedelta(minutes=30))).total_seconds()) < 2


def test_per_source_funnel_stats_reconcile(pipeline):
    mgr, items = _run_feed(pipeline)
    st = mgr.last_source_stats

    assert st["Bloomberg Markets"].raw_fetched == 2
    assert st["Financial Times"].raw_fetched == 2
    assert st["CNBC Economy"].raw_fetched == 1
    assert st["MarketWatch"].raw_fetched == 2

    # Dedup: 7 raw → 5 (two Fed duplicates removed). Survivor attribution:
    assert st["CNBC Economy"].post_dedup == 1
    assert st["Bloomberg Markets"].post_dedup == 1     # NVDA only — its Fed copy died
    assert st["Financial Times"].post_dedup == 1       # OIL only
    assert st["MarketWatch"].post_dedup == 2
    assert sum(s.raw_fetched for s in st.values()) == 7
    assert sum(s.post_dedup for s in st.values()) == 5

    # The noise item is dropped at scoring and recorded, title retained.
    mw = st["MarketWatch"]
    assert mw.kept == 1
    assert mw.hard_excluded + mw.below_threshold == 1
    assert NOISE in mw.dropped_titles
    assert sum(s.kept for s in st.values()) == len(items) == 4


def test_fetched_at_is_stamped_and_stable_across_refetches(pipeline):
    mgr, items = _run_feed(pipeline)
    assert all(i.fetched_at is not None for i in items)
    first = {i.url: i.fetched_at for i in items}

    # A forced re-fetch builds new FeedItem objects for the same URLs; the
    # first-observation stamp must not move.
    items2 = mgr.fetch_all(registry=REGISTRY, force_refresh=True)
    assert {i.url: i.fetched_at for i in items2} == first


def test_feed_output_is_deterministic_for_fixed_inputs(pipeline):
    _, items_a = _run_feed(pipeline)
    _, items_b = _run_feed(pipeline)
    assert [i.title for i in items_a] == [i.title for i in items_b]
    assert [i.url for i in items_a] == [i.url for i in items_b]


# ── Golden: clusters → events → explanations ──────────────────────────────────

def _events_pipeline(now: datetime):
    _, items = _run_feed(now)
    clusters = cluster_items(items)
    themes = theme_graph.extract_themes(clusters, now=now)
    events = build_market_events(clusters, themes, now=now)
    explanations = build_explanations(events, themes, graph=None)
    return items, clusters, themes, events, explanations


def test_events_spend_preserved_corroboration(pipeline):
    now = pipeline
    items, clusters, themes, events, explanations = _events_pipeline(pipeline)

    assert len(clusters) >= 1
    assert len(events) >= 1
    by_title = {e.title: e for e in events}
    assert FED_CNBC in by_title, "the Fed event must be admitted (tier-1 source)"

    fed = by_title[FED_CNBC]
    # Sprint 2 re-baseline of the audit-I4 tripwire: the three-wire story now
    # enters the event layer with its independent attestations intact.
    assert fed.source_count == 3
    assert fed.corroboration_count == 3
    assert fed.developing is False                     # corroborated lane
    assert {e.source for e in fed.evidence} == \
        {"CNBC Economy", "Financial Times", "Bloomberg Markets"}
    assert all(e.qualified for e in fed.evidence)
    # decay anchors to the earliest wire's publish time, not the re-report
    first_seen = datetime.fromisoformat(fed.first_seen)
    assert abs((first_seen - (now - timedelta(minutes=120))).total_seconds()) < 2

    # Event identity and theme linkage are untouched: the event still IS its
    # cluster (id equality is the load-bearing join), anchored on the same
    # freshest primary as before Sprint 2.
    fed_cluster = next(c for c in clusters if c.primary.title == FED_CNBC)
    assert fed.id == fed_cluster.id


def test_explanations_cover_events_and_populate_typed_chains(pipeline):
    _, _, themes, events, explanations = _events_pipeline(pipeline)

    assert set(explanations.keys()) == {e.id for e in events}
    for e in events:
        # build_explanations must set the typed field on every event —
        # [] is a legitimate value (no recorded path), absence is not.
        assert isinstance(e.transmission_chain, list)


def test_event_layer_is_deterministic_for_fixed_inputs(pipeline, monkeypatch):
    _, _, _, events_a, _ = _events_pipeline(pipeline)
    # fresh tracker for the second pass — same one-cycle conditions
    monkeypatch.setattr(theme_graph, "_momentum_tracker", ThemeMomentumTracker())
    _, _, _, events_b, _ = _events_pipeline(pipeline)

    assert [(e.id, e.title, e.corroboration_count) for e in events_a] == \
           [(e.id, e.title, e.corroboration_count) for e in events_b]
