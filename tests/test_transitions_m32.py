"""M3.2 transitions: narrative membership/coherence/dominance, relationship
strength/confidence/evidence, presence flips, ordering immunity."""

from __future__ import annotations

from datetime import datetime, timezone

from app.institutional_memory.graph_adapter import build_graph_cycle_state
from app.institutional_memory.transitions import (
    derive_narrative_transitions,
    derive_presence_transitions,
    derive_relationship_transitions,
)
from tests.conftest import make_feed, make_theme

D1 = datetime(2026, 7, 11, 23, 55, tzinfo=timezone.utc)
D2 = datetime(2026, 7, 12, 23, 55, tzinfo=timezone.utc)


def _narrative_row(feed_kwargs: dict, now, snapshot_id: str):
    state = build_graph_cycle_state(make_feed(**feed_kwargs), now)
    row = state.narrative_snapshots[0].to_row()
    row["id"] = snapshot_id
    return row


def _rel_rows(feed_kwargs: dict, now):
    state = build_graph_cycle_state(make_feed(**feed_kwargs), now)
    rows = {}
    for i, s in enumerate(state.relationship_snapshots):
        row = s.to_row()
        row["id"] = f"rel-snap-{i}"
        rows[s.rel_uid] = row
    return rows


def _types(events):
    return sorted(e.transition_type for e in events)


def _third_theme(**overrides):
    return make_theme(id="private-credit-expansion", name="Private Credit",
                      confidence=50,
                      related_industries=["Financials"],
                      related_assets=["JPM"],
                      related_macro_factors=["Power Load Growth"],
                      relationship_weights={},
                      causal_narrative="Credit → spreads",
                      contributing_cluster_ids=["c7"],
                      **overrides)


def test_member_added_and_removed_with_stable_identities():
    prev = _narrative_row({}, D1, "a")
    themes3 = make_feed().theme_intelligence + [_third_theme()]
    curr = _narrative_row({"themes": themes3}, D2, "b")
    events = derive_narrative_transitions(prev, curr)
    added = [e for e in events if e.transition_type == "member_added"]
    assert len(added) == 1
    assert added[0].basis["members_added"] == ["theme:ontology:private-credit-expansion"]
    # reverse direction → member_removed
    removed = derive_narrative_transitions(curr, prev)
    assert "member_removed" in _types(removed)


def test_no_narrative_events_when_unchanged():
    prev = _narrative_row({}, D1, "a")
    curr = _narrative_row({}, D2, "b")
    assert derive_narrative_transitions(prev, curr) == []


def test_member_ordering_never_fires_membership_events():
    prev = _narrative_row({}, D1, "a")
    curr = _narrative_row({"themes": list(reversed(make_feed().theme_intelligence))},
                          D2, "b")
    assert derive_narrative_transitions(prev, curr) == []


def test_coherence_thresholds():
    prev = _narrative_row({}, D1, "a")
    curr = _narrative_row({}, D2, "b")
    prev["payload"]["state"]["coherence"] = 40.0
    curr["payload"]["state"]["coherence"] = 46.0
    assert "coherence_strengthened" in _types(derive_narrative_transitions(prev, curr))
    curr["payload"]["state"]["coherence"] = 34.0
    assert "coherence_weakened" in _types(derive_narrative_transitions(prev, curr))
    curr["payload"]["state"]["coherence"] = 42.0   # below the 5-pt threshold
    assert derive_narrative_transitions(prev, curr) == []


def test_dominant_status_changed():
    prev = _narrative_row({}, D1, "a")
    curr = _narrative_row({}, D2, "b")
    curr["payload"]["state"]["dominance_status"] = "secondary"
    events = derive_narrative_transitions(prev, curr)
    assert "dominant_status_changed" in _types(events)


def test_thesis_changed_only_when_both_exist():
    prev = _narrative_row({}, D1, "a")
    curr = _narrative_row({}, D2, "b")
    # M3.2 theses are null → never fires
    assert "thesis_changed" not in _types(derive_narrative_transitions(prev, curr))
    prev["payload"]["state"]["thesis"] = "old thesis"
    curr["payload"]["state"]["thesis"] = "new thesis"
    assert "thesis_changed" in _types(derive_narrative_transitions(prev, curr))


def test_relationship_strengthened_weakened_and_confidence():
    key = "rel:theme:ontology:ai-energy-demand|supports|industry:taxonomy:utilities"
    prev = _rel_rows({}, D1)[key]
    curr = dict(_rel_rows({}, D2)[key])
    curr["payload"] = {"state": dict(curr["payload"]["state"]), "provenance": {},
                       "observed_at": curr["observed_at"]}
    curr["payload"]["state"]["strength"] = prev["payload"]["state"]["strength"] + 0.15
    assert "relationship_strengthened" in _types(derive_relationship_transitions(prev, curr))
    curr["payload"]["state"]["strength"] = prev["payload"]["state"]["strength"] - 0.15
    assert "relationship_weakened" in _types(derive_relationship_transitions(prev, curr))
    curr["payload"]["state"]["strength"] = prev["payload"]["state"]["strength"] + 0.05
    curr["payload"]["state"]["confidence"] = prev["payload"]["state"]["confidence"] + 0.2
    events = derive_relationship_transitions(prev, curr)
    assert "confidence_changed" in _types(events)
    assert "relationship_strengthened" not in _types(events)   # below threshold


def test_relationship_evidence_thresholds():
    key = "rel:theme:ontology:ai-energy-demand|supports|industry:taxonomy:utilities"
    prev = _rel_rows({}, D1)[key]                              # refs = [c1, c2]
    curr = dict(_rel_rows({}, D2)[key])
    curr["payload"] = {"state": dict(curr["payload"]["state"]), "provenance": {},
                       "observed_at": curr["observed_at"]}
    curr["payload"]["state"]["evidence_refs"] = ["c1", "c2", "c3", "c4"]
    assert "evidence_added" in _types(derive_relationship_transitions(prev, curr))
    curr["payload"]["state"]["evidence_refs"] = []
    assert "evidence_removed" in _types(derive_relationship_transitions(prev, curr))
    curr["payload"]["state"]["evidence_refs"] = ["c1", "c2", "c3"]  # +1 < threshold
    assert "evidence_added" not in _types(derive_relationship_transitions(prev, curr))


def test_relationship_no_events_when_unchanged_or_reordered():
    key = "rel:theme:ontology:ai-energy-demand|supports|industry:taxonomy:utilities"
    prev = _rel_rows({}, D1)[key]
    curr = _rel_rows({}, D2)[key]
    assert derive_relationship_transitions(prev, curr) == []


def test_presence_transitions_for_relationships_and_narratives():
    rels_d1 = _rel_rows({}, D1)
    key = "rel:theme:ontology:ai-energy-demand|exposed_to|company:ticker:NVDA"
    rels_d2 = {k: v for k, v in _rel_rows({}, D2).items() if k != key}
    events = derive_presence_transitions(
        rels_d1, rels_d2, "2026-07-12", D2.isoformat(),
        appeared_type="relationship_appeared",
        disappeared_type="relationship_disappeared",
        uid_field="rel_uid")
    gone = [e for e in events if e.transition_type == "relationship_disappeared"]
    assert [e.entity_uid for e in gone] == [key]
    assert not [e for e in events if e.transition_type == "relationship_appeared"]
    # deterministic event key
    assert gone[0].event_key == f"{key}|relationship_disappeared|2026-07-12|v1"
