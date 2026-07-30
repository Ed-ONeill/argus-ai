"""
tests/test_feed_activation_debug.py — Phase 1 hardening (security backlog).

Proves /api/feed/activation-debug is strictly READ-ONLY: it reports what the
background pipeline last wrote and NEVER mutates the shared feed cache (in memory
or on disk), never re-runs extraction, and never persists an empty-array fallback.

Test isolation contract (Codex re-review):
  * The production `feed_cache` singleton is replaced with an in-memory fake for
    every test via monkeypatch fixtures (auto-restored, even on failure/interrupt).
  * The fake has NO disk persistence and does NOT delegate to the real setter.
  * An autouse guard asserts nothing under data/feed_cache/ is created or modified.
  * `activation_debug` imports `feed_cache`/`make_cache_key` locally from
    app.processed_cache, so the fake is installed on app.processed_cache (the
    symbol the local import actually reads) as well as on api.routes.feed.
"""

from __future__ import annotations

import copy
import inspect
from pathlib import Path
from types import SimpleNamespace

import pytest
from fastapi import Depends, FastAPI
from fastapi.testclient import TestClient

import app.processed_cache as processed_cache
import app.theme_graph as theme_graph
from app.processed_cache import ProcessedFeed, make_cache_key
from app.auth import AuthedUser, require_user
from api.routes import feed as feed_route

GLOBAL_KEY = make_cache_key("", "", False)
FEED_CACHE_DIR = Path(__file__).resolve().parents[1] / "data" / "feed_cache"

# The exact read-only response contract. A removed/renamed/retyped field fails.
EXPECTED_CONTRACT: dict[str, type | tuple] = {
    "data_source":           str,
    "generated_at":          str,
    "cache_age_seconds":     (int, float),
    "cluster_count":         int,
    "item_count":            int,
    "theme_count":           int,
    "themes":                list,
    "industry_count":        int,
    "active_industry_count": int,
    "industries":            list,
    "sector_count":          int,
    "active_sector_count":   int,
    "sectors":               list,
    "sample_clusters":       list,
    "scored_clusters":       list,
    "regime":                str,
}
THEME_KEYS   = {"id", "name", "confidence", "strength", "industries",
                "cluster_count", "story_count", "momentum"}
INDUSTRY_KEYS = {"industry", "score", "sentiment", "stories", "themes",
                 "assets", "momentum", "confidence"}
SECTOR_KEYS  = {"name", "score", "count", "sentiment", "align"}
SAMPLE_KEYS  = {"id", "title", "source", "category", "signal_score",
                "signal_strength", "entities", "cluster_score", "story_count"}
SCORED_KEYS  = {"title", "entities", "title_norm", "theme_scores"}


# ── In-memory fake cache (no disk, no production singleton) ─────────────────────

class _FakeFeedCache:
    """Implements only what activation_debug touches: get / age_seconds. `set`
    records calls so the read-only invariant is assertable; it writes ONLY to
    this fake's own dict — never to the real cache or disk."""

    def __init__(self) -> None:
        self._store: dict[str, ProcessedFeed] = {}
        self._ages: dict[str, float] = {}
        self.set_calls: list[str] = []

    def get(self, key: str):
        return self._store.get(key)

    def age_seconds(self, key: str):
        return self._ages.get(key)

    def set(self, key: str, feed) -> None:          # must never be called by the endpoint
        self.set_calls.append(key)
        self._store[key] = feed

    def seed(self, key: str, feed, age: float = 1.5) -> None:
        # Direct seeding — deliberately NOT via .set(), so set_calls stays empty.
        self._store[key] = feed
        self._ages[key] = age


# ── Fixtures ───────────────────────────────────────────────────────────────────

@pytest.fixture
def fake_cache(monkeypatch):
    fake = _FakeFeedCache()
    # The local `from app.processed_cache import feed_cache` inside activation_debug
    # reads this attribute at call time:
    monkeypatch.setattr(processed_cache, "feed_cache", fake)
    # Belt and braces for any module-global reference in api.routes.feed:
    monkeypatch.setattr(feed_route, "feed_cache", fake, raising=False)
    return fake


@pytest.fixture
def guard_extraction(monkeypatch):
    """extract_themes / compute_industry_activation must never run from this
    read-only endpoint — wire them to explode if they do."""
    def _boom(*_a, **_k):
        raise AssertionError("activation_debug must not invoke extraction")
    monkeypatch.setattr(theme_graph, "extract_themes", _boom)
    monkeypatch.setattr(theme_graph, "compute_industry_activation", _boom)


def _dir_snapshot(d: Path) -> dict[str, tuple[int, int]]:
    if not d.exists():
        return {}
    return {p.name: (p.stat().st_size, p.stat().st_mtime_ns)
            for p in d.iterdir() if p.is_file()}


@pytest.fixture(autouse=True)
def assert_no_disk_cache_writes():
    """Hard guarantee: no test in this module creates or modifies a persistent
    feed-cache pickle. Runs even if the test body fails midway."""
    before = _dir_snapshot(FEED_CACHE_DIR)
    yield
    assert _dir_snapshot(FEED_CACHE_DIR) == before, \
        "a test touched data/feed_cache/ — isolation broken"


# ── Seed builders (lightweight stand-ins with the accessed attributes) ──────────

def _theme():
    return SimpleNamespace(
        id="theme:ai", name="AI Infrastructure", confidence=0.82,
        signal_strength="strong", related_industries=["semiconductors"],
        contributing_cluster_ids=["c1"], contributing_story_count=3,
        momentum_label="rising",
    )

def _activation():
    return SimpleNamespace(
        industry="semiconductors", score=5.0, sentiment="positive",
        active_story_count=2, related_theme_names=["AI Infrastructure"],
        related_assets=["NVDA"], momentum_label="rising", confidence_label="high",
    )

def _cluster():
    primary = SimpleNamespace(
        title="Chipmaker beats estimates", snippet="a strong quarter for AI demand",
        affected_entities=["NVDA"], source="wsj", category="markets",
        signal_score=7, signal_strength="strong",
    )
    return SimpleNamespace(id="c1", primary=primary, cluster_score=9.0, story_count=4)

def _sector_data():
    sector = SimpleNamespace(
        name="Technology", signal_score=6.0, signal_count=3,
        impact_sentiment="positive", regime_alignment="aligned",
    )
    return SimpleNamespace(sectors=[sector], derived_regime="risk-on")

def _entry(*, populated: bool) -> ProcessedFeed:
    e = ProcessedFeed(items=[], top_stories={}, market_take="", errors={},
                      promo_excluded=0, debug_log=[])
    e.theme_intelligence  = [_theme()]      if populated else []
    e.industry_activation = [_activation()] if populated else []
    e.clusters            = [_cluster()]    if populated else []
    e.sector_data         = _sector_data()  if populated else None
    return e


def _assert_full_contract(payload: dict, *, populated: bool):
    assert set(payload) == set(EXPECTED_CONTRACT), "top-level response keys drifted"
    for field, typ in EXPECTED_CONTRACT.items():
        assert isinstance(payload[field], typ), f"{field} has wrong type"
    assert payload["data_source"] == "cached"
    if populated:
        assert set(payload["themes"][0])          == THEME_KEYS
        assert set(payload["industries"][0])      == INDUSTRY_KEYS
        assert set(payload["sectors"][0])         == SECTOR_KEYS
        assert set(payload["sample_clusters"][0]) == SAMPLE_KEYS
        assert set(payload["scored_clusters"][0]) == SCORED_KEYS
        assert payload["active_industry_count"] == 1


# ── Direct-call tests ───────────────────────────────────────────────────────────

def test_read_only_no_cache_writes(fake_cache, guard_extraction):
    entry = _entry(populated=True)
    fake_cache.seed(GLOBAL_KEY, entry)

    result = feed_route.activation_debug()

    assert fake_cache.set_calls == [], "activation_debug must not write to the cache"
    assert result["data_source"] == "cached"
    assert fake_cache.get(GLOBAL_KEY) is entry, "the cached entry was replaced"


def test_value_equivalence_across_two_calls(fake_cache, guard_extraction):
    """Deep value-equivalence — guards against in-place mutation, not just
    object-identity swaps."""
    entry = _entry(populated=True)
    fake_cache.seed(GLOBAL_KEY, entry)
    baseline = copy.deepcopy(entry)

    for _ in range(2):
        feed_route.activation_debug()
        # Whole-entry value equality (dataclass __eq__ over all fields)...
        assert entry == baseline
        # ...and every nested structure explicitly.
        assert entry.theme_intelligence  == baseline.theme_intelligence
        assert entry.industry_activation == baseline.industry_activation
        assert entry.clusters            == baseline.clusters
        assert entry.sector_data         == baseline.sector_data
        assert fake_cache.get(GLOBAL_KEY) is entry


def test_full_response_contract_populated(fake_cache, guard_extraction):
    fake_cache.seed(GLOBAL_KEY, _entry(populated=True))
    _assert_full_contract(feed_route.activation_debug(), populated=True)


def test_full_response_contract_empty(fake_cache, guard_extraction):
    fake_cache.seed(GLOBAL_KEY, _entry(populated=False))
    _assert_full_contract(feed_route.activation_debug(), populated=False)


def test_no_refresh_argument(fake_cache):
    assert "refresh" not in inspect.signature(feed_route.activation_debug).parameters


def test_cold_cache_is_benign_read(fake_cache, guard_extraction):
    # Nothing seeded → get() returns None.
    result = feed_route.activation_debug()
    assert set(result) == {"error"}
    assert isinstance(result["error"], str)
    assert fake_cache.set_calls == []


# ── HTTP-level compatibility (authenticated, via dependency override) ────────────

@pytest.fixture
def client(fake_cache, guard_extraction):
    app = FastAPI()
    app.include_router(feed_route.router, prefix="/api/feed",
                       dependencies=[Depends(require_user)])
    # Authenticated principal via the project's dependency-override pattern —
    # require_user itself is NOT weakened.
    app.dependency_overrides[require_user] = lambda: AuthedUser(
        user_id="test-user", email=None, authenticated=True, claims={})
    return TestClient(app)


def test_http_activation_debug_authenticated(client, fake_cache):
    fake_cache.seed(GLOBAL_KEY, _entry(populated=True))
    resp = client.get("/api/feed/activation-debug")
    assert resp.status_code == 200
    _assert_full_contract(resp.json(), populated=True)
    assert fake_cache.set_calls == []


def test_http_refresh_param_is_inert(client, fake_cache):
    fake_cache.seed(GLOBAL_KEY, _entry(populated=True))
    resp = client.get("/api/feed/activation-debug?refresh=true")
    # Accepted (unknown query param ignored, not 422) and still read-only.
    assert resp.status_code == 200
    assert resp.json()["data_source"] == "cached"
    assert fake_cache.set_calls == []
    # guard_extraction guarantees extract_themes / compute_industry_activation
    # never ran (they would have raised → 500, not 200).
