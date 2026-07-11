"""
tests/conftest.py — Shared fixtures for institutional-memory (M3.1) tests.

FakeRepository mirrors the SupabaseRepository interface with in-memory
storage and the same idempotency semantics (natural-key ignore-duplicates,
event_key uniqueness), so writer behavior is tested without a network.
"""

from __future__ import annotations

import sys
import uuid
from pathlib import Path
from types import SimpleNamespace

import pytest

# Make the project root importable regardless of pytest invocation dir.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.institutional_memory.models import SnapshotRecord, TransitionEvent  # noqa: E402
from app.institutional_memory.repository import RepositoryError  # noqa: E402


def make_theme(**overrides) -> SimpleNamespace:
    """A ThemeIntelligence-shaped object with realistic defaults."""
    base = dict(
        id="ai-energy-demand",
        name="Grid Bottleneck Trade",
        description="test theme",
        signal_strength="strong",
        confidence=72,
        momentum_direction="bullish",
        momentum_label="strengthening",
        momentum_delta=5,
        signal_quality="developing",
        confidence_label="Elevated",
        evidence_count=6,
        contributing_story_count=9,
        persistence_cycles=12,
        breadth_score=4,
        causal_narrative="AI capex → power demand → merchant generators",
        related_industries=["Utilities", "Semiconductors"],
        related_assets=["NVDA", "CEG", "VST"],
        related_macro_factors=["Power Load Growth", "AI Capex Supercycle"],
        second_order_effects=["PPA pricing power", "Gas peaker demand"],
        contributing_cluster_ids=["c2", "c1"],
        relationship_weights={"Utilities": {"weight": 0.85}},
    )
    base.update(overrides)
    return SimpleNamespace(**base)


class FakeRepository:
    """In-memory stand-in for SupabaseRepository with identical semantics."""

    def __init__(self) -> None:
        self.entities: dict[str, dict] = {}
        self.snapshots: dict[str, dict] = {}          # id -> row
        self.transitions: dict[str, dict] = {}        # event_key -> row
        self.runs: dict[str, dict] = {}               # run_key -> row
        self.fail_on: set[str] = set()                # method names that raise

    def _maybe_fail(self, method: str) -> None:
        if method in self.fail_on:
            raise RepositoryError(f"injected failure in {method}")

    # entities
    def fetch_entities(self, uids):
        self._maybe_fail("fetch_entities")
        return {u: self.entities[u] for u in uids if u in self.entities}

    def upsert_entities(self, entities, now_iso):
        self._maybe_fail("upsert_entities")
        for e in entities:
            if e.uid in self.entities:
                row = self.entities[e.uid]
                row["last_seen_at"] = e.last_seen_at or now_iso
                if e.display_label:
                    old = row.get("display_label")
                    if old and old != e.display_label:
                        row.setdefault("aliases", []).append(old)
                    row["display_label"] = e.display_label
            else:
                self.entities[e.uid] = {
                    "uid": e.uid, "entity_type": e.entity_type,
                    "namespace": e.namespace, "canonical_key": e.canonical_key,
                    "display_label": e.display_label, "aliases": list(e.aliases),
                    "status": "active",
                    "first_seen_at": e.first_seen_at or now_iso,
                    "last_seen_at": e.last_seen_at or now_iso,
                }
        return len(entities)

    # snapshots
    def _natural_key(self, row: dict) -> tuple:
        return (row["entity_uid"], row["snapshot_date"],
                row["snapshot_kind"], row["schema_version"])

    def fetch_snapshots_for_date(self, snapshot_date, snapshot_kind, schema_version,
                                 select="id,entity_uid,payload_hash"):
        self._maybe_fail("fetch_snapshots_for_date")
        return {
            r["entity_uid"]: r for r in self.snapshots.values()
            if r["snapshot_date"] == snapshot_date
            and r["snapshot_kind"] == snapshot_kind
            and r["schema_version"] == schema_version
        }

    def fetch_snapshots_between(self, date_from, date_to, snapshot_kind, schema_version):
        self._maybe_fail("fetch_snapshots_between")
        rows = [
            r for r in self.snapshots.values()
            if date_from <= r["snapshot_date"] <= date_to
            and r["snapshot_kind"] == snapshot_kind
            and r["schema_version"] == schema_version
        ]
        return sorted(rows, key=lambda r: r["snapshot_date"])

    def insert_snapshot(self, snapshot: SnapshotRecord) -> None:
        self._maybe_fail("insert_snapshot")
        row = snapshot.to_row()
        row["id"] = str(uuid.uuid4())
        for existing in self.snapshots.values():
            if self._natural_key(existing) == self._natural_key(row):
                return   # ignore-duplicates
        self.snapshots[row["id"]] = row

    def update_snapshot(self, snapshot_id, snapshot: SnapshotRecord, now_iso) -> None:
        self._maybe_fail("update_snapshot")
        row = snapshot.to_row()
        row["id"] = snapshot_id
        row["updated_at"] = now_iso
        self.snapshots[snapshot_id] = row

    def bootstrap_snapshot_exists(self, entity_uid) -> bool:
        self._maybe_fail("bootstrap_snapshot_exists")
        return any(r["entity_uid"] == entity_uid
                   and r["snapshot_kind"] == "bootstrap_baseline"
                   for r in self.snapshots.values())

    # transitions
    def insert_transitions(self, events: list[TransitionEvent]) -> int:
        self._maybe_fail("insert_transitions")
        for e in events:
            row = e.to_row()
            if row["event_key"] not in self.transitions:   # ignore-duplicates
                row["id"] = str(uuid.uuid4())
                self.transitions[row["event_key"]] = row
        return len(events)

    # runs
    def get_run(self, run_key):
        self._maybe_fail("get_run")
        return self.runs.get(run_key)

    def start_run(self, run_key, writer_version, started_at, cycle_id, metadata):
        self._maybe_fail("start_run")
        if run_key not in self.runs:
            self.runs[run_key] = {
                "run_key": run_key, "writer_version": writer_version,
                "started_at": started_at, "cycle_id": cycle_id,
                "status": "running", "metadata": metadata,
            }

    def finish_run(self, run_key, *, status, completed_at, counters, errors):
        self._maybe_fail("finish_run")
        row = self.runs.setdefault(run_key, {"run_key": run_key})
        row.update(counters)
        row.update({"status": status, "completed_at": completed_at,
                    "error_count": len(errors), "errors": errors or None})

    # read API
    def list_snapshots(self, entity_uid, *, date_from, date_to, order_desc, limit):
        self._maybe_fail("list_snapshots")
        rows = [r for r in self.snapshots.values() if r["entity_uid"] == entity_uid]
        if date_from:
            rows = [r for r in rows if r["snapshot_date"] >= date_from]
        if date_to:
            rows = [r for r in rows if r["snapshot_date"] <= date_to]
        rows.sort(key=lambda r: r["snapshot_date"], reverse=order_desc)
        return rows[:limit]

    def list_transitions(self, entity_uid, *, date_from, date_to, order_desc, limit):
        self._maybe_fail("list_transitions")
        rows = [r for r in self.transitions.values() if r["entity_uid"] == entity_uid]
        rows.sort(key=lambda r: r["effective_at"], reverse=order_desc)
        return rows[:limit]

    def latest_snapshot(self, entity_uid):
        rows = self.list_snapshots(entity_uid, date_from=None, date_to=None,
                                   order_desc=True, limit=1)
        return rows[0] if rows else None

    def count(self, table):
        self._maybe_fail("count")
        return {
            "institutional_entities": len(self.entities),
            "entity_snapshots": len(self.snapshots),
            "transition_events": len(self.transitions),
            "memory_write_runs": len(self.runs),
        }[table]

    def latest_run(self, status=None):
        rows = [r for r in self.runs.values()
                if status is None or r.get("status") == status]
        rows.sort(key=lambda r: r.get("started_at") or "", reverse=True)
        return rows[0] if rows else None

    def latest_snapshot_date(self):
        self._maybe_fail("latest_snapshot_date")
        dates = sorted(r["snapshot_date"] for r in self.snapshots.values())
        return dates[-1] if dates else None

    def recent_run_errors(self, limit=5):
        rows = [r for r in self.runs.values() if r.get("status") == "failed"]
        rows.sort(key=lambda r: r.get("started_at") or "", reverse=True)
        return rows[:limit]


@pytest.fixture
def fake_repo() -> FakeRepository:
    return FakeRepository()


@pytest.fixture
def enabled_settings(monkeypatch):
    """Enable institutional memory with dummy (never-contacted) credentials."""
    from app.config import settings
    monkeypatch.setattr(settings, "institutional_memory_enabled", True)
    monkeypatch.setattr(settings, "supabase_url", "https://example.supabase.co")
    monkeypatch.setattr(settings, "supabase_service_role_key", "test-service-role-key")
    return settings


@pytest.fixture
def fresh_theme_memory(monkeypatch, tmp_path):
    """Point the ThemeMemory singleton at an empty temp store."""
    from app import theme_memory as tm
    store = tm.ThemeMemoryStore(tmp_path / "theme_memory.json")
    monkeypatch.setattr(tm, "theme_memory", store)
    return store
