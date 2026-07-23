"""
tests/test_event_continuity.py — Sprint 4: OP2.2 (uid propagation + dual
references), OP2.3 (registry-anchored decay, flagged), OP2.4 (same-uid
folding, flagged), OP3.1b (assessment stream), archive dual-refs [C8].

The review criterion: events keep their institutional identity across cycles
without MarketEvent.id changing meaning, and unrelated stories never merge.
"""

from __future__ import annotations

import pickle
from datetime import datetime, timedelta, timezone

import pytest

import app.event_identity as ei
from app.clustering import _build_cluster
from app.config import settings
from app.event_identity import (IdentityAuthority, dual_key_explanations,
                                get_authority, resolve_and_fold)
from app.events import MarketEvent, build_market_events
from app.feeds import FeedItem, MergedSource
from app.institutional_memory.snapshot_builder import build_theme_snapshot
from app.observation_ledger import LedgerStream, ObservationLedger

from conftest import make_theme

T0 = datetime(2026, 7, 23, 12, 0, tzinfo=timezone.utc)

FED_A = "Fed signals September rate cut as inflation cools"
FED_B = "Fed signals September rate cut as inflation eases"     # j ≈ 0.7 vs A
FED_C = "Fed signals September rate cut as inflation cools further"
ECB   = "ECB signals October rate cut as eurozone inflation cools"  # distinct story
NVDA  = "Nvidia beats earnings estimates and raises guidance on data center demand"


def _item(title: str, url: str, source: str = "Bloomberg Markets",
          age_min: int = 60, merged: list | None = None) -> FeedItem:
    return FeedItem(title=title, url=url, source=source, category="Markets",
                    published_dt=T0 - timedelta(minutes=age_min),
                    snippet="wire snippet", merged_sources=merged or [])


def _events(item_groups: list[list[FeedItem]], now: datetime) -> list[MarketEvent]:
    clusters = [_build_cluster(g) for g in item_groups]
    return build_market_events(clusters, [], now=now)


@pytest.fixture(autouse=True)
def fresh_authority(tmp_path, monkeypatch):
    """Isolated authority per test; all continuity flags on."""
    auth = IdentityAuthority(
        journal=LedgerStream("identity", tmp_path / "ledger"),
        snapshot_path=tmp_path / "event_registry.json",
    )
    monkeypatch.setattr(ei, "_authority", auth)
    monkeypatch.setattr(settings, "event_identity", True)
    monkeypatch.setattr(settings, "registry_decay", True)
    monkeypatch.setattr(settings, "registry_folding", True)
    return auth


# ── OP2.2: uid propagation ─────────────────────────────────────────────────────

def test_events_carry_durable_uid_and_id_is_untouched():
    evs = _events([[_item(FED_A, "https://t/f1")]], T0)
    original_id = evs[0].id
    out = resolve_and_fold(evs, now=T0, cycle_id="cy1")
    assert out[0].uid.startswith("ev_") and len(out[0].uid) == 29
    assert out[0].id == original_id                    # id semantics untouched
    assert out[0].cycles_observed == 1


def test_uid_survives_changed_cluster_id_across_cycles():
    e1 = resolve_and_fold(_events([[_item(FED_A, "https://t/f1")]], T0),
                          now=T0, cycle_id="cy1")
    e2 = resolve_and_fold(_events([[_item(FED_B, "https://t/f2", age_min=30)]],
                                  T0 + timedelta(hours=4)),
                          now=T0 + timedelta(hours=4), cycle_id="cy2")
    assert e1[0].id != e2[0].id                        # cluster identity drifted
    assert e2[0].uid == e1[0].uid                      # institutional identity held
    assert e2[0].cycles_observed == 2


def test_identity_off_restores_sprint3_serving(monkeypatch):
    monkeypatch.setattr(settings, "event_identity", False)
    evs = _events([[_item(FED_A, "https://t/f1")]], T0)
    out = resolve_and_fold(evs, now=T0, cycle_id="cy1")
    assert out is evs and out[0].uid == "" and out[0].cycles_observed == 0


# ── OP2.3: registry-anchored decay ─────────────────────────────────────────────

def _two_cycle_decay(monkeypatch=None):
    """Cycle 1 at T0 (story 2h old); cycle 2 at T0+6h where only a FRESH
    re-report survives (member-derived first_seen would be T0+5.5h)."""
    resolve_and_fold(_events([[_item(FED_A, "https://t/f1", age_min=120)]], T0),
                     now=T0, cycle_id="cy1")
    late = T0 + timedelta(hours=6)
    evs2 = _events([[FeedItem(title=FED_B, url="https://t/f2",
                              source="Financial Times", category="Markets",
                              published_dt=late - timedelta(minutes=30),
                              snippet="fresh re-report")]], late)
    member_first_seen = evs2[0].first_seen
    member_score = evs2[0].editorial_score
    out = resolve_and_fold(evs2, now=late, cycle_id="cy2")
    return out[0], member_first_seen, member_score


def test_registry_anchored_decay_uses_true_first_observation():
    ev, member_first_seen, member_score = _two_cycle_decay()
    anchored = (T0 - timedelta(minutes=120)).isoformat()
    assert member_first_seen > anchored                # members alone forgot the origin
    assert ev.first_seen == anchored                   # registry remembered it
    assert ev.editorial_score < member_score           # decay from the true telling
    assert ev.cycles_observed == 2


def test_registry_decay_flag_off_keeps_member_derived_first_seen(monkeypatch):
    monkeypatch.setattr(settings, "registry_decay", False)
    ev, member_first_seen, member_score = _two_cycle_decay()
    assert ev.first_seen == member_first_seen          # no override
    assert ev.editorial_score == member_score
    assert ev.uid != "" and ev.cycles_observed == 2    # identity itself still flows


# ── OP2.4: same-uid folding ────────────────────────────────────────────────────

def _sibling_events(now: datetime) -> list[MarketEvent]:
    """Two clusters of the SAME story sharing one attesting URL (identity
    rule 1) but with titles distant enough that neither dedup nor event-layer
    near-duplicate folding joins them."""
    shared = MergedSource(source="Financial Times", title="FT: Fed to cut in September",
                          url="https://t/shared", published_dt=now - timedelta(hours=3),
                          snippet="s", tier=1)
    a = [_item(FED_A, "https://t/f1", age_min=120, merged=[shared])]
    b = [_item("Powell prepares markets for easing move next month",
               "https://t/f9", source="CNBC Economy", age_min=20,
               merged=[MergedSource(source="Financial Times",
                                    title="FT: Fed to cut in September",
                                    url="https://t/shared",
                                    published_dt=now - timedelta(hours=3),
                                    snippet="s", tier=1)])]
    return _events([a, b], now)


def test_same_uid_siblings_fold_into_one_institutional_event():
    evs = _sibling_events(T0)
    assert len(evs) == 2                               # pre-identity: two events
    out = resolve_and_fold(evs, now=T0, cycle_id="cy1")

    assert len(out) == 1                               # one event remains one event
    keeper = out[0]
    assert keeper.uid.startswith("ev_")
    assert keeper.title == FED_A                       # elder telling keeps the file
    urls = {e.url for e in keeper.evidence}
    assert {"https://t/f1", "https://t/f9", "https://t/shared"} <= urls
    assert len(keeper.merged_event_ids) == 1           # younger cluster id recorded
    assert keeper.source_count == len({e.source for e in keeper.evidence})


def test_unrelated_stories_never_fold():
    evs = _events([[_item(FED_A, "https://t/f1")],
                   [_item(ECB, "https://t/e1", source="Financial Times")],
                   [_item(NVDA, "https://t/n1", source="CNBC Economy")]], T0)
    out = resolve_and_fold(evs, now=T0, cycle_id="cy1")
    assert len(out) == 3
    assert len({e.uid for e in out}) == 3              # three distinct identities


def test_folding_flag_off_serves_siblings_separately(monkeypatch):
    monkeypatch.setattr(settings, "registry_folding", False)
    out = resolve_and_fold(_sibling_events(T0), now=T0, cycle_id="cy1")
    assert len(out) == 2
    assert out[0].uid == out[1].uid                    # same identity, unfolded


def test_cross_cycle_duplicate_uid_aliases_on_fold(fresh_authority):
    """The [C3] path: a younger event carrying its OWN previously-minted uid
    folds into the canonical — the younger uid becomes a permanent alias."""
    evs = _sibling_events(T0)
    evs[0].uid = ""                                    # left to the authority
    # simulate a pre-folding-era duplicate mint riding in on the younger event
    resolve_and_fold(evs, now=T0, cycle_id="cy1")      # canonical uid now minted
    canonical = fresh_authority.resolve(evs[0].uid) if evs[0].uid else None

    stray = "ev_" + "0" * 26
    ok = fresh_authority.record_fold_alias(stray, evs[0].uid or canonical,
                                           now=T0 + timedelta(minutes=5), cycle_id="cy2")
    assert ok is True
    assert fresh_authority.resolve(stray) == fresh_authority.resolve(evs[0].uid)


# ── OP2.2: explanation dual-keying ─────────────────────────────────────────────

def test_explanations_reachable_by_id_and_uid():
    evs = resolve_and_fold(_events([[_item(FED_A, "https://t/f1")]], T0),
                           now=T0, cycle_id="cy1")
    ev = evs[0]
    explanations = {ev.id: {"event_id": ev.id, "sections": {}}}
    added = dual_key_explanations(explanations, evs)
    assert added == 1
    assert explanations[ev.uid] is explanations[ev.id]   # same object, two keys


# ── OP3.1b: assessment stream ──────────────────────────────────────────────────

def test_assessments_are_hash_gated_and_engine_versioned(tmp_path):
    led = ObservationLedger(tmp_path / "led")
    evs = resolve_and_fold(_events([[_item(FED_A, "https://t/f1")]], T0),
                           now=T0, cycle_id="cy1")

    assert led.record_assessments(evs, now=T0, cycle_id="cy1") == 1
    # unchanged assessment → no new row
    assert led.record_assessments(evs, now=T0 + timedelta(minutes=5), cycle_id="cy2") == 0
    # material change (corroboration → lane promotion) → one new row
    evs[0].corroboration_count = 3
    evs[0].developing = False
    assert led.record_assessments(evs, now=T0 + timedelta(minutes=10), cycle_id="cy3") == 1

    rows = [r for _, r in led.assessments.read_rows()]
    assert len(rows) == 2
    assert all(r["event_uid"] == evs[0].uid for r in rows)
    assert all(r["engine_version"] == "eventscore-f2.1" for r in rows)
    assert all(r["score_components"] is None for r in rows)   # honest null, never invented
    assert rows[0]["lane"] == "developing" and rows[1]["lane"] == "corroborated"


def test_uid_less_events_write_no_assessments(tmp_path):
    led = ObservationLedger(tmp_path / "led")
    evs = _events([[_item(FED_A, "https://t/f1")]], T0)   # no identity pass
    assert led.record_assessments(evs, now=T0, cycle_id="cy1") == 0


# ── C8: archive dual references ────────────────────────────────────────────────

def test_theme_snapshot_carries_event_uids_alongside_cluster_ids():
    theme = make_theme(contributing_cluster_ids=["c1", "c2", "c3"])
    snap = build_theme_snapshot(theme, None, T0,
                                cluster_uid_map={"c1": "ev_X", "c2": "ev_Y"})
    state = snap.payload["state"]
    assert state["contributing_cluster_ids"] == ["c1", "c2", "c3"]   # legacy refs intact
    assert state["contributing_event_uids"] == ["ev_X", "ev_Y"]      # durable refs added


def test_theme_snapshot_without_map_is_honestly_null():
    theme = make_theme(contributing_cluster_ids=["c1"])
    snap = build_theme_snapshot(theme, None, T0)
    assert snap.payload["state"]["contributing_event_uids"] is None


# ── migration ──────────────────────────────────────────────────────────────────

def test_pre_sprint4_event_pickles_still_serve():
    evs = _events([[_item(FED_A, "https://t/f1")]], T0)
    old = evs[0]
    for name in ("uid", "cycles_observed"):
        del old.__dict__[name]
    restored = pickle.loads(pickle.dumps(old))
    # the API mapping reads defensively — old cached events serialize as before
    assert getattr(restored, "uid", "") == ""
    assert int(getattr(restored, "cycles_observed", 0) or 0) == 0
    assert restored.id == old.id


# ── the three-cycle continuity demonstration ───────────────────────────────────

def test_three_cycle_continuity_one_uid_updated_state(fresh_authority):
    c1 = resolve_and_fold(_events([[_item(FED_A, "https://t/f1", age_min=120)]], T0),
                          now=T0, cycle_id="cy1")
    c2 = resolve_and_fold(
        _events([[_item(FED_B, "https://t/f2", source="Financial Times", age_min=30)]],
                T0 + timedelta(hours=4)),
        now=T0 + timedelta(hours=4), cycle_id="cy2")
    c3 = resolve_and_fold(
        _events([[_item(FED_C, "https://t/f3", source="CNBC Economy", age_min=10)]],
                T0 + timedelta(hours=9)),
        now=T0 + timedelta(hours=9), cycle_id="cy3")

    uid = c1[0].uid
    assert c2[0].uid == uid and c3[0].uid == uid            # same institutional event
    assert (c1[0].cycles_observed, c2[0].cycles_observed, c3[0].cycles_observed) == (1, 2, 3)
    anchored = (T0 - timedelta(minutes=120)).isoformat()
    assert c2[0].first_seen == anchored and c3[0].first_seen == anchored
    assert len({c1[0].id, c2[0].id, c3[0].id}) == 3         # cluster ids all differ

    # and the unrelated control mints its own identity in the same world
    ctrl = resolve_and_fold(_events([[_item(ECB, "https://t/e1")]],
                                    T0 + timedelta(hours=9)),
                            now=T0 + timedelta(hours=9), cycle_id="cy3b")
    assert ctrl[0].uid != uid
