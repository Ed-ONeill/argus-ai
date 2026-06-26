/**
 * lib/themeTransmission.ts — lightweight theme → driver/sector/asset derivations.
 *
 * Shared by the Argus Market Map (lib/marketMap.ts) and What Matters Now. Kept
 * free of heavy deps (no maIntelligence) so feed components that only need the
 * transmission path don't pull the M&A engine into First Load. Pure read of
 * stored theme fields.
 */

import type { ThemeIntelligence } from "@/lib/types";
import { themeBeneficiaries } from "@/lib/themeIntelligence";
import { cleanMacroLabel } from "@/app/markets/marketsShared";

export function dirOf(t: ThemeIntelligence): "bullish" | "bearish" | "neutral" {
  return t.momentum_direction === "bullish" ? "bullish" : t.momentum_direction === "bearish" ? "bearish" : "neutral";
}

export function deriveDriver(t: ThemeIntelligence): string {
  const cn = t.causal_narrative ?? "";
  if (cn.includes("→")) {
    const head = cn.split("→").map(s => s.trim()).filter(Boolean)[0];
    if (head && head.length > 2) return cleanMacroLabel(head);
  }
  const macro = (t.related_macro_factors ?? [])[0];
  return macro ? cleanMacroLabel(macro) : "Macro backdrop";
}

export function deriveSector(t: ThemeIntelligence): string | null {
  const inds = t.related_industries ?? [];
  return inds.find(s => t.relationship_weights?.[s]?.direction === "positive") ?? inds[0] ?? null;
}

export interface ThemeTransmission { driver: string; sector: string | null; tickers: string[] }
export function transmissionPath(theme: ThemeIntelligence): ThemeTransmission {
  return { driver: deriveDriver(theme), sector: deriveSector(theme), tickers: themeBeneficiaries(theme, 3) };
}

/** "What to watch next" for a theme — varies by macro driver and direction. */
export function themeWatch(theme: ThemeIntelligence): string {
  const d = deriveDriver(theme).toLowerCase();
  const base = /rate|yield|fed|policy/.test(d) ? "bond yields"
    : /financ|credit|spread|default/.test(d) ? "credit spreads"
    : /energy|oil|crude|supply/.test(d) ? "crude and the curve"
    : /dollar|fx|currenc/.test(d) ? "the dollar"
    : /inflation|cpi|price/.test(d) ? "the next inflation print"
    : /power|electr|grid|infra/.test(d) ? "utility and grid orders"
    : "rates and breadth";
  const dir = dirOf(theme);
  return dir === "bullish" ? `${base} for follow-through`
    : dir === "bearish" ? `${base} for further pressure`
    : `${base} for direction`;
}
