# TM1b1 authenticated production validation — November 18, 2026

Status: IMPLEMENTED / DEPLOYED / PENDING REQUIRED LIVE SEMANTIC CONTROLS.
Browser access is restored. Validation was performed, but the inspected cycles
do not contain the inputs required to close the milestone. No TM1b1 regression
was established, and no matcher or ontology change is authorized by this result.

## Runtime and cycle provenance

Authenticated Railway backend deployment `a320b219-f442-4c1f-a087-8a0af7b52f62`
was active and successful at revision
`6cbf3d4a341f020ddfa0c74eec6c4dcee594c4d1`. Local Git confirms that TM1b1
implementation `0b1acc0` is an ancestor and that `app/theme_graph.py` is unchanged
between those revisions. No running-container shell or credentials were used.

Matched all-category feed/status snapshots, observed around 13:20–13:23 EST:

| Cycle | Exact generated_at (UTC) | Items | Clusters | Returned events | Emitted themes |
| --- | --- | --- | --- | --- | --- |
| cycle-208 | `2026-11-18T18:15:41.589004+00:00` | 86 | 74 | 36 | 13 |
| cycle-209 | `2026-11-18T18:21:42.324111+00:00` | 88 | 76 | 37 | 13 |

The detailed cycle IDs were `20261118T181524091176Z` and
`20261118T182110143727Z`. Both naturally completed successfully with all stages
`ok`. The final cycle completed at `2026-11-18T18:22:10.683101+00:00` and was
published at `2026-11-18T18:22:10.691737+00:00`. It was not disk-loaded, did not
predate the last refresh, and the feed was not stale. Memory cache, disk cache
and institutional-memory persistence succeeded. Five publisher errors constrain
coverage; their diagnosis belongs to the separate feed-transport record.

Diagnostic admission counts were 38 and 39, while returned events were 36 and
37. These are recorded separately, not represented as parity or investigated
within TM1b1. No production refresh/recompute was forced.

## Semantic control availability

Inspected every primary title/snippet and every returned feed item in both
snapshots. Neither contained the exact `spending` keyword in those source
fields. The deployed consumer-stress ontology includes `spending`; the broader
qualification helper's forms do not expand the keyword matcher's vocabulary.
Generated summaries and why-it-matters text are not substituted for matcher
inputs.

Two primary near-matches existed in both snapshots:

| Cluster | Source context | Why it cannot validate the gate |
| --- | --- | --- |
| `b8d6f8c0b71b` | The Information: Microsoft/ByteDance cloud-services agreement; snippet says `spend` | Corporate expenditure, but no existing `spending` keyword trigger; absence from consumer-stress is not a demonstrated TM1b1 rejection |
| `7aab855b702f` | MarketWatch: lower-cost desk-lunch advice; snippet says `spend less` | No existing `spending` keyword trigger and no demonstrated affirmative household-pressure control |

Other household/budget mentions concerned UK energy bills, expired Japanese
energy subsidies, military budgets and an MTA budget gap. These were not relabelled
as the required spending-only controls. `consumer-stress` was absent from the
13 emitted themes, but theme absence does not establish pre-retention rejection.
No claim about candidate membership before top-five truncation can therefore
be made from these snapshots. No new human benchmark labels were created.

## Counts and rendered Event checks

Across all 36 and then 37 returned events, `source_count` matched distinct
evidence source labels, and `corroboration_count` matched distinct qualified
evidence labels. There were zero arithmetic mismatches. This is internal
consistency, not publisher independence, semantic agreement, membership validity
or before/after numeric preservation.

Authenticated Event `/event/9df0609f6434` rendered the UK energy-cap story with
one FT Companies evidence record and `1 source label`. The page presented its
unsupported financial implication explicitly and displayed the qualified-source
watch wording. It did not display the former startup unreachable error.

Authenticated Event `/event/b8d6f8c0b71b` rendered its Microsoft/ByteDance title,
three evidence records and `2 source labels, 2 qualified`, matching the payload.
The temporary loading state resolved to the Event page. This verifies readable
authenticated rendering, but neither page exercises the TM1b1 spending gate.

## Separate observation, not a reopened slice

The Microsoft event also included an FT Companies story about JPMorgan's
software-debt sale and a separate The Information report on bank loan protections
and chip smuggling. Their relationship to the lead event was not established by
the display. The payload had `merged_event_ids: [ca67463f5ea1]`,
`cycles_observed: 51`, and first_seen `2026-11-18T12:44:53+00:00`; its current
cluster's related list was empty. This is a concrete event/evidence-membership
concern, not proof of a Path 3, RC2 or TM1b1 defect. A fresh response can include
persisted event history. Cause has not been traced; no closed slice was reopened
or changed. Count arithmetic passing must not be presented as validation of
these memberships.

## Remaining requirement

Access is no longer the blocker. A naturally completed cycle must supply both
an actual spending-only corporate/government negative and an affirmative
household-spending-pressure positive. Then trace their triggers and contribution
membership before retention and check their corresponding Event evidence/UI.
Until then TM1b1 remains pending due to insufficient live control coverage.
No credentials, user uploads, new implementation or next phase are needed now.

These are bounded browser observations. Complete raw snapshots were not
exported. Existing local test edits, prior human decisions and benchmark truth
were preserved. No background monitoring or automated future check was started.
