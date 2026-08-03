"""
app/materiality_readiness.py — Wave 0.3 C4: acceptance & production readiness.

Backend-only, shadow-only, ADVISORY governance layer that reads immutable C1/C2/C3
artifacts plus immutable OperationalEvidence and produces an immutable readiness
assessment (ReadinessResult + ActivationPrerequisite list + advisory ActivationPlan).
It answers: "is the materiality system ready to be considered for controlled
production activation, and if not, exactly which prerequisites remain unmet?"

C4 ASSESSES; it NEVER activates. It has no write path to inference, thresholds,
configuration, or any product surface, never mutates a C1/C2/C3 artifact, never
writes readiness back into consumed artifacts, fails closed on corrupt/missing
evidence, and is imported by no production/inference module.

Current engine → readiness_status = insufficient_evidence (CAL-1/THR-1/BASE-1/CFG-1
insufficient): infrastructure existing is NOT readiness.
"""

from __future__ import annotations

import hashlib
import json
import threading
from dataclasses import asdict, dataclass, field
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Callable, ClassVar

from app.materiality_evaluation import (
    canonical_json_bytes,
    canonical_json_text,
    parse_utc_timestamp,
    utc_timestamp,
)

# ── Versions ──────────────────────────────────────────────────────────────────
C4_CONTRACT_VERSION = "wave-0.3-c4"
OPERATIONAL_EVIDENCE_SCHEMA_VERSION = "opev-1"
READINESS_SPEC_SCHEMA_VERSION = "rdspec-1"
READINESS_RESULT_SCHEMA_VERSION = "rdres-1"
GATE_SET_VERSION = "rdgates-c4-v1"

# ── Locked governance inputs (contract-authored; instantiate verbatim) ─────────
OPERATIONAL_EVIDENCE_FRESHNESS_POLICY_VERSION = "oefp-c4-v1"
OPERATIONAL_EVIDENCE_FRESHNESS = {
    "regression": 604800,
    "configuration_snapshot": 86400,
    "storage_integrity": 86400,
    "failure_isolation": 604800,
    "rollback": 2592000,
    "deployment": 604800,
}
OPERATIONAL_EVIDENCE_FAMILIES = frozenset(OPERATIONAL_EVIDENCE_FRESHNESS)

# Exact per-family content schema (frozen contract §3). Enforced at construction —
# and therefore at OperationalEvidenceStore.accept() and reload. Missing keys, extra
# keys, and wrong types are rejected; `list` fields must contain only strings. bool
# and int are treated as DISTINCT (a bool is not accepted where an int is required).
_FAMILY_SCHEMA: dict[str, dict[str, type]] = {
    "regression": {"suite_ids": list, "passed": int, "failed": int, "target_commit_hash": str},
    "configuration_snapshot": {"materiality_mode": str, "evaluation_flag": bool,
                               "activation_flag": bool, "effective_mode": str},
    "storage_integrity": {"store_path_id": str, "record_count": int, "jsonl_hash": str},
    "failure_isolation": {"feed_pickle_forbidden_symbols_absent": bool, "no_production_write_path": bool},
    "rollback": {"one_step_off": bool, "requires_migration": bool,
                 "cache_compatible": bool, "event_compatible": bool},
    "deployment": {"deploy_procedure_id": str, "rollback_flag_present": bool},
}


def _validate_family_content(family: str, content: dict) -> None:
    schema = _FAMILY_SCHEMA[family]
    if not isinstance(content, dict):
        raise ValueError(f"{family} content must be a dict")
    if set(content) != set(schema):
        raise ValueError(f"{family} content keys mismatch (missing/extra fields)")
    for key, typ in schema.items():
        value = content[key]
        if typ is list:
            if not (isinstance(value, list) and all(isinstance(x, str) for x in value)):
                raise ValueError(f"{family}.{key} must be a list of strings")
        elif type(value) is not typ:      # exact type: bool != int
            raise ValueError(f"{family}.{key} must be {typ.__name__}")

# ── Gate / status vocabularies ────────────────────────────────────────────────
GATE_PASS = "pass"
GATE_FAIL = "fail"
GATE_NOT_APPLICABLE = "not_applicable"
GATE_INSUFFICIENT = "insufficient"

READY = "ready"
NOT_READY = "not_ready"
INSUFFICIENT_EVIDENCE = "insufficient_evidence"
BLOCKED = "blocked"
INVALID = "invalid"

# Freshness / availability reason codes
REASON_AVAILABILITY_MISSING = "evidence_availability_missing"
REASON_NOT_AVAILABLE_AT_CUTOFF = "evidence_not_available_at_cutoff"
REASON_STALE = "evidence_stale"
REASON_MISSING = "operational_evidence_missing"


def _cid(prefix: str, value: object) -> str:
    return prefix + hashlib.sha256(canonical_json_bytes(value)).hexdigest()


# ══════════════════════════════════════════════════════════════════════════════
# OperationalEvidence — content-derived identity; availability is storage-assigned.
# ══════════════════════════════════════════════════════════════════════════════
@dataclass(frozen=True)
class OperationalEvidence:
    schema_version: str
    artifact_family: str
    producer_identity: str
    producer_version: str
    content: dict
    evidence_available_at: str | None = None   # NON-identity; storage-assigned exactly once
    generated_at: str | None = None            # NON-identity
    metadata: str = ""                          # NON-identity

    def __post_init__(self) -> None:
        if self.artifact_family not in OPERATIONAL_EVIDENCE_FAMILIES:
            raise ValueError(f"unknown operational evidence family: {self.artifact_family!r}")
        _validate_family_content(self.artifact_family, self.content)

    def _identity_content(self) -> dict:
        return {"schema_version": self.schema_version, "artifact_family": self.artifact_family,
                "producer_identity": self.producer_identity,
                "producer_version": self.producer_version, "content": self.content}

    @property
    def canonical_content_hash(self) -> str:
        return hashlib.sha256(canonical_json_bytes(self._identity_content())).hexdigest()

    @property
    def operational_evidence_id(self) -> str:
        return "opev_" + self.canonical_content_hash


class OperationalEvidenceStore:
    """Append-only, immutable operational-evidence store. `evidence_available_at`
    is STORAGE-ASSIGNED exactly once on first durable acceptance — the `accept`
    API exposes no availability argument. Identical retries return the original
    artifact (and its original timestamp); conflicting persistence is rejected."""

    def __init__(self, directory: Path, *, clock: Callable[[], datetime] | None = None) -> None:
        self.directory = Path(directory)
        self.directory.mkdir(parents=True, exist_ok=True)
        self.path = self.directory / "operational-evidence.jsonl"
        self._clock = clock or (lambda: datetime.now(timezone.utc))
        self._lock = threading.RLock()
        self._records: dict[str, OperationalEvidence] = {}
        self._load()

    def _load(self) -> None:
        if not self.path.exists():
            return
        with open(self.path, encoding="utf-8") as handle:
            for line in handle:
                if not line.strip():
                    continue
                data = json.loads(line)
                stored_id = data.pop("operational_evidence_id")
                ev = OperationalEvidence(
                    schema_version=data["schema_version"], artifact_family=data["artifact_family"],
                    producer_identity=data["producer_identity"],
                    producer_version=data["producer_version"], content=data["content"],
                    evidence_available_at=data["evidence_available_at"],
                    generated_at=data.get("generated_at"), metadata=data.get("metadata", ""))
                if ev.operational_evidence_id != stored_id:
                    raise ValueError("tampered operational evidence: id/content mismatch")
                existing = self._records.get(stored_id)
                if existing is not None and (
                        existing.evidence_available_at != ev.evidence_available_at):
                    raise ValueError("conflicting operational evidence: re-stamp rejected")
                self._records[stored_id] = ev

    def accept(self, *, schema_version: str, artifact_family: str, producer_identity: str,
               producer_version: str, content: dict, metadata: str = "") -> OperationalEvidence:
        draft = OperationalEvidence(schema_version, artifact_family, producer_identity,
                                    producer_version, content, metadata=metadata)
        oid = draft.operational_evidence_id
        with self._lock:
            existing = self._records.get(oid)
            if existing is not None:
                return existing                      # idempotent — original availability preserved
            stamp = utc_timestamp(self._clock())     # STORAGE assigns availability, exactly once
            ev = OperationalEvidence(schema_version, artifact_family, producer_identity,
                                     producer_version, content, evidence_available_at=stamp,
                                     generated_at=stamp, metadata=metadata)
            row = asdict(ev)
            row["operational_evidence_id"] = oid
            with open(self.path, "a", encoding="utf-8") as handle:
                handle.write(canonical_json_text(row) + "\n")
            self._records[oid] = ev
            return ev

    def get(self, operational_evidence_id: str) -> OperationalEvidence | None:
        return self._records.get(operational_evidence_id)


# ══════════════════════════════════════════════════════════════════════════════
# ReadinessGate (immutable definition) + GateResult (per-run outcome).
# ══════════════════════════════════════════════════════════════════════════════
@dataclass(frozen=True)
class ReadinessGate:
    gate_key: str
    category: str
    requirement: str
    blocking: bool
    gate_set_version: str = GATE_SET_VERSION

    @property
    def readiness_gate_id(self) -> str:
        return _cid("rdgate_", {"gate_key": self.gate_key, "category": self.category,
                               "requirement": self.requirement, "blocking": self.blocking,
                               "gate_set_version": self.gate_set_version})


@dataclass(frozen=True)
class GateResult:
    readiness_gate_id: str
    gate_key: str
    category: str
    status: str
    reason: str
    blocking: bool
    evidence_refs: tuple = ()


# Canonical v1 gate set (contract-authored).
GATE_SET_V1: tuple[ReadinessGate, ...] = (
    ReadinessGate("ARCH-1", "architecture", "C1/C2/C3 present; required versions match", True),
    ReadinessGate("DATA-1", "data", "immutable C1 dataset present, valid, sample-sufficient", True),
    ReadinessGate("CAL-1", "calibration", "C2 calibration result measured AND governance accepted", True),
    ReadinessGate("THR-1", "threshold_validation", "C3 recommendation supported AND evidence accepted", True),
    ReadinessGate("BASE-1", "threshold_validation", "lawful numeric current_production baseline exists", True),
    ReadinessGate("DET-1", "determinism", "C1/C2/C3 determinism regressions pass", True),
    ReadinessGate("SAFE-1", "safety", "no production write path; failures bounded", True),
    ReadinessGate("CFG-1", "configuration", "activation flag separate; malformed safe OFF; active authoritative", True),
    ReadinessGate("RBK-1", "rollback", "one-step fail-off; no migration; cache/event compatible", True),
    ReadinessGate("ISO-1", "production_isolation", "shadow artifacts never reach feed/API/frontend/event", True),
    ReadinessGate("DEP-1", "deployment", "deployment procedure + rollback flag documented", False),
    ReadinessGate("OBS-1", "observability", "activation-time metrics + stop conditions defined", False),
)

_SUBSYSTEM = {
    "ARCH-1": "architecture", "DATA-1": "c1", "CAL-1": "c2", "THR-1": "c3", "BASE-1": "engine",
    "DET-1": "ops", "SAFE-1": "ops", "CFG-1": "config", "RBK-1": "ops", "ISO-1": "ops",
    "DEP-1": "ops", "OBS-1": "ops",
}


# ══════════════════════════════════════════════════════════════════════════════
# ReadinessSpecification (content-derived identity; version/metadata excluded).
# ══════════════════════════════════════════════════════════════════════════════
@dataclass(frozen=True)
class ReadinessSpecification:
    specification_version: str                     # lineage label; NON-identity
    as_of_cutoff: str                              # IDENTITY: the logical assessment cutoff
    gate_set_version: str = GATE_SET_VERSION
    required_engine_versions: tuple = ()
    required_policy_versions: tuple = ()
    required_c1_dataset_versions: tuple = ()
    required_c2_families_statuses: dict = field(default_factory=dict)
    required_c3_statuses: dict = field(default_factory=dict)
    required_operational_checks: tuple = tuple(sorted(OPERATIONAL_EVIDENCE_FAMILIES))
    required_sample_sufficiency: dict = field(default_factory=lambda: {
        "min_cohort_n": 100, "min_positive": 25, "min_negative": 25})
    operational_evidence_freshness_policy_version: str = OPERATIONAL_EVIDENCE_FRESHNESS_POLICY_VERSION
    operational_evidence_freshness: dict = field(default_factory=lambda: dict(OPERATIONAL_EVIDENCE_FRESHNESS))
    metadata: str = ""                              # NON-identity

    def __post_init__(self) -> None:
        parse_utc_timestamp(self.as_of_cutoff)      # explicit cutoff, valid UTC; never a clock default

    def _identity_content(self) -> dict:
        return {
            "as_of_cutoff": self.as_of_cutoff,
            "gate_set_version": self.gate_set_version,
            "required_engine_versions": sorted(self.required_engine_versions),
            "required_policy_versions": sorted(self.required_policy_versions),
            "required_c1_dataset_versions": sorted(self.required_c1_dataset_versions),
            "required_c2_families_statuses": self.required_c2_families_statuses,
            "required_c3_statuses": self.required_c3_statuses,
            "required_operational_checks": sorted(self.required_operational_checks),
            "required_sample_sufficiency": self.required_sample_sufficiency,
            "operational_evidence_freshness_policy_version":
                self.operational_evidence_freshness_policy_version,
            "operational_evidence_freshness": self.operational_evidence_freshness,
        }

    @property
    def readiness_specification_id(self) -> str:
        return _cid("rdspec_", self._identity_content())


def readiness_specification_v1(as_of_cutoff: str) -> ReadinessSpecification:
    """Contract-authored v1 readiness specification. The 'supplied explicitly per
    run' cutoff requirement is met by constructing a fresh immutable specification
    for that run — changing only the cutoff mints a new readiness_specification_id."""
    return ReadinessSpecification(
        specification_version="rdspec-c4-v1",
        as_of_cutoff=as_of_cutoff,
        required_c2_families_statuses={"calibration": {"status": "measured", "governance": "accepted"}},
        required_c3_statuses={"recommendation_status": "supported", "evidence_governance": "accepted"},
    )


# ══════════════════════════════════════════════════════════════════════════════
# ActivationPrerequisite / ActivationPlan.
# ══════════════════════════════════════════════════════════════════════════════
@dataclass(frozen=True)
class ActivationPrerequisite:
    source_gate_id: str
    source_gate_key: str
    missing_requirement: str
    responsible_subsystem: str
    required_artifact_or_evidence: str
    severity: str
    blocking: bool
    dependency_ordering: int
    remediation_status: str = "not_started"        # C4 never executes remediation

    @property
    def prerequisite_id(self) -> str:
        return _cid("rdprq_", {"source_gate_id": self.source_gate_id,
                              "missing_requirement": self.missing_requirement,
                              "responsible_subsystem": self.responsible_subsystem,
                              "required_artifact_or_evidence": self.required_artifact_or_evidence,
                              "severity": self.severity, "blocking": self.blocking,
                              "dependency_ordering": self.dependency_ordering})


@dataclass(frozen=True)
class ActivationPlan:
    configuration_change: str
    required_feature_flag: str
    required_engine_version: str
    required_policy_version: str
    required_rollback_flag: str
    canary_scope: str
    monitoring_requirements: tuple
    stop_conditions: tuple
    rollback_procedure: str
    post_activation_verification: str
    approvals_required: tuple = ()                  # NON-identity
    metadata: str = ""                              # NON-identity
    advisory: bool = True                           # NON-identity (constant)

    def _identity_content(self) -> dict:
        return {"configuration_change": self.configuration_change,
                "required_feature_flag": self.required_feature_flag,
                "required_engine_version": self.required_engine_version,
                "required_policy_version": self.required_policy_version,
                "required_rollback_flag": self.required_rollback_flag,
                "canary_scope": self.canary_scope,
                "monitoring_requirements": list(self.monitoring_requirements),
                "stop_conditions": list(self.stop_conditions),
                "rollback_procedure": self.rollback_procedure,
                "post_activation_verification": self.post_activation_verification}

    @property
    def activation_plan_id(self) -> str:
        return _cid("rdplan_", self._identity_content())


# ══════════════════════════════════════════════════════════════════════════════
# Freshness / gate evaluation.
# ══════════════════════════════════════════════════════════════════════════════
def freshness_status(evidence: OperationalEvidence | None, family: str, as_of_cutoff: str,
                     spec: ReadinessSpecification) -> tuple[str, str]:
    """Return (state, reason). state ∈ {"eligible","insufficient","invalid"}. Inclusive
    on BOTH bounds: cutoff - max_age <= available_at <= cutoff."""
    if evidence is None:
        return "insufficient", REASON_MISSING
    if evidence.evidence_available_at is None:
        return "invalid", REASON_AVAILABILITY_MISSING
    cutoff = parse_utc_timestamp(as_of_cutoff)
    available = parse_utc_timestamp(evidence.evidence_available_at)
    if available > cutoff:
        return "insufficient", REASON_NOT_AVAILABLE_AT_CUTOFF
    max_age = spec.operational_evidence_freshness.get(family)
    if max_age is not None and available < cutoff - timedelta(seconds=max_age):
        return "insufficient", REASON_STALE
    return "eligible", ""


@dataclass(frozen=True)
class ReadinessInputs:
    c1_dataset_present: bool
    c1_sample_sufficient: bool
    c2_calibration_measured_accepted: bool
    c3_supported_accepted: bool
    baseline_lawful: bool
    op_evidence: dict            # family -> OperationalEvidence
    source_artifacts: tuple      # (id, hash) pairs from C1/C2/C3
    activation_plan: ActivationPlan


def _eval_gate(gate: ReadinessGate, inp: ReadinessInputs, as_of_cutoff: str,
               spec: ReadinessSpecification) -> tuple[GateResult, bool]:
    """Return (GateResult, invalid_flag). Operational gates read the contracted
    per-family fields (schema already enforced at construction)."""
    key = gate.gate_key
    invalid = False
    status, reason, refs = GATE_INSUFFICIENT, "", ()

    def gate_ev(family):
        """Return (evidence, blocked) where blocked is None if eligible, else a
        (status, reason, refs) triple; sets invalid on missing availability."""
        nonlocal invalid
        ev = inp.op_evidence.get(family)
        state, r = freshness_status(ev, family, as_of_cutoff, spec)
        if state == "invalid":
            invalid = True
            return None, (GATE_INSUFFICIENT, r, ())
        if state == "insufficient":
            return None, (GATE_INSUFFICIENT, r, ())
        return ev, None

    def simple(family, ok_fn):
        ev, blocked = gate_ev(family)
        if blocked:
            return blocked
        return (GATE_PASS if ok_fn(ev.content) else GATE_FAIL), "", (ev.operational_evidence_id,)

    if key == "ARCH-1":
        status = GATE_PASS if inp.c1_dataset_present else GATE_INSUFFICIENT
    elif key == "DATA-1":
        status, reason, refs = simple("storage_integrity", lambda c: c["record_count"] > 0)
        if status == GATE_PASS and not (inp.c1_dataset_present and inp.c1_sample_sufficient):
            status = GATE_INSUFFICIENT
    elif key == "CAL-1":
        status = GATE_PASS if inp.c2_calibration_measured_accepted else GATE_INSUFFICIENT
    elif key == "THR-1":
        status = GATE_PASS if inp.c3_supported_accepted else GATE_INSUFFICIENT
    elif key == "BASE-1":
        status = GATE_PASS if inp.baseline_lawful else GATE_INSUFFICIENT
    elif key == "DET-1":
        status, reason, refs = simple(
            "regression", lambda c: c["failed"] == 0 and c["passed"] > 0)
    elif key == "SAFE-1":
        status, reason, refs = simple("failure_isolation", lambda c: c["no_production_write_path"])
    elif key == "CFG-1":
        ev, blocked = gate_ev("configuration_snapshot")
        if blocked:
            status, reason, refs = blocked
        else:
            refs = (ev.operational_evidence_id,)
            c = ev.content
            downgraded = (c["materiality_mode"] == "active" and c["effective_mode"] != "active")
            if downgraded:
                # active is downgraded to shadow → NOT authoritative → Wave 0.4 prerequisite
                status, reason = GATE_INSUFFICIENT, "active_mode_downgraded_to_shadow"
            else:
                status = GATE_PASS   # activation_flag and evaluation_flag are separate schema fields
    elif key == "RBK-1":
        status, reason, refs = simple(
            "rollback", lambda c: (c["one_step_off"] and c["cache_compatible"]
                                   and c["event_compatible"] and not c["requires_migration"]))
    elif key == "ISO-1":
        status, reason, refs = simple("failure_isolation",
                                     lambda c: c["feed_pickle_forbidden_symbols_absent"])
    elif key == "DEP-1":
        status, reason, refs = simple("deployment", lambda c: c["rollback_flag_present"])
    elif key == "OBS-1":
        plan = inp.activation_plan
        status = (GATE_PASS if (plan and plan.monitoring_requirements and plan.stop_conditions)
                  else GATE_INSUFFICIENT)

    return GateResult(gate.readiness_gate_id, key, gate.category, status, reason, gate.blocking,
                      refs), invalid


def derive_readiness_status(gate_results: tuple[GateResult, ...]) -> str:
    """Gate-derived status (invalid is handled separately by the builder)."""
    blocking = [g for g in gate_results if g.blocking]
    if any(g.status == GATE_FAIL for g in blocking):
        return BLOCKED
    if any(g.status == GATE_INSUFFICIENT for g in blocking):
        return INSUFFICIENT_EVIDENCE
    if blocking and all(g.status == GATE_PASS for g in blocking):
        return READY
    return NOT_READY


# ══════════════════════════════════════════════════════════════════════════════
# ReadinessResult.
# ══════════════════════════════════════════════════════════════════════════════
@dataclass(frozen=True)
class ReadinessResult:
    result_schema_version: str
    readiness_specification_id: str
    as_of_cutoff: str
    source_artifact_ids: tuple
    source_artifact_hashes: tuple
    consumed_operational_evidence: tuple      # ({id, hash, available_at}, ...)
    gate_results: tuple
    readiness_status: str
    blocking_prerequisites: tuple
    non_blocking_warnings: tuple
    activation_plan_reference: str | None
    configuration_verification_results: dict
    rollback_verification_results: dict
    advisory: bool = True
    generated_at: str | None = None

    RESULT_ID_PREFIX: ClassVar[str] = "rdres_"

    def __post_init__(self) -> None:
        # Construction invariant: ready IFF no blocking prerequisites AND every
        # blocking gate passes. An inconsistent "ready" is rejected.
        if self.readiness_status == READY:
            bad = (self.blocking_prerequisites
                   or any(g["status"] != GATE_PASS
                          for g in self.gate_results if g["blocking"]))
            if bad:
                raise ValueError("inconsistent readiness: ready with prerequisites/non-pass gate")

    def _hash_payload(self) -> dict:
        payload = asdict(self)
        payload.pop("generated_at")
        return payload

    @property
    def canonical_content_hash(self) -> str:
        return hashlib.sha256(canonical_json_bytes(self._hash_payload())).hexdigest()

    @property
    def readiness_result_id(self) -> str:
        return self.RESULT_ID_PREFIX + self.canonical_content_hash

    def to_canonical_json(self) -> str:
        payload = self._hash_payload()
        payload["canonical_content_hash"] = self.canonical_content_hash
        payload["readiness_result_id"] = self.readiness_result_id
        return canonical_json_text(payload)


def build_readiness_result(specification: ReadinessSpecification, inputs: ReadinessInputs,
                           *, gate_set: tuple[ReadinessGate, ...] = GATE_SET_V1,
                           generated_at: str | None = None) -> ReadinessResult:
    # The cutoff is DERIVED from the specification (identity-bearing). Callers cannot
    # override it and it is never defaulted to a clock.
    as_of_cutoff = specification.as_of_cutoff
    parse_utc_timestamp(as_of_cutoff)

    gate_results: list[GateResult] = []
    invalid = False
    for gate in gate_set:
        gr, gate_invalid = _eval_gate(gate, inputs, as_of_cutoff, specification)
        invalid = invalid or gate_invalid
        gate_results.append(gr)
    gate_results.sort(key=lambda g: g.gate_key)
    grt = tuple(gate_results)

    if not grt:
        invalid = True   # degenerate/empty gate set

    status = INVALID if invalid else derive_readiness_status(grt)

    prerequisites: list[ActivationPrerequisite] = []
    warnings: list[dict] = []
    if status != INVALID:
        for idx, g in enumerate(sorted((x for x in grt if x.blocking), key=lambda x: x.gate_key)):
            if g.status != GATE_PASS:
                gate = next(x for x in gate_set if x.gate_key == g.gate_key)
                prerequisites.append(ActivationPrerequisite(
                    source_gate_id=g.readiness_gate_id, source_gate_key=g.gate_key,
                    missing_requirement=gate.requirement, responsible_subsystem=_SUBSYSTEM[g.gate_key],
                    required_artifact_or_evidence=gate.category, severity="blocking", blocking=True,
                    dependency_ordering=idx))
        warnings = [asdict(g) for g in grt if not g.blocking and g.status != GATE_PASS]

    prereq_payload = tuple(sorted((asdict(p) | {"prerequisite_id": p.prerequisite_id}
                                   for p in prerequisites), key=lambda p: p["source_gate_key"]))

    ids = tuple(sorted(i for (i, _h) in inputs.source_artifacts))
    hashes = tuple(h for (_i, h) in sorted(inputs.source_artifacts))
    consumed = tuple(sorted(
        ({"operational_evidence_id": ev.operational_evidence_id,
          "canonical_content_hash": ev.canonical_content_hash,
          "evidence_available_at": ev.evidence_available_at}
         for ev in inputs.op_evidence.values()),
        key=lambda d: d["operational_evidence_id"]))

    cfg = next((g for g in grt if g.gate_key == "CFG-1"), None)
    rbk = next((g for g in grt if g.gate_key == "RBK-1"), None)

    return ReadinessResult(
        result_schema_version=READINESS_RESULT_SCHEMA_VERSION,
        readiness_specification_id=specification.readiness_specification_id,
        as_of_cutoff=as_of_cutoff,
        source_artifact_ids=ids,
        source_artifact_hashes=hashes,
        consumed_operational_evidence=consumed,
        gate_results=tuple(asdict(g) for g in grt),
        readiness_status=status,
        blocking_prerequisites=prereq_payload,
        non_blocking_warnings=tuple(warnings),
        activation_plan_reference=(inputs.activation_plan.activation_plan_id
                                   if inputs.activation_plan else None),
        configuration_verification_results={"status": cfg.status if cfg else None,
                                            "reason": cfg.reason if cfg else None},
        rollback_verification_results={"status": rbk.status if rbk else None,
                                       "reason": rbk.reason if rbk else None},
        advisory=True,
        generated_at=generated_at,
    )
