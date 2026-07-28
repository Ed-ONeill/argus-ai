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
        relationship_weights={"Utilities": {"weight": 0.85, "type": "indirect",
                                            "direction": "positive"}},
    )
    base.update(overrides)
    return SimpleNamespace(**base)


class FakeRepository:
    """In-memory stand-in for SupabaseRepository with identical semantics."""

    def __init__(self) -> None:
        self.entities: dict[str, dict] = {}
        self.snapshots: dict[str, dict] = {}          # entity_snapshots: id -> row
        self.transitions: dict[str, dict] = {}        # event_key -> row
        self.runs: dict[str, dict] = {}               # run_key -> row
        self.fail_on: set[str] = set()                # method names that raise
        # M3.2 tables
        self.relationships: dict[str, dict] = {}      # rel_uid -> registry row
        self.rel_snapshots: dict[str, dict] = {}      # id -> row
        self.narr_snapshots: dict[str, dict] = {}     # id -> row
        self.rel_transitions: dict[str, dict] = {}    # event_key -> row
        self.narr_transitions: dict[str, dict] = {}   # event_key -> row (007)
        # M3.3 tables
        self.predictions: dict[str, dict] = {}        # prediction_uid -> row
        self.outcomes: dict[str, dict] = {}           # outcome_uid -> row
        self.resolution_runs: dict[str, dict] = {}    # run_key -> row

    def _table(self, table: str) -> dict[str, dict]:
        return {
            "entity_snapshots": self.snapshots,
            "relationship_snapshots": self.rel_snapshots,
            "narrative_snapshots": self.narr_snapshots,
        }[table]

    _UID_COL = {
        "entity_snapshots": "entity_uid",
        "relationship_snapshots": "rel_uid",
        "narrative_snapshots": "entity_uid",
    }

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

    # snapshots (generic over the three snapshot tables, like the real repo)
    def _natural_key(self, row: dict, uid_col: str) -> tuple:
        return (row[uid_col], row["snapshot_date"],
                row["snapshot_kind"], row["schema_version"])

    def fetch_table_snapshots_for_date(self, table, uid_col, snapshot_date,
                                       snapshot_kind, schema_version):
        self._maybe_fail("fetch_table_snapshots_for_date")
        return {
            r[uid_col]: r for r in self._table(table).values()
            if r["snapshot_date"] == snapshot_date
            and r["snapshot_kind"] == snapshot_kind
            and r["schema_version"] == schema_version
        }

    def fetch_table_snapshots_between(self, table, date_from, date_to,
                                      snapshot_kind, schema_version):
        self._maybe_fail("fetch_table_snapshots_between")
        rows = [
            r for r in self._table(table).values()
            if date_from <= r["snapshot_date"] <= date_to
            and r["snapshot_kind"] == snapshot_kind
            and r["schema_version"] == schema_version
        ]
        return sorted(rows, key=lambda r: r["snapshot_date"])

    def insert_table_snapshot(self, table, uid_col, row) -> None:
        self._maybe_fail("insert_table_snapshot")
        row = dict(row)
        row["id"] = str(uuid.uuid4())
        store = self._table(table)
        for existing in store.values():
            if self._natural_key(existing, uid_col) == self._natural_key(row, uid_col):
                return   # ignore-duplicates
        store[row["id"]] = row

    def update_table_snapshot(self, table, snapshot_id, row, now_iso) -> None:
        self._maybe_fail("update_table_snapshot")
        row = dict(row)
        row["id"] = snapshot_id
        row["updated_at"] = now_iso
        self._table(table)[snapshot_id] = row

    # M3.1 signatures preserved (delegate, mirroring the real repository)
    def fetch_snapshots_for_date(self, snapshot_date, snapshot_kind, schema_version,
                                 select="id,entity_uid,payload_hash"):
        self._maybe_fail("fetch_snapshots_for_date")
        return self.fetch_table_snapshots_for_date(
            "entity_snapshots", "entity_uid", snapshot_date, snapshot_kind, schema_version)

    def fetch_snapshots_between(self, date_from, date_to, snapshot_kind, schema_version):
        self._maybe_fail("fetch_snapshots_between")
        return self.fetch_table_snapshots_between(
            "entity_snapshots", date_from, date_to, snapshot_kind, schema_version)

    def insert_snapshot(self, snapshot: SnapshotRecord) -> None:
        self._maybe_fail("insert_snapshot")
        self.insert_table_snapshot("entity_snapshots", "entity_uid", snapshot.to_row())

    def update_snapshot(self, snapshot_id, snapshot: SnapshotRecord, now_iso) -> None:
        self._maybe_fail("update_snapshot")
        self.update_table_snapshot("entity_snapshots", snapshot_id, snapshot.to_row(), now_iso)

    # relationships (M3.2)
    def fetch_relationships(self, rel_uids):
        self._maybe_fail("fetch_relationships")
        return {u: self.relationships[u] for u in rel_uids if u in self.relationships}

    def upsert_relationships(self, relationships, now_iso):
        self._maybe_fail("upsert_relationships")
        for r in relationships:
            if r.rel_uid in self.relationships:
                row = self.relationships[r.rel_uid]
                row["last_seen_at"] = r.last_seen_at or now_iso
                row["status"] = "active"
            else:
                self.relationships[r.rel_uid] = {
                    "rel_uid": r.rel_uid, "source_uid": r.source_uid,
                    "target_uid": r.target_uid,
                    "relationship_type": r.relationship_type,
                    "direction": r.direction, "status": "active",
                    "first_seen_at": r.first_seen_at or now_iso,
                    "last_seen_at": r.last_seen_at or now_iso,
                }
        return len(relationships)

    def relationships_for_entity(self, entity_uid, limit=200):
        self._maybe_fail("relationships_for_entity")
        rows = [r for r in self.relationships.values()
                if r["source_uid"] == entity_uid or r["target_uid"] == entity_uid]
        return sorted(rows, key=lambda r: r["rel_uid"])[:limit]

    # Faithful FK-domain enforcement (Postgres rejects a bulk insert ATOMICALLY
    # if any referenced snapshot id is absent). The pre-fix fake enforced NO
    # FK, which is exactly why the narrative cross-domain bug reached
    # production. Each transition ledger references ONLY its own snapshot table.
    @staticmethod
    def _assert_snapshot_fk(events, snapshot_store: dict, table: str) -> None:
        for e in events:
            for col in ("from_snapshot_id", "to_snapshot_id"):
                sid = getattr(e, col, None)
                if sid is not None and sid not in snapshot_store:
                    raise RepositoryError(
                        f'insert on "{table}" violates foreign key: '
                        f'{col}={sid} not present in the referenced snapshot table')

    def insert_relationship_transitions(self, events) -> int:
        self._maybe_fail("insert_relationship_transitions")
        self._assert_snapshot_fk(events, self.rel_snapshots, "relationship_transitions")
        for e in events:
            row = e.to_row(uid_column="rel_uid")
            if row["event_key"] not in self.rel_transitions:   # ignore-duplicates
                row["id"] = str(uuid.uuid4())
                self.rel_transitions[row["event_key"]] = row
        return len(events)

    def insert_narrative_transitions(self, events) -> int:
        self._maybe_fail("insert_narrative_transitions")
        self._assert_snapshot_fk(events, self.narr_snapshots, "narrative_transitions")
        for e in events:
            row = e.to_row()   # narratives use entity_uid (to_row default)
            if row["event_key"] not in self.narr_transitions:   # ignore-duplicates
                row["id"] = str(uuid.uuid4())
                self.narr_transitions[row["event_key"]] = row
        return len(events)

    def list_table_snapshots(self, table, uid_col, uid, *, date_from, date_to,
                             order_desc, limit):
        self._maybe_fail("list_table_snapshots")
        rows = [r for r in self._table(table).values() if r[uid_col] == uid]
        if date_from:
            rows = [r for r in rows if r["snapshot_date"] >= date_from]
        if date_to:
            rows = [r for r in rows if r["snapshot_date"] <= date_to]
        rows.sort(key=lambda r: r["snapshot_date"], reverse=order_desc)
        return rows[:limit]

    def list_table_transitions(self, table, uid_col, uid, *, date_from, date_to,
                               order_desc, limit):
        self._maybe_fail("list_table_transitions")
        store = {"relationship_transitions": self.rel_transitions,
                 "narrative_transitions": self.narr_transitions}.get(table, self.transitions)
        rows = [r for r in store.values() if r.get(uid_col) == uid]
        rows.sort(key=lambda r: r["effective_at"], reverse=order_desc)
        return rows[:limit]

    def bootstrap_snapshot_exists(self, entity_uid) -> bool:
        self._maybe_fail("bootstrap_snapshot_exists")
        return any(r["entity_uid"] == entity_uid
                   and r["snapshot_kind"] == "bootstrap_baseline"
                   for r in self.snapshots.values())

    # transitions
    def insert_transitions(self, events: list[TransitionEvent]) -> int:
        self._maybe_fail("insert_transitions")
        # transition_events references ONLY entity_snapshots
        self._assert_snapshot_fk(events, self.snapshots, "transition_events")
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

    def finish_run(self, run_key, *, status, completed_at, counters, errors,
                   metadata=None):
        self._maybe_fail("finish_run")
        row = self.runs.setdefault(run_key, {"run_key": run_key})
        row.update(counters)
        row.update({"status": status, "completed_at": completed_at,
                    "error_count": len(errors), "errors": errors or None})
        if metadata is not None:
            row["metadata"] = metadata

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
            "institutional_relationships": len(self.relationships),
            "relationship_snapshots": len(self.rel_snapshots),
            "relationship_transitions": len(self.rel_transitions),
            "narrative_snapshots": len(self.narr_snapshots),
            "narrative_transitions": len(self.narr_transitions),
        }[table]

    def latest_run(self, status=None):
        rows = [r for r in self.runs.values()
                if status is None or r.get("status") == status]
        rows.sort(key=lambda r: r.get("started_at") or "", reverse=True)
        return rows[0] if rows else None

    # archive-wide reads (M3.4 reasoning)
    def fetch_table_snapshots_between_paged(self, table, date_from, date_to,
                                            snapshot_kind, schema_version,
                                            page_size=1000, max_rows=50000):
        self._maybe_fail("fetch_table_snapshots_between_paged")
        return self.fetch_table_snapshots_between(
            table, date_from, date_to, snapshot_kind, schema_version)

    def fetch_transitions_between(self, table, uid_col, date_from, date_to,
                                  page_size=1000, max_rows=50000):
        self._maybe_fail("fetch_transitions_between")
        store = {"relationship_transitions": self.rel_transitions,
                 "narrative_transitions": self.narr_transitions}.get(table, self.transitions)
        rows = [r for r in store.values()
                if date_from <= str(r["effective_at"])[:10] <= date_to]
        return sorted(rows, key=lambda r: r["effective_at"])

    def earliest_snapshot_date(self):
        self._maybe_fail("earliest_snapshot_date")
        dates = sorted(r["snapshot_date"] for r in self.snapshots.values())
        return dates[0] if dates else None

    # prediction & outcome ledger (M3.3)
    def insert_predictions(self, rows):
        self._maybe_fail("insert_predictions")
        for row in rows:
            row = dict(row)
            if row["prediction_uid"] in self.predictions:
                continue   # ignore-duplicates on prediction_uid
            boundary_key = (row["subject_uid"], row["prediction_type"],
                            row["scope_key"], row["issuance_boundary"],
                            row["schema_version"])
            for existing in self.predictions.values():
                if (existing["subject_uid"], existing["prediction_type"],
                        existing["scope_key"], existing["issuance_boundary"],
                        existing["schema_version"]) == boundary_key:
                    raise RepositoryError(
                        "supabase POST prediction_records failed: HTTP 409 duplicate "
                        "(subject_uid, prediction_type, scope_key, issuance_boundary)")
            row["id"] = str(uuid.uuid4())
            self.predictions[row["prediction_uid"]] = row
        return len(rows)

    def fetch_predictions_issued_on(self, boundary):
        self._maybe_fail("fetch_predictions_issued_on")
        return {(r["subject_uid"], r["prediction_type"], r["scope_key"])
                for r in self.predictions.values()
                if r["issuance_boundary"] == boundary}

    def fetch_due_predictions(self, now_iso, limit=500):
        self._maybe_fail("fetch_due_predictions")
        rows = [r for r in self.predictions.values()
                if r["status"] == "active" and r["resolve_after"] <= now_iso]
        return sorted(rows, key=lambda r: r["resolve_after"])[:limit]

    def get_prediction(self, prediction_uid):
        self._maybe_fail("get_prediction")
        return self.predictions.get(prediction_uid)

    def list_predictions(self, *, subject_uid=None, prediction_type=None,
                         status=None, date_from=None, date_to=None,
                         order_desc=True, limit=90):
        self._maybe_fail("list_predictions")
        rows = list(self.predictions.values())
        if subject_uid:
            rows = [r for r in rows if r["subject_uid"] == subject_uid]
        if prediction_type:
            rows = [r for r in rows if r["prediction_type"] == prediction_type]
        if status:
            rows = [r for r in rows if r["status"] == status]
        if date_from:
            rows = [r for r in rows if r["issuance_boundary"] >= date_from]
        if date_to:
            rows = [r for r in rows if r["issuance_boundary"] <= date_to]
        rows.sort(key=lambda r: r["issued_at"], reverse=order_desc)
        return rows[:limit]

    def update_prediction_status(self, prediction_uid, status, now_iso):
        self._maybe_fail("update_prediction_status")
        row = self.predictions[prediction_uid]
        row["status"] = status                     # status columns ONLY
        row["status_updated_at"] = now_iso

    def insert_outcomes(self, rows):
        self._maybe_fail("insert_outcomes")
        for row in rows:
            if row["outcome_uid"] in self.outcomes:
                continue   # ignore-duplicates
            row = dict(row)
            row["id"] = str(uuid.uuid4())
            self.outcomes[row["outcome_uid"]] = row
        return len(rows)

    def get_outcome_for_prediction(self, prediction_uid):
        self._maybe_fail("get_outcome_for_prediction")
        for r in self.outcomes.values():
            if r["prediction_uid"] == prediction_uid:
                return r
        return None

    def list_outcomes(self, *, prediction_type=None, verdict=None,
                      subject_uid=None, order_desc=True, limit=90):
        self._maybe_fail("list_outcomes")
        rows = list(self.outcomes.values())
        if prediction_type:
            rows = [r for r in rows if r["prediction_type"] == prediction_type]
        if verdict:
            rows = [r for r in rows if r["verdict"] == verdict]
        if subject_uid:
            rows = [r for r in rows if r["subject_uid"] == subject_uid]
        rows.sort(key=lambda r: r["observed_at"], reverse=order_desc)
        return rows[:limit]

    def fetch_calibration_rows(self, prediction_type=None, limit=2000):
        self._maybe_fail("fetch_calibration_rows")
        rows = []
        for o in self.outcomes.values():
            p = self.predictions.get(o["prediction_uid"], {})
            if prediction_type and o["prediction_type"] != prediction_type:
                continue
            rows.append({"prediction_type": o["prediction_type"],
                         "verdict": o["verdict"],
                         "probability": p.get("probability"),
                         "score": o.get("score"),
                         "schema_version": o.get("schema_version")})
        return rows[:limit]

    def get_resolution_run(self, run_key):
        self._maybe_fail("get_resolution_run")
        return self.resolution_runs.get(run_key)

    def start_resolution_run(self, run_key, started_at, metadata):
        self._maybe_fail("start_resolution_run")
        if run_key not in self.resolution_runs:
            self.resolution_runs[run_key] = {
                "run_key": run_key, "started_at": started_at,
                "status": "running", "metadata": metadata,
            }

    def finish_resolution_run(self, run_key, *, status, completed_at, counters, errors):
        self._maybe_fail("finish_resolution_run")
        row = self.resolution_runs.setdefault(run_key, {"run_key": run_key})
        row.update(counters)
        row.update({"status": status, "completed_at": completed_at,
                    "errors": errors or None})

    def latest_snapshot_date(self):
        self._maybe_fail("latest_snapshot_date")
        dates = sorted(r["snapshot_date"] for r in self.snapshots.values())
        return dates[-1] if dates else None

    def recent_run_errors(self, limit=5):
        rows = [r for r in self.runs.values() if r.get("status") == "failed"]
        rows.sort(key=lambda r: r.get("started_at") or "", reverse=True)
        return rows[:limit]


def make_activation(**overrides) -> SimpleNamespace:
    """An IndustryActivation-shaped object."""
    base = dict(
        industry="Utilities",
        score=62,
        sentiment="bullish",
        active_story_count=5,
        momentum_label="strengthening",
        confidence_label="Elevated",
    )
    base.update(overrides)
    return SimpleNamespace(**base)


def make_feed(themes=None, activations=None, regime="AI Capex Expansion") -> SimpleNamespace:
    """A ProcessedFeed-shaped object sufficient for build_narrative_graph."""
    if themes is None:
        themes = [
            make_theme(),
            make_theme(id="treasury-yield-pressure", name="Higher-for-Longer",
                       confidence=60, momentum_direction="bearish",
                       related_industries=["Financials", "Utilities", "Real Estate"],
                       related_assets=["TLT", "JPM"],
                       related_macro_factors=["Power Load Growth", "Terminal Rate"],
                       relationship_weights={"Financials": {"weight": 0.7,
                                                            "direction": "positive"}},
                       causal_narrative="Rates → duration repricing",
                       contributing_cluster_ids=["c9"]),
        ]
    if activations is None:
        activations = [make_activation(),
                       make_activation(industry="Semiconductors", score=48)]
    return SimpleNamespace(
        theme_intelligence=themes,
        industry_activation=activations,
        sector_data=SimpleNamespace(derived_regime=regime, dominant_sector=None,
                                    rotation_signals=[]),
        market_brief=None,
        items=[],
    )


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
def ledger_settings(enabled_settings, monkeypatch):
    """Institutional memory + prediction ledger enabled, all M3.3 types on."""
    monkeypatch.setattr(enabled_settings, "prediction_ledger_enabled", True)
    monkeypatch.setattr(enabled_settings, "prediction_types_enabled",
                        "relationship_persistence,narrative_membership,conviction_threshold")
    return enabled_settings


@pytest.fixture
def fresh_theme_memory(monkeypatch, tmp_path):
    """Point the ThemeMemory singleton at an empty temp store."""
    from app import theme_memory as tm
    store = tm.ThemeMemoryStore(tmp_path / "theme_memory.json")
    monkeypatch.setattr(tm, "theme_memory", store)
    return store
