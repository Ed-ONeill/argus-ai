/**
 * lib/intelligenceProvisioning.ts - the canonical graph provisioning contract
 * (Phase 2.0, docs/ARGUS_INTELLIGENCE_EVERYWHERE_V1.md abstraction A1).
 *
 * THE problem this solves: the shared graph singleton used to be cleared and
 * rebuilt by multiple surfaces with DIFFERENT input sets (Explorer/drawer with
 * the full set, the Morning Brief with themes + clusters only), so the graph's
 * contents - and therefore every engine read - depended on which surface built
 * it last. That silently violated the one-model rule ("Morning Brief must
 * never disagree with Explorer").
 *
 * The contract:
 *  - `CanonicalIntelligenceInputs` names every graph-supported input source.
 *  - `canonicalGraphState()` is the ONE mapping from those inputs onto the
 *    adapter state (storyThemes / matchedThemes are always the theme set).
 *  - `provisionGraphState()` is the ONE rebuild sequence: clear -> build ->
 *    re-apply cached market observations (so provider market data survives
 *    every rebuild). Nothing else may clear or rebuild the singleton; the only
 *    other sanctioned write path is the ADDITIVE observation ingest
 *    (dataAdapters/observationGraphBridge.ingestProviderObservations).
 *  - Missing inputs degrade honestly: an absent source contributes nothing
 *    (the adapters skip it) and never throws. Honest degradation is about
 *    absent DATA, not reduced CALLERS - production surfaces receive the full
 *    input set through hooks/useArgusIntelligence, so a surface can no longer
 *    rebuild the graph into a weaker state than another surface expects.
 *  - Deterministic: the same canonical inputs always produce the same node and
 *    relationship counts, and therefore identical profile / evidence /
 *    forward-view / DerivedNarrative reads (consistency suite 82.x).
 *
 * Pure module, relative imports only, exercised by intelligenceTests.ts.
 * No em/en dashes.
 */

import { intelligenceGraph } from "./intelligenceGraph";
import { buildGraphFromCurrentState, type BuildResult } from "./intelligenceGraphAdapters";
import { reingestCachedMarketObservations } from "./dataAdapters/observationGraphBridge";
import { invalidateProfileCache } from "./profileCache";

/** The adapter-facing state shape (single source of truth: the adapter itself). */
export type GraphState = NonNullable<Parameters<typeof buildGraphFromCurrentState>[0]>;

/** Every graph-supported input source. All optional: absence degrades honestly. */
export interface CanonicalIntelligenceInputs {
  themes?:         GraphState["themes"];
  clusters?:       GraphState["stories"];
  episodes?:       GraphState["episodes"];
  deals?:          GraphState["deals"];
  snapshots?:      GraphState["snapshots"];
  privateSignals?: GraphState["privateSignals"];
}

/** The one canonical mapping from gathered inputs onto adapter state. */
export function canonicalGraphState(i: CanonicalIntelligenceInputs): GraphState {
  return {
    themes:        i.themes,
    stories:       i.clusters,
    storyThemes:   i.themes,
    matchedThemes: i.themes,
    episodes:      i.episodes,
    deals:         i.deals,
    snapshots:     i.snapshots,
    privateSignals: i.privateSignals,
  };
}

/**
 * The one rebuild sequence. Clears the singleton, rebuilds it from the given
 * adapter state, then re-applies cached provider market observations so
 * node.metadata.latestMarketData and OHLCV series survive the rebuild.
 */
export function provisionGraphState(state: GraphState): BuildResult {
  intelligenceGraph.clear();
  const built = buildGraphFromCurrentState(state);
  reingestCachedMarketObservations();
  // A2 (P2.7): a rebuilt graph is a new graph version - drop cached profiles.
  invalidateProfileCache();
  return built;
}

/** Canonical provisioning: the only permitted graph initialization path. */
export function provisionIntelligenceGraph(inputs: CanonicalIntelligenceInputs = {}): BuildResult {
  return provisionGraphState(canonicalGraphState(inputs));
}
