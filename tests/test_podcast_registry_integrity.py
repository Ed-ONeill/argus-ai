"""
RC2-D1 — podcast source-registry integrity.

Finding D measured 15 of 27 registered shows contributing nothing: 11 returning
HTTP 404 after host/slug migrations, 4 sitting beyond the 14-day freshness cap.
Nothing detected it, because `_fetch_one` logged feed failures at DEBUG and
production runs at INFO — a dead source was indistinguishable from a quiet one.

These tests are DELIBERATELY OFFLINE. Feed liveness is a property of the outside
world and changes without any commit, so asserting it in CI would make the suite
fail on someone else's outage. Liveness is measured by the separate live probe
(`scripts/probe_podcast_registry.py`), which is run and recorded per slice.

What is pinned here is what the repo actually controls: the registry's shape, the
absence of duplicates, and the failure-visibility contract.
"""

from __future__ import annotations

import inspect
import logging

import pytest

from api import podcast_feeds as PF
from api.podcast_feeds import PODCAST_FEEDS

REQUIRED = ("rss_url", "show_name", "publisher", "default_topics", "source_tier")

# Shows knowingly retained while outside the 14d cap at RC2-D1 audit time. Each
# must carry a documented reason in the registry comment — see the audit entry.
RETAINED_SUB_CAP = {"Business Breakdowns", "The Big View", "DealBook Summit"}

# Retired in RC2-D1 on evidence of discontinuation, not age alone.
RETIRED = {"Axios Pro Rata", "Bloomberg Deal of the Week"}


# ── Registry shape ───────────────────────────────────────────────────────────

class TestRegistryShape:
    def test_registry_is_non_empty(self):
        assert len(PODCAST_FEEDS) > 0

    @pytest.mark.parametrize("field", REQUIRED)
    def test_every_entry_carries_required_metadata(self, field):
        missing = [c.get("show_name", "<unnamed>") for c in PODCAST_FEEDS if not c.get(field)]
        assert missing == [], f"entries missing {field!r}: {missing}"

    def test_no_duplicate_rss_url(self):
        seen: dict[str, str] = {}
        dupes: list[tuple[str, str, str]] = []
        for c in PODCAST_FEEDS:
            u = c["rss_url"]
            if u in seen:
                dupes.append((u, seen[u], c["show_name"]))
            seen[u] = c["show_name"]
        assert dupes == [], f"duplicate rss_url: {dupes}"

    def test_no_duplicate_show_name(self):
        names = [c["show_name"] for c in PODCAST_FEEDS]
        dupes = {n for n in names if names.count(n) > 1}
        assert dupes == set(), f"duplicate show_name: {dupes}"

    def test_source_tier_is_a_sane_integer(self):
        bad = [(c["show_name"], c["source_tier"]) for c in PODCAST_FEEDS
               if not isinstance(c["source_tier"], int) or not 1 <= c["source_tier"] <= 5]
        assert bad == [], f"source_tier out of range: {bad}"

    def test_default_topics_is_a_non_empty_list_of_str(self):
        bad = [c["show_name"] for c in PODCAST_FEEDS
               if not isinstance(c["default_topics"], list)
               or not c["default_topics"]
               or not all(isinstance(t, str) for t in c["default_topics"])]
        assert bad == [], f"bad default_topics: {bad}"

    def test_every_rss_url_is_https(self):
        bad = [(c["show_name"], c["rss_url"]) for c in PODCAST_FEEDS
               if not c["rss_url"].startswith("https://")]
        assert bad == [], f"non-https feed URLs: {bad}"


# ── RC2-D1 dispositions ──────────────────────────────────────────────────────

class TestD1Dispositions:
    def test_discontinued_shows_are_retired(self):
        names = {c["show_name"] for c in PODCAST_FEEDS}
        assert not (names & RETIRED), f"retired show still registered: {names & RETIRED}"

    def test_repaired_shows_are_still_registered(self):
        """Repair, not removal — a 404 is a reason to find the current feed."""
        names = {c["show_name"] for c in PODCAST_FEEDS}
        repaired = {"Odd Lots", "Masters in Business", "Macro Voices", "All-In Podcast",
                    "Business Breakdowns", "Capital Allocators", "The Compound and Friends",
                    "Animal Spirits", "20VC", "My First Million", "Bankless"}
        assert repaired <= names, f"repaired show missing: {repaired - names}"

    def test_no_repaired_url_retains_a_known_dead_slug(self):
        dead_fragments = [
            "megaphone.fm/masters-in-business", "macrovoices.com/podcast-feed.rss",
            "megaphone.fm/all-in-with-chamath", "megaphone.fm/businessbreakdowns",
            "megaphone.fm/capitalallocators", "megaphone.fm/thecompoundandfriends",
            "megaphone.fm/animalspirits", "megaphone.fm/twentyminutevc",
            "megaphone.fm/mfm", "megaphone.fm/bankless", "megaphone.fm/pro-rata",
        ]
        urls = " ".join(c["rss_url"] for c in PODCAST_FEEDS)
        still = [f for f in dead_fragments if f in urls]
        assert still == [], f"known-dead feed slug still in the registry: {still}"

    def test_sub_cap_retentions_are_documented_in_the_registry(self):
        """A show kept despite contributing nothing must say why, in-code."""
        src = inspect.getsource(PF)
        for show in RETAINED_SUB_CAP:
            assert show in src, f"{show} not in registry source"
        assert src.count("RC2-D1") >= len(RETAINED_SUB_CAP), (
            "each retained sub-cap show needs an RC2-D1 rationale comment")


# ── Failure visibility ───────────────────────────────────────────────────────

class TestFailureVisibility:
    """A source that fails must be visible at WARNING; production runs at INFO."""

    def _cfg(self):
        return {"rss_url": "https://example.invalid/feed.xml", "show_name": "Test Show",
                "publisher": "Test", "default_topics": ["Markets"], "source_tier": 3}

    def test_http_error_logs_at_warning_and_returns_empty(self, monkeypatch, caplog):
        class P:
            status = 404
            bozo = 0
            entries: list = []
            feed = type("f", (), {})()
        monkeypatch.setattr(PF.feedparser, "parse", lambda *a, **k: P())
        with caplog.at_level(logging.WARNING):
            out = PF._fetch_one(self._cfg())
        assert out == []
        assert any("FAILED" in r.message or "FAILED" in r.getMessage() for r in caplog.records)
        assert any(r.levelno == logging.WARNING for r in caplog.records)

    def test_unparseable_feed_logs_at_warning(self, monkeypatch, caplog):
        class P:
            status = 200
            bozo = 1
            bozo_exception = ValueError("not xml")
            entries: list = []
            feed = type("f", (), {})()
        monkeypatch.setattr(PF.feedparser, "parse", lambda *a, **k: P())
        with caplog.at_level(logging.WARNING):
            out = PF._fetch_one(self._cfg())
        assert out == []
        assert any(r.levelno == logging.WARNING for r in caplog.records)

    def test_empty_feed_logs_at_warning(self, monkeypatch, caplog):
        class P:
            status = 200
            bozo = 0
            entries: list = []
            feed = type("f", (), {})()
        monkeypatch.setattr(PF.feedparser, "parse", lambda *a, **k: P())
        with caplog.at_level(logging.WARNING):
            out = PF._fetch_one(self._cfg())
        assert out == []
        assert any(r.levelno == logging.WARNING for r in caplog.records)

    def test_raised_exception_logs_at_warning_and_does_not_propagate(self, monkeypatch, caplog):
        def boom(*a, **k):
            raise ConnectionError("dns failure")
        monkeypatch.setattr(PF.feedparser, "parse", boom)
        with caplog.at_level(logging.WARNING):
            out = PF._fetch_one(self._cfg())
        assert out == []          # batch resilience: never propagates
        assert any(r.levelno == logging.WARNING for r in caplog.records)

    def test_a_healthy_but_stale_feed_is_NOT_reported_as_a_failure(self, monkeypatch, caplog):
        """Contributing nothing on freshness grounds is honest, not broken."""
        class Entry:
            title = "An old episode"
        class P:
            status = 200
            bozo = 0
            entries = [Entry()]
            feed = type("f", (), {})()
        monkeypatch.setattr(PF.feedparser, "parse", lambda *a, **k: P())
        monkeypatch.setattr(PF, "_normalize", lambda *a, **k: None)   # all dropped as too old
        with caplog.at_level(logging.DEBUG):
            out = PF._fetch_one(self._cfg())
        assert out == []
        assert not any(r.levelno >= logging.WARNING for r in caplog.records), (
            "a stale-but-working feed must not be logged as a source failure")


# ── Batch resilience ─────────────────────────────────────────────────────────

class TestBatchResilience:
    def test_one_failing_source_does_not_stop_the_others(self, monkeypatch):
        good_cfg = {"rss_url": "https://ok.example/f.xml", "show_name": "Good",
                    "publisher": "P", "default_topics": ["Markets"], "source_tier": 3}
        bad_cfg = {"rss_url": "https://bad.example/f.xml", "show_name": "Bad",
                   "publisher": "P", "default_topics": ["Markets"], "source_tier": 3}

        def parse(url, *a, **k):
            if "bad" in str(url):
                raise ConnectionError("down")
            class Entry:
                title = "ok"
            class P:
                status = 200
                bozo = 0
                entries = [Entry()]
                feed = type("f", (), {})()
            return P()
        monkeypatch.setattr(PF.feedparser, "parse", parse)
        monkeypatch.setattr(PF, "_normalize", lambda e, p, c: {"id": "x", "show_name": c["show_name"]})

        assert PF._fetch_one(bad_cfg) == []
        assert len(PF._fetch_one(good_cfg)) == 1
