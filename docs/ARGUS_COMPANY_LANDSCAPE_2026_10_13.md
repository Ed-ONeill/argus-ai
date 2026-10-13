# Company context and Landscape spacing — 2026-10-13

Status: deployed and verified in authenticated production, 2026-10-13.

The owner authorized these two follow-ups after the implication-trust release.
AR-1 and backend inference/ontology behavior are unchanged. Runtime commit: `b62dad5`.

## Company trust boundary

The prior Company presentation used theme metadata for “moves with” and “driven by”
language, repeated legacy impact prose, and mixed indirectly attributed stories into
its latest developments. Merely removing technical words did not establish support.

The page now:

- Shows direct-company reporting with a linked lead headline, source-label count and
  latest valid source-publication time. Missing dates remain unknown.
- Excludes indirect stories from company reporting, including theme-inherited ticker
  associations. The underlying dossier remains unchanged.
- Labels the association panel “Thematic context” and identifies its sector, asset
  and factor lists as coming from linked themes. It explicitly disclaims demonstrated
  price co-movement, business relationships and causal effects.
- Omits unverified legacy impact prose and theme-derived forward questions.
- Describes relationship timestamps as dates of stored records, not the beginning or
  validation of economic relationships or proof of the displayed context.
- Preserves reporting links so readers can inspect Event evidence and uncertainty.

## Landscape spacing

The old independent market fans could collide with each other and with the unlinked
row; clamping positions near a canvas edge clipped cards. Up to seven protagonist
cards now occupy two deterministic rows with reserved slots. Cards have a 128px
width and the canvas has a 640px minimum width. Narrow screens can scroll the
labelled, keyboard-focusable region. Existing node selection, event membership,
source reasons, density limit and ETF reference series remain intact.

## Verification

- 1,477 frontend tests pass; production build/type checking/lint pass with the same
  unrelated warnings recorded in the prior release.
- New company regression covers direct versus thematic-only reporting, source counts,
  publication times, omitted legacy claims and unchanged dossier input.
- New geometry regression covers seven nodes tied to the same market and seven
  unlinked nodes; card bounds stay inside the minimum canvas and do not intersect.
- Both new regressions fail against the prior source (`45588fe`) and pass after the
  fix. The two focused test files pass all 21 tests after baseline source restoration.

## Production verification

Railway reports both services successful for `b62dad5`: `perceptive-achievement`
at 16:54:42 UTC and production-domain service `argus-ai` at 16:57:35 UTC. The latter
deployment ID is `e03a7f03-63a5-402c-af67-14882049f939`.

Authenticated browser checks around 13:00 EDT:

- JPM Company showed a linked lead, “Wall Street plays down investor fears of
  faltering trading boom” (`a30a52355bc0`), two source labels and the same latest-report
  age as its Event. The impact/forecast disclaimer and explicitly limited thematic
  panel rendered. Old price-impact prose, co-movement headings, the indirect Yardeni
  story and theme-derived forward question were absent. A same-turn pre-release
  observation had shown those old behaviors; the current reporting cycle is not a
  replacement for the original Alpha audit's frozen sample.
- Clicking the Company headline opened the matching Event, with reporting links,
  source dates and implication limits intact.
- Desktop Feed displayed seven separated protagonist cards (JPM, GS, NVDA, BX,
  AMAT, Iran, China). Clicking JPM filtered to the same bank event; Clear restored
  the unfiltered feed. No saved data or personalization was changed.
- At a temporary 390 x 844 viewport, the region was 346px wide and the canvas 640px.
  Read-only rendered bounding-box checks found zero overlaps among all 14 buttons
  and zero buttons outside the canvas. Keyboard ArrowRight scrolling reached the
  full 294px scroll range; a screenshot confirmed the rightmost BX, China and Bitcoin
  controls remained accessible. The desktop screenshot and both narrow-screen edges
  were inspected. The viewport override was reset afterward.

The two follow-up concerns recorded in `ARGUS_IMPLICATION_TRUST_2026_10_13.md` are
closed by this release. No new backend inference or semantic accuracy claim is made.

This closes only the two authorized follow-ups, not the entire Alpha Readiness audit.
