"""
app/materiality_thresholds.py — Wave 0.3 C3: threshold validation (ADVISORY).

Backend-only, shadow-only, ADVISORY layer that measures how a finite set of
pre-authored candidate ThresholdPolicy artifacts *would have* performed on the
empirical evidence produced by C2, over the immutable C1 datasets. It EVALUATES
threshold policies; it NEVER activates one. Current production thresholds remain
authoritative regardless of C3 findings.

C3 has NO write path to inference, thresholds, admission, ranking, membership,
Feed, Morning Brief, Intelligence Network, APIs, or the frontend, and it never
mutates a C1 record / C2 artifact / dataset / AcceptancePolicy. It is read-only
over C1/C2, deterministic, version-isolated, and non-authoritative.

Lawful threshold reprojection: a policy may threshold ONLY its declared,
immutable, pre-decision scalar (calibration → decision_confidence with registered
probability semantics; decision_rank → materiality_rank with a registered
rank_semantics_id). The current shadow engine emits neither (probability semantics
absent; materiality_rank null; rank_semantics registry empty), so every
current-engine recommendation is recommendation_status=not_evaluated,
evidence_governance=not_applicable, advisory=true, metrics empty, comparison absent.
No alternative-threshold performance is ever inferred from categorical decisions.
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import asdict, dataclass
from decimal import Decimal, localcontext

from app.materiality_calibration import (
    METRIC_ACCURACY,
    METRIC_BASE_RATE,
    METRIC_PRECISION,
    METRIC_RECALL,
    PROBABILITY_CONFIDENCE_SEMANTICS,
    _CTX,
    _cohort_identity,
    _cohort_key,
    _parse_decimal,
    _present,
)
from app.materiality_evaluation import (
    EvaluationDataset,
    OutcomePayload,
    canonical_json_bytes,
    canonical_json_text,
    parse_utc_timestamp,
)

# ── Versions / schema ─────────────────────────────────────────────────────────
C3_CONTRACT_VERSION = "wave-0.3-c3"
THRESHOLD_POLICY_SCHEMA_VERSION = "thpol-1"
CANDIDATE_SET_SCHEMA_VERSION = "thset-1"
THRESHOLD_EVAL_SPEC_SCHEMA_VERSION = "theval-1"
COMPARISON_SPEC_SCHEMA_VERSION = "thcmp-1"
SUPPORT_CRITERION_SCHEMA_VERSION = "thsc-1"
RECOMMENDATION_SCHEMA_VERSION = "threc-1"

DECIMAL_CONTEXT_VERSION = "decimal_context_v1"
DECIMAL_PRESENTATION_SCALE = 12

# ── Families / registries ─────────────────────────────────────────────────────
THRESHOLD_FAMILY_CALIBRATION = "calibration"
THRESHOLD_FAMILY_DECISION_RANK = "decision_rank"
_C2_FAMILY_OF = {
    THRESHOLD_FAMILY_CALIBRATION: "calibration",
    THRESHOLD_FAMILY_DECISION_RANK: "decision_evaluation",
}
THRESHOLD_INPUT_FIELD = {
    THRESHOLD_FAMILY_CALIBRATION: "decision_confidence",
    THRESHOLD_FAMILY_DECISION_RANK: "materiality_rank",
}

# The rank-semantics registry begins EMPTY: a future engine must explicitly
# register immutable rank semantics before materiality_rank is threshold-eligible.
# C3 never infers rank meaning from values, engine versions, or decisions.
RANK_SEMANTICS: frozenset = frozenset()

# ── Closed enums ──────────────────────────────────────────────────────────────
PROVENANCE_VALUES = frozenset({"current_production", "fixed_alternative", "manually_authored"})
EVIDENCE_GOVERNANCE_VALUES = frozenset({"accepted", "ungoverned", "not_applicable"})
REC_SUPPORTED = "supported"
REC_UNSUPPORTED = "unsupported"
REC_INSUFFICIENT = "insufficient_sample"
REC_INCONCLUSIVE = "inconclusive"
REC_NOT_EVALUATED = "not_evaluated"

# ── Exclusion reason codes (fixed canonical ascending order) ──────────────────
EXCLUSION_REASON_CODES = (
    "excl_duplicate_observation",
    "excl_future_leakage",
    "excl_outcome_incompatible",
    "excl_outcome_invalidated",
    "excl_outcome_unavailable",
    "excl_pending",
    "excl_threshold_input_absent",
    "excl_threshold_input_semantics",
)


def _empty_exclusions() -> dict:
    return {code: 0 for code in EXCLUSION_REASON_CODES}


def _cid(prefix: str, value: object) -> str:
    return prefix + hashlib.sha256(canonical_json_bytes(value)).hexdigest()


def _canon_thresholds(thresholds: dict) -> dict:
    # Canonicalize Decimal threshold values through the terminal presentation
    # quantization so "0.5" and "0.50" hash identically.
    return {k: _present(Decimal(str(v))) for k, v in sorted(thresholds.items())}


# ══════════════════════════════════════════════════════════════════════════════
# Immutable artifacts — identity is CONTENT-derived (version = lineage; metadata
# excluded). Reuses decimal_context_v1 + RFC-8785 canonical JSON + SHA-256.
# ══════════════════════════════════════════════════════════════════════════════
@dataclass(frozen=True)
class ThresholdPolicy:
    threshold_policy_version: str      # lineage label; NON-identity
    family: str
    thresholds: dict                   # e.g. {"tau": "0.5"}; {} for the null policy
    applicability: dict                # cohort-scoping sets
    provenance: str                    # closed enum
    metadata: str = ""                 # NON-identity, EXCLUDED from the hash

    def __post_init__(self) -> None:
        if self.provenance not in PROVENANCE_VALUES:
            raise ValueError(f"unknown provenance: {self.provenance!r}")
        if self.family not in (THRESHOLD_FAMILY_CALIBRATION, THRESHOLD_FAMILY_DECISION_RANK):
            raise ValueError(f"unknown threshold family: {self.family!r}")

    def _identity_content(self) -> dict:
        appl = {k: sorted(v) for k, v in sorted(self.applicability.items())}
        return {"family": self.family, "thresholds": _canon_thresholds(self.thresholds),
                "applicability": appl, "provenance": self.provenance}

    @property
    def threshold_policy_id(self) -> str:
        return _cid("thpol_", self._identity_content())

    def tau(self) -> Decimal | None:
        raw = self.thresholds.get("tau")
        return Decimal(str(raw)) if raw is not None else None


@dataclass(frozen=True)
class ThresholdCandidateSet:
    candidate_set_version: str
    policies: tuple[ThresholdPolicy, ...]

    @property
    def candidate_set_id(self) -> str:
        return _cid("thset_", sorted(p.threshold_policy_id for p in self.policies))


@dataclass(frozen=True)
class ComparisonSpecification:
    comparison_specification_version: str
    metric_priority: tuple[str, ...]
    dominance_metric_ids: tuple[str, ...]
    tie_break: str
    collapsed_score: None = None       # explicitly none

    @property
    def comparison_specification_id(self) -> str:
        return _cid("thcmp_", {"metric_priority": list(self.metric_priority),
                               "dominance_metric_ids": list(self.dominance_metric_ids),
                               "tie_break": self.tie_break,
                               "collapsed_score": self.collapsed_score})


@dataclass(frozen=True)
class SupportCriterion:
    support_criterion_version: str
    rule: str
    min_cohort_n: int
    min_positive: int
    min_negative: int
    absolute_gates: tuple = ()

    @property
    def support_criterion_id(self) -> str:
        return _cid("thsc_", {"rule": self.rule, "min_cohort_n": self.min_cohort_n,
                              "min_positive": self.min_positive,
                              "min_negative": self.min_negative,
                              "absolute_gates": list(self.absolute_gates)})


@dataclass(frozen=True)
class ThresholdEvaluationSpecification:
    specification_version: str
    comparison_specification_id: str
    support_criterion_id: str
    families: tuple[str, ...] = (THRESHOLD_FAMILY_CALIBRATION, THRESHOLD_FAMILY_DECISION_RANK)
    metric_ids: tuple[str, ...] = (METRIC_ACCURACY, METRIC_PRECISION, METRIC_RECALL, METRIC_BASE_RATE)
    decimal_context_version: str = DECIMAL_CONTEXT_VERSION
    presentation_scale: int = DECIMAL_PRESENTATION_SCALE
    result_schema_version: str = RECOMMENDATION_SCHEMA_VERSION

    @property
    def threshold_evaluation_specification_id(self) -> str:
        payload = {k: v for k, v in asdict(self).items()}
        return _cid("theval_", payload)


# ── Contract-authored v1 artifacts (instantiate verbatim; never invent) ────────
COMPARISON_SPECIFICATION_V1 = ComparisonSpecification(
    comparison_specification_version="thcmp-c3-v1",
    metric_priority=(METRIC_ACCURACY, METRIC_PRECISION, METRIC_RECALL),
    dominance_metric_ids=(METRIC_ACCURACY, METRIC_PRECISION, METRIC_RECALL),
    tie_break="threshold_policy_id",
    collapsed_score=None,
)
SUPPORT_CRITERION_V1 = SupportCriterion(
    support_criterion_version="thsc-c3-v1",
    rule="dominates_or_equals_current_production",
    min_cohort_n=100, min_positive=25, min_negative=25, absolute_gates=(),
)


@dataclass(frozen=True)
class ThresholdRecommendation:
    recommendation_schema_version: str
    threshold_evaluation_specification_id: str
    comparison_specification_id: str
    support_criterion_id: str
    threshold_policy_id: str
    family: str
    cohort_identity: dict | None
    threshold_input: dict | None
    evidence_governance: str
    source_c2_result_ids: tuple
    source_dataset_ids: tuple
    source_dataset_content_hashes: tuple
    record_counts: dict
    exclusion_counts: dict
    metrics: dict
    comparison: dict | None
    supporting_evidence: dict
    recommendation_status: str
    status_reason: str
    advisory: bool = True
    generated_at: str | None = None

    def _hash_payload(self) -> dict:
        payload = asdict(self)
        payload.pop("generated_at")
        return payload

    @property
    def canonical_content_hash(self) -> str:
        return hashlib.sha256(canonical_json_bytes(self._hash_payload())).hexdigest()

    @property
    def recommendation_id(self) -> str:
        return "threc_" + self.canonical_content_hash

    def to_canonical_json(self) -> str:
        payload = self._hash_payload()
        payload["canonical_content_hash"] = self.canonical_content_hash
        payload["recommendation_id"] = self.recommendation_id
        return canonical_json_text(payload)


# ══════════════════════════════════════════════════════════════════════════════
# Reprojection (read-only over C1 records; duck-typed on the fields it reads).
# ══════════════════════════════════════════════════════════════════════════════
def _outcome_of(record) -> OutcomePayload | None:
    raw = getattr(record, "outcome_json", None)
    if not raw:
        return None
    try:
        return OutcomePayload(**json.loads(raw))
    except Exception:
        return None


def _leaks(record, outcome: OutcomePayload) -> bool:
    if outcome.information_available_at is None:
        return True
    try:
        return not (parse_utc_timestamp(getattr(record, "decision_completed_at"))
                    < parse_utc_timestamp(outcome.information_available_at))
    except Exception:
        return True


def _reproject(records, family: str, rank_semantics: frozenset):
    """Return (sorted list of (value, outcome) pairs, exclusion_counts). Reapplies
    the version-pinned C2 eligibility, outcome-compatibility, duplicate, and
    leakage rules; extracts ONLY the declared, pre-decision threshold scalar."""
    exclusions = _empty_exclusions()
    pairs: list[tuple[Decimal, int]] = []
    seen: set = set()
    for record in sorted(records, key=lambda r: getattr(r, "revision_id", "") or ""):
        outcome = _outcome_of(record)
        if outcome is None:
            exclusions["excl_outcome_incompatible"] += 1
            continue
        if outcome.status == "pending":
            exclusions["excl_pending"] += 1
            continue
        if outcome.status == "invalidated":
            exclusions["excl_outcome_invalidated"] += 1
            continue
        if outcome.status == "unavailable":
            exclusions["excl_outcome_unavailable"] += 1
            continue
        if not isinstance(outcome.label, bool):
            exclusions["excl_outcome_incompatible"] += 1
            continue
        # threshold input extraction (lawful, declared, pre-decision scalar only)
        if family == THRESHOLD_FAMILY_CALIBRATION:
            sem = getattr(record, "confidence_semantics", None)
            if sem not in PROBABILITY_CONFIDENCE_SEMANTICS:
                exclusions["excl_threshold_input_semantics"] += 1
                continue
            raw = getattr(record, "decision_confidence", None)
            if raw is None:
                exclusions["excl_threshold_input_absent"] += 1
                continue
            value = _parse_decimal(raw)
            if value is None or value < 0 or value > 1:
                exclusions["excl_threshold_input_semantics"] += 1
                continue
        else:  # decision_rank
            sem = getattr(record, "rank_semantics_id", None)
            if sem is None or sem not in rank_semantics:
                exclusions["excl_threshold_input_semantics"] += 1
                continue
            raw = getattr(record, "materiality_rank", None)
            if raw is None:
                exclusions["excl_threshold_input_absent"] += 1
                continue
            value = _parse_decimal(raw)
            if value is None:
                exclusions["excl_threshold_input_semantics"] += 1
                continue
        if _leaks(record, outcome):
            exclusions["excl_future_leakage"] += 1
            continue
        group = getattr(record, "durable_event_uid", None) or getattr(record, "observation_id", "")
        if group in seen:
            exclusions["excl_duplicate_observation"] += 1
            continue
        seen.add(group)
        pairs.append((value, 1 if outcome.label else 0))
    pairs.sort(key=lambda p: (p[0], p[1]))
    return pairs, exclusions


def _mv(metric_id, status, value=None) -> dict:
    return {"metric_id": metric_id, "status": status, "value": value}


def threshold_metrics(pairs: list[tuple[Decimal, int]], tau: Decimal) -> dict:
    """Deterministic confusion + precision/recall/accuracy/base-rate at `tau`
    (value >= tau → positive). Independent of any C2 formula."""
    tp = fp = fn = tn = 0
    for value, o in pairs:
        pred = 1 if value >= tau else 0
        if pred == 1 and o == 1:
            tp += 1
        elif pred == 1 and o == 0:
            fp += 1
        elif pred == 0 and o == 1:
            fn += 1
        else:
            tn += 1
    n = len(pairs)
    with localcontext(_CTX):
        precision = (Decimal(tp) / Decimal(tp + fp)) if (tp + fp) else None
        recall = (Decimal(tp) / Decimal(tp + fn)) if (tp + fn) else None
        accuracy = Decimal(tp + tn) / Decimal(n)
        base_rate = Decimal(tp + fn) / Decimal(n)
    return {
        "confusion": {"tp": tp, "fp": fp, "fn": fn, "tn": tn},
        METRIC_ACCURACY: _mv(METRIC_ACCURACY, "measured", _present(accuracy)),
        METRIC_BASE_RATE: _mv(METRIC_BASE_RATE, "measured", _present(base_rate)),
        METRIC_PRECISION: (_mv(METRIC_PRECISION, "measured", _present(precision))
                           if precision is not None else _mv(METRIC_PRECISION, "unavailable", None)),
        METRIC_RECALL: (_mv(METRIC_RECALL, "measured", _present(recall))
                        if recall is not None else _mv(METRIC_RECALL, "unavailable", None)),
    }


# ══════════════════════════════════════════════════════════════════════════════
# Comparison (Pareto dominance + deterministic ordering + dominated_by reasons).
# ══════════════════════════════════════════════════════════════════════════════
def _metric_vector(metrics: dict, ids: tuple[str, ...]) -> tuple | None:
    vec = []
    for mid in ids:
        mv = metrics.get(mid)
        if mv is None or mv["status"] != "measured":
            return None
        vec.append(Decimal(mv["value"]))
    return tuple(vec)


def _dominates(a: tuple, b: tuple) -> bool:
    return all(x >= y for x, y in zip(a, b)) and any(x > y for x, y in zip(a, b))


def _compare(scored: dict[str, dict], comparison_spec: ComparisonSpecification) -> dict[str, dict]:
    """scored: policy_id -> metrics. Returns policy_id -> comparison view with
    Pareto membership, deterministic rank, and dominated_by provenance."""
    ids = comparison_spec.dominance_metric_ids
    vectors = {pid: _metric_vector(m, ids) for pid, m in scored.items()}
    comparable = {pid: v for pid, v in vectors.items() if v is not None}
    views: dict[str, dict] = {}
    for pid, vec in comparable.items():
        dominated_by = []
        for other, ovec in comparable.items():
            if other != pid and _dominates(ovec, vec):
                metrics_better = [ids[i] for i in range(len(ids)) if ovec[i] > vec[i]]
                dominated_by.append({"dominating_threshold_policy_id": other,
                                     "dominating_metric_ids": metrics_better,
                                     "relation": "pareto_dominates"})
        views[pid] = {"dominated": bool(dominated_by),
                      "on_pareto_frontier": not dominated_by,
                      "dominated_by": sorted(dominated_by,
                                             key=lambda d: d["dominating_threshold_policy_id"])}
    # deterministic report ordering: priority metrics desc, then policy id
    prio = comparison_spec.metric_priority
    order = sorted(comparable,
                   key=lambda pid: tuple(-_metric_vector(scored[pid], prio)[i]
                                         for i in range(len(prio))) + (pid,))
    for rank, pid in enumerate(order):
        views[pid]["report_rank"] = rank
        # tie group sorted canonically (NOT candidate-input order) so it cannot leak
        # input order into the recommendation hash.
        views[pid]["tie_group"] = sorted(
            q for q in comparable
            if _metric_vector(scored[q], prio) == _metric_vector(scored[pid], prio))
    return views


# ══════════════════════════════════════════════════════════════════════════════
# Build recommendations.
# ══════════════════════════════════════════════════════════════════════════════
def _applies(policy: ThresholdPolicy, cohort: dict) -> bool:
    checks = {
        "engine_versions": cohort.get("engine_version"),
        "policy_versions": cohort.get("policy_version"),
        "targets": cohort.get("target"),
        "horizons": cohort.get("horizon"),
        "observation_stages": cohort.get("observation_stage"),
        "confidence_semantics_ids": cohort.get("confidence_semantics_id"),
    }
    for key, value in checks.items():
        allowed = policy.applicability.get(key)
        if allowed and value not in set(allowed):
            return False
    return True


def build_threshold_recommendations(
    candidate_set: ThresholdCandidateSet,
    evidence: list[tuple],                     # list of (c2_result, EvaluationDataset)
    specification: ThresholdEvaluationSpecification,
    comparison_spec: ComparisonSpecification = COMPARISON_SPECIFICATION_V1,
    support_criterion: SupportCriterion = SUPPORT_CRITERION_V1,
    *,
    rank_semantics: frozenset = RANK_SEMANTICS,
    generated_at: str | None = None,
) -> list[ThresholdRecommendation]:
    spec_id = specification.threshold_evaluation_specification_id
    recs: list[ThresholdRecommendation] = []

    for c2_result, dataset in evidence:
        if not isinstance(dataset, EvaluationDataset):
            raise ValueError("evidence dataset must be an EvaluationDataset")
        # hash verification — mismatch is a HARD FAIL (no recommendation).
        if (c2_result.source_dataset_id != dataset.dataset_id
                or c2_result.source_dataset_content_hash != dataset.dataset_id):
            raise ValueError("C2/C1 dataset hash mismatch")

        cohort = c2_result.cohort_identity
        c2_family = c2_result.family
        gov = c2_result.acceptance.get("governance_status")
        measured = (c2_result.status == "measured")

        # candidate policies for this cohort's threshold family
        applicable = [p for p in candidate_set.policies
                      if _C2_FAMILY_OF.get(p.family) == c2_family and _applies(p, cohort or {})]
        if not applicable:
            continue

        # cohort records (filtered from the immutable dataset by C2's cohort key)
        cohort_records = [r for r in dataset.records
                          if _cohort_identity(_cohort_key(r, c2_family)) == cohort]

        family = applicable[0].family
        scored: dict[str, dict] = {}         # policy_id -> metrics (measured reprojection)
        per_policy: dict[str, dict] = {}     # policy_id -> {pairs, exclusions, tau}
        for policy in applicable:
            pairs, exclusions = ((None, _empty_exclusions()) if not measured
                                 else _reproject(cohort_records, family, rank_semantics))
            per_policy[policy.threshold_policy_id] = {
                "policy": policy, "pairs": pairs, "exclusions": exclusions}
            if measured and pairs:
                tau = policy.tau()
                if tau is not None:
                    scored[policy.threshold_policy_id] = threshold_metrics(pairs, tau)

        views = _compare(scored, comparison_spec) if scored else {}
        baseline_id = next((p.threshold_policy_id for p in applicable
                            if p.provenance == "current_production"
                            and p.threshold_policy_id in scored), None)

        for policy in applicable:
            pid = policy.threshold_policy_id
            info = per_policy[pid]
            recs.append(_recommendation(
                spec_id, specification, comparison_spec, support_criterion, policy,
                cohort, family, c2_result, dataset, measured, gov, info,
                scored.get(pid), views.get(pid), scored, baseline_id, generated_at))
    return recs


def _recommendation(spec_id, specification, comparison_spec, support_criterion, policy,
                    cohort, family, c2_result, dataset, measured, gov, info,
                    metrics, view, scored, baseline_id, generated_at) -> ThresholdRecommendation:
    pairs = info["pairs"]
    exclusions = info["exclusions"]
    input_field = THRESHOLD_INPUT_FIELD[family]
    candidate = len(dataset.records)

    # No lawful reprojection → not_applicable / not_evaluated, empty metrics/comparison.
    if not measured or not pairs or metrics is None:
        return _mk_rec(spec_id, specification, comparison_spec, support_criterion, policy,
                       cohort, family, c2_result, dataset, "not_applicable",
                       {"candidate": candidate, "eligible": 0}, exclusions, {}, None,
                       REC_NOT_EVALUATED, "no eligible threshold input", None, generated_at)

    n = len(pairs)
    positives = sum(o for _, o in pairs)
    negatives = n - positives
    governance = "accepted" if gov == "accepted" else "ungoverned"
    threshold_input = {"field": input_field,
                       "semantics_id": (cohort or {}).get("confidence_semantics_id")
                       if family == THRESHOLD_FAMILY_CALIBRATION else "rank"}
    counts = {"candidate": candidate, "eligible": n, "positive": positives, "negative": negatives}

    if governance == "ungoverned":
        # Lawful exploration only — metrics + comparison, but status CAPPED at not_evaluated.
        return _mk_rec(spec_id, specification, comparison_spec, support_criterion, policy,
                       cohort, family, c2_result, dataset, "ungoverned", counts, exclusions,
                       metrics, view, REC_NOT_EVALUATED,
                       "ungoverned evidence: exploration only, never certified",
                       threshold_input, generated_at)

    # accepted evidence
    if (n < support_criterion.min_cohort_n or positives < support_criterion.min_positive
            or negatives < support_criterion.min_negative):
        return _mk_rec(spec_id, specification, comparison_spec, support_criterion, policy,
                       cohort, family, c2_result, dataset, "accepted", counts, exclusions,
                       metrics, view, REC_INSUFFICIENT, "sample below minimums",
                       threshold_input, generated_at)

    status, reason = _governed_status(policy, metrics, scored, baseline_id, comparison_spec)
    return _mk_rec(spec_id, specification, comparison_spec, support_criterion, policy,
                   cohort, family, c2_result, dataset, "accepted", counts, exclusions,
                   metrics, view, status, reason, threshold_input, generated_at)


def _governed_status(policy, metrics, scored, baseline_id, comparison_spec):
    ids = comparison_spec.dominance_metric_ids
    my_vec = _metric_vector(metrics, ids)
    if my_vec is None:
        return REC_INCONCLUSIVE, "metric vector incomplete"
    if baseline_id is None or baseline_id not in scored:
        return REC_INCONCLUSIVE, "no current_production baseline with metrics"
    base_vec = _metric_vector(scored[baseline_id], ids)
    if base_vec is None:
        return REC_INCONCLUSIVE, "baseline metric vector incomplete"
    if policy.threshold_policy_id == baseline_id:
        return REC_SUPPORTED, "baseline equals itself"
    # supported iff dominates-or-equals the baseline on every metric
    if all(x >= y for x, y in zip(my_vec, base_vec)):
        return REC_SUPPORTED, "dominates or equals current_production"
    return REC_UNSUPPORTED, "does not dominate or equal current_production"


def _mk_rec(spec_id, specification, comparison_spec, support_criterion, policy, cohort,
            family, c2_result, dataset, governance, counts, exclusions, metrics, view,
            status, reason, threshold_input, generated_at) -> ThresholdRecommendation:
    return ThresholdRecommendation(
        recommendation_schema_version=specification.result_schema_version,
        threshold_evaluation_specification_id=spec_id,
        comparison_specification_id=comparison_spec.comparison_specification_id,
        support_criterion_id=support_criterion.support_criterion_id,
        threshold_policy_id=policy.threshold_policy_id,
        family=family,
        cohort_identity=cohort,
        threshold_input=threshold_input,
        evidence_governance=governance,
        source_c2_result_ids=(c2_result.result_id,),
        source_dataset_ids=(dataset.dataset_id,),
        source_dataset_content_hashes=(dataset.dataset_id,),
        record_counts=counts,
        exclusion_counts=exclusions,
        metrics=metrics if metrics else {},
        comparison=view,
        supporting_evidence={"c2_governance_status": c2_result.acceptance.get("governance_status"),
                             "c2_status": c2_result.status,
                             "provenance": policy.provenance},
        recommendation_status=status,
        status_reason=reason,
        advisory=True,
        generated_at=generated_at,
    )
