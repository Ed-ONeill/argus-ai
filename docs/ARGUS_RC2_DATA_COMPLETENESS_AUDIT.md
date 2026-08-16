# ARGUS RC2 — Data-Completeness Audit

**Date:** 2026-08-12 · **Branch:** `homepage-product-correction` · **Scope:** Live → Feed → Markets → Industries → M&A → Private → Listen

Every empty, sparse, fallback, unavailable, or suspiciously static field traced to its origin and
classified:

| Class | Meaning |
|---|---|
| **1 — Legitimately empty** | Nothing happened; the absence is the honest answer |
| **2 — Missing provider data** | Source is dead, paywalled, uncovered, or does not carry the field |
| **3 — Mapping / normalization failure** | Data arrives but is parsed, matched, or symbol-mapped wrong |
| **4 — Engine / projection failure** | Data arrives clean but a threshold, cap, or derivation starves the output |
| **5 — UI not consuming data that exists** | The payload has it; the surface never reads it |

## Method

Static trace of every surface's data path (page → hook → route → provider), plus **live
measurement**: the 30-source news registry and the 27-source podcast registry were fetched with the
production User-Agent, and the ingestion → cluster → theme → activation → sector pipeline was run
locally (LLM stage excluded). All counts below are measured, not estimated.

> One correction worth recording: an initial probe using a browser User-Agent showed all three BLS
> feeds returning 403. BLS blocks browser UAs and **allows** the production `Argus-AI/1.0` UA. The
> BLS macro tier is healthy. No action needed there.

---

## Verdict summary — the six findings that matter

| # | Finding | Class | Surfaces |
|---|---|---|---|
| **A** | Entity extraction admits any 2–5 letter uppercase token; ~56% of items get no entity at all | **3** | all seven |
| **B** | LLM enrichment budget is 15 items/cycle, allocated globally by signal score — Markets takes 12–13 | **4** | Feed, M&A, Live |
| **C** | Capital Flow's 8 layers are canned prose; 4 of 8 measure nothing that exists | **4** | Private |
| **D** | 15 of 27 podcast feeds dead or years stale; `Episode.entities` hardcoded `[]` | **2/4** | Listen |
| **E** | Canonical `events` + `explanations` never reach the shared graph (hook drops them) | **5** | Industries, M&A, Private, Listen, drawer |
| **F** | No source covers Healthcare, Crypto, or Media & Telecom → 3 of 12 industry cards permanently dead | **2** | Industries |

---

## A. Entity extraction is a regex over capital letters — Class 3

`app/feeds.py:396 _extract_entities()` resolves entities in three steps:

1. `$TICKER` regex — a Twitter convention that essentially never appears in FT/Bloomberg/Reuters copy.
2. **Any bare 2–5 char uppercase token in the title** not in a 60-entry blocklist (`_NON_TICKER_ACRONYMS`, line 353).
3. One sector keyword.

Step 2 does the work, and the blocklist has no coverage for grid, regulatory, or macro acronyms.

**Measured on today's feed (180 items, 51 distinct entities, 42 "ticker-shaped"):**

```
Admitted as company tickers:
  PJM  ERCOT  CAISO  NYISO  NERC  FERC  RTO  FOMC  CPI  PPI
  HBM  NAND  DC  LA  GW  OTC  PIK  JLL  SK  FC  FD  RL  OCI
  CBRS  CHPE  CPX  LAFPP  ROWE  ATG  AROC
Entity coverage: 80 / 180 items (44%) raw; 27 / ~70 (≈36%) after the Markets cap
```

Nothing resolves company names — "Nvidia" in a headline produces no entity; "PJM" does.

**Downstream damage, all product-visible:**

| Consumer | Effect |
|---|---|
| `lib/marketLandscape.ts:110` — Feed centerpiece | `isTicker(c)` admits `PJM`, `FOMC`, `CPI` as **company nodes** on the Feed's visual anchor |
| `lib/adaptiveHero.ts:55` — Live hero | `companyInstrument()` picks `ERCOT`/`PJM` → `useSeries("ERCOT")` → EODHD 404 → hero silently degrades to text-first |
| `app/sectors.py` — Industries | measured `top_entity` values today: `BANKS`, `JLL`, `CPI`, `FC`, `HEALTHCARE`; `IndustrySignal.primary_drivers` = `['CBRS']`, `['FD']` — rendered as ticker chips |
| `intelligenceGraphAdapters` | company nodes minted for FERC, NERC, CAISO |
| `hooks/useMAIntelligence` | `entities` on every deal card |

**Fix shape:** replace step 2 with a name→ticker resolver over the ~240 tickers already enumerated
in `lib/industryConfig.ts` + `lib/tickerMetadata.ts`, and make a bare uppercase token admissible
only if it is *in* that registry. Coverage goes up and precision goes up at the same time.

## B. The LLM enrichment budget is spent almost entirely on Markets — Class 4

`app/summarizer.py:40` — `MAX_AI_ITEMS = 15`. `summarize_items()` takes `items[:15]`, ordered by
global signal score. Everything past 15 keeps `summary = snippet`, `why_it_matters = ""`,
`impact = ""`.

**Measured today** (180 raw → 70 after the Markets soft cap of 25):

```
Top-15 AI window by category:  Markets 12 · M&A 1 · Company 1 · Geopolitical 1
M&A item ranks in the pool:    11, 39, 40, 43, 44, 49, 50, 53, 57, 58, 62
                               → 1 of 11 M&A deals falls inside the window
```

So **10 of 11 deals on `/ma` render with no summary and no "why it matters"**, every cycle, by
construction. Same mechanism starves Company items, and `MarketEvent.why_it_matters`
(`app/events.py:642`) inherits the primary item's empty string — so Feed cards past the window show
headline + source and nothing else.

Second-order: `hooks/useMAIntelligence.ts:120` runs PE-firm detection over
`` `${item.title} ${item.summary}` ``. With `summary` empty it is title-only, so sponsors named in
the body are missed — which then feeds `vcDealCount` (see C).

The `_SUMMARY_CACHE` persists across cycles, so an item enriched once stays enriched. But an item
that never enters the top 15 is never enriched at all — and M&A almost never does.

**Fix shape:** allocate the budget per category (e.g. 6 Markets / 4 M&A / 3 Company / 2 Geo) rather
than by global rank.

## C. Private Markets' Capital Flow chain measures four things that do not exist — Class 4

`lib/capitalFlow.ts` (291 lines) builds an 8-layer transmission chain. Every layer's `status`,
`indicator`, `signal`, and `detail` are selected from 3–4 hardcoded literals by a small decision
tree over `{riskRegime, volRegime, regime, tnxRate, maDealCount, vcDealCount, ipoFilerCount}`.

| Layer | Backing data | Verdict |
|---|---|---|
| Monetary Policy | real 10Y (`TNX`) | grounded |
| Public Equities | real risk/vol regime | grounded |
| **Credit & Leverage** | none — renders `"Spreads Widening"` / `"Tight Spreads"` inferred from equity % change | **no credit data exists anywhere in the product** |
| M&A Activity | real deal count | grounded |
| **PE / Buyout** | 10Y level + M&A count | claims *"LP capital pause"*, *"sponsor pipeline stalls"* from no LP/PE data |
| **Late-Stage VC** | `vcDealCount` = **count of feed M&A items whose headline matched a PE-firm regex** | PE buyout headlines presented as *"N Recent Rounds"* of Series C–E |
| **Early-Stage VC** | risk/vol regime only | claims *"seed markets frozen"*, *"generalist LPs paused"* from no VC data |
| **IPO Window** | `filers.length` from EDGAR `getcurrent` S-1 | see below |

The IPO layer is worth isolating. `app/api/ipo-pipeline/route.ts` returns
`parseAtomFeed(xml).slice(0, 30)` from EDGAR's *current* S-1 list — a page that carries ~20–40
entries at all times regardless of market conditions (19 today). The layer's `n >= 8` branch
therefore fires essentially permanently: **"IPO window open and busy"** is a near-constant that
measures EDGAR's page size, not the IPO window.

The same fabrication appears one layer up: `hooks/useMarketState.ts:165` emits a **"Spreads"**
cross-asset signal on the Live status row with values `Widening / Tightening / Stable` derived
purely from the equity risk score. There is no spread series in the product.

**Fix shape:** either wire a real credit series (HYG/LQD relative, or an EODHD OAS proxy) and a real
private-markets source, or demote layers 3, 5, 6, 7 to explicit *"not measured"* states. They are
currently the strongest "suspiciously static" content on the platform because they read as
measurements.

## D. Listen — 15 of 27 shows contribute nothing; episodes carry no entities — Class 2 + 4

**Probed live, production UA:**

```
HTTP 404 (12):  Odd Lots · Masters in Business · All-In · Bankless · Animal Spirits
                Business Breakdowns · Capital Allocators · Macro Voices · My First Million
                The Compound and Friends · 20VC · (megaphone/omny slugs have moved)
Beyond the 14d global cap (3):
                Axios Pro Rata        newest 1694d (4.6 yrs)
                Bloomberg Deal of Week newest 1974d (5.4 yrs)
                DealBook Summit        newest  247d
Healthy (12):   Acquired · Bloomberg Surveillance · FT News Briefing · Goldman Sachs Exchanges
                Invest Like the Best · Planet Money · The Big Picture · The Big View
                The Indicator · The Journal · Thoughts on the Market · WSJ What's News · a16z
```

The 404s are URL rot, not blocking — they 404 under every User-Agent tried.

Two further gaps inside the surviving 12:

- **`api/podcast_feeds.py:1478` — `"entities": []` is hardcoded.** No podcast episode ever carries an
  entity. `lib/listenSections.ts:56 companiesEntering()` iterates `ep.entities`, so **Q6 "Which
  companies suddenly entered the conversation?" is permanently empty** except for Argus Briefings
  (`api/routes/briefings.py:211`, which does populate entities from the feed item). Class 4.
- **Listen's "conviction" numbers are news-feed numbers.** `ThemeMove.conviction` = `theme.confidence`
  and `.delta` = `theme.momentum_delta` — both extracted from *news clusters* in `app/theme_graph.py`,
  not from podcast content. Episodes are keyword-matched to news themes. The surface labels these as
  institutional conviction from the audio corpus; they are not. Class 4 (semantic mislabel).
- `why_it_matters` is canned per-topic prose, self-flagged in-code as a legacy path banned by the
  reasoning contract (`api/podcast_feeds.py:1267`).
- Argus Briefings render with `audio_url: None` ("TTS pipeline not yet wired") → the card's
  "Unavailable" / "Source unavailable" states. Class 1 (honest), unshipped capability.

## E. The canonical Event layer never reaches the shared graph — Class 5

The full chain exists and is correct up to the last hop:

```
FeedResponse.events + explanations          ✔ backend emits them
useArgusIntelligence.ts:69                  ✔ passes them into canonicalGraphState
canonicalGraphState (provisioning.ts:57)    ✔ maps events + explanations
intelligenceGraphAdapters.ts:578            ✔ ingestEvents() implemented and ready
useIntelligenceGraph.ts:66                  ✘ destructures 8 keys — events/explanations NOT among them
useIntelligenceGraph.ts:76                  ✘ rebuilds provisionGraphState() without them
```

`UseIntelligenceGraphInput` (line 33) has no `events` or `explanations` field, so the OP4.1 event
layer is dropped on the floor for every surface. `ingestEvents` has never run in production.

**Same file, same shape, second instance:** `privateSignals` *is* declared on
`UseIntelligenceGraphInput` and on `CanonicalIntelligenceInputs`, and `ingestPrivateMarkets` exists —
but `useArgusIntelligence` never supplies it. The only caller is
`lib/intelligenceGraphDebug.ts:103`. **Private Markets data has never entered the shared graph**,
which is precisely why `/ma`, `/industries/[slug]`, and `/private-markets` all render *"No recorded
relationships … in the shared graph yet"*.

This is a two-line fix and probably the highest value-per-line item in the audit.

Related dead paths found while tracing:
- `lib/intelligenceOrchestrator.ts` — no production caller. Dead.
- `lib/dataAdapters/*` (FMP, FRED, SEC) — gated behind `ARGUS_ENABLE_PROVIDER_INGESTION`, and no cron,
  route, or start command ever invokes `runProviderIngestion` (checked `railway.toml`, `nixpacks.toml`,
  `package.json`). The whole adapter layer is unreachable in production; `FMP_API_KEY` / `FRED_API_KEY`
  are read by nothing that runs.

## F. Three industries have no source coverage at all — Class 2

`compute_industry_activation()` on today's live feed:

```
Utilities               71  (33 stories)      Consumer                29  (21)
Semiconductors          67  (27)              Aerospace & Defense     17  ( 5)
Financials              64  (20)              Healthcare               0  ( 0)   ←
Software                62  (22)              Crypto & Digital Assets  0  ( 0)   ←
Energy                  47  (30)              Media & Telecom          0  ( 0)   ←
Real Estate             44  (34)
Industrials             42  (22)
```

None of the 30 registry sources covers healthcare/biotech, crypto, or media/telecom. The three dead
cards then hit the fallback chain at `components/industries/IndustryCard.tsx:58`:

```ts
const displayText = industrySignal?.narrative || topTheme || themeSignal?.narrative
                  || industry.macroDrivers[0];        // ← hardcoded string
const displayChips = … : industry.keyAssets.slice(0, 5);   // ← hardcoded tickers
```

So the card presents `"AI Capex"` (or the industry's first static macro driver) and five static
ticker chips in the same slot the live narrative occupies. The `"No data"` counter beside it is
honest; the narrative text is not labeled. Class 5 for the presentation, Class 2 for the root cause.

**Fix shape:** add three sources (e.g. STAT/Endpoints, The Block/CoinDesk, Hollywood Reporter/Variety
Business or Light Reading), and make the static fallback visually distinct from a derived narrative.

---

## Secondary findings

**Nikkei Asia ships no dates — Class 2, amplified by Class 4.**
Nikkei serves RSS 1.0 (RDF) with no `dc:date` on any item. Measured: **12 of 12 items with
`published_dt = None`.** Consequences: `format_age(None)` renders the string **`"Recent"`** on the
card (a fabricated relative age), `published_ts` serializes null, `feeds.py:1695` sorts them to the
epoch (dead last), `feeds.py:1360` awards 0/20 recency points, and `feeds.py:1700` **excludes them
entirely** in any `fresh_only` request. A Tier-1 Asia desk is effectively invisible. Either parse the
RDF `<items>` ordering as a proxy rank, or drop the source.

**Two dead/decayed news sources.**
- *The Information* — HTTP 403 under every UA (paywalled feed); surfaces as
  `"Malformed feed (not well-formed)"` in `fetch_errors`.
- *SemiAnalysis* — feed is alive but its **newest post is 330 days old** (Sep 2025). It contributes 3
  items per cycle that carry zero recency score and are 11 months stale.

Both fail **silently**: `app/feeds.py:1905` logs source failures at `log.debug`, so in production
(INFO) a dead source is invisible. Promote to `log.warning`.

**Two independent market-data planes disagree on the same page — architectural.**
- `/api/market-data` — Yahoo intraday, 9 macro tickers → Live status strip, regime gradients,
  `useMarketState`, Private Markets capital flow.
- `/api/reference/prices` — EODHD **end-of-day** → MarketPulse tape, Markets rotation map, industry
  tape, company/event pages.

The Live hero can read `RISK ON` from today's intraday SPY while the Pulse tape immediately below
shows yesterday's close. Both are labeled correctly in isolation; they are not reconciled.

Also: every non-Yahoo fallback in `/api/market-data` (Stooq, Treasury, CoinGecko, Binance) returns
`history: []`, so a fallback-served ticker silently loses its sparkline.

**EODHD is entitled for exactly one domain.** `lib/platform/config.ts:20` —
`EODHD_ENTITLED_DOMAINS = ["historical_prices"]`. Fundamentals, news, movers, calendar, insider,
etf_holdings, macro all return `skipped` → honest absence, never called. Any surface expecting
fundamentals gets nothing, permanently, until the plan is upgraded. Class 1 (correctly gated) but
worth stating as a hard product ceiling.

**Symbol-mapping misses in the industry tape (Class 3).** `IndustryTape` fetches
`keyAssets.slice(0, 12)` and honestly omits what fails, so these vanish without a trace:
`HEICO` (should be `HEI`), `BTC` and `ETH` (need `BTC-USD.CC`, not `.US`), `SQ` (renamed `XYZ`).
Crypto & Digital Assets loses its two headline symbols; A&D loses one.

**Three explanation sections are permanently gated (Class 1).** `app/explanations.py:528` — `memory`,
`stakes`, and `falsifiers` are hardcoded `_gated()` pending IRE-4. Honest, but 3 of 8 sections of the
reasoning contract are unshipped.

**Homepage causal read has a template fallback (Class 4).** `lib/homeBriefing.ts:138` — when a theme
has neither `causal_narrative` nor `description`, the "why it's moving" line becomes
`` `${chain[0].label} is feeding through to ${subject}, which ${verb}.` `` — a synthesized causal
claim assembled from labels, which is the pattern the reasoning contract bans.

**Markets page is structurally sound.** The rotation map is genuinely price-derived, degrades per
block (`RotationMap.tsx:81` names the unavailable blocks), and `buildMarketView` returns an honest
`"Market data is unavailable right now."` below two usable blocks. The only defect found is a stale
header comment in `MarketPage.tsx:7` claiming a five-section grammar; four are rendered, which
matches `marketView.ts`. No data gap.

**Unreachable code path.** `middleware.ts:95` gates everything except `/auth`, `/privacy`, `/terms`.
The homepage's signed-out marketing hero, `BriefSignOutPrompt`, and the `guestMode` "Continue without
signing in" flow (`app/page.tsx:501–560`, `568–605`, `641–677`) can never render in production.

---

## Remediation log

### RC2-E — graph input layers (implemented)

`useIntelligenceGraph` now forwards `events` + `explanations`, so `ingestEvents` runs in
production for the first time. Measured on a live payload: **+41 nodes / +178 edges**, 39 Event
nodes carrying their canonical Explanation, 5 new Company nodes.

Two corrections to this document arising from that work:

- **`privateSignals` were never dropped by the hook.** They are destructured and forwarded
  correctly; the gap is that no producer supplies them, and no independent private-markets
  dataset exists (the only candidates are already ingested by `ingestMA`/`ingestThemes`).
  Feeding them would be duplicate ingestion. Needs a source decision, not a wiring fix.
- **Restoring events does not by itself change any surface.** `getNeighbors` excludes Event
  nodes unless `includeEventNodes` is passed, and no production consumer passes it. The event
  layer is present and correct but not yet read. Opting consumers in is a separate change.

### RC2-A — entity resolution (implemented)

Root cause was not a weak blocklist: the product had **two competing entity paths**. Market
Events already resolved companies through `app/companies.py` (registry, name-first, ambiguity
context); `_extract_entities` in `app/feeds.py` did not. Ingestion now uses that one authority,
non-company tokens are typed rather than forced into the company channel, unknown tokens are
dropped, and the acronym blocklist is deleted. Long-tail issuers resolve only on explicit intent
(`Name (TICKER)` or `$TICKER`) validated against an SEC issuer snapshot.

Measured before → after on one live corpus: entity precision **38% → 100%**, false positives
**25 → 0**, resolved companies **15 → 24**, 51 non-company mentions preserved with a correct kind.
Company nodes in the graph 72 → 67 (removed: `CPI`, `FERC`, `LBNL`, `LA`, `FD`, `FC`, `ATG`,
`JLL`, `RJR`). Adaptive hero moved from an ETF proxy (`TIP`, representative) to a real security
(`BA`, chart-dominant). Event nodes unchanged at 41.

Three claims in this document were **wrong** and are corrected here:

- Event→Company edges were never polluted — events already used the resolver.
- The adaptive hero was never charting `ERCOT`/`PJM` — it reads registry-resolved event companies.
- The Feed Landscape was not minting `PJM`/`FOMC` protagonists, for the same reason.

The pollution was confined to `affected_entities` → `sectors.py`, `theme_graph.py`,
`clustering.py`, and frontend `ingestStories` (which called `addCompany()` unconditionally).

### Open follow-up: instrument typing in curated theme assets (NOT part of RC2-A)

`TNX` and `TLT` still surface as Feed-Landscape "company" protagonists, and `TNX` can be picked
as an adaptive-hero company instrument. These are an **index** (10Y yield) and an **ETF**, not
issuers — neither is in the SEC issuer set.

They do not come from the extraction path RC2-A fixed. They enter through
`ThemeIntelligence.related_assets` in the curated theme ontology, which `app/events.py:620`
admits into `MarketEvent.companies` via `looks_like_ticker()` — a deliberate shape-only check on
a curated source that is "not re-litigated". Downstream, `marketLandscape.ts:110` and
`adaptiveHero.ts:55` treat every ticker-shaped entry in `companies` as a company.

Fix shape (deferred): give theme-ontology assets a kind (equity / etf / index / commodity) so
non-equity instruments are carried in their own channel rather than in `companies`. Touches the
theme ontology and event composition, so it is a scoped change of its own — it should not ride
along with an ingestion fix. `KIND_INSTRUMENT` already exists in `app/companies.py` and types
`TNX`/`TLT`/`VIX`/`DXY` correctly, so the vocabulary is in place.

### RC2-B1 — AI enrichment allocation and budget efficiency (implemented)

Addresses finding **B**. `app/summarizer.py`, `app/background.py`.

**Diagnosed baseline.** `summarize_items()` took `items[:15]` — the first 15 *positions* in feed
order. Across cycles M&A oscillated around 0–1 enriched items despite eligible high-scoring deals
sitting in the pool.

**Root cause.** Not global signal rank, as finding B states above: the feed's leading sort term is
the **publication-hour bucket**. Publication time, not quality, determined access to the global AI
budget, so slower-cadence desks were starved by construction. On the measured pool 8 of 13 M&A
items outscored the weakest item the positional window actually selected.

**Changed.**

- `MAX_AI_ITEMS = 15` (value unchanged) now means **15 uncached items eligible for new enrichment
  calls per cycle**, not 15 feed positions. Cache lookup precedes slot consumption; the selector
  continues through the pool until 15 uncached items are found or candidates are exhausted.
- **Cache restoration now covers the full candidate pool.** Previously it ran only over the first
  15 positions, so an item silently *lost* its enrichment once it slid past position 15 — a second
  defect not identified at diagnosis time.
- **Category floors**, centralized in `CATEGORY_FLOORS`: M&A 4 · Company 3 · Markets 4 ·
  Geopolitical 2, remainder via globally ranked overflow. A floor is a maximum reserved
  opportunity, never a quota: a category with fewer candidates than its floor claims fewer and the
  unused capacity returns to overflow in the same pass. No content is weakened or fabricated to
  fill a floor.
- **Floor and overflow authority is the existing composite**
  `institutional_score * 0.45 + signal_score * 0.55` — the same expression `app/feeds.py` already
  uses as the quality term of its sort. No second scoring model and no new editorial classifier
  were introduced. Ties break on `url` then `title`, so selection is deterministic.
- **Feed ordering itself is unchanged.** Only enrichment selection stops reading the hour bucket.
- **Failed or malformed enrichments are no longer cached as successful emptiness.** Transport
  failure, timeout, unparseable payload and missing `ITEM` block all leave the item uncached and
  retryable. An item is cached only when it satisfies the output contract (non-empty `summary`
  **and** non-empty `why_it_matters`). The display fallback `summary = snippet` never counts as
  enrichment, and no fallback `why_it_matters` is ever generated.
- **Partial batch success preserves valid sibling results** — one malformed item no longer costs
  its batch-mates their enrichment.
- Items sharing a cache key now collapse to one unit of work. Measured occurrence on the live
  pool: **0 of 73** — upstream dedup already removes them, so this is a safety net, not a saving.
- `_BATCH_SIZE` **remains 3**. Parser correctness at 8 is proven by test (out-of-order blocks,
  truncation) and output fits `llm_max_tokens = 2048`, but model-side block fidelity at 8 cannot be
  established without a live run, and the undetectable failure mode is misnumbering — one item's
  analysis attributed to another. Held pending real model-fidelity measurement; the saving is
  ~1,500 input tokens per full cycle.

**Live-shaped before → after** (190 raw → 73 after the Markets soft cap; selection computed on real
fetched items and scores, no LLM calls):

```
                selected / eligible
M&A             0/13  (0%)   →  4/13  (31%)
Company         1/11  (9%)   →  3/11  (27%)
Geopolitical    1/20  (5%)   →  2/20  (10%)
Markets        13/29 (45%)   →  6/29  (21%)

mean selected composite   84.3 → 90.1
weakest selected          76.4 → 84.1
unselected items outscoring the weakest pick   21 → 3
```

Selection quality rose rather than falling: the positional window was spending slots on the weaker
half of one category while stronger items in three others went unenriched.

**Validation.** 43 new tests in `tests/test_enrichment_allocation.py`; 30 of them fail against
pre-fix code. Full backend suite **1243 passed**. Six `SummarizeResult` test doubles in the
materiality suites gained the two new fields (`enriched`, `by_category`); no materiality behaviour
was touched.

**Production validation.** Deployed as `60e2cad`; both Railway services reported a successful
deploy and returned steady-state healthy responses across the rollout window. Observed from
production logs:

```
cycle 1 (cold cache)  selected=15  enriched=15  cached=0   skipped=47
                      alloc={'Company': 3, 'Geopolitical': 3, 'M&A': 4, 'Markets': 5}
later cycles          selected=15  enriched=15  cached=12
                      selected=15  enriched=15  cached=30
                      selected=10  enriched=10  cached=35
                      selected=10  enriched=10  cached=55
                      selected=0   enriched=0   cached=47
```

What these cycles prove:

- **M&A received its 4 floor slots on the first full cycle**, against a diagnosed baseline of 0–1.
  The remaining two slots after the 13 floor claims went to overflow (Geopolitical and Markets each
  +1), which is the documented floor-plus-ranked-overflow behaviour.
- **Cached items were restored without consuming new-call capacity.** The terminal
  `selected=0 / enriched=0 / cached=47` cycle is direct evidence: a fully-cached pool of 47 items
  issued zero enrichment calls rather than spending the budget on cache hits.
- **Allocation shifted across later cycles as categories exhausted their uncached eligible
  candidates**, and `selected` fell to 10 and then 0 as the pool warmed — expected under floor +
  overflow semantics, where a floor is an opportunity and not a quota.

What these cycles do **not** prove:

- **`selected > enriched` never occurred**, so no enrichment failure was exercised in production.
  The failure and retry semantics — failed/malformed results not cached as successful emptiness,
  partial batch success preserving valid siblings — remain **regression-tested only**; they were
  not observed live. That path stays unverified in production until a real failure occurs.
- `_BATCH_SIZE` remains 3. These cycles say nothing about model block fidelity at 8, and no
  constant, floor, ranking rule or cache behaviour was tuned on the basis of this sample.

RC2-B1 is **closed**.

### RC2-D1 — Listen source-registry health and observability (implemented)

Addresses the first half of finding **D**. `api/podcast_feeds.py` only.

**Diagnosed baseline** (live probe, production UA, `scripts/probe_podcast_registry.py`):

```
registry=27  healthy=12  stale=4  dead=11  episodes<=14d=116
dead: Odd Lots · Masters in Business · Macro Voices · All-In · Business Breakdowns
      Capital Allocators · The Compound and Friends · Animal Spirits · 20VC
      My First Million · Bankless          (all HTTP 404)
```

**Root cause.** Podcast host/slug migration — Megaphone slugs retired, shows moved to
Libsyn/Omny/Podbean/Flightcast. Nothing detected it: `_fetch_one` logged feed failures at
`log.debug` while production runs at INFO, so 11 of 27 registered shows had been 404ing
invisibly. A dead source was indistinguishable from a quiet one.

**Method.** Every dead or stale entry was audited individually against the publisher-submitted
`feedUrl` in the Apple Podcasts directory, then each candidate was fetched and its feed title,
author, link and recent episode titles verified by hand. No entry was retired on age or on a
single 404; retirement required positive evidence of discontinuation. No show was replaced with a
lower-quality substitute to improve a coverage metric.

**Repaired — 11 URLs, all confirmed authoritative and current:**

| Show | New host | Verified |
|---|---|---|
| Odd Lots | Omny (new playlist id) | Bloomberg · 1257 eps · newest 2d |
| Masters in Business | Omny | Bloomberg · 798 eps · newest 1d |
| Macro Voices | Podbean | Erik Townsend · newest 2d (`#545`) |
| All-In | Libsyn | All-In Podcast LLC · newest 1d |
| Capital Allocators | Libsyn | Ted Seides · 815 eps · newest 6d |
| The Compound and Friends | Megaphone `TCP4771071679` | Josh Brown · 597 eps · newest 2d |
| Animal Spirits | Megaphone `TCP6464651487` | The Compound · 810 eps · newest 4d |
| 20VC | Libsyn | Harry Stebbings · 1496 eps · newest 0d |
| My First Million | Megaphone `HS2300184645` | Hubspot · 891 eps · newest 2d |
| Bankless | Flightcast | banklesshq.com · 1359 eps · newest 2d |
| Business Breakdowns | Megaphone `breakdowns` | Colossus · 261 eps · newest 20d |

**Retired — 2 entries, on evidence of discontinuation:**

- **Bloomberg Deal of the Week.** Last real episode is `Over and Out`, 2018-03-08; every later
  item is a Bloomberg cross-promo trailer. Apple's canonical `feedUrl` is byte-identical to the
  registry's, so this is a dead show, not a stale URL — and Bloomberg's other two shows are fresh.
- **Axios Pro Rata.** The `pro-rata` slug now serves *Axios Re:Cap*, itself 4.6 years stale; the
  next-newest Axios feed (`1 big thing`) is 1.9 years stale. Axios's podcast slate is
  discontinued and the only live "Axios" search hits are unrelated third parties.

**Retained despite sitting outside the 14d cap — each documented in-registry:**

- **The Big View** (19d) — URL verified working, left unchanged. A publishing gap is not evidence
  of a broken source.
- **Business Breakdowns** (20d) — URL repaired; cadence measured 20/78/93d. Active but irregular.
- **DealBook Summit** (250d) — all 35 episodes cluster 2025-12-04..12-08. An **annual event feed**
  on the publisher's canonical URL; it contributes each December. Honest, not broken.

**Observability.** `_fetch_one` now logs a source failure at **WARNING** — HTTP >= 400, an
unparseable payload, an empty feed, or a raised exception. A healthy feed whose episodes are all
older than the cap stays on the INFO line: contributing nothing on freshness grounds is an honest
outcome, not a failure. Batch resilience is unchanged — every path still returns `[]` for that one
source and never propagates.

**Measured result** (same probe, same UA, before → after):

```
registry          27  ->  25
healthy           12  ->  22
stale              4  ->   3
dead              11  ->   0
episodes <=14d   116  -> 162     (+40%)
```

22 contributing shows, against a target of >=20, using authoritative publisher feeds only.

**A gap this exposed — recorded, not fixed here.** Both retired shows were the registry's
`M&A`-tagged entries, so `M&A` topic coverage is now **2 shows** (`The Big View`, `DealBook
Summit`), neither of which is currently inside the freshness cap. This is not a regression: the
two retired feeds had published nothing in 4.6 and 5.4 years, so the registry was previously
*claiming* four M&A sources while two were long dead. D1 makes the real coverage visible.
`Private Markets` goes 4 -> 3 (`Invest Like the Best`, `Capital Allocators`, `20VC`) and is in
better shape than before, since two of those three were among the 404s. Adding M&A-focused audio
coverage is a source-selection decision, deliberately out of D1's scope.

**Validation.** 21 new offline tests in `tests/test_podcast_registry_integrity.py` (registry
shape, duplicate `rss_url`/`show_name`, required metadata, known-dead slugs absent, failure
visibility at WARNING, stale-but-working feeds *not* reported as failures, batch resilience). Feed
liveness is deliberately kept out of CI — it is a property of the outside world — and measured by
`scripts/probe_podcast_registry.py` instead. Full backend suite **1264 passed**.

**Out of scope and unchanged:** `entities` remains `[]` (D2); no publisher/guest-affiliation
filtering; no `conviction`/`delta` semantic change (D3); `_why_it_matters` untouched (D4, gated on
IRE-2); no graph, frontend, freshness-cap, `_final_score`, `is_briefing`, or ranking changes.

---

## Per-surface index

| Surface | Empty / static field | Class | Root cause |
|---|---|---|---|
| **Live** | `Spreads` signal value | 3 | no credit data; derived from equity score |
| | Adaptive hero chart absent | 3 | `companyInstrument` picks non-tickers (A) |
| | "why it's moving" template line | 4 | `homeBriefing.ts:138` fallback |
| | Pulse tape cells missing | 1 | honest per-symbol absence, correct |
| | intraday vs EOD disagreement | — | two unreconciled data planes |
| **Feed** | card `why` missing | 4 | `MAX_AI_ITEMS = 15` (B) |
| | Landscape nodes `PJM`/`FOMC`/`CPI` | 3 | entity regex (A) |
| | Landscape sparse | 3 | 36% entity coverage (A) |
| | Nikkei items show `"Recent"` | 2+4 | no dates in RDF payload |
| **Markets** | `unavailable` block list | 1 | honest per-block degradation |
| | "Market data is unavailable" | 1 | correct <2-block guard |
| **Industries** | Healthcare / Crypto / Media at 0 | 2 | no source coverage (F) |
| | static `macroDrivers[0]` narrative | 5 | unlabeled fallback (F) |
| | `primary_drivers = ['CBRS']` | 3 | entity regex (A) |
| | tape drops HEICO / BTC / ETH / SQ | 3 | symbol mapping |
| | "No recorded … in the shared graph" | 5 | events + privateSignals dropped (E) |
| **M&A** | 10 of 11 deals no summary / why | 4 | AI budget allocation (B) |
| | sponsor mis-detection | 4 | PE regex reads empty `summary` (B) |
| | "No recorded relationships" | 5 | graph provisioning gap (E) |
| | only 11 deals total | 1/2 | 5 M&A sources; genuine volume |
| **Private** | Credit / PE / VC layer prose | 4 | measures nothing (C) |
| | "N Recent Rounds" (Late VC) | 3 | PE headlines counted as VC rounds (C) |
| | "IPO window open and busy" | 4 | measures EDGAR page size (C) |
| | half of IPO filers `sector: null` | 4 | only first 15 SIC-enriched; partial SIC map |
| | "No shared Read thesis available" | 5 | privateSignals never provisioned (E) |
| **Listen** | 15 of 27 shows contribute nothing | 2 | dead URLs / years-stale feeds (D) |
| | Q6 companies permanently empty | 4 | `entities: []` hardcoded (D) |
| | "conviction" figures | 4 | news-theme confidence relabeled (D) |
| | `why_it_matters` canned | 4 | legacy prose path (D) |
| | briefings have no audio | 1 | TTS unshipped |

## Recommended order

1. **E** — wire `events`/`explanations` and `privateSignals` through `useIntelligenceGraph`. Two
   lines; unblocks the "no recorded relationships" empty state across four surfaces.
2. **A** — replace the uppercase-token entity regex with a registry-backed resolver. Highest blast
   radius; fixes garbage nodes on the Feed centerpiece, the Live hero, and industry drivers at once.
3. **B** — per-category LLM budget. Makes `/ma` a real surface.
4. **D** — refresh the 15 broken podcast URLs; extract entities from episode text.
5. **C** — ground or demote the four unmeasured Capital Flow layers, and the Live `Spreads` signal.
6. **F** — three new sources; label the static industry fallback.
7. Secondary: Nikkei dates, drop/replace The Information + SemiAnalysis, promote source-failure logs
   to `warning`, fix `HEICO`/`BTC`/`ETH`/`SQ`.
