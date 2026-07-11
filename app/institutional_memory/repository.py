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

    # ── snapshots ────────────────────────────────────────────────────────────

    def fetch_snapshots_for_date(self, snapshot_date: str, snapshot_kind: str,
                                 schema_version: int,
                                 select: str = "id,entity_uid,payload_hash") -> dict[str, dict]:
        resp = self._request("GET", "entity_snapshots", params={
            "snapshot_date": f"eq.{snapshot_date}",
            "snapshot_kind": f"eq.{snapshot_kind}",
            "schema_version": f"eq.{schema_version}",
            "select": select,
        })
        return {r["entity_uid"]: r for r in self._rows(resp)}

    def fetch_snapshots_between(self, date_from: str, date_to: str,
                                snapshot_kind: str, schema_version: int) -> list[dict]:
        """All daily snapshots with date_from <= snapshot_date <= date_to,
        full rows, oldest first. Used for sealed-boundary transition derivation."""
        resp = self._request("GET", "entity_snapshots", params={
            "and": f"(snapshot_date.gte.{date_from},snapshot_date.lte.{date_to})",
            "snapshot_kind": f"eq.{snapshot_kind}",
            "schema_version": f"eq.{schema_version}",
            "select": "*",
            "order": "snapshot_date.asc",
        })
        return self._rows(resp)

    def insert_snapshot(self, snapshot: SnapshotRecord) -> None:
        self._request("POST", "entity_snapshots", json_body=snapshot.to_row(),
                      params={"on_conflict": "entity_uid,snapshot_date,snapshot_kind,schema_version"},
                      prefer="resolution=ignore-duplicates,return=minimal")

    def update_snapshot(self, snapshot_id: str, snapshot: SnapshotRecord,
                        now_iso: str) -> None:
        """Mutable-until-sealed daily update. Callers must never pass a row
        whose snapshot_date is before the current UTC date."""
        row = snapshot.to_row()
        row["updated_at"] = now_iso
        self._request("PATCH", "entity_snapshots",
                      params={"id": f"eq.{snapshot_id}"}, json_body=row,
                      prefer="return=minimal")

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
                   counters: dict, errors: list[str]) -> None:
        body = dict(counters)
        body.update({
            "status": status,
            "completed_at": completed_at,
            "error_count": len(errors),
            "errors": errors or None,
        })
        self._request("PATCH", "memory_write_runs",
                      params={"run_key": f"eq.{run_key}"}, json_body=body,
                      prefer="return=minimal")

    # ── read API + status queries ────────────────────────────────────────────

    def list_snapshots(self, entity_uid: str, *, date_from: str | None,
                       date_to: str | None, order_desc: bool, limit: int) -> list[dict]:
        params: dict[str, str] = {
            "entity_uid": f"eq.{entity_uid}",
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
        return self._rows(self._request("GET", "entity_snapshots", params=params))

    def list_transitions(self, entity_uid: str, *, date_from: str | None,
                         date_to: str | None, order_desc: bool, limit: int) -> list[dict]:
        params: dict[str, str] = {
            "entity_uid": f"eq.{entity_uid}",
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
        return self._rows(self._request("GET", "transition_events", params=params))

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
