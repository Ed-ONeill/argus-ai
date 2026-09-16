# RC3-TM1a / Milestone A1 closure

Status: CLOSED - IMPLEMENTED / DEPLOYED / FRESH-CYCLE PRODUCTION VALIDATED.

Implementation: `01301d2`. Closure date: 2026-09-16. This closure changes
documentation only. TM1b is not started and awaits user approval.

## Exact cycle-to-snapshot match

The user supplied authenticated production `/api/feed/status` and a matching
full `/api/feed/` response. The latter has SHA256
`9D4B02427E28FA23794C773EFAEE73BCA8C639EC7316CF0DE091220CC510FAE7`.

- Full-feed key: `0f875b7be67b`, target `(all)`, not the Markets-only target.
- Deployment: recorded backend success at 2026-09-16 02:24:36 UTC for `01301d2`.
- Started/completed refresh IDs: `cycle-139`; attempt succeeded; no last error.
- Pipeline ID: `20260916T164018837352Z`.
- Pipeline started: 16:40:18.837397 UTC; completed: 16:45:19.894484 UTC.
- Successful publication: 16:45:20.256873 UTC.
- Exact feed/status generation timestamp: `2026-09-16T16:42:43.576105+00:00`.
- Both describe 62 items, 60 clusters, 33 admitted events, and nine emitted themes.
- Status reports live refresher, all full-feed stages ok, zero source errors,
  memory/disk cache ok, institutional memory completed, and startup disk snapshot
  replaced by refresh.

The feed's age is 494.5 seconds versus 263.1 in the earlier status capture. These
are separate reads of the same generation, not a timestamp/count mismatch. The
feed timestamp is assigned during computation, before successful publication.
No user capture time or server-reported deployment SHA is invented: revision
provenance comes from the recorded deployment, while cycle health and exact
snapshot identity come from the supplied responses.

## Semantic controls

Negative: cluster/event `0dd13ba52eeb`, "United, American Say Fuel Cost Surge May
Mean Capacity Cuts". Ordinary "Cost" does not become COST, does not attach the
consumer-stress theme, and does not produce theme-derived company exposure. The
event retains its Bloomberg evidence, one source label and one qualified label.

An offline counterfactual replays the exact supplied clusters at the generation
timestamp against baseline `5049643` and TM1a, with fresh momentum trackers and
persistence disabled. Baseline emits ten themes: the false COST contribution adds
Bloomberg as a second source alongside two AMZN filing clusters, enabling
consumer-stress with confidence 57. TM1a emits nine themes with consumer-stress
absent, exactly matching production contributor ordering, confidence, and evidence
counts for every emitted theme. This is a discriminating control, not an absence
that both implementations would produce. Offline replay is supplemental evidence,
not represented as a live server execution trace.

Positive: semiconductor-capex-cycle retains explicit AVGO and NVDA filing clusters
`709162e2cefe` and `d55940903eb7`, plus the AAPL/NVDA/AMD/TSM headline cluster
`dee12bbdaf8e`. Legitimate ticker-grounded contributions therefore survive.

Authenticated rendered UI inspections around 16:41 UTC confirmed the airline
event's single evidence label and absence of false Costco exposure, and the
named-company positive event's companies, retained anchored chain, and two
evidence records under one Yahoo Finance label. These UI observations were made
separately from the subsequently supplied matched snapshot; they do not assert
that the browser displayed the exact cycle-139 cache generation.

## Evidence and changes between supplied snapshots

All 33 events' source counts and qualified-label counts exactly reconcile with
their 35 evidence records. The 60 cluster story counts sum to 62 items.
For the 30 event IDs shared with the earlier 61-item snapshot, evidence and both
counts are unchanged, including the negative/positive controls.

The 32-to-33 event change is explained by observed input changes: Sazerac and
Bitget items appear; Uno Minda is absent from both new items and clusters; and
the Fed live-coverage headline acquires a period, changing its event ID while
retaining its URL and counts. The upstream reason for Uno Minda leaving the item
set was not investigated and is not attributed to this matcher change. Do not
claim that all inputs or event identities remained constant across cycles.

## Bounds and preserved scope

- Live validation covers one ordinary-word COST collision and legitimate NVDA/AVGO
  contributions. No live ordinary-word SO case or actual COST/SO positive appeared;
  those precise cases remain covered by local before/after regression controls.
- This closes resolver grounding for theme ticker contributions, not all theme
  relevance. Company presence alone does not prove every investment-theme link.
- No new RC2 invariant violation was established. EA1, EA2a, ET1a and RC2 stay
  closed. The separate Google-Gemini/Anthropic grouping concern in the feed review
  remains untriaged; this closure does not endorse every cluster or reopen EA1.
- Generic keywords, direct/contextual propagation, full-chain validity, entity
  coverage, instrument identity, M&A/Home wording, source normalization, URL
  identity, OP1.2, and historical remediation remain outside this slice.
- Previously passed implementation gates remain recorded: 1,343 backend tests,
  1,471 frontend tests, type-check, lint with four existing warnings, and build.
  No tests were rerun for documentation-only closure.

Milestone A1 is complete. Phase 1 remains active. Stop here: user approval is
required before the next milestone, TM1b read-only diagnosis. No new code or
deployment is authorized by this closure.
