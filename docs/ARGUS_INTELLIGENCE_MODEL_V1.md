# Argus Intelligence Model v1

**Status:** Canonical reference, v1 (architecture sprint, 2026-07)
**Audience:** Argus engineers and product. Written as an internal specification, not marketing.
**Scope:** Defines the shared intelligence model every Argus surface consumes. This document specifies concepts and contracts; it deliberately does not implement scoring algorithms or new storage. Where the model conflicts with today's codebase, the conflict is named and a migration path is recommended.

**Companion code (current implementation):**

| Concept | Where it lives today |
|---|---|
| Graph store (nodes, edges) | `frontend/src/lib/intelligenceGraph.ts` |
| Data-to-graph adapters | `frontend/src/lib/intelligenceGraphAdapters.ts`, `frontend/src/lib/dataAdapters/observationGraphBridge.ts` |
| Provider layer (SEC, FRED, FMP) | `frontend/src/lib/dataAdapters/*` |
| Evidence engine | `frontend/src/lib/evidenceEngine.ts` |
| Prediction engine | `frontend/src/lib/predictionEngine.ts` |
| Memory engine (session/local) | `frontend/src/lib/memoryEngine.ts`, `frontend/src/lib/themeSnapshots.ts` |
| Causal projection + expansion | `frontend/src/lib/causalMap.ts` |
| Cross-page aggregation | `frontend/src/lib/crossIntel.ts`, `frontend/src/lib/intelligenceContext.tsx` |
| Entity resolution for surfaces | `frontend/src/lib/drawerEntity.ts`, `frontend/src/lib/entity.ts` |
| Orchestration / scheduling | `frontend/src/lib/intelligenceOrchestrator.ts`, `frontend/src/lib/dataAdapters/ingestionScheduler.ts` |
| Validation suite | `frontend/src/lib/intelligenceTests.ts` (91 tests) |

---

## 1. Core Philosophy

### 1.1 What Argus is

Argus does not track securities. Argus tracks **the propagation of market narratives**: how a macro force becomes a theme, how a theme concentrates in sectors, how sectors resolve into companies, and how evidence confirms or breaks each link along the way. A price is the last, most compressed expression of that chain. Everything upstream of the price is where the intelligence lives.

Every feature, present or future, must be able to answer four questions about anything it shows:

1. **What is happening?** - the entities and relationships currently active.
2. **Why is it happening?** - the causal chain upstream of the entity.
3. **What happens next?** - the forward view, with an explicit invalidation condition.
4. **How certain are we?** - a decomposable confidence, never a bare number.

### 1.2 Why intelligence, causality, and evidence are first-class

- **Intelligence is first-class** because a fact without interpretation is a data feed, and Argus is not a data feed. Every stored object carries interpretation metadata (confidence, importance, persistence) alongside the fact.
- **Causality is first-class** because the product's core read is transmission: `Driver -> Theme -> Sector -> Company -> Evidence`. A graph of undirected "related to" links cannot answer "why". Relationships are typed and directional, and the causal layer of an entity type is part of the ontology (see `causalMap.ts`, `causalLayerOfType`).
- **Evidence is first-class** because Argus has a hard rule inherited from the UI layer and enforced culturally throughout the codebase: **no fabricated data**. A claim without evidence is displayed as absent, not invented. Every relationship must be able to cite what asserted it (`IntelEdge.originatingPages`, `evidenceCount`), and every confidence number must decompose into the evidence behind it (`evidenceEngine.evaluateEvidenceForNode` already returns per-source breakdowns and contradictions).

### 1.3 Standing invariants

These invariants already hold in the codebase and are elevated here to architectural law:

- **I1 - No fabrication.** Missing data renders as an honest empty state, never as a synthetic value. Placeholder scaffolding must be explicitly badged (see the SAMPLE badges in the Explorer workstation).
- **I2 - Descriptive market data.** Market observations (price, volume, liquidity) are recorded neutrally. A price move is never itself interpreted as bullish or bearish by the ingestion layer (`MarketDataAdapter` header comment). Interpretation happens downstream, in engines, where it can cite evidence.
- **I3 - Determinism.** Given the same inputs, every projection (layouts, selections, trends, scores) produces the same output. No physics simulations, no randomness without a seed.
- **I4 - Explainability.** Any number shown to a user (confidence, strength, trust, probability) must be decomposable on demand into its inputs. The evidence engine's verdict + breakdown pattern is the template.
- **I5 - Read-only projections.** Surfaces never mutate the graph; they project it. Mutation happens only through adapters and engines.

---

## 2. Entity Model

### 2.1 Current state

The graph store (`intelligenceGraph.ts`) defines a single node shape, `IntelNode`, with an **open union** `NodeType`. The known vocabulary today:

`Theme, Company, Sector, Industry, Macro, Commodity, Country, Currency, InterestRate, Deal, Fund, Person, Podcast, Story, EconomicRelease, ETF`

plus types used in practice through the open union: `Narrative`, `MacroSeries`, `Institution`, `MarketMetric`.

Every node carries the same required attributes (this is a strength - one merge/alias/confidence machinery for everything):

| Attribute | Type | Meaning |
|---|---|---|
| `id` | string | canonical normalized key |
| `label` | string | display text |
| `aliases` | string[] | alternate names resolving to this node |
| `type` | NodeType | entity class |
| `confidence` | 0-100 | existence confidence: how sure we are this entity is real and correctly identified |
| `conviction` | 0-100 | directional conviction (distinct from existence; see section 6) |
| `momentum` | signed number | rate of change of the signal |
| `persistence` | 0-100 | durability of the signal so far |
| `firstSeen`, `lastSeen` | epoch ms | observed lifetime |
| `mentionCount` | number | raw observation count |
| `importance` | 0-100 | relative weight in the graph |
| `sources` | SourcePage[] | pages that contributed to the node |
| `metadata` | record | type-specific payload (e.g. `latestMarketData` on Company/ETF) |

### 2.2 Entity catalogue

For each entity: purpose, required attributes beyond the common set, optional attributes, examples. Status marks whether it exists today.

| Entity | Status | Purpose | Type-specific required | Optional | Examples |
|---|---|---|---|---|---|
| **Macro Driver** (`Macro`, `MacroSeries`, `InterestRate`, `EconomicRelease`, `Commodity` as driver) | live | A force outside any single market that originates transmission chains. Top of the causal order (layer 0). | label naming the force | series id, unit, latest value, release cadence (in `metadata`) | AI Capex, Rates, Power Prices, Geopolitics, DGS10, CPI |
| **Narrative** | partial (type exists, treated as Theme) | A macro-level story that spans multiple themes. See section 4 for the critical analysis before promoting it. | member theme ids (if promoted) | dominant driver, lifecycle stage | "AI infrastructure supercycle" spanning AI Capex, Datacenter Power, Semi Capex |
| **Theme** | live (primary unit of intelligence) | A named market thesis connecting drivers to exposed assets. The backend's `theme_intelligence` is the main source. | causal narrative text, related assets/industries/macro factors | momentum label, persistence score, second-order effects, contributing cluster ids | AI Infrastructure Buildout, Supply-Side Energy Shock |
| **Sector** | live | GICS-level container used for rotation and transmission (layer 2). | sector name | member industries | Energy, Semiconductors, Utilities |
| **Industry** | live (underused; often conflated with Sector) | Finer container inside a sector. The causal layer treats Industry at the sector layer. | industry name | parent sector | Oil & Gas E&P, Semiconductor Equipment |
| **Company** | live | A tradeable operating entity; the point where narratives become positions (layer 3). | ticker (as id/alias) | `latestMarketData`, sector, industry, exchange, beta, description | XOM, NVDA, ASML |
| **ETF** | live | A tradeable basket used to express theme/sector exposure. Same machinery as Company, distinct type for display and routing. | ticker | `latestMarketData`, tracked index/theme | SPY, QQQ, SMH |
| **Asset** (non-equity) | partial (`Commodity`, `Currency` exist) | Non-equity tradeables that carry transmission (commodity as expression rather than driver, FX). | symbol | market data | Brent, DXY, BTC |
| **Event** | proposed | A dated occurrence that anchors evidence in time: earnings, FOMC, product launch, export-control action. Today events exist only as derived timeline entries (memory engine) and catalyst categories in the Explorer, not as graph nodes. | date, event class | outcome, related entities | Q3 earnings, FOMC 2026-07-29, Blackwell launch |
| **Story** | live | A clustered news item; the narrative's contact with reporting. Currently doubles as the main evidence carrier. | title | cluster id, affected entities, source tier | "Texas grid operator warns on datacenter load growth" |
| **Evidence** | proposed as distinct record (today: edge counters + Story/MarketMetric nodes) | An atomic observation supporting or weakening a relationship. See section 5. | evidence class, timestamp, source | quality score, direction (supports/weakens) | one SEC filing, one price observation |
| **Market Metric** | live | Raw telemetry attached to a tradeable: price, volume, liquidity, OHLCV series. Deliberately non-interpretive (invariant I2). | metric kind, payload, provider, freshness | interval/resolution for series | `mkt:NVDA:ohlcv:intraday` |
| **Person** | live (thin) | Named individual whose statements or trades are evidence (executives, insiders from Form 4, podcast guests). | name | role, affiliation | CEO on an earnings call, Form 4 filer |
| **Institution** | live (thin) | Funds, banks, sponsors, regulators appearing in flows and deals. | name | institution class | Blackstone, SEC, ERCOT |
| **Deal** | live | An M&A or financing transaction; both an entity and an evidence generator. | parties, deal type | value, status, sector | "X acquires Y" |
| **Fund** | live (thin) | Investment vehicle in private-markets flows. | name | strategy, AUM | growth fund in Private Markets chain |
| **Product** | proposed | A company's product line when it is the actual carrier of a theme. Currently product news collapses into Story text. Promote only when a consumer needs product-level reasoning (supply chains). | name, owning company | category | Blackwell, 737 MAX |
| **Country** | live (thin) | Jurisdiction for trade/regulation transmission. | name | region | China, Netherlands |
| **Economic Indicator** (`EconomicRelease`, FRED series) | live | A published series whose prints are evidence for drivers. | series id | cadence, unit | CPI, UNRATE, T10Y2Y |

**Rules:**

- New entity types must declare their **causal layer** (section 3.5 of `causalMap.ts`: driver 0, theme 1, sector 2, company 3, evidence 4) or explicitly opt out of the transmission order.
- The open union stays (it has served ingestion well), but the **known vocabulary above is the reviewed set**: any type outside it appearing in adapters should be a code-review flag, not a silent addition. Recommendation: add `Narrative`, `MacroSeries`, `Institution`, `MarketMetric` to `KNOWN_NODE_TYPES` to close the gap between documented and practiced vocabulary (small, safe code change; not done in this sprint).

---

## 3. Relationship Model

### 3.1 Current state

`IntelEdge` is directional (`source -> target`) and carries: `relationshipType` (open union), `strength` (0-100), `confidence` (0-100), `firstObserved`, `lastObserved`, `evidenceCount`, `originatingPages`. Re-asserting an edge merges: evidence count increments, timestamps extend, strength/confidence take the max. This merge behavior is the foundation of the trend model (section 7).

Known vocabulary today: `drives, supports, weakens, owns, acquires, mentions, correlates, supplies, depends_on, competes_with, raises_demand_for, reduces_supply_of` plus in-practice types through the open union (`has_market_metric`, `affects`, `exposed_to`, `discussed_in`).

### 3.2 Relationship catalogue

Directionality legend: `A -> B` means the edge is stored source=A, target=B. "Confidence behavior" describes how the edge's confidence should respond to evidence over time (conceptual; scoring is future work). "Evidence requirements" state the minimum honest basis for asserting the edge.

**Causal (the transmission backbone)**

| Type | Meaning | Direction | Confidence behavior | Evidence requirements |
|---|---|---|---|---|
| `drives` | A is a causal force acting on B | driver/theme -> downstream | Rises with repeated co-movement plus narrative assertion; decays if the driver moves and B stops responding | At least one narrative source asserting causation; market confirmation strengthens but cannot create it (I2) |
| `raises_demand_for` | A increases demand for B | A -> B | As `drives`, plus supply/demand framing | Narrative or fundamental source naming the mechanism |
| `reduces_supply_of` | A constrains supply of B | A -> B | As above | As above |
| `pressured_by` (proposed; today expressed as reversed `drives` or `weakens`) | B is under pressure from A | B -> A (or store as A `drives` B with negative valence) | Recommendation: do NOT add; negative-valence duplication of `drives` fragments evidence between two edge ids. Prefer `weakens`. | n/a |

**Epistemic (evidence acting on claims)**

| Type | Meaning | Direction | Confidence behavior | Evidence requirements |
|---|---|---|---|---|
| `supports` | A adds confirming weight to B | evidence/theme -> claim/entity | Each independent source adds diminishing confidence; same-source repetition adds little | One identifiable source |
| `confirms` (proposed alias) | Hard confirmation of a prior claim (e.g. filing confirms rumor) | evidence -> claim | Step change up | Primary-source document. Recommendation: fold into `supports` with a `primary: true` evidence attribute rather than a new type; two near-synonyms will split evidence counts |
| `weakens` | A cuts against B | evidence/driver -> claim/entity | Symmetrical to `supports`; contradictions must also surface in B's confidence explanation (I4) | One identifiable source |
| `contradicts` (proposed alias) | Direct logical contradiction between two claims | claim -> claim | Both claims' confidence capped until resolved | Recommendation: fold into `weakens` for v1; the evidence engine already reports `contradictions` derived from opposing edges |
| `mentions` | A story/podcast names an entity | story -> entity | Low ceiling; mentions alone never push confidence above "weak" | The text itself |

**Structural (market anatomy)**

| Type | Meaning | Direction | Confidence behavior | Evidence requirements |
|---|---|---|---|---|
| `supplies` / `supplier_of` | A supplies B | supplier -> customer | Stable once established; decays only on contrary evidence | Fundamental source (filing, presentation, reputable reporting) |
| `depends_on` / `customer_of` | A depends on B | dependent -> dependency | As above | As above. Note: `customer_of(A,B)` = `supplies(B,A)`; store ONE canonical direction (`supplies`) and derive the inverse in projections, as `causalMap.expandMap` already does for supplier/customer modes |
| `competes_with` | A and B compete | symmetric (store once, either direction; projections treat as undirected) | Stable | Fundamental source |
| `owns` | A owns B (subsidiary, stake) | owner -> owned | Stable, binary-ish | Filing or announcement |
| `acquires` | A is acquiring B | acquirer -> target | Tracks deal lifecycle (rumor -> announced -> closed); confidence follows deal status | Deal announcement or credible report |
| `invests_in` (proposed) | A invests in B (minority, fund positions) | investor -> investee | As `owns` but softer | Filing (13F, Form 4) or announcement. Worth adding when private-markets ingestion lands; currently expressible as `owns` with metadata |
| `regulated_by` (proposed) | A operates under regulator/regime B | entity -> regulator/regime | Stable; spikes matter as events, not edges | Regulatory action or filing. Today regulation is expressed as a Macro driver (`Export Controls Regime` drives a sector), which is working well; add `regulated_by` only when a consumer needs the regulator as counterparty |
| `exports_to` / `imports_from` (proposed) | Trade flow between countries/companies | exporter -> importer | Stable | Trade data or reporting. Defer until Country-level analysis is a real surface |

**Telemetry**

| Type | Meaning | Direction | Confidence behavior | Evidence requirements |
|---|---|---|---|---|
| `has_market_metric` | Entity carries a live metric node | company/ETF -> MarketMetric | Confidence = provider reliability x freshness (already computed by the observation bridge quality model) | A provider observation |
| `correlates` | Statistical association, explicitly non-causal | symmetric | Never contributes to causal confidence; may corroborate | Computed association; must state the window |
| `benefits_from` | A is a beneficiary of B (theme/driver) | beneficiary -> source (in practice also stored as theme -> company `supports`) | As `drives` seen from downstream | Narrative source naming the exposure |

**Vocabulary discipline:** the open union stays for ingestion resilience, but every projection (edge colors, expansion predicates, explanations in `causalMap.ts` / `ExplorerGraph.tsx`) matches by regex groups. New relationship types MUST be added to those groups in the same change, or they render as "other" - which is the correct failure mode (visible, honest, ugly).

### 3.3 General rules

- **One fact, one edge.** Synonym types split evidence counts and silently halve confidence. Prefer attributes on evidence (e.g. `primary`, `valence`) over new types. This is why `confirms`, `contradicts`, and `pressured_by` are recommended as folds, not additions.
- **Direction is causal, not grammatical.** Store the direction that matches transmission; projections may flip arrows for display (the Explorer already orients arrows by causal layer regardless of storage direction).
- **Every edge must be explainable.** `originatingPages` + `evidenceCount` + timestamps are the minimum. The Explorer's edge intelligence card is the reference consumer.

---

## 4. Narrative Model

### 4.1 The proposed hierarchy

```
Narrative            "AI infrastructure supercycle"
  └─ Themes          AI Capex, Datacenter Power Squeeze, Semi Capex
       └─ Industries Semiconductors, Utilities, Networking
            └─ Companies   NVDA, AMD, ASML, VST, CEG
                 └─ Evidence  stories, filings, prints, market metrics
```

### 4.2 Critical analysis - should Narrative be first-class above Theme?

**The case for:**

1. Desks talk in narratives. "The AI trade" is one thing to a PM even though Argus tracks it as four themes. A narrative object matches the user's mental model and gives cross-page surfaces (Feed hero, Markets story) a natural anchor - both already synthesize something narrative-shaped ad hoc (`lib/marketMap.ts` "Today's Market Story").
2. Themes are volatile; narratives are durable. Backend theme extraction renames and splits themes between runs. A stable narrative layer would give market memory (section 8) a durable key to accrue history against, which is today's biggest continuity weakness (theme snapshots key on normalized theme names and break when names drift).
3. Double-counting control. When three themes are facets of one story, a company exposed to all three looks three times as connected as it should. A narrative object is the natural place to deduplicate exposure.

**The case against:**

1. **No source of truth.** The backend emits `theme_intelligence`; nothing emits narratives. A frontend-invented narrative layer would be a heuristic clustering presented with the same visual authority as sourced themes - which brushes against invariant I1. If the clustering is wrong, we have fabricated a story.
2. **Ontology inflation.** `Narrative` already exists as a NodeType and is deliberately treated as a Theme everywhere (`CLASS_OF` maps both to the theme class). Promoting it adds a layer every projection, filter, drawer, and test must handle, for one additional level of abstraction.
3. **Confidence laundering.** A narrative's confidence would be an aggregate of theme confidences, which are aggregates of evidence. Two aggregation hops from evidence makes I4 (explainability) materially harder.
4. **The causal chain does not need it.** `Driver -> Theme` already captures "the big story" in practice: the shared driver IS the narrative anchor (everything in "the AI trade" hangs off AI Capex). A narrative object may duplicate what a well-connected driver node already provides.

**Recommendation (v1): derived, not stored.**

Introduce narrative as a **derived grouping**, not a first-class entity:

- Phase 1 (cheap, honest): a pure projection `deriveNarratives(themes, graph)` that clusters themes sharing dominant drivers and overlapping asset sets. Output is labeled as derived ("These 3 themes share a driver"), carries no independent confidence, and is keyed by its driver set so it is stable across theme renames. Consumers: Feed hero, Markets story, Explorer left column. **Implemented (System 2 sprint, 2026-07):** `frontend/src/lib/narrativeDerivation.ts` (`DerivedNarrative`), specified in `docs/ARGUS_NARRATIVE_ENGINE_V1.md`; contract only, not yet wired into any surface.
- Phase 2 (only if the backend learns to emit narratives): promote to a stored entity with its own evidence trail, and migrate the derived keys. The migration is additive because phase 1 never persisted anything.

This keeps the hierarchy available to the UI without inventing an authority the data does not have.

---

## 5. Evidence Model

### 5.1 Current state (and its main weakness)

Evidence today exists in three partial forms:

1. **Edge counters:** `evidenceCount` + `originatingPages` on every edge - cheap, aggregated, but atomic observations are not retained (you know an edge was asserted 4 times by 2 pages; you cannot list the 4 assertions).
2. **Evidence-ish nodes:** `Story`, `Podcast`, `MarketMetric` nodes linked by `mentions` / `has_market_metric` - these ARE atomic and citable, and the evidence engine walks them.
3. **Provider observations:** `ProviderObservation` (id, provider, timestamps, payload, quality score with provider reliability and freshness) - the richest evidence shape in the system, but it is consumed at ingestion and only its effects persist on nodes/edges.

The weakness: **the atomic observation is discarded after it moves a counter.** "Show me the evidence" can name pages and counts but not the individual assertions. The `ProviderObservation` shape is already the right record; it just is not retained or linked to the edges it influenced.

### 5.2 Evidence catalogue

| Evidence class | Source today | Quality tier (conceptual) | Notes |
|---|---|---|---|
| Regulatory / SEC filing (10-K, 8-K, Form 4) | SEC adapter | Primary (highest) | Slow, sparse, near-certain |
| Macro release (CPI, rates, employment) | FRED adapter | Primary | Scheduled; anchors drivers |
| M&A announcement | Feed M&A category / `useMAIntelligence` | Primary when confirmed; speculative when rumor | Deal status gates quality |
| Earnings call / transcript | not ingested yet | Primary | Future provider |
| Investor presentation | not ingested yet | Secondary | Future provider |
| Reuters/wire article | Feed clusters (source-tier authority already exists in backend `feeds.py`) | Secondary; tier-weighted | The feed's source-tier + opinion classifier should feed evidence quality directly |
| Conference / podcast | Listen pipeline | Tertiary; conversational | Good for early narrative detection, low confirmation value |
| Price action | FMP quotes/OHLCV | Confirmatory only (I2) | Can strengthen an existing causal claim; can never create one |
| Volume / liquidity | FMP | Confirmatory only | Participation evidence |
| Options flow | not ingested | Confirmatory | Future provider |
| Private funding round | Private Markets page data | Secondary | Sparse but strong for private themes |

### 5.3 How evidence acts on relationships

- **Strengthening:** a new observation matching an edge's assertion increments `evidenceCount`, extends `lastObserved`, and may raise strength/confidence (max-merge today; a proper model should use diminishing returns per source - see section 6). Independent sources matter more than repeated ones: 2 pages x 1 assertion should beat 1 page x 4 assertions.
- **Weakening:** evidence with opposing valence creates or reinforces a `weakens` edge; the evidence engine surfaces these as `contradictions` against the node's verdict. Weakening evidence must never silently reduce a counter - it must be visible as its own trail (I4).
- **Decay:** absence of evidence is weak evidence of absence. An edge that stops being asserted while its endpoints stay active trends "weakening" (implemented: `deriveEdgeTrend` in `causalMap.ts`). Decay affects trend and should eventually affect confidence, but must never delete the historical record.

### 5.4 Target shape (migration path, not implemented)

Retain atomic evidence as records: `{ id, class, source, timestamp, quality, valence, targets: edgeIds/nodeIds, payload summary }` - i.e. persist a trimmed `ProviderObservation` (plus story-derived assertions) into an evidence log keyed by the edges it moved, instead of discarding it. Server-side (Supabase is already in the stack) so evidence survives sessions. Edges keep their counters as denormalized aggregates. This is additive: nothing in the current graph contract changes.

---

## 6. Confidence Model

### 6.1 Three different numbers, kept distinct

The codebase already separates these on `IntelNode`, and the separation is correct and must be preserved:

1. **Existence confidence** (`node.confidence`) - is this entity/relationship real and correctly identified? An entity can be 95 real and directionally unclear.
2. **Directional conviction** (`node.conviction`) - which way, and how strongly? This is what the prediction engine outputs (with probability and invalidation conditions).
3. **Relationship confidence** (`edge.confidence`) - does this specific link exist as asserted?

Surfaces must never blend these into one number without labeling (the drawer/Explorer currently show "Signal" = evidence trust, "Conviction" = theme conviction, "Confidence" = per-object confidence - correct pattern).

### 6.2 The multi-factor model (conceptual; no scoring implemented in this sprint)

Confidence of any claim is a function of seven factors:

| Factor | Meaning | Behavior |
|---|---|---|
| **Evidence quality** | Tier of the best supporting evidence (section 5.2) | Sets the ceiling. Mentions-only can never exceed "weak"; a primary source unlocks "strong" |
| **Evidence quantity** | Count of supporting observations | Diminishing returns; the 5th article adds far less than the 2nd |
| **Source independence (cross-confirmation)** | Distinct, independent sources/pages | The strongest multiplier. Already partially captured (`originatingPages`, evidence engine `sourceBreakdown`) |
| **Recency** | Time since `lastObserved` | Decay toward a floor, never to zero (history retains value); decay rate depends on entity class (drivers decay slower than stories) |
| **Market confirmation** | Do price/volume/flows move consistently with the claim? | Bounded, confirmatory-only contribution (I2): it can add on top of narrative evidence but is capped so tape action alone cannot manufacture a thesis |
| **Persistence** | How long the claim has survived (`persistence`, snapshot streaks) | Slow, compounding positive factor |
| **Contradictions** | Active `weakens` evidence | Subtractive AND capping: unresolved contradictions cap the maximum verdict, and must appear in the explanation |

**Required properties of any future scoring implementation:**

- Bounded 0-100, monotone in each factor, deterministic (I3).
- **Decomposable:** the API returns the factor breakdown with the score (the evidence engine's `verdict + supportingEvidence + contradictions + sourceBreakdown` shape is the contract to extend, not replace).
- **Honest floor:** below a minimum evidence threshold the output is `insufficient_signal`, not a small number. The engines already do this; keep it.
- Asymmetry: confidence is easy to lose and slow to gain.

### 6.3 Conflict with current code

Edge merging takes `max(strength)` / `max(confidence)` on re-assertion - simple and monotone, but it ignores independence and never decays. That is acceptable for a session-scoped graph rebuilt from fresh data every load; it becomes wrong the moment persistence lands (section 8). Migration: keep max-merge in-session; apply the factor model when reading persisted history (compute-on-read, so no stored value is ever silently rewritten).

---

## 7. Temporal Model

### 7.1 Fields (largely existing)

| Field | Level | Status | Meaning |
|---|---|---|---|
| `firstSeen` / `firstObserved` | node / edge | live | When Argus first recorded it |
| `lastSeen` / `lastObserved` | node / edge | live | Most recent assertion |
| `persistence` | node | live (sparsely fed) | Durability score of the signal |
| `momentum` | node | live (sparsely fed) | Signed rate of change |
| **velocity** | node/edge | proposed | d(strength)/dt measured across snapshots |
| **acceleration** | node/edge | proposed | d(velocity)/dt; the earliest quantitative warning of narrative exhaustion |
| trend: `strengthening / weakening / stable` | edge | live | Derived honestly from reinforcement and quiet-while-active (`deriveEdgeTrend`) |
| **lifecycle state** | node (themes/narratives) | proposed | `emerging -> building -> established -> fading -> broken \| dormant` |

### 7.2 Lifecycle semantics (conceptual)

- **emerging:** first observations, low persistence, evidence mostly tertiary (podcasts, single stories). High velocity, low confidence.
- **building:** cross-confirmation arriving; secondary/primary evidence appears; velocity positive.
- **established:** high persistence, broad source base, market confirmation present; velocity near zero is healthy here.
- **fading:** evidence flow slows (edges trend weakening), velocity negative, but no direct contradiction.
- **broken:** an explicit invalidation condition fired or contradiction outweighs support. Broken is a terminal state WITH memory - a broken thesis is one of the most valuable records Argus can hold (section 8).
- **dormant:** no activity in either direction for an extended period; revivable.

**Constraint:** velocity/acceleration/lifecycle require at least daily persisted snapshots. The current graph is session-scoped and rebuilt per load; only the memory engine's snapshots (localStorage, one per day) provide any time base. These fields are therefore specified here but must not be faked from single-session data (I1). They become implementable exactly when section 8's persistence lands.

---

## 8. Market Memory

### 8.1 Current state

- `themeSnapshots.ts`: one snapshot per theme per day in `localStorage` (cap 120/theme) - conviction, momentum, evidence counts.
- `memoryEngine.ts`: daily entity snapshots + predictions; powers timeline, evolution summaries, pattern detection, and historical analogs in the drawer/Explorer.
- Limitations: per-browser (not per-user), lost on storage clear, invisible to the backend, keyed by normalized names (breaks on renames), and only as old as the user's own usage.

### 8.2 Target model

Memory is the system of record for **how intelligence evolved**, not just what it is now:

- **Daily state snapshots** of themes, narratives (derived keys), key edges, and per-entity confidence factors - server-side, per-workspace (Supabase; the auth layer already exists).
- **Event log** of state transitions: lifecycle changes, prediction issuance and resolution, contradiction events, broken theses. Transitions are more valuable than states.
- **Stable keys:** memory must attach to alias-resolved canonical ids (the graph's merge machinery already computes these) plus, for themes, driver-set keys (section 4) to survive renames.
- **Retention:** raw daily snapshots for ~2 years; monthly rollups forever. Broken-thesis records are never deleted.

### 8.3 What memory powers

- **Analog search** at real depth: "this setup resembles the 2026 datacenter-power squeeze at week 3" with actual base rates, replacing today's session-local analogs.
- **Prediction accountability:** every forward view is a record that resolves; hit rates by entity class and confidence band become an input to the confidence model itself (calibration loop).
- **"What changed"** as a first-class query for every surface and for Alerts: diff two snapshots at any granularity.
- **Regime tagging:** label periods (rate regime, risk regime) so analogs compare like with like.
- **Backtesting narratives:** when did the graph first connect driver X to company Y, and what would acting on it have meant? This is the long-term moat.

---

## 9. Intelligence Questions - the standard profile

Every first-class entity (company, ETF, theme, narrative, sector, driver) must be able to answer a fixed set of questions. This is the **Intelligence Profile** - the single interface every surface consumes (section 10).

| Question | Contract | Powered by (today) |
|---|---|---|
| **What is it?** | one-sentence identity + type + key attributes | `crossIntel.what`, entity metadata |
| **Why does it matter?** | current thesis and its causal position | `crossIntel.why`, causal chain from `causalMap` |
| **What is driving it?** | ranked upstream drivers/themes with edge types and strengths | graph upstream walk (Explorer "Primary Drivers" panel logic) |
| **Who benefits?** | ranked downstream beneficiaries | downstream expansion (`expandMap("downstream")`) |
| **Who is harmed?** | entities on `weakens`/competitive edges | weakens-group edges (Explorer "Thesis Risks") |
| **What could break this thesis?** | explicit invalidation conditions | `predictionEngine` invalidation + contradictions |
| **How confident are we?** | score + full factor decomposition (section 6) | `evidenceEngine` verdict + breakdown |
| **What evidence supports this?** | citable evidence list, quality-tiered | evidence engine + (future) evidence log |
| **What has changed recently?** | deltas since last snapshot: new edges, trend flips, confidence moves | memory engine / theme snapshots deltas |

**Contract notes:** every answer is either sourced or explicitly absent (`insufficient_signal` / hidden section - the existing pattern). Answers return data, not prose, so each surface renders in its own voice; prose templates live at the edge (as `edgeExplanation` does today).

---

## 10. System Architecture

### 10.1 Layering

```
┌────────────────────────────────────────────────────────────────┐
│ SURFACES   Explorer · Feed · Markets · Industries · M&A ·      │
│            Private · Listen · Saved · Alerts* · AI assistant*  │
├────────────────────────────────────────────────────────────────┤
│ PROFILES   Intelligence Profile API (section 9)                │
│            one read model per entity; per-surface projections  │
├────────────────────────────────────────────────────────────────┤
│ ENGINES    evidence · prediction · causal projection ·         │
│            confidence* · memory · narrative derivation*        │
├────────────────────────────────────────────────────────────────┤
│ ONTOLOGY   intelligence graph: entities + typed relationships  │
│            (this document is its specification)                │
├────────────────────────────────────────────────────────────────┤
│ OBSERVA-   normalized ProviderObservations + feed/listen/deal  │
│ TIONS      adapters; quality scoring; evidence log*            │
├────────────────────────────────────────────────────────────────┤
│ PROVIDERS  backend theme/story pipeline · SEC · FRED · FMP ·   │
│            future: transcripts, options flow, filings search   │
└────────────────────────────────────────────────────────────────┘
                          (* = future)
```

Rules: surfaces call profiles; profiles call engines; engines read the ontology; only observations write to it. No layer skips downward more than one level, except read-only debug tooling.

### 10.2 Per-surface consumption (target)

- **Explorer:** already the reference consumer (graph + engines + causal projection). Migrates from bespoke assembly in `page.tsx` to the Profile API when it exists.
- **Feed:** ranks stories by their evidence value to active themes (theme-gated ranking already exists in `feedRanker.ts`); story cards get "why this matters" from the profile of their strongest-linked entity.
- **Markets:** the snapshot/leaderboard/transmission map read from causal projections instead of `marketsShared` bespoke derivations.
- **Industries / Sectors:** sector profiles - drivers in, companies out, rotation state from prediction engine.
- **M&A:** deals become evidence generators and entities; deal pages consume acquirer/target profiles. `maIntelligence.ts` migrates from parallel logic to profile reads.
- **Private / Listen:** funding rounds and conversations are evidence classes feeding the same graph; `listenIntelligence.ts` etc. migrate the same way.
- **Saved:** saved entities subscribe to their profiles' "what changed" answer.
- **Alerts (future):** an alert IS a standing query over profile deltas ("confidence crossed 70", "trend flipped weakening", "new primary evidence on saved theme"). No new intelligence logic - only subscription + threshold on the shared model.
- **AI assistant (future):** profiles are the grounding layer. The assistant answers by reading profiles and citing their evidence lists - it never free-generates market claims. The nine questions of section 9 are literally its tool schema.

### 10.3 Conflicts with the current codebase and migration paths

| # | Conflict | Severity | Recommended migration |
|---|---|---|---|
| 1 | **Session-scoped graph:** `useIntelligenceGraph` clears and rebuilds per page-load; nothing persists except localStorage snapshots and the market observation cache | High (blocks temporal model, memory, alerts) | Keep the in-memory graph as the hot projection. Add server-side persistence UNDER it (observations + daily snapshots + evidence log in Supabase), hydrating the client graph. Never make surfaces talk to the server store directly - the graph stays the read interface |
| 2 | **Parallel per-page intelligence libs** (`maIntelligence`, `sectorIntelligence`, `listenIntelligence`, `watchlistIntelligence`, `industryIntelligence`) each re-derive entity reads | Medium (drift risk, triple maintenance) | Introduce the Profile API as a thin composition of existing engines; migrate one page per sprint. Do not big-bang rewrite - these libs work |
| 3 | **Narrative type exists but has no semantics** (treated as Theme everywhere) | Low | Section 4: derived narratives first; do not promote the stored type yet |
| 4 | **Max-merge confidence on edges** ignores independence and never decays | Low in-session; High once persisted | Compute-on-read factor model over persisted history (section 6.3); leave in-session merge alone |
| 5 | **Atomic evidence discarded after ingestion** (counters only) | Medium | Evidence log (section 5.4), additive |
| 6 | **Theme identity is name-based**; renames orphan memory | Medium | Driver-set keys + alias-resolved ids for memory attachment (section 8.2) |
| 7 | **Open unions drift** (types used in practice missing from KNOWN_* lists) | Low | Update the reference vocabularies; add a diagnostics check (the integrity validator in `intelligenceGraphDebug.ts` is the natural home) |
| 8 | **Backend/frontend split brain:** the Python backend computes theme intelligence; the TS frontend computes the graph. Two ontologies could diverge | Medium, growing | This document is the shared contract. Backend emissions (`theme_intelligence`, clusters) should converge on the entity/relationship vocabulary here; any new backend field gets a mapping in the adapters the same sprint it ships |

### 10.4 Sequencing recommendation (future sprints, in order)

1. **Vocabulary closure** - align KNOWN_* lists and adapter emissions with sections 2-3 (hours, not days).
2. **Profile API v0** - compose existing engines behind the nine questions; port the Explorer left column and drawer to it as proof.
3. **Evidence log** - persist trimmed observations server-side, linked to edges.
4. **Server memory** - daily snapshots + event log; retire localStorage as the primary store (keep as offline cache).
5. **Temporal fields** - velocity/acceleration/lifecycle computed from server snapshots.
6. **Derived narratives** - phase 1 clustering as a projection.
7. **Alerts** - subscriptions over profile deltas.
8. **Confidence v2** - factor model computed on read over the evidence log, with calibration from resolved predictions.

Each step is additive; none requires refactoring a working system ahead of need.

---

## Appendix A - Glossary

- **Entity:** a node in the intelligence graph (section 2).
- **Relationship / edge:** a typed, directional, evidence-bearing link (section 3).
- **Observation:** one normalized input from a provider or page before it touches the graph.
- **Evidence:** an observation retained as support/opposition for a specific claim (section 5).
- **Profile:** the standard nine-question read model of an entity (section 9).
- **Transmission chain:** an ordered causal path Driver -> Theme -> Sector -> Company -> Evidence.
- **Projection:** any read-only derivation of the graph for display (causal map, drawer map, market map).
- **Verdict:** the evidence engine's bounded conclusion (`strong / moderate / weak / insufficient_signal`).

## Appendix B - Document maintenance

This file is canonical. Changes to the entity or relationship vocabulary, the confidence factors, or the layering rules require updating this document in the same PR. The validation suite (`intelligenceTests.ts`) is the executable shadow of sections 2, 3, 5, and 7; when they disagree, the tests are wrong or this document is - resolve explicitly, never silently.

**Memory (Phase 3):** durable history of the vocabulary defined here - entity/relationship/narrative snapshots, transitions, predictions, and outcomes - is specified in `ARGUS_INSTITUTIONAL_MEMORY_V2.md`. Canonical UIDs there wrap (never replace) the ontology keys defined in this document.
