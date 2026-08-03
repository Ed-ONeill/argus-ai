"""Wave 0.3 C1 regression suite: deterministic, immutable shadow evaluation."""

from __future__ import annotations

import dataclasses
import itertools
import json
import pickle
from datetime import datetime, timedelta, timezone

import pytest

from app.materiality import (
    MaterialityAssessment,
    MaterialityShadowResult,
    MaterialityState,
    ReasonCode,
)
from app.materiality_evaluation import (
    ENGINE_VERSION,
    FEATURE_EXTRACTOR_VERSION,
    INPUT_SCHEMA_VERSION,
    MATERIALITY_INPUT_MANIFEST,
    OBSERVATION_IDENTITY_SCHEMA_VERSION,
    OUTCOME_SPECIFICATION_VERSION,
    CanonicalizationError,
    DatasetSpecification,
    EngineInputManifest,
    EVALUATION_DIAGNOSTICS,
    EvaluationError,
    EvaluationDiagnostics,
    EvaluationReason,
    EvaluationRecordRevision,
    EvaluationRevisionDraft,
    EvaluationStore,
    ManifestField,
    ManifestValidationError,
    OutcomePayload,
    OutcomeValidationError,
    ReplayMismatchError,
    ReplayRegistry,
    ReplayUnavailableError,
    RevisionChainError,
    RevisionConflictError,
    ShadowEvaluationCapture,
    attach_outcome,
    canonical_json_bytes,
    canonical_observation_payload,
    generate_dataset,
    initial_revision_draft,
    observation_id,
    replay,
    record_diagnostic,
    utc_timestamp,
    validate_observation_id,
)

T0 = datetime(2026, 8, 2, 12, 0, 0, 123456, tzinfo=timezone.utc)
T1 = T0 + timedelta(days=1)
T2 = T0 + timedelta(days=2)


class Clock:
    def __init__(self, *values: datetime) -> None:
        self.values = list(values)
        self.last = values[-1] if values else T0

    def __call__(self) -> datetime:
        if self.values:
            self.last = self.values.pop(0)
        return self.last


def _assessment(eid="c1", uid=None, *, first_seen=T0.isoformat(), reasons=None):
    return MaterialityAssessment(
        state=MaterialityState.UNRESOLVED,
        policy_version="umc-0.1.0-uncalibrated",
        event_id=eid,
        contributing_ids=(eid,),
        event_uid=uid,
        contributing_event_uids=((uid,) if uid else ()),
        event_type="macro",
        corroboration_count=2,
        best_evidence_tier=1,
        mandatory_class=True,
        inputs_present=("corroboration", "event_class", "mandatory_class"),
        first_seen=first_seen,
        editorial_score=42.5,
        source_count=2,
        reasons=tuple(reasons or (
            ReasonCode("event_class", "class=macro", True),
            ReasonCode("magnitude", "excluded", False),
        )),
    )


def _identity(**overrides):
    payload = {
        "observation_identity_schema_version": OBSERVATION_IDENTITY_SCHEMA_VERSION,
        "source_system_namespace": "argus",
        "cycle_id": "cycle-1",
        "observation_stage": "qualified_pre_admission",
        "cycle_local_event_id": "c1",
        "durable_event_uid": None,
        "contributing_ids": ["c1"],
        "contributing_event_uids": [],
    }
    payload.update(overrides)
    return payload


def _draft(assessment=None, **kwargs):
    return initial_revision_draft(
        assessment or _assessment(),
        observation_stage=kwargs.pop("observation_stage", "qualified_pre_admission"),
        cycle_id=kwargs.pop("cycle_id", "cycle-1"),
        source_system_namespace=kwargs.pop("source_system_namespace", "argus"),
        decision_completed_at=kwargs.pop("decision_completed_at", T0),
        **kwargs,
    )


def _record(draft: EvaluationRevisionDraft, available_at: datetime) -> EvaluationRecordRevision:
    names = {f.name for f in dataclasses.fields(EvaluationRevisionDraft)}
    return EvaluationRecordRevision(
        **{name: getattr(draft, name) for name in names},
        available_at=utc_timestamp(available_at),
    )


def _successor(record, *, status="resolved", evaluation_status="eligible",
               outcome_json=None, sequence=None):
    if outcome_json is None:
        outcome_json = canonical_json_bytes(
            dataclasses.asdict(_resolved_outcome())).decode("utf-8")
    names = {f.name for f in dataclasses.fields(EvaluationRevisionDraft)}
    values = {name: getattr(record, name) for name in names}
    values.update(
        supersedes_revision_id=record.revision_id,
        revision_sequence=record.revision_sequence + 1 if sequence is None else sequence,
        record_created_at=utc_timestamp(T1),
        outcome_status=status,
        outcome_json=outcome_json,
        evaluation_status=evaluation_status,
        status_reason_code=None,
    )
    return EvaluationRevisionDraft(**values)


def _resolved_outcome(**overrides):
    values = dict(
        status="resolved",
        outcome_specification_version=OUTCOME_SPECIFICATION_VERSION,
        target_identifier="SPY",
        horizon_at=utc_timestamp(T1),
        resolved_at=utc_timestamp(T1),
        information_available_at=utc_timestamp(T1),
        unit="return",
        label=True,
        observed_return="0.02",
        source_ids=("prices:SPY",),
        methodology_id="outcome-fixture-1",
    )
    values.update(overrides)
    return OutcomePayload(**values)


def _outcome_ready_draft():
    return dataclasses.replace(
        _draft(),
        outcome_target="SPY",
        outcome_horizon_at=utc_timestamp(T1),
        outcome_unit="return",
        outcome_specification_version=OUTCOME_SPECIFICATION_VERSION,
    )


def _spec(cutoff=T2, stage="qualified_pre_admission", statuses=("eligible", "scored")):
    stages = stage if isinstance(stage, tuple) else (stage,)
    return DatasetSpecification(
        specification_version="dataset-spec-1",
        as_of_cutoff=utc_timestamp(cutoff),
        observation_stages=stages,
        engine_versions=(ENGINE_VERSION,),
        policy_versions=("umc-0.1.0-uncalibrated",),
        input_schema_versions=(INPUT_SCHEMA_VERSION,),
        feature_extractor_versions=(FEATURE_EXTRACTOR_VERSION,),
        outcome_specification_versions=(OUTCOME_SPECIFICATION_VERSION,),
        allowed_evaluation_statuses=statuses,
    )


# ── Canonical observation identity ───────────────────────────────────────────

def test_observation_id_pinned_literal_and_shape():
    oid = observation_id(_identity())
    assert oid == "obs_858aa1b9030b805270a7c010658e9bd044633b136211338b7180e64ac3978c05"
    validate_observation_id(oid)
    assert len(oid) == 68 and oid[4:] == oid[4:].lower()


def test_independent_jcs_control_and_unicode_vectors():
    assert canonical_json_bytes({"s": "\b\t\n\f\r\x00\x1f"}) == (
        b'{"s":"\\b\\t\\n\\f\\r\\u0000\\u001f"}')
    assert canonical_json_bytes({"s": "e\u0301"}) == b'{"s":"\xc3\xa9"}'
    assert canonical_json_bytes({"\ue000": 2, "\U0001f600": 1}) == (
        b'{"\xf0\x9f\x98\x80":1,"\xee\x80\x80":2}')
    assert canonical_json_bytes({"n": None, "a": []}) == b'{"a":[],"n":null}'


def test_independent_contributor_utf8_order_vector():
    payload = canonical_observation_payload(_identity(
        contributing_ids=["\u00e9", "z", "e\u0301"],
        contributing_event_uids=[],
    ))
    expected = (
        b'{"contributing_event_uids":[],"contributing_ids":["z","\xc3\xa9"],'
        b'"cycle_id":"cycle-1","cycle_local_event_id":"c1",'
        b'"durable_event_uid":null,'
        b'"observation_identity_schema_version":"materiality-observation-1",'
        b'"observation_stage":"qualified_pre_admission",'
        b'"source_system_namespace":"argus"}'
    )
    assert canonical_json_bytes(payload) == expected


def test_observation_identity_order_duplicates_and_source_format_invariant():
    one = _identity(contributing_ids=["z", "a", "a"], contributing_event_uids=["u2", "u1"])
    two = {key: one[key] for key in reversed(tuple(one))}
    two["contributing_ids"] = ["a", "z"]
    two["contributing_event_uids"] = ["u1", "u2", "u1"]
    assert observation_id(one) == observation_id(two)


def test_observation_identity_nfc_before_dedup_and_sort():
    composed = _identity(contributing_ids=["café"])
    decomposed = _identity(contributing_ids=["cafe\u0301", "café"])
    assert observation_id(composed) == observation_id(decomposed)
    assert canonical_observation_payload(decomposed)["contributing_ids"] == ["café"]


@pytest.mark.parametrize("field", (
    "observation_identity_schema_version", "source_system_namespace", "cycle_id",
    "observation_stage", "cycle_local_event_id", "durable_event_uid",
    "contributing_ids", "contributing_event_uids",
))
def test_observation_identity_rejects_every_omitted_field(field):
    payload = _identity()
    payload.pop(field)
    with pytest.raises(EvaluationError):
        observation_id(payload)


def test_explicit_null_valid_and_omission_invalid():
    assert observation_id(_identity(durable_event_uid=None)).startswith("obs_")
    omitted = _identity()
    omitted.pop("durable_event_uid")
    with pytest.raises(EvaluationError):
        observation_id(omitted)


def test_every_included_identity_field_is_sensitive_and_excluded_fields_rejected():
    base = observation_id(_identity())
    changes = {
        "observation_identity_schema_version": "v2",
        "source_system_namespace": "other",
        "cycle_id": "cycle-2",
        "observation_stage": "canonical_post_identity",
        "cycle_local_event_id": "c2",
        "durable_event_uid": "ev_1",
        "contributing_ids": ["c1", "c2"],
        "contributing_event_uids": ["ev_1"],
    }
    assert all(observation_id(_identity(**{key: value})) != base for key, value in changes.items())
    with pytest.raises(EvaluationError, match="prohibited"):
        observation_id({**_identity(), "engine_version": "new"})


def test_normalization_created_object_key_collision_rejected():
    with pytest.raises(CanonicalizationError, match="collision"):
        canonical_json_bytes({"café": 1, "cafe\u0301": 2})


@pytest.mark.parametrize("bad", (
    "OBS_" + "a" * 64,
    "obs_" + "A" * 64,
    "obs_" + "z" * 64,
    "obs_abc",
    "b2JzZXJ2YXRpb24=",
))
def test_invalid_observation_id_encodings_rejected(bad):
    with pytest.raises(EvaluationError):
        validate_observation_id(bad)


# ── Manifest, record immutability, and append-only storage ───────────────────

def test_manifest_accepts_complete_snapshot_and_rejects_missing_wrong_or_float():
    snapshot = json.loads(MATERIALITY_INPUT_MANIFEST.normalize_snapshot(
        json.loads(_draft().input_snapshot_json)))
    assert MATERIALITY_INPUT_MANIFEST.normalize_snapshot(snapshot) == _draft().input_snapshot_json
    missing = dict(snapshot)
    missing.pop("event_type")
    with pytest.raises(ManifestValidationError):
        MATERIALITY_INPUT_MANIFEST.normalize_snapshot(missing)
    wrong = dict(snapshot, corroboration_count="2")
    with pytest.raises(ManifestValidationError):
        MATERIALITY_INPUT_MANIFEST.normalize_snapshot(wrong)
    floating = dict(snapshot, source_evidence={"score": 0.5})
    with pytest.raises(CanonicalizationError):
        MATERIALITY_INPUT_MANIFEST.normalize_snapshot(floating)


def test_wrong_manifest_snapshot_rejected():
    wrong = EngineInputManifest(
        ENGINE_VERSION, "wrong",
        MATERIALITY_INPUT_MANIFEST.fields + (ManifestField("new_required", "string"),),
    )
    with pytest.raises(ManifestValidationError):
        wrong.normalize_snapshot(json.loads(_draft().input_snapshot_json))


@pytest.mark.parametrize(("field", "value", "message"), (
    ("engine_version", "unregistered", "engine"),
    ("manifest_version", "wrong", "manifest_version"),
    ("manifest_hash", "manifest_" + "0" * 64, "manifest hash"),
    ("input_schema_version", "wrong", "input_schema_version"),
    ("feature_extractor_version", "wrong", "feature_extractor_version"),
    ("observation_id", "obs_" + "0" * 64, "observation_id"),
    ("evaluation_id", "eval_" + "0" * 64, "evaluation_id"),
    ("input_hash", "input_" + "0" * 64, "input snapshot hash"),
))
def test_store_rejects_incoherent_canonical_record_fields(tmp_path, field, value, message):
    draft = dataclasses.replace(_draft(), **{field: value})
    with pytest.raises(EvaluationError, match=message):
        EvaluationStore(tmp_path, clock=Clock(T0)).append(draft)


def test_store_rejects_wrong_persisted_revision_id(tmp_path):
    store = EvaluationStore(tmp_path, clock=Clock(T0))
    record = store.append(_draft())
    payload = json.loads(store.path.read_text(encoding="utf-8"))
    payload["revision_id"] = "rev_" + "0" * 64
    store.path.write_text(json.dumps(payload) + "\n", encoding="utf-8")
    with pytest.raises(RevisionConflictError, match="revision_id"):
        EvaluationStore(tmp_path)
    assert record.revision_id != payload["revision_id"]


def test_store_rejects_noncanonical_observation_fields(tmp_path):
    draft = dataclasses.replace(_draft(), contributing_ids=("z", "a"))
    with pytest.raises(EvaluationError, match="identity fields"):
        EvaluationStore(tmp_path, clock=Clock(T0)).append(draft)


def test_initial_record_is_immutable_absent_values_remain_absent(tmp_path):
    store = EvaluationStore(tmp_path, clock=Clock(T0))
    record = store.append(_draft())
    assert record.revision_sequence == 0 and record.supersedes_revision_id is None
    assert record.outcome_status == record.evaluation_status == "pending"
    assert record.decision_confidence is None and record.expected_return_json is None
    assert record.outcome_specification_version == OUTCOME_SPECIFICATION_VERSION
    with pytest.raises(dataclasses.FrozenInstanceError):
        record.evaluation_status = "eligible"  # type: ignore[misc]
    with pytest.raises(TypeError):
        record.reasons[0] = EvaluationReason("x", "y", True)  # type: ignore[index]


def test_evidence_identifiers_reject_objects_and_bytes_without_coercion():
    calls = {"str": 0, "repr": 0}

    class RuntimeDependent:
        def __str__(self):
            calls["str"] += 1
            return f"object-at-{id(self)}"

        def __repr__(self):
            calls["repr"] += 1
            return f"RuntimeDependent({id(self)})"

    with pytest.raises(EvaluationError, match="must be strings"):
        _draft(evidence_ids=(RuntimeDependent(),))
    with pytest.raises(EvaluationError, match="must be strings"):
        _draft(evidence_ids=(b"bytes",))
    assert calls == {"str": 0, "repr": 0}


def test_valid_evidence_identifiers_are_nfc_deduplicated_and_deterministic():
    one = _draft(evidence_ids=("cafe\u0301", "z", "caf\u00e9"))
    two = _draft(evidence_ids=("caf\u00e9", "z"))
    assert one.evidence_ids == two.evidence_ids == ("caf\u00e9", "z")
    assert one.revision_id == two.revision_id


def test_append_read_idempotence_and_storage_assigned_availability(tmp_path):
    clock = Clock(T0, T1)
    store = EvaluationStore(tmp_path, clock=clock)
    draft = _draft()
    first = store.append(draft)
    second = store.append(dataclasses.replace(draft, record_created_at=utc_timestamp(T1)))
    assert first == second
    assert first.available_at == utc_timestamp(T0)
    reopened = EvaluationStore(tmp_path)
    assert reopened.get(first.revision_id) == first
    with pytest.raises(RevisionConflictError):
        store.append(first)  # type: ignore[arg-type]  # callers cannot supply available_at


def test_successor_predecessor_sequence_and_availability_validation(tmp_path):
    store = EvaluationStore(tmp_path, clock=Clock(T1, T0))
    root = store.append(_draft())
    successor = _successor(root)
    with pytest.raises(RevisionChainError, match="available_at"):
        store.append(successor)
    missing = dataclasses.replace(successor, supersedes_revision_id="rev_missing")
    with pytest.raises(RevisionChainError, match="does not exist"):
        EvaluationStore(tmp_path / "other", clock=Clock(T2)).append(missing)
    wrong_sequence = dataclasses.replace(successor, revision_sequence=9)
    with pytest.raises(RevisionChainError, match="increment"):
        EvaluationStore(tmp_path, clock=Clock(T2)).append(wrong_sequence)


def test_successor_cannot_change_decision_fields(tmp_path):
    store = EvaluationStore(tmp_path, clock=Clock(T0, T1))
    root = store.append(_draft())
    changed = dataclasses.replace(_successor(root), shadow_decision="universal")
    with pytest.raises(RevisionChainError, match="immutable"):
        store.append(changed)


def test_storage_rejects_a_conflicting_direct_successor(tmp_path):
    store = EvaluationStore(tmp_path, clock=Clock(T0, T1, T2))
    root = store.append(_draft())
    one = _successor(
        root,
        outcome_json=canonical_json_bytes(
            dataclasses.asdict(_resolved_outcome())).decode("utf-8"),
    )
    two = _successor(
        root,
        outcome_json=canonical_json_bytes(
            dataclasses.asdict(_resolved_outcome(observed_return="0.03"))).decode("utf-8"),
    )
    store.append(one)
    with pytest.raises(RevisionConflictError, match="fork"):
        store.append(two)


# ── Replay ───────────────────────────────────────────────────────────────────

def test_replay_byte_identical_and_source_record_unchanged(tmp_path):
    record = EvaluationStore(tmp_path, clock=Clock(T0)).append(_draft())
    before = pickle.dumps(record)
    one = replay(record)
    two = replay(record)
    assert one.canonical_bytes() == two.canonical_bytes()
    assert pickle.dumps(record) == before


def test_replay_reason_permutation_is_canonical(tmp_path):
    reasons = (
        ReasonCode("z", "last", False),
        ReasonCode("a", "first", True),
    )
    a = EvaluationStore(tmp_path / "a", clock=Clock(T0)).append(_draft(_assessment(reasons=reasons)))
    b = EvaluationStore(tmp_path / "b", clock=Clock(T0)).append(
        _draft(_assessment(reasons=tuple(reversed(reasons)))))
    assert a.input_snapshot_json == b.input_snapshot_json
    assert replay(a).canonical_bytes() == replay(b).canonical_bytes()


def test_replay_unavailable_version_never_substitutes_current(tmp_path):
    record = EvaluationStore(tmp_path, clock=Clock(T0)).append(_draft())
    with pytest.raises(ReplayUnavailableError):
        replay(record, ReplayRegistry())


def test_replay_rejects_manifest_drift_and_output_drift(tmp_path):
    record = EvaluationStore(tmp_path, clock=Clock(T0)).append(_draft())
    malformed = dataclasses.replace(record, input_snapshot_json=record.input_snapshot_json + " ")
    with pytest.raises(ManifestValidationError):
        replay(malformed)
    changed = dataclasses.replace(record, shadow_decision="universal")
    with pytest.raises(ReplayMismatchError):
        replay(changed)


# ── Outcomes ─────────────────────────────────────────────────────────────────

def test_resolved_outcome_creates_eligible_successor_and_preserves_original(tmp_path):
    store = EvaluationStore(tmp_path, clock=Clock(T0, T1))
    root = store.append(_outcome_ready_draft())
    successor = attach_outcome(store, root.revision_id, _resolved_outcome(), created_at=T1)
    assert successor.revision_sequence == 1 and successor.supersedes_revision_id == root.revision_id
    assert successor.outcome_status == "resolved" and successor.evaluation_status == "eligible"
    assert store.get(root.revision_id) == root
    assert root.outcome_status == root.evaluation_status == "pending"


def test_outcome_attachment_idempotence_and_conflict(tmp_path):
    store = EvaluationStore(tmp_path, clock=Clock(T0, T1, T2))
    root = store.append(_outcome_ready_draft())
    outcome = _resolved_outcome()
    one = attach_outcome(store, root.revision_id, outcome, created_at=T1)
    two = attach_outcome(store, root.revision_id, outcome, created_at=T2)
    assert one == two
    with pytest.raises(RevisionConflictError):
        attach_outcome(store, root.revision_id,
                       _resolved_outcome(observed_return="0.03"), created_at=T2)


def test_outcome_identity_normalizes_set_like_provenance():
    one = _resolved_outcome(source_ids=("z", "a", "a"), quality_flags=("q2", "q1"))
    two = _resolved_outcome(source_ids=("a", "z"), quality_flags=("q1", "q2", "q1"))
    assert one == two
    assert one.outcome_id == two.outcome_id


@pytest.mark.parametrize("status", ("invalidated", "unavailable"))
def test_invalidated_and_unavailable_are_excluded_not_negative(tmp_path, status):
    store = EvaluationStore(tmp_path, clock=Clock(T0, T1))
    root = store.append(_outcome_ready_draft())
    result = attach_outcome(store, root.revision_id, OutcomePayload(
        status=status,
        outcome_specification_version=OUTCOME_SPECIFICATION_VERSION,
        reason_code=f"{status}_fixture",
    ), created_at=T1)
    assert result.evaluation_status == "excluded"
    assert result.outcome_status == status
    assert result.status_reason_code == f"{status}_fixture"


def test_outcome_mismatch_early_resolution_and_future_leakage_rejected(tmp_path):
    store = EvaluationStore(tmp_path, clock=Clock(T0))
    root = store.append(_outcome_ready_draft())
    with pytest.raises(OutcomeValidationError, match="target"):
        attach_outcome(store, root.revision_id,
                       _resolved_outcome(target_identifier="QQQ"), created_at=T1)
    with pytest.raises(OutcomeValidationError, match="horizon"):
        attach_outcome(store, root.revision_id,
                       _resolved_outcome(horizon_at=utc_timestamp(T2)), created_at=T1)
    with pytest.raises(OutcomeValidationError, match="unit"):
        attach_outcome(store, root.revision_id,
                       _resolved_outcome(unit="price"), created_at=T1)
    with pytest.raises(OutcomeValidationError, match="specification"):
        attach_outcome(store, root.revision_id,
                       _resolved_outcome(outcome_specification_version="other"), created_at=T1)
    with pytest.raises(OutcomeValidationError, match="before"):
        attach_outcome(store, root.revision_id,
                       _resolved_outcome(resolved_at=utc_timestamp(T0)), created_at=T1)
    with pytest.raises(OutcomeValidationError, match="future"):
        attach_outcome(store, root.revision_id,
                       _resolved_outcome(information_available_at=utc_timestamp(T2)), created_at=T1)


def test_storage_rejects_eligible_initial_revision(tmp_path):
    with pytest.raises(OutcomeValidationError, match="initial revision"):
        EvaluationStore(tmp_path, clock=Clock(T0)).append(
            dataclasses.replace(_draft(), evaluation_status="eligible"))


def test_storage_rejects_empty_or_malformed_resolved_outcome(tmp_path):
    store = EvaluationStore(tmp_path, clock=Clock(T0, T1, T2))
    root = store.append(_draft())
    with pytest.raises(OutcomeValidationError, match="malformed|complete"):
        store.append(_successor(root, outcome_json="{}"))
    malformed = canonical_json_bytes({
        "status": "resolved",
        "outcome_specification_version": OUTCOME_SPECIFICATION_VERSION,
    }).decode("utf-8")
    with pytest.raises(OutcomeValidationError, match="incomplete|canonical"):
        store.append(_successor(root, outcome_json=malformed))


def test_storage_rejects_pending_successor_and_scored_status(tmp_path):
    store = EvaluationStore(tmp_path, clock=Clock(T0, T1, T2))
    root = store.append(_draft())
    pending = dataclasses.replace(
        _successor(root), outcome_status="pending", outcome_json=None,
        evaluation_status="pending",
    )
    with pytest.raises(OutcomeValidationError, match="pending"):
        store.append(pending)
    with pytest.raises(EvaluationError, match="scored"):
        store.append(dataclasses.replace(_successor(root), evaluation_status="scored"))


@pytest.mark.parametrize("status", ("invalidated", "unavailable"))
def test_storage_rejects_nonexcluded_terminal_outcome(tmp_path, status):
    store = EvaluationStore(tmp_path, clock=Clock(T0, T1))
    root = store.append(_draft())
    outcome = OutcomePayload(
        status=status,
        outcome_specification_version=OUTCOME_SPECIFICATION_VERSION,
        reason_code=f"{status}_fixture",
    )
    outcome_json = canonical_json_bytes(dataclasses.asdict(outcome)).decode("utf-8")
    invalid = _successor(
        root, status=status, evaluation_status="eligible", outcome_json=outcome_json)
    with pytest.raises(OutcomeValidationError, match="excluded"):
        store.append(invalid)


def test_direct_append_accepts_only_a_validated_outcome_successor(tmp_path):
    store = EvaluationStore(tmp_path, clock=Clock(T0, T1))
    root = store.append(_outcome_ready_draft())
    outcome = _resolved_outcome()
    draft = _successor(
        root,
        outcome_json=canonical_json_bytes(dataclasses.asdict(outcome)).decode("utf-8"),
    )
    direct = store.append(draft)
    assert direct.outcome_status == "resolved"
    assert direct.evaluation_status == "eligible"


# ── Dataset generation, cutoff selection, and forks ─────────────────────────

def _resolved_chain(tmp_path, clock=None):
    store = EvaluationStore(tmp_path, clock=clock or Clock(T0, T1))
    root = store.append(_outcome_ready_draft())
    child = attach_outcome(store, root.revision_id, _resolved_outcome(), created_at=T1)
    return store, root, child


def test_dataset_reproducible_order_invariant_and_spec_sensitive(tmp_path):
    store, root, child = _resolved_chain(tmp_path)
    spec = _spec()
    one = generate_dataset([root, child], spec)
    two = generate_dataset([child, root], spec)
    assert one.dataset_id == two.dataset_id
    assert one.manifest_json == two.manifest_json and one.dataset_json == two.dataset_json
    later = generate_dataset([root, child], dataclasses.replace(spec, specification_version="v2"))
    assert later.dataset_id != one.dataset_id
    reordered_spec = dataclasses.replace(
        spec, allowed_evaluation_statuses=("scored", "eligible", "eligible"))
    assert reordered_spec == spec


def test_cutoff_visibility_then_sequence_only_selection(tmp_path):
    store, root, child = _resolved_chain(tmp_path, Clock(T0, T2))
    early = generate_dataset(store.all(), _spec(cutoff=T1, statuses=("pending",)))
    assert [r.revision_id for r in early.records] == [root.revision_id]
    late = generate_dataset(store.all(), _spec(cutoff=T2))
    assert [r.revision_id for r in late.records] == [child.revision_id]
    # Operational/event timestamps cannot outrank sequence once records are visible.
    child_early_timestamp = dataclasses.replace(child, record_created_at=utc_timestamp(T0))
    root_late_timestamp = dataclasses.replace(root, record_created_at=utc_timestamp(T2))
    selected = generate_dataset([child_early_timestamp, root_late_timestamp], _spec(cutoff=T2))
    assert [r.revision_sequence for r in selected.records] == [1]

    impossible = dataclasses.replace(child, available_at=utc_timestamp(T0 - timedelta(seconds=1)))
    invalid = generate_dataset([root, impossible], _spec(cutoff=T2))
    assert invalid.records == ()
    assert invalid.exclusions[0].reason_code == "invalid_revision_chain"


def test_post_cutoff_addition_does_not_change_prior_dataset(tmp_path):
    store = EvaluationStore(tmp_path, clock=Clock(T0, T2))
    root = store.append(_outcome_ready_draft())
    before = generate_dataset(store.all(), _spec(cutoff=T1, statuses=("pending",)))
    attach_outcome(store, root.revision_id, _resolved_outcome(), created_at=T1)
    after = generate_dataset(store.all(), _spec(cutoff=T1, statuses=("pending",)))
    assert before.dataset_id == after.dataset_id and before.dataset_json == after.dataset_json


def test_pre_and_post_admission_cohorts_cannot_be_silently_combined():
    with pytest.raises(EvaluationError, match="exactly one"):
        _spec(stage=("qualified_pre_admission", "canonical_post_identity"))


def test_incompatible_versions_are_explicitly_excluded(tmp_path):
    _, root, child = _resolved_chain(tmp_path)
    result = generate_dataset(
        [root, child], dataclasses.replace(_spec(), engine_versions=("other",)))
    assert result.records == ()
    assert result.exclusions[0].reason_code == "engine_version_excluded"


def _fork_fixture():
    root = _record(_outcome_ready_draft(), T0)
    one_draft = _successor(root, outcome_json='{"branch":1}')
    two_draft = dataclasses.replace(_successor(root, outcome_json='{"branch":2}'),
                                    record_created_at=utc_timestamp(T1 + timedelta(seconds=1)))
    one = _record(one_draft, T1)
    two = _record(two_draft, T1 + timedelta(seconds=1))
    descendant = _record(_successor(one, outcome_json='{"branch":1,"next":true}'), T2)
    return root, one, two, descendant


def test_visible_fork_excludes_entire_chain_once_with_sorted_conflicts():
    root, one, two, descendant = _fork_fixture()
    for permutation in itertools.permutations([root, one, two, descendant]):
        result = generate_dataset(permutation, _spec(cutoff=T2))
        assert result.records == ()
        assert len(result.exclusions) == 1
        exclusion = result.exclusions[0]
        assert exclusion.reason_code == "ambiguous_revision_fork"
        assert exclusion.conflicting_revision_ids == tuple(sorted((one.revision_id, two.revision_id)))


def test_fork_invisible_before_second_branch_then_permanently_excluded():
    root, one, two, descendant = _fork_fixture()
    before_second = datetime.fromisoformat(two.available_at.replace("Z", "+00:00")) - timedelta(microseconds=1)
    early = generate_dataset([root, one, two, descendant],
                             _spec(cutoff=before_second, statuses=("eligible",)))
    assert [r.revision_id for r in early.records] == [one.revision_id]
    late = generate_dataset([root, one, two, descendant], _spec(cutoff=T2))
    much_later = generate_dataset([root, one, two, descendant], _spec(cutoff=T2 + timedelta(days=30)))
    assert late.exclusions[0].reason_code == much_later.exclusions[0].reason_code == "ambiguous_revision_fork"


def test_descendants_on_both_fork_branches_cannot_select_a_winner():
    root, one, two, descendant_one = _fork_fixture()
    descendant_two = _record(
        _successor(two, outcome_json='{"branch":2,"next":true}'), T2)
    revisions = [root, one, two, descendant_one, descendant_two]
    forward = generate_dataset(revisions, _spec(cutoff=T2))
    reverse = generate_dataset(reversed(revisions), _spec(cutoff=T2))
    assert forward.records == reverse.records == ()
    assert forward.exclusions == reverse.exclusions
    assert forward.exclusions[0].reason_code == "ambiguous_revision_fork"


# ── Capture boundary and production isolation ────────────────────────────────

def test_actual_shadow_capture_append_read_and_population_separation(tmp_path):
    store = EvaluationStore(tmp_path, clock=Clock(T0, T0))
    capture = ShadowEvaluationCapture(store, maxsize=8, start_worker=False)
    pre = _assessment("pre")
    admitted = _assessment("adm", uid="ev_adm")
    result = MaterialityShadowResult(
        policy_version=pre.policy_version,
        pre_admission=(pre,),
        admitted=(admitted,),
    )
    before = pickle.dumps(result)
    assert capture.submit(result, cycle_id="cycle-1", source_system_namespace="argus",
                          decision_completed_at=T0) == 2
    capture.drain()
    assert pickle.dumps(result) == before
    records = EvaluationStore(tmp_path).all()
    assert {r.observation_stage for r in records} == {
        "qualified_pre_admission", "canonical_post_identity",
    }
    assert all(r.shadow_decision == "unresolved" for r in records)


def test_capture_queue_is_bounded_observable_and_fail_open(tmp_path, monkeypatch):
    EVALUATION_DIAGNOSTICS.clear()
    store = EvaluationStore(tmp_path, clock=Clock(T0))
    capture = ShadowEvaluationCapture(store, maxsize=1, start_worker=False)
    result = MaterialityShadowResult(
        policy_version="p", pre_admission=(_assessment("a"), _assessment("b")))
    assert capture.submit(result, cycle_id="cycle-1", source_system_namespace="argus",
                          decision_completed_at=T0) == 1
    assert capture.dropped == 1
    original = result
    monkeypatch.setattr(store, "append", lambda draft: (_ for _ in ()).throw(OSError("down")))
    capture.drain()
    assert capture.failed == 1 and result is original
    codes = {entry.error_code for entry in EVALUATION_DIAGNOSTICS.snapshot()}
    assert {"queue_saturated", "storage_failure"} <= codes


def test_actual_enqueue_disabled_and_unavailable_are_fail_open(monkeypatch):
    import app.materiality_evaluation as evaluation
    from app.config import settings

    result = MaterialityShadowResult(
        policy_version="p", pre_admission=(_assessment("a"),))
    before = pickle.dumps(result)
    monkeypatch.setattr(settings, "materiality_evaluation_enabled", False)
    assert evaluation.enqueue_shadow_evaluation(
        result, cycle_id="cycle-1", decision_completed_at=T0) == 0
    monkeypatch.setattr(settings, "materiality_evaluation_enabled", True)
    monkeypatch.setattr(
        evaluation, "_capture_service", lambda: (_ for _ in ()).throw(OSError("down")))
    assert evaluation.enqueue_shadow_evaluation(
        result, cycle_id="cycle-1", decision_completed_at=T0) == 0
    assert pickle.dumps(result) == before


def test_invalid_evaluation_configuration_fails_safe_off_with_diagnostic():
    from app.config import Settings

    EVALUATION_DIAGNOSTICS.clear()
    configured = Settings(_env_file=None, materiality_evaluation_enabled="garbage")
    assert configured.materiality_evaluation_enabled is False
    assert configured.active_model
    assert any(
        entry.error_code == "invalid_activation_flag"
        and entry.detail_code == "evaluation_disabled"
        for entry in EVALUATION_DIAGNOSTICS.snapshot()
    )


def test_structured_diagnostics_cover_serialization_replay_and_dataset_failures(tmp_path):
    EVALUATION_DIAGNOSTICS.clear()
    capture = ShadowEvaluationCapture(
        EvaluationStore(tmp_path / "capture", clock=Clock(T0)),
        maxsize=2,
        start_worker=False,
    )
    missing_time = _assessment("missing-time", first_seen=None)
    capture.submit(
        MaterialityShadowResult(policy_version="p", pre_admission=(missing_time,)),
        cycle_id="cycle-1", source_system_namespace="argus", decision_completed_at=T0,
    )
    capture.drain()
    record = EvaluationStore(tmp_path / "replay", clock=Clock(T0)).append(_draft())
    with pytest.raises(ReplayUnavailableError):
        replay(dataclasses.replace(record, engine_version="missing"))
    malformed_availability = dataclasses.replace(record, available_at="not-a-timestamp")
    with pytest.raises(EvaluationError):
        generate_dataset([malformed_availability], _spec())
    codes = {entry.error_code for entry in EVALUATION_DIAGNOSTICS.snapshot()}
    assert {"canonicalization_failure", "replay_failure", "dataset_failure"} <= codes


def test_structured_diagnostics_are_bounded_coalesced_and_reject_unsafe_detail():
    diagnostics = EvaluationDiagnostics(max_entries=2)
    for code in ("one", "two", "three"):
        diagnostics.record(
            component="test", operation="record", error_code=code,
            detail_code="bounded", observed_at=T0,
        )
    assert [entry.error_code for entry in diagnostics.snapshot()] == ["two", "three"]
    diagnostics.record(
        component="test", operation="record", error_code="three",
        detail_code="bounded", observed_at=T1,
    )
    assert diagnostics.snapshot()[-1].occurrence_count == 2
    with pytest.raises(ValueError, match="bounded stable token"):
        diagnostics.record(
            component="test", operation="record", error_code="secret",
            detail_code="raw credential must not be stored", observed_at=T0,
        )
    assert all("credential" not in dataclasses.asdict(entry).values()
               for entry in diagnostics.snapshot())


def test_global_diagnostic_fallback_omits_unsafe_runtime_text():
    EVALUATION_DIAGNOSTICS.clear()
    entry = record_diagnostic(
        component="test", operation="record", error_code="unsafe",
        detail_code="secret value with spaces",
    )
    assert entry.error_code == "diagnostic_rejected"
    assert "secret" not in json.dumps(dataclasses.asdict(entry))


def test_evaluation_objects_never_enter_feed_or_event_pickle():
    from app.events import MarketEvent
    from app.processed_cache import ProcessedFeed

    event = MarketEvent(
        id="c1", title="Fed holds", event_type="macro",
        first_seen=T0.isoformat(), last_updated=T0.isoformat(),
        corroboration_count=1, source_count=1,
    )
    feed = ProcessedFeed(items=[], top_stories={}, market_take="", errors={},
                         promo_excluded=0, debug_log=[], events=[event])
    blob = pickle.dumps(feed)
    for forbidden in (b"EvaluationRecordRevision", b"materiality_evaluation",
                      b"observation_id", b"available_at"):
        assert forbidden not in blob


def test_no_calibration_threshold_or_enforcement_surface_exists():
    import app.materiality_evaluation as module

    prohibited = ("calibrate", "optimize_threshold", "activate_membership", "enforce")
    assert not any(hasattr(module, name) for name in prohibited)
