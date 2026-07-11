/**
 * lib/riskRead.ts - the ONE shared per-entity contradiction / risk / watch /
 * catalyst projection (Phase 2.4 Intelligence Consistency, task "consolidate
 * contradiction logic"; ownership registry: contradictions / risks /
 * invalidations / watch_items / catalysts).
 *
 * This is a THIN projection, not an engine: it reads the canonical
 * IntelligenceProfile (which itself composes the evidence engine, the
 * prediction engine, and recorded weakens-edges) plus the shared verified
 * catalysts and the derived watch line. Because every field is lifted from
 * the profile verbatim, a drawer that renders a RiskRead can never disagree
 * with Explorer, the Morning Brief, or The Read about the same entity - they
 * all bottom out in the same engine records.
 *
 * Consumers: the Markets ThemeDetailDrawer, the feed ThemeDrawer /
 * IntelligenceWorkspace / IntelligenceStream (via their pages or directly),
 * and tests (85.x). Honest degradation: when the entity is not in the graph,
 * basis is "unavailable" and only the stored-field derived watch line (which
 * needs no graph) survives - callers must fall back to explicitly LABELED
 * stored-field reads, never silently blend.
 *
 * Pure module, relative imports only. No em/en dashes.
 */

import { intelligenceGraph as G } from "./intelligenceGraph";
import { cachedProfile } from "./profileCache";
import { verifiedCatalystsFor, type CatalystItem } from "./theRead";
import { watchLineOf } from "./intelligenceDeltas";
import type { ThemeIntelligence } from "./types";

export interface RiskReadWeakening {
  label:        string;
  relationship: string;
  nodeType:     string;
}

export interface RiskRead {
  /** "graph" when the shared engines resolved the entity; "unavailable" otherwise. */
  basis: "graph" | "unavailable";
  /** Evidence-engine contradiction records, verbatim from profile.risks. */
  contradictions: Array<{ detail: string; severity: number }>;
  /** Prediction-engine invalidation condition, verbatim from profile.risks. */
  invalidation: string | null;
  /** Recorded weakens-group edges (real graph edges, never padded). */
  weakening: RiskReadWeakening[];
  /** Ranked watch items: profile watch (falsifiers first) + the derived line. */
  watchItems: string[];
  /** Verified, dateless catalysts recorded against this entity. */
  catalysts: CatalystItem[];
}

/**
 * Project the shared risk read for one entity. `theme` (optional) contributes
 * only the derived, dateless watch line - a stored-field derivation whose one
 * home is intelligenceDeltas.watchLineOf, valid with or without the graph.
 */
export function buildRiskRead(entityKey: string, theme?: ThemeIntelligence | null): RiskRead {
  const derivedWatch = theme ? `Watch ${watchLineOf(theme)}.` : null;

  const node = G.getNode(entityKey);
  if (!node) {
    return {
      basis: "unavailable", contradictions: [], invalidation: null, weakening: [],
      watchItems: derivedWatch ? [derivedWatch] : [], catalysts: [],
    };
  }

  const p = cachedProfile(entityKey);   // A2: one profile per entity per graph version
  const risks = p.risks.data;
  const watchItems = [...(p.watch.data?.items ?? [])];
  if (derivedWatch && !watchItems.includes(derivedWatch)) watchItems.push(derivedWatch);

  return {
    basis: "graph",
    contradictions: (risks?.contradictions ?? []).map(c => ({ detail: c.detail, severity: c.severity })),
    invalidation: risks?.invalidation ?? null,
    weakening: (risks?.weakening ?? []).map(w => ({ label: w.label, relationship: w.relationship, nodeType: w.nodeType })),
    watchItems: watchItems.slice(0, 5),
    catalysts: verifiedCatalystsFor([node.label]),
  };
}
