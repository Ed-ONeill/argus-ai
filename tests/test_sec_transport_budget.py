"""SEC transport deadlines preserve materiality, identity and cached evidence."""
import feedparser
import pytest

from app import feeds
from app.rss_transport import FeedFetchError

ATOM = b'''<feed xmlns="http://www.w3.org/2005/Atom"><title>Filings</title>
<entry><title>8-K</title><link href="https://www.sec.gov/Archives/fixture"/>
<summary>Item 2.02: Results of Operations and Financial Condition</summary>
<updated>2026-11-19T12:00:00Z</updated></entry></feed>'''


@pytest.fixture
def sec(monkeypatch):
    original_parse = feedparser.parse
    def parse_bytes(value, **kwargs):
        if isinstance(value, str) and value.startswith("http"):
            pytest.fail("unbounded URL parser used")
        return original_parse(value, **kwargs)
    monkeypatch.setattr(feedparser, "parse", parse_bytes)
    monkeypatch.setattr(feeds, "_sec_user_agent", lambda: "Argus Market Intelligence ops@example.org")
    monkeypatch.setattr(feeds, "_SEC_WATCHLIST", {"NVDA": "1", "MSFT": "2", "IBM": "3"})
    return feeds.FeedManager()


def test_sec_uses_bounded_transport_with_real_configured_identity(sec, monkeypatch):
    calls = []
    monkeypatch.setattr(feedparser, "parse", lambda *a, **kw: pytest.fail("unbounded URL parser used"))
    # Use an already parsed fixture so the patched parser forbids only runtime calls.
    parsed = {"entries": []}
    from types import SimpleNamespace
    monkeypatch.setattr(feeds, "read_feed", lambda url, **kw: (calls.append((url, kw)) or SimpleNamespace(**parsed)))
    sec._fetch_sec_watchlist()
    assert len(calls) == 3
    assert all(0 < c[1]["timeout_seconds"] <= 4 for c in calls)
    assert all(c[1]["user_agent"] == "Argus Market Intelligence ops@example.org" for c in calls)


def test_budget_exhaustion_returns_cached_rows_and_rotates_next_attempt(sec, monkeypatch):
    clock = [100.0]
    monkeypatch.setattr(feeds.time, "monotonic", lambda: clock[0])
    monkeypatch.setattr(feeds, "_SEC_BATCH_BUDGET_SECONDS", 5.0, raising=False)
    calls = []
    stale = feeds.FeedItem(title="retained", url="https://fixture.test/retained", source="SEC Filings", category="Company")
    for cik in ["1", "2", "3"]:
        sec._cache[feeds._SEC_8K_ATOM_URL.format(cik=cik)] = (0, [stale])
    def fail(url, **kw):
        calls.append(url)
        clock[0] += 6
        raise FeedFetchError("RSS request timed out", 60)
    monkeypatch.setattr(feeds, "read_feed", fail)
    out = sec._fetch_sec_watchlist()
    assert len(calls) == 1 and len(out) == 3
    assert "budget" in sec.fetch_errors["SEC:MSFT"]
    sec._fetch_sec_watchlist()
    assert calls[1] == feeds._SEC_8K_ATOM_URL.format(cik="2")


def test_material_filings_and_urls_unchanged_and_fresh_cache_skips_network(sec, monkeypatch):
    calls = []
    def read(url, **kw):
        calls.append(url)
        return feedparser.parse(ATOM)
    monkeypatch.setattr(feeds, "read_feed", read)
    out = sec._fetch_sec_watchlist()
    assert len(out) == 3
    assert out[0].title == "NVDA 8-K — Results of Operations and Financial Condition"
    assert out[0].url == "https://www.sec.gov/Archives/fixture"
    assert out[0].affected_entities == ["NVDA"]
    assert sec._fetch_sec_watchlist() == out
    assert len(calls) == 3


def test_access_failure_is_visible_and_backoff_preserves_stale_cache(sec, monkeypatch):
    clock = [100.0]
    monkeypatch.setattr(feeds.time, "monotonic", lambda: clock[0])
    monkeypatch.setattr(feeds.time, "sleep", lambda seconds: clock.__setitem__(0, clock[0] + seconds))
    calls = []
    stale = feeds.FeedItem(title="retained", url="https://fixture.test/retained", source="SEC Filings", category="Company")
    cached_url = feeds._SEC_8K_ATOM_URL.format(cik="1")
    sec._cache[cached_url] = (0, [stale])
    def denied(url, **kw):
        calls.append(url)
        raise FeedFetchError("HTTP 403: publisher access denied", 3600)
    monkeypatch.setattr(feeds, "read_feed", denied)
    assert sec._fetch_sec_watchlist() == [stale]
    assert len(calls) == 3 and len(sec.fetch_errors) == 3
    sec.fetch_errors.clear()
    assert sec._fetch_sec_watchlist(force_refresh=True) == [stale]
    assert len(calls) == 3 and "403" in sec.fetch_errors["SEC:NVDA"]
    assert sec._cache[cached_url][0] == 0
    clock[0] += 3601
    monkeypatch.setattr(feeds, "read_feed", lambda *a, **kw: feedparser.parse(ATOM))
    assert len(sec._fetch_sec_watchlist()) == 3
    assert sec.fetch_errors == {} and sec._retry_after == {}


def test_request_pacing_and_remaining_budget(sec, monkeypatch):
    clock = [100.0]
    monkeypatch.setattr(feeds.time, "monotonic", lambda: clock[0])
    monkeypatch.setattr(feeds.time, "sleep", lambda seconds: clock.__setitem__(0, clock[0] + seconds))
    monkeypatch.setattr(feeds, "_SEC_BATCH_BUDGET_SECONDS", 0.25)
    calls = []
    def read(url, **kw):
        calls.append((clock[0], kw["timeout_seconds"]))
        return feedparser.parse(ATOM)
    monkeypatch.setattr(feeds, "read_feed", read)
    assert len(sec._fetch_sec_watchlist()) == 3
    assert [row[0] for row in calls] == pytest.approx([100, 100.11, 100.22])
    assert [row[1] for row in calls] == pytest.approx([0.25, 0.14, 0.03])


def test_materiality_filter_still_rejects_routine_filings(sec, monkeypatch):
    routine = ATOM.replace(b"Item 2.02", b"Item 9.01")
    monkeypatch.setattr(feeds, "read_feed", lambda *a, **kw: feedparser.parse(routine))
    assert sec._fetch_sec_watchlist() == []
    assert sec.fetch_errors == {}
