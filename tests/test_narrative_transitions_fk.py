"""
tests/test_narrative_transitions_fk.py — the narrative-transition FK-domain fix.

Proves each transition ledger references ONLY its own snapshot table:
    transition_events        → entity_snapshots
    narrative_transitions    → narrative_snapshots      (new, migration 007)
    relationship_transitions → relationship_snapshots
plus null appearance/disappearance semantics, cross-domain rejection,
idempotency, and per-domain failure isolation. Uses the FakeRepository, which
now enforces FK domains atomically (mirroring Postgres) — the enforcement the
missing before this fix let the bug reach production.
"""

from __future__ import annotations

import re
from pathlib import Path

import pytest

from app.institutional_memory.models import TransitionEvent
from app.institutional_memory.repository import RepositoryError

from conftest import FakeRepository

MIGRATIONS = Path(__file__).resolve().parent.parent / "supabase" / "migrations"


# ── helpers ─────────────────────────────────────────────────────────────────────

def _repo_with_snapshots() -> tuple[FakeRepository, str, str]:
    """A fake repo holding one entity_snapshot and one narrative_snapshot,
    returning their (distinct) ids."""
    repo = FakeRepository()
    repo.insert_table_snapshot("entity_snapshots", "entity_uid", {
        "entity_uid": "theme:ai", "snapshot_date": "2026-07-26", "snapshot_kind": "daily_utc",
        "schema_version": 1, "payload_hash": "h", "provenance": {}, "payload": {}})
    repo.insert_table_snapshot("narrative_snapshots", "entity_uid", {
        "entity_uid": "narrative:driverset:rates", "snapshot_date": "2026-07-26",
        "snapshot_kind": "daily_utc", "schema_version": 1, "driver_set_key": "rates",
        "member_uids": [], "payload_hash": "h", "provenance": {}, "payload": {},
        "completeness_status": "live"})
    entity_id = next(iter(repo.snapshots))
    narr_id = next(iter(repo.narr_snapshots))
    return repo, entity_id, narr_id


def _narr_event(from_id, to_id, ttype="member_added", key="k1") -> TransitionEvent:
    return TransitionEvent(
        entity_uid="narrative:driverset:rates", transition_type=ttype,
        effective_at="2026-07-26T23:59:59+00:00", basis={}, schema_version=1,
        event_key=key, from_snapshot_id=from_id, to_snapshot_id=to_id)


def _theme_event(from_id, to_id, key="t1") -> TransitionEvent:
    return TransitionEvent(
        entity_uid="theme:ai", transition_type="conviction_strengthened",
        effective_at="2026-07-26T23:59:59+00:00", basis={}, schema_version=1,
        event_key=key, from_snapshot_id=from_id, to_snapshot_id=to_id)


# ── correct routing / FK domains ────────────────────────────────────────────────

def test_narrative_snapshot_ids_satisfy_new_fk_domain():
    repo, _entity_id, narr_id = _repo_with_snapshots()
    assert repo.insert_narrative_transitions([_narr_event(narr_id, narr_id)]) == 1
    assert len(repo.narr_transitions) == 1 and len(repo.transitions) == 0


def test_theme_transitions_go_to_transition_events():
    repo, entity_id, _narr_id = _repo_with_snapshots()
    repo.insert_transitions([_theme_event(entity_id, entity_id)])
    assert len(repo.transitions) == 1 and len(repo.narr_transitions) == 0


def test_relationship_transitions_still_go_to_their_table():
    repo, _e, _n = _repo_with_snapshots()
    repo.insert_table_snapshot("relationship_snapshots", "rel_uid", {
        "rel_uid": "rel:a|drives|b", "snapshot_date": "2026-07-26",
        "snapshot_kind": "daily_utc", "schema_version": 1, "payload_hash": "h",
        "provenance": {}, "payload": {}})
    rel_id = next(iter(repo.rel_snapshots))
    ev = TransitionEvent(entity_uid="rel:a|drives|b", transition_type="relationship_strengthened",
                         effective_at="2026-07-26T23:59:59+00:00", basis={}, schema_version=1,
                         event_key="r1", from_snapshot_id=rel_id, to_snapshot_id=rel_id)
    repo.insert_relationship_transitions([ev])
    assert len(repo.rel_transitions) == 1
    assert len(repo.transitions) == 0 and len(repo.narr_transitions) == 0


# ── null appearance / disappearance semantics ───────────────────────────────────

def test_narrative_appearance_permits_null_from_snapshot_id():
    repo, _e, narr_id = _repo_with_snapshots()
    ev = _narr_event(None, narr_id, ttype="narrative_appeared", key="app")
    assert repo.insert_narrative_transitions([ev]) == 1


def test_narrative_disappearance_permits_null_to_snapshot_id():
    repo, _e, narr_id = _repo_with_snapshots()
    ev = _narr_event(narr_id, None, ttype="narrative_disappeared", key="dis")
    assert repo.insert_narrative_transitions([ev]) == 1


# ── cross-domain rejection (the actual production bug, both directions) ──────────

def test_invalid_narrative_snapshot_id_cannot_enter_transition_events():
    """A narrative_snapshots id in transition_events (FK → entity_snapshots)
    must be rejected — this is the exact production failure."""
    repo, _entity_id, narr_id = _repo_with_snapshots()
    with pytest.raises(RepositoryError, match="foreign key"):
        repo.insert_transitions([_theme_event(narr_id, narr_id, key="bad")])
    assert len(repo.transitions) == 0        # atomic: nothing persisted


def test_invalid_entity_snapshot_id_cannot_enter_narrative_transitions():
    repo, entity_id, _narr_id = _repo_with_snapshots()
    with pytest.raises(RepositoryError, match="foreign key"):
        repo.insert_narrative_transitions([_narr_event(entity_id, entity_id, key="bad")])
    assert len(repo.narr_transitions) == 0


def test_unknown_id_rejected_in_every_ledger():
    repo, _e, _n = _repo_with_snapshots()
    ghost = "00000000-0000-0000-0000-000000000000"
    with pytest.raises(RepositoryError):
        repo.insert_narrative_transitions([_narr_event(ghost, None, key="g1")])
    with pytest.raises(RepositoryError):
        repo.insert_transitions([_theme_event(ghost, None, key="g2")])


# ── idempotency ─────────────────────────────────────────────────────────────────

def test_narrative_transition_insert_is_idempotent_on_event_key():
    repo, _e, narr_id = _repo_with_snapshots()
    ev = _narr_event(narr_id, narr_id, key="same")
    repo.insert_narrative_transitions([ev])
    repo.insert_narrative_transitions([ev])   # retry same sealed record
    assert len(repo.narr_transitions) == 1


# ── per-domain failure isolation ────────────────────────────────────────────────

def test_one_domain_failure_does_not_corrupt_or_duplicate_another():
    """Narrative insert failing must not prevent theme/relationship persistence
    nor duplicate anything (mirrors the writer's per-domain isolation)."""
    repo, entity_id, narr_id = _repo_with_snapshots()
    repo.insert_transitions([_theme_event(entity_id, entity_id, key="t")])
    repo.fail_on.add("insert_narrative_transitions")
    with pytest.raises(RepositoryError):
        repo.insert_narrative_transitions([_narr_event(narr_id, narr_id, key="n")])
    # theme domain intact and not duplicated; narrative domain empty
    assert len(repo.transitions) == 1
    assert len(repo.narr_transitions) == 0


# ── migration compatibility / invariant ─────────────────────────────────────────

def test_migration_007_exists_and_targets_narrative_snapshots():
    sql = (MIGRATIONS / "007_narrative_transitions.sql").read_text(encoding="utf-8")
    assert "create table if not exists public.narrative_transitions" in sql
    assert "references public.narrative_snapshots(id)" in sql
    # backend-only posture like the other ledgers
    assert "enable row level security" in sql
    assert "revoke all on public.narrative_transitions from anon, authenticated" in sql


def test_transition_events_fk_unchanged_and_not_altered_by_007():
    fk004 = (MIGRATIONS / "004_institutional_memory.sql").read_text(encoding="utf-8")
    assert "from_snapshot_id uuid references public.entity_snapshots(id)" in fk004
    sql007 = (MIGRATIONS / "007_narrative_transitions.sql").read_text(encoding="utf-8")
    # 007 must be additive: it must not ALTER or drop transition_events FKs
    assert not re.search(r"alter\s+table\s+public\.transition_events", sql007, re.I)


def test_each_transition_ledger_targets_only_its_own_snapshot_table():
    fk004 = (MIGRATIONS / "004_institutional_memory.sql").read_text(encoding="utf-8")
    fk005 = (MIGRATIONS / "005_entity_narrative_relationship_history.sql").read_text(encoding="utf-8")
    fk007 = (MIGRATIONS / "007_narrative_transitions.sql").read_text(encoding="utf-8")
    assert "references public.entity_snapshots(id)" in fk004        # transition_events
    assert "references public.relationship_snapshots(id)" in fk005  # relationship_transitions
    assert "references public.narrative_snapshots(id)" in fk007     # narrative_transitions


# ── vocabulary drift guard (migration 008) ──────────────────────────────────────
# Derive the COMPLETE narrative transition vocabulary straight from the code
# and prove the SQL CHECK contains exactly it — so application code and the
# migration constraint can never drift apart again (the 007→production bug).

def _emitted_narrative_value_types() -> set[str]:
    """Every transition_type literal emitted by derive_narrative_transitions,
    via AST so a conditional like emit('contradiction_added' if … else
    'contradiction_removed', …) yields BOTH values."""
    import ast
    import inspect
    import textwrap
    from app.institutional_memory import transitions
    src = textwrap.dedent(inspect.getsource(transitions.derive_narrative_transitions))
    tree = ast.parse(src)
    out: set[str] = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Call) and getattr(node.func, "id", None) == "emit":
            for sub in ast.walk(node.args[0]):        # first arg = the type
                if isinstance(sub, ast.Constant) and isinstance(sub.value, str):
                    out.add(sub.value)
    return out


def _narrative_presence_types() -> set[str]:
    """The two presence types the writer passes to derive_presence_transitions
    for the narrative domain — asserted against the writer source so a rename
    there also trips this guard."""
    import inspect
    from app.institutional_memory.writer import InstitutionalMemoryWriter
    src = inspect.getsource(InstitutionalMemoryWriter._seal_transitions)
    presence = {"narrative_appeared", "narrative_disappeared"}
    for p in presence:
        assert f'"{p}"' in src or f"'{p}'" in src, f"writer no longer emits {p}"
    return presence


def _sql_check_vocab(migration: str) -> set[str]:
    sql = (MIGRATIONS / migration).read_text(encoding="utf-8")
    constraint = sql[sql.lower().index("add constraint"):]   # skip the prose header
    return set(re.findall(r"'([a-z_]+)'", constraint))


def test_migration_008_check_vocab_equals_emitted_narrative_vocab():
    emitted = _emitted_narrative_value_types() | _narrative_presence_types()
    sql = _sql_check_vocab("008_narrative_transitions_vocabulary.sql")
    assert emitted == sql, (
        f"narrative vocabulary DRIFT — emitted-but-not-in-SQL={sorted(emitted - sql)}, "
        f"in-SQL-but-never-emitted={sorted(sql - emitted)}")


def test_contradiction_types_present_regression_guard():
    """The exact production failure: contradiction_added/removed must be
    accepted by narrative_transitions."""
    sql = _sql_check_vocab("008_narrative_transitions_vocabulary.sql")
    assert {"contradiction_added", "contradiction_removed"} <= sql
    # and prove the code really does emit them (not just present in SQL)
    assert {"contradiction_added", "contradiction_removed"} <= _emitted_narrative_value_types()


def test_008_replaces_check_without_touching_table_or_other_constraints():
    raw = (MIGRATIONS / "008_narrative_transitions_vocabulary.sql").read_text(encoding="utf-8")
    # executable SQL only — strip '--' comments so prose never trips the guard
    code = "\n".join(line.split("--", 1)[0] for line in raw.splitlines()).lower()
    # replaces ONLY the narrative_transitions type check
    assert "drop constraint if exists narrative_transitions_transition_type_check" in code
    assert "add constraint narrative_transitions_transition_type_check" in code
    # additive: no table drop/recreate, no data change, nothing on other tables
    assert "drop table" not in code and "create table" not in code
    assert "delete" not in code and "truncate" not in code
    assert "transition_events" not in code and "relationship_transitions" not in code
