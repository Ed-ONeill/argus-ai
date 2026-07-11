"""Snapshot builder: determinism, honest sparsity, provenance, hashing."""

from __future__ import annotations

from datetime import datetime, timezone
from types import SimpleNamespace

from app.institutional_memory.models import SCHEMA_VERSION, canonical_json
from app.institutional_memory.snapshot_builder import (
    build_bootstrap_snapshot,
    build_theme_snapshot,
)
from tests.conftest import make_theme

NOW = datetime(2026, 7, 11, 14, 30, tzinfo=timezone.utc)
LATER = datetime(2026, 7, 11, 21, 0, tzinfo=timezone.utc)

MEMORY_SUMMARY = {
    "theme_id": "ai-energy-demand", "name": "Grid Bottleneck Trade",
    "first_seen": "2026-06-30T09:00:00+00:00", "sessions_observed": 40,
    "sessions_in_status": 6, "status": "strengthening", "lifecycle": "building",
    "conviction_first": 55, "conviction_peak": 75, "conviction_trough": 50,
    "confirming_total": 30, "contradicting_total": 4,
    "confirmations_today": 3, "contradictions_today": 1,
    "is_persistent_pattern": True, "conviction_current": 72,
    "last_seen": "2026-07-11T14:25:00+00:00",
    "first_seen_days_ago": 11.2, "last_seen_hours_ago": 0.1,   # volatile — must be excluded
    "momentum": "strengthening", "is_stale": False,
    "historical_tickers": ["NVDA", "CEG"], "historical_sectors": ["Utilities"],
}


def test_payload_and_hash_deterministic():
    a = build_theme_snapshot(make_theme(), MEMORY_SUMMARY, NOW)
    b = build_theme_snapshot(make_theme(), MEMORY_SUMMARY, NOW)
    assert canonical_json(a.payload["state"]) == canonical_json(b.payload["state"])
    assert a.payload_hash == b.payload_hash


def test_hash_excludes_observation_time_and_volatile_memory_fields():
    a = build_theme_snapshot(make_theme(), MEMORY_SUMMARY, NOW)
    later_summary = dict(MEMORY_SUMMARY, last_seen_hours_ago=6.5, first_seen_days_ago=11.5)
    b = build_theme_snapshot(make_theme(), later_summary, LATER)
    assert a.payload_hash == b.payload_hash          # same state, later clock
    assert a.observed_at != b.observed_at


def test_input_list_ordering_does_not_change_hash():
    a = build_theme_snapshot(make_theme(related_assets=["NVDA", "CEG", "VST"]),
                             MEMORY_SUMMARY, NOW)
    b = build_theme_snapshot(make_theme(related_assets=["VST", "NVDA", "CEG"]),
                             MEMORY_SUMMARY, NOW)
    assert a.payload_hash == b.payload_hash


def test_state_change_changes_hash():
    a = build_theme_snapshot(make_theme(confidence=72), MEMORY_SUMMARY, NOW)
    b = build_theme_snapshot(make_theme(confidence=75), MEMORY_SUMMARY, NOW)
    assert a.payload_hash != b.payload_hash


def test_sparse_theme_stays_sparse_no_fabrication():
    sparse = SimpleNamespace(id="ai-energy-demand", name="Grid Bottleneck Trade",
                             confidence=40)
    snap = build_theme_snapshot(sparse, None, NOW)
    state = snap.payload["state"]
    assert snap.completeness_status == "partial"       # no memory summary yet
    assert state["forward_view"] is None
    assert state["beneficiaries"] is None
    assert state["narrative_memberships"] is None
    assert state["graph_version"] is None
    assert state["memory"] is None
    assert snap.evidence_count is None
    assert snap.breadth is None
    assert snap.contradictions is None


def test_provenance_and_schema_version_present():
    snap = build_theme_snapshot(make_theme(), MEMORY_SUMMARY, NOW)
    assert snap.schema_version == SCHEMA_VERSION
    assert snap.provenance["source"] == "background_cycle"
    assert snap.provenance["writer_version"]
    assert snap.payload["provenance"] == snap.provenance
    assert snap.snapshot_kind == "daily_utc"
    assert snap.snapshot_date == "2026-07-11"
    assert snap.completeness_status == "live"


def test_columns_mirror_state():
    snap = build_theme_snapshot(make_theme(), MEMORY_SUMMARY, NOW)
    assert snap.conviction == 72
    assert snap.strength == "strong"
    assert snap.lifecycle == "building"
    assert snap.evidence_verdict == "developing"
    assert snap.evidence_quality == "Elevated"
    assert snap.evidence_count == 9        # contributing stories
    assert snap.source_count == 6          # unique contributing sources
    assert snap.breadth == 4
    assert snap.related_assets == ["CEG", "NVDA", "VST"]


def test_bootstrap_snapshot_is_honest():
    snap = build_bootstrap_snapshot("ai-energy-demand", MEMORY_SUMMARY, None, NOW)
    assert snap.snapshot_kind == "bootstrap_baseline"
    assert snap.completeness_status == "bootstrap"
    assert snap.provenance["source"] == "theme_memory_bootstrap"
    # not backdated: snapshot_date is the run date, observed_at the real last_seen
    assert snap.snapshot_date == "2026-07-11"
    assert snap.observed_at == MEMORY_SUMMARY["last_seen"]
    # fields the memory cannot provide stay null
    assert snap.payload["state"]["strength"] is None
    assert snap.payload["state"]["breadth"] is None
