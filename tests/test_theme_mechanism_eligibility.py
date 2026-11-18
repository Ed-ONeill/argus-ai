"""Human-approved development controls, never promoted to unseen benchmark truth."""
import json
from datetime import datetime, timezone
from pathlib import Path

import pytest

import app.theme_graph as graph
from app.clustering import StoryCluster
from app.feeds import FeedItem, _extract_entities
from app.theme_relevance import mechanism_supported

ROOT = Path(__file__).resolve().parents[1]
REVIEW = ROOT / "docs/diagnostics/rc3-tm1b"
PACKETS = {p["id"]: p for p in json.loads((REVIEW / "human-review.json").read_text(encoding="utf-8"))}
JUDGMENTS = json.loads((REVIEW / "human-adjudications.json").read_text(encoding="utf-8"))["judgments"]
NOW = datetime(2026, 11, 18, tzinfo=timezone.utc)


def cluster(key, title, snippet, source="Financial Times"):
    item = FeedItem(title=title, snippet=snippet, source=source, category="Markets",
                    url="https://fixture.test/" + key, published_dt=NOW)
    item.affected_entities = _extract_entities(item)
    return StoryCluster(key, item, [], 1.0, title, 1)


@pytest.fixture
def isolated(monkeypatch):
    monkeypatch.setattr(graph, "_momentum_rehydrated", True)
    monkeypatch.setattr(graph, "_momentum_tracker", graph.ThemeMomentumTracker())
    monkeypatch.setattr(graph, "_persist_momentum_state", lambda now: None)
    for name in ("_MIN_EVIDENCE_COUNT", "_MIN_BREADTH", "_MIN_CONFIDENCE", "_MIN_STORIES"):
        monkeypatch.setattr(graph, name, 0)


@pytest.mark.parametrize("judgment", JUDGMENTS, ids=lambda j: j["judgment_id"])
def test_reviewed_contributor_authority(judgment, isolated):
    packet = PACKETS[judgment["packet_id"]]
    themes = graph.extract_themes([cluster(packet["id"], packet["title"], packet["snippet"])], now=NOW)
    actual = any(t.id == judgment["theme"] and packet["id"] in t.contributing_cluster_ids for t in themes)
    # B remains contextual, not re-labelled irrelevant; only A authorizes full contribution.
    assert actual == (judgment["human_decision"] == "A")


@pytest.mark.parametrize("theme,title", [
    ("ai-energy-demand", "Data centers face electricity grid capacity shortages"),
    ("glp1-healthcare-revolution", "Novo Nordisk expands Wegovy access"),
    ("treasury-yield-pressure", "Treasury yields rise as investors price higher neutral rates"),
    ("private-credit-expansion", "Banks retreat as capital requirements send lending to private credit"),
    ("direct-lending-expansion", "Private debt funds expand direct lending to businesses"),
    ("china-stimulus-rotation", "PBOC announces reserve requirement cuts to stimulate domestic demand"),
    ("ai-compute-arms-race", "Demand for AI accelerators strains compute capacity"),
    ("semiconductor-capex-cycle", "Chip foundry announces new capacity investment"),
])
def test_additional_mechanism_controls(theme, title):
    # Synthetic contract controls, explicitly distinct from human-reviewed source labels.
    assert mechanism_supported(theme, title, "")


def test_rejected_context_does_not_inflate_theme_counts_or_confidence(isolated):
    anchors = [cluster("a", "Data centers face power grid capacity shortages", ""),
               cluster("b", "AI power demand drives electricity grid upgrades", "", "Bloomberg Markets")]
    before = {t.id: t for t in graph.extract_themes(anchors, now=NOW)}["ai-energy-demand"]
    context = cluster("context", "Google raises capital for AI spending", "", "Third publisher")
    after = {t.id: t for t in graph.extract_themes(anchors + [context], now=NOW)}["ai-energy-demand"]
    assert after.contributing_cluster_ids == before.contributing_cluster_ids
    assert after.evidence_count == before.evidence_count
    assert after.confidence == before.confidence


def test_disconnected_ai_and_weather_sentences_do_not_prove_grid_theme():
    assert not mechanism_supported("ai-energy-demand", "AI stocks rally",
                                   "Summer heat causes electricity capacity shortages.")
    assert mechanism_supported("ai-energy-demand", "Data centers increase power demand",
                               "Grid capacity shortages delay new connections.")
