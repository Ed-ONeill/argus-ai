"""Occurrence identity for official Treasury auction announcements only.

Treasury reuses its landing URL across securities and reopenings. That URL and
headline boilerplate cannot establish a shared auction. Other publishers and
SEC filing identity are deliberately outside this contract.
"""
import hashlib
import re
from datetime import datetime
from urllib.parse import urlsplit


def occurrence_key(item) -> str:
    url = getattr(item, "url", "") or ""
    try:
        parsed = urlsplit(url)
    except ValueError:
        return ""
    if parsed.hostname not in {"www.treasurydirect.gov", "treasurydirect.gov"}:
        return ""
    title = getattr(item, "title", "") or ""
    if parsed.path.rstrip("/") != "/auctions/auction-announcements" or not title.lower().startswith("treasury announces"):
        return ""
    snippet = getattr(item, "snippet", "") or ""
    cusips = set(re.findall(r"\bCUSIP\s*:\s*([A-Z0-9]{9})(?=\s|Term|$)", snippet))
    dates = set(re.findall(r"Auction Date\s*:\s*(\d{1,2}/\d{1,2}/\d{4})", snippet, re.I))
    if len(cusips) == len(dates) == 1:
        try:
            date = datetime.strptime(next(iter(dates)), "%m/%d/%Y").date().isoformat()
            return f"treasury:auction:{next(iter(cusips))}:{date}"
        except ValueError:
            pass
    # Unknown identity must not become a universal shared URL match. Keep exact
    # observations stable, without claiming incomplete metadata proves sameness.
    observed = getattr(item, "published_dt", None)
    stamp = observed.isoformat() if observed else ""
    raw = "\0".join((title, snippet, stamp))
    return "treasury:unresolved:" + hashlib.sha256(raw.encode()).hexdigest()[:24]


def compatible(left, right) -> bool:
    a, b = occurrence_key(left), occurrence_key(right)
    return not (a or b) or bool(a and a == b)


def item_identity_text(item) -> str:
    """Preserve all legacy article IDs except shared-page Treasury occurrences."""
    raw = item.title + item.url
    key = occurrence_key(item)
    return raw + ("\0" + key if key else "")
