# Feed failures — November 17, 2026

This repair is separate from TM1b1 production validation. It does not change
feed registrations, source identity, entity/theme matching, score/admission,
clustering, evidence counts, SEC ingestion or benchmark labels.

## Findings from direct endpoint inspection

| Source | Observed response | Coverage conclusion |
| --- | --- | --- |
| Yahoo Finance | Configured `/rss/topstories` returned HTTP 404 and HTML; earlier audit observed 429 | Public endpoint unavailable; no replacement verified |
| PE Hub | Configured `/feed/` redirected to `www.privateequityinternational.com/registration/`, HTTP 200 HTML | Publisher access page, not RSS; coverage not restored |
| Buyouts | Configured `/feed/` redirected to the same PEI registration page | Publisher access page, not RSS; coverage not restored |
| Federal Reserve | Configured `press_all.xml` returned HTTP 200 gzip XML with 20 entries | Available from local network at inspection time; earlier production failure not reproduced |

The Federal Reserve still publishes this endpoint in its
[official RSS directory](https://www.federalreserve.gov/feeds/feeds.htm).
The [PE Hub homepage](https://www.pehub.com/) now redirects to PEI dealmaking;
the [Buyouts homepage](https://www.buyoutsinsider.com/) redirects to PEI Private
Equity. This does not establish a replacement syndication endpoint or permission
to scrape authenticated articles. No login, rate-limit workaround, unrelated
news fallback or silent source removal is introduced.

## Correction

Previously feedparser fetched the URL itself, so a 404 page, a registration
redirect and malformed XML could all produce a misleading "Malformed feed"
message. Its URL fetch also did not enforce the configured timeout.

`app/rss_transport.py` now downloads through the existing HTTP dependency,
checks HTTP status, detects HTML/access-page responses, bounds request time,
redirects and decoded body size, and then parses bytes. Compressed XML and UTF-8
BOM are supported. Valid empty RSS/Atom remains a successful empty response;
recoverable XML entries remain accepted as before.

The feed manager respects `Retry-After`, backs off unavailable/access-page
endpoints, and preserves the source error in subsequent cycles during cooldown.
Existing cached items remain available without receiving a new fetch timestamp.
Successful recovery clears both cooldown and error. A broken publisher does not
prevent healthy reporting from being processed. No secret-bearing URL query or
publisher response HTML is included in the new transport errors.

The two pipeline fixture helpers now mock the explicit feed-reader boundary.
Their clustering/evidence assertions are unchanged; EA1 is not reopened. The
frontend SEC-identity regression test now locates the unchanged generic RSS
identity in the new transport module. No frontend runtime code changed.

## Validation and limits

The focused controls cover HTTP failures, registration and legitimate redirects,
gzip/BOM XML, valid empty XML, malformed/HTML payloads, recoverable XML, size/time
limits, retry dates, fallback preservation, recovery, and mixed healthy/failed
publishers. Full backend gates are required before promotion.

Local results: 45 focused transport/pipeline controls passed; 1,417 backend
tests passed from the exact committed release tree, excluding 18 pre-existing
local TM1b1 tests; 1,536 frontend tests passed after updating the header-location
assertion. The first cloud run caught that outdated assertion and blocked
promotion. Corrected revision `6cbf3d4` passed both complete cloud jobs in
[run 44183925636](https://github.com/Ed-ONeill/argus-ai/actions/runs/44183925636),
including frontend tests, type-check, lint, build and dependency checks, and
backend installation/tests. It was then promoted to `main`. Automatic production
deployment is triggered by that promotion, but deployment success and the next
authenticated production cycle have not been observed because browser access
is unavailable. Do not mark the production repair validated yet.

A direct check using the corrected reader returned 20 Federal Reserve entries,
without a parser warning. This is not authenticated production validation and
does not prove the earlier production failure's cause.

Authenticated browser access timed out twice on this task. No production cycle
was forced and no production success is inferred from local checks. A working
browser connection or matched response-body captures is needed to validate the
production rollout. Restoring the three unavailable publishers additionally
requires a verified public or publisher-approved syndication endpoint; no
credentials should be pasted into chat.

## Deployment-status follow-up

After the user reopened Chrome, browser inventory still timed out twice, so
authenticated inspection remains blocked. The public GitHub deployment record
`7867294784` for exact revision `6cbf3d4a341f020ddfa0c74eec6c4dcee594c4d1`
reports `success` at `2026-11-17T21:54:13Z` for Railway's
`creative-benevolence / production` environment. This is deployment-system
confirmation, not a fresh feed/status inspection or rendered UI validation.
Per-service runtime provenance and actual source outcomes remain to be checked.
The user does not know of approved replacement feed access; none was assumed.

## Authenticated production validation — November 18

Status: IMPLEMENTED / DEPLOYED / BOUNDED PRODUCTION CHECKS PASSED.
Publisher coverage remains partial; this is not an all-sources-healthy closure.

Chrome access was restored. Railway's refreshed backend Details panel showed
active successful deployment `a320b219-f442-4c1f-a087-8a0af7b52f62`, linked to
`6cbf3d4a341f020ddfa0c74eec6c4dcee594c4d1`, deployed November 17 at 16:52 EST.
The initially open Railway tab was stale; the refreshed service-specific
deployment, rather than its old cached display, is the provenance evidence.

Authenticated `/api/feed/` and `/api/feed/status` bodies matched exactly twice:

| Full-feed cycle | Snapshot generated_at (UTC) | Items / clusters / returned events | Completed at (UTC) |
| --- | --- | --- | --- |
| cycle-208 / `20261118T181524091176Z` | `2026-11-18T18:15:41.589004+00:00` | 86 / 74 / 36 | `2026-11-18T18:16:05.694006+00:00` |
| cycle-209 / `20261118T182110143727Z` | `2026-11-18T18:21:42.324111+00:00` | 88 / 76 / 37 | `2026-11-18T18:22:10.683101+00:00` |

Both were naturally completed cycles with all stages `ok`, successful memory
and disk caches, completed institutional-memory persistence, no last failure,
and non-stale feed responses. The final snapshot was not loaded from disk and
did not predate the last refresh. Authenticated readiness returned
`ready: true`, `reason: ready`. No Refresh button, recompute or redeploy was used.

Both payloads exposed the corrected coverage errors:

| Source | Production error | Result |
| --- | --- | --- |
| Yahoo Finance | `HTTP 404: feed endpoint unavailable` | Still unavailable; accurately reported |
| PE Hub | `publisher access page: www.privateequityinternational.com/registration/` | Approved syndication endpoint still needed |
| Buyouts | Same PEI access-page error | Approved syndication endpoint still needed |
| Power Magazine | `HTTP 403: publisher access denied` | Additional observed coverage failure; not bypassed |
| FERC | `HTTP 503: publisher request failed` | Additional observed coverage failure |

Federal Reserve was absent from the error map and contributed one retained
report: item `fafd06538209df6e8835b4f356125826`, the agencies' extension of the
third-party risk guidance comment period, published November 13 at 21:15 UTC.
Its source URL remained
`https://www.federalreserve.gov/newsevents/pressreleases/bcreg20261113a.htm`.
This establishes restored visible coverage in the inspected snapshots, not the
cause of the previous intermittent failure or a guarantee of future availability.

The FERC-labelled registry request was visible in production logs as a Google
News RSS query returning 503; it is not proof that FERC's own website failed.
The healthy refresh cycle does not erase any of these five coverage failures.
Cooldown correctness, time/size limits and cache-recovery branches remain
regression-test evidence; they were not all deliberately induced in production.

Observations were extracted from browser-visible response bodies and UI.
Complete raw response bodies were not exported. No authentication material was
copied. TM1b1's separate result is recorded in
`rc3-tm1b1/PRODUCTION_VALIDATION_2026_11_18.md`.
