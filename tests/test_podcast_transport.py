import pytest
from api import podcast_feeds as pf


class Response:
    def __init__(self, chunks):
        self.chunks = chunks
    def __enter__(self):
        return self
    def __exit__(self, *args):
        return False
    def raise_for_status(self):
        pass
    def iter_bytes(self):
        return iter(self.chunks)


def transport(monkeypatch, chunks):
    options = {}
    class Client:
        def __init__(self, **kwargs):
            options.update(kwargs)
        def __enter__(self):
            return self
        def __exit__(self, *args):
            return False
        def stream(self, *args, **kwargs):
            return Response(chunks)
    monkeypatch.setattr(pf.httpx, "Client", Client)
    return options


def test_bounded_transport_preserves_feed_bytes(monkeypatch):
    options = transport(monkeypatch, [b"<rss>", b"</rss>"])
    assert pf._download_feed("https://example.invalid/rss") == b"<rss></rss>"
    assert options["timeout"] == 6
    assert options["max_redirects"] == 3


def test_oversized_feed_is_rejected(monkeypatch):
    transport(monkeypatch, [b"x" * (8 * 1024 * 1024 + 1)])
    with pytest.raises(ValueError, match="budget"):
        pf._download_feed("https://example.invalid/rss")


def test_slow_trickle_is_rejected(monkeypatch):
    transport(monkeypatch, [b"rss"])
    ticks = iter([0, 9])
    monkeypatch.setattr(pf.time, "monotonic", lambda: next(ticks))
    with pytest.raises(ValueError, match="budget"):
        pf._download_feed("https://example.invalid/rss")
