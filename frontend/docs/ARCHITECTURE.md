# Argus Intelligence Architecture

This document describes the Argus market-intelligence architecture: the shared
graph, the engines that reason over it, and how data flows from ingestion to the UI.
It is the reference for anyone extending the intelligence layer.

House rule: no em dashes or en dashes anywhere in generated copy. Use commas,
colons, normal hyphens, or arrows.

---

## 1. High-level system overview

Argus used to compute intelligence independently on each page (Feed, Markets,
Industries, Listen, M&A, Private Markets). That produced duplicated logic and
inconsistent conclusions. The current architecture centralizes intelligence into a
single in-memory graph plus a stack of pure reasoning engines. Pages become
renderers: they feed observations in and read conclusions out.

Three layers:

1. Data layer: the Market Intelligence Graph. Stores facts (nodes) and
   evidence-weighted relationships (edges). One shared singleton.
2. Reasoning layer: pure, framework-agnostic engines that read the graph and
   produce explainable conclusions (inference, narrative transmission, and the
   planned evidence and prediction engines).
3. Presentation layer: existing pages and the cross-page Intelligence Drawer,
   which read conclusions. The UI never owns business logic.

---

## 2. Data flow from ingestion to UI

```
External data (Feed, Markets, Industries, Listen, M&A, Private, Snapshots)
        |
        v
Graph Adapters            (intelligenceGraphAdapters.ts)
        |                  translate app data into nodes + relationships
        v
Market Intelligence Graph (intelligenceGraph.ts)
        |                  canonical in-memory facts, alias-merged, indexed
        +--> Validation Harness (intelligenceGraphDebug.ts)  integrity + reports
        |
        v
Inference Engine          (inferenceEngine.ts)
        |                  what is strengthening / weakening, why, who benefits
        v
Narrative Transmission    (narrativeTransmission.ts)
        |                  how a narrative originates and spreads
        v
Evidence Engine (planned)
        |                  grade and attribute the evidence behind each claim
        v
Prediction Engine (planned)
        |                  probabilistic forward views
        v
Feed / Markets / Industries / Listen / M&A / Private   (renderers)
        via useIntelligenceGraph.ts + the Intelligence Drawer
```

The graph is rebuilt from currently-loaded app data on demand (today, when the
Intelligence Drawer opens) via `useIntelligenceGraph`. Rebuild is cheap and
idempotent: adapters upsert and de-duplicate, so re-ingesting the same data
converges rather than doubling.

---

## 3. Market Intelligence Graph (`src/lib/intelligenceGraph.ts`)

The canonical fact store. Pure data, no React, no UI.

- Node types (open union, extend freely): Theme, Company, Sector, Industry, Macro,
  Commodity, Country, Currency, InterestRate, Deal, Fund, Person, Podcast, Story,
  EconomicRelease, ETF.
- Relationship types (open union): drives, supports, weakens, owns, acquires,
  mentions, correlates, supplies, depends_on, competes_with, raises_demand_for,
  reduces_supply_of.
- Every node stores id, label, aliases, type, description, confidence, conviction,
  momentum, persistence, firstSeen, lastSeen, mentionCount, importance, sources,
  metadata.
- Every edge stores source, target, relationshipType, strength, confidence,
  firstObserved, lastObserved, evidenceCount, originatingPages.
- Convention: strength and confidence are 0..100.

Performance: four indexes are maintained on every mutation (alias index, type
index, out-edges, in-edges), so `getNode`, `getNeighbors`, and `getRelationships`
are O(1) or O(degree), never a full scan. Designed for 10k+ nodes and 100k+ edges.

Public API (bound to the shared singleton): `addNode`, `updateNode`, `removeNode`,
`getNode`, `addRelationship`, `removeRelationship`, `getRelationships`,
`getNeighbors`, `searchNodes`, `mergeNodes`, `mergeDuplicateNodes`. The class
`IntelligenceGraph` is also exported for isolated instances (used by tests).

Duplicate resolution: alias-based. A node given aliases `["NVDA","Nvidia","NVIDIA"]`
resolves all three to one company regardless of ingestion order.
`mergeDuplicateNodes()` folds same-type nodes that share a normalized alias.

---

## 4. Graph Adapters (`src/lib/intelligenceGraphAdapters.ts`)

Translate existing Argus data into the graph. Adapters shape data only; they never
reason. Each is source-tagged, guarded, and tolerant of missing data, and returns
`IngestStats { nodesAdded, relationshipsAdded, duplicatesMerged, errorsSkipped }`.

- `ingestThemes` -> Theme, Company, Sector, Macro nodes and their relationships.
- `ingestStories` -> Story nodes linked to themes and companies.
- `ingestListen` -> Podcast, Person, Company nodes and mentions.
- `ingestMA` -> Deal, Company, Fund nodes and acquires / affects relationships.
- `ingestPrivateMarkets` -> Fund, Company, Sector, Theme nodes and capital links.
- `ingestThemeSnapshots` -> historical memory attached to Theme nodes.
- `buildGraphFromCurrentState(state)` orchestrates all of the above, tolerant of any
  missing source, themes first so downstream sources have anchors.
- `summarizeGraph()` returns totals, nodes-by-type, top connected nodes, strongest
  relationships.

Company aliases are enriched from `tickerMetadata` so ticker and name mentions merge.

---

## 5. Validation Harness (`src/lib/intelligenceGraphDebug.ts`)

Development and validation. Not a production UI surface.

- `createDebugGraphFromSampleData()` seeds a realistic sample graph.
- `validateGraphIntegrity()` checks orphan relationships, duplicate aliases, empty
  labels, missing endpoints, and value-scale consistency.
- `getThemeIntelligenceReport(id)` and `getCompanyIntelligenceReport(id)` are the
  read-side query API the app consumes (companies, sectors, stories, podcasts,
  deals, private links, strongest relationships, snapshot memory).

---

## 6. Inference Engine (`src/lib/inferenceEngine.ts`)

Reasons over the graph to answer: what is strengthening, what is weakening, why,
what confirms it across sources, who benefits, who is at risk, what to watch, what
would invalidate the thesis, and how confident we are.

- `inferTheme`, `inferCompany`, `inferSector`, `inferMarketState`.
- `scoreInference(input)`: a simple, understandable weighted blend of strength,
  confidence, evidence (log-saturating), cross-source count, persistence, momentum,
  and conviction, gently scaled by recency. Returns a 0..100 score plus components.
- Direction is momentum-driven: `>= 3` strengthening, `<= -3` weakening, else mixed;
  under two evidence units returns `insufficient_signal`.
- Every result carries `reasoningSteps { claim, evidence, confidence, sourceType }`.
- `debugInference(id)` traces resolved node, neighbors, edges, score components, and
  the final inference.

No fabricated thesis language. Reasons only from graph facts.

---

## 7. Narrative Transmission Engine (`src/lib/narrativeTransmission.ts`)

Explains how a narrative moves through markets.

- `buildNarrativePath(node)`: traces the causal spine origin -> theme -> strongest
  terminal, with terminal nodes, confidence, evidence count, and an explanation.
- `findTransmissionChains()`: top active chains, sorted by confidence, cross-source
  confirmation, then relationship strength.
- `rankNarratives()`: themes ranked by transmission velocity, cross-market reach,
  persistence, and conviction.
- `detectEmergingNarratives()`: low-footprint themes that are rising or newly
  cross-confirmed.
- `explainNarrative(theme)`: origin, current state, path, beneficiaries, headwinds,
  confirming evidence, invalidation, next watch.

Reads graph structure and the inference engine. Never invents relationships. Returns
`insufficient_signal` when unsupported.

---

## 8. Theme Snapshots and historical memory (`src/lib/themeSnapshots.ts`)

Durable per-theme daily memory in localStorage (`argus.themeSnapshots.v1`), capped
per theme, one snapshot per theme per day (idempotent). Records conviction,
momentum, persistence, breadth, acceleration, source and story counts, M&A and
private signal counts.

- `createDailyThemeSnapshots(themes, extra)` writes today's snapshot.
- `getThemeHistory`, `getThemeDelta`, `getThemeMemory` read the trajectory and
  compose human lines ("Conviction rose from 72 to 81 over 5 sessions").

Historical memory strategy: localStorage now, Supabase later without changing
callers. The snapshot adapter attaches history to Theme nodes (`metadata.history`),
so the graph and its engines can reason over trajectories (for example
`detectEmergingNarratives` reading a conviction rise). The graph is the live view;
snapshots are the durable timeline.

---

## 9. Cross-page Intelligence (`src/lib/intelligenceContext.tsx`, `crossIntel.ts`)

A shared active-context store (module singleton via `useSyncExternalStore`) that
lets clicking any entity anywhere focus the whole product. `crossIntel.ts` aggregates
the connected picture for the focused entity. See `useIntelligenceGraph.ts` for the
bridge that rebuilds the graph from currently-loaded data and exposes reports.

---

## 10. Intelligence Drawer integration (`src/components/common/IntelligenceDrawer.tsx`)

The only production surface currently reading the graph. When opened for a theme,
company, sector, or macro driver, it builds the graph from the same data it already
displays and adds graph-backed sections (connected themes, M&A links, private-market
links, strongest connections) plus a development-only integrity footer. Existing
sections are untouched; if the graph resolves nothing, the drawer falls back to prior
behavior. No blank widgets, no crashes.

---

## 11. Developer diagnostics (`src/lib/intelligenceHealth.ts`, `intelligenceTests.ts`)

- `intelligenceHealthReport()` / `printIntelligenceHealth()`: nodes, relationships,
  nodes-by-type, relationships-by-type, integrity, duplicate merges (when a rebuild
  is passed), source distribution, snapshot count, top connected nodes, and rebuild /
  inference / narrative timings. Developer only, not imported by any page.
- `runIntelligenceTests()`: a self-contained suite (alias merging, integrity,
  relationship dedup, missing-node handling, inference scoring, narrative path,
  insufficient signal). Run with `npx tsx src/lib/intelligenceTests.ts`.

---

## 12. Planned future engines

- Evidence Engine: grade and attribute the evidence behind each claim (source tier,
  independence, freshness, corroboration) so confidence becomes fully traceable.
- Prediction Engine: probabilistic forward views built on inference, narrative, and
  evidence outputs.

Both extend the existing stack. They read the graph and prior engine outputs; they do
not introduce a second source of truth.
