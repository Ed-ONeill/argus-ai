# A1: TM1a production validation handoff

Status: BLOCKED ON VALIDATION ACCESS, NOT CLOSED.

Implementation `01301d2` is deployed. Backend deployment succeeded at
2026-09-16 02:24:36 UTC. Local gates and previous authenticated UI smoke checks
are recorded in `RC3_TM1A_IMPLEMENTATION.md`.

On the new milestone attempt, 2026-09-15 evening America/New_York, authenticated
product context remained available, but opening the exact `/api/feed/` URL in a
separate browser tab again returned `net::ERR_BLOCKED_BY_CLIENT`. No fresh payload
was obtained and no inference about implementation correctness is drawn from it.
No code, data, or production configuration was changed to bypass this restriction.

## Evidence needed to unblock

From the logged-in production browser, save the JSON **response body only** for:

1. The normal full-feed `/api/feed/` request, without category/source filters or
   force-refresh parameters.
2. The read-only `/api/feed/status` response, captured near the same time, to
   establish that the full-feed target completed a successful post-deployment
   cycle and that the snapshot being inspected is that published cycle.

Provide capture time/time zone. Do not provide cookies, authorization headers,
tokens, passwords, an authenticated Copy-as-cURL command, or a HAR containing them.
If no suitable live control exists in the captured cycle, report that limitation;
do not insert artificial articles or remediate historical records to obtain one.

## Validation contract

- Verify the backend revision and full-feed success/published timestamps. A recent
  article timestamp, a live HTTP process, an old cached event, or a successful
  Markets-only refresh does not prove a fresh full pipeline cycle.
- Inspect primary title/snippet, extracted company hints, cluster identity, theme
  contributors, and resulting event theme IDs for the same snapshot.
- Negative: ordinary `cost` or `so` must not create a COST/SO entity contribution.
  An independently valid keyword can still justify the theme; theme presence alone
  is not proof of failure. Top-five contributor truncation alone is not proof of
  passing either. If the payload cannot establish the cause, mark it insufficient.
- Positive: a current explicit company name, ticker notation, or supported market
  context still contributes to the applicable theme when existing emission gates
  permit it. Prefer actual COST/SO controls when available and report exact coverage.
- Check evidence identities, source-label/qualified-label counts, input membership,
  and unexplained losses or fragmentation. Existing downstream ranking/admission
  may respond to corrected themes; classify those effects rather than assuming
  every aggregate must remain byte-identical.
- Confirm representative resulting Event UI rendering in the authenticated
  product. API inspection and UI validation provide different evidence.

If a new defect is demonstrated, report the failing source-to-display trace and
reopen only TM1a. If data is old, controls absent, or access insufficient, leave
TM1a pending. Only validated closure permits the planned TM1b diagnosis to begin.
