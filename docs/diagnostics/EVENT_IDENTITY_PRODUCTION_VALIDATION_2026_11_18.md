# Persistent event-identity integrity — production validation

Status: **DEPLOYED / FRESH-CYCLE AUTHENTICATED UI VALIDATED**.

This is a bounded validation of persistent identity safeguards. Path 1,
TM1b1, and historical cleanup remain separate. No further implementation,
forced production recompute, or manual historical-data mutation occurred.

## Release provenance

- Implementation: `4f6277960a541fd1f9a189622fe9f56a6132fbde`.
- Published that exact commit to `main` and `codex/audit-remediation` with a
  normal atomic fast-forward push. Existing unrelated working changes were
  excluded.
- Authenticated Railway Details showed **Active / Deployment successful** for
  deployment `d50de97d-13c9-4336-a371-a7a999708626`, linking to the exact commit.
- [Main release checks](https://github.com/Ed-ONeill/argus-ai/actions/runs/44417719209)
  passed: backend tests/dependency checks and frontend tests/type-check/lint/
  build/dependency audits.
- Local implementation gates previously passed: 1,478 backend tests,
  including 23 new integrity cases; changed-file Ruff and dependency checks.

## Matched authenticated snapshot

The signed-in Chrome session successfully rendered Argus. Both API responses
were read through that session; actual Event-page rendering was also inspected.

| Field | Observed value |
| --- | --- |
| Pre-release generated_at | `2026-11-18T23:01:39.205700+00:00` |
| New process disk-cache load | `2026-11-18T23:06:48.552789+00:00` |
| Fresh full-cycle start | `2026-11-18T23:06:50.462670+00:00` |
| Cycle | `cycle-0` / `20261118T230650462646Z` |
| Matching feed/status generated_at | `2026-11-18T23:07:15.575351+00:00` |
| Cycle completed | `2026-11-18T23:08:04.694523+00:00` |
| Published | `2026-11-18T23:08:04.699300+00:00` |
| Feed items / clusters / returned events | 90 / 88 / 54 |
| Last attempt / all stages | successful / all `ok` |
| Memory cache / disk cache / institutional memory | `ok` / `ok` / `completed` |
| Loaded from disk / predates refresh / feed stale | false / false / false |

The startup response still served the old disk snapshot and was explicitly
excluded from validation. The naturally completed cycle replaced it.

Four pre-existing source-access errors remained: PE Hub and Buyouts returned
publisher registration pages, Power Magazine returned 403, and Yahoo Finance
returned 404. The same four were present before release. They did not prevent
the successful full cycle and were not changed in this slice.

## Negative control: unrelated evidence separates

Before release, the Microsoft Event `b8d6f8c0b71b` used
`ev_01M7QD231FSB7K0F88CZR7R2NE` and combined Microsoft/ByteDance, JPMorgan's
software-debt sale, and the technology-outage article: three evidence records,
two source labels.

After release:

| Current event | Persistent UID | Evidence / source labels / qualified labels |
| --- | --- | --- |
| Microsoft/ByteDance (`b8d6f8c0b71b`) | `ev_01M7REM5QQS5H18XVCZVD9EP8R` | 1 / 1 / 1 |
| JPMorgan software debt (`ca67463f5ea1`) | `ev_01M7REM5QQER6ERYGSWMWFA0YA` | 1 / 1 / 1 |
| Technology outages (`8ffeccdb894b`) | `ev_01M7QD231FSB7K0F88CZR7R2NE` | 1 / 1 / 1 |

All three have empty `merged_event_ids`. Direct companies are respectively
`MSFT`, `JPM`, and `MSFT/JPM`. The original outage identity remains with its
origin story, retaining first_seen `2026-11-18T12:44:53+00:00` and advancing from
97 to 98 observed cycles. Microsoft and debt have separate new identities and
their own article first_seen times.

Authenticated rendered UI checks passed on all three Event pages. Each showed
only its own article and `1 source label`. The Microsoft page names MSFT alone.
Local screenshot: `outputs/event-identity-validation-2026-11-18/microsoft-event.png`.

## Positive controls: continuity survives

The NYT OpenAI interview, “Watch: OpenAI’s Top Executives Talk Rogue Agents and
A.I. Security,” retained UID `ev_01M7QYM7RGA8CSMF95CPSTKWCR` even as its cluster
ID changed from `aa597d8c60b0` to `323f4bfac863`. It retained first_seen
`2026-11-18T18:19:07+00:00` and advanced from 38 to 39 observed cycles.

Both same-event NYT article/video URLs remain represented. The authenticated
Event page renders both evidence rows and `1 source label`, matching one
distinct publisher label rather than counting the two URLs as two sources.
This validates continuity and retained evidence; it is not a claim of
independent publisher corroboration or a new cross-publisher merge.

The Federal Reserve minutes payload also retained UID
`ev_01M7R0PKNYCNMJ0KGQXTKTZ4E0`, its original first_seen, and its one evidence
record; observed cycles advanced from 40 to 41. This supplemental check was
performed on the authenticated payload, not a separate rendered Fed page.

## Bounded conclusion

The demonstrated historical-membership carry-over is corrected in the fresh
cycle, with actual signed-in UI confirmation. Legitimate continuity survives
both a stable event and a changed cluster ID. No required surface was blocked.

The chip-smuggling loan story was not among the returned Events inspected in
this cycle, so its exact live negative control is not claimed; its regression
test remains the evidence for that variant. This is not an exhaustive audit of
all persistent identities, initial cluster membership, or historical pages.
Existing history was not cleaned, and no next phase was started.
