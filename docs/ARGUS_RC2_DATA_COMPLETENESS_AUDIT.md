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

### RC2-C1 — a real credit authority for Credit & Leverage (implemented)

Addresses the credit half of finding **C**. Also corrects this document's framing of that finding.

**Two corrections to the audit arising from the trace.**

1. The audit says the fabricated `Spreads` signal appears *"on the Live status row"*. It does not.
   `ms.signals` is consumed only by `MarketPressureMap`, `MorningBriefing` and `IntelligenceStrip`,
   and all three have **zero references outside their own files** (no barrel, no `dynamic()`
   import). `app/page.tsx` calls `useMarketState()` but reads only `riskRegime`/`volRegime`/
   `ratesRegime`. **The Spreads row rendered nowhere and misled nobody.**
2. The live instance of that same fabrication is the **Capital Flow Credit & Leverage layer**, which
   *is* rendered — on `/ma` and `/private-markets` — and which propagates further than the audit
   recorded. So C's "credit" defect and the "Spreads" defect are one defect, and the real one is
   the layer, not the row.

**Diagnosed baseline.** `creditLeverageLayer` read three inputs, none of them credit:

```
o.regime?.includes("hawkish")      regime string
o.tnxRate > 4.5                    Treasury yield, not a spread
o.riskRegime === "risk-off"/"on"   <- norm(avgEq, -3, 3) = mean %chg of SPY/QQQ/IWM
```

It was branded `sublabel: "HY / Leveraged Loans"` and emitted `indicator: "Spreads Widening"` /
`"Tight Spreads"`. A rally in equities produced a claim about high-yield credit. Downstream:

- `ma/page.tsx:1002` fed `{status, signal, detail}` into `explainMAActivity()`, so the reasoning
  layer consumed the fabrication;
- `themeIntelligence.ts:401` published the sentence **"Compressed credit spreads are enabling
  leveraged financing at competitive rates."** to users on `/ma`;
- `ma/page.tsx:1048` derived `DealContext.creditOpen`, which rides every per-deal read in
  `lib/maIntel`;
- the same fabricated sentence also existed as the layer's own `detail` in `capitalFlow.ts:114`,
  so fixing one site would have left the claim in production.

**New data path.** `frontend/src/lib/creditSpread.ts` is the sole credit authority, reading FRED
`BAMLH0A0HYM2` — the ICE BofA US High Yield **Option-Adjusted Spread**. Because the source *is* an
option-adjusted spread, the product may honestly use the word "spread"; that permission does not
extend to any proxy. `/api/credit-spread` is a **separate route** from `/api/market-data` on
purpose: that one is the intraday plane, this series is daily/T+1, and keeping them apart is what
prevents a T+1 spread from being rendered beside live quotes as if it were live. The endpoint is
keyless, so none of the dormant provider-adapter machinery is activated.

*Rejected alternatives, on measurement not intuition.* HYG/LQD and HYG/IEF were retrieved and
evaluated. Both measure relative **total return** of two ETFs, not spread: they are badly
duration-confounded (LQD is far longer duration than HYG), carry flow and premium/discount noise,
and yield no basis-point quantity. Their only advantage is intraday availability. Since the real
OAS series is reachable for the same effort, using a proxy *and* keeping the "spread" label would
have replaced one fabrication with a better-dressed one.

**Locked parameters, both derived from the series itself:**

- **Stale tolerance: 5 business days.** Counted in business days, never calendar days — that is
  what makes weekends and holidays structurally incapable of producing a false failure (a Friday
  print read on Monday is 3 calendar days but 1 business day, the normal T+1 lag). Measured gap
  structure over 793 observations: 1d x623, 2d x16, 3d x143 (weekends), 4d x2 (stacked holidays).
- **Direction threshold: +/-3bp vs the prior valid observation.** Measured |daily change| over 784
  transitions: median 3.0bp, p75 6bp, p90 10bp, max 59bp. A move smaller than the series' own
  median daily move is not directional. 5bp would call 70% of days stable and mask real moves;
  1-2bp would flip direction on noise. One threshold, one measured statistic — not a scoring model
  and not an opaque "credit score".
- Holiday rows print as `.` and are **skipped as missing observations**. Parsing one as `0` would
  invent a 267bp single-day collapse, so the guard is explicit and tested.
- Percent-to-basis-point conversion happens in exactly one function, `ppToBp`.

**Credit & Leverage output, before -> after** (live probe, 2026-08-17):

```
BEFORE  riskRegime "risk-on"  -> status expanding, "Tight Spreads",
                                 "Compressed credit spreads enable leveraged financing..."
        riskRegime "risk-off" -> status contracting, "Risk Premium Elevated"
        (no credit data involved in either)

AFTER   measured 267bp as of 2026-08-14, prior 271bp (2026-08-13), -4bp
        -> status expanding, indicator "267bp tightening",
           "US high-yield option-adjusted spread 267bp (-4bp vs 2026-08-13), as of 2026-08-14."
        equity regime flipped risk-on <-> risk-off: output IDENTICAL (pinned by test)
```

**Failure semantics.** Unavailable, unparseable, or stale beyond tolerance -> the layer reports the
new `unmeasured` status, indicator `"Not measured"`, and a detail that states the absence and stops.
`creditOpen` becomes `undefined` (not `false` — "closed" would itself be a claim), so per-deal reads
treat the financing window as unknown. `explainMAActivity` emits **no** credit sentence at all, and
its fallback summary drops the credit clause rather than rendering "unavailable credit conditions".
No real spread input -> no spread claim, anywhere. There is no equity, rate, regime or proxy branch
left in the credit path.

**Dead code — recorded, not wired in.** `MarketPressureMap`, `MorningBriefing` and
`IntelligenceStrip` remain orphaned (0 external references) and are **left in place**; deleting
three whole unshipped components is outside this slice. What *was* removed is the fabricated
`Spreads` row itself, from both `useMarketState.deriveSignals` (a live hook, where it was a landmine
for the next consumer) and `MarketPressureMap.deriveCrossAsset` (which derived a credit claim from
substring matches on a regime string, precisely when market data was unavailable). The other rows —
Yields, Dollar, Gold, Oil, VIX — are real and untouched.

**Validation.** 47 new tests in `frontend/src/lib/__tests__/creditSpread.test.ts`: parser (holiday
`.` rows, empty/NA, truncated payload, HTML error page, out-of-range, ordering), pp->bp conversion,
business-day staleness including the weekend and holiday-weekend cases, the direction rule at its
exact boundaries, prior-valid-observation selection across a holiday, every unmeasured reason, the
no-equity-fallback invariant (equity regime flipped both with and without measured credit — output
identical), no proxy language anywhere in the layer, and downstream prose gating. Frontend suite
**728 passed / 60 files**, typecheck clean, production build clean with `/api/credit-spread`
emitted. Backend suite **1264 passed** (untouched by this slice). Live probe
`scripts/probe_credit_spread.py` — network liveness stays out of CI, same policy as the D1 registry
probe.

**Out of scope and unchanged:** PE, Late VC and Early VC layers still lack real data and remain
fabricated — they are C2 and were deliberately not filled heuristically. `riskScore`/regime logic,
other cross-asset rows, the IPO layer, D2, and F are untouched.

### RC2-C2a — demote the three unsupported Capital Flow layers (implemented)

Second slice of finding **C**. `lib/capitalFlow.ts` plus the two call sites.

**What was rendered to users on `/private-markets` before this slice** (all eight layers render
there with status badge, indicator and detail; `/ma` renders none of them but consumes two):

| Layer | Claim | Actual input |
|---|---|---|
| PE / Buyout | "LP Capital Pause" / "Pipeline Active" / "LBO Math Stressed" | `tnxRate > 4.5`, `regime.includes("hawkish")`, total M&A headline count, `riskRegime` |
| Late-Stage VC | **"3 Recent Rounds"** (Series C-E) | `deals.filter(d => d.dealType === "sponsor").length` — PE buyout HEADLINES rendered as venture rounds |
| Early-Stage VC | "Seed markets frozen, generalist LPs have paused commitments" | `riskRegime` + `volRegime` + regime string |

Two details worth recording. The PE and Early-VC copy asserted **limited-partner behaviour** —
"reduces LP willingness to fund new commitments", "generalist LPs have paused commitments" — from
equity direction; Argus has no LP or fundraising data of any kind. And on `/ma` the VC input was
hardcoded `0`, so Late-Stage VC read **"Frozen — late-stage funding effectively closed"** from a
literal that was never a measurement, feeding the summary and pressure score from that page.

**Change.** All three layers are now `unmeasured`, unconditionally, using the same absence model as
Credit & Leverage (RC2-C1): `status: "unmeasured"`, `indicator: "Not measured"`, `signal:
"Unavailable"`, and copy that names the missing source and stops
(`"No venture financing-round data source. This layer is not currently measured."`). They keep
their position in the chain so the coverage gap stays visible rather than being hidden.

`vcDealCount` is **removed** from `FlowOptions` and both call sites: it existed solely to feed the
fabricated layer and carried the wrong quantity, so it is gone rather than left dangling for a
future consumer to mistake for real data. The sponsor/strategic deal data it derived from is
untouched and still used elsewhere on `/private-markets`.

**Aggregate correctness.** `flowPressure` already excluded unmeasured layers from numerator and
denominator (RC2-C1). `buildSummary` did not, and now
does: it counts only measured layers, and its thresholds are the ORIGINAL constants expressed as
proportions of the measured set — `ceil(m/2)` for closed and tight, `ceil(m*5/8)` and `ceil(m*3/8)`
for open. At eight measured layers this is byte-identical to the previous behaviour
(`ceil(8/2)=4`, `ceil(8*5/8)=5`, `ceil(8*3/8)=3`). No new scoring model.

Below a **majority of the chain**, `buildSummary` refuses to characterise the stack at all and
returns an explicit coverage statement. A sentence beginning "Capital flowing freely across the
funding stack" is not defensible when most of that stack is unmeasured. One copy fix came with
this: the "flowing freely" branch previously ended *"...from M&A through early-stage VC"*, naming a
layer that is now unmeasured.

**Measured before → after** (identical inputs; `riskRegime: risk-on`, `maDealCount: 7`,
`ipoFilerCount: 10`, credit measured at 267bp):

```
/private-markets                     BEFORE                          AFTER
  PE / Buyout          expanding   "Pipeline Active"        unmeasured  "Not measured"
  Late-Stage VC        neutral     "3 Recent Rounds"        unmeasured  "Not measured"
  Early-Stage VC       expanding   "Risk-On"                unmeasured  "Not measured"
  measured layers      8/8                                  5/8
  summary              "Capital flowing freely across       "Capital flowing freely across the
                        the funding stack ... from M&A       measured layers of the funding
                        through early-stage VC."             stack, neutral conditions
                                                             enabling deal activity."
  flowPressure         79 FLOWING                           83 FLOWING
                       (8 layers, 4 fabricated)             (5 measured layers only)

/ma (vc/ipo inputs were hardcoded 0)
  Late-Stage VC        contracting "Frozen"                 unmeasured  "Not measured"
  flowPressure         67 FLOWING                           70 FLOWING
```

The pressure score moves because the fabricated layers no longer contribute, not because the rule
changed — it is now an average over five real readings instead of eight, four of which were
invented. `/ma`'s M&A reasoning is unaffected: `explainMAActivity` and `DealContext.creditOpen`
read only `layers[2]` (Credit) and `layers[3]` (M&A Activity), neither of which this slice touches.

**Aggregate consistency — the sufficiency contract is now shared.** Review caught that the two
aggregates could disagree: when credit is *also* unmeasured (4 of 8, e.g. a FRED outage),
`buildSummary` returned the insufficient-coverage statement while `flowPressure` beside it still
rendered **"83 · FLOWING · Liquidity Expanding"**. `flowPressure` was not laundering an absence —
its score genuinely derived from the four measured layers only — but a meter asserting a verdict
directly beneath a sentence declining to make one is its own integrity defect.

The rule is therefore defined **once**, as `measuredCoverage(layers)` exported from
`capitalFlow.ts`, and consumed by both aggregates so they cannot drift apart again. Below a
majority, `flowPressure` returns `sufficient: false` with `label: "NOT MEASURED"`,
`trendLabel: "Coverage insufficient"` and `liquidity: "N of M layers measured"` — no
FLOWING/CONSTRAINED, no liquidity direction, no improving/deteriorating arrow. The measured-layer
score is still computed and preserved on `p.score` (it is a true reading of what was measured), but
`CapitalPressureBar` suppresses the bar fill, the numeric score and the trend arrow when
`sufficient` is false, because rendering them would read as a verdict. **The score formula is
unchanged for sufficiently covered cases.**

The pre-commit scope check then found a **third** aggregate over the same layers that no one had
audited: the regime chip on `/private-markets` rendered **"Capital Flowing" / "Capital Constrained"
/ "Mixed Transmission"** from absolute thresholds (`openLayers >= 4`) with the caption
`"{openLayers} of 8 layers open"`. Both assumed all eight layers were measurable, so at 4-of-8
coverage it could still have announced "Capital Flowing" beside two aggregates declining to
characterise anything. It now reads the same `measuredCoverage` contract, uses the same
proportional majority (`ceil(measured / 2)` — which is 4 at eight measured layers, identical to the
old hardcoded threshold), renders **"Not measured"** below majority coverage, and reports
`"N of M measured layers open"` instead of a hardcoded "of 8".

One nuance worth recording: `measuredCoverage` judges the layer set it is *given*. Production
callers pass the whole chain; a pre-filtered set asks a different question and correctly gets a
different coverage answer. The scoring is identical either way.

Measured at each coverage tier:

```
8/8 measured   score 79  FLOWING            Improving  · Liquidity Expanding   (formula unchanged)
5/8 measured   score 83  FLOWING            Improving  · Liquidity Expanding   (measured-only)
4/8 measured   score 83  NOT MEASURED       Coverage insufficient · 4 of 8 layers measured
0/8 measured   score 50  NOT MEASURED       Coverage insufficient · 0 of 8 layers measured
```

**Validation.** 39 new tests in `frontend/src/lib/__tests__/capitalFlowUnmeasured.test.ts`: each
layer unmeasured across every proxy permutation (regime, rates, vol, deal count, credit state),
byte-identical output under opposite proxy inputs, no banned phrase emitted anywhere
("LP Capital Pause", "Recent Rounds", "Seed ... frozen", "Pipeline Active", "LBO Math", "Frozen",
"dry powder", …), chain order preserved, `flowPressure` identical with and without the unmeasured
layers present, no divide-by-zero when nothing is measured, summary never naming an unmeasured
layer, the insufficient state making no directional claim, and the untouched neighbours (C1 credit,
M&A Activity, IPO Window, Monetary Policy, Public Equities) pinned unchanged.

A further 30 tests pin the aggregate-consistency contract: 8/8 reproducing the pre-C2a score
exactly, 5/8 deterministic and measured-only, 4/8 emitting no directional label, 0 measured and an
empty chain both explicit and crash-free, padding a chain with unmeasured layers leaving the score
untouched, and summary/pressure agreeing at both 5/8 and 4/8 — including the specific production
pair that previously contradicted itself.

The **sufficiency boundary is pinned explicitly**: exactly half is INSUFFICIENT (4/8, 2/4, 1/2,
3/6, 5/10) and a strict majority is sufficient (5/8, 3/4, 2/3, 4/6, 6/10), with odd totals checked
on both sides (3/7 false, 4/7 true). The regime chip has its own tests covering the 8-measured
threshold equivalence, the no-verdict-below-majority rule, and the 4-open-of-4-measured case that
must not read "Capital Flowing".

C1's 53 tests pass unmodified. Frontend suite **803 passed / 61 files**, tsc clean, lint clean in
changed files, production build clean. Backend **1264 passed** (no backend file changed).

**Out of scope and unchanged:** IPO Window and M&A Activity both contain real underlying
observations but overstate what those observations mean — they are **C2b**. No LP/fundraising
ingestion, no new provider, no synthesized private-market data, no new scoring model, no redesign.

### RC2-C2b — M&A Activity and IPO Filing Activity become observational (implemented)

Final slice of finding **C**. Both layers counted something real and then asserted something they
could not observe.

**Correction to this document.** Finding C states EDGAR `getcurrent` "carries ~20–40 entries at all
times regardless of market conditions" and that the IPO layer "measures EDGAR's page size". **That
is wrong and is retracted.** Measured across three fetches: 10, then 13 entries, over a genuinely
rolling window. It is a real, varying quantity. The actual defect is different — see below.

**Measured baselines, 2026-08-18.**

*M&A:* 8 items classified `M&A` out of 59 post-cap feed items. **Zero duplicate transactions** in
that sample — upstream `_dedup_items` (title-Jaccard ≥ 0.50, source-tier survivor) already folds
repeated reporting, so the earlier presumption that duplicates inflate the count is **also
retracted**. The dominant defect is **category admission**: `_CAT_MA_RE` matches title *or snippet*,
so of the 8, at most 1–2 were announced transactions. The rest: an interview ("Alternative Views
with Schroders's Ethan Vogelhut", admitted on the word *buyout* in its snippet), a feature ("The CEO
trying to outsmart buyout firms"), market commentary, a 13F stake purchase, litigation news about an
existing deal, and an 8-K whose "definitive agreement" could be any material contract. The count
also has **no time window** — both warm targets run `fresh_only=False`, and that sample spanned
11.3h to 101.4h.

*IPO:* 13 raw entries — **10 S-1/A amendments, 3 new S-1 registrations**, 13 distinct CIKs, spanning
three business days (2026-08-14, 08-17, 08-18). The parser regex `S-1(?:\/A)?` admitted amendments
and there was no CIK dedup, so the raw count overstated new registrations by **4.3×** and it was
amendment traffic that fired the `n >= 8` "IPO window open and busy" branch.

**The thresholds had no empirical authority.** M&A `>= 8 / >= 4 / >= 2` are counts of Argus's own
coverage — adding an RSS source raises "market activity", an outage lowers it. On the measured day
the count sat exactly on the `>= 8` "deal flow elevated" boundary, crossable by one more feature
article. No directional threshold was substituted for either layer: a daily new-S-1 history would be
needed first, and no such series exists in the product (EDGAR full-index returned 403 from the test
environment under two SEC-compliant User-Agents; `browse-edgar` works, the bulk archive does not).

**A third status was required.** Setting these layers to `neutral` would have been wrong: with 5
measured layers of which 2 are observational, `open >= ceil(5*5/8) = 4` is unreachable because only
3 layers can ever be open — a feed-coverage count quietly dampening every verdict. `FlowStatus` now
distinguishes three things:

```
neutral        measured, HAS directional authority, currently reading no direction
observational  measured, NO directional authority, ever
unmeasured     no data at all
```

`measuredCoverage` counts observational layers (we did observe something). The new
`directionalLayers()` excludes them from every directional aggregate — `flowPressure`'s score,
`buildSummary`'s thresholds, and the regime chip's majority — **numerator and denominator alike**.

**Layer changes.**

- **M&A Activity** → `observational`, sublabel "Feed coverage", indicator
  `"8 M&A-related items tracked"`. The detail discloses that this is Argus feed coverage, can
  include rumours and commentary, is not market transaction volume, and has no fixed observation
  period. All three thresholds removed.
- **IPO Window → IPO Filing Activity** → `observational`, sublabel "New S-1 registrations",
  indicator `"3 new S-1s"`. The detail carries the raw entry count for diagnostics, states
  amendments are excluded, names the period the data actually covers, and says explicitly that it
  says nothing about IPO pricing, withdrawals or completion. **Both equity/VIX override branches are
  deleted** — Argus could previously declare the window "shut … companies filing S-1s are pausing or
  withdrawing" purely from VIX while S-1s were being filed.
- The route now captures `formType`; the page derives distinct-CIK new-S-1 registrations and the
  observed period. The full filer list (amendments included) is unchanged in the pipeline table.
- `/ma` previously passed a hardcoded `ipoFilerCount: 0`, which rendered as "No Recent S-1s /
  Frozen" — a claim manufactured from a literal. It now passes `null` and the layer reads
  `unmeasured`.

**Downstream reasoning.** Six claim sites in `explainMAActivity` were rewritten or removed: broad-
based deal appetite, dry-powder deployment into motivated sellers, corporate balance sheets funding
transactions, expected announcement flow, consolidation urgency from a regime label, and the
`"{N} deals active, {signal} environment"` fallback. What survives is the factual composition of
what Argus tracks (`"Of the 8 M&A-related items tracked: 3 strategic, 2 sponsor-related…"`), the C1
credit sentences (measured OAS, a different authority), and theme causal narratives. The now-dead
`maLayer` parameter was removed rather than silenced.

**Measured before → after** (live shape: 8 M&A items, 13 EDGAR entries / 3 new S-1, risk-on):

```
                     BEFORE                              AFTER
M&A Activity     accelerating "8 Recent Deals"    observational "8 M&A-related items tracked"
IPO Window       accelerating "13 Recent S-1s"    observational "3 new S-1s"   [IPO Filing Activity]
coverage         5/8                              5/8   (directional: 3)
pressure         77 FLOWING                       61 FLOWING
chip             "Capital Flowing"                "Mixed Transmission"
summary          "flowing freely…"                "mixed across the measured layers…"

invariance: maDealCount and newRegistrations swept 0 / 8 / 40 -> every aggregate byte-identical
```

**Validation.** 44 new tests in `capitalFlowObservational.test.ts`, including the 0↔40 sweep on both
counts, IPO output identical across every `riskRegime`/`volRegime`/`regime`, amendment exclusion and
CIK dedup, raw-vs-deduped pinning, banned-claim sweeps on both layers and on the M&A prose, and an
explicit regression that an observational layer contributes to coverage but carries zero directional
authority and does not sit in the directional denominator. C1 (53) and C2a (69) suites pass with only
call-signature updates. Frontend **847 passed / 62 files**, tsc clean, **lint 0 errors**, production
build clean. Backend **1264 passed** (no backend file changed).

**Observed, not changed:** `flowPressure` reports `61 FLOWING` while the summary and chip read
"mixed". Both are honest readings of the same three directional layers by different statistics — a
score threshold (≥60) versus count majorities — and the divergence predates C2b. Recorded rather
than tuned.

**Production validation.** Deployed as `47aa173`; both Railway services reported success —
frontend (`argus-ai`) at 2026-08-18T22:10:25Z, backend (`perceptive-achievement`) at 22:17:16Z,
combined state success. No health failure occurred during this rollout. Verified directly against
the live route (it sits outside the auth middleware):

```
GET /api/ipo-pipeline           HTTP 200, stable across 5 consecutive samples
  entries returned      15
  formType on every row  true      <- the C2b route change is live
  S-1/A amendments      11
  new S-1 registrations  4
  deduped new-S-1 CIKs   4         <- what IPO Filing Activity renders
  observed period       2026-08-14 to 2026-08-18
```

The production payload matches an independent EDGAR fetch from the development environment exactly
(15 / 11 / 4 / 4, same period), so amendment exclusion and CIK dedup are confirmed against real
data: the layer renders **"4 new S-1s"**, not 15. With the S-1 observation present, measured
coverage is **5/8** and both observational layers are measured-but-non-directional as designed.
`/api/credit-spread` still returns a measured OAS (270bp as of 2026-08-17, widening, 1 business day
stale), so the C1 authority is unaffected.

**Not directly verified:** `/private-markets` and `/ma` are auth-gated (307 → `/auth`), so the
rendered Capital Flow chain — the two observational layers, C2a's three unmeasured layers, the
coverage figure and the regime chip — was not observed. Count-invariance in production likewise
rests on the test suite, not on a rendered check.

**A transient failure worth recording, and a correction.** Immediately before the deploy the
production IPO route returned **HTTP 502 with `[]`**. It recovered on its own and has been stable
since. The initial inference — that main's non-canonical SEC User-Agent
(`Argus Intelligence research@argusintel.com`) was causing SEC to block the request — is
**not supported**: the same UA is now retrieving EDGAR successfully in production. The UA
discrepancy is real (the standardisation commit `a3ed650` exists only on the unmerged
`homepage-product-correction` branch) but it is not currently causing a failure, and the 502 is
better explained as transient SEC throttling.

The episode is still instructive, because it shows the C2b contract behaving correctly under a real
outage. During that window `filers` was `[]`, so `ipoObservation` was `null` and the layer read
"Not measured". Before C2b the same empty result rendered as **"No Recent S-1s · Frozen — No new
S-1 filings in pipeline, companies staying private longer or pursuing alternative exit
strategies"** — a confident market claim manufactured from a data outage.

### RC2-C3 — one canonical Capital Flow verdict (implemented)

Closes the aggregate inconsistency recorded at the end of C2b. Ownership model **B**: Capital Flow
has one directional authority and every surface projects from it.

**Diagnosed.** Three systems answered "what is the Capital Flow condition?" independently, in the
same vocabulary, inside the same block of `/private-markets` (lines 449 / 460 / 475):

| | numerator / denominator | `tightening` | rule |
|---|---|---|---|
| `flowPressure` | Σ `STATUS_VALUE` / `d × 3` | **−1** | mean magnitude, `≥60` FLOWING, `≤40` CONSTRAINED |
| `buildSummary` | counts / `d` | its own category | 5 prioritised branches (`≥d/2`, `≥5d/8`, `≥3d/8`) |
| regime chip | counts / `d` | **ignored entirely** | one majority (`≥⌈d/2⌉`) |

Enumerating the full reachable space — Monetary 3 × Equities 4 × Credit 3 = **36 states** — they
disagreed on direction in **18 of 36 (50%)**. Pairwise: pressure vs summary 13, pressure vs chip 15,
summary vs chip 8. The live `61 FLOWING` above `Mixed Transmission` was not a boundary case; it was
one of eighteen. Worst case: an all-tightening stack read **"Mixed Transmission"** on the chip,
because tightening cast no vote there.

**Two dead branches**, both created by C2a/C2b correctly shrinking the directional set from 8 to 3
while proportional thresholds survived:

- `buildSummary`'s "positive across upper layers" is unreachable at `d=3`, where
  `mostOpen = ⌈15/8⌉` and `someOpen = ⌈9/8⌉` are both 2.
- "Capital Constrained" / "severely impaired" are unreachable: only `publicEquitiesLayer` emits
  `contracting` and **no layer emits `blocked`** any more (the IPO layer did, until C2b), so
  `closed ≤ 1 < ⌈3/2⌉`. Argus could not say capital was constrained regardless of the market.

**Change.** `capitalFlowVerdict(layers)` in `capitalFlow.ts` is the sole directional authority.
The verdict is **breadth, not magnitude**: the `STATUS_VALUE` scale (+3/+2/0/−1/−2/−3) has no stated
authority and is asymmetric — there is no +1, so `tightening` is structurally underweighted against
its opposite. Majority is expressed as `n * 2 > d`, the identical form `measuredCoverage` uses, so
one breadth principle is stated the same way in both places rather than two near-identical rules
drifting apart.

Order of resolution: C2a coverage first → then breadth → then majority.

```
0 directional layers   -> insufficient (breadth)
1 directional layer    -> insufficient (breadth)   see note
>= 2 directional       -> majority open / tightening / closed, else mixed
```

The one-layer rule is the same breadth principle applied to the voting set, not a new calibration
threshold: with a single layer there is no consensus to read, and the "majority" would be that layer
restating itself as the condition of the whole funding stack. It is pinned explicitly in tests.
`neutral` is directional-capable but casts no vote — a measured reading of no direction dilutes a
majority without arguing for one. `observational` and `unmeasured` do not vote (C2b, unchanged).

**Consumers migrated.** `buildSummary` generates prose from the verdict plus measured facts and no
longer recomputes direction; both dead branches are gone. `flowPressure` keeps its numeric score as
a **magnitude readout only** — `STATUS_VALUE` and the score formula are untouched — and takes its
label, colour, liquidity wording and trend from the verdict. The regime chip is a direct projection.
No second FLOWING/MIXED/CONSTRAINED decision exists anywhere.

**Measured before → after**, live state `[monetary neutral, equities accelerating, credit tightening]`:

```
BEFORE   pressure  61 FLOWING · Liquidity Expanding
         chip      Mixed Transmission
         summary   "mixed across the measured layers…"
         -> three outputs, two verdicts, side by side

AFTER    verdict   mixed   (open 1, tightening 1, closed 0, neutral 1 of 3 directional)
         pressure  61 Mixed Transmission · Liquidity Mixed · Holding
         chip      Mixed Transmission
         summary   "Directional readings disagree across the measured layers…"
         -> the score is retained as magnitude; it no longer labels itself

all-tightening stack   BEFORE  chip "Mixed Transmission"
                       AFTER   verdict tightening · chip "Tightening" · pressure "Tightening" (33)

disagreements across the 36 reachable states:   18  ->  0
```

**Validation.** 68 new tests in `capitalFlowVerdict.test.ts`, including the exhaustive 36-state
enumeration reused from the diagnosis with a zero-disagreement acceptance test, the two named
regressions, every voting rule (majority open/tightening/closed, no-majority, neutral casting no
vote, observational and unmeasured not voting, strict `n*2 > d` majority), the sufficiency ladder
(coverage before breadth, 0 and 1 directional layers, 2 sufficient), end-to-end prose projection
through `computeCapitalFlow`, and pins that `STATUS_VALUE` and the score formula are unchanged. Two
C2a assertions that expected the old score-derived `"FLOWING"` were migrated to the canonical label;
no other prior test changed. Frontend **915 passed / 63 files**, tsc clean, **lint 0 errors**,
production build clean. Backend **1264 passed** (no backend file touched).

**Not changed by C3:** `STATUS_VALUE`, the score formula, the C1 ±3bp credit threshold and staleness
tolerance, the C2a coverage rule, C2b observational semantics. C3 is authority consolidation, not
calibration. `blocked` remains unreachable from production layers — whether any layer *should* be
able to signal a blocked market is a data question, deliberately left open.

**Production validation.** Deployed as `ecf7f82`; both Railway services reported success — frontend
(`argus-ai`) 2026-08-20T15:08:43Z, backend (`perceptive-achievement`) 15:12:20Z, combined state
success. **No transient failure occurred**: `/api/health`, `/api/credit-spread` and
`/api/ipo-pipeline` returned 200 on every sample across the rollout and on six consecutive
post-deploy samples. C3 touches no backend runtime file; the backend redeploy is incidental to the
shared repository.

The two upstream authorities were re-verified against live data:

```
C1  /api/credit-spread   measured=true  273bp  asOf 2026-08-19  prior 275bp
                         change -2bp -> "stable"   (inside the ±3bp band)
                         series BAMLH0A0HYM2, daily-t+1, 1 business day stale

C2b /api/ipo-pipeline    10 entries, formType on every row
                         8 amendments · 2 new S-1 · 2 deduped CIKs
                         period 2026-08-18 to 2026-08-19
                         -> renders "2 new S-1s", not 10
```

Both moved naturally since the C2b deployment (OAS 267 → 270 → 273; EDGAR 15/11/4/4 → 10/8/2/2),
which confirms they track real series rather than static values. Nothing was tuned in response.

Worth recording: the −2bp credit change reads `stable` rather than a direction, so the Credit &
Leverage layer is `neutral` today. The live directional set therefore differs from the state
captured during implementation — which is exactly what the canonical verdict is designed to absorb,
since it reads whatever the layers say rather than a remembered value.

**Not directly verified:** `/private-markets` and `/ma` remain auth-gated (307 → `/auth`). The
rendered agreement between the regime chip, the summary prose and the pressure bar was **not
observed in production**. It rests on the exhaustive 36-state test (0 disagreements), not on a
production render. Stated rather than inferred from the healthy endpoints.

---

### RC2-F1 — Industry card fallback honesty (implemented)

Addresses the **presentation half** of finding **F**. The coverage gap itself is untouched: no
Healthcare, Crypto or Media & Telecom source was added, and no scoring, inference or taxonomy
changed.

**Diagnosed.** Re-measured end-to-end on the live pipeline: Healthcare, Crypto & Digital Assets and
Media & Telecom score **0 with 0 stories** (Aerospace & Defense had recovered to 14/3, so the
zero-coverage set fluctuates between 3 and 4 of 12). `IndustryCard.tsx` fell through to static
`industryConfig` values in the slots a reader takes as measurement — and the leak was **wider than
finding F recorded**. Four slots, not two:

```
narrative slot   industry.macroDrivers[0]   "FDA Calendar" / "BTC ETF Flows" / "Ad Spend"
driver chips     industry.keyAssets[0..4]   JNJ · LLY · MRK · ABBV · UNH   (industry-coloured,
                                            identical styling to derived drivers)
footer           alignment ?? "neutral"     "→ Regime Neutral"      <- a synthesised CURRENT reading
sentiment badge  sentiment ?? "neutral"     "Neutral"               <- likewise
```

The first two are configuration wearing the costume of intelligence. The last two are worse: a
current regime and sentiment reading for an industry Argus has measured nothing about — rendered
beside a score of `-` and a caption of `No data`, so the card contradicted itself.

**Change.** `lib/industryCardView.ts` is the single place that decides derived-vs-static, following
the same shape as the other per-surface view models. With no coverage: `score: null` (renders `-`),
`sentiment: null` with an explicit **"Not measured"** state badge, `drivers: []`, an honest
intelligence line
(*"No current derived signal for this industry."*), footer *"Not measured"*, and the static config
moved into an explicitly labelled **Reference** block in secondary treatment. With coverage, every
existing behaviour is preserved byte-for-byte and no fallback label is added.

Static config, ticker lists, taxonomy and scoring are all preserved — only the framing changed.

**Measured before → after:**

```
Healthcare / Crypto & Digital Assets / Media & Telecom   (derived coverage: NONE)
  intel slot   "FDA Calendar" / "BTC ETF Flows" / "Ad Spend"
               -> "No current derived signal for this industry."
  chips        JNJ·LLY·MRK·ABBV·UNH  (styled as derived drivers)
               -> drivers: none;  [Reference] FDA Calendar | JNJ·LLY·MRK·ABBV·UNH
  footer       "→ Regime Neutral"  -> "Not measured"
  sentiment    "Neutral"           -> "Not measured" badge (dashed, muted)
  score        "-"                 -> "-"        caption "No data" -> "No data"   (already honest)

Aerospace & Defense  (positive control, derived coverage: sector)
  intel slot   "Defense budgets are repricing primes."   unchanged
  drivers      LMT · RTX · NOC                            unchanged
  footer       "↑ Regime Tailwind"                        unchanged
  sentiment    bullish                                    unchanged
  score        14, caption "3 stories"                    unchanged
  reference    none added
```

The badge states the absence rather than disappearing: a missing chip reads as an oversight,
whereas "Not measured" is the finding. It is styled as an absence (dashed, muted) so it can never be
mistaken for a neutral reading, and `stateBadge.measured` carries that distinction to the UI rather
than leaving it to styling.

**Validation.** 52 new tests in `industryCardView.test.ts`: all three zero-coverage industries
exercised individually, the reference block labelled and never leaking into the intelligence slot,
`score`/`sentiment` unavailable rather than zero/neutral, no momentum vocabulary without a
measurement, a zero-score sector or theme record still reading as unmeasured, derived content
winning from either authority, the recovered-industry positive control, and the view keeping an
identical structural shape between states. Frontend **967 passed / 64 files**, tsc clean, **lint 0
errors**, production build clean. No backend file changed.

**Out of scope and unchanged:** industry source coverage itself, D2 Listen entities,
`predictionEngine`/`inferenceEngine`, SEC User-Agent standardisation, blocked/constrained
reachability, and the Industries page layout.

**Production validation.** Deployed as `0f06182`; both Railway services reported success — frontend
(`argus-ai`) 2026-08-20T19:15:59Z, backend (`perceptive-achievement`) 19:21:56Z, combined state
success. F1 touches no backend runtime file. `/api/health` and `/api/credit-spread` returned 200
throughout.

One **transient** failure: `/api/ipo-pipeline` returned a single 502 at ~19:17Z and recovered on its
own — eight consecutive samples immediately after, and four more alongside the other endpoints,
all 200. EDGAR answers this environment normally. Same signature as the transient observed during
the C2b rollout, and unrelated to F1, which changes no data path. Recorded, not acted on.

**Not directly verified — the rendered result.** `/industries` is auth-gated (307 → `/auth`), like
`/private-markets` and `/ma`. The three zero-coverage cards were **not observed in production**, so
the claim that they no longer present "FDA Calendar" / "BTC ETF Flows" / "Ad Spend", the static
ticker sets, "Regime Neutral" or "Neutral" as current intelligence rests on the 52 view-model tests
and the before/after table computed from the real `industryConfig` values — not on a production
render. Stated rather than inferred from a healthy deploy.

---

### RC2-E1 — declared ontology is not evidence (implemented)

`ingestThemes` writes a curated theme's own ontology into the graph — `related_assets` →
`Theme --supports--> Company`, `related_industries` → `Theme --affects/correlates--> Industry`,
`related_macro_factors` → `Macro --drives--> Theme`. `evidenceEngine` then read those edges back as
support for the very thesis that declared them, and listed them in `sourceBreakdown` as independent
sources with reliability scores. **The claim was its own evidence.**

**Measured before.** A theme with zero stories: verdict `moderate`, trust **48**, three "supporting"
items, three "sources" (Macro 70 · Company 40 · Industry 40). On the live payload (12 themes, 63
clusters) it was worse for companies: **38 of 46 had no observed backing at all, yet 44 of 46
carried a forward view** — forecasts for TNX, TLT, JPM, XOM and 34 others built on nothing but a
theme listing them as a related asset.

**The discriminator is provenance, not vocabulary.** Each adapter stamps `originatingPages`:
`ingestThemes` → `"Theme Intelligence"`; `ingestStories` → `"Feed"`; `ingestListen` → `"Listen"`;
`ingestMA` → `"M&A"`. The same verb is legitimate when observed —

```
t --supports--> nvda           pages ["Theme Intelligence"]   declared  -> inadmissible
nvidia-beats --supports--> t   pages ["Feed"]                 observed  -> admissible
```

— so a relationship-verb blacklist would have destroyed both. An edge is inadmissible only when
**every** page that asserted it is the theme-ontology adapter; one observed page anywhere restores
it, because that means something was actually seen. `PAGE_THEMES` is now exported from the adapter
that stamps it, so there is one definition rather than a duplicated string.

Applied at the same single choke point as the G5 `belongs_to` exclusion (`admissibleAsEvidence`,
three filter sites). **The edges are not removed from the graph** — they remain ontology/exposure
structure for neighbours and transmission views and lose only evidentiary authority.

One further gap was required to make it hold. `predictCompanyTrajectory` guarded on `ev.found`,
which only means *the node exists in the graph* — it is true even when the verdict is
`insufficient_signal` with zero items. The theme path (`themeCore`) already refused on the verdict;
the company path did not, so company forecasts survived the evidence change. Company is now aligned
with theme. **No weight or threshold was altered.**

**Measured after, on the same live payload:**

```
themes      12 / 12 forecast   (unchanged — every live theme has 4-10 observed Feed edges)
companies   44 -> 6 forecast   (-86%, intentional)
survivors   APO, BAC, CEG, MSFT, NEE, NVDA   — exactly the observed-backed set
TNX/TLT/JPM/XOM   verdict insufficient_signal, trust 0, items 0, sources 0, forecast NONE
                  graph edges still present (ontology preserved)
theme verdicts    strong -> moderate, trust 80 -> 62 (ontology no longer inflates them);
                  4-5 real items and 3-5 real sources retained
```

The theme-side defect proved unreachable in production — `extract_themes` only emits themes with
contributing clusters — so the entire live impact is on companies.

**Consumer audit.** Forward views render at exactly two sites, both of which degrade honestly:
`SectorIntelligenceCard` falls back to *"No resolvable forward view for {sector} yet"*, and
`/ma:250` omits the line via `{e.forward && …}` while its sibling `conviction`/`verdict` fields are
already null-guarded. `entityContext` and `industriesIntel` pass `forward` through as
`?? null` with no secondary fallback. Drawer, Workstation and Industries consume the same profile.
`theRead` and `narrativeDerivation` are theme-driven and therefore unaffected — consistent with
themes showing no change.

**Validation.** 18 new tests in `ontologyNotEvidence.test.ts`: the zero-story theme (insufficient,
no items, no sourceBreakdown, zero trust, no forecast, profile refuses), the ontology-only company
(insufficient, no forecast, no inherited conviction), the identical verb surviving with Feed / Deal
/ Podcast provenance, a mixed-provenance edge staying admissible, and the graph remaining unmutated.
Two RC2-G5 tests encoded the premise E1 removes — they asserted evidence from theme-only ingestion —
and were migrated to test their original intent ("real evidence survives the exclusion") with
observed backing; the `belongs_to` exclusion itself is unchanged and still pinned. Frontend
**985 passed / 65 files**, tsc clean, **lint 0 errors**, production build clean. No backend file
changed.

**Production validation.** Deployed as `39db7e9`; both Railway services reported success — frontend
(`argus-ai`) 2026-08-22T21:06:50Z, backend (`perceptive-achievement`) 21:08:48Z, combined state
success. E1 touches no backend runtime file. No transient failure during the rollout;
`/api/health`, `/api/credit-spread` and `/api/ipo-pipeline` returned 200 throughout.

Re-measured against a **fresh** live payload (13 themes, 68 clusters) using the deployed logic:

```
themes      13 / 13 forecast          (unchanged — all have observed Feed edges)
companies    6 / 54 forecast          ontology-only: 42
survivors   APO, BAC, CEG, MSFT, NEE, NVDA
ontology edges still present in the graph: 60   (preserved, not deleted)

TNX  (ontology-only)  verdict insufficient_signal · items 0 · sources 0 · trust 0 · edges 1
BAC  (observed)       verdict moderate · items 1 · pages ["Feed"]
```

The reduction survives the deployed build on data that has moved since implementation (the pool
grew from 46 to 54 companies and the survivor set is unchanged), confirming the rule tracks
provenance rather than a fixed entity list.

**A live C1 observation worth recording.** `/api/credit-spread` is currently returning
`{"measured": false, "reason": "unavailable"}` — **sustained across six consecutive samples**, not
transient — while the FRED series is perfectly reachable from the development environment (275bp as
of 2026-08-20, +2bp, `stable`). Production cannot presently reach FRED. This is the C1 contract
behaving exactly as designed: an unreachable source yields an explicit unmeasured state and no
fabricated fallback. Its knock-on is that Credit & Leverage reads `unmeasured`, dropping Capital
Flow coverage to 4 of 8, so `buildSummary`, `flowPressure` and the regime chip all report
insufficient coverage — C2a/C3 behaving correctly under a real outage. The FRED reachability
problem itself is **not** an E1 defect and was not touched.

**Not directly verified.** `/ma`, the Sector Intelligence Card, Workstation, the Drawer and
Industries are all auth-gated (307 → `/auth`). The removed forward views were **not observed on the
rendered pages**. The figures above were recomputed from a live payload against the deployed logic,
not read from a screen.

**FRED unavailability — diagnosed, no code change.** During E1 verification `/api/credit-spread`
returned `{"measured": false, "reason": "unavailable"}` across six consecutive samples. It
**resolved on its own**, with no deploy and no code change — later sampling returned
`measured 275bp` in 0.20–0.42s. The condition was a **transient provider-side / egress failure**.

Ruled out by measurement: the **exact production User-Agent is accepted** (`"Argus-AI/1.0"` →
HTTP 200 in 0.25s from the dev environment), and DNS/TLS/latency are two orders of magnitude inside
the 8s budget (dns 3–60ms, tls 113–170ms, total 0.17–0.25s). Worth recording for future incidents:
FRED's rejection mode is a **silent hang, not a status code** — an absent or browser-like UA times
out at 40s with zero bytes rather than returning 403 — so any FRED-side refusal reaches the route as
an abort, never as a readable status.

**C1 behaved correctly throughout.** The unreachable source produced an explicit unmeasured state,
**no fabricated credit claim appeared at any point**, and the knock-on (Credit & Leverage
`unmeasured` → Capital Flow coverage 4 of 8 → summary, pressure and chip all reporting insufficient
coverage) is C2a/C3 working as designed. This is the first production demonstration of that chain
under a real outage rather than a test.

Recorded for completeness: C1 is the least resilient of the three outbound callers —
`/api/ipo-pipeline` keeps a 1-hour module cache and serves last-known-good on failure,
`/api/market-data` has fallback providers, while `/api/credit-spread` has no cache, no retry and no
fallback, so one failed fetch erases a good prior reading. Both failure branches also collapse to
the same opaque `reason: "unavailable"`. **Last-known-good caching and retry remain an optional
resilience decision, not a correctness requirement** — serving a cached spread as current would
itself violate the C1 contract that produced this behaviour. No C1 code change was made.

**Kept separate, as instructed:** the confidence-0 sector passthrough is **not** fixed and remains
independently reachable — `predictSectorRotation` returns `found: true, confidence: 0` with prose in
`currentRotation`, and `intelligenceProfile` guards on a sentinel string that never matches.
`probability` still renders nowhere; displayed `confidence` is still the heuristic trust score, not
a calibrated probability. No rename, recalibration, weight or threshold change.

---

### RC2-E2 — zero evidentiary confidence is not a forecast (implemented)

`predictSectorRotation` returned `confidence: ev?.overallTrust ?? si.confidence` and
`intelligenceProfile` projected it, so `/sectors` and `/ma` could render
**"rotating in · prediction engine, confidence 0"**.

**Root cause — broader than the original "sector-only" framing.** After RC2-G3/G5 a Sector's only
inbound edge is `belongs_to` (G5-excluded), and after RC2-E1 an Industry's `affects`/`correlates`
edges are ontology-only (E1-excluded). Measured:

```
Sector "Technology"       edges: belongs_to                      trust 0, insufficient_signal
Industry "Semiconductors" edges: belongs_to, affects, correlates trust 0, insufficient_signal
```

So `ev.overallTrust` is **structurally 0** for those node kinds. Nullish coalescing does not fall
through on `0`, so `si.confidence` was never reached. The theme and company paths refuse on the
evidence VERDICT; `predictSectorRotation` guards only on theme linkage, so nothing stopped it —
confirmed on one graph where theme confidence was 50 and company 51 while sector was 0.

**Change.** One `withConviction()` wrapper at the canonical projection boundary in
`intelligenceProfile`, applied to all three branches, so every consumer (Sector card, `/ma`,
`entityContext`, `industriesIntel`, Drawer, Workstation, Industries) inherits it from one place.
The engines keep returning full output for diagnostics; only the projection is withheld. **No
weight, threshold, calibration or field rename.**

```
sector  engine found=true confidence=0  ->  profile.forward = null
theme   engine confidence=50            ->  profile.forward.confidence = 50
company engine confidence=51            ->  profile.forward.confidence = 51
```

**Live-shaped impact: none today.** Sector 0/12 and Industry 0/9 forward views both before and
after, because on the current payload the engine already refuses earlier at its theme-linkage guard
(`found & confidence 0` count = 0). Theme 13/13 and Company 6/54 are unchanged from E1. **E2 fixes
a latent defect; it does not change today's rendered output.**

**Deliberate supersession of three RC2-G5.1 assertions.** G5.1 mitigated zero-confidence forward
views in **copy** — it let the forward through and worded it carefully ("confidence not
established", "Recorded rotation: rotating in"). E2 removes zero-confidence forward views at the
**projection boundary**, making that mitigation unreachable: there is no forward object left to
describe. The three assertions changed in `sectorHypothesisWarmMemory.test.ts`:

| Was | Now |
|---|---|
| `thesis.status === "partial"`, forward truthy | forward `null`, status `unavailable` |
| basis matches `/Recorded rotation: rotating (in\|out)/` | clause must be **absent** when the only forward carries zero confidence |
| if confidence 0, basis says "confidence not established" | no such wording needed — the forecast itself is withheld |

G5.1's actual purpose is preserved and still asserted: a bare entity label is never a hypothesis, a
substantive hypothesis is still composed from the canonical chain / `sectorForward` when those have
real backing, and same-label provenance suppression is untouched. **A positive control was added**:
a sector given observed Feed evidence on its own label reaches trust 53 → confidence 53 → the
forward view *is* projected and the recorded-rotation clause *is* rendered — proving E2 withholds
zero-confidence forwards, not all forwards. No other frozen suite required changes.

**Production validation.** Deployed as `5c58d1e`; both Railway services reported success — frontend
(`argus-ai`) 2026-08-24T15:14:09Z, backend (`perceptive-achievement`) 15:18:19Z. No transient
failure; `/api/health`, `/api/credit-spread` and `/api/ipo-pipeline` returned 200 throughout.

Public endpoints re-verified against live data:

```
C1  /api/credit-spread   measured 270bp asOf 2026-08-21, prior 275bp, -5bp -> tightening,
                         1 business day stale   (FRED fully recovered; the -5bp move exceeds
                         the +/-3bp threshold, so the direction is real rather than "stable")
C2b /api/ipo-pipeline    24 entries, formType on every row, 14 amendments, 10 new S-1,
                         10 deduped CIKs, period 2026-08-19..2026-08-24
```

Forward counts recomputed from a fresh live payload (11 themes, 74 clusters) against the deployed
logic:

```
Theme     11 / 11 forward
Company    8 / 46 forward
Sector     0 / 10 forward
Industry   0 /  9 forward

zero-confidence projections blocked by E2 : 0
projected forwards, all with confidence>0 : 19
```

**E2 is confirmed as a latent defect fix with no live-output reduction on the current payload.**
Zero projections were blocked, because the sector engine already refuses earlier at its
theme-linkage guard on this data — the same result as before the change. What the deployment does
establish is the invariant: **every one of the 19 projected forward views carries confidence > 0**,
so no zero-confidence forecast can reach a surface. The counts also moved with the data (themes
13 -> 11, companies 6/54 -> 8/46) while the rule held, confirming it tracks confidence rather than a
fixed set.

**Not directly verified.** `/sectors`, `/ma`, Workstation, the Drawer and Industries are auth-gated
(307 -> `/auth`). The rendered forward views were **not observed**; the figures above were
recomputed from a live payload against the deployed logic, not read from a screen.

**Validation.** 14 new tests in `zeroConfidenceForward.test.ts` (the reproduced production
precondition, engine diagnostics preserved, the exact 0-vs-positive boundary, insufficient sentinel
still refused, E1 ontology-only still refused, observed-backed still working, probability/confidence
semantics and determinism unchanged) plus 4 in the G5.1 positive control. Targeted E2/E1/G5/G5.1/
transmission/acquirer suites **82 passed**. Frontend **1003 passed / 66 files**, tsc clean, **lint 0
errors**, production build clean. No backend file changed.

---

### RC2-E3 — a mention is coverage, not corroboration (implemented)

`evidenceEngine.POSITIVE_REL` listed `mentions` beside `supports` and `drives`, so a single
mention of any provenance produced verdict `moderate` with trust ~50 (Listen 49, Feed 51, M&A 51).
It also **defeated the RC2-E1 forecast guard**: E1 refuses when the verdict is
`insufficient_signal`, so one mention lifted the verdict and re-enabled a forecast whose entire
basis was "one article named this company" — measured `strengthening, confidence 51,
probability 44`.

**Every producer uses `mentions` contextually** — Story→Company/Theme (Feed), Event→Company,
Podcast→Company/Theme and Person→Theme (Listen), Deal→Company (M&A) — and the codebase already said
so: `ingestEvents` notes the edge *"stays `mentions` (contextual) — never conflated"*, ExplorerGraph
renders it as *"Coverage link: reporting names the entity"*, and `maIntel.ts` and `listenIntel.ts`
both implement an explicit **SUPPORTS / CONTRADICTS / MENTIONS / CONTEXT** model documented *"never
conflated"*. This engine was the one place breaking that contract, so the exclusion is
vocabulary-level and safe.

**A masking defect found during implementation, and the reason the first attempt was wrong.**
`G.getNeighbors` returns one entry per neighbour, keeping the **first** edge found, and
`ingestStories` writes `mentions` before `supports` on the same Story→Theme pair. Filtering the
output of `getNeighbors` therefore discarded the whole neighbour **and its genuine `supports`
edge** — silently destroying real evidence while appearing to remove only mentions. On the live
payload that dropped all 49 `supports[Feed]` edges, which is what produced the initial (wrong)
"everything goes to zero" prediction. The engine now walks the full relationship list and keeps the
first **admissible** edge per neighbour.

**Measured, live payload (11 themes / 74 clusters):**

```
Theme   admissible evidence 11/11    forecasts 11/11     (unchanged)
Company admissible evidence  0/46    forecasts  0/46     (was 14 / 8)
Sector  admissible evidence  0/10    forward    0/10
mention edges preserved      78      (in graph, traversable)
genuine support edges kept   49      (Story→Theme, page "Feed")
```

**The clarified conclusion.** Argus currently has real thesis-support evidence for **Themes**, but
not for **Companies or Sectors**, in the current production graph. Company and entity coverage
remains available as mentions/involvement — "most discussed", "entered the conversation", heatmaps,
discussion counts, entity context — but not as conviction. That is the honest state and it was not
repopulated with proxies.

Diagnosis proved no adapter can supply company thesis support today: `theme --supports--> company`
is ontology (E1-excluded); `fund --owns--> company` comes from `ingestPrivateMarkets`, which has no
production producer; Story/Listen→Company are mentions. `MarketEvent.event_type` is categorical
(`earnings` / `policy` / `market_event`), not directional — *"Nvidia Slides Ahead of Earnings"* is
typed `earnings`. The deterministic `_EVENT_SIGNAL_RE` bundles opposite directions in one
alternation (`raises?|lowers?|cuts?`, `beats?|misses?`, `upgrades?|downgrades?`), detecting that an
event occurred, never which way. The only directional field is `impact`, which is LLM-generated and
populated on ~15 items per cycle — promoting it would install an LLM judgment as evidence authority.
Sectors likewise have no reachable path: only `belongs_to` (G5-excluded) and two
`ingestPrivateMarkets` lines. **Sector forward views remaining unavailable is correct, not a gap**,
and was explicitly not filled by aggregating company mentions.

**Six prior fixtures superseded, none weakened.** Each had used a mention as "observed backing":
the RC2-E1 case now asserts that observed provenance admits a real `supports` edge *while a mention
still is not one*; the two RC2-E2 company cases assert that coverage-only companies get no forward
view, with the boundary proven on the Theme instead; and the three RC2-E2 sector positive-control
cases are replaced by an explicit demonstration that **no thesis-bearing sector authority is
reachable**, with the audit of every sector-directed adapter line recorded in-file. G5.1's surviving
intent — a bare label is never a hypothesis, the hypothesis composes from the canonical chain,
same-label provenance suppression — is unchanged and still asserted.

**Recorded as open follow-ups, deliberately not implemented here.** `acquires` is in neither
`POSITIVE_REL` nor `NEGATIVE_REL` and counts as positive evidence only through the
`NEGATIVE_REL.has(...) ? -1 : 1` default — positive by fall-through, not by classification; whether
factual acquisition activity should support a thesis at all needs its own audit.
`MarketEvent.companies_direct` is a genuine **involvement** authority (its own comment: *"being on a
linked theme's asset list is exposure, not involvement"*, 6 of 34 live events) that may deserve its
own graph verb — but involvement does not license thesis support today.

**Production validation.** Deployed as `b5e5967`; both Railway services reported success — frontend
(`argus-ai`) 2026-08-25T00:10:04Z, backend (`perceptive-achievement`) 00:12:41Z. No transient
failure; `/api/health`, `/api/credit-spread` and `/api/ipo-pipeline` returned 200 throughout. E3
touches no backend runtime file.

Public endpoints re-verified against live data:

```
C1  measured 270bp asOf 2026-08-21, prior 275bp, -5bp -> tightening, 2 business days stale
C2b 30 entries, formType on every row, 15 amendments, 15 new S-1, 15 deduped CIKs,
    period 2026-08-20..2026-08-24
```

Counts recomputed from a fresh live payload (14 themes / 71 clusters) against the deployed logic:

```
Theme   admissible evidence : 14/14
Theme   forecasts           : 14/14
Company admissible evidence :  0/53
Company forecasts           :  0/53
Sector  evidence / forward  :  0/9  /  0/9
mention edges preserved     : 85     (in graph, traversable)
genuine support edges kept  : 54     (Story->Theme, page "Feed")
evidence items by relation  : supports=54   (zero mentions)
```

Every admitted evidence item in production is a `supports` relation and none is a `mention`. The
payload has moved since implementation (11 -> 14 themes, 46 -> 53 companies) and the rule held
across that change, confirming it tracks relationship semantics rather than a fixed entity set.

**Company and sector forward views are now visibly sparser.** Where `/ma` and the Sector
Intelligence Card previously rendered a direction and a confidence figure for a company or sector,
they now render their honest empty state. That is the intended consequence of this ruling, not a
regression: Argus has thesis-support evidence for Themes and coverage only for Companies and
Sectors.

**Not directly verified.** `/ma`, `/sectors`, Workstation, the Drawer and Industries are auth-gated
(307 -> `/auth`). The sparser rendering was **not observed**; every figure above was recomputed from
a live payload against the deployed logic, not read from a screen.

**Validation.** 17 new tests in `mentionNotEvidence.test.ts`: mention-only insufficiency for Feed,
Listen and M&A; no forecast from mentions; mention edges preserved and countable by coverage
consumers; and the masking case — a neighbour with both `mentions` and `supports` retains the
support, with every admitted item asserted non-`mentions`. Targeted E3/E2/E1/G5/G5.1 suites
**76 passed**. Frontend **1020 passed / 67 files**, tsc clean, **lint 0 errors**, production build
clean. No backend file changed.

---

### RC2-D2 — episode entities from the title (implemented)

**Finding D** recorded that `Episode.entities` was hardcoded `[]` in `_normalize`, leaving six
Listen sections permanently empty and making `ingestListen`'s company loop dead code in production:

```python
for (const entity of ep.entities ?? []) {      # never executed
  const c = addCompany(entity, PAGE_LISTEN);
  link(podId, "mentions", c, { page: PAGE_LISTEN });
}
```

**Title only, and the choice was measured rather than assumed.** Description text carries two
artefact classes that no publisher guard can remove:

| Artefact | Shape | Effect |
|---|---|---|
| publisher boilerplate | "Thoughts on the Market" names Morgan Stanley in every episode's closing disclaimer | 10 of 12 `MS` mentions were self-coverage |
| guest-employer blocks | Bloomberg Surveillance lists "Featuring: … Head of … at Citi" | `JPM`/`SCHW`/`GS`/`C`/`BAC` for the bank that employed the guest, not one being discussed |

Together these made **48%** of description-derived mentions artefacts of who *produced or appeared
on* the show rather than who was discussed. Title-only was chosen for precision, accepting lower
coverage.

**Resolver.** RC2-A's `resolve_entities` and nothing else — no second ticker regex, no new identity
mapping. Publisher suppression is retained as defence-in-depth and derives its ticker by asking that
same resolver what the registry's publisher string resolves to; only an unambiguous single match is
used. Today that yields `{Goldman Sachs: GS, Morgan Stanley: MS}` and **zero** live suppressions —
inert, but it protects against a feed that later puts the producing house in its titles.

**Measured on the live corpus (two runs, one week apart):**

```
run 1: 175 episodes  ->  14 with an entity (8%), 12 distinct companies, 0 publisher artefacts
run 2: 149 episodes  ->  13 with an entity (8%), 11 distinct companies, 0 publisher artefacts
```

The corpus rotated between runs and the shape held.

**Precision audit — all 13 resolutions inspected by hand.** Every one names a company genuinely
discussed in the title; **zero false positives**. The two guest-employer-shaped titles were examined
individually and both are true subjects: *"BONUS: JP Morgan Co-Head of Global Banking Filippo Gori"*
is an interview about JP Morgan's banking franchise, and *"Microsoft's Deputy CISO on Securing AI
Agents"* is about Microsoft's security posture. `GOOGL` comes from *"Talent Exodus at Google"* — the
subject, not a guest's employer. Misses are **recall-only** and were left alone: Expedia went
unresolved, and Anthropic, Canva and Revolut are private and correctly excluded by the registry gate.

**The E3 boundary was the risk, and it holds.** D2 turns on a path that writes `mentions` edges into
Company nodes on every ingest. Verified against the deployed evidence logic:

```
company with only Listen mentions   : insufficient_signal, trust 0, 0 supporting items
forecast enabled by those mentions  : none  (found=false, insufficient_signal)
profile.forward                     : null
10 episodes naming the same company : still insufficient_signal, trust 0
company evidence with vs without    : identical verdict, trust, item count, source count
theme `supports` edges              : undisturbed (the E3 masking case)
coverage consumers                  : receive the mention and count it
```

**Consumer classification.** Every Listen consumer of `.entities` was checked for wording that
would convert coverage into conviction; none does. `Most discussed companies`, `Company mention
heatmap` ("which names show up under which narratives"), `N mentions`, and the episode card's
`Discussed` label are all literal. `influentialEpisodes` uses `entities.length` as a ranking term
only. Two consumers stay empty and that is correct, not a defect: `mostReferencedPeople` filters on
`looksLikePerson` and D2 emits canonical tickers only — Argus does not resolve people from titles;
`mostReferencedFunds` populates only when a title names a fund ticker. Separately,
`companiesEntering` has **no rendering consumer at all** — dead code, recorded here, not touched.

**Validation.** 30 new backend tests in `test_podcast_entities.py` (title resolution, determinism,
dedup, publisher guard on both the function and the pipeline path, non-company token exclusion, and
the audited live titles pinned) — the two `_normalize` wiring tests fail against pre-fix code and
pass after. 14 new frontend tests in `listenMentionCoverage.test.ts` pinning the E3 boundary under
D2's new volume, including the before/after evidence-count delta. Backend **1294 passed**, frontend
**1034 passed / 68 files**, tsc clean, lint 0 errors, production build clean.

**Scope.** Only `_normalize`'s `entities` field changed. Not done: description extraction, guest
parsing, RC2-D3, `companies_direct`, `acquires` polarity, industry source additions.

#### RC2-D2 production validation

Deployed as `6e2ed2e`. Both Railway services green (`argus-ai`, `perceptive-achievement`); backend
`/api/health` 200. Prior slices re-verified live and unaffected: **C1** `/api/credit-spread` returns
real FRED `BAMLH0A0HYM2` — `measured: true`, 270bp, `tightening` at −5bp, 2 business days stale
(inside the locked 5-day tolerance); **C2b** `/api/ipo-pipeline` returns 22 real S-1 filings, the
freshest dated the day of validation.

Fresh production corpus:

```
total episodes             : 149      (25 registered shows, 14d cap)
episodes with >=1 entity   : 13
coverage                   : 8.7%
distinct companies         : 11
top resolved               : NVDA(4) META(2) MSFT(2) MRNA HD LOW WDAY COST SCHW JPM GOOGL
publisher suppressions     : 0
publisher -> ticker (live) : {Goldman Sachs: GS, Morgan Stanley: MS}
observed false positives   : 0
```

**Every resolved title was inspected again.** All 13 name a company genuinely discussed in the
title. The two guest-employer-shaped titles were re-checked individually and both remain true
subjects: *"BONUS: JP Morgan Co-Head of Global Banking Filippo Gori"* (JP Morgan's banking franchise
is the topic) and *"Microsoft's Deputy CISO on Securing AI Agents"* (Microsoft's security posture).
`GOOGL` comes from *"Talent Exodus at Google"* — the subject, not a guest's employer. Publisher
suppression stayed inert at 0 removals, as designed.

**The critical invariant, measured as a delta.** The graph was built twice from an identical
themes/clusters baseline — once without episodes, once with the 149-episode production corpus — so
every difference is attributable to D2 alone:

```
                              without episodes -> with episodes
Theme   count                 14    -> 22
Theme   admissible evidence   14/14 -> 14/22
Theme   forecasts             14/14 -> 14/22
Company count                 53    -> 58
Company admissible evidence    0/53 ->  0/58     <- unchanged
Company forecasts              0/53 ->  0/58     <- unchanged
mention edges (all)           85    -> 727
Listen->Company mentions       0    -> 16
supports edges               118    -> 118       <- undisturbed
evidence items by relation   {supports: 54} -> {supports: 54}
```

**Listen conversation coverage rose and Company thesis evidence did not.** The 16 new
`Episode --mentions--> Company` edges cross-check exactly against the corpus
(`sum(len(entities)) == 16`). Company admissible evidence and forecasts both stayed at **zero** while
the company population grew 53 → 58 — the five companies Listen introduced arrived with no
evidentiary authority whatsoever. Theme evidence and forecasts held at 14 in absolute terms while the
denominator grew to 22: the eight themes Listen contributed are topic labels carrying only
`mentions`, so none gained evidence or a forecast. `supports` edges were untouched at 118, and the
admitted-evidence relation histogram is still `{supports: 54}` with **zero** `mentions` — confirming
the E3 masking case did not reappear at D2's higher mention volume (85 → 727 edges).

**Not visually verified.** `/listen` and every other product surface is auth-gated (307 → `/auth`),
and the backend's `/api/listen` returns 307 to anonymous callers. The figures above were **recomputed
against the deployed logic from a live payload**, not read from a production response or a screen.
The rendered Listen sections were not observed.

---

### RC2-L1 — M&A involvement is not thesis corroboration (implemented)

`acquires` is the remaining half of the contract breach RC2-E3 fixed. `maIntel.ts` — the M&A
surface's own classifier — files this exact edge under **MENTIONS**, not SUPPORTS:

```
 *   MENTIONS - a recorded "mentions"/"acquires" edge, or resolved-entity metadata overlap
```

and its code implements that (`maIntel.ts:159-161`): `NEG_REL_RE` → CONTRADICTS, `SUP_REL_RE` →
SUPPORTS, **everything else** → MENTIONS. `acquires` matches neither regex.

`evidenceEngine` disagreed **by accident, not by classification**: `acquires` is in neither
`POSITIVE_REL` nor `NEGATIVE_REL`, and `toEvidenceItem` assigns polarity through
`NEGATIVE_REL.has(...) ? -1 : 1`, so it fell through to `+1`.

**Measured before the change:**

```
MSFT --acquires--> WDAY   BOTH endpoints: verdict moderate, trust 46, 1 item [acquires/+]
KKR  --acquires--> WDAY   target:         verdict moderate, trust 51, 1 item [acquires/+]
item detail: relationship=acquires  polarity=1  reliability=40  sourceName=null
```

`sourceName` was `null`, so a deal party was also counted as an independent source through the
`type:M&A` fallback.

**The edge is broader than "an acquisition"** in three ways the engine could not see, all confirmed
at the single producer (`intelligenceGraphAdapters.ts:545`):

| Property | Finding |
|---|---|
| Roles | **positional** — `companies[0]` acquires `companies[1]`, the order of `affected_entities`. Which party is the acquirer is unverified. |
| Deal state | `dealType` is **never consulted** at the link site, so `rumored` and `withdrawn` write the identical edge with identical authority. `inferDealType` also maps "joint venture" → `merger`. |
| strength/confidence | `d.signalScore` — the feed item's newsworthiness, not any property of the deal. |

So the edge records that two parties co-occur in an M&A story. That is involvement. Classifying it
as support-or-weaken would need a deal-quality authority that does not exist, and inventing one was
out of scope.

**The fix** is the smallest explicit exclusion beside E3's, in the one choke point:

```ts
const INVOLVEMENT_REL = new Set(["acquires"]);
const isInvolvement = (e: IntelEdge): boolean => INVOLVEMENT_REL.has(e.relationshipType);

const admissibleAsEvidence = (e: IntelEdge): boolean =>
  !isStructural(e) && !isOntologyOnly(e) && !isMention(e) && !isInvolvement(e);
```

The binary `polarity` type, `POSITIVE_REL`, `NEGATIVE_REL` and the relationship vocabulary are all
unchanged — this is an admissibility rule, not a polarity or vocabulary change. The edge is **not**
removed: it stays in the graph, stays traversable, and remains available to the M&A relationship
map, the transmission graph and the debug reports.

**Deliberately not broadened.** Three relationships share the same silent-positive fall-through:

| Relationship | Default polarity | Intended semantics | Reaches evidence today? |
|---|---|---|---|
| `acquires` | +1 by fall-through | M&A involvement | **yes — fixed by L1** |
| `names` | +1 by fall-through | attributed involvement (Event names a company) | no — `admissibleNeighbors` skips Event-typed neighbours |
| `evidenced_by` | +1 by fall-through | Event ← its own Story | no — same Event skip |
| `depends_on` | +1 by fall-through | structural dependency | no — no producer exists |

`names` and `evidenced_by` are unreachable **only** because of that Event-type skip. **Any
Event-admission work (L2) would activate both immediately**, and `evidenced_by` would be circular in
the RC2-E1 sense. They must be settled before L2, not after. Recorded here; not fixed here.

**Blast radius.** Evidence, trust, verdict and `sourceBreakdown` only. Predictions and forward views
were already unaffected — the reproduced deal-only cases measured `found=false` / `forward=null`
before L1, and still do. Live *volume* is unmeasured: the full feed payload is auth-gated.

**Validation.** 32 new tests in `involvementNotEvidence.test.ts` covering the acquires-only company
(edge present, traversable, zero items, empty sourceBreakdown, `insufficient_signal`, trust 0, no
manufactured contradiction), both endpoints separately, graph direction still recorded, the sponsor
`Fund → Company` path, all six `dealType` values including `rumored`/`withdrawn`, the E3
parallel-edge masking case, M&A/transmission consumers, and forecast/profile invariance. **16 of
them fail against pre-L1 code.** One pre-existing assertion was superseded —
`ontologyNotEvidence.test.ts` "a Deal supporting a company IS evidence", whose own note had recorded
this decision as pending; it is re-pinned on the deal's genuine `supports` edge to its theme, which
is what it actually proved. Targeted L1/E1/E2/E3/D2 + graph-integrity suites **129 passed**.

#### Production-scope correction (recorded here, prior entries not rewritten)

The absolute graph counts reported in the **RC2-E3** and **RC2-D2** entries above — "Company
admissible evidence 0/53", "0/58", `mention edges preserved 85`, `evidence items by relation
{supports: 54}` — were measured on a **themes + clusters (+ episodes)** input subset.

Production's `useArgusIntelligence` provisions more than that: `themes, clusters, episodes, deals,
snapshots, events, explanations`, and every graph-consuming surface uses it. The **RC2-D2 delta
invariant remains valid** — it was a before/after comparison on identical inputs, so it isolates
D2's contribution correctly — but those **absolute** company-evidence figures were scoped narrower
than the complete production graph. `acquires`-derived company evidence sat outside the measured
subset, which is why it did not appear in those numbers. The earlier entries are left as written;
this note is the correction of record.

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
