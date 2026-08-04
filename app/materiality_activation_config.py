"""
app/materiality_activation_config.py — Wave 0.4 A2: activation configuration source
(ADVISORY, read-only over A1).

The runtime seam (app/materiality_activation_runtime.py) reads operator intent ONLY
through the immutable ``ActivationConfigurationStore`` defined here — never by reading
arbitrary JSON. The store mirrors A1's ``ActivationAuditStore`` discipline:

  • append-only, content-addressed journal of A1 ``ActivationConfiguration`` artifacts;
  • earlier entries are never modified or deleted;
  • ``current()`` returns the latest COHERENT entry (or the canonical safe config);
  • superseding intent APPENDS a new entry;
  • writes materialize the full journal to a sibling temp file, flush + fsync, then
    ``os.replace()`` — a crash leaves either the old or the new complete journal;
  • reload validation is deterministic (presence → parse → id → spec → mode/canary →
    engine/policy → select last coherent);
  • torn / tampered / incompatible entries are skipped with bounded diagnostics;
  • store failures NEVER raise into the background pipeline.

A1 (app/materiality_activation.py) is frozen and imported, never modified. This module
changes no production behavior: it is imported only by the A2 runtime seam and by tests.
"""

from __future__ import annotations

import json
import os
import re
import threading
from collections import OrderedDict
from dataclasses import dataclass, replace
from datetime import datetime, timezone
from pathlib import Path

from app.materiality_activation import (
    ACTIVATION_SPECIFICATION_V1,
    CANARY_SUBJECT_KIND,
    MODE_CANARY,
    MODE_DISABLED,
    ROLLBACK_CONFIGURATION_V1,
    ActivationConfiguration,
    ActivationSpecification,
)
from app.materiality_evaluation import canonical_json_text, utc_timestamp

# ── Bounded, coalescing operational diagnostics (outside canonical artifacts) ──
# Shared by the config store and the runtime seam. Stable tokens only; no secrets,
# no arbitrary repr. Bounded + coalesced so a hot failure path cannot grow memory.
_TOKEN = re.compile(r"[A-Za-z0-9_.:-]{1,128}")


@dataclass(frozen=True)
class ActivationDiagnostic:
    component: str
    operation: str
    error_code: str
    detail_code: str
    occurrence_count: int
    last_seen_at: str


class ActivationDiagnostics:
    def __init__(self, max_entries: int = 128) -> None:
        if max_entries < 1:
            raise ValueError("max_entries must be positive")
        self.max_entries = max_entries
        self._entries: OrderedDict[tuple[str, ...], ActivationDiagnostic] = OrderedDict()
        self._lock = threading.RLock()

    @staticmethod
    def _token(value: str) -> str:
        if not isinstance(value, str) or not _TOKEN.fullmatch(value):
            raise ValueError("diagnostic field is not a bounded stable token")
        return value

    def record(self, *, component: str, operation: str, error_code: str, detail_code: str,
               observed_at: datetime | None = None) -> ActivationDiagnostic:
        key = (self._token(component), self._token(operation),
               self._token(error_code), self._token(detail_code))
        stamp = utc_timestamp(observed_at or datetime.now(timezone.utc))
        with self._lock:
            existing = self._entries.get(key)
            if existing is None:
                entry = ActivationDiagnostic(*key, occurrence_count=1, last_seen_at=stamp)
                self._entries[key] = entry
                if len(self._entries) > self.max_entries:
                    self._entries.popitem(last=False)
            else:
                entry = replace(existing, occurrence_count=existing.occurrence_count + 1,
                                last_seen_at=stamp)
                self._entries[key] = entry
            return entry

    def snapshot(self) -> tuple[ActivationDiagnostic, ...]:
        with self._lock:
            return tuple(self._entries.values())

    def clear(self) -> None:
        with self._lock:
            self._entries.clear()


DIAGNOSTICS = ActivationDiagnostics()


def record_diagnostic(**kwargs) -> None:
    """Never raises. A malformed diagnostic is itself coalesced into a safe entry."""
    try:
        DIAGNOSTICS.record(**kwargs)
    except Exception:
        try:
            DIAGNOSTICS.record(component="activation_config", operation="record",
                               error_code="diagnostic_rejected", detail_code="unsafe_fields")
        except Exception:
            pass


# ── Canonical safe configuration ──────────────────────────────────────────────
# Disabled, no activation authority, no readiness authority, no canary. Contract-
# compatible engine/policy placeholders that grant nothing (activation_flag=False).
SAFE_CONFIGURATION = ActivationConfiguration(
    configuration_version="a2-safe-default-v1",
    requested_mode=MODE_DISABLED,
    evaluation_flag=False,
    activation_flag=False,
    canary_scope={},
    engine_version="argus-current",
    policy_version="argus-current",
    activation_specification_id=ACTIVATION_SPECIFICATION_V1.activation_specification_id,
    required_readiness_result_id="",
    required_readiness_hash="",
    rollback_configuration_id=ROLLBACK_CONFIGURATION_V1.rollback_configuration_id,
    feature_flags={},
    metadata="",
)

# The persisted fields of an ActivationConfiguration (identity + non-identity lineage).
_CONFIG_FIELDS = (
    "configuration_version", "requested_mode", "evaluation_flag", "activation_flag",
    "canary_scope", "engine_version", "policy_version", "activation_specification_id",
    "required_readiness_result_id", "required_readiness_hash", "rollback_configuration_id",
    "feature_flags", "metadata",
)


def _serialize(config: ActivationConfiguration) -> str:
    row = {field: getattr(config, field) for field in _CONFIG_FIELDS}
    row["activation_configuration_id"] = config.activation_configuration_id
    return canonical_json_text(row)


def _deserialize(data: dict) -> ActivationConfiguration:
    # KeyError / TypeError / ValueError here mean a malformed line; the caller skips it.
    return ActivationConfiguration(**{field: data[field] for field in _CONFIG_FIELDS})


def config_coherent(config: ActivationConfiguration,
                    spec: ActivationSpecification) -> tuple[bool, str]:
    """Structural coherence (no readiness) — mirrors A1's resolver validation so the
    store only ever surfaces a configuration A1 would itself accept structurally."""
    if config.activation_specification_id != spec.activation_specification_id:
        return False, "spec_mismatch"
    if config.requested_mode not in spec.allowed_modes:
        return False, "mode_not_allowed"
    if not config.rollback_configuration_id:
        return False, "rollback_missing"
    if spec.required_engine_versions and config.engine_version not in spec.required_engine_versions:
        return False, "engine_incompatible"
    if spec.required_policy_versions and config.policy_version not in spec.required_policy_versions:
        return False, "policy_incompatible"
    bps = config.canary_scope.get("canary_bps")
    if config.requested_mode == MODE_CANARY or bps is not None:
        if (type(bps) is not int
                or bps < spec.canary_bounds["min_bps"]
                or bps > spec.canary_bounds["max_bps"]
                or config.canary_scope.get("subject_kind") != CANARY_SUBJECT_KIND):
            return False, "invalid_canary_scope"
    return True, ""


class ActivationConfigurationStore:
    """Append-only, content-addressed, tamper-evident operator-intent journal."""

    def __init__(self, path: Path, *,
                 spec: ActivationSpecification = ACTIVATION_SPECIFICATION_V1) -> None:
        self.path = Path(path)
        self.spec = spec
        self._lock = threading.RLock()
        self._entries: list[ActivationConfiguration] = []
        self._by_id: dict[str, ActivationConfiguration] = {}
        self._load()

    # 1 presence/readability → 2 parse → 3 id → 4 spec → 5 mode/canary → 6 engine/policy → 7 select
    def _load(self) -> None:
        self._entries = []
        self._by_id = {}
        if not self.path.exists():
            return
        try:
            text = self.path.read_text(encoding="utf-8")
        except OSError:
            record_diagnostic(component="activation_config", operation="reload",
                              error_code="journal_unreadable", detail_code="io_error")
            return
        coherent: list[ActivationConfiguration] = []
        for line in text.splitlines():
            if not line.strip():
                continue
            try:
                data = json.loads(line)
            except (ValueError, TypeError):
                record_diagnostic(component="activation_config", operation="reload",
                                  error_code="entry_skipped", detail_code="parse_error")
                continue
            if not isinstance(data, dict):
                record_diagnostic(component="activation_config", operation="reload",
                                  error_code="entry_skipped", detail_code="not_object")
                continue
            stored_id = data.get("activation_configuration_id")
            try:
                config = _deserialize(data)
            except (KeyError, TypeError, ValueError):
                record_diagnostic(component="activation_config", operation="reload",
                                  error_code="entry_skipped", detail_code="malformed_fields")
                continue
            if config.activation_configuration_id != stored_id:
                record_diagnostic(component="activation_config", operation="reload",
                                  error_code="entry_skipped", detail_code="id_mismatch")
                continue
            ok, reason = config_coherent(config, self.spec)
            if not ok:
                record_diagnostic(component="activation_config", operation="reload",
                                  error_code="entry_skipped", detail_code=reason)
                continue
            coherent.append(config)
        self._entries = coherent
        self._by_id = {c.activation_configuration_id: c for c in coherent}

    def _atomic_write(self, entries: list[ActivationConfiguration]) -> None:
        # Create the isolated directory only here — a write. Reads never create it.
        self.path.parent.mkdir(parents=True, exist_ok=True)
        tmp = self.path.with_name(self.path.name + ".tmp")
        with open(tmp, "w", encoding="utf-8") as handle:
            for entry in entries:
                handle.write(_serialize(entry) + "\n")
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(tmp, self.path)          # atomic: old-or-new, never partial

    def append(self, config: ActivationConfiguration) -> ActivationConfiguration:
        """Append a new operator-intent entry. Coherence-validated BEFORE persistence;
        incoherent intent is rejected (ValueError). Idempotent by
        activation_configuration_id — re-appending identical intent is a no-op."""
        ok, reason = config_coherent(config, self.spec)
        if not ok:
            raise ValueError(f"incoherent activation configuration: {reason}")
        with self._lock:
            existing = self._by_id.get(config.activation_configuration_id)
            if existing is not None:
                return existing
            new_entries = self._entries + [config]
            self._atomic_write(new_entries)
            self._entries = new_entries
            self._by_id[config.activation_configuration_id] = config
            return config

    def current(self) -> ActivationConfiguration:
        """The latest coherent entry, or the canonical safe configuration when the
        journal is absent, unreadable, or holds no coherent entry."""
        with self._lock:
            return self._entries[-1] if self._entries else SAFE_CONFIGURATION

    @property
    def entries(self) -> tuple[ActivationConfiguration, ...]:
        with self._lock:
            return tuple(self._entries)
