# Remaining audit work — November 19, 2026

The owner authorized addressing the remaining findings, with human input where
needed. No milestone is closed merely because a plan, backup, or test exists.
Runtime baseline is `0a23550` (implementation `a277751`). This follow-through
does not reopen earlier semantic closures or modify historical records.

## Recovery

Railway's authenticated backend backup screen now shows an automatic daily
backup (246 MB), in addition to the November 18 manual backup (245 MB). Scheduled
backup execution is verified. Native restore correctness remains untested.

Supabase initially displayed Free/no accessible backups. The owner upgraded to
Pro during this session. Completed physical backups then became visible, newest
November 19 at 07:51:29 UTC. This establishes available backup coverage, not a
successful restore, nor that those older snapshots were created during this session.
Supabase Storage objects are not included in database backups.

The isolated restore dialog is prepared for `argus-recovery-check-2026-11-19`.
Displayed added monthly estimate: $9.68 compute + $0.50 disk = $10.18. Source
data remains in place. User handoff is pending for the new password and paid
project creation. No password is requested in chat. The current source extension
screen shows only pg_stat_statements, uuid-ossp, plpgsql and pgcrypto enabled;
pg_cron, pg_net and wrappers are not enabled. The backup's own extension state
must still be checked in the restored copy. Do not connect application services
to this copy or run ingestion against it.

Restore acceptance: completed independent target; expected schema, constraints,
row-level-security policies and restored records; ownership separation; no live
endpoint/configuration changes. Counts reflect the backup timestamp, not later
production writes. Keep data and credentials out of the public repository.
Confirm before permanently deleting the disposable project; no deletion of the
original production project is part of this work.

Railway's documented native restore stages a replacement on the attached
service. It is not an isolated rehearsal. Do not deploy that swap on production
as a test. A supported isolated-copy procedure or application-consistent export
is still required. The earlier local retained-data exercise is not cloud proof.

References: [Railway backups](https://docs.railway.com/volumes/backups),
[Supabase backups](https://supabase.com/docs/guides/platform/backups),
[isolated Supabase restore](https://supabase.com/docs/guides/platform/clone-project).

## Bounded production capacity check

27 authenticated browser feed reads succeeded: three rounds each at requested
concurrency 1, 3 and 5. Observed end-to-end automation durations ranged from
297 to 1,471 ms. No error or five-second stop threshold was reached. Same browser
and account; browser-control overhead and possible client scheduling are included.
This is a small pilot smoke test, not API latency, sustained throughput, independent
users, saturation, write/load capacity, or a production scaling ceiling. No forced
refresh, pipeline run, load-generating analysis call or authentication change.

## Exact fresh snapshot and semantic controls

Authenticated feed and status match `2026-11-19T18:19:36.317524+00:00`, cycle
`20261119T180952537499Z`, completed at 18:19:58.918811 UTC. All stages passed.
100 feed items map to 98 clusters; summing all cluster members gives 100.
All 58 events have correct distinct-label and qualified-label arithmetic.

TM1b1: no primary article satisfies the household-pressure predicate. The Walmart
grocery-spending story is not a qualifying pressure relation and has direct WMT
support; do not substitute it for the spending-only positive. Validation stays open.

Path 1: AMD short-report coverage is a plausible same-event merge, but removing
entity identity leaves insufficient headline overlap for the Path 1 predicate.
It therefore cannot validate that path, despite the shared AMD entity. The other
multi-story cluster concerns the Trump/Putin/Xi meeting and has no shared specific
company. The required live Path 1 positive remains absent. No matcher was loosened
to turn these into passing controls.

## Publisher access

Production continues to report Yahoo Finance 404, PE Hub and Buyouts redirecting
to a PEI registration page, and Power Magazine 403. Direct local checks confirm
the first three. A plain local Power request returned RSS, but the application's
actual transport (Argus-AI identity) reproduced 403. This is not a proven parser
defect; no user-agent impersonation or access-control bypass was introduced.

Yahoo's symbol-specific NVDA endpoint returns XML, but a selected-symbol feed
does not replace broad market coverage. No silent universe narrowing, source
relabeling, or false recovery claim. PEI requires an approved access arrangement;
Power needs publisher-supported automated access. No publisher was contacted
and no subscription was purchased on the owner's behalf.

## Independent review and pilot

Eight source-grounded judgments are prepared, with engine predictions frozen
before requesting human decisions. Four engine-eligible and four engine-ineligible
raw keyword candidates are selected deterministically, one per current cluster.
Previously retained URLs and today's control-inspection cases were excluded.
Human event-equivalence checks are still needed: multiple Anthropic IPO articles
may belong to one event group. Eight judgments are not eight established
independent events. This is a small stratified stress evaluation, not a population
accuracy estimate or the complete 150–200 event benchmark.

Frozen artifact SHA-256:
`4347386717f7d02a8ac1e044fe5593bc658814826acaf636bc4a6349858aa77e`.
The owner clarified the initially ambiguous answer as **all eight A**. Decisions
are stored separately, without invented rationale. The frozen engine retained
four and rejected four: 4/8 agreement with this owner's full-contributor labels.
There are no B/C/D human labels in this batch, so it cannot measure rejection of
false positives, and stratified sampling prevents a population accuracy claim.
Reconcile source/mechanism support in the four disagreements before choosing a
correction; do not automatically expand themes to fit every new answer. No runtime
tuning has used this batch. The frozen prediction artifact remains unchanged.

The owner selected five pilot subjects. A private first-session worksheet is
prepared. Participation is not actual usage; no start date, voluntary visit,
time saved, research discovery or retention outcome has been invented.

Local evidence and the private worksheet are under
`outputs/audit-followthrough-2026-11-19/`. Raw authenticated payloads, screenshots,
review snippets and private research notes are not included in this public report.
