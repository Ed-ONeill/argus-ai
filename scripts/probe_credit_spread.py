"""RC2-C1 — live probe for the credit-spread series (FRED BAMLH0A0HYM2).

DELIBERATELY NOT A TEST, for the same reason as the podcast registry probe:
network liveness is a property of the outside world and would fail CI on someone
else's outage. `frontend/src/lib/__tests__/creditSpread.test.ts` pins the parser,
the staleness rule, the direction rule and the no-fallback contract offline; this
measures what the repo does not control.

Run it before and after any change to the credit path, and record the output:

    python scripts/probe_credit_spread.py

Exit code 1 if the series is unavailable, unparseable, or stale beyond the
approved tolerance — i.e. exactly when the product would render "not measured".
"""

from __future__ import annotations

import csv
import datetime as dt
import io
import sys

import requests

SERIES_ID = "BAMLH0A0HYM2"
CSV_URL = f"https://fred.stlouisfed.org/graph/fredgraph.csv?id={SERIES_ID}"
UA = "Argus-AI/1.0"

# Locked parameters — must match frontend/src/lib/creditSpread.ts.
STALE_TOLERANCE_BUSINESS_DAYS = 5
DIRECTION_THRESHOLD_BP = 3


def business_days_between(start: dt.date, end: dt.date) -> int:
    if end <= start:
        return 0
    n, cur = 0, start
    while cur < end:
        cur += dt.timedelta(days=1)
        if cur.weekday() < 5:
            n += 1
    return n


def main() -> int:
    try:
        r = requests.get(CSV_URL, headers={"User-Agent": UA}, timeout=30)
    except Exception as exc:                                   # noqa: BLE001
        print(f"UNMEASURED  reason=unavailable  ({type(exc).__name__}: {exc})")
        return 1
    if r.status_code != 200:
        print(f"UNMEASURED  reason=unavailable  HTTP {r.status_code}")
        return 1

    rows, skipped = [], 0
    for row in csv.reader(io.StringIO(r.text)):
        if len(row) < 2:
            continue
        date_s, raw = row[0].strip(), row[1].strip()
        try:
            d = dt.date.fromisoformat(date_s)
        except ValueError:
            continue                                  # header / garbage
        if raw in (".", "", "NA"):                    # index holiday — never 0
            skipped += 1
            continue
        try:
            v = float(raw)
        except ValueError:
            continue
        if not (0 <= v <= 100):
            continue
        rows.append((d, v))

    rows.sort()
    if len(rows) < 2:
        print(f"UNMEASURED  reason=unparseable  usable_rows={len(rows)}")
        return 1

    (prior_d, prior_v), (latest_d, latest_v) = rows[-2], rows[-1]
    level, prior_level = round(latest_v * 100), round(prior_v * 100)
    change = level - prior_level
    direction = ("widening" if change >= DIRECTION_THRESHOLD_BP
                 else "tightening" if change <= -DIRECTION_THRESHOLD_BP
                 else "stable")
    today = dt.date.today()
    stale_bd = business_days_between(latest_d, today)

    print(f"series      : {SERIES_ID}  (ICE BofA US High Yield OAS)")
    print(f"observations: {len(rows)} usable, {skipped} holiday/missing rows skipped")
    print(f"level       : {level}bp   as of {latest_d}")
    print(f"prior       : {prior_level}bp  as of {prior_d}")
    print(f"change      : {change:+d}bp  -> {direction}  (threshold +/-{DIRECTION_THRESHOLD_BP}bp)")
    print(f"staleness   : {stale_bd} business day(s)  "
          f"(tolerance {STALE_TOLERANCE_BUSINESS_DAYS}; today {today})")

    if stale_bd > STALE_TOLERANCE_BUSINESS_DAYS:
        print(f"\nUNMEASURED  reason=stale  ({stale_bd} > {STALE_TOLERANCE_BUSINESS_DAYS} business days)")
        return 1
    print(f"\nMEASURED    {level}bp {direction}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
