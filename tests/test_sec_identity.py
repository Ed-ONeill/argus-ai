"""
RC2-N4 — one SEC fair-access identity, from configuration.

SEC requires every automated caller to identify itself with a real, monitored
contact address. Before this slice the tree carried FOUR independently
constructed identities across THREE domains:

    app/feeds.py                    "Argus-AI/1.0 (contact: research@argus.example)"
    api/ipo-pipeline/route.ts       "Argus Intelligence research@argusintel.com"
    lib/dataAdapters/sec/index.ts   "Argus Research argus-data@example.com"
    scripts/refresh_sec_tickers.py  "Argus-AI/1.0 (contact: support@argus-market-intelligence.com)"

`argus.example` and `example.com` are RFC 2606 reserved: they can never be a
valid fair-access contact. The fourth address was not established as a
provisioned mailbox by any other authority on main, so it was NOT adopted as a
hardcoded canonical value.

The contact now comes from ARGUS_SEC_CONTACT with **no default**. Backend Python
and the Next route handlers cannot import one shared constant, so both runtimes
read the same variable and build the same string; the format is pinned on each
side (see frontend/src/lib/__tests__/secIdentity.test.ts).

When the contact is unset the SEC path DECLINES. Sending a fabricated identity is
worse than fetching nothing: the contact is the entire point of the header.
"""

from __future__ import annotations

import re
from pathlib import Path

import pytest

from app.feeds import _SEC_APP_IDENTITY, _sec_user_agent, _SEC_8K_ATOM_URL, _SEC_WATCHLIST

ROOT = Path(__file__).resolve().parents[1]

# The placeholder identities this slice removed. None may appear in a request path.
BANNED = ["research@argus.example", "argus-data@example.com", "research@argusintel.com"]


# ── The canonical identity ──────────────────────────────────────────────────

class TestCanonicalIdentity:
    def test_the_app_identity_is_one_string(self):
        assert _SEC_APP_IDENTITY == "Argus Market Intelligence"

    def test_the_user_agent_is_identity_plus_contact(self, monkeypatch):
        from app.config import settings
        monkeypatch.setattr(settings, "argus_sec_contact", "ops@example.org", raising=False)
        assert _sec_user_agent() == "Argus Market Intelligence ops@example.org"

    def test_whitespace_around_the_contact_is_ignored(self, monkeypatch):
        from app.config import settings
        monkeypatch.setattr(settings, "argus_sec_contact", "  ops@example.org  ", raising=False)
        assert _sec_user_agent() == "Argus Market Intelligence ops@example.org"

    def test_there_is_no_default_contact(self, monkeypatch):
        from app.config import settings
        monkeypatch.setattr(settings, "argus_sec_contact", "", raising=False)
        assert _sec_user_agent() is None

    def test_a_whitespace_only_contact_is_not_a_contact(self, monkeypatch):
        from app.config import settings
        monkeypatch.setattr(settings, "argus_sec_contact", "   ", raising=False)
        assert _sec_user_agent() is None


# ── Missing config declines; it never substitutes an identity ───────────────

class TestMissingConfigDeclines:
    def test_the_watchlist_returns_nothing_and_sends_nothing(self, monkeypatch):
        from app.config import settings
        from app.feeds import FeedManager
        monkeypatch.setattr(settings, "argus_sec_contact", "", raising=False)

        def _explode(*a, **k):  # any parse attempt means a request was sent
            raise AssertionError("a SEC request was attempted without a contact")

        import feedparser
        monkeypatch.setattr(feedparser, "parse", _explode)

        fm = FeedManager()
        assert fm._fetch_sec_watchlist() == []

    def test_the_absence_is_recorded_as_a_fetch_error(self, monkeypatch):
        from app.config import settings
        from app.feeds import FeedManager
        monkeypatch.setattr(settings, "argus_sec_contact", "", raising=False)
        fm = FeedManager()
        fm._fetch_sec_watchlist()
        assert "SEC:config" in fm.fetch_errors

    def test_no_banned_placeholder_can_be_produced(self, monkeypatch):
        from app.config import settings
        for value in ["", "   "]:
            monkeypatch.setattr(settings, "argus_sec_contact", value, raising=False)
            ua = _sec_user_agent()
            assert ua is None
        # and with a real contact, no banned string appears either
        monkeypatch.setattr(settings, "argus_sec_contact", "ops@example.org", raising=False)
        ua = _sec_user_agent() or ""
        for bad in BANNED:
            assert bad not in ua


# ── No placeholder survives in any request path ─────────────────────────────

class TestNoPlaceholdersRemain:
    """Source-level sweep. Comments documenting the history are allowed; a
    literal inside a request path is not."""

    FILES = [
        ROOT / "app" / "feeds.py",
        ROOT / "scripts" / "refresh_sec_tickers.py",
        ROOT / "frontend" / "src" / "app" / "api" / "ipo-pipeline" / "route.ts",
        ROOT / "frontend" / "src" / "lib" / "dataAdapters" / "sec" / "index.ts",
        ROOT / "frontend" / "src" / "lib" / "secIdentity.ts",
    ]

    @staticmethod
    def _code_lines(path: Path) -> list[str]:
        out = []
        for line in path.read_text(encoding="utf-8").splitlines():
            stripped = line.strip()
            if stripped.startswith(("#", "//", "*", "/*", '"""')):
                continue
            out.append(line)
        return out

    @pytest.mark.parametrize("banned", BANNED)
    def test_no_banned_contact_in_code(self, banned):
        for path in self.FILES:
            if not path.exists():
                continue
            for line in self._code_lines(path):
                assert banned not in line, f"{path.name}: {line.strip()}"

    def test_the_backend_has_no_hardcoded_sec_user_agent(self):
        src = (ROOT / "app" / "feeds.py").read_text(encoding="utf-8")
        # The only SEC UA construction is the helper.
        assert "_SEC_UA =" not in src
        assert src.count("def _sec_user_agent") == 1

    def test_the_dev_script_requires_the_same_variable(self):
        src = (ROOT / "scripts" / "refresh_sec_tickers.py").read_text(encoding="utf-8")
        assert "ARGUS_SEC_CONTACT" in src
        assert "Argus Market Intelligence" in src


# ── Nothing about the requests themselves changed ───────────────────────────

class TestRequestShapeUnchanged:
    def test_the_edgar_endpoint_is_unchanged(self):
        assert _SEC_8K_ATOM_URL.startswith("https://www.sec.gov/cgi-bin/browse-edgar")
        assert "action=getcompany" in _SEC_8K_ATOM_URL
        assert "{cik}" in _SEC_8K_ATOM_URL

    def test_the_watchlist_is_unchanged(self):
        # Identity standardisation must not change which issuers are polled.
        assert len(_SEC_WATCHLIST) > 0
        for ticker, cik in _SEC_WATCHLIST.items():
            assert ticker.isupper()
            assert re.fullmatch(r"\d{10}", cik), f"{ticker}: {cik}"

    def test_the_setting_exists_with_an_empty_default(self):
        from app.config import Settings
        assert Settings.model_fields["argus_sec_contact"].default == ""
