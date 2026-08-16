"""RC2-D1 — live health probe for the podcast source registry.

DELIBERATELY NOT A TEST. Feed liveness is a property of the outside world: it
changes with no commit, and asserting it in CI would fail the suite on somebody
else's outage. `tests/test_podcast_registry_integrity.py` pins what the repo
controls (shape, duplicates, failure visibility); this script measures what it
does not.

Run it before and after any registry change so the comparison is apples to
apples, and record the output in the RC2 audit:

    python scripts/probe_podcast_registry.py

Exit code is 0 unless a source fails to fetch, so it can gate a manual check
without ever running in CI.
"""

from __future__ import annotations

import concurrent.futures as cf
import datetime as dt
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import feedparser                                     # noqa: E402
import requests                                       # noqa: E402

from api.podcast_feeds import PODCAST_FEEDS           # noqa: E402

UA = "Argus-AI/1.0"          # the production User-Agent — some hosts block browsers
CAP_DAYS = 14                # the registry's freshness cap; not changed by RC2-D1
TIMEOUT = 25


def probe(cfg: dict) -> dict:
    """Fetch one feed and classify it. Never raises."""
    name, url = cfg["show_name"], cfg["rss_url"]
    try:
        r = requests.get(url, headers={"User-Agent": UA}, timeout=TIMEOUT)
        if r.status_code != 200:
            return {"show": name, "state": "DEAD", "detail": f"HTTP {r.status_code}",
                    "newest": None, "fresh": 0}
        parsed = feedparser.parse(r.content)
        if not parsed.entries:
            return {"show": name, "state": "DEAD", "detail": "0 entries",
                    "newest": None, "fresh": 0}
        now = dt.datetime.now(dt.timezone.utc)
        ages = [
            (now - dt.datetime(*t[:6], tzinfo=dt.timezone.utc)).days
            for e in parsed.entries
            if (t := getattr(e, "published_parsed", None) or getattr(e, "updated_parsed", None))
        ]
        if not ages:
            return {"show": name, "state": "DEAD", "detail": "no dates",
                    "newest": None, "fresh": 0}
        newest = min(ages)
        return {
            "show": name,
            "state": "HEALTHY" if newest <= CAP_DAYS else "STALE",
            "detail": "",
            "newest": newest,
            "fresh": sum(1 for a in ages if a <= CAP_DAYS),
        }
    except Exception as exc:                                   # noqa: BLE001
        return {"show": name, "state": "DEAD", "detail": f"{type(exc).__name__}",
                "newest": None, "fresh": 0}


def main() -> int:
    with cf.ThreadPoolExecutor(max_workers=12) as ex:
        rows = list(ex.map(probe, PODCAST_FEEDS))

    order = {"HEALTHY": 0, "STALE": 1, "DEAD": 2}
    rows.sort(key=lambda r: (order[r["state"]], r["newest"] if r["newest"] is not None else 10**6))

    print(f"registry entries: {len(PODCAST_FEEDS)}   freshness cap: {CAP_DAYS}d\n")
    for r in rows:
        newest = f'{r["newest"]}d' if r["newest"] is not None else "-"
        print(f'  {r["state"]:<8} {r["show"]:<30} newest={newest:>7} '
              f'in-cap={r["fresh"]:<3} {r["detail"]}')

    healthy = [r for r in rows if r["state"] == "HEALTHY"]
    stale = [r for r in rows if r["state"] == "STALE"]
    dead = [r for r in rows if r["state"] == "DEAD"]
    episodes = sum(r["fresh"] for r in rows)

    print(f'\nregistry={len(PODCAST_FEEDS)}  healthy={len(healthy)}  '
          f'stale={len(stale)}  dead={len(dead)}  episodes<={CAP_DAYS}d={episodes}')
    if dead:
        print("DEAD SOURCES: " + ", ".join(f'{r["show"]} ({r["detail"]})' for r in dead))
    return 1 if dead else 0


if __name__ == "__main__":
    raise SystemExit(main())
