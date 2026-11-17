# TM1b1 production validation follow-up

Status: BLOCKED BY BROWSER ACCESS — fresh semantic validation remains pending.
This record is separate from the feed-transport repair. It is not a TM1b1 code
change, closure, or finding of regression.

On November 17, after the user authorized feed repair followed by production
validation, both the authenticated Argus tab connection and browser inventory
request timed out. No authenticated response body or rendered production page
was obtained in this follow-up. No unauthenticated response, historical cache,
local replay, or automated test is substituted for the required live evidence.

Local source provenance confirms that TM1b1 implementation `0b1acc0` remains an
ancestor of the feed-repair branch, and `app/theme_graph.py` has no difference
from that implementation. This establishes source continuity only, not which
revision is currently running in production. The existing local TM1b1 test
edits and November control-review packet were not changed or included in the
feed repair.

## Required evidence once access returns

1. Read the active production backend revision and a successful naturally
   completed full-feed cycle; match `/api/feed/` generated_at to `/api/feed/status`.
2. Inspect primary article title/snippet inputs, not merely related cluster
   members. Find a spending-only corporate/government negative and an affirmative
   household-spending-pressure positive that actually exercise the existing
   keyword route. Preserve the accepted human judgments and distinguish new
   engineering controls from benchmark truth.
3. Establish exact triggers and candidate membership before top-five retention.
   If the payload lacks that detail, report the evidence gap rather than infer
   rejection from an absent emitted theme. Any local tracing of captured inputs
   must be labelled replay, distinct from observed production membership.
4. Check source/evidence accounting and the corresponding authenticated Event
   rendering. The Event startup fix must not be inferred from an API-only check.
5. Close only if the agreed controls and checks are present. If the cycle lacks
   either control, retain pending status; do not force a recompute, fabricate
   an example, or reopen the matcher without regression evidence.

## Exact unblock

Preferred: reconnect Chrome browser control with Argus signed in, then notify
the agent. No credentials are needed in chat.

Alternative: provide response bodies for `/api/feed/` and `/api/feed/status`
captured together, capture time/timezone, and the active backend revision from
Railway's deployment Details. After candidate events are identified, their
rendered Event pages must be checked through the browser connection or supplied
as screenshots. Do not send cookies, authorization headers, tokens, HAR files,
or Copy as cURL. Captures without the required controls cannot close TM1b1.
