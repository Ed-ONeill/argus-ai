"""Persistent identity isolation; no clustering or historical-record repair.

The retained Microsoft/outage/loan/debt titles and URLs reproduce the observed
failure. Journal rows below are reduced synthetic fixtures of that history,
not a copy of the production journal.
"""

from copy import deepcopy
from datetime import datetime, timedelta, timezone
import json

import pytest

import app.event_identity as identity
from app.config import settings
from app.event_identity import IdentityAuthority, _candidate_from_event, _words
from app.events import EventEvidence, MarketEvent
from app.observation_ledger import LedgerStream


NOW = datetime(2026, 11, 18, 18, 43, tzinfo=timezone.utc)
OLD_UID = "ev_01M7QD231FSB7K0F88CZR7R2NE"
OUTAGE = (
    "US tech outages blamed on rush to fix bugs found by AI",
    "https://www.ft.com/content/96c565f1-f229-40b6-91e8-7a849ec4b208?syn-25a6b1a6=1",
    ["MSFT", "JPM"], "FT Companies",
)
MICROSOFT = (
    "Microsoft Nears $500 Million Deal to Sell AI to ByteDance, Irking OpenAI",
    "https://www.theinformation.com/articles/microsoft-nears-500-million-deal-sell-ai-bytedance-irking-openai",
    ["MSFT"], "The Information",
)
DEBT = (
    "JPMorgan seeks to revive stalled software debt sale with steep price cuts",
    "https://www.ft.com/content/16a99ff4-6060-4c81-8c4f-7e43503e4a11?syn-25a6b1a6=1",
    ["JPM"], "FT Companies",
)
LOAN = (
    "U.S. Banks Seek Loan Protections Against Chip Smuggling with Southeast Asian Data Center Operator",
    "https://www.theinformation.com/briefings/u-s-banks-seek-loan-protections-chip-smuggling-southeast-asian-data-center-operator",
    ["JPM", "C"], "The Information",
)


def event(key, record):
    title, url, companies, source = record
    return MarketEvent(
        id=key, title=title, event_type="market_event",
        first_seen=(NOW - timedelta(hours=1)).isoformat(),
        last_updated=NOW.isoformat(), source_count=1, corroboration_count=1,
        companies=list(companies), companies_direct=list(companies),
        evidence=[EventEvidence(source=source, title=title, url=url,
                                published=NOW.isoformat(), tier=1, qualified=True)],
    )


@pytest.fixture
def authority(tmp_path, monkeypatch):
    auth = IdentityAuthority(LedgerStream("identity", tmp_path / "ledger"),
                             tmp_path / "registry.json")
    monkeypatch.setattr(identity, "_authority", auth)
    for flag in ("event_identity", "registry_decay", "registry_folding"):
        monkeypatch.setattr(settings, flag, True)
    return auth


def seed_contaminated_history(auth):
    origin = event("outage", OUTAGE)
    auth._journal_apply("mint", {
        "uid": OLD_UID, "event_type": origin.event_type,
        "origin_fingerprint": {"title_words": sorted(_words(origin.title)),
                               "anchor_entities": origin.companies_direct},
        "member_urls": [OUTAGE[1]],
        "first_seen": (NOW - timedelta(hours=6)).isoformat(),
    }, ts=NOW - timedelta(hours=5), cycle_id="legacy-mint")
    for index, record in enumerate((MICROSOFT, LOAN, DEBT)):
        auth._journal_apply("attach", {
            "uid": OLD_UID, "member_urls_added": [record[1]],
            "latest_fingerprint": sorted(_words(record[0])), "match_rule": "url",
        }, ts=NOW - timedelta(hours=3-index), cycle_id=f"legacy-{index}")


@pytest.mark.parametrize("record", [MICROSOFT, LOAN, DEBT], ids=["microsoft", "loan", "debt"])
def test_accumulated_url_or_latest_fingerprint_does_not_prove_identity(authority, record):
    seed_contaminated_history(authority)
    assert authority._match(_candidate_from_event(event("current", record)), NOW) is None


def test_current_events_stay_separate_and_old_history_is_unchanged(authority):
    seed_contaminated_history(authority)
    old_entry = deepcopy(authority.entries[OLD_UID].to_dict())
    old_rows = list(authority._journal.read_rows())
    current = [event("microsoft", MICROSOFT), event("loan", LOAN), event("debt", DEBT)]
    before = {ev.id: deepcopy(ev) for ev in current}
    out = identity.resolve_and_fold(current, now=NOW, cycle_id="corrected")
    assert len(out) == 3
    assert len({ev.uid for ev in out}) == 3
    assert OLD_UID not in {ev.uid for ev in out}
    for ev in out:
        assert ev.evidence == before[ev.id].evidence
        assert ev.companies_direct == before[ev.id].companies_direct
        assert ev.first_seen == before[ev.id].first_seen
        assert (ev.source_count, ev.corroboration_count) == (1, 1)
        assert ev.merged_event_ids == []
    assert authority.entries[OLD_UID].to_dict() == old_entry
    assert list(authority._journal.read_rows())[:len(old_rows)] == old_rows
    explanations = {ev.id: {"event_id": ev.id} for ev in out}
    assert identity.dual_key_explanations(explanations, out) == 3
    for ev in out:
        assert explanations[ev.uid] is explanations[ev.id]
    again = identity.resolve_and_fold(
        [event(ev.id, record) for ev, record in zip(current, (MICROSOFT, LOAN, DEBT))],
        now=NOW + timedelta(minutes=5), cycle_id="next")
    assert {ev.id: ev.uid for ev in again} == {ev.id: ev.uid for ev in out}


@pytest.mark.parametrize("snapshot", [False, True], ids=["journal-replay", "snapshot"])
def test_corrected_identity_survives_restart_with_overlapping_historical_urls(authority, snapshot):
    seed_contaminated_history(authority)
    ev = event("microsoft", MICROSOFT)
    uid = authority.process_cycle([ev], now=NOW, cycle_id="new")[ev.id]
    if not snapshot:
        authority._snapshot_path.unlink()
    restarted = IdentityAuthority(authority._journal, authority._snapshot_path)
    assert restarted._match(_candidate_from_event(ev), NOW)[0] == uid
    assert uid != OLD_UID
    assert restarted.entries[OLD_UID].member_urls == authority.entries[OLD_UID].member_urls


def test_partial_cycle_cannot_attach_contaminated_identity_or_write(authority):
    seed_contaminated_history(authority)
    rows = list(authority._journal.read_rows())
    assert authority.process_cycle([event("microsoft", MICROSOFT)], now=NOW,
                                   cycle_id="partial", full_feed=False) == {}
    assert list(authority._journal.read_rows()) == rows


def test_original_article_retains_identity_after_headline_rewrite(authority):
    seed_contaminated_history(authority)
    rewritten = event("outage-update", (
        "Emergency software patching disrupts major American businesses",
        OUTAGE[1], ["MSFT", "JPM"], "FT Companies"))
    assert authority.process_cycle([rewritten], now=NOW, cycle_id="update")[rewritten.id] == OLD_UID


def test_entity_overlap_does_not_allow_latest_headline_drift(authority):
    words = [f"w{i:02d}" for i in range(16)]
    uids = []
    for index, start in enumerate((0, 2, 4, 6)):
        ev = event(str(index), (" ".join(words[start:start+10]),
                                f"https://example.test/{index}", ["MSFT"], "Reuters"))
        uids.append(authority.process_cycle([ev], now=NOW + timedelta(hours=index),
                                           cycle_id=str(index))[ev.id])
    assert uids[0] == uids[1] == uids[2]
    assert uids[3] != uids[0]


def test_new_reporting_can_retain_identity_when_that_article_is_later_rewritten(authority):
    first = event("first", MICROSOFT)
    uid = authority.process_cycle([first], now=NOW, cycle_id="first")[first.id]
    report = event("report", (MICROSOFT[0], "https://example.test/report", ["MSFT"], "Reuters"))
    assert authority.process_cycle([report], now=NOW, cycle_id="report")[report.id] == uid
    report.title = "Azure negotiations create tensions with model developer"
    report.evidence[0].title = report.title
    assert authority.process_cycle([report], now=NOW, cycle_id="rewrite")[report.id] == uid


def test_url_continuity_cannot_transitively_authorize_unrelated_new_urls(authority):
    seed_contaminated_history(authority)
    bridge = event("bridge", ("Emergency software patching disrupts major American businesses",
                              OUTAGE[1], ["MSFT"], "FT Companies"))
    bridge.evidence.extend(event("debt", DEBT).evidence)
    authority.process_cycle([bridge], now=NOW, cycle_id="bridge")
    assert authority._match(_candidate_from_event(event("debt", DEBT)), NOW) is None


def test_latest_fingerprint_cannot_rescue_contaminated_identity_through_a_new_url(authority):
    seed_contaminated_history(authority)
    report = event("debt-new-url", (DEBT[0], "https://example.test/debt", DEBT[2], "Reuters"))
    assert authority._match(_candidate_from_event(report), NOW) is None


def test_v1_snapshot_replays_mint_provenance_without_rewriting_history(authority):
    seed_contaminated_history(authority)
    authority.snapshot()
    data = json.loads(authority._snapshot_path.read_text(encoding="utf-8"))
    data["v"] = 1
    for entry in data["entries"]:
        entry.pop("anchor_urls", None)
    authority._snapshot_path.write_text(json.dumps(data), encoding="utf-8")
    rows = list(authority._journal.read_rows())
    restarted = IdentityAuthority(authority._journal, authority._snapshot_path)
    assert restarted.entries[OLD_UID].anchor_urls == {OUTAGE[1]}
    assert restarted.entries[OLD_UID].member_urls == {r[1] for r in (OUTAGE, MICROSOFT, LOAN, DEBT)}
    assert restarted._match(_candidate_from_event(event("debt", DEBT)), NOW) is None
    assert list(authority._journal.read_rows()) == rows
    assert json.loads(authority._snapshot_path.read_text(encoding="utf-8"))["v"] == 1


@pytest.mark.parametrize("snapshot", [False, True])
def test_origin_supported_new_article_continuity_replays(authority, snapshot):
    first = event("first", MICROSOFT)
    uid = authority.process_cycle([first], now=NOW, cycle_id="first")[first.id]
    report = event("report", (MICROSOFT[0], "https://example.test/report", ["MSFT"], "Reuters"))
    authority.process_cycle([report], now=NOW, cycle_id="report")
    if not snapshot:
        authority._snapshot_path.unlink()
    restarted = IdentityAuthority(authority._journal, authority._snapshot_path)
    report.title = "Azure negotiations create tensions with model developer"
    report.evidence[0].title = report.title
    assert restarted._match(_candidate_from_event(report), NOW)[0] == uid


def test_origin_supported_event_does_not_bless_unrelated_secondary_article(authority):
    first = event("first", OUTAGE)
    uid = authority.process_cycle([first], now=NOW, cycle_id="first")[first.id]
    bridge = event("bridge", OUTAGE)
    bridge.evidence.extend(event("debt", DEBT).evidence)
    authority.process_cycle([bridge], now=NOW, cycle_id="bridge")
    assert DEBT[1] in authority.entries[uid].member_urls
    assert DEBT[1] not in authority.entries[uid].anchor_urls
    assert authority._match(_candidate_from_event(event("debt", DEBT)), NOW) is None


@pytest.mark.parametrize("status", ["supersede", "retract"])
def test_inactive_identity_is_not_reactivated_by_old_url(authority, status):
    seed_contaminated_history(authority)
    authority._journal_apply(status, {"uid": OLD_UID}, ts=NOW, cycle_id="inactive")
    assert authority._match(_candidate_from_event(event("outage", OUTAGE)), NOW) is None


def test_failed_mint_does_not_expose_old_uid_or_fold_distinct_events(authority, monkeypatch):
    seed_contaminated_history(authority)
    old = deepcopy(authority.entries[OLD_UID].to_dict())
    monkeypatch.setattr(authority._journal, "append", lambda *args, **kwargs: None)
    out = identity.resolve_and_fold([event("microsoft", MICROSOFT), event("debt", DEBT)],
                                    now=NOW, cycle_id="failed-write")
    assert len(out) == 2
    assert all(ev.uid == "" for ev in out)
    assert authority.entries[OLD_UID].to_dict() == old


def test_ambiguous_anchor_ownership_uses_origin_not_entry_order(authority):
    seed_contaminated_history(authority)
    # Model an explicit historical alias that makes a second identity claim
    # the same anchor. This is not a production repair operation.
    debt = event("debt", DEBT)
    debt_uid = authority.process_cycle([debt], now=NOW, cycle_id="debt")[debt.id]
    for alias_uid in ("ev_alias1", "ev_alias2"):
        authority._journal_apply("mint", {
            "uid": alias_uid, "event_type": "market_event",
            "origin_fingerprint": {"title_words": sorted(_words(DEBT[0]))},
            "member_urls": [DEBT[1]],
        }, ts=NOW, cycle_id="historical-alias")
        target = OLD_UID if alias_uid == "ev_alias1" else debt_uid
        authority.record_fold_alias(alias_uid, target, now=NOW, cycle_id="historical-alias")
    assert DEBT[1] in authority.entries[OLD_UID].anchor_urls
    assert authority._match(_candidate_from_event(debt), NOW)[0] == debt_uid
    authority.entries = dict(reversed(list(authority.entries.items())))
    assert authority._match(_candidate_from_event(debt), NOW)[0] == debt_uid
    authority.snapshot()
    restarted = IdentityAuthority(authority._journal, authority._snapshot_path)
    assert restarted._match(_candidate_from_event(debt), NOW)[0] == debt_uid


def test_article_continuity_survives_event_type_reclassification(authority):
    first = event("first", MICROSOFT)
    uid = authority.process_cycle([first], now=NOW, cycle_id="first")[first.id]
    update = event("update", MICROSOFT)
    update.event_type = "ma"
    assert authority.process_cycle([update], now=NOW, cycle_id="update")[update.id] == uid


def test_failed_attach_cannot_grant_url_continuity(authority, monkeypatch):
    first = event("first", MICROSOFT)
    uid = authority.process_cycle([first], now=NOW, cycle_id="first")[first.id]
    before = deepcopy(authority.entries[uid].to_dict())
    report = event("report", (MICROSOFT[0], "https://example.test/report", ["MSFT"], "Reuters"))
    monkeypatch.setattr(authority._journal, "append", lambda *args, **kwargs: None)
    assert authority.process_cycle([report], now=NOW, cycle_id="failed-attach")[report.id] == uid
    assert authority.entries[uid].to_dict() == before
    report.title = "Azure negotiations create tensions with model developer"
    report.evidence[0].title = report.title
    assert authority._match(_candidate_from_event(report), NOW) is None


def test_missing_secondary_article_titles_do_not_inherit_event_headline(authority):
    first = event("first", OUTAGE)
    uid = authority.process_cycle([first], now=NOW, cycle_id="first")[first.id]
    bridge = event("bridge", OUTAGE)
    secondary = event("debt", DEBT).evidence[0]
    secondary.title = ""
    bridge.evidence.append(secondary)
    authority.process_cycle([bridge], now=NOW, cycle_id="missing-title")
    assert DEBT[1] not in authority.entries[uid].anchor_urls
