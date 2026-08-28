#!/usr/bin/env python3
"""
Refresh app/data/reference/sec_registered_tickers.json from SEC EDGAR.

RC2-A: the canonical company registry (app/companies.py) is curated by hand,
which is what keeps it precise. This snapshot is the AUTHORITATIVE CHECK on
that curation — tests/test_entity_resolution.py asserts every curated ticker is
a real SEC-registered issuer, so the registry can never drift into containing
something that is not a security.

It is a validation set, NOT a runtime resolver: resolution stays deterministic
and offline, and membership here never by itself makes a token a company.

Usage:  python scripts/refresh_sec_tickers.py
"""

from __future__ import annotations

import json
import os
import urllib.request
from datetime import date

SOURCE = "https://www.sec.gov/files/company_tickers.json"
# SEC fair-access policy requires a descriptive UA with a contact address.
# RC2-N4: DEVELOPER-ONLY script, but it holds SEC to the same contract as the
# live callers — the contact comes from ARGUS_SEC_CONTACT and there is no
# default. It previously hardcoded a contact string that no other authority on
# main established as a provisioned mailbox.
SEC_APP_IDENTITY = "Argus Market Intelligence"
OUT = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "app", "data", "reference", "sec_registered_tickers.json",
)


def main() -> None:
    contact = (os.environ.get("ARGUS_SEC_CONTACT") or "").strip()
    if not contact:
        raise SystemExit(
            "ARGUS_SEC_CONTACT is not set. SEC fair-access requires a real, "
            "monitored contact address; this script refuses to send a "
            "placeholder identity. Set ARGUS_SEC_CONTACT and re-run."
        )
    ua = f"{SEC_APP_IDENTITY} {contact}"
    req = urllib.request.Request(SOURCE, headers={"User-Agent": ua})
    with urllib.request.urlopen(req, timeout=60) as resp:
        rows = json.load(resp)

    tickers = sorted({r["ticker"].upper() for r in rows.values() if r.get("ticker")})
    if len(tickers) < 5_000:
        raise SystemExit(f"refusing to write a suspiciously small snapshot ({len(tickers)})")

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as fh:
        json.dump(
            {"source": SOURCE, "captured": date.today().isoformat(),
             "count": len(tickers), "tickers": tickers},
            fh, indent=0,
        )
    print(f"wrote {OUT} — {len(tickers)} registered tickers")


if __name__ == "__main__":
    main()
