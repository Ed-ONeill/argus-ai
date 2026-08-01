"""
tests/test_materiality.py — Wave 0.1 acceptance tests for the universal-
materiality classifier CONTRACT (RD-5 / Chapter 2 §2.6).

Wave 0.1 is skeleton/contract only: deterministic assessments, provenance,
policy version, safe config semantics, the tri-state aggregation mechanic, an
isolated transient shadow side channel, and strict isolation from every
serialization/persistence consumer. It manufactures NO true/false membership and
chooses NO threshold — every production assessment is `unresolved`.
"""

from __future__ import annotations

import dataclasses
import itertools
import pickle
from datetime import datetime, timedelta, timezone

import pytest

import app.event_identity as ei
from app.clustering import StoryCluster, _build_cluster
from app.config import settings
from app.event_identity import IdentityAuthority, resolve_and_fold
from app.events import EventEvidence, MarketEvent, build_market_events
from app.feeds import FeedItem
from app.materiality import (
    POLICY_VERSION,
    MaterialityAssessment,
    MaterialityMode,
    MaterialityShadowResult,
    MaterialityState,
    ReasonCode,
    aggregate,
    assess,
    build_shadow_result,
    effective_mode,
    observe,
    parse_mode,
)
from app.observation_ledger import LedgerStream
from app.processed_cache import ProcessedFeed

NOW = datetime(2026, 7, 16, 14, 0, tzinfo=timezone.utc)
ISO = NOW.isoformat()


# ── Fixtures ──────────────────────────────────────────────────────────────────

def _event(*, id="c-aaa111", event_type="macro", corroboration_count=2,
           source_count=3, uid="", confidence=0, evidence=None,
           companies=None, industries=None, first_seen=ISO,
           transmission_chain=None) -> MarketEvent:
    return MarketEvent(
        id=id, title="Fed surprises with a hold", event_type=event_type,
        first_seen=first_seen, last_updated=ISO,
        corroboration_count=corroboration_count, source_count=source_count,
        evidence=evidence if evidence is not None else [
            EventEvidence(source="Reuters", title="t", url="u1", published=ISO,
                          tier=1, kind="news", qualified=True),
        ],
        companies=companies or [], industries=industries or [],
        confidence=confidence, uid=uid,
        transmission_chain=transmission_chain or [],
    )


def _item(title: str, source: str, url: str, hours_ago: float = 0.0) -> FeedItem:
    return FeedItem(title=title, url=url, source=source, category="Markets",
                    published_dt=NOW - timedelta(hours=hours_ago), snippet="")


def _cluster(cid: str, primary: FeedItem) -> StoryCluster:
    return StoryCluster(id=cid, primary=primary, related=[], cluster_score=0.5,
                        theme_label="Test", story_count=1)


def _two_clusters():
    return [
        _cluster("cma000000001", _item("Fed holds rates steady", "Reuters", "u-fed")),
        _cluster("cnv000000002", _item("Nvidia beats on data-center demand", "Bloomberg", "u-nvda")),
    ]


# ── Core contract ─────────────────────────────────────────────────────────────

def test_default_membership_is_unresolved():
    a = assess(_event())
    assert a.state is MaterialityState.UNRESOLVED
    assert a.materiality_rank is None          # no calibrated decision value in 0.1


def test_policy_version_present():
    a = assess(_event())
    assert a.policy_version == POLICY_VERSION
    assert a.policy_version and "uncalibrated" in a.policy_version


def test_cycle_local_id_provenance_retained():
    a = assess(_event(id="c-xyz789"))
    assert a.event_id == "c-xyz789"
    assert a.contributing_ids == ("c-xyz789",)


def test_uid_optional_before_identity():
    a = assess(_event(uid=""))            # warm/partial run — no durable uid yet
    assert a.event_uid is None


def test_uid_present_after_identity_attaches_it():
    a = assess(_event(uid="ev_01H0000000000000000000"))
    assert a.event_uid == "ev_01H0000000000000000000"


def test_deterministic():
    ev = _event()
    assert assess(ev) == assess(ev)


def test_mandatory_class_flag_without_membership():
    for et in ("macro", "policy", "earnings", "ma"):
        a = assess(_event(event_type=et))
        assert a.mandatory_class is True
        assert a.state is MaterialityState.UNRESOLVED     # class never confers membership
    for et in ("single_name", "market_event", "price_echo"):
        a = assess(_event(event_type=et))
        assert a.mandatory_class is False
        assert a.state is MaterialityState.UNRESOLVED


# ── Decision-input guards ─────────────────────────────────────────────────────

def test_uncalibrated_confidence_not_consumed():
    low = assess(_event(confidence=0))
    high = assess(_event(confidence=99))
    assert low.state is high.state is MaterialityState.UNRESOLVED
    assert "confidence" not in low.inputs_present
    assert "confidence" in {r.factor for r in low.reasons if not r.available}


def test_transmission_chain_not_consumed():
    a = assess(_event(transmission_chain=[{"hop": "x"}]))
    assert "transmission_chain" not in a.inputs_present
    assert "transmission_chain" in {r.factor for r in a.reasons if not r.available}


def test_raw_figures_not_treated_as_magnitude():
    assert "magnitude" in {r.factor for r in assess(_event()).reasons if not r.available}


def test_breadth_is_censored_presence_only():
    a = assess(_event(companies=["NVDA"], industries=["Semiconductors"]))
    breadth = next(r for r in a.reasons if r.factor == "breadth_censored")
    assert "censored" in breadth.detail.lower()
    assert "breadth_censored" not in a.inputs_present


def test_membership_does_not_use_admission_floor():
    import app.materiality as m
    assert not hasattr(m, "ADMISSION_FLOOR")   # never imported/bound → never a threshold
    weak = assess(_event(corroboration_count=0, evidence=[]))
    assert weak.state is MaterialityState.UNRESOLVED   # never auto not_universal


def test_no_llm_participates_in_assessment():
    import app.materiality as m
    assert not hasattr(m, "get_client")
    src = __import__("inspect").getsource(m)
    for usage in ("app.model", "get_client(", "openai.", "anthropic.", ".chat("):
        assert usage not in src


# ── Configuration semantics ───────────────────────────────────────────────────

def test_invalid_mode_fails_off():
    for bad in ("garbage", "", None, "shad0w", 123):
        assert parse_mode(bad) is MaterialityMode.OFF
        assert effective_mode(bad) is MaterialityMode.OFF


def test_modes_parse():
    assert effective_mode("off") is MaterialityMode.OFF
    assert effective_mode("shadow") is MaterialityMode.SHADOW
    assert effective_mode(" SHADOW ") is MaterialityMode.SHADOW


def test_active_downgraded_to_shadow():
    assert effective_mode("active") is MaterialityMode.SHADOW   # reserved for Wave 1


# ── Blocker 1: fresh authoritative assessment AFTER identity resolution ────────

def test_admitted_assessment_freshly_reflects_final_canonical_event():
    # A pre-admission candidate: no qualified corroboration yet, no durable uid.
    ev = _event(id="c1", corroboration_count=0, uid="", companies=[], evidence=[])
    pre = assess(ev)
    assert pre.event_uid is None
    assert pre.corroboration_count == 0                  # value at candidate time
    # Identity resolution re-anchors first_seen, rescoreds, merges evidence,
    # changes corroboration/breadth, and attaches a durable uid.
    ev.first_seen = (NOW - timedelta(hours=50)).isoformat()
    ev.corroboration_count = 4
    ev.companies = ["NVDA", "AMD"]
    ev.uid = "ev_FINAL"
    result = build_shadow_result([pre], [ev])
    (adm,) = result.admitted
    assert adm.event_uid == "ev_FINAL"                   # durable uid, freshly read
    assert adm.event_id == "c1"
    assert adm.corroboration_count == 4                  # reflects the FINAL event (value changed)
    assert adm.first_seen == ev.first_seen
    assert adm.companies_count == 2
    assert adm != pre                                     # FRESH, not a uid-patch of the stale one


def test_identity_fold_merge_yields_one_fresh_admitted_assessment():
    # Two pre-admission candidates fold into one canonical survivor after identity.
    a = assess(_event(id="cA", corroboration_count=1))
    b = assess(_event(id="cB", corroboration_count=1))
    survivor = _event(id="cA", corroboration_count=2, uid="ev_S")   # merged
    result = build_shadow_result([a, b], [survivor])
    assert len(result.pre_admission) == 2
    assert len(result.admitted) == 1                      # one fresh assessment for the survivor
    assert result.admitted[0].event_id == "cA"
    assert result.admitted[0].event_uid == "ev_S"


def test_shadow_result_is_non_authoritative():
    r = build_shadow_result([], [_event()])
    assert isinstance(r, MaterialityShadowResult)
    assert r.authoritative is False
    assert r.policy_version == POLICY_VERSION


# ── Blocker 2: assessments never enter the pickle / object graph ──────────────

def test_marketevent_has_no_materiality_field():
    names = {f.name for f in dataclasses.fields(MarketEvent)}
    assert "materiality" not in names


def test_off_events_carry_no_shadow_payload():
    events = build_market_events(_two_clusters(), [], now=NOW)     # default: no sink
    for e in events:
        assert not hasattr(e, "materiality")


def test_shadow_pickle_contains_no_assessment():
    clusters = _two_clusters()
    sink: list = []
    events = build_market_events(clusters, [], now=NOW, shadow_sink=sink)
    assert sink                                           # shadow path ran
    for e in events:
        assert not hasattr(e, "materiality")              # nothing attached to events
    blob = pickle.dumps(events)                           # events are ProcessedFeed's child graph
    assert b"MaterialityAssessment" not in blob
    restored = pickle.loads(blob)
    for e in restored:
        assert not hasattr(e, "materiality")
    # OFF path likewise
    off_blob = pickle.dumps(build_market_events(clusters, [], now=NOW))
    assert b"MaterialityAssessment" not in off_blob


def test_canonical_serialization_unchanged_under_shadow():
    clusters = _two_clusters()
    off = build_market_events(clusters, [], now=NOW)
    sink: list = []
    shadow = build_market_events(clusters, [], now=NOW, shadow_sink=sink)
    assert [e.to_dict() for e in off] == [e.to_dict() for e in shadow]
    for e in shadow:
        assert "materiality" not in e.to_dict()


# ── Blocker 3: below-admission qualified candidate observed but isolated ──────

def test_below_floor_qualified_candidate_observed_but_never_admitted():
    strong = _cluster("cstrong00001", _item("Fed holds rates steady", "Reuters", "u1"))
    # An aged, qualified (Reuters, tier-1) macro note: decays far below the
    # admission floor but keeps ≥1 qualified source.
    aged = _cluster("caged0000002",
                    _item("ECB signals patience on the policy path", "Reuters", "u2",
                          hours_ago=200))
    sink: list = []
    events = build_market_events([strong, aged], [], now=NOW, shadow_sink=sink)
    admitted_ids = {e.id for e in events}
    sink_ids = {a.event_id for a in sink}
    # The aged candidate is qualified → assessed into the isolated sink ...
    assert "caged0000002" in sink_ids
    # ... but ordinary admission dropped it — never in the returned/persisted set.
    assert "caged0000002" not in admitted_ids
    assert "cstrong00001" in admitted_ids
    # its assessment carries only a cycle-local id (no durable uid at candidate time)
    aged_assessment = next(a for a in sink if a.event_id == "caged0000002")
    assert aged_assessment.event_uid is None
    assert aged_assessment.state is MaterialityState.UNRESOLVED


def test_shadow_sink_does_not_change_admitted_set():
    clusters = _two_clusters()
    off = build_market_events(clusters, [], now=NOW)
    sink: list = []
    shadow = build_market_events(clusters, [], now=NOW, shadow_sink=sink)
    assert [e.id for e in off] == [e.id for e in shadow]
    assert off == shadow                                  # identical admitted events


# ── Blocker 4: aggregate is fully permutation-invariant ───────────────────────

def _fixture(state, *, uid=None, rank=None, version=POLICY_VERSION, eid="e"):
    return MaterialityAssessment(state=state, policy_version=version,
                                 event_id=eid, event_uid=uid, materiality_rank=rank)


def test_aggregate_lattice_and_provenance():
    u1 = _fixture(MaterialityState.UNIVERSAL, uid="ev_1", rank=2.0, eid="a")
    u2 = _fixture(MaterialityState.UNIVERSAL, uid="ev_2", rank=5.0, eid="b")
    n = _fixture(MaterialityState.NOT_UNIVERSAL, eid="c")
    r = _fixture(MaterialityState.UNRESOLVED, eid="d")
    agg = aggregate([u1, u2, n, r])
    assert agg.state is MaterialityState.UNIVERSAL
    assert agg.materiality_rank == 5.0                    # max over universal
    assert set(agg.contributing_ids) == {"a", "b", "c", "d"}
    assert set(agg.universal_event_uids) == {"ev_1", "ev_2"}
    assert aggregate([n, r]).state is MaterialityState.UNRESOLVED   # unresolved > not_universal
    assert aggregate([n, n]).state is MaterialityState.NOT_UNIVERSAL


def test_aggregate_complete_permutation_invariance():
    a = _fixture(MaterialityState.UNIVERSAL, uid="ev_1", rank=3.0, eid="a")
    b = _fixture(MaterialityState.UNRESOLVED, eid="b")
    c = _fixture(MaterialityState.NOT_UNIVERSAL, uid="ev_3", eid="c")
    results = [aggregate(list(p)) for p in itertools.permutations([a, b, c])]
    first = results[0]
    for r in results[1:]:
        assert r == first                                 # COMPLETE dataclass equality


def test_aggregate_version_mismatch_fails_safe():
    a = _fixture(MaterialityState.UNIVERSAL, uid="ev_1", version="umc-0.1.0-uncalibrated", eid="a")
    b = _fixture(MaterialityState.UNIVERSAL, uid="ev_2", version="umc-9.9.9-other", eid="b")
    agg1, agg2 = aggregate([a, b]), aggregate([b, a])
    assert agg1.version_mismatch is True
    assert agg1.state is MaterialityState.UNRESOLVED      # never silently combined
    assert agg1 == agg2                                   # still permutation-invariant


def test_aggregate_empty_is_none():
    assert aggregate([]) is None
    assert aggregate([None, None]) is None


# ── observe() is a harmless, isolated summary ─────────────────────────────────

def test_observe_is_a_noop_shaped_summary():
    # Exercises the isolated channel; returns None, touches nothing else.
    assert observe(build_shadow_result([], [])) is None
    assert observe(build_shadow_result([assess(_event())], [_event()])) is None


# ── Blocker 1 (fields) + Blocker 2 (rich aggregate) ───────────────────────────

def test_assessment_records_canonical_inputs_with_roles():
    ev = _event(id="c9", event_type="earnings", corroboration_count=3, source_count=5,
                companies=["NVDA", "AMD"], industries=["Semis"],
                first_seen=(NOW - timedelta(hours=8)).isoformat(),
                uid="ev_9")
    ev.editorial_score = 42.5
    ev.merged_event_ids = ["m1", "m2"]
    a = assess(ev)
    # provenance
    assert a.event_id == "c9"
    assert a.merged_event_ids == ("m1", "m2")
    assert set(a.contributing_ids) == {"c9", "m1", "m2"}       # event_id + merged (complete)
    assert a.event_uid == "ev_9"
    # decision inputs
    assert a.event_type == "earnings"
    assert a.corroboration_count == 3
    assert a.best_evidence_tier == 1
    assert a.mandatory_class is True
    # diagnostic (never a threshold)
    assert a.first_seen == ev.first_seen
    assert a.editorial_score == 42.5
    assert a.source_count == 5
    assert a.companies_count == 2
    assert a.industries_count == 1


def test_aggregate_preserves_all_evidence_and_nested_provenance():
    a = MaterialityAssessment(
        state=MaterialityState.UNIVERSAL, policy_version=POLICY_VERSION,
        event_id="a", merged_event_ids=("m1",), contributing_ids=("a", "m1"),
        event_uid="ev_A", universal_event_uids=("ev_A",), event_type="macro",
        corroboration_count=3, mandatory_class=True,
        inputs_present=("event_class", "corroboration"),
        reasons=(ReasonCode("event_class", "class=macro", True),),
        materiality_rank=4.0)
    b = MaterialityAssessment(
        state=MaterialityState.UNRESOLVED, policy_version=POLICY_VERSION,
        event_id="b", merged_event_ids=("m2",), contributing_ids=("b", "m2"),
        event_uid="ev_B", event_type="earnings", corroboration_count=1,
        mandatory_class=False, inputs_present=("event_class", "evidence_tier"),
        reasons=(ReasonCode("evidence_tier", "best_tier=1 any_qualified=True", True),),
        materiality_rank=None)
    agg1, agg2 = aggregate([a, b]), aggregate([b, a])
    assert agg1 == agg2                                        # permutation-invariant (complete)
    assert agg1.state is MaterialityState.UNIVERSAL
    assert set(agg1.contributing_ids) == {"a", "m1", "b", "m2"}   # nested lineage preserved
    assert set(agg1.merged_event_ids) == {"m1", "m2"}
    assert agg1.event_uid is None                             # multiple distinct uids → None
    assert set(agg1.universal_event_uids) == {"ev_A"}         # universal contributor only
    assert {(r.factor, r.detail) for r in agg1.reasons} == {
        ("event_class", "class=macro"), ("evidence_tier", "best_tier=1 any_qualified=True")}
    assert set(agg1.inputs_present) == {"event_class", "corroboration", "evidence_tier"}
    assert agg1.mandatory_class is True                       # OR
    assert agg1.materiality_rank == 4.0                       # max over universal


def test_aggregate_scalar_tie_case_permutation_invariant():
    # Two assessments sharing the OLD keeper key (event_id, policy_version, state,
    # event_uid) but differing in EVERY remaining scalar field. There is no keeper
    # now, so the result must be identical across permutations.
    common = dict(state=MaterialityState.UNRESOLVED, policy_version=POLICY_VERSION,
                  event_id="same", event_uid="ev_same")
    a = MaterialityAssessment(
        **common, event_type="macro", first_seen="2026-07-16T10:00:00+00:00",
        editorial_score=10.0, source_count=2, corroboration_count=1,
        best_evidence_tier=2, companies_count=1, industries_count=0,
        mandatory_class=True, inputs_present=("event_class",),
        merged_event_ids=("m_a",), contributing_ids=("same", "m_a"),
        reasons=(ReasonCode("event_class", "class=macro", True),))
    b = MaterialityAssessment(
        **common, event_type="earnings", first_seen="2026-07-16T09:00:00+00:00",
        editorial_score=88.0, source_count=9, corroboration_count=5,
        best_evidence_tier=1, companies_count=6, industries_count=4,
        mandatory_class=False, inputs_present=("corroboration",),
        merged_event_ids=("m_b",), contributing_ids=("same", "m_b"),
        reasons=(ReasonCode("corroboration", "qualified_sources=5", True),))
    r1, r2 = aggregate([a, b]), aggregate([b, a])
    assert r1 == r2                                           # complete equality despite the tie
    # scalar rules applied deterministically:
    assert r1.event_type == "mixed"                          # not unanimous
    assert r1.first_seen == "2026-07-16T09:00:00+00:00"      # earliest
    assert r1.editorial_score == 88.0                        # max (diagnostic)
    assert r1.source_count == 9                              # max
    assert r1.corroboration_count == 5                       # max
    assert r1.best_evidence_tier == 1                        # best
    assert r1.companies_count == 6 and r1.industries_count == 4   # max (censored)
    assert r1.mandatory_class is True                        # OR
    assert set(r1.contributing_ids) == {"same", "m_a", "m_b"}


def test_aggregate_preserves_all_uid_provenance_even_when_none_universal():
    # Two UNRESOLVED contributors with distinct uids + nested uid provenance.
    a = MaterialityAssessment(
        state=MaterialityState.UNRESOLVED, policy_version=POLICY_VERSION,
        event_id="a", event_uid="ev_a", contributing_event_uids=("ev_a", "ev_nested1"))
    b = MaterialityAssessment(
        state=MaterialityState.UNRESOLVED, policy_version=POLICY_VERSION,
        event_id="b", event_uid="ev_b", contributing_event_uids=("ev_b", "ev_nested2"))
    agg1, agg2 = aggregate([a, b]), aggregate([b, a])
    assert agg1 == agg2
    # ALL contributor uids preserved though NO contributor is universal:
    assert set(agg1.contributing_event_uids) == {"ev_a", "ev_b", "ev_nested1", "ev_nested2"}
    assert agg1.universal_event_uids == ()                   # none universal
    assert agg1.event_uid is None                            # multiple distinct → None


def test_aggregate_mixed_universal_unresolved_uid_provenance():
    u = MaterialityAssessment(
        state=MaterialityState.UNIVERSAL, policy_version=POLICY_VERSION,
        event_id="u", event_uid="ev_u", contributing_event_uids=("ev_u",),
        universal_event_uids=("ev_u",))
    r = MaterialityAssessment(
        state=MaterialityState.UNRESOLVED, policy_version=POLICY_VERSION,
        event_id="r", event_uid="ev_r", contributing_event_uids=("ev_r",))
    agg = aggregate([u, r])
    assert set(agg.contributing_event_uids) == {"ev_u", "ev_r"}   # all preserved
    assert set(agg.universal_event_uids) == {"ev_u"}             # only universal
    assert agg.state is MaterialityState.UNIVERSAL


def test_aggregate_event_uid_none_when_nested_uid_conflicts():
    a = MaterialityAssessment(
        state=MaterialityState.UNRESOLVED, policy_version=POLICY_VERSION,
        event_id="x", event_uid="ev_A", contributing_event_uids=("ev_A", "ev_B"))
    agg = aggregate([a])
    assert agg.contributing_event_uids == ("ev_A", "ev_B")   # complete provenance
    assert agg.event_uid is None                             # two distinct → None


def test_aggregate_event_uid_from_sole_nested_uid():
    a = MaterialityAssessment(
        state=MaterialityState.UNRESOLVED, policy_version=POLICY_VERSION,
        event_id="x", event_uid=None, contributing_event_uids=("ev_ONLY",))
    agg = aggregate([a])
    assert agg.contributing_event_uids == ("ev_ONLY",)
    assert agg.event_uid == "ev_ONLY"                        # one distinct in the full union


def test_aggregate_no_uids_gives_none():
    a = MaterialityAssessment(
        state=MaterialityState.UNRESOLVED, policy_version=POLICY_VERSION, event_id="x")
    agg = aggregate([a])
    assert agg.contributing_event_uids == ()
    assert agg.event_uid is None


def test_aggregate_preserves_nested_universal_provenance_through_unresolved_wrapper():
    # A prior-universal assessment later forced/wrapped to UNRESOLVED keeps its
    # universal provenance; its OWN direct uid is not treated as universal now.
    wrapper = MaterialityAssessment(
        state=MaterialityState.UNRESOLVED, policy_version=POLICY_VERSION,
        event_id="w", event_uid="ev_w",
        contributing_event_uids=("ev_w", "ev_prior_universal"),
        universal_event_uids=("ev_prior_universal",))
    other = MaterialityAssessment(
        state=MaterialityState.UNIVERSAL, policy_version=POLICY_VERSION,
        event_id="o", event_uid="ev_o", universal_event_uids=("ev_o",))
    agg1, agg2 = aggregate([wrapper, other]), aggregate([other, wrapper])
    assert agg1 == agg2                                       # still permutation-invariant
    # nested universal provenance survives the UNRESOLVED wrapper ...
    assert "ev_prior_universal" in agg1.universal_event_uids
    # ... the currently-universal contributor's DIRECT uid is added ...
    assert "ev_o" in agg1.universal_event_uids
    # ... but the wrapper's own direct uid is NOT (it is not currently universal).
    assert "ev_w" not in agg1.universal_event_uids
    # complete provenance keeps every uid regardless of state.
    assert set(agg1.contributing_event_uids) == {"ev_w", "ev_prior_universal", "ev_o"}


def test_mandatory_class_available_in_inputs_present_both_ways():
    # inputs_present = feature AVAILABLE/computable, not "evaluated true".
    on = assess(_event(event_type="macro"))
    off = assess(_event(event_type="single_name"))
    assert on.mandatory_class is True and off.mandatory_class is False
    assert "mandatory_class" in on.inputs_present            # available even when True
    assert "mandatory_class" in off.inputs_present           # available even when False


def test_rich_aggregate_permutation_invariant_no_evidence_loss():
    def mk(eid, uid, state, ver, rank, factor):
        return MaterialityAssessment(
            state=state, policy_version=ver, event_id=eid,
            merged_event_ids=(f"{eid}m",), contributing_ids=(eid, f"{eid}m"),
            event_uid=uid, event_type="macro", mandatory_class=(eid == "a"),
            inputs_present=(f"in_{eid}",), materiality_rank=rank,
            reasons=(ReasonCode(factor, f"d_{eid}", True),))
    a = mk("a", "ev_a", MaterialityState.UNIVERSAL, POLICY_VERSION, 2.0, "r_a")
    b = mk("b", "ev_b", MaterialityState.UNRESOLVED, POLICY_VERSION, 9.0, "r_b")
    c = mk("c", "ev_c", MaterialityState.NOT_UNIVERSAL, POLICY_VERSION, 1.0, "r_c")
    results = [aggregate(list(p)) for p in itertools.permutations([a, b, c])]
    first = results[0]
    for r in results[1:]:
        assert r == first                                    # COMPLETE dataclass equality
    # nothing lost across the union fields
    assert set(first.contributing_ids) == {"a", "am", "b", "bm", "c", "cm"}
    assert {r.factor for r in first.reasons} == {"r_a", "r_b", "r_c"}
    assert set(first.inputs_present) == {"in_a", "in_b", "in_c"}


# ── Blocker 3: REAL repository-path integration tests ─────────────────────────

@pytest.fixture
def fresh_identity(tmp_path, monkeypatch):
    """Isolated identity authority per test with continuity flags on (mirrors the
    real pipeline's identity stage)."""
    auth = IdentityAuthority(
        journal=LedgerStream("identity", tmp_path / "ledger"),
        snapshot_path=tmp_path / "event_registry.json",
    )
    monkeypatch.setattr(ei, "_authority", auth)
    monkeypatch.setattr(settings, "event_identity", True)
    monkeypatch.setattr(settings, "registry_decay", True)
    monkeypatch.setattr(settings, "registry_folding", True)
    return auth


def _wire(title, url, hours_ago=1.0):
    return FeedItem(title=title, url=url, source="Bloomberg Markets", category="Markets",
                    published_dt=NOW - timedelta(hours=hours_ago), snippet="wire")


def test_real_fold_and_identity_reassessment_reflects_final_canonical_event(fresh_identity):
    # Two near-duplicate clusters fold at the event layer (real merged provenance).
    c1 = _build_cluster([_wire("Fed signals September rate cut as inflation cools", "https://t/f1")])
    c2 = _build_cluster([_wire("Fed signals September rate cut as inflation eases", "https://t/f2")])
    events = build_market_events([c1, c2], [], now=NOW)
    events = resolve_and_fold(events, now=NOW, cycle_id="cy1")    # REAL identity stage
    assert len(events) == 1                                       # genuinely merged
    survivor = events[0]
    assert survivor.merged_event_ids                             # real merged provenance
    assert survivor.uid.startswith("ev_")
    # FRESH post-identity assessment mirrors the FINAL canonical event.
    a = assess(survivor)
    assert a.event_id == survivor.id
    assert set(a.merged_event_ids) == set(survivor.merged_event_ids)
    assert set(a.contributing_ids) == {survivor.id, *survivor.merged_event_ids}
    assert a.event_uid == survivor.uid
    assert a.first_seen == survivor.first_seen
    assert a.editorial_score == survivor.editorial_score
    assert a.source_count == survivor.source_count
    assert a.corroboration_count == survivor.corroboration_count
    assert a.companies_count == len(survivor.companies)
    assert a.industries_count == len(survivor.industries)


def test_real_processedfeed_pickle_has_no_shadow_artifacts():
    clusters = _two_clusters()
    sink: list = []
    events = build_market_events(clusters, [], now=NOW, shadow_sink=sink)
    assert sink                                                  # shadow path ran
    feed = ProcessedFeed(items=[], top_stories={}, market_take="", errors={},
                         promo_excluded=0, debug_log=[], clusters=clusters, events=events)
    blob = pickle.dumps(feed)                                    # the real persistence mechanism
    for forbidden in (b"MaterialityAssessment", b"MaterialityShadowResult",
                      b"shadow_sink", b"app.materiality"):
        assert forbidden not in blob
    restored = pickle.loads(blob)
    assert [e.id for e in restored.events] == [e.id for e in events]
    for e in restored.events:
        assert not hasattr(e, "materiality")


def test_real_orchestration_slice_isolates_below_floor_candidate(fresh_identity):
    # Exercises the real functions in run_pipeline's order:
    #   build (incl. _admit) → pre-admission sink → identity → fresh assess → feed.
    strong = _build_cluster([_wire("Fed holds rates steady", "https://t/s", hours_ago=0.5)])
    aged = _build_cluster([_wire("ECB signals patience on the policy path", "https://t/a",
                                 hours_ago=200)])
    sink: list = []
    events = build_market_events([strong, aged], [], now=NOW, shadow_sink=sink)
    events = resolve_and_fold(events, now=NOW, cycle_id="cy1")
    shadow = build_shadow_result(sink, events)
    feed = ProcessedFeed(items=[], top_stories={}, market_take="", errors={},
                         promo_excluded=0, debug_log=[], clusters=[strong, aged], events=events)
    observe(shadow)
    feed_ids = {e.id for e in feed.events}
    pre_ids = {a.event_id for a in shadow.pre_admission}
    # the aged, qualified candidate is observed in the isolated shadow channel ...
    assert aged.id in pre_ids
    # ... but admission dropped it — it is NOT in the canonical feed.
    assert aged.id not in feed_ids
    assert strong.id in feed_ids
    # it never reaches persistence, and no event references a shadow assessment.
    blob = pickle.dumps(feed)
    assert b"app.materiality" not in blob
    assert not any(hasattr(e, "materiality") for e in feed.events)


def test_real_run_pipeline_shadow_lifecycle(fresh_identity, monkeypatch, caplog):
    """The ACTUAL background.run_pipeline() control flow, with fetch/LLM/disk
    isolated: mode resolution → shadow sink → pre-admission assessment → _admit →
    identity resolution → fresh post-identity assessment → observation → feed."""
    import logging
    from datetime import datetime as _dt
    from datetime import timezone as _tz

    import app.background as bg
    import app.feeds as feeds_mod
    import app.observation_ledger as obs
    import app.summarizer as summ

    now = _dt.now(_tz.utc)
    strong = FeedItem(title="Fed holds rates steady", url="https://t/live-s",
                      source="Bloomberg Markets", category="Markets",
                      published_dt=now - timedelta(minutes=20), snippet="wire")
    aged = FeedItem(title="ECB signals patience on the policy path", url="https://t/live-a",
                    source="Bloomberg Markets", category="Markets",
                    published_dt=now - timedelta(hours=200), snippet="wire")

    monkeypatch.setattr(settings, "materiality_mode", "shadow")
    # isolate fetch / LLM / disk side effects
    monkeypatch.setattr(feeds_mod.feed_manager, "fetch_all", lambda **kw: [strong, aged])
    monkeypatch.setattr(feeds_mod.feed_manager, "fetch_errors", {}, raising=False)
    monkeypatch.setattr(feeds_mod.feed_manager, "promo_excluded", 0, raising=False)
    monkeypatch.setattr(feeds_mod.feed_manager, "last_source_stats", {}, raising=False)

    class _SumRes:
        new = cached = skipped = 0
    monkeypatch.setattr(summ, "summarize_items", lambda *a, **k: _SumRes())
    monkeypatch.setattr(summ, "generate_market_take", lambda *a, **k: "")
    monkeypatch.setattr(summ, "generate_market_brief", lambda *a, **k: None)
    monkeypatch.setattr(obs.observation_ledger, "record_observations", lambda *a, **k: 0, raising=False)
    monkeypatch.setattr(obs.observation_ledger, "record_assessments", lambda *a, **k: 0, raising=False)
    monkeypatch.setattr(obs.observation_ledger, "compress_old", lambda *a, **k: None, raising=False)

    with caplog.at_level(logging.INFO, logger="app.materiality"):
        feed = bg.run_pipeline(categories="", sources="")     # full-feed → identity + shadow

    titles = {e.title for e in feed.events}
    assert "Fed holds rates steady" in titles                 # admitted
    assert "ECB signals patience on the policy path" not in titles   # below-floor → dropped
    # shadow observation ran, and a qualified below-floor candidate was observed
    # (pre_admission_qualified) though only one event was admitted.
    assert "[materiality:shadow" in caplog.text
    assert "pre_admission_qualified=2" in caplog.text
    assert "admitted=1" in caplog.text
    # no shadow payload survives into the returned ProcessedFeed
    blob = pickle.dumps(feed)
    assert b"app.materiality" not in blob
    assert b"MaterialityAssessment" not in blob
    assert b"MaterialityShadowResult" not in blob
    for e in feed.events:
        assert not hasattr(e, "materiality")


def test_real_processedfeedcache_save_load_isolation(tmp_path, monkeypatch):
    import glob

    import app.processed_cache as pc
    monkeypatch.setattr(pc, "_CACHE_DIR", tmp_path / "feed_cache")

    clusters = _two_clusters()
    sink: list = []
    events = build_market_events(clusters, [], now=NOW, shadow_sink=sink)
    assert sink
    feed = pc.ProcessedFeed(items=[], top_stories={}, market_take="", errors={},
                            promo_excluded=0, debug_log=[], clusters=clusters, events=events)

    cache = pc.ProcessedFeedCache()
    cache.set("testkey", feed)                                # real memory + disk pickle
    got = cache.get("testkey")
    cache2 = pc.ProcessedFeedCache()
    cache2._load_from_disk()                                  # real disk load path
    disk = cache2.get("testkey")

    for f in (got, disk):
        assert f is not None
        assert [e.id for e in f.events] == [e.id for e in events]   # canonical events survive
        for e in f.events:
            assert not hasattr(e, "materiality")
    # the persisted pickle files carry no shadow artifacts
    pkls = glob.glob(str((tmp_path / "feed_cache") / "*.pkl"))
    assert pkls
    for p in pkls:
        with open(p, "rb") as fh:
            data = fh.read()
        for forbidden in (b"MaterialityAssessment", b"MaterialityShadowResult",
                          b"shadow_sink", b"app.materiality"):
            assert forbidden not in data
