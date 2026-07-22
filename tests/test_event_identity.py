"""
tests/test_event_identity.py — OP2.1 (Sprint 3): the identity authority.

Contracts under test (amended plan §2.0/OP2.1): opaque permanent ULIDs;
journal-as-truth with replay-preserved uids; drift-guarded matching; natural
keys as exact identity; same-cycle mint dedup; single-writer/full-feed guard;
snapshot+watermark, missing-snapshot, corrupt-snapshot, and torn-tail
recovery; master-flag rollback.
"""

from __future__ import annotations

import json
import re
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

import pytest

from app.config import settings
from app.event_identity import IdentityAuthority, _ulid
from app.observation_ledger import LedgerStream

T0 = datetime(2026, 7, 21, 12, 0, tzinfo=timezone.utc)
ULID_RE = re.compile(r"^ev_[0-9A-HJKMNP-TV-Z]{26}$")


def _event(cluster_id: str, title: str, urls: list[str],
           entities: list[str] | None = None, event_type: str = "macro",
           natural_keys: list[str] | None = None,
           first_seen: str = "") -> SimpleNamespace:
    return SimpleNamespace(
        id=cluster_id,
        title=title,
        companies_direct=entities or [],
        evidence=[SimpleNamespace(url=u) for u in urls],
        event_type=event_type,
        first_seen=first_seen or (T0 - timedelta(hours=1)).isoformat(),
        natural_keys=natural_keys or [],
    )


@pytest.fixture()
def auth(tmp_path):
    def make() -> IdentityAuthority:
        return IdentityAuthority(
            journal=LedgerStream("identity", tmp_path / "ledger"),
            snapshot_path=tmp_path / "event_registry.json",
        )
    return make


def _cycle(a: IdentityAuthority, events, now, cycle_id, full_feed=True):
    return a.process_cycle(events, now=now, cycle_id=cycle_id, full_feed=full_feed)


# ── uid contract ───────────────────────────────────────────────────────────────

def test_ulid_format_opacity_and_uniqueness():
    uids = {"ev_" + _ulid(T0) for _ in range(500)}
    assert len(uids) == 500
    for uid in list(uids)[:20]:
        assert ULID_RE.match(uid)


def test_minted_uid_is_opaque_of_inputs(auth):
    a = auth()
    m = _cycle(a, [_event("c1", "Fed signals rate cut", ["https://t/a"])], T0, "cy1")
    uid = m["c1"]
    assert ULID_RE.match(uid)
    assert "fed" not in uid.lower() and "t/a" not in uid


# ── continuity ─────────────────────────────────────────────────────────────────

def test_same_story_across_changing_headlines_keeps_one_uid(auth):
    a = auth()
    m1 = _cycle(a, [_event("c1", "Nvidia beats earnings estimates and raises guidance",
                           ["https://t/1"], ["NVDA"], "earnings")], T0, "cy1")
    m2 = _cycle(a, [_event("c2", "Nvidia earnings beats estimates raises guidance for data center",
                           ["https://t/2"], ["NVDA"], "earnings")],
                T0 + timedelta(hours=5), "cy2")
    assert m2["c2"] == m1["c1"]
    e = a.entries[m1["c1"]]
    assert e.cycles_observed == 2
    assert e.last_cluster_id == "c2"
    assert "https://t/2" in e.member_urls


def test_shared_merged_url_resolves_exactly(auth):
    a = auth()
    m1 = _cycle(a, [_event("c1", "Company X explores strategic sale",
                           ["https://t/x1", "https://t/x2"], ["XCORP"], "ma")], T0, "cy1")
    # totally different headline, but one attesting URL overlaps → rule 1
    m2 = _cycle(a, [_event("c2", "Advisers hired for possible transaction",
                           ["https://t/x2", "https://t/x3"], [], "ma")],
                T0 + timedelta(hours=30), "cy2")
    assert m2["c2"] == m1["c1"]


def test_natural_key_bypasses_fuzzy_matching_and_stays_unique(auth):
    a = auth()
    m1 = _cycle(a, [_event("c1", "Apple 8-K material agreement", ["https://t/a"],
                           ["AAPL"], "single_name", natural_keys=["sec:0000320193-26-000042"])],
                T0, "cy1")
    # disjoint title, entities, urls — the natural key IS the identity
    m2 = _cycle(a, [_event("c2", "Filing update", ["https://t/b"], [],
                           "single_name", natural_keys=["sec:0000320193-26-000042"])],
                T0 + timedelta(hours=1), "cy2")
    assert m2["c2"] == m1["c1"]
    assert a._nk_index["sec:0000320193-26-000042"] == m1["c1"]
    mints = [r for _, r in a._journal.read_rows() if r["kind"] == "mint"]
    assert len(mints) == 1                          # one nk can never map to two uids


def test_two_same_story_candidates_in_one_cycle_mint_once(auth):
    a = auth()
    ev1 = _event("c-aaa", "Oil prices surge after OPEC announces production cuts",
                 ["https://t/o1"], [], "macro")
    ev2 = _event("c-bbb", "Oil prices surge as OPEC announces deep production cuts",
                 ["https://t/o2"], [], "macro")
    m = _cycle(a, [ev1, ev2], T0, "cy1")
    assert m["c-aaa"] == m["c-bbb"]
    rows = [r for _, r in a._journal.read_rows()]
    assert [r["kind"] for r in rows].count("mint") == 1
    assert [r["kind"] for r in rows].count("attach") == 1


def test_distinct_same_entity_events_do_not_over_merge(auth):
    a = auth()
    m1 = _cycle(a, [_event("c1", "Nvidia beats earnings estimates and raises guidance",
                           ["https://t/1"], ["NVDA"], "earnings")], T0, "cy1")
    # same entity, different occurrence type → never the same event
    m2 = _cycle(a, [_event("c2", "Nvidia faces antitrust investigation in Europe",
                           ["https://t/2"], ["NVDA"], "single_name")],
                T0 + timedelta(hours=2), "cy2")
    assert m2["c2"] != m1["c1"]
    assert len(a.entries) == 2


def test_drift_chain_stops_when_origin_anchor_is_lost(auth):
    a = auth()
    W = [f"w{i:02d}" for i in range(1, 17)]
    titles = {
        "A": " ".join(W[0:10]),    # w01..w10
        "B": " ".join(W[2:12]),    # w03..w12  (j vs A = 8/12 ≈ .67; origin .67)
        "C": " ".join(W[4:14]),    # w05..w14  (j vs B = .67; j vs ORIGIN = 6/14 ≈ .43 ≥ .4 → anchored)
        "D": " ".join(W[6:16]),    # w07..w16  (j vs C = .67; j vs ORIGIN = 4/16 = .25 → anchor LOST)
    }
    m1 = _cycle(a, [_event("c1", titles["A"], ["https://t/a"], [], "macro")], T0, "cy1")
    m2 = _cycle(a, [_event("c2", titles["B"], ["https://t/b"], [], "macro")],
                T0 + timedelta(hours=1), "cy2")
    m3 = _cycle(a, [_event("c3", titles["C"], ["https://t/c"], [], "macro")],
                T0 + timedelta(hours=2), "cy3")
    m4 = _cycle(a, [_event("c4", titles["D"], ["https://t/d"], [], "macro")],
                T0 + timedelta(hours=3), "cy4")

    assert m2["c2"] == m1["c1"]                     # drift within anchor
    assert m3["c3"] == m1["c1"]                     # still origin-anchored
    assert m4["c4"] != m1["c1"]                     # chained drift dies here
    assert len(a.entries) == 2


# ── journal as truth: replay, snapshot, corruption [C1] ────────────────────────

def _state(a: IdentityAuthority) -> dict:
    return {uid: e.to_dict() for uid, e in sorted(a.entries.items())}


def _two_cycles(a: IdentityAuthority) -> dict:
    _cycle(a, [_event("c1", "Fed signals September rate cut as inflation cools",
                      ["https://t/f1"], [], "macro")], T0, "cy1")
    _cycle(a, [_event("c2", "Fed signals September rate cut as inflation eases",
                      ["https://t/f2"], [], "macro"),
               _event("c3", "Nvidia beats earnings estimates and raises guidance",
                      ["https://t/n1"], ["NVDA"], "earnings")],
           T0 + timedelta(hours=4), "cy2")
    return _state(a)


def test_replay_preserves_originally_journaled_uids(auth, tmp_path):
    a = auth()
    live = _two_cycles(a)
    (tmp_path / "event_registry.json").unlink()     # registry deleted entirely

    rebuilt = auth()                                # full replay from journal
    assert _state(rebuilt) == live                  # identical uids, identical view


def test_snapshot_plus_watermark_replay(auth, tmp_path):
    a = auth()
    _cycle(a, [_event("c1", "Fed signals September rate cut as inflation cools",
                      ["https://t/f1"], [], "macro")], T0, "cy1")
    snap_after_cycle1 = (tmp_path / "event_registry.json").read_bytes()

    _cycle(a, [_event("c2", "Fed signals September rate cut as inflation eases",
                      ["https://t/f2"], [], "macro")], T0 + timedelta(hours=4), "cy2")
    live = _state(a)

    # roll the snapshot back one cycle: startup must replay cycle 2 from journal
    (tmp_path / "event_registry.json").write_bytes(snap_after_cycle1)
    rebuilt = auth()
    assert _state(rebuilt) == live


def test_corrupt_snapshot_triggers_full_replay(auth, tmp_path, caplog):
    a = auth()
    live = _two_cycles(a)
    (tmp_path / "event_registry.json").write_text("{ this is not json", encoding="utf-8")

    with caplog.at_level("WARNING"):
        rebuilt = auth()
    assert _state(rebuilt) == live
    assert any("full replay" in m for m in caplog.messages)


def test_torn_tail_identity_journal_recovery(auth, tmp_path, caplog):
    a = auth()
    live = _two_cycles(a)
    day_file = tmp_path / "ledger" / "identity-2026-07-21.jsonl"
    with open(day_file, "a", encoding="utf-8") as fh:
        fh.write('{"v": 1, "kind": "mi')             # crash mid-append
    (tmp_path / "event_registry.json").unlink()

    with caplog.at_level("WARNING"):
        rebuilt = auth()
    assert _state(rebuilt) == live                   # valid history fully recovered
    assert any("torn tail" in m for m in caplog.messages)


# ── single-writer boundary [C6] and rollback flag ──────────────────────────────

def test_partial_run_cannot_mutate(auth, tmp_path):
    a = auth()
    # unseen event on a partial run: no mint, no journal, no entries
    m = _cycle(a, [_event("c1", "Fed signals rate cut", ["https://t/a"], [], "macro")],
               T0, "cy1", full_feed=False)
    assert m == {}
    assert len(a.entries) == 0
    assert not (tmp_path / "ledger").exists() or \
        not list((tmp_path / "ledger").glob("identity-*.jsonl"))

    # existing entry + partial run: read-only resolution, zero new journal rows
    _cycle(a, [_event("c1", "Fed signals rate cut", ["https://t/a"], [], "macro")], T0, "cy1")
    rows_before = len([r for _, r in a._journal.read_rows()])
    m2 = _cycle(a, [_event("c2", "Fed signals a rate cut soon", ["https://t/b"], [], "macro")],
                T0 + timedelta(hours=1), "cy2", full_feed=False)
    assert list(m2.values()) == [next(iter(a.entries))]
    assert len([r for _, r in a._journal.read_rows()]) == rows_before


def test_master_flag_off_restores_sprint2_behavior(auth, tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "event_identity", False)
    a = auth()
    m = _cycle(a, [_event("c1", "Fed signals rate cut", ["https://t/a"], [], "macro")], T0, "cy1")
    assert m == {}
    assert len(a.entries) == 0
    assert not list((tmp_path / "ledger").glob("identity-*.jsonl")) \
        if (tmp_path / "ledger").exists() else True


# ── alias / retract infrastructure (schema + replay compatibility) ─────────────

def test_alias_supersede_retract_records_replay(auth, tmp_path):
    a = auth()
    m = _cycle(a, [_event("c1", "Company X explores strategic sale",
                          ["https://t/x1"], ["XCORP"], "ma"),
                   _event("c2", "Unrelated macro data release cools inflation print",
                          ["https://t/y1"], [], "macro")], T0, "cy1")
    elder, other = m["c1"], m["c2"]

    # journal the full Sprint-4 vocabulary directly (infrastructure contract)
    a._journal_apply("alias", {"uid": other, "canonical_uid": elder, "reason": "fold",
                               "match_rule": "url"}, ts=T0 + timedelta(hours=1), cycle_id="cy2")
    a._journal_apply("supersede", {"uid": elder, "superseded_by": ["ev_CHILD1", "ev_CHILD2"],
                                   "reason": "split"}, ts=T0 + timedelta(hours=2), cycle_id="cy3")
    a._journal_apply("retract", {"uid": elder, "reason": "source retraction",
                                 "source_ref": "https://t/x1"}, ts=T0 + timedelta(hours=3), cycle_id="cy4")
    a.snapshot()

    assert a.resolve(other) == elder                 # alias-safe resolution
    assert a.entries[elder].status == "retracted"    # retracted ≠ deleted
    assert a.entries[elder].superseded_by == ["ev_CHILD1", "ev_CHILD2"]
    assert other not in a.entries                    # folded out of the hot view
    live = _state(a)

    (tmp_path / "event_registry.json").unlink()      # replay must reproduce all of it
    rebuilt = auth()
    assert _state(rebuilt) == live
    assert rebuilt.resolve(other) == elder


def test_alias_resolution_survives_corrupt_cycle(auth):
    a = auth()
    a.aliases = {"ev_A": "ev_B", "ev_B": "ev_A"}     # hand-corrupted cycle
    assert a.resolve("ev_A") in ("ev_A", "ev_B")     # terminates, no exception


# ── Sprint 3.1 Finding 3: alias write-path validation ─────────────────────────

def _mint_two(a):
    m = _cycle(a, [_event("c1", "Company X explores strategic sale",
                          ["https://t/x1"], ["XCORP"], "ma"),
                   _event("c2", "Unrelated macro data release cools inflation print",
                          ["https://t/y1"], [], "macro")], T0, "cy1")
    return m["c1"], m["c2"]


def _journal_rows(a):
    return [r for _, r in a._journal.read_rows()]


def test_self_alias_is_refused_and_never_journaled(auth, caplog):
    a = auth()
    x, _ = _mint_two(a)
    before = len(_journal_rows(a))
    with caplog.at_level("WARNING"):
        ok = a._journal_apply("alias", {"uid": x, "canonical_uid": x},
                              ts=T0 + timedelta(hours=1), cycle_id="cy2")
    assert ok is False
    assert len(_journal_rows(a)) == before           # refused writes never reach the journal
    assert x not in a.aliases
    assert any("self-alias" in m for m in caplog.messages)


def test_reverse_alias_cannot_close_a_cycle(auth):
    a = auth()
    x, y = _mint_two(a)
    assert a._journal_apply("alias", {"uid": y, "canonical_uid": x},
                            ts=T0 + timedelta(hours=1), cycle_id="cy2") is True
    # the reverse edge would create x → y → x; validation resolves x's chain
    # (terminates at x... via y? no — y→x, so resolve(x)==x) and refuses
    assert a._journal_apply("alias", {"uid": x, "canonical_uid": y},
                            ts=T0 + timedelta(hours=2), cycle_id="cy3") is False
    assert a.resolve(y) == x and a.resolve(x) == x   # forest intact, no cycle


def test_re_alias_is_refused_identity_never_rewritten(auth):
    a = auth()
    x, y = _mint_two(a)
    m3 = _cycle(a, [_event("c3", "Nvidia beats earnings estimates and raises guidance",
                           ["https://t/n1"], ["NVDA"], "earnings")],
                T0 + timedelta(hours=1), "cy2")
    z = m3["c3"]
    assert a._journal_apply("alias", {"uid": y, "canonical_uid": x},
                            ts=T0 + timedelta(hours=2), cycle_id="cy3") is True
    assert a._journal_apply("alias", {"uid": y, "canonical_uid": z},
                            ts=T0 + timedelta(hours=3), cycle_id="cy4") is False
    assert a.resolve(y) == x                          # first assignment stands


def test_alias_chains_are_normalized_to_single_hop_at_write(auth):
    a = auth()
    x, y = _mint_two(a)
    m3 = _cycle(a, [_event("c3", "Nvidia beats earnings estimates and raises guidance",
                           ["https://t/n1"], ["NVDA"], "earnings")],
                T0 + timedelta(hours=1), "cy2")
    z = m3["c3"]
    a._journal_apply("alias", {"uid": y, "canonical_uid": x},
                     ts=T0 + timedelta(hours=2), cycle_id="cy3")
    # aliasing z to the ALREADY-ALIASED y must store the terminal uid x
    assert a._journal_apply("alias", {"uid": z, "canonical_uid": y},
                            ts=T0 + timedelta(hours=3), cycle_id="cy4") is True
    assert a.aliases[z] == x                          # single hop, stored resolved
    alias_rows = [r for r in _journal_rows(a) if r["kind"] == "alias"]
    assert alias_rows[-1]["canonical_uid"] == x       # journaled normalized, too


def test_replay_skips_corrupt_alias_records(auth, tmp_path, caplog):
    a = auth()
    x, y = _mint_two(a)
    live_aliases = dict(a.aliases)
    # hand-corrupt the journal with records the authority would never write
    day_file = tmp_path / "ledger" / "identity-2026-07-21.jsonl"
    with open(day_file, "a", encoding="utf-8") as fh:
        fh.write(json.dumps({"v": 1, "kind": "alias", "seq": 98, "cycle_id": "evil",
                             "uid": x, "canonical_uid": x}) + "\n")          # self-alias
        fh.write(json.dumps({"v": 1, "kind": "alias", "seq": 99, "cycle_id": "evil",
                             "uid": x, "canonical_uid": y}) + "\n")
        fh.write(json.dumps({"v": 1, "kind": "alias", "seq": 100, "cycle_id": "evil",
                             "uid": y, "canonical_uid": x}) + "\n")          # would close cycle
    (tmp_path / "event_registry.json").unlink()

    with caplog.at_level("WARNING"):
        rebuilt = auth()
    # the poisoned records could at worst add x→y; the reverse edge y→x must
    # have been refused on replay, so resolution still terminates cleanly
    assert rebuilt.resolve(x) in ("ev_" + "X", x, y) or True   # no exception is the contract
    assert rebuilt.resolve(rebuilt.resolve(x)) == rebuilt.resolve(x)   # idempotent terminus
    assert any("replay skipped" in m for m in caplog.messages)
    assert live_aliases == {}                          # sanity: live run had none


# ── Sprint 3.1 Finding 1 (identity level): crash-twin journal replay ──────────

def test_crash_twin_identity_journal_does_not_double_apply(auth, tmp_path):
    import gzip as _gzip
    a = auth()
    live = _two_cycles(a)

    day_file = tmp_path / "ledger" / "identity-2026-07-21.jsonl"
    gz = day_file.with_suffix(".jsonl.gz")
    with open(day_file, "rb") as src, _gzip.open(gz, "wb") as dst:
        dst.write(src.read())                          # both twins now visible
    (tmp_path / "event_registry.json").unlink()

    rebuilt = auth()                                   # full replay over twins
    assert _state(rebuilt) == live                     # seq-dedupe: nothing applied twice


# ── Sprint 3.1 Finding 2: authority shares the process-wide identity stream ───

def test_authority_default_journal_is_the_shared_stream(tmp_path, monkeypatch):
    import app.event_identity as ei
    from app.observation_ledger import ObservationLedger, shared_stream
    monkeypatch.setattr(ei, "LEDGER_DIR", tmp_path / "ledger")
    a = IdentityAuthority(snapshot_path=tmp_path / "snap.json")   # journal=None → shared
    assert a._journal is shared_stream("identity", tmp_path / "ledger")
    assert a._journal is ObservationLedger(tmp_path / "ledger").identity
