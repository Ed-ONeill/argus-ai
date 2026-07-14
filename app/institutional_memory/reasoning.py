"""
app/institutional_memory/reasoning.py — Institutional Reasoning Engine (M3.4).

Turns the durable archive into explanations and context: "when has this
happened before, and what usually happened next?" — computed EXCLUSIVELY from
Argus's own sealed institutional records. No LLM calls, no price data, no
speculation: every figure is a count over recorded state, every similarity is
a decomposed deterministic calculation, and every response carries the sample
size it came from.

WHAT AN EPISODE IS
  A (subject theme, anchor date) pair in the sealed archive whose surrounding
  state is compared against the subject's current state. Candidates require a
  complete follow-up horizon inside the archive (no future leaks, no partially
  observed outcomes) and may not overlap the current window for the same theme.

SIMILARITY (0-100, deterministic, decomposed — the decomposition IS the
"why" explanation):
  conviction_level   100 - 2·|Δconviction|                     weight 0.20
  trajectory         100 - 10·mean|Δdelta| over aligned deltas  weight 0.20
  relationships      100·Jaccard(typed edge sets at anchors)    weight 0.25
  narratives         100·Jaccard(narrative driver-uid sets)     weight 0.15
  transitions        100·Jaccard(transition-type sets, window)  weight 0.10
  regime             100 if same recorded regime else 0         weight 0.10
  Components with no evidence on either side are null and excluded; weights
  renormalize over available components; candidates with fewer than 3
  available components are skipped as incomparable.

OUTCOMES ("what happened next", per episode, over the following H sealed days)
  • the theme's own conviction change and transitions fired
  • industry activations that strengthened/weakened (|Δscore| >= 10)
  • narratives that FIRST emerged in the horizon containing the subject
    (the honest version of "what this pattern evolved into")
  • relationship appearances/disappearances for the subject
  Aggregates always report "N of M episodes" — never a bare percentage.
  Durations are OBSERVED days (UTC), not trading days, and censored runs
  (still active at archive edge) are flagged, not averaged in silently.

CREDIBILITY GATE (pre-registered in ARGUS_INSTITUTIONAL_MEMORY_V2.md §9):
  >= 60 distinct sealed archive days, >= 2 distinct recorded regimes, and
  >= 10 tested prediction outcomes. Until ALL gates pass, the engine returns
  status="insufficient_history" with the exact shortfalls — analog output is
  suppressed, never faked.
"""

from __future__ import annotations

import logging
from collections import Counter
from dataclasses import dataclass, field
from datetime import date, timedelta
from typing import Any

from app.institutional_memory.models import (
    SCHEMA_VERSION,
    SNAPSHOT_KIND_DAILY,
    utc_now,
)
from app.institutional_memory.outcomes import TESTED_VERDICTS
from app.institutional_memory.repository import SupabaseRepository

log = logging.getLogger(__name__)

ENGINE_VERSION = "m3.4.0"

DEFAULT_WINDOW_DAYS = 5
DEFAULT_HORIZON_DAYS = 10
DEFAULT_MAX_EPISODES = 5
MIN_SIMILARITY = 60.0
MIN_COMPONENTS = 3
ACTIVATION_DELTA = 10          # industry activation move that counts as a change
MAX_DURATION_SCAN = 60         # cap when measuring how long an episode ran

GATE_MIN_ARCHIVE_DAYS = 60
GATE_MIN_REGIMES = 2
GATE_MIN_TESTED_OUTCOMES = 10

_WEIGHTS = {
    "conviction_level": 0.20,
    "trajectory": 0.20,
    "relationships": 0.25,
    "narratives": 0.15,
    "transitions": 0.10,
    "regime": 0.10,
}

DISCLAIMERS = [
    "All figures are counts over Argus's own recorded institutional state "
    "(sealed daily snapshots); no market price data is involved.",
    "Historical frequencies are observations, not predictions or "
    "recommendations.",
    "Durations are observed UTC days, not trading days.",
]


# ── Archive corpus ──────────────────────────────────────────────────────────────

class ArchiveCorpus:
    """Sealed archive rows indexed for reasoning. Built once per request from
    repository reads (or directly from row lists in tests)."""

    def __init__(self, entity_rows: list[dict], relationship_rows: list[dict],
                 narrative_rows: list[dict], transition_rows: list[dict]) -> None:
        self.theme_by_uid_date: dict[tuple[str, str], dict] = {}
        self.industry_by_uid_date: dict[tuple[str, str], dict] = {}
        self.theme_dates: dict[str, list[str]] = {}
        self.all_dates: set[str] = set()
        for r in entity_rows:
            uid = r["entity_uid"]
            d = r["snapshot_date"]
            self.all_dates.add(d)
            if uid.startswith("theme:"):
                self.theme_by_uid_date[(uid, d)] = r
                self.theme_dates.setdefault(uid, []).append(d)
            elif uid.startswith("industry:"):
                self.industry_by_uid_date[(uid, d)] = r
        for dates in self.theme_dates.values():
            dates.sort()

        self.rels_by_date: dict[str, list[dict]] = {}
        self.regime_by_date: dict[str, str] = {}
        for r in relationship_rows:
            d = r["snapshot_date"]
            self.rels_by_date.setdefault(d, []).append(r)
            if r["source_uid"].startswith("regime:"):
                self.regime_by_date.setdefault(d, r["source_uid"])

        self.narratives_by_date: dict[str, list[dict]] = {}
        self.narrative_first_seen: dict[str, str] = {}
        for r in narrative_rows:
            d = r["snapshot_date"]
            self.narratives_by_date.setdefault(d, []).append(r)
            prev = self.narrative_first_seen.get(r["entity_uid"])
            if prev is None or d < prev:
                self.narrative_first_seen[r["entity_uid"]] = d

        self.transitions_by_uid: dict[str, list[dict]] = {}
        for t in transition_rows:
            self.transitions_by_uid.setdefault(
                t.get("entity_uid") or t.get("rel_uid"), []).append(t)

    # helpers ------------------------------------------------------------------

    def relationship_signature(self, uid: str, d: str) -> set[tuple[str, str, str]]:
        """Typed edges touching uid on date d: (type, role, other_uid)."""
        sig = set()
        for r in self.rels_by_date.get(d, []):
            if r["source_uid"] == uid:
                sig.add((r["relationship_type"], "out", r["target_uid"]))
            elif r["target_uid"] == uid:
                sig.add((r["relationship_type"], "in", r["source_uid"]))
        return sig

    def narrative_drivers(self, uid: str, d: str) -> set[str]:
        drivers: set[str] = set()
        for n in self.narratives_by_date.get(d, []):
            if uid in (n.get("member_uids") or []):
                drivers.update((n.get("driver_set_key") or "").split("+"))
        drivers.discard("")
        return drivers

    def transition_types(self, uid: str, date_from: str, date_to: str) -> set[str]:
        return {
            t["transition_type"] for t in self.transitions_by_uid.get(uid, [])
            if date_from <= str(t["effective_at"])[:10] <= date_to
        }

    def conviction_series(self, uid: str, date_from: str, date_to: str) -> list[tuple[str, int]]:
        out = []
        for d in self.theme_dates.get(uid, []):
            if date_from <= d <= date_to:
                c = self.theme_by_uid_date[(uid, d)].get("conviction")
                if c is not None:
                    out.append((d, int(c)))
        return out


@dataclass
class EpisodeFeatures:
    subject_uid: str
    anchor_date: str
    conviction: int | None
    deltas: list[int]
    relationships: set
    drivers: set
    transitions: set
    regime: str | None
    lifecycle: str | None


def extract_features(corpus: ArchiveCorpus, uid: str, anchor: str,
                     window: int) -> EpisodeFeatures | None:
    row = corpus.theme_by_uid_date.get((uid, anchor))
    if row is None:
        return None
    start = (date.fromisoformat(anchor) - timedelta(days=window - 1)).isoformat()
    series = corpus.conviction_series(uid, start, anchor)
    deltas = [b[1] - a[1] for a, b in zip(series, series[1:])]
    return EpisodeFeatures(
        subject_uid=uid,
        anchor_date=anchor,
        conviction=int(row["conviction"]) if row.get("conviction") is not None else None,
        deltas=deltas,
        relationships=corpus.relationship_signature(uid, anchor),
        drivers=corpus.narrative_drivers(uid, anchor),
        transitions=corpus.transition_types(uid, start, anchor),
        regime=corpus.regime_by_date.get(anchor),
        lifecycle=row.get("lifecycle"),
    )


# ── Similarity (deterministic, decomposed) ──────────────────────────────────────

def _jaccard(a: set, b: set) -> float | None:
    if not a and not b:
        return None            # no evidence on either side — never inflated
    if not a or not b:
        return 0.0
    return len(a & b) / len(a | b)


def compute_similarity(current: EpisodeFeatures,
                       candidate: EpisodeFeatures) -> tuple[float, dict, list[str]] | None:
    """→ (similarity 0-100, component scores, explanation lines) or None when
    fewer than MIN_COMPONENTS components have evidence."""
    components: dict[str, float | None] = {}
    explanation: list[str] = []

    if current.conviction is not None and candidate.conviction is not None:
        diff = abs(current.conviction - candidate.conviction)
        components["conviction_level"] = max(0.0, 100.0 - 2.0 * diff)
        explanation.append(f"conviction {candidate.conviction} then vs "
                           f"{current.conviction} now (difference {diff})")
    else:
        components["conviction_level"] = None

    if len(current.deltas) >= 1 and len(candidate.deltas) >= 1:
        k = min(len(current.deltas), len(candidate.deltas))
        a, b = current.deltas[-k:], candidate.deltas[-k:]
        mean_dev = sum(abs(x - y) for x, y in zip(a, b)) / k
        components["trajectory"] = max(0.0, 100.0 - 10.0 * mean_dev)
        explanation.append(f"conviction trajectory compared over {k} day-deltas "
                           f"(mean deviation {mean_dev:.1f} pts/day)")
    else:
        components["trajectory"] = None

    j = _jaccard(current.relationships, candidate.relationships)
    components["relationships"] = None if j is None else 100.0 * j
    if j is not None:
        shared = sorted(current.relationships & candidate.relationships)
        explanation.append(
            f"{len(shared)} shared recorded relationship(s) of "
            f"{len(current.relationships | candidate.relationships)} total"
            + (f", e.g. {shared[0][0]} {shared[0][2]}" if shared else ""))

    j = _jaccard(current.drivers, candidate.drivers)
    components["narratives"] = None if j is None else 100.0 * j
    if j is not None and (current.drivers & candidate.drivers):
        explanation.append("shared narrative drivers: "
                           + ", ".join(sorted(current.drivers & candidate.drivers)))

    j = _jaccard(current.transitions, candidate.transitions)
    components["transitions"] = None if j is None else 100.0 * j
    if j is not None and (current.transitions & candidate.transitions):
        explanation.append("same recent transition types: "
                           + ", ".join(sorted(current.transitions & candidate.transitions)))

    if current.regime and candidate.regime:
        same = current.regime == candidate.regime
        components["regime"] = 100.0 if same else 0.0
        explanation.append(("same recorded regime: " if same else
                            "different recorded regime: ")
                           + candidate.regime.split(":")[-1])
    else:
        components["regime"] = None

    available = {k: v for k, v in components.items() if v is not None}
    if len(available) < MIN_COMPONENTS:
        return None
    weight_sum = sum(_WEIGHTS[k] for k in available)
    score = sum(_WEIGHTS[k] * v for k, v in available.items()) / weight_sum
    return round(score, 1), {k: (round(v, 1) if v is not None else None)
                             for k, v in components.items()}, explanation


# ── Outcomes: what happened next ────────────────────────────────────────────────

def episode_outcomes(corpus: ArchiveCorpus, uid: str, anchor: str,
                     horizon: int) -> dict:
    """Recorded facts in the H sealed days after the anchor (exclusive)."""
    a = date.fromisoformat(anchor)
    h_start = (a + timedelta(days=1)).isoformat()
    h_end = (a + timedelta(days=horizon)).isoformat()

    # duration: consecutive presence from the anchor until first absent
    # archive day (absence needs the writer to have run: date in all_dates)
    duration, censored = 0, True
    for i in range(MAX_DURATION_SCAN):
        d = (a + timedelta(days=i)).isoformat()
        if (uid, d) in corpus.theme_by_uid_date:
            duration += 1
        elif d in corpus.all_dates:
            censored = False
            break

    series = corpus.conviction_series(uid, h_start, h_end)
    start_row = corpus.theme_by_uid_date.get((uid, anchor)) or {}
    conviction_change = (series[-1][1] - int(start_row.get("conviction")))            \
        if series and start_row.get("conviction") is not None else None

    transitions = sorted(corpus.transition_types(uid, h_start, h_end))

    industry_moves: dict[str, str] = {}
    industry_uids = {k[0] for k in corpus.industry_by_uid_date}
    for ind in industry_uids:
        base = corpus.industry_by_uid_date.get((ind, anchor))
        later = None
        for d, _c in reversed([(d, None) for d in sorted(corpus.all_dates)
                               if h_start <= d <= h_end]):
            later = corpus.industry_by_uid_date.get((ind, d))
            if later is not None:
                break
        if base is None or later is None:
            continue
        delta = int(later.get("conviction") or 0) - int(base.get("conviction") or 0)
        if delta >= ACTIVATION_DELTA:
            industry_moves[ind] = "activation_strengthened"
        elif delta <= -ACTIVATION_DELTA:
            industry_moves[ind] = "activation_weakened"

    emerged = []
    for n_uid, first in corpus.narrative_first_seen.items():
        if h_start <= first <= h_end:
            for n in corpus.narratives_by_date.get(first, []):
                if n["entity_uid"] == n_uid and uid in (n.get("member_uids") or []):
                    emerged.append({"narrative_uid": n_uid,
                                    "title": n.get("title"),
                                    "first_seen": first})
    emerged.sort(key=lambda e: e["narrative_uid"])

    return {
        "anchor_date": anchor,
        "duration_days_observed": duration,
        "duration_censored": censored,
        "conviction_change_over_horizon": conviction_change,
        "transitions_fired": transitions,
        "industry_moves": industry_moves,
        "narratives_emerged": emerged,
    }


def _aggregate_outcomes(outcomes: list[dict]) -> dict:
    n = len(outcomes)
    uncensored = [o["duration_days_observed"] for o in outcomes
                  if not o["duration_censored"]]
    effects: Counter = Counter()
    for o in outcomes:
        for ind, move in o["industry_moves"].items():
            effects[f"{ind}|{move}"] += 1
        for t in o["transitions_fired"]:
            effects[f"self|{t}"] += 1
    follow_ups: Counter = Counter()
    titles: dict[str, str] = {}
    for o in outcomes:
        for e in o["narratives_emerged"]:
            follow_ups[e["narrative_uid"]] += 1
            titles[e["narrative_uid"]] = e.get("title") or e["narrative_uid"]

    what_next = [
        {"effect": key.split("|", 1)[1], "subject": key.split("|", 1)[0],
         "episodes_observed": count, "episodes_total": n,
         "frequency": f"{count} of {n} episodes"}
        for key, count in effects.most_common()
    ]
    return {
        "episode_count": n,
        "average_duration_days_observed": (round(sum(uncensored) / len(uncensored), 1)
                                           if uncensored else None),
        "censored_durations": n - len(uncensored),
        "what_happened_next": what_next,
        "most_common_follow_up_narratives": [
            {"narrative_uid": uid, "title": titles[uid],
             "episodes_observed": c, "episodes_total": n,
             "note": "observed evolution in the archive — not a recommendation "
                     "or prediction"}
            for uid, c in follow_ups.most_common(5)
        ],
        "sector_leaders": [
            {"industry_uid": key.split("|", 1)[0], "episodes_observed": c,
             "episodes_total": n}
            for key, c in effects.most_common()
            if key.endswith("|activation_strengthened")
        ][:5],
    }


# ── Credibility gate ────────────────────────────────────────────────────────────

def analog_credibility(corpus: ArchiveCorpus, tested_outcome_count: int) -> dict:
    archive_days = len(corpus.all_dates)
    regimes = sorted(set(corpus.regime_by_date.values()))
    gates = {
        "min_archive_days": {"required": GATE_MIN_ARCHIVE_DAYS,
                             "actual": archive_days,
                             "met": archive_days >= GATE_MIN_ARCHIVE_DAYS},
        "min_distinct_regimes": {"required": GATE_MIN_REGIMES,
                                 "actual": len(regimes),
                                 "met": len(regimes) >= GATE_MIN_REGIMES},
        "min_tested_prediction_outcomes": {"required": GATE_MIN_TESTED_OUTCOMES,
                                           "actual": tested_outcome_count,
                                           "met": tested_outcome_count
                                                  >= GATE_MIN_TESTED_OUTCOMES},
    }
    return {"gates": gates, "met": all(g["met"] for g in gates.values()),
            "reference": "ARGUS_INSTITUTIONAL_MEMORY_V2.md §9"}


# ── Entry point ─────────────────────────────────────────────────────────────────

def build_historical_context(
    repo: SupabaseRepository,
    theme_uid: str,
    *,
    now=None,
    window: int = DEFAULT_WINDOW_DAYS,
    horizon: int = DEFAULT_HORIZON_DAYS,
    max_episodes: int = DEFAULT_MAX_EPISODES,
    min_similarity: float = MIN_SIMILARITY,
) -> dict:
    """Historical context for one theme, or an honest insufficient_history
    report. Deterministic for a fixed archive."""
    now = now or utc_now()
    today = now.date()
    sealed_through = (today - timedelta(days=1)).isoformat()

    start = repo.earliest_snapshot_date() or sealed_through
    corpus = ArchiveCorpus(
        repo.fetch_table_snapshots_between_paged(
            "entity_snapshots", start, sealed_through, SNAPSHOT_KIND_DAILY, SCHEMA_VERSION),
        repo.fetch_table_snapshots_between_paged(
            "relationship_snapshots", start, sealed_through, SNAPSHOT_KIND_DAILY, SCHEMA_VERSION),
        repo.fetch_table_snapshots_between_paged(
            "narrative_snapshots", start, sealed_through, SNAPSHOT_KIND_DAILY, SCHEMA_VERSION),
        repo.fetch_transitions_between("transition_events", "entity_uid",
                                       start, sealed_through),
    )
    tested = len([o for o in repo.list_outcomes(limit=1000)
                  if o.get("verdict") in TESTED_VERDICTS])
    credibility = analog_credibility(corpus, tested)

    method = {
        "engine_version": ENGINE_VERSION,
        "window_days": window,
        "horizon_days": horizon,
        "min_similarity": min_similarity,
        "component_weights": _WEIGHTS,
        "activation_change_threshold": ACTIVATION_DELTA,
        "source": "sealed daily institutional snapshots only",
    }
    base = {
        "theme_uid": theme_uid,
        "generated_at": now.isoformat(),
        "sealed_through": sealed_through,
        "method": method,
        "credibility": credibility,
        "disclaimers": DISCLAIMERS,
    }

    if not credibility["met"]:
        shortfalls = [k for k, g in credibility["gates"].items() if not g["met"]]
        base.update({
            "status": "insufficient_history",
            "note": ("Historical analogs are suppressed until the pre-registered "
                     f"credibility gates pass (unmet: {', '.join(shortfalls)}). "
                     "Nothing is estimated in their place."),
            "episodes": [],
            "aggregate": None,
        })
        log.info("[reasoning] theme=%s status=insufficient_history unmet=%s",
                 theme_uid, shortfalls)
        return base

    subject_dates = corpus.theme_dates.get(theme_uid, [])
    if not subject_dates:
        base.update({"status": "no_subject_history",
                     "note": "No sealed history exists for this theme yet.",
                     "episodes": [], "aggregate": None})
        return base

    anchor = subject_dates[-1]
    current = extract_features(corpus, theme_uid, anchor, window)
    if current is None:
        base.update({"status": "no_subject_history", "episodes": [],
                     "aggregate": None})
        return base

    latest_ok = (date.fromisoformat(sealed_through)
                 - timedelta(days=horizon)).isoformat()
    same_theme_cutoff = (date.fromisoformat(anchor)
                         - timedelta(days=window)).isoformat()

    scored: list[dict] = []
    for cand_uid, dates in sorted(corpus.theme_dates.items()):
        for d in dates:
            if d > latest_ok:
                continue        # follow-up horizon must be fully sealed
            if cand_uid == theme_uid and d > same_theme_cutoff:
                continue        # never compare a window against itself
            features = extract_features(corpus, cand_uid, d, window)
            if features is None:
                continue
            result = compute_similarity(current, features)
            if result is None:
                continue
            score, components, explanation = result
            if score < min_similarity:
                continue
            scored.append({
                "subject_uid": cand_uid,
                "anchor_date": d,
                "similarity": score,
                "components": components,
                "why": explanation,
                "outcomes": episode_outcomes(corpus, cand_uid, d, horizon),
            })

    scored.sort(key=lambda e: (-e["similarity"], e["subject_uid"], e["anchor_date"]))
    # one episode per (subject, ~week) to avoid five overlapping copies of the
    # same regime week dominating the list
    picked, seen_weeks = [], set()
    for e in scored:
        week = (e["subject_uid"], date.fromisoformat(e["anchor_date"]).isocalendar()[:2])
        if week in seen_weeks:
            continue
        seen_weeks.add(week)
        picked.append(e)
        if len(picked) >= max_episodes:
            break

    base.update({
        "status": "ok" if picked else "no_similar_episodes",
        "current_state": {
            "anchor_date": anchor,
            "conviction": current.conviction,
            "regime": current.regime,
            "relationships": sorted(current.relationships),
            "narrative_drivers": sorted(current.drivers),
        },
        "episodes": picked,
        "aggregate": _aggregate_outcomes([e["outcomes"] for e in picked]) if picked else None,
    })
    log.info("[reasoning] theme=%s status=%s episodes=%d archive_days=%d",
             theme_uid, base["status"], len(picked), len(corpus.all_dates))
    return base
