# DX3.2 — Canonical Domain Definitions

**Status:** Canonical reference manual (documentation, not code).
**Purpose:** One authoritative entry per data domain, so every future integration is a
lookup, not a re-derivation. This is the manual DX4+ integrations, the Workstation, and
any new surface consult before wiring a provider.

## Governing laws (apply to every domain)

- **Law of Authored Intelligence.** Providers own *facts*; **Argus alone authors** themes,
  narratives, transmission, importance, memory, predictions, confidence, relationships. A
  provider fact may be an *input* to intelligence; it may never *be* intelligence.
- **Honest absence.** Every fetch ladder ends canonical → fallback → **absence** (never a
  fabricated value). Stale facts render only when labeled via `DataQuality`.
- **Data Quality everywhere.** Every Reference fact carries `{source, updatedAt, delayMs,
  freshness, grade∈REALTIME|DELAYED|STALE|ESTIMATED|PARTIAL}`.
- **Workstation reuse.** Every domain is consumed through the product-agnostic platform
  (`lib/platform`); the website and Workstation share it without modification.
- **Five-layer stack.** Raw → Reference → Derived Metrics → Intelligence → UI. "Consumers"
  below are UI/product surfaces; "Intelligence Consumers" are the Argus intelligence
  processes that take the domain as *input* (never as authored output).

## Entry schema

`Owner` · `Fallback ladder` · `Refresh cadence` · `DataQuality (typical)` · `Consumers
(surfaces)` · `Derived Metrics` · `Intelligence Consumers` · `Failure behavior` ·
`Stage` (when wired) · `Entitlement (EODHD endpoint)`.

---

## 1. Historical Prices (EOD)

- **Owner:** EODHD (`/eod/{symbol}`, adjusted)
- **Fallback:** FMP daily → **honest absence**
- **Cadence:** Daily (long cache 6–12h)
- **DataQuality:** DELAYED / STALE (never REALTIME)
- **Consumers:** Brief (Market Pulse, Market Memory charts), Feed, Drawer, Entity page, Explorer, Markets, **Workstation**
- **Derived Metrics:** moving averages, rolling volatility, relative strength, rolling change, drawdown, dispersion, correlation clusters
- **Intelligence Consumers:** Market Memory, Emerging Signals (lead/lag), Importance (via derived volatility/RS)
- **Failure behavior:** absent; never synthesized. Stale labeled.
- **Stage:** 1A (first — the substrate for every visual surface)

## 2. Intraday Prices

- **Owner:** EODHD (`/intraday/{symbol}` 1m/5m/1h)
- **Fallback:** FMP intraday → **absence**
- **Cadence:** 60s during RTH
- **DataQuality:** DELAYED
- **Consumers:** Market Pulse sparklines, Drawer, Explorer, **Workstation**
- **Derived Metrics:** intraday relative strength, gap, range position
- **Intelligence Consumers:** (minimal; feeds derived only)
- **Failure behavior:** absent / stale-labeled
- **Stage:** 1B

## 3. Real-time / Delayed Quotes

- **Owner:** EODHD (`/real-time`; true realtime = WebSocket add-on)
- **Fallback:** FMP quote → free 9-ticker macro route (macro only) → **stale/absence**
- **Cadence:** 60s
- **DataQuality:** DELAYED (REALTIME only with WS add-on)
- **Consumers:** Market Pulse, Movers, Drawer, Entity, Markets, **Workstation**
- **Derived Metrics:** change%, gap, session move
- **Intelligence Consumers:** (facts only; "why it moved" is authored elsewhere)
- **Failure behavior:** stale-labeled, then absent
- **Stage:** 1B

## 4. Corporate Actions (Splits / Dividends)

- **Owner:** EODHD (`/div`, `/splits`, `/calendar/splits`)
- **Fallback:** none → **absence**
- **Cadence:** Daily
- **DataQuality:** DELAYED
- **Consumers:** charts (adjusted series), Entity (yield), Drawer, **Workstation**
- **Derived Metrics:** total-return series, adjusted-close, dividend yield/growth
- **Intelligence Consumers:** (none direct; corrects price facts)
- **Failure behavior:** absent (unadjusted prices never shown as adjusted)
- **Stage:** 2

## 5. Fundamentals

- **Owner:** EODHD (`/fundamentals/{symbol}`)
- **Fallback:** SEC EDGAR (filing-derived, free) · FMP → **absence**
- **Cadence:** Quarterly-driven (cache 12–24h)
- **DataQuality:** DELAYED / PARTIAL
- **Consumers:** Entity dossier (`/intel`), Drawer, Markets, **Workstation**
- **Derived Metrics:** valuation ratios, margin trend, growth rates, financial-health score
- **Intelligence Consumers:** Importance (breadth/fundamental context), theme relevance — as *input*, never authored
- **Failure behavior:** absent (empty dossier, never fabricated numbers)
- **Stage:** 1 (after prices/calendar/movers)

## 6. Calendar (Earnings · Economic · IPO)

- **Owner:** EODHD (`/calendar/earnings`, `/economic-events`, `/calendar/ipos`)
- **Fallback:** FMP → **absence**
- **Cadence:** Daily (+ intraday on the day)
- **DataQuality:** ESTIMATED (forward) / DELAYED (reported)
- **Consumers:** Brief (Today's Calendar), Feed, Drawer (countdowns), Markets, **Workstation**
- **Derived Metrics:** days-to-event, earnings-surprise magnitude, surprise persistence
- **Intelligence Consumers:** Market-Map catalysts, Emerging Signals (pre-event positioning), What-to-watch
- **Failure behavior:** absent when empty; **surprise-vs-expectation only when estimate AND actual are both real**; "news broke" dates never shown as scheduled
- **Stage:** 1 (highest UX unlock)

## 7. Movers / Screener

- **Owner:** EODHD (`/screener` sorted by change · `/eod-bulk-last-day/{exchange}`)
- **Fallback:** none → **absence**
- **Cadence:** 5–15 min (RTH); EOD after close
- **DataQuality:** DELAYED
- **Consumers:** Brief (Movers), Feed, Markets, **Workstation**
- **Derived Metrics:** relative strength, sector breadth, dispersion
- **Intelligence Consumers:** mover→theme linkage (Argus authors the "why it matters")
- **Failure behavior:** absent when market closed or no real universe returned
- **Stage:** 1

## 8. ETF Holdings

- **Owner:** EODHD (`/fundamentals/{symbol}#ETF_Data`)
- **Fallback:** (SEC 13F raw = future) → **absence**
- **Cadence:** Periodic (cache 24h)
- **DataQuality:** PARTIAL
- **Consumers:** Entity (ETF page), Drawer, exposure views, **Workstation**
- **Derived Metrics:** sector exposure, holdings overlap, concentration
- **Intelligence Consumers:** transmission (theme → ETF exposure), Market Map leaves
- **Failure behavior:** absent
- **Stage:** 3

## 9. Insider Transactions

- **Owner:** EODHD (`/insider-transactions`)
- **Fallback:** SEC Form 4 (free) → **absence**
- **Cadence:** Daily
- **DataQuality:** DELAYED
- **Consumers:** Entity, Drawer, Feed (signals), **Workstation**
- **Derived Metrics:** net insider flow, cluster-buying signal
- **Intelligence Consumers:** institutional-participation metric, conviction context
- **Failure behavior:** absent
- **Stage:** 3

## 10. Institutional Ownership (Top Holders / 13F)

- **Owner:** EODHD (`fundamentals::Holders` — top institutions/funds)
- **Fallback:** SEC 13F raw (future) → **absence**
- **Cadence:** Quarterly
- **DataQuality:** PARTIAL (top holders, not full 13F)
- **Consumers:** Entity, Drawer, **Workstation**
- **Derived Metrics:** ownership change, holder concentration
- **Intelligence Consumers:** institutional participation
- **Failure behavior:** absent
- **Stage:** 3

## 11. Macroeconomic

- **Owner:** EODHD (`/macro-indicator/{country}` + `/economic-events`)
- **Fallback:** FRED (deep history, free) → **absence**
- **Cadence:** Monthly / quarterly (cache days)
- **DataQuality:** DELAYED / ESTIMATED
- **Consumers:** Brief (economic backdrop), Markets, **Workstation**
- **Derived Metrics:** yield-curve slope, real rates, credit-spread regime, macro-surprise index
- **Intelligence Consumers:** regime context, Market-Map root nodes (Fed → rates → …), transmission sources
- **Failure behavior:** absent
- **Stage:** 2

## 12. News

- **Owner:** **Argus RSS/8-K pipeline** (canonical — the crown jewel). EODHD News = **sentiment supplement only**.
- **Fallback:** (EODHD sentiment) → **absence**
- **Cadence:** 5 min (backend refresher)
- **DataQuality:** DELAYED
- **Consumers:** Feed (primary), Brief (evidence), Drawer, Entity, **Workstation**
- **Derived Metrics:** source-tier authority, corroboration count, (EODHD) sentiment polarity
- **Intelligence Consumers:** the entire intelligence engine — events, themes, narratives, transmission, memory. **Providers supply articles; Argus authors the meaning** (Law of Authored Intelligence).
- **Failure behavior:** stale-cache fallback (existing), then absent
- **Stage:** unchanged (already live); EODHD sentiment = later, optional

## 13. SEC Filings (Documents)

- **Owner:** SEC EDGAR (free; backend 8-K already live for 12 issuers)
- **Fallback:** none → **absence**
- **Cadence:** Event-driven
- **DataQuality:** DELAYED
- **Consumers:** Entity, Drawer, Feed (8-K events), **Workstation**
- **Derived Metrics:** filing cadence, material-item flags
- **Intelligence Consumers:** 8-K events feed the event pipeline (Argus authors the event)
- **Failure behavior:** absent
- **Stage:** activate shelved SEC adapter (free) — Stage 2/3

## 14. Cross-Asset (Forex · Crypto · Commodities)

- **Owner:** EODHD (unified ticker `/eod`, `/real-time`)
- **Fallback:** existing free feeds (Treasury/CoinGecko) → **stale/absence**
- **Cadence:** 60s / daily
- **DataQuality:** DELAYED
- **Consumers:** Market Pulse (DXY, gold, oil, BTC), Markets, **Workstation**
- **Derived Metrics:** cross-asset correlations, risk-on/off composite
- **Intelligence Consumers:** regime signals (transmission)
- **Failure behavior:** stale-labeled, then absent
- **Stage:** 1B / 4 (consolidate off fragile free feeds)

---

## Provider role summary

| Provider | Role | Domains (canonical) |
|---|---|---|
| **EODHD** | Primary market-reference backbone | 1–11, 14 |
| **FMP** | **Secondary** (retained until overlap measured in production) | prices/fundamentals/calendar fallback; transcripts (its unique add) |
| **SEC EDGAR** | Free complement | Filings (13), insider fallback (9), 13F future (10) |
| **FRED** | Free complement | Macro history (11) |
| **Argus RSS/8-K** | Canonical, forever | News/events (12) — Raw feeding Intelligence |

## How to use this manual (for a new integration)

1. Find the domain. 2. Confirm the Owner endpoint is entitled on the current EODHD plan;
if not, the domain stays **absent** (never faked). 3. Wire canonical + fallback via
`lib/platform` (registry resolver). 4. Emit a `ProviderObservation` per call. 5. Attach
`DataQuality`. 6. Register the listed Derived Metrics once (reused by all Consumers). 7.
Never let the provider author an Intelligence Consumer's output. 8. Verify the failure
behavior is honest absence.

*This document is canonical reference material; it authorizes no code and is updated in
lockstep with any change to a domain's Owner/fallback/cadence.*
