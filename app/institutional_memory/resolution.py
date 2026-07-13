"""
app/institutional_memory/resolution.py — Outcome resolution engine (M3.3).

Runs separately from prediction issuance, once per UTC day, AFTER the daily
snapshots and M3.2 records are written. Resolves only predictions whose
resolve_after has passed — resolve_after is constructed so the predicted
boundary day is fully sealed before resolution is attempted, and a defensive
check refuses to resolve against an unsealed date (no future leaks).

Resolution sources are PERSISTED institutional records only (sealed entity /
narrative / relationship snapshots) — never current in-memory state.

DETERMINISTIC RULES (stored verbatim on every outcome):

relationship_persistence
  confirmed     sealed relationship snapshot exists for the boundary date and active
  contradicted  no snapshot for that rel_uid while theme writes prove the writer
                ran that day (genuine disappearance)
  unresolvable_data_gap  no institutional records at all for the boundary day

narrative_membership
  confirmed     subject appears in the narrative's sealed member_uids
  contradicted  narrative sealed without the subject, OR the narrative itself
                dissolved while the writer was alive (membership did not persist)
  unresolvable_data_gap  writer gap on the boundary day

conviction_threshold
  confirmed     sealed conviction >= threshold
  contradicted  sealed conviction < threshold, OR the theme was not recorded
                while the writer was alive (conviction was not sustained)
  unresolvable_data_gap  writer gap on the boundary day

INVALIDATION IS NOT INCORRECTNESS: before any rule runs, the subject's
identity registry status is checked — a retired/absorbed/superseded subject
yields verdict `invalidated` (assumption broke), which is reported separately
and never counted as a failure.
"""

from __future__ import annotations

import logging
from datetime import datetime

from app.institutional_memory.models import SCHEMA_VERSION, SNAPSHOT_KIND_DAILY, utc_now
from app.institutional_memory.outcomes import (
    RESOLVER_VERSION,
    VERDICT_CONFIRMED,
    VERDICT_CONTRADICTED,
    VERDICT_DATA_GAP,
    VERDICT_INVALIDATED,
    build_outcome_row,
)
from app.institutional_memory.predictions import (
    STATUS_INVALIDATED,
    STATUS_RESOLVED,
    TYPE_CONVICTION_THRESHOLD,
    TYPE_NARRATIVE_MEMBERSHIP,
    TYPE_RELATIONSHIP_PERSISTENCE,
)
from app.institutional_memory.repository import RepositoryError, SupabaseRepository

log = logging.getLogger(__name__)

_MAX_DUE_PER_RUN = 500


class _BoundaryRecords:
    """Sealed records for one boundary date, fetched once per run."""

    def __init__(self, repo: SupabaseRepository, boundary: str) -> None:
        entity_rows = repo.fetch_table_snapshots_between(
            "entity_snapshots", boundary, boundary, SNAPSHOT_KIND_DAILY, SCHEMA_VERSION)
        self.themes = {r["entity_uid"]: r for r in entity_rows
                       if str(r["entity_uid"]).startswith("theme:")}
        self.relationships = {
            r["rel_uid"]: r for r in repo.fetch_table_snapshots_between(
                "relationship_snapshots", boundary, boundary,
                SNAPSHOT_KIND_DAILY, SCHEMA_VERSION)
        }
        self.narratives = {
            r["entity_uid"]: r for r in repo.fetch_table_snapshots_between(
                "narrative_snapshots", boundary, boundary,
                SNAPSHOT_KIND_DAILY, SCHEMA_VERSION)
        }
        # Theme writes prove the writer ran on the boundary day: the
        # discriminator between a data gap and genuine absence (M3.2 rule).
        self.writer_alive = bool(self.themes)


def _resolve_one(prediction: dict, records: _BoundaryRecords,
                 subject_status: str | None) -> tuple[str, dict, dict]:
    """→ (verdict, observed_state, resolution_rules). Pure and deterministic."""
    ptype = prediction["prediction_type"]
    expected = prediction["expected_state"] or {}
    boundary = expected.get("boundary_date")
    rules: dict = {
        "prediction_type": ptype,
        "boundary_date": boundary,
        "method": "sealed_daily_snapshot_comparison",
        "writer_alive_on_boundary": records.writer_alive,
        "resolver_version": RESOLVER_VERSION,
    }

    # invalidation before correctness: identity assumption broke
    if subject_status is not None and subject_status != "active":
        rules["rule"] = ("subject identity status is not active — stated identity "
                         "assumption failed; invalidation is distinct from contradiction")
        return VERDICT_INVALIDATED, {"subject_status": subject_status}, rules

    if not records.writer_alive:
        rules["rule"] = ("no institutional records exist for the boundary day; "
                         "absence of data is a gap, never a verdict")
        return VERDICT_DATA_GAP, {"boundary_records": 0}, rules

    if ptype == TYPE_RELATIONSHIP_PERSISTENCE:
        row = records.relationships.get(expected.get("rel_uid"))
        if row is not None and row.get("active", True):
            rules["rule"] = "sealed relationship snapshot exists and is active"
            return VERDICT_CONFIRMED, {
                "rel_uid": expected.get("rel_uid"), "active": True,
                "snapshot_date": row["snapshot_date"]}, rules
        rules["rule"] = ("relationship absent from the sealed boundary day while "
                         "the writer verifiably ran — genuine disappearance")
        return VERDICT_CONTRADICTED, {
            "rel_uid": expected.get("rel_uid"), "active": False}, rules

    if ptype == TYPE_NARRATIVE_MEMBERSHIP:
        narrative = records.narratives.get(expected.get("narrative_uid"))
        if narrative is None:
            rules["rule"] = ("narrative dissolved before the boundary while the "
                            "writer was alive — membership did not persist")
            return VERDICT_CONTRADICTED, {
                "narrative_uid": expected.get("narrative_uid"),
                "narrative_present": False}, rules
        members = list(narrative.get("member_uids") or [])
        is_member = prediction["subject_uid"] in members
        rules["rule"] = "subject membership tested against sealed member_uids"
        if is_member:
            return VERDICT_CONFIRMED, {
                "narrative_uid": expected.get("narrative_uid"),
                "member": True}, rules
        return VERDICT_CONTRADICTED, {
            "narrative_uid": expected.get("narrative_uid"),
            "member": False, "member_uids": members}, rules

    if ptype == TYPE_CONVICTION_THRESHOLD:
        threshold = expected.get("conviction_gte")
        row = records.themes.get(prediction["subject_uid"])
        if row is None:
            rules["rule"] = ("theme not recorded on the sealed boundary day while "
                            "the writer was alive — conviction was not sustained")
            return VERDICT_CONTRADICTED, {"theme_recorded": False,
                                          "threshold": threshold}, rules
        conviction = row.get("conviction")
        if conviction is None:
            rules["rule"] = "sealed snapshot exists but carries no conviction value"
            return VERDICT_DATA_GAP, {"theme_recorded": True,
                                      "conviction": None}, rules
        rules["rule"] = f"sealed conviction compared against threshold >= {threshold}"
        observed = {"conviction": conviction, "threshold": threshold,
                    "snapshot_date": row["snapshot_date"]}
        if int(conviction) >= int(threshold):
            return VERDICT_CONFIRMED, observed, rules
        return VERDICT_CONTRADICTED, observed, rules

    rules["rule"] = "no resolution rule registered for this prediction type"
    return VERDICT_DATA_GAP, {}, rules


def run_resolution(repo: SupabaseRepository, now: datetime | None = None) -> dict:
    """Resolve all due predictions. Idempotent: deterministic run_key per UTC
    day, deterministic outcome UIDs, and status re-patching on retry. Raises
    RepositoryError on storage failure (caller records + retries next cycle)."""
    now = now or utc_now()
    today = now.date().isoformat()
    run_key = f"resolve:v1:{today}"

    existing = repo.get_resolution_run(run_key)
    if existing and existing.get("status") == "completed":
        return {"run_key": run_key, "status": "skipped", "due": 0,
                "resolved": 0, "unresolved": 0, "invalidated": 0}

    due = repo.fetch_due_predictions(now.isoformat(), limit=_MAX_DUE_PER_RUN)
    counters = {"run_key": run_key, "status": "completed", "due": len(due),
                "resolved": 0, "unresolved": 0, "invalidated": 0, "deferred": 0}
    repo.start_resolution_run(run_key, now.isoformat(),
                              metadata={"due": len(due),
                                        "resolver_version": RESOLVER_VERSION})
    errors: list[str] = []
    try:
        boundaries: dict[str, _BoundaryRecords] = {}
        subject_status = {
            uid: row.get("status", "active")
            for uid, row in repo.fetch_entities(
                sorted({p["subject_uid"] for p in due})).items()
        } if due else {}

        outcomes, status_updates = [], []
        for p in due:
            boundary = (p.get("expected_state") or {}).get("boundary_date")
            if not boundary or boundary >= today:
                # defense in depth: never resolve against an unsealed date
                counters["deferred"] += 1
                continue
            if boundary not in boundaries:
                boundaries[boundary] = _BoundaryRecords(repo, boundary)
            verdict, observed, rules = _resolve_one(
                p, boundaries[boundary], subject_status.get(p["subject_uid"]))
            outcomes.append(build_outcome_row(
                p, verdict=verdict, observed_state=observed,
                resolution_rules=rules,
                evidence_refs=[{"table": t, "uid": u, "snapshot_date": boundary}
                               for t, u in _evidence_for(p, verdict)],
                now=now))
            new_status = STATUS_INVALIDATED if verdict == VERDICT_INVALIDATED else STATUS_RESOLVED
            status_updates.append((p["prediction_uid"], new_status))
            if verdict == VERDICT_INVALIDATED:
                counters["invalidated"] += 1
            elif verdict == VERDICT_DATA_GAP:
                counters["unresolved"] += 1
            else:
                counters["resolved"] += 1

        if outcomes:
            repo.insert_outcomes(outcomes)
        for uid, status in status_updates:
            # status columns only — the issued prediction payload is immutable
            repo.update_prediction_status(uid, status, now.isoformat())
    except RepositoryError as exc:
        errors.append(str(exc)[:500])
        counters["status"] = "failed"
        raise
    finally:
        try:
            repo.finish_resolution_run(
                run_key, status=counters["status"], completed_at=utc_now().isoformat(),
                counters={"predictions_seen": counters["due"],
                          "outcomes_created": counters["resolved"]
                                              + counters["unresolved"]
                                              + counters["invalidated"],
                          "unresolved": counters["unresolved"]},
                errors=errors)
        except RepositoryError:
            log.error("[outcome-ledger] could not close resolution run ledger")

    log.info("[outcome-ledger] due=%d resolved=%d unresolved=%d invalidated=%d "
             "deferred=%d run=%s", counters["due"], counters["resolved"],
             counters["unresolved"], counters["invalidated"],
             counters["deferred"], run_key)
    return counters


def _evidence_for(prediction: dict, verdict: str) -> list[tuple[str, str]]:
    """Natural-key evidence references for the resolution records consulted."""
    ptype = prediction["prediction_type"]
    expected = prediction.get("expected_state") or {}
    if ptype == TYPE_RELATIONSHIP_PERSISTENCE and expected.get("rel_uid"):
        return [("relationship_snapshots", expected["rel_uid"])]
    if ptype == TYPE_NARRATIVE_MEMBERSHIP and expected.get("narrative_uid"):
        return [("narrative_snapshots", expected["narrative_uid"])]
    if ptype == TYPE_CONVICTION_THRESHOLD:
        return [("entity_snapshots", prediction["subject_uid"])]
    return []
