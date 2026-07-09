# Argus Narrative Engine v1 - DerivedNarrative

**Status:** Canonical contract, v1 (System 2 sprint, 2026-07)
**Parent:** `docs/ARGUS_INTELLIGENCE_MODEL_V1.md` section 4 (the critical analysis that concluded "derived, not stored"); sibling of `docs/ARGUS_INTELLIGENCE_PROFILE_V1.md` (whose section-status honesty pattern this contract reuses)
**Code:** `frontend/src/lib/narrativeDerivation.ts` - the TypeScript contract plus a v0 assembler. Additive only; **not wired into any surface**. Exercised by `intelligenceTests.ts` (tests 77.x).

---

## 1. Vocabulary (read this first)

The pre-sprint audit found "narrative" already means several things in the codebase. This document fixes the vocabulary; every future PR uses these words this way:

| Term | Meaning | Where |
|---|---|---|
| **Theme** | Backend-emitted, evidence-bearing intelligence unit. The primary unit of intelligence. | `theme_intelligence` -> graph `Theme` nodes |
| **Transmission path** (formerly "narrative" in `narrativeTransmission.ts`) | ONE theme's causal spine: origin -> theme -> terminals. Unchanged by this sprint; its exported names stay for compatibility, but new code and docs say "transmission path". | `narrativeTransmission.ts` |
| **DerivedNarrative** | A computed, ephemeral grouping of MULTIPLE themes sharing a driver set. Never stored, never persisted, re-derived on every call. This document. | `narrativeDerivation.ts` |
| **Narrative (stored entity)** | Future only. Exists today only as a NodeType string deliberately aliased to Theme everywhere. Nothing may create stored `Narrative` nodes until the backend emits them (section 9). | n/a |
| **`narrativeGraph.ts`** | A display adapter over hardcoded curated data (`argusReasoning.NARRATIVE_GRAPH`). Editorial, not derived intelligence. Out of scope here. | `narrativeGraph.ts` |

## 2. What a DerivedNarrative is

A DerivedNarrative answers the desk question "what is the big story?" without inventing an authority the data does not have. It is a **projection**: themes are grouped by the layer-0 drivers they share in the intelligence graph, and the grouping is returned with real member edges, deduped downstream exposure, per-member evidence and forward views, and a decomposed structural-coherence measure. Calling `deriveNarratives()` twice against the same graph returns the same output; calling it against an empty graph returns `[]`.

```
DerivedNarrative "AI Capex"            <- keyed by the driver set, labeled from driver labels
  members:  AI Infrastructure, Datacenter Power     <- themes sharing the driver(s)
  exposure: Semiconductors, Utilities / NVDA (x2), AMD, VST   <- deduped, with member counts
  evidence: per-member verdicts, distinct source pages         <- listed, never blended
  forward:  per-member theme trajectories                      <- listed, never a narrative forecast
  coherence: structural similarity with full decomposition     <- a geometry measure, not a confidence
```

### Why derived rather than stored

The model doc's section 4.2 case-against, all four points of which the audit re-confirmed:

1. **No source of truth.** The backend emits themes; nothing emits narratives. A stored frontend-invented narrative would be a heuristic clustering wearing sourced-entity authority - fabrication under invariant I1 if the clustering is wrong.
2. **Ontology inflation.** Promoting `Narrative` adds a layer every projection, drawer, filter, and test must handle.
3. **Confidence laundering.** A narrative confidence would aggregate theme confidences that are themselves aggregates - two hops from evidence breaks explainability (I4). This contract therefore has **no narrative-level confidence at all**.
4. **The chain does not need it.** The shared driver IS the narrative anchor; this engine makes that explicit by keying narratives on driver sets.

Because v1 never persists anything, the future promotion to stored entities (section 9) is purely additive.

### How it differs from Theme

A Theme is sourced (backend pipeline), evidence-bearing, and first-class in the graph. A DerivedNarrative is none of those: it is a grouping OF themes, carries `derived: true` so no consumer can present it as sourced, owns no evidence of its own (it lists its members' evidence), and ceases to exist when the call returns.

### How it differs from narrativeTransmission.ts

`narrativeTransmission.ts` explains how ONE theme moves through markets (origin, spine, terminals, per-theme ranking). `narrativeDerivation.ts` groups MULTIPLE themes into one story. They are complementary reads at different altitudes: a DerivedNarrative's members each still have their own transmission path.

## 3. Identity: the driver-set key

`key = sorted canonical driver node ids joined by "+"` (e.g. `ai-capex`, `ai-capex+power-prices`).

- **Stable across theme renames** - the continuity weakness of name-keyed theme memory (model doc conflict #6). The backend renaming "AI Infrastructure" to "AI Compute Buildout" does not change the narrative's identity, because the identity lives on the drivers.
- Driver ids are the graph's alias-resolved canonical keys, so driver aliasing is absorbed by the existing merge machinery.
- Drivers whose member-theme sets are identical merge into ONE narrative keyed by the combined driver set (no duplicate narratives for co-occurring drivers).
- A theme may appear in more than one narrative (overlapping views are honest); a driver with fewer than `minMembers` (default 2) themes produces no narrative - a single theme is a theme.

This key is the durable handle future market memory will accrue history against (model doc section 8.2 "driver-set keys").

## 4. What it consumes (all existing systems; nothing new is ingested)

| Input | Module / data |
|---|---|
| Theme-shaped nodes | `intelligenceGraph.nodesOfType("Theme")` (+ `"Narrative"`-typed nodes, which are deliberately theme-aliased today) |
| Driver anchors | Layer-0 neighbors via `causalMap.causalLayerOfType`; the real edges carry relationship type, strength, confidence |
| Edge trends | `causalMap.deriveEdgeTrend` (honest reinforcement/quiet derivation) |
| Downstream exposure | Member themes' layer-2 (sectors) and layer-3 (companies/ETFs) neighbors |
| Evidence | `evidenceEngine.evaluateEvidenceForNode` per member; edge `originatingPages` for the distinct-source union |
| Forward views | `predictionEngine.predictThemeTrajectory` per member |
| Section wrapper | `intelligenceProfile.ProfileSection` (same status/data/note honesty contract) |

The engine is a pure module (relative imports only) and takes no page-level data in v1. If injected context is ever needed (e.g. crossIntel prose), it follows the ProfileInputs injection rule: callers inject, the engine never fetches.

## 5. What it produces - field status

`DerivedNarrative` fields, each wrapped in `ProfileSection` where derivation can be thin:

| Field | Contents | Status today |
|---|---|---|
| `key`, `label`, `derived`, `version`, `generatedAt` | driver-set key; template label from driver labels; constant `derived: true` marker | **live** |
| `driverSet` | the drivers, as node refs | **live** |
| `members` | member themes, each with its real driver edges (relationship, strength, confidence, trend) | **live** |
| `exposure` | shared sectors and tradeables, **deduped by node id with memberCount** (the double-counting fix: an asset exposed through three members appears once, x3) | **live**; `partial` with empty arrays when members have no recorded downstream |
| `evidence` | per-member evidence verdicts/trust/contradictions, plus a **distinct** page union. No aggregate trust, no summed counts, by design | **live** when all members resolve; `partial` for a subset; `unavailable` when none |
| `forward` | per-member theme trajectories with invalidations, listed side by side | **live**/`partial`/`unavailable`, same rule |
| `coherence` | structural similarity 0..100 with full decomposition (shared-driver strength, asset/sector Jaccard overlap) and a plain-language explanation | always **partial** - it is a heuristic geometry measure, and its note says so |
| `confidence` (narrative-level) | - | **absent by design** (confidence laundering) |
| `lifecycle` (emerging/building/fading/broken) | - | **future** - needs daily persisted snapshots under narrative keys (model doc section 7 constraint) |
| `velocity` / `acceleration` | - | **future** - same time-base requirement |
| narrative-level forecast | - | **future at best** - the prediction engine has no narrative inputs; relabeling member forecasts would fake authority |
| `history` / analogs | - | **future** - unlocks when server memory accrues snapshots under the driver-set key |
| persistence / streaks | - | **future** for narratives (member-level streaks exist in device-local memory but are not narrative-keyed; surfacing them here before narrative-keyed memory exists would misattribute them) |

## 6. Connection to the Intelligence Profile

Both engines sit side by side in the ENGINES layer (model doc 10.1 - "narrative derivation*" is already in the diagram) and share the same lower causal/evidence layer. **Neither builds from the other:**

- Narratives are not built from profiles: a narrative is a cross-entity clustering; profiles are per-entity reads over the same engines. Deriving one from the other would be circular and wasteful.
- Profiles will gain an optional **`narrative` membership section** (already listed as a deliberately-absent future field in the profile doc): `ProfileSection<{ key, label, siblingThemes }>`, populated via `findNarrativeForTheme` at profile-assembly time, `unavailable` when the entity's theme belongs to no grouping. That is a follow-up sprint on the profile contract (profile doc and module change together, per its maintenance rule) - not done in this sprint.
- Cross-entity consumers (Feed hero "Today's Market Story", Markets, Explorer left column) read `deriveNarratives()` directly and render in their own voice; `marketMap.buildMarketStory` is the ad-hoc synthesis this eventually replaces.

## 7. What must NOT be implemented yet (would be misleading)

Explicitly rejected for v1; each requires data that does not exist:

1. **A single blended narrative confidence** - confidence laundering (model doc 4.2.3).
2. **Narrative lifecycle states** - no time base under stable narrative keys; single-session lifecycle is fabrication (model doc section 7).
3. **Velocity / acceleration / narrative-exhaustion signals** - need daily persisted snapshots.
4. **Stored `Narrative` nodes or membership edges** - heuristic membership would become evidence-bearing graph relationships.
5. **Narrative-level predictions** - relabeled theme forecasts wearing extra authority.
6. **Historical narrative analogs** - no narrative history exists to match against.
7. **Summed evidence across members** - shared stories double-count; the contract exposes only per-member reads and a distinct union.
8. **LLM-generated narrative prose** - this layer is deterministic; the label is a template over real driver labels and consumers voice everything else.

## 8. Consumption rules

- Branch on every section's `status`; `unavailable` renders as an honest empty state, never a default.
- Always surface the derived nature ("these N themes share a driver"), e.g. keyed off the `derived` marker. A DerivedNarrative must never render with the same visual authority as a sourced Theme.
- Never persist a DerivedNarrative object; persist at most its `key` (e.g. as a memory or alert subscription handle, future).
- Do not feed derived narratives back into the graph.

## 9. Migration path - if narratives become first-class backend objects

Phase 2, only when the backend learns to emit narratives with their own evidence trail:

1. Backend emits narrative objects (member theme ids, dominant driver, sourced label). They arrive through adapters like any entity and become stored nodes with real evidence.
2. The stored node's canonical key adopts (or aliases) the derived driver-set key, so any history accrued against derived keys (memory, alerts) migrates by alias-merge - the machinery `intelligenceGraph.mergeNodes` already has.
3. `deriveNarratives` becomes the fallback for themes the backend has not grouped; sourced narratives win where both exist.
4. Only then may lifecycle/velocity/history fields move from "future" to implemented, fed by server-side snapshots (model doc sections 7-8).

Nothing in phase 1 blocks or prejudices this: v1 persisted nothing, so promotion is additive.

## 10. Maintenance

This document and `narrativeDerivation.ts` change together, in the same PR, or not at all. Field additions require: a status/data/note wrapper (or an explicit "absent by design" entry in section 5), and a test in `intelligenceTests.ts` (77.x). Vocabulary is governed by the model doc (Appendix B); this doc governs the derived-narrative read model.
