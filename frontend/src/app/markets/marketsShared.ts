// Shared, framework-agnostic helpers, constants, and types used by BOTH the
// Markets page and the (code-split) ThemeDetailDrawer. Keeping them in a neutral
// module lets the drawer load lazily without importing from the route component.

import type { ThemeIntelligence } from "@/lib/types";

export type DrawerData = {
  theme:      ThemeIntelligence;
  upstream:   string[];
  downstream: string[];
  connected:  { id: string; name: string; linkType: string; strength: string }[];
  conflicts:  { id: string; description: string; type: string; severity: string; themeIds: string[] }[];
};

const MACRO_LABEL_MAP: Record<string, string> = {
  "10Y Yield": "Treasury Yields", "TNX": "Treasury Yields",
  "WTI Spot": "Oil Prices", "Brent Crude": "Oil Prices", "BZ=F": "Oil Prices",
  "Credit Spreads": "Credit Conditions", "HY Spreads": "Credit Conditions",
  "IG Spreads": "Credit Conditions",
  "DXY": "Dollar Index", "USD Index": "Dollar Index",
  "NFP": "Employment Data", "Non-Farm Payrolls": "Employment Data",
  "CPI": "Inflation Data", "PCE": "Core Inflation",
  "Fed Funds Rate": "Fed Policy", "EFFR": "Fed Policy",
  "VIX": "Market Volatility", "GC=F": "Gold Prices",
};

export function cleanMacroLabel(raw: string): string {
  return MACRO_LABEL_MAP[raw] ?? raw;
}

const THEME_NAME_OVERRIDES: Record<string, string> = {
  "Non-Bank Lending Ascendancy":  "Private Credit",
  "Grid Bottleneck Trade":        "Power Infrastructure",
  "Higher-for-Longer Repricing":  "Interest Rates",
  "Silicon Sovereignty Capex":    "Semiconductor Capex",
  "Deglobalization Capex Cycle":  "Reshoring & Capex",
  "Fiscal Dominance Repricing":   "Fiscal Policy Impact",
  "Defense Spending Ascendancy":  "Defense Spending",
  "Credit Cycle Ascendancy":      "Credit Cycle",
  "Energy Transition Capex":      "Energy Transition",
};

// Keyword canonicalization so theme names read like sell-side coverage labels
// (Bloomberg / Goldman / JPM / MS) even when the backend emits a dramatized
// auto-generated name. Ordered most-specific first; first match wins.
const THEME_CANON: Array<{ regex: RegExp; name: string }> = [
  { regex: /private credit|direct lending|non.?bank|private capital|alternative (asset|credit)|shadow bank/i, name: "Private Credit" },
  { regex: /nuclear|\bsmr\b|uranium/i,                                          name: "Nuclear Power" },
  { regex: /hyperscal/i,                                                        name: "Hyperscaler Capex" },
  { regex: /data ?center|datacenter/i,                                          name: "Data Center Buildout" },
  { regex: /ai (compute|infra|arms|capex)|accelerated comput|ai spend/i,        name: "AI Infrastructure" },
  { regex: /semiconductor|silicon|chip (capex|cycle)|foundry|wafer/i,           name: "Semiconductor Capex" },
  { regex: /utility (capex|super|cycle)|utilities? capex/i,                     name: "Utility Capex Cycle" },
  { regex: /grid|transmission|power infra|electrical buildout/i,                name: "Power Infrastructure" },
  { regex: /reshor|deglobal|nearshor|onshoring|supply.?chain capex/i,           name: "Reshoring & Capex" },
  { regex: /higher.?for.?longer|rate repric|interest rate|hawkish/i,            name: "Interest Rates" },
  { regex: /fiscal domin|fiscal repric|deficit|treasury supply/i,              name: "Fiscal Policy" },
  { regex: /defense spend|defense ascend|rearmament|military buildup/i,         name: "Defense Spending" },
  { regex: /credit cycle|credit stress|default cycle/i,                         name: "Credit Cycle" },
  { regex: /energy transition|decarboniz|clean energy capex/i,                  name: "Energy Transition" },
  { regex: /\bm&a\b|dealmaking|consolidation wave|takeover wave/i,              name: "M&A Cycle" },
  { regex: /industrial metal|commodity supercycle|copper/i,                     name: "Industrial Metals" },
  { regex: /china (reopen|stimulus|pmi|recov|reflat)/i,                         name: "China Reflation" },
  { regex: /electrification|power demand/i,                                     name: "Electrification" },
];

export function cleanThemeName(raw: string): string {
  if (THEME_NAME_OVERRIDES[raw]) return THEME_NAME_OVERRIDES[raw];
  for (const c of THEME_CANON) if (c.regex.test(raw)) return c.name;
  // Fallback: strip dramatizing buzzwords the generator likes to append.
  return raw
    .replace(/\b(Ascendancy|Repricing|Renaissance|Supercycle|Arms Race|Takeover|Bonanza|Boom|Mania|Revolution)\b/gi, "")
    .replace(/\bSovereign(?:ty)?\b/gi, "")
    .replace(/\bDominance\b/gi, "")
    .replace(/\bTrade\b\s*$/i, "")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+&\s*$/, "")
    .trim() || raw;
}

export function confColor(score: number): string {
  // Conviction ramp tuned for the dark workstation surface — bright, legible
  // signal colors on #0A0F1C (not neon). High = green, moderate = amber, low = slate.
  return score >= 72 ? "#34d399"   // high conviction — emerald
       : score >= 50 ? "#fbbf24"   // moderate — amber
       :               "#94a3b8";  // low — slate
}

// Conviction is rounded to the nearest 5 so a 76 vs 74 never reads as real
// precision, and is always shown alongside the evidence that produced it.
export function convScore(n: number): number {
  return Math.round((n ?? 0) / 5) * 5;
}

export function convBasis(t: ThemeIntelligence): string {
  const ev = t.evidence_count ?? 0;
  const cy = t.persistence_cycles ?? 0;
  const parts: string[] = [];
  if (ev > 0) parts.push(`${ev} source${ev !== 1 ? "s" : ""}`);
  // Prefer the persistent cross-session count from memory when available (more
  // meaningful than in-process cycles); fall back to cycles before memory exists.
  const sessions = t.memory?.sessions_observed ?? 0;
  if (sessions >= 2)  parts.push(`${sessions} sessions`);
  else if (cy > 0)    parts.push(`${cy} cycle${cy !== 1 ? "s" : ""}`);
  return parts.join(" · ");
}

export function deriveKeyRisk(t: ThemeIntelligence): string {
  const { signal_quality, volatility_score, competition_penalty,
          momentum_label, cross_category_confirmed, confidence, second_order_effects } = t;
  if (signal_quality === "speculative")    return "The thesis is not yet corroborated across independent sources.";
  if (volatility_score >= 70)             return "A crowded trade leaves it vulnerable to a sharp unwind.";
  if (competition_penalty >= 30)          return "Consensus positioning leaves limited upside from current levels.";
  if (momentum_label === "reversing")     return "Momentum is already rolling over and the entry looks late.";
  if (!cross_category_confirmed && confidence < 60)
    return "The signal sits in a single asset class and needs cross-asset confirmation.";
  if (second_order_effects.length > 0)   return second_order_effects[0];
  return "A policy or macro inflection would invalidate the thesis.";
}

export function countdownLabel(daysAway: number): string {
  return daysAway <= 0 ? "today" : daysAway === 1 ? "1d" : `${daysAway}d`;
}
