"""
tests/test_events.py — F1 Event-Centric Editorial Engine acceptance tests.

The doctrine under test: Argus ranks market EVENTS, not articles. One cluster
becomes exactly one event; articles are evidence; corroboration counts distinct
qualified sources; decay runs from the event's first observation, never the
latest re-report; keywords route to classes and never add points.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest

from app.clustering import StoryCluster
from app.companies import COMPANY_REGISTRY, resolve_companies
from app.events import (
    MarketEvent,
    build_market_events,
    classify_event,
    editorial_score,
    evidence_kind,
    reporting_period,
)
from app.feeds import FeedItem
from app.theme_graph import ThemeIntelligence

NOW = datetime(2026, 7, 16, 14, 0, tzinfo=timezone.utc)


def _item(title: str, source: str, hours_ago: float, url: str | None = None,
          snippet: str = "", entities: list[str] | None = None) -> FeedItem:
    return FeedItem(
        title=title,
        url=url or f"https://example.com/{abs(hash((title, source)))}",
        source=source,
        category="Markets",
        published_dt=NOW - timedelta(hours=hours_ago),
        snippet=snippet,
        affected_entities=entities or [],
    )


def _cluster(cid: str, primary: FeedItem, related: list[FeedItem] | None = None) -> StoryCluster:
    related = related or []
    return StoryCluster(
        id=cid, primary=primary, related=related,
        cluster_score=0.5, theme_label="Test",
        story_count=1 + len(related),
    )


def _theme(tid: str, confidence: int, cluster_ids: list[str],
           assets: list[str] | None = None) -> ThemeIntelligence:
    return ThemeIntelligence(
        id=tid, name=tid.replace("_", " ").title(), description="",
        signal_strength="strong", confidence=confidence,
        momentum_direction="bullish",
        related_assets=assets or [],
        related_industries=["Semiconductors"],
        contributing_cluster_ids=cluster_ids,
        causal_narrative="Rates → Duration → Growth equities",
    )


# ── Identity: one cluster, one event, same id ─────────────────────────────────

def test_one_event_per_cluster_and_id_identity():
    c1 = _cluster("aaa111bbb222", _item("Fed holds rates steady", "Reuters", 1))
    c2 = _cluster("ccc333ddd444", _item("Acme Corp beats estimates", "Bloomberg Markets", 2))
    events = build_market_events([c1, c2], [], now=NOW)
    assert len(events) == 2
    assert {e.id for e in events} == {"aaa111bbb222", "ccc333ddd444"}


def test_event_id_is_archive_evidence_ref():
    """theme.contributing_cluster_ids must join directly onto event ids —
    the identity that makes M3 evidence refs event refs with no migration."""
    c = _cluster("feedbeef1234", _item("Fed signals rate cut path", "Reuters", 1))
    theme = _theme("rates_regime", 80, ["feedbeef1234"])
    (event,) = build_market_events([c], [theme], now=NOW)
    assert event.id in theme.contributing_cluster_ids
    assert event.theme_ids == ["rates_regime"]


# ── Evidence & corroboration ──────────────────────────────────────────────────

def test_corroboration_counts_distinct_qualified_sources():
    """Reuters + Bloomberg + SEC Filings = 3 qualified confirmations."""
    primary = _item("IBM reports quarterly results, beats estimates", "Reuters", 3)
    related = [
        _item("IBM earnings top expectations", "Bloomberg Markets", 2.5),
        _item("IBM 8-K: quarterly results", "SEC Filings", 2.8),
    ]
    (event,) = build_market_events([_cluster("ibm000000001", primary, related)], [], now=NOW)
    assert event.corroboration_count == 3
    assert event.source_count == 3
    assert len(event.evidence) == 3
    assert {e.source for e in event.evidence} == {"Reuters", "Bloomberg Markets", "SEC Filings"}


def test_same_source_rereport_does_not_raise_score():
    """A wire re-running its own story is not corroboration — and must not
    freshen the event either (decay anchors to first-seen)."""
    base = _cluster("dup000000001",
                    _item("Acme announces guidance", "Reuters", 6, url="https://r/1"))
    rerun = _cluster("dup000000002",
                     _item("Acme announces guidance", "Reuters", 6, url="https://r/1"),
                     [_item("Acme announces guidance — update", "Reuters", 0.1, url="https://r/2")])
    (e_base,) = build_market_events([base], [], now=NOW)
    (e_rerun,) = build_market_events([rerun], [], now=NOW)
    assert e_rerun.corroboration_count == e_base.corroboration_count == 1
    assert e_rerun.first_seen == e_base.first_seen          # re-report didn't reset the clock
    assert e_rerun.editorial_score <= e_base.editorial_score + 0.1


def test_corroborated_macro_outranks_fresh_single_source_echo():
    """The E1 fix: a 4-hour-old corroborated macro shock still leads over a
    minutes-old single-source price-move echo — and an unqualified aggregator
    echo does not enter the feed at all (F2 admission)."""
    macro = _cluster("macro0000001",
                     _item("CPI comes in far above expectations", "Reuters", 4),
                     [_item("Inflation data shocks markets", "Bloomberg Markets", 3.8),
                      _item("Hot CPI print jolts bond market", "Financial Times", 3.5)])
    echo = _cluster("echo00000001",
                    _item("Shares jump in premarket trading", "Reuters", 0.2))
    junk_echo = _cluster("junk00000001",
                         _item("Stocks making the biggest moves premarket", "Zonebourse", 0.1))
    events = build_market_events([macro, echo, junk_echo], [], now=NOW)
    assert [e.id for e in events] == ["macro0000001", "echo00000001"]   # junk never admitted
    assert events[0].editorial_score > events[1].editorial_score


def test_keyword_stuffing_adds_nothing():
    """Two single-source events of the same class and age score identically no
    matter how many hot keywords the headline stuffs (E4: route, never score)."""
    plain = _cluster("plain0000001",
                     _item("Acme Corp beats estimates in quarterly results", "Reuters", 2))
    stuffed = _cluster("stuff0000001",
                       _item("Acme Corp earnings guidance beats estimates EPS "
                             "quarterly results full-year outlook", "Reuters", 2))
    events = build_market_events([plain, stuffed], [], now=NOW)
    scores = {e.id: e.editorial_score for e in events}
    assert scores["plain0000001"] == scores["stuff0000001"]


# ── Decay from event first-seen ───────────────────────────────────────────────

def test_first_seen_is_earliest_member():
    c = _cluster("time00000001",
                 _item("Fed decision at 2pm", "Reuters", 1),
                 [_item("Fed decision — earlier wire", "Bloomberg Markets", 5)])
    (event,) = build_market_events([c], [], now=NOW)
    assert event.first_seen == (NOW - timedelta(hours=5)).isoformat()
    assert event.last_updated == (NOW - timedelta(hours=1)).isoformat()


def test_price_echo_dies_faster_than_macro():
    """Same source: at 1h the echo already trails the macro event badly; by 6h
    the echo's 3h half-life has dropped it below the admission floor entirely,
    while the macro event's 18h half-life keeps it in the feed."""
    fresh = build_market_events(
        [_cluster("hl0000000001", _item("Fed rate decision surprises", "Reuters", 1)),
         _cluster("hl0000000002", _item("Shares surge after news", "Reuters", 1))],
        [], now=NOW)
    by_id = {e.id: e for e in fresh}
    assert by_id["hl0000000001"].editorial_score > by_id["hl0000000002"].editorial_score * 2

    aged = build_market_events(
        [_cluster("hl0000000001", _item("Fed rate decision surprises", "Reuters", 6)),
         _cluster("hl0000000002", _item("Shares surge after news", "Reuters", 6))],
        [], now=NOW)
    assert [e.id for e in aged] == ["hl0000000001"]   # the echo died by lunch


# ── Classification (routers, not scorers) ─────────────────────────────────────

def test_classification_routes():
    assert classify_event("Fed holds rates, signals two cuts") == "macro"
    assert classify_event("US imposes new tariffs on chip imports") == "policy"
    assert classify_event("MegaCorp agrees to buy SmallCo for $9bn") == "ma"
    assert classify_event("Acme beats estimates, raises guidance") == "earnings"
    assert classify_event("Shares jump 8% in premarket trading") == "price_echo"
    assert classify_event("Quiet session as traders await data") == "market_event"


# ── Theme linkage, relevance, dominance ───────────────────────────────────────

def test_theme_linked_event_carries_confidence_and_transmission():
    c = _cluster("theme0000001", _item("Datacenter power demand accelerates", "Reuters", 1))
    theme = _theme("power_infra", 78, ["theme0000001"], assets=["VRT", "ETN"])
    (event,) = build_market_events([c], [theme], now=NOW)
    assert event.confidence == 78
    assert event.transmission == "Rates → Duration → Growth equities"
    assert event.dominant is True          # top (only) theme
    assert "VRT" in event.companies and "ETN" in event.companies
    assert "Semiconductors" in event.industries


def test_dominant_flag_only_for_top_theme():
    c1 = _cluster("dom000000001", _item("Story A", "Reuters", 1))
    c2 = _cluster("dom000000002", _item("Story B", "Reuters", 1))
    strong = _theme("strong_theme", 90, ["dom000000001"])
    weak = _theme("weak_theme", 40, ["dom000000002"])
    events = build_market_events([c1, c2], [strong, weak], now=NOW)
    by_id = {e.id: e for e in events}
    assert by_id["dom000000001"].dominant is True
    assert by_id["dom000000002"].dominant is False


def test_unthemed_macro_still_surfaces_over_themed_echo():
    """Relevance floors at 0.6 for macro class: a genuine off-thesis shock must
    outrank an on-thesis price echo."""
    shock = _cluster("shock0000001", _item("Central bank surprise rate hike", "Reuters", 0.5))
    themed_echo = _cluster("techo0000001", _item("Shares climb after upgrade", "Reuters", 0.5))
    theme = _theme("some_theme", 70, ["techo0000001"])
    events = build_market_events([shock, themed_echo], [theme], now=NOW)
    assert events[0].id == "shock0000001"


def test_developing_flag_for_single_source():
    single = _cluster("dev000000001", _item("Exclusive: MegaCorp weighs takeover", "Reuters", 1))
    (event,) = build_market_events([single], [], now=NOW)
    assert event.developing is True
    corr = _cluster("dev000000002", _item("MegaCorp weighs takeover", "Reuters", 1),
                    [_item("MegaCorp considering bid", "Bloomberg Markets", 0.8)])
    (event2,) = build_market_events([corr], [], now=NOW)
    assert event2.developing is False


# ── Determinism ───────────────────────────────────────────────────────────────

def test_deterministic_for_fixed_inputs():
    clusters = [
        _cluster("det000000001", _item("Fed rate decision", "Reuters", 2)),
        _cluster("det000000002", _item("Acme beats estimates", "Bloomberg Markets", 1)),
    ]
    themes = [_theme("t1", 66, ["det000000002"])]
    a = build_market_events(clusters, themes, now=NOW)
    b = build_market_events(clusters, themes, now=NOW)
    assert [e.to_dict() for e in a] == [e.to_dict() for e in b]


def test_editorial_score_bounded():
    ev = MarketEvent(
        id="x", title="t", event_type="macro",
        first_seen=NOW.isoformat(), last_updated=NOW.isoformat(),
        corroboration_count=5, source_count=5,
        theme_ids=["t"], confidence=100,
    )
    ev.evidence = []
    assert 0 <= editorial_score(ev, NOW) <= 100


# ── Company-agnostic earnings acceptance (F1 validation amendment) ────────────
# IBM was only ever an example: the same recognition must hold for every
# covered public company, referenced by name or by ticker, with ambiguous
# ticker-words never mistaken for companies.

EARNINGS_COMPANIES = [
    ("AAPL", "Apple reports fiscal third-quarter results, revenue tops estimates"),
    ("MSFT", "Microsoft quarterly results beat expectations on cloud growth"),
    ("NVDA", "Nvidia posts record quarterly revenue, raises guidance"),
    ("JPM", "JPMorgan second-quarter results: trading revenue climbs"),
    ("XOM", "Exxon Mobil reports quarterly results as crude prices slip"),
    ("CAT", "Caterpillar earnings release: full-year results top forecasts"),
    ("ON", "ON Semiconductor issues trading update, cuts guidance"),
]


@pytest.mark.parametrize("ticker,headline", EARNINGS_COMPANIES,
                         ids=[t for t, _ in EARNINGS_COMPANIES])
def test_earnings_acceptance_generic(ticker: str, headline: str):
    """Any covered company's earnings: one event, typed earnings, canonical
    ticker attached, wire + coverage + filing counted as corroboration."""
    name = COMPANY_REGISTRY[ticker].name
    cluster = _cluster(f"gen{abs(hash(ticker)) % 10**9:09d}",
                       _item(headline, "Reuters", 1),
                       [_item(f"{name} results top expectations", "Bloomberg Markets", 0.9),
                        _item(f"{name} 10-Q: quarterly report", "SEC Filings", 1.1)])
    events = build_market_events([cluster], [], now=NOW)
    assert len(events) == 1
    event = events[0]
    assert event.event_type == "earnings"
    assert ticker in event.companies
    assert event.corroboration_count == 3
    assert len(event.evidence) == 3


def test_company_referenced_only_by_name():
    (event,) = build_market_events(
        [_cluster("nameonly0001",
                  _item("Broadcom quarterly results top estimates", "Reuters", 1))],
        [], now=NOW)
    assert event.companies == ["AVGO"]
    assert event.event_type == "earnings"


def test_company_referenced_only_by_ticker():
    (event,) = build_market_events(
        [_cluster("tickonly0001",
                  _item("NVDA reports Q2 earnings, data center revenue surges",
                        "Reuters", 1))],
        [], now=NOW)
    assert event.companies == ["NVDA"]
    assert event.event_type == "earnings"


def test_multi_company_roundup_not_collapsed():
    """A roundup names every company it covers — it must not be attributed to
    a single company, and it must not fold into a specific company's event."""
    roundup = _cluster("roundup00001",
                       _item("Apple, Microsoft and Nvidia headline a heavy week of earnings",
                             "Reuters", 2))
    apple_q3 = _cluster("appleq300001",
                        _item("Apple fiscal third-quarter results top estimates",
                              "Bloomberg Markets", 1))
    events = build_market_events([roundup, apple_q3], [], now=NOW)
    assert len(events) == 2                      # the roundup folded nowhere
    by_id = {e.id: e for e in events}
    assert set(by_id["roundup00001"].companies) >= {"AAPL", "MSFT", "NVDA"}
    assert by_id["appleq300001"].companies == ["AAPL"]


# ── Ambiguous ticker-words are not companies (false-positive guard) ───────────

@pytest.mark.parametrize("headline", [
    "CAT scan technology improves hospital diagnostics",
    "ALL eyes are on the central bank this week",
    "IT spending slows for a second year",
    "A quiet session in European markets",
    "FOR many investors, cash is king again",
    "AI startups raise record funding",
    "Turning ON the power grid of the future",
])
def test_ambiguous_words_do_not_become_companies(headline: str):
    (event,) = build_market_events(
        [_cluster("ambig0000001", _item(headline, "Reuters", 1))], [], now=NOW)
    assert event.companies == []


@pytest.mark.parametrize("text,expected", [
    ("$CAT beats estimates as construction demand holds", "CAT"),
    ("CAT shares rally after results", "CAT"),
    ("Allstate quarterly results improve on lower claims", "ALL"),
    ("Gartner reports results above forecasts", "IT"),
    ("Agilent revenue outlook disappoints", "A"),
    ("ON Semiconductor guidance cut", "ON"),
    ("Forestar quarterly results", "FOR"),
    ("C3.ai earnings show wider losses", "AI"),
])
def test_ambiguous_tickers_resolve_with_context(text: str, expected: str):
    assert expected in resolve_companies(text)


# ── Earnings-language coverage (beyond the literal word "earnings") ───────────

@pytest.mark.parametrize("headline", [
    "Acme quarterly results beat expectations",
    "Acme reports financial results for fiscal 2026",
    "Acme reports results ahead of schedule",
    "Acme revenue tops forecasts, guidance raised",
    "Acme issues trading update",
    "Acme fiscal first quarter revenue rises",
    "Acme full-year results disappoint",
    "Acme annual results show margin pressure",
    "Acme files 10-Q for the quarter",
    "Acme 10-K reveals new risk factors",
    "Acme earnings release scheduled for Thursday",
    "Acme earnings call: management defends outlook",
    "Acme investor presentation highlights cost discipline",
    "Acme fourth-quarter earnings top estimates",
])
def test_earnings_language_variants(headline: str):
    assert classify_event(headline) == "earnings"


# ── Evidence document kinds & the honesty boundary ────────────────────────────

def test_earnings_event_combines_document_kinds():
    """IR release + SEC filing + transcript + news coverage combine as evidence
    on one event — the only honest bases for management commentary."""
    cluster = _cluster(
        "kinds0000001",
        _item("Apple reports fiscal third-quarter results", "Reuters", 1),
        [_item("Apple Reports Third Quarter Results — press release", "PR Newswire", 1.2),
         _item("Apple 10-Q: quarterly report", "SEC Filings", 1.1),
         _item("Apple Q3 earnings call transcript", "Motley Fool", 0.5)])
    (event,) = build_market_events([cluster], [], now=NOW)
    assert {e.kind for e in event.evidence} == {"news", "ir_release", "sec_filing", "transcript"}
    assert event.companies == ["AAPL"]


def test_no_invented_commentary():
    """When upstream provides no why/transmission and no filing or transcript
    exists, the event says nothing rather than inventing management's words."""
    (event,) = build_market_events(
        [_cluster("honest000001",
                  _item("Acme quarterly results in line", "Reuters", 1))],
        [], now=NOW)
    assert event.why_it_matters == ""
    assert event.transmission is None
    assert all(e.kind == "news" for e in event.evidence)   # absence is derivable


# ── One company, one reporting period, once ───────────────────────────────────

def test_one_company_one_period_appears_once():
    a = _cluster("fold00000001",
                 _item("Apple fiscal third-quarter results top estimates", "Reuters", 2))
    b = _cluster("fold00000002",
                 _item("Apple Q3 earnings: iPhone revenue beats", "Bloomberg Markets", 1))
    events = build_market_events([a, b], [], now=NOW)
    assert len(events) == 1
    event = events[0]
    assert event.reporting_period == "Q3"
    assert event.companies == ["AAPL"]
    assert len(event.evidence) == 2                 # both documents attached
    assert event.corroboration_count == 2
    assert event.merged_event_ids != []             # linkage to the folded cluster survives
    assert event.first_seen == (NOW - timedelta(hours=2)).isoformat()


def test_different_periods_not_folded():
    a = _cluster("perd00000001",
                 _item("Apple Q2 earnings top estimates", "Reuters", 2))
    b = _cluster("perd00000002",
                 _item("Apple Q3 earnings guidance raised", "Bloomberg Markets", 1))
    events = build_market_events([a, b], [], now=NOW)
    assert len(events) == 2
    assert {e.reporting_period for e in events} == {"Q2", "Q3"}


def test_reporting_period_extraction():
    assert reporting_period("Acme fiscal third quarter results") == "Q3"
    assert reporting_period("Acme Q1 revenue rises") == "Q1"
    assert reporting_period("Acme full-year results") == "FY"
    assert reporting_period("Acme 10-K filed") == "FY"
    assert reporting_period("Acme wins new contract") is None


def test_evidence_kind_classification():
    assert evidence_kind("SEC Filings", "Acme 8-K") == "sec_filing"
    assert evidence_kind("Reuters", "Acme files 10-Q") == "sec_filing"
    assert evidence_kind("Motley Fool", "Acme earnings call transcript") == "transcript"
    assert evidence_kind("PR Newswire", "Acme announces results") == "ir_release"
    assert evidence_kind("Reuters", "Acme beats estimates") == "news"


# ── F2: admission floors & the quiet-day rule ─────────────────────────────────

def test_unqualified_only_events_never_admitted():
    """A cluster with zero qualified sources — aggregator restatements only —
    does not enter the feed at any rank."""
    events = build_market_events(
        [_cluster("noqual000001",
                  _item("Markets wrap: what moved today", "SomeAggregator", 0.5),
                  [_item("Today's market movers roundup", "AnotherBlog", 0.4)])],
        [], now=NOW)
    assert events == []


def test_quiet_day_yields_short_feed():
    """The floor does not flex with supply: junk does not rise to fill a quiet
    tape — one real event means a one-event feed."""
    real = _cluster("quietreal001",
                    _item("ECB holds rates, signals patience", "Reuters", 1))
    junk = [
        _cluster(f"quietjunk{i:03d}",
                 _item(f"Weekend read {i}: markets in review", "SomeAggregator", 1))
        for i in range(6)
    ]
    events = build_market_events([real, *junk], [], now=NOW)
    assert [e.id for e in events] == ["quietreal001"]


def test_stale_single_name_expires_below_floor():
    """An unthemed single-company catalyst fades out of the feed on its own
    clock instead of lingering at the bottom."""
    fresh = build_market_events(
        [_cluster("stale0000001", _item("Acme wins defense contract", "Reuters", 1))],
        [], now=NOW)
    assert len(fresh) == 1
    stale = build_market_events(
        [_cluster("stale0000001", _item("Acme wins defense contract", "Reuters", 14))],
        [], now=NOW)
    assert stale == []


# ── F2: the developing lane ───────────────────────────────────────────────────

def test_tier3_specific_scoop_qualifies_as_developing():
    """A tier-3 specialist scoop with named parties and hard figures enters
    the developing lane; the same source's vague take does not qualify."""
    scoop = _cluster("scoop0000001",
                     _item("Broadcom wins $10 billion custom chip order, "
                           "according to a term sheet", "SemiAnalysis", 1))
    (event,) = build_market_events([scoop], [], now=NOW)
    assert event.developing is True
    assert event.corroboration_count == 1
    assert event.evidence[0].qualified is True

    vague = _cluster("vague0000001",
                     _item("Why custom silicon is the next big thing",
                           "SemiAnalysis", 1))
    assert build_market_events([vague], [], now=NOW) == []


def test_developing_promotes_on_second_qualified_source():
    """The moment a second qualified source lands, the event leaves the
    developing lane — corroboration is spent, not just counted."""
    single = build_market_events(
        [_cluster("prom00000001",
                  _item("Exclusive: MegaCorp weighs $30 billion takeover", "Reuters", 1))],
        [], now=NOW)[0]
    confirmed = build_market_events(
        [_cluster("prom00000001",
                  _item("Exclusive: MegaCorp weighs $30 billion takeover", "Reuters", 1),
                  [_item("MegaCorp considering major acquisition", "Bloomberg Markets", 0.5)])],
        [], now=NOW)[0]
    assert single.developing is True
    assert confirmed.developing is False
    assert confirmed.editorial_score > single.editorial_score


def test_tier4_echo_does_not_promote_developing():
    """An aggregator repeating a scoop is not confirmation."""
    (event,) = build_market_events(
        [_cluster("noecho000001",
                  _item("Exclusive: MegaCorp weighs $30 billion takeover", "Reuters", 1),
                  [_item("Report: MegaCorp eyeing takeover", "SomeAggregator", 0.5)])],
        [], now=NOW)
    assert event.developing is True
    assert event.corroboration_count == 1
    assert event.source_count == 2


# ── F2: one event appears once (near-duplicate folding) ───────────────────────

def test_split_coverage_of_same_event_folds():
    """When the clusterer splits one real-world event across clusters, the
    events fold: one appearance, evidence united, corroboration earned."""
    a = _cluster("split0000001",
                 _item("Fed raises rates by 25 basis points", "Reuters", 2))
    b = _cluster("split0000002",
                 _item("Fed raises rates 25 basis points in unanimous vote",
                       "Bloomberg Markets", 1.5))
    events = build_market_events([a, b], [], now=NOW)
    assert len(events) == 1
    event = events[0]
    assert event.corroboration_count == 2
    assert event.developing is False
    assert len(event.evidence) == 2
    assert event.merged_event_ids != []


def test_distinct_macro_events_do_not_fold():
    a = _cluster("dist00000001",
                 _item("CPI rises 3.1 percent in June, above forecasts", "Reuters", 2))
    b = _cluster("dist00000002",
                 _item("Fed raises rates by 25 basis points", "Bloomberg Markets", 1))
    events = build_market_events([a, b], [], now=NOW)
    assert len(events) == 2


def test_same_company_different_stories_do_not_fold():
    """Same company, same class, different facts: two events."""
    a = _cluster("difs00000001",
                 _item("Apple unveils new AI features at developer event", "Reuters", 2))
    b = _cluster("difs00000002",
                 _item("Apple faces EU probe into App Store rules", "Bloomberg Markets", 1))
    events = build_market_events([a, b], [], now=NOW)
    assert len(events) == 2


# ── F2: class-weight ordering (the desk's priorities, pinned) ─────────────────

def test_class_weight_desk_ordering():
    from app.events import CLASS_WEIGHT
    assert (CLASS_WEIGHT["macro"] > CLASS_WEIGHT["policy"]
            > CLASS_WEIGHT["earnings"] > CLASS_WEIGHT["ma"]
            > CLASS_WEIGHT["market_event"] > CLASS_WEIGHT["single_name"]
            > CLASS_WEIGHT["price_echo"])


# ── The IBM acceptance scenario (F1 spec, Phase E) ────────────────────────────

def test_ibm_earnings_acceptance():
    """IBM reports earnings; Reuters, Bloomberg, and an SEC filing cover it.
    Argus shows ONE feed event with three evidence sources, typed earnings,
    carrying IBM — and its id is the ref Memory/Predictions already store."""
    primary = _item("IBM reports Q2 earnings, beats estimates", "Reuters", 1,
                    entities=["IBM"])
    related = [
        _item("IBM quarterly results top expectations", "Bloomberg Markets", 0.9),
        _item("IBM 8-K: quarterly results", "SEC Filings", 1.1),
    ]
    cluster = _cluster("ibmacceptanc", primary, related)
    theme = _theme("enterprise_ai", 72, ["ibmacceptanc"], assets=["IBM"])

    events = build_market_events([cluster], [theme], now=NOW)

    assert len(events) == 1                          # one event, exactly once
    event = events[0]
    assert event.id == cluster.id                    # the archive's evidence ref
    assert event.event_type == "earnings"
    assert event.corroboration_count == 3            # Reuters + Bloomberg + SEC
    assert len(event.evidence) == 3                  # articles demoted to evidence
    assert "IBM" in event.companies                  # routes to Company Intelligence
    assert event.theme_ids == ["enterprise_ai"]      # Network/Memory linkage
    assert event.confidence == 72
    assert event.editorial_score > 50                # fresh, corroborated, on-thesis
