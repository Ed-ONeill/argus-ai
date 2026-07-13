"""M3.2 read API: UID validation per record family, honest empties,
replay endpoint labeling, sanitized errors."""

from __future__ import annotations

from datetime import datetime, timezone
from urllib.parse import quote

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from api.routes import memory_v2
from app.institutional_memory.writer import InstitutionalMemoryWriter
from tests.conftest import make_feed

NOW = datetime(2026, 7, 12, 10, 0, tzinfo=timezone.utc)

REL_UID = "rel:theme:ontology:ai-energy-demand|supports|industry:taxonomy:utilities"


@pytest.fixture
def client(fake_repo, enabled_settings, fresh_theme_memory, monkeypatch):
    w = InstitutionalMemoryWriter(repo_factory=lambda: fake_repo)
    feed = make_feed()
    w.record_cycle(feed.theme_intelligence, now=NOW, feed=feed)
    monkeypatch.setattr(memory_v2, "_repo", fake_repo)
    app = FastAPI()
    app.include_router(memory_v2.router, prefix="/api/memory/v2")
    return TestClient(app)


def test_entity_snapshots_require_full_uid(client):
    assert client.get("/api/memory/v2/entities/utilities/snapshots").status_code == 400
    resp = client.get("/api/memory/v2/entities/industry:taxonomy:utilities/snapshots")
    assert resp.status_code == 200
    assert resp.json()["count"] == 1
    assert resp.json()["snapshots"][0]["conviction"] == 62


def test_entity_relationships_endpoint(client):
    resp = client.get("/api/memory/v2/entities/industry:taxonomy:utilities/relationships")
    assert resp.status_code == 200
    body = resp.json()
    assert body["count"] >= 1
    assert all(
        "industry:taxonomy:utilities" in (r["source_uid"], r["target_uid"])
        for r in body["relationships"]
    )


def test_narrative_routes_enforce_narrative_type(client, fake_repo):
    assert client.get(
        "/api/memory/v2/narratives/theme:ontology:ai-energy-demand/snapshots"
    ).status_code == 400
    narr_uid = next(iter(fake_repo.narr_snapshots.values()))["entity_uid"]
    resp = client.get(f"/api/memory/v2/narratives/{narr_uid}/snapshots")
    assert resp.status_code == 200
    assert resp.json()["count"] == 1
    snap = resp.json()["snapshots"][0]
    assert snap["thesis"] is None
    assert len(snap["member_uids"]) == 2
    # transitions endpoint returns honest empty (nothing sealed yet)
    t = client.get(f"/api/memory/v2/narratives/{narr_uid}/transitions")
    assert t.status_code == 200 and t.json()["count"] == 0


def test_relationship_routes_validate_rel_uid(client):
    assert client.get("/api/memory/v2/relationships/not-a-rel/snapshots").status_code == 400
    resp = client.get(f"/api/memory/v2/relationships/{quote(REL_UID, safe='')}/snapshots")
    assert resp.status_code == 200
    assert resp.json()["count"] == 1
    assert resp.json()["snapshots"][0]["relationship_type"] == "supports"


def test_graph_at_reconstruction(client):
    resp = client.get("/api/memory/v2/graph/at", params={"date": "2026-07-12"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["reconstruction_kind"] == "daily_historical_reconstruction"
    assert body["completeness"]["status"] in ("daily", "partial", "empty")
    assert client.get("/api/memory/v2/graph/at",
                      params={"date": "not-a-date"}).status_code == 400


def test_status_includes_m32_counts(client):
    body = client.get("/api/memory/v2/status").json()
    assert body["m3_2"]["narrative_snapshot_count"] == 1
    assert body["m3_2"]["relationship_snapshot_count"] >= 1


def test_repository_error_sanitized_on_m32_routes(client, fake_repo):
    fake_repo.fail_on.add("list_table_snapshots")
    resp = client.get(f"/api/memory/v2/relationships/{quote(REL_UID, safe='')}/snapshots")
    assert resp.status_code == 502
    assert "injected failure" not in resp.text
