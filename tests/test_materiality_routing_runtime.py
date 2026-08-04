"""Wave 0.4 A3 — routing runtime/seam regressions.

Gate no-op, single-execution-per-cycle, missing-state → legacy, shadow ceiling,
defensive accessor, audit-failure snapshot preservation, bounded observations,
transition-only cycle audit, A1-canary reuse (independently pinned), AST import
boundaries, rollback, and byte-identical pipeline (A3 on vs off).
"""

import ast
import json
import pathlib
import pickle
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

import pytest

import app.event_identity as ei
import app.materiality_routing_runtime as rrt
from app.config import Settings, settings
from app.event_identity import IdentityAuthority
from app.materiality_activation import (
    ACTIVATION_SPECIFICATION_V1 as ASPEC,
    CANARY_SUBJECT_KIND,
    MODE_ACTIVE,
    MODE_CANARY,
    MODE_DISABLED,
    MODE_SHADOW,
    ROLLBACK_CONFIGURATION_V1 as RB,
    ActivationConfiguration,
    canary_bucket,
)
from app.materiality_routing import (
    REASON_CANARY_IN,
    REASON_CANARY_OUT,
    REASON_DISABLED_MODE,
    REASON_KILL_SWITCH,
    REASON_SHADOW_MODE,
    ROUTE_CANARY,
    ROUTE_LEGACY,
    ROUTE_SHADOW,
    ROUTING_SPECIFICATION_V1 as SPEC,
    resolve_route,
)
from app.observation_ledger import LedgerStream

FIXED = datetime(2026, 8, 2, 12, 0, tzinfo=timezone.utc)
CLOCK = lambda: FIXED  # noqa: E731

# Independently pinned canary fixtures (frozen literals; not recomputed by prod code).
PINNED_BUCKETS = {"subj_a": 4543, "subj_b": 1542}
PINNED_CANARY_BPS = 2000                     # bucket < 2000 ⇒ in-cohort


@pytest.fixture(autouse=True)
def _reset():
    rrt.reset_routing_state()
    rrt.OBSERVATIONS.clear()
    yield
    rrt.reset_routing_state()
    rrt.OBSERVATIONS.clear()


@pytest.fixture
def fresh_identity(tmp_path, monkeypatch):
    auth = IdentityAuthority(journal=LedgerStream("identity", tmp_path / "ledger"),
                             snapshot_path=tmp_path / "event_registry.json")
    monkeypatch.setattr(ei, "_authority", auth)
    monkeypatch.setattr(settings, "event_identity", True)
    monkeypatch.setattr(settings, "registry_decay", True)
    monkeypatch.setattr(settings, "registry_folding", True)
    return auth


def _state(mode=MODE_SHADOW, *, kill=False, readiness_status=None, spec_id=None):
    return SimpleNamespace(
        activation_state_id="actstate_" + mode + ("_k" if kill else ""),
        activation_configuration_id="actcfg_x", resolved_effective_mode=mode,
        kill_switch_engaged=kill, readiness_result_id=None, readiness_status=readiness_status,
        activation_specification_id=(spec_id or ASPEC.activation_specification_id))


def _paths(tmp):
    d = tmp / "materiality_routing"
    return d, tmp / "materiality_activation" / "configuration.jsonl"


def _run(tmp, *, cycle_id="c1", state, **kw):
    d, cfgp = _paths(tmp)
    return rrt.run_routing_cycle(True, observation_cycle_id=cycle_id, config_path=cfgp,
                                 audit_dir=d, clock=CLOCK, state_provider=lambda: state, **kw)


def _lines(path):
    return len([ln for ln in path.read_text(encoding="utf-8").splitlines() if ln.strip()])


def _imported(path):
    mods = set()
    for node in ast.walk(ast.parse(pathlib.Path(path).read_text(encoding="utf-8-sig"))):
        if isinstance(node, ast.Import):
            mods |= {a.name for a in node.names}
        elif isinstance(node, ast.ImportFrom) and node.level == 0 and node.module:
            mods.add(node.module)
    return mods


# ── Gate ──────────────────────────────────────────────────────────────────────
def test_gate_default_false_and_malformed_safe():
    assert Settings.model_fields["materiality_safe_routing_enabled"].default is False
    assert Settings(materiality_safe_routing_enabled="banana").materiality_safe_routing_enabled is False
    assert Settings(materiality_safe_routing_enabled="on").materiality_safe_routing_enabled is True


def test_gate_independent_of_a2():
    # A3 gate is a distinct field; toggling it does not touch the A2 gate default.
    assert Settings.model_fields["materiality_activation_runtime_enabled"].default is False
    assert Settings(materiality_safe_routing_enabled=True).materiality_activation_runtime_enabled is False


def test_disabled_gate_is_total_noop(tmp_path):
    d, cfgp = _paths(tmp_path)
    out = rrt.run_routing_cycle(False, observation_cycle_id="c1", config_path=cfgp, audit_dir=d, clock=CLOCK)
    assert out is None
    assert rrt.latest_proposed_route() is None
    assert not d.exists()
    assert rrt.OBSERVATIONS.snapshot() == ()


# ── Seam behavior ─────────────────────────────────────────────────────────────
def test_missing_a2_state_resolves_legacy(tmp_path):
    out = _run(tmp_path, state=None)
    assert out.proposed_route == ROUTE_LEGACY and out.reason_code == "invalid_context"
    assert out.applied_route == ROUTE_LEGACY


def test_shadow_state_proposes_shadow_applies_legacy(tmp_path):
    out = _run(tmp_path, state=_state(MODE_SHADOW))
    assert out.proposed_route == ROUTE_SHADOW and out.reason_code == REASON_SHADOW_MODE
    assert out.applied_route == ROUTE_LEGACY
    assert rrt.latest_proposed_route().proposed_route == ROUTE_SHADOW


def test_single_execution_per_cycle(tmp_path):
    d, cfgp = _paths(tmp_path)
    audit = d / "routing-audit.jsonl"
    _run(tmp_path, cycle_id="c1", state=_state(MODE_SHADOW))
    obs_after_first = len(rrt.OBSERVATIONS.snapshot())
    _run(tmp_path, cycle_id="c1", state=_state(MODE_DISABLED))   # re-entry same cycle → no-op
    assert len(rrt.OBSERVATIONS.snapshot()) == obs_after_first
    assert _lines(audit) == 1
    assert rrt.latest_proposed_route().proposed_route == ROUTE_SHADOW  # not overwritten by re-entry


def test_accessor_defensive_copy(tmp_path):
    _run(tmp_path, state=_state(MODE_SHADOW))
    first = rrt.latest_proposed_route()
    first.eligibility_result["injected"] = True
    assert "injected" not in rrt.latest_proposed_route().eligibility_result


def test_accessor_unchanged_on_audit_failure(tmp_path, monkeypatch):
    _run(tmp_path, cycle_id="c1", state=_state(MODE_DISABLED))        # baseline snapshot = legacy
    prior = rrt.latest_proposed_route()
    assert prior is not None

    def _boom(_self, _text):
        raise OSError("disk down")

    monkeypatch.setattr(rrt.RoutingAuditStore, "_write_line", _boom)
    out = _run(tmp_path, cycle_id="c2", state=_state(MODE_SHADOW))    # transition → write → boom
    assert out is None
    assert rrt.latest_proposed_route().proposed_route == prior.proposed_route  # unchanged
    assert any(o.reason_code == "audit_persist_failed" for o in rrt.OBSERVATIONS.snapshot())


# ── Bounded observations (R-6) ────────────────────────────────────────────────
def test_observation_coalescing_and_cap(tmp_path):
    from app.materiality_routing import ProposedRoute
    p = resolve_route(SPEC, None)                    # a legacy proposal
    rrt.OBSERVATIONS.record(p, "s0", observed_at=FIXED)
    rrt.OBSERVATIONS.record(p, "s0", observed_at=FIXED)   # identical → coalesce
    snap = [o for o in rrt.OBSERVATIONS.snapshot() if o.activation_state_id == "s0"]
    assert snap and snap[0].occurrence_count == 2
    for i in range(200):                             # exceed cap with distinct keys
        rrt.OBSERVATIONS.record(
            ProposedRoute(routing_specification_id=SPEC.routing_specification_id,
                          routing_context_id="", requested_route=ROUTE_LEGACY,
                          proposed_route=ROUTE_LEGACY, eligibility_result={},
                          reason_code=f"r{i}"), f"s{i}", observed_at=FIXED)
    assert len(rrt.OBSERVATIONS.snapshot()) == rrt.RoutingObservations.MAX_ENTRIES  # 128, oldest evicted


# ── Transition-only, chain-coherent cycle audit ───────────────────────────────
def test_audit_transition_only(tmp_path):
    d, _ = _paths(tmp_path)
    audit = d / "routing-audit.jsonl"
    _run(tmp_path, cycle_id="c1", state=_state(MODE_SHADOW))
    assert _lines(audit) == 1                        # baseline
    for i in range(4):
        _run(tmp_path, cycle_id=f"same{i}", state=_state(MODE_SHADOW))  # identical summaries
    assert _lines(audit) == 1                        # no growth
    _run(tmp_path, cycle_id="cX", state=_state(MODE_DISABLED))          # genuine change
    assert _lines(audit) == 2


def test_audit_recurrence_A_B_A_is_three_distinct_artifacts(tmp_path):
    d, _ = _paths(tmp_path)
    audit = d / "routing-audit.jsonl"
    _run(tmp_path, cycle_id="cA1", state=_state(MODE_SHADOW))     # A
    _run(tmp_path, cycle_id="cB", state=_state(MODE_DISABLED))    # B
    _run(tmp_path, cycle_id="cA2", state=_state(MODE_SHADOW))     # A again
    assert _lines(audit) == 3
    audits = rrt.RoutingAuditStore(d).audits
    ids = [a.routing_audit_id for a in audits]
    assert len(set(ids)) == 3                                     # returning A is a NEW artifact
    assert audits[0].to_summary_hash == audits[2].to_summary_hash  # same summary content
    assert audits[0].routing_audit_id != audits[2].routing_audit_id  # but distinct via chain
    assert audits[2].previous_routing_audit_id == audits[1].routing_audit_id
    for i in range(3):                                            # repeats after final transition
        _run(tmp_path, cycle_id=f"cA2r{i}", state=_state(MODE_SHADOW))
    assert _lines(audit) == 3                                     # add none


def test_audit_restart_between_b_and_returning_a(tmp_path):
    d, _ = _paths(tmp_path)
    audit = d / "routing-audit.jsonl"
    _run(tmp_path, cycle_id="cA", state=_state(MODE_SHADOW))
    _run(tmp_path, cycle_id="cB", state=_state(MODE_DISABLED))
    assert _lines(audit) == 2
    rrt.reset_routing_state()                                    # restart between B and A
    _run(tmp_path, cycle_id="cA2", state=_state(MODE_SHADOW))    # returning A
    assert _lines(audit) == 3                                     # exactly one B → A artifact


def test_audit_restart_unchanged_writes_nothing(tmp_path):
    d, _ = _paths(tmp_path)
    audit = d / "routing-audit.jsonl"
    _run(tmp_path, cycle_id="c1", state=_state(MODE_SHADOW))
    assert _lines(audit) == 1
    rrt.reset_routing_state()                        # simulate restart (accessor+guard cleared)
    _run(tmp_path, cycle_id="c2", state=_state(MODE_SHADOW))            # store reloads from disk
    assert _lines(audit) == 1                        # journal-derived: nothing new


def test_audit_content_tamper_rejected_on_reload(tmp_path):
    d, _ = _paths(tmp_path)
    audit = d / "routing-audit.jsonl"
    _run(tmp_path, cycle_id="c1", state=_state(MODE_SHADOW))
    row = json.loads(audit.read_text(encoding="utf-8").splitlines()[0])
    row["eligible_decision_count"] = 999             # tamper content, keep stored id
    audit.write_text(json.dumps(row) + "\n", encoding="utf-8")
    with pytest.raises(ValueError):
        rrt.RoutingAuditStore(d)


def test_audit_predecessor_mismatch_rejected(tmp_path):
    d, _ = _paths(tmp_path)
    audit = d / "routing-audit.jsonl"
    _run(tmp_path, cycle_id="cA", state=_state(MODE_SHADOW))
    _run(tmp_path, cycle_id="cB", state=_state(MODE_DISABLED))
    rows = audit.read_text(encoding="utf-8").splitlines()
    row2 = json.loads(rows[1])
    # Forge a SELF-CONSISTENT second entry (id recomputed) but with a wrong predecessor,
    # so the content-integrity check passes and only the chain check can catch it.
    forged = rrt.RoutingAudit(
        previous_routing_audit_id="rtaud_forged", from_summary_hash=row2["from_summary_hash"],
        to_summary_hash=row2["to_summary_hash"], routing_specification_id=row2["routing_specification_id"],
        activation_state_id=row2["activation_state_id"], proposed_route_counts=row2["proposed_route_counts"],
        applied_route_counts=row2["applied_route_counts"], reason_code_counts=row2["reason_code_counts"],
        fallback_reason_counts=row2["fallback_reason_counts"],
        eligible_decision_count=row2["eligible_decision_count"], generated_at=row2.get("generated_at"),
        observation_cycle_id=row2.get("observation_cycle_id", ""))
    out = forged._identity_content()
    out["generated_at"] = forged.generated_at
    out["observation_cycle_id"] = forged.observation_cycle_id
    out["routing_audit_id"] = forged.routing_audit_id
    audit.write_text(rows[0] + "\n" + json.dumps(out) + "\n", encoding="utf-8")
    with pytest.raises(ValueError):
        rrt.RoutingAuditStore(d)                     # noncontiguous chain


def test_audit_reorder_cannot_conceal_transition(tmp_path):
    d, _ = _paths(tmp_path)
    audit = d / "routing-audit.jsonl"
    _run(tmp_path, cycle_id="cA", state=_state(MODE_SHADOW))
    _run(tmp_path, cycle_id="cB", state=_state(MODE_DISABLED))
    rows = audit.read_text(encoding="utf-8").splitlines()
    audit.write_text(rows[1] + "\n" + rows[0] + "\n", encoding="utf-8")   # reversed order
    with pytest.raises(ValueError):
        rrt.RoutingAuditStore(d)


def test_materiality_path_unavailable_only_changes_fallback(tmp_path):
    from app.materiality_routing import (
        FALLBACK_ENFORCEMENT_CAP,
        FALLBACK_MATERIALITY_UNAVAILABLE,
    )
    state = _state(MODE_SHADOW)
    cfg = SimpleNamespace(engine_version="e", policy_version="p")
    ctx_avail = rrt.build_context(state, cfg, ASPEC, SPEC, durable_event_uid=None,
                                  legacy_available=True, materiality_available=True,
                                  gate_status={}, cycle_id="c")
    ctx_unavail = rrt.build_context(state, cfg, ASPEC, SPEC, durable_event_uid=None,
                                    legacy_available=True, materiality_available=False,
                                    gate_status={}, cycle_id="c")
    # toggling only availability leaves routing_context_id unchanged (operational)
    assert ctx_avail.routing_context_id == ctx_unavail.routing_context_id
    proposed = resolve_route(SPEC, ctx_unavail)
    assert proposed.proposed_route == ROUTE_SHADOW
    avail = rrt.finalize_applied(proposed, materiality_available=True)
    unavail = rrt.finalize_applied(proposed, materiality_available=False)
    # proposed_route_id unchanged; applied always legacy; only fallback differs
    assert avail.proposed_route_id == unavail.proposed_route_id == proposed.proposed_route_id
    assert avail.applied_route == unavail.applied_route == ROUTE_LEGACY
    assert avail.fallback_reason == FALLBACK_ENFORCEMENT_CAP
    assert unavail.fallback_reason == FALLBACK_MATERIALITY_UNAVAILABLE


# ── Canary via A1 helpers, independently pinned ───────────────────────────────
def _canary_config(bps):
    return ActivationConfiguration(
        configuration_version="v1", requested_mode=MODE_CANARY, evaluation_flag=True,
        activation_flag=False,
        canary_scope={"canary_bps": bps, "subject_kind": CANARY_SUBJECT_KIND},
        engine_version="e", policy_version="p",
        activation_specification_id=ASPEC.activation_specification_id,
        required_readiness_result_id="", required_readiness_hash="",
        rollback_configuration_id=RB.rollback_configuration_id)


def test_canary_uses_a1_helper_with_pinned_fixtures(tmp_path):
    from app.materiality_activation import canary_assignment_salt
    salt = canary_assignment_salt(ASPEC.activation_specification_id, "e", "p")
    for uid, expected_bucket in PINNED_BUCKETS.items():
        assert canary_bucket(salt, uid) == expected_bucket        # A1 matches the frozen literal
    cfg = _canary_config(PINNED_CANARY_BPS)
    state = _state(MODE_CANARY, readiness_status="ready")
    gate = {"a2_enabled": False, "a3_enabled": True}
    # in-cohort subject (subj_b bucket 1542 < 2000)
    ctx_in = rrt.build_context(state, cfg, ASPEC, SPEC, durable_event_uid="subj_b",
                               legacy_available=True, materiality_available=False,
                               gate_status=gate, cycle_id="c")
    assert ctx_in.canary_membership is True
    assert resolve_route(SPEC, ctx_in).proposed_route == ROUTE_CANARY
    assert resolve_route(SPEC, ctx_in).reason_code == REASON_CANARY_IN
    # out-of-cohort subject (subj_a bucket 4543 ≥ 2000)
    ctx_out = rrt.build_context(state, cfg, ASPEC, SPEC, durable_event_uid="subj_a",
                                legacy_available=True, materiality_available=False,
                                gate_status=gate, cycle_id="c")
    assert ctx_out.canary_membership is False
    assert resolve_route(SPEC, ctx_out).reason_code == REASON_CANARY_OUT
    # applied route is legacy in both
    assert resolve_route(SPEC, ctx_in).applied_route == ROUTE_LEGACY


def test_canary_missing_subject_is_out(tmp_path):
    cfg = _canary_config(PINNED_CANARY_BPS)
    state = _state(MODE_CANARY, readiness_status="ready")
    ctx = rrt.build_context(state, cfg, ASPEC, SPEC, durable_event_uid=None,
                            legacy_available=True, materiality_available=False,
                            gate_status={"a2_enabled": False, "a3_enabled": True}, cycle_id="c")
    assert ctx.canary_membership is None
    assert resolve_route(SPEC, ctx).reason_code == "canary_missing_subject"


# ── Rollback ──────────────────────────────────────────────────────────────────
def test_active_with_kill_proposes_legacy(tmp_path):
    out = _run(tmp_path, state=_state(MODE_ACTIVE, kill=True, readiness_status="ready"))
    assert out.proposed_route == ROUTE_LEGACY and out.reason_code == REASON_KILL_SWITCH


def test_no_stale_proposal_after_new_state(tmp_path):
    _run(tmp_path, cycle_id="c1", state=_state(MODE_SHADOW))
    assert rrt.latest_proposed_route().proposed_route == ROUTE_SHADOW
    _run(tmp_path, cycle_id="c2", state=_state(MODE_DISABLED))
    snap = rrt.latest_proposed_route()
    assert snap.proposed_route == ROUTE_LEGACY and snap.reason_code == REASON_DISABLED_MODE


# ── Import boundaries (AST) ────────────────────────────────────────────────────
_CORE = "app.materiality_routing"
_RTM = "app.materiality_routing_runtime"


def _production_py():
    for root in (pathlib.Path("app"), pathlib.Path("api")):
        yield from root.rglob("*.py")


def test_core_imports_only_a1_and_identity_utils():
    mods = _imported(pathlib.Path("app/materiality_routing.py"))
    app_mods = {m for m in mods if m.startswith("app.")}
    assert app_mods <= {"app.materiality_activation", "app.materiality_evaluation"}


def test_runtime_imports_within_allowed_set():
    mods = _imported(pathlib.Path("app/materiality_routing_runtime.py"))
    app_mods = {m for m in mods if m.startswith("app.")}
    assert app_mods <= {"app.materiality_activation", "app.materiality_activation_config",
                        "app.materiality_activation_runtime", "app.materiality_evaluation",
                        "app.materiality_routing", "app.storage"}


def test_import_boundaries():
    core_importers, rt_importers = set(), set()
    for path in _production_py():
        mods = _imported(path)
        name = path.as_posix()
        if path.name != "materiality_routing.py" and _CORE in mods:
            core_importers.add(name)
        if path.name != "materiality_routing_runtime.py" and _RTM in mods:
            rt_importers.add(name)
    assert core_importers == {"app/materiality_routing_runtime.py"}   # core only via the seam
    assert rt_importers == {"app/background.py"}                       # seam only via background
    bg = _imported(pathlib.Path("app/background.py"))
    assert _RTM in bg and _CORE not in bg                              # background imports seam, not core


def test_accessor_not_read_by_production():
    for path in _production_py():
        if path.name == "materiality_routing_runtime.py":
            continue
        for node in ast.walk(ast.parse(path.read_text(encoding="utf-8-sig"))):
            if isinstance(node, ast.ImportFrom) and node.module == _RTM:
                names = {a.name for a in node.names}
                assert "latest_proposed_route" not in names, path.as_posix()


# ── Byte-identical pipeline (A3 on vs off) ────────────────────────────────────
@pytest.mark.parametrize("mode", ["off", "shadow"])
def test_pipeline_byte_identical_a3_on_vs_off(fresh_identity, tmp_path, monkeypatch, mode):
    import app.background as bg
    import app.feeds as feeds_mod
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
            FeedItem(title="Fed holds rates steady", url="https://t/a3-strong",
                     source="Bloomberg Markets", category="Markets",
                     published_dt=fixed - timedelta(minutes=20), snippet="wire"),
            FeedItem(title="ECB signals patience on the policy path", url="https://t/a3-aged",
                     source="Bloomberg Markets", category="Markets",
                     published_dt=fixed - timedelta(hours=200), snippet="wire"),
        ]

    class _SumRes:
        new = cached = skipped = 0

    for target in (bg, theme_graph, feeds_mod):
        monkeypatch.setattr(target, "datetime", _FixedDateTime)
    import app.events as events_mod
    monkeypatch.setattr(events_mod, "datetime", _FixedDateTime)
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

    # Redirect A3 durable writes to tmp and pin its clock.
    a3_dir = tmp_path / "a3"
    real_cycle = rrt.run_routing_cycle

    def _redirected(enabled, **kw):
        kw["audit_dir"] = a3_dir
        kw["config_path"] = tmp_path / "cfg.jsonl"
        kw["clock"] = CLOCK
        return real_cycle(enabled, **kw)

    monkeypatch.setattr(rrt, "run_routing_cycle", _redirected)

    monkeypatch.setattr(settings, "materiality_safe_routing_enabled", False)
    feed_off = bg.run_pipeline(categories="", sources="")

    monkeypatch.setattr(settings, "materiality_safe_routing_enabled", True)
    feed_on = bg.run_pipeline(categories="", sources="")

    assert feed_off == feed_on
    assert pickle.dumps(feed_off) == pickle.dumps(feed_on)
    assert [e.id for e in feed_off.events] == [e.id for e in feed_on.events]

    def _round_trip(key, feed, cache_dir):
        monkeypatch.setattr(pc, "_CACHE_DIR", cache_dir)
        pc.ProcessedFeedCache().set(key, feed)
        return (cache_dir / f"feed_{key}.pkl").read_bytes()

    assert _round_trip("a3off", feed_off, tmp_path / "c_off") == \
        _round_trip("a3on", feed_on, tmp_path / "c_on")
    assert _build_response(feed_off, age=0.0) == _build_response(feed_on, age=0.0)

    blob = pickle.dumps(feed_on)
    for marker in (b"ProposedRoute", b"RoutingContext", b"rtprop_", b"materiality_routing"):
        assert marker not in blob
