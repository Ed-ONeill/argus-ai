# SEC transport budget — November 19, 2026

## Observed failure

Production readiness returned 503 while authenticated cached feed reads still
worked. Retained Railway logs show ingestion taking 580.56 and 726.58 seconds,
versus 2.74 and 4.36 seconds for summarization in those pipelines. Code inspection
found sequential SEC watchlist downloads using `feedparser.parse(URL)` without
an explicit timeout, bypassing the bounded RSS downloader. This proves a
transport gap; the older logs do not isolate every second of delay to SEC.

## Correction and boundaries

SEC now uses the existing downloader with its real configured fair-access
identity, a four-second HTTP operation timeout, a 20-second budget for starting
requests, and at least 110 ms between issuer requests. The batch budget is not
a hard wall-clock deadline: an in-flight operation may finish after it. Size,
redirect and elapsed-download checks remain active. No parallel SEC requests.

Failures and deferred issuers retain cached rows without changing their cache
timestamps. Publisher errors remain visible and respect retry backoff, including
forced refresh requests. The next batch resumes after the last attempted issuer
so a slow prefix cannot permanently starve later issuers. Separate RSS and SEC
duration logs make production diagnosis possible.

Filing materiality, issuer identity, contact configuration, title rewriting,
filing URLs, deduplication, event identity, scoring, themes, frontend and storage
semantics are unchanged. This is not OP1.2 or historical remediation. A denied
or slow publisher may still produce partial coverage; speed is not full coverage.

## Verification

Before correction, four focused regressions failed at the unbounded URL parser.
After correction, 46 transport/SEC checks passed, including valid material
filings, routine-filing rejection, cache fallback, pacing, budget exhaustion,
rotation, explicit identity/timeout forwarding, and retry recovery.

Full local backend suite: 1,555 passed, two existing short-test-key warnings.
This includes 18 pre-existing local tests that are not part of this change.
Three existing E701 style findings in `source_tier` are outside the patch; no
new lint findings. Protected-branch release checks are required before merge.
The frontend's source-contract test is updated to recognize the unchanged
generic User-Agent as the downloader's default parameter; backend HTTP tests
verify both the generic default and explicitly configured SEC identity.

## Bounded production validation

Implementation `7c11129`, source-contract test follow-up `2c12b21`, merged through
PR #13 as `a9de987`. All protected backend/frontend checks passed, including
dependency checks, 1,536 frontend tests, type checking, lint (four existing
warnings) and production build. Local backend count includes the 18 existing
uncommitted tests noted above; those were not published.

Railway backend deployment `597e30df-2b6d-437e-b465-20f6abe6fa42` became active.
Authenticated full-feed snapshot `2026-11-19T18:52:39.334324+00:00` matches successful
cycle `20261119T185157412899Z`, completed at 18:53:14.343513 UTC. All stages passed;
memory/disk caches and institutional persistence completed. RSS took 3.22 seconds,
SEC took 20.07 seconds, and the entire cycle including persistence took 76.93 seconds.
The Markets cycle also published successfully at 18:54:09.635134 UTC.

75 items map to 73 clusters and 46 admitted events. Cluster membership totals and
all event distinct-label/qualified-label counts passed. Both external readiness
URLs returned ready. Authenticated Feed rendered current reporting and the
Anthropic Wall Street debut Event rendered its FT evidence with `1 source label`.
This validates availability, not the semantic completeness of that Event.

Coverage remains partial: four existing publisher access/endpoint failures plus
12 SEC issuer diagnostics (five timeouts, seven budget deferrals in the first
full cycle). These are visible, not relabeled as successful empty feeds. No claim
of complete SEC recovery or sustained capacity is made from this bounded check.

No qualifying household-pressure or Path 1 positive appeared in this captured
cycle. TM1b1 and the outstanding Path 1 live-positive gate remain separate and
open for their exact controls. No synthetic production input or forced refresh.
