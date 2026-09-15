"""
tests/test_clustering_path3.py — RC3-EA1: Path 3 (salient-anchor) clustering
integrity.

THE DEFECT (diagnosed 2026-09-14, implemented as RC3-EA1): Path 3 of
`_should_cluster` merged two same-category stories on ONE shared capitalized
"salient anchor" token. Country and generic topical words qualify as anchors
("China", "Iran", "Canada", even "Here's"), so provably unrelated events were
grouped into one cluster, whose articles the event layer then spends verbatim
as evidence — producing "N sources, N agree" over off-topic cards.

Evidence the fixtures reproduce:
  • AUTHENTICATED PRODUCTION (captured 2026-09): the event "China criticises
    idea it is in 'malicious competition' over AI" displayed "4 sources,
    4 agree" with a U.S.-China AI pacing story, "China Passes Halfway Mark of
    US Soybean Pledge Ahead of Xi Visit", and "FAW to become GAC's No. 2
    shareholder in China auto sector shake-up" as evidence.
  • PERSISTED RECORD (data/feed_cache/feed_0f875b7be67b.pkl, cycle generated
    2026-07-25T17:26Z): four multi-story clusters, ALL cross-event, joined on
    the anchors 'heres', 'canada', 'iran', 'trumps'.

THE CORRECTION under test: a single shared anchor is subject overlap, not
event identity. A Path-3 merge now needs affirmative event-specific support —
a second shared anchor, or ≥ _ANCHOR_MIN_SUPPORT additional shared content
tokens — and two headlines that each carry salient anchors the other lacks
never merge (generalized subject-divergence guard). Paths 1 and 2 unchanged.

FIXTURE PROVENANCE — captured vs synthetic, marked per constant below:
  [CAPTURED-PROD]   headline captured verbatim from the authenticated
                    production /api/feed/ confirmation (sources and timestamps
                    for these were NOT captured; the fixture's source names
                    and publish times are synthetic but production-shaped).
  [CAPTURED-PKL]    headline + source + reclassified category taken verbatim
                    from the persisted 2026-07-25 ProcessedFeed record
                    (publish times synthesized inside the original same-cycle
                    window).
  [SYNTHETIC]       constructed for control coverage (including the tungsten
                    and France/Kyivstar walkthrough cases, whose original
                    records are not recoverable — production events persist
                    only per-cycle).

Expected memberships are grounded in event facts (actor, action, object,
amount, location, timing), not in what the implementation happens to return.

The whole suite runs the REAL pipeline surface: canned feedparser payloads →
FeedManager.fetch_all (scoring, category reclassification, entity extraction,
merge-dedup) → cluster_items → build_market_events → the API response builder.
"""

from __future__ import annotations

import time
from datetime import datetime, timedelta, timezone

import pytest

from app.clustering import (
    _JACCARD_THRESH,
    _NON_SPECIFIC,
    _build_salient_vocab,
    _title_tokens,
    cluster_items,
)
from app.events import build_market_events
from app.feeds import FeedManager


# ── Harness (mirrors tests/test_pipeline_golden.py) ───────────────────────────

def _entry(title: str, url: str, age_minutes: int, now: datetime,
           snippet: str = "") -> dict:
    ts = (now - timedelta(minutes=age_minutes)).timestamp()
    return {
        "title": title,
        "link": url,
        "summary": snippet or f"{title}. Details from the wire.",
        "published_parsed": time.gmtime(ts),
    }


class _FakeFeed:
    def __init__(self, entries: list[dict]):
        self.entries = entries

    def get(self, key, default=None):
        return default


def _run_feed(monkeypatch, registry, payloads):
    import feedparser
    monkeypatch.setattr(
        feedparser, "parse",
        lambda url, *a, **kw: _FakeFeed(payloads.get(url, [])),
    )
    monkeypatch.setattr(FeedManager, "_fetch_sec_watchlist",
                        lambda self, force_refresh=False: [])
    mgr = FeedManager()
    return mgr.fetch_all(registry=registry, force_refresh=True)


def _clusters_by_title(clusters) -> dict[str, set[str]]:
    """primary title -> set of ALL member titles (primary + related)."""
    return {
        c.primary.title: {c.primary.title, *(r.title for r in c.related)}
        for c in clusters
    }


def _membership(clusters) -> dict[str, frozenset[str]]:
    """title -> frozenset of member titles of the cluster containing it."""
    out: dict[str, frozenset[str]] = {}
    for c in clusters:
        members = frozenset({c.primary.title, *(r.title for r in c.related)})
        for t in members:
            out[t] = members
    return out


def _assert_all_singletons(clusters, items) -> None:
    assert len(clusters) == len(items), (
        "expected every story in its own cluster; got "
        + repr({c.primary.title: [r.title for r in c.related]
                for c in clusters if c.story_count > 1})
    )


def _assert_no_other_path_could_merge(items) -> None:
    """Document that Paths 1 and 2 cannot recreate the merge for this fixture:
    no shared specific entity pair, and every title pair is below the Jaccard
    threshold. (Path 3 preconditions — same category, shared anchor, window —
    are asserted per-test so the fixtures exercise the corrected rule.)"""
    for i, a in enumerate(items):
        for b in items[i + 1:]:
            spec_a = {e for e in a.affected_entities if e not in _NON_SPECIFIC}
            spec_b = {e for e in b.affected_entities if e not in _NON_SPECIFIC}
            assert not (spec_a & spec_b), (a.title, b.title, spec_a & spec_b)
            ta, tb = _title_tokens(a.title), _title_tokens(b.title)
            j = len(ta & tb) / len(ta | tb) if (ta | tb) else 0.0
            assert j < _JACCARD_THRESH, (a.title, b.title, j)


NOW = datetime.now(timezone.utc)


# ═══════════════════════════════════════════════════════════════════════════════
# 1. The confirmed production collision (China/AI ⇄ soybean ⇄ FAW/GAC ⇄ pacing)
# ═══════════════════════════════════════════════════════════════════════════════

# [CAPTURED-PROD] — verbatim production headlines
CH_AI = "China criticises idea it is in 'malicious competition' over AI"
SOY   = "China Passes Halfway Mark of US Soybean Pledge Ahead of Xi Visit"
FAW   = "FAW to become GAC's No. 2 shareholder in China auto sector shake-up"
# [SYNTHETIC] — production confirmed "a U.S.-China AI pacing story"; the exact
# headline was not captured, so a representative pacing headline stands in.
PACING = "US must move faster than China on AI, White House officials say"

PROD_REGISTRY = [
    ("CNBC Economy",      "https://fixtures.test/cnbc", "Markets"),
    ("Bloomberg Markets", "https://fixtures.test/bb",   "Markets"),
    ("Financial Times",   "https://fixtures.test/ft",   "Markets"),
    ("NYT DealBook",      "https://fixtures.test/nyt",  "Markets"),
]


def _prod_payloads(now: datetime) -> dict:
    return {
        "https://fixtures.test/cnbc": [_entry(CH_AI, "https://fixtures.test/cnbc/ch-ai", 60, now)],
        "https://fixtures.test/bb":   [_entry(SOY, "https://fixtures.test/bb/soy", 120, now)],
        "https://fixtures.test/ft":   [_entry(PACING, "https://fixtures.test/ft/pacing", 180, now)],
        "https://fixtures.test/nyt":  [_entry(FAW, "https://fixtures.test/nyt/faw", 240, now)],
    }


@pytest.fixture()
def prod_items(monkeypatch):
    items = _run_feed(monkeypatch, PROD_REGISTRY, _prod_payloads(NOW))
    titles = {i.title for i in items}
    assert titles == {CH_AI, SOY, FAW, PACING}, f"fixture lost items: {titles}"
    return items


def test_production_collision_preconditions_still_exercise_path3(prod_items):
    """The fixture must reach the diagnosed Path 3 decision — same category
    everywhere (the geo reclassifier fires on 'China'), 'china' in the salient
    vocabulary, and no other path able to merge — so the separation asserted
    below is Path 3's own ruling, not an accident of the fixture."""
    assert {i.category for i in prod_items} == {"Geopolitical"}
    vocab = _build_salient_vocab(prod_items)
    assert "china" in vocab, vocab
    _assert_no_other_path_could_merge(prod_items)


def test_production_collision_events_are_separated(prod_items):
    """REGRESSION (fails on the pre-RC3-EA1 baseline, which grouped all four
    stories into one cluster on the shared anchor 'china').

    Event facts: a Chinese-government statement criticising 'malicious
    competition' over AI, a soybean-purchase progress report, an FAW/GAC
    shareholding restructuring, and a U.S. AI-policy stance are four different
    actors performing four different actions on four different objects."""
    clusters = cluster_items(prod_items)
    _assert_all_singletons(clusters, prod_items)


def test_production_collision_evidence_and_counts_follow_membership(prod_items):
    """Section-5 invariants through the real event layer: evidence, provenance
    and publisher counts derive from the corrected membership; rejected
    articles are NOT dropped — each remains available to its own event."""
    clusters = cluster_items(prod_items)
    events = build_market_events(clusters, [], now=NOW)

    by_title = {e.title: e for e in events}
    assert set(by_title) == {CH_AI, SOY, FAW, PACING}   # nothing lost, nothing merged

    ch = by_title[CH_AI]
    assert [e.title for e in ch.evidence] == [CH_AI]
    assert ch.source_count == 1
    # corroboration_count remains the EXISTING qualified-distinct-publisher
    # calculation (CNBC Economy is tier 1 → qualified), applied to the
    # corrected membership: one publisher, not four.
    assert ch.corroboration_count == 1
    assert ch.developing is True                        # F2 lane, unchanged rule

    # The off-topic articles keep their own evidence rows under their own ids.
    for title in (SOY, FAW, PACING):
        ev = by_title[title]
        assert [e.title for e in ev.evidence] == [title]
        assert ev.source_count == ev.corroboration_count == 1

    # No two of the four events share an evidence URL.
    urls = [e.url for ev in events for e in ev.evidence]
    assert len(urls) == len(set(urls)) == 4


def test_production_collision_api_payload_matches_membership(prod_items):
    """The API response builder serializes the corrected membership verbatim —
    the payload the Event page renders can no longer carry the off-topic cards."""
    from api.routes.feed import _build_response
    from app.processed_cache import ProcessedFeed

    clusters = cluster_items(prod_items)
    events = build_market_events(clusters, [], now=NOW)
    entry = ProcessedFeed(
        items=prod_items, top_stories={}, market_take="", errors={},
        promo_excluded=0, debug_log=[], clusters=clusters, events=events,
    )
    resp = _build_response(entry, age=0.0)
    schema = next(e for e in resp.events if e.title == CH_AI)
    assert [ev.title for ev in schema.evidence] == [CH_AI]
    assert schema.source_count == 1
    assert schema.corroboration_count == 1


# ═══════════════════════════════════════════════════════════════════════════════
# 2. The persisted 2026-07-25 record — negative controls, captured verbatim
# ═══════════════════════════════════════════════════════════════════════════════

# [CAPTURED-PKL] — titles, sources, and post-reclassification categories are
# verbatim from data/feed_cache/feed_0f875b7be67b.pkl. Times synthesized
# within the original same-cycle window (all pairs < 8h apart).
PAY     = "Pay raises keep shrinking. Here’s how much smaller they’ll be next year."
CALM    = "The stock market’s calm is cracking. Here’s how to prepare for an August shock."
MUNGER  = ("You can ‘ease off the gas’ once you hit $100,000, said Charlie Munger. "
           "Here’s how to get there as fast as possible")
AUSTIN  = "Austin’s Mayor Tackles Housing Affordability, and Canada Faces New Tariffs"
UKR_CAN = "Ukraine Seeks 30-Year Energy Pact With Canada, Minister Says"
HOUTHI  = "Iran-backed Houthis claim missile attack on Saudi Arabia"
LPG     = "India Flags Attack on LPG Tanker in Iran Waters, Says Crew Safe"
TARIFF  = "Trump's new global tariff draws rebukes from trade partners over forced labor justification"
TRADEWAR = "Why Trump’s Renewed Trade War Could Be Costly"

PKL_REGISTRY = [
    ("MarketWatch",       "https://fixtures.test/mw",   "Markets"),
    ("Yahoo Finance",     "https://fixtures.test/yf",   "Markets"),
    ("Bloomberg Markets", "https://fixtures.test/bb",   "Markets"),
    ("BBC World",         "https://fixtures.test/bbc",  "Geopolitical"),
    ("CNBC Economy",      "https://fixtures.test/cnbc", "Markets"),
    ("NYT DealBook",      "https://fixtures.test/nyt",  "Markets"),
]


def _pkl_payloads(now: datetime) -> dict:
    return {
        "https://fixtures.test/mw": [
            _entry(PAY, "https://fixtures.test/mw/pay", 60, now),
            _entry(CALM, "https://fixtures.test/mw/calm", 120, now),
        ],
        "https://fixtures.test/yf":   [_entry(MUNGER, "https://fixtures.test/yf/munger", 90, now)],
        "https://fixtures.test/bb": [
            _entry(AUSTIN, "https://fixtures.test/bb/austin", 60, now),
            _entry(UKR_CAN, "https://fixtures.test/bb/ukrcan", 150, now),
            _entry(LPG, "https://fixtures.test/bb/lpg", 100, now),
        ],
        "https://fixtures.test/bbc":  [_entry(HOUTHI, "https://fixtures.test/bbc/houthi", 70, now)],
        "https://fixtures.test/cnbc": [_entry(TARIFF, "https://fixtures.test/cnbc/tariff", 80, now)],
        "https://fixtures.test/nyt":  [_entry(TRADEWAR, "https://fixtures.test/nyt/tradewar", 140, now)],
    }


def test_persisted_record_bad_merges_are_all_separated(monkeypatch):
    """REGRESSION over the captured record (fails on the baseline, which built
    exactly four multi-story clusters from these nine items, anchored on
    'heres', 'canada', 'iran', 'trumps').

    Event facts: compensation trend vs equity-volatility commentary vs
    personal-finance advice ('Here’s' is a listicle word, not an event — this
    is also the capitalization/normalization control: “Here’s” → anchor
    'heres'); a Texas housing/tariff newsletter vs a Ukraine-Canada energy
    pact; a Houthi missile claim against Saudi Arabia vs an attack on an LPG
    tanker reported by India (different actor, object, and location — 'Iran'
    is shared context); a tariff announcement vs a NYT analysis piece (the
    analysis does not independently report the announcement; the module
    prefers under-clustering, so splitting is the honest ruling — the cost is
    one fewer corroborating card on the tariff event, recorded here
    deliberately)."""
    items = _run_feed(monkeypatch, PKL_REGISTRY, _pkl_payloads(NOW))
    titles = {i.title for i in items}
    expected = {PAY, CALM, MUNGER, AUSTIN, UKR_CAN, HOUTHI, LPG, TARIFF, TRADEWAR}
    assert titles == expected, f"fixture lost items: {expected - titles}"

    # Preconditions: the record's anchors are live in this fixture's vocab.
    vocab = _build_salient_vocab(items)
    assert {"heres", "canada", "iran", "trumps"} <= vocab, vocab

    clusters = cluster_items(items)
    _assert_all_singletons(clusters, items)


# ═══════════════════════════════════════════════════════════════════════════════
# 3. Walkthrough reconstructions — tungsten and France/Kyivstar  [SYNTHETIC]
# ═══════════════════════════════════════════════════════════════════════════════

# [SYNTHETIC] The original records are not recoverable (events persist only
# per-cycle). Headlines reconstruct the reported walkthrough shape: distinct
# events sharing only a country / nationality token.
TUNGSTEN = "US backs $450 million tungsten investment to counter China supply grip"
CHIPCURB = "China criticises US chip export curbs as AI rivalry deepens"
AI_PACE  = "US officials call for faster AI development to keep pace with China"
AUTO_SH  = "Top investor to reshape China auto group's ownership"

SANCTION = "France freezes assets of Russian oligarch under new sanctions"
KYIVSTAR = "Kyivstar restores service after Russian drone attack on Kyiv infrastructure"


def test_synthetic_tungsten_walkthrough_is_separated(monkeypatch):
    """The diagnosed walkthrough shape: a $450M U.S. tungsten investment vs a
    Chinese statement on chip curbs vs a U.S. AI-policy call vs an auto-sector
    shareholder story — four events whose only common ground is 'China'."""
    registry = [
        ("Bloomberg Markets", "https://fixtures.test/bb",   "Markets"),
        ("CNBC Economy",      "https://fixtures.test/cnbc", "Markets"),
        ("Financial Times",   "https://fixtures.test/ft",   "Markets"),
        ("NYT DealBook",      "https://fixtures.test/nyt",  "Markets"),
    ]
    payloads = {
        "https://fixtures.test/bb":   [_entry(TUNGSTEN, "https://fixtures.test/bb/w", 60, NOW)],
        "https://fixtures.test/cnbc": [_entry(CHIPCURB, "https://fixtures.test/cnbc/chip", 120, NOW)],
        "https://fixtures.test/ft":   [_entry(AI_PACE, "https://fixtures.test/ft/pace", 180, NOW)],
        "https://fixtures.test/nyt":  [_entry(AUTO_SH, "https://fixtures.test/nyt/auto", 240, NOW)],
    }
    items = _run_feed(monkeypatch, registry, payloads)
    assert {i.title for i in items} == {TUNGSTEN, CHIPCURB, AI_PACE, AUTO_SH}
    assert "china" in _build_salient_vocab(items)
    _assert_no_other_path_could_merge(items)
    clusters = cluster_items(items)
    _assert_all_singletons(clusters, items)


def test_synthetic_france_kyivstar_is_separated(monkeypatch):
    """Second walkthrough case AND the additional-nationality control (the
    correction was designed on china/iran/canada records — 'Russian' was not
    used in its design). An asset freeze in France and a drone-attack recovery
    in Kyiv share a nationality adjective, not an event."""
    registry = [
        ("Bloomberg Markets", "https://fixtures.test/bb",  "Geopolitical"),
        ("BBC World",         "https://fixtures.test/bbc", "Geopolitical"),
    ]
    payloads = {
        "https://fixtures.test/bb":  [_entry(SANCTION, "https://fixtures.test/bb/sanc", 60, NOW)],
        "https://fixtures.test/bbc": [_entry(KYIVSTAR, "https://fixtures.test/bbc/kyiv", 180, NOW)],
    }
    items = _run_feed(monkeypatch, registry, payloads)
    assert {i.title for i in items} == {SANCTION, KYIVSTAR}
    assert {i.category for i in items} == {"Geopolitical"}
    assert "russian" in _build_salient_vocab(items)
    clusters = cluster_items(items)
    _assert_all_singletons(clusters, items)


# ═══════════════════════════════════════════════════════════════════════════════
# 4. Further negative controls  [SYNTHETIC]
# ═══════════════════════════════════════════════════════════════════════════════

def test_negative_additional_country_brazil(monkeypatch):
    """A country NOT involved in designing the correction: a rate decision and
    a coffee-export record share only 'Brazil'."""
    registry = [
        ("Bloomberg Markets", "https://fixtures.test/bb", "Markets"),
        ("Financial Times",   "https://fixtures.test/ft", "Markets"),
    ]
    a = "Brazil central bank holds benchmark rate at 15%"
    b = "Brazil coffee exports hit record as harvest peaks"
    payloads = {
        "https://fixtures.test/bb": [_entry(a, "https://fixtures.test/bb/rate", 60, NOW)],
        "https://fixtures.test/ft": [_entry(b, "https://fixtures.test/ft/coffee", 200, NOW)],
    }
    items = _run_feed(monkeypatch, registry, payloads)
    assert {i.title for i in items} == {a, b}
    assert len({i.category for i in items}) == 1        # same-category gate holds
    assert "brazil" in _build_salient_vocab(items)
    clusters = cluster_items(items)
    _assert_all_singletons(clusters, items)


def test_negative_same_company_different_events(monkeypatch):
    """Distinct events at ONE organization, published 7h apart so Path 1's 6h
    entity window cannot apply and only Path 3's 8h window is in play: a
    recall and a factory groundbreaking are different actions on different
    objects, sharing only the company name."""
    registry = [
        ("Bloomberg Markets", "https://fixtures.test/bb", "Company"),
        ("CNBC Economy",      "https://fixtures.test/cnbc", "Company"),
    ]
    a = "Tesla recalls 300,000 vehicles over software flaw"
    b = "Tesla breaks ground on new vehicle plant in Texas"
    payloads = {
        "https://fixtures.test/bb":   [_entry(a, "https://fixtures.test/bb/recall", 30, NOW)],
        "https://fixtures.test/cnbc": [_entry(b, "https://fixtures.test/cnbc/plant", 450, NOW)],
    }
    items = _run_feed(monkeypatch, registry, payloads)
    assert {i.title for i in items} == {a, b}
    ia, ib = sorted(items, key=lambda i: i.title)
    assert abs((ia.published_dt - ib.published_dt).total_seconds()) > 6 * 3600
    assert "tesla" in _build_salient_vocab(items)
    clusters = cluster_items(items)
    _assert_all_singletons(clusters, items)


def test_negative_same_person_different_events(monkeypatch):
    """Distinct events around ONE named person (7h apart, same registry
    category): a shareholder-meeting defense and a product teaser share only
    'Musk'."""
    registry = [
        ("Bloomberg Markets", "https://fixtures.test/bb", "Company"),
        ("CNBC Economy",      "https://fixtures.test/cnbc", "Company"),
    ]
    a = "Musk defends pay package at shareholder meeting"
    b = "Musk teases robotaxi reveal within weeks"
    payloads = {
        "https://fixtures.test/bb":   [_entry(a, "https://fixtures.test/bb/pay", 30, NOW)],
        "https://fixtures.test/cnbc": [_entry(b, "https://fixtures.test/cnbc/taxi", 450, NOW)],
    }
    items = _run_feed(monkeypatch, registry, payloads)
    assert {i.title for i in items} == {a, b}
    assert "musk" in _build_salient_vocab(items)
    clusters = cluster_items(items)
    _assert_all_singletons(clusters, items)


def test_negative_apostrophe_normalization_variant(monkeypatch):
    """Capitalization/normalization control: “China’s” normalizes to the
    anchor 'chinas' (apostrophe stripped, trailing s kept). Two distinct
    China-policy stories sharing only that variant token must not merge, and
    the variant must not count as its own supporting content token."""
    registry = [
        ("Bloomberg Markets", "https://fixtures.test/bb", "Markets"),
        ("Financial Times",   "https://fixtures.test/ft", "Markets"),
    ]
    a = "China’s exporters brace for tariff hit"
    b = "China’s regulators tighten data rules for tech platforms"
    payloads = {
        "https://fixtures.test/bb": [_entry(a, "https://fixtures.test/bb/exp", 60, NOW)],
        "https://fixtures.test/ft": [_entry(b, "https://fixtures.test/ft/reg", 200, NOW)],
    }
    items = _run_feed(monkeypatch, registry, payloads)
    assert {i.title for i in items} == {a, b}
    vocab = _build_salient_vocab(items)
    assert "chinas" in vocab and "china" not in vocab, vocab
    clusters = cluster_items(items)
    _assert_all_singletons(clusters, items)


# ═══════════════════════════════════════════════════════════════════════════════
# 5. Positive controls — Path 3 must still deliver its legitimate merges
# ═══════════════════════════════════════════════════════════════════════════════

def test_positive_two_anchor_paraphrase_merges_and_corroborates(monkeypatch):
    """Independent publishers, one specific event (a Houthi missile strike on a
    Saudi oil facility), paraphrased headlines 4h apart. Jaccard is below the
    Path 2 bar and the only extracted entity is a blocked sector label, so
    ONLY the corrected Path 3 can (and must) merge these — via two shared
    anchors. Corroboration then counts two distinct qualified publishers."""
    registry = [
        ("BBC World",         "https://fixtures.test/bbc", "Geopolitical"),
        ("Bloomberg Markets", "https://fixtures.test/bb",  "Markets"),
    ]
    a = "Houthis claim missile attack on Saudi oil facility"
    b = "Saudi oil facility ablaze after Houthis fire missiles, officials say"
    payloads = {
        "https://fixtures.test/bbc": [_entry(a, "https://fixtures.test/bbc/houthi", 60, NOW)],
        "https://fixtures.test/bb":  [_entry(b, "https://fixtures.test/bb/blaze", 300, NOW)],
    }
    items = _run_feed(monkeypatch, registry, payloads)
    assert {i.title for i in items} == {a, b}
    assert {i.category for i in items} == {"Geopolitical"}
    _assert_no_other_path_could_merge(items)

    clusters = cluster_items(items)
    assert len(clusters) == 1 and clusters[0].story_count == 2

    events = build_market_events(clusters, [], now=NOW)
    assert len(events) == 1
    ev = events[0]
    assert {e.title for e in ev.evidence} == {a, b}
    assert ev.source_count == 2
    assert ev.corroboration_count == 2      # both tier ≤ 2 → qualified
    assert ev.developing is False


def test_positive_single_anchor_with_event_support_merges(monkeypatch):
    """Same-country legitimate corroboration: one real-world action (a China
    reserve-ratio cut) reported twice with low headline overlap. One shared
    anchor ('china') plus shared event content ('reserve', 'ratio', 'lending')
    satisfies the affirmative-support requirement."""
    registry = [
        ("Bloomberg Markets", "https://fixtures.test/bb", "Markets"),
        ("Financial Times",   "https://fixtures.test/ft", "Markets"),
    ]
    a = "China cuts banks' reserve ratio to spur lending"
    b = "China frees up bank lending with surprise reserve ratio cut"
    payloads = {
        "https://fixtures.test/bb": [_entry(a, "https://fixtures.test/bb/rrr", 60, NOW)],
        "https://fixtures.test/ft": [_entry(b, "https://fixtures.test/ft/rrr", 300, NOW)],
    }
    items = _run_feed(monkeypatch, registry, payloads)
    assert {i.title for i in items} == {a, b}
    assert {i.category for i in items} == {"Geopolitical"}   # 'china' reclass
    _assert_no_other_path_could_merge(items)

    clusters = cluster_items(items)
    assert len(clusters) == 1 and clusters[0].story_count == 2


def test_positive_same_event_with_added_detail_merges(monkeypatch):
    """Same event, one telling carrying extra detail (price tag, saga length):
    two shared anchors ('nippon', 'steel') carry the merge."""
    registry = [
        ("Financial Times",   "https://fixtures.test/ft", "M&A"),
        ("Bloomberg Markets", "https://fixtures.test/bb", "M&A"),
    ]
    a = "Nippon Steel completes US Steel acquisition after national security review"
    b = "Nippon Steel wraps up $14.9 billion US Steel takeover, ending two-year saga"
    payloads = {
        "https://fixtures.test/ft": [_entry(a, "https://fixtures.test/ft/nippon", 60, NOW)],
        "https://fixtures.test/bb": [_entry(b, "https://fixtures.test/bb/nippon", 300, NOW)],
    }
    items = _run_feed(monkeypatch, registry, payloads)
    assert {i.title for i in items} == {a, b}
    assert len({i.category for i in items}) == 1
    clusters = cluster_items(items)
    assert len(clusters) == 1 and clusters[0].story_count == 2


def test_positive_distinct_publisher_counting_is_unchanged(monkeypatch):
    """Two Bloomberg tellings plus one BBC telling of one event: evidence
    carries all three articles, but distinct-publisher counting (existing
    source-identity rules) reports 2 sources / 2 qualified — same-publisher
    repetition still never inflates corroboration."""
    registry = [
        ("Bloomberg Markets", "https://fixtures.test/bb",  "Geopolitical"),
        ("BBC World",         "https://fixtures.test/bbc", "Geopolitical"),
    ]
    a = "Houthis claim missile attack on Saudi oil facility"
    b = "Saudi oil site burns after Houthis missile strike, witnesses say"
    c = "Riyadh says oil infrastructure hit in Houthis missile barrage"
    payloads = {
        "https://fixtures.test/bb": [
            _entry(a, "https://fixtures.test/bb/one", 60, NOW),
            _entry(b, "https://fixtures.test/bb/two", 120, NOW),
        ],
        "https://fixtures.test/bbc": [_entry(c, "https://fixtures.test/bbc/three", 180, NOW)],
    }
    items = _run_feed(monkeypatch, registry, payloads)
    clusters = cluster_items(items)
    events = build_market_events(clusters, [], now=NOW)
    assert len(events) == 1
    ev = events[0]
    assert len(ev.evidence) == 3
    assert ev.source_count == 2             # Bloomberg counted once
    assert ev.corroboration_count == 2


# ═══════════════════════════════════════════════════════════════════════════════
# 6. Order and bridging
# ═══════════════════════════════════════════════════════════════════════════════

def test_no_bridging_and_order_stability(monkeypatch):
    """A same-event pair (A,B) plus an unrelated same-anchor story (C): C must
    stay out of the pair's cluster regardless of input order, and no
    intermediate article may bridge it in (greedy assignment compares only to
    each bucket's primary; this pins that no-transitive-bridge behavior)."""
    registry = [
        ("CNBC Economy",      "https://fixtures.test/cnbc", "Markets"),
        ("Financial Times",   "https://fixtures.test/ft",   "Markets"),
        ("Bloomberg Markets", "https://fixtures.test/bb",   "Markets"),
    ]
    a = CH_AI                                              # [CAPTURED-PROD]
    b = "China rebukes US over 'malicious competition' remarks on AI"   # [SYNTHETIC] same statement
    c = SOY                                                # [CAPTURED-PROD] unrelated
    payloads = {
        "https://fixtures.test/cnbc": [_entry(a, "https://fixtures.test/cnbc/a", 60, NOW)],
        "https://fixtures.test/ft":   [_entry(b, "https://fixtures.test/ft/b", 120, NOW)],
        "https://fixtures.test/bb":   [_entry(c, "https://fixtures.test/bb/c", 180, NOW)],
    }
    items = _run_feed(monkeypatch, registry, payloads)
    assert {i.title for i in items} == {a, b, c}
    by_title = {i.title: i for i in items}

    for order in ([a, b, c], [c, a, b], [b, c, a]):
        clusters = cluster_items([by_title[t] for t in order])
        m = _membership(clusters)
        assert m[a] == m[b] == frozenset({a, b}), (order, m)
        assert m[c] == frozenset({c}), (order, m)
