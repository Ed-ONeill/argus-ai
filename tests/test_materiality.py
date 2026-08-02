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
    MAX_FIGURE_KEYS,
    MAX_MONEY_MINOR,
    MAX_PERCENTAGE_BPS,
    MAX_TITLE_SCAN_CHARS,
    POLICY_VERSION,
    FigureDiagnostics,
    FigureEvidence,
    FigureFact,
    MaterialityAssessment,
    MaterialityMode,
    MaterialityShadowResult,
    MaterialityState,
    ReasonCode,
    aggregate,
    assess,
    build_figure_evidence,
    build_shadow_result,
    effective_mode,
    figure_diagnostics,
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


# ── Wave 0.2a: source-kind evidence ───────────────────────────────────────────

def _ev(kind, tier=1, qualified=True, source="Src", url=None):
    return EventEvidence(source=source, title="t", url=url or f"u-{kind}-{tier}-{source}",
                         published=ISO, tier=tier, kind=kind, qualified=qualified)


def test_source_evidence_reflects_evidence_kinds():
    e = _event(evidence=[_ev("sec_filing"), _ev("transcript"), _ev("news"), _ev("news")])
    se = assess(e).source_evidence
    assert se is not None
    assert (se.sec_filing_count, se.transcript_count, se.ir_release_count, se.news_count) == (1, 1, 0, 2)
    assert se.evidence_count == 4
    assert se.has_primary_source is True                     # sec_filing/transcript present


def test_primary_source_definition_matches_repo_semantics():
    for primary in ("sec_filing", "transcript", "ir_release"):
        assert assess(_event(evidence=[_ev(primary)])).source_evidence.has_primary_source is True
    only_news = assess(_event(evidence=[_ev("news"), _ev("news")])).source_evidence
    assert only_news.has_primary_source is False
    assert assess(_event(evidence=[])).source_evidence.has_primary_source is False


def test_source_evidence_tier_and_qualified_count():
    e = _event(corroboration_count=3,
               evidence=[_ev("news", tier=1), _ev("news", tier=3, qualified=False)])
    se = assess(e).source_evidence
    assert se.best_tier == 1                                 # best (lowest) tier
    assert se.qualified_source_count == 3                    # == event.corroboration_count
    assert se.evidence_count == 2


def test_source_kinds_in_inputs_present_iff_evidence():
    assert "source_kinds" in assess(_event(evidence=[_ev("news")])).inputs_present
    assert "source_kinds" not in assess(_event(evidence=[])).inputs_present


def test_unknown_kind_counts_as_news_conservatively():
    se = assess(_event(evidence=[_ev("weird_kind")])).source_evidence
    assert se.news_count == 1 and se.has_primary_source is False


# ── Wave 0.2a: censored breadth evidence ──────────────────────────────────────

def test_breadth_evidence_counts_caps_unthemed():
    e = _event(companies=["A", "B"], industries=["X"], transmission_chain=[])
    e.theme_ids = ["t1"]
    be = assess(e).breadth_evidence
    assert (be.company_count, be.industry_count) == (2, 1)
    assert be.company_capped is False and be.industry_capped is False
    assert be.unthemed is False


def test_breadth_capped_flags_are_honest_lower_bounds():
    capped = _event(companies=[f"C{i}" for i in range(8)], industries=[f"I{i}" for i in range(6)])
    be = assess(capped).breadth_evidence
    assert be.company_count == 8 and be.company_capped is True     # >= cap 8
    assert be.industry_count == 6 and be.industry_capped is True   # >= cap 6
    below = _event(companies=[f"C{i}" for i in range(7)], industries=[f"I{i}" for i in range(5)])
    be2 = assess(below).breadth_evidence
    assert be2.company_capped is False and be2.industry_capped is False


def test_unthemed_flag_captured():
    themed = _event()
    themed.theme_ids = ["t1"]
    unthemed = _event()
    unthemed.theme_ids = []
    assert assess(themed).breadth_evidence.unthemed is False
    assert assess(unthemed).breadth_evidence.unthemed is True


def test_breadth_stays_diagnostic_not_in_inputs_present():
    a = assess(_event(companies=["A"], industries=["X"]))
    assert "breadth" not in a.inputs_present
    assert "breadth_censored" not in a.inputs_present         # diagnostic only


def test_source_and_breadth_deterministic():
    e = _event(companies=["A"], evidence=[_ev("sec_filing"), _ev("news")])
    assert assess(e) == assess(e)


def test_membership_unresolved_with_new_evidence():
    a = assess(_event(companies=["A"], evidence=[_ev("sec_filing")]))
    assert a.state is MaterialityState.UNRESOLVED
    assert a.materiality_rank is None


# ── Wave 0.2a: aggregation of the new evidence (max, not sum; permutation-inv.) ─

def _asmt(*, eid, source_evidence=None, breadth_evidence=None,
          state=MaterialityState.UNRESOLVED):
    return MaterialityAssessment(state=state, policy_version=POLICY_VERSION,
                                 event_id=eid, source_evidence=source_evidence,
                                 breadth_evidence=breadth_evidence)


def test_aggregate_source_evidence_max_not_sum():
    from app.materiality import SourceEvidence
    a = _asmt(eid="a", source_evidence=SourceEvidence(
        sec_filing_count=1, news_count=2, has_primary_source=True, best_tier=2,
        qualified_source_count=2, evidence_count=3))
    b = _asmt(eid="b", source_evidence=SourceEvidence(
        sec_filing_count=0, news_count=3, has_primary_source=False, best_tier=1,
        qualified_source_count=1, evidence_count=4))
    agg1, agg2 = aggregate([a, b]), aggregate([b, a])
    assert agg1 == agg2                                       # permutation-invariant
    se = agg1.source_evidence
    assert se.sec_filing_count == 1                          # max (NOT sum=1)
    assert se.news_count == 3                                # max (NOT sum=5)
    assert se.has_primary_source is True                     # OR
    assert se.best_tier == 1                                 # min (best)
    assert se.qualified_source_count == 2                    # max (overlap-safe, not summed)
    assert se.counts_are_lower_bounds is True                # aggregate → not exact
    # internal consistency: total >= sum of disjoint kind lower bounds
    assert se.evidence_count >= (se.sec_filing_count + se.transcript_count
                                 + se.ir_release_count + se.news_count)


def test_aggregate_source_evidence_count_internally_consistent_disjoint_kinds():
    from app.materiality import SourceEvidence
    # disjoint kinds across contributors: sec=5 from one, news=6 from another.
    a = _asmt(eid="a", source_evidence=SourceEvidence(
        sec_filing_count=5, news_count=0, evidence_count=5, has_primary_source=True))
    b = _asmt(eid="b", source_evidence=SourceEvidence(
        sec_filing_count=0, news_count=6, evidence_count=6))
    agg = aggregate([a, b])
    se = agg.source_evidence
    assert (se.sec_filing_count, se.news_count) == (5, 6)    # max per kind
    # disjoint kinds ⇒ total is at least 5 + 6 = 11, never the impossible max()=6
    assert se.evidence_count >= 11
    assert se.evidence_count == (se.sec_filing_count + se.transcript_count
                                 + se.ir_release_count + se.news_count)
    assert se.counts_are_lower_bounds is True
    assert aggregate([a, b]) == aggregate([b, a])            # permutation-invariant


def test_aggregate_source_evidence_overlapping_same_kind_uses_max():
    from app.materiality import SourceEvidence
    a = _asmt(eid="a", source_evidence=SourceEvidence(news_count=3, evidence_count=3))
    b = _asmt(eid="b", source_evidence=SourceEvidence(news_count=4, evidence_count=4))
    se = aggregate([a, b]).source_evidence
    assert se.news_count == 4                                # max (may overlap; never sum=7)
    assert se.evidence_count == 4                            # max(4, kind_sum=4)


def test_aggregate_source_evidence_missing_on_one_contributor():
    from app.materiality import SourceEvidence
    a = _asmt(eid="a", source_evidence=SourceEvidence(sec_filing_count=2, evidence_count=2,
                                                      has_primary_source=True))
    b = _asmt(eid="b", source_evidence=None)
    se = aggregate([a, b]).source_evidence
    assert se is not None and se.sec_filing_count == 2 and se.has_primary_source is True


def test_single_event_source_counts_are_exact_not_lower_bounds():
    se = assess(_event(evidence=[_ev("sec_filing"), _ev("news"), _ev("news")])).source_evidence
    assert se.counts_are_lower_bounds is False               # single event → exact
    assert se.evidence_count == 3
    # exact: the four disjoint kind counts sum to the total
    assert (se.sec_filing_count + se.transcript_count
            + se.ir_release_count + se.news_count) == se.evidence_count


def test_aggregate_unthemed_all_observed_and_unthemed():
    from app.materiality import BreadthEvidence
    a = _asmt(eid="a", breadth_evidence=BreadthEvidence(unthemed=True))
    b = _asmt(eid="b", breadth_evidence=BreadthEvidence(unthemed=True))
    be = aggregate([a, b]).breadth_evidence
    assert be.unthemed is True and be.unthemed_known is True


def test_aggregate_unthemed_false_when_one_themed():
    from app.materiality import BreadthEvidence
    a = _asmt(eid="a", breadth_evidence=BreadthEvidence(unthemed=True))
    b = _asmt(eid="b", breadth_evidence=BreadthEvidence(unthemed=False))
    be = aggregate([a, b]).breadth_evidence
    assert be.unthemed is False and be.unthemed_known is True   # observed themed → known


def test_aggregate_unthemed_unknown_when_observation_missing():
    from app.materiality import BreadthEvidence
    a = _asmt(eid="a", breadth_evidence=BreadthEvidence(unthemed=True))
    b = _asmt(eid="b", breadth_evidence=None)                # theme status unobserved
    be = aggregate([a, b]).breadth_evidence
    assert be.unthemed is False                             # never asserted on incomplete info
    assert be.unthemed_known is False                       # UNKNOWN, not "all unthemed"
    assert aggregate([a, b]) == aggregate([b, a])           # permutation-invariant


def test_aggregate_all_breadth_missing_stays_none():
    agg = aggregate([_asmt(eid="a"), _asmt(eid="b")])
    assert agg.breadth_evidence is None


# ── Blocker 1: nested breadth UNKNOWN must not decay into known-themed ─────────

def test_nested_breadth_unknown_stays_unknown():
    from app.materiality import BreadthEvidence
    unknown = aggregate([
        _asmt(eid="a", breadth_evidence=BreadthEvidence(unthemed=True)),   # known-unthemed
        _asmt(eid="b"),                                                     # breadth unobserved
    ]).breadth_evidence
    assert unknown.unthemed is False and unknown.unthemed_known is False    # UNKNOWN
    # feed the UNKNOWN aggregate back in — must stay UNKNOWN, never "themed"
    outer = aggregate([_asmt(eid="x", breadth_evidence=unknown)]).breadth_evidence
    assert outer.unthemed is False and outer.unthemed_known is False


def test_unknown_plus_known_unthemed_stays_unknown():
    from app.materiality import BreadthEvidence
    unknown = BreadthEvidence(unthemed=False, unthemed_known=False)
    known_unthemed = BreadthEvidence(unthemed=True, unthemed_known=True)
    a = _asmt(eid="a", breadth_evidence=unknown)
    b = _asmt(eid="b", breadth_evidence=known_unthemed)
    be1, be2 = aggregate([a, b]).breadth_evidence, aggregate([b, a]).breadth_evidence
    assert be1 == be2
    assert be1.unthemed is False and be1.unthemed_known is False


def test_unknown_plus_known_themed_is_known_themed():
    from app.materiality import BreadthEvidence
    unknown = BreadthEvidence(unthemed=False, unthemed_known=False)
    known_themed = BreadthEvidence(unthemed=False, unthemed_known=True)
    be = aggregate([_asmt(eid="a", breadth_evidence=unknown),
                    _asmt(eid="b", breadth_evidence=known_themed)]).breadth_evidence
    assert be.unthemed is False and be.unthemed_known is True   # a known-themed member ⇒ known


# ── Blocker 2: exact vs lower-bound source counts (single complete stays exact) ─

def _se(**kw):
    from app.materiality import SourceEvidence
    base = dict(observation_complete=True, has_primary_source_known=True, best_tier_known=True)
    base.update(kw)
    return SourceEvidence(**base)


def test_aggregate_one_exact_source_stays_exact():
    exact = _se(news_count=2, evidence_count=2, counts_are_lower_bounds=False)
    agg = aggregate([_asmt(eid="a", source_evidence=exact)])
    assert agg.source_evidence.counts_are_lower_bounds is False   # single complete exact → exact


def test_aggregate_one_lower_bound_source_stays_lower_bound():
    lb = _se(news_count=2, evidence_count=2, counts_are_lower_bounds=True)
    agg = aggregate([_asmt(eid="a", source_evidence=lb)])
    assert agg.source_evidence.counts_are_lower_bounds is True


def test_aggregate_multiple_exact_sources_become_lower_bound():
    e = _se(news_count=1, evidence_count=1, counts_are_lower_bounds=False)
    agg = aggregate([_asmt(eid="a", source_evidence=e), _asmt(eid="b", source_evidence=e)])
    assert agg.source_evidence.counts_are_lower_bounds is True


def test_aggregate_exact_plus_missing_source_becomes_lower_bound():
    e = _se(news_count=1, evidence_count=1, counts_are_lower_bounds=False)
    agg = aggregate([_asmt(eid="a", source_evidence=e), _asmt(eid="b", source_evidence=None)])
    assert agg.source_evidence.counts_are_lower_bounds is True
    assert agg.source_evidence.observation_complete is False


def test_nested_lower_bound_source_stays_lower_bound():
    e = _se(news_count=1, evidence_count=1, counts_are_lower_bounds=False)
    inner = aggregate([_asmt(eid="a", source_evidence=e), _asmt(eid="b", source_evidence=e)])
    assert inner.source_evidence.counts_are_lower_bounds is True
    outer = aggregate([_asmt(eid="x", source_evidence=inner.source_evidence)])
    assert outer.source_evidence.counts_are_lower_bounds is True   # incomplete/lower-bound propagates


# ── Blocker 3: source completeness / known-state ──────────────────────────────

def test_single_event_news_only_primary_status_is_known():
    se = assess(_event(evidence=[_ev("news"), _ev("news")])).source_evidence
    assert se.has_primary_source is False
    assert se.has_primary_source_known is True     # complete evidence: judged, none primary
    assert se.best_tier_known is True


def test_single_event_no_evidence_primary_status_unknown():
    se = assess(_event(evidence=[])).source_evidence
    assert se.has_primary_source is False
    assert se.has_primary_source_known is False    # no evidence → cannot know
    assert se.best_tier_known is False
    assert se.observation_complete is True         # complete for the (empty) recorded set


def test_aggregate_news_only_plus_missing_primary_unknown():
    se_news = assess(_event(evidence=[_ev("news")])).source_evidence
    agg = aggregate([_asmt(eid="a", source_evidence=se_news), _asmt(eid="b", source_evidence=None)])
    se = agg.source_evidence
    assert se.has_primary_source is False
    assert se.has_primary_source_known is False     # incomplete → cannot claim "no primary"
    assert se.observation_complete is False


def test_aggregate_primary_plus_missing_is_known():
    se_prim = assess(_event(evidence=[_ev("sec_filing")])).source_evidence
    agg = aggregate([_asmt(eid="a", source_evidence=se_prim), _asmt(eid="b", source_evidence=None)])
    se = agg.source_evidence
    assert se.has_primary_source is True and se.has_primary_source_known is True   # found one → known


def test_aggregate_best_tier_known_only_when_complete():
    se1 = assess(_event(evidence=[_ev("news", tier=2)])).source_evidence
    assert aggregate([_asmt(eid="a", source_evidence=se1)]).source_evidence.best_tier_known is True
    incomplete = aggregate([_asmt(eid="a", source_evidence=se1), _asmt(eid="b", source_evidence=None)])
    assert incomplete.source_evidence.best_tier_known is False


def test_nested_incomplete_source_propagates():
    se_news = assess(_event(evidence=[_ev("news")])).source_evidence
    inner = aggregate([_asmt(eid="a", source_evidence=se_news), _asmt(eid="b", source_evidence=None)])
    assert inner.source_evidence.observation_complete is False
    outer = aggregate([_asmt(eid="x", source_evidence=inner.source_evidence)]).source_evidence
    assert outer.observation_complete is False and outer.has_primary_source_known is False


def test_nested_uncertainty_permutation_invariant():
    from app.materiality import BreadthEvidence
    xs = [
        _asmt(eid="a", state=MaterialityState.UNIVERSAL,
              source_evidence=_se(sec_filing_count=2, has_primary_source=True, evidence_count=2),
              breadth_evidence=BreadthEvidence(unthemed=False, unthemed_known=False)),   # UNKNOWN
        _asmt(eid="b", source_evidence=None,
              breadth_evidence=BreadthEvidence(unthemed=True, unthemed_known=True)),
        _asmt(eid="c", source_evidence=_se(news_count=3, evidence_count=3),
              breadth_evidence=None),
    ]
    results = [aggregate(list(p)) for p in itertools.permutations(xs)]
    first = results[0]
    for r in results[1:]:
        assert r == first                          # complete equality incl. known/complete flags


def test_aggregate_breadth_max_not_sum():
    from app.materiality import BreadthEvidence
    a = _asmt(eid="a", breadth_evidence=BreadthEvidence(
        company_count=8, company_capped=True, industry_count=3, unthemed=False))
    b = _asmt(eid="b", breadth_evidence=BreadthEvidence(
        company_count=2, company_capped=False, industry_count=6, industry_capped=True, unthemed=True))
    agg1, agg2 = aggregate([a, b]), aggregate([b, a])
    assert agg1 == agg2
    be = agg1.breadth_evidence
    assert be.company_count == 8                             # max lower bound (NOT sum=10)
    assert be.industry_count == 6                            # max
    assert be.company_capped is True and be.industry_capped is True   # OR
    assert be.unthemed is False                              # all() — one contributor is themed


def test_aggregate_none_evidence_stays_none():
    agg = aggregate([_asmt(eid="a"), _asmt(eid="b")])
    assert agg.source_evidence is None and agg.breadth_evidence is None


def test_aggregate_with_new_evidence_permutation_invariant():
    from app.materiality import BreadthEvidence, SourceEvidence
    xs = [
        _asmt(eid="a", state=MaterialityState.UNIVERSAL,
              source_evidence=SourceEvidence(sec_filing_count=2, has_primary_source=True, best_tier=1),
              breadth_evidence=BreadthEvidence(company_count=8, company_capped=True, unthemed=False)),
        _asmt(eid="b", source_evidence=SourceEvidence(news_count=5, best_tier=2),
              breadth_evidence=BreadthEvidence(company_count=1, unthemed=True)),
        _asmt(eid="c", state=MaterialityState.NOT_UNIVERSAL),
    ]
    results = [aggregate(list(p)) for p in itertools.permutations(xs)]
    first = results[0]
    for r in results[1:]:
        assert r == first                                    # complete equality incl. new fields


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
    assert b"FigureEvidence" not in blob            # N2.1: typed figures never persist
    assert b"FigureFact" not in blob
    assert b"figure_evidence" not in blob
    assert b"FigureDiagnostics" not in blob         # N2.3: diagnostics never persist
    for e in feed.events:
        assert not hasattr(e, "materiality")
        assert not hasattr(e, "figure_evidence")


def test_real_below_floor_figure_appears_only_in_pre_admission(fresh_identity, monkeypatch, caplog):
    """N2.3 population scope: a qualified, figure-bearing, below-ADMISSION_FLOOR
    candidate is present in pre_admission but genuinely excluded from admitted by
    _admit. Its figure must show in the pre_admission diagnostics and be ABSENT
    from the admitted diagnostics — proving the populations are summarized
    independently, not concatenated."""
    import logging
    from datetime import datetime as _dt
    from datetime import timezone as _tz

    import app.background as bg
    import app.feeds as feeds_mod
    import app.observation_ledger as obs
    import app.summarizer as summ

    now = _dt.now(_tz.utc)
    # recent → admitted; carries a MONEY figure.
    strong = FeedItem(title="Fed unveils a $5B liquidity facility", url="https://t/live-s",
                      source="Bloomberg Markets", category="Markets",
                      published_dt=now - timedelta(minutes=20), snippet="wire")
    # 200h old → below the admission floor; carries a BASIS-POINTS figure (a kind
    # the admitted event does NOT have, so the two populations are distinguishable).
    aged = FeedItem(title="ECB signals a 250 basis point tightening path", url="https://t/live-a",
                    source="Bloomberg Markets", category="Markets",
                    published_dt=now - timedelta(hours=200), snippet="wire")

    monkeypatch.setattr(settings, "materiality_mode", "shadow")
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
        feed = bg.run_pipeline(categories="", sources="")

    titles = {e.title for e in feed.events}
    assert "Fed unveils a $5B liquidity facility" in titles            # admitted
    assert "ECB signals a 250 basis point tightening path" not in titles   # _admit excluded it
    # both qualified candidates are observed pre-admission; only one is admitted
    assert "pre_admission_qualified=2" in caplog.text
    assert "admitted=1" in caplog.text
    # the below-floor candidate's basis-points figure is in the pre_admission
    # population but NOT in the admitted population.
    assert "pre_admission_basis_points=1" in caplog.text
    assert "admitted_basis_points=0" in caplog.text
    # the admitted event's money figure is in the admitted population.
    assert "admitted_money=1" in caplog.text
    assert "pre_admission_total=2" in caplog.text
    assert "admitted_total=1" in caplog.text


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
                          b"SourceEvidence", b"BreadthEvidence",
                          b"FigureEvidence", b"FigureFact", b"figure_evidence",
                          b"FigureDiagnostics",
                          b"shadow_sink", b"app.materiality"):
            assert forbidden not in data


# ══════════════════════════════════════════════════════════════════════════════
# Wave 0.2b (N1): isolated typed-figure parser / dataclass tests.
#
# These exercise build_figure_evidence() and the FigureFact / FigureEvidence
# dataclasses ONLY. N1 wires nothing into assess()/aggregate()/observe()/the
# pipeline, so there are deliberately NO integration tests here (those belong to
# N2/N4). Every assertion is about what headline syntax alone proves: exact
# distinct-normalized-value counts and occurrence LOWER BOUNDS — never a
# distinct-semantic-fact claim.
# ══════════════════════════════════════════════════════════════════════════════

def _only(ev, kind):
    return [f for f in ev.distinct_figures if f.kind == kind]


# ── Supported forms + equivalent normalization ────────────────────────────────

@pytest.mark.parametrize("text,cents", [
    ("Acme agrees $5 billion deal", 5 * 10**9 * 100),
    ("Acme agrees $5B deal", 5 * 10**9 * 100),
    ("Acme agrees $3.5bn deal", 3_500_000_000 * 100),
    ("Acme agrees $500 million deal", 500 * 10**6 * 100),
    ("Acme agrees $500M deal", 500 * 10**6 * 100),
    ("Buyback of $1,200,000 announced", 1_200_000 * 100),
])
def test_money_forms_normalize_to_cents(text, cents):
    ev = build_figure_evidence([text])
    money = _only(ev, "money")
    assert len(money) == 1
    assert money[0].value_minor == cents
    assert money[0].currency == "USD"
    assert ev.has_money and ev.distinct_money_values == 1


def test_money_scale_word_equivalence():
    # "$5 billion" and "$5B" are the SAME normalized value -> one distinct key.
    ev = build_figure_evidence(["$5 billion buyout", "$5B buyout"])
    money = _only(ev, "money")
    assert len(money) == 1
    assert money[0].value_minor == 5 * 10**9 * 100
    assert money[0].max_occurrences_per_title == 1     # one per title, not inflated
    assert ev.mention_count == 2


@pytest.mark.parametrize("text,bps", [
    ("Shares rose 8%", 800),
    ("Margin up 12.5%", 1250),
    ("Rate cut of 0.25%", 25),
])
def test_percentage_forms_normalize_to_bps(text, bps):
    ev = build_figure_evidence([text])
    pct = _only(ev, "percentage")
    assert len(pct) == 1
    assert pct[0].value_minor == bps
    assert pct[0].currency is None
    assert ev.has_percentage and ev.distinct_percentage_values == 1


@pytest.mark.parametrize("text,bps", [
    ("Fed hikes 50 basis points", 50),
    ("Fed hikes 25bps", 25),
    ("Fed hikes 75 bp", 75),
])
def test_basis_points_forms_normalize_to_bps(text, bps):
    ev = build_figure_evidence([text])
    b = _only(ev, "basis_points")
    assert len(b) == 1
    assert b[0].value_minor == bps
    assert b[0].currency is None
    assert ev.has_basis_points and ev.distinct_basis_points_values == 1


@pytest.mark.parametrize("text,cents", [
    ("Dividend of $1.25 per share", 125),
    ("Dividend of $2.10 a share", 210),
    ("Dividend of $1.25/share", 125),
])
def test_per_share_forms_normalize_and_not_double_counted_as_money(text, cents):
    ev = build_figure_evidence([text])
    ps = _only(ev, "per_share")
    assert len(ps) == 1
    assert ps[0].value_minor == cents
    assert ps[0].currency == "USD"
    # the underlying `$` amount must NOT also register as a bare money figure
    assert _only(ev, "money") == []
    assert ev.distinct_per_share_values == 1


# ── Exclusion-on-ambiguity (each hazard from the plan's §D) ───────────────────

@pytest.mark.parametrize("text", [
    "$AAPL upgraded to buy",          # ticker: $ + letters
    "$NVDA hits record",
    "Q4 2025 results due",            # quarter + year
    "FY2025 guidance raised",         # fiscal-year label
    "Outlook for 2026 improves",      # bare year
    "Files 10-K with the SEC",        # filing codes
    "Files 8-K and 20-F",
    "S-1 registration filed",
    "Reports under Item 5.02",        # SEC item code
    "S&P 500 closes higher",          # index labels
    "Russell 2000 rebounds",
    "10-year yield steady",           # tenor label (no % here)
    "10Y note in focus",
    "eur/usd drifts lower",           # FX pair
    "Open 24/7 this quarter",         # slash form
    "Rollover your 401(k) now",       # retirement-plan code
    "About 500 workers affected",     # bare unit-less number
])
def test_excluded_forms_produce_no_figures(text):
    ev = build_figure_evidence([text])
    assert ev.distinct_figures == ()
    assert ev.mention_count == 0
    assert not (ev.has_money or ev.has_percentage
                or ev.has_basis_points or ev.has_per_share)


def test_tenor_label_excluded_but_adjacent_percentage_kept():
    # "10-year" is a tenor label (excluded); the 4.5% beside it is a real figure.
    ev = build_figure_evidence(["Treasury 10-year yield rose to 4.5%"])
    assert _only(ev, "money") == []
    pct = _only(ev, "percentage")
    assert len(pct) == 1 and pct[0].value_minor == 450


# ── Repetition semantics (max_occurrences_per_title; NO semantic-fact claim) ──

def test_repeated_same_key_in_one_title_counts_occurrences_not_distinct_facts():
    # Two $5B occurrences in ONE headline: one distinct normalized value, an
    # occurrence lower bound of 2 — NOT a claim of two distinct semantic facts.
    ev = build_figure_evidence(["Acme reports $5B revenue and $5B buyback"])
    money = _only(ev, "money")
    assert len(money) == 1                                  # one distinct normalized VALUE
    assert money[0].max_occurrences_per_title == 2          # provable textual repetition only
    assert ev.distinct_money_values == 1                    # exact distinct-value count
    assert ev.money_occurrence_lower_bound == 2             # occurrence LOWER BOUND
    assert ev.mention_count == 2


def test_repeated_percentage_in_one_title_same_fact_restated():
    # "Shares fell 8%, an 8% decline" is ONE fact restated: the contract must
    # NOT overclaim two facts — only repeated occurrence.
    ev = build_figure_evidence(["Shares fell 8%, an 8% decline"])
    pct = _only(ev, "percentage")
    assert len(pct) == 1
    assert pct[0].max_occurrences_per_title == 2
    assert ev.distinct_percentage_values == 1
    assert ev.percentage_occurrence_lower_bound == 2


def test_repeated_same_key_across_titles_does_not_inflate():
    # Cross-title re-reports of the SAME figure: occurrence lower bound stays 1
    # (max, not sum); mention_count is the raw duplicate-prone tally.
    ev = build_figure_evidence([
        "Acme to buy Beta for $500M",
        "Acme $500M acquisition of Beta",
        "$500M deal: Acme buys Beta",
    ])
    money = _only(ev, "money")
    assert len(money) == 1
    assert money[0].max_occurrences_per_title == 1
    assert ev.distinct_money_values == 1
    assert ev.money_occurrence_lower_bound == 1
    assert ev.mention_count == 3                            # raw diagnostic tally


def test_cross_title_max_takes_larger_repetition():
    ev = build_figure_evidence([
        "$5B buyback",                         # 1 occurrence
        "$5B revenue and $5B buyback",         # 2 occurrences in one title
    ])
    money = _only(ev, "money")
    assert len(money) == 1
    assert money[0].max_occurrences_per_title == 2          # max across titles
    assert ev.money_occurrence_lower_bound == 2
    assert ev.mention_count == 3


# ── Deterministic ordering & multi-kind mix ───────────────────────────────────

def test_distinct_figures_deterministic_sorted_order():
    text = "Acme: $5B revenue, up 8%, dividend $1.25 per share, hike 50 bps"
    ev1 = build_figure_evidence([text])
    ev2 = build_figure_evidence([text])
    assert ev1.distinct_figures == ev2.distinct_figures     # determinism
    kinds = [f.kind for f in ev1.distinct_figures]
    # sorted by (kind, value_minor, currency): alphabetical kind order
    assert kinds == ["basis_points", "money", "per_share", "percentage"]
    assert ev1.distinct_money_values == 1
    assert ev1.distinct_percentage_values == 1
    assert ev1.distinct_basis_points_values == 1
    assert ev1.distinct_per_share_values == 1


def test_max_magnitude_diagnostics():
    ev = build_figure_evidence(["$1B here, $5B there, up 3% and 8%"])
    assert ev.max_money_minor == 5 * 10**9 * 100
    assert ev.max_percentage_bps == 800
    assert ev.distinct_money_values == 2
    assert ev.distinct_percentage_values == 2


# ── Integer-exactness boundary acceptance / just-beyond rejection ─────────────

def test_money_boundary_accepted_exactly_at_ceiling():
    ev = build_figure_evidence(["A $100 trillion notional"])
    money = _only(ev, "money")
    assert len(money) == 1
    assert money[0].value_minor == MAX_MONEY_MINOR          # $100T cents == ceiling
    assert not ev.truncated


def test_money_just_beyond_ceiling_excluded_and_flagged():
    ev = build_figure_evidence(["A $101 trillion notional"])
    assert _only(ev, "money") == []
    assert ev.truncated                                     # excluded, not rounded


def test_percentage_boundary_accepted_exactly_at_ceiling():
    ev = build_figure_evidence(["An extreme 10000% move"])
    pct = _only(ev, "percentage")
    assert len(pct) == 1
    assert pct[0].value_minor == MAX_PERCENTAGE_BPS
    assert not ev.truncated


def test_percentage_just_beyond_ceiling_excluded_and_flagged():
    ev = build_figure_evidence(["An impossible 10001% move"])
    assert _only(ev, "percentage") == []
    assert ev.truncated


@pytest.mark.parametrize("text", [
    "Rate moved 0.005%",      # half a basis point — not exactly representable
    "Margin of 4.567%",       # finer than 1 bp
])
def test_inexact_precision_excluded_and_flagged(text):
    ev = build_figure_evidence([text])
    assert _only(ev, "percentage") == []
    assert ev.truncated


def test_percentage_one_bp_precision_accepted():
    ev = build_figure_evidence(["A 0.01% tweak"])
    pct = _only(ev, "percentage")
    assert len(pct) == 1 and pct[0].value_minor == 1       # exactly 1 bp
    assert not ev.truncated


def test_ambiguous_thousands_grouping_excluded():
    ev = build_figure_evidence(["Odd figure $12,34 reported"])
    assert _only(ev, "money") == []
    assert ev.truncated


def test_too_many_significant_digits_excluded():
    ev = build_figure_evidence(["$12345678901234567 balance"])   # 17 digits > 15
    assert _only(ev, "money") == []
    assert ev.truncated


# ── Distinct-key cap / truncation ─────────────────────────────────────────────

def test_distinct_key_cap_truncates_deterministically():
    parts = [f"${n}M item" for n in range(1, MAX_FIGURE_KEYS + 5)]  # > cap distinct values
    ev = build_figure_evidence([" ".join(parts)])
    assert len(ev.distinct_figures) == MAX_FIGURE_KEYS
    assert ev.truncated
    assert not ev.figures_complete             # dropped keys ⇒ not lossless
    # deterministic LEXICOGRAPHIC truncation: the smallest MAX_FIGURE_KEYS survive
    kept = [f.value_minor for f in ev.distinct_figures]
    assert kept == sorted(kept)
    assert kept[0] == 1 * 10**6 * 100


@pytest.mark.parametrize("text", [
    "A $101 trillion notional",   # bound exclusion
    "Margin of 4.567%",           # precision exclusion
    "Odd figure $12,34 reported",  # ambiguous grouping
    "$12345678901234567 balance",  # too many significant digits
])
def test_truncated_always_implies_incomplete(text):
    # truncated=True and figures_complete=True must never co-occur.
    ev = build_figure_evidence([text])
    assert ev.truncated
    assert not ev.figures_complete


def test_clean_parse_is_complete():
    ev = build_figure_evidence(["Acme buys Beta for $5B, up 8%"])
    assert not ev.truncated
    assert ev.figures_complete


def test_equivalent_money_forms_produce_identical_figurefact():
    # $5, $5.00, $5.000 are the SAME normalized value → identical FigureFact.
    expected = FigureFact(kind="money", value_minor=500, currency="USD",
                          max_occurrences_per_title=1)
    for text in ("Deal worth $5 total", "Deal worth $5.00 total",
                 "Deal worth $5.000 total"):
        ev = build_figure_evidence([text])
        money = _only(ev, "money")
        assert len(money) == 1
        assert money[0] == expected
    # and together in one title they collapse to one distinct key, occurrence 3
    ev = build_figure_evidence(["Priced at $5, or $5.00, or $5.000"])
    money = _only(ev, "money")
    assert len(money) == 1
    assert money[0].value_minor == 500
    assert money[0].max_occurrences_per_title == 3
    assert ev.distinct_money_values == 1
    assert ev.money_occurrence_lower_bound == 3


# ── Empty / whitespace inputs ─────────────────────────────────────────────────

def test_empty_and_none_titles_yield_empty_evidence():
    ev = build_figure_evidence(["", None, "   plain headline, no figures  "])
    assert ev.distinct_figures == ()
    assert ev.mention_count == 0
    assert not ev.truncated
    assert ev.figures_complete


# ── Dataclass hygiene (frozen, capture-only shape) ────────────────────────────

def test_figure_dataclasses_are_frozen():
    f = FigureFact(kind="money", value_minor=100, currency="USD")
    with pytest.raises(dataclasses.FrozenInstanceError):
        f.value_minor = 200                                # type: ignore[misc]
    ev = FigureEvidence()
    with pytest.raises(dataclasses.FrozenInstanceError):
        ev.truncated = True                                # type: ignore[misc]


def test_n21_assessment_carries_figure_evidence():
    # N2.1 wires figure_evidence onto the assessment (capture-only diagnostic).
    a = assess(_event())
    assert hasattr(a, "figure_evidence")
    assert a.figure_evidence is None or isinstance(a.figure_evidence, FigureEvidence)


# ══════════════════════════════════════════════════════════════════════════════
# Wave 0.2b (N1) parser-correction regressions: boundary-safe scan cap, complete
# numeric-token validation, signed/unsupported-suffix rejection. All exercise
# build_figure_evidence() in isolation.
# ══════════════════════════════════════════════════════════════════════════════

# ── Blocker 1: boundary-safe title-scan truncation ────────────────────────────

def test_complete_figure_entirely_after_scan_boundary_is_lost_and_incomplete():
    # "$5B" sits well past the 512-char boundary → it must NOT appear, and the
    # parse must be marked incomplete.
    title = ("filler " * 100) + "$5B acquisition"     # 700 chars before the figure
    assert len(title) > MAX_TITLE_SCAN_CHARS
    ev = build_figure_evidence([title])
    assert ev.distinct_figures == ()
    assert ev.truncated and not ev.figures_complete


def test_money_fragment_at_boundary_never_emitted_as_shorter_figure():
    # Boundary falls inside "$5 billion"; the retained tail "$5" must be DROPPED,
    # never emitted as a bare $5 (the "$5B becomes $5" defect).
    title = ("z " * 254) + "$5 billion mega deal " + ("z " * 300)
    ev = build_figure_evidence([title])
    assert ev.distinct_figures == ()                  # neither "$5" nor "$5 billion" survives
    assert ev.truncated and not ev.figures_complete


def test_percentage_token_straddling_boundary_not_emitted():
    # "45%" starts before the 512 boundary and extends past it → discarded whole.
    title = ("z " * 255) + "45%"
    ev = build_figure_evidence([title])
    assert ev.distinct_figures == ()
    assert ev.truncated and not ev.figures_complete


def test_basis_point_token_straddling_boundary_not_emitted():
    title = ("z " * 255) + "50bps"
    ev = build_figure_evidence([title])
    assert ev.distinct_figures == ()
    assert ev.truncated and not ev.figures_complete


def test_safe_side_figure_retained_but_parse_marked_incomplete():
    # A complete figure on the safe side of the boundary is kept, yet the over-cap
    # title is still incomplete.
    title = "$5B " + ("z " * 300)
    assert len(title) > MAX_TITLE_SCAN_CHARS
    ev = build_figure_evidence([title])
    money = _only(ev, "money")
    assert len(money) == 1 and money[0].value_minor == 5 * 10**9 * 100
    assert ev.truncated and not ev.figures_complete   # over cap ⇒ incomplete


def test_over_cap_figure_free_title_is_incomplete():
    title = "plain headline words " * 40               # > cap, no figures at all
    assert len(title) > MAX_TITLE_SCAN_CHARS
    ev = build_figure_evidence([title])
    assert ev.distinct_figures == ()
    assert ev.truncated and not ev.figures_complete


def test_title_exactly_at_cap_with_leading_figure_is_complete():
    title = "$5B " + ("z" * (MAX_TITLE_SCAN_CHARS - 4))
    assert len(title) == MAX_TITLE_SCAN_CHARS
    ev = build_figure_evidence([title])
    money = _only(ev, "money")
    assert len(money) == 1 and money[0].value_minor == 5 * 10**9 * 100
    assert not ev.truncated and ev.figures_complete


# ── Blocker 2: complete numeric-token validation (no backtracking to a prefix) ─

@pytest.mark.parametrize("title", [
    "Odd $5,, here",          # doubled punctuation
    "Weird $5,B thing",       # comma glued to a scale letter → NOT $5 billion
    "Priced $5.00.1 today",   # malformed decimal continuation
    "Bad $12,34 grouping",    # malformed internal grouping
    "Broken $5.5.5 value",    # double decimal
])
def test_malformed_money_tokens_rejected_whole(title):
    ev = build_figure_evidence([title])
    assert _only(ev, "money") == []
    assert ev.truncated and not ev.figures_complete


def test_malformed_percentage_continuation_rejected_whole():
    # "5.00.1%" must NOT shrink to "0.1%" — the whole candidate is rejected.
    ev = build_figure_evidence(["Margin of 5.00.1% reported"])
    assert _only(ev, "percentage") == []
    assert ev.truncated and not ev.figures_complete


@pytest.mark.parametrize("title,cents", [
    ("Deal worth $5, and more upside", 500),     # trailing comma is punctuation
    ("Priced at $5. Then rallied", 500),          # trailing period is punctuation
    ("A clean $5,000 grant", 500000),             # valid grouping
])
def test_valid_money_with_ordinary_punctuation_parses(title, cents):
    ev = build_figure_evidence([title])
    money = _only(ev, "money")
    assert len(money) == 1 and money[0].value_minor == cents
    assert not ev.truncated and ev.figures_complete


# ── Blocker 3: signed values and unsupported scale/unit continuations ──────────

@pytest.mark.parametrize("title", [
    "Shares moved -5% today",
    "Shares moved +5% today",
    "Cut of -25 bps announced",
    "Hike of +25 bp announced",
    "A loss of -$5 per unit",
])
def test_signed_candidates_rejected_not_made_positive(title):
    ev = build_figure_evidence([title])
    assert ev.distinct_figures == ()
    assert ev.truncated and not ev.figures_complete


@pytest.mark.parametrize("title", [
    "Grant of $5 thousand awarded",
    "Grant of $5k awarded",
    "A $5 quadrillion fantasy",
    "A $5quintillion fantasy",
])
def test_unsupported_scale_rejected_not_downgraded_to_plain_dollars(title):
    ev = build_figure_evidence([title])
    assert _only(ev, "money") == []           # must NOT fall back to a bare $5
    assert ev.truncated and not ev.figures_complete


@pytest.mark.parametrize("title,cents", [
    ("A $5 deal was struck", 500),            # prose word after → plain $5
    ("Gain of $5 in value", 500),
    ("A $5 million round", 5 * 10**6 * 100),  # supported spaced scale still works
])
def test_plain_dollars_and_supported_scale_still_parse(title, cents):
    ev = build_figure_evidence([title])
    money = _only(ev, "money")
    assert len(money) == 1 and money[0].value_minor == cents
    assert not ev.truncated and ev.figures_complete


# ══════════════════════════════════════════════════════════════════════════════
# Wave 0.2b (N1) scale-terminator regressions: a recognized money scale token
# must be followed by a valid terminator, else the whole candidate is rejected —
# never accepted as the recognized prefix.
# ══════════════════════════════════════════════════════════════════════════════

@pytest.mark.parametrize("title", [
    "Deal $5B2 announced",        # digit after scale
    "Deal $5B_foo announced",     # underscore/identifier continuation
    "Deal $5B.5 announced",       # decimal continuation after scale
    "Deal $5 million2 announced",  # digit after spaced scale
])
def test_scale_with_invalid_terminator_rejected_whole(title):
    ev = build_figure_evidence([title])
    assert _only(ev, "money") == []           # must NOT accept the "$5B"/"$5 million" prefix
    assert ev.truncated and not ev.figures_complete


@pytest.mark.parametrize("title,cents", [
    ("A $5B deal", 5 * 10**9 * 100),                       # end-adjacent / whitespace
    ("A $5B, per the filing", 5 * 10**9 * 100),            # comma terminator
    ("A $5B. Then it rallied", 5 * 10**9 * 100),           # period terminator
    ("A ($5B) buyout", 5 * 10**9 * 100),                   # close-paren terminator
    ("A $5B acquisition", 5 * 10**9 * 100),                # whitespace + word
    ("A $5 million round", 5 * 10**6 * 100),               # spaced scale
    ("A $5 million, according to the filing", 5 * 10**6 * 100),  # spaced scale + comma
])
def test_scale_with_valid_terminator_parses(title, cents):
    ev = build_figure_evidence([title])
    money = _only(ev, "money")
    assert len(money) == 1 and money[0].value_minor == cents
    assert not ev.truncated and ev.figures_complete


# ══════════════════════════════════════════════════════════════════════════════
# Wave 0.2b (N1) bare-money closing-punctuation regressions. A bare `$` amount
# followed by a stripped trailing '.'/',' must terminate cleanly not only before
# whitespace/end but also before genuine closing punctuation (" ' ) ] }), via the
# SAME shared terminator used for scale tokens. A continuation (letter/digit/
# underscore/decimal) still rejects the whole candidate.
# ══════════════════════════════════════════════════════════════════════════════

@pytest.mark.parametrize("title", [
    'cost "$5," today',        # trailing comma then double-quote
    "cost '$5,' today",        # trailing comma then single-quote
    "(cost $5.)",              # trailing period then close-paren
    "[cost $5,]",              # trailing comma then close-bracket
    "{cost $5.}",              # trailing period then close-brace
    "cost $5, according to the filing",   # trailing comma then whitespace
    "cost $5.",                # trailing period at end of text
])
def test_bare_money_closing_punctuation_accepted(title):
    ev = build_figure_evidence([title])
    money = _only(ev, "money")
    assert len(money) == 1
    assert money[0].value_minor == 500          # exactly one $5 fact
    assert not ev.truncated and ev.figures_complete


@pytest.mark.parametrize("title", [
    "cost $5,B here",          # letter continuation after separator
    "cost $5,_foo here",       # underscore continuation
    "cost $5,2 here",          # digit / grouping continuation
    "cost $5.. here",          # doubled separator
    "cost $5.)2 here",         # closing punct then digit continuation
])
def test_bare_money_malformed_continuation_rejected(title):
    ev = build_figure_evidence([title])
    assert _only(ev, "money") == []             # no false "$5" prefix
    assert ev.truncated and not ev.figures_complete


# ══════════════════════════════════════════════════════════════════════════════
# Wave 0.2b (N1) ordinary terminal-punctuation regressions. The shared terminator
# accepts ; : ! ? as token terminators (like . ,) — but only when they actually
# end the token, never when an alphanumeric/underscore continuation follows.
# ══════════════════════════════════════════════════════════════════════════════

@pytest.mark.parametrize("title,cents", [
    ("cost $5; then rallied", 500),
    ("cost $5: the stated price", 500),
    ("shares at $5!", 500),
    ("shares at $5?", 500),
    ('a "cost $5!" note', 500),               # terminal punct then closing quote
    ("(cost $5?)", 500),                       # terminal punct then close-paren
])
def test_bare_money_terminal_punctuation_accepted(title, cents):
    ev = build_figure_evidence([title])
    money = _only(ev, "money")
    assert len(money) == 1 and money[0].value_minor == cents
    assert not ev.truncated and ev.figures_complete


@pytest.mark.parametrize("title,cents", [
    ("cost $5B; then rallied", 5 * 10**9 * 100),
    ("cost $5B: the stated value", 5 * 10**9 * 100),
    ("value $5B!", 5 * 10**9 * 100),
    ("value $5B?", 5 * 10**9 * 100),
    ("cost $5 million; according to the filing", 5 * 10**6 * 100),
])
def test_scaled_money_terminal_punctuation_accepted(title, cents):
    ev = build_figure_evidence([title])
    money = _only(ev, "money")
    assert len(money) == 1 and money[0].value_minor == cents
    assert not ev.truncated and ev.figures_complete


@pytest.mark.parametrize("title", [
    "cost $5;foo here",
    "cost $5:bar here",
    "cost $5!2 here",
    "cost $5?abc here",
    "cost $5B;foo here",
    "cost $5B:bar here",
    "cost $5B!2 here",
    "cost $5B?abc here",
])
def test_terminal_punctuation_with_continuation_rejected(title):
    ev = build_figure_evidence([title])
    assert _only(ev, "money") == []             # no false "$5"/"$5B" prefix
    assert ev.truncated and not ev.figures_complete


# ══════════════════════════════════════════════════════════════════════════════
# Wave 0.2b (N1) boundary-continuation regressions. At the scan boundary a
# complete, self-contained figure that ends safely inside the retained prefix is
# PRESERVED; a numeric head is removed only when the FIRST DISCARDED token can
# grammatically complete it. Every over-cap title stays truncated / incomplete.
# ══════════════════════════════════════════════════════════════════════════════

def _figure_ends_before_boundary(figure):
    """Build an over-cap title in which `figure` is the LAST retained token,
    ending immediately before the scan-boundary whitespace, followed by a long
    discarded prose tail."""
    fill_len = MAX_TITLE_SCAN_CHARS - len(figure) - 1     # + figure + one space == cap
    filler = ("z" * (fill_len - 1)) + " "
    title = filler + figure + " " + ("z " * 400)
    assert len(title) > MAX_TITLE_SCAN_CHARS
    return title


def _head_then_discarded_continuation(head, continuation_tail):
    """Build an over-cap title where `head` is the last retained token and
    `continuation_tail` (its first word grammatically continues `head`) begins the
    discarded region."""
    fill_len = MAX_TITLE_SCAN_CHARS - len(head) - 1       # + head + one space == cap
    filler = ("z" * (fill_len - 1)) + " "
    title = filler + head + " " + continuation_tail + " " + ("z " * 400)
    assert len(title) > MAX_TITLE_SCAN_CHARS
    return title


@pytest.mark.parametrize("figure,kind,value", [
    ("$5B", "money", 5 * 10**9 * 100),
    ("$5 million", "money", 5 * 10**6 * 100),
    ("8%", "percentage", 800),
    ("25bps", "basis_points", 25),
    ("25 bp", "basis_points", 25),
    ("$1.25/share", "per_share", 125),
])
def test_complete_figure_before_boundary_is_preserved(figure, kind, value):
    ev = build_figure_evidence([_figure_ends_before_boundary(figure)])
    hits = _only(ev, kind)
    assert len(hits) == 1 and hits[0].value_minor == value   # complete figure survives
    assert ev.truncated and not ev.figures_complete          # but title exceeded the cap


@pytest.mark.parametrize("head,continuation_tail", [
    ("$5", "billion deal"),          # amount + spaced scale
    ("50", "basis points cut"),      # number + basis-point unit
    ("$1.25", "per share payout"),   # amount + per-share unit
])
def test_split_figure_head_removed_when_discarded_text_completes_it(head, continuation_tail):
    ev = build_figure_evidence([_head_then_discarded_continuation(head, continuation_tail)])
    assert ev.distinct_figures == ()                         # no partial figure emitted
    assert ev.truncated and not ev.figures_complete


@pytest.mark.parametrize("token", ["$5B", "45%", "50bps"])
def test_token_split_inside_figure_discarded_whole(token):
    # The token straddles the boundary and cannot be completed from retained text.
    title = ("z " * 255) + token
    ev = build_figure_evidence([title])
    assert ev.distinct_figures == ()
    assert ev.truncated and not ev.figures_complete


# ══════════════════════════════════════════════════════════════════════════════
# Wave 0.2b (N1) compound-boundary-token regressions. The discarded token is
# classified by its LEADING ALPHABETIC COMPONENT, so a compound continuation
# ("per-share", "billion-dollar", "billion2", "basis-point") still completes an
# incomplete retained head — while unrelated compounds never delete a complete
# retained figure.
# ══════════════════════════════════════════════════════════════════════════════

@pytest.mark.parametrize("head,continuation_tail", [
    ("$1.25", "per-share payout"),      # per-share → per
    ("$5", "billion-dollar deal"),      # billion-dollar → billion
    ("$5", "billion2 deal"),            # billion2 → billion
    ("50", "basis-point cut"),          # basis-point → basis
])
def test_compound_discarded_continuation_removes_split_head(head, continuation_tail):
    ev = build_figure_evidence([_head_then_discarded_continuation(head, continuation_tail)])
    assert ev.distinct_figures == ()                         # no bare/partial emission
    assert ev.truncated and not ev.figures_complete


@pytest.mark.parametrize("figure,kind,value", [
    ("$5B", "money", 5 * 10**9 * 100),
    ("8%", "percentage", 800),
])
def test_unrelated_compound_discarded_word_preserves_complete_figure(figure, kind, value):
    ev = build_figure_evidence([
        _head_then_discarded_continuation(figure, "record-breaking rally")
    ])
    hits = _only(ev, kind)
    assert len(hits) == 1 and hits[0].value_minor == value   # complete figure survives
    assert ev.truncated and not ev.figures_complete


# ══════════════════════════════════════════════════════════════════════════════
# Wave 0.2b (N2.1): figure evidence wired into assess() — capture-only.
#
# assess() parses ONLY recorded headline text (event title, then evidence titles)
# and attaches FigureEvidence to the transient MaterialityAssessment. It must not
# influence any decision field; every assessment stays UNRESOLVED; nothing is
# aggregated (N3) or persisted.
# ══════════════════════════════════════════════════════════════════════════════

def _fig_event(*, id="c-fig001", title="Plain headline", evidence_titles=("t",),
               why_it_matters="", transmission="", event_type="macro",
               corroboration_count=2, uid=""):
    ev = [EventEvidence(source="Reuters", title=t, url=f"u{i}", published=ISO,
                        tier=1, kind="news", qualified=True)
          for i, t in enumerate(evidence_titles)]
    return MarketEvent(
        id=id, title=title, event_type=event_type, first_seen=ISO, last_updated=ISO,
        corroboration_count=corroboration_count, source_count=len(ev),
        evidence=ev, companies=[], industries=[], confidence=0, uid=uid,
        why_it_matters=why_it_matters, transmission=transmission,
        transmission_chain=[],
    )


def test_assess_parses_event_title():
    fe = assess(_fig_event(title="Buyback of $5B", evidence_titles=("plain",))).figure_evidence
    assert fe is not None
    money = _only(fe, "money")
    assert len(money) == 1 and money[0].value_minor == 5 * 10**9 * 100


def test_assess_parses_evidence_titles():
    fe = assess(_fig_event(title="Plain", evidence_titles=("Shares rose 8%",))).figure_evidence
    pct = _only(fe, "percentage")
    assert len(pct) == 1 and pct[0].value_minor == 800


def test_assess_repeated_title_occurrence_semantics():
    # event title duplicates an evidence title; N1 max-per-title + raw mention hold.
    ev = _fig_event(title="$5B deal", evidence_titles=("$5B deal", "another $5B deal"))
    fe = assess(ev).figure_evidence
    money = _only(fe, "money")
    assert len(money) == 1                              # one distinct value
    assert money[0].max_occurrences_per_title == 1      # once per title, never inflated
    assert fe.distinct_money_values == 1
    assert fe.mention_count == 3                         # three titles, one mention each


def test_assess_skips_empty_titles():
    ev = _fig_event(title="", evidence_titles=("", "Gain of $5B"))
    fe = assess(ev).figure_evidence
    money = _only(fe, "money")
    assert len(money) == 1 and money[0].value_minor == 5 * 10**9 * 100
    assert fe.mention_count == 1


def test_assess_malformed_figure_marks_incomplete():
    fe = assess(_fig_event(title="Odd $12,34 grouping")).figure_evidence
    assert _only(fe, "money") == []
    assert fe.truncated and not fe.figures_complete


def test_assess_ignores_llm_authored_fields():
    # why_it_matters / transmission are LLM-authored / built-later — never parsed.
    ev = _fig_event(title="Plain macro update", evidence_titles=("also plain",),
                    why_it_matters="a $5 billion writedown looms",
                    transmission="yields rose 8% on the news")
    fe = assess(ev).figure_evidence
    assert fe.distinct_figures == ()


def test_assess_state_and_rank_unchanged_by_figures():
    ev = _fig_event(title="Massive $999 trillion, 8%, 50 bps, $1.25/share",
                    evidence_titles=("$5B",))
    a = assess(ev)
    assert a.state is MaterialityState.UNRESOLVED
    assert a.materiality_rank is None


def test_figures_do_not_enter_inputs_present():
    a = assess(_fig_event(title="Buyback $5B up 8%", evidence_titles=("$5B",)))
    for banned in ("typed_figures", "money", "percentage", "basis_points",
                   "per_share", "magnitude", "figures"):
        assert banned not in a.inputs_present


def test_same_event_with_and_without_figures_has_identical_decision_fields():
    no_fig = _fig_event(title="Fed holds rates steady", evidence_titles=("wire report",))
    with_fig = _fig_event(title="Fed cuts 50 bps to a $5B backstop",
                          evidence_titles=("wire report",))
    a0, a1 = assess(no_fig), assess(with_fig)
    assert a0.state == a1.state == MaterialityState.UNRESOLVED
    assert a0.materiality_rank is None and a1.materiality_rank is None
    assert a0.inputs_present == a1.inputs_present
    assert a0.mandatory_class == a1.mandatory_class
    assert a0.corroboration_count == a1.corroboration_count
    assert a0.best_evidence_tier == a1.best_evidence_tier
    assert a0.source_evidence == a1.source_evidence
    assert a0.breadth_evidence == a1.breadth_evidence
    # ONLY the diagnostic figure evidence differs
    assert a0.figure_evidence.distinct_figures == ()
    assert a1.figure_evidence.distinct_money_values == 1
    assert a1.figure_evidence.distinct_basis_points_values == 1


def test_reason_codes_typed_figures_and_magnitude_guard():
    a = assess(_fig_event(title="Buyback $5B", evidence_titles=("$5B",)))
    factors = {r.factor: r for r in a.reasons}
    assert "typed_figures" in factors
    assert factors["typed_figures"].available is True          # figures captured
    assert "diagnostic" in factors["typed_figures"].detail.lower()
    # magnitude remains a decision guard: excluded / never available as an input
    assert factors["magnitude"].available is False
    # a figure-free event records typed_figures as not-available
    b = assess(_fig_event(title="Plain", evidence_titles=("plain",)))
    assert {r.factor: r for r in b.reasons}["typed_figures"].available is False


def test_aggregate_does_not_fold_figure_evidence():
    # Two figure-bearing assessments: neither figure_evidence nor the figure-derived
    # typed_figures reason may survive aggregation in N2.1.
    a = assess(_fig_event(title="Buyback $5B", evidence_titles=("$5B",)))
    b = assess(_fig_event(id="c-fig002", title="Deal 8%", evidence_titles=("8%",)))
    assert "typed_figures" in {r.factor for r in a.reasons}   # present on direct assessments
    assert "typed_figures" in {r.factor for r in b.reasons}
    agg = aggregate([a, b])
    assert agg is not None
    assert agg.figure_evidence is None            # N2.1 does not aggregate figures; N3 owns it
    assert "typed_figures" not in {r.factor for r in agg.reasons}   # no figure-derived leak
    assert agg.state is MaterialityState.UNRESOLVED


def test_aggregate_excludes_typed_figures_reason_but_keeps_the_rest():
    with_fig = assess(_fig_event(title="Buyback $5B up 8%", evidence_titles=("$5B",)))
    no_fig = assess(_fig_event(id="c-fig002", title="Fed holds steady",
                               evidence_titles=("wire report",)))
    agg = aggregate([with_fig, no_fig])
    assert agg is not None
    # figure evidence and its derived reason are both gone
    assert agg.figure_evidence is None
    assert "typed_figures" not in {r.factor for r in agg.reasons}
    # every non-figure reason is still unioned (magnitude guard, and the rest)
    agg_factors = {r.factor for r in agg.reasons}
    direct_factors = ({r.factor for r in with_fig.reasons}
                      | {r.factor for r in no_fig.reasons}) - {"typed_figures"}
    assert agg_factors == direct_factors
    assert "magnitude" in agg_factors                          # decision guard preserved
    mag = next(r for r in agg.reasons if r.factor == "magnitude")
    assert mag.available is False
    # decision fields / provenance are unchanged by the figure filtering
    assert agg.state is MaterialityState.UNRESOLVED
    assert agg.materiality_rank is None
    assert agg.inputs_present == tuple(sorted(
        set(with_fig.inputs_present) | set(no_fig.inputs_present)))
    assert set(agg.contributing_ids) == {with_fig.event_id, no_fig.event_id}


def test_post_identity_fresh_reassessment_reflects_final_titles():
    # build_shadow_result assesses FINAL admitted events FRESH — figure evidence is
    # rebuilt from the final canonical title + evidence, not a stale pre-identity copy.
    final = _fig_event(title="Deal valued at $5B", evidence_titles=("$5B agreed",))
    result = build_shadow_result([], [final])
    assert len(result.admitted) == 1
    fe = result.admitted[0].figure_evidence
    assert fe is not None
    money = _only(fe, "money")
    assert len(money) == 1 and money[0].value_minor == 5 * 10**9 * 100


# ==============================================================================
# Wave 0.2b (N2.2): FigureEvidence propagates through the shadow pipeline via each
# assessment's OWN field -- MaterialityShadowResult.admitted[*].figure_evidence.
#
# There is NO top-level figure projection on MaterialityShadowResult (a single
# field cannot represent many events without aggregation, deferred to N3). N2.2 is
# a pure carry: assess() already computed figure_evidence per event; the shadow
# result simply holds those assessments. No reparse, no aggregation, no
# persistence change.
# ==============================================================================

def test_shadow_result_has_no_top_level_figure_field():
    # The redundant top-level projection must NOT exist; propagation is per-assessment.
    r = MaterialityShadowResult(policy_version=POLICY_VERSION)
    assert not hasattr(r, "figure_evidence")


def test_admitted_assessment_carries_its_own_figure_evidence():
    ev = _fig_event(title="Deal at $5B", evidence_titles=("$5B agreed",))
    result = build_shadow_result([], [ev])
    assert len(result.admitted) == 1
    fe = result.admitted[0].figure_evidence
    assert fe is not None
    money = _only(fe, "money")
    assert len(money) == 1 and money[0].value_minor == 5 * 10**9 * 100
    # value-equal to a fresh direct assessment (deterministic parse; no double-parse
    # semantics diverge) -- build_shadow_result computes it via its single assess() call.
    assert fe == assess(ev).figure_evidence


def test_multiple_admitted_each_retain_independent_figure_evidence():
    a = _fig_event(id="c-1", title="Deal $5B", evidence_titles=("$5B",))
    b = _fig_event(id="c-2", title="Cut 8%", evidence_titles=("8%",))
    result = build_shadow_result([], [a, b])
    assert len(result.admitted) == 2
    fe_a, fe_b = result.admitted[0].figure_evidence, result.admitted[1].figure_evidence
    # each assessment keeps its OWN evidence -- no cross-contamination, no aggregation
    assert _only(fe_a, "money") and not _only(fe_a, "percentage")
    assert _only(fe_b, "percentage") and not _only(fe_b, "money")
    assert _only(fe_a, "money")[0].value_minor == 5 * 10**9 * 100
    assert _only(fe_b, "percentage")[0].value_minor == 800


def test_shadow_result_figure_propagation_is_capture_only():
    # Carrying figure evidence changes no decision surface.
    ev = _fig_event(title="Massive $999 trillion, 8%", evidence_titles=("$5B",))
    result = build_shadow_result([], [ev])
    assert result.authoritative is False
    assert result.admitted[0].state is MaterialityState.UNRESOLVED
    assert result.admitted[0].materiality_rank is None


# ==============================================================================
# Wave 0.2b (N2.3): typed-figure diagnostic observability.
#
# figure_diagnostics() is a pure, read-only summary of the FigureEvidence that
# assess() already computed. It never reparses, never aggregates, never mutates,
# and influences no decision; it is produced transiently (observe()/tests) and
# stored/serialized nowhere.
# ==============================================================================

def test_diagnostics_summarize_existing_evidence():
    aa = [
        assess(_fig_event(id="c-1", title="Deal $5B", evidence_titles=("$5B",))),
        assess(_fig_event(id="c-2", title="Cut 8%", evidence_titles=("8%",))),
        assess(_fig_event(id="c-3", title="Hike 50 bps", evidence_titles=("50 bps",))),
        assess(_fig_event(id="c-4", title="Div $1.25/share", evidence_titles=("$1.25/share",))),
        assess(_fig_event(id="c-5", title="Plain headline", evidence_titles=("plain",))),
        assess(_fig_event(id="c-6", title="Odd $12,34 grouping", evidence_titles=("plain",))),
    ]
    d = figure_diagnostics(aa)
    assert d.total == 6
    assert d.with_figures == 4
    assert d.no_figures == 2                 # plain + malformed(no figures emitted)
    assert d.with_money == 1
    assert d.with_percentage == 1
    assert d.with_basis_points == 1
    assert d.with_per_share == 1
    assert d.truncated == 1                  # the "$12,34" malformed grouping
    assert d.complete == 5                   # all except the truncated one
    assert d.distinct_values_total == 4


def test_diagnostics_do_not_reparse(monkeypatch):
    import app.materiality as m
    assessments = [assess(_fig_event(title="Deal $5B", evidence_titles=("$5B",)))]

    def _boom(*a, **k):
        raise AssertionError("figure_diagnostics must not reparse")

    monkeypatch.setattr(m, "build_figure_evidence", _boom)
    d = figure_diagnostics(assessments)      # must not call build_figure_evidence
    assert d.with_figures == 1 and d.with_money == 1


def test_diagnostics_order_invariance():
    # distinct categories, completeness, and truncation states so any order
    # dependence would change the result.
    a = assess(_fig_event(id="a", title="Deal $5B", evidence_titles=("$5B",)))            # money, complete
    b = assess(_fig_event(id="b", title="Odd $12,34 grouping", evidence_titles=("x",)))    # truncated, no figures
    c = assess(_fig_event(id="c", title="Cut 8% and 50 bps", evidence_titles=("8%",)))     # pct + bps, complete
    assert figure_diagnostics([a, b, c]) == figure_diagnostics([c, a, b])


def test_diagnostics_handle_none_figure_evidence():
    a = assess(_fig_event(title="Deal $5B", evidence_titles=("$5B",)))
    b = assess(_fig_event(id="c-2", title="Cut 8%", evidence_titles=("8%",)))
    agg = aggregate([a, b])
    assert agg.figure_evidence is None       # aggregate carries no figure evidence
    d = figure_diagnostics([agg])
    assert d.total == 1 and d.no_figures == 1 and d.with_figures == 0


def test_diagnostics_empty_input():
    assert figure_diagnostics([]) == FigureDiagnostics()      # all zeros
    assert figure_diagnostics(None) == FigureDiagnostics()


def test_diagnostics_not_attached_and_do_not_mutate():
    ev = _fig_event(title="Deal $5B", evidence_titles=("$5B",))
    r = build_shadow_result([], [ev])
    # diagnostics are not a field on any transient carrier — computed on demand only
    assert not hasattr(r, "diagnostics")
    assert not hasattr(r, "figure_diagnostics")
    assert not hasattr(r.admitted[0], "diagnostics")
    before = r.admitted[0]
    figure_diagnostics(r.admitted)           # read-only; must not mutate
    assert r.admitted[0] == before


def test_observe_emits_bounded_figure_diagnostics_line(caplog):
    import logging
    ev = _fig_event(title="Deal $5B up 8%", evidence_titles=("$5B",))
    r = build_shadow_result([], [ev])                     # pre_admission empty; one admitted
    with caplog.at_level(logging.INFO, logger="app.materiality"):
        observe(r)
    # the diagnostic line is emitted on the NON-AUTHORITATIVE shadow channel only,
    # with the two populations labelled unambiguously (no combined total).
    assert "[materiality:shadow NON-AUTHORITATIVE figures]" in caplog.text
    assert "admitted_with_figures=1" in caplog.text
    assert "admitted_money=1" in caplog.text
    assert "admitted_percentage=1" in caplog.text
    assert "admitted_distinct_values=2" in caplog.text    # $5B + 8% across the titles
    # the pre_admission population is summarized separately (here empty)
    assert "pre_admission_total=0" in caplog.text
    assert "pre_admission_with_figures=0" in caplog.text
