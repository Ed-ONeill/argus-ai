"""Graph adapter: deterministic graph version, honest field sourcing,
narrative derivation semantics, relationship record construction."""

from __future__ import annotations

from datetime import datetime, timezone

from app.institutional_memory.graph_adapter import (
    build_graph_cycle_state,
    compute_graph_version,
)
from tests.conftest import make_activation, make_feed, make_theme

NOW = datetime(2026, 7, 13, 14, 30, tzinfo=timezone.utc)
LATER = datetime(2026, 7, 13, 21, 0, tzinfo=timezone.utc)


def test_graph_version_deterministic_for_same_input():
    a = build_graph_cycle_state(make_feed(), NOW)
    b = build_graph_cycle_state(make_feed(), LATER)
    assert a.graph_version == b.graph_version
    assert a.graph_version.startswith("gv1-")


def test_graph_version_changes_on_topology_not_strength():
    base = build_graph_cycle_state(make_feed(), NOW)
    # confidence drift (state) — same topology, same version
    themes = [make_theme(confidence=75),
              make_theme(id="treasury-yield-pressure", name="Higher-for-Longer",
                         confidence=63,
                         related_industries=["Financials", "Utilities", "Real Estate"],
                         related_assets=["TLT", "JPM"],
                         related_macro_factors=["Power Load Growth", "Terminal Rate"],
                         relationship_weights={"Financials": {"weight": 0.7,
                                                              "direction": "positive"}},
                         causal_narrative="Rates → duration repricing",
                         contributing_cluster_ids=["c9"])]
    drift = build_graph_cycle_state(make_feed(themes=themes), NOW)
    assert drift.graph_version == base.graph_version
    # a node disappearing (theme drops out) — new version
    smaller = build_graph_cycle_state(make_feed(themes=themes[:1]), NOW)
    assert smaller.graph_version != base.graph_version
    # regime change — new version
    regime = build_graph_cycle_state(make_feed(regime="Yield Shock"), NOW)
    assert regime.graph_version != base.graph_version


def test_entities_registered_with_canonical_uids():
    state = build_graph_cycle_state(make_feed(), NOW)
    uids = {e.uid for e in state.entities}
    assert "company:ticker:NVDA" in uids
    assert "company:ticker:TLT" in uids
    assert "industry:taxonomy:utilities" in uids
    assert "driver:ontology:power-load-growth" in uids
    assert "regime:taxonomy:ai-capex-expansion" in uids
    # themes are registered by the M3.1 stage, not here
    assert not any(u.startswith("theme:") for u in uids
                   if not u.startswith("theme:legacy"))


def test_industry_snapshots_from_activation_state():
    state = build_graph_cycle_state(make_feed(), NOW)
    by_uid = {s.entity_uid: s for s in state.industry_snapshots}
    snap = by_uid["industry:taxonomy:utilities"]
    assert snap.conviction == 62                    # activation score
    assert snap.evidence_count == 5                 # active stories
    assert snap.payload["state"]["sentiment"] == "bullish"
    assert snap.graph_version == state.graph_version
    # zero-score industries produce no snapshot
    feed = make_feed(activations=[make_activation(score=0)])
    assert build_graph_cycle_state(feed, NOW).industry_snapshots == []


def test_relationship_snapshots_record_verbatim_types_and_evidence_refs():
    state = build_graph_cycle_state(make_feed(), NOW)
    by_uid = {s.rel_uid: s for s in state.relationship_snapshots}
    # theme → industry edge from relationship_weights direction=positive → supports
    key = "rel:theme:ontology:ai-energy-demand|supports|industry:taxonomy:utilities"
    assert key in by_uid
    snap = by_uid[key]
    assert snap.relationship_type == "supports"     # verbatim, not remapped
    assert snap.direction == "directed"
    assert snap.strength is not None and 0 <= snap.strength <= 1
    assert snap.evidence_refs == ["c1", "c2"]       # sorted stable cluster ids
    assert snap.payload["state"]["evidence_scope"] == "theme_level"
    # exposure links carry no invented strength
    exp = by_uid["rel:theme:ontology:ai-energy-demand|exposed_to|company:ticker:NVDA"]
    assert exp.strength is None
    assert exp.confidence == 0.72


def test_evidence_ordering_does_not_change_relationship_hash():
    a = build_graph_cycle_state(
        make_feed(themes=[make_theme(contributing_cluster_ids=["c2", "c1"]),
                          make_theme(id="treasury-yield-pressure",
                                     related_macro_factors=["Power Load Growth"])]), NOW)
    b = build_graph_cycle_state(
        make_feed(themes=[make_theme(contributing_cluster_ids=["c1", "c2"]),
                          make_theme(id="treasury-yield-pressure",
                                     related_macro_factors=["Power Load Growth"])]), NOW)
    hashes_a = {s.rel_uid: s.payload_hash for s in a.relationship_snapshots}
    hashes_b = {s.rel_uid: s.payload_hash for s in b.relationship_snapshots}
    assert hashes_a == hashes_b


def test_narratives_derived_from_shared_drivers():
    # both default themes share "Power Load Growth" → one narrative, 2 members
    state = build_graph_cycle_state(make_feed(), NOW)
    assert len(state.narrative_snapshots) == 1
    n = state.narrative_snapshots[0]
    assert n.entity_uid.startswith("narrative:driverset:")
    assert n.driver_set_key == "driver:ontology:power-load-growth"
    assert n.member_uids == ["theme:ontology:ai-energy-demand",
                             "theme:ontology:treasury-yield-pressure"]
    assert n.dominance_status == "dominant" and n.rank == 1
    assert n.thesis is None                          # never invented
    # member convictions listed individually, never blended
    convictions = {m["uid"]: m["conviction"] for m in n.member_convictions}
    assert convictions["theme:ontology:ai-energy-demand"] == 72
    assert convictions["theme:ontology:treasury-yield-pressure"] == 60
    assert n.coherence_components["shared_driver_strength"] is None


def test_narrative_identity_stable_under_member_ordering_and_labels():
    themes_a = make_feed().theme_intelligence
    themes_b = list(reversed(make_feed().theme_intelligence))
    for t in themes_b:
        t.name = t.name + " (renamed)"               # labels must not matter
    a = build_graph_cycle_state(make_feed(themes=themes_a), NOW)
    b = build_graph_cycle_state(make_feed(themes=themes_b), NOW)
    assert a.narrative_snapshots[0].entity_uid == b.narrative_snapshots[0].entity_uid
    assert a.narrative_snapshots[0].payload_hash == b.narrative_snapshots[0].payload_hash


def test_single_member_driver_groups_are_not_narratives():
    lone = [make_theme(related_macro_factors=["AI Capex Supercycle"]),
            make_theme(id="treasury-yield-pressure",
                       related_macro_factors=["Terminal Rate"])]
    state = build_graph_cycle_state(make_feed(themes=lone), NOW)
    assert state.narrative_snapshots == []


def test_run_key_pairs_cover_all_record_families():
    state = build_graph_cycle_state(make_feed(), NOW)
    pairs = dict(state.uid_hash_pairs())
    assert any(u.startswith("industry:") for u in pairs)
    assert any(u.startswith("rel:") for u in pairs)
    assert any(u.startswith("narrative:") for u in pairs)
