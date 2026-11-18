"""Availability and freshness are separate. Pure checks; never run a pipeline."""
from datetime import datetime, timezone

# Two normal five-minute refresh intervals, allowing a cycle to finish.
MAX_SNAPSHOT_AGE_SECONDS = 600


def snapshot_age_is_stale(entry, *, now: datetime | None = None) -> bool:
    if entry is None:
        return True
    generated = entry.generated_at
    if generated.tzinfo is None:
        generated = generated.replace(tzinfo=timezone.utc)
    age = ((now or datetime.now(timezone.utc)) - generated).total_seconds()
    return age < -60 or age >= MAX_SNAPSHOT_AGE_SECONDS


def snapshot_is_stale(entry, *, now: datetime | None = None) -> bool:
    return snapshot_age_is_stale(entry, now=now) or bool(entry.is_refreshing)


def readiness(entry, diagnostics: dict, *, now: datetime | None = None) -> dict:
    reason = (
        "no_snapshot" if entry is None else
        "refresher_unavailable" if diagnostics.get("refresher_thread_alive") is not True else
        "awaiting_successful_cycle" if not diagnostics.get("last_success_at") else
        "last_cycle_failed" if diagnostics.get("last_error") else
        "snapshot_stale" if snapshot_age_is_stale(entry, now=now) else
        "ready"
    )
    return {"ready": reason == "ready", "reason": reason,
            "snapshot_available": entry is not None}


def monitor_health(entry, diagnostics: dict, *, now: datetime | None = None) -> dict:
    """Public status booleans only: no articles, sources, paths or exceptions.

    Partial source coverage is not full coverage, but need not mean the entire
    service is down. No available reporting with source errors is an outage.
    """
    result = readiness(entry, diagnostics, now=now)
    persistence = diagnostics.get("persistence") or {}
    persisted = (persistence.get("memory_cache") == "ok"
                 and persistence.get("disk_cache") == "ok"
                 and persistence.get("institutional_memory") == "completed")
    errors = getattr(entry, "errors", {}) if entry else {}
    coverage = "unknown" if entry is None else "partial" if errors else "complete"
    if errors and not getattr(entry, "items", []):
        coverage = "unavailable"
    return {"ready": result["ready"] and persisted and coverage != "unavailable",
            "pipeline_ready": result["ready"], "persistence_ready": persisted,
            "source_coverage": coverage}
