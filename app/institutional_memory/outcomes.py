"""
app/institutional_memory/outcomes.py — Outcome records, scoring, calibration (M3.3).

Outcomes are separate records written by the resolver, never by the prediction
writer, and an outcome never modifies its prediction's issued payload.

VERDICTS (narrow, distinct — invalidation is NOT incorrectness):
  confirmed · partially_confirmed · contradicted        (tested verdicts)
  invalidated                                           (assumption/identity broke)
  unresolved · unresolvable_data_gap                    (could not be tested)
  expired_without_test                                  (window elapsed untested)

SCORING is separate from verdicts: confirmed=1.0, partially_confirmed=0.5,
contradicted=0.0. Invalidated / unresolved / data-gap / expired are NEVER
silently scored as zero — their score is null and they are excluded from
binary calibration while remaining visible in every sample-size report.

CALIBRATION is a derived join with credibility gates. No platform-wide
accuracy number is exposed until the gates are met, and the gate status is
always reported alongside any figure.
"""

from __future__ import annotations

import hashlib
import logging
import os
from datetime import datetime

from app.institutional_memory.models import SCHEMA_VERSION

log = logging.getLogger(__name__)

RESOLVER_VERSION = "m3.3.0"

VERDICT_CONFIRMED = "confirmed"
VERDICT_PARTIAL = "partially_confirmed"
VERDICT_CONTRADICTED = "contradicted"
VERDICT_INVALIDATED = "invalidated"
VERDICT_UNRESOLVED = "unresolved"
VERDICT_DATA_GAP = "unresolvable_data_gap"
VERDICT_EXPIRED = "expired_without_test"

TESTED_VERDICTS = frozenset({VERDICT_CONFIRMED, VERDICT_PARTIAL, VERDICT_CONTRADICTED})
UNTESTED_VERDICTS = frozenset({VERDICT_UNRESOLVED, VERDICT_DATA_GAP, VERDICT_EXPIRED})

VERDICT_SCORES: dict[str, float | None] = {
    VERDICT_CONFIRMED: 1.0,
    VERDICT_PARTIAL: 0.5,
    VERDICT_CONTRADICTED: 0.0,
    VERDICT_INVALIDATED: None,
    VERDICT_UNRESOLVED: None,
    VERDICT_DATA_GAP: None,
    VERDICT_EXPIRED: None,
}

# Credibility gates (pre-registered; see ledger doc §7)
GATE_MIN_RESOLVED_PER_TYPE = 30
GATE_MIN_PER_PROBABILITY_BUCKET = 10
GATE_MAX_UNTESTED_RATE = 0.20


def outcome_uid_for(prediction_uid: str) -> str:
    """Deterministic 1:1 outcome identity — retries cannot duplicate."""
    digest = hashlib.sha256(prediction_uid.encode("utf-8")).hexdigest()[:32]
    return f"outcome:v1:{digest}"


def build_outcome_row(prediction: dict, *, verdict: str, observed_state: dict,
                      resolution_rules: dict, evidence_refs: list,
                      now: datetime) -> dict:
    """Resolver verdict → outcome_records row. Stores the exact rules applied
    so a future reviewer can reconstruct why the verdict was assigned."""
    if verdict not in VERDICT_SCORES:
        raise ValueError(f"unknown verdict: {verdict!r}")
    return {
        "outcome_uid": outcome_uid_for(prediction["prediction_uid"]),
        "prediction_uid": prediction["prediction_uid"],
        "subject_uid": prediction["subject_uid"],
        "prediction_type": prediction["prediction_type"],
        "observed_at": now.isoformat(),
        "resolution_date": now.date().isoformat(),
        "observed_state": observed_state,
        "verdict": verdict,
        "score": VERDICT_SCORES[verdict],
        "resolution_method": "sealed_daily_snapshot_comparison",
        "resolution_rules": resolution_rules,
        "evidence_refs": evidence_refs,
        "market_context_snapshot_ids": [],   # no market-context records exist in M3.3
        "reviewer_type": "automated_resolver",
        "provenance": {
            "resolver_version": RESOLVER_VERSION,
            "deployment_id": os.getenv("RAILWAY_DEPLOYMENT_ID") or "local",
        },
        "schema_version": SCHEMA_VERSION,
        "writer_version": RESOLVER_VERSION,
    }


# ── Calibration (derived, gated, transparent) ──────────────────────────────────

def probability_bucket(probability: float) -> str:
    """Deterministic decile bucket label, e.g. 0.63 → '0.6-0.7'."""
    p = min(max(float(probability), 0.0), 1.0)
    lo = min(int(p * 10), 9) / 10
    return f"{lo:.1f}-{lo + 0.1:.1f}"


def compute_calibration(outcomes: list[dict], prediction_type: str | None = None) -> dict:
    """Transparent calibration summary over outcome rows (optionally filtered
    by type). Unresolved/data-gap/expired are excluded from binary calibration
    but fully counted in the sample report; invalidated is reported separately
    and never counted as a failure."""
    rows = [o for o in outcomes
            if prediction_type is None or o.get("prediction_type") == prediction_type]

    by_verdict: dict[str, int] = {}
    for o in rows:
        by_verdict[o["verdict"]] = by_verdict.get(o["verdict"], 0) + 1

    tested = [o for o in rows if o["verdict"] in TESTED_VERDICTS]
    untested = [o for o in rows if o["verdict"] in UNTESTED_VERDICTS]
    invalidated = by_verdict.get(VERDICT_INVALIDATED, 0)
    confirmed = by_verdict.get(VERDICT_CONFIRMED, 0)

    total = len(rows)
    untested_rate = (len(untested) / total) if total else 0.0
    confirmation_rate = (confirmed / len(tested)) if tested else None

    # Probability calibration: only over tested, binary-valid outcomes that
    # carried an issued probability (none exist in M3.3 — reported honestly).
    buckets: dict[str, dict] = {}
    brier_terms: list[float] = []
    for o in tested:
        p = o.get("probability")
        if p is None:
            continue
        b = buckets.setdefault(probability_bucket(p), {"n": 0, "confirmed": 0})
        b["n"] += 1
        outcome_val = 1.0 if o["verdict"] == VERDICT_CONFIRMED else 0.0
        if o["verdict"] == VERDICT_PARTIAL:
            continue   # partial outcomes are not binary-valid for Brier
        b["confirmed"] += int(outcome_val)
        brier_terms.append((float(p) - outcome_val) ** 2)

    gates = {
        "min_resolved_per_type": {
            "required": GATE_MIN_RESOLVED_PER_TYPE,
            "actual": len(tested),
            "met": len(tested) >= GATE_MIN_RESOLVED_PER_TYPE,
        },
        "max_untested_rate": {
            "required": GATE_MAX_UNTESTED_RATE,
            "actual": round(untested_rate, 3),
            "met": untested_rate <= GATE_MAX_UNTESTED_RATE,
        },
        "min_per_probability_bucket": {
            "required": GATE_MIN_PER_PROBABILITY_BUCKET,
            "applicable": bool(buckets),
            "met": bool(buckets) and all(b["n"] >= GATE_MIN_PER_PROBABILITY_BUCKET
                                         for b in buckets.values()),
        },
        "resolution_rules_stable": {
            "schema_versions": sorted({o.get("schema_version") for o in rows}),
            "met": len({o.get("schema_version") for o in rows}) <= 1,
        },
    }
    credible = (gates["min_resolved_per_type"]["met"]
                and gates["max_untested_rate"]["met"]
                and gates["resolution_rules_stable"]["met"])

    return {
        "prediction_type": prediction_type,
        "methodology": "verdict counts over outcome_records; binary calibration "
                       "excludes invalidated and untested verdicts; scoring map "
                       "confirmed=1.0 partially_confirmed=0.5 contradicted=0.0; "
                       "probability calibration requires issued probabilities "
                       "(none are issued in M3.3).",
        "sample_size": total,
        "tested": len(tested),
        "untested": len(untested),
        "invalidated_reported_separately": invalidated,
        "by_verdict": by_verdict,
        "confirmation_rate_of_tested": (round(confirmation_rate, 3)
                                        if confirmation_rate is not None else None),
        "probability_buckets": buckets or None,
        "brier_score": (round(sum(brier_terms) / len(brier_terms), 4)
                        if brier_terms else None),
        "credibility_gates": gates,
        "credible": credible,
        "note": None if credible else (
            "Credibility gates NOT met — these figures are diagnostics, not an "
            "accuracy claim."),
    }
