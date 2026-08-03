"""Wave 0.3 C1: immutable, shadow-only materiality evaluation infrastructure.

This module is deliberately downstream of :mod:`app.materiality`.  It records
completed shadow assessments, replays their normalized decision-boundary input,
attaches outcomes as immutable successor revisions, and builds deterministic
evaluation datasets.  Nothing here is imported by event construction, admission,
ranking, serialization, or any user-facing surface.
"""

from __future__ import annotations

import hashlib
import json
import logging
import os
import queue
import re
import threading
import unicodedata
from collections import OrderedDict
from dataclasses import asdict, dataclass, fields, is_dataclass, replace
from datetime import datetime, timezone
from pathlib import Path
from types import MappingProxyType
from typing import Any, Callable, Iterable, Mapping

from app.materiality import (
    POLICY_VERSION,
    MaterialityAssessment,
    MaterialityShadowResult,
)
from app.storage import EVALUATION_DIR

log = logging.getLogger(__name__)

OBSERVATION_IDENTITY_SCHEMA_VERSION = "materiality-observation-1"
EVALUATION_SCHEMA_VERSION = "materiality-evaluation-1"
INPUT_SCHEMA_VERSION = "materiality-input-1"
FEATURE_EXTRACTOR_VERSION = "materiality-features-0.2b-n3"
ENGINE_VERSION = "materiality-shadow-0.3-c1"
OUTCOME_SPECIFICATION_VERSION = "materiality-outcome-1"

_OBS_ID_RE = re.compile(r"^obs_[0-9a-f]{64}$")
_DECIMAL_RE = re.compile(r"^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$")
_UTC_RE = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$")
_IDENTITY_FIELDS = (
    "observation_identity_schema_version",
    "source_system_namespace",
    "cycle_id",
    "observation_stage",
    "cycle_local_event_id",
    "durable_event_uid",
    "contributing_ids",
    "contributing_event_uids",
)
_STAGES = frozenset({"qualified_pre_admission", "canonical_post_identity"})
_OUTCOME_STATUSES = frozenset({"pending", "resolved", "invalidated", "unavailable"})
_EVALUATION_STATUSES = frozenset({"pending", "eligible", "scored", "excluded"})


class EvaluationError(RuntimeError):
    """Base class for explicit C1 contract failures."""


class CanonicalizationError(EvaluationError):
    pass


class ManifestValidationError(EvaluationError):
    pass


class RevisionConflictError(EvaluationError):
    pass


class RevisionChainError(EvaluationError):
    pass


class ReplayUnavailableError(EvaluationError):
    pass


class ReplayMismatchError(EvaluationError):
    pass


class OutcomeValidationError(EvaluationError):
    pass


@dataclass(frozen=True)
class EvaluationDiagnostic:
    component: str
    operation: str
    error_code: str
    identifier_kind: str | None
    identifier_value: str | None
    detail_code: str
    occurrence_count: int
    last_seen_at: str


class EvaluationDiagnostics:
    """Bounded, coalescing operational diagnostics outside canonical data."""

    def __init__(self, max_entries: int = 128) -> None:
        if max_entries < 1:
            raise ValueError("max_entries must be positive")
        self.max_entries = max_entries
        self._entries: OrderedDict[tuple[str, ...], EvaluationDiagnostic] = OrderedDict()
        self._lock = threading.RLock()

    @staticmethod
    def _token(value: str | None, *, nullable: bool = False) -> str | None:
        if value is None and nullable:
            return None
        if not isinstance(value, str):
            raise TypeError("diagnostic fields must be strings")
        normalized = _nfc(value)
        if not re.fullmatch(r"[A-Za-z0-9_.:-]{1,128}", normalized):
            raise ValueError("diagnostic field is not a bounded stable token")
        return normalized

    def record(
        self,
        *,
        component: str,
        operation: str,
        error_code: str,
        detail_code: str,
        identifier_kind: str | None = None,
        identifier_value: str | None = None,
        observed_at: datetime | None = None,
    ) -> EvaluationDiagnostic:
        values = (
            self._token(component), self._token(operation), self._token(error_code),
            self._token(identifier_kind, nullable=True),
            self._token(identifier_value, nullable=True), self._token(detail_code),
        )
        key = tuple("" if value is None else value for value in values)
        timestamp = utc_timestamp(observed_at or datetime.now(timezone.utc))
        with self._lock:
            existing = self._entries.get(key)
            if existing is None:
                entry = EvaluationDiagnostic(
                    component=values[0] or "", operation=values[1] or "",
                    error_code=values[2] or "", identifier_kind=values[3],
                    identifier_value=values[4], detail_code=values[5] or "",
                    occurrence_count=1, last_seen_at=timestamp,
                )
                self._entries[key] = entry
                if len(self._entries) > self.max_entries:
                    self._entries.popitem(last=False)
            else:
                entry = replace(
                    existing,
                    occurrence_count=existing.occurrence_count + 1,
                    last_seen_at=timestamp,
                )
                self._entries[key] = entry
            return entry

    def snapshot(self) -> tuple[EvaluationDiagnostic, ...]:
        with self._lock:
            return tuple(self._entries.values())

    def clear(self) -> None:
        with self._lock:
            self._entries.clear()


EVALUATION_DIAGNOSTICS = EvaluationDiagnostics()


def record_diagnostic(**kwargs: Any) -> EvaluationDiagnostic:
    try:
        return EVALUATION_DIAGNOSTICS.record(**kwargs)
    except Exception:
        return EVALUATION_DIAGNOSTICS.record(
            component="diagnostics", operation="record",
            error_code="diagnostic_rejected", detail_code="unsafe_fields_omitted",
        )


def _nfc(value: str) -> str:
    return unicodedata.normalize("NFC", value)


def _normalize_json(value: Any) -> Any:
    """NFC-normalize a JSON value and reject normalization-created key collisions."""
    if value is None or isinstance(value, bool):
        return value
    if isinstance(value, int) and not isinstance(value, bool):
        if abs(value) > 9_007_199_254_740_991:
            raise CanonicalizationError("integer is outside the RFC 8785 interoperable range")
        return value
    if isinstance(value, float):
        raise CanonicalizationError("floats are prohibited; use exact decimal strings")
    if isinstance(value, str):
        return _nfc(value)
    if isinstance(value, (list, tuple)):
        return [_normalize_json(v) for v in value]
    if isinstance(value, Mapping):
        normalized: dict[str, Any] = {}
        for key, item in value.items():
            if not isinstance(key, str):
                raise CanonicalizationError("JSON object keys must be strings")
            nkey = _nfc(key)
            if nkey in normalized:
                raise CanonicalizationError("Unicode normalization created an object-key collision")
            normalized[nkey] = _normalize_json(item)
        return normalized
    if is_dataclass(value):
        return _normalize_json(asdict(value))
    raise CanonicalizationError(f"unsupported canonical JSON type: {type(value).__name__}")


def _utf16_key(value: str) -> bytes:
    try:
        return value.encode("utf-16-be")
    except UnicodeEncodeError as exc:
        raise CanonicalizationError("lone Unicode surrogate is prohibited") from exc


def _json_string(value: str) -> str:
    try:
        return json.dumps(value, ensure_ascii=False, allow_nan=False)
    except (TypeError, ValueError, UnicodeEncodeError) as exc:
        raise CanonicalizationError("invalid JSON string") from exc


def _jcs_text(value: Any) -> str:
    """RFC-8785/JCS serializer for C1's deliberately float-free JSON domain."""
    if value is None:
        return "null"
    if value is True:
        return "true"
    if value is False:
        return "false"
    if isinstance(value, int) and not isinstance(value, bool):
        return str(value)
    if isinstance(value, str):
        return _json_string(value)
    if isinstance(value, list):
        return "[" + ",".join(_jcs_text(v) for v in value) + "]"
    if isinstance(value, dict):
        ordered = sorted(value, key=_utf16_key)
        return "{" + ",".join(
            _json_string(k) + ":" + _jcs_text(value[k]) for k in ordered
        ) + "}"
    raise CanonicalizationError(f"unsupported normalized JSON type: {type(value).__name__}")


def canonical_json_bytes(value: Any) -> bytes:
    """Return NFC-normalized RFC-8785 bytes for the supported exact JSON domain."""
    return _jcs_text(_normalize_json(value)).encode("utf-8")


def canonical_json_text(value: Any) -> str:
    return canonical_json_bytes(value).decode("utf-8")


def _sha256_id(prefix: str, value: Any) -> str:
    return prefix + hashlib.sha256(canonical_json_bytes(value)).hexdigest()


def utc_timestamp(value: datetime) -> str:
    if value.tzinfo is None:
        raise EvaluationError("UTC timestamps must be timezone-aware")
    return value.astimezone(timezone.utc).isoformat(timespec="microseconds").replace("+00:00", "Z")


def parse_utc_timestamp(value: str) -> datetime:
    if not isinstance(value, str) or not _UTC_RE.fullmatch(value):
        raise EvaluationError("timestamp must use fixed-precision UTC RFC 3339 with explicit Z")
    return datetime.fromisoformat(value[:-1] + "+00:00")


def _normalize_identifier_set(value: Any, field: str) -> list[str]:
    if not isinstance(value, (list, tuple)):
        raise EvaluationError(f"{field} must be an array")
    normalized: set[str] = set()
    for item in value:
        if not isinstance(item, str):
            raise EvaluationError(f"{field} values must be strings")
        normalized.add(_nfc(item))
    return sorted(normalized, key=lambda item: item.encode("utf-8"))


def canonical_observation_payload(payload: Mapping[str, Any]) -> dict[str, Any]:
    missing = [name for name in _IDENTITY_FIELDS if name not in payload]
    extra = sorted(set(payload) - set(_IDENTITY_FIELDS))
    if missing:
        raise EvaluationError(f"missing required observation identity fields: {missing}")
    if extra:
        raise EvaluationError(f"prohibited observation identity fields: {extra}")
    normalized = _normalize_json(dict(payload))
    for name in _IDENTITY_FIELDS[:5]:
        if not isinstance(normalized[name], str) or not normalized[name]:
            raise EvaluationError(f"{name} must be a non-empty string")
    if normalized["observation_stage"] not in _STAGES:
        raise EvaluationError("invalid observation_stage")
    uid = normalized["durable_event_uid"]
    if uid is not None and not isinstance(uid, str):
        raise EvaluationError("durable_event_uid must be a string or explicit null")
    normalized["contributing_ids"] = _normalize_identifier_set(
        normalized["contributing_ids"], "contributing_ids")
    normalized["contributing_event_uids"] = _normalize_identifier_set(
        normalized["contributing_event_uids"], "contributing_event_uids")
    return normalized


def observation_id(payload: Mapping[str, Any]) -> str:
    result = _sha256_id("obs_", canonical_observation_payload(payload))
    if not _OBS_ID_RE.fullmatch(result):  # defensive contract assertion
        raise EvaluationError("observation_id encoding violated its contract")
    return result


def validate_observation_id(value: str) -> None:
    if not _OBS_ID_RE.fullmatch(value):
        raise EvaluationError("observation_id must be obs_ plus 64 lowercase hexadecimal characters")


@dataclass(frozen=True)
class ManifestField:
    name: str
    field_type: str
    nullable: bool = False
    collection_order: str = "scalar"  # scalar | ordered | set
    normalization: str = "nfc"


@dataclass(frozen=True)
class EngineInputManifest:
    engine_version: str
    manifest_version: str
    fields: tuple[ManifestField, ...]

    @property
    def manifest_hash(self) -> str:
        return _sha256_id("manifest_", asdict(self))

    def normalize_snapshot(self, snapshot: Mapping[str, Any]) -> str:
        if not isinstance(snapshot, Mapping):
            raise ManifestValidationError("input snapshot must be an object")
        expected = {f.name for f in self.fields}
        missing = sorted(expected - set(snapshot))
        extra = sorted(set(snapshot) - expected)
        if missing or extra:
            raise ManifestValidationError(f"snapshot fields mismatch: missing={missing} extra={extra}")
        output: dict[str, Any] = {}
        for spec in self.fields:
            value = snapshot[spec.name]
            if value is None:
                if not spec.nullable:
                    raise ManifestValidationError(f"{spec.name} cannot be null")
                output[spec.name] = None
                continue
            output[spec.name] = _validate_manifest_value(spec, value)
        return canonical_json_text(output)


def _validate_manifest_value(spec: ManifestField, value: Any) -> Any:
    kind = spec.field_type
    if kind == "string":
        if not isinstance(value, str):
            raise ManifestValidationError(f"{spec.name} must be a string")
        normalized: Any = _nfc(value)
    elif kind == "integer":
        if not isinstance(value, int) or isinstance(value, bool):
            raise ManifestValidationError(f"{spec.name} must be an integer")
        normalized = value
    elif kind == "boolean":
        if not isinstance(value, bool):
            raise ManifestValidationError(f"{spec.name} must be a boolean")
        normalized = value
    elif kind == "decimal":
        if not isinstance(value, str) or not _DECIMAL_RE.fullmatch(value):
            raise ManifestValidationError(f"{spec.name} must be an exact decimal string")
        normalized = value
    elif kind == "string_array":
        if not isinstance(value, (list, tuple)) or not all(isinstance(v, str) for v in value):
            raise ManifestValidationError(f"{spec.name} must be a string array")
        vals = [_nfc(v) for v in value]
        if spec.collection_order == "set":
            normalized = sorted(set(vals), key=lambda item: item.encode("utf-8"))
        elif spec.collection_order == "ordered":
            normalized = vals
        else:
            raise ManifestValidationError(f"{spec.name} has invalid collection-order semantics")
    elif kind in {"json", "reason_array"}:
        normalized = _normalize_json(value)
        if kind == "reason_array":
            if not isinstance(normalized, list):
                raise ManifestValidationError(f"{spec.name} must be an array")
            for row in normalized:
                if (not isinstance(row, dict) or set(row) != {"factor", "detail", "available"}
                        or not isinstance(row["factor"], str)
                        or not isinstance(row["detail"], str)
                        or not isinstance(row["available"], bool)):
                    raise ManifestValidationError(f"{spec.name} contains an invalid reason")
            normalized = sorted(normalized, key=lambda row: (
                row["factor"], row["detail"], row["available"],
            ))
    else:
        raise ManifestValidationError(f"unsupported manifest field type {kind!r}")
    canonical_json_bytes(normalized)  # validate the complete nested value
    return normalized


MATERIALITY_INPUT_MANIFEST = EngineInputManifest(
    engine_version=ENGINE_VERSION,
    manifest_version="materiality-manifest-1",
    fields=(
        ManifestField("event_type", "string"),
        ManifestField("corroboration_count", "integer"),
        ManifestField("best_evidence_tier", "integer"),
        ManifestField("mandatory_class", "boolean"),
        ManifestField("inputs_present", "string_array", collection_order="set"),
        ManifestField("first_seen", "string", nullable=True),
        ManifestField("editorial_score", "decimal", nullable=True),
        ManifestField("source_count", "integer", nullable=True),
        ManifestField("companies_count", "integer"),
        ManifestField("industries_count", "integer"),
        ManifestField("source_evidence", "json", nullable=True),
        ManifestField("breadth_evidence", "json", nullable=True),
        ManifestField("figure_evidence", "json", nullable=True),
        ManifestField("reasons", "reason_array", collection_order="set"),
    ),
)


@dataclass(frozen=True)
class RegisteredEngineContract:
    engine_version: str
    input_schema_version: str
    feature_extractor_version: str
    manifest: EngineInputManifest


_ENGINE_CONTRACTS: Mapping[str, RegisteredEngineContract] = MappingProxyType({
    ENGINE_VERSION: RegisteredEngineContract(
        engine_version=ENGINE_VERSION,
        input_schema_version=INPUT_SCHEMA_VERSION,
        feature_extractor_version=FEATURE_EXTRACTOR_VERSION,
        manifest=MATERIALITY_INPUT_MANIFEST,
    ),
})


@dataclass(frozen=True)
class EvaluationReason:
    factor: str
    detail: str
    available: bool


@dataclass(frozen=True)
class DecisionReplay:
    shadow_decision: str
    materiality_rank: str | None
    decision_confidence: str | None
    confidence_semantics: str
    expected_return_json: str | None
    reasons: tuple[EvaluationReason, ...]

    def canonical_bytes(self) -> bytes:
        return canonical_json_bytes(asdict(self))


@dataclass(frozen=True)
class OutcomePayload:
    status: str
    outcome_specification_version: str
    target_identifier: str | None = None
    horizon_at: str | None = None
    resolved_at: str | None = None
    information_available_at: str | None = None
    unit: str | None = None
    label: str | bool | None = None
    observed_value: str | None = None
    observed_return: str | None = None
    source_ids: tuple[str, ...] = ()
    methodology_id: str | None = None
    quality_flags: tuple[str, ...] = ()
    reason_code: str | None = None

    def __post_init__(self) -> None:
        string_fields = (
            "status", "outcome_specification_version", "target_identifier", "horizon_at",
            "resolved_at", "information_available_at", "unit", "observed_value",
            "observed_return", "methodology_id", "reason_code",
        )
        for name in string_fields:
            value = getattr(self, name)
            if value is not None and not isinstance(value, str):
                raise OutcomeValidationError(f"{name} must be a string or null")
        if not isinstance(self.status, str) or not isinstance(
                self.outcome_specification_version, str):
            raise OutcomeValidationError("outcome status and specification must be strings")
        if self.label is not None and not isinstance(self.label, (str, bool)):
            raise OutcomeValidationError("outcome label must be a string, boolean, or null")
        # Both collections are identity sets, not encounter-ordered evidence.
        # Canonicalize at construction so equivalent attachments are idempotent.
        for name in ("source_ids", "quality_flags"):
            value = getattr(self, name)
            if not isinstance(value, (list, tuple)) or not all(
                    isinstance(item, str) for item in value):
                raise OutcomeValidationError(f"{name} must contain only strings")
            object.__setattr__(self, name, tuple(sorted(
                {_nfc(item) for item in value}, key=lambda item: item.encode("utf-8"))))

    @property
    def outcome_id(self) -> str:
        return _sha256_id("outcome_", asdict(self))


@dataclass(frozen=True)
class EvaluationRevisionDraft:
    schema_version: str
    evaluation_id: str
    supersedes_revision_id: str | None
    revision_sequence: int
    observation_identity_schema_version: str
    observation_id: str
    observation_stage: str
    source_system_namespace: str
    cycle_id: str
    cycle_local_event_id: str
    durable_event_uid: str | None
    contributing_ids: tuple[str, ...]
    contributing_event_uids: tuple[str, ...]
    event_observed_at: str
    decision_completed_at: str
    record_created_at: str
    engine_version: str
    policy_version: str
    input_schema_version: str
    feature_extractor_version: str
    manifest_version: str
    manifest_hash: str
    input_snapshot_json: str
    input_hash: str
    shadow_decision: str
    materiality_rank: str | None
    decision_confidence: str | None
    confidence_semantics: str
    expected_return_json: str | None
    reasons: tuple[EvaluationReason, ...]
    evidence_ids: tuple[str, ...]
    outcome_target: str | None
    outcome_horizon_at: str | None
    outcome_unit: str | None
    outcome_specification_version: str | None
    outcome_status: str
    outcome_json: str | None
    evaluation_status: str
    status_reason_code: str | None

    @property
    def revision_id(self) -> str:
        # record_created_at is operational provenance; semantic idempotency is
        # anchored by the immutable decision/outcome payload instead. Project
        # through the DRAFT schema explicitly so a stored record's storage-only
        # `available_at` can never enter its semantic identifier.
        payload = {field.name: getattr(self, field.name)
                   for field in fields(EvaluationRevisionDraft)}
        payload.pop("record_created_at")
        return _sha256_id("rev_", payload)


@dataclass(frozen=True)
class EvaluationRecordRevision(EvaluationRevisionDraft):
    available_at: str = ""

    @property
    def revision_id(self) -> str:  # type: ignore[override]
        return super().revision_id


def _record_payload(record: EvaluationRevisionDraft) -> dict[str, Any]:
    payload = asdict(record)
    payload["revision_id"] = record.revision_id
    if isinstance(record, EvaluationRecordRevision):
        payload["available_at"] = record.available_at
    return payload


def _record_from_payload(payload: Mapping[str, Any]) -> EvaluationRecordRevision:
    data = dict(payload)
    claimed = data.pop("revision_id", None)
    data["reasons"] = tuple(EvaluationReason(**row) for row in data.get("reasons", ()))
    data["contributing_ids"] = tuple(data.get("contributing_ids", ()))
    data["contributing_event_uids"] = tuple(data.get("contributing_event_uids", ()))
    data["evidence_ids"] = tuple(data.get("evidence_ids", ()))
    record = EvaluationRecordRevision(**data)
    if claimed != record.revision_id:
        raise RevisionConflictError("stored revision_id does not match immutable payload")
    _validate_draft(record)
    parse_utc_timestamp(record.available_at)
    return record


def _draft_from_record(record: EvaluationRecordRevision, **changes: Any) -> EvaluationRevisionDraft:
    allowed = {f.name for f in fields(EvaluationRevisionDraft)}
    base = {name: getattr(record, name) for name in allowed}
    base.update(changes)
    return EvaluationRevisionDraft(**base)


class EvaluationStore:
    """Append-only immutable JSONL revision store with storage-assigned availability."""

    def __init__(self, directory: Path = EVALUATION_DIR,
                 *, clock: Callable[[], datetime] | None = None) -> None:
        self.directory = Path(directory)
        self.path = self.directory / "evaluation-revisions.jsonl"
        self._clock = clock or (lambda: datetime.now(timezone.utc))
        self._lock = threading.RLock()
        self._records: dict[str, EvaluationRecordRevision] = {}
        self._load()

    def _load(self) -> None:
        if not self.path.exists():
            return
        with open(self.path, encoding="utf-8") as handle:
            for lineno, line in enumerate(handle, 1):
                if not line.strip():
                    continue
                try:
                    record = _record_from_payload(json.loads(line))
                    existing = self._records.get(record.revision_id)
                    if existing is not None and existing != record:
                        raise RevisionConflictError("conflicting persisted revision")
                    if existing is not None:
                        continue
                    predecessor = None
                    if record.revision_sequence == 0:
                        if record.supersedes_revision_id is not None:
                            raise RevisionChainError(
                                "persisted initial revision cannot have a predecessor")
                        if any(item.evaluation_id == record.evaluation_id
                               and item.revision_sequence == 0
                               for item in self._records.values()):
                            raise RevisionConflictError("conflicting persisted initial revision")
                    else:
                        predecessor = self._records.get(record.supersedes_revision_id or "")
                        if predecessor is None:
                            raise RevisionChainError(
                                "persisted successor predecessor is unavailable")
                        if (predecessor.evaluation_id != record.evaluation_id
                                or record.revision_sequence != predecessor.revision_sequence + 1):
                            raise RevisionChainError("invalid persisted successor chain")
                        _validate_immutable_successor(predecessor, record)
                        if any(item.supersedes_revision_id == predecessor.revision_id
                               for item in self._records.values()):
                            raise RevisionConflictError("persisted successor fork detected")
                        if (parse_utc_timestamp(record.available_at)
                                < parse_utc_timestamp(predecessor.available_at)):
                            raise RevisionChainError(
                                "persisted successor availability precedes predecessor")
                    _validate_outcome_transition(record, predecessor)
                    self._records[record.revision_id] = record
                except Exception as exc:
                    raise RevisionConflictError(f"invalid evaluation row {lineno}: {exc}") from exc

    def all(self) -> tuple[EvaluationRecordRevision, ...]:
        with self._lock:
            return tuple(self._records.values())

    def get(self, revision_id: str) -> EvaluationRecordRevision | None:
        with self._lock:
            return self._records.get(revision_id)

    def append(self, draft: EvaluationRevisionDraft) -> EvaluationRecordRevision:
        if type(draft) is not EvaluationRevisionDraft:
            raise RevisionConflictError("callers must append a draft and cannot supply available_at")
        _validate_draft(draft)
        rid = draft.revision_id
        with self._lock:
            existing = self._records.get(rid)
            if existing is not None:
                return existing
            predecessor: EvaluationRecordRevision | None = None
            if draft.revision_sequence == 0:
                if draft.supersedes_revision_id is not None:
                    raise RevisionChainError("initial revision cannot supersede another revision")
                if any(record.evaluation_id == draft.evaluation_id
                       and record.revision_sequence == 0 for record in self._records.values()):
                    raise RevisionConflictError("conflicting initial evaluation revision")
            else:
                predecessor = self._records.get(draft.supersedes_revision_id or "")
                if predecessor is None:
                    raise RevisionChainError("successor predecessor does not exist durably")
                if predecessor.evaluation_id != draft.evaluation_id:
                    raise RevisionChainError("successor must retain evaluation_id")
                if draft.revision_sequence != predecessor.revision_sequence + 1:
                    raise RevisionChainError("successor revision_sequence must increment by exactly one")
                _validate_immutable_successor(predecessor, draft)
                if any(record.supersedes_revision_id == predecessor.revision_id
                       for record in self._records.values()):
                    raise RevisionConflictError("conflicting successor would fork the revision chain")
            _validate_outcome_transition(draft, predecessor)
            available = utc_timestamp(self._clock())
            if predecessor and parse_utc_timestamp(available) < parse_utc_timestamp(predecessor.available_at):
                raise RevisionChainError("successor available_at cannot precede predecessor availability")
            record = EvaluationRecordRevision(
                **{f.name: getattr(draft, f.name) for f in fields(EvaluationRevisionDraft)},
                available_at=available,
            )
            row = canonical_json_text(_record_payload(record))
            self.directory.mkdir(parents=True, exist_ok=True)
            with open(self.path, "a", encoding="utf-8", newline="\n") as handle:
                handle.write(row + "\n")
                handle.flush()
                os.fsync(handle.fileno())
            self._records[rid] = record
            return record


_IMMUTABLE_SUCCESSOR_FIELDS = tuple(
    name for name in (
        "schema_version", "evaluation_id", "observation_identity_schema_version",
        "observation_id", "observation_stage",
        "source_system_namespace", "cycle_id", "cycle_local_event_id", "durable_event_uid",
        "contributing_ids", "contributing_event_uids", "event_observed_at",
        "decision_completed_at", "engine_version", "policy_version", "input_schema_version",
        "feature_extractor_version", "manifest_version", "manifest_hash", "input_snapshot_json",
        "input_hash", "shadow_decision", "materiality_rank", "decision_confidence",
        "confidence_semantics", "expected_return_json", "reasons", "evidence_ids",
        "outcome_target", "outcome_horizon_at", "outcome_unit", "outcome_specification_version",
    )
)


def _validate_immutable_successor(predecessor: EvaluationRecordRevision,
                                  successor: EvaluationRevisionDraft) -> None:
    changed = [name for name in _IMMUTABLE_SUCCESSOR_FIELDS
               if getattr(predecessor, name) != getattr(successor, name)]
    if changed:
        raise RevisionChainError(f"successor changed immutable decision fields: {changed}")


def _validate_draft(draft: EvaluationRevisionDraft) -> None:
    if draft.schema_version != EVALUATION_SCHEMA_VERSION:
        raise EvaluationError("unregistered evaluation schema version")
    if draft.observation_identity_schema_version != OBSERVATION_IDENTITY_SCHEMA_VERSION:
        raise EvaluationError("unregistered observation identity schema version")
    if draft.observation_stage not in _STAGES:
        raise EvaluationError("invalid observation stage")
    if draft.revision_sequence < 0:
        raise RevisionChainError("revision_sequence must be non-negative")
    if draft.outcome_status not in _OUTCOME_STATUSES:
        raise EvaluationError("invalid outcome status")
    if draft.evaluation_status not in _EVALUATION_STATUSES:
        raise EvaluationError("invalid evaluation status")
    if draft.evaluation_status == "scored":
        raise EvaluationError("scored evaluation status is not available in C1")
    parse_utc_timestamp(draft.event_observed_at)
    parse_utc_timestamp(draft.decision_completed_at)
    parse_utc_timestamp(draft.record_created_at)
    if draft.outcome_horizon_at is not None:
        parse_utc_timestamp(draft.outcome_horizon_at)
    identity_payload = {
        "observation_identity_schema_version": draft.observation_identity_schema_version,
        "source_system_namespace": draft.source_system_namespace,
        "cycle_id": draft.cycle_id,
        "observation_stage": draft.observation_stage,
        "cycle_local_event_id": draft.cycle_local_event_id,
        "durable_event_uid": draft.durable_event_uid,
        "contributing_ids": list(draft.contributing_ids),
        "contributing_event_uids": list(draft.contributing_event_uids),
    }
    canonical_identity = canonical_observation_payload(identity_payload)
    identity_fields_match = (
        canonical_identity["source_system_namespace"] == draft.source_system_namespace
        and canonical_identity["cycle_id"] == draft.cycle_id
        and canonical_identity["observation_stage"] == draft.observation_stage
        and canonical_identity["cycle_local_event_id"] == draft.cycle_local_event_id
        and canonical_identity["durable_event_uid"] == draft.durable_event_uid
        and tuple(canonical_identity["contributing_ids"]) == draft.contributing_ids
        and tuple(canonical_identity["contributing_event_uids"])
        == draft.contributing_event_uids
    )
    if not identity_fields_match:
        raise EvaluationError("observation identity fields are not canonical")
    expected_observation_id = observation_id(identity_payload)
    if draft.observation_id != expected_observation_id:
        raise EvaluationError("observation_id does not match canonical observation fields")
    try:
        contract = _ENGINE_CONTRACTS[draft.engine_version]
    except KeyError as exc:
        raise ManifestValidationError("record references an unregistered engine version") from exc
    manifest = contract.manifest
    if draft.manifest_version != manifest.manifest_version:
        raise ManifestValidationError("record manifest_version does not match registered manifest")
    if draft.manifest_hash != manifest.manifest_hash:
        raise ManifestValidationError("record manifest hash does not match registered manifest")
    if draft.input_schema_version != contract.input_schema_version:
        raise ManifestValidationError("record input_schema_version does not match engine contract")
    if draft.feature_extractor_version != contract.feature_extractor_version:
        raise ManifestValidationError("record feature_extractor_version does not match engine contract")
    snapshot = json.loads(draft.input_snapshot_json)
    if manifest.normalize_snapshot(snapshot) != draft.input_snapshot_json:
        raise ManifestValidationError("input snapshot is not canonical for its manifest")
    if draft.input_hash != _sha256_id("input_", snapshot):
        raise ManifestValidationError("input snapshot hash mismatch")
    expected_evaluation_id = _evaluation_id(
        draft.observation_id,
        draft.observation_stage,
        manifest,
        draft.policy_version,
        draft.input_hash,
        schema_version=draft.schema_version,
    )
    if draft.evaluation_id != expected_evaluation_id:
        raise EvaluationError("evaluation_id does not match canonical record fields")
    if (not all(type(item) is str for item in draft.evidence_ids)
            or tuple(sorted({_nfc(item) for item in draft.evidence_ids},
                            key=lambda item: item.encode("utf-8"))) != draft.evidence_ids):
        raise EvaluationError("evidence identifiers are not canonical strings")


def _evaluation_id(observation: str, stage: str, manifest: EngineInputManifest,
                   policy_version: str, input_hash: str, *,
                   schema_version: str = EVALUATION_SCHEMA_VERSION) -> str:
    return _sha256_id("eval_", {
        "schema_version": schema_version,
        "observation_id": observation,
        "observation_stage": stage,
        "engine_version": manifest.engine_version,
        "policy_version": policy_version,
        "input_hash": input_hash,
    })


def _to_exact_decimal(value: float | int | None) -> str | None:
    if value is None:
        return None
    return str(value)


def _evidence_payload(value: Any) -> Any:
    return asdict(value) if value is not None and is_dataclass(value) else None


def assessment_input_snapshot(assessment: MaterialityAssessment) -> dict[str, Any]:
    return {
        "event_type": assessment.event_type,
        "corroboration_count": assessment.corroboration_count,
        "best_evidence_tier": assessment.best_evidence_tier,
        "mandatory_class": assessment.mandatory_class,
        "inputs_present": list(assessment.inputs_present),
        "first_seen": assessment.first_seen,
        "editorial_score": _to_exact_decimal(assessment.editorial_score),
        "source_count": assessment.source_count,
        "companies_count": assessment.companies_count,
        "industries_count": assessment.industries_count,
        "source_evidence": _evidence_payload(assessment.source_evidence),
        "breadth_evidence": _evidence_payload(assessment.breadth_evidence),
        "figure_evidence": _evidence_payload(assessment.figure_evidence),
        "reasons": [asdict(EvaluationReason(r.factor, r.detail, r.available))
                    for r in assessment.reasons],
    }


def _normalize_event_time(value: str | None) -> str:
    if not value:
        raise EvaluationError("assessment first_seen is required; capture will not fabricate it")
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        if parsed.tzinfo is None:
            raise ValueError("naive")
        return utc_timestamp(parsed)
    except Exception as exc:
        raise EvaluationError("assessment first_seen is not a valid aware timestamp") from exc


def initial_revision_draft(
    assessment: MaterialityAssessment,
    *,
    observation_stage: str,
    cycle_id: str,
    source_system_namespace: str,
    decision_completed_at: datetime,
    evidence_ids: Iterable[str] = (),
    manifest: EngineInputManifest = MATERIALITY_INPUT_MANIFEST,
) -> EvaluationRevisionDraft:
    identity_payload = {
        "observation_identity_schema_version": OBSERVATION_IDENTITY_SCHEMA_VERSION,
        "source_system_namespace": source_system_namespace,
        "cycle_id": cycle_id,
        "observation_stage": observation_stage,
        "cycle_local_event_id": assessment.event_id,
        "durable_event_uid": assessment.event_uid,
        "contributing_ids": list(assessment.contributing_ids),
        "contributing_event_uids": list(assessment.contributing_event_uids),
    }
    oid = observation_id(identity_payload)
    snapshot_json = manifest.normalize_snapshot(assessment_input_snapshot(assessment))
    snapshot = json.loads(snapshot_json)
    input_hash = _sha256_id("input_", snapshot)
    eid = _evaluation_id(oid, observation_stage, manifest, assessment.policy_version, input_hash)
    now_text = utc_timestamp(decision_completed_at)
    reasons = tuple(sorted(
        (EvaluationReason(r.factor, r.detail, r.available) for r in assessment.reasons),
        key=lambda r: (r.factor, r.detail, r.available),
    ))
    evidence_values = tuple(evidence_ids)
    if not all(type(item) is str for item in evidence_values):
        raise EvaluationError("evidence identifiers must be strings")
    evidence = tuple(sorted(
        {_nfc(item) for item in evidence_values}, key=lambda item: item.encode("utf-8")))
    return EvaluationRevisionDraft(
        schema_version=EVALUATION_SCHEMA_VERSION,
        evaluation_id=eid,
        supersedes_revision_id=None,
        revision_sequence=0,
        observation_identity_schema_version=OBSERVATION_IDENTITY_SCHEMA_VERSION,
        observation_id=oid,
        observation_stage=observation_stage,
        source_system_namespace=_nfc(source_system_namespace),
        cycle_id=_nfc(cycle_id),
        cycle_local_event_id=_nfc(assessment.event_id),
        durable_event_uid=_nfc(assessment.event_uid) if assessment.event_uid else None,
        contributing_ids=tuple(canonical_observation_payload(identity_payload)["contributing_ids"]),
        contributing_event_uids=tuple(
            canonical_observation_payload(identity_payload)["contributing_event_uids"]),
        event_observed_at=_normalize_event_time(assessment.first_seen),
        decision_completed_at=now_text,
        record_created_at=now_text,
        engine_version=manifest.engine_version,
        policy_version=assessment.policy_version,
        input_schema_version=INPUT_SCHEMA_VERSION,
        feature_extractor_version=FEATURE_EXTRACTOR_VERSION,
        manifest_version=manifest.manifest_version,
        manifest_hash=manifest.manifest_hash,
        input_snapshot_json=snapshot_json,
        input_hash=input_hash,
        shadow_decision=assessment.state.value,
        materiality_rank=_to_exact_decimal(assessment.materiality_rank),
        decision_confidence=None,
        confidence_semantics="absent",
        expected_return_json=None,
        reasons=reasons,
        evidence_ids=evidence,
        outcome_target=None,
        outcome_horizon_at=None,
        outcome_unit=None,
        outcome_specification_version=OUTCOME_SPECIFICATION_VERSION,
        outcome_status="pending",
        outcome_json=None,
        evaluation_status="pending",
        status_reason_code=None,
    )


def attach_outcome(store: EvaluationStore, predecessor_revision_id: str,
                   outcome: OutcomePayload, *, created_at: datetime) -> EvaluationRecordRevision:
    predecessor = store.get(predecessor_revision_id)
    if predecessor is None:
        raise OutcomeValidationError("outcome predecessor does not exist")
    if predecessor.outcome_status != "pending":
        raise OutcomeValidationError("outcome predecessor is already resolved or excluded")
    _validate_outcome(predecessor, outcome)
    outcome_json = canonical_json_text(asdict(outcome))
    if outcome.status == "resolved":
        evaluation_status = "eligible"
        reason = None
    elif outcome.status in {"invalidated", "unavailable"}:
        evaluation_status = "excluded"
        reason = outcome.reason_code
    else:
        raise OutcomeValidationError("pending is represented by the initial revision")
    draft = _draft_from_record(
        predecessor,
        supersedes_revision_id=predecessor.revision_id,
        revision_sequence=predecessor.revision_sequence + 1,
        record_created_at=utc_timestamp(created_at),
        outcome_status=outcome.status,
        outcome_json=outcome_json,
        evaluation_status=evaluation_status,
        status_reason_code=reason,
    )
    children = [r for r in store.all() if r.supersedes_revision_id == predecessor.revision_id]
    for child in children:
        if child.revision_id == draft.revision_id:
            return child
    if children:
        raise RevisionConflictError("conflicting outcome attachment would fork the revision chain")
    return store.append(draft)


def _validate_outcome(record: EvaluationRecordRevision, outcome: OutcomePayload) -> None:
    if outcome.status not in {"resolved", "invalidated", "unavailable"}:
        raise OutcomeValidationError("invalid attachable outcome status")
    if outcome.outcome_specification_version != (record.outcome_specification_version
                                                  or OUTCOME_SPECIFICATION_VERSION):
        raise OutcomeValidationError("outcome specification mismatch")
    if outcome.status == "resolved":
        required = (outcome.target_identifier, outcome.horizon_at, outcome.resolved_at,
                    outcome.information_available_at, outcome.unit)
        if any(value is None for value in required):
            raise OutcomeValidationError("resolved outcome is incomplete")
        if record.outcome_target is not None and outcome.target_identifier != record.outcome_target:
            raise OutcomeValidationError("outcome target mismatch")
        if record.outcome_horizon_at is not None and outcome.horizon_at != record.outcome_horizon_at:
            raise OutcomeValidationError("outcome horizon mismatch")
        if record.outcome_unit is not None and outcome.unit != record.outcome_unit:
            raise OutcomeValidationError("outcome unit mismatch")
        horizon = parse_utc_timestamp(outcome.horizon_at or "")
        resolved = parse_utc_timestamp(outcome.resolved_at or "")
        information = parse_utc_timestamp(outcome.information_available_at or "")
        if resolved < horizon:
            raise OutcomeValidationError("outcome resolved before its declared horizon")
        if information > resolved:
            raise OutcomeValidationError("outcome contains future-information leakage")
        for value in (outcome.observed_value, outcome.observed_return):
            if value is not None and not _DECIMAL_RE.fullmatch(value):
                raise OutcomeValidationError("outcome numeric values must be exact decimal strings")
    elif not outcome.reason_code:
        raise OutcomeValidationError("excluded outcomes require a stable reason code")


def _validate_outcome_transition(
    draft: EvaluationRevisionDraft,
    predecessor: EvaluationRecordRevision | None,
) -> None:
    if predecessor is None:
        if (draft.outcome_status != "pending" or draft.outcome_json is not None
                or draft.evaluation_status != "pending" or draft.status_reason_code is not None):
            raise OutcomeValidationError("initial revision must be pending without an outcome")
        return
    if predecessor.outcome_status != "pending":
        raise OutcomeValidationError("outcome successor requires a pending predecessor")
    if draft.outcome_status == "pending":
        raise OutcomeValidationError("successor revision cannot remain pending")
    if draft.outcome_json is None:
        raise OutcomeValidationError("outcome successor requires a complete outcome payload")
    try:
        payload = json.loads(draft.outcome_json)
        if not isinstance(payload, dict):
            raise TypeError("outcome payload must be an object")
        outcome = OutcomePayload(**payload)
    except Exception as exc:
        raise OutcomeValidationError("outcome successor contains a malformed payload") from exc
    if canonical_json_text(asdict(outcome)) != draft.outcome_json:
        raise OutcomeValidationError("outcome payload is not canonical")
    if outcome.status != draft.outcome_status:
        raise OutcomeValidationError("outcome payload status does not match revision status")
    _validate_outcome(predecessor, outcome)
    if draft.outcome_status == "resolved":
        if draft.evaluation_status != "eligible" or draft.status_reason_code is not None:
            raise OutcomeValidationError("resolved outcome must create an eligible revision")
    elif draft.outcome_status in {"invalidated", "unavailable"}:
        if (draft.evaluation_status != "excluded" or not draft.status_reason_code
                or draft.status_reason_code != outcome.reason_code):
            raise OutcomeValidationError(
                "invalidated or unavailable outcome must be explicitly excluded")


class ReplayRegistry:
    def __init__(self) -> None:
        self._handlers: dict[tuple[str, str, str, str, str],
                             tuple[EngineInputManifest, Callable[[Mapping[str, Any]], DecisionReplay]]] = {}

    def register(self, *, engine_version: str, policy_version: str,
                 input_schema_version: str, feature_extractor_version: str,
                 manifest: EngineInputManifest,
                 handler: Callable[[Mapping[str, Any]], DecisionReplay]) -> None:
        key = (engine_version, policy_version, input_schema_version,
               feature_extractor_version, manifest.manifest_hash)
        if key in self._handlers:
            raise ReplayUnavailableError("replay version registration is immutable")
        self._handlers[key] = (manifest, handler)

    def resolve(self, record: EvaluationRecordRevision):
        key = (record.engine_version, record.policy_version, record.input_schema_version,
               record.feature_extractor_version, record.manifest_hash)
        try:
            return self._handlers[key]
        except KeyError as exc:
            raise ReplayUnavailableError("exact replay version is unavailable") from exc


def _current_replay(snapshot: Mapping[str, Any]) -> DecisionReplay:
    reasons = tuple(EvaluationReason(**row) for row in snapshot["reasons"])
    return DecisionReplay(
        shadow_decision="unresolved",
        materiality_rank=None,
        decision_confidence=None,
        confidence_semantics="absent",
        expected_return_json=None,
        reasons=reasons,
    )


DEFAULT_REPLAY_REGISTRY = ReplayRegistry()
DEFAULT_REPLAY_REGISTRY.register(
    engine_version=ENGINE_VERSION,
    policy_version=POLICY_VERSION,
    input_schema_version=INPUT_SCHEMA_VERSION,
    feature_extractor_version=FEATURE_EXTRACTOR_VERSION,
    manifest=MATERIALITY_INPUT_MANIFEST,
    handler=_current_replay,
)


def _replay(record: EvaluationRecordRevision,
            registry: ReplayRegistry) -> DecisionReplay:
    manifest, handler = registry.resolve(record)
    raw = json.loads(record.input_snapshot_json)
    canonical = manifest.normalize_snapshot(raw)
    if canonical != record.input_snapshot_json:
        raise ManifestValidationError("replay snapshot is not canonical for the recorded manifest")
    if _sha256_id("input_", raw) != record.input_hash:
        raise ManifestValidationError("replay input hash mismatch")
    result = handler(json.loads(canonical))
    expected = DecisionReplay(
        shadow_decision=record.shadow_decision,
        materiality_rank=record.materiality_rank,
        decision_confidence=record.decision_confidence,
        confidence_semantics=record.confidence_semantics,
        expected_return_json=record.expected_return_json,
        reasons=record.reasons,
    )
    if result.canonical_bytes() != expected.canonical_bytes():
        raise ReplayMismatchError("deterministic replay output differs from the immutable record")
    return result


def replay(record: EvaluationRecordRevision,
           registry: ReplayRegistry = DEFAULT_REPLAY_REGISTRY) -> DecisionReplay:
    try:
        return _replay(record, registry)
    except Exception:
        record_diagnostic(
            component="replay", operation="execute", error_code="replay_failure",
            detail_code="exact_replay_rejected", identifier_kind="evaluation_id",
            identifier_value=record.evaluation_id,
        )
        raise


@dataclass(frozen=True)
class DatasetSpecification:
    specification_version: str
    as_of_cutoff: str
    observation_stages: tuple[str, ...]
    engine_versions: tuple[str, ...]
    policy_versions: tuple[str, ...]
    input_schema_versions: tuple[str, ...]
    feature_extractor_versions: tuple[str, ...]
    outcome_specification_versions: tuple[str, ...] = ()
    allowed_evaluation_statuses: tuple[str, ...] = ("eligible", "scored")
    observed_from: str | None = None
    observed_through: str | None = None

    def __post_init__(self) -> None:
        parse_utc_timestamp(self.as_of_cutoff)
        set_fields = (
            "observation_stages", "engine_versions", "policy_versions",
            "input_schema_versions", "feature_extractor_versions",
            "outcome_specification_versions", "allowed_evaluation_statuses",
        )
        for name in set_fields:
            value = getattr(self, name)
            if not isinstance(value, (list, tuple)) or not all(
                    isinstance(item, str) for item in value):
                raise EvaluationError(f"{name} must contain only strings")
            object.__setattr__(self, name, tuple(sorted(
                {_nfc(item) for item in value}, key=lambda item: item.encode("utf-8"))))
        if len(self.observation_stages) != 1 or self.observation_stages[0] not in _STAGES:
            raise EvaluationError("a dataset specification must select exactly one observation stage")
        for value in (self.observed_from, self.observed_through):
            if value is not None:
                parse_utc_timestamp(value)


@dataclass(frozen=True)
class DatasetExclusion:
    evaluation_id: str
    reason_code: str
    conflicting_revision_ids: tuple[str, ...] = ()


@dataclass(frozen=True)
class EvaluationDataset:
    dataset_id: str
    records: tuple[EvaluationRecordRevision, ...]
    exclusions: tuple[DatasetExclusion, ...]
    manifest_json: str
    dataset_json: str


def _generate_dataset(revisions: Iterable[EvaluationRecordRevision],
                      specification: DatasetSpecification) -> EvaluationDataset:
    cutoff = parse_utc_timestamp(specification.as_of_cutoff)
    visible = [r for r in revisions if parse_utc_timestamp(r.available_at) <= cutoff]
    grouped: dict[str, list[EvaluationRecordRevision]] = {}
    for record in visible:
        grouped.setdefault(record.evaluation_id, []).append(record)
    selected: list[EvaluationRecordRevision] = []
    exclusions: list[DatasetExclusion] = []
    for eid in sorted(grouped):
        records = grouped[eid]
        chosen, exclusion = _select_visible_revision(eid, records)
        if exclusion:
            exclusions.append(exclusion)
            continue
        assert chosen is not None
        reason = _dataset_exclusion_reason(chosen, specification)
        if reason:
            exclusions.append(DatasetExclusion(eid, reason))
        else:
            selected.append(chosen)
    selected.sort(key=lambda r: (
        r.event_observed_at, r.observation_id, r.observation_stage,
        r.evaluation_id, r.revision_id,
    ))
    exclusions.sort(key=lambda e: (e.evaluation_id, e.reason_code, e.conflicting_revision_ids))
    spec_payload = asdict(specification)
    manifest = {
        "specification": spec_payload,
        "included_revision_ids": [r.revision_id for r in selected],
        "exclusions": [asdict(e) for e in exclusions],
        "included_count": len(selected),
        "excluded_count": len(exclusions),
    }
    dataset_id = _sha256_id("dataset_", manifest)
    manifest["dataset_id"] = dataset_id
    dataset_rows = [_record_payload(r) for r in selected]
    return EvaluationDataset(
        dataset_id=dataset_id,
        records=tuple(selected),
        exclusions=tuple(exclusions),
        manifest_json=canonical_json_text(manifest),
        dataset_json=canonical_json_text(dataset_rows),
    )


def generate_dataset(revisions: Iterable[EvaluationRecordRevision],
                     specification: DatasetSpecification) -> EvaluationDataset:
    try:
        return _generate_dataset(revisions, specification)
    except Exception:
        record_diagnostic(
            component="dataset", operation="generate", error_code="dataset_failure",
            detail_code="dataset_generation_rejected",
        )
        raise


def _select_visible_revision(evaluation_id: str, records: list[EvaluationRecordRevision]):
    by_id = {r.revision_id: r for r in records}
    if len(by_id) != len(records):
        return None, DatasetExclusion(evaluation_id, "duplicate_revision")
    roots = [r for r in records if r.supersedes_revision_id is None]
    invalid = len(roots) != 1 or roots[0].revision_sequence != 0
    children: dict[str, list[EvaluationRecordRevision]] = {}
    by_sequence: dict[int, list[EvaluationRecordRevision]] = {}
    for record in records:
        by_sequence.setdefault(record.revision_sequence, []).append(record)
        if record.supersedes_revision_id is not None:
            parent = by_id.get(record.supersedes_revision_id)
            if parent is None or record.revision_sequence != parent.revision_sequence + 1:
                invalid = True
            else:
                if (parse_utc_timestamp(record.available_at)
                        < parse_utc_timestamp(parent.available_at)):
                    invalid = True
                children.setdefault(parent.revision_id, []).append(record)
    conflicts: set[str] = set()
    for siblings in children.values():
        if len(siblings) > 1:
            conflicts.update(r.revision_id for r in siblings)
    for peers in by_sequence.values():
        if len(peers) > 1:
            conflicts.update(r.revision_id for r in peers)
    if conflicts:
        return None, DatasetExclusion(
            evaluation_id, "ambiguous_revision_fork", tuple(sorted(conflicts)))
    if invalid:
        return None, DatasetExclusion(evaluation_id, "invalid_revision_chain")
    # With one root, one child per node, strict sequence increments, and no repeated
    # sequence, the visible graph is a finite acyclic linear chain.
    return max(records, key=lambda r: r.revision_sequence), None


def _dataset_exclusion_reason(record: EvaluationRecordRevision,
                              spec: DatasetSpecification) -> str | None:
    if record.observation_stage not in spec.observation_stages:
        return "observation_stage_excluded"
    if record.engine_version not in spec.engine_versions:
        return "engine_version_excluded"
    if record.policy_version not in spec.policy_versions:
        return "policy_version_excluded"
    if record.input_schema_version not in spec.input_schema_versions:
        return "input_schema_version_excluded"
    if record.feature_extractor_version not in spec.feature_extractor_versions:
        return "feature_extractor_version_excluded"
    if record.evaluation_status not in spec.allowed_evaluation_statuses:
        return "evaluation_status_excluded"
    if (spec.outcome_specification_versions and
            record.outcome_specification_version not in spec.outcome_specification_versions):
        return "outcome_specification_version_excluded"
    observed = parse_utc_timestamp(record.event_observed_at)
    if spec.observed_from and observed < parse_utc_timestamp(spec.observed_from):
        return "before_observation_window"
    if spec.observed_through and observed > parse_utc_timestamp(spec.observed_through):
        return "after_observation_window"
    if record.outcome_status != "resolved" and record.evaluation_status in {"eligible", "scored"}:
        return "outcome_not_resolved"
    return None


@dataclass(frozen=True)
class CaptureRequest:
    assessment: MaterialityAssessment
    observation_stage: str
    cycle_id: str
    source_system_namespace: str
    decision_completed_at: str


class ShadowEvaluationCapture:
    """Bounded fail-open handoff from completed shadow inference to C1 storage."""

    def __init__(self, store: EvaluationStore, *, maxsize: int = 512,
                 start_worker: bool = True) -> None:
        self.store = store
        self.queue: queue.Queue[CaptureRequest] = queue.Queue(maxsize=maxsize)
        self.submitted = 0
        self.stored = 0
        self.dropped = 0
        self.failed = 0
        self._worker: threading.Thread | None = None
        if start_worker:
            self._worker = threading.Thread(target=self._run, name="materiality-evaluation", daemon=True)
            self._worker.start()

    def submit(self, result: MaterialityShadowResult, *, cycle_id: str,
               source_system_namespace: str,
               decision_completed_at: datetime) -> int:
        requests = [
            *(CaptureRequest(a, "qualified_pre_admission", cycle_id, source_system_namespace,
                             utc_timestamp(decision_completed_at)) for a in result.pre_admission),
            *(CaptureRequest(a, "canonical_post_identity", cycle_id, source_system_namespace,
                             utc_timestamp(decision_completed_at)) for a in result.admitted),
        ]
        accepted = 0
        for request in requests:
            try:
                self.queue.put_nowait(request)
                self.submitted += 1
                accepted += 1
            except queue.Full:
                self.dropped += 1
                record_diagnostic(
                    component="capture", operation="submit", error_code="queue_saturated",
                    detail_code="capture_dropped",
                )
                log.warning("[materiality:evaluation] bounded queue saturated; capture dropped")
        return accepted

    def _process(self, request: CaptureRequest) -> None:
        completed = parse_utc_timestamp(request.decision_completed_at)
        try:
            draft = initial_revision_draft(
                request.assessment,
                observation_stage=request.observation_stage,
                cycle_id=request.cycle_id,
                source_system_namespace=request.source_system_namespace,
                decision_completed_at=completed,
            )
        except Exception:
            record_diagnostic(
                component="capture", operation="serialize",
                error_code="canonicalization_failure",
                detail_code="evaluation_record_rejected",
            )
            raise
        try:
            self.store.append(draft)
        except Exception:
            record_diagnostic(
                component="storage", operation="append", error_code="storage_failure",
                detail_code="evaluation_append_rejected", identifier_kind="evaluation_id",
                identifier_value=draft.evaluation_id,
            )
            raise
        self.stored += 1

    def drain(self) -> None:
        while True:
            try:
                request = self.queue.get_nowait()
            except queue.Empty:
                return
            try:
                self._process(request)
            except Exception:
                self.failed += 1
                log.exception("[materiality:evaluation] capture failed; inference remains unaffected")
            finally:
                self.queue.task_done()

    def _run(self) -> None:
        while True:
            request = self.queue.get()
            try:
                self._process(request)
            except Exception:
                self.failed += 1
                log.exception("[materiality:evaluation] capture failed; inference remains unaffected")
            finally:
                self.queue.task_done()


_CAPTURE_LOCK = threading.Lock()
_CAPTURE_SERVICE: ShadowEvaluationCapture | None = None


def _capture_service() -> ShadowEvaluationCapture:
    global _CAPTURE_SERVICE
    with _CAPTURE_LOCK:
        if _CAPTURE_SERVICE is None:
            _CAPTURE_SERVICE = ShadowEvaluationCapture(EvaluationStore())
        return _CAPTURE_SERVICE


def enqueue_shadow_evaluation(result: MaterialityShadowResult, *, cycle_id: str,
                              decision_completed_at: datetime) -> int:
    """Fail-open production hook. Disabled by default and never raises to inference."""
    try:
        from app.config import settings

        if not settings.materiality_evaluation_enabled:
            return 0
        return _capture_service().submit(
            result,
            cycle_id=cycle_id,
            source_system_namespace=settings.materiality_evaluation_namespace,
            decision_completed_at=decision_completed_at,
        )
    except Exception:
        record_diagnostic(
            component="capture", operation="enqueue", error_code="enqueue_failure",
            detail_code="evaluation_disabled_for_cycle",
        )
        log.exception("[materiality:evaluation] enqueue failed; inference remains unaffected")
        return 0


__all__ = [
    "CanonicalizationError", "DatasetExclusion", "DatasetSpecification",
    "DecisionReplay", "ENGINE_VERSION", "EngineInputManifest", "EvaluationDataset",
    "EVALUATION_DIAGNOSTICS", "EvaluationDiagnostic", "EvaluationDiagnostics",
    "EvaluationError", "EvaluationReason", "EvaluationRecordRevision",
    "EvaluationRevisionDraft", "EvaluationStore", "FEATURE_EXTRACTOR_VERSION",
    "INPUT_SCHEMA_VERSION", "MATERIALITY_INPUT_MANIFEST", "ManifestField",
    "ManifestValidationError", "OBSERVATION_IDENTITY_SCHEMA_VERSION", "OutcomePayload",
    "OutcomeValidationError", "ReplayMismatchError", "ReplayRegistry",
    "ReplayUnavailableError", "RevisionChainError", "RevisionConflictError",
    "ShadowEvaluationCapture", "attach_outcome", "canonical_json_bytes",
    "canonical_json_text", "canonical_observation_payload", "enqueue_shadow_evaluation",
    "generate_dataset", "initial_revision_draft", "observation_id", "parse_utc_timestamp",
    "record_diagnostic", "replay", "utc_timestamp", "validate_observation_id",
]
