"""TM1b1 contract: real source excerpts and explicitly synthetic edge cases.

These are development controls, not additional human-approved benchmark labels.
"""
from copy import deepcopy
from dataclasses import asdict
from datetime import datetime, timezone
import json
from pathlib import Path

import pytest

from app.clustering import StoryCluster
from app.feeds import FeedItem, _extract_entities
import app.theme_graph as graph

NOW = datetime(2026, 6, 3, 23, 45, tzinfo=timezone.utc)
FIXTURES = Path(__file__).parent / "fixtures"
CONTROLS = json.loads((FIXTURES / "theme_spending_controls.json").read_text(encoding="utf-8"))


@pytest.fixture(autouse=True)
def isolate_memory(monkeypatch):
    monkeypatch.setattr(graph, "_momentum_tracker", graph.ThemeMomentumTracker())
    monkeypatch.setattr(graph, "_momentum_rehydrated", True)
    monkeypatch.setattr(graph, "_persist_momentum_state", lambda now: None)


def cluster(key, title, snippet="", source="Bloomberg Markets", hints=None):
    item = FeedItem(title=title, snippet=snippet, url=f"https://fixture.test/{key}",
                    source=source, category="Markets", published_dt=NOW)
    item.affected_entities = _extract_entities(item) if hints is None else hints
    return StoryCluster(key, item, [], 1.0, title, 1)


def seeded(candidate):
    return [cluster("anchor-1", "$COST reports results"),
            cluster("anchor-2", "$WMT reports results", source="Financial Times"), candidate]


def extract(candidates):
    graph._momentum_tracker = graph.ThemeMomentumTracker()
    return {t.id: asdict(t) for t in graph.extract_themes(candidates, now=NOW)}


@pytest.mark.parametrize("record", CONTROLS, ids=lambda r: r["id"])
def test_spending_contribution_contract(record):
    candidate = cluster(record["id"], record["title"], record["snippet"],
                        hints=record.get("entity_hints"))
    candidates = seeded(candidate)
    before = deepcopy([asdict(c) for c in candidates])
    result = extract(candidates)["consumer-stress"]
    assert (record["id"] in result["contributing_cluster_ids"]) == record["eligible"]
    assert [asdict(c) for c in candidates] == before


@pytest.mark.parametrize("title,snippet", [
    ("Google raises AI spending", "Consumers say higher prices crimp their budgets."),
    ("Households face higher bills", "Google raises AI spending."),
    ("Google raises AI spending while households face pressure", ""),
    ("Spending on consumer software falls at Google", ""),
    ("Spending spending SPENDING", "Spends spent spending"),
    ("Consumers welcome government cutting spending", ""),
    ("Households watch corporations reduce spending", ""),
    ("Government reduces spending for households", ""),
    ("Consumers say Google is cutting AI spending", ""),
    ("Are households cutting back on spending?", ""),
])
def test_disconnected_context_and_repetition_do_not_qualify(title, snippet):
    result = extract(seeded(cluster("candidate", title, snippet)))["consumer-stress"]
    assert "candidate" not in result["contributing_cluster_ids"]


def test_duplicate_and_morphological_catalog_entries_are_not_independent_support(monkeypatch):
    catalog = deepcopy(graph.THEME_CATALOG)
    catalog["consumer-stress"]["keywords"] += ["spending", "spends", "spent"]
    monkeypatch.setattr(graph, "THEME_CATALOG", catalog)
    candidate = cluster("candidate", "Google spending rises as it spends more", "Money spent on AI")
    assert "candidate" not in extract(seeded(candidate))["consumer-stress"]["contributing_cluster_ids"]


@pytest.mark.parametrize("title,snippet", [
    ("Google spending rises", "Credit card delinquency climbs."),
    ("Costco spending rises", ""),
    ("Retail spending rises", ""),  # other generic families are outside this slice
    ("Consumer spending rebounds as pressure eases", ""),  # independent existing phrase
])
def test_other_existing_support_bypasses_spending_only_gate(title, snippet):
    assert "candidate" in extract(seeded(cluster("candidate", title, snippet)))["consumer-stress"]["contributing_cluster_ids"]


def test_unrelated_theme_payloads_match_prechange_capture():
    baseline = json.loads((FIXTURES / "theme_spending_unrelated_baseline.json").read_text(encoding="utf-8"))
    for record in CONTROLS:
        candidates = seeded(cluster(record["id"], record["title"], record["snippet"],
                                    hints=record.get("entity_hints")))
        candidates += [cluster("ai-1", "Nvidia reports results"),
                       cluster("ai-2", "Broadcom reports results", source="Financial Times"),
                       cluster("defense-1", "Lockheed Martin reports results"),
                       cluster("defense-2", "Northrop Grumman reports results", source="Financial Times")]
        actual = extract(candidates)
        actual.pop("consumer-stress", None)
        assert len(actual) >= 2  # exercise emitted themes, not an empty payload
        assert actual == baseline[record["id"]]


def test_retained_contributors_remain_just_above_emission_floor():
    """Unedited June consumer-stress contributors, not artificial seed stories."""
    snapshot = json.loads((FIXTURES / "theme_spending_retained_boundary.json").read_text(encoding="utf-8"))
    clusters = []
    for r in snapshot["clusters"]:
        item = FeedItem(**r["primary"])
        item.published_dt = datetime.fromisoformat(r["published_dt"]) if r["published_dt"] else None
        clusters.append(StoryCluster(r["id"], item, [], r["cluster_score"], item.title, 1))
    result = {t.id: t for t in graph.extract_themes(clusters, now=datetime.fromisoformat(snapshot["now"]))}
    consumer = result["consumer-stress"]
    assert consumer.contributing_cluster_ids == ["188014636b8b", "50a4632f9a27"]
    assert consumer.confidence == 21
    assert consumer.evidence_count == consumer.contributing_story_count == 2
