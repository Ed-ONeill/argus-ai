/**
 * lib/profileCache.ts - the shared Intelligence Profile cache (Phase 2.7,
 * roadmap abstraction A2).
 *
 * One `buildIntelligenceProfile` result per canonical entity per GRAPH
 * VERSION. The version is a monotonic counter bumped by the only sanctioned
 * graph writers:
 *   - lib/intelligenceProvisioning.provisionGraphState (the one rebuild)
 *   - dataAdapters/observationGraphBridge.ingestProviderObservations (the
 *     additive market-observation ingest)
 * so identical entity reads within one graph version return the SAME cached
 * object (referential equality - pinned by 90.x), and any reprovision or
 * additive ingest invalidates every cached profile. Client-module-level
 * state only: per-tab, no cross-user surface, nothing persisted.
 *
 * Pure besides the cache map. No em/en dashes.
 */

import { buildIntelligenceProfile, type IntelligenceProfile, type ProfileInputs } from "./intelligenceProfile";

let version = 1;
const cache = new Map<string, IntelligenceProfile>();

/** Bump the graph version and drop every cached profile. Called by the
    sanctioned graph writers; callable from tests. */
export function invalidateProfileCache(): void {
  version += 1;
  cache.clear();
}

/** The current cache/graph version (monotonic within a session). */
export function profileCacheVersion(): number {
  return version;
}

/**
 * The cached profile for one canonical entity key. Only parameterless reads
 * are cached: callers that inject page-level ProfileInputs (a narrative
 * headline) get a fresh build, because injected context is caller-specific.
 */
export function cachedProfile(entityKey: string, inputs?: ProfileInputs): IntelligenceProfile {
  if (inputs && (inputs.kindHint !== undefined || inputs.narrative !== undefined)) {
    return buildIntelligenceProfile(entityKey, inputs);
  }
  const k = entityKey.toLowerCase();
  const hit = cache.get(k);
  if (hit) return hit;
  const p = buildIntelligenceProfile(entityKey);
  cache.set(k, p);
  return p;
}
