"""Wave 0.4 A2 — ActivationConfigurationStore regressions.

Deterministic append-only journal: replay, single current, atomic supersede,
crash-safety (old-or-new never partial), torn/malformed/tampered/incompatible entry
skipping, safe-config fallback, per-cycle reload cadence, bounded diagnostics.
"""

import json

import pytest

import app.materiality_activation_config as cfgmod
from app.materiality_activation import (
    ACTIVATION_SPECIFICATION_V1 as SPEC,
    CANARY_SUBJECT_KIND,
    MODE_CANARY,
    MODE_SHADOW,
    ROLLBACK_CONFIGURATION_V1 as RB,
    ActivationConfiguration,
)
from app.materiality_activation_config import (
    DIAGNOSTICS,
    SAFE_CONFIGURATION,
    ActivationConfigurationStore,
)


def _cfg(*, mode=MODE_SHADOW, flags=None, spec_id=None, canary_bps=None,
         engine="argus-current", policy="argus-current", version="v1"):
    scope = {}
    if canary_bps is not None:
        scope = {"canary_bps": canary_bps, "subject_kind": CANARY_SUBJECT_KIND}
    return ActivationConfiguration(
        configuration_version=version, requested_mode=mode, evaluation_flag=True,
        activation_flag=False, canary_scope=scope, engine_version=engine,
        policy_version=policy,
        activation_specification_id=spec_id or SPEC.activation_specification_id,
        required_readiness_result_id="", required_readiness_hash="",
        rollback_configuration_id=RB.rollback_configuration_id,
        feature_flags=flags or {}, metadata="")


def _path(tmp_path):
    return tmp_path / "materiality_activation" / "configuration.jsonl"


def test_deterministic_journal_replay(tmp_path):
    p = _path(tmp_path)
    a, b = _cfg(flags={"n": "1"}), _cfg(flags={"n": "2"})
    store = ActivationConfigurationStore(p)
    store.append(a)
    store.append(b)
    ids = [c.activation_configuration_id for c in ActivationConfigurationStore(p).entries]
    assert ids == [a.activation_configuration_id, b.activation_configuration_id]


def test_exactly_one_current_is_last_coherent(tmp_path):
    p = _path(tmp_path)
    a, b = _cfg(flags={"n": "1"}), _cfg(flags={"n": "2"})
    store = ActivationConfigurationStore(p)
    store.append(a)
    store.append(b)
    assert store.current().activation_configuration_id == b.activation_configuration_id
    assert ActivationConfigurationStore(p).current().activation_configuration_id == \
        b.activation_configuration_id


def test_idempotent_append(tmp_path):
    p = _path(tmp_path)
    store = ActivationConfigurationStore(p)
    a = _cfg(flags={"n": "1"})
    store.append(a)
    store.append(a)
    assert len(store.entries) == 1


def test_atomic_supersede_two_complete_entries(tmp_path):
    p = _path(tmp_path)
    store = ActivationConfigurationStore(p)
    store.append(_cfg(flags={"n": "1"}))
    store.append(_cfg(flags={"n": "2"}))
    lines = [ln for ln in p.read_text(encoding="utf-8").splitlines() if ln.strip()]
    assert len(lines) == 2
    for ln in lines:
        json.loads(ln)                         # both complete and parseable


def test_crash_leaves_old_or_new_never_partial(tmp_path, monkeypatch):
    p = _path(tmp_path)
    store = ActivationConfigurationStore(p)
    store.append(_cfg(flags={"n": "1"}))
    original = p.read_text(encoding="utf-8")

    def _boom(*a, **k):
        raise OSError("replace failed mid-supersede")

    monkeypatch.setattr(cfgmod.os, "replace", _boom)
    with pytest.raises(OSError):
        store.append(_cfg(flags={"n": "2"}))
    assert p.read_text(encoding="utf-8") == original          # untouched, complete
    assert store.current().feature_flags == {"n": "1"}        # in-memory not advanced
    assert ActivationConfigurationStore(p).current().feature_flags == {"n": "1"}


def test_torn_final_line_ignored(tmp_path):
    p = _path(tmp_path)
    ActivationConfigurationStore(p).append(_cfg(flags={"n": "1"}))
    with open(p, "a", encoding="utf-8") as fh:
        fh.write('{"partial": ')                              # torn write, no newline
    DIAGNOSTICS.clear()
    store = ActivationConfigurationStore(p)
    assert store.current().feature_flags == {"n": "1"}
    assert any(d.detail_code == "parse_error" for d in DIAGNOSTICS.snapshot())


def test_malformed_non_object_line_skipped(tmp_path):
    p = _path(tmp_path)
    ActivationConfigurationStore(p).append(_cfg(flags={"n": "1"}))
    with open(p, "a", encoding="utf-8") as fh:
        fh.write("[1, 2, 3]\n")                               # valid JSON, not an object
    DIAGNOSTICS.clear()
    store = ActivationConfigurationStore(p)
    assert store.current().feature_flags == {"n": "1"}
    assert any(d.detail_code == "not_object" for d in DIAGNOSTICS.snapshot())


def test_tampered_id_skipped(tmp_path):
    p = _path(tmp_path)
    ActivationConfigurationStore(p).append(_cfg(flags={"n": "1"}))
    row = json.loads(cfgmod._serialize(_cfg(flags={"n": "2"})))
    row["activation_configuration_id"] = "actcfg_tampered"
    with open(p, "a", encoding="utf-8") as fh:
        fh.write(json.dumps(row) + "\n")
    DIAGNOSTICS.clear()
    store = ActivationConfigurationStore(p)
    assert store.current().feature_flags == {"n": "1"}
    assert any(d.detail_code == "id_mismatch" for d in DIAGNOSTICS.snapshot())


def test_spec_incompatible_entry_skipped(tmp_path):
    p = _path(tmp_path)
    ActivationConfigurationStore(p).append(_cfg(flags={"n": "1"}))
    bad = _cfg(flags={"n": "2"}, spec_id="actspec_incompatible")
    with open(p, "a", encoding="utf-8") as fh:
        fh.write(cfgmod._serialize(bad) + "\n")               # id matches content, spec does not
    DIAGNOSTICS.clear()
    store = ActivationConfigurationStore(p)
    assert store.current().feature_flags == {"n": "1"}
    assert any(d.detail_code == "spec_mismatch" for d in DIAGNOSTICS.snapshot())


def test_invalid_canary_entry_skipped(tmp_path):
    p = _path(tmp_path)
    ActivationConfigurationStore(p).append(_cfg(flags={"n": "1"}))
    bad = _cfg(flags={"n": "2"}, mode=MODE_CANARY)            # canary with no valid scope
    with open(p, "a", encoding="utf-8") as fh:
        fh.write(cfgmod._serialize(bad) + "\n")
    DIAGNOSTICS.clear()
    store = ActivationConfigurationStore(p)
    assert store.current().feature_flags == {"n": "1"}
    assert any(d.detail_code == "invalid_canary_scope" for d in DIAGNOSTICS.snapshot())


def test_last_coherent_entry_selected_among_mixed(tmp_path):
    p = _path(tmp_path)
    store = ActivationConfigurationStore(p)
    store.append(_cfg(flags={"n": "1"}))
    store.append(_cfg(flags={"n": "2"}))                      # last coherent
    bad = _cfg(flags={"n": "3"}, spec_id="actspec_incompatible")
    with open(p, "a", encoding="utf-8") as fh:
        fh.write(cfgmod._serialize(bad) + "\n")               # trailing incoherent
    assert ActivationConfigurationStore(p).current().feature_flags == {"n": "2"}


def test_append_rejects_incoherent(tmp_path):
    store = ActivationConfigurationStore(_path(tmp_path))
    with pytest.raises(ValueError):
        store.append(_cfg(mode=MODE_CANARY))                 # canary without scope


def test_absent_journal_returns_safe_config(tmp_path):
    store = ActivationConfigurationStore(tmp_path / "nope" / "configuration.jsonl")
    assert store.current() is SAFE_CONFIGURATION
    assert not (tmp_path / "nope").exists()                  # read never creates the dir


def test_no_coherent_entry_returns_safe_config(tmp_path):
    p = _path(tmp_path)
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text("not json at all\n", encoding="utf-8")
    assert ActivationConfigurationStore(p).current() is SAFE_CONFIGURATION


def test_reload_cadence_change_visible_only_to_next_reader(tmp_path):
    p = _path(tmp_path)
    writer = ActivationConfigurationStore(p)
    writer.append(_cfg(flags={"n": "1"}))
    reader_this_cycle = ActivationConfigurationStore(p)       # snapshots current file
    writer.append(_cfg(flags={"n": "2"}))                    # operator supersedes mid-cycle
    assert reader_this_cycle.current().feature_flags == {"n": "1"}   # not visible now
    assert ActivationConfigurationStore(p).current().feature_flags == {"n": "2"}  # next cycle


def test_safe_configuration_is_coherent_and_disabled():
    ok, reason = cfgmod.config_coherent(SAFE_CONFIGURATION, SPEC)
    assert ok and reason == ""
    assert SAFE_CONFIGURATION.requested_mode == "disabled"
    assert SAFE_CONFIGURATION.activation_flag is False
    assert SAFE_CONFIGURATION.canary_scope == {}
