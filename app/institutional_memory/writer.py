"""
app/institutional_memory/writer.py — Canonical daily snapshot writer (M3.1).

Called once per background cycle (full-feed target only), AFTER theme
extraction and the ThemeMemory update have completed. One writer interface —
background.py never touches the database directly.

Daily boundary (documented honestly):
  snapshot_kind = "daily_utc". One snapshot row per theme per UTC calendar
  day. This is a UTC day, NOT U.S. market close — the writer runs on the
  5-minute cycle, so the row is updated in place while its UTC day is open
  (mutable-until-sealed) and is sealed by definition once the UTC date
  advances. The sealed row therefore holds the last observed state of that
  UTC day (~23:55Z). Sealed rows are never modified.

Idempotency:
  • run_key is deterministic over (writer version, schema version, date,
    sorted uid+payload_hash pairs): an identical re-run maps to an already
    completed run and is skipped outright.
  • Snapshot natural key (uid, date, kind, schema_version) + payload_hash
    comparison: unchanged state is counted, not rewritten.
  • Transition event_key is deterministic per (uid, type, sealed date);
    inserts use ignore-duplicates.

Failure policy:
  record_cycle NEVER raises. Supabase being down logs a visible error,
  records a failed run when possible, leaves ThemeMemory (Railway volume)
  untouched, and retries naturally on the next eligible cycle. Success is
  reported only when the writes actually happened.
"""

from __future__ import annotations

import logging
import threading
from datetime import datetime, timedelta, timezone

from app.institutional_memory.models import (
    SCHEMA_VERSION,
    SNAPSHOT_KIND_DAILY,
    WRITER_VERSION,
    EntityRecord,
    SnapshotRecord,
    WriteRunResult,
    run_key_for,
    utc_now,
)
from app.institutional_memory.identity import parse_uid
from app.institutional_memory.repository import RepositoryError, SupabaseRepository
from app.institutional_memory.snapshot_builder import build_theme_snapshot
from app.institutional_memory.transitions import (
    derive_status_transitions,
    derive_theme_transitions,
)

log = logging.getLogger(__name__)

_ABSENCE_LOOKBACK_DAYS = 14   # how far back we search for the previous sealed snapshot


def memory_config_status() -> tuple[bool, str]:
    """(enabled, reason). Never returns or logs secret values."""
    from app.config import settings
    if not settings.institutional_memory_enabled:
        return False, "disabled_by_flag"
    if not settings.supabase_url:
        return False, "missing_supabase_url"
    if not settings.supabase_service_role_key:
        return False, "missing_service_role_key"
    return True, "enabled"


def build_repository() -> SupabaseRepository:
    from app.config import settings
    return SupabaseRepository(settings.supabase_url, settings.supabase_service_role_key)


class InstitutionalMemoryWriter:
    """Single-flight writer for one process. Thread-safe via lock (the
    background thread is the only expected caller, but the lock makes retries
    and manual triggers safe)."""

    def __init__(self, repo_factory=build_repository) -> None:
        self._repo_factory = repo_factory
        self._repo: SupabaseRepository | None = None
        self._lock = threading.Lock()
        self._disabled_logged = False
        self._transitions_done_for: str | None = None   # UTC date transitions were sealed for

    def _repository(self) -> SupabaseRepository:
        if self._repo is None:
            self._repo = self._repo_factory()
        return self._repo

    # ── entry point ──────────────────────────────────────────────────────────

    def record_cycle(self, themes: list, now: datetime | None = None) -> WriteRunResult | None:
        """Persist this cycle's canonical theme state. Never raises."""
        enabled, reason = memory_config_status()
        if not enabled:
            if not self._disabled_logged:
                log.info("[institutional-memory] disabled reason=%s", reason)
                self._disabled_logged = True
            return None

        with self._lock:
            try:
                return self._record_cycle_locked(themes or [], now or utc_now())
            except Exception:
                # Absolute backstop: the memory layer must never break the pipeline.
                log.exception("[institutional-memory] write_failed unexpected error")
                return None

    def _record_cycle_locked(self, themes: list, now: datetime) -> WriteRunResult:
        from app import theme_memory as tm

        today = now.date().isoformat()
        cycle_id = now.strftime("%Y%m%dT%H%M")

        # ── build deterministic snapshots ─────────────────────────────────────
        snapshots: list[SnapshotRecord] = []
        entities: list[EntityRecord] = []
        for theme in themes:
            tid = getattr(theme, "id", None)
            if not tid:
                continue
            try:
                summary = tm.summarize_theme(tid)
            except Exception:
                summary = None
            try:
                snap = build_theme_snapshot(theme, summary, now,
                                            provenance_extra={"cycle_id": cycle_id})
            except ValueError as exc:
                log.warning("[institutional-memory] skipped theme %r: %s", tid, exc)
                continue
            snapshots.append(snap)
            _etype, namespace, key = parse_uid(snap.entity_uid)
            entities.append(EntityRecord(
                uid=snap.entity_uid,
                entity_type="theme",
                namespace=namespace,
                canonical_key=key,
                display_label=getattr(theme, "name", None),
                aliases=[],
                first_seen_at=(summary or {}).get("first_seen"),
                last_seen_at=now.isoformat(),
            ))

        run_key = run_key_for(today, [(s.entity_uid, s.payload_hash) for s in snapshots])
        result = WriteRunResult(run_key=run_key, themes_seen=len(snapshots))

        try:
            repo = self._repository()
        except RepositoryError as exc:
            log.error("[institutional-memory] write_failed repository unavailable: %s", exc)
            result.status = "failed"
            result.add_error(str(exc))
            return result

        # ── completed-run fast path ───────────────────────────────────────────
        try:
            existing_run = repo.get_run(run_key)
            if existing_run and existing_run.get("status") == "completed":
                log.debug("[institutional-memory] run=%s already completed — skipping", run_key)
                result.status = "skipped"
                result.snapshots_unchanged = len(snapshots)
                return result
            repo.start_run(run_key, WRITER_VERSION, now.isoformat(), cycle_id,
                           metadata={"snapshot_date": today, "themes": len(snapshots)})
        except RepositoryError as exc:
            log.error("[institutional-memory] write_failed cannot open run ledger: %s", exc)
            result.status = "failed"
            result.add_error(str(exc))
            return result

        # ── entities (must precede snapshots: FK) ─────────────────────────────
        try:
            result.entities_upserted = repo.upsert_entities(entities, now.isoformat())
        except RepositoryError as exc:
            log.error("[institutional-memory] write_failed entity upsert: %s", exc)
            result.status = "failed"
            result.add_error(str(exc))
            self._finish_run_best_effort(repo, result, now)
            return result

        # ── daily snapshots (mutable-until-sealed) ────────────────────────────
        try:
            existing = repo.fetch_snapshots_for_date(today, SNAPSHOT_KIND_DAILY, SCHEMA_VERSION)
            for snap in snapshots:
                row = existing.get(snap.entity_uid)
                if row is None:
                    repo.insert_snapshot(snap)
                    result.snapshots_inserted += 1
                elif row.get("payload_hash") == snap.payload_hash:
                    result.snapshots_unchanged += 1
                else:
                    repo.update_snapshot(row["id"], snap, now.isoformat())
                    result.snapshots_updated += 1
        except RepositoryError as exc:
            log.error("[institutional-memory] write_failed snapshot write: %s", exc)
            result.status = "failed"
            result.add_error(str(exc))
            self._finish_run_best_effort(repo, result, now)
            return result

        # ── sealed-boundary transitions (once per UTC day) ────────────────────
        if self._transitions_done_for != today:
            try:
                result.transitions_inserted = self._seal_transitions(repo, now)
                self._transitions_done_for = today
            except RepositoryError as exc:
                # Not fatal to the run: snapshots are safe; retry next cycle.
                log.error("[institutional-memory] transition derivation failed "
                          "(will retry next cycle): %s", exc)
                result.add_error(str(exc))

        result.status = "completed" if result.error_count == 0 else "failed"
        self._finish_run_best_effort(repo, result, now)
        log.info(
            "[institutional-memory] run=%s themes=%d snapshots_inserted=%d "
            "updated=%d unchanged=%d transitions=%d status=%s",
            run_key, result.themes_seen, result.snapshots_inserted,
            result.snapshots_updated, result.snapshots_unchanged,
            result.transitions_inserted, result.status,
        )
        return result

    def _finish_run_best_effort(self, repo: SupabaseRepository,
                                result: WriteRunResult, now: datetime) -> None:
        try:
            repo.finish_run(result.run_key,
                            status="completed" if result.status in ("completed", "skipped") else "failed",
                            completed_at=utc_now().isoformat(),
                            counters={
                                "themes_seen": result.themes_seen,
                                "entities_upserted": result.entities_upserted,
                                "snapshots_inserted": result.snapshots_inserted,
                                "snapshots_updated": result.snapshots_updated,
                                "snapshots_unchanged": result.snapshots_unchanged,
                                "transitions_inserted": result.transitions_inserted,
                            },
                            errors=result.errors)
        except RepositoryError as exc:
            log.error("[institutional-memory] could not close run ledger: %s", exc)

    # ── sealed-boundary transition derivation ─────────────────────────────────

    def _seal_transitions(self, repo: SupabaseRepository, now: datetime) -> int:
        """Derive transitions for the most recently sealed UTC day (D-1).

        Value transitions compare each theme's D-1 snapshot against its most
        recent prior sealed snapshot within a 14-day lookback (gap-tolerant).
        Presence transitions (active_status_changed) compare D-1 against the
        previous sealed day that has any snapshots at all, so absence fires
        exactly once, not every day of the lookback.
        """
        d1 = (now.date() - timedelta(days=1)).isoformat()
        lookback_start = (now.date() - timedelta(days=1 + _ABSENCE_LOOKBACK_DAYS)).isoformat()

        rows = repo.fetch_snapshots_between(lookback_start, d1,
                                            SNAPSHOT_KIND_DAILY, SCHEMA_VERSION)
        by_date: dict[str, dict[str, dict]] = {}
        for r in rows:
            by_date.setdefault(r["snapshot_date"], {})[r["entity_uid"]] = r

        curr = by_date.get(d1)
        if not curr:
            return 0   # nothing sealed for D-1 (first day of operation, or gap)

        prior_dates = sorted(d for d in by_date if d < d1)
        if not prior_dates:
            return 0   # no earlier sealed history to compare against

        # latest prior sealed row per uid (value comparisons, gap-tolerant)
        latest_prior: dict[str, dict] = {}
        for d in prior_dates:
            for uid, r in by_date[d].items():
                latest_prior[uid] = r   # dates ascend, so the last write wins

        events = []
        for uid, curr_row in curr.items():
            prev_row = latest_prior.get(uid)
            if prev_row is not None:
                events.extend(derive_theme_transitions(prev_row, curr_row))

        # presence flips: previous sealed day with data vs D-1
        prev_day_rows = by_date[prior_dates[-1]]
        effective_at = next(iter(curr.values()))["observed_at"]
        events.extend(derive_status_transitions(prev_day_rows, curr, d1, effective_at))

        return repo.insert_transitions(events)


# ── Module-level singleton + convenience wrapper ───────────────────────────────

institutional_memory_writer = InstitutionalMemoryWriter()


def record_cycle(themes: list, now: datetime | None = None) -> WriteRunResult | None:
    """Persist this cycle's canonical theme state (non-raising)."""
    return institutional_memory_writer.record_cycle(themes, now)
