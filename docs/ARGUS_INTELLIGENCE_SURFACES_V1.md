# Argus Intelligence Surfaces v1 - the Product Architecture

**Status:** Canonical product architecture (Product Architecture Sprint, 2026-07). Documentation only; no code changed in this sprint.
**Governs:** how every Argus surface, present and future, exposes the intelligence architecture. Every future product sprint starts here.
**Parents:** `docs/ARGUS_INTELLIGENCE_MODEL_V1.md` (ontology, invariants, layering - canonical for *what intelligence is*), `docs/ARGUS_INTELLIGENCE_PROFILE_V1.md` (the per-entity read model), `docs/ARGUS_NARRATIVE_ENGINE_V1.md` (DerivedNarrative), `docs/ARGUS_MORNING_BRIEF_V2.md` (the brief's IA). Where this document and an engine doc disagree about intelligence semantics, the engine doc wins; where any doc disagrees about *product surface behavior*, this document wins.

---

## 1. Product Philosophy

### 1.1 Why Argus has multiple surfaces

Argus is one reasoning system - a causal graph with evidence, predictions, and memory - observed through different lenses. Surfaces exist because a professional investor asks the same underlying questions at different **altitudes** and **moments**:

- *Before the open:* "what do I need to know?" (synthesis)
- *Positioning:* "where is capital moving?" (aggregation)
- *Investigation:* "why is this moving, and what breaks it?" (depth)
- *During the day:* "what does this new information do to what I believe?" (evidence)
- *Standing watch:* "what changed in the things I care about?" (deltas)

One page cannot serve all five without becoming a portal. Multiple surfaces are justified **only** as different projections of the same intelligence; the moment a page computes its own version of confidence, narrative, or evidence, it stops being a lens and becomes a second brain. Argus has exactly one brain.

### 1.2 What makes an intelligence surface different from a dashboard

A dashboard shows **state**: numbers, charts, lists. It answers "what is". An intelligence surface answers the model doc's four questions - *what is happening, why, what next, how certain* - and can defend every answer:

| Dashboard | Intelligence surface |
|---|---|
| Shows a number | Shows a number that decomposes on demand (I4) |
| Shows what is | Leads with **what changed** and why it matters |
| Organizes by data type (news, prices, sectors) | Organizes by **claim** (narrative, thesis, risk) with data as evidence beneath |
| Neutral, opinionless | Has an opinion - with the falsifier attached |
| Empty states are padding | Absence is honest and typed (`ProfileSection` status; I1) |
| Each widget owns its logic | Every panel is a projection of the shared graph/engines (I5) |

The test every surface inherits from the Morning Brief doc: *does this help a professional investor understand the market better than Bloomberg, CNBC, or a generic AI summary?* A dashboard never passes; a lens over a reasoning system can.

## 2. The Intelligence Pipeline

The complete flow, refining the model doc's layering (10.1) with the systems that now exist:

```
PROVIDERS      backend theme/story pipeline · SEC · FRED · FMP · Listen ·
               M&A/Private feeds · future: transcripts, calendars, options flow
   ↓
OBSERVATIONS   normalized ProviderObservations + feed/listen/deal adapters;
               provider reliability x freshness quality scoring
   ↓
EVIDENCE       edge counters + originatingPages today; evidence-bearing nodes
               (Story, Podcast, MarketMetric); atomic evidence log = future
   ↓
THEMES         backend theme_intelligence (the primary sourced unit) with
               attached cross-session ThemeMemory; graph Theme nodes
   ↓
RELATIONSHIPS  the intelligence graph: typed, directional, evidence-weighted
               edges; causal layers Driver→Theme→Sector→Company→Evidence
   ↓
DERIVED        deriveNarratives(): ephemeral driver-set groupings over themes
NARRATIVES     (never stored; derived marker; no blended confidence)
   ↓
PROFILES       buildIntelligenceProfile(): the nine-question read model per
               entity; ProfileSection statuses; the universal honesty wrapper
   ↓
SURFACES       Morning Brief · Feed · Markets · Explorer · Industries · M&A ·
               Private · Listen · Saved · (Alerts, API, Assistant ...)
```

**The pipeline rule: no surface bypasses it.** Surfaces read profiles, derived narratives, and engine projections; they never read providers directly, never re-derive relationships from raw feed fields, and never mint their own scores. Two sanctioned exceptions, both temporary: (a) summarizer prose may render as **voice** over engine output, never as facts (Morning Brief doc section 6); (b) legacy per-page libs (section 5.3) remain until their migration sprint - frozen, not extended.

## 3. Surface Catalog

Format per surface: the question it answers / intelligence objects consumed / what must never appear / what is clickable / what leads into Explorer.

### 3.1 Morning Brief (`/`)

- **Question:** "If I had five minutes before the open, what does Argus believe I need to know?" Change, causality, conviction, opportunity - not chronology.
- **Consumes:** `MorningBriefVM` (`buildMorningBrief`) exclusively - which composes theme intelligence + ThemeMemory deltas, evidence/prediction reads, and (per v2 doc B2/B3) the delta ledger, top DerivedNarrative, and one transmission chain.
- **Never appears:** a raw story stream; any number that cannot decompose (the summarizer's self-assessed confidence is permanently banned); fabricated calendars/countdowns; marketing copy for signed-in users.
- **Clickable:** every entity (theme, driver, ticker, sector) via the shared entity chips; every delta line; every watch item.
- **Leads to Explorer:** the dominant narrative's anchor driver and members; any transmission-chain hop; any risk falsifier's subject.

### 3.2 Feed (`/feed`)

- **Question:** "What does today's information flow do to what Argus believes?" The Feed is the **evidence room** - its organizing unit is the claim a story supports, not the story.
- **Consumes:** story clusters ranked by `feedRanker` (preference-first, theme-gated); the Market Map hero + Today's Market Story (`marketMap.ts` - migrates to DerivedNarrative per v2 doc); theme intelligence; profiles for "why this matters" on cards (the profile of a story's strongest-linked entity).
- **Never appears:** stories with no path to an active theme presented as important (off-thesis stays buried); page-local conviction scores; opinion/SEO content surfaced as events (source-tier + classifier already suppress these).
- **Clickable:** every affected entity on every card; theme gates; map nodes.
- **Leads to Explorer:** any entity on a story card; the map's nodes; "investigate this narrative" from the hero.
- **Purpose shift (recommended):** the Feed stops being "the product" and becomes the evidence surface. Its hero already synthesizes narrative-shaped output ad hoc (`buildMarketStory`); that synthesis belongs to the DerivedNarrative engine, with the Feed rendering it in feed voice.

### 3.3 Markets (`/markets`)

- **Question:** "Where is capital moving, and which theses are strengthening or weakening?" The aggregation lens: leaderboards and rotation over many entities at once.
- **Consumes:** theme intelligence aggregates (snapshot, leaderboard, transmission map, evidence-by-theme - `marketsShared` today, profile/forward-view aggregates as the target); `predictSectorRotation`; DerivedNarratives for grouping the leaderboard by story rather than by theme name.
- **Never appears:** story-first modules (evidence links out to Feed); bespoke per-theme scores that differ from the shared conviction/verdict vocabulary; a second transmission visualization grammar (reuse the graph components).
- **Clickable:** every theme row, sector cell, ticker, and driver.
- **Leads to Explorer:** any leaderboard row ("why is this ranked here" is an Explorer question); any transmission-map node.

### 3.4 Explorer (`/explore/[entity]`)

- **Question:** "Why is this entity what it is - and what would change my mind?" The canonical investigation environment and the reference consumer of the whole stack.
- **Consumes:** `useIntelligenceProfile` (first production consumer), causal map + expansion, market view (FMP pipeline), timeline/memory, evidence stack, forecasts; next: `findNarrativeForTheme` membership.
- **Never appears:** editorial synthesis (the Explorer explains what the graph holds; it does not editorialize a "take"); sample scaffolding without its SAMPLE badge; dead-end entities (every node routes somewhere).
- **Clickable:** everything - every node, edge, evidence row, and analog.
- **Leads to Explorer:** it *is* the destination. Its own outbound links go to source surfaces (Feed stories, M&A deals, Listen episodes) as evidence citations.

### 3.5 Industries / Sectors (`/industries`, `/sectors`)

- **Question:** "How does this sector transmit the active narratives - drivers in, companies out, rotation state?"
- **Consumes:** sector profiles (drivers upstream, member companies downstream - the profile engine already answers this shape), `predictSectorRotation`, theme exposure per industry, the industry identity system.
- **Never appears:** per-industry scores computed by `industryIntelligence`/`sectorIntelligence` once profile aggregates exist (section 5.3); GICS trivia without causal context.
- **Clickable:** member companies, feeding themes/drivers, peer sectors.
- **Leads to Explorer:** the sector itself (`/explore/sector:*`), any member company, any feeding driver.

### 3.6 M&A (`/ma`)

- **Question:** "What does deal activity confirm or deny about the active narratives - and who is buying the future?" Deals are entities AND evidence generators (model doc).
- **Consumes:** deal facts (`maIntelligence` extraction: facts-extracted-or-blank), acquirer/target profiles, deal-to-theme confirmation edges, the reusable graph engine for capital-flow views.
- **Never appears:** invented deal terms (the facts-or-blank rule is already law here); deal "scores" disconnected from the shared vocabulary; narrative claims a deal does not actually evidence.
- **Clickable:** acquirers, targets, sectors, confirmed themes.
- **Leads to Explorer:** acquirer/target company pages; the theme a deal confirms.

### 3.7 Private Markets (`/private-markets`)

- **Question:** "What is private capital doing before it shows up in public prices?" Early-stage evidence for themes; the capital-flow chain as a live engine.
- **Consumes:** funding/flow data as a secondary evidence class feeding the same themes; theme profiles for the public-market echo of private signals; the capital flow chain (`capitalFlowIntel`).
- **Never appears:** private "signal scores" that look like conviction but decompose into nothing; fabricated fund/deal specifics.
- **Clickable:** funds, companies, sectors, linked themes.
- **Leads to Explorer:** any company or theme the chain touches.

### 3.8 Listen (`/listen`)

- **Question:** "What is the conversation ahead of the tape?" Podcasts are tertiary, early-detection evidence (model doc evidence catalogue): good for emerging narratives, low confirmation value.
- **Consumes:** episodes matched to themes; conversation momentum vs theme conviction; `episodeIntel`'s implication/beneficiaries read (migrates to profile reads).
- **Never appears:** conversational claims rendered with confirmed-evidence authority (the tier gap must stay visible); episode "intelligence" that contradicts the graph without saying so.
- **Clickable:** discussed themes, mentioned entities, episodes as evidence records.
- **Leads to Explorer:** any discussed theme or entity, carrying the episode as the evidence trail entry.

### 3.9 Saved (`/saved`)

- **Question:** "What changed in the things I chose to watch?" Saved is not a bookmark drawer; it is a **standing-query surface** - the direct precursor of Alerts.
- **Consumes:** the profiles of saved entities, specifically their delta-shaped sections (evolution, memory comparisons; `diffProfiles` when it lands); `watchlistIntelligence` today (migrates).
- **Never appears:** a static list with no change information (that is a bookmark drawer); re-derived summaries that drift from what the source surfaces show.
- **Clickable:** every saved entity; every delta line.
- **Leads to Explorer:** every saved entity, opened to the section that changed.

## 4. Surface Responsibilities (ownership)

Each surface owns its **voice, selection, and layout** - never intelligence semantics. The engines own meaning.

| Surface | Owns | Does NOT own |
|---|---|---|
| **Morning Brief** | daily synthesis; the delta ledger's editorial ordering; brief voice | profiles, narrative derivation, confidence scoring, catalyst truth (needs the Event provider) |
| **Feed** | story ranking policy (preference/theme gates); evidence presentation; card voice | story-to-theme truth (graph edges), "why it matters" logic (profiles), narrative synthesis (DerivedNarrative) |
| **Markets** | aggregation choices (which leaderboards, which cuts); rotation presentation | per-theme scoring, rotation prediction (engine), transmission truth (graph) |
| **Explorer** | investigation UX: map interaction, expansion intents, workstation layout | everything it displays - it is deliberately the surface that owns *no* intelligence, which is why it is the reference consumer |
| **Industries** | sector identity (icons/artwork), detail-page order | sector membership and rotation state (graph + engines) |
| **M&A** | deal-fact extraction and presentation; capital-flow view | acquirer/target intelligence (profiles), theme confirmation logic (evidence engine) |
| **Private** | private-flow presentation; chain choreography | theme conviction, public-market linkage (graph) |
| **Listen** | episode matching presentation; conversation momentum view | evidence tiering (evidence engine), theme truth |
| **Saved** | the user's selection set; notification preferences (future) | delta computation (memory/diffProfiles), profile content |

**The asymmetry to preserve:** surfaces may be *smart about presentation* and must be *dumb about meaning*. Any PR that adds meaning-making to a surface (a new score, a new grouping heuristic, a new confidence blend) is misrouted; that logic belongs in an engine with tests.

## 5. Cross-Surface Rules

### 5.1 Shared vocabulary (non-negotiable)

- **Confidence always means the same thing.** Three distinct numbers, never blended, labeled everywhere identically (model doc section 6): *existence confidence* (is it real), *conviction* (which way, how strongly), *evidence trust* (verdict-backed). The Explorer's "Signal / Evidence / Conviction" labeling is the reference. No surface may display the summarizer's self-assessment as any of these.
- **Evidence always means the same thing.** The evidence engine's verdict vocabulary (`strong / moderate / weak / insufficient_signal`), source-tier weights, and contradiction records - one implementation. `insufficient_signal` renders as honest absence, never as a low score.
- **Narratives always mean the same thing.** The Narrative doc's vocabulary: Theme (sourced unit), transmission path (one theme's spine), DerivedNarrative (derived multi-theme grouping, `derived: true`, no blended confidence), stored Narrative (future only). Feed's "market story", Markets' groupings, and the Brief's centerpiece must all be DerivedNarrative reads in different voices.
- **Profiles always mean the same thing.** `buildIntelligenceProfile` is the only per-entity read model. The `ProfileSection` status wrapper is the universal honesty contract for every surface's sections - including surfaces that do not consume profiles directly (Morning Brief VM already adopts it).

### 5.2 Shared mechanics

- **One entity system:** `EntityChip` + the entity registry/resolver; every entity mention on every surface is the same component with the same routing (`explorerHref`).
- **One focus system:** cross-page intelligence context (FocusBar/IntelligenceDrawer) - clicking an entity anywhere focuses the whole product.
- **One graph:** the singleton intelligence graph, rebuilt from loaded data; surfaces read, adapters write (I5).
- **One time vocabulary:** the canonical relative-time helpers (`lib/utils.ts`); no local formatters.
- **One visualization grammar for causality:** the reusable graph components (`components/graph/*`); no surface invents a second way to draw transmission.

### 5.3 Consolidation verdicts (challenge accepted)

The seven per-page intelligence libs are the largest source of drift risk (model doc conflict #2). Verdicts:

| Lib | Verdict |
|---|---|
| `maIntelligence` | **Split.** Deal-fact extraction stays (surface-owned presentation of facts); acquirer/target reads migrate to profiles |
| `sectorIntelligence` / `industryIntelligence` | **Migrate** to sector profiles + `predictSectorRotation`; retire per-sector scoring |
| `listenIntelligence` / `episodeIntel` | **Migrate** to theme/entity profile reads with an episode-as-evidence framing; retire local implication logic |
| `watchlistIntelligence` | **Replace** with profile deltas (`diffProfiles` when it lands); Saved becomes a standing-query surface |
| `capitalFlowIntel` | **Keep presentation, migrate meaning:** chain choreography is surface-owned; any conviction/score reads move to profiles |
| `crossIntel` | **Keep, narrowed:** it is the narrative-injection layer (headline/nextWatch into profiles and the brief), not an intelligence engine; its opportunity/risk prose retires as v2 sections land |
| `intelligenceShared.buildForecast` | Already fallback-only in Explorer; **delete** once the drawer reads profiles |

Rule until each migration: frozen. Bug fixes only; any change to a duplicated derivation must be mirrored in the owning engine (the profile doc's drift rule, generalized).

### 5.4 The bypass test (for code review)

A surface PR fails review if it: reads provider data directly; computes a score not defined in an engine; renders a number with no decomposition path; introduces a page-local synonym for confidence/evidence/narrative; or renders absence as a default value instead of a typed status.

## 6. The User Journey

A professional investor's trading day, as the surfaces intend it:

1. **Pre-open - Morning Brief.** Five minutes: what changed overnight, the dominant narrative and its contradiction, the transmission chain, today's falsifiers. Every claim is one click from its evidence.
2. **Positioning - Markets.** Ten minutes: is the brief's story consistent with where capital is actually rotating? Leaderboards and the transmission map either confirm or disagree - disagreement is signal.
3. **Investigation - Explorer.** The one thing that looked wrong or interesting: open its profile, walk the causal map, read the evidence stack and the invalidation conditions, check the memory timeline ("has Argus believed this before, and what happened?").
4. **During the day - Feed (+ Listen).** New information arrives as evidence: each story lands under the theme it moves; Listen adds the conversational early-warning layer. The question is never "what happened" but "does this strengthen or weaken what I believe?"
5. **Standing watch - Saved.** The entities that matter to the book, monitored for deltas - conviction moves, trend flips, new contradictions. (This is Alerts, operated manually, until Alerts ships.)
6. **Next morning - the loop closes.** Yesterday's brief is memory; today's brief leads with what changed against it. The product's compounding value is exactly this loop: Argus remembers, so the investor does not have to.

The journey is a cycle, not a funnel: synthesis → aggregation → depth → evidence → watch → synthesis. Every surface hands off to the next with context (the cross-page focus system), and Explorer is reachable from every step because investigation is the universal escape hatch.

## 7. Future Surfaces

All future consumers plug into the same pipeline at the PROFILES / DERIVED NARRATIVES layer - none get private intelligence:

| Surface | What it is | What it consumes |
|---|---|---|
| **Alerts** | Standing queries over profile deltas ("conviction crossed 70", "trend flipped weakening", "new contradiction on saved theme") | `diffProfiles` (Profile Engine step 3); no new intelligence logic - subscription + threshold only |
| **Email Brief** | The Morning Brief, serialized | `buildMorningBrief` verbatim - the VM was built to be renderer-independent; email is voice, not logic |
| **Mobile** | Brief + drawer-depth reads; investigation deferred to desktop Explorer | MorningBriefVM, profiles (drawer projection), alerts |
| **API** | Profiles as product: `getProfile(entity)`, `deriveNarratives()`, `diffProfiles(entity, since)` for institutional consumers | The engines directly; the API is the proof the architecture is real - if the API needs a new endpoint per page, the pipeline failed |
| **Widgets** | Single profile sections (a conviction tile, a transmission chip, a delta line) embeddable anywhere | Individual `ProfileSection`s; the status wrapper makes them safely embeddable (they hide when unavailable) |
| **Assistant** | Conversational lens; the nine profile questions are literally its tool schema (model doc 10.2) | Profiles + narratives + evidence citations; it never free-generates market claims - every answer cites `evidence.supporting[].pages` and `confidence.explanation` |

The test for any proposed future surface: *can it be described as a projection of profiles, narratives, and deltas?* If it needs something else, the something else is an engine sprint first, a surface sprint second.

## 8. Product Principles

Every future feature must satisfy all of these. They are review criteria, not aspirations.

1. **Intelligence before information.** Lead with what Argus believes and why; raw data is one click deeper, never the lead.
2. **Change before state.** A returning user is re-anchored by deltas first; state is context, memory is the product.
3. **Explain before predict.** No forward view renders without its causal chain and reasoning steps.
4. **Evidence before opinion.** Every claim cites; every citation is reachable; opinion without evidence does not render.
5. **Every important number decomposes.** If a user cannot ask "why is this 74?" and get a real answer, the number does not ship (I4).
6. **Absence is honest and typed.** Sections are live, partial (with a note), or absent - never padded, never defaulted (I1; the ProfileSection contract).
7. **One brain, many lenses.** Intelligence semantics live in engines with tests; surfaces own voice, selection, and layout - never meaning.
8. **Stories support intelligence, not replace it.** Stories are evidence, organized under claims - on every surface, not just the Feed.
9. **Explorer is the canonical investigation environment.** Every entity everywhere routes to it; no surface builds a second investigation UX.
10. **The falsifier travels with the thesis.** Anything presented as a belief carries what would break it - the brief, the leaderboard, the profile, the alert.
11. **Derived is labeled derived.** Heuristic groupings (narratives, coherence, watch items) never wear sourced authority; the `derived` marker is load-bearing.
12. **The LLM writes voice, never facts.** Summarizer prose may phrase engine output; it may not originate numbers, rankings, or claims - and its self-assessments are never displayed.
13. **Determinism by default.** Same inputs, same intelligence, same layout (I3); randomness is a bug, not a texture.
14. **Memory compounds; never orphan it.** New features attach history to stable keys (canonical ids, driver-set keys) so renames and refactors never erase what Argus has learned.
15. **Every surface passes the test.** "Does this help a professional investor understand the market better than Bloomberg, CNBC, or a generic AI summary?" - asked per section, at design time and at review.

## 9. Maintenance

This document is the product-architecture contract. Adding a surface, changing a surface's question/ownership, or adding a future consumer requires updating it in the same PR. The engine docs govern intelligence semantics; the migration inventories here (5.3) and in the profile doc (section 5) must stay consistent - when a migration lands, both update together.
