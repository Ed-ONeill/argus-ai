# Homepage ETF reference clarity — 2026-10-13

Status: frontend deployed and verified in authenticated production.
Runtime commit: `5a96114`. Scope: homepage MarketPulse and MarketSummary (audit A5).

## Observed problem and cause

Authenticated production before this release showed “Bitcoin” at 46.86 and
“S&P 500” at 778.10 without ETF tickers, share units or observation dates. The
summary stated “Treasury yields eased.” The tape actually requested IBIT and SPY,
and the summary inferred yield direction from TLT's adjusted-close change.
An ETF share price is not the underlying spot price, index level or measured yield.

## Change

- Each reference identifies its ticker and ETF role, USD/share units, adjusted
  close, change versus the prior available close, and actual last bar date (UTC).
- The summary names SPY, TLT and USO and their roles. It reports their available
  adjusted-close changes and dates without asserting a Treasury yield movement.
- Session clocks and retrieval timestamps do not replace the observed bar date.
  Explicit stale signals are displayed; no new age-based freshness rule is invented.
- Missing or mismatched series show Price unavailable for that instrument. One
  missing SPY series no longer hides valid references for all other instruments.
- One valid point permits a price but no fabricated change. Invalid dates,
  mismatched symbol/exchange and nonpositive latest values fail closed.
- Tape and summary share the same observation helper and 120-day request window.
  Existing chart adjustment behavior and data-provider contracts are unchanged.

## Local validation

- All 1,478 frontend tests pass. Production build, type checking and lint pass
  with preexisting unrelated warnings.
- Observation tests cover adjusted versus raw values, actual bar dates despite a
  newer retrieval date, stale signals, missing/mismatched data and missing changes.
- A rendered regression shows IBIT's identity, share unit and observation date
  even when SPY is unavailable. It fails against the preceding MarketPulse source
  (`c0e3f42`), which renders no tape, and passes with the restored new implementation.
- These missing-data cases are local fixtures, not induced production failures.

## Production verification

Railway's production-domain service `argus-ai` reports success at 17:15:28 UTC
for `5a96114`, deployment `8fb30d4c-3ead-4695-9306-754a16f2b286`.
The companion `perceptive-achievement` service also shows this release Active and
Deployment successful, deployment `8674fdd5-5bc2-4c6a-b848-38872541d8b1`.

Authenticated homepage checks at approximately 13:16–13:18 EDT confirmed:

- All eight reference tickers, ETF identities, adjusted-close USD/share units,
  October 12 observation dates and supplied stale indicators render.
- IBIT's 46.86 value now identifies an ETF share and Bitcoin proxy. SPY's 778.10
  value identifies the S&P 500 proxy. TLT's +0.09% appears as its price change;
  the summary no longer asserts that Treasury yields eased.
- Tape and summary display matching observation dates and stale states. The
  summary rounds percentage changes to one decimal while tape cells retain two.
- The desktop strip scrolls to IBIT. At a temporary 390 x 844 viewport, the strip
  is 304px wide with 1132px of content. Keyboard scrolling reaches its full 828px
  range, and screenshots confirm readable labels at both ends. The summary wraps
  within the page. The viewport override was reset after verification.
- The lead story's explicit unsupported-implication state remains visible.

## Boundaries

This corrects presentation and the unsupported yield inference. It does not verify
provider financial accuracy or complete the entire Alpha Readiness Audit. Release
observations supplement, rather than replace, the original frozen sample. AR-1
remains P1 pending rendered confirmation, with no implementation in this release.
No backend ontology, inference or company relationship behavior changed.
