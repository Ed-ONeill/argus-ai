"""M3.3 read API: prediction/outcome/calibration endpoints, validation,
honest gate labeling, sanitized errors."""

from __future__ import annotations

from datetime import datetime, timezone

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from api.routes import memory_v2
from app.institutional_memory.resolution import run_resolution
from app.institutional_memory.writer import InstitutionalMemoryWriter
from tests.conftest import make_feed

DAY1 = datetime(2026, 7, 10, 10, 0, tzinfo=timezone.utc)
DAY2 = datetime(2026, 7, 11, 10, 0, tzinfo=timezone.utc)
DAY3 = datetime(2026, 7, 12, 6, 0, tzinfo=timezone.utc)


@pytest.fixture
def client(fake_repo, ledger_settings, fresh_theme_memory, monkeypatch):
    w = InstitutionalMemoryWriter(repo_factory=lambda: fake_repo)
    for now in (DAY1, DAY2):
        feed = make_feed()
        w.record_cycle(feed.theme_intelligence, now=now, feed=feed)
    run_resolution(fake_repo, now=DAY3)                     # resolves DAY1 issuance
    monkeypatch.setattr(memory_v2, "_repo", fake_repo)
    app = FastAPI()
    app.include_router(memory_v2.router, prefix="/api/memory/v2")
    return TestClient(app)


def test_list_predictions_with_filters(client):
    body = client.get("/api/memory/v2/predictions",
                      params={"prediction_type": "relationship_persistence",
                              "status": "resolved"}).json()
    assert body["count"] > 0
    assert all(p["prediction_type"] == "relationship_persistence"
               and p["status"] == "resolved" for p in body["predictions"])
    # validation
    assert client.get("/api/memory/v2/predictions",
                      params={"prediction_type": "price_target"}).status_code == 400
    assert client.get("/api/memory/v2/predictions",
                      params={"status": "made_up"}).status_code == 400


def test_get_prediction_and_outcome(client, fake_repo):
    uid = next(p["prediction_uid"] for p in fake_repo.predictions.values()
               if p["status"] == "resolved")
    pred = client.get(f"/api/memory/v2/predictions/{uid}").json()["prediction"]
    assert pred["statement"] and pred["assumptions"]
    outcome = client.get(f"/api/memory/v2/predictions/{uid}/outcome").json()["outcome"]
    assert outcome["prediction_uid"] == uid
    assert outcome["verdict"] == "confirmed"
    assert outcome["resolution_rules"]["rule"]              # auditable
    assert client.get("/api/memory/v2/predictions/not-a-uid").status_code == 400
    assert client.get(
        "/api/memory/v2/predictions/prediction:v1:" + "0" * 32).status_code == 404


def test_outcome_404_before_resolution(client, fake_repo):
    active = next(p["prediction_uid"] for p in fake_repo.predictions.values()
                  if p["status"] == "active")
    resp = client.get(f"/api/memory/v2/predictions/{active}/outcome")
    assert resp.status_code == 404
    assert "unresolved or not due" in resp.json()["detail"]


def test_entity_predictions(client):
    body = client.get(
        "/api/memory/v2/entities/theme:ontology:ai-energy-demand/predictions").json()
    assert body["count"] > 0
    assert all(p["subject_uid"] == "theme:ontology:ai-energy-demand"
               for p in body["predictions"])


def test_list_outcomes_filters(client):
    body = client.get("/api/memory/v2/outcomes",
                      params={"verdict": "confirmed"}).json()
    assert body["count"] > 0
    assert client.get("/api/memory/v2/outcomes",
                      params={"verdict": "won"}).status_code == 400


def test_calibration_status_labels_gates_honestly(client):
    body = client.get("/api/memory/v2/calibration/status").json()
    assert body["ledger_enabled"] is True
    overall = body["overall"]
    assert overall["sample_size"] > 0
    assert overall["credible"] is False                     # tiny sample
    assert "NOT met" in overall["note"]
    assert "methodology" in overall
    assert overall["probability_buckets"] is None           # no probabilities issued


def test_calibration_by_type(client):
    body = client.get("/api/memory/v2/calibration/by-type",
                      params={"type": "narrative_membership"}).json()
    assert body["prediction_type"] == "narrative_membership"
    assert body["credibility_gates"]["min_resolved_per_type"]["required"] == 30
    assert client.get("/api/memory/v2/calibration/by-type",
                      params={"type": "vibes"}).status_code == 400


def test_ledger_errors_sanitized(client, fake_repo):
    fake_repo.fail_on.add("list_predictions")
    resp = client.get("/api/memory/v2/predictions")
    assert resp.status_code == 502
    assert "injected failure" not in resp.text
