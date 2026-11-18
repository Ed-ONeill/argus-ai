"""Official issuance metadata, rather than reusable landing URLs, identifies auctions."""
from datetime import datetime, timedelta, timezone

import pytest

import app.event_identity as identity
from app.clustering import cluster_items
from app.events import build_market_events
from app.feeds import FeedItem, _dedup_items
from app.observation_ledger import LedgerStream
from app.treasury_identity import occurrence_key, item_identity_text

NOW = datetime(2026, 11, 18, 20, tzinfo=timezone.utc)
URL = "https://www.treasurydirect.gov/auctions/auction-announcements/"


def announcement(title="Treasury announces 20-Year Bond", cusip="912810UZ9", auction="11/18/2026"):
    return FeedItem(title=title, url=URL, source="US Treasury", category="Markets",
                    published_dt=NOW - timedelta(minutes=20), signal_score=86,
                    snippet=f"CUSIP: {cusip}Term and Type: {title.removeprefix('Treasury announces ')}"
                            f"Reopening: NoOffering Amount: 16 BillionAuction Date: {auction}"
                            "Issue Date: 11/30/2026Maturity Date: 11/15/2046PDF | XML")


@pytest.mark.parametrize("change", ["instrument", "auction", "missing"])
def test_different_issuances_survive_clustering_event_folding_and_identity(tmp_path, monkeypatch, change):
    first = announcement()
    # The TIPS title is retained production shape; its CUSIP below is a synthetic control.
    second = announcement("Treasury announces 9-Year 8-Month TIPS", "91282TEST", "11/19/2026")
    if change == "auction":
        second = announcement(auction="12/18/2026")
    elif change == "missing":
        second.snippet = ""
    items = _dedup_items([first, second])
    assert len(items) == 2
    clusters = cluster_items(items)
    assert len(clusters) == 2
    events = build_market_events(clusters, [], now=NOW)
    assert len(events) == 2
    authority = identity.IdentityAuthority(LedgerStream("identity", tmp_path / "ledger"), tmp_path / "registry.json")
    monkeypatch.setattr(identity, "_authority", authority)
    out = identity.resolve_and_fold(events, now=NOW, cycle_id="first")
    assert len(out) == len({ev.uid for ev in out}) == 2
    assert all(len(ev.evidence) == ev.source_count == ev.corroboration_count == 1 for ev in out)
    assert all(ev.evidence[0].url == URL for ev in out)
    authority = identity.IdentityAuthority(authority._journal, authority._snapshot_path)
    again = authority.process_cycle(events, now=NOW + timedelta(minutes=5), cycle_id="second")
    assert again == {ev.id: ev.uid for ev in out}


def test_same_issuance_repeated_report_retains_continuity(tmp_path):
    authority = identity.IdentityAuthority(LedgerStream("identity", tmp_path / "ledger"), tmp_path / "registry.json")
    first = build_market_events(cluster_items([announcement()]), [], now=NOW)
    uid = authority.process_cycle(first, now=NOW, cycle_id="first")[first[0].id]
    revised = announcement(title="Treasury announces auction of new 20-Year Bond")
    revised.published_dt = NOW
    second = build_market_events(cluster_items([revised]), [], now=NOW)
    assert authority.process_cycle(second, now=NOW, cycle_id="second")[second[0].id] == uid


def test_packed_official_metadata_uses_security_and_auction_date():
    assert occurrence_key(announcement()) == "treasury:auction:912810UZ9:2026-11-18"
    assert occurrence_key(announcement(auction="12/18/2026")) != occurrence_key(announcement())
    assert occurrence_key(announcement(auction="02/30/2026")).startswith("treasury:unresolved:")


def test_other_publishers_and_normal_article_ids_are_unchanged():
    item = announcement()
    item.url = "https://treasurydirect.gov.example/auctions/auction-announcements/"
    assert occurrence_key(item) == ""
    assert item_identity_text(item) == item.title + item.url


def test_legacy_dedup_also_preserves_distinct_auctions(monkeypatch):
    from app.config import settings
    monkeypatch.setattr(settings, "merge_dedup", False)
    assert len(_dedup_items([announcement(), announcement(auction="12/18/2026")])) == 2


def test_api_ids_distinguish_reopenings_without_rewriting_source_urls():
    from api.routes.feed import FeedItemSchema, RelatedStorySchema
    first, later = announcement(), announcement(auction="12/18/2026")
    for schema in (FeedItemSchema, RelatedStorySchema):
        a, b = schema.from_item(first), schema.from_item(later)
        assert a.id != b.id
        assert a.url == b.url == URL


def test_legacy_shared_url_does_not_reinfect_new_occurrence(tmp_path):
    authority = identity.IdentityAuthority(LedgerStream("identity", tmp_path / "ledger"), tmp_path / "registry.json")
    old = build_market_events(cluster_items([announcement()]), [], now=NOW)
    old[0].occurrence_key = ""  # historical record before auction discrimination
    old_uid = authority.process_cycle(old, now=NOW, cycle_id="old")[old[0].id]
    current = build_market_events(cluster_items([announcement()]), [], now=NOW)
    new_uid = authority.process_cycle(current, now=NOW, cycle_id="new")[current[0].id]
    assert new_uid != old_uid
    assert old_uid in authority.entries  # no historical deletion or rewrite
    assert authority.process_cycle(current, now=NOW, cycle_id="again")[current[0].id] == new_uid
