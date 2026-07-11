"""
app/institutional_memory/bootstrap.py — One-time baseline from ThemeMemory (M3.1).

Reads the current ThemeMemory state (Railway volume JSON — never discarded),
mints canonical theme identities, and writes ONE baseline snapshot per known
theme with provenance.source = "theme_memory_bootstrap".

Honesty rules:
  • No historical daily records are fabricated from ring-buffer observations.
  • Nothing is backdated: snapshot_date is the bootstrap run date; observed_at
    is the theme's real last_seen time.
  • completeness_status = "bootstrap" marks the baseline explicitly.

Idempotency: a theme that already has ANY bootstrap_baseline snapshot is
skipped, so the bootstrap is safe to rerun (rerunning on a later date can
never mint a second baseline). Every run is recorded in memory_write_runs
with a deterministic run_key for auditability.

Run explicitly via:  python scripts/bootstrap_institutional_memory.py [--dry-run]
"""

from __future__ import annotations

import hashlib
import logging
from datetime import datetime

from app.institutional_memory.identity import parse_uid
from app.institutional_memory.models import (
    WRITER_VERSION,
    EntityRecord,
    WriteRunResult,
    canonical_json,
    utc_now,
)
from app.institutional_memory.repository import RepositoryError, SupabaseRepository
from app.institutional_memory.snapshot_builder import build_bootstrap_snapshot
from app.institutional_memory.writer import build_repository, memory_config_status

log = logging.getLogger(__name__)


def bootstrap_from_theme_memory(
    *,
    dry_run: bool = False,
    repo: SupabaseRepository | None = None,
    now: datetime | None = None,
) -> WriteRunResult:
    """Write one honest baseline snapshot per theme known to ThemeMemory.

    Raises RepositoryError on Supabase failure (this is an explicit operator
    action, not a pipeline path — failures must be loud).
    """
    enabled, reason = memory_config_status()
    if not enabled and not dry_run:
        raise RepositoryError(f"institutional memory not enabled ({reason}) — "
                              "configure before bootstrapping")

    from app import theme_memory as tm

    now = now or utc_now()
    summaries = tm.get_all_summaries()

    snapshots, entities = [], []
    for summary in summaries:
        tid = summary.get("theme_id")
        if not tid:
            continue
        record = tm.get_theme_memory(tid)
        snap = build_bootstrap_snapshot(tid, summary, record, now)
        snapshots.append(snap)
        _etype, namespace, key = parse_uid(snap.entity_uid)
        entities.append(EntityRecord(
            uid=snap.entity_uid,
            entity_type="theme",
            namespace=namespace,
            canonical_key=key,
            display_label=summary.get("name"),
            aliases=[],
            first_seen_at=summary.get("first_seen"),
            last_seen_at=summary.get("last_seen"),
        ))

    digest = hashlib.sha256(canonical_json(
        sorted((s.entity_uid, s.payload_hash) for s in snapshots)
    ).encode("utf-8")).hexdigest()[:32]
    run_key = f"bootstrap:{digest}"
    result = WriteRunResult(run_key=run_key, themes_seen=len(snapshots))

    if dry_run:
        result.status = "dry_run"
        for s in snapshots:
            log.info("[institutional-memory] bootstrap DRY-RUN would write %s "
                     "(conviction=%s, observed_at=%s)",
                     s.entity_uid, s.conviction, s.observed_at)
        return result

    repo = repo or build_repository()
    existing_run = repo.get_run(run_key)
    if existing_run and existing_run.get("status") == "completed":
        log.info("[institutional-memory] bootstrap already completed (run=%s) — nothing to do", run_key)
        result.status = "skipped"
        result.snapshots_unchanged = len(snapshots)
        return result

    repo.start_run(run_key, WRITER_VERSION, now.isoformat(), None,
                   metadata={"source": "theme_memory_bootstrap",
                             "themes": len(snapshots)})
    try:
        result.entities_upserted = repo.upsert_entities(entities, now.isoformat())
        for snap in snapshots:
            if repo.bootstrap_snapshot_exists(snap.entity_uid):
                result.snapshots_unchanged += 1
                continue
            repo.insert_snapshot(snap)
            result.snapshots_inserted += 1
        result.status = "completed"
    except RepositoryError as exc:
        result.status = "failed"
        result.add_error(str(exc))
        raise
    finally:
        try:
            repo.finish_run(result.run_key,
                            status="completed" if result.status == "completed" else "failed",
                            completed_at=utc_now().isoformat(),
                            counters={
                                "themes_seen": result.themes_seen,
                                "entities_upserted": result.entities_upserted,
                                "snapshots_inserted": result.snapshots_inserted,
                                "snapshots_updated": 0,
                                "snapshots_unchanged": result.snapshots_unchanged,
                                "transitions_inserted": 0,
                            },
                            errors=result.errors)
        except RepositoryError:
            log.error("[institutional-memory] bootstrap: could not close run ledger")

    log.info("[institutional-memory] bootstrap run=%s themes=%d inserted=%d skipped=%d",
             run_key, result.themes_seen, result.snapshots_inserted,
             result.snapshots_unchanged)
    return result
