# Argus Intelligence Everywhere v1 - the Phase 2 Roadmap

**Status:** Implementation roadmap (Phase 2 kickoff, 2026-07). Documentation only; no production behavior changed in this sprint.
**Parents:** `docs/ARGUS_INTELLIGENCE_SURFACES_V1.md` (product architecture: pipeline rule, ownership, per-surface questions - this document is its implementation plan), the engine docs (model / profiles / narrative / centerpiece / morning brief v2).
**Rule being implemented:** every page projects intelligence; no page computes it. Morning Brief must never disagree with Explorer; Explorer never with Feed; Markets never with Industries. **There is exactly one intelligence model.**

---

## 1. The audit - where intelligence actually comes from today

Measured against the codebase (2026-07-09):

### 1.1 Engine consumption map

| Surface | Builds graph? | Profiles | Narratives | Evidence engine | Prediction engine | Memory | Runs on |
|---|---|---|---|---|---|---|---|
| **Morning Brief** | yes (`useMorningBrief`) | yes (priority factor) | yes (The Read) | yes | yes (incl. `rankFutureOpportunities`) | server ThemeMemory + device + deltas | **the engines** ✓ |
| **Explorer** | yes | yes (`useIntelligenceProfile`) | not yet (membership section pending) | yes | yes | yes | **the engines** ✓ |
| **Drawer/FocusBar** | yes (different inputs) | no (`buildForecast` fallback path) | no | yes | yes | yes | engines, pre-profile reads |
| **Feed** | no | no | no (ad-hoc `buildMarketStory`) | no | no | no | theme fields + `feedRanker` + `marketMap` |
| **Markets** | no | no | no | no | no | no (single-snapshot heuristics) | `marketsShared` + `themeEvolution`/`themeMomentum`/`themeSignalDelta` |
| **Industries/Sectors** | no | no | no | no | no | no | `sectorIntelligence` (1,153 lines) + `industryIntelligence` (323) |
| **M&A** | no | no | no (hardcoded `narrativeGraph`) | no | no | no | `maIntelligence` (1,184 lines) + curated dictionaries |
| **Listen** | no | no | no | no | no | no | `listenIntelligence` (298) + `episodeIntel` (180) |
| **Saved** | no | no | no | no | no | own third memory system | `watchlistIntelligence` (187) |
| **Private** | no | no | no | no | no | no | `capitalFlowIntel` (192) |

The headline: **the engines have exactly two production surfaces.** Seven of nine run on roughly 4,500 lines of page-local derivation - theme-field templates, hardcoded entity dictionaries, and three separate localStorage memory systems.

### 1.2 The structural bug Phase 2 must fix first

Three callers build the shared graph singleton with **different input sets**: Explorer (themes + stories + episodes + deals + snapshots), the Drawer (its own set), the Morning Brief (themes + clusters only). The graph's contents - and therefore every engine read - **depend on which surface built it last and what data that surface happened to load.** Today the homepage's evidence verdict for a theme can differ from Explorer's for the same theme in the same session. This silently violates the one-model rule even between the two surfaces that already consume the engines. Fixing provisioning is the precondition for everything else (P2.0).

## 2. Shared ViewModel architecture

Phase 2 standardizes the pattern B1-B4 proved, as the required shape for every surface:

```
ENGINES (exist, untouched)     graph · profiles · narratives · evidence ·
                               prediction · memory · deltas · theRead ranking
        ↓
PROVISIONING (new, P2.0)       useArgusIntelligence(): ONE canonical graph
                               build from the full input set (feed themes +
                               clusters + deals + episodes + snapshots +
                               cached market observations), one `ready` tick,
                               one profile cache per build
        ↓
VIEW MODELS (lib/*.ts, pure)   buildXxx(inputs) - relative imports, injected
                               data, ProfileSection statuses on every field,
                               deterministic, tsx-tested
        ↓
HOOKS (hooks/useXxx.ts)        thin memoization + injection glue only
        ↓
SURFACES                       render VMs in their own voice; zero meaning
```

**View-model rules (all proven in B1-B4):** injection not fetching; every section `live | partial | unavailable` with notes; summarizer/backend prose typed as voice; personalization inputs adjust ordering only, badged; heuristic rankings labeled heuristic with decomposed reasons; every number decomposes; tests pin determinism, honesty, and no-fabrication.

**Existing VMs (reuse, never duplicate):** `IntelligenceProfile`, `DerivedNarrative`, `MorningBriefVM`, `ReadVM` (thesis/evidence/exposure/chain/watch/falsifiers/priorities/catalysts/queue), `MorningBriefDelta`, the drawer/Explorer view models in `intelligenceShared`.

**New shared abstractions required (the complete list):**

| Abstraction | What it is | Unblocks |
|---|---|---|
| A1 `useArgusIntelligence()` | canonical graph provisioning (section 1.2); all current `useIntelligenceGraph` call sites migrate to it | everything; the non-disagreement invariant |
| A2 Profile cache | one `buildIntelligenceProfile` result per entity per graph build (profile doc step 2) | drawer, Feed cards, leaderboards, pinned panels |
| A3 `diffProfiles(a, b)` | profile-level delta primitive (profile doc step 3) | Saved, Alerts, richer Z1 |
| A4 Entity-context VM | `buildEntityContext(entity)` - the drawer/FocusBar quick read as a profile projection; retires `buildForecast` and narrows `crossIntel` to narrative injection. **P2.3x delivered its risk slice:** `lib/riskRead.ts` (contradictions/invalidation/weakening/watch/catalysts as a thin profile projection); the full quick-read VM remains P2.7 | Drawer, Feed story cards, Saved rows |
| A5 Read components | the Read's row/chip/spine renderers extracted as shared components (EvidenceRow, DeltaRow, TransmissionSpine, PriorityRow, ConvictionStat) | every migration renders identically with zero new UI systems |

Nothing else is missing. Every page need below maps onto existing engines plus A1-A5.

## 3. Page consumption map

Per surface: the user's question -> which profile sections / narratives / evidence / prediction / memory answer it -> what is duplicated today -> the verdict.

### 3.1 Feed - "what does today's information do to what Argus believes?"
- **Profile sections:** `thesis`, `evidence`, `confidence` of a story's strongest-linked entity (the "why this matters" line on cards, via A2 cache).
- **Narratives:** `deriveNarratives()` replaces `buildMarketStory`/`marketMap`'s ad-hoc synthesis; the hero renders the same DerivedNarrative The Read shows, in feed voice.
- **Evidence:** stories ARE the evidence; the evidence engine's source tiers badge them.
- **Prediction/memory:** theme forward views + deltas for the hero's "what changed" strip.
- **Duplicated today:** `marketMap.buildMarketStory` (narrative synthesis), `themeTransmission` watch/driver lines (already mirrored in `intelligenceDeltas` - consolidate to one home).
- **Stays surface-owned:** `feedRanker` (ranking policy), card voice.

### 3.2 Markets - "where is capital moving; which theses strengthen or weaken?"
- **Profile sections:** `confidence`, `thesis.forward`, `evolution` aggregated into leaderboards.
- **Narratives:** leaderboard grouping by DerivedNarrative (story-level rows above theme rows).
- **Evidence:** evidence-by-theme panel reads verdicts, not bespoke counts.
- **Prediction:** `predictSectorRotation` powers the rotation read.
- **Memory:** the movers/"what changed" modules read `deriveMorningBriefDeltas` - **`themeSignalDelta`'s "weekly change narrative" is a page-local reimplementation of the change ledger and retires.**
- **Duplicated today:** `marketsShared` derivations, `themeEvolution` states rendered as if temporal (single-snapshot heuristics), `themeSignalDelta`, `themeMomentum` sub-scores.
- **Stays:** aggregation choices, board layout, `cleanThemeName` cosmetics.

### 3.3 Explorer - already the reference consumer
- Remaining work: narrative membership section (`findNarrativeForTheme`) on the profile; pinned-panel reads via A2; delete `buildForecast` after the drawer migrates (A4).

### 3.4 Industries / Sectors - "how does this sector transmit the active narratives?"
- **Profile sections:** the sector's own profile answers this shape exactly - `drivers` (in), `beneficiaries` (member companies, out), `transmission`, `confidence`.
- **Narratives:** which DerivedNarratives touch the sector (exposure membership).
- **Prediction:** `predictSectorRotation`. **Evidence:** sector-scoped verdicts. **Memory:** sector-linked deltas.
- **Duplicated today (worst offender):** `sectorIntelligence` - 1,153 lines including a hardcoded `SECTOR_ENTITIES` dictionary (static editorial data impersonating graph relationships) and template generators (`generateThesis`, `getPositioningNarrative`, `getRiskFactors`, `getKeyDrivers`) that re-derive what profiles answer. `industryIntelligence` repeats the pattern smaller.
- **Stays:** sector identity system (icons/artwork), page order, deal-list presentation.

### 3.5 M&A - "what does deal activity confirm about the narratives; who is buying the future?"
- **Profile sections:** acquirer/target profiles (`identity`, `thesis`, `confidence`); deal pages become two profile reads plus deal facts.
- **Narratives:** which narrative a deal evidences (deal -> theme edges already enter the graph via adapters).
- **Evidence:** deals as evidence generators - the evidence engine grades theme confirmation instead of page-local "regime metrics".
- **Duplicated today:** `maIntelligence` is two libraries fused: (a) deal-fact extraction (facts-or-blank - keeps, surface-owned) and (b) meaning - `companyPeers`/`resolveSectorRoles` hardcoded peer/supplier dictionaries duplicating graph edges, `buildMarketRegime` scoring, `comparablesFor` curated data. The page also imports `narrativeGraph` (curated `NARRATIVE_GRAPH`) - editorial data wearing intelligence authority.
- **Stays:** extraction, league tables (arithmetic over facts), capital-flow visualization.

### 3.6 Listen - "what is the conversation ahead of the tape?"
- **Profile sections:** discussed entity's `thesis`/`confidence` powers "why listen"; episodes join the entity's evidence trail as tertiary tier.
- **Narratives:** conversation momentum vs the narrative's member convictions (early-warning divergence).
- **Duplicated today:** `matchEpisodeThemes` (local entity resolution duplicating the graph's alias machinery), `generateWhyListen` + `episodeIntel` implication/beneficiaries (profile reads reimplemented), `contradictingEpisodes` (contradiction detection outside the evidence engine).
- **Stays:** player, hero presentation, speaker extraction (NLP-ish parsing, not intelligence).

### 3.7 Saved - "what changed in what I watch?"
- **Consumes after migration:** `deriveMorningBriefDeltas` filtered to saved/followed entities (it was built with Saved as a designated consumer), profile `evolution`, A3 `diffProfiles` when it lands.
- **Duplicated today:** `watchlistIntelligence` maintains a **third parallel memory system** (own localStorage snapshots + own delta computation) alongside `themeSnapshots` and `memoryEngine`. Three memories is two too many; this is the cleanest kill in the whole phase.

### 3.8 Private - "what is private capital doing before public prices show it?"
- **Consumes after migration:** narrative exposure for where flows point; theme profiles for the public echo; private signals as an evidence class.
- **Duplicated today:** `capitalFlowIntel`'s meaning-shaped outputs (`takeaways`, `biggestFlow`, `flowPressure` verdict lines) - heuristics that should become narrative/profile reads or be explicitly labeled presentational.
- **Stays:** the chain choreography (packet animation, hover propagation) - presentation, and good.

## 4. Technical debt register (duplicated intelligence)

Ordered by severity (drift risk x line count x authority worn):

| # | Debt | Duplicates | Disposition |
|---|---|---|---|
| D1 | ~~Divergent graph provisioning (3 builders, 3 input sets)~~ **Resolved in P2.0** (2026-07-09): all builders on `useArgusIntelligence` | the one-model rule itself | done |
| D2 | `sectorIntelligence` thesis/risk/driver templates + `SECTOR_ENTITIES` | profiles, graph exposure | migrate P2.5; dictionary retires when graph coverage matches, else becomes labeled seed data for adapters |
| D3 | `maIntelligence` meaning half + `companyPeers` dictionaries + `narrativeGraph` curated map | graph edges, profiles, DerivedNarrative | split P2.6; curated data may seed the graph via adapters (becoming real, sourced edges) but may not render directly |
| D4 | `watchlistIntelligence` snapshot store | `intelligenceDeltas` + memory engines | replace P2.1 (delete the store) |
| D5 | ~~`themeSignalDelta` change narrative + `themeEvolution`/`themeMomentum` as rendered intelligence~~ **Resolved on unified surfaces (2026-07-10, P2.3x):** `generateWeeklyChange` deleted (one snapshot cannot narrate a week); ThemeDrawer change lines now read server ThemeMemory (`memorySentences`) with an honest current-state fallback; `themeEvolution` states demoted to labeled CURRENT-STATE badges everywhere they render on Markets. `getEvolutionNarrative` + evolution badges survive only on unmigrated surfaces (Industries, M&A, Private) and retire with P2.5/P2.6 | change ledger, ThemeMemory trends | done for unified surfaces; remainder rides P2.5/P2.6 |
| D6 | ~~`buildMarketStory` / `marketMap` hero synthesis~~ **Resolved** (2026-07-09): deleted; hero re-voices the Read thesis via `feedNarrative.buildMarketStoryVM` | DerivedNarrative + The Read thesis | done |
| D7 | `listenIntelligence` matching + `episodeIntel` implications | graph aliases, profiles, evidence engine | P2.4 |
| D8 | `buildForecast` (drawer path) + wide `crossIntel` | profile `thesis`/`risks` | A4, P2.7; `crossIntel` narrows to narrative injection |
| D9 | ~~watch/driver derivation in two homes (three counting `MarketTransmission.tsx`)~~ **Resolved** (2026-07-09): `intelligenceDeltas` is the one home; `themeTransmission` delegates (+ cosmetic label wrapper); the component copy deleted | itself | done |
| D10 | `capitalFlowIntel` meaning outputs | narratives/profiles | P2.6 |
| D11 | **(registered 2026-07-10, P2.3x)** the securities dictionary tail in `themeIntelligence` (`secEntryFor` powering `securitiesForSector`, `bestExpressions.why`, `themeLosers.loseWhy`, and the low-coverage tail of `themeBeneficiaries`) - editorial data wearing exposure/risk authority | graph beneficiaries/weakening edges | retire with D2's dictionary work at P2.5; unified-surface hero/command-center reads already prefer graph exposure with the stored tail as a labeled fallback |
| D12 | **(registered 2026-07-10, P2.3x)** remaining theme-field template generators on Feed drawers (`generateThesis`, `generateBullBearCases`, `generateIntelligenceBriefing`, `explainMechanism`, `WATCH_RULES`/`INVALIDATION_RULES` keyword fallbacks, `themeCompany`/`themeImpact` exposure math, `crossIntel` risk/opportunity lines) | profiles, narratives, prediction engine | watch/invalidation/contradiction/catalyst paths are now graph-first with LABELED graphless fallbacks (P2.3x); the prose generators retire with A2/A4 at P2.7 |

Additions this sprint (P2.3x): `lib/intelligenceOwnership.ts` is the concept ownership registry - one owner per concept, sanctioned projections, and the labeled-fallback rule. New code that introduces a second owner for a listed concept fails review against it.

Freeze rule (surfaces doc): all of the above are frozen now - bug fixes only; any change must be mirrored in the owning engine.

## 5. Reusable intelligence components (A5)

Extract from The Read/Explorer as shared renderers so migrations change data sources, not pixels: `ConvictionStat` (number + decomposition tooltip), `EvidenceRow` (class badge · assertion · reliability/strength), `DeltaRow` (kind badge · what · why), `TransmissionSpine` (vertical hop chain with edge trends), `PriorityRow` (score · entity · reasons · YOURS), `FalsifierBlock` (three kinds + absence warning), `SectionStatus` (the partial/unavailable note renderer). All already exist as inline JSX in `page.tsx`/Explorer; extraction is mechanical. Together with the existing `EntityChip`, graph components, and drawer, this is the complete shared UI kit - no migration may invent a new way to render confidence, evidence, deltas, or transmission.

## 6. Migration order and phases

Dependency-driven; one surface per sprint; every sprint keeps the B-series gates (tsc, intelligence tests, build, zero intended visual change) plus the new consistency suite.

| Phase | Scope | Acceptance criteria |
|---|---|---|
| **P2.0 Foundation - DONE (2026-07-09, A1 + consistency suite; A2 profile cache deferred to P2.7 alongside the drawer migration)** | **Ownership:** `lib/intelligenceProvisioning.ts` is the canonical provisioning contract (`CanonicalIntelligenceInputs`, `canonicalGraphState`, `provisionGraphState` - the ONLY permitted clear/rebuild sequence) and `hooks/useArgusIntelligence.ts` is the only hook surfaces may mount (gathers themes + clusters + deals + episodes + snapshots, accrues daily theme memory once, exposes the gathered data so surfaces never re-fetch). Migrated: Explorer, IntelligenceDrawer, useMorningBrief - all three former builders (D1 resolved). `useIntelligenceGraph` demoted to internal bridge (P2.0 note in its header); it routes through `provisionGraphState`, so even a rogue direct call uses the one rebuild sequence. Remaining sanctioned graph writers: the ADDITIVE market-observation ingest (`useExplorerMarketData` -> `ingestProviderObservations`) and cached-observation reingest inside the sequence itself. Legacy callers remaining: none. Consistency suite 82.x: determinism/idempotence, same-entity-same-numbers across the Morning Brief / The Read / profile / narrative paths, the reduced-rebuild hazard demonstrated and shown restored by canonical re-provisioning, honest degradation on empty inputs. | one graph build path ✓; 82.x green ✓; no surface regressions ✓ |
| **P2.1 Saved** | `watchlistIntelligence` replaced by `intelligenceDeltas` + profile evolution; its snapshot store deleted | D4 gone; Saved shows the same deltas the brief shows, filtered; one fewer memory system |
| **P2.2 Feed - DONE (2026-07-09; executed before P2.1 Saved by direction)** | `lib/feedNarrative.ts` (`buildMarketStoryVM`): the hero's "Today's Market Story" re-voices the SAME Read thesis - sentence 1 is `thesis.thesisLine` verbatim, movers are the narrative members, the watch line is the shared derived watch item; built over `useArgusIntelligence` + `buildTheRead` from canonical (never personalized) themes. `marketMap.buildMarketStory` + `confirmSignal` **deleted** (D6). D9 consolidated: `themeTransmission.deriveDriver/themeWatch` delegate to `intelligenceDeltas.driverOf/watchLineOf` (one home + cosmetic label wrapper), and `MarketTransmission.tsx`'s third local copy removed. Tests 83.x pin hero === Read thesis and honest degradation. **Remaining feed debt (deferred):** `buildFocusStory` per-node quick read (-> A4 entity-context VM, P2.7); ~~`IntelligenceWorkspace.buildReasoning` + `generateNextCatalysts`~~ resolved P2.3x (2026-07-10): the catalyst generator is deleted and `buildReasoning`'s catalyst/invalidation are shared riskRead records (its prose template remainder is D12); story-card "why this matters" profile reads await the A2 profile cache; `feedRanker`/`tierOf` stay (surface-owned policy). | D6, D9 gone ✓; hero thesis === The Read thesis (83.x) ✓ |
| **P2.3 Markets - DONE (2026-07-09, core spine; executed as user sprint "Phase 2.2")** | `lib/marketsIntel.ts` (`buildMarketsIntel(read, deltaResult)`): Markets carries the shared `ReadVM` **by reference** and re-groups the shared ledger by narrative membership (narrative vs broader - rotations, not tickers). Page wiring: `useArgusIntelligence` + `buildTheRead` over canonical themes (never the `visible` filter). `DominantNarrativeBase`: headline = the Read's `thesisLine` (local `deriveWhatHappened`/`deriveWhy` demoted to no-thesis fallback), "Confidence NN%" cell (which read `brief.confidence` - the summarizer number) replaced by **Conviction** = leading member's backend read with decomposition tooltip; traceability tooltip names the derived narrative. New sections in page style: "What Changed" (grouped ledger, NARRATIVE-badged rows) and "Invalidation & Watch" (Read falsifiers + standing contradiction; watch items DERIVED; catalysts VERIFIED·NO DATE; honest "No confirmed catalyst" state). `deltasToSection` extracted to `intelligenceDeltas` as the ONE ledger-status policy home (Morning Brief refactored onto it). Tests 84.x pin: same Read by reference, ledger records + statuses byte-match the brief's, narrative grouping, honest degradation. **Remaining Markets debt:** ~~resolved in P2.3x (2026-07-10)~~ - `generateWhyItMattersNow` deleted (impact = `marketsIntel.impact` + `themeImpactBullets`); beneficiary chips read shared exposure/graph beneficiaries with labeled stored fallback; drawer conflicts are shared evidence-engine records via `riskRead` (page-local detector = labeled graphless fallback); the Transmission Map is graph-recorded chains with the stored-field chain as the labeled fallback. Still open on Markets: the D11 securities dictionary inside `SectorPositioning` exposures (`securitiesForSector`/`bestExpressions`) and `deriveKeyRisk`, which retire with P2.5's dictionary work. | Markets thesis === Read thesis (84.x) ✓; ledger byte-match ✓; conviction decomposes ✓ |
| **P2.3x Intelligence Consistency - DONE (2026-07-10; executed as user sprint "Phase 2.4", before P2.1 Saved and P2.4 Listen)** | Consolidation, no migrations. **Ownership registry:** `lib/intelligenceOwnership.ts` (one owner per concept; projections; labeled-fallback rule). **Contradictions/risks:** `lib/riskRead.ts` is the one shared per-entity contradiction/risk/watch/catalyst projection (thin over `buildIntelligenceProfile`, so drawer records are byte-identical to Explorer/profile/evidence-engine records); Markets' page-local `detectContradictions` and the keyword `generateWatchSignals`/`generateInvalidationSignals` demoted to graph-unavailable fallbacks rendered with explicit STORED-FIELD READ labels. **Catalysts:** vocabulary enforced (watch item = derived dateless; catalyst = verified series relationship; dated catalyst = unavailable until a real Event provider). The placeholder economic calendar, `generateNextCatalysts`, and `marketCatalystRadar` DELETED (~350 lines); `theRead.verifiedCatalystsFor` extracted as the one home; Markets command center/drawer, feed ThemeDrawer/IntelligenceWorkspace/IntelligenceStream all render VERIFIED / NO DATE records. **Transmission:** Markets' Transmission Map is graph-recorded per-theme chains (profile drivers/beneficiaries) when provisioned; the stored-field chain survives only as the labeled fallback, never blended; `themeTransmission` header marks it the fallback home. **Evolution:** `generateWeeklyChange` deleted; ThemeDrawer change lines read server ThemeMemory; evolution badges labeled current-state (D5). **Impact/beneficiaries:** `generateWhyItMattersNow` deleted; Markets hero impact = `marketsIntel.impact` (Read exposure + ledger matters lines) and hero beneficiaries = the Read's shared exposure; per-theme Wins/Loses read graph beneficiaries/weakening edges with the labeled stored fallback; sector cards use `themeImpactBullets` (recorded facts, no advice); the summarizer confidence % removed from the Markets regime strip; dead `MarketTransmission.tsx` deleted. Consistency suite 85.x (7 tests) pins record identity across surfaces, recorded-edge transmission, memory-owned evolution, dateless catalysts, and consistent sparse degradation. | one owner per concept ✓; 85.x green (138/138) ✓; tsc + build green ✓; no visual redesign ✓ |
| **P2.4 Listen** | episode matching -> graph alias resolution; why-listen/implications -> profile reads; episodes enter evidence trails | D7 gone; episode claims carry evidence-tier badges |
| **P2.5 Industries/Sectors** | sector pages -> sector profiles + rotation + narrative exposure; retire template generators; `SECTOR_ENTITIES` becomes adapter seed data or dies | D2 gone; a sector's drivers/beneficiaries identical to Explorer's for the sector entity |
| **P2.6 M&A + Private** | `maIntelligence` split (facts stay); peers/roles from graph; deals graded as evidence; curated maps demoted to adapter seeds; `capitalFlowIntel` meaning -> narrative reads | D3, D10 gone; acquirer read on M&A === acquirer profile in Explorer |
| **P2.7 Drawer + closure** | drawer -> A4 entity-context VM over cached profiles; delete `buildForecast`; narrow `crossIntel`; Explorer narrative-membership section | D8 gone; profile doc consolidation table fully "done" |

Rough sizing: P2.0 and P2.5 are the heavy sprints; P2.1 is deliberately first-and-small (momentum + deletes a whole subsystem). Bundle guardrail throughout: shared VMs must not push page First Loads materially; A1/A2 amortize the engine cost that B1-B4 added to the homepage.

## 7. Global acceptance criteria (Phase 2 is done when...)

1. **One provisioning path:** exactly one hook builds the graph, with one canonical input set.
2. **The consistency suite passes:** same entity, same numbers, any path (the executable form of "Morning Brief never disagrees with Explorer").
3. **The debt register is empty:** D1-D10 resolved; per-page libs contain only presentation and fact extraction.
4. **No page-local meaning:** grep-level check - no surface file computes a score, verdict, narrative, or delta; the surfaces doc's bypass test (5.4) holds everywhere.
5. **Every rendered number decomposes** and every section carries a status - on all nine surfaces, not two.
6. **New-feature test:** a hypothetical new surface (e.g. the Email Brief) can ship by writing one VM + one renderer, touching zero engines - proving the platform claim.

## 8. Maintenance

This document is the Phase 2 execution contract. Each P2.x sprint updates its row (done + date + deviations) in the same PR, and strikes its debt items from section 4. The surfaces doc governs per-surface ownership; engine docs govern semantics; when a migration reveals a missing engine capability, the capability is added to the engine with tests first, never inlined in the surface.
