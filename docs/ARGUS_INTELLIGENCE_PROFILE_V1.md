# Argus Intelligence Profile v1

**Status:** Canonical contract, v1 (System 1 sprint, 2026-07; Explorer integration, 2026-07)
**Parent:** `docs/ARGUS_INTELLIGENCE_MODEL_V1.md` (section 9 defined the nine intelligence questions; this document specifies the object that answers them)
**Code:** `frontend/src/lib/intelligenceProfile.ts` - the TypeScript contract plus a v0 assembler. **First production consumer: the Intelligence Explorer** (`explore/[entity]/page.tsx` via `hooks/useIntelligenceProfile.ts`), which reads profile sections first and falls back to its pre-profile derivations when a section is unavailable. Exercised by `intelligenceTests.ts` (tests 75.x contract, 76.x Explorer integration).

---

## 1. Purpose

The Intelligence Profile is the one shared read model every Argus surface will consume. Instead of each page re-deriving an entity's story from the graph and engines (as Explorer, the drawer, and the per-page `*Intelligence.ts` libs do today), a surface asks for the profile of an entity and renders the sections it cares about, in its own voice:

- **Explorer** visualizes it (network, panels, workstation left column)
- **Feed** summarizes it (why a story matters = the story's strongest-linked entity's profile)
- **Markets** aggregates it (leaderboards over profile confidence/forward views)
- **Industries** groups it (sector profiles composed of member company profiles)
- **M&A** overlays deals onto it (acquirer/target profiles + deal evidence)
- **Alerts** (future) track changes to it (standing queries over profile deltas)
- **AI assistant** (future) explains it (profiles are its grounding; the sections are literally its tool schema)

Design rules inherited from the model doc: no fabrication (I1), determinism (I3), explainability (I4), read-only projection (I5). The profile returns **data, not prose** - rendering voice belongs to surfaces.

## 2. The contract

Authoritative source: `intelligenceProfile.ts`. Summary:

```ts
interface IntelligenceProfile {
  version:      1;
  entityKey:    string;          // the key the caller resolved (ticker, theme name, ...)
  generatedAt:  number;          // epoch ms
  identity:      ProfileSection<ProfileIdentity>;
  thesis:        ProfileSection<ProfileThesis>;
  drivers:       ProfileSection<ProfileLink[]>;
  transmission:  ProfileSection<ProfileTransmission>;
  beneficiaries: ProfileSection<ProfileLink[]>;
  risks:         ProfileSection<ProfileRisks>;
  evidence:      ProfileSection<ProfileEvidence>;
  confidence:    ProfileSection<ProfileConfidence>;
  evolution:     ProfileSection<ProfileEvolution>;
  watch:         ProfileSection<ProfileWatch>;
}

interface ProfileSection<T> {
  status: "live" | "partial" | "unavailable";
  data:   T | null;   // null exactly when unavailable
  note?:  string;     // one line explaining partial/unavailable
}
```

**The section wrapper is the load-bearing idea.** Every consumer must branch on `status`; `unavailable` renders as an honest empty state (or nothing), never as a default value. `partial` means derived-but-thin or heuristic (the note says why). This encodes invariant I1 into the type system.

`buildIntelligenceProfile(entityKey, inputs?)` never throws: an unknown entity returns a profile where every section is `unavailable`.

### Injection, not fetching

The assembler is a pure graph/engine read. Page-level context that lives outside the graph (the cross-page narrative from `crossIntel.ts`, which needs feed/deal/episode data from React Query hooks) is **injected** by the caller through `ProfileInputs { kindHint?, narrative? { headline, nextWatch } }`. This keeps the module dependency-clean (relative imports only, directly testable) and avoids a second data-fetching pathway.

## 3. Sections: fields, sources, status today

| # | Section | Answers | Data source (existing system) | Status today |
|---|---|---|---|---|
| 1 | `identity` | What is this entity? | `IntelNode` (id, label, type, aliases, description, firstSeen/lastSeen, sources) + `causalLayerOfType` (`causalMap.ts`) + kind mapping | **live** |
| 2 | `thesis` | What is happening? | `headline`: injected narrative (crossIntel) - callers only; `forward`: prediction engine (`predictCompanyTrajectory` / `predictThemeTrajectory` / `predictSectorRotation`) | **partial** (live when both narrative injected and prediction resolves; `unavailable` on insufficient signal) |
| 3 | `drivers` | Why is it happening? | Causal map upstream walk (`buildRelationshipMap` with `causalChains: true`): links to lower causal layers, direct and two-hop with `via` attribution, each carrying relationship type, strength, confidence, trend | **live** when upstream edges exist |
| 4 | `transmission` | How does this propagate? | Stage summary (entities per causal layer around the entity) + one strongest representative path + upstream/downstream counts | **live** when the map resolves |
| 5 | `beneficiaries` | Who benefits? | Downstream non-evidence links from the causal map (companies/ETFs below the entity's layer) | **live** for themes/sectors/drivers; **partial** for companies (peer-exposure derivation is future) |
| 6 | `risks` | Who is harmed / what breaks it? | Prediction invalidation conditions + recorded weakens-group edges + evidence-engine contradictions | **live** when any exist; **partial** (empty arrays + note) when none recorded - explicitly never padded |
| 7 | `evidence` | What supports/weakens it? | `evaluateEvidenceForNode`: verdict, overallTrust, top supporting items with pages, source breakdown; plus total edge evidence count | **live** when verdict is not `insufficient_signal`; else `unavailable` |
| 8 | `confidence` | How certain is Argus? | Three numbers kept distinct per the model doc: existence (`node.confidence`), conviction (`node.conviction`), trust (evidence engine); plus a deterministic plain-language `explanation` composed from real counts (I4) | **live** (explanation always present) |
| 9 | `evolution` | What has changed? | Memory engine: history, snapshot deltas (`compareSnapshots`), evolution lines, patterns, analogs | **partial** (memory is device-local localStorage today; see model doc section 8) or `unavailable` without history |
| 10 | `watch` | What should an analyst monitor? | Invalidation conditions first, injected `nextWatch`, then weakening links | **partial** (live when a narrative watch item is injected) |

**Future fields (specified in the model doc, intentionally absent from v1 rather than faked):** lifecycle state, velocity/acceleration (need server-side snapshots), atomic evidence records with quality tiers (need the evidence log), calibrated confidence factors (need resolved-prediction history), narrative membership (needs derived-narrative projection).

## 4. Examples

Shapes are exact; values are illustrative (drawn from the test fixture and live pipeline shapes, not real claims).

### 4.1 Company - `buildIntelligenceProfile("NVDA")`

```jsonc
{
  "version": 1, "entityKey": "NVDA",
  "identity":  { "status": "live", "data": { "label": "NVDA", "kind": "company", "nodeType": "Company", "causalLayer": 3, "sources": ["Theme Intelligence", "Feed"] } },
  "thesis":    { "status": "partial", "note": "No page-level narrative injected; forward view only.",
                 "data": { "headline": null, "forward": { "direction": "strengthening", "probability": 50, "confidence": 63, "reasons": ["NVDA outlook is strengthening", "Exposed to 3 active themes"] } } },
  "drivers":   { "status": "live", "data": [
                 { "label": "AI Infrastructure", "nodeType": "Theme", "relationship": "supports", "strength": 88, "trend": "stable", "via": null },
                 { "label": "AI Capex", "nodeType": "Macro", "relationship": "drives", "strength": 82, "trend": "stable", "via": "AI Infrastructure" } ] },
  "transmission": { "status": "live", "data": {
                 "stages": [ { "layer": 0, "caption": "Drivers", "entities": ["AI Capex"] }, { "layer": 1, "caption": "Themes", "entities": ["AI Infrastructure"] },
                             { "layer": 3, "caption": "Companies", "entities": ["NVDA", "AMD"] }, { "layer": 4, "caption": "Evidence", "entities": ["Blackwell sold out"] } ],
                 "strongestPath": ["AI Capex", "AI Infrastructure", "NVDA", "Blackwell sold out"], "upstreamCount": 2, "downstreamCount": 0 } },
  "beneficiaries": { "status": "partial", "data": [], "note": "Companies sit at the bottom of the tradeable chain; peers arrive with peer-exposure derivation (future)." },
  "risks":     { "status": "live", "data": { "invalidation": "AI Infrastructure thesis reverses or its drivers fade", "weakening": [], "contradictions": [] } },
  "evidence":  { "status": "live", "data": { "verdict": "moderate", "overallTrust": 55, "supporting": [ { "from": "AI Infrastructure", "relationship": "supports", "strength": 88, "pages": ["Theme Intelligence"] } ], "totalEvidence": 6 } },
  "confidence": { "status": "live", "data": { "existence": 70, "conviction": 50, "trust": 55, "verdict": "moderate",
                 "explanation": "Existence confidence 70 from 3 observations across 2 pages. Evidence trust 55 (moderate) over 6 evidence points. No active contradictions." } },
  "evolution": { "status": "partial", "note": "Memory is device-local today...", "data": { "firstSeen": "2026-07-06", "sessions": 2, "deltas": { "conviction": 3 }, "analogs": [] } },
  "watch":     { "status": "partial", "data": { "items": ["Invalidation: AI Infrastructure thesis reverses or its drivers fade"] } }
}
```

### 4.2 Theme - `buildIntelligenceProfile("AI Infrastructure", { narrative: { headline, nextWatch } })`

Key differences: `identity.kind = "theme"`, `causalLayer = 1`; `drivers` = macro forces (`AI Capex drives`, direct); `beneficiaries` **live** with downstream companies (`NVDA supports 88`, `AMD`); `thesis.headline` carries the injected narrative and `watch` includes the injected item, both marked live; `forward` from `predictThemeTrajectory` includes `timeframe`.

### 4.3 Sector - `buildIntelligenceProfile("Semiconductors")`

`identity.kind = "sector"`, layer 2. `drivers` = themes/drivers feeding the sector. `beneficiaries` = member companies below it. `thesis.forward` from `predictSectorRotation` reads `"rotating in" | "rotating out"` with `probability: null` (the engine does not emit one - the profile does not invent it). `risks.invalidation` is null for sectors today (no engine emits it): the section notes this rather than fabricating.

### 4.4 Macro Driver - `buildIntelligenceProfile("AI Capex")`

`identity.kind = "driver"`, layer 0. `drivers` is `partial` with an empty list (nothing upstream of a macro force in the current ontology - honest). `beneficiaries` = the themes and companies downstream. `transmission.strongestPath` starts at the driver itself. `thesis.forward` uses the theme trajectory engine (drivers are theme-shaped for prediction today - documented approximation, revisit when a driver-specific engine exists).

## 5. Overlap with existing Explorer logic (consolidation plan)

The v0 assembler deliberately duplicated derivations that lived inside surfaces. The System 1 integration sprint made the Explorer page (`explore/[entity]/page.tsx`) profile-first: it assembles one profile per entity (via `useIntelligenceProfile`, injecting its crossIntel narrative) and reads `thesis` (headline + forward view), `drivers` (theme-exposure chips), `risks` (invalidation, contradictions), `evidence` (header signal/verdict + evidence stack), `watch` (next-watch line), and `evolution` (evolution lines + analogs) from it. Pre-profile derivations remain as explicit fallbacks for unavailable sections, so degradation behavior is unchanged. Remaining inventory:

| Existing logic | Where | Overlapping profile section | Consolidation |
|---|---|---|---|
| Forward-view normalization (`buildForecast`) | `intelligenceShared.ts` | `thesis.forward` | Explorer now reads `thesis.forward` first; `buildForecast` remains its fallback and the drawer's read - collapse once the drawer consumes profiles |
| "Why it matters" panel grouping (drivers/themes/benefiting/risks) | `ExplorerGraph.tsx` (`why` memo) | `drivers`, `beneficiaries`, `risks` | Explorer's pinned panel should render `profile.drivers/risks` for the pinned node instead of regrouping edges locally (pinned nodes are not the page entity; needs the profile cache, step 2) |
| Confidence read sentence | `ExplorerGraph.tsx` (`confidenceRead`) | `confidence.explanation` | Same consolidation |
| Evidence stack assembly | `explore/[entity]/page.tsx` | `evidence` | **Done:** page reads `profile.evidence` first; direct `evaluateEvidenceForNode` read kept as fallback |
| Timeline/evolution assembly (`buildTimeline`) | `intelligenceShared.ts` | `evolution` | `buildTimeline` stays (it is event-shaped for the timeline UI); Explorer reads `evolution` lines/analogs profile-first with the timeline as fallback |
| Per-page intelligence libs (`maIntelligence`, `sectorIntelligence`, `listenIntelligence`, ...) | various | several | Migrate one page per sprint (model doc conflict #2); do not big-bang |

Rule until consolidation: any change to these derivations must be mirrored in the assembler (they are covered by the same test suite, which makes drift visible).

## 6. Implementation path - Profile Engine (next sprint)

v0 (this sprint) is a stateless assembler: every call re-reads the graph and engines. The Profile Engine turns it into infrastructure:

1. **`useIntelligenceProfile(entityKey)` hook** - **done (System 1 integration sprint):** `hooks/useIntelligenceProfile.ts` memoizes assembly against caller-supplied invalidation signals (`graph.ready`, `market.version`, `memVersion`) and takes the injected `crossIntel` narrative. First consumer: the Explorer (left column thesis/forward/drivers/risks/watch, right column evidence stack and evolution/analogs), with pre-profile fallbacks intact and zero intended visual change. Next consumer: the drawer's simplified company view.
2. **Profile cache keyed by canonical id** - one assembly per entity per graph build, shared across drawer/Explorer/FocusBar within a session.
3. **Section-level subscriptions** - expose "what changed between two profiles" (`diffProfiles(a, b)`) as the primitive Alerts will consume; deltas of `confidence`, `risks`, `drivers`, `thesis.forward.direction` are the alertable surface.
4. **Server-side profile snapshots** - once the evidence log and market memory land (model doc sequencing steps 3-4), persist a daily profile snapshot per tracked entity; `evolution` upgrades from `partial` to `live` and velocity/lifecycle fields unlock.
5. **AI grounding** - the assistant's tools are `getProfile(entity)` and `diffProfiles(entity, since)`; its answers cite `evidence.supporting[].pages` and `confidence.explanation`. No free-form market claims.

## 7. Maintenance

This document and `intelligenceProfile.ts` change together, in the same PR, or not at all. Section additions require: a status/data/note wrapper, a data-source mapping row in section 3, and a test in `intelligenceTests.ts`. The model doc (Appendix B) governs vocabulary; this doc governs the read model.


---

**Phase 2.7 status (2026-07-10):** the profile is the platform's per-entity read everywhere. A2 shipped (`lib/profileCache.ts`: one build per entity per graph version, invalidated by the sanctioned graph writers); A4 shipped (`lib/entityContext.ts` projects the cached profile + shared risk read into every drawer). The consolidation table's remaining items (drawer `buildForecast` path, page-local risk/thesis logic) are resolved - see `ARGUS_INTELLIGENCE_EVERYWHERE_V1.md` sections 4 and 6.
