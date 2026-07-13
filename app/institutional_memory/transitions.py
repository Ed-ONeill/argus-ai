"""
app/institutional_memory/transitions.py — Transition derivation (M3.1).

Compares two SEALED daily snapshots of the same theme and emits deterministic
TransitionEvents. Semantics mirror the concepts already used by ThemeMemory
and Intelligence Deltas rather than inventing new delta logic:

  conviction_strengthened / conviction_weakened
      |Δ conviction| >= CONVICTION_DELTA (3 pts — ThemeMemory._TREND_DELTA)
  lifecycle_changed
      lifecycle label differs
  evidence_strengthened / evidence_weakened
      verdict rank moved (speculative < developing < confirmed), OR
      |Δ evidence_count| >= EVIDENCE_DELTA (2 contributing stories)
  contradiction_added / contradiction_removed
      contradicting_total count moved. M3.1 limitation: contradictions exist
      only as counts in the pipeline (no itemized records with stable
      identity), so comparison is count-based — documented, not guessed.
  breadth_changed
      |Δ breadth| >= BREADTH_DELTA (2 industries — mirrors breadth_trend)
  causal_path_changed
      causal_narrative string differs deterministically (empty == null)
  active_status_changed
      theme present on one sealed day and absent on the other

No transition is emitted when values are unchanged. All comparisons read
typed values out of payload['state'], so JSON ordering differences can never
fire an event. event_key is deterministic per (uid, type, effective date).
"""

from __future__ import annotations

from app.institutional_memory.models import (
    SCHEMA_VERSION,
    TransitionEvent,
    transition_event_key,
)

CONVICTION_DELTA = 3     # pts — mirrors app/theme_memory.py _TREND_DELTA
EVIDENCE_DELTA = 2       # contributing stories
BREADTH_DELTA = 2        # distinct industries — mirrors breadth_trend widening/narrowing

_VERDICT_RANK = {"speculative": 0, "developing": 1, "confirmed": 2}


def _state(snapshot_row: dict) -> dict:
    return ((snapshot_row.get("payload") or {}).get("state")) or {}


def _int_or_none(value) -> int | None:
    try:
        return int(value) if value is not None else None
    except (TypeError, ValueError):
        return None


def derive_theme_transitions(prev_row: dict, curr_row: dict) -> list[TransitionEvent]:
    """Events between two sealed daily snapshots of the SAME theme.

    prev_row / curr_row are entity_snapshots rows (dicts) including id,
    entity_uid, snapshot_date, observed_at, payload.
    """
    uid = curr_row["entity_uid"]
    if prev_row["entity_uid"] != uid:
        raise ValueError("derive_theme_transitions called with mismatched entities")

    prev, curr = _state(prev_row), _state(curr_row)
    effective_date = curr_row["snapshot_date"]
    effective_at = curr_row["observed_at"]
    basis_common = {
        "compared_snapshot_dates": [prev_row["snapshot_date"], curr_row["snapshot_date"]],
        "method": "sealed_daily_snapshot_comparison",
    }
    events: list[TransitionEvent] = []

    def emit(ttype: str, from_value, to_value, magnitude, rule: str, threshold=None) -> None:
        basis = dict(basis_common, rule=rule)
        if threshold is not None:
            basis["threshold"] = threshold
        events.append(TransitionEvent(
            entity_uid=uid,
            transition_type=ttype,
            effective_at=effective_at,
            from_snapshot_id=prev_row.get("id"),
            to_snapshot_id=curr_row.get("id"),
            from_value={"value": from_value},
            to_value={"value": to_value},
            magnitude=float(magnitude) if magnitude is not None else None,
            basis=basis,
            schema_version=SCHEMA_VERSION,
            event_key=transition_event_key(uid, ttype, effective_date),
        ))

    # ── conviction ────────────────────────────────────────────────────────────
    c_prev, c_curr = _int_or_none(prev.get("conviction")), _int_or_none(curr.get("conviction"))
    if c_prev is not None and c_curr is not None:
        delta = c_curr - c_prev
        if delta >= CONVICTION_DELTA:
            emit("conviction_strengthened", c_prev, c_curr, delta,
                 f"conviction rose >= {CONVICTION_DELTA} pts between sealed days", CONVICTION_DELTA)
        elif delta <= -CONVICTION_DELTA:
            emit("conviction_weakened", c_prev, c_curr, delta,
                 f"conviction fell >= {CONVICTION_DELTA} pts between sealed days", CONVICTION_DELTA)

    # ── lifecycle ─────────────────────────────────────────────────────────────
    l_prev, l_curr = prev.get("lifecycle"), curr.get("lifecycle")
    if l_prev is not None and l_curr is not None and l_prev != l_curr:
        emit("lifecycle_changed", l_prev, l_curr, None, "lifecycle label changed")

    # ── evidence ──────────────────────────────────────────────────────────────
    v_prev, v_curr = prev.get("evidence_verdict"), curr.get("evidence_verdict")
    e_prev, e_curr = _int_or_none(prev.get("evidence_count")), _int_or_none(curr.get("evidence_count"))
    verdict_move = 0
    if v_prev in _VERDICT_RANK and v_curr in _VERDICT_RANK:
        verdict_move = _VERDICT_RANK[v_curr] - _VERDICT_RANK[v_prev]
    count_move = (e_curr - e_prev) if (e_prev is not None and e_curr is not None) else 0
    if verdict_move > 0 or count_move >= EVIDENCE_DELTA:
        emit("evidence_strengthened",
             {"verdict": v_prev, "evidence_count": e_prev},
             {"verdict": v_curr, "evidence_count": e_curr},
             count_move or None,
             "verdict rank rose or evidence_count rose >= threshold", EVIDENCE_DELTA)
    elif verdict_move < 0 or count_move <= -EVIDENCE_DELTA:
        emit("evidence_weakened",
             {"verdict": v_prev, "evidence_count": e_prev},
             {"verdict": v_curr, "evidence_count": e_curr},
             count_move or None,
             "verdict rank fell or evidence_count fell >= threshold", EVIDENCE_DELTA)

    # ── contradictions (count-based; no itemized records exist in M3.1) ──────
    ct_prev = _int_or_none((prev.get("contradictions") or {}).get("contradicting_total"))
    ct_curr = _int_or_none((curr.get("contradictions") or {}).get("contradicting_total"))
    if ct_prev is not None and ct_curr is not None and ct_curr != ct_prev:
        delta = ct_curr - ct_prev
        emit("contradiction_added" if delta > 0 else "contradiction_removed",
             ct_prev, ct_curr, delta,
             "contradicting_total count moved (count-based; itemized "
             "contradiction records do not exist yet)")

    # ── breadth ───────────────────────────────────────────────────────────────
    b_prev, b_curr = _int_or_none(prev.get("breadth")), _int_or_none(curr.get("breadth"))
    if b_prev is not None and b_curr is not None:
        delta = b_curr - b_prev
        if abs(delta) >= BREADTH_DELTA:
            emit("breadth_changed", b_prev, b_curr, delta,
                 f"breadth moved >= {BREADTH_DELTA} industries between sealed days", BREADTH_DELTA)

    # ── causal path ───────────────────────────────────────────────────────────
    p_prev = (prev.get("causal_narrative") or "").strip()
    p_curr = (curr.get("causal_narrative") or "").strip()
    if p_prev and p_curr and p_prev != p_curr:
        emit("causal_path_changed", p_prev, p_curr, None,
             "causal_narrative differs between sealed days (exact string comparison)")

    return events


def derive_status_transitions(
    prev_rows_by_uid: dict[str, dict],
    curr_rows_by_uid: dict[str, dict],
    effective_date: str,
    effective_at: str,
) -> list[TransitionEvent]:
    """active_status_changed events from presence flips between two sealed
    days: absent→active when a theme appears, active→absent when it stops
    producing snapshots. Absence is data (V2 doc §5.3)."""
    events: list[TransitionEvent] = []

    def emit(uid: str, from_status: str, to_status: str,
             from_row: dict | None, to_row: dict | None) -> None:
        events.append(TransitionEvent(
            entity_uid=uid,
            transition_type="active_status_changed",
            effective_at=(to_row or {}).get("observed_at") or effective_at,
            from_snapshot_id=(from_row or {}).get("id"),
            to_snapshot_id=(to_row or {}).get("id"),
            from_value={"value": from_status},
            to_value={"value": to_status},
            magnitude=None,
            basis={
                "rule": "presence flip between consecutive sealed days",
                "method": "sealed_daily_snapshot_comparison",
                "compared_snapshot_dates": [
                    (from_row or {}).get("snapshot_date"),
                    (to_row or {}).get("snapshot_date") or effective_date,
                ],
            },
            schema_version=SCHEMA_VERSION,
            event_key=transition_event_key(uid, "active_status_changed", effective_date),
        ))

    for uid, curr in curr_rows_by_uid.items():
        if uid not in prev_rows_by_uid:
            emit(uid, "absent", "active", None, curr)
    for uid, prev in prev_rows_by_uid.items():
        if uid not in curr_rows_by_uid:
            emit(uid, "active", "absent", prev, None)
    return events


# ── M3.2: presence transitions with per-record-type vocabulary ─────────────────

def derive_presence_transitions(
    prev_rows_by_uid: dict[str, dict],
    curr_rows_by_uid: dict[str, dict],
    effective_date: str,
    effective_at: str,
    *,
    appeared_type: str,
    disappeared_type: str,
    uid_field: str,
) -> list[TransitionEvent]:
    """Appeared/disappeared events from presence flips between two sealed
    days. Used for narratives (narrative_appeared/…) and relationships
    (relationship_appeared/…); same one-shot semantics as M3.1 absence."""
    events: list[TransitionEvent] = []

    def emit(uid: str, ttype: str, from_row: dict | None, to_row: dict | None) -> None:
        events.append(TransitionEvent(
            entity_uid=uid,
            transition_type=ttype,
            effective_at=(to_row or {}).get("observed_at") or effective_at,
            from_snapshot_id=(from_row or {}).get("id"),
            to_snapshot_id=(to_row or {}).get("id"),
            from_value={"present": from_row is not None},
            to_value={"present": to_row is not None},
            magnitude=None,
            basis={
                "rule": "presence flip between consecutive sealed days",
                "method": "sealed_daily_snapshot_comparison",
                "uid_field": uid_field,
                "compared_snapshot_dates": [
                    (from_row or {}).get("snapshot_date"),
                    (to_row or {}).get("snapshot_date") or effective_date,
                ],
            },
            schema_version=SCHEMA_VERSION,
            event_key=transition_event_key(uid, ttype, effective_date),
        ))

    for uid, curr in curr_rows_by_uid.items():
        if uid not in prev_rows_by_uid:
            emit(uid, appeared_type, None, curr)
    for uid, prev in prev_rows_by_uid.items():
        if uid not in curr_rows_by_uid:
            emit(uid, disappeared_type, prev, None)
    return events


# ── M3.2: narrative transitions ────────────────────────────────────────────────

COHERENCE_DELTA = 5.0    # pts on the 0-100 structural-similarity scale


def derive_narrative_transitions(prev_row: dict, curr_row: dict) -> list[TransitionEvent]:
    """Events between two sealed daily narrative snapshots of the SAME
    narrative UID. Member identities in the basis are stable UIDs."""
    uid = curr_row["entity_uid"]
    if prev_row["entity_uid"] != uid:
        raise ValueError("derive_narrative_transitions called with mismatched narratives")

    prev, curr = _state(prev_row), _state(curr_row)
    effective_date = curr_row["snapshot_date"]
    effective_at = curr_row["observed_at"]
    basis_common = {
        "compared_snapshot_dates": [prev_row["snapshot_date"], curr_row["snapshot_date"]],
        "method": "sealed_daily_snapshot_comparison",
    }
    events: list[TransitionEvent] = []

    def emit(ttype: str, from_value, to_value, magnitude, rule: str, extra: dict | None = None) -> None:
        basis = dict(basis_common, rule=rule)
        if extra:
            basis.update(extra)
        events.append(TransitionEvent(
            entity_uid=uid,
            transition_type=ttype,
            effective_at=effective_at,
            from_snapshot_id=prev_row.get("id"),
            to_snapshot_id=curr_row.get("id"),
            from_value={"value": from_value},
            to_value={"value": to_value},
            magnitude=float(magnitude) if magnitude is not None else None,
            basis=basis,
            schema_version=SCHEMA_VERSION,
            event_key=transition_event_key(uid, ttype, effective_date),
        ))

    # membership (set semantics — ordering can never fire an event)
    m_prev = set(prev.get("member_uids") or [])
    m_curr = set(curr.get("member_uids") or [])
    added, removed = sorted(m_curr - m_prev), sorted(m_prev - m_curr)
    if added:
        emit("member_added", sorted(m_prev), sorted(m_curr), len(added),
             "member theme(s) joined the driver-set narrative",
             {"members_added": added})
    if removed:
        emit("member_removed", sorted(m_prev), sorted(m_curr), len(removed),
             "member theme(s) left the driver-set narrative",
             {"members_removed": removed})

    # dominance
    d_prev, d_curr = prev.get("dominance_status"), curr.get("dominance_status")
    if d_prev and d_curr and d_prev != d_curr:
        emit("dominant_status_changed", d_prev, d_curr, None,
             "narrative rank crossed the dominant boundary")

    # coherence (structural score, NOT a confidence)
    c_prev, c_curr = prev.get("coherence"), curr.get("coherence")
    if isinstance(c_prev, (int, float)) and isinstance(c_curr, (int, float)):
        delta = float(c_curr) - float(c_prev)
        if delta >= COHERENCE_DELTA:
            emit("coherence_strengthened", c_prev, c_curr, delta,
                 f"structural coherence rose >= {COHERENCE_DELTA} pts", {"threshold": COHERENCE_DELTA})
        elif delta <= -COHERENCE_DELTA:
            emit("coherence_weakened", c_prev, c_curr, delta,
                 f"structural coherence fell >= {COHERENCE_DELTA} pts", {"threshold": COHERENCE_DELTA})

    # contradictions (aggregate of per-member counts; itemized records do not exist)
    def contradiction_total(state: dict) -> int | None:
        per_member = ((state.get("contradictions") or {}).get("per_member")) or []
        vals = [m.get("contradicting_total") for m in per_member
                if isinstance(m.get("contradicting_total"), int)]
        return sum(vals) if vals else None

    ct_prev, ct_curr = contradiction_total(prev), contradiction_total(curr)
    if ct_prev is not None and ct_curr is not None and ct_curr != ct_prev:
        emit("contradiction_added" if ct_curr > ct_prev else "contradiction_removed",
             ct_prev, ct_curr, ct_curr - ct_prev,
             "aggregate member contradicting_total moved (count-based)")

    # thesis: exact deterministic comparison; fires only when both exist and differ
    t_prev = (prev.get("thesis") or "").strip()
    t_curr = (curr.get("thesis") or "").strip()
    if t_prev and t_curr and t_prev != t_curr:
        emit("thesis_changed", t_prev, t_curr, None,
             "deterministic thesis output changed (exact string comparison)")

    return events


# ── M3.2: relationship transitions ─────────────────────────────────────────────

REL_STRENGTH_DELTA = 0.1     # backend edge weights are 0-1 scale
REL_CONFIDENCE_DELTA = 0.1
REL_EVIDENCE_DELTA = 2       # evidence identifiers, mirrors M3.1 EVIDENCE_DELTA


def derive_relationship_transitions(prev_row: dict, curr_row: dict) -> list[TransitionEvent]:
    """Events between two sealed daily relationship snapshots of the SAME
    rel_uid. relationship_type_changed is deliberately not modeled: a type
    change is a different rel_uid, honestly a disappearance + appearance."""
    uid = curr_row["rel_uid"]
    if prev_row["rel_uid"] != uid:
        raise ValueError("derive_relationship_transitions called with mismatched relationships")

    prev, curr = _state(prev_row), _state(curr_row)
    effective_date = curr_row["snapshot_date"]
    effective_at = curr_row["observed_at"]
    basis_common = {
        "compared_snapshot_dates": [prev_row["snapshot_date"], curr_row["snapshot_date"]],
        "method": "sealed_daily_snapshot_comparison",
    }
    events: list[TransitionEvent] = []

    def emit(ttype: str, from_value, to_value, magnitude, rule: str, threshold=None) -> None:
        basis = dict(basis_common, rule=rule)
        if threshold is not None:
            basis["threshold"] = threshold
        events.append(TransitionEvent(
            entity_uid=uid,   # mapped to rel_uid at row time (to_row uid_column)
            transition_type=ttype,
            effective_at=effective_at,
            from_snapshot_id=prev_row.get("id"),
            to_snapshot_id=curr_row.get("id"),
            from_value={"value": from_value},
            to_value={"value": to_value},
            magnitude=float(magnitude) if magnitude is not None else None,
            basis=basis,
            schema_version=SCHEMA_VERSION,
            event_key=transition_event_key(uid, ttype, effective_date),
        ))

    def _num(v) -> float | None:
        try:
            return float(v) if v is not None else None
        except (TypeError, ValueError):
            return None

    s_prev, s_curr = _num(prev.get("strength")), _num(curr.get("strength"))
    if s_prev is not None and s_curr is not None:
        delta = s_curr - s_prev
        if delta >= REL_STRENGTH_DELTA:
            emit("relationship_strengthened", s_prev, s_curr, delta,
                 f"recorded strength rose >= {REL_STRENGTH_DELTA}", REL_STRENGTH_DELTA)
        elif delta <= -REL_STRENGTH_DELTA:
            emit("relationship_weakened", s_prev, s_curr, delta,
                 f"recorded strength fell >= {REL_STRENGTH_DELTA}", REL_STRENGTH_DELTA)

    c_prev, c_curr = _num(prev.get("confidence")), _num(curr.get("confidence"))
    if c_prev is not None and c_curr is not None and abs(c_curr - c_prev) >= REL_CONFIDENCE_DELTA:
        emit("confidence_changed", c_prev, c_curr, c_curr - c_prev,
             f"recorded confidence moved >= {REL_CONFIDENCE_DELTA}", REL_CONFIDENCE_DELTA)

    e_prev = len(prev.get("evidence_refs") or [])
    e_curr = len(curr.get("evidence_refs") or [])
    delta = e_curr - e_prev
    if delta >= REL_EVIDENCE_DELTA:
        emit("evidence_added", e_prev, e_curr, delta,
             f"evidence identifier count rose >= {REL_EVIDENCE_DELTA}", REL_EVIDENCE_DELTA)
    elif delta <= -REL_EVIDENCE_DELTA:
        emit("evidence_removed", e_prev, e_curr, delta,
             f"evidence identifier count fell >= {REL_EVIDENCE_DELTA}", REL_EVIDENCE_DELTA)

    return events
