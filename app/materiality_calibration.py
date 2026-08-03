"""
app/materiality_calibration.py — Wave 0.3 C2: shadow calibration & evaluation.

Backend-only, shadow-only, non-authoritative MEASUREMENT layer over the immutable
C1 evaluation datasets (app.materiality_evaluation.EvaluationDataset). It answers:
"when Argus assigns a given confidence/decision, how often does the corresponding
versioned outcome occur?" — and nothing else.

C2 measures; it never optimises thresholds, calibrates confidence, generates
probability semantics, or activates any production behaviour. It has NO write path
to inference, C1 records, thresholds, or any product surface, and it never mutates
a C1 dataset or record. See the frozen Wave 0.3 C2 Calibration Contract.

Three formally distinct families (never mixed in one result):
  • Calibration        — probability ↔ Boolean outcome (Brier/ECE/MCE/reliability).
  • Decision Evaluation — categorical universal/not_universal vs outcome (confusion,
                          discrimination as diagnostic, abstention cohort).
  • Forecast Evaluation — expected vs observed return (error/direction/rank).

Determinism: exact Decimal under a pinned context (decimal_context_v1); canonical
RFC-8785 JSON (reused from C1) + SHA-256 for every artifact ID; deterministic input
ordering. Identical (dataset, specification, policy) ⇒ byte-identical artifacts/IDs.
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import asdict, dataclass
from decimal import (
    Context,
    Decimal,
    DivisionByZero,
    InvalidOperation,
    Overflow,
    localcontext,
)
from typing import ClassVar

from app.materiality_evaluation import (
    EvaluationDataset,
    EvaluationRecordRevision,
    OutcomePayload,
    canonical_json_bytes,
    canonical_json_text,
    parse_utc_timestamp,
)

# ── Contract / schema / metric versions ───────────────────────────────────────
CALIBRATION_CONTRACT_VERSION = "wave-0.3-c2"

CALIBRATION_SPEC_SCHEMA_VERSION = "calspec-1"
DECISION_SPEC_SCHEMA_VERSION = "decspec-1"
FORECAST_SPEC_SCHEMA_VERSION = "fcspec-1"
CALIBRATION_RESULT_SCHEMA_VERSION = "calresult-1"
DECISION_RESULT_SCHEMA_VERSION = "decresult-1"
FORECAST_RESULT_SCHEMA_VERSION = "fcresult-1"
RELIABILITY_TABLE_SCHEMA_VERSION = "reltable-1"

BINNING_FIXED_WIDTH_10_V1 = "fixed_width_10_v1"
BOOTSTRAP_ENABLED = False

# Families
FAMILY_CALIBRATION = "calibration"
FAMILY_DECISION = "decision_evaluation"
FAMILY_FORECAST = "forecast_evaluation"

# Computational status
STATUS_MEASURED = "measured"
STATUS_INSUFFICIENT = "insufficient_sample"
STATUS_UNSUPPORTED_UNAVAILABLE = "unsupported_unavailable"
STATUS_UNSUPPORTED_SEMANTICS = "unsupported_semantics_prohibited"
STATUS_INVALID = "invalid"
STATUS_PARTIAL = "partial"

# Governance status
GOV_ACCEPTED = "accepted"
GOV_REJECTED = "rejected"
GOV_INSUFFICIENT = "insufficient"
GOV_NOT_EVALUATED = "not_evaluated"

# Metric identifiers are FORMULA-BOUND: changing any formula mints a new id.
METRIC_BRIER = "brier_v1"
METRIC_LOG_LOSS = "log_loss_v1"
METRIC_ECE = "ece_v1"
METRIC_MCE = "mce_v1"
METRIC_BASE_RATE = "base_rate_v1"
METRIC_CAL_SLOPE = "calibration_slope_v1"
METRIC_CAL_INTERCEPT = "calibration_intercept_v1"
METRIC_ROC_AUC = "roc_auc_v1"
METRIC_PR_AUC = "pr_auc_v1"
METRIC_PRECISION = "precision_v1"
METRIC_RECALL = "recall_v1"
METRIC_ACCURACY = "accuracy_v1"
METRIC_SIGNED_ERROR = "signed_error_v1"
METRIC_ABS_ERROR = "absolute_error_v1"
METRIC_SQ_ERROR = "squared_error_v1"
METRIC_DIRECTIONAL = "directional_accuracy_v1"
METRIC_SPEARMAN = "spearman_v1"
METRIC_COVERAGE = "coverage_v1"

AUTHORITATIVE = "authoritative"
DIAGNOSTIC = "diagnostic"

# Metric value / result status vocabulary
MV_MEASURED = "measured"
MV_UNAVAILABLE = "unavailable"
MV_INSUFFICIENT = "insufficient_sample"
MV_UNSUPPORTED = "unsupported"
MV_INVALID = "invalid"

# ── Declared probability-semantics registry (contract §4) ─────────────────────
# ONLY these confidence_semantics identifiers are eligible as calibrated
# probabilities. The current shadow engine stamps confidence_semantics="absent"
# (no probability semantics) — so Calibration is unsupported_semantics_prohibited
# for current data. "materiality-probability-1" is the reserved identifier a future
# probability-emitting engine would declare; no current production engine emits it.
PROBABILITY_CONFIDENCE_SEMANTICS = frozenset({"materiality-probability-1"})

# ── Exclusion reason codes (fixed canonical order: ascending by code) ─────────
EXCLUSION_REASON_CODES = (
    "excl_confidence_absent",
    "excl_confidence_incompatible_semantics",
    "excl_duplicate_observation",
    "excl_forked_revision",
    "excl_future_leakage",
    "excl_horizon_incompatible",
    "excl_label_incompatible",
    "excl_malformed_record",
    "excl_outcome_invalidated",
    "excl_outcome_unavailable",
    "excl_pending",
    "excl_unresolved_decision",
    "excl_version_unsupported",
)

# ── Pinned decimal context (decimal_context_v1) ───────────────────────────────
DECIMAL_CONTEXT_VERSION = "decimal_context_v1"
DECIMAL_COMPUTE_PRECISION = 50
DECIMAL_PRESENTATION_SCALE = 12
_CTX = Context(
    prec=DECIMAL_COMPUTE_PRECISION,
    rounding="ROUND_HALF_EVEN",
    Emax=999_999,
    Emin=-999_999,
    capitals=1,
    clamp=0,
    traps=[InvalidOperation, DivisionByZero, Overflow],
)
_PRESENT_QUANT = Decimal(1).scaleb(-DECIMAL_PRESENTATION_SCALE)  # 1e-12
_ZERO = Decimal(0)
_ONE = Decimal(1)


def _present(value: Decimal | None) -> str | None:
    """Terminal, serialization-only quantization to the presentation scale. The
    quantized value is used ONLY for canonical strings/hashes and never re-enters
    computation."""
    if value is None:
        return None
    with localcontext(_CTX):
        return str(value.quantize(_PRESENT_QUANT))


def _cid(prefix: str, value: object) -> str:
    return prefix + hashlib.sha256(canonical_json_bytes(value)).hexdigest()


def _parse_decimal(text: str | None) -> Decimal | None:
    if text is None:
        return None
    try:
        with localcontext(_CTX):
            return +Decimal(text)
    except (InvalidOperation, ValueError):
        return None


# ══════════════════════════════════════════════════════════════════════════════
# AcceptancePolicy — first-class immutable artifact; identity = SHA256(content).
# ══════════════════════════════════════════════════════════════════════════════
@dataclass(frozen=True)
class AcceptanceGate:
    gate_id: str
    metric_id: str
    comparator: str           # "<=" | ">=" | "<" | ">" | "=="
    bound: str                # exact Decimal string
    applies_to: str = "all"   # cohort class or "all"
    rationale: str = ""


@dataclass(frozen=True)
class AcceptancePolicy:
    acceptance_policy_version: str      # human label; NON-authoritative for identity
    family: str
    min_cohort_n: int
    min_positive: int
    min_negative: int
    min_bin_size: int
    gates: tuple[AcceptanceGate, ...] = ()
    metadata: str = ""                  # NON-identity

    def _canonical_content(self) -> dict:
        # IDENTITY content only. `metadata` (author/rationale/notes) and each gate's
        # `rationale` are NON-identity and EXCLUDED — changing them cannot change the
        # id. Gates are serialized in CANONICAL order (not insertion order), and each
        # bound is canonicalized through the terminal presentation quantization so
        # "0.5" and "0.50" hash identically.
        gates = sorted(self.gates, key=lambda g: (g.gate_id, g.metric_id, g.comparator,
                                                   g.applies_to, g.bound))
        return {
            "acceptance_policy_version": self.acceptance_policy_version,
            "family": self.family,
            "min_cohort_n": self.min_cohort_n,
            "min_positive": self.min_positive,
            "min_negative": self.min_negative,
            "min_bin_size": self.min_bin_size,
            "gates": [
                {"gate_id": g.gate_id, "metric_id": g.metric_id,
                 "comparator": g.comparator, "bound": _present(Decimal(g.bound)),
                 "applies_to": g.applies_to}
                for g in gates
            ],
        }

    @property
    def canonical_content_hash(self) -> str:
        return hashlib.sha256(canonical_json_bytes(self._canonical_content())).hexdigest()

    @property
    def acceptance_policy_id(self) -> str:
        # Identity is the hash — NOT the version label.
        return "acpol_" + self.canonical_content_hash


# The ONLY AcceptancePolicy authored for C2 (contract-authored, not implementation
# invented). Calibration family; sample-sufficiency gates only, NO metric gates —
# C2 measures, C3 decides "good enough".
CALIBRATION_ACCEPTANCE_POLICY_V1 = AcceptancePolicy(
    acceptance_policy_version="acpol-cal-0.3-c2-v1",
    family=FAMILY_CALIBRATION,
    min_cohort_n=100,
    min_positive=25,
    min_negative=25,
    min_bin_size=10,
    gates=(),
    metadata="Wave 0.3 C2 bootstrap policy: measure, do not certify.",
)


# ══════════════════════════════════════════════════════════════════════════════
# Specifications (one per family; ID = SHA256 of canonical content, no op. ts).
# ══════════════════════════════════════════════════════════════════════════════
@dataclass(frozen=True)
class CalibrationSpecification:
    specification_version: str
    source_dataset_id: str
    source_dataset_content_hash: str
    acceptance_policy_id: str
    binning_version: str = BINNING_FIXED_WIDTH_10_V1
    metric_ids: tuple[str, ...] = (
        METRIC_BASE_RATE, METRIC_BRIER, METRIC_ECE, METRIC_MCE, METRIC_LOG_LOSS,
        METRIC_CAL_SLOPE, METRIC_CAL_INTERCEPT,
    )
    decimal_context_version: str = DECIMAL_CONTEXT_VERSION
    presentation_scale: int = DECIMAL_PRESENTATION_SCALE
    reliability_table_schema_version: str = RELIABILITY_TABLE_SCHEMA_VERSION
    result_schema_version: str = CALIBRATION_RESULT_SCHEMA_VERSION
    spec_schema_version: str = CALIBRATION_SPEC_SCHEMA_VERSION

    @property
    def calibration_specification_id(self) -> str:
        return _cid("calspec_", asdict(self))


def _spec_id_generic(prefix: str, spec: object) -> str:
    return _cid(prefix, asdict(spec))


@dataclass(frozen=True)
class DecisionEvaluationSpecification:
    specification_version: str
    source_dataset_id: str
    source_dataset_content_hash: str
    metric_ids: tuple[str, ...] = (
        METRIC_BASE_RATE, METRIC_PRECISION, METRIC_RECALL, METRIC_ACCURACY, METRIC_ROC_AUC,
    )
    decimal_context_version: str = DECIMAL_CONTEXT_VERSION
    presentation_scale: int = DECIMAL_PRESENTATION_SCALE
    result_schema_version: str = DECISION_RESULT_SCHEMA_VERSION
    spec_schema_version: str = DECISION_SPEC_SCHEMA_VERSION

    @property
    def specification_id(self) -> str:
        return _spec_id_generic("decspec_", self)


@dataclass(frozen=True)
class ForecastEvaluationSpecification:
    specification_version: str
    source_dataset_id: str
    source_dataset_content_hash: str
    metric_ids: tuple[str, ...] = (
        METRIC_SIGNED_ERROR, METRIC_ABS_ERROR, METRIC_SQ_ERROR,
        METRIC_DIRECTIONAL, METRIC_SPEARMAN, METRIC_COVERAGE,
    )
    decimal_context_version: str = DECIMAL_CONTEXT_VERSION
    presentation_scale: int = DECIMAL_PRESENTATION_SCALE
    result_schema_version: str = FORECAST_RESULT_SCHEMA_VERSION
    spec_schema_version: str = FORECAST_SPEC_SCHEMA_VERSION

    @property
    def specification_id(self) -> str:
        return _spec_id_generic("fcspec_", self)


# ── Value objects ─────────────────────────────────────────────────────────────
@dataclass(frozen=True)
class MetricValue:
    metric_id: str
    status: str          # MV_*
    kind: str            # AUTHORITATIVE | DIAGNOSTIC
    value: str | None    # presentation decimal string when measured, else None
    binning_version: str | None = None   # set for reliability-derived metrics


@dataclass(frozen=True)
class ReliabilityBin:
    index: int
    lower: str
    upper: str
    upper_inclusive: bool
    count: int
    positives: int
    negatives: int
    mean_confidence: str | None
    observed_frequency: str | None
    sparse: bool


# ── Sample: an eligible (record, p, o) row ────────────────────────────────────
@dataclass(frozen=True)
class _Sample:
    record_id: str
    group_key: str
    p: Decimal | None
    o: int | None            # 0/1 boolean outcome
    decision: str
    expected: Decimal | None
    observed_return: Decimal | None


def _outcome(record: EvaluationRecordRevision) -> OutcomePayload | None:
    if not record.outcome_json:
        return None
    try:
        data = json.loads(record.outcome_json)
        return OutcomePayload(**data)
    except Exception:
        return None


def _group_key(record: EvaluationRecordRevision) -> str:
    return record.durable_event_uid or record.observation_id


def _cohort_key(record: EvaluationRecordRevision, family: str) -> tuple:
    outcome = _outcome(record)
    target = outcome.target_identifier if outcome else None
    horizon = (outcome.horizon_at if outcome else None) or record.outcome_horizon_at
    return (
        family,
        record.engine_version,
        record.policy_version,
        record.manifest_version,
        record.outcome_specification_version or "",
        target or "",
        horizon or "",
        record.observation_stage,
        record.confidence_semantics,
    )


def _cohort_identity(key: tuple) -> dict:
    (family, engine, policy, manifest, outcome_spec, target, horizon, stage, sem) = key
    return {
        "family": family,
        "engine_version": engine,
        "policy_version": policy,
        "input_manifest_version": manifest,
        "outcome_specification_version": outcome_spec,
        "target": target,
        "horizon": horizon,
        "observation_stage": stage,
        "confidence_semantics_id": sem,
    }


def _empty_exclusions() -> dict:
    return {code: 0 for code in EXCLUSION_REASON_CODES}


# ══════════════════════════════════════════════════════════════════════════════
# Metric formulas (Decimal; deterministic; formula-bound ids).
# ══════════════════════════════════════════════════════════════════════════════
def _mean(values: list[Decimal]) -> Decimal:
    with localcontext(_CTX):
        total = _ZERO
        for v in values:
            total += v
        return total / Decimal(len(values))


def brier_v1(ps: list[Decimal], os: list[int]) -> Decimal:
    with localcontext(_CTX):
        total = _ZERO
        for p, o in zip(ps, os):
            diff = p - Decimal(o)
            total += diff * diff
        return total / Decimal(len(ps))


def log_loss_v1(ps: list[Decimal], os: list[int]) -> Decimal | None:
    # Unavailable (no silent clamp) if any p is exactly 0 or 1.
    if any(p == _ZERO or p == _ONE for p in ps):
        return None
    with localcontext(_CTX):
        total = _ZERO
        for p, o in zip(ps, os):
            if o == 1:
                total += p.ln()
            else:
                total += (_ONE - p).ln()
        return -(total / Decimal(len(ps)))


def base_rate_v1(os: list[int]) -> Decimal:
    with localcontext(_CTX):
        return Decimal(sum(os)) / Decimal(len(os))


def _fixed_width_10_bins(ps: list[Decimal], os: list[int], min_bin_size: int) -> list[ReliabilityBin]:
    # 10 equal-width bins over [0,1]: [k/10,(k+1)/10) for k=0..8; last [0.9,1.0].
    edges = [Decimal(k) / Decimal(10) for k in range(11)]
    buckets: list[list[int]] = [[] for _ in range(10)]   # index -> list of positions
    with localcontext(_CTX):
        for i, p in enumerate(ps):
            if p >= _ONE:
                idx = 9
            else:
                idx = int((p * Decimal(10)).to_integral_value(rounding="ROUND_FLOOR"))
                if idx < 0:
                    idx = 0
                if idx > 9:
                    idx = 9
            buckets[idx].append(i)
    bins: list[ReliabilityBin] = []
    with localcontext(_CTX):
        for k in range(10):
            members = buckets[k]
            n = len(members)
            pos = sum(os[i] for i in members)
            neg = n - pos
            mean_conf = (sum((ps[i] for i in members), _ZERO) / Decimal(n)) if n else None
            obs_freq = (Decimal(pos) / Decimal(n)) if n else None
            bins.append(ReliabilityBin(
                index=k,
                lower=_present(edges[k]),
                upper=_present(edges[k + 1]),
                upper_inclusive=(k == 9),
                count=n,
                positives=pos,
                negatives=neg,
                mean_confidence=_present(mean_conf) if mean_conf is not None else None,
                observed_frequency=_present(obs_freq) if obs_freq is not None else None,
                sparse=(0 < n < min_bin_size),
            ))
    return bins


def ece_v1(bins: list[ReliabilityBin], n: int) -> Decimal:
    with localcontext(_CTX):
        total = _ZERO
        for b in bins:
            if b.count == 0:
                continue
            conf = Decimal(b.mean_confidence)
            acc = Decimal(b.observed_frequency)
            total += (Decimal(b.count) / Decimal(n)) * abs(acc - conf)
        return total


def mce_v1(bins: list[ReliabilityBin]) -> Decimal | None:
    with localcontext(_CTX):
        gaps = [abs(Decimal(b.observed_frequency) - Decimal(b.mean_confidence))
                for b in bins if b.count > 0]
        return max(gaps) if gaps else None


def calibration_slope_intercept_v1(bins: list[ReliabilityBin]) -> tuple[Decimal, Decimal] | None:
    # Weighted least squares of observed_frequency on mean_confidence, weights = count.
    pts = [(Decimal(b.mean_confidence), Decimal(b.observed_frequency), Decimal(b.count))
           for b in bins if b.count > 0]
    if len(pts) < 2:
        return None
    with localcontext(_CTX):
        w = sum((p[2] for p in pts), _ZERO)
        wx = sum((p[0] * p[2] for p in pts), _ZERO)
        wy = sum((p[1] * p[2] for p in pts), _ZERO)
        wxx = sum((p[0] * p[0] * p[2] for p in pts), _ZERO)
        wxy = sum((p[0] * p[1] * p[2] for p in pts), _ZERO)
        denom = w * wxx - wx * wx
        if denom == _ZERO:
            return None
        slope = (w * wxy - wx * wy) / denom
        intercept = (wy - slope * wx) / w
        return slope, intercept


def _average_ranks(values: list[Decimal]) -> list[Decimal]:
    order = sorted(range(len(values)), key=lambda i: values[i])
    ranks = [Decimal(0)] * len(values)
    with localcontext(_CTX):
        i = 0
        while i < len(order):
            j = i
            while j + 1 < len(order) and values[order[j + 1]] == values[order[i]]:
                j += 1
            avg = (Decimal(i + 1) + Decimal(j + 1)) / Decimal(2)
            for k in range(i, j + 1):
                ranks[order[k]] = avg
            i = j + 1
    return ranks


def roc_auc_v1(scores: list[Decimal], os: list[int]) -> Decimal | None:
    p = sum(os)
    neg = len(os) - p
    if p == 0 or neg == 0:
        return None
    ranks = _average_ranks(scores)
    with localcontext(_CTX):
        rank_pos = sum((ranks[i] for i in range(len(os)) if os[i] == 1), _ZERO)
        return (rank_pos - Decimal(p) * (Decimal(p) + _ONE) / Decimal(2)) / (Decimal(p) * Decimal(neg))


def pr_auc_v1(scores: list[Decimal], os: list[int]) -> Decimal | None:
    p = sum(os)
    if p == 0:
        return None
    order = sorted(range(len(os)), key=lambda i: (-scores[i], i))
    with localcontext(_CTX):
        tp = 0
        fp = 0
        prev_recall = _ZERO
        area = _ZERO
        prev_precision = _ONE
        for idx in order:
            if os[idx] == 1:
                tp += 1
            else:
                fp += 1
            recall = Decimal(tp) / Decimal(p)
            precision = Decimal(tp) / Decimal(tp + fp)
            area += (recall - prev_recall) * (precision + prev_precision) / Decimal(2)
            prev_recall = recall
            prev_precision = precision
        return area


def spearman_v1(xs: list[Decimal], ys: list[Decimal]) -> Decimal | None:
    if len(xs) < 2:
        return None
    rx = _average_ranks(xs)
    ry = _average_ranks(ys)
    with localcontext(_CTX):
        mx = _mean(rx)
        my = _mean(ry)
        num = sum(((rx[i] - mx) * (ry[i] - my) for i in range(len(rx))), _ZERO)
        dxx = sum(((rx[i] - mx) ** 2 for i in range(len(rx))), _ZERO)
        dyy = sum(((ry[i] - my) ** 2 for i in range(len(ry))), _ZERO)
        if dxx == _ZERO or dyy == _ZERO:
            return None
        return num / (dxx.sqrt() * dyy.sqrt())


# ══════════════════════════════════════════════════════════════════════════════
# Eligibility / exclusion (per family), leakage, revision safety.
# ══════════════════════════════════════════════════════════════════════════════
def _leaks(record: EvaluationRecordRevision, outcome: OutcomePayload) -> bool:
    # Future-information leakage: outcome info must not be available at decision time.
    if outcome.information_available_at is None:
        return True   # cannot prove no leakage → treat as leakage (fail-closed)
    try:
        return not (parse_utc_timestamp(record.decision_completed_at)
                    < parse_utc_timestamp(outcome.information_available_at))
    except Exception:
        return True


def _classify_calibration(record: EvaluationRecordRevision) -> tuple[_Sample | None, str | None]:
    outcome = _outcome(record)
    if outcome is None:
        return None, "excl_malformed_record"
    if outcome.status == "pending":
        return None, "excl_pending"
    if outcome.status == "invalidated":
        return None, "excl_outcome_invalidated"
    if outcome.status == "unavailable":
        return None, "excl_outcome_unavailable"
    if record.confidence_semantics not in PROBABILITY_CONFIDENCE_SEMANTICS:
        return None, "excl_confidence_incompatible_semantics"
    if record.decision_confidence is None:
        return None, "excl_confidence_absent"
    p = _parse_decimal(record.decision_confidence)
    if p is None or p < _ZERO or p > _ONE:
        return None, "excl_confidence_incompatible_semantics"
    if not isinstance(outcome.label, bool):
        return None, "excl_label_incompatible"
    if _leaks(record, outcome):
        return None, "excl_future_leakage"
    return _Sample(record.revision_id, _group_key(record), p, 1 if outcome.label else 0,
                   record.shadow_decision, None, None), None


def _classify_decision(record: EvaluationRecordRevision) -> tuple[_Sample | None, str | None]:
    outcome = _outcome(record)
    if outcome is None:
        return None, "excl_malformed_record"
    if outcome.status == "pending":
        return None, "excl_pending"
    if outcome.status == "invalidated":
        return None, "excl_outcome_invalidated"
    if outcome.status == "unavailable":
        return None, "excl_outcome_unavailable"
    if record.shadow_decision == "unresolved":
        return None, "excl_unresolved_decision"
    if not isinstance(outcome.label, bool):
        return None, "excl_label_incompatible"
    if _leaks(record, outcome):
        return None, "excl_future_leakage"
    p = _parse_decimal(record.decision_confidence)   # optional discrimination score
    return _Sample(record.revision_id, _group_key(record), p, 1 if outcome.label else 0,
                   record.shadow_decision, None, None), None


def _classify_forecast(record: EvaluationRecordRevision) -> tuple[_Sample | None, str | None]:
    outcome = _outcome(record)
    if outcome is None:
        return None, "excl_malformed_record"
    if outcome.status == "pending":
        return None, "excl_pending"
    if outcome.status in ("invalidated",):
        return None, "excl_outcome_invalidated"
    if outcome.status == "unavailable":
        return None, "excl_outcome_unavailable"
    if not record.expected_return_json or outcome.observed_return is None:
        return None, "excl_label_incompatible"
    try:
        exp_obj = json.loads(record.expected_return_json)
    except Exception:
        return None, "excl_malformed_record"
    if isinstance(exp_obj, dict):
        expected = _parse_decimal(exp_obj.get("value"))
        if exp_obj.get("unit") is not None and exp_obj.get("unit") != outcome.unit:
            return None, "excl_label_incompatible"
        if exp_obj.get("horizon") is not None and exp_obj.get("horizon") != outcome.horizon_at:
            return None, "excl_horizon_incompatible"
        if (exp_obj.get("methodology_id") is not None
                and exp_obj.get("methodology_id") != outcome.methodology_id):
            return None, "excl_label_incompatible"
    else:
        expected = _parse_decimal(exp_obj if isinstance(exp_obj, str) else None)
    observed = _parse_decimal(outcome.observed_return)
    if expected is None or observed is None:
        return None, "excl_malformed_record"
    if _leaks(record, outcome):
        return None, "excl_future_leakage"
    return _Sample(record.revision_id, _group_key(record), None, None,
                   record.shadow_decision, expected, observed), None


# ══════════════════════════════════════════════════════════════════════════════
# Acceptance governance (per artifact; never pooled).
# ══════════════════════════════════════════════════════════════════════════════
def _evaluate_acceptance(policy: AcceptancePolicy, family: str, status: str,
                         n: int, positives: int, negatives: int,
                         metrics: dict[str, MetricValue]) -> dict:
    if policy is None or policy.family != family or status != STATUS_MEASURED:
        return {"acceptance_policy_id": policy.acceptance_policy_id if policy else None,
                "governance_status": GOV_NOT_EVALUATED, "gate_results": [],
                "deciding_gate_ids": [], "sample_sufficiency": {"outcome": "not_evaluated"}}
    checks = {
        "min_cohort_n": (n >= policy.min_cohort_n, n, policy.min_cohort_n),
        "min_positive": (positives >= policy.min_positive, positives, policy.min_positive),
        "min_negative": (negatives >= policy.min_negative, negatives, policy.min_negative),
    }
    sample_ok = all(v[0] for v in checks.values())
    sample_block = {"outcome": "pass" if sample_ok else "fail",
                    "checks": {k: {"observed": v[1], "required": v[2],
                                   "outcome": "pass" if v[0] else "fail"}
                               for k, v in checks.items()}}
    if not sample_ok:
        return {"acceptance_policy_id": policy.acceptance_policy_id,
                "governance_status": GOV_INSUFFICIENT, "gate_results": [],
                "deciding_gate_ids": [], "sample_sufficiency": sample_block}
    gate_results = []
    deciding: list[str] = []
    for gate in policy.gates:
        mv = metrics.get(gate.metric_id)
        if mv is None or mv.status != MV_MEASURED:
            gate_results.append({"gate_id": gate.gate_id, "metric_id": gate.metric_id,
                                 "observed_value": None, "comparator": gate.comparator,
                                 "bound": gate.bound, "outcome": "INSUFFICIENT"})
            deciding.append(gate.gate_id)
            continue
        with localcontext(_CTX):
            observed = Decimal(mv.value)
            bound = Decimal(gate.bound)
            passed = {"<=": observed <= bound, ">=": observed >= bound,
                      "<": observed < bound, ">": observed > bound,
                      "==": observed == bound}[gate.comparator]
        gate_results.append({"gate_id": gate.gate_id, "metric_id": gate.metric_id,
                             "observed_value": mv.value, "comparator": gate.comparator,
                             "bound": gate.bound, "outcome": "PASS" if passed else "FAIL"})
        if not passed:
            deciding.append(gate.gate_id)
    if any(g["outcome"] in ("FAIL", "INSUFFICIENT") for g in gate_results):
        gov = GOV_REJECTED
    else:
        gov = GOV_ACCEPTED
    return {"acceptance_policy_id": policy.acceptance_policy_id, "governance_status": gov,
            "gate_results": gate_results, "deciding_gate_ids": deciding,
            "sample_sufficiency": sample_block}


# ══════════════════════════════════════════════════════════════════════════════
# Result artifacts (immutable; content hash excludes generated_at + ids).
# ══════════════════════════════════════════════════════════════════════════════
@dataclass(frozen=True)
class FamilyResult:
    result_schema_version: str
    family: str
    specification_id: str
    source_dataset_id: str
    source_dataset_content_hash: str
    cohort_identity: dict | None
    status: str
    record_counts: dict
    exclusion_counts: dict
    metrics: dict                 # metric_id -> serialized MetricValue
    reliability_table: list | None
    binning_version: str | None
    reliability_table_schema_version: str | None
    sparse_flags: dict
    warnings: list
    acceptance: dict
    metadata: dict
    generated_at: str | None = None

    # Per-family compile-time separation: a family result MAY only carry metrics
    # from its own family. Subclasses declare ALLOWED_METRICS; construction with a
    # foreign metric raises. Base is abstract (empty ⇒ construct via a subclass).
    ALLOWED_METRICS: ClassVar[frozenset] = frozenset()
    RESULT_ID_PREFIX: ClassVar[str] = "res_"

    def __post_init__(self) -> None:
        allowed = type(self).ALLOWED_METRICS
        if allowed:
            foreign = set(self.metrics) - (allowed | {"confusion"})
            if foreign:
                raise ValueError(
                    f"{type(self).__name__} may not carry foreign metrics: {sorted(foreign)}")

    def _hash_payload(self) -> dict:
        payload = asdict(self)
        payload.pop("generated_at")
        return payload

    @property
    def canonical_content_hash(self) -> str:
        return hashlib.sha256(canonical_json_bytes(self._hash_payload())).hexdigest()

    @property
    def result_id(self) -> str:
        return type(self).RESULT_ID_PREFIX + self.canonical_content_hash

    def to_canonical_json(self) -> str:
        payload = self._hash_payload()
        payload["canonical_content_hash"] = self.canonical_content_hash
        payload["result_id"] = self.result_id
        return canonical_json_text(payload)


@dataclass(frozen=True)
class CalibrationResult(FamilyResult):
    ALLOWED_METRICS: ClassVar[frozenset] = frozenset({
        METRIC_BASE_RATE, METRIC_BRIER, METRIC_ECE, METRIC_MCE, METRIC_LOG_LOSS,
        METRIC_CAL_SLOPE, METRIC_CAL_INTERCEPT,
    })
    RESULT_ID_PREFIX: ClassVar[str] = "calres_"


@dataclass(frozen=True)
class DecisionEvaluationResult(FamilyResult):
    ALLOWED_METRICS: ClassVar[frozenset] = frozenset({
        METRIC_BASE_RATE, METRIC_PRECISION, METRIC_RECALL, METRIC_ACCURACY,
        METRIC_ROC_AUC, METRIC_PR_AUC,
    })
    RESULT_ID_PREFIX: ClassVar[str] = "decres_"


@dataclass(frozen=True)
class ForecastEvaluationResult(FamilyResult):
    ALLOWED_METRICS: ClassVar[frozenset] = frozenset({
        METRIC_SIGNED_ERROR, METRIC_ABS_ERROR, METRIC_SQ_ERROR,
        METRIC_DIRECTIONAL, METRIC_SPEARMAN, METRIC_COVERAGE,
    })
    RESULT_ID_PREFIX: ClassVar[str] = "fcres_"


def _mv(metric_id, status, kind, value=None, binning=None) -> dict:
    return asdict(MetricValue(metric_id, status, kind, value, binning))


# ── Calibration family ─────────────────────────────────────────────────────────
def build_calibration_results(dataset: EvaluationDataset,
                              specification: CalibrationSpecification,
                              policy: AcceptancePolicy = CALIBRATION_ACCEPTANCE_POLICY_V1,
                              *, generated_at: str | None = None) -> list[FamilyResult]:
    spec_id = specification.calibration_specification_id
    cohorts: dict[tuple, list[EvaluationRecordRevision]] = {}
    for record in dataset.records:
        cohorts.setdefault(_cohort_key(record, FAMILY_CALIBRATION), []).append(record)

    results: list[FamilyResult] = []
    if not cohorts:
        results.append(_calibration_unsupported(
            spec_id, specification, dataset, None, STATUS_UNSUPPORTED_UNAVAILABLE,
            "no eligible calibration records in dataset", generated_at))
        return results

    for key in sorted(cohorts):
        records = cohorts[key]
        identity = _cohort_identity(key)
        sem = identity["confidence_semantics_id"]
        if sem not in PROBABILITY_CONFIDENCE_SEMANTICS:
            # §18: unsupported family emits status + metadata ONLY, never metrics.
            results.append(_calibration_unsupported(
                spec_id, specification, dataset, identity, STATUS_UNSUPPORTED_SEMANTICS,
                f"confidence_semantics '{sem}' declares no probability semantics",
                generated_at, candidate=len(records)))
            continue
        results.append(_calibration_measured(
            spec_id, specification, policy, dataset, identity, records, generated_at))
    return results


def _calibration_unsupported(spec_id, specification, dataset, identity, status, reason,
                             generated_at, candidate: int = 0) -> "CalibrationResult":
    return CalibrationResult(
        result_schema_version=specification.result_schema_version,
        family=FAMILY_CALIBRATION,
        specification_id=spec_id,
        source_dataset_id=dataset.dataset_id,
        source_dataset_content_hash=dataset.dataset_id,
        cohort_identity=identity,
        status=status,
        record_counts={"candidate": candidate, "included": 0},
        exclusion_counts={},           # no eligibility pass performed
        metrics={},                    # NO metrics, NO ECE/Brier, NO placeholders
        reliability_table=None,
        binning_version=None,
        reliability_table_schema_version=None,
        sparse_flags={},
        warnings=[],
        acceptance={"acceptance_policy_id": None, "governance_status": GOV_NOT_EVALUATED,
                    "gate_results": [], "deciding_gate_ids": [],
                    "sample_sufficiency": {"outcome": "not_evaluated"}},
        metadata={"unsupported_reason": reason},
        generated_at=generated_at,
    )


def _calibration_measured(spec_id, specification, policy, dataset, identity, records,
                          generated_at) -> FamilyResult:
    exclusions = _empty_exclusions()
    samples: list[_Sample] = []
    seen_groups: set[str] = set()
    for record in sorted(records, key=lambda r: r.revision_id):
        sample, reason = _classify_calibration(record)
        if reason is not None:
            exclusions[reason] += 1
            continue
        if sample.group_key in seen_groups:      # repeated-observation contamination
            exclusions["excl_duplicate_observation"] += 1
            continue
        seen_groups.add(sample.group_key)
        samples.append(sample)
    samples.sort(key=lambda s: s.record_id)

    candidate = len(records)
    n = len(samples)
    if n == 0:
        # Nothing eligible after exclusions — unsupported_unavailable, but the
        # exclusion counts are PRESERVED (candidate + Σ exclusions reconcile).
        return CalibrationResult(
            result_schema_version=specification.result_schema_version,
            family=FAMILY_CALIBRATION, specification_id=spec_id,
            source_dataset_id=dataset.dataset_id, source_dataset_content_hash=dataset.dataset_id,
            cohort_identity=identity, status=STATUS_UNSUPPORTED_UNAVAILABLE,
            record_counts={"candidate": candidate, "included": 0},
            exclusion_counts=exclusions, metrics={}, reliability_table=None,
            binning_version=None, reliability_table_schema_version=None,
            sparse_flags={}, warnings=[],
            acceptance={"acceptance_policy_id": None, "governance_status": GOV_NOT_EVALUATED,
                        "gate_results": [], "deciding_gate_ids": [],
                        "sample_sufficiency": {"outcome": "not_evaluated"}},
            metadata={"unsupported_reason": "no eligible probability records after exclusions"},
            generated_at=generated_at)

    ps = [s.p for s in samples]
    os = [s.o for s in samples]
    positives = sum(os)
    negatives = n - positives
    bins = _fixed_width_10_bins(ps, os, policy.min_bin_size)

    metrics: dict[str, dict] = {}
    metrics[METRIC_BASE_RATE] = _mv(METRIC_BASE_RATE, MV_MEASURED, AUTHORITATIVE,
                                    _present(base_rate_v1(os)))
    metrics[METRIC_BRIER] = _mv(METRIC_BRIER, MV_MEASURED, AUTHORITATIVE,
                                _present(brier_v1(ps, os)))
    metrics[METRIC_ECE] = _mv(METRIC_ECE, MV_MEASURED, AUTHORITATIVE,
                              _present(ece_v1(bins, n)), specification.binning_version)
    mce = mce_v1(bins)
    metrics[METRIC_MCE] = (_mv(METRIC_MCE, MV_MEASURED, AUTHORITATIVE, _present(mce),
                               specification.binning_version)
                           if mce is not None else
                           _mv(METRIC_MCE, MV_UNAVAILABLE, AUTHORITATIVE, None,
                               specification.binning_version))
    ll = log_loss_v1(ps, os)
    metrics[METRIC_LOG_LOSS] = (_mv(METRIC_LOG_LOSS, MV_MEASURED, DIAGNOSTIC, _present(ll))
                                if ll is not None else
                                _mv(METRIC_LOG_LOSS, MV_UNAVAILABLE, DIAGNOSTIC, None))
    si = calibration_slope_intercept_v1(bins)
    if si is None:
        metrics[METRIC_CAL_SLOPE] = _mv(METRIC_CAL_SLOPE, MV_UNAVAILABLE, DIAGNOSTIC, None,
                                        specification.binning_version)
        metrics[METRIC_CAL_INTERCEPT] = _mv(METRIC_CAL_INTERCEPT, MV_UNAVAILABLE, DIAGNOSTIC,
                                            None, specification.binning_version)
    else:
        metrics[METRIC_CAL_SLOPE] = _mv(METRIC_CAL_SLOPE, MV_MEASURED, DIAGNOSTIC,
                                        _present(si[0]), specification.binning_version)
        metrics[METRIC_CAL_INTERCEPT] = _mv(METRIC_CAL_INTERCEPT, MV_MEASURED, DIAGNOSTIC,
                                            _present(si[1]), specification.binning_version)

    metric_values = {mid: MetricValue(**m) for mid, m in metrics.items()}
    acceptance = _evaluate_acceptance(policy, FAMILY_CALIBRATION, STATUS_MEASURED,
                                      n, positives, negatives, metric_values)
    sparse_bins = [b.index for b in bins if b.sparse]
    return CalibrationResult(
        result_schema_version=specification.result_schema_version,
        family=FAMILY_CALIBRATION,
        specification_id=spec_id,
        source_dataset_id=dataset.dataset_id,
        source_dataset_content_hash=dataset.dataset_id,
        cohort_identity=identity,
        status=STATUS_MEASURED,
        record_counts={"candidate": candidate, "included": n,
                       "positive": positives, "negative": negatives},
        exclusion_counts=exclusions,
        metrics=metrics,
        reliability_table=[asdict(b) for b in bins],
        binning_version=specification.binning_version,
        reliability_table_schema_version=specification.reliability_table_schema_version,
        sparse_flags={"sparse_bins": sparse_bins},
        warnings=[],
        acceptance=acceptance,
        metadata={"confidence_distribution": {
            "min": _present(min(ps)), "max": _present(max(ps))}},
        generated_at=generated_at,
    )


# ── Decision Evaluation family ─────────────────────────────────────────────────
def build_decision_results(dataset: EvaluationDataset,
                           specification: DecisionEvaluationSpecification,
                           *, generated_at: str | None = None) -> list[FamilyResult]:
    spec_id = specification.specification_id
    cohorts: dict[tuple, list[EvaluationRecordRevision]] = {}
    for record in dataset.records:
        cohorts.setdefault(_cohort_key(record, FAMILY_DECISION), []).append(record)
    results: list[FamilyResult] = []
    if not cohorts:
        return results
    for key in sorted(cohorts):
        records = cohorts[key]
        identity = _cohort_identity(key)
        exclusions = _empty_exclusions()
        samples: list[_Sample] = []
        abstentions: list[_Sample] = []
        seen_groups: set[str] = set()
        for record in sorted(records, key=lambda r: r.revision_id):
            sample, reason = _classify_decision(record)
            if reason == "excl_unresolved_decision":
                exclusions[reason] += 1
                # capture abstention outcome base rate separately (never negative)
                outcome = _outcome(record)
                if outcome is not None and isinstance(outcome.label, bool):
                    abstentions.append(_Sample(record.revision_id, _group_key(record),
                                               None, 1 if outcome.label else 0,
                                               "unresolved", None, None))
                continue
            if reason is not None:
                exclusions[reason] += 1
                continue
            if sample.group_key in seen_groups:
                exclusions["excl_duplicate_observation"] += 1
                continue
            seen_groups.add(sample.group_key)
            samples.append(sample)
        samples.sort(key=lambda s: s.record_id)
        results.append(_decision_result(spec_id, specification, dataset, identity,
                                        records, samples, abstentions, exclusions, generated_at))
    return results


def _decision_result(spec_id, specification, dataset, identity, records, samples,
                     abstentions, exclusions, generated_at) -> FamilyResult:
    candidate = len(records)
    n = len(samples)
    if n == 0:
        status = STATUS_UNSUPPORTED_UNAVAILABLE
        metrics: dict = {}
        reliability = None
    else:
        status = STATUS_MEASURED
        tp = sum(1 for s in samples if s.decision == "universal" and s.o == 1)
        fp = sum(1 for s in samples if s.decision == "universal" and s.o == 0)
        fn = sum(1 for s in samples if s.decision == "not_universal" and s.o == 1)
        tn = sum(1 for s in samples if s.decision == "not_universal" and s.o == 0)
        os = [s.o for s in samples]
        with localcontext(_CTX):
            precision = (Decimal(tp) / Decimal(tp + fp)) if (tp + fp) else None
            recall = (Decimal(tp) / Decimal(tp + fn)) if (tp + fn) else None
            accuracy = Decimal(tp + tn) / Decimal(n)
        metrics = {
            METRIC_BASE_RATE: _mv(METRIC_BASE_RATE, MV_MEASURED, AUTHORITATIVE,
                                  _present(base_rate_v1(os))),
            METRIC_ACCURACY: _mv(METRIC_ACCURACY, MV_MEASURED, AUTHORITATIVE, _present(accuracy)),
            METRIC_PRECISION: (_mv(METRIC_PRECISION, MV_MEASURED, AUTHORITATIVE, _present(precision))
                               if precision is not None else
                               _mv(METRIC_PRECISION, MV_UNAVAILABLE, AUTHORITATIVE, None)),
            METRIC_RECALL: (_mv(METRIC_RECALL, MV_MEASURED, AUTHORITATIVE, _present(recall))
                            if recall is not None else
                            _mv(METRIC_RECALL, MV_UNAVAILABLE, AUTHORITATIVE, None)),
        }
        # Discrimination (diagnostic) — only if a score is present on every sample.
        if all(s.p is not None for s in samples):
            scores = [s.p for s in samples]
            auc = roc_auc_v1(scores, os)
            metrics[METRIC_ROC_AUC] = (_mv(METRIC_ROC_AUC, MV_MEASURED, DIAGNOSTIC, _present(auc))
                                       if auc is not None else
                                       _mv(METRIC_ROC_AUC, MV_UNAVAILABLE, DIAGNOSTIC, None))
        else:
            metrics[METRIC_ROC_AUC] = _mv(METRIC_ROC_AUC, MV_UNAVAILABLE, DIAGNOSTIC, None)
        reliability = None
        metrics["confusion"] = {"tp": tp, "fp": fp, "fn": fn, "tn": tn}

    abstention_block = {"count": len(abstentions)}
    if abstentions:
        with localcontext(_CTX):
            abstention_block["outcome_base_rate"] = _present(
                Decimal(sum(a.o for a in abstentions)) / Decimal(len(abstentions)))
        abstention_block["coverage"] = _present(
            Decimal(len(abstentions)) / Decimal(candidate)) if candidate else None

    return DecisionEvaluationResult(
        result_schema_version=specification.result_schema_version,
        family=FAMILY_DECISION,
        specification_id=spec_id,
        source_dataset_id=dataset.dataset_id,
        source_dataset_content_hash=dataset.dataset_id,
        cohort_identity=identity,
        status=status,
        record_counts={"candidate": candidate, "included": n},
        exclusion_counts=exclusions,
        metrics=metrics,
        reliability_table=reliability,
        binning_version=None,
        reliability_table_schema_version=None,
        sparse_flags={},
        warnings=[],
        # Decision family has NO AcceptancePolicy in C2 → governance not_evaluated.
        acceptance={"acceptance_policy_id": None, "governance_status": GOV_NOT_EVALUATED,
                    "gate_results": [], "deciding_gate_ids": [],
                    "sample_sufficiency": {"outcome": "not_evaluated"}},
        metadata={"abstention_cohort": abstention_block},
        generated_at=generated_at,
    )


# ── Forecast Evaluation family ─────────────────────────────────────────────────
def build_forecast_results(dataset: EvaluationDataset,
                           specification: ForecastEvaluationSpecification,
                           *, generated_at: str | None = None) -> list[FamilyResult]:
    spec_id = specification.specification_id
    cohorts: dict[tuple, list[EvaluationRecordRevision]] = {}
    for record in dataset.records:
        cohorts.setdefault(_cohort_key(record, FAMILY_FORECAST), []).append(record)
    results: list[FamilyResult] = []
    if not cohorts:
        return results
    for key in sorted(cohorts):
        records = cohorts[key]
        identity = _cohort_identity(key)
        exclusions = _empty_exclusions()
        samples: list[_Sample] = []
        seen_groups: set[str] = set()
        for record in sorted(records, key=lambda r: r.revision_id):
            sample, reason = _classify_forecast(record)
            if reason is not None:
                exclusions[reason] += 1
                continue
            if sample.group_key in seen_groups:
                exclusions["excl_duplicate_observation"] += 1
                continue
            seen_groups.add(sample.group_key)
            samples.append(sample)
        samples.sort(key=lambda s: s.record_id)
        candidate = len(records)
        n = len(samples)
        if n == 0:
            status = STATUS_UNSUPPORTED_UNAVAILABLE
            metrics = {}
        else:
            status = STATUS_MEASURED
            exp = [s.expected for s in samples]
            obs = [s.observed_return for s in samples]
            with localcontext(_CTX):
                signed = _mean([exp[i] - obs[i] for i in range(n)])
                abse = _mean([abs(exp[i] - obs[i]) for i in range(n)])
                sqe = _mean([(exp[i] - obs[i]) ** 2 for i in range(n)])
                diracc = Decimal(sum(1 for i in range(n)
                                     if _sign(exp[i]) == _sign(obs[i]))) / Decimal(n)
            sp = spearman_v1(exp, obs)
            metrics = {
                METRIC_SIGNED_ERROR: _mv(METRIC_SIGNED_ERROR, MV_MEASURED, AUTHORITATIVE, _present(signed)),
                METRIC_ABS_ERROR: _mv(METRIC_ABS_ERROR, MV_MEASURED, AUTHORITATIVE, _present(abse)),
                METRIC_SQ_ERROR: _mv(METRIC_SQ_ERROR, MV_MEASURED, AUTHORITATIVE, _present(sqe)),
                METRIC_DIRECTIONAL: _mv(METRIC_DIRECTIONAL, MV_MEASURED, AUTHORITATIVE, _present(diracc)),
                METRIC_COVERAGE: _mv(METRIC_COVERAGE, MV_MEASURED, DIAGNOSTIC,
                                     _present(Decimal(n) / Decimal(candidate))),
                METRIC_SPEARMAN: (_mv(METRIC_SPEARMAN, MV_MEASURED, DIAGNOSTIC, _present(sp))
                                  if sp is not None else
                                  _mv(METRIC_SPEARMAN, MV_UNAVAILABLE, DIAGNOSTIC, None)),
            }
        results.append(ForecastEvaluationResult(
            result_schema_version=specification.result_schema_version,
            family=FAMILY_FORECAST,
            specification_id=spec_id,
            source_dataset_id=dataset.dataset_id,
            source_dataset_content_hash=dataset.dataset_id,
            cohort_identity=identity,
            status=status,
            record_counts={"candidate": candidate, "included": n},
            exclusion_counts=exclusions,
            metrics=metrics,
            reliability_table=None,
            binning_version=None,
            reliability_table_schema_version=None,
            sparse_flags={},
            warnings=[],
            acceptance={"acceptance_policy_id": None, "governance_status": GOV_NOT_EVALUATED,
                        "gate_results": [], "deciding_gate_ids": [],
                        "sample_sufficiency": {"outcome": "not_evaluated"}},
            metadata={},
            generated_at=generated_at,
        ))
    return results


def _sign(value: Decimal) -> int:
    if value > _ZERO:
        return 1
    if value < _ZERO:
        return -1
    return 0
