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

Production acceptance remains pending deployment: observe the deployed revision,
one successful fresh full-feed cycle and persistence, RSS/SEC timings, readiness,
and rendered authenticated Feed/Event behavior. Do not equate a loaded disk cache
with a newly completed cycle or silently dismiss publisher access errors.
