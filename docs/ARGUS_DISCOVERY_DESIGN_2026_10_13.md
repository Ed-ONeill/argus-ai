# Feed and Markets discovery redesign — 2026-10-13

Status: deployed and verified in authenticated production.
Runtime commits: `3b09144` and label polish `19b29a4`.

The owner asked for a more creative, engaging Feed and Markets experience that also
helps readers understand what they see. This release uses editorial typography,
subtle color and finite entrance transitions, with exploration tied to existing data.

## Feed

- Wider composition, distinct introductory typography and a textured landscape.
- Selecting a landscape name highlights its connections, announces the selection
  and filters the existing stream. Story counts describe reporting, not confidence.
- Numbered story cards retain existing ordering, categories, source-label counts,
  publication times, uncertainty and event destinations. The new evidence CTA makes
  the next step explicit. A reading guide explains associations versus implications.
- Refresh and Settings remain available in the page header. The duplicate fixed
  navigation instance was removed; the shared application navigation remains.
- ETF references use the existing shared observation helper for actual bar dates,
  adjusted-close changes and stale flags. Loading errors no longer assert that the
  pipeline is healthy without evidence.

## Markets

- A larger introduction and clearer controls frame the existing rotation map.
- Every card now selects an explanation in place, including sectors. Explicit
  related-industry links preserve depth navigation without an unexpected page jump.
- The explanation shows the actual reference symbol, current observation's price
  history and date range, stale state, price change and leadership change.
- The chart uses the same current half of the fetched history used by the view
  model. Whole-market leadership changes use score units; sector changes convert
  fractional excess-return changes to percentage points.
- Plain-language copy distinguishes relative leadership from price direction and
  states the limits of price comparisons. Existing measurement, ranking, timeframe
  defaults and prediction language in the underlying view model are unchanged.
- On narrow screens the panel follows the map, with a direct anchor to the selected
  explanation. Desktop places it beside the map.

## Validation

- 1,481 frontend tests pass; production build, type checking and lint pass with
  existing unrelated warnings.
- New regressions cover positive price change with fading leadership, current-half
  chart history, stale dates, sector percentage-point units, explicit industry links
  and accessible card selection passing the original block.
- Finite entrances and transitions respect reduced-motion preferences. Focus rings
  are visible; selection uses aria-pressed. No simulated ticks or animated causal
  flows were introduced.

AR-1 and backend inference remain unchanged. This is a design and explanation
release, not a claim that the original Alpha audit or market methodology is complete.

## Authenticated production verification

Railway reports `3b09144` successful for frontend `argus-ai` at 17:31:57 UTC and
backend `perceptive-achievement` at 17:34:22 UTC.

- Desktop screenshots confirm the new compositions, connection board, story card
  and side-by-side Markets explanation.
- Selecting JPM highlights it and filters Feed to its one story. Opening the card
  reaches the same Event, with evidence and the supported-implication limitation
  intact. Clear restores the stream.
- Whole Market selection changes from US Dollar to Bitcoin in place. Bitcoin's
  +7.99% price change appears with Losing leadership and a -1.29 score change,
  illustrating the distinction with actual available data.
- Inside Stocks loads eleven references. Selecting Technology stays on Markets and
  shows XLK, a +6.14% price change, -4.88 pp leadership change and an explicit link
  to related industry coverage. Switching to 1W changes the chart range to October
  5–12 and the corresponding values to -2.27% and -2.53 pp.
- At 390 x 844, Markets controls wrap, cards stack and the selected explanation
  remains readable. The “Read Bitcoin's position” anchor reaches its panel.
- Mobile Feed retains filtering and Clear. The 312px-wide landscape scrolls across
  its 640px canvas to the full 328px offset, exposing BX, AVGO and Bitcoin. Viewport
  overrides were reset. No account preferences or saved state were changed.

These are supplemental release checks against the current reporting cycle, not
replacements for the original audit's frozen samples.

Final polish `19b29a4` passed a fresh production build and all three focused
discovery tests. Frontend deployment succeeded at 17:40:01 UTC. Production
verification confirmed explicit USD/share units in the Markets chart caption and
the narrow Feed's rightmost date/stale label fitting on one line. The temporary
viewport was reset afterward.
The companion backend rollout for `19b29a4` also succeeded at 17:42:11 UTC.
