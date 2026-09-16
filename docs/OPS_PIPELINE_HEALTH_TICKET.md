# OPS-PH1: Pipeline health contract

Status: READ-ONLY TICKET PREPARED. No implementation or monitoring deployment in
this milestone. Keep this operational slice separate from semantic corrections.

## Problem and existing foundations

`api/main.py:health` returns process-level status ok. In `app/background.py`, a
fatal `_safe_refresh` error is recorded and re-raised, ending the refresher thread.
Individual target failures are recorded while other targets can continue. A live
HTTP server or healthy Markets target therefore does not prove a healthy full feed.

Reuse existing `app/diagnostics.py` and `api/routes/feed.py:_build_diagnostics`:
refresher thread state; per-target attempts/success/publish timestamps; started and
completed cycle IDs; cache age and disk provenance; stage statuses/counts; safe
errors; and per-sink persistence outcomes. Unavailable diagnostics already have
an explicit sentinel and must not become a green state.

The current feed freshness flag derives from `is_refreshing`. Active work and
staleness are different facts. Do not change semantic scores or admissions to
make operational indicators appear healthy.

## Read-only diagnosis required before implementation

1. Inventory deployed warm targets, cycle interval, observed durations, startup
   grace, cache behavior, and existing Railway/external health settings.
2. Define liveness as process responsiveness, readiness as ability to serve the
   required Argus contract, and freshness against the last successful publication
   of the correct full-feed target. State degraded stale-serving behavior explicitly.
3. Define source health from attempted/expected source outcomes, not admitted
   story counts. A successful empty source differs from a fetch failure; a source
   not attempted differs from a failed one. Explain the denominator.
4. Distinguish completed computation, published cache, and successful durable
   archive write. Disabled/not configured/unknown must not display as written.
5. Determine evidence-based warning/failure thresholds and recovery behavior.
   Avoid automatic restart loops during a provider outage. Preserve sanitized
   diagnostics and existing authentication boundaries.
6. Inventory existing alert destinations and obtain authorization for any new
   outgoing messages or notification subscriptions before activating them.

## Acceptance gates for a later isolated implementation

- Frozen-clock tests for healthy publication, boot without a snapshot, stale
  retained data, in-progress work, and recovery.
- Dead refresher plus live HTTP server is visible; failed full-feed plus successful
  filtered target is not reported as a healthy full feed.
- Source failure/empty/unattempted states and archive failure/disabled/unavailable
  states are distinct. No fabricated healthy count or successful write timestamp.
- No secret/raw-exception disclosure and no unauthenticated sensitive diagnostics.
- Existing semantic/evidence tests remain unchanged. No runtime data migration.
- Validate on a controlled non-production failure/recovery exercise, then verify
  deployed healthy read-only status. Do not deliberately interrupt live research.

Deliver the diagnosis, proposed state table, threshold rationale, and narrow
implementation plan at its own milestone before changing the operational system.
