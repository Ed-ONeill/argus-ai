"""
tests/test_explanations.py — IRE-1 canonical Explanation assembly.

Covers the contract's required scenarios: corroborated event, developing
one-source event, conflicting evidence, no material change, no valid
transmission path, no counterevidence, explicit counterevidence, and
deterministic repeated assembly — plus section completeness (no section is
ever silently omitted) and UID preservation.
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.events import EventEvidence, MarketEvent  # noqa: E402
from app.explanations import (  # noqa: E402
    ENGINE_VERSION,
    SECTION_NAMES,
    STATUSES,
    STATUS_AVAILABLE,
    STATUS_CONFLICTING,
    STATUS_DEVELOPING,
    STATUS_GATED,
    STATUS_INSUFFICIENT,
    STATUS_NOT_APPLICABLE,
    STATUS_UNCHANGED,
    _GraphIndex,
    build_explanation,
    build_explanations,
)
from app.narrative_graph import GraphEdge, GraphNode, NarrativeGraphResponse  # noqa: E402
from app.theme_graph import ThemeIntelligence  # noqa: E402


# ── Factories ──────────────────────────────────────────────────────────────────

def _evidence(source: str, tier: int, qualified: bool = True,
              title: str = "Fed raises rates", url: str | None = None) -> EventEvidence:
    return EventEvidence(
        source=source, title=title, url=url or f"https://example.com/{source}",
        published="2026-07-15T12:00:00+00:00", tier=tier, kind="news",
        qualified=qualified)


def _event(*, event_id: str = "evt-aaa111", n_qualified: int = 2,
           theme_ids: list[str] | None = None,
           companies: list[str] | None = None,
           companies_direct: list[str] | None = None,
           event_type: str = "macro") -> MarketEvent:
    evidence = [
        _evidence(f"wire-{i}", tier=1) for i in range(n_qualified)
    ] or [_evidence("aggregator", tier=4, qualified=False)]
    return MarketEvent(
        id=event_id,
        title="Fed raises rates by 25bp",
        event_type=event_type,
        first_seen="2026-07-15T12:00:00+00:00",
        last_updated="2026-07-15T14:00:00+00:00",
        corroboration_count=n_qualified,
        source_count=len(evidence),
        evidence=evidence,
        companies=list(companies or []),
        companies_direct=list(companies_direct or []),
        theme_ids=list(theme_ids or []),
        developing=n_qualified == 1,
    )


def _theme(*, theme_id: str = "ai-infrastructure", name: str = "AI Infrastructure",
           confidence: int = 70, momentum_delta: int = 0,
           momentum_label: str = "stable",
           related_assets: list[str] | None = None) -> ThemeIntelligence:
    return ThemeIntelligence(
        id=theme_id, name=name, description="test theme",
        signal_strength="strong", confidence=confidence,
        momentum_direction="bullish",
        related_assets=list(related_assets or []),
        momentum_delta=momentum_delta, momentum_label=momentum_label,
    )


def _graph(*, theme_id: str = "ai-infrastructure",
           drives: bool = True, pressures: bool = False) -> NarrativeGraphResponse:
    nodes = [
        GraphNode(id="macro--ai-capex", label="AI Capex", type="macro",
                  strength=80, sentiment="bullish", description="", source_count=5,
                  confidence=80),
        GraphNode(id="macro--rates", label="Rates", type="macro",
                  strength=60, sentiment="bearish", description="", source_count=4,
                  confidence=70),
        GraphNode(id=f"theme--{theme_id}", label="AI Infrastructure", type="theme",
                  strength=70, sentiment="bullish", description="", source_count=6,
                  confidence=70),
    ]
    edges = []
    if drives:
        edges.append(GraphEdge(
            id="e1", source="macro--ai-capex", target=f"theme--{theme_id}",
            relationship="drives", weight=0.8, confidence=0.75,
            description="AI capex drives the buildout"))
    if pressures:
        edges.append(GraphEdge(
            id="e2", source="macro--rates", target=f"theme--{theme_id}",
            relationship="pressures", weight=0.5, confidence=0.6,
            description="Rates pressure long-duration infrastructure"))
    return NarrativeGraphResponse(
        dominant_regime="AI Capex Expansion", nodes=nodes, edges=edges)


def _explain(event: MarketEvent, themes: list, graph=None):
    result = build_explanations([event], themes, graph=graph)
    assert event.id in result
    return result[event.id]


def _assert_contract(ex) -> None:
    """Every Explanation carries all nine sections with a valid status."""
    assert set(ex.sections.keys()) == set(SECTION_NAMES)
    for name in SECTION_NAMES:
        assert ex.sections[name].status in STATUSES, name
    assert ex.engine_version == ENGINE_VERSION
    assert ex.event_uid == f"event:cluster:{ex.event_id}"
    assert ex.content_hash


# ── Required scenarios ─────────────────────────────────────────────────────────

def test_corroborated_event():
    theme = _theme(related_assets=["NVDA"])
    event = _event(n_qualified=3, theme_ids=[theme.id],
                   companies=["NVDA"], companies_direct=["NVDA"])
    ex = _explain(event, [theme], graph=_graph())
    _assert_contract(ex)
    assert ex.sections["identity"].status == STATUS_AVAILABLE
    assert ex.sections["identity"].data["lane"] == "corroborated"
    assert ex.sections["evidence"].status == STATUS_AVAILABLE
    assert ex.sections["evidence"].data["corroboration_count"] == 3
    assert ex.sections["position"].status == STATUS_AVAILABLE
    # reserved stages ship as honest gates, never synthesized
    for name in ("memory", "stakes", "falsifiers"):
        assert ex.sections[name].status == STATUS_GATED
        assert ex.sections[name].data == {}


def test_developing_one_source_event():
    event = _event(n_qualified=1)
    ex = _explain(event, [], graph=None)
    _assert_contract(ex)
    assert ex.sections["identity"].data["lane"] == "developing"
    assert ex.sections["evidence"].status == STATUS_DEVELOPING
    assert "not yet corroborated" in ex.sections["evidence"].note.lower()
    assert ex.sections["confidence"].data["band"] == "weak"


def test_conflicting_evidence_caps_confidence():
    """Recorded counterevidence (a pressures edge into the supported theme)
    marks the counter section conflicting and caps an otherwise-strong verdict
    at moderate, with the cap reason stated."""
    theme = _theme(related_assets=["NVDA"])
    event = _event(n_qualified=3, theme_ids=[theme.id],
                   companies=["NVDA"], companies_direct=["NVDA"])
    ex = _explain(event, [theme], graph=_graph(pressures=True))
    _assert_contract(ex)
    assert ex.sections["counter"].status == STATUS_CONFLICTING
    conf = ex.sections["confidence"]
    assert conf.status == STATUS_CONFLICTING
    assert conf.data["band"] == "moderate"
    assert conf.data["cap"] is not None
    assert "counterevidence" in conf.data["cap"]["reason"]


def test_no_material_change_is_a_complete_answer():
    theme = _theme(momentum_delta=2, momentum_label="stable")
    event = _event(theme_ids=[theme.id])
    ex = _explain(event, [theme], graph=_graph())
    _assert_contract(ex)
    delta = ex.sections["delta"]
    assert delta.status == STATUS_UNCHANGED
    assert delta.data["changes"][0]["material"] is False
    assert "no material change" in delta.note.lower()


def test_material_change_is_reported():
    theme = _theme(momentum_delta=8, momentum_label="strengthening")
    event = _event(theme_ids=[theme.id])
    ex = _explain(event, [theme], graph=_graph())
    assert ex.sections["delta"].status == STATUS_AVAILABLE
    assert ex.sections["delta"].data["changes"][0]["material"] is True


def test_no_valid_transmission_path():
    """Linked theme but no recorded upstream edge and no exposed company the
    event touches: position is honestly insufficient, and the event's typed
    chain stays empty (nothing is invented)."""
    theme = _theme(related_assets=["AMD"])          # event names no AMD
    event = _event(theme_ids=[theme.id], companies=["XOM"], companies_direct=["XOM"])
    ex = _explain(event, [theme], graph=_graph(drives=False))
    _assert_contract(ex)
    assert ex.sections["position"].status == STATUS_INSUFFICIENT
    assert ex.sections["position"].data["chains"] == []
    assert event.transmission_chain == []


def test_unthemed_event_is_a_finding_not_a_failure():
    event = _event(theme_ids=[])
    ex = _explain(event, [], graph=_graph())
    _assert_contract(ex)
    assert ex.sections["position"].status == STATUS_NOT_APPLICABLE
    assert ex.sections["delta"].status == STATUS_NOT_APPLICABLE
    assert ex.sections["counter"].status == STATUS_NOT_APPLICABLE


def test_no_counterevidence_states_the_search():
    """The symmetric search that finds nothing states what it searched and
    that absence is a coverage statement — never silence, never consensus."""
    theme = _theme(related_assets=["NVDA"])
    event = _event(n_qualified=2, theme_ids=[theme.id], companies=["NVDA"])
    ex = _explain(event, [theme], graph=_graph(pressures=False))
    counter = ex.sections["counter"]
    assert counter.status == STATUS_INSUFFICIENT
    assert counter.data["items"] == []
    assert counter.data["searched"] == [
        "recorded_pressures_edges", "recorded_theme_trend_deltas"]
    assert "coverage statement" in counter.note


def test_explicit_counterevidence_preserves_rel_uids():
    theme = _theme(related_assets=["NVDA"])
    event = _event(theme_ids=[theme.id], companies=["NVDA"])
    ex = _explain(event, [theme], graph=_graph(pressures=True))
    counter = ex.sections["counter"]
    assert counter.status == STATUS_CONFLICTING
    pressure_items = [i for i in counter.data["items"] if i["kind"] == "recorded_pressure"]
    assert pressure_items
    assert pressure_items[0]["rel_uid"] == (
        "rel:driver:ontology:rates|pressures|theme:ontology:ai-infrastructure"
        if theme.id in _ontology_ids() else
        f"rel:driver:ontology:rates|pressures|theme:legacy:{theme.id}")


def _ontology_ids() -> frozenset[str]:
    from app.data.theme_ontology import THEME_ONTOLOGY
    return frozenset(THEME_ONTOLOGY.keys())


def test_recorded_weakening_trend_is_counterevidence():
    theme = _theme(momentum_delta=-9, momentum_label="cooling")
    event = _event(theme_ids=[theme.id])
    ex = _explain(event, [theme], graph=_graph(pressures=False))
    counter = ex.sections["counter"]
    assert counter.status == STATUS_CONFLICTING
    kinds = {i["kind"] for i in counter.data["items"]}
    assert "recorded_weakening_trend" in kinds


def test_deterministic_repeated_assembly():
    """Same inputs, byte-identical output — including the content hash."""
    def build():
        theme = _theme(related_assets=["NVDA"], momentum_delta=5)
        event = _event(n_qualified=2, theme_ids=[theme.id],
                       companies=["NVDA", "AMD"], companies_direct=["NVDA"])
        return _explain(event, [theme], graph=_graph(pressures=True))

    a, b = build(), build()
    assert a.to_dict() == b.to_dict()
    assert a.content_hash == b.content_hash


# ── Contract details ───────────────────────────────────────────────────────────

def test_transmission_chain_replaces_prose_and_keeps_it():
    """The typed chain lands on the event with rel UIDs on every hop; the
    legacy prose string is retained untouched (compatibility rule)."""
    theme = _theme(related_assets=["NVDA"])
    event = _event(theme_ids=[theme.id], companies=["NVDA"], companies_direct=["NVDA"])
    event.transmission = "AI Capex -> AI Infrastructure -> NVDA"   # legacy prose
    _explain(event, [theme], graph=_graph())
    assert event.transmission == "AI Capex -> AI Infrastructure -> NVDA"
    assert event.transmission_chain, "typed chain must be populated"
    for hop in event.transmission_chain:
        assert hop["rel_uid"].startswith("rel:")
        assert hop["basis"] in ("recorded_graph", "curated_ontology")
    verbs = [h["relationship"] for h in event.transmission_chain]
    assert "drives" in verbs and "exposed_to" in verbs


def test_evidence_refs_are_cluster_ids():
    event = _event(event_id="evt-bbb222")
    event.merged_event_ids = ["evt-ccc333"]
    ex = _explain(event, [], graph=None)
    assert ex.sections["evidence"].data["evidence_refs"] == ["evt-bbb222", "evt-ccc333"]


def test_attribution_never_inferred():
    """A company on the event only via theme transmission is theme_exposure
    with the recorded reason; one with no recorded basis is unattributed."""
    theme = _theme(related_assets=["AMD"])
    event = _event(theme_ids=[theme.id],
                   companies=["NVDA", "AMD", "XOM"], companies_direct=["NVDA"])
    ex = _explain(event, [theme], graph=None)
    attribution = {a["company"]: a for a in ex.sections["identity"].data["attribution"]}
    assert attribution["NVDA"]["class"] == "direct"
    assert attribution["AMD"]["class"] == "theme_exposure"
    assert attribution["AMD"]["reason"] == "Theme exposure: AI Infrastructure"
    assert attribution["XOM"]["class"] == "unattributed"


def test_no_probability_is_ever_issued():
    theme = _theme(related_assets=["NVDA"])
    event = _event(n_qualified=3, theme_ids=[theme.id], companies=["NVDA"])
    ex = _explain(event, [theme], graph=_graph())
    assert ex.sections["confidence"].data["probability"] is None


def test_graph_optional():
    """Assembly degrades honestly without a graph: no invented hops, position
    from curated exposure only."""
    theme = _theme(related_assets=["NVDA"])
    event = _event(theme_ids=[theme.id], companies=["NVDA"], companies_direct=["NVDA"])
    ex = _explain(event, [theme], graph=None)
    _assert_contract(ex)
    pos = ex.sections["position"]
    assert pos.status == STATUS_AVAILABLE
    assert all(h["basis"] == "curated_ontology"
               for c in pos.data["chains"] for h in c["hops"])
    assert pos.data["regime"] is None
