"""Wave 0.4 A4 — authority runtime/seam regressions.

Gate no-op, one-eval-per-cycle, current-engine denial, missing-input denial,
defensive accessor, audit-failure snapshot preservation, chain-coherent
decision-anchored audit (recurrence / tamper / reorder / predecessor), readiness
integrity, AST import boundaries, and byte-identical pipeline (A4 on vs off).
"""

import ast
import json
import pathlib
import pickle
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace as NS

import pytest

import app.event_identity as ei
import app.materiality_authority_runtime as art
from app.config import Settings, settings
from app.event_identity import IdentityAuthority
from app.materiality_activation import MODE_ACTIVE, MODE_DISABLED
from app.materiality_authority import (
    AUTHORITY_SPECIFICATION_V1 as SPEC,
    DECISION_DENIED,
    DECISION_GRANTED,
    DECISION_REVOKED,
    _sha,
)
from app.materiality_authority_runtime import DurableReadinessProvider
from app.materiality_readiness import readiness_specification_v1
from app.materiality_routing import ROUTE_ACTIVE
from app.materiality_routing import ROUTING_SPECIFICATION_V1 as R
from app.observation_ledger import LedgerStream

FIXED = datetime(2026, 8, 2, 12, 0, tzinfo=timezone.utc)
CLOCK = lambda: FIXED  # noqa: E731
_H = "a" * 64
_CUTOFF = "2026-08-01T00:00:00.000000Z"


@pytest.fixture(autouse=True)
def _reset():
    art.reset_authority_state()
    art.DIAGNOSTICS.clear()
    yield
    art.reset_authority_state()
    art.DIAGNOSTICS.clear()


@pytest.fixture
def fresh_identity(tmp_path, monkeypatch):
    auth = IdentityAuthority(journal=LedgerStream("identity", tmp_path / "ledger"),
                             snapshot_path=tmp_path / "event_registry.json")
    monkeypatch.setattr(ei, "_authority", auth)
    monkeypatch.setattr(settings, "event_identity", True)
    monkeypatch.setattr(settings, "registry_decay", True)
    monkeypatch.setattr(settings, "registry_folding", True)
    return auth


def _state():
    return NS(activation_state_id="actstate_x", activation_configuration_id="c",
              resolved_effective_mode=MODE_ACTIVE, kill_switch_engaged=False,
              activation_specification_id=SPEC.activation_specification_id)


def _ready(status="ready"):
    content = dict(readiness_specification_v1(_CUTOFF)._identity_content())
    return NS(readiness_result_id="rdres_" + _H, canonical_content_hash=_H,
              readiness_status=status, blocking_prerequisites=(),
              readiness_specification_id="rdspec_" + _sha(content),
              readiness_specification_content=content)


def _route():
    return NS(proposed_route_id="rtprop_y", proposed_route=ROUTE_ACTIVE,
              routing_specification_id=R.routing_specification_id)


class _RP:
    def __init__(self, view):
        self._view = view

    def get(self):
        return self._view


def _seam(tmp, *, cycle_id, state, readiness, route, **kw):
    return art.run_authority_cycle(
        True, observation_cycle_id=cycle_id, config_path=tmp / "cfg.jsonl", audit_dir=tmp / "ma",
        clock=CLOCK, state_provider=lambda: state, route_provider=lambda: route,
        readiness_provider=_RP(readiness), **kw)


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
    assert Settings.model_fields["materiality_authority_enabled"].default is False
    assert Settings(materiality_authority_enabled="banana").materiality_authority_enabled is False
    assert Settings(materiality_authority_enabled="on").materiality_authority_enabled is True


def test_gate_independent_of_a2_a3():
    s = Settings(materiality_authority_enabled=True)
    assert s.materiality_activation_runtime_enabled is False
    assert s.materiality_safe_routing_enabled is False


def test_disabled_gate_total_noop(tmp_path):
    d = tmp_path / "ma"
    out = art.run_authority_cycle(False, observation_cycle_id="c1", audit_dir=d, config_path=tmp_path / "c")
    assert out is None
    assert art.latest_authority_decision() is None
    assert not d.exists()
    assert art.DIAGNOSTICS.snapshot() == ()


# ── Seam ──────────────────────────────────────────────────────────────────────
def test_current_engine_denied(tmp_path):
    out = _seam(tmp_path, cycle_id="c1", state=None, readiness=None, route=None)
    assert out.decision == DECISION_DENIED and out.granted_authority_level == MODE_DISABLED


def test_promotion_via_seam(tmp_path):
    out = _seam(tmp_path, cycle_id="c1", state=_state(), readiness=_ready(), route=_route())
    assert out.decision == DECISION_GRANTED and out.granted_authority_level == MODE_ACTIVE
    assert art.latest_authority_decision().decision == DECISION_GRANTED


def test_one_eval_per_cycle(tmp_path):
    audit = tmp_path / "ma" / "authority-audit.jsonl"
    _seam(tmp_path, cycle_id="c1", state=_state(), readiness=_ready(), route=_route())   # granted
    _seam(tmp_path, cycle_id="c1", state=None, readiness=None, route=None)               # re-entry no-op
    assert _lines(audit) == 1
    assert art.latest_authority_decision().decision == DECISION_GRANTED                  # not overwritten


def test_accessor_updates_only_after_audit_and_defensive(tmp_path, monkeypatch):
    _seam(tmp_path, cycle_id="c1", state=_state(), readiness=_ready(), route=_route())   # granted
    prior = art.latest_authority_decision()
    assert prior.decision == DECISION_GRANTED
    assert art.latest_authority_decision() is not art.latest_authority_decision()        # defensive copies

    def _boom(_self, _text):
        raise OSError("disk down")

    monkeypatch.setattr(art.AuthorityAuditStore, "_write_line", _boom)
    out = _seam(tmp_path, cycle_id="c2", state=_state(), readiness=_ready("insufficient_evidence"),
                route=_route())                                                          # revoked → write → boom
    assert out is None
    assert art.latest_authority_decision().decision == DECISION_GRANTED                  # unchanged
    assert any(c == "audit_persist_failed" for c, *_ in art.DIAGNOSTICS.snapshot())


# ── Chain-coherent, decision-anchored audit ───────────────────────────────────
def test_audit_baseline_and_unchanged_repeats(tmp_path):
    audit = tmp_path / "ma" / "authority-audit.jsonl"
    _seam(tmp_path, cycle_id="c1", state=None, readiness=None, route=None)
    assert _lines(audit) == 1
    for i in range(4):
        _seam(tmp_path, cycle_id=f"r{i}", state=None, readiness=None, route=None)        # identical denials
    assert _lines(audit) == 1


def test_audit_restart_unchanged_writes_nothing(tmp_path):
    audit = tmp_path / "ma" / "authority-audit.jsonl"
    _seam(tmp_path, cycle_id="c1", state=None, readiness=None, route=None)
    assert _lines(audit) == 1
    art.reset_authority_state()
    _seam(tmp_path, cycle_id="c2", state=None, readiness=None, route=None)
    assert _lines(audit) == 1


def test_audit_granted_revoked_granted_three_distinct(tmp_path):
    d = tmp_path / "ma"
    audit = d / "authority-audit.jsonl"
    _seam(tmp_path, cycle_id="c1", state=_state(), readiness=_ready(), route=_route())           # granted
    _seam(tmp_path, cycle_id="c2", state=_state(), readiness=_ready("insufficient_evidence"),
          route=_route())                                                                        # revoked
    _seam(tmp_path, cycle_id="c3", state=_state(), readiness=_ready(), route=_route())           # granted
    assert _lines(audit) == 3
    audits = art.AuthorityAuditStore(d).audits
    assert audits[0].authority_decision_id == audits[2].authority_decision_id     # same grant decision
    assert audits[0].authority_audit_id != audits[2].authority_audit_id           # distinct via chain
    assert audits[2].previous_authority_decision_id == audits[1].authority_decision_id
    for i in range(3):                                                             # repeats add none
        _seam(tmp_path, cycle_id=f"c3r{i}", state=_state(), readiness=_ready(), route=_route())
    assert _lines(audit) == 3


def test_audit_content_tamper_rejected(tmp_path):
    d = tmp_path / "ma"
    audit = d / "authority-audit.jsonl"
    _seam(tmp_path, cycle_id="c1", state=None, readiness=None, route=None)
    row = json.loads(audit.read_text(encoding="utf-8").splitlines()[0])
    row["reason"] = "granted"                                    # tamper, keep stored id
    audit.write_text(json.dumps(row) + "\n", encoding="utf-8")
    with pytest.raises(ValueError):
        art.AuthorityAuditStore(d)


def test_audit_predecessor_and_decision_anchor_mismatch_rejected(tmp_path):
    d = tmp_path / "ma"
    audit = d / "authority-audit.jsonl"
    _seam(tmp_path, cycle_id="c1", state=_state(), readiness=_ready(), route=_route())
    _seam(tmp_path, cycle_id="c2", state=_state(), readiness=_ready("insufficient_evidence"),
          route=_route())
    rows = audit.read_text(encoding="utf-8").splitlines()
    row2 = json.loads(rows[1])
    forged = art.AuthorityAudit(
        previous_authority_audit_id=row2["previous_authority_audit_id"],
        previous_authority_decision_id="authdec_forged",        # broken decision anchor
        authority_decision_id=row2["authority_decision_id"],
        from_granted_authority_level=row2["from_granted_authority_level"],
        to_granted_authority_level=row2["to_granted_authority_level"],
        decision=row2["decision"], reason=row2["reason"], generated_at=row2.get("generated_at"),
        observation_cycle_id=row2.get("observation_cycle_id", ""))
    out = forged._identity_content()
    out["generated_at"] = forged.generated_at
    out["observation_cycle_id"] = forged.observation_cycle_id
    out["authority_audit_id"] = forged.authority_audit_id
    audit.write_text(rows[0] + "\n" + json.dumps(out) + "\n", encoding="utf-8")
    with pytest.raises(ValueError):
        art.AuthorityAuditStore(d)


def test_audit_reorder_rejected(tmp_path):
    d = tmp_path / "ma"
    audit = d / "authority-audit.jsonl"
    _seam(tmp_path, cycle_id="c1", state=_state(), readiness=_ready(), route=_route())
    _seam(tmp_path, cycle_id="c2", state=_state(), readiness=_ready("insufficient_evidence"),
          route=_route())
    rows = audit.read_text(encoding="utf-8").splitlines()
    audit.write_text(rows[1] + "\n" + rows[0] + "\n", encoding="utf-8")
    with pytest.raises(ValueError):
        art.AuthorityAuditStore(d)


# ── Readiness provider ────────────────────────────────────────────────────────
def test_readiness_provider_integrity(tmp_path):
    p = tmp_path / "r.json"
    p.parent.mkdir(parents=True, exist_ok=True)
    assert DurableReadinessProvider(tmp_path / "absent.json").get() is None
    p.write_text("{ broken", encoding="utf-8")
    assert DurableReadinessProvider(p).get() is None
    p.write_text(json.dumps({"readiness_result_id": "rdres_WRONG", "canonical_content_hash": "abc",
                             "readiness_status": "ready"}), encoding="utf-8")
    assert DurableReadinessProvider(p).get() is None            # id != rdres_+hash
    p.write_text(json.dumps({"readiness_result_id": "rdres_" + _H, "canonical_content_hash": _H,
                             "readiness_status": "ready", "blocking_prerequisites": []}),
                 encoding="utf-8")
    view = DurableReadinessProvider(p).get()
    assert view is not None and view.readiness_status == "ready"


# ── Import boundaries (AST) ────────────────────────────────────────────────────
_CORE = "app.materiality_authority"
_RTM = "app.materiality_authority_runtime"


def _production_py():
    for root in (pathlib.Path("app"), pathlib.Path("api")):
        yield from root.rglob("*.py")


def test_core_imports_within_allowed_set():
    app_mods = {m for m in _imported(pathlib.Path("app/materiality_authority.py")) if m.startswith("app.")}
    assert app_mods <= {"app.materiality_activation", "app.materiality_evaluation",
                        "app.materiality_readiness", "app.materiality_routing",
                        "app.materiality_thresholds"}


def test_runtime_imports_within_allowed_set():
    app_mods = {m for m in _imported(pathlib.Path("app/materiality_authority_runtime.py"))
                if m.startswith("app.")}
    assert app_mods <= {"app.materiality_activation_config", "app.materiality_activation_runtime",
                        "app.materiality_authority", "app.materiality_evaluation",
                        "app.materiality_routing_runtime", "app.storage"}


def test_import_boundaries():
    core_importers, rt_importers = set(), set()
    for path in _production_py():
        mods = _imported(path)
        if path.name != "materiality_authority.py" and _CORE in mods:
            core_importers.add(path.as_posix())
        if path.name != "materiality_authority_runtime.py" and _RTM in mods:
            rt_importers.add(path.as_posix())
    assert core_importers == {"app/materiality_authority_runtime.py"}
    assert rt_importers == {"app/background.py"}
    bg = _imported(pathlib.Path("app/background.py"))
    assert _RTM in bg and _CORE not in bg


def test_accessor_not_read_by_production():
    for path in _production_py():
        if path.name == "materiality_authority_runtime.py":
            continue
        for node in ast.walk(ast.parse(path.read_text(encoding="utf-8-sig"))):
            if isinstance(node, ast.ImportFrom) and node.module == _RTM:
                assert "latest_authority_decision" not in {a.name for a in node.names}, path.as_posix()


# ── Byte-identical pipeline (A4 on vs off) ────────────────────────────────────
@pytest.mark.parametrize("mode", ["off", "shadow"])
def test_pipeline_byte_identical_a4_on_vs_off(fresh_identity, tmp_path, monkeypatch, mode):
    import app.background as bg
    import app.events as events_mod
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
            FeedItem(title="Fed holds rates steady", url="https://t/a4-strong",
                     source="Bloomberg Markets", category="Markets",
                     published_dt=fixed - timedelta(minutes=20), snippet="wire"),
            FeedItem(title="ECB signals patience on the policy path", url="https://t/a4-aged",
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

    a4_dir = tmp_path / "a4"
    real_cycle = art.run_authority_cycle

    def _redirected(enabled, **kw):
        kw["audit_dir"] = a4_dir
        kw["config_path"] = tmp_path / "cfg.jsonl"
        kw["clock"] = CLOCK
        return real_cycle(enabled, **kw)

    monkeypatch.setattr(art, "run_authority_cycle", _redirected)

    monkeypatch.setattr(settings, "materiality_authority_enabled", False)
    feed_off = bg.run_pipeline(categories="", sources="")

    monkeypatch.setattr(settings, "materiality_authority_enabled", True)
    feed_on = bg.run_pipeline(categories="", sources="")

    assert feed_off == feed_on
    assert pickle.dumps(feed_off) == pickle.dumps(feed_on)
    assert [e.id for e in feed_off.events] == [e.id for e in feed_on.events]

    def _round_trip(key, feed, cache_dir):
        monkeypatch.setattr(pc, "_CACHE_DIR", cache_dir)
        pc.ProcessedFeedCache().set(key, feed)
        return (cache_dir / f"feed_{key}.pkl").read_bytes()

    assert _round_trip("a4off", feed_off, tmp_path / "c_off") == \
        _round_trip("a4on", feed_on, tmp_path / "c_on")
    assert _build_response(feed_off, age=0.0) == _build_response(feed_on, age=0.0)

    blob = pickle.dumps(feed_on)
    for marker in (b"AuthorityDecision", b"authdec_", b"materiality_authority"):
        assert marker not in blob


# ── Correction 2: revocation persistence (episode semantics, chain-derived) ────
def test_episode_granted_revoked_revoked_is_two_audits(tmp_path):
    audit = tmp_path / "ma" / "authority-audit.jsonl"
    _seam(tmp_path, cycle_id="c1", state=_state(), readiness=_ready(), route=_route())           # granted
    for i in range(3):                                                                            # lost, stays revoked
        _seam(tmp_path, cycle_id=f"lost{i}", state=_state(),
              readiness=_ready("insufficient_evidence"), route=_route())
    assert _lines(audit) == 2                            # grant + one revoke; no denial, no extra revoke
    assert art.latest_authority_decision().decision == DECISION_REVOKED


def test_episode_revoked_survives_restart(tmp_path):
    audit = tmp_path / "ma" / "authority-audit.jsonl"
    _seam(tmp_path, cycle_id="c1", state=_state(), readiness=_ready(), route=_route())            # granted
    _seam(tmp_path, cycle_id="c2", state=_state(), readiness=_ready("insufficient_evidence"),
          route=_route())                                                                         # revoked
    assert _lines(audit) == 2
    art.reset_authority_state()                                                                   # restart
    _seam(tmp_path, cycle_id="c3", state=_state(), readiness=_ready("insufficient_evidence"),
          route=_route())                                                                         # still revoked
    assert _lines(audit) == 2                            # chain-derived: no new artifact


def test_never_granted_denials_are_one_baseline(tmp_path):
    audit = tmp_path / "ma" / "authority-audit.jsonl"
    for i in range(4):
        _seam(tmp_path, cycle_id=f"d{i}", state=None, readiness=None, route=None)
    assert _lines(audit) == 1
    assert art.latest_authority_decision().decision == DECISION_DENIED


def test_episode_granted_revoked_granted_revoked_is_four(tmp_path):
    audit = tmp_path / "ma" / "authority-audit.jsonl"
    _seam(tmp_path, cycle_id="g1", state=_state(), readiness=_ready(), route=_route())            # granted
    _seam(tmp_path, cycle_id="r1", state=_state(), readiness=_ready("insufficient_evidence"),
          route=_route())                                                                         # revoked
    _seam(tmp_path, cycle_id="g2", state=_state(), readiness=_ready(), route=_route())            # granted (new episode)
    _seam(tmp_path, cycle_id="r2", state=_state(), readiness=_ready("insufficient_evidence"),
          route=_route())                                                                         # revoked
    assert _lines(audit) == 4
    audits = art.AuthorityAuditStore(tmp_path / "ma").audits
    assert [a.decision for a in audits] == [DECISION_GRANTED, DECISION_REVOKED,
                                            DECISION_GRANTED, DECISION_REVOKED]


def test_two_cutoffs_both_promote_with_exact_binding(tmp_path):
    def _ready_cut(cutoff):
        content = dict(readiness_specification_v1(cutoff)._identity_content())
        return NS(readiness_result_id="rdres_" + _H, canonical_content_hash=_H,
                  readiness_status="ready", blocking_prerequisites=(),
                  readiness_specification_id="rdspec_" + _sha(content),
                  readiness_specification_content=content)

    out1 = _seam(tmp_path, cycle_id="c1", state=_state(),
                 readiness=_ready_cut("2026-08-01T00:00:00.000000Z"), route=_route())
    art.reset_authority_state()
    out2 = _seam(tmp_path / "b", cycle_id="c1", state=_state(),
                 readiness=_ready_cut("2026-09-15T00:00:00.000000Z"), route=_route())
    assert out1.decision == DECISION_GRANTED and out2.decision == DECISION_GRANTED
