"""
app/materiality_activation_runtime.py — Wave 0.4 A2: activation integration seam
(ADVISORY, read-only, governs NOTHING).

Once per full background cycle, WHEN the runtime gate is enabled, this module:

  1. independently assembles the four A1 resolver inputs, each with its own
     fail-closed default (a failure in one cannot affect the others):
       • ActivationConfiguration  ← ActivationConfigurationStore.current()  → safe/disabled
       • readiness                ← read-only durable provider              → None
       • kill_signal              ← read-only durable kill file             → engaged
       • ActivationSpecification  ← frozen ACTIVATION_SPECIFICATION_V1;
  2. calls A1's AUTHORITATIVE resolve_and_audit exactly once (frozen A1 store writes
     DATA_DIR/materiality_activation/activation-audit.jsonl);
  3. updates the read-only accessor ONLY after both resolution and durable audit
     succeed;
  4. converts every failure into bounded structured diagnostics; never raises.

The resolved ActivationState is OBSERVED, never APPLIED. It is read by no production
consumer: background's `_mat_mode = effective_mode(settings.materiality_mode)` remains
the sole behavioral authority. This module is imported only by app/background.py (the
lone production importer) and by tests. A1 and C1–C4 are frozen and unmodified.
"""

from __future__ import annotations

import copy
import json
import threading
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

from app.materiality_activation import (
    ACTIVATION_SPECIFICATION_V1,
    MODE_DISABLED,
    ActivationAuditError,
    ActivationAuditStore,
    ActivationSpecification,
    ActivationState,
    resolve,
)
from app.materiality_activation_config import (
    SAFE_CONFIGURATION,
    ActivationConfigurationStore,
    record_diagnostic,
)
from app.materiality_evaluation import utc_timestamp
from app.storage import ACTIVATION_DIR, EVALUATION_DIR

# ── Locked durable paths (D3), resolved from the canonical durable data root ───
DEFAULT_CONFIG_PATH = ACTIVATION_DIR / "configuration.jsonl"
DEFAULT_KILL_PATH = ACTIVATION_DIR / "kill_signal.json"
DEFAULT_AUDIT_DIR = ACTIVATION_DIR                       # A1 store → activation-audit.jsonl
# C4 readiness is READ-ONLY here and never written by A2. No durable readiness exists
# in the current engine, so this lookup yields None (evidence ceiling = shadow).
DEFAULT_READINESS_PATH = EVALUATION_DIR / "readiness_snapshot.json"


def _now() -> datetime:
    return datetime.now(timezone.utc)


# ── Read-only readiness provider (D4) — never computes C4, only reads ──────────
@dataclass(frozen=True)
class _ReadinessSnapshot:
    """Minimal read-only carrier of exactly the fields A1's resolver reads."""
    readiness_result_id: str
    canonical_content_hash: str
    readiness_status: str


class DurableReadinessProvider:
    """Reads an already-persisted, immutable C4 readiness result if one exists.
    Never triggers C4 computation. Integrity gate: the C4 identity law
    ``readiness_result_id == "rdres_" + canonical_content_hash``. Any absence,
    corruption, or integrity failure → None (A1 then ceilings at shadow)."""

    _RESULT_ID_PREFIX = "rdres_"     # C4 ReadinessResult identity prefix (A2 imports no C4)

    def __init__(self, path: Path) -> None:
        self.path = Path(path)

    def get(self) -> _ReadinessSnapshot | None:
        try:
            raw = self.path.read_text(encoding="utf-8")
        except FileNotFoundError:
            record_diagnostic(component="activation_runtime", operation="readiness",
                              error_code="readiness_absent", detail_code="none")
            return None
        except OSError:
            record_diagnostic(component="activation_runtime", operation="readiness",
                              error_code="readiness_unreadable", detail_code="none")
            return None
        try:
            data = json.loads(raw)
        except (ValueError, TypeError):
            record_diagnostic(component="activation_runtime", operation="readiness",
                              error_code="readiness_malformed", detail_code="none")
            return None
        rid = data.get("readiness_result_id") if isinstance(data, dict) else None
        chash = data.get("canonical_content_hash") if isinstance(data, dict) else None
        status = data.get("readiness_status") if isinstance(data, dict) else None
        if not (isinstance(rid, str) and isinstance(chash, str) and isinstance(status, str)):
            record_diagnostic(component="activation_runtime", operation="readiness",
                              error_code="readiness_malformed", detail_code="none")
            return None
        if rid != self._RESULT_ID_PREFIX + chash:
            record_diagnostic(component="activation_runtime", operation="readiness",
                              error_code="readiness_hash_invalid", detail_code="none")
            return None
        return _ReadinessSnapshot(readiness_result_id=rid, canonical_content_hash=chash,
                                  readiness_status=status)


# ── Read-only kill-signal reader (D3) — reads only, never writes/clears ────────
def read_kill_signal(path: Path) -> bool:
    """Return the operational kill value for A1's resolver: True (engaged) or False
    (not engaged). Exact shape ``{"engaged": true|false}`` only; anything absent,
    unreadable, malformed, wrong-type, missing-key, or extra-key → engaged (True)."""
    path = Path(path)
    try:
        raw = path.read_text(encoding="utf-8")
    except FileNotFoundError:
        record_diagnostic(component="activation_runtime", operation="kill",
                          error_code="kill_absent", detail_code="engaged")
        return True
    except OSError:
        record_diagnostic(component="activation_runtime", operation="kill",
                          error_code="kill_unreadable", detail_code="engaged")
        return True
    try:
        data = json.loads(raw)
    except (ValueError, TypeError):
        record_diagnostic(component="activation_runtime", operation="kill",
                          error_code="kill_malformed", detail_code="engaged")
        return True
    if (not isinstance(data, dict) or set(data.keys()) != {"engaged"}
            or not isinstance(data["engaged"], bool)):
        record_diagnostic(component="activation_runtime", operation="kill",
                          error_code="kill_malformed", detail_code="engaged")
        return True
    return data["engaged"]


# ── Independent, fail-closed input assembly ────────────────────────────────────
def _assemble_config(config_path: Path, spec: ActivationSpecification):
    try:
        return ActivationConfigurationStore(config_path, spec=spec).current()
    except Exception:
        record_diagnostic(component="activation_runtime", operation="config",
                          error_code="config_load_failed", detail_code="safe_default")
        return SAFE_CONFIGURATION


def _assemble_readiness(provider: DurableReadinessProvider):
    try:
        return provider.get()
    except Exception:
        record_diagnostic(component="activation_runtime", operation="readiness",
                          error_code="readiness_load_failed", detail_code="none")
        return None


def _assemble_kill(kill_path: Path) -> bool:
    try:
        return read_kill_signal(kill_path)
    except Exception:
        record_diagnostic(component="activation_runtime", operation="kill",
                          error_code="kill_read_failed", detail_code="engaged")
        return True


# ── Read-only accessor — latest SUCCESSFUL resolution, defensive snapshot ──────
_LATEST_LOCK = threading.RLock()
_latest_state: ActivationState | None = None


def _set_latest(state: ActivationState) -> None:
    global _latest_state
    with _LATEST_LOCK:
        _latest_state = state


def latest_activation_state() -> ActivationState | None:
    """A fresh, deep-copied immutable snapshot of the latest successfully
    resolved-and-audited ActivationState, or None if none has ever succeeded. A
    failed attempt does not replace the prior snapshot. Callers cannot mutate any
    cached internal state. Consumed only by observability — never by Feed, API,
    cache, MarketEvent, ProcessedFeed, Morning Brief, Intelligence Network, or the
    frontend."""
    with _LATEST_LOCK:
        state = _latest_state
    return copy.deepcopy(state) if state is not None else None


def reset_latest_activation_state() -> None:
    """Test-only reset of the process-local accessor."""
    global _latest_state
    with _LATEST_LOCK:
        _latest_state = None


# ── The once-per-cycle seam ────────────────────────────────────────────────────
def run_activation_cycle(enabled: bool, *,
                         config_path: Path = DEFAULT_CONFIG_PATH,
                         kill_path: Path = DEFAULT_KILL_PATH,
                         audit_dir: Path = DEFAULT_AUDIT_DIR,
                         readiness_provider: DurableReadinessProvider | None = None,
                         spec: ActivationSpecification = ACTIVATION_SPECIFICATION_V1,
                         actor: str = "runtime",
                         clock=None) -> ActivationState | None:
    """Resolve + audit the advisory ActivationState once. When ``enabled`` is False
    this is a COMPLETE no-op: no input assembly, no resolution, no audit, no accessor
    change, no diagnostics. Returns the resolved state (also stored in the accessor)
    on success, or None on no-op / isolated failure. Never raises."""
    if not enabled:
        return None
    if readiness_provider is None:
        readiness_provider = DurableReadinessProvider(DEFAULT_READINESS_PATH)

    # Independent assembly — each helper is internally fail-closed and never raises,
    # so the failure or absence of one input cannot prevent another from loading.
    config = _assemble_config(config_path, spec)
    readiness = _assemble_readiness(readiness_provider)
    kill_signal = _assemble_kill(kill_path)

    try:
        resolved_at = utc_timestamp((clock or _now)())
        state = resolve(config, spec, readiness, kill_signal, resolved_at=resolved_at)
        store = ActivationAuditStore(audit_dir, clock=clock)
        prior = store.audits
        last = prior[-1] if prior else None
        # Transition-only logical auditing. resolved_state_id is content-derived over
        # config / readiness / kill / resolved mode, so equality with the last durable
        # audit's resolved_state_id means NOTHING changed → write no new artifact. The
        # first observation (last is None) and every genuine transition write exactly
        # one artifact. This is durable: a restart reloads the journal, so unchanged
        # inputs after a restart also write nothing.
        if last is None or last.resolved_state_id != state.activation_state_id:
            from_mode = last.to_effective_mode if last else MODE_DISABLED
            store.record(from_effective_mode=from_mode, state=state, actor=actor)
    except ActivationAuditError:
        record_diagnostic(component="activation_runtime", operation="audit",
                          error_code="audit_persist_failed", detail_code="fail_closed")
        return None                                    # accessor NOT updated on failure
    except Exception:
        record_diagnostic(component="activation_runtime", operation="resolve",
                          error_code="resolution_failed", detail_code="isolated")
        return None

    # Accessor updates ONLY after a successful resolution and (for a transition) a
    # durable audit. On an unchanged cycle the state equals the last durably-audited
    # state, so it remains the latest successful resolution.
    _set_latest(state)
    return state
