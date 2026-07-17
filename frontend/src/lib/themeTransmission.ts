/**
 * lib/themeTransmission.ts — lightweight theme → driver/sector/asset derivations.
 *
 * LEGACY-PATH (IRE-1, ARGUS_INSTITUTIONAL_REASONING_ENGINE_V1): these local
 * driver/sector/path derivations are session-scoped prototypes of the
 * engine's R2 stage; events now carry a canonical typed transmission_chain
 * from app/explanations.py. Compare outputs during migration; do not extend.
 *
 * Shared by the Argus Market Map (lib/marketMap.ts) and What Matters Now. Kept
 * free of heavy deps (no maIntelligence) so feed components that only need the
 * transmission path don't pull the M&A engine into First Load. Pure read of
 * stored theme fields.
 *
 * Phase 2.4 (Intelligence Consistency): the CANONICAL transmission
 * representation is graph-recorded edges (profile.transmission / theRead
 * chain Z5). transmissionPath here is the STORED-FIELD FALLBACK - permitted
 * only when the graph is unavailable, rendered with an explicit label, and
 * never blended with graph chains in one render (ownership registry:
 * "transmission").
 */

import type { ThemeIntelligence } from "@/lib/types";
import { themeBeneficiaries } from "@/lib/themeIntelligence";
import { driverOf, watchLineOf } from "@/lib/intelligenceDeltas";
import { cleanMacroLabel } from "@/app/markets/marketsShared";

export function dirOf(t: ThemeIntelligence): "bullish" | "bearish" | "neutral" {
  return t.momentum_direction === "bullish" ? "bullish" : t.momentum_direction === "bearish" ? "bearish" : "neutral";
}

/** D9 consolidation (Phase 2 Feed unification): the driver derivation has ONE
    home in lib/intelligenceDeltas.driverOf; this wrapper only applies the
    cosmetic macro-label cleanup on top. */
export function deriveDriver(t: ThemeIntelligence): string {
  const d = driverOf(t);
  return d === "the macro backdrop" ? "Macro backdrop" : cleanMacroLabel(d);
}

export function deriveSector(t: ThemeIntelligence): string | null {
  const inds = t.related_industries ?? [];
  return inds.find(s => t.relationship_weights?.[s]?.direction === "positive") ?? inds[0] ?? null;
}

export interface ThemeTransmission { driver: string; sector: string | null; tickers: string[] }
export function transmissionPath(theme: ThemeIntelligence): ThemeTransmission {
  return { driver: deriveDriver(theme), sector: deriveSector(theme), tickers: themeBeneficiaries(theme, 3) };
}

/** "What to watch next" for a theme. D9: delegates to the single derivation in
    lib/intelligenceDeltas.watchLineOf. */
export function themeWatch(theme: ThemeIntelligence): string {
  return watchLineOf(theme);
}
