"""
tests/test_materiality_readiness.py — Wave 0.3 C4 acceptance & production readiness.

Backend-only, shadow-only, advisory, read-only over C1/C2/C3. Independently pinned
fixtures for the ready / insufficient_evidence / blocked / invalid / not_ready paths.
"""

from __future__ import annotations

import inspect
import json

import pytest

from app.materiality_readiness import (
    GATE_FAIL,
    GATE_INSUFFICIENT,
    GATE_PASS,
    OPERATIONAL_EVIDENCE_SCHEMA_VERSION,
    REASON_AVAILABILITY_MISSING,
    REASON_NOT_AVAILABLE_AT_CUTOFF,
    REASON_STALE,
    ActivationPlan,
    GateResult,
    OperationalEvidence,
    OperationalEvidenceStore,
    ReadinessInputs,
    ReadinessResult,
    ReadinessSpecification,
    build_readiness_result,
    derive_readiness_status,
    freshness_status,
    readiness_specification_v1,
)

CUTOFF = "2026-06-01T00:00:00.000000Z"
FRESH = "2026-05-31T12:00:00.000000Z"          # within every family window
SPEC = readiness_specification_v1(CUTOFF)


# ── contracted per-family content ─────────────────────────────────────────────
def _reg():
    return {"suite_ids": ["c1", "c2", "c3"], "passed": 900, "failed": 0, "target_commit_hash": "abc"}


def _si():
    return {"store_path_id": "s", "record_count": 1000, "jsonl_hash": "h"}


def _fi():
    return {"feed_pickle_forbidden_symbols_absent": True, "no_production_write_path": True}


def _rb(requires_migration=False):
    return {"one_step_off": True, "requires_migration": requires_migration,
            "cache_compatible": True, "event_compatible": True}


def _dep():
    return {"deploy_procedure_id": "d", "rollback_flag_present": True}


def _cfg(active_downgraded):
    return {"materiality_mode": "active", "evaluation_flag": True, "activation_flag": True,
            "effective_mode": ("shadow" if active_downgraded else "active")}


def _opev(family, content, available_at=FRESH):
    return OperationalEvidence(OPERATIONAL_EVIDENCE_SCHEMA_VERSION, family, "ci", "v1", content,
                              evidence_available_at=available_at, generated_at=available_at)


def _op_all(*, active_downgraded=False, requires_migration=False):
    return {
        "storage_integrity": _opev("storage_integrity", _si()),
        "regression": _opev("regression", _reg()),
        "failure_isolation": _opev("failure_isolation", _fi()),
        "configuration_snapshot": _opev("configuration_snapshot", _cfg(active_downgraded)),
        "rollback": _opev("rollback", _rb(requires_migration)),
        "deployment": _opev("deployment", _dep()),
    }


def _plan():
    return ActivationPlan(
        configuration_change="set materiality_mode=active + separate activation flag",
        required_feature_flag="materiality_active", required_engine_version="e1",
        required_policy_version="p1", required_rollback_flag="materiality_mode=off",
        canary_scope="1% cohort", monitoring_requirements=("error_rate", "latency"),
        stop_conditions=("error_rate>1%",), rollback_procedure="set materiality_mode=off",
        post_activation_verification="verify feed unchanged", approvals_required=("founder",))


def _inputs(*, cal=True, thr=True, base=True, active_downgraded=False, requires_migration=False):
    return ReadinessInputs(
        c1_dataset_present=True, c1_sample_sufficient=True,
        c2_calibration_measured_accepted=cal, c3_supported_accepted=thr, baseline_lawful=base,
        op_evidence=_op_all(active_downgraded=active_downgraded, requires_migration=requires_migration),
        source_artifacts=(("c2res_x", "hx"), ("c3rec_y", "hy")), activation_plan=_plan())


# ── OperationalEvidence identity + schema ─────────────────────────────────────

def test_opev_identity_content_derived():
    a = _opev("regression", _reg())
    b = OperationalEvidence(OPERATIONAL_EVIDENCE_SCHEMA_VERSION, "regression", "ci", "v1", _reg(),
                            evidence_available_at="2030-01-01T00:00:00.000000Z",
                            generated_at="2030-01-01T00:00:00.000000Z", metadata="notes")
    assert a.operational_evidence_id == b.operational_evidence_id   # availability/metadata NON-identity
    c = _opev("regression", {**_reg(), "passed": 1})
    assert c.operational_evidence_id != a.operational_evidence_id   # content-sensitive


def test_opev_unknown_family_rejected():
    with pytest.raises(ValueError):
        OperationalEvidence(OPERATIONAL_EVIDENCE_SCHEMA_VERSION, "bogus", "ci", "v1", {})


@pytest.mark.parametrize("family,content", [
    ("rollback", {"one_step_off": True}),                                    # missing keys
    ("rollback", {**_rb(), "extra": 1}),                                     # extra key
    ("rollback", {**_rb(), "one_step_off": "yes"}),                          # wrong type
    ("configuration_snapshot", {"materiality_mode": "active", "evaluation_flag": 1,
                                "activation_flag": True, "effective_mode": "active"}),  # bool≠int
    ("regression", {"suite_ids": [1], "passed": 1, "failed": 0, "target_commit_hash": "x"}),  # list not str
    ("storage_integrity", {"store_path_id": "s", "record_count": "1000", "jsonl_hash": "h"}),  # wrong type
])
def test_family_content_schema_rejected(family, content):
    with pytest.raises(ValueError):
        _opev(family, content)


# ── OperationalEvidenceStore authority ────────────────────────────────────────

def _store(tmp_path, when="2026-05-31T12:00:00.000000Z"):
    from datetime import datetime, timezone
    clk = datetime.fromisoformat(when.replace("Z", "+00:00")).astimezone(timezone.utc)
    return OperationalEvidenceStore(tmp_path / "oe", clock=lambda: clk)


def _accept(store, family="regression", content=None):
    return store.accept(schema_version=OPERATIONAL_EVIDENCE_SCHEMA_VERSION, artifact_family=family,
                        producer_identity="ci", producer_version="v1",
                        content=content if content is not None else _reg())


def test_store_accept_has_no_availability_argument():
    params = inspect.signature(OperationalEvidenceStore.accept).parameters
    assert "evidence_available_at" not in params
    assert not any(p.kind == inspect.Parameter.VAR_KEYWORD for p in params.values())


def test_store_assigns_availability_once_and_idempotent(tmp_path):
    from datetime import datetime, timezone
    store = _store(tmp_path)
    ev1 = _accept(store)
    assert ev1.evidence_available_at == "2026-05-31T12:00:00.000000Z"
    store2 = OperationalEvidenceStore(tmp_path / "oe",
                                      clock=lambda: datetime(2099, 1, 1, tzinfo=timezone.utc))
    ev2 = _accept(store2)                       # identical retry, clock moved
    assert ev2.evidence_available_at == ev1.evidence_available_at   # ORIGINAL preserved
    assert ev2.operational_evidence_id == ev1.operational_evidence_id


def test_store_rejects_restamp(tmp_path):
    store = _store(tmp_path)
    ev = _accept(store)
    row = {"operational_evidence_id": ev.operational_evidence_id, "schema_version": ev.schema_version,
           "artifact_family": ev.artifact_family, "producer_identity": ev.producer_identity,
           "producer_version": ev.producer_version, "content": ev.content,
           "evidence_available_at": "2020-01-01T00:00:00.000000Z",
           "generated_at": "2020-01-01T00:00:00.000000Z", "metadata": ""}
    with open(store.path, "a", encoding="utf-8") as fh:
        fh.write(json.dumps(row) + "\n")
    with pytest.raises(ValueError):
        OperationalEvidenceStore(tmp_path / "oe")               # same id, different availability


def test_store_rejects_id_tamper(tmp_path):
    store = _store(tmp_path)
    ev = _accept(store, family="rollback", content=_rb())
    tampered = {"operational_evidence_id": ev.operational_evidence_id,
                "schema_version": ev.schema_version, "artifact_family": ev.artifact_family,
                "producer_identity": ev.producer_identity, "producer_version": ev.producer_version,
                "content": _rb(requires_migration=True),        # schema-valid but different content
                "evidence_available_at": ev.evidence_available_at,
                "generated_at": ev.evidence_available_at, "metadata": ""}
    with open(store.path, "w", encoding="utf-8") as fh:
        fh.write(json.dumps(tampered) + "\n")
    with pytest.raises(ValueError):
        OperationalEvidenceStore(tmp_path / "oe")               # id no longer matches content


def test_store_rejects_schema_tampered_family_content(tmp_path):
    store = _store(tmp_path)
    ev = _accept(store, family="rollback", content=_rb())
    bad = {"operational_evidence_id": ev.operational_evidence_id, "schema_version": ev.schema_version,
           "artifact_family": ev.artifact_family, "producer_identity": ev.producer_identity,
           "producer_version": ev.producer_version, "content": {"one_step_off": True},  # missing fields
           "evidence_available_at": ev.evidence_available_at,
           "generated_at": ev.evidence_available_at, "metadata": ""}
    with open(store.path, "w", encoding="utf-8") as fh:
        fh.write(json.dumps(bad) + "\n")
    with pytest.raises(ValueError):
        OperationalEvidenceStore(tmp_path / "oe")


# ── Freshness (visibility vs recency), inclusive boundaries ───────────────────

def test_freshness_after_cutoff_is_not_available():
    ev = _opev("regression", _reg(), available_at="2026-06-02T00:00:00.000000Z")
    assert freshness_status(ev, "regression", CUTOFF, SPEC) == \
        ("insufficient", REASON_NOT_AVAILABLE_AT_CUTOFF)


def test_freshness_old_but_visible_is_stale():
    ev = _opev("regression", _reg(), available_at="2026-05-01T00:00:00.000000Z")  # >7d, but visible
    assert freshness_status(ev, "regression", CUTOFF, SPEC) == ("insufficient", REASON_STALE)


def test_freshness_inclusive_boundaries():
    on_cutoff = _opev("regression", _reg(), available_at=CUTOFF)
    assert freshness_status(on_cutoff, "regression", CUTOFF, SPEC)[0] == "eligible"
    on_age = _opev("regression", _reg(), available_at="2026-05-25T00:00:00.000000Z")  # cutoff - 7d
    assert freshness_status(on_age, "regression", CUTOFF, SPEC)[0] == "eligible"


def test_freshness_missing_availability_is_invalid():
    ev = _opev("regression", _reg(), available_at=None)
    assert freshness_status(ev, "regression", CUTOFF, SPEC) == ("invalid", REASON_AVAILABILITY_MISSING)


def test_freshness_duration_change_changes_specification_id():
    alt = ReadinessSpecification(
        specification_version="rdspec-c4-v1", as_of_cutoff=CUTOFF,
        required_c2_families_statuses=SPEC.required_c2_families_statuses,
        required_c3_statuses=SPEC.required_c3_statuses,
        operational_evidence_freshness={**SPEC.operational_evidence_freshness, "regression": 1})
    assert alt.readiness_specification_id != SPEC.readiness_specification_id


# ── Cutoff is identity-bearing and never overridable ──────────────────────────

def test_cutoff_change_changes_specification_id():
    s1 = readiness_specification_v1("2026-06-01T00:00:00.000000Z")
    s2 = readiness_specification_v1("2026-07-01T00:00:00.000000Z")
    assert s1.readiness_specification_id != s2.readiness_specification_id


def test_build_has_no_cutoff_override_argument():
    params = inspect.signature(build_readiness_result).parameters
    assert "as_of_cutoff" not in params                          # cutoff comes only from the spec


def test_spec_requires_valid_cutoff():
    with pytest.raises(Exception):
        readiness_specification_v1("")


# ── Status derivation (all five reachable) ────────────────────────────────────

def _gr(key, status, blocking=True):
    return GateResult("rdgate_" + key, key, "cat", status, "", blocking, ())


def test_derive_status_all_gate_derived_states():
    assert derive_readiness_status((_gr("A", GATE_PASS), _gr("B", GATE_PASS))) == "ready"
    assert derive_readiness_status((_gr("A", GATE_PASS), _gr("B", GATE_FAIL))) == "blocked"
    assert derive_readiness_status((_gr("A", GATE_PASS), _gr("B", GATE_INSUFFICIENT))) == "insufficient_evidence"
    assert derive_readiness_status((_gr("A", GATE_PASS), _gr("B", "not_applicable"))) == "not_ready"


# ── Full pipeline fixtures ────────────────────────────────────────────────────

def test_ready_fixture():
    r = build_readiness_result(SPEC, _inputs())
    assert r.readiness_status == "ready"
    assert r.blocking_prerequisites == ()
    assert all(g["status"] == GATE_PASS for g in r.gate_results if g["blocking"])
    assert r.advisory is True


def test_current_engine_is_insufficient_evidence_with_exact_prerequisites():
    r = build_readiness_result(SPEC, _inputs(cal=False, thr=False, base=False, active_downgraded=True))
    assert r.readiness_status == "insufficient_evidence"
    keys = {p["source_gate_key"] for p in r.blocking_prerequisites}
    assert keys == {"CAL-1", "THR-1", "BASE-1", "CFG-1"}          # exactly these, none dropped
    for p in r.blocking_prerequisites:
        assert p["remediation_status"] == "not_started" and p["blocking"] is True


def test_blocked_fixture():
    r = build_readiness_result(SPEC, _inputs(requires_migration=True))
    assert r.readiness_status == "blocked"                        # RBK-1 fail
    assert any(p["source_gate_key"] == "RBK-1" for p in r.blocking_prerequisites)


def test_invalid_on_missing_availability():
    inp = _inputs()
    inp.op_evidence["configuration_snapshot"] = _opev("configuration_snapshot", _cfg(False),
                                                      available_at=None)
    r = build_readiness_result(SPEC, inp)
    assert r.readiness_status == "invalid"


def test_stale_evidence_cannot_pass_blocking_gate():
    inp = _inputs()
    inp.op_evidence["rollback"] = _opev("rollback", _rb(), available_at="2026-01-01T00:00:00.000000Z")
    r = build_readiness_result(SPEC, inp)
    rbk = next(g for g in r.gate_results if g["gate_key"] == "RBK-1")
    assert rbk["status"] == GATE_INSUFFICIENT and rbk["reason"] == REASON_STALE
    assert r.readiness_status == "insufficient_evidence"


# ── Determinism / safety ──────────────────────────────────────────────────────

def test_readiness_result_id_deterministic_and_clock_invariant():
    a = build_readiness_result(SPEC, _inputs(), generated_at="2026-01-01T00:00:00.000000Z")
    b = build_readiness_result(SPEC, _inputs(), generated_at="2099-09-09T00:00:00.000000Z")
    assert a.readiness_result_id == b.readiness_result_id        # generated_at excluded


def test_ready_with_prerequisite_is_rejected():
    with pytest.raises(ValueError):
        ReadinessResult(
            result_schema_version="rdres-1", readiness_specification_id="rdspec_x",
            as_of_cutoff=CUTOFF, source_artifact_ids=(), source_artifact_hashes=(),
            consumed_operational_evidence=(),
            gate_results=({"gate_key": "X", "status": GATE_FAIL, "blocking": True},),
            readiness_status="ready", blocking_prerequisites=({"source_gate_key": "X"},),
            non_blocking_warnings=(), activation_plan_reference=None,
            configuration_verification_results={}, rollback_verification_results={})


def test_activation_plan_identity_field_split():
    base = _plan()
    same = ActivationPlan(
        configuration_change=base.configuration_change, required_feature_flag=base.required_feature_flag,
        required_engine_version=base.required_engine_version,
        required_policy_version=base.required_policy_version,
        required_rollback_flag=base.required_rollback_flag, canary_scope=base.canary_scope,
        monitoring_requirements=base.monitoring_requirements, stop_conditions=base.stop_conditions,
        rollback_procedure=base.rollback_procedure,
        post_activation_verification=base.post_activation_verification,
        approvals_required=("someone_else",), metadata="different")      # NON-identity
    assert same.activation_plan_id == base.activation_plan_id
    changed = ActivationPlan(
        configuration_change=base.configuration_change, required_feature_flag=base.required_feature_flag,
        required_engine_version=base.required_engine_version,
        required_policy_version=base.required_policy_version,
        required_rollback_flag=base.required_rollback_flag, canary_scope=base.canary_scope,
        monitoring_requirements=base.monitoring_requirements,
        stop_conditions=("new_stop",),                                    # IDENTITY
        rollback_procedure=base.rollback_procedure,
        post_activation_verification=base.post_activation_verification)
    assert changed.activation_plan_id != base.activation_plan_id


def test_c4_no_activation_or_write_helper():
    import app.materiality_readiness as r
    names = [n for n in dir(r) if callable(getattr(r, n))]
    assert [n for n in names if any(k in n.lower()
            for k in ("activate", "write_config", "apply_threshold", "mutate", "deploy_now"))] == []


def test_c4_not_imported_by_production():
    import subprocess
    out = subprocess.run(["grep", "-rln", "materiality_readiness", "app/", "--include=*.py"],
                         capture_output=True, text=True)
    hits = [ln for ln in out.stdout.splitlines() if not ln.endswith("materiality_readiness.py")]
    assert hits == []
