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
    derive_narrative_transitions,
    derive_presence_transitions,
    derive_relationship_transitions,
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
        self._ledger_disabled_logged = False
        self._transitions_done_for: str | None = None   # UTC date transitions were sealed for
        self._issuance_done_for: str | None = None      # UTC date predictions were issued for
        self._resolution_done_for: str | None = None    # UTC date outcomes were resolved for

    def _repository(self) -> SupabaseRepository:
        if self._repo is None:
            self._repo = self._repo_factory()
        return self._repo

    # ── entry point ──────────────────────────────────────────────────────────

    def record_cycle(self, themes: list, now: datetime | None = None,
                     feed: object | None = None) -> WriteRunResult | None:
        """Persist this cycle's canonical state. Never raises.

        `feed` (the assembled ProcessedFeed) enables the M3.2 stage: entity /
        narrative / relationship history derived from the backend graph. When
        feed is None only the M3.1 theme stage runs (bootstrap parity)."""
        enabled, reason = memory_config_status()
        if not enabled:
            if not self._disabled_logged:
                log.info("[institutional-memory] disabled reason=%s", reason)
                self._disabled_logged = True
            return None            # None means DISABLED — and only disabled.

        with self._lock:
            try:
                return self._record_cycle_locked(themes or [], now or utc_now(), feed)
            except Exception as exc:
                # Absolute backstop: the memory layer must never break the
                # pipeline. A FAILURE must not masquerade as disabled (None), so
                # return an explicit failed result. The message is a bounded,
                # secret-free exception summary (never a raw response body).
                log.exception("[institutional-memory] write_failed unexpected error")
                failed = WriteRunResult(run_key="unknown", status="failed")
                failed.add_error(f"{type(exc).__name__}: unexpected writer error")
                return failed

    def _record_cycle_locked(self, themes: list, now: datetime,
                             feed: object | None) -> WriteRunResult:
        from app import theme_memory as tm

        today = now.date().isoformat()
        cycle_id = now.strftime("%Y%m%dT%H%M")

        # ── OP2.2 [C8] — dual-referencing map ─────────────────────────────────
        # Sealed evidence refs carry the durable event uid ALONGSIDE the legacy
        # cluster id from the first uid deployment: no new archive record may
        # reference only an ephemeral id. Folded cluster ids resolve to their
        # keeper's uid. Historical records are never touched.
        cluster_uid_map: dict[str, str] = {}
        for ev in (getattr(feed, "events", None) or []):
            uid = getattr(ev, "uid", "") or ""
            if not uid:
                continue
            cluster_uid_map[getattr(ev, "id", "") or ""] = uid
            for cid in (getattr(ev, "merged_event_ids", None) or []):
                cluster_uid_map[cid] = uid

        # ── build deterministic snapshots ─────────────────────────────────────
        snapshots: list[SnapshotRecord] = []
        entities: list[EntityRecord] = []
        summaries: dict[str, dict] = {}
        for theme in themes:
            tid = getattr(theme, "id", None)
            if not tid:
                continue
            try:
                summary = tm.summarize_theme(tid)
            except Exception:
                summary = None
            if summary:
                summaries[tid] = summary
            try:
                snap = build_theme_snapshot(theme, summary, now,
                                            provenance_extra={"cycle_id": cycle_id},
                                            cluster_uid_map=cluster_uid_map)
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

        # ── M3.2: derive graph/narrative/relationship state from the feed ────
        graph_state = None
        if feed is not None:
            try:
                from app.institutional_memory.graph_adapter import build_graph_cycle_state
                graph_state = build_graph_cycle_state(
                    feed, now, memory_summaries=summaries,
                    provenance_extra={"cycle_id": cycle_id},
                    cluster_uid_map=cluster_uid_map)
            except Exception:
                # M3.2 derivation failure must never block M3.1 writes.
                log.exception("[institutional-memory:m3.2] graph state derivation FAILED "
                              "— continuing with theme-only write")

        pairs = [(s.entity_uid, s.payload_hash) for s in snapshots]
        if graph_state is not None:
            pairs += graph_state.uid_hash_pairs()
        run_key = run_key_for(today, pairs)
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
                # D-1 transition sealing must still run on identical-state days:
                # it seals YESTERDAY (independent of today's snapshot dedup) and
                # is the retry path when a prior cycle's seal partially failed.
                # The prediction ledger likewise gets its once-per-day chance.
                self._seal_transitions_stage(repo, result, now)
                self._prediction_stage(repo, snapshots, graph_state, result, now)
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

        # ── M3.2: entity / narrative / relationship writes ────────────────────
        if graph_state is not None:
            try:
                self._write_graph_state(repo, graph_state, result, now, today)
            except RepositoryError as exc:
                # M3.2 failure must not break M3.1 writes (already durable) or
                # the pipeline; record, log, retry next cycle.
                log.error("[institutional-memory:m3.2] write_failed: %s", exc)
                result.add_error(str(exc))

        # ── sealed-boundary transitions (once per UTC day, per-domain) ────────
        # Non-fatal + retryable: each of the three ledgers is isolated, a
        # failing domain does not fail the run or the other domains, and the
        # day is marked done only when all three succeed (see the stage).
        self._seal_transitions_stage(repo, result, now)

        # ── prediction issuance + outcome resolution (M3.3, once per UTC day) ─
        self._prediction_stage(repo, snapshots, graph_state, result, now)

        result.status = "completed" if result.error_count == 0 else "failed"
        self._finish_run_best_effort(repo, result, now)
        log.info(
            "[institutional-memory] run=%s themes=%d snapshots_inserted=%d "
            "updated=%d unchanged=%d transitions=%d status=%s",
            run_key, result.themes_seen, result.snapshots_inserted,
            result.snapshots_updated, result.snapshots_unchanged,
            result.transitions_inserted, result.status,
        )
        if graph_state is not None and result.extra:
            x = result.extra
            log.info(
                "[institutional-memory:m3.2] graph_version=%s entities=%d "
                "industries=%s relationships=%s narratives=%s",
                graph_state.graph_version, x.get("entities_upserted", 0),
                x.get("industry_snapshots"), x.get("relationship_snapshots"),
                x.get("narrative_snapshots"),
            )
        return result

    def _upsert_daily_rows(self, repo: SupabaseRepository, table: str, uid_col: str,
                           rows: list[tuple[str, str, dict]], today: str,
                           now_iso: str) -> dict:
        """Generic mutable-until-sealed upsert for one snapshot table.
        rows = [(uid, payload_hash, row_dict)]. Returns counter dict."""
        counters = {"inserted": 0, "updated": 0, "unchanged": 0}
        if not rows:
            return counters
        existing = repo.fetch_table_snapshots_for_date(
            table, uid_col, today, SNAPSHOT_KIND_DAILY, SCHEMA_VERSION)
        for uid, phash, row in rows:
            prev = existing.get(uid)
            if prev is None:
                repo.insert_table_snapshot(table, uid_col, row)
                counters["inserted"] += 1
            elif prev.get("payload_hash") == phash:
                counters["unchanged"] += 1
            else:
                repo.update_table_snapshot(table, prev["id"], row, now_iso)
                counters["updated"] += 1
        return counters

    def _write_graph_state(self, repo: SupabaseRepository, state, result: WriteRunResult,
                           now: datetime, today: str) -> None:
        """Persist the M3.2 records: entities, relationship registry, and the
        three daily snapshot families. Raises RepositoryError on failure."""
        now_iso = now.isoformat()

        n_entities = repo.upsert_entities(state.entities, now_iso)
        result.entities_upserted += n_entities
        repo.upsert_relationships(state.relationships, now_iso)

        industry = self._upsert_daily_rows(
            repo, "entity_snapshots", "entity_uid",
            [(s.entity_uid, s.payload_hash, s.to_row()) for s in state.industry_snapshots],
            today, now_iso)
        rels = self._upsert_daily_rows(
            repo, "relationship_snapshots", "rel_uid",
            [(s.rel_uid, s.payload_hash, s.to_row()) for s in state.relationship_snapshots],
            today, now_iso)
        narratives = self._upsert_daily_rows(
            repo, "narrative_snapshots", "entity_uid",
            [(s.entity_uid, s.payload_hash, s.to_row()) for s in state.narrative_snapshots],
            today, now_iso)

        # industry rows share the entity_snapshots M3.1 counters
        result.snapshots_inserted += industry["inserted"]
        result.snapshots_updated += industry["updated"]
        result.snapshots_unchanged += industry["unchanged"]
        result.extra = {
            "stage": "m3.2",
            "graph_version": state.graph_version,
            "regime": state.regime_label,
            "entities_upserted": n_entities,
            "relationships_registered": len(state.relationships),
            "industry_snapshots": industry,
            "relationship_snapshots": rels,
            "narrative_snapshots": narratives,
        }

    def _prediction_stage(self, repo: SupabaseRepository, theme_snapshots: list,
                          graph_state, result: WriteRunResult, now: datetime) -> None:
        """M3.3: issue structural predictions and resolve due outcomes, each at
        most once per UTC day. Failure is recorded and retried next cycle; it
        never blocks M3.1/M3.2 writes (which have already happened) or raises."""
        from app.institutional_memory.predictions import (
            build_candidates,
            enabled_prediction_types,
            issue_predictions,
            prediction_ledger_status,
        )
        from app.institutional_memory.resolution import run_resolution

        enabled, reason = prediction_ledger_status()
        if not enabled:
            if not self._ledger_disabled_logged:
                log.info("[prediction-ledger] disabled reason=%s", reason)
                self._ledger_disabled_logged = True
            return

        today = now.date().isoformat()
        if self._issuance_done_for != today:
            try:
                candidates = build_candidates(graph_state, theme_snapshots, now,
                                              enabled_prediction_types())
                counters = issue_predictions(repo, candidates, now)
                result.extra["m3_3_issuance"] = counters
                self._issuance_done_for = today
            except RepositoryError as exc:
                log.error("[prediction-ledger] issuance failed (retry next cycle): %s", exc)
                result.add_error(str(exc))

        if self._resolution_done_for != today:
            try:
                res = run_resolution(repo, now)
                result.extra["m3_3_resolution"] = res
                self._resolution_done_for = today
            except RepositoryError as exc:
                log.error("[outcome-ledger] resolution_failed (retry next cycle): %s", exc)
                result.add_error(str(exc))

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
                            errors=result.errors,
                            metadata=result.extra or None)
        except RepositoryError as exc:
            log.error("[institutional-memory] could not close run ledger: %s", exc)

    # ── sealed-boundary transition derivation ─────────────────────────────────

    @staticmethod
    def _sealed_maps(rows: list[dict], uid_col: str, d1: str,
                     allow_empty_curr: bool = False):
        """Group sealed rows → (curr_by_uid at D-1, latest prior per uid,
        previous sealed day's rows). None when nothing can be compared.

        allow_empty_curr distinguishes a data gap from genuine absence: when
        the writer verifiably ran on D-1 (theme rows exist), an empty D-1 for
        narratives/relationships means they truly vanished, and presence
        events must still fire. Without that liveness signal, an empty D-1 is
        treated as a gap and produces no events."""
        by_date: dict[str, dict[str, dict]] = {}
        for r in rows:
            by_date.setdefault(r["snapshot_date"], {})[r[uid_col]] = r
        curr = by_date.get(d1)
        if not curr and not allow_empty_curr:
            return None
        prior_dates = sorted(d for d in by_date if d < d1)
        if not prior_dates:
            return None
        latest_prior: dict[str, dict] = {}
        for d in prior_dates:
            for uid, r in by_date[d].items():
                latest_prior[uid] = r   # dates ascend, so the last write wins
        return curr or {}, latest_prior, by_date[prior_dates[-1]]

    def _seal_transitions(self, repo: SupabaseRepository, now: datetime) -> dict[str, dict]:
        """Derive + insert transitions for the most recently sealed UTC day
        (D-1) across THREE independent ledgers, each routed to its OWN
        snapshot-id FK domain:

            themes/entities → transition_events        (FK → entity_snapshots)
            narratives      → narrative_transitions    (FK → narrative_snapshots)
            relationships   → relationship_transitions (FK → relationship_snapshots)

        Each domain is isolated in its own try/except: a failure in one is
        logged with its table and does NOT abort the others (the pre-fix code
        raised on narratives and thereby silently skipped relationships too).
        Idempotent via event_key. NEVER raises. Returns
        {table_name: {"inserted": int, "ok": bool}}.

        Value transitions compare each subject's D-1 snapshot against its most
        recent prior sealed snapshot within a 14-day lookback (gap-tolerant).
        Presence transitions compare D-1 against the previous sealed day that
        has any snapshots at all, so absence fires exactly once. Industry
        entity snapshots accrue history but produce NO transitions in M3.2
        (activation churns daily; a threshold model is future work).
        """
        d1 = (now.date() - timedelta(days=1)).isoformat()
        lookback_start = (now.date() - timedelta(days=1 + _ABSENCE_LOOKBACK_DAYS)).isoformat()
        seal_effective_at = f"{d1}T23:59:59+00:00"
        writer_alive_d1 = False
        domains: dict[str, dict] = {}

        # ── themes → transition_events (FK: entity_snapshots) ─────────────────
        try:
            inserted = 0
            rows = [r for r in repo.fetch_snapshots_between(
                        lookback_start, d1, SNAPSHOT_KIND_DAILY, SCHEMA_VERSION)
                    if str(r.get("entity_uid", "")).startswith("theme:")]
            maps = self._sealed_maps(rows, "entity_uid", d1)
            if maps:
                curr, latest_prior, prev_day = maps
                writer_alive_d1 = bool(curr)
                events = []
                for uid, curr_row in curr.items():
                    prev_row = latest_prior.get(uid)
                    if prev_row is not None:
                        events.extend(derive_theme_transitions(prev_row, curr_row))
                effective_at = next(iter(curr.values()))["observed_at"]
                seal_effective_at = effective_at
                events.extend(derive_status_transitions(prev_day, curr, d1, effective_at))
                inserted = repo.insert_transitions(events)
            domains["transition_events"] = {"inserted": inserted, "ok": True}
        except RepositoryError as exc:
            log.error("[institutional-memory] transition seal FAILED "
                      "domain=themes table=transition_events (retry next cycle): %s", exc)
            domains["transition_events"] = {"inserted": 0, "ok": False}

        # ── narratives → narrative_transitions (FK: narrative_snapshots) ──────
        # allow_empty_curr: a day with theme writes but zero narratives means
        # every narrative genuinely dissolved (not a data gap).
        try:
            inserted = 0
            n_rows = repo.fetch_table_snapshots_between(
                "narrative_snapshots", lookback_start, d1, SNAPSHOT_KIND_DAILY, SCHEMA_VERSION)
            maps = self._sealed_maps(n_rows, "entity_uid", d1,
                                     allow_empty_curr=writer_alive_d1)
            if maps:
                curr, latest_prior, prev_day = maps
                events = []
                for uid, curr_row in curr.items():
                    prev_row = latest_prior.get(uid)
                    if prev_row is not None:
                        events.extend(derive_narrative_transitions(prev_row, curr_row))
                effective_at = (next(iter(curr.values()))["observed_at"]
                                if curr else seal_effective_at)
                events.extend(derive_presence_transitions(
                    prev_day, curr, d1, effective_at,
                    appeared_type="narrative_appeared",
                    disappeared_type="narrative_disappeared",
                    uid_field="entity_uid"))
                # ROUTING FIX: narrative snapshot ids belong to
                # narrative_snapshots — they must NEVER go to transition_events
                # (whose FK targets entity_snapshots). Own table, own FK domain.
                inserted = repo.insert_narrative_transitions(events)
            domains["narrative_transitions"] = {"inserted": inserted, "ok": True}
        except RepositoryError as exc:
            log.error("[institutional-memory] transition seal FAILED "
                      "domain=narratives table=narrative_transitions (retry next cycle): %s", exc)
            domains["narrative_transitions"] = {"inserted": 0, "ok": False}

        # ── relationships → relationship_transitions (FK: relationship_snapshots)
        try:
            inserted = 0
            r_rows = repo.fetch_table_snapshots_between(
                "relationship_snapshots", lookback_start, d1, SNAPSHOT_KIND_DAILY, SCHEMA_VERSION)
            maps = self._sealed_maps(r_rows, "rel_uid", d1,
                                     allow_empty_curr=writer_alive_d1)
            if maps:
                curr, latest_prior, prev_day = maps
                events = []
                for uid, curr_row in curr.items():
                    prev_row = latest_prior.get(uid)
                    if prev_row is not None:
                        events.extend(derive_relationship_transitions(prev_row, curr_row))
                effective_at = (next(iter(curr.values()))["observed_at"]
                                if curr else seal_effective_at)
                events.extend(derive_presence_transitions(
                    prev_day, curr, d1, effective_at,
                    appeared_type="relationship_appeared",
                    disappeared_type="relationship_disappeared",
                    uid_field="rel_uid"))
                inserted = repo.insert_relationship_transitions(events)
            domains["relationship_transitions"] = {"inserted": inserted, "ok": True}
        except RepositoryError as exc:
            log.error("[institutional-memory] transition seal FAILED "
                      "domain=relationships table=relationship_transitions (retry next cycle): %s", exc)
            domains["relationship_transitions"] = {"inserted": 0, "ok": False}

        return domains

    def _seal_transitions_stage(self, repo: SupabaseRepository, result: WriteRunResult,
                                now: datetime) -> None:
        """Once-per-UTC-day sealing of D-1 transitions — non-fatal and
        retryable. Runs in BOTH the normal and completed-run fast paths so a
        quiet (duplicate-state) day still seals YESTERDAY. Records per-domain
        status in result.extra['transitions'] and marks the day done ONLY when
        every domain succeeded; a failed domain retries next cycle (idempotent
        via event_key). A transition failure NEVER flips the run to 'failed' —
        entity snapshots and the other domains stay durable."""
        today = now.date().isoformat()
        if self._transitions_done_for == today:
            return
        domains = self._seal_transitions(repo, now)   # never raises
        result.transitions_inserted = sum(d["inserted"] for d in domains.values())
        result.extra["transitions"] = {t: ("ok" if d["ok"] else "failed")
                                        for t, d in domains.items()}
        log.info("[institutional-memory] transition seal D-1: %s",
                 {t: f"{d['inserted']} {'ok' if d['ok'] else 'FAILED'}"
                  for t, d in domains.items()})
        if all(d["ok"] for d in domains.values()):
            self._transitions_done_for = today
        else:
            result.extra["transitions_retry"] = [t for t, d in domains.items() if not d["ok"]]


# ── Module-level singleton + convenience wrapper ───────────────────────────────

institutional_memory_writer = InstitutionalMemoryWriter()


def record_cycle(themes: list, now: datetime | None = None,
                 feed: object | None = None) -> WriteRunResult | None:
    """Persist this cycle's canonical state (non-raising). Pass the assembled
    ProcessedFeed to enable the M3.2 entity/narrative/relationship stage."""
    return institutional_memory_writer.record_cycle(themes, now, feed)


def record_cycle_status(themes: list, now: datetime | None = None,
                        feed: object | None = None) -> str:
    """Authoritative persistence-status classifier for diagnostics — DISABLED
    and FAILED can never be conflated (finding 1). The config gate, not the
    return value, decides 'disabled':

      config disabled                         → "disabled"
      enabled + successful result             → the result's own status
      enabled + writer returns None (backstop)→ "failed"
      enabled + writer raises                 → "failed"
      enabled + malformed/absent status       → "unknown_failed"
    """
    enabled, _reason = memory_config_status()
    if not enabled:
        return "disabled"
    try:
        result = record_cycle(themes, now, feed)
    except Exception:
        log.exception("[institutional-memory] status classifier caught writer error")
        return "failed"
    if result is None:
        return "failed"
    status = getattr(result, "status", None)
    return status if (isinstance(status, str) and status) else "unknown_failed"
