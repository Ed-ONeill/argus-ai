from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

from app.config import settings
from app.feed_health import monitor_health
from scripts.check_production_health import validate


def healthy():
    entry = SimpleNamespace(generated_at=datetime.now(timezone.utc), items=[object()], errors={})
    diag = {"refresher_thread_alive": True, "last_success_at": entry.generated_at.isoformat(),
            "persistence": {"memory_cache": "ok", "disk_cache": "ok", "institutional_memory": "completed"}}
    return entry, diag


def test_monitor_distinguishes_partial_coverage_from_pipeline_failure():
    entry, diag = healthy()
    assert validate(monitor_health(entry, diag))
    entry.errors = {"publisher": "secret-bearing provider exception"}
    result = monitor_health(entry, diag)
    assert result["source_coverage"] == "partial" and validate(result)
    assert "publisher" not in str(result) and "secret" not in str(result)
    entry.items = []
    assert not validate(monitor_health(entry, diag))


@pytest.mark.parametrize("sink", ["memory_cache", "disk_cache", "institutional_memory"])
def test_monitor_fails_on_failed_or_unknown_persistence(sink):
    entry, diag = healthy()
    diag["persistence"][sink] = None
    assert not validate(monitor_health(entry, diag))


def test_monitor_does_not_accept_stale_or_uninitialized_pipeline():
    entry, diag = healthy()
    entry.generated_at -= timedelta(hours=1)
    assert not validate(monitor_health(entry, diag))
    assert not validate(monitor_health(None, {}))
    assert not validate({"ready": True})


def test_minimal_monitor_is_public_but_data_and_diagnostics_stay_protected(monkeypatch):
    from api.main import app
    from app.processed_cache import feed_cache
    from app.diagnostics import diagnostics
    entry, diag = healthy()
    monkeypatch.setattr(settings, "supabase_url", "https://example.supabase.co")
    monkeypatch.setattr(settings, "argus_auth_disabled", False)
    monkeypatch.setattr(feed_cache, "get", lambda key: entry)
    monkeypatch.setattr(diagnostics, "status_for", lambda key: diag)
    client = TestClient(app)
    response = client.get("/api/health/ready")
    assert response.status_code == 200 and validate(response.json())
    assert response.headers["cache-control"] == "no-store"
    assert set(response.json()) == {"ready", "pipeline_ready", "persistence_ready", "source_coverage"}
    for path in ("/api/readiness", "/api/feed/", "/api/feed/status"):
        assert client.get(path).status_code == 401
    diag["refresher_thread_alive"] = False
    assert client.get("/api/health/ready").status_code == 503
