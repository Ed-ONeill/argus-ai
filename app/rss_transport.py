"""Bound RSS downloads and distinguish publisher failures from XML failures.

No alternate endpoints, browser impersonation, or authentication are used.
"""
from __future__ import annotations

from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
import re
import time

import feedparser
import httpx

MAX_BYTES = 4 * 1024 * 1024
TIMEOUT_SECONDS = 8.0
MAX_RETRY_SECONDS = 24 * 60 * 60


class FeedFetchError(ValueError):
    def __init__(self, message: str, retry_seconds: float = 300):
        super().__init__(message)
        self.retry_seconds = retry_seconds


def _retry_seconds(value: str | None, default: int = 300) -> float:
    if not value:
        return default
    try:
        seconds = float(value)
    except ValueError:
        try:
            when = parsedate_to_datetime(value)
            if when.tzinfo is None:
                when = when.replace(tzinfo=timezone.utc)
            seconds = (when - datetime.now(timezone.utc)).total_seconds()
        except (TypeError, ValueError, OverflowError):
            return default
    # A short/invalid header must not produce a tight retry loop.
    return max(60, min(seconds, MAX_RETRY_SECONDS))


def read_feed(url: str):
    started = time.monotonic()
    chunks: list[bytes] = []
    size = 0
    try:
        with httpx.Client(timeout=TIMEOUT_SECONDS, follow_redirects=True,
                          max_redirects=3) as client:
            with client.stream("GET", url, headers={
                "User-Agent": "Argus-AI/1.0",
                "Accept": "application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9",
            }) as response:
                status = response.status_code
                if status >= 400:
                    detail = {
                        401: "publisher authentication required",
                        403: "publisher access denied",
                        404: "feed endpoint unavailable",
                        410: "feed endpoint retired",
                        429: "publisher rate limit",
                    }.get(status, "publisher request failed")
                    default = 3600 if status in (401, 403, 404, 410) else 300
                    raise FeedFetchError(f"HTTP {status}: {detail}",
                                         _retry_seconds(response.headers.get("retry-after"), default))
                if not 200 <= status < 300:
                    raise FeedFetchError(f"HTTP {status}: no feed body available")
                for chunk in response.iter_bytes():
                    size += len(chunk)
                    if size > MAX_BYTES:
                        raise FeedFetchError("RSS response exceeds 4 MiB download limit")
                    if time.monotonic() - started > TIMEOUT_SECONDS:
                        raise FeedFetchError("RSS download exceeded time budget")
                    chunks.append(chunk)
                body = b"".join(chunks)
                prefix = body[:1024].lstrip(b"\xef\xbb\xbf \t\r\n").lower()
                if re.search(br"<(?:!doctype\s+html|html\b)", prefix):
                    # Log only host/path, never query parameters or response HTML.
                    destination = response.url.host + response.url.path
                    access = any(word in response.url.path.lower()
                                 for word in ("registration", "login", "sign-in", "subscribe"))
                    reason = "publisher access page" if access else "HTML instead of RSS/Atom"
                    raise FeedFetchError(f"{reason}: {destination}", 3600)
    except httpx.TimeoutException as exc:
        raise FeedFetchError("RSS request timed out") from exc
    except httpx.TooManyRedirects as exc:
        raise FeedFetchError("RSS redirect limit exceeded") from exc
    except httpx.HTTPError as exc:
        # Exception text may contain a credential-bearing URL; retain only its type.
        raise FeedFetchError(f"RSS transport failure: {type(exc).__name__}") from exc

    feed = feedparser.parse(body)
    if not feed.entries and (feed.get("bozo") or not feed.get("version")):
        raise FeedFetchError("Invalid RSS/Atom response (no recoverable entries)")
    return feed
