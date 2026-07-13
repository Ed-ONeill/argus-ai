"""
app/institutional_memory/repository.py — Supabase persistence layer (M3.1).

Talks to Supabase PostgREST (`{SUPABASE_URL}/rest/v1`) with the backend
service-role key via httpx (already a project dependency — no new packages).
This module is the ONLY place institutional-memory SQL tables are touched;
neither theme_graph.py nor background.py may call the database directly.

Security invariants:
  • The service-role key is sent only as request headers and is never logged;
    error paths log status codes and PostgREST error messages, never headers.
  • All methods raise RepositoryError on failure — no silent failures. The
    writer decides failure policy (log, record, retry next cycle).
"""

from __future__ import annotations

import logging
from typing import Any

import httpx

from app.institutional_memory.models import EntityRecord, SnapshotRecord, TransitionEvent

log = logging.getLogger(__name__)

_TIMEOUT = 15.0   # seconds; the writer runs on the background thread, never on a request path


class RepositoryError(RuntimeError):
    """Raised for any Supabase failure. Message is safe to log (no secrets)."""


class SupabaseRepository:
    """Thin, typed PostgREST client for the four M3.1 tables."""

    def __init__(self, url: str, service_role_key: str, *,
                 transport: httpx.BaseTransport | None = None) -> None:
        if not url or not service_role_key:
            raise RepositoryError("Supabase repository constructed without url/key")
        self._base = url.rstrip("/") + "/rest/v1"
        self._headers = {
            "apikey": service_role_key,
            "Authorization": f"Bearer {service_role_key}",
            "Content-Type": "application/json",
        }
        # transport injection is for tests (httpx.MockTransport) only.
        self._client = httpx.Client(headers=self._headers, timeout=_TIMEOUT,
                                    transport=transport)

    def close(self) -> None:
        self._client.close()

    # ── low-level ────────────────────────────────────────────────────────────

    def _request(self, method: str, table: str, *, params: dict | None = None,
                 json_body: Any = None, prefer: str | None = None) -> httpx.Response:
        headers = {"Prefer": prefer} if prefer else {}
        try:
            resp = self._client.request(
                method, f"{self._base}/{table}", params=params, json=json_body,
                headers=headers,
            )
        except httpx.HTTPError as exc:
            raise RepositoryError(f"supabase {method} {table} transport error: "
                                  f"{type(exc).__name__}: {exc}") from exc
        if resp.status_code >= 400:
            # PostgREST bodies contain error message/hint but never credentials.
            raise RepositoryError(
                f"supabase {method} {table} failed: HTTP {resp.status_code} "
                f"{resp.text[:300]}"
            )
        return resp

    def _rows(self, resp: httpx.Response) -> list[dict]:
        if not resp.content:
            return []
        data = resp.json()
        return data if isinstance(data, list) else []

    # ── entities ─────────────────────────────────────────────────────────────

    def fetch_entities(self, uids: list[str]) -> dict[str, dict]:
        if not uids:
            return {}
        resp = self._request("GET", "institutional_entities", params={
            "uid": f"in.({','.join(uids)})",
            "select": "uid,display_label,aliases,first_seen_at,last_seen_at",
        })
        return {r["uid"]: r for r in self._rows(resp)}

    def upsert_entities(self, entities: list[EntityRecord], now_iso: str) -> int:
        """Insert unseen entities; refresh display_label/aliases/last_seen_at
        on known ones. first_seen_at/created_at are set only on insert."""
        if not entities:
            return 0
        existing = self.fetch_entities([e.uid for e in entities])
        inserts, updates = [], []
        for e in entities:
            if e.uid in existing:
                updates.append(e)
            else:
                inserts.append({
                    "uid": e.uid,
                    "entity_type": e.entity_type,
                    "namespace": e.namespace,
                    "canonical_key": e.canonical_key,
                    "display_label": e.display_label,
                    "aliases": sorted(set(e.aliases)),
                    "status": "active",
                    "first_seen_at": e.first_seen_at or now_iso,
                    "last_seen_at": e.last_seen_at or now_iso,
                })
        if inserts:
            # ignore-duplicates guards the race where two processes insert
            # the same uid; identity rows are immutable on conflict.
            self._request("POST", "institutional_entities", json_body=inserts,
                          params={"on_conflict": "uid"},
                          prefer="resolution=ignore-duplicates,return=minimal")
        for e in updates:
            prev = existing[e.uid]
            merged_aliases = sorted(set((prev.get("aliases") or []) + list(e.aliases)))
            patch: dict[str, Any] = {
                "last_seen_at": e.last_seen_at or now_iso,
                "updated_at": now_iso,
            }
            if e.display_label and e.display_label != prev.get("display_label"):
                patch["display_label"] = e.display_label
                old = prev.get("display_label")
                if old and old not in merged_aliases:
                    merged_aliases.append(old)
                    merged_aliases.sort()
            if merged_aliases != sorted(prev.get("aliases") or []):
                patch["aliases"] = merged_aliases
            self._request("PATCH", "institutional_entities",
                          params={"uid": f"eq.{e.uid}"}, json_body=patch,
                          prefer="return=minimal")
        return len(entities)

    # ── snapshots (generic over the three snapshot tables) ───────────────────

    def fetch_table_snapshots_for_date(self, table: str, uid_col: str,
                                       snapshot_date: str, snapshot_kind: str,
                                       schema_version: int) -> dict[str, dict]:
        resp = self._request("GET", table, params={
            "snapshot_date": f"eq.{snapshot_date}",
            "snapshot_kind": f"eq.{snapshot_kind}",
            "schema_version": f"eq.{schema_version}",
            "select": f"id,{uid_col},payload_hash",
        })
        return {r[uid_col]: r for r in self._rows(resp)}

    def fetch_table_snapshots_between(self, table: str, date_from: str, date_to: str,
                                      snapshot_kind: str, schema_version: int) -> list[dict]:
        """All daily snapshots with date_from <= snapshot_date <= date_to,
        full rows, oldest first. Used for sealed-boundary transitions + replay."""
        resp = self._request("GET", table, params={
            "and": f"(snapshot_date.gte.{date_from},snapshot_date.lte.{date_to})",
            "snapshot_kind": f"eq.{snapshot_kind}",
            "schema_version": f"eq.{schema_version}",
            "select": "*",
            "order": "snapshot_date.asc",
        })
        return self._rows(resp)

    def insert_table_snapshot(self, table: str, uid_col: str, row: dict) -> None:
        self._request("POST", table, json_body=row,
                      params={"on_conflict": f"{uid_col},snapshot_date,snapshot_kind,schema_version"},
                      prefer="resolution=ignore-duplicates,return=minimal")

    def update_table_snapshot(self, table: str, snapshot_id: str, row: dict,
                              now_iso: str) -> None:
        """Mutable-until-sealed daily update. Callers must never pass a row
        whose snapshot_date is before the current UTC date."""
        row = dict(row)
        row["updated_at"] = now_iso
        self._request("PATCH", table,
                      params={"id": f"eq.{snapshot_id}"}, json_body=row,
                      prefer="return=minimal")

    # M3.1 signatures preserved (delegate to the generic helpers)

    def fetch_snapshots_for_date(self, snapshot_date: str, snapshot_kind: str,
                                 schema_version: int,
                                 select: str = "id,entity_uid,payload_hash") -> dict[str, dict]:
        return self.fetch_table_snapshots_for_date(
            "entity_snapshots", "entity_uid", snapshot_date, snapshot_kind, schema_version)

    def fetch_snapshots_between(self, date_from: str, date_to: str,
                                snapshot_kind: str, schema_version: int) -> list[dict]:
        return self.fetch_table_snapshots_between(
            "entity_snapshots", date_from, date_to, snapshot_kind, schema_version)

    def insert_snapshot(self, snapshot: SnapshotRecord) -> None:
        self.insert_table_snapshot("entity_snapshots", "entity_uid", snapshot.to_row())

    def update_snapshot(self, snapshot_id: str, snapshot: SnapshotRecord,
                        now_iso: str) -> None:
        self.update_table_snapshot("entity_snapshots", snapshot_id, snapshot.to_row(), now_iso)

    # ── relationships (M3.2) ─────────────────────────────────────────────────

    def fetch_relationships(self, rel_uids: list[str]) -> dict[str, dict]:
        if not rel_uids:
            return {}
        resp = self._request("GET", "institutional_relationships", params={
            "rel_uid": f"in.({','.join(rel_uids)})",
            "select": "rel_uid,status,first_seen_at,last_seen_at",
        })
        return {r["rel_uid"]: r for r in self._rows(resp)}

    def upsert_relationships(self, relationships: list, now_iso: str) -> int:
        """Insert unseen relationship identities; refresh last_seen_at and
        reactivate on known ones. first_seen_at is set only on insert."""
        if not relationships:
            return 0
        existing = self.fetch_relationships([r.rel_uid for r in relationships])
        inserts = []
        for r in relationships:
            if r.rel_uid in existing:
                self._request("PATCH", "institutional_relationships",
                              params={"rel_uid": f"eq.{r.rel_uid}"},
                              json_body={"last_seen_at": r.last_seen_at or now_iso,
                                         "status": "active",
                                         "updated_at": now_iso},
                              prefer="return=minimal")
            else:
                inserts.append({
                    "rel_uid": r.rel_uid,
                    "source_uid": r.source_uid,
                    "target_uid": r.target_uid,
                    "relationship_type": r.relationship_type,
                    "direction": r.direction,
                    "status": "active",
                    "first_seen_at": r.first_seen_at or now_iso,
                    "last_seen_at": r.last_seen_at or now_iso,
                })
        if inserts:
            self._request("POST", "institutional_relationships", json_body=inserts,
                          params={"on_conflict": "rel_uid"},
                          prefer="resolution=ignore-duplicates,return=minimal")
        return len(relationships)

    def relationships_for_entity(self, entity_uid: str, limit: int = 200) -> list[dict]:
        resp = self._request("GET", "institutional_relationships", params={
            "or": f"(source_uid.eq.{entity_uid},target_uid.eq.{entity_uid})",
            "select": "*",
            "order": "rel_uid.asc",
            "limit": str(limit),
        })
        return self._rows(resp)

    def insert_relationship_transitions(self, events: list) -> int:
        if not events:
            return 0
        self._request("POST", "relationship_transitions",
                      json_body=[e.to_row(uid_column="rel_uid") for e in events],
                      params={"on_conflict": "event_key"},
                      prefer="resolution=ignore-duplicates,return=minimal")
        return len(events)

    def bootstrap_snapshot_exists(self, entity_uid: str) -> bool:
        resp = self._request("GET", "entity_snapshots", params={
            "entity_uid": f"eq.{entity_uid}",
            "snapshot_kind": "eq.bootstrap_baseline",
            "select": "id",
            "limit": "1",
        })
        return bool(self._rows(resp))

    # ── transitions ──────────────────────────────────────────────────────────

    def insert_transitions(self, events: list[TransitionEvent]) -> int:
        if not events:
            return 0
        self._request("POST", "transition_events",
                      json_body=[e.to_row() for e in events],
                      params={"on_conflict": "event_key"},
                      prefer="resolution=ignore-duplicates,return=minimal")
        return len(events)

    # ── prediction & outcome ledger (M3.3) ───────────────────────────────────

    def insert_predictions(self, rows: list[dict]) -> int:
        """Idempotent issuance: duplicates on prediction_uid are ignored, and
        the (subject, type, boundary) unique constraint is the DB backstop."""
        if not rows:
            return 0
        self._request("POST", "prediction_records", json_body=rows,
                      params={"on_conflict": "prediction_uid"},
                      prefer="resolution=ignore-duplicates,return=minimal")
        return len(rows)

    def fetch_predictions_issued_on(self, boundary: str) -> set[tuple[str, str, str]]:
        resp = self._request("GET", "prediction_records", params={
            "issuance_boundary": f"eq.{boundary}",
            "select": "subject_uid,prediction_type,scope_key",
        })
        return {(r["subject_uid"], r["prediction_type"], r["scope_key"])
                for r in self._rows(resp)}

    def fetch_due_predictions(self, now_iso: str, limit: int = 500) -> list[dict]:
        resp = self._request("GET", "prediction_records", params={
            "status": "eq.active",
            "resolve_after": f"lte.{now_iso}",
            "select": "*",
            "order": "resolve_after.asc",
            "limit": str(limit),
        })
        return self._rows(resp)

    def get_prediction(self, prediction_uid: str) -> dict | None:
        resp = self._request("GET", "prediction_records", params={
            "prediction_uid": f"eq.{prediction_uid}",
            "select": "*", "limit": "1",
        })
        rows = self._rows(resp)
        return rows[0] if rows else None

    def list_predictions(self, *, subject_uid: str | None = None,
                         prediction_type: str | None = None,
                         status: str | None = None,
                         date_from: str | None = None, date_to: str | None = None,
                         order_desc: bool = True, limit: int = 90) -> list[dict]:
        params: dict[str, str] = {
            "select": "*",
            "order": f"issued_at.{'desc' if order_desc else 'asc'}",
            "limit": str(limit),
        }
        if subject_uid:
            params["subject_uid"] = f"eq.{subject_uid}"
        if prediction_type:
            params["prediction_type"] = f"eq.{prediction_type}"
        if status:
            params["status"] = f"eq.{status}"
        conds = []
        if date_from:
            conds.append(f"issuance_boundary.gte.{date_from}")
        if date_to:
            conds.append(f"issuance_boundary.lte.{date_to}")
        if conds:
            params["and"] = f"({','.join(conds)})"
        return self._rows(self._request("GET", "prediction_records", params=params))

    def update_prediction_status(self, prediction_uid: str, status: str,
                                 now_iso: str) -> None:
        """Status columns ONLY — the issued prediction payload is immutable."""
        self._request("PATCH", "prediction_records",
                      params={"prediction_uid": f"eq.{prediction_uid}"},
                      json_body={"status": status, "status_updated_at": now_iso},
                      prefer="return=minimal")

    def insert_outcomes(self, rows: list[dict]) -> int:
        if not rows:
            return 0
        self._request("POST", "outcome_records", json_body=rows,
                      params={"on_conflict": "outcome_uid"},
                      prefer="resolution=ignore-duplicates,return=minimal")
        return len(rows)

    def get_outcome_for_prediction(self, prediction_uid: str) -> dict | None:
        resp = self._request("GET", "outcome_records", params={
            "prediction_uid": f"eq.{prediction_uid}",
            "select": "*", "limit": "1",
        })
        rows = self._rows(resp)
        return rows[0] if rows else None

    def list_outcomes(self, *, prediction_type: str | None = None,
                      verdict: str | None = None, subject_uid: str | None = None,
                      order_desc: bool = True, limit: int = 90) -> list[dict]:
        params: dict[str, str] = {
            "select": "*",
            "order": f"observed_at.{'desc' if order_desc else 'asc'}",
            "limit": str(limit),
        }
        if prediction_type:
            params["prediction_type"] = f"eq.{prediction_type}"
        if verdict:
            params["verdict"] = f"eq.{verdict}"
        if subject_uid:
            params["subject_uid"] = f"eq.{subject_uid}"
        return self._rows(self._request("GET", "outcome_records", params=params))

    def fetch_calibration_rows(self, prediction_type: str | None = None,
                               limit: int = 2000) -> list[dict]:
        """Rows from prediction_calibration_view that HAVE an outcome, mapped
        to the shape compute_calibration expects."""
        params: dict[str, str] = {
            "select": "prediction_type,verdict,probability,score,outcome_schema_version",
            "verdict": "not.is.null",
            "limit": str(limit),
        }
        if prediction_type:
            params["prediction_type"] = f"eq.{prediction_type}"
        rows = self._rows(self._request("GET", "prediction_calibration_view",
                                        params=params))
        return [{"prediction_type": r["prediction_type"], "verdict": r["verdict"],
                 "probability": r["probability"], "score": r["score"],
                 "schema_version": r["outcome_schema_version"]} for r in rows]

    def get_resolution_run(self, run_key: str) -> dict | None:
        resp = self._request("GET", "prediction_resolution_runs", params={
            "run_key": f"eq.{run_key}", "select": "run_key,status", "limit": "1",
        })
        rows = self._rows(resp)
        return rows[0] if rows else None

    def start_resolution_run(self, run_key: str, started_at: str,
                             metadata: dict | None) -> None:
        self._request("POST", "prediction_resolution_runs", json_body={
            "run_key": run_key, "started_at": started_at,
            "status": "running", "metadata": metadata,
        }, params={"on_conflict": "run_key"},
            prefer="resolution=ignore-duplicates,return=minimal")

    def finish_resolution_run(self, run_key: str, *, status: str, completed_at: str,
                              counters: dict, errors: list[str]) -> None:
        body = dict(counters)
        body.update({"status": status, "completed_at": completed_at,
                     "errors": errors or None})
        self._request("PATCH", "prediction_resolution_runs",
                      params={"run_key": f"eq.{run_key}"}, json_body=body,
                      prefer="return=minimal")

    # ── write runs ───────────────────────────────────────────────────────────

    def get_run(self, run_key: str) -> dict | None:
        resp = self._request("GET", "memory_write_runs", params={
            "run_key": f"eq.{run_key}",
            "select": "run_key,status,completed_at",
            "limit": "1",
        })
        rows = self._rows(resp)
        return rows[0] if rows else None

    def start_run(self, run_key: str, writer_version: str, started_at: str,
                  cycle_id: str | None, metadata: dict | None) -> None:
        self._request("POST", "memory_write_runs", json_body={
            "run_key": run_key,
            "cycle_id": cycle_id,
            "writer_version": writer_version,
            "started_at": started_at,
            "status": "running",
            "metadata": metadata,
        }, params={"on_conflict": "run_key"},
            prefer="resolution=ignore-duplicates,return=minimal")

    def finish_run(self, run_key: str, *, status: str, completed_at: str,
                   counters: dict, errors: list[str],
                   metadata: dict | None = None) -> None:
        body = dict(counters)
        body.update({
            "status": status,
            "completed_at": completed_at,
            "error_count": len(errors),
            "errors": errors or None,
        })
        if metadata is not None:
            body["metadata"] = metadata
        self._request("PATCH", "memory_write_runs",
                      params={"run_key": f"eq.{run_key}"}, json_body=body,
                      prefer="return=minimal")

    # ── read API + status queries ────────────────────────────────────────────

    def list_table_snapshots(self, table: str, uid_col: str, uid: str, *,
                             date_from: str | None, date_to: str | None,
                             order_desc: bool, limit: int) -> list[dict]:
        params: dict[str, str] = {
            uid_col: f"eq.{uid}",
            "select": "*",
            "order": f"snapshot_date.{'desc' if order_desc else 'asc'},observed_at.{'desc' if order_desc else 'asc'}",
            "limit": str(limit),
        }
        conds = []
        if date_from:
            conds.append(f"snapshot_date.gte.{date_from}")
        if date_to:
            conds.append(f"snapshot_date.lte.{date_to}")
        if conds:
            params["and"] = f"({','.join(conds)})"
        return self._rows(self._request("GET", table, params=params))

    def list_table_transitions(self, table: str, uid_col: str, uid: str, *,
                               date_from: str | None, date_to: str | None,
                               order_desc: bool, limit: int) -> list[dict]:
        params: dict[str, str] = {
            uid_col: f"eq.{uid}",
            "select": "*",
            "order": f"effective_at.{'desc' if order_desc else 'asc'}",
            "limit": str(limit),
        }
        conds = []
        if date_from:
            conds.append(f"effective_at.gte.{date_from}")
        if date_to:
            conds.append(f"effective_at.lte.{date_to}T23:59:59Z")
        if conds:
            params["and"] = f"({','.join(conds)})"
        return self._rows(self._request("GET", table, params=params))

    def list_snapshots(self, entity_uid: str, *, date_from: str | None,
                       date_to: str | None, order_desc: bool, limit: int) -> list[dict]:
        return self.list_table_snapshots("entity_snapshots", "entity_uid", entity_uid,
                                         date_from=date_from, date_to=date_to,
                                         order_desc=order_desc, limit=limit)

    def list_transitions(self, entity_uid: str, *, date_from: str | None,
                         date_to: str | None, order_desc: bool, limit: int) -> list[dict]:
        return self.list_table_transitions("transition_events", "entity_uid", entity_uid,
                                           date_from=date_from, date_to=date_to,
                                           order_desc=order_desc, limit=limit)

    def latest_snapshot(self, entity_uid: str) -> dict | None:
        rows = self.list_snapshots(entity_uid, date_from=None, date_to=None,
                                   order_desc=True, limit=1)
        return rows[0] if rows else None

    def count(self, table: str) -> int:
        resp = self._request("GET", table, params={"select": "*", "limit": "1"},
                             prefer="count=exact")
        content_range = resp.headers.get("content-range", "")
        # format: "0-0/57" or "*/0"
        try:
            return int(content_range.rsplit("/", 1)[1])
        except (IndexError, ValueError):
            raise RepositoryError(f"count({table}): unparseable content-range "
                                  f"{content_range!r}")

    def latest_run(self, status: str | None = None) -> dict | None:
        params = {"select": "*", "order": "started_at.desc", "limit": "1"}
        if status:
            params["status"] = f"eq.{status}"
        rows = self._rows(self._request("GET", "memory_write_runs", params=params))
        return rows[0] if rows else None

    def recent_run_errors(self, limit: int = 5) -> list[dict]:
        rows = self._rows(self._request("GET", "memory_write_runs", params={
            "status": "eq.failed",
            "select": "run_key,started_at,completed_at,error_count,errors",
            "order": "started_at.desc",
            "limit": str(limit),
        }))
        return rows

    def latest_snapshot_date(self) -> str | None:
        rows = self._rows(self._request("GET", "entity_snapshots", params={
            "select": "snapshot_date",
            "order": "snapshot_date.desc",
            "limit": "1",
        }))
        return rows[0]["snapshot_date"] if rows else None
