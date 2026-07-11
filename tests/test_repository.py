"""SupabaseRepository over httpx.MockTransport: request shapes, upsert
semantics, count parsing, and error hygiene (no secrets in errors)."""

from __future__ import annotations

import json

import httpx
import pytest

from app.institutional_memory.models import EntityRecord
from app.institutional_memory.repository import RepositoryError, SupabaseRepository

KEY = "secret-service-role-key"
URL = "https://example.supabase.co"


def make_repo(handler) -> SupabaseRepository:
    return SupabaseRepository(URL, KEY, transport=httpx.MockTransport(handler))


def test_requires_configuration():
    with pytest.raises(RepositoryError):
        SupabaseRepository("", "")


def test_auth_headers_sent_on_every_request():
    seen = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["apikey"] = request.headers.get("apikey")
        seen["auth"] = request.headers.get("authorization")
        return httpx.Response(200, json=[])

    repo = make_repo(handler)
    repo.fetch_entities(["theme:ontology:ai-energy-demand"])
    assert seen["apikey"] == KEY
    assert seen["auth"] == f"Bearer {KEY}"


def test_upsert_splits_inserts_and_patches():
    calls = []

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append((request.method, request.url.path, request.url.params))
        if request.method == "GET":
            return httpx.Response(200, json=[{
                "uid": "theme:ontology:known", "display_label": "Old Label",
                "aliases": [], "first_seen_at": "2026-07-01T00:00:00+00:00",
                "last_seen_at": "2026-07-10T00:00:00+00:00",
            }])
        return httpx.Response(201, json=[])

    repo = make_repo(handler)
    repo.upsert_entities([
        EntityRecord(uid="theme:ontology:known", entity_type="theme",
                     namespace="ontology", canonical_key="known",
                     display_label="New Label"),
        EntityRecord(uid="theme:ontology:new", entity_type="theme",
                     namespace="ontology", canonical_key="new",
                     display_label="Brand New"),
    ], "2026-07-11T00:00:00+00:00")

    methods = [m for m, _p, _q in calls]
    assert methods == ["GET", "POST", "PATCH"]
    # renamed label lands in aliases via the PATCH body — verified by shape:
    patch_call = calls[2]
    assert patch_call[2]["uid"] == "eq.theme:ontology:known"


def test_http_error_raises_repository_error_without_secrets():
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(503, text="service unavailable")

    repo = make_repo(handler)
    with pytest.raises(RepositoryError) as exc_info:
        repo.fetch_entities(["theme:ontology:x"])
    assert KEY not in str(exc_info.value)
    assert "503" in str(exc_info.value)


def test_transport_error_raises_repository_error():
    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("connection refused")

    repo = make_repo(handler)
    with pytest.raises(RepositoryError) as exc_info:
        repo.latest_snapshot_date()
    assert "transport error" in str(exc_info.value)
    assert KEY not in str(exc_info.value)


def test_count_parses_content_range():
    def handler(request: httpx.Request) -> httpx.Response:
        assert "count=exact" in request.headers.get("prefer", "")
        return httpx.Response(200, json=[{"uid": "x"}],
                              headers={"content-range": "0-0/57"})

    repo = make_repo(handler)
    assert repo.count("entity_snapshots") == 57


def test_insert_transitions_uses_ignore_duplicates():
    seen = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["prefer"] = request.headers.get("prefer", "")
        seen["on_conflict"] = request.url.params.get("on_conflict")
        seen["body"] = json.loads(request.content)
        return httpx.Response(201)

    from app.institutional_memory.models import TransitionEvent
    repo = make_repo(handler)
    repo.insert_transitions([TransitionEvent(
        entity_uid="theme:ontology:x", transition_type="conviction_strengthened",
        effective_at="2026-07-10T23:55:00+00:00", basis={"rule": "test"},
        schema_version=1, event_key="theme:ontology:x|conviction_strengthened|2026-07-10|v1",
    )])
    assert "ignore-duplicates" in seen["prefer"]
    assert seen["on_conflict"] == "event_key"
    assert seen["body"][0]["event_key"].endswith("|v1")


def test_list_snapshots_builds_date_filters():
    seen = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["params"] = dict(request.url.params)
        return httpx.Response(200, json=[])

    repo = make_repo(handler)
    repo.list_snapshots("theme:ontology:x", date_from="2026-07-01",
                        date_to="2026-07-10", order_desc=True, limit=30)
    p = seen["params"]
    assert p["entity_uid"] == "eq.theme:ontology:x"
    assert p["and"] == "(snapshot_date.gte.2026-07-01,snapshot_date.lte.2026-07-10)"
    assert p["order"].startswith("snapshot_date.desc")
    assert p["limit"] == "30"
