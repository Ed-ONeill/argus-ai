"""Transition derivation between sealed snapshots: thresholds, determinism,
no false events from ordering-only differences."""

from __future__ import annotations

from datetime import datetime, timezone

from app.institutional_memory.snapshot_builder import build_theme_snapshot
from app.institutional_memory.transitions import (
    derive_status_transitions,
    derive_theme_transitions,
)
from tests.conftest import make_theme

D1 = datetime(2026, 7, 9, 23, 55, tzinfo=timezone.utc)
D2 = datetime(2026, 7, 10, 23, 55, tzinfo=timezone.utc)


def _row(theme, now, snapshot_id="snap-x", memory=None):
    snap = build_theme_snapshot(theme, memory, now)
    row = snap.to_row()
    row["id"] = snapshot_id
    return row


def _types(events):
    return sorted(e.transition_type for e in events)


def test_conviction_strengthened_and_weakened_thresholds():
    prev = _row(make_theme(confidence=60), D1, "a")
    up = _row(make_theme(confidence=63), D2, "b")
    down = _row(make_theme(confidence=57), D2, "c")
    flat = _row(make_theme(confidence=62), D2, "d")

    assert "conviction_strengthened" in _types(derive_theme_transitions(prev, up))
    assert "conviction_weakened" in _types(derive_theme_transitions(prev, down))
    assert "conviction_strengthened" not in _types(derive_theme_transitions(prev, flat))
    assert "conviction_weakened" not in _types(derive_theme_transitions(prev, flat))


def test_no_events_when_unchanged():
    prev = _row(make_theme(), D1, "a")
    curr = _row(make_theme(), D2, "b")
    assert derive_theme_transitions(prev, curr) == []


def test_ordering_only_json_difference_fires_nothing():
    prev = _row(make_theme(related_assets=["NVDA", "CEG", "VST"],
                           related_industries=["Utilities", "Semiconductors"]), D1, "a")
    curr = _row(make_theme(related_assets=["VST", "CEG", "NVDA"],
                           related_industries=["Semiconductors", "Utilities"]), D2, "b")
    assert derive_theme_transitions(prev, curr) == []


def test_lifecycle_change():
    mem_a = {"lifecycle": "building", "status": "strengthening"}
    mem_b = {"lifecycle": "mature", "status": "recurring"}
    prev = _row(make_theme(), D1, "a", memory=mem_a)
    curr = _row(make_theme(), D2, "b", memory=mem_b)
    events = derive_theme_transitions(prev, curr)
    assert "lifecycle_changed" in _types(events)
    ev = next(e for e in events if e.transition_type == "lifecycle_changed")
    assert ev.from_value == {"value": "building"}
    assert ev.to_value == {"value": "mature"}
    assert ev.from_snapshot_id == "a" and ev.to_snapshot_id == "b"


def test_evidence_strengthened_by_verdict_rank():
    prev = _row(make_theme(signal_quality="developing"), D1, "a")
    curr = _row(make_theme(signal_quality="confirmed"), D2, "b")
    assert "evidence_strengthened" in _types(derive_theme_transitions(prev, curr))
    assert "evidence_weakened" in _types(derive_theme_transitions(curr, prev))


def test_contradiction_added_and_removed_count_based():
    mem_lo = {"contradicting_total": 2, "confirming_total": 10}
    mem_hi = {"contradicting_total": 4, "confirming_total": 10}
    prev = _row(make_theme(), D1, "a", memory=mem_lo)
    curr = _row(make_theme(), D2, "b", memory=mem_hi)
    assert "contradiction_added" in _types(derive_theme_transitions(prev, curr))
    assert "contradiction_removed" in _types(derive_theme_transitions(curr, prev))


def test_breadth_changed_threshold():
    prev = _row(make_theme(breadth_score=3), D1, "a")
    wide = _row(make_theme(breadth_score=5), D2, "b")
    small = _row(make_theme(breadth_score=4), D2, "c")
    assert "breadth_changed" in _types(derive_theme_transitions(prev, wide))
    assert "breadth_changed" not in _types(derive_theme_transitions(prev, small))


def test_causal_path_changed():
    prev = _row(make_theme(causal_narrative="A → B → C"), D1, "a")
    curr = _row(make_theme(causal_narrative="A → B → D"), D2, "b")
    events = derive_theme_transitions(prev, curr)
    assert "causal_path_changed" in _types(events)
    # empty narrative never fires
    none_prev = _row(make_theme(causal_narrative=""), D1, "c")
    assert "causal_path_changed" not in _types(derive_theme_transitions(none_prev, curr))


def test_event_key_deterministic_and_basis_stored():
    prev = _row(make_theme(confidence=60), D1, "a")
    curr = _row(make_theme(confidence=70), D2, "b")
    e1 = derive_theme_transitions(prev, curr)
    e2 = derive_theme_transitions(prev, curr)
    assert [e.event_key for e in e1] == [e.event_key for e in e2]
    ev = e1[0]
    assert ev.event_key == ("theme:ontology:ai-energy-demand|conviction_strengthened"
                            "|2026-07-10|v1")
    assert ev.basis["compared_snapshot_dates"] == ["2026-07-09", "2026-07-10"]
    assert ev.magnitude == 10.0


def test_active_status_changed_presence_flips():
    a_prev = _row(make_theme(id="ai-energy-demand"), D1, "a")
    b_curr = _row(make_theme(id="treasury-yield-pressure"), D2, "b")
    prev_by_uid = {a_prev["entity_uid"]: a_prev}
    curr_by_uid = {b_curr["entity_uid"]: b_curr}
    events = derive_status_transitions(prev_by_uid, curr_by_uid,
                                       "2026-07-10", D2.isoformat())
    assert _types(events) == ["active_status_changed", "active_status_changed"]
    by_uid = {e.entity_uid: e for e in events}
    assert by_uid["theme:ontology:treasury-yield-pressure"].to_value == {"value": "active"}
    assert by_uid["theme:ontology:ai-energy-demand"].to_value == {"value": "absent"}
