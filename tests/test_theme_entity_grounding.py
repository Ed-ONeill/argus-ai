"""TM1a: entity contributions must respect the existing company resolver.

Exercises emitted memberships with the real ontology and qualifying independent
contributors. Generic-keyword policy and existing scoring remain separate.
"""
from copy import deepcopy
from dataclasses import asdict
from datetime import datetime, timezone
import json
from pathlib import Path

import pytest

from app.clustering import StoryCluster
from app.events import build_market_events
from app.feeds import FeedItem, _extract_entities
import app.theme_graph as graph

NOW = datetime(2026, 7, 25, 18, tzinfo=timezone.utc)
FIXTURES = Path(__file__).parent / 'fixtures'
NEGATIVES = json.loads((FIXTURES / 'theme_entity_collisions.json').read_text(encoding='utf-8'))
POSITIVES = {
    'consumer-stress': ['$COST shares rise', 'Costco reports results'],
    'utility-capex-supercycle': ['$SO shares rise', 'Southern Company reports results'],
    'semiconductor-capex-cycle': ['Nvidia reports results', 'Broadcom reports results'],
    'glp1-healthcare-revolution': ['Novo Nordisk reports results', 'Eli Lilly reports results'],
    'defense-reindustrialization': ['Lockheed Martin reports results', 'Northrop Grumman reports results'],
}


@pytest.fixture(autouse=True)
def isolate_memory(monkeypatch):
    monkeypatch.setattr(graph, '_momentum_tracker', graph.ThemeMomentumTracker())
    monkeypatch.setattr(graph, '_momentum_rehydrated', True)
    monkeypatch.setattr(graph, '_persist_momentum_state', lambda now: None)


def cluster(key, title, snippet='', source='Bloomberg Markets'):
    item = FeedItem(title=title, snippet=snippet, url=f'https://fixture.test/{key}',
                    source=source, category='Markets', published_dt=NOW)
    item.affected_entities = _extract_entities(item)
    return StoryCluster(key, item, [], 1.0, title, 1)


def seeded(theme_id, candidate):
    tickers = {'consumer-stress': ('COST', 'WMT'),
               'utility-capex-supercycle': ('SO', 'DUK')}[theme_id]
    return [cluster('anchor-1', f'${tickers[0]} shares rise'),
            cluster('anchor-2', f'${tickers[1]} authorizes dividend payment', source='Financial Times'),
            candidate]


def theme(clusters, theme_id):
    return next(t for t in graph.extract_themes(clusters, now=NOW) if t.id == theme_id)


@pytest.mark.parametrize('record', NEGATIVES, ids=lambda row: row['id'])
def test_retained_word_collision_cannot_join_emitted_theme(record):
    candidate = cluster('candidate', record['title'], record['snippet'], record['source'])
    candidates = seeded(record['theme_id'], candidate)
    before = deepcopy([asdict(c) for c in candidates])
    emitted = theme(candidates, record['theme_id'])
    assert set(emitted.contributing_cluster_ids) == {'anchor-1', 'anchor-2'}
    assert emitted.evidence_count == 2
    assert [asdict(c) for c in candidates] == before


@pytest.mark.parametrize('title,hints', [
    ('The cost of delays keeps rising', ['COST']),
    ('COST OF DELAYS KEEPS RISING', ['COST']),
    ('Changes are so difficult to implement', ['SO']),
    ('SO MANY CHANGES REMAIN', ['SO']),
])
def test_stale_or_untyped_hints_cannot_bypass_context(title, hints):
    candidate = cluster('candidate', title)
    candidate.primary.affected_entities = hints
    theme_id = 'consumer-stress' if hints == ['COST'] else 'utility-capex-supercycle'
    assert 'candidate' not in theme(seeded(theme_id, candidate), theme_id).contributing_cluster_ids


@pytest.mark.parametrize('title,theme_id', [
    ('$SO raises guidance', 'utility-capex-supercycle'),
    ('Southern Company reports results', 'utility-capex-supercycle'),
    ('SO shares rise', 'utility-capex-supercycle'),
    ('$COST raises guidance', 'consumer-stress'),
    ('Costco reports results', 'consumer-stress'),
    ('COST shares rise', 'consumer-stress'),
])
def test_explicit_company_controls_keep_membership(title, theme_id):
    assert 'candidate' in theme(seeded(theme_id, cluster('candidate', title)), theme_id).contributing_cluster_ids


def test_positive_payloads_preserve_existing_scores_and_order():
    expected = json.loads((FIXTURES / 'theme_entity_positive_baseline.json').read_text(encoding='utf-8'))
    for theme_id, titles in POSITIVES.items():
        graph._momentum_tracker = graph.ThemeMomentumTracker()
        candidates = [cluster('p1', titles[0]), cluster('p2', titles[1], source='Financial Times')]
        actual = [asdict(t) for t in graph.extract_themes(candidates, now=NOW)]
        assert theme_id in {t['id'] for t in actual}
        assert actual == expected[theme_id]


def test_event_evidence_and_direct_entities_are_not_mutated_by_theme_gating():
    record = NEGATIVES[0]
    candidates = seeded(record['theme_id'], cluster('candidate', record['title'], record['snippet']))
    baseline = build_market_events(candidates, [], now=NOW)
    themes = graph.extract_themes(candidates, now=NOW)
    actual = build_market_events(candidates, themes, now=NOW)
    def evidence_contract(events):
        return {e.id: (e.title, e.companies_direct, e.source_count, e.corroboration_count,
                       [asdict(row) for row in e.evidence]) for e in events}
    assert evidence_contract(actual) == evidence_contract(baseline)
    assert len(actual) == len(candidates)


def test_generic_keyword_policy_is_unchanged_in_tm1a():
    candidates = [cluster('a', 'Alibaba reports results'),
                  cluster('b', 'PDD authorizes dividend payment', source='Financial Times'),
                  cluster('generic', 'Chinese athletes open sports festival')]
    assert 'generic' in theme(candidates, 'china-stimulus-rotation').contributing_cluster_ids
