"""M3.4 read API: historical-context endpoint gating and validation."""

from __future__ import annotations

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from api.routes import memory_v2


@pytest.fixture
def client(fake_repo, enabled_settings, monkeypatch):
    monkeypatch.setattr(memory_v2, "_repo", fake_repo)
    app = FastAPI()
    app.include_router(memory_v2.router, prefix="/api/memory/v2")
    return TestClient(app)


def test_historical_context_gated_on_empty_archive(client):
    resp = client.get(
        "/api/memory/v2/themes/ai-energy-demand/historical-context")
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "insufficient_history"
    assert body["episodes"] == []
    assert body["credibility"]["met"] is False
    assert body["credibility"]["gates"]["min_archive_days"]["required"] == 60
    assert any("not predictions" in d for d in body["disclaimers"])
    assert body["method"]["source"] == "sealed daily institutional snapshots only"


def test_historical_context_validates_inputs(client):
    assert client.get(
        "/api/memory/v2/themes/theme:bogus:x/historical-context").status_code == 400
    assert client.get(
        "/api/memory/v2/themes/ai-energy-demand/historical-context",
        params={"window": 1}).status_code == 422          # below ge=2
    assert client.get(
        "/api/memory/v2/themes/ai-energy-demand/historical-context",
        params={"horizon": 99}).status_code == 422


def test_historical_context_errors_sanitized(client, fake_repo):
    fake_repo.fail_on.add("earliest_snapshot_date")
    resp = client.get(
        "/api/memory/v2/themes/ai-energy-demand/historical-context")
    assert resp.status_code == 502
    assert "injected failure" not in resp.text
