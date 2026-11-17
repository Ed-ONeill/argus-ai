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
