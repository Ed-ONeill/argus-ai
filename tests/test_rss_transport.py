"""Publisher-shaped transport failures; no live network or relevance labels."""
import gzip
import time
from datetime import datetime, timedelta, timezone
from email.utils import format_datetime

import feedparser
import httpx
import pytest

from app import rss_transport as rss
from app.feeds import FeedItem, FeedManager

RSS = b'''<?xml version="1.0" encoding="utf-8"?>
<rss version="2.0"><channel><title>FRB</title><link>https://example.test</link>
<description>Press releases</description><item><title>Policy statement</title>
<link>https://example.test/release</link><description>Reported text.</description>
<pubDate>Tue, 17 Nov 2026 12:00:00 GMT</pubDate></item></channel></rss>'''


def mock_http(monkeypatch, handler):
    client = httpx.Client
    monkeypatch.setattr(rss.httpx, "Client", lambda **kw: client(
        transport=httpx.MockTransport(handler), **kw))


def test_compressed_xml_bom_is_decoded_and_metadata_preserved(monkeypatch):
    def handler(request):
        assert request.headers["user-agent"] == "Argus-AI/1.0"
        return httpx.Response(200, content=gzip.compress(b"\xef\xbb\xbf" + RSS),
                              headers={"Content-Encoding": "gzip", "Content-Type": "text/xml"})
    mock_http(monkeypatch, handler)
    manager = FeedManager()
    items = manager._fetch_one("Federal Reserve", "https://example.test/feed", "Markets", 12, True)
    assert len(items) == 1
    assert (items[0].title, items[0].source, items[0].snippet) == (
        "Policy statement", "Federal Reserve", "Reported text.")
    assert items[0].published_dt == datetime(2026, 11, 17, 12, tzinfo=timezone.utc)
    assert manager.fetch_errors == {}


@pytest.mark.parametrize("status,reason", [
    (401, "authentication required"), (403, "access denied"),
    (404, "endpoint unavailable"), (410, "endpoint retired"),
    (429, "rate limit"), (503, "request failed"),
])
def test_http_failure_is_not_reported_as_bad_xml(monkeypatch, status, reason):
    mock_http(monkeypatch, lambda request: httpx.Response(status, text="<html>Error</html>",
                                                        headers={"Retry-After": "1200"}))
    with pytest.raises(rss.FeedFetchError) as caught:
        rss.read_feed("https://example.test/rss")
    assert f"HTTP {status}" in str(caught.value)
    assert reason in str(caught.value)
    assert caught.value.retry_seconds == 1200


def test_publisher_registration_redirect_is_not_empty_success(monkeypatch):
    def handler(request):
        if request.url.host == "old.example.test":
            return httpx.Response(302, headers={"location": "https://publisher.test/registration/?private=value"})
        return httpx.Response(200, text="<!DOCTYPE html><html>Register</html>")
    mock_http(monkeypatch, handler)
    with pytest.raises(rss.FeedFetchError, match="publisher access page") as caught:
        rss.read_feed("https://old.example.test/feed/")
    assert "publisher.test/registration/" in str(caught.value)
    assert "private" not in str(caught.value)
    assert "value" not in str(caught.value)


def test_actual_feed_redirect_is_accepted(monkeypatch):
    mock_http(monkeypatch, lambda request: httpx.Response(
        302, headers={"location": "/rss.xml"}) if request.url.path == "/feed"
        else httpx.Response(200, content=RSS))
    assert len(rss.read_feed("https://example.test/feed").entries) == 1


@pytest.mark.parametrize("body", [b"", b"not RSS", b"<rss><broken>", b"<html>Unavailable</html>"])
def test_non_feed_body_rejected(monkeypatch, body):
    mock_http(monkeypatch, lambda request: httpx.Response(200, content=body))
    with pytest.raises(rss.FeedFetchError):
        rss.read_feed("https://example.test/feed")


def test_valid_empty_feed_preserves_parser_contract(monkeypatch):
    body = RSS[:RSS.index(b"<item>")] + b"</channel></rss>"
    mock_http(monkeypatch, lambda request: httpx.Response(200, content=body))
    assert rss.read_feed("https://example.test/feed").entries == []


def test_recoverable_xml_entries_are_not_discarded(monkeypatch):
    body = RSS.replace(b"Reported text.", b"Supply & demand.")
    mock_http(monkeypatch, lambda request: httpx.Response(200, content=body))
    result = rss.read_feed("https://example.test/feed")
    assert result.bozo
    assert result.entries[0].title == "Policy statement"


def test_body_size_limit(monkeypatch):
    monkeypatch.setattr(rss, "MAX_BYTES", 20)
    mock_http(monkeypatch, lambda request: httpx.Response(200, content=RSS))
    with pytest.raises(rss.FeedFetchError, match="download limit"):
        rss.read_feed("https://example.test/feed")


def test_elapsed_time_budget(monkeypatch):
    clock = [0]
    monkeypatch.setattr(rss.time, "monotonic", lambda: clock[0])
    def handler(request):
        clock[0] = 9
        return httpx.Response(200, content=RSS)
    mock_http(monkeypatch, handler)
    with pytest.raises(rss.FeedFetchError, match="time budget"):
        rss.read_feed("https://example.test/feed")


def test_timeout_sanitizes_url(monkeypatch):
    def handler(request):
        raise httpx.ReadTimeout("private token=value", request=request)
    mock_http(monkeypatch, handler)
    with pytest.raises(rss.FeedFetchError) as caught:
        rss.read_feed("https://example.test/feed?token=value")
    assert str(caught.value) == "RSS request timed out"


def test_redirect_loop_is_bounded(monkeypatch):
    mock_http(monkeypatch, lambda request: httpx.Response(302, headers={"location": "/feed"}))
    with pytest.raises(rss.FeedFetchError, match="redirect limit"):
        rss.read_feed("https://example.test/feed")


def test_retry_after_date_and_invalid_header():
    future = format_datetime(datetime.now(timezone.utc) + timedelta(hours=1))
    assert 3598 <= rss._retry_seconds(future) <= 3600
    assert rss._retry_seconds("invalid") == 300
    assert rss._retry_seconds("999999999") == 86400
    assert rss._retry_seconds("0") == 60


def test_backoff_keeps_error_and_stale_cache_then_recovers(monkeypatch):
    manager = FeedManager()
    url = "https://example.test/feed"
    old = [FeedItem(title="Old report", url="https://example.test/old", source="Publisher", category="Markets")]
    manager._cache[url] = (0, old)
    calls = []
    clock = [1000]
    monkeypatch.setattr(time, "monotonic", lambda: clock[0])
    def fail(_):
        calls.append(1)
        raise rss.FeedFetchError("HTTP 429: publisher rate limit", 1200)
    monkeypatch.setattr("app.feeds.read_feed", fail)
    assert manager._fetch_one("Publisher", url, "Markets", 12, True) is old
    manager.fetch_errors.clear()  # fetch_all clears per-cycle diagnostics
    clock[0] += 300
    assert manager._fetch_one("Publisher", url, "Markets", 12, True) is old
    assert len(calls) == 1  # force_refresh cannot bypass Retry-After
    assert "HTTP 429" in manager.fetch_errors["Publisher"]
    assert manager._cache[url][0] == 0  # never stamp fallback as newly fetched
    clock[0] += 1000
    monkeypatch.setattr("app.feeds.read_feed", lambda _: feedparser.parse(RSS))
    assert manager._fetch_one("Publisher", url, "Markets", 12, True)[0].title == "Policy statement"
    assert manager.fetch_errors == {}
    assert manager._retry_after == {}


def test_one_failed_publisher_does_not_remove_healthy_reporting(monkeypatch):
    def read(url):
        if "bad" in url:
            raise rss.FeedFetchError("HTTP 404: feed endpoint unavailable", 3600)
        return feedparser.parse(RSS)
    monkeypatch.setattr("app.feeds.read_feed", read)
    monkeypatch.setattr(FeedManager, "_fetch_sec_watchlist", lambda *a, **kw: [])
    manager = FeedManager()
    items = manager.fetch_all(registry=[("Federal Reserve", "https://good.test/feed", "Markets"),
                                       ("Yahoo Finance", "https://bad.test/feed", "Markets")])
    assert any(item.source == "Federal Reserve" for item in items)
    assert "Yahoo Finance" in manager.fetch_errors
