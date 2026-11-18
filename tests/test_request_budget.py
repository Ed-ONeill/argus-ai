from datetime import datetime, timezone

from fastapi import HTTPException
from fastapi.testclient import TestClient
import pytest

import app.request_budget as budgets
from app.bounded_cache import BoundedCache
from app.processed_cache import ProcessedFeed


def test_recomputable_cache_is_bounded_and_keeps_recent_values():
    cache = BoundedCache(2)
    cache["a"], cache["b"], cache["c"] = 1, 2, 3
    assert cache.get("a") is None
    assert dict(cache) == {"b": 2, "c": 3}
    cache["c"] = 4
    assert len(cache) == 2 and cache.get("c") == 4
    cache.clear()
    assert not cache


def test_busy_work_is_rejected_and_failure_releases_slot(monkeypatch):
    budget = budgets.RequestBudget(5, 60, 1)
    with pytest.raises(ValueError):
        with budget.acquire():
            with pytest.raises(HTTPException) as exc:
                with budget.acquire():
                    pytest.fail("must not run concurrent expensive work")
            assert exc.value.status_code == 429
            raise ValueError("downstream failure")
    with budget.acquire():
        pass


def test_rate_window_expires_without_growing_unbounded(monkeypatch):
    clock = [100.0]
    monkeypatch.setattr(budgets.time, "monotonic", lambda: clock[0])
    budget = budgets.RequestBudget(1, 60, 1)
    with budget.acquire():
        pass
    with pytest.raises(HTTPException) as exc:
        with budget.acquire():
            pytest.fail("must be rate limited")
    assert int(exc.value.headers["Retry-After"]) > 0
    clock[0] += 60
    with budget.acquire():
        pass
    assert len(budget._times) == 1


def test_refresh_alias_and_cold_requests_share_budget_cached_reads_do_not(monkeypatch):
    from api.main import app
    from api.routes import feed
    from app.auth import require_user
    snapshot = ProcessedFeed(items=[], top_stories={}, market_take="", errors={},
                             promo_excluded=0, debug_log=[], generated_at=datetime.now(timezone.utc))
    calls = []
    monkeypatch.setattr(budgets, "feed_recompute_budget", budgets.RequestBudget(1, 60, 1))
    monkeypatch.setattr(feed, "run_pipeline", lambda **kw: calls.append(kw) or snapshot)
    monkeypatch.setattr(feed.feed_cache, "get", lambda key: snapshot)
    monkeypatch.setattr(feed.feed_cache, "set", lambda *args: None)
    monkeypatch.setattr(feed.feed_cache, "age_seconds", lambda key: 1)
    app.dependency_overrides[require_user] = lambda: {"sub": "test"}
    try:
        client = TestClient(app)
        assert client.get("/api/feed/?refresh=true").status_code == 200
        blocked = client.get("/api/feed/?force_refresh=true")
        assert blocked.status_code == 429 and blocked.headers.get("retry-after")
        assert client.get("/api/feed/").status_code == 200
        monkeypatch.setattr(feed.feed_cache, "get", lambda key: None)
        assert client.get("/api/feed/?categories=Markets").status_code == 429
        assert len(calls) == 1
    finally:
        app.dependency_overrides.pop(require_user, None)


def test_analysis_input_size_is_bounded_without_changing_auth(monkeypatch):
    from api.main import app
    from app.auth import require_user
    from app.config import settings
    from api.routes import analyze
    monkeypatch.setattr(settings, "supabase_url", "https://example.supabase.co")
    monkeypatch.setattr(settings, "argus_auth_disabled", False)
    monkeypatch.setattr(analyze, "analysis_budget", budgets.RequestBudget(5, 60, 1))
    client = TestClient(app)
    assert client.post("/api/analyze/", json={"title": "Hello"}).status_code == 401
    app.dependency_overrides[require_user] = lambda: {"sub": "test"}
    try:
        for path in ("/api/analyze/", "/api/analyze/deep/"):
            assert client.post(path, json={"title": "x" * 1001}).status_code == 422
            assert client.post(path, json={"title": "Hi", "snippet": "x" * 12001}).status_code == 422
        assert client.get("/api/feed/?sources=" + "x" * 1025).status_code == 422
    finally:
        app.dependency_overrides.pop(require_user, None)
