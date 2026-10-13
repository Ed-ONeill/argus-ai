# Industry detail guides — 2026-10-13

Status: deployed and verified on authenticated production pages.
Runtime commit: `2b605ff`.

The owner requested the visual energy of Feed and Markets on industry detail pages,
with enough explanation to understand each industry. The Industries overview layout
is unchanged. The existing industry artwork, tape and deeper intelligence tools
remain, with a new guide before the current-context sections.

## Reader experience

All twelve configured industries have tailored educational content: Semiconductors,
Software, Aerospace & Defense, Energy, Financials, Industrials, Consumer,
Healthcare, Real Estate, Crypto & Digital Assets, Utilities, and Media & Telecom.

Each guide includes:

- A plain-language industry introduction.
- Three selectable business segments explaining what each does, how it earns
  revenue and what to examine. Selection is keyboard accessible and announced.
- Three expandable measures, with definitions and questions for reading results.
- An industry-specific distinction that prevents a common overgeneralization.
- Up to two reports from the page's existing industry/sector matching, linked to
  Event evidence. Matching is explicitly not proof of an economic effect.
- An honest missing-report state and source-publication dates when available.
- Background references, a review date and an explicit educational-context label.

The hero links directly to the guide or the current context. Guide colors, typography
and finite transitions reuse the discovery design; reduced-motion rules apply to
new transitions. The guide has its own dark background within the existing light
detail-page layout.

## Content provenance and limits

The explanations are editorial background, not generated from current signal scores.
They contain no company rankings, current market-size figures or price forecasts.
Research consulted SIA's semiconductor production guide, EIA's petroleum and
electricity explainers, BLS industry definitions, Investor.gov's REIT and crypto
material, and the SEC's financial-statement guide. Each industry links to a relevant
background reference and Investor.gov's company-filings research guide. These links
are not presented as validation of a current signal or a company's financial results.

The existing industry/sector matching and deeper model outputs are unchanged. A new
introduction distinguishes broader sector context from individual industry businesses.
This release does not claim to audit every preexisting analysis panel or resolve
industry-taxonomy and company-universe issues. AR-1 remains untouched.

## Validation

- All 1,494 frontend tests pass, including twelve guide-selection/empty-reporting
  cases and a report-link test preserving unknown publication time.
- Production build, type checking and lint pass with preexisting unrelated warnings.
- Industries overview source is unchanged; only the dynamic detail route imports
  the guide. Guide data and display component are separate.
- Authenticated desktop Semiconductors: guide anchor, Fabrication & memory
  selection, updated business explanation and expanded Yield definition verified.
- The Broadcom report link opened Event `c858b93f7042`, displaying its source,
  publication time and explicit absence of an established supported implication.
- Authenticated Financials at 390 x 844: stacked segment controls, selected
  Insurance explanation and readable wrapping verified visually. Viewport reset.
- Railway frontend deployment succeeded at 19:27:16 UTC; backend redeployment
  succeeded at 19:30:48 UTC on October 13, 2026.
