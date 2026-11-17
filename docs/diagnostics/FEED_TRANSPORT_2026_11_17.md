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
promotion. The corrected revision must pass the complete cloud gates.

A direct check using the corrected reader returned 20 Federal Reserve entries,
without a parser warning. This is not authenticated production validation and
does not prove the earlier production failure's cause.

Authenticated browser access timed out twice on this task. No production cycle
was forced and no production success is inferred from local checks. A working
browser connection or matched response-body captures is needed to validate the
production rollout. Restoring the three unavailable publishers additionally
requires a verified public or publisher-approved syndication endpoint; no
credentials should be pasted into chat.
