"""
tests/test_materiality_activation.py — Wave 0.4 A1 activation architecture (advisory).

Backend-only, advisory, deterministic, read-only over C1-C4. The canary bucket
fixture is an INDEPENDENTLY pinned literal (computed once, hard-coded).
"""

from __future__ import annotations

import json
from types import SimpleNamespace

import pytest

from app.materiality_activation import (
    ACTIVATION_SPECIFICATION_V1,
    MODE_ACTIVE,
    MODE_CANARY,
    MODE_DISABLED,
    MODE_SHADOW,
    ROLLBACK_CONFIGURATION_V1,
    ActivationAuditStore,
    ActivationConfiguration,
    ActivationSpecification,
    RollbackConfiguration,
    canary_assignment_salt,
    canary_bucket,
    in_canary,
    resolve,
)

SPEC = ACTIVATION_SPECIFICATION_V1
RB_ID = ROLLBACK_CONFIGURATION_V1.rollback_configuration_id
RID = "rdres_pinned"
RHASH = "pinnedhash"

# Independently pinned canary fixture (computed once; hard-coded literals).
PINNED_SALT = "16bff1cc6c380712b3c14787fd42f772493a2aeacd63028f98c71a51eabee370"


def _ready(status="ready", rid=RID, rhash=RHASH):
    return SimpleNamespace(readiness_result_id=rid, canonical_content_hash=rhash,
                           readiness_status=status)


def _cfg(mode, *, spec=SPEC, activation_flag=True, evaluation_flag=True, canary_bps=None,
         engine="e", policy="p", rid=RID, rhash=RHASH, cfg_version="v1", metadata="",
         feature_flags=None):
    scope = ({"canary_bps": canary_bps, "subject_kind": "durable_event_uid"}
             if canary_bps is not None else {})
    return ActivationConfiguration(
        configuration_version=cfg_version, requested_mode=mode, evaluation_flag=evaluation_flag,
        activation_flag=activation_flag, canary_scope=scope, engine_version=engine,
        policy_version=policy, activation_specification_id=spec.activation_specification_id,
        required_readiness_result_id=rid, required_readiness_hash=rhash,
        rollback_configuration_id=RB_ID, feature_flags=feature_flags or {}, metadata=metadata)


# ── Canary assignment: pinned fixture + determinism ───────────────────────────

def test_canary_pinned_fixture():
    assert canary_assignment_salt("s", "e", "p") == PINNED_SALT
    assert canary_bucket(PINNED_SALT, "ev_1") == 4301          # independently pinned
    assert canary_bucket(PINNED_SALT, "ev_low") == 1227


def test_canary_salt_excludes_percentage_and_is_content_bound():
    a = canary_assignment_salt("spec1", "e1", "p1")
    assert a == canary_assignment_salt("spec1", "e1", "p1")    # deterministic
    assert a != canary_assignment_salt("spec2", "e1", "p1")    # spec-bound
    assert a != canary_assignment_salt("spec1", "e2", "p1")    # engine-bound
    assert a != canary_assignment_salt("spec1", "e1", "p2")    # policy-bound


def _bucket(cfg, uid):
    return canary_bucket(canary_assignment_salt(cfg.activation_specification_id,
                                                cfg.engine_version, cfg.policy_version), uid)


def test_canary_membership_and_boundaries():
    cfg0 = _cfg(MODE_CANARY, canary_bps=0)
    cfg_all = _cfg(MODE_CANARY, canary_bps=10000)
    assert in_canary(cfg0, SPEC, "ev_1") is False              # 0 bps selects none
    assert in_canary(cfg_all, SPEC, "ev_1") is True            # 10000 bps selects every present subject
    assert in_canary(cfg_all, SPEC, None) is False             # identifier-less out-of-canary
    assert in_canary(cfg_all, SPEC, "") is False
    # exact half-open boundary: bucket < canary_bps
    b = _bucket(cfg0, "ev_1")
    assert in_canary(_cfg(MODE_CANARY, canary_bps=b), SPEC, "ev_1") is False       # bps == bucket → out
    assert in_canary(_cfg(MODE_CANARY, canary_bps=b + 1), SPEC, "ev_1") is True    # bps == bucket+1 → in


def test_canary_monotonic_ramp_no_reshuffle():
    subjects = [f"e{i}" for i in range(60)]
    lo = {s for s in subjects if in_canary(_cfg(MODE_CANARY, canary_bps=2000), SPEC, s)}
    hi = {s for s in subjects if in_canary(_cfg(MODE_CANARY, canary_bps=5000), SPEC, s)}
    assert lo and lo < hi                                      # upward ramp only ADDS members


def test_canary_membership_deterministic_and_order_invariant():
    subjects = [f"e{i}" for i in range(40)]
    cfg = _cfg(MODE_CANARY, canary_bps=5000)
    m1 = {s for s in subjects if in_canary(cfg, SPEC, s)}
    m2 = {s for s in reversed(subjects) if in_canary(cfg, SPEC, s)}
    assert m1 == m2                                            # worker/enumeration invariant


def test_canary_reshuffles_on_engine_change():
    subjects = [f"e{i}" for i in range(60)]
    a = {s for s in subjects if in_canary(_cfg(MODE_CANARY, canary_bps=5000, engine="e1"), SPEC, s)}
    b = {s for s in subjects if in_canary(_cfg(MODE_CANARY, canary_bps=5000, engine="e2"), SPEC, s)}
    assert a != b                                             # engine change reshuffles assignment


# ── Resolver ──────────────────────────────────────────────────────────────────

def test_resolve_ready_active():
    st = resolve(_cfg(MODE_ACTIVE), SPEC, _ready(), kill_signal=False)
    assert st.resolved_effective_mode == MODE_ACTIVE and st.evidence_ceiling == MODE_ACTIVE
    assert st.advisory is True and st.kill_switch_engaged is False


def test_resolve_current_engine_caps_at_shadow():
    st = resolve(_cfg(MODE_ACTIVE), SPEC, _ready(status="insufficient_evidence"), kill_signal=False)
    assert st.evidence_ceiling == MODE_SHADOW
    assert st.resolved_effective_mode == MODE_SHADOW          # active unreachable


def test_resolve_activation_flag_false_caps_at_shadow():
    st = resolve(_cfg(MODE_ACTIVE, activation_flag=False), SPEC, _ready(), kill_signal=False)
    assert st.resolved_effective_mode == MODE_SHADOW


def test_resolve_evaluation_flag_independent():
    on = resolve(_cfg(MODE_ACTIVE, evaluation_flag=True), SPEC, _ready(), kill_signal=False)
    off = resolve(_cfg(MODE_ACTIVE, evaluation_flag=False), SPEC, _ready(), kill_signal=False)
    assert on.resolved_effective_mode == off.resolved_effective_mode == MODE_ACTIVE


def test_resolve_min_requested_ceiling():
    assert resolve(_cfg(MODE_SHADOW), SPEC, _ready(), kill_signal=False).resolved_effective_mode == MODE_SHADOW
    assert resolve(_cfg(MODE_CANARY, canary_bps=1000), SPEC, _ready(), kill_signal=False).resolved_effective_mode == MODE_CANARY
    assert resolve(_cfg(MODE_DISABLED), SPEC, _ready(), kill_signal=False).resolved_effective_mode == MODE_DISABLED


def test_resolve_kill_switch_dominates():
    for sig in (True, None, "engaged", 1, object()):
        st = resolve(_cfg(MODE_ACTIVE), SPEC, _ready(), kill_signal=sig)
        assert st.resolved_effective_mode == MODE_DISABLED     # engaged/missing/malformed → disabled
        assert st.kill_switch_engaged is True and st.reason == "kill_switch"


def test_resolve_fails_closed():
    # spec mismatch
    bad_spec = ActivationConfiguration(
        configuration_version="v1", requested_mode=MODE_ACTIVE, evaluation_flag=True,
        activation_flag=True, canary_scope={}, engine_version="e", policy_version="p",
        activation_specification_id="actspec_WRONG", required_readiness_result_id=RID,
        required_readiness_hash=RHASH, rollback_configuration_id=RB_ID)
    assert resolve(bad_spec, SPEC, _ready(), kill_signal=False).reason == "validation_failed:spec_mismatch"
    # missing readiness id for active
    st = resolve(_cfg(MODE_ACTIVE, rid=""), SPEC, _ready(rid=""), kill_signal=False)
    assert st.resolved_effective_mode == MODE_DISABLED and "readiness_missing" in st.reason
    # readiness hash mismatch
    st = resolve(_cfg(MODE_ACTIVE), SPEC, _ready(rhash="OTHER"), kill_signal=False)
    assert "readiness_integrity" in st.reason
    # engine incompatible
    spec2 = ActivationSpecification(specification_version="v2", required_engine_versions=("e1",))
    st = resolve(_cfg(MODE_ACTIVE, spec=spec2, engine="e2"), spec2, _ready(), kill_signal=False)
    assert "engine_incompatible" in st.reason
    # invalid canary scope (out of bounds)
    st = resolve(_cfg(MODE_CANARY, canary_bps=20000), SPEC, _ready(), kill_signal=False)
    assert "invalid_canary_scope" in st.reason


def test_resolve_deterministic_state_id_clock_invariant():
    a = resolve(_cfg(MODE_ACTIVE), SPEC, _ready(), kill_signal=False, resolved_at="2026-01-01T00:00:00.000000Z")
    b = resolve(_cfg(MODE_ACTIVE), SPEC, _ready(), kill_signal=False, resolved_at="2099-09-09T00:00:00.000000Z")
    assert a.activation_state_id == b.activation_state_id      # resolved_at excluded from identity


# ── Artifact identity ─────────────────────────────────────────────────────────

def test_config_identity_content_only():
    a = _cfg(MODE_SHADOW)
    b = _cfg(MODE_SHADOW, cfg_version="v99", metadata="notes")
    assert a.activation_configuration_id == b.activation_configuration_id   # version/metadata NON-identity
    c = _cfg(MODE_ACTIVE)
    assert c.activation_configuration_id != a.activation_configuration_id   # content-sensitive


def test_config_feature_flags_order_invariant():
    a = _cfg(MODE_SHADOW, feature_flags={"x": True, "y": False})
    b = _cfg(MODE_SHADOW, feature_flags={"y": False, "x": True})
    assert a.activation_configuration_id == b.activation_configuration_id


def test_config_has_no_kill_switch_field():
    assert not hasattr(_cfg(MODE_SHADOW), "kill_switch_engaged")


def test_config_identity_unchanged_across_kill_cycles():
    cfg = _cfg(MODE_ACTIVE)
    engaged = resolve(cfg, SPEC, _ready(), kill_signal=True)
    cleared = resolve(cfg, SPEC, _ready(), kill_signal=False)
    assert engaged.activation_configuration_id == cleared.activation_configuration_id == cfg.activation_configuration_id


def test_rollback_configuration_v1():
    rb = ROLLBACK_CONFIGURATION_V1
    assert rb.safe_target_mode == MODE_DISABLED and rb.one_step is True
    assert rb.requires_migration is False and rb.kill_switch_binding is True
    assert rb.cache_compatible is True and rb.event_compatible is True
    assert rb.rollback_configuration_id.startswith("rbcfg_")
    # content-only identity (version excluded)
    assert RollbackConfiguration("other-version",
                                 rollback_triggers=rb.rollback_triggers).rollback_configuration_id \
        == rb.rollback_configuration_id


# ── Audit store ───────────────────────────────────────────────────────────────

def _store(tmp_path, when="2026-01-01T00:00:00.000000Z"):
    from datetime import datetime, timezone
    clk = datetime.fromisoformat(when.replace("Z", "+00:00")).astimezone(timezone.utc)
    return ActivationAuditStore(tmp_path / "audit", clock=lambda: clk)


def test_audit_exactly_one_per_resolution_and_kill_cycle(tmp_path):
    store = _store(tmp_path)
    cfg = _cfg(MODE_ACTIVE)
    st_on = resolve(cfg, SPEC, _ready(), kill_signal=False)
    a1 = store.record(from_effective_mode=MODE_DISABLED, state=st_on, actor="ops")
    st_off = resolve(cfg, SPEC, _ready(), kill_signal=True)
    a2 = store.record(from_effective_mode=st_on.resolved_effective_mode, state=st_off, actor="ops")
    assert len(store.audits) == 2                              # one audit per resolution
    assert a1.activation_configuration_id == a2.activation_configuration_id   # no new config
    assert a2.to_effective_mode == MODE_DISABLED and a2.reason == "kill_switch"


def test_audit_append_only_and_tamper_rejected(tmp_path):
    store = _store(tmp_path)
    st = resolve(_cfg(MODE_ACTIVE), SPEC, _ready(), kill_signal=False)
    audit = store.record(from_effective_mode=MODE_DISABLED, state=st, actor="ops")
    # reload OK
    ActivationAuditStore(tmp_path / "audit")
    # tamper: flip to_effective_mode so id no longer matches
    row = {"activation_audit_id": audit.activation_audit_id,
           "from_effective_mode": audit.from_effective_mode, "to_effective_mode": MODE_DISABLED,
           "activation_configuration_id": audit.activation_configuration_id,
           "activation_specification_id": audit.activation_specification_id,
           "resolved_state_id": audit.resolved_state_id, "actor": audit.actor,
           "reason": audit.reason, "transition_allowed": audit.transition_allowed,
           "timestamp": audit.timestamp}
    with open(store.path, "w", encoding="utf-8") as fh:
        fh.write(json.dumps(row) + "\n")
    with pytest.raises(ValueError):
        ActivationAuditStore(tmp_path / "audit")


def test_audit_timestamp_excluded_from_identity(tmp_path):
    from datetime import datetime, timezone
    st = resolve(_cfg(MODE_ACTIVE), SPEC, _ready(), kill_signal=False)
    s1 = ActivationAuditStore(tmp_path / "a1",
                              clock=lambda: datetime(2026, 1, 1, tzinfo=timezone.utc))
    s2 = ActivationAuditStore(tmp_path / "a2",
                              clock=lambda: datetime(2099, 1, 1, tzinfo=timezone.utc))
    a = s1.record(from_effective_mode=MODE_DISABLED, state=st, actor="ops")
    b = s2.record(from_effective_mode=MODE_DISABLED, state=st, actor="ops")
    assert a.activation_audit_id == b.activation_audit_id      # timestamp not in identity


# ── Isolation ─────────────────────────────────────────────────────────────────

def test_a1_no_activation_or_write_helper():
    import app.materiality_activation as a
    names = [n for n in dir(a) if callable(getattr(a, n))]
    assert [n for n in names if any(k in n.lower()
            for k in ("activate", "write_config", "apply_threshold", "mutate", "deploy_now"))] == []


def test_a1_imported_only_by_a2_seam():
    # Import-aware (AST) boundary: Wave 0.4 A2 integrates A1 through a single advisory
    # seam, so frozen A1 is DIRECTLY imported by exactly the two A2 modules — and by no
    # inference / ranking / admission / feed / API / frontend module. Substring matches
    # (field names, docstrings) do not count; only real `import`/`from ... import` do.
    import ast
    import pathlib

    importers = set()
    for root in (pathlib.Path("app"), pathlib.Path("api")):
        for path in root.rglob("*.py"):
            if path.name == "materiality_activation.py":
                continue
            mods = set()
            for node in ast.walk(ast.parse(path.read_text(encoding="utf-8-sig"))):
                if isinstance(node, ast.Import):
                    mods |= {alias.name for alias in node.names}
                elif isinstance(node, ast.ImportFrom) and node.level == 0 and node.module:
                    mods.add(node.module)
            if "app.materiality_activation" in mods:
                importers.add(path.as_posix())
    # Frozen A1 is consumed only by the A2 activation seam and the A3 routing seam —
    # by no inference / ranking / admission / feed / API / frontend module.
    assert importers == {"app/materiality_activation_config.py",
                         "app/materiality_activation_runtime.py",
                         "app/materiality_routing.py",
                         "app/materiality_routing_runtime.py"}


def test_all_artifact_ids_have_expected_prefixes():
    cfg = _cfg(MODE_ACTIVE)
    st = resolve(cfg, SPEC, _ready(), kill_signal=False)
    assert cfg.activation_configuration_id.startswith("actcfg_")
    assert SPEC.activation_specification_id.startswith("actspec_")
    assert st.activation_state_id.startswith("actstate_")
    assert ROLLBACK_CONFIGURATION_V1.rollback_configuration_id.startswith("rbcfg_")


# ── Audit enforcement (authoritative resolve_and_audit) ───────────────────────

def test_resolve_and_audit_one_resolution_one_audit(tmp_path):
    store = _store(tmp_path)
    state, audit = store.resolve_and_audit(_cfg(MODE_ACTIVE), SPEC, _ready(), kill_signal=False,
                                           from_effective_mode=MODE_DISABLED, actor="ops")
    assert len(store.audits) == 1                      # exactly one audit per resolution
    assert audit.resolved_state_id == state.activation_state_id
    assert audit.to_effective_mode == state.resolved_effective_mode == MODE_ACTIVE
    assert audit.from_effective_mode == MODE_DISABLED and audit.transition_allowed is True


def test_two_distinct_resolutions_two_audits(tmp_path):
    store = _store(tmp_path)
    cfg = _cfg(MODE_ACTIVE)
    st1, _ = store.resolve_and_audit(cfg, SPEC, _ready(), kill_signal=False,
                                     from_effective_mode=MODE_DISABLED, actor="ops")
    st2, _ = store.resolve_and_audit(cfg, SPEC, _ready(), kill_signal=True,   # kill → disabled
                                     from_effective_mode=st1.resolved_effective_mode, actor="ops")
    assert len(store.audits) == 2
    assert st2.resolved_effective_mode == MODE_DISABLED and st2.reason == "kill_switch"


def test_resolve_and_audit_always_audits(tmp_path):
    # the supported operational API cannot be used without producing an audit
    store = _store(tmp_path)
    assert len(store.audits) == 0
    store.resolve_and_audit(_cfg(MODE_ACTIVE), SPEC, _ready(), kill_signal=False,
                            from_effective_mode=MODE_DISABLED, actor="ops")
    assert len(store.audits) == 1


def test_duplicate_audit_is_idempotent(tmp_path):
    store = _store(tmp_path)
    st = resolve(_cfg(MODE_ACTIVE), SPEC, _ready(), kill_signal=False)
    a1 = store.record(from_effective_mode=MODE_DISABLED, state=st, actor="ops")
    a2 = store.record(from_effective_mode=MODE_DISABLED, state=st, actor="ops")   # same resolution
    assert a1.activation_audit_id == a2.activation_audit_id
    assert len(store.audits) == 1                      # idempotent by audit id — no duplicate


def test_incoherent_audit_rejected(tmp_path):
    store = _store(tmp_path)
    st = resolve(_cfg(MODE_ACTIVE), SPEC, _ready(), kill_signal=False)
    from app.materiality_activation import ActivationAudit
    wrong = ActivationAudit(from_effective_mode=MODE_DISABLED, to_effective_mode=MODE_ACTIVE,
                            activation_configuration_id=st.activation_configuration_id,
                            activation_specification_id=st.activation_specification_id,
                            resolved_state_id="actstate_WRONG", actor="ops", reason=st.reason,
                            transition_allowed=True)
    with pytest.raises(ValueError):
        store.append_audit(wrong, st)                  # resolved_state_id mismatch → rejected


def test_kill_and_validation_failure_resolutions_are_audited(tmp_path):
    store = _store(tmp_path)
    store.resolve_and_audit(_cfg(MODE_ACTIVE), SPEC, _ready(), kill_signal=True,
                            from_effective_mode=MODE_ACTIVE, actor="ops")           # kill
    store.resolve_and_audit(_cfg(MODE_ACTIVE), SPEC, _ready(rhash="OTHER"), kill_signal=False,
                            from_effective_mode=MODE_DISABLED, actor="ops")         # validation fail
    reasons = {a.reason for a in store.audits}
    assert len(store.audits) == 2
    assert any(r == "kill_switch" for r in reasons)
    assert any(r.startswith("validation_failed:") for r in reasons)


def test_audit_persistence_failure_is_fail_closed(tmp_path, monkeypatch):
    from app.materiality_activation import ActivationAuditError
    store = _store(tmp_path)

    def _boom(_text):
        raise OSError("disk down")

    monkeypatch.setattr(store, "_write_line", _boom)
    with pytest.raises(ActivationAuditError):
        store.resolve_and_audit(_cfg(MODE_ACTIVE), SPEC, _ready(), kill_signal=False,
                                from_effective_mode=MODE_DISABLED, actor="ops")
    assert len(store.audits) == 0                      # nothing committed on persistence failure


def test_pure_resolver_is_deterministic_and_side_effect_free(tmp_path):
    # resolve() takes no store and writes nothing.
    a = resolve(_cfg(MODE_ACTIVE), SPEC, _ready(), kill_signal=False)
    b = resolve(_cfg(MODE_ACTIVE), SPEC, _ready(), kill_signal=False)
    assert a.activation_state_id == b.activation_state_id
    audit_file = tmp_path / "audit" / "activation-audit.jsonl"
    assert not audit_file.exists()                     # no audit written by the pure resolver
