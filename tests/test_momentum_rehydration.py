"""
tests/test_momentum_rehydration.py — OP3.2 (Sprint 1): ThemeMomentumTracker
persistence and rehydration.

Contract under test (OP1_IMPLEMENTATION_PLAN §OP3.2):
  - restart continuity: every derived metric identical before/after a
    to_state()/restore_state() round trip, so a restart alone can never
    change momentum/persistence — and therefore can never emit a transition;
  - downtime policy: ≤2h full restore, ≤24h proportional decay, >24h explicit
    cold start;
  - corrupt/missing state cold-starts without raising;
  - the state rides in ThemeMemoryStore's file under its own key, and
    pre-change files (no key) simply restore nothing.
"""

from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone

from app.theme_graph import ThemeMomentumTracker
from app.theme_memory import ThemeMemoryStore

T0 = datetime(2026, 7, 21, 12, 0, tzinfo=timezone.utc)


def _tracker_with_history(n: int = 6, theme: str = "ai-energy-demand") -> ThemeMomentumTracker:
    """n cycles at 5-minute intervals, confidence rising 50 → 50+4(n-1)."""
    tr = ThemeMomentumTracker()
    for i in range(n):
        ts = T0 + timedelta(minutes=5 * i)
        tr.record(theme, 50 + 4 * i, "strong", ts, sector_spread=2 + (i % 2))
        tr.record_breadth(theme, 2 + (i % 2))
    return tr


def _metrics(tr: ThemeMomentumTracker, theme: str = "ai-energy-demand") -> dict:
    return {
        "label": tr.momentum_label(theme),
        "delta": tr.prev_delta(theme),
        "cycles": tr.persistence_cycles(theme),
        "persistence": tr.persistence_score(theme),
        "volatility": tr.volatility_score(theme),
        "breadth_trend": tr.breadth_trend(theme),
        "mean_breadth": tr.mean_breadth(theme),
    }


# ── Restart continuity ─────────────────────────────────────────────────────────

def test_round_trip_preserves_every_derived_metric():
    tr = _tracker_with_history()
    saved_at = T0 + timedelta(minutes=25)
    state = tr.to_state(saved_at)

    fresh = ThemeMomentumTracker()
    assert fresh.restore_state(state, now=saved_at + timedelta(minutes=10)) is True
    assert _metrics(fresh) == _metrics(tr)


def test_restart_does_not_reset_mature_theme_to_emerging():
    tr = _tracker_with_history()
    assert tr.momentum_label("ai-energy-demand") in ("strengthening", "accelerating")

    fresh = ThemeMomentumTracker()
    fresh.restore_state(tr.to_state(T0 + timedelta(minutes=25)),
                        now=T0 + timedelta(minutes=30))
    assert fresh.momentum_label("ai-energy-demand") != "emerging"
    assert fresh.persistence_cycles("ai-energy-demand") == 6


def test_no_false_transition_on_restart():
    """A pure restart must be observationally invisible: the restored state
    re-serializes to identical history, so no downstream consumer (archive
    snapshots, deltas) can see a change that isn't in the data."""
    tr = _tracker_with_history()
    saved_at = T0 + timedelta(minutes=25)
    state = tr.to_state(saved_at)

    fresh = ThemeMomentumTracker()
    fresh.restore_state(state, now=saved_at + timedelta(minutes=5))
    assert fresh.to_state(saved_at)["history"] == state["history"]
    assert fresh.to_state(saved_at)["breadth"] == state["breadth"]


def test_restore_is_read_only():
    """restore_state never writes: it takes a plain dict and touches no store."""
    tr = _tracker_with_history()
    state = tr.to_state(T0 + timedelta(minutes=25))
    before = json.dumps(state, sort_keys=True)
    ThemeMomentumTracker().restore_state(state, now=T0 + timedelta(minutes=30))
    assert json.dumps(state, sort_keys=True) == before


# ── Downtime policy ────────────────────────────────────────────────────────────

def test_downtime_between_2h_and_24h_decays_proportionally():
    tr = _tracker_with_history(n=6)
    saved_at = T0 + timedelta(minutes=25)
    state = tr.to_state(saved_at)

    fresh = ThemeMomentumTracker()
    # 6h gap → drop int(6/2)=3 oldest snapshots; 3 remain
    assert fresh.restore_state(state, now=saved_at + timedelta(hours=6)) is True
    assert fresh.persistence_cycles("ai-energy-demand") == 3


def test_downtime_over_24h_is_explicit_cold_start():
    tr = _tracker_with_history()
    state = tr.to_state(T0 + timedelta(minutes=25))

    fresh = ThemeMomentumTracker()
    assert fresh.restore_state(state, now=T0 + timedelta(hours=30)) is False
    assert fresh.persistence_cycles("ai-energy-demand") == 0
    assert fresh.momentum_label("ai-energy-demand") == "emerging"


def test_short_gap_is_full_restore():
    tr = _tracker_with_history(n=6)
    state = tr.to_state(T0 + timedelta(minutes=25))
    fresh = ThemeMomentumTracker()
    assert fresh.restore_state(state, now=T0 + timedelta(minutes=25 + 90)) is True
    assert fresh.persistence_cycles("ai-energy-demand") == 6   # ≤2h: nothing dropped


# ── Corrupt / missing state ────────────────────────────────────────────────────

def test_none_state_cold_starts_quietly():
    fresh = ThemeMomentumTracker()
    assert fresh.restore_state(None, now=T0) is False


def test_corrupt_state_never_raises():
    fresh = ThemeMomentumTracker()
    for bad in (
        {"version": 99},
        {"version": 1},                                  # no saved_at
        {"version": 1, "saved_at": "not-a-date"},
        {"version": 1, "saved_at": T0.isoformat(), "history": {"t": [{"c": "x"}]}},
        "garbage",
        42,
    ):
        assert fresh.restore_state(bad, now=T0 + timedelta(minutes=5)) is False  # type: ignore[arg-type]
        assert fresh.persistence_cycles("anything") == 0


def test_future_saved_at_cold_starts():
    tr = _tracker_with_history()
    state = tr.to_state(T0 + timedelta(hours=2))
    fresh = ThemeMomentumTracker()
    assert fresh.restore_state(state, now=T0) is False


# ── Store integration ──────────────────────────────────────────────────────────

def test_store_round_trip_and_reload_from_disk(tmp_path):
    path = tmp_path / "theme_memory.json"
    store = ThemeMemoryStore(path=path)
    tr = _tracker_with_history()
    store.save_tracker_state(tr.to_state(T0 + timedelta(minutes=25)))

    # a NEW store instance (fresh process) reads the same state back
    reloaded = ThemeMemoryStore(path=path)
    state = reloaded.load_tracker_state()
    assert state is not None

    fresh = ThemeMomentumTracker()
    assert fresh.restore_state(state, now=T0 + timedelta(minutes=35)) is True
    assert _metrics(fresh) == _metrics(tr)


def test_pre_change_store_file_has_no_state_and_is_not_disturbed(tmp_path):
    path = tmp_path / "theme_memory.json"
    legacy = {"version": 1, "themes": {"ai-energy-demand": {"memory": {"status": "active"}}}}
    path.write_text(json.dumps(legacy), encoding="utf-8")

    store = ThemeMemoryStore(path=path)
    assert store.load_tracker_state() is None          # additive key absent → nothing restored

    store.save_tracker_state(_tracker_with_history().to_state(T0))
    on_disk = json.loads(path.read_text(encoding="utf-8"))
    assert on_disk["themes"] == legacy["themes"]       # theme data untouched
    assert "momentum_tracker" in on_disk
