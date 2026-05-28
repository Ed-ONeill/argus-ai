/**
 * themeEvolution.ts — Narrative Evolution Engine
 *
 * Maps ThemeIntelligence backend signals to one of 7 evolution states,
 * using momentum_label as the primary signal enriched by persistence,
 * breadth, volatility, source diversity, and cross-category confirmation.
 *
 * Zero LLM calls. Pure deterministic computation.
 */

import type { ThemeIntelligence } from "./types";

// ── Evolution state ───────────────────────────────────────────────────────────

export type ThemeEvolutionState =
  | "accelerating"
  | "strengthening"
  | "broadening"
  | "stabilizing"
  | "peaking"
  | "weakening"
  | "reversing";

export interface ThemeEvolutionMeta {
  label:       string;
  icon:        string;
  color:       string;   // hex — for inline-style pages
  bg:          string;   // rgba — for inline-style pages
  border:      string;   // rgba — for inline-style pages
  tailwind:    string;   // Tailwind utility string — for CSS-variable pages
  description: string;   // one phrase explaining the state
}

export const THEME_EVOLUTION_META: Record<ThemeEvolutionState, ThemeEvolutionMeta> = {
  accelerating: {
    label: "Accelerating", icon: "↑↑",
    color: "#22c55e", bg: "rgba(34,197,94,0.10)",    border: "rgba(34,197,94,0.24)",
    tailwind: "text-emerald-600 bg-emerald-50 border-emerald-200",
    description: "Signal expanding rapidly across sources and sectors",
  },
  strengthening: {
    label: "Strengthening", icon: "↑",
    color: "#4ade80", bg: "rgba(74,222,128,0.10)",   border: "rgba(74,222,128,0.24)",
    tailwind: "text-emerald-600 bg-emerald-50 border-emerald-200",
    description: "Growing conviction with increasing evidence",
  },
  broadening: {
    label: "Broadening", icon: "◎",
    color: "#38bdf8", bg: "rgba(56,189,248,0.10)",   border: "rgba(56,189,248,0.24)",
    tailwind: "text-sky-600 bg-sky-50 border-sky-200",
    description: "Spreading across sectors and asset classes",
  },
  stabilizing: {
    label: "Stabilizing", icon: "→",
    color: "#94a3b8", bg: "rgba(148,163,184,0.08)",  border: "rgba(148,163,184,0.16)",
    tailwind: "text-ink-muted bg-raised border-edge",
    description: "Holding at current significance, not advancing",
  },
  peaking: {
    label: "Peaking", icon: "⚑",
    color: "#fbbf24", bg: "rgba(251,191,36,0.10)",   border: "rgba(251,191,36,0.24)",
    tailwind: "text-amber-600 bg-amber-50 border-amber-200",
    description: "Saturation signals emerging — watch for reversal",
  },
  weakening: {
    label: "Weakening", icon: "↓",
    color: "#fb923c", bg: "rgba(251,146,60,0.10)",   border: "rgba(251,146,60,0.24)",
    tailwind: "text-orange-600 bg-orange-50 border-orange-200",
    description: "Losing signal strength and source support",
  },
  reversing: {
    label: "Reversing", icon: "↓↓",
    color: "#ef4444", bg: "rgba(239,68,68,0.10)",    border: "rgba(239,68,68,0.24)",
    tailwind: "text-red-600 bg-red-50 border-red-200",
    description: "Prior consensus breaking down — regime shift risk",
  },
};

// ── State computation ─────────────────────────────────────────────────────────

export function computeThemeEvolutionState(t: ThemeIntelligence): ThemeEvolutionState {
  const label     = t.momentum_label     ?? "stable";
  const delta     = t.momentum_delta     ?? 0;
  const persist   = t.persistence_score  ?? 50;
  const breadth   = t.breadth_score      ?? 50;
  const volatil   = t.volatility_score   ?? 30;
  const confirmed = t.cross_category_confirmed ?? false;
  const industries = t.related_industries ?? [];
  const quality   = t.signal_quality     ?? "developing";

  // 1. Reversing — strongest negative signal
  if (label === "reversing") return "reversing";
  if (delta < -8 && persist < 40) return "reversing";

  // 2. Weakening — cooling or meaningful negative delta
  if (label === "cooling" || delta < -3) return "weakening";

  // 3. Peaking — high persistence + volatility spike + stalling delta
  //    Signals the theme is at a saturation inflection, not yet retreating
  if (persist > 70 && volatil > 50 && delta < 4 && label !== "accelerating") return "peaking";

  // 4. Accelerating — backend confirms or strong positive delta
  if (label === "accelerating") return "accelerating";
  if (delta > 8 && quality !== "speculative") return "accelerating";

  // 5. Broadening — spreading through new sectors (breadth + cross-category)
  if (confirmed && breadth > 55 && industries.length >= 3) return "broadening";

  // 6. Stabilizing — established, low-volatility holding pattern
  if ((label === "stable" || persist > 50) && Math.abs(delta) < 5) return "stabilizing";

  // 7. Strengthening — positive but not yet broadening/accelerating
  if (label === "strengthening" || label === "emerging") return "strengthening";

  return "stabilizing";
}

// ── Narrative text ────────────────────────────────────────────────────────────

export function getEvolutionNarrative(name: string, state: ThemeEvolutionState): string {
  switch (state) {
    case "accelerating":  return `${name} gaining momentum — signal score and source count rising sharply.`;
    case "strengthening": return `${name} building conviction with growing evidence and cross-source confirmation.`;
    case "broadening":    return `${name} spreading to new sectors — cross-category confirmation growing.`;
    case "stabilizing":   return `${name} holding at current significance — established but not advancing.`;
    case "peaking":       return `${name} showing saturation signals — watch for incoming reversal indicators.`;
    case "weakening":     return `${name} losing signal strength — fewer sources and declining confidence.`;
    case "reversing":     return `${name} reversing — prior consensus breaking down rapidly.`;
  }
}

// ── Theme filtering helpers ───────────────────────────────────────────────────

export function filterThemesByIndustry(
  themes: ThemeIntelligence[],
  industryName: string,
  keyAssets: string[],
): ThemeIntelligence[] {
  const nameL    = industryName.toLowerCase();
  const assetSet = new Set(keyAssets.map(a => a.toUpperCase()));
  return themes
    .filter(t =>
      t.related_industries.some(i => i.toLowerCase().includes(nameL)) ||
      t.related_assets.some(a => assetSet.has(a.toUpperCase()))
    )
    .sort((a, b) => (b.persistence_score ?? 0) - (a.persistence_score ?? 0));
}

const MA_KW = ["M&A", "merger", "acquisition", "buyout", "consolidation", "takeover", "deal", "private equity", "sponsor", "leveraged"];
const CAPITAL_KW = ["credit", "venture", "IPO", "funding", "capital", "private market", "lending", "monetary", "yield", "Fed", "rates", "liquidity", "buyout"];

function themeMatchesKeywords(t: ThemeIntelligence, kws: string[]): boolean {
  const corpus = `${t.name} ${t.description} ${t.related_industries.join(" ")}`.toLowerCase();
  return kws.some(kw => corpus.includes(kw.toLowerCase()));
}

export function filterMAThemes(themes: ThemeIntelligence[]): ThemeIntelligence[] {
  return themes
    .filter(t => themeMatchesKeywords(t, MA_KW))
    .sort((a, b) => (b.persistence_score ?? 0) - (a.persistence_score ?? 0));
}

export function filterCapitalFlowThemes(themes: ThemeIntelligence[]): ThemeIntelligence[] {
  return themes
    .filter(t => themeMatchesKeywords(t, CAPITAL_KW))
    .sort((a, b) => (b.persistence_score ?? 0) - (a.persistence_score ?? 0));
}

// ── Theme Lifecycle ───────────────────────────────────────────────────────────

export type ThemeLifecycleStage = "emerging" | "building" | "dominant" | "maturing" | "retiring";

export interface ThemeLifecycleMeta {
  label:       string;
  color:       string;
  bg:          string;
  border:      string;
  description: string;
}

export const THEME_LIFECYCLE_META: Record<ThemeLifecycleStage, ThemeLifecycleMeta> = {
  emerging:  {
    label: "Emerging",  color: "#38bdf8",
    bg: "rgba(56,189,248,0.08)",   border: "rgba(56,189,248,0.22)",
    description: "Newly detected — conviction still forming",
  },
  building:  {
    label: "Building",  color: "#a78bfa",
    bg: "rgba(167,139,250,0.08)",  border: "rgba(167,139,250,0.22)",
    description: "Evidence accumulating, confidence rising",
  },
  dominant:  {
    label: "Dominant",  color: "#22c55e",
    bg: "rgba(34,197,94,0.08)",    border: "rgba(34,197,94,0.22)",
    description: "Established, high-confidence, persistent",
  },
  maturing:  {
    label: "Maturing",  color: "#f59e0b",
    bg: "rgba(245,158,11,0.08)",   border: "rgba(245,158,11,0.22)",
    description: "Past peak — watch for rotation or reversal",
  },
  retiring:  {
    label: "Retiring",  color: "#94a3b8",
    bg: "rgba(148,163,184,0.06)",  border: "rgba(148,163,184,0.16)",
    description: "Signal fading — consensus unwinding",
  },
};

export function computeThemeLifecycleStage(t: ThemeIntelligence): ThemeLifecycleStage {
  const persist  = t.persistence_score  ?? 50;
  const days     = t.persistence_days   ?? 0;
  const cycles   = t.persistence_cycles ?? 0;
  const strength = t.signal_strength    ?? "weak";
  const evState  = computeThemeEvolutionState(t);

  // Retiring: weak and actively fading/reversing
  if (evState === "reversing" && persist < 40) return "retiring";
  if (strength === "weak" && (evState === "reversing" || evState === "weakening")) return "retiring";

  // Emerging: very new, low persistence, little cycle history
  if (persist < 25 || (days < 5 && cycles <= 1)) return "emerging";

  // Maturing: established but showing decline
  if (persist >= 55 && (evState === "weakening" || evState === "peaking")) return "maturing";

  // Dominant: well-established, active signal
  if (persist >= 55 && strength !== "weak") return "dominant";

  // Building: in between — growing but not yet established
  return "building";
}
