# A1: Supplied production feed review, 2026-09-16

Status: INITIAL REVIEW FOLLOWED BY VALIDATED CLOSURE. The subsequently supplied
matched cycle-139 feed resolves the mismatch described in this chronological
record. See [closure record](RC3_TM1A_CLOSURE.md). TM1b has not started.

## Input and freshness limits

User supplied the JSON response body directly in chat. No credential or separate
text-file preparation is needed. The response parses successfully.

- Input SHA256: `F683DA6E4183649EFA55168F7C905B55260CCCA0031551A2D99919F79FB773A1`.
- `generated_at`: `2026-09-16T16:35:01.065127+00:00`, September 16, 12:35:01 PM EDT.
- `cache_age_seconds`: 76.9; `is_stale`: false.
- 61 items, 59 clusters, summed cluster story counts 61, nine emitted themes,
  32 admitted events, 34 event evidence records.
- The generation timestamp follows the recorded TM1a backend deployment at
  02:24:36 UTC. This response does not include diagnostics or a deployment SHA.
- Capture time was not supplied. The cache age is response metadata, not an
  independently observed capture time. `is_stale=false` alone is not evidence of
  successful pipeline completion.

The matching `/api/feed/status` response is still needed to establish successful
publication by the correct full-feed target after deployment. Do not close A1 on
article publication time, the feed timestamp alone, or the offline replay below.

## Discriminating cost negative control

Cluster/event `0dd13ba52eeb`: "United, American Say Fuel Cost Surge May Mean Capacity Cuts".

The supplied primary title contains ordinary "Cost". Its snippet describes United
Airlines and American Airlines capacity cuts and fuel prices. Its extracted hint
is Airlines, not COST. The event has empty companies, direct companies, industries,
theme IDs, and transmission chain, while retaining its Bloomberg evidence record
and counts of one source label and one qualified label.

An offline counterfactual used exactly the supplied 59 clusters, including their
primary title/snippet, entity hints, score, source, story count, and publication
timestamp, with `now` fixed to payload `generated_at`. Both modules used fresh
momentum trackers; rehydration and persistence were disabled. The baseline module
was read from local commit `5049643`; the corrected module is TM1a `01301d2`.

| Result | Baseline | TM1a | Supplied production |
|---|---|---|---|
| Emitted themes | 10 | 9 | 9 |
| consumer-stress | Emitted, confidence 57, two contributing source labels | Absent | Absent |
| consumer-stress top contributors | Two AMZN filing clusters plus airline cost story | None | None |

The baseline's false COST hit adds Bloomberg as a second contributing source
label, permitting the existing theme emission gate to pass. The corrected
eligibility rule removes that contribution. No gate or source-count rule was
changed. This establishes that the live cost example is discriminating, rather
than a negative that both implementations would produce anyway.

For all nine emitted themes, the replay of TM1a exactly matches supplied
contributing-cluster order, confidence, and evidence count. This is strong
consistency evidence, not a substitute for server cycle diagnostics or an
independently observed server execution trace.

The authenticated production Event page for the airline control was inspected
around 16:41 UTC. It rendered the matching headline and Bloomberg evidence,
`1 source label`, no company chips, and no transmission chain. This confirms the
visible absence of false Costco exposure. It does not endorse the separate sparse
entity wording or event-type classification, and the UI read was later than the
supplied feed snapshot.

## Positive controls and evidence accounting

The semiconductor theme retains explicit company contributors:

- `709162e2cefe`: AVGO 8-K, hint AVGO.
- `d55940903eb7`: NVDA 8-K, hint NVDA.
- `dee12bbdaf8e`: Apple/Nvidia/TSMC/AMD headline, hints AAPL/NVDA/AMD/TSM.

The AVGO and NVDA filing controls establish that legitimate ticker-grounded
contributions survive. They do not establish that every filing merits a specific
investment theme. No actual COST/SO positive or ordinary-word SO negative appears
in this supplied item set; those exact cases remain covered locally, not claimed
as observed in production here.

The authenticated Event UI for `dee12bbdaf8e` also rendered AAPL/NVDA/AMD/TSM,
the retained anchored chain, and its two evidence records under one Yahoo Finance
source label. This confirms a named-company presentation survives; it does not
validate every downstream chain hop or endorse grouping the two articles.

All 32 event `source_count` values equal their distinct evidence source-label
counts, and all `corroboration_count` values equal distinct qualified labels.
No numeric discrepancy was found. These are label counts, not publisher
independence or semantic agreement. The snapshot alone cannot prove before/after
preservation of every admitted event or explain every admission decision.

## Separate observation, not investigated in this milestone

Cluster `3e838fa14d15` groups "How to Stay on Top of Tech Trends with Google Gemini"
with "Is Anthropic Making Claude Too Human to Control?". These appear to be
different articles/events sharing an AI subject. Record this for separate grouping
triage; do not call it a proven TM1a regression, reopen EA1 without tracing the
responsible path, or claim this inspection establishes all clustering is correct.

## Subsequently supplied status

The user then pasted `/api/feed/status`. The full-feed key `0f875b7be67b`, distinct
from the Markets-only key, reports:

- Refresher thread alive, no loop or target error.
- Started and completed refresh ID `cycle-139`; last attempt succeeded.
- Full pipeline started 16:40:18.837397 UTC, completed 16:45:19.894484 UTC,
  and was published successfully at 16:45:20.256873 UTC on September 16.
- All recorded full-feed stages are ok, with zero source errors.
- Memory cache and disk cache ok; institutional memory completed.
- Cache was replaced by refresh, not served from the startup disk snapshot.

This establishes a successful full-feed cycle after the recorded TM1a deployment.
It does not identify the exact cycle that produced the earlier inspected feed:

| Field | Inspected feed | Full-feed status snapshot |
|---|---|---|
| generated_at (UTC) | 16:35:01.065127 | 16:42:43.576105 |
| Items | 61 | 62 |
| Clusters | 59 | 60 |
| Admitted events | 32 | 33 |
| Emitted themes | 9 | 9 |

The earlier feed predates cycle-139's start. Do not assign its controls to that
cycle or treat this expected progression as an implementation failure. Generation
time preceding successful publication is consistent with generation occurring
within a pipeline that completes its later stages before publishing.

## Follow-up requested at the time, now fulfilled

Request the normal full-feed response once more. A `generated_at` of
`2026-09-16T16:42:43.576105+00:00` pairs with the supplied status. If the cache has
advanced, obtain feed and status for that same completed snapshot. Do not force
a refresh or request credentials. Recheck the controls on the matched feed before
closing A1; do not start TM1b. The user supplied that exact matching generation;
the rechecks and bounded A1 closure are recorded separately. No runtime or
production changes were made.
