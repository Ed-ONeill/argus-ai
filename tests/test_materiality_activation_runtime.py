"""Wave 0.4 A2 — activation runtime seam regressions.

Runtime gate (default off / malformed-safe / no-op), independent fail-closed input
assembly, single resolution + logical-audit idempotency, defensive accessor, kill /
readiness read-only semantics, current-engine shadow ceiling, byte-identical pipeline
(A2 on vs off), and production non-import.
"""

import ast
import json
import pathlib
import pickle
from datetime import datetime, timedelta, timezone

import pytest

import app.event_identity as ei
import app.materiality_activation as a1
import app.materiality_activation_runtime as rt
from app.config import Settings, settings
from app.event_identity import IdentityAuthority
from app.observation_ledger import LedgerStream
from app.materiality_activation import (
    ACTIVATION_SPECIFICATION_V1 as SPEC,
    MODE_ACTIVE,
    MODE_SHADOW,
    ROLLBACK_CONFIGURATION_V1 as RB,
    ActivationConfiguration,
)
from app.materiality_activation_config import (
    DIAGNOSTICS,
    SAFE_CONFIGURATION,
    ActivationConfigurationStore,
)
from app.materiality_activation_runtime import DurableReadinessProvider

FIXED = datetime(2026, 8, 2, 12, 0, tzinfo=timezone.utc)
CLOCK = lambda: FIXED  # noqa: E731


@pytest.fixture(autouse=True)
def _reset():
    rt.reset_latest_activation_state()
    DIAGNOSTICS.clear()
    yield
    rt.reset_latest_activation_state()
    DIAGNOSTICS.clear()


@pytest.fixture
def fresh_identity(tmp_path, monkeypatch):
    """Isolated identity authority per test (mirrors the real pipeline stage)."""
    auth = IdentityAuthority(
        journal=LedgerStream("identity", tmp_path / "ledger"),
        snapshot_path=tmp_path / "event_registry.json",
    )
    monkeypatch.setattr(ei, "_authority", auth)
    monkeypatch.setattr(settings, "event_identity", True)
    monkeypatch.setattr(settings, "registry_decay", True)
    monkeypatch.setattr(settings, "registry_folding", True)
    return auth


def _cfg(mode=MODE_SHADOW, *, activation_flag=False, flags=None):
    return ActivationConfiguration(
        configuration_version="v1", requested_mode=mode, evaluation_flag=True,
        activation_flag=activation_flag, canary_scope={}, engine_version="argus-current",
        policy_version="argus-current",
        activation_specification_id=SPEC.activation_specification_id,
        required_readiness_result_id="", required_readiness_hash="",
        rollback_configuration_id=RB.rollback_configuration_id,
        feature_flags=flags or {}, metadata="")


def _paths(tmp):
    d = tmp / "materiality_activation"
    return d, d / "configuration.jsonl", d / "kill_signal.json"


def _kill(path, engaged):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps({"engaged": engaged}), encoding="utf-8")


def _run(d, cfgp, killp, **kw):
    return rt.run_activation_cycle(True, config_path=cfgp, kill_path=killp, audit_dir=d,
                                   clock=CLOCK, **kw)


def _lines(path):
    return len([ln for ln in path.read_text(encoding="utf-8").splitlines() if ln.strip()])


def _imported_modules(path):
    mods = set()
    # utf-8-sig strips a leading BOM some source files carry (ast.parse rejects U+FEFF).
    for node in ast.walk(ast.parse(pathlib.Path(path).read_text(encoding="utf-8-sig"))):
        if isinstance(node, ast.Import):
            mods |= {alias.name for alias in node.names}
        elif isinstance(node, ast.ImportFrom) and node.level == 0 and node.module:
            mods.add(node.module)
    return mods


# ── Runtime gate ──────────────────────────────────────────────────────────────
def test_gate_default_false_and_malformed_safe():
    assert Settings.model_fields["materiality_activation_runtime_enabled"].default is False
    assert Settings(materiality_activation_runtime_enabled="banana"
                    ).materiality_activation_runtime_enabled is False
    assert Settings(materiality_activation_runtime_enabled="on"
                    ).materiality_activation_runtime_enabled is True
    assert Settings(materiality_activation_runtime_enabled=1
                    ).materiality_activation_runtime_enabled is True


def test_disabled_gate_is_total_noop(tmp_path):
    d, cfgp, killp = _paths(tmp_path)
    out = rt.run_activation_cycle(False, config_path=cfgp, kill_path=killp, audit_dir=d, clock=CLOCK)
    assert out is None
    assert rt.latest_activation_state() is None
    assert not d.exists()                          # nothing created
    assert DIAGNOSTICS.snapshot() == ()            # no diagnostics


# ── Resolution + audit idempotency ────────────────────────────────────────────
def test_absent_inputs_resolve_disabled_with_one_audit(tmp_path):
    d, cfgp, killp = _paths(tmp_path)
    state = _run(d, cfgp, killp)
    assert state.resolved_effective_mode == "disabled"
    assert state.reason == "kill_switch"           # absent kill → engaged
    lines = (d / "activation-audit.jsonl").read_text(encoding="utf-8").splitlines()
    assert len([ln for ln in lines if ln.strip()]) == 1


def test_shadow_config_resolves_shadow_and_updates_accessor(tmp_path):
    d, cfgp, killp = _paths(tmp_path)
    _kill(killp, False)
    ActivationConfigurationStore(cfgp).append(_cfg(MODE_SHADOW))
    state = _run(d, cfgp, killp)
    assert state.resolved_effective_mode == "shadow" and state.reason == "resolved"
    assert rt.latest_activation_state().resolved_effective_mode == "shadow"


def test_one_resolution_per_enabled_cycle(tmp_path, monkeypatch):
    d, cfgp, killp = _paths(tmp_path)
    _kill(killp, False)
    counter = {"n": 0}
    real = rt.resolve                              # A1's pure resolver, bound into the seam

    def _spy(*a, **k):
        counter["n"] += 1
        return real(*a, **k)

    monkeypatch.setattr(rt, "resolve", _spy)
    _run(d, cfgp, killp)
    assert counter["n"] == 1


def test_transition_only_logical_auditing(tmp_path):
    d, cfgp, killp = _paths(tmp_path)
    audit = d / "activation-audit.jsonl"
    _kill(killp, False)
    ActivationConfigurationStore(cfgp).append(_cfg(MODE_SHADOW))
    _run(d, cfgp, killp)                            # first observation → one baseline audit
    assert _lines(audit) == 1
    for _ in range(5):                              # identical repeats
        _run(d, cfgp, killp)
    assert _lines(audit) == 1                       # no new logical artifact
    _kill(killp, True)                              # genuine transition shadow → disabled
    _run(d, cfgp, killp)
    assert _lines(audit) == 2                        # exactly one new
    for _ in range(5):                              # unchanged after transition
        _run(d, cfgp, killp)
    assert _lines(audit) == 2


def test_restart_under_unchanged_inputs_writes_no_new_artifact(tmp_path):
    d, cfgp, killp = _paths(tmp_path)
    audit = d / "activation-audit.jsonl"
    _kill(killp, False)
    ActivationConfigurationStore(cfgp).append(_cfg(MODE_SHADOW))
    _run(d, cfgp, killp)                            # baseline
    assert _lines(audit) == 1
    rt.reset_latest_activation_state()              # simulate a process restart
    out = _run(d, cfgp, killp)                      # same durable inputs
    assert _lines(audit) == 1                        # journal-derived: nothing new
    assert out.resolved_effective_mode == "shadow"
    assert rt.latest_activation_state() is not None  # accessor repopulated post-restart


def test_accessor_unchanged_on_audit_persistence_failure(tmp_path, monkeypatch):
    d, cfgp, killp = _paths(tmp_path)
    _run(d, cfgp, killp)                            # succeed once → disabled snapshot
    prior = rt.latest_activation_state()
    assert prior is not None and prior.resolved_effective_mode == "disabled"

    def _boom(_self, _text):
        raise OSError("disk down")

    monkeypatch.setattr(a1.ActivationAuditStore, "_write_line", _boom)
    _kill(killp, False)
    ActivationConfigurationStore(cfgp).append(_cfg(MODE_SHADOW))   # would resolve shadow (new audit)
    out = _run(d, cfgp, killp)
    assert out is None
    assert rt.latest_activation_state().resolved_effective_mode == "disabled"   # unchanged
    assert any(x.error_code == "audit_persist_failed" for x in DIAGNOSTICS.snapshot())


def test_accessor_snapshot_is_defensive_copy(tmp_path):
    d, cfgp, killp = _paths(tmp_path)
    _run(d, cfgp, killp)
    first = rt.latest_activation_state()
    first.validation_result["injected"] = True     # mutate the returned snapshot
    second = rt.latest_activation_state()
    assert "injected" not in second.validation_result


# ── Independent, fail-closed input assembly ───────────────────────────────────
def test_bad_readiness_does_not_prevent_config_load(tmp_path):
    d, cfgp, killp = _paths(tmp_path)
    _kill(killp, False)
    cfg = _cfg(MODE_SHADOW)
    ActivationConfigurationStore(cfgp).append(cfg)
    bad_readiness = d / "bad_readiness.json"
    bad_readiness.parent.mkdir(parents=True, exist_ok=True)
    bad_readiness.write_text("{ not json", encoding="utf-8")
    state = _run(d, cfgp, killp, readiness_provider=DurableReadinessProvider(bad_readiness))
    assert state.activation_configuration_id == cfg.activation_configuration_id   # config still loaded


def test_bad_config_does_not_prevent_kill_read(tmp_path):
    d, cfgp, killp = _paths(tmp_path)
    _kill(killp, True)                              # kill engaged
    cfgp.parent.mkdir(parents=True, exist_ok=True)
    cfgp.write_text("garbage\n", encoding="utf-8")  # unreadable config → safe default
    state = _run(d, cfgp, killp)
    assert state.reason == "kill_switch"            # kill was read
    assert state.activation_configuration_id == SAFE_CONFIGURATION.activation_configuration_id


def test_bad_kill_does_not_prevent_readiness_load(tmp_path):
    d, cfgp, killp = _paths(tmp_path)
    killp.parent.mkdir(parents=True, exist_ok=True)
    killp.write_text("{ broken", encoding="utf-8")  # malformed kill → engaged

    class _Spy:
        called = False

        def get(self):
            _Spy.called = True
            return None

    _run(d, cfgp, killp, readiness_provider=_Spy())
    assert _Spy.called                              # readiness assembled despite bad kill


# ── Kill signal semantics (read-only) ─────────────────────────────────────────
def test_kill_signal_exact_shapes(tmp_path):
    f = tmp_path / "k.json"
    f.parent.mkdir(parents=True, exist_ok=True)
    f.write_text(json.dumps({"engaged": True}), encoding="utf-8")
    assert rt.read_kill_signal(f) is True
    f.write_text(json.dumps({"engaged": False}), encoding="utf-8")
    assert rt.read_kill_signal(f) is False
    assert rt.read_kill_signal(tmp_path / "absent.json") is True
    for payload in ("{bad", json.dumps({"engaged": "yes"}), json.dumps({"engaged": 1}),
                    json.dumps({}), json.dumps({"engaged": False, "extra": 1}),
                    json.dumps(["engaged"])):
        f.write_text(payload, encoding="utf-8")
        assert rt.read_kill_signal(f) is True       # malformed/absent/extra → engaged


def test_a2_never_writes_or_creates_kill_signal(tmp_path):
    d, cfgp, killp = _paths(tmp_path)
    _kill(killp, False)
    before = killp.read_bytes()
    _run(d, cfgp, killp)
    assert killp.read_bytes() == before             # never rewritten
    d2, cfgp2, killp2 = _paths(tmp_path / "second")
    _run(d2, cfgp2, killp2)                          # absent kill
    assert not killp2.exists()                       # never created


# ── Readiness provider (read-only, never computes C4) ─────────────────────────
def test_readiness_provider_integrity(tmp_path):
    p = tmp_path / "r.json"
    p.parent.mkdir(parents=True, exist_ok=True)
    assert DurableReadinessProvider(tmp_path / "absent.json").get() is None
    p.write_text("{ broken", encoding="utf-8")
    assert DurableReadinessProvider(p).get() is None
    p.write_text(json.dumps({"readiness_result_id": "rdres_WRONG",
                             "canonical_content_hash": "abc123",
                             "readiness_status": "insufficient_evidence"}), encoding="utf-8")
    assert DurableReadinessProvider(p).get() is None            # id != rdres_+hash
    h = "a" * 64
    p.write_text(json.dumps({"readiness_result_id": "rdres_" + h,
                             "canonical_content_hash": h,
                             "readiness_status": "ready"}), encoding="utf-8")
    snap = DurableReadinessProvider(p).get()
    assert snap is not None and snap.readiness_status == "ready"


def test_current_engine_cannot_resolve_above_shadow(tmp_path):
    d, cfgp, killp = _paths(tmp_path)
    _kill(killp, False)
    # shadow with activation_flag True, no durable readiness → ceiling shadow.
    store = ActivationConfigurationStore(cfgp)
    store.append(_cfg(MODE_SHADOW, activation_flag=True))
    assert _run(d, cfgp, killp).resolved_effective_mode in ("disabled", "shadow")
    # active requested, no readiness binding → validation fails → disabled.
    store.append(_cfg(MODE_ACTIVE, activation_flag=True, flags={"t": "a"}))
    state = _run(d, cfgp, killp)
    assert state.resolved_effective_mode == "disabled"
    assert state.reason.startswith("validation_failed:")


# ── Import boundaries (AST-based, import-aware) ───────────────────────────────
_A1 = "app.materiality_activation"
_CFG = "app.materiality_activation_config"
_RTM = "app.materiality_activation_runtime"


def _production_py():
    for root in (pathlib.Path("app"), pathlib.Path("api")):
        yield from root.rglob("*.py")


def test_import_boundaries():
    a1_importers, rt_importers, cfg_importers = set(), set(), set()
    for path in _production_py():
        mods = _imported_modules(path)
        name = path.as_posix()
        if path.name != "materiality_activation.py" and _A1 in mods:
            a1_importers.add(name)
        if path.name != "materiality_activation_runtime.py" and _RTM in mods:
            rt_importers.add(name)
        if path.name != "materiality_activation_config.py" and _CFG in mods:
            cfg_importers.add(name)
    # Frozen A1 is imported by the two A2 modules and the two A3 routing modules only.
    assert a1_importers == {"app/materiality_activation_config.py",
                            "app/materiality_activation_runtime.py",
                            "app/materiality_routing.py",
                            "app/materiality_routing_runtime.py"}
    # The A2 seam is imported by background and by the A3 routing seam (read-only);
    # the A2 config store by the A2 seam and the A3 routing seam (read-only config).
    assert rt_importers == {"app/background.py", "app/materiality_routing_runtime.py"}
    assert cfg_importers == {"app/materiality_activation_runtime.py",
                             "app/materiality_routing_runtime.py"}
    # background imports the seam only — never A1 directly; config/storage import neither.
    bg = _imported_modules(pathlib.Path("app/background.py"))
    assert _RTM in bg and _A1 not in bg
    assert _A1 not in _imported_modules(pathlib.Path("app/config.py"))
    assert _A1 not in _imported_modules(pathlib.Path("app/storage.py"))


def test_accessor_not_read_by_production():
    # The A3 routing seam reads latest_activation_state() read-only to build advisory
    # routing context (it alters no production behavior); it is the only authorized
    # reader besides the A2 module itself.
    authorized_readers = {"materiality_activation_runtime.py", "materiality_routing_runtime.py"}
    for path in _production_py():
        if path.name in authorized_readers:
            continue
        for node in ast.walk(ast.parse(path.read_text(encoding="utf-8-sig"))):
            if isinstance(node, ast.ImportFrom) and node.module == _RTM:
                names = {alias.name for alias in node.names}
                assert "latest_activation_state" not in names, path.as_posix()
                assert "reset_latest_activation_state" not in names, path.as_posix()


# ── Byte-identical pipeline: A2 gate on vs off ────────────────────────────────
@pytest.mark.parametrize("mode", ["off", "shadow"])
def test_pipeline_byte_identical_a2_on_vs_off(fresh_identity, tmp_path, monkeypatch, mode):
    import app.background as bg
    import app.event_identity as identity
    import app.events as events_mod
    import app.feeds as feeds_mod
    import app.materiality as materiality
    import app.observation_ledger as obs
    import app.processed_cache as pc
    import app.sectors as sectors
    import app.summarizer as summ
    import app.theme_graph as theme_graph
    from api.routes.feed import _build_response
    from app.feeds import FeedItem

    fixed = FIXED

    class _FixedDateTime(datetime):
        @classmethod
        def now(cls, tz=None):
            return fixed if tz is not None else fixed.replace(tzinfo=None)

    def _fetch(**kwargs):
        return [
            FeedItem(title="Fed holds rates steady", url="https://t/a2-strong",
                     source="Bloomberg Markets", category="Markets",
                     published_dt=fixed - timedelta(minutes=20), snippet="wire"),
            FeedItem(title="ECB signals patience on the policy path", url="https://t/a2-aged",
                     source="Bloomberg Markets", category="Markets",
                     published_dt=fixed - timedelta(hours=200), snippet="wire"),
        ]

    class _SumRes:
        new = cached = skipped = 0

    for target in (bg, theme_graph, feeds_mod, events_mod):
        monkeypatch.setattr(target, "datetime", _FixedDateTime)
    monkeypatch.setattr(settings, "materiality_mode", mode)
    monkeypatch.setattr(feeds_mod.feed_manager, "fetch_all", _fetch)
    monkeypatch.setattr(feeds_mod.feed_manager, "fetch_errors", {}, raising=False)
    monkeypatch.setattr(feeds_mod.feed_manager, "promo_excluded", 0, raising=False)
    monkeypatch.setattr(feeds_mod.feed_manager, "last_source_stats", {}, raising=False)
    monkeypatch.setattr(summ, "summarize_items", lambda *a, **k: _SumRes())
    monkeypatch.setattr(summ, "generate_market_take", lambda *a, **k: "")
    monkeypatch.setattr(summ, "generate_market_brief", lambda *a, **k: None)
    monkeypatch.setattr(sectors, "aggregate_sector_intelligence",
                        lambda *a, **k: sectors.SectorData(
                            sectors=[], industries=[], rotation_signals=[],
                            dominant_sector=None, generated_at=fixed))
    monkeypatch.setattr(obs.observation_ledger, "record_observations", lambda *a, **k: 0)
    monkeypatch.setattr(obs.observation_ledger, "record_assessments", lambda *a, **k: 0)
    monkeypatch.setattr(obs.observation_ledger, "compress_old", lambda *a, **k: None)
    monkeypatch.setattr(identity, "resolve_and_fold", identity.resolve_and_fold)
    monkeypatch.setattr(materiality, "assess", materiality.assess)

    # Redirect the A2 seam's durable writes into tmp (contract: A2 writes only its
    # own isolated namespace) and pin its clock.
    a2_dir = tmp_path / "a2"
    real_cycle = rt.run_activation_cycle

    def _redirected(enabled, **kw):
        return real_cycle(enabled, config_path=a2_dir / "configuration.jsonl",
                          kill_path=a2_dir / "kill_signal.json", audit_dir=a2_dir,
                          clock=CLOCK, **kw)

    monkeypatch.setattr(rt, "run_activation_cycle", _redirected)

    monkeypatch.setattr(settings, "materiality_activation_runtime_enabled", False)
    feed_off = bg.run_pipeline(categories="", sources="")

    monkeypatch.setattr(settings, "materiality_activation_runtime_enabled", True)
    feed_on = bg.run_pipeline(categories="", sources="")

    # Complete equality of the production surface — object, cache bytes, API response.
    assert feed_off == feed_on
    assert pickle.dumps(feed_off) == pickle.dumps(feed_on)
    assert [e.id for e in feed_off.events] == [e.id for e in feed_on.events]

    def _round_trip(key, feed, cache_dir):
        monkeypatch.setattr(pc, "_CACHE_DIR", cache_dir)
        pc.ProcessedFeedCache().set(key, feed)
        return (cache_dir / f"feed_{key}.pkl").read_bytes()

    assert _round_trip("a2off", feed_off, tmp_path / "c_off") == \
        _round_trip("a2on", feed_on, tmp_path / "c_on")
    assert _build_response(feed_off, age=0.0) == _build_response(feed_on, age=0.0)

    # A2 leaked nothing into the public surface (equality above already proves
    # non-influence; these guard specifically against A2 artifacts serializing).
    # NB: the pre-existing `industry_activation` field is unrelated to A2.
    blob = pickle.dumps(feed_on)
    for marker in (b"ActivationState", b"ActivationConfiguration", b"actstate_",
                   b"materiality_activation"):
        assert marker not in blob
