"""
tests/test_diagnostics.py — read-only production-feed diagnostics.

Post-Codex-review hardening. Proves:
  1. Exceptions become SAFE errors and a redactor scrubs realistic secrets
     before storage/serialization (adversarial tests).
  2. A required-derived field entirely ABSENT from a persisted pickle is
     recorded as a compatibility clear — NOT silently patched to a healthy [].
     Missing vs structurally-incompatible vs genuinely-empty are distinct.
  3. State is PER WARM TARGET: a healthy secondary refresh can never mask a
     failed full-feed refresh.
  4. A diagnostics failure can never break feed construction, cache
     publication, or the refresher (central @_safe boundary).
  5. Per-cycle stage stats flow through a contextvar — concurrent pipelines
     never exchange counts.
  6. Legitimate measured-zero is preserved (0, not None); None means not-measured.
  7. Persistence health is reported per sink independently.
"""

from __future__ import annotations

import json
import pickle
import threading
from datetime import datetime, timedelta, timezone

import pytest

from app import diagnostics as diagmod
from app.diagnostics import (
    CycleRecord, DIAGNOSTICS_UNAVAILABLE, DiagnosticsStore, EMPTY, FAILED, OK,
    NOT_RUN, begin_cycle_stats, get_stage_stat, redact, safe_error,
    set_stage_stat, signal_score_histogram,
)

T0 = datetime(2026, 7, 28, 12, 0, tzinfo=timezone.utc)


# ── finding 1: safe errors + secret redaction ──────────────────────────────────

# A grab-bag of REALISTIC secrets an exception/traceback might carry.
_SECRETS = {
    "jwt": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9."
           "eyJzdWIiOiIxMjM0NTY3ODkwIn0."
           "SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c",
    "supabase_secret": "sb_secret_aBcDeFgH1234567890XYZ",
    "supabase_pub": "sb_publishable_ZZZ9988776655",
    "service_role": "service_role_key=eyJhbGciOiJIUzI1NiJ9.aaa.bbb",
    "password": "password=SuperS3cret!value",
    "api_key": "api_key=sk-proj-ABCDEFGHIJKLMNOP1234567890",
    "openai": "sk-ABCDEFGHIJKLMNOPQRSTUVWXYZ012345",
    "conn": "postgres://dbuser:p4ssw0rd@db.internal.host:5432/argus",
    "signed_url": "https://x.supabase.co/storage/v1/object/sign/f.png"
                  "?token=abc.def.ghi&signature=deadbeefcafe1234",
    "cookie": "Cookie: sb-access-token=eyJa.eyJb.sig-VALUE; theme=dark",
    "authz": "Authorization: Bearer eyJq.eyJr.reallongsignaturevalue000",
    "aws": "AKIAIOSFODNN7EXAMPLE",
    "email": "victim.user@example.com",
}
# Raw substrings that must NEVER survive redaction anywhere.
_FORBIDDEN = [
    "SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c",
    "sb_secret_aBcDeFgH1234567890XYZ",
    "sb_publishable_ZZZ9988776655",
    "SuperS3cret",
    "sk-proj-ABCDEFGHIJKLMNOP1234567890",
    "sk-ABCDEFGHIJKLMNOPQRSTUVWXYZ012345",
    "p4ssw0rd",
    "deadbeefcafe1234",
    "sig-VALUE",
    "reallongsignaturevalue000",
    "AKIAIOSFODNN7EXAMPLE",
    "victim.user@example.com",
]


def test_redact_strips_every_realistic_secret():
    blob = " | ".join(_SECRETS.values())
    out = redact(blob)
    for secret in _FORBIDDEN:
        assert secret not in out, f"leaked: {secret}"
    assert "[REDACTED]" in out


def test_redact_none_passthrough():
    assert redact(None) is None


def test_safe_error_carries_no_raw_exception_text():
    # An exception whose message is packed with secrets.
    exc = RuntimeError(" ".join(_SECRETS.values()))
    err = safe_error("themes", exc)
    assert err["error_code"] == "THEME_EXTRACTION_FAILED"
    assert err["exception_type"] == "RuntimeError"
    assert err["message"] == "Theme extraction failed"   # generic, not exc text
    blob = json.dumps(err)
    for secret in _FORBIDDEN:
        assert secret not in blob


def test_status_serialization_is_secret_free_end_to_end():
    store = DiagnosticsStore()
    # Push secrets through every channel that might store a string.
    store.mark_exception("k", "pipeline", ValueError(_SECRETS["jwt"]))
    store.mark_loop_exception(RuntimeError(_SECRETS["conn"]))
    store.record_cache_load(
        "k", pickle_filename="feed_" + _SECRETS["aws"] + ".pkl",
        generated_at=T0, cleared={})
    rec = CycleRecord("k", "cyc1")
    rec.stage("themes", FAILED, ValueError(_SECRETS["password"]))
    store.record_cycle(rec)
    blob = json.dumps(store.status_for("k"))
    for secret in _FORBIDDEN:
        assert secret not in blob, f"leaked in status: {secret}"
    for banned in ("authorization", "bearer", "sb_secret", "eyJ", "password"):
        assert banned.lower() not in blob.lower()


# ── record + stage semantics ────────────────────────────────────────────────────

def test_theme_exception_reports_failed_with_safe_error():
    store = DiagnosticsStore()
    rec = CycleRecord("k", "cyc1")
    rec.stage("themes", FAILED, ValueError("kaboom"))
    store.record_cycle(rec)
    cyc = store.status_for("k")["cycle"]
    assert cyc["stage_status"]["themes"] == FAILED
    assert cyc["last_failure"]["error_code"] == "THEME_EXTRACTION_FAILED"
    assert cyc["last_failure"]["exception_type"] == "ValueError"


def test_genuinely_zero_themes_reports_empty_not_failed():
    store = DiagnosticsStore()
    rec = CycleRecord("k", "cyc1")
    rec.stage("themes", EMPTY)          # gated to zero, no exception
    rec.set(theme_candidates=8, themes_emitted=0)
    rec.theme_suppressed_by_reason = {"evidence": 6, "breadth": 2}
    store.record_cycle(rec)
    cyc = store.status_for("k")["cycle"]
    assert cyc["stage_status"]["themes"] == EMPTY
    assert cyc["last_failure"] is None
    assert cyc["theme_candidates"] == 8 and cyc["themes_emitted"] == 0
    assert cyc["theme_suppressed_by_reason"] == {"evidence": 6, "breadth": 2}


def test_activation_failure_reported_independently_from_theme_success():
    store = DiagnosticsStore()
    rec = CycleRecord("k", "cyc1")
    rec.stage("themes", OK)
    rec.set(themes_emitted=5)
    rec.stage("activation", FAILED, RuntimeError("activation boom"))
    store.record_cycle(rec)
    ss = store.status_for("k")["cycle"]["stage_status"]
    assert ss["themes"] == OK and ss["activation"] == FAILED


def test_signal_score_histogram_buckets():
    h = signal_score_histogram([10, 61, 70, 71, 72, 79, 80, 100])
    assert h == {"lt60": 1, "60_69": 1, "70_71": 2, "72_79": 2, "80_plus": 2}


# ── finding 6: zero vs unavailable ──────────────────────────────────────────────

def test_measured_zero_is_preserved_distinct_from_unmeasured():
    store = DiagnosticsStore()
    rec = CycleRecord("k", "cyc1")
    rec.set(activations_positive=0)      # measured, and it was zero
    # sectors_positive intentionally NOT set → not measured
    store.record_cycle(rec)
    cyc = store.status_for("k")["cycle"]
    assert cyc["activations_positive"] == 0        # a real zero, not None
    assert cyc["sectors_positive"] is None         # never measured


# ── finding 5: contextvar stat isolation ────────────────────────────────────────

def test_stage_stats_isolated_between_concurrent_contexts():
    seen: dict[str, dict] = {}
    start = threading.Barrier(2)

    def worker(name: str, value: int):
        begin_cycle_stats()
        start.wait()                     # force interleaving
        set_stage_stat("themes", {"emitted": value})
        start.wait()
        # each thread must read back ONLY its own value
        seen[name] = get_stage_stat("themes")

    a = threading.Thread(target=worker, args=("bg", 11))
    b = threading.Thread(target=worker, args=("inline", 99))
    a.start(); b.start(); a.join(); b.join()
    assert seen["bg"] == {"emitted": 11}
    assert seen["inline"] == {"emitted": 99}


def test_stat_does_not_leak_to_a_context_that_never_began():
    begin_cycle_stats()
    set_stage_stat("events", {"built": 7})
    result: dict = {}

    def fresh():
        # a thread that never called begin_cycle_stats sees the default
        result["v"] = get_stage_stat("events", "unset")

    t = threading.Thread(target=fresh); t.start(); t.join()
    assert result["v"] == "unset"


# ── finding 3: per-target refresh isolation ─────────────────────────────────────

def test_secondary_success_does_not_mask_full_feed_failure():
    store = DiagnosticsStore()
    full = "FULLKEY"; secondary = "MARKETSKEY"
    # full-feed refresh is attempted and FAILS (no publish)
    store.mark_attempt(full, "cyc-1")
    store.mark_exception(full, "pipeline", RuntimeError("full feed down"))
    # secondary refresh attempted and SUCCEEDS
    store.mark_attempt(secondary, "cyc-1")
    store.mark_published(secondary, "cyc-1")

    full_st = store.status_for(full)
    sec_st = store.status_for(secondary)
    assert full_st["last_attempt_succeeded"] is False
    assert full_st["last_error"]["error_code"] == "PIPELINE_FAILED"
    assert full_st["last_success_at"] is None
    # the healthy secondary must NOT bleed into the full-feed record
    assert sec_st["last_attempt_succeeded"] is True
    assert sec_st["last_success_at"] is not None
    assert sec_st["last_error"] is None


def test_later_failure_does_not_erase_earlier_success_on_same_target():
    store = DiagnosticsStore()
    # An unambiguously-past success so a real-clock later attempt is always after it.
    past = datetime(2020, 1, 1, tzinfo=timezone.utc)
    store.mark_attempt("k", "cyc-1")
    store.mark_published("k", "cyc-1", at=past)
    ok_ts = store.status_for("k")["last_success_at"]
    # a later attempt fails
    store.mark_attempt("k", "cyc-2")
    store.mark_exception("k", "pipeline", RuntimeError("down"))
    st = store.status_for("k")
    assert st["last_success_at"] == ok_ts          # preserved
    assert st["last_attempt_succeeded"] is False    # newest attempt didn't reach success
    assert st["last_error"]["error_code"] == "PIPELINE_FAILED"


# ── refresher supervision ───────────────────────────────────────────────────────

def test_dead_refresher_is_observable():
    store = DiagnosticsStore()
    t = threading.Thread(target=lambda: None)
    t.start(); t.join()                 # thread finishes → dead
    store.set_refresher_thread(t)
    assert store.refresher_alive() is False


def test_live_refresher_is_observable():
    store = DiagnosticsStore()
    ev = threading.Event()
    t = threading.Thread(target=ev.wait); t.start()
    try:
        store.set_refresher_thread(t)
        assert store.refresher_alive() is True
    finally:
        ev.set(); t.join()


def test_loop_fatal_error_is_global_and_safe():
    store = DiagnosticsStore()
    store.mark_loop_exception(RuntimeError(_SECRETS["jwt"]))
    st = store.status_for("anykey")
    assert st["refresher_last_error"]["error_code"] == "REFRESHER_LOOP_FATAL"
    assert _SECRETS["jwt"] not in json.dumps(st)


# ── finding 7: per-sink persistence health ──────────────────────────────────────

def test_disk_save_failure_is_visible_while_memory_ok():
    store = DiagnosticsStore()
    store.mark_persistence("k", memory_cache="ok")
    store.mark_persistence("k", disk_cache="failed")
    p = store.status_for("k")["persistence"]
    assert p["memory_cache"] == "ok"
    assert p["disk_cache"] == "failed"          # in-memory ok must NOT imply disk ok
    assert p["institutional_memory"] is None    # not attempted


def test_institutional_memory_failure_is_visible():
    store = DiagnosticsStore()
    store.mark_persistence("k", memory_cache="ok", disk_cache="ok",
                           institutional_memory="failed")
    p = store.status_for("k")["persistence"]
    assert p["memory_cache"] == "ok" and p["disk_cache"] == "ok"
    assert p["institutional_memory"] == "failed"


# ── finding 2: compatibility classification (missing vs incompatible vs empty) ───

def test_compat_reasons_are_a_dict_field_to_reason_code():
    store = DiagnosticsStore()
    store.record_cache_load(
        "k", pickle_filename="feed_abc.pkl", generated_at=T0 - timedelta(days=3),
        cleared={"theme_intelligence": "incompatible_persisted_schema",
                 "industry_activation": "incompatible_persisted_schema"})
    st = store.status_for("k")
    assert st["cache_loaded_from_disk"] is True
    assert st["cache_schema_compatible"] is False
    assert st["compatibility_clear_reasons"] == {
        "theme_intelligence": "incompatible_persisted_schema",
        "industry_activation": "incompatible_persisted_schema"}
    assert set(st["compatibility_fields_cleared"]) == {
        "theme_intelligence", "industry_activation"}


def test_healthy_current_schema_load_is_compatible():
    store = DiagnosticsStore()
    store.record_cache_load("k2", pickle_filename="feed_new.pkl",
                            generated_at=T0, cleared={})
    st = store.status_for("k2")
    assert st["cache_schema_compatible"] is True
    assert st["compatibility_fields_cleared"] == []
    assert st["compatibility_clear_reasons"] == {}


def test_successful_refresh_clears_the_disk_served_state():
    store = DiagnosticsStore()
    store.record_cache_load("k", pickle_filename="feed_old.pkl", generated_at=T0,
                            cleared={"theme_intelligence": "incompatible_persisted_schema"})
    assert store.status_for("k")["cache_loaded_from_disk"] is True
    store.mark_published("k", "cyc-1")   # a fresh cycle publishes
    assert store.status_for("k")["cache_loaded_from_disk"] is False


# ── finding 4: diagnostics failures can never break production ──────────────────

class _Exploding:
    """A dict-like whose every access raises — simulates a broken store. The
    exception message carries a secret to prove it is never logged/serialized."""
    _MSG = "boom Authorization: Bearer eyJq.eyJr.leaked-sig sb_secret_LEAK123"
    def get(self, *a, **k):
        raise RuntimeError(self._MSG)
    def __getitem__(self, *a, **k):
        raise RuntimeError(self._MSG)
    def __setitem__(self, *a, **k):
        raise RuntimeError(self._MSG)


def test_every_store_op_swallows_internal_failure():
    store = DiagnosticsStore()
    store._targets = _Exploding()        # force every _t(key) to raise
    # none of these may raise
    store.record_cycle(CycleRecord("k", "c"))
    store.mark_attempt("k", "c")
    store.mark_published("k", "c")
    store.mark_exception("k", "pipeline", ValueError("x"))
    store.mark_persistence("k", memory_cache="ok")
    store.record_cache_load("k", pickle_filename="f.pkl", generated_at=T0, cleared={})
    # finding 3: status_for returns an EXPLICIT unavailable fallback, never a
    # bare {} that would read as an uninitialized-but-healthy store.
    st = store.status_for("k")
    assert st["diagnostics_available"] is False
    assert st["diagnostics_error"]["error_code"] == "DIAGNOSTICS_STORE_FAILED"
    assert st != {}


def test_safe_decorator_logs_no_raw_exception_text(caplog):
    import logging
    store = DiagnosticsStore()
    store._targets = _Exploding()
    with caplog.at_level(logging.WARNING):
        store.mark_attempt("k", "c")
        store.status_for("k")
    text = caplog.text
    # the stable, secret-free shape is logged …
    assert "operation_failed" in text
    assert "method=mark_attempt" in text
    assert "exception_type=RuntimeError" in text
    assert "DIAGNOSTICS_STORE_FAILED" in text
    # … and NONE of the exception's raw text (incl. secrets) appears
    for banned in ("eyJq", "leaked-sig", "sb_secret_LEAK123", "Bearer", "boom"):
        assert banned not in text


def test_diagnostics_failure_fallback_is_secret_free(caplog):
    """Adversarial: the store raises exceptions packed with realistic secrets;
    neither the serialized fallback NOR the logs may contain any of them."""
    import logging

    class _SecretBomb:
        def get(self, *a, **k):
            raise RuntimeError(" ".join(_SECRETS.values()))
        def __getitem__(self, *a, **k):
            raise RuntimeError(" ".join(_SECRETS.values()))
        def __setitem__(self, *a, **k):
            raise RuntimeError(" ".join(_SECRETS.values()))

    store = DiagnosticsStore()
    store._targets = _SecretBomb()
    with caplog.at_level(logging.WARNING):
        store.mark_exception("k", "pipeline", RuntimeError(_SECRETS["conn"]))
        fallback = store.status_for("k")
    blob = json.dumps(fallback)
    for secret in _FORBIDDEN:
        assert secret not in blob, f"leaked in fallback: {secret}"
        assert secret not in caplog.text, f"leaked in logs: {secret}"
    assert fallback == DIAGNOSTICS_UNAVAILABLE


def test_status_fallback_does_not_break_feed_or_cache(tmp_path, monkeypatch):
    """A failing status_for must not affect feed construction / cache publish /
    refresher — the fallback is read-only observability."""
    from types import SimpleNamespace
    import app.processed_cache as pc
    from app.processed_cache import ProcessedFeed, ProcessedFeedCache
    monkeypatch.setattr(pc, "_CACHE_DIR", tmp_path)
    store = DiagnosticsStore()
    store._targets = _Exploding()
    monkeypatch.setattr(diagmod, "diagnostics", store)
    cache = ProcessedFeedCache()
    feed = ProcessedFeed(
        items=[SimpleNamespace(title="a", url="u")], top_stories={}, market_take="",
        errors={}, promo_excluded=0, debug_log=[],
        generated_at=datetime(2026, 7, 28, tzinfo=timezone.utc))
    cache.set("KEY", feed)                       # must not raise
    assert cache.get("KEY") is feed
    assert store.status_for("KEY")["diagnostics_available"] is False


def test_feed_cache_set_survives_diagnostics_failure(tmp_path, monkeypatch):
    """Cache publication (memory + disk) must complete even when every
    diagnostics op raises."""
    from types import SimpleNamespace
    import app.processed_cache as pc
    from app.processed_cache import ProcessedFeed, ProcessedFeedCache

    monkeypatch.setattr(pc, "_CACHE_DIR", tmp_path)

    class _Boom:
        def __getattr__(self, name):
            def _raise(*a, **k):
                raise RuntimeError("diagnostics down")
            return _raise
    monkeypatch.setattr(diagmod, "diagnostics", _Boom())

    cache = ProcessedFeedCache()
    feed = ProcessedFeed(
        items=[SimpleNamespace(title="a", url="u")], top_stories={}, market_take="",
        errors={}, promo_excluded=0, debug_log=[],
        generated_at=datetime(2026, 7, 28, tzinfo=timezone.utc))
    cache.set("KEY", feed)               # must not raise
    assert cache.get("KEY") is feed      # in-memory publication survived
    assert (tmp_path / "feed_KEY.pkl").exists()   # disk save survived too


# ── finding 2 integration: an entirely-missing field is a compat clear ──────────

def _base_feed(gen: datetime):
    from types import SimpleNamespace
    from app.processed_cache import ProcessedFeed
    return ProcessedFeed(
        items=[SimpleNamespace(title="a", url="u")], top_stories={}, market_take="",
        errors={}, promo_excluded=0, debug_log=[], generated_at=gen)


def test_entirely_missing_derived_fields_are_recorded_not_silently_empty(tmp_path, monkeypatch):
    import app.processed_cache as pc
    from app.processed_cache import ProcessedFeedCache

    feed = _base_feed(datetime(2026, 7, 20, tzinfo=timezone.utc))
    # simulate a pickle from a schema PRE-DATING these derived fields
    del feed.theme_intelligence
    del feed.industry_activation
    del feed.events
    with open(tmp_path / "feed_MISSING.pkl", "wb") as fh:
        pickle.dump(feed, fh)
    monkeypatch.setattr(pc, "_CACHE_DIR", tmp_path)
    monkeypatch.setattr(diagmod, "diagnostics", DiagnosticsStore())

    cache = ProcessedFeedCache()
    loaded = cache.get("MISSING")
    assert loaded is not None and len(loaded.items) == 1   # items survive
    st = diagmod.diagnostics.status_for("MISSING")
    assert st["cache_loaded_from_disk"] is True
    assert st["cache_schema_compatible"] is False
    reasons = st["compatibility_clear_reasons"]
    assert reasons["theme_intelligence"] == "missing_from_persisted_schema"
    assert reasons["industry_activation"] == "missing_from_persisted_schema"
    assert reasons["events"] == "missing_from_persisted_schema"


def test_structurally_incompatible_field_is_distinguished_from_missing(tmp_path, monkeypatch):
    from types import SimpleNamespace
    import app.processed_cache as pc
    from app.processed_cache import ProcessedFeedCache

    feed = _base_feed(datetime(2026, 7, 20, tzinfo=timezone.utc))
    # present, but the theme object predates competition_penalty (Phase 8)
    feed.theme_intelligence = [SimpleNamespace(id="t1", relationship_weights={},
                                               confidence_label="x")]
    feed.industry_activation = []
    with open(tmp_path / "feed_INCOMPAT.pkl", "wb") as fh:
        pickle.dump(feed, fh)
    monkeypatch.setattr(pc, "_CACHE_DIR", tmp_path)
    monkeypatch.setattr(diagmod, "diagnostics", DiagnosticsStore())

    cache = ProcessedFeedCache()
    loaded = cache.get("INCOMPAT")
    assert loaded.theme_intelligence == []          # cleared
    st = diagmod.diagnostics.status_for("INCOMPAT")
    assert st["cache_schema_compatible"] is False
    assert st["compatibility_clear_reasons"]["theme_intelligence"] == \
        "incompatible_persisted_schema"


def test_genuinely_present_and_empty_is_compatible(tmp_path, monkeypatch):
    import app.processed_cache as pc
    from app.processed_cache import ProcessedFeedCache

    feed = _base_feed(datetime(2026, 7, 27, tzinfo=timezone.utc))
    feed.theme_intelligence = []       # present, legitimately empty
    feed.industry_activation = []
    feed.events = []
    with open(tmp_path / "feed_EMPTY.pkl", "wb") as fh:
        pickle.dump(feed, fh)
    monkeypatch.setattr(pc, "_CACHE_DIR", tmp_path)
    monkeypatch.setattr(diagmod, "diagnostics", DiagnosticsStore())

    cache = ProcessedFeedCache()
    cache.get("EMPTY")
    st = diagmod.diagnostics.status_for("EMPTY")
    assert st["cache_schema_compatible"] is True
    assert st["compatibility_clear_reasons"] == {}


# ── pipeline instrumentation (contextvar-published stats) ───────────────────────

def test_theme_graph_extract_stats_populate():
    from app import theme_graph
    begin_cycle_stats()
    theme_graph.extract_themes([])      # no clusters → no candidates
    stats = theme_graph.last_extract_stats()
    assert stats["candidates"] == 0 and stats["emitted"] == 0
    assert isinstance(stats["suppressed_by_reason"], dict)
