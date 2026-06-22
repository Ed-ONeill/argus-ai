"""
app/theme_memory.py — Thematic Intelligence Memory.

A persistent, fully-deterministic record of how each theme evolves across
pipeline cycles. It lets Argus know whether a theme is new, recurring,
strengthening, weakening, or stale; whether today's evidence confirms or
contradicts prior evidence; whether a move is a one-off story or a persistent
pattern; and which sectors / tickers have historically been linked to a theme.

DESIGN PRINCIPLES
  • No hallucinated memory. Every stored field is derived ONLY from
    extract_themes() output and the live StoryCluster set (both of which are
    themselves keyword/entity-derived from ingested stories). There are NO LLM
    calls here and the LLM never writes history — every remembered claim traces
    back to stored story ids / source names / structured theme fields.
  • Persistence mirrors the existing ProcessedFeedCache disk pattern: a single
    JSON document written atomically (temp file + replace). JSON (not pickle) so
    the trail is human-inspectable and survives code changes. Supabase is NOT
    used here — it is wired to the frontend only; the backend has no DB
    connection, so we follow the established on-disk pattern.
  • Bounded + cached. The store is held in memory (loaded once) and persisted on
    each update. Per-theme time series are ring-buffered so the file stays small.
  • Non-blocking. update() is called from the background FeedRefresher thread,
    after theme extraction, so it never sits on a page-load path.

THREE LOGICAL RECORD TYPES (persisted together under each theme)
  1. ThemeMemory      — rolling per-theme summary (first/last seen, counts, trend)
  2. ThemeObservation — per-cycle snapshot (conviction, momentum, lifecycle)
  3. ThemeEvidence    — per-cycle evidence trail (story ids, sources, sectors,
                        tickers, root causes, transmission path, catalysts, risks)
"""

from __future__ import annotations

import json
import logging
import os
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

log = logging.getLogger(__name__)

# ── Storage location ──────────────────────────────────────────────────────────
# Honors THEME_MEMORY_DIR so the store can live on a persistent volume (e.g. a
# Railway Volume mount) and survive redeploys / container restarts. Falls back to
# the local repo path (project_root/data/theme_memory, mirroring
# ProcessedFeedCache) when the env var is absent.
_DEFAULT_STORE_DIR = Path(__file__).resolve().parent.parent / "data" / "theme_memory"
_STORE_DIR  = Path(os.getenv("THEME_MEMORY_DIR") or _DEFAULT_STORE_DIR)
_STORE_PATH = _STORE_DIR / "theme_memory.json"

# ── Tunables ────────────────────────────────────────────────────────────────────
_MAX_OBSERVATIONS   = 120          # per-theme snapshot ring buffer (~10h @ 5-min cycles)
_MAX_EVIDENCE       = 60           # per-theme evidence ring buffer
_STALE_AFTER_SEC    = 6 * 3600     # not seen for 6h → stale
_RECURRING_MIN_OBS  = 6            # observed in ≥6 cycles → "recurring" pattern
_TREND_DELTA        = 3            # conviction delta (pts) that counts as a real move
_REFRESH_CYCLE_SEC  = 5 * 60       # background refresh cadence (for days-active math)

_STRENGTHENING_LABELS = {"accelerating", "strengthening"}
_WEAKENING_LABELS     = {"cooling", "reversing"}


# ── Derivations from raw theme + clusters (pure, traceable) ─────────────────────

def _item_sentiment(item: object) -> str:
    impact = (getattr(item, "impact", "") or "").lower()
    if impact.startswith("bullish"): return "bullish"
    if impact.startswith("bearish"): return "bearish"
    if impact.startswith("mixed"):   return "mixed"
    return "neutral"


def _confirming_contradicting(theme: object, by_id: dict) -> tuple[int, int, list[str]]:
    """
    Count contributing stories that CONFIRM vs CONTRADICT the theme's direction.

    Deterministic: a story confirms when its own impact sentiment matches the
    theme's momentum_direction; it contradicts when it carries the opposite
    directional sentiment. Neutral themes treat any contributing story as
    confirming presence. Returns (confirming, contradicting, source_names).
    """
    direction = getattr(theme, "momentum_direction", "neutral")
    confirming = 0
    contradicting = 0
    sources: list[str] = []
    for cid in (getattr(theme, "contributing_cluster_ids", None) or []):
        cluster = by_id.get(cid)
        if cluster is None:
            continue
        primary = getattr(cluster, "primary", None)
        if primary is None:
            continue
        src = getattr(primary, "source", "") or ""
        if src and src not in sources:
            sources.append(src)
        sent = _item_sentiment(primary)
        if direction in ("bullish", "bearish"):
            if sent == direction:
                confirming += 1
            elif sent in ("bullish", "bearish"):
                contradicting += 1
        else:
            # neutral theme — count any contributing story as supporting presence
            confirming += 1
    return confirming, contradicting, sources


def _lifecycle_state(theme: object, observation_count: int, status: str) -> str:
    """Coarse lifecycle label derived from persistence + status (no LLM)."""
    cycles = int(getattr(theme, "persistence_cycles", 0) or 0)
    if status == "stale":
        return "dormant"
    if observation_count <= 1:
        return "new"
    if status == "strengthening":
        return "building"
    if status == "weakening":
        return "fading"
    if cycles >= _RECURRING_MIN_OBS:
        return "mature"
    return "active"


def _trend_direction(momentum_label: str, conviction_delta: int) -> int:
    """+1 strengthening, -1 weakening, 0 stable — from momentum label OR delta."""
    if momentum_label in _STRENGTHENING_LABELS or conviction_delta >= _TREND_DELTA:
        return 1
    if momentum_label in _WEAKENING_LABELS or conviction_delta <= -_TREND_DELTA:
        return -1
    return 0


# ── Store ───────────────────────────────────────────────────────────────────────

class ThemeMemoryStore:
    """
    In-memory + on-disk store of theme memory. Loaded once at construction,
    persisted atomically after each update(). Thread-safe (RLock) because
    update() runs on the background thread while reads come from request threads.
    """

    def __init__(self, path: Path = _STORE_PATH) -> None:
        self._path = path
        self._lock = threading.RLock()
        self._data: dict[str, Any] = {"version": 1, "themes": {}}
        self._load()

    # ── persistence ─────────────────────────────────────────────────────────────

    def _load(self) -> None:
        try:
            if self._path.exists():
                with open(self._path, "r", encoding="utf-8") as fh:
                    loaded = json.load(fh)
                if isinstance(loaded, dict) and "themes" in loaded:
                    self._data = loaded
                    log.info("ThemeMemoryStore: loaded %d themes from disk", len(loaded.get("themes", {})))
        except Exception as exc:
            log.warning("ThemeMemoryStore: load failed (%s) — starting empty", exc)
            self._data = {"version": 1, "themes": {}}

    def _save(self) -> None:
        try:
            _STORE_DIR.mkdir(parents=True, exist_ok=True)
            tmp = self._path.with_suffix(".tmp")
            with open(tmp, "w", encoding="utf-8") as fh:
                json.dump(self._data, fh, ensure_ascii=False, separators=(",", ":"))
            tmp.replace(self._path)   # atomic on POSIX, best-effort on Windows
        except Exception as exc:
            log.warning("ThemeMemoryStore: save failed: %s", exc)

    # ── update (called after theme extraction, on the background thread) ─────────

    def update(self, themes: list, clusters: list, now: datetime | None = None) -> int:
        """
        Fold this cycle's extracted themes into persistent memory.

        For each active theme: append an observation + evidence record, update
        the rolling summary (first/last seen, counts, streaks, conviction trend,
        historical sector/ticker frequencies). Themes NOT present this cycle have
        their absence tracked and are marked stale once unseen past the TTL.

        Returns the number of themes updated. Never raises — failures are logged
        so the pipeline is never blocked or broken by the memory layer.
        """
        if now is None:
            now = datetime.now(timezone.utc)
        now_iso = now.isoformat()
        now_ts  = now.timestamp()

        try:
            with self._lock:
                by_id = {getattr(c, "id", None): c for c in (clusters or [])}
                themes_map: dict[str, Any] = self._data.setdefault("themes", {})
                seen_ids: set[str] = set()

                for theme in (themes or []):
                    tid = getattr(theme, "id", None)
                    if not tid:
                        continue
                    seen_ids.add(tid)
                    self._update_one(themes_map, theme, by_id, now_iso, now_ts)

                # Themes present in memory but NOT this cycle → track absence / stale
                for tid, rec in themes_map.items():
                    if tid in seen_ids:
                        continue
                    mem = rec["memory"]
                    mem["cycles_absent"] = int(mem.get("cycles_absent", 0)) + 1
                    last_ts = float(mem.get("last_seen_ts", 0.0))
                    if now_ts - last_ts >= _STALE_AFTER_SEC:
                        mem["status"] = "stale"
                        mem["lifecycle_current"] = "dormant"

                self._save()
                return len(seen_ids)
        except Exception:
            log.exception("ThemeMemoryStore.update FAILED — memory not updated this cycle")
            return 0

    def _update_one(self, themes_map: dict, theme: object, by_id: dict, now_iso: str, now_ts: float) -> None:
        tid  = getattr(theme, "id")
        name = getattr(theme, "name", tid)
        conviction = int(getattr(theme, "confidence", 0) or 0)
        momentum_label     = getattr(theme, "momentum_label", "emerging")
        momentum_direction = getattr(theme, "momentum_direction", "neutral")
        momentum_delta     = int(getattr(theme, "momentum_delta", 0) or 0)
        signal_strength    = getattr(theme, "signal_strength", "weak")
        breadth            = int(getattr(theme, "breadth_score", 0) or 0)
        persistence_cycles = int(getattr(theme, "persistence_cycles", 0) or 0)
        evidence_count     = int(getattr(theme, "evidence_count", 0) or 0)
        sectors = list(getattr(theme, "related_industries", []) or [])
        tickers = list(getattr(theme, "related_assets", []) or [])
        macros  = list(getattr(theme, "related_macro_factors", []) or [])
        risks   = list(getattr(theme, "second_order_effects", []) or [])
        causal  = getattr(theme, "causal_narrative", "") or ""
        story_ids = list(getattr(theme, "contributing_cluster_ids", []) or [])

        confirming, contradicting, sources = _confirming_contradicting(theme, by_id)

        rec = themes_map.get(tid)
        if rec is None:
            # ── First time this theme has ever been seen ──────────────────────
            mem = {
                "theme_id": tid, "name": name,
                "first_seen": now_iso, "first_seen_ts": now_ts,
                "last_seen":  now_iso, "last_seen_ts":  now_ts,
                "observation_count": 0,
                "confirming_total": 0, "contradicting_total": 0,
                "conviction_first": conviction,
                "conviction_prev":  conviction,
                "conviction_current": conviction,
                "conviction_peak": conviction, "conviction_trough": conviction,
                "momentum_current": momentum_label,
                "direction_current": momentum_direction,
                "lifecycle_current": "new",
                "status": "new",
                "strengthening_streak": 0, "weakening_streak": 0, "stable_streak": 0,
                "cycles_absent": 0,
                "sector_counts": {}, "ticker_counts": {},
                "last_confirming": 0, "last_contradicting": 0,
            }
            rec = {"memory": mem, "observations": [], "evidence": []}
            themes_map[tid] = rec

        mem = rec["memory"]
        prev_conviction = int(mem.get("conviction_current", conviction))
        conviction_delta = conviction - prev_conviction

        # ── streaks + status ──────────────────────────────────────────────────
        trend = _trend_direction(momentum_label, conviction_delta)
        if trend > 0:
            mem["strengthening_streak"] = int(mem.get("strengthening_streak", 0)) + 1
            mem["weakening_streak"] = 0
            mem["stable_streak"] = 0
        elif trend < 0:
            mem["weakening_streak"] = int(mem.get("weakening_streak", 0)) + 1
            mem["strengthening_streak"] = 0
            mem["stable_streak"] = 0
        else:
            mem["stable_streak"] = int(mem.get("stable_streak", 0)) + 1
            mem["strengthening_streak"] = 0
            mem["weakening_streak"] = 0

        mem["observation_count"] = int(mem.get("observation_count", 0)) + 1
        observation_count = mem["observation_count"]

        if observation_count <= 1:
            status = "new"
        elif trend > 0:
            status = "strengthening"
        elif trend < 0:
            status = "weakening"
        elif observation_count >= _RECURRING_MIN_OBS:
            status = "recurring"
        else:
            status = "active"

        # ── update rolling summary ────────────────────────────────────────────
        mem["name"] = name
        mem["last_seen"] = now_iso
        mem["last_seen_ts"] = now_ts
        mem["cycles_absent"] = 0
        mem["conviction_prev"] = prev_conviction
        mem["conviction_current"] = conviction
        mem["conviction_peak"]   = max(int(mem.get("conviction_peak", conviction)), conviction)
        mem["conviction_trough"] = min(int(mem.get("conviction_trough", conviction)), conviction)
        mem["momentum_current"]  = momentum_label
        mem["direction_current"] = momentum_direction
        mem["status"] = status
        mem["confirming_total"]    = int(mem.get("confirming_total", 0)) + confirming
        mem["contradicting_total"] = int(mem.get("contradicting_total", 0)) + contradicting
        mem["last_confirming"]    = confirming
        mem["last_contradicting"] = contradicting
        mem["lifecycle_current"]  = _lifecycle_state(theme, observation_count, status)

        # historical linkage frequencies (which sectors/tickers recur for this theme)
        sc = mem.setdefault("sector_counts", {})
        for s in sectors:
            sc[s] = int(sc.get(s, 0)) + 1
        tc = mem.setdefault("ticker_counts", {})
        for tk in tickers:
            tc[tk] = int(tc.get(tk, 0)) + 1

        # ── observation (time series) ─────────────────────────────────────────
        obs = rec.setdefault("observations", [])
        obs.append({
            "ts": now_iso,
            "conviction": conviction,
            "momentum_label": momentum_label,
            "momentum_direction": momentum_direction,
            "momentum_delta": momentum_delta,
            "signal_strength": signal_strength,
            "lifecycle": mem["lifecycle_current"],
            "breadth_score": breadth,
            "persistence_cycles": persistence_cycles,
            "evidence_count": evidence_count,
            "confirming": confirming,
            "contradicting": contradicting,
        })
        if len(obs) > _MAX_OBSERVATIONS:
            del obs[:len(obs) - _MAX_OBSERVATIONS]

        # ── evidence trail (story ids → traceable facts) ──────────────────────
        ev = rec.setdefault("evidence", [])
        ev.append({
            "ts": now_iso,
            "story_ids": story_ids,
            "sources": sources,
            "sectors": sectors,
            "tickers": tickers,
            "root_causes": macros,            # upstream macro drivers
            "transmission_path": causal,      # "Upstream → Theme → Downstream"
            "catalysts": macros,              # macro catalysts the theme depends on
            "risks": risks,                   # second-order effects / what breaks it
        })
        if len(ev) > _MAX_EVIDENCE:
            del ev[:len(ev) - _MAX_EVIDENCE]

    # ── retrieval ────────────────────────────────────────────────────────────────

    def get(self, theme_id: str) -> dict | None:
        with self._lock:
            rec = self._data.get("themes", {}).get(theme_id)
            return json.loads(json.dumps(rec)) if rec else None   # deep copy for safety

    def summarize(self, theme_id: str, now: datetime | None = None) -> dict | None:
        """UI-ready facts for one theme (the figures behind 'Strengthening for 6
        sessions', 'First detected 12 days ago', 'Conviction 62 → 78', etc.)."""
        with self._lock:
            rec = self._data.get("themes", {}).get(theme_id)
            if rec is None:
                return None
            return self._summarize_rec(rec, now or datetime.now(timezone.utc))

    def _summarize_rec(self, rec: dict, now: datetime) -> dict:
        mem = rec["memory"]
        obs = rec.get("observations", [])
        now_ts = now.timestamp()

        status = mem.get("status", "active")
        streak = (
            mem.get("strengthening_streak", 0) if status == "strengthening"
            else mem.get("weakening_streak", 0) if status == "weakening"
            else mem.get("stable_streak", 0)
        )

        # conviction window: current vs value up to 6 sessions ago (the "62 → 78")
        window = obs[-min(len(obs), 6):] if obs else []
        conviction_window_start = window[0]["conviction"] if window else mem.get("conviction_current", 0)
        conviction_current = mem.get("conviction_current", 0)

        first_ts = float(mem.get("first_seen_ts", now_ts))
        last_ts  = float(mem.get("last_seen_ts", now_ts))
        observation_count = int(mem.get("observation_count", 0))
        confirming_total = int(mem.get("confirming_total", 0))
        contradicting_total = int(mem.get("contradicting_total", 0))

        delta = conviction_current - int(conviction_window_start)
        conviction_trend = "rising" if delta >= _TREND_DELTA else "falling" if delta <= -_TREND_DELTA else "stable"

        top = lambda d: [k for k, _ in sorted(d.items(), key=lambda kv: kv[1], reverse=True)]  # noqa: E731

        return {
            "theme_id": mem.get("theme_id"),
            "name": mem.get("name"),
            "status": status,                                  # new|strengthening|weakening|recurring|active|stale
            "sessions_in_status": int(streak),                 # "Strengthening for N sessions"
            "sessions_observed": observation_count,
            "first_seen": mem.get("first_seen"),
            "first_seen_days_ago": round((now_ts - first_ts) / 86400, 1),
            "last_seen": mem.get("last_seen"),
            "last_seen_hours_ago": round((now_ts - last_ts) / 3600, 1),
            "confirmations_today": int(mem.get("last_confirming", 0)),    # "3 new confirmations today"
            "contradictions_today": int(mem.get("last_contradicting", 0)),# "Contradicted by 2 stories"
            "confirming_total": confirming_total,
            "contradicting_total": contradicting_total,
            "conviction_current": conviction_current,
            "conviction_first": int(mem.get("conviction_first", conviction_current)),
            "conviction_prev": int(mem.get("conviction_prev", conviction_current)),
            "conviction_window_start": int(conviction_window_start),       # "Conviction 62 → 78"
            "conviction_change": delta,
            "conviction_trend": conviction_trend,
            "conviction_peak": int(mem.get("conviction_peak", conviction_current)),
            "conviction_trough": int(mem.get("conviction_trough", conviction_current)),
            "momentum": mem.get("momentum_current"),
            "lifecycle": mem.get("lifecycle_current"),
            "historical_tickers": top(mem.get("ticker_counts", {}))[:6],   # "linked to NVDA, CEG, VST"
            "historical_sectors": top(mem.get("sector_counts", {}))[:6],
            # raw session counts so consumers can phrase "Semiconductors confirmed
            # this theme in 6 of N sessions" without inventing numbers.
            "sector_sessions": dict(mem.get("sector_counts", {})),
            "ticker_sessions": dict(mem.get("ticker_counts", {})),
            # interpretive flags conclusions can rely on (deterministic):
            "is_new": observation_count <= 1,
            "is_one_off": observation_count <= 2,
            "is_persistent_pattern": observation_count >= _RECURRING_MIN_OBS
                                     and confirming_total > contradicting_total * 2,
            "is_stale": status == "stale",
            "evidence_confirms_prior": confirming_total >= contradicting_total,
        }

    def all_summaries(self, now: datetime | None = None) -> list[dict]:
        now = now or datetime.now(timezone.utc)
        with self._lock:
            return [self._summarize_rec(rec, now) for rec in self._data.get("themes", {}).values()]

    def recent_changes(self, limit: int = 10, now: datetime | None = None) -> list[dict]:
        """Themes with the largest recent conviction move OR a status change,
        most significant first. Drives a 'what changed' view."""
        sums = self.all_summaries(now)
        # rank by absolute conviction change, then by confirmations today
        sums.sort(key=lambda s: (abs(s["conviction_change"]), s["confirmations_today"]), reverse=True)
        return [s for s in sums if s["conviction_change"] != 0 or s["confirmations_today"] > 0][:limit]

    def strengthening(self, limit: int = 10, now: datetime | None = None) -> list[dict]:
        sums = [s for s in self.all_summaries(now) if s["status"] == "strengthening"]
        sums.sort(key=lambda s: (s["sessions_in_status"], s["conviction_change"]), reverse=True)
        return sums[:limit]

    def weakening(self, limit: int = 10, now: datetime | None = None) -> list[dict]:
        sums = [s for s in self.all_summaries(now) if s["status"] == "weakening"]
        sums.sort(key=lambda s: (s["sessions_in_status"], -s["conviction_change"]), reverse=True)
        return sums[:limit]

    def stale(self, limit: int = 20, now: datetime | None = None) -> list[dict]:
        sums = [s for s in self.all_summaries(now) if s["status"] == "stale"]
        sums.sort(key=lambda s: s["last_seen_hours_ago"], reverse=True)
        return sums[:limit]

    def evidence_trail(self, theme_id: str, limit: int = 30) -> list[dict]:
        with self._lock:
            rec = self._data.get("themes", {}).get(theme_id)
            if rec is None:
                return []
            ev = rec.get("evidence", [])
            return json.loads(json.dumps(ev[-limit:]))

    def influence_weight(self, theme_id: str) -> float:
        """How much a theme should weigh in feed ranking, by persistence /
        confirmation across sessions. Backend mirror of the frontend
        themePersistenceWeight. ~0.5–1.35; 1.0 when no memory yet."""
        with self._lock:
            rec = self._data.get("themes", {}).get(theme_id)
            if rec is None:
                return 1.0
            m = rec["memory"]
            obs    = int(m.get("observation_count", 0))
            conf   = int(m.get("confirming_total", 0))
            contra = int(m.get("contradicting_total", 0))
            status = m.get("status", "active")
            persistent = obs >= _RECURRING_MIN_OBS and conf > contra * 2
            w = 1.0
            if persistent:                 w += 0.25
            elif obs >= _RECURRING_MIN_OBS: w += 0.12
            if obs <= 1:                   w -= 0.30
            elif obs <= 2:                 w -= 0.18
            if status == "strengthening":  w += 0.10
            elif status == "weakening":    w -= 0.08
            elif status == "stale":        w -= 0.35
            if contra > conf:              w -= 0.12
            return max(0.5, min(1.35, w))

    def brief_context(self, limit: int = 6, now: datetime | None = None) -> str:
        """A compact factual memory block for grounding the LLM market brief.
        Lists what has strengthened / weakened / gone stale across sessions, with
        conviction trajectories. The brief must explain change using ONLY these
        stored facts — it never invents prior history."""
        sums = self.all_summaries(now)
        if not sums:
            return ""

        def fmt(s: dict) -> str:
            return (f"{s['name']} (conviction {s['conviction_window_start']}->"
                    f"{s['conviction_current']} over {s['sessions_in_status']} sessions)")

        strengthening = sorted([s for s in sums if s["status"] == "strengthening"],
                               key=lambda s: s["sessions_in_status"], reverse=True)
        weakening     = sorted([s for s in sums if s["status"] == "weakening"],
                               key=lambda s: s["sessions_in_status"], reverse=True)
        stale         = [s for s in sums if s["status"] == "stale"]
        new_themes    = [s for s in sums if s["is_new"]]

        lines: list[str] = []
        if strengthening:
            lines.append("STRENGTHENING across sessions: " + "; ".join(fmt(s) for s in strengthening[:limit]))
        if weakening:
            lines.append("WEAKENING across sessions: " + "; ".join(fmt(s) for s in weakening[:limit]))
        if stale:
            lines.append("STALE / no longer confirmed: " + ", ".join(s["name"] for s in stale[:limit]))
        if new_themes:
            lines.append("NEWLY DETECTED (unconfirmed): " + ", ".join(s["name"] for s in new_themes[:limit]))
        return "\n".join(lines)


# ── Module-level singleton + convenience wrappers ───────────────────────────────

theme_memory = ThemeMemoryStore()


def update_theme_memory(themes: list, clusters: list, now: datetime | None = None) -> int:
    """Fold a pipeline cycle's themes into persistent memory (non-blocking caller)."""
    return theme_memory.update(themes, clusters, now)


def get_theme_memory(theme_id: str) -> dict | None:
    return theme_memory.get(theme_id)


def summarize_theme(theme_id: str) -> dict | None:
    return theme_memory.summarize(theme_id)


def get_all_summaries() -> list[dict]:
    return theme_memory.all_summaries()


def get_recent_changes(limit: int = 10) -> list[dict]:
    return theme_memory.recent_changes(limit)


def get_strengthening(limit: int = 10) -> list[dict]:
    return theme_memory.strengthening(limit)


def get_weakening(limit: int = 10) -> list[dict]:
    return theme_memory.weakening(limit)


def get_stale(limit: int = 20) -> list[dict]:
    return theme_memory.stale(limit)


def get_evidence_trail(theme_id: str, limit: int = 30) -> list[dict]:
    return theme_memory.evidence_trail(theme_id, limit)


def influence_weight(theme_id: str) -> float:
    """Feed-ranking persistence weight for a theme (~0.5–1.35; 1.0 if no memory)."""
    return theme_memory.influence_weight(theme_id)


def brief_memory_context(limit: int = 6) -> str:
    """Factual strengthened/weakened/stale context for grounding the market brief."""
    return theme_memory.brief_context(limit)
