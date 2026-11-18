# Path 1 shared-company clustering — production validation

Status: **DEPLOYED / FRESH-CYCLE NEGATIVE CONTROL PASSED / LIVE POSITIVE CONTROL PENDING**.

This is a bounded Path 1 result, not closure of overall event-association integrity.
TM1b1, identity safeguards, historical cleanup, and Paths 2/3 remain separate.

## Release provenance

- Implementation: `45dad4322498ae51cd9faf13858f0fccbddfb1f5`.
- Release diff contains only `app/clustering.py` and `tests/test_clustering_path1.py`.
- Published to `main` and `codex/audit-remediation` with a normal fast-forward push.
- Authenticated Railway backend Details showed active, successful deployment
  `33f1f425-237f-4748-8a2c-4a90848dec8e`, linked to that exact revision.
- The new process loaded its old disk cache at `2026-11-18T18:43:10.855908+00:00`
  and began its first full refresh at `2026-11-18T18:43:12.961948+00:00`.
- Local implementation gates: 1,455 backend tests passed, including 20 focused
  Path 1 tests; focused Ruff, dependency consistency, and diff checks passed.
- GitHub main release-check run `44372575808` completed with both backend and
  frontend jobs successful. Local unrelated working changes were not released.

## Matched authenticated production snapshot

The browser-visible `/api/feed/` response and `/api/feed/status` agreed exactly:

| Field | Observed value |
| --- | --- |
| Snapshot generated_at | `2026-11-18T18:43:58.500014+00:00` |
| Full-feed cycle | `cycle-0` / `20261118T184312962078Z` |
| Cycle completed | `2026-11-18T18:44:51.174273+00:00` |
| Published | `2026-11-18T18:44:51.178146+00:00` |
| Feed items / clusters / returned events | 85 / 83 / 38 |
| Singleton / multi-story clusters | 81 / 2 |
| Sum of cluster story counts | 85 |
| Last attempt / all pipeline stages | successful / all `ok` |
| Memory cache / disk cache / institutional memory | `ok` / `ok` / `completed` |
| Loaded from disk / predates refresh / feed stale | false / false / false |

The initial startup response was explicitly stale and was not used as evidence
of the correction. Validation waited for the naturally completed full cycle;
no forced production recompute, registry mutation, or cleanup was performed.

## Direct negative control: passed

Before release, snapshot `2026-11-18T18:39:41.028723+00:00` grouped:

- `ca67463f5ea1`: JPMorgan seeks to revive stalled software debt sale with steep price cuts.
- Related story: U.S. Banks Seek Loan Protections Against Chip Smuggling with
  Southeast Asian Data Center Operator (`dd450bd2be69`).

In the fresh post-release snapshot, both have their own singleton cluster with
no related stories. The Microsoft/ByteDance article (`b8d6f8c0b71b`) also remains
a singleton. These articles remain represented; separation did not drop them.

The earlier outage bridge was not present in this cycle. Its separation is
covered by captured-record regression tests, not claimed as a new live control.

## Count behavior and persistence boundary

All 38 returned events satisfy the existing arithmetic: source_count equals
distinct evidence source labels; corroboration_count equals distinct qualified
evidence source labels. Cluster memberships account for all 85 feed items.

The Microsoft Event still contains the three Microsoft/bank evidence rows under
UID `ev_01M7QD231FSB7K0F88CZR7R2NE`, with merged_event_ids
`dd450bd2be69` and `ca67463f5ea1`. Its authenticated rendered Event page was
inspected and still shows all three rows and `2 source labels, 2 qualified`.
This is the previously diagnosed downstream identity fold, not continued
co-clustering by Path 1. It was neither changed nor repaired by this release.

## Positive-control and fragmentation limits

No clean live same-event Path 1 merge was available in the inspected cycle.
The only remaining multi-story clusters were:

- Treasury 20-Year Bond announcement + 9-Year 8-Month TIPS announcement.
- Ukraine underground gas-pipeline fighting + Russian petrol imports after
  refinery strikes.

Neither is a defensible same-event positive control. Both were already present
in the pre-release snapshot and their primary items have no specific entity
hints, so they do not establish a Path 1 regression or success. Do not broaden
this release into correcting those other paths.

Legitimate Path 1 merges are preserved in the focused regression controls
(cloud contract, earnings/guidance, debt sale, lending lawsuit, vehicle recall,
including category differences and company-name/ticker variants). Those are
test evidence, not a substitute for a naturally observed live positive control.
This cycle alone does not establish absence of excessive fragmentation.

The before/after feed counts are both 85, but one item changed: an Ellison/Musk
Skydance story arrived and an AI-bubble summit story left. Do not attribute the
entire cluster-count change (76 to 83) to the patch as a controlled experiment.

Five previously observed source-coverage failures remained visible (Yahoo
Finance, PE Hub, Buyouts, Power Magazine, FERC). A successful processing cycle
does not mean complete publisher coverage.

## Stop point

Deployment and the fresh-cycle negative control are verified. Full live
precision/recall validation remains bounded by the absent legitimate positive
control. No additional implementation, identity safeguards, historical cleanup,
or TM1b1 work was started. No full closure is claimed.
