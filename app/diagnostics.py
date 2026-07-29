"""
app/diagnostics.py — read-only production-feed diagnostics (observability only).

Post-Codex-review hardening:
  1. Exceptions are stored as SAFE errors — a stable error_code + exception
     class name + a GENERIC summary. Raw exception text is never stored, and a
     redactor scrubs secrets before storage/serialization as defense in depth.
  3. State is PER WARM TARGET (cache key) — a healthy secondary refresh can
     never mask a failed full-feed refresh.
  4. Every store operation is best-effort: a diagnostics failure can never
     break run_pipeline, feed_cache.set, disk persistence, or the refresher.
     The boundary is wrapped centrally (the @_safe decorator).
  5. Per-cycle stage stats (themes/events) flow through a contextvar, so
     concurrent background and inline pipelines never exchange counts.
  7. Persistence health is reported per sink: memory_cache / disk_cache /
     institutional_memory, independently.

OBSERVABILITY ONLY — nothing here changes editorial thresholds, theme
admission, cache compatibility behavior, or fallback data. Dependency-free.
"""

from __future__ import annotations

import contextvars
import functools
import logging
import re
import threading
from datetime import datetime, timezone
from typing import Any, Callable

log = logging.getLogger(__name__)

# ── stage status vocabulary ──────────────────────────────────────────────────
OK = "ok"
EMPTY = "empty"
FAILED = "failed"
COMPAT_CLEARED = "compatibility_cleared"
NOT_RUN = "not_run"


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _iso(dt: datetime | None) -> str | None:
    return dt.isoformat() if dt else None


# ── secret redaction (finding 1) ──────────────────────────────────────────────
# Applied to any string BEFORE it is stored/serialized. The primary defense is
# simply not storing raw exception text at all; this is belt-and-suspenders.
_REDACTIONS: list[re.Pattern] = [
    re.compile(r"eyJ[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+"),      # JWT
    re.compile(r"(?i)bearer\s+[A-Za-z0-9._\-]+"),
    re.compile(r"(?i)authorization\s*[:=]\s*\S+"),
    re.compile(r"sb_(?:secret|publishable)_[A-Za-z0-9]+"),                    # Supabase keys
    re.compile(r"(?i)(?:service_role|anon)[_-]?key\S*"),
    re.compile(r"(?i)(?:password|passwd|pwd)\s*[:=]\s*\S+"),
    re.compile(r"(?i)(?:api[_-]?key|apikey|secret|access[_-]?token|token)\s*[:=]\s*\S+"),
    re.compile(r"[A-Za-z][A-Za-z0-9+.\-]*://[^\s:@/]+:[^\s:@/]+@\S+"),        # user:pass@host conn strings
    re.compile(r"(?i)([?&])(?:x-amz-signature|signature|token|sig|access_key|key)=[^\s&]+"),  # signed URLs
    re.compile(r"(?i)set-cookie\s*[:=]\s*\S+"),
    re.compile(r"(?i)\bcookie\s*[:=]\s*\S+"),
    re.compile(r"AKIA[0-9A-Z]{16}"),                                          # AWS access key id
    re.compile(r"sk-[A-Za-z0-9]{20,}"),                                       # OpenAI-style key
    re.compile(r"[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}"),          # email
]


def redact(text: Any) -> str | None:
    if text is None:
        return None
    out = str(text)
    for rx in _REDACTIONS:
        out = rx.sub("[REDACTED]", out)
    return out


# ── safe error representation (finding 1) ─────────────────────────────────────
# (error_code, generic summary) per stage. The generic summary is what surfaces;
# raw exception messages are NEVER stored.
_STAGE_CODES: dict[str, tuple[str, str]] = {
    "themes":               ("THEME_EXTRACTION_FAILED",    "Theme extraction failed"),
    "activation":           ("INDUSTRY_ACTIVATION_FAILED", "Industry activation failed"),
    "events":               ("EVENT_BUILD_FAILED",         "Market event build failed"),
    "sector":               ("SECTOR_AGGREGATION_FAILED",  "Sector aggregation failed"),
    "brief":                ("MARKET_BRIEF_FAILED",        "Market take/brief failed"),
    "explanations":         ("EXPLANATION_ASSEMBLY_FAILED","Explanation assembly failed"),
    "memory":               ("THEME_MEMORY_FAILED",        "Theme memory update failed"),
    "ledger":               ("OBSERVATION_LEDGER_FAILED",  "Observation ledger write failed"),
    "pipeline":             ("PIPELINE_FAILED",            "Pipeline execution failed"),
    "refresher_loop":       ("REFRESHER_LOOP_FATAL",       "Refresher loop terminated"),
    "institutional_memory": ("INSTITUTIONAL_MEMORY_FAILED","Institutional-memory write failed"),
}


def safe_error(stage: str, exc: Any) -> dict:
    """Secret-free structured error: code + class name + generic message. No
    raw exception text. Every string field is redacted as defense in depth."""
    code, summary = _STAGE_CODES.get(stage, ("UNKNOWN_FAILURE", "Operation failed"))
    etype = type(exc).__name__ if isinstance(exc, BaseException) else "Error"
    return {
        "stage": redact(stage),
        "error_code": code,
        "exception_type": redact(etype),
        "message": summary,        # generic only
        "at": _iso(_now()),
    }


# ── per-cycle stage stats via contextvar (finding 5) ──────────────────────────
_cycle_stats: contextvars.ContextVar[dict | None] = contextvars.ContextVar(
    "argus_cycle_stats", default=None)


def begin_cycle_stats() -> dict:
    """Start a fresh, invocation-scoped stats dict for THIS thread/context.
    Concurrent background and inline pipelines never share it."""
    d: dict = {}
    _cycle_stats.set(d)
    return d


def set_stage_stat(name: str, value: Any) -> None:
    d = _cycle_stats.get()
    if d is not None:
        d[name] = value


def get_stage_stat(name: str, default: Any = None) -> Any:
    d = _cycle_stats.get()
    return (d or {}).get(name, default)


# ── histogram ─────────────────────────────────────────────────────────────────
_HIST_BUCKETS = [("lt60", 0, 60), ("60_69", 60, 70), ("70_71", 70, 72),
                 ("72_79", 72, 80), ("80_plus", 80, 10_000)]


def signal_score_histogram(scores: list[float]) -> dict[str, int]:
    out = {label: 0 for label, _, _ in _HIST_BUCKETS}
    for s in scores:
        for label, lo, hi in _HIST_BUCKETS:
            if lo <= s < hi:
                out[label] += 1
                break
    return out


# ── per-cycle record builder ─────────────────────────────────────────────────

class CycleRecord:
    def __init__(self, cache_key: str, cycle_id: str, started_at: datetime | None = None):
        self.cache_key = cache_key
        self.cycle_id = cycle_id
        self.started_at = started_at or _now()
        self.completed_at: datetime | None = None
        self.counts: dict[str, Any] = {}
        self.stage_status: dict[str, str] = {}
        self.theme_suppressed_by_reason: dict[str, int] = {}
        self.signal_score_histogram: dict[str, int] = {}
        self.last_failure: dict | None = None      # safe_error dict

    def stage(self, name: str, status: str, exc: Any = None) -> None:
        self.stage_status[name] = status
        if status == FAILED:
            self.last_failure = safe_error(name, exc)

    def set(self, **counts: Any) -> None:
        self.counts.update(counts)

    def to_dict(self) -> dict[str, Any]:
        return {
            "cycle_id": self.cycle_id,
            "started_at": _iso(self.started_at),
            "completed_at": _iso(self.completed_at),
            "raw_items": self.counts.get("raw_items"),
            "post_dedup_items": self.counts.get("post_dedup_items"),
            "post_score_items": self.counts.get("post_score_items"),
            "clusters_total": self.counts.get("clusters_total"),
            "clusters_multi": self.counts.get("clusters_multi"),
            "theme_candidates": self.counts.get("theme_candidates"),
            "themes_emitted": self.counts.get("themes_emitted"),
            "theme_suppressed_by_reason": dict(self.theme_suppressed_by_reason),
            "activations_total": self.counts.get("activations_total"),
            "activations_positive": self.counts.get("activations_positive"),
            "sectors_positive": self.counts.get("sectors_positive"),
            "events_built": self.counts.get("events_built"),
            "events_admitted": self.counts.get("events_admitted"),
            "market_brief_present": self.counts.get("market_brief_present"),
            "signal_score_histogram": dict(self.signal_score_histogram),
            "source_errors_count": self.counts.get("source_errors_count"),
            "stage_status": dict(self.stage_status),
            "last_failure": self.last_failure,
        }


# ── per-target state (finding 3) ──────────────────────────────────────────────

class _Target:
    __slots__ = ("attempt_at", "success_at", "started_id", "completed_id",
                 "last_error", "published_at", "cycle", "cache_load", "persistence")

    def __init__(self) -> None:
        self.attempt_at: datetime | None = None
        self.success_at: datetime | None = None      # last successful publish (this target)
        self.started_id: str | None = None
        self.completed_id: str | None = None
        self.last_error: dict | None = None          # safe_error dict
        self.published_at: datetime | None = None
        self.cycle: dict | None = None
        self.cache_load: dict | None = None
        self.persistence: dict[str, str | None] = {
            "memory_cache": None, "disk_cache": None, "institutional_memory": None}


# ── central fail-safe boundary (finding 4) ────────────────────────────────────

# Explicit, secret-free fallback returned by status_for when the store itself
# fails — distinguishable from an uninitialized/empty store ({}) so a consumer
# never mistakes a diagnostics outage for "all clear".
DIAGNOSTICS_UNAVAILABLE: dict[str, Any] = {
    "diagnostics_available": False,
    "diagnostics_error": {
        "error_code": "DIAGNOSTICS_STORE_FAILED",
        "message": "Diagnostics are temporarily unavailable",
    },
}


def _safe(default: Any = None) -> Callable:
    """Wrap a store method so a diagnostics failure NEVER propagates to the
    pipeline / cache / refresher. Logs only a stable, SECRET-FREE record — the
    method name + exception class + error code, never the exception string
    (finding 3) — and returns `default`."""
    def deco(fn: Callable) -> Callable:
        @functools.wraps(fn)
        def wrapper(*args: Any, **kwargs: Any) -> Any:
            try:
                return fn(*args, **kwargs)
            except Exception as exc:   # pragma: no cover - safety net
                log.warning("[diagnostics] operation_failed method=%s exception_type=%s "
                            "error_code=DIAGNOSTICS_STORE_FAILED",
                            fn.__name__, type(exc).__name__)
                return default
        return wrapper
    return deco


class DiagnosticsStore:
    def __init__(self) -> None:
        self._lock = threading.RLock()
        self._targets: dict[str, _Target] = {}
        self._refresher_thread: threading.Thread | None = None
        self._loop_error: dict | None = None   # genuinely global: refresher-loop fatal

    def _t(self, key: str) -> _Target:
        t = self._targets.get(key)
        if t is None:
            t = _Target()
            self._targets[key] = t
        return t

    # ── run_pipeline hook ─────────────────────────────────────────────────────
    @_safe()
    def record_cycle(self, rec: CycleRecord) -> None:
        with self._lock:
            rec.completed_at = _now()
            self._t(rec.cache_key).cycle = rec.to_dict()

    # ── refresher supervision hooks (per target) ──────────────────────────────
    @_safe()
    def set_refresher_thread(self, thread: threading.Thread | None) -> None:
        with self._lock:
            self._refresher_thread = thread

    @_safe()
    def mark_attempt(self, key: str, cycle_id: str | None = None) -> None:
        with self._lock:
            t = self._t(key)
            t.attempt_at = _now()
            if cycle_id:
                t.started_id = cycle_id

    @_safe()
    def mark_published(self, key: str, cycle_id: str | None = None, at: datetime | None = None) -> None:
        with self._lock:
            t = self._t(key)
            ts = at or _now()
            t.published_at = ts
            t.success_at = ts
            if cycle_id:
                t.completed_id = cycle_id
            if t.cache_load is not None:
                t.cache_load["replaced_by_refresh"] = True

    @_safe()
    def mark_exception(self, key: str, stage: str, exc: Any) -> None:
        with self._lock:
            self._t(key).last_error = safe_error(stage, exc)

    @_safe()
    def mark_loop_exception(self, exc: Any) -> None:
        """Refresher-loop fatal (thread-terminating). Genuinely global — not
        tied to a single target."""
        with self._lock:
            self._loop_error = safe_error("refresher_loop", exc)

    @_safe()
    def mark_persistence(self, key: str, *, memory_cache: str | None = None,
                         disk_cache: str | None = None,
                         institutional_memory: str | None = None) -> None:
        with self._lock:
            p = self._t(key).persistence
            if memory_cache is not None:
                p["memory_cache"] = memory_cache
            if disk_cache is not None:
                p["disk_cache"] = disk_cache
            if institutional_memory is not None:
                p["institutional_memory"] = institutional_memory

    # ── cache-load hook (finding 2: dict reasons; missing vs incompatible) ─────
    @_safe()
    def record_cache_load(self, key: str, *, pickle_filename: str,
                          generated_at: datetime | None,
                          cleared: dict[str, str]) -> None:
        with self._lock:
            self._t(key).cache_load = {
                "pickle_filename": redact(pickle_filename),
                "embedded_generated_at": _iso(generated_at),
                "loaded_at": _iso(_now()),
                "compatibility_fields_cleared": list(cleared.keys()),
                "compatibility_clear_reasons": dict(cleared),
                "schema_compatible": not cleared,
                "replaced_by_refresh": False,
            }

    # ── read side ─────────────────────────────────────────────────────────────
    def refresher_alive(self) -> bool | None:
        with self._lock:
            t = self._refresher_thread
            return bool(t and t.is_alive()) if t is not None else None

    @_safe(default=dict(DIAGNOSTICS_UNAVAILABLE))
    def status_for(self, key: str) -> dict[str, Any]:
        """Flat, sanitized per-target record. The API endpoint merges the live
        cache-entry fields (is_refreshing, generated_at, age) on top. On an
        internal failure returns the explicit DIAGNOSTICS_UNAVAILABLE fallback
        (never a bare {} that reads as an uninitialized store)."""
        with self._lock:
            t = self._targets.get(key) or _Target()
            load = t.cache_load or {}
            reached = None
            if t.attempt_at is not None:
                reached = bool(t.success_at is not None and t.success_at >= t.attempt_at)
            return {
                "refresher_thread_alive": self.refresher_alive(),
                "refresher_last_error": self._loop_error,
                # per-target supervision
                "last_attempt_at": _iso(t.attempt_at),
                "last_success_at": _iso(t.success_at),
                "last_cycle_started_id": t.started_id,
                "last_cycle_completed_id": t.completed_id,
                "last_attempt_succeeded": reached,
                "last_error": t.last_error,
                "published_at": _iso(t.published_at),
                # persistence health (finding 7)
                "persistence": dict(t.persistence),
                # cache compatibility load (finding 2)
                "cache_loaded_from_disk": bool(t.cache_load) and not load.get("replaced_by_refresh", False),
                "cache_schema_compatible": load.get("schema_compatible") if t.cache_load else None,
                "compatibility_fields_cleared": load.get("compatibility_fields_cleared", []),
                "compatibility_clear_reasons": load.get("compatibility_clear_reasons", {}),
                "cache_load": t.cache_load,
                # last cycle
                "cycle": t.cycle,
            }


diagnostics = DiagnosticsStore()
