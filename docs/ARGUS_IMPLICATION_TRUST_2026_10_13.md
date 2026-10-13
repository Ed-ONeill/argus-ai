# Event implication trust correction — 2026-10-13

Status: core correction deployed and rendered checks passed; final landscape-date
follow-up deployment pending.

## Scope and authority

The owner explicitly authorized implementation of the explanation/trust concern on
Homepage/Adaptive Hero, Feed/Market Landscape, and Event. This supersedes the earlier
review-only boundary for this slice. AR-1 (IPO failure versus empty state) remains
P1 pending rendered confirmation and is not changed. RC2 and existing event-chain
grounding gates remain intact. This is not a blanket Alpha Readiness sign-off.

## Observed symptom and traced cause

Authenticated production inspection on October 13 froze the homepage lead
`1d9717e2b095` and ordinary feed item #5 `12fa442285d5`. The latter was
“J&J Medtech Sales Disappoint, Considers Orthopedic Spinoff.” Its Event view showed
Healthcare/Financials beneficiaries and Consumer losers, legacy price-pressure prose,
and a weakening-trend counterargument alongside one Bloomberg source label.

`eventView.ts` derived winners/losers from linked themes' signed relationship weights.
`theme_graph.py` copies those weights from ontology configuration; the metabolic
disease theme config contains the same Healthcare/Financials/Consumer directions.
These are configured associations, not event-specific evidence of financial impact.
Homepage interpretation similarly manufactured a chain and directional exposure from
theme metadata; Feed repeated legacy `why_it_matters` prose. Event timestamps used
`first_seen`, while Feed used `last_updated`; producer fallbacks can use pipeline time.

## Delivered behavior

- Home and Event explicitly say that a supported financial implication has not been
  established. No synthetic reasoning is supplied to make an unsupported claim sound
  explained. The current event contract has no claim-to-evidence support record.
- Theme links remain context, without winner/loser labels or causal arrows. An empty
  direct-company list remains empty, rather than inheriting thematic companies.
- Feed omits unverified impact prose. Landscape explains that links group reporting
  topics, and identifies the ETF and as-of time behind available reference price moves.
- Home, Feed and Event use the latest valid source-publication timestamp and label it
  “Latest report.” Missing publication times remain unknown; pipeline time is not substituted.
- Event preserves source links, explains the limits of source-label counts, and exposes
  source snippets when an exact title/URL match exists in the supplied reporting.
  Direct company links and a general Workstation link provide deeper navigation.
- Homepage distinguishes loading, unavailable and genuinely empty content. Readiness
  uses the same headline builder as the visible brief, including fallback headlines.

## Local verification

Runtime changes: `9f2206d`; readiness follow-up: `33b608e`; readable landscape
date follow-up: `f491b69` (full timestamp retained on hover).

- 1,475 frontend tests passed. Existing assertions were updated only where they
  required the now-rejected winner/loser or causal-chain presentation.
- Four new controls cover rendered Event disclosure/navigation, publication-time
  consistency and missing dates, empty direct-company involvement, and rejection of
  high-confidence theme metadata as event support. These are controlled analogues,
  explicitly not captured production API payloads.
- Those four controls all failed against the pre-change frontend source and passed
  against the changed source. Existing negative chain-grounding gates still pass.
- Production build, type checking and lint completed successfully, including a fresh
  build after each follow-up. Existing unrelated warnings remain.
- Backend/ontology/event generation is unchanged. No new inference model is introduced.

## Release and rendered verification

Railway accepted the main-branch deployments. Final release status remains pending.
At 15:25 UTC, `f491b69` still reports pending in both Railway contexts, and the
production browser still shows the earlier ISO-date layout. Railway's dashboard is
signed out; owner sign-in was requested to inspect the prolonged deployment. Do not
claim the date-layout follow-up is live until its caption and compact dates render.
GitHub's Railway status history reports success for `argus-ai` at
15:08:02 UTC for `9f2206d` and 15:16:01 UTC for `33b608e`, each naming
`argus-market-intelligence.com`. Service roles must not be inferred from their names;
the other status context, `perceptive-achievement`, remains pending at this checkpoint.
Authenticated production rendering at approximately 11:09–11:12 EDT established:

- Feed: strong model-generated impact lines removed; source-label counts and
  “Latest report” labels rendered. Nike and Huang Qifan explicitly showed unavailable
  publication times. The retirement-advice item no longer inherited thematic tickers.
- Landscape: topic/non-causal explanation and representative ETF identification
  rendered. Raw ISO dates overlapped in the first visual check; `f491b69` corrects
  this with compact dates, an explicit daily-close/UTC caption, and full hover timestamps.
- Homepage frozen lead `1d9717e2b095`: no fabricated benefit chain or unrelated
  forward watch statement. Named NVDA and the explicit unsupported-implication
  statement rendered together. Clicking its evidence link scrolled to Event evidence.
- Supplemental Event `bf3314013031`, “US Bank Earnings Put FICC Sales & Trading in
  Focus”: explicit uncertainty, two reporting links under one source label, dated
  source entries, and expandable Bloomberg excerpt all rendered. Opening the excerpt
  showed the named banks and the interview description. The implication disclaimer
  distinguished company mentions/context from winners, losers and forecasts.
- Clicking JPM opened `/intel/company%3Aticker%3AJPM`; clicking the Event's
  Workstation link opened the case-selection page. Neither action saved or generated
  user content.
- The original ordinary sample `12fa442285d5` had left the live cycle by verification
  time. Its honest “not in the current cycle” page was observed. The supplemental bank
  event does not replace that frozen sample, and no same-record live closure is claimed
  for J&J. Its controlled regression analogue is separately documented above.
- Nike `c44e1da0b17e` also displayed “Publication time unavailable” in both the Event
  header and source entry, consistent with Feed. Its company mention was separated
  from unestablished financial benefit/loss.

## Limits

This removes unsupported certainty; it does not establish new financial implications.
Source snippets and company links improve inspectability but do not prove each claim.
Independent source verification remains limited where publishers block access. The
original seven-surface Alpha Readiness audit and AR-1 retain their separate evidence
requirements. No IPO failure state was induced or fixed in this work.

The JPM company destination still displayed older “moves with”/“forces that drive it”
language and a retirement-advice development with thematic tickers. Navigation works,
but Company remains a separate trust/coherence concern; it is not cleared by this
three-surface presentation correction.
