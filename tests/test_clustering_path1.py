"""Path 1: a shared company is a subject, not sufficient event identity.

The first four records reproduce the 2026-11-18 authenticated production
diagnosis (titles, timestamps, source labels, and entity hints). The outage
record's MSFT/JPM hints are reconstructed from its retained snippet using the
existing resolver. URLs, scores, and the outage category are synthetic harness
values. Positive/edge controls below are explicitly synthetic. No identity
authority or persisted registry is used by these tests.
"""

from copy import deepcopy
from datetime import datetime, timedelta, timezone
from itertools import permutations

import pytest

from app.clustering import _should_cluster, cluster_items
from app.events import build_market_events
from app.feeds import FeedItem


NOW = datetime(2026, 11, 18, 18, 21, tzinfo=timezone.utc)


def item(title, entities, *, source="The Information", category="Markets",
         published="2026-11-18T14:00:51+00:00", snippet=""):
    return FeedItem(
        title=title, url="https://fixtures.test/" + title.replace(" ", "-"),
        source=source, category=category,
        published_dt=datetime.fromisoformat(published), snippet=snippet,
        affected_entities=entities, signal_score=75, signal_strength="strong",
    )


@pytest.fixture
def captured():
    return [
        item("Microsoft Nears $500 Million Deal to Sell AI to ByteDance, Irking OpenAI",
             ["MSFT", "Technology"], category="M&A"),
        item("US tech outages blamed on rush to fix bugs found by AI",
             ["MSFT", "JPM"], source="FT Companies",
             published="2026-11-18T12:44:53+00:00",
             snippet="Experts say a race to patch software flaws likely created "
                     "instability in computer systems at Microsoft, JPMorgan, "
                     "the FAA and others"),
        item("U.S. Banks Seek Loan Protections Against Chip Smuggling with "
             "Southeast Asian Data Center Operator",
             ["JPM", "C", "Semiconductors"],
             published="2026-11-18T15:12:47+00:00"),
        item("JPMorgan seeks to revive stalled software debt sale with steep price cuts",
             ["JPM", "Technology"], source="FT Companies",
             published="2026-11-18T16:30:02+00:00"),
    ]


@pytest.mark.parametrize("left,right", [(0, 1), (1, 2), (2, 3)])
def test_captured_shared_company_is_not_same_event(captured, left, right):
    # Empty salient vocabulary isolates Path 1 from Path 3.
    a, b = captured[left], captured[right]
    assert not _should_cluster(a, b)
    assert not _should_cluster(b, a)


def test_captured_outage_entities_are_grounded(captured):
    from app.companies import resolve_companies

    outage = captured[1]
    assert resolve_companies(outage.title + " " + outage.snippet) == ["MSFT", "JPM"]


def test_captured_bridge_stays_separate_in_every_input_order(captured):
    before = deepcopy(captured)
    for order in permutations(captured):
        clusters = cluster_items(list(order))
        assert len(clusters) == 4
        assert all(c.story_count == 1 and not c.related for c in clusters)
        assert {c.primary.url for c in clusters} == {i.url for i in captured}
    assert captured == before  # no mutation of articles, entities, or scores


def test_corrected_memberships_reach_event_evidence_and_api(captured):
    from api.routes.feed import _build_response
    from app.processed_cache import ProcessedFeed

    clusters = cluster_items(captured)
    events = build_market_events(clusters, [], now=NOW)
    assert len(events) == 4
    entry = ProcessedFeed(
        items=captured, top_stories={}, market_take="", errors={},
        promo_excluded=0, debug_log=[], clusters=clusters, events=events,
    )
    response = _build_response(entry, age=0)
    by_title = {ev.title: ev for ev in response.events}
    for article in captured:
        ev = by_title[article.title]
        assert [e.url for e in ev.evidence] == [article.url]
        assert ev.source_count == ev.corroboration_count == 1
        assert not ev.merged_event_ids
    assert set(by_title) == {i.title for i in captured}


# Synthetic independent-report controls. Different categories and a four-hour
# gap exclude Paths 2 and 3: these must remain genuine Path 1 successes.
@pytest.mark.parametrize("a,b,entities", [
    ("Microsoft expands Azure cloud contract with ByteDance",
     "ByteDance expands Microsoft Azure cloud contract", ["MSFT"]),
    ("Nvidia beats earnings estimates and raises revenue guidance",
     "NVDA raises revenue guidance after earnings beat estimates", ["NVDA"]),
    ("JPMorgan cuts price on stalled software debt sale",
     "JPMorgan revives stalled software debt sale with price cuts", ["JPM"]),
    ("JPMorgan Chase faces lawsuit over mortgage lending discrimination",
     "JPM faces mortgage lending discrimination lawsuit", ["JPM"]),
    ("Tesla recalls vehicles over software braking flaw",
     "TSLA recalls vehicles to fix software braking flaw", ["TSLA"]),
])
def test_same_event_reports_keep_path1_merge(a, b, entities):
    first = item(a, entities, category="Company")
    second = item(b, entities, category="Markets",
                  published="2026-11-18T18:00:51+00:00", source="FT Companies")
    assert _should_cluster(first, second)
    assert _should_cluster(second, first)
    clusters = cluster_items([first, second])
    assert len(clusters) == 1 and clusters[0].story_count == 2
    events = build_market_events(clusters, [], now=NOW)
    assert len(events) == 1
    assert {e.url for e in events[0].evidence} == {first.url, second.url}
    assert events[0].source_count == events[0].corroboration_count == 2


@pytest.mark.parametrize("a,b,entities", [
    ("Tesla recalls vehicles over software braking flaw",
     "Tesla breaks ground on vehicle plant in Texas", ["TSLA"]),
    ("JPMorgan Chase appoints chief executive",
     "JPMorgan Chase sells London headquarters", ["JPM"]),
    ("Microsoft Azure contract", "Microsoft Azure outage", ["MSFT"]),
    ("Microsoft expands Azure cloud contract with ByteDance",
     "Microsoft investigates Azure cloud security breach exposing passwords", ["MSFT"]),
    ("Advanced Micro Devices earnings", "Advanced Micro Devices lawsuit", ["AMD"]),
    ("Microsoft JPMorgan outage", "Microsoft JPMorgan partnership", ["MSFT", "JPM"]),
    ("", "", ["MSFT"]),
])
def test_names_aliases_or_one_context_word_are_insufficient(a, b, entities):
    # Different categories exclude the unchanged fallback paths.
    first = item(a, entities, category="Company")
    second = item(b, entities, category="Markets")
    assert not _should_cluster(first, second)
    assert not _should_cluster(second, first)


def test_six_hour_path1_window_is_preserved():
    a = item("Microsoft expands Azure cloud contract with ByteDance", ["MSFT"],
             category="Company")
    b = item("ByteDance expands Microsoft Azure cloud contract", ["MSFT"])
    b.published_dt = a.published_dt + timedelta(hours=6)
    assert _should_cluster(a, b)
    b.published_dt += timedelta(seconds=1)
    assert not _should_cluster(a, b)


def test_same_publisher_reports_do_not_inflate_source_counts():
    a = item("Microsoft expands Azure cloud contract with ByteDance", ["MSFT"])
    b = item("ByteDance expands Microsoft Azure cloud contract", ["MSFT"])
    c = item("Microsoft expands ByteDance Azure cloud contract", ["MSFT"],
             source="FT Companies")
    clusters = cluster_items([a, b, c])
    assert len(clusters) == 1 and clusters[0].story_count == 3
    events = build_market_events(clusters, [], now=NOW)
    assert len(events) == 1 and len(events[0].evidence) == 3
    assert events[0].source_count == events[0].corroboration_count == 2
