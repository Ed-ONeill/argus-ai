"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Zap, Network, BarChart2,
  X, ChevronRight, AlertTriangle,
  Bookmark, BookmarkCheck, ChevronDown,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useFeed } from "@/hooks/useFeed";
import { useSaved } from "@/hooks/useSaved";
import { useMarketData } from "@/hooks/useMarketData";
import type { StoryCluster, ThemeIntelligence, SectorData, MarketBrief, FeedItem } from "@/lib/types";
import type { TickerData } from "@/hooks/useMarketData";
import {
  computeThemeEvolutionState,
  THEME_EVOLUTION_META,
  computeThemeLifecycleStage,
  THEME_LIFECYCLE_META,
  type ThemeLifecycleStage,
} from "@/lib/themeEvolution";
import {
  buildThemeRelationshipMap,
  detectContradictions,
  generateIntelligenceBriefing,
  generateBullBearCases,
  generateNextCatalysts,
  generateWatchSignals,
  generateInvalidationSignals,
  computeThemeHealth,
  generateWhyItMattersNow,
  themeBeneficiaries,
  bestExpressions,
  themeLosers,
} from "@/lib/themeIntelligence";
import { useMarketState } from "@/hooks/useMarketState";
import { useFollowedThemes, type FollowedTheme } from "@/hooks/useFollowedThemes";
import { useThemeAlerts, type ThemeAlert } from "@/hooks/useThemeAlerts";


// ── Constants ─────────────────────────────────────────────────────────────────

const SNAPSHOT_CONFIGS = [
  {
    key: "SPY", label: "S&P 500", sub: "US Equities", color: "#2563EB",
    filterKw: ["S&P", "SPX", "equity", "Equities", "stocks", "NYSE", "indices"],
  },
  {
    key: "QQQ", label: "Nasdaq", sub: "Tech / Growth", color: "#7C3AED",
    filterKw: ["Nasdaq", "QQQ", "Technology", "Semiconductors", "tech", "growth", "AI"],
  },
  {
    key: "TNX", label: "10Y UST", sub: "Treasury Yield", color: "#0891B2",
    filterKw: ["Treasury", "Treasuries", "Yields", "Fed", "FOMC", "Rates", "bonds", "10Y", "2Y", "inflation", "rate cut"],
  },
  {
    key: "BTC-USD", label: "BTC", sub: "Bitcoin", color: "#D97706",
    filterKw: ["Bitcoin", "BTC", "Ethereum", "ETH", "crypto", "digital asset", "blockchain"],
  },
] as const;

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

const EVOLUTION_CLS: Record<string, string> = {
  accelerating:  "text-emerald-500",
  strengthening: "text-emerald-500",
  broadening:    "text-sky-400",
  stabilizing:   "text-slate-400",
  peaking:       "text-amber-400",
  weakening:     "text-orange-400",
  reversing:     "text-red-500",
};

const EVOLUTION_COLOR: Record<string, string> = {
  accelerating:  "#10b981",
  strengthening: "#10b981",
  broadening:    "#38bdf8",
  stabilizing:   "#94a3b8",
  peaking:       "#f59e0b",
  weakening:     "#f97316",
  reversing:     "#ef4444",
};

const SNAP_STRIP_KEYS = [
  { key: "SPY",     label: "S&P 500" },
  { key: "QQQ",     label: "Nasdaq"  },
  { key: "TNX",     label: "10Y UST" },
  { key: "BZ=F",    label: "Oil"     },
  { key: "BTC-USD", label: "Bitcoin" },
  { key: "VIX",     label: "VIX"     },
] as const;

const LIFECYCLE_STAGES: ThemeLifecycleStage[] = [
  "emerging", "building", "dominant", "maturing", "retiring",
];

type SnapshotKey = typeof SNAPSHOT_CONFIGS[number]["key"];

type DrawerData = {
  theme:      ThemeIntelligence;
  upstream:   string[];
  downstream: string[];
  connected:  { id: string; name: string; linkType: string; strength: string }[];
  conflicts:  { id: string; description: string; type: string; severity: string; themeIds: string[] }[];
};


// ── Helpers ───────────────────────────────────────────────────────────────────

function formatChange(ticker: TickerData): string {
  if (ticker.key === "TNX")
    return `${ticker.change >= 0 ? "+" : ""}${ticker.change.toFixed(3)}%`;
  if (ticker.key === "VIX")
    return `${ticker.change >= 0 ? "+" : ""}${ticker.change.toFixed(2)}`;
  return `${ticker.changePercent >= 0 ? "+" : ""}${ticker.changePercent.toFixed(2)}%`;
}


function formatAge(seconds: number | undefined): string {
  if (seconds === undefined || seconds < 0) return "";
  if (seconds < 60)   return `${Math.round(seconds)}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  return `${Math.floor(seconds / 3600)}h`;
}

function isUp(t: TickerData): boolean {
  return t.key === "TNX" ? t.change > 0 : t.changePercent > 0;
}

function cleanMacroLabel(raw: string): string {
  return MACRO_LABEL_MAP[raw] ?? raw;
}

function cleanThemeName(raw: string): string {
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

function regimeAccentColor(regime: string): string {
  const l = regime.toLowerCase();
  if (l.includes("risk-on") || l.includes("goldilocks") || l.includes("expansion")) return "#10b981";
  if (l.includes("risk-off") || l.includes("stagflat") || l.includes("recession"))  return "#f87171";
  if (l.includes("reflat") || l.includes("inflation")) return "#fbbf24";
  return "#818cf8";
}

function confColor(score: number): string {
  return score >= 75 ? "#10b981" : score >= 50 ? "#f59e0b" : "#94a3b8";
}

// Conviction is rounded to the nearest 5 so a 76 vs 74 never reads as real
// precision, and is always shown alongside the evidence that produced it.
function convScore(n: number): number {
  return Math.round((n ?? 0) / 5) * 5;
}
function convBasis(t: ThemeIntelligence): string {
  const ev = t.evidence_count ?? 0;
  const cy = t.persistence_cycles ?? 0;
  const parts: string[] = [];
  if (ev > 0) parts.push(`${ev} source${ev !== 1 ? "s" : ""}`);
  if (cy > 0) parts.push(`${cy} cycle${cy !== 1 ? "s" : ""}`);
  return parts.join(" · ");
}

function fmtSnapPrice(key: string, price: number): string {
  if (key === "TNX")     return price.toFixed(3) + "%";
  if (key === "BTC-USD") return "$" + price.toLocaleString("en-US", { maximumFractionDigits: 0 });
  if (key === "BZ=F")    return "$" + price.toFixed(2);
  if (key === "VIX")     return price.toFixed(2);
  return price.toFixed(2);
}

function borderColorForTheme(t: ThemeIntelligence, evState: string): string {
  if (t.momentum_direction === "bullish") return "#10b981";
  if (t.momentum_direction === "bearish") return "#ef4444";
  if (evState === "accelerating" || evState === "strengthening" || evState === "broadening") return "#10b981";
  if (evState === "reversing"    || evState === "weakening") return "#ef4444";
  return "#f59e0b";
}

function deriveTimeHorizon(t: ThemeIntelligence): string {
  const { momentum_label, persistence_cycles, signal_quality, persistence_days } = t;
  if (momentum_label === "reversing")  return "Late cycle";
  if (momentum_label === "cooling")    return "1 to 3 months";
  if (momentum_label === "emerging")   return "Near term";
  if (persistence_cycles >= 6)         return "Structural";
  if (persistence_cycles >= 4)         return "6 to 12 months";
  if (momentum_label === "accelerating" && signal_quality === "confirmed") return "3 to 6 months";
  if (momentum_label === "strengthening") return "2 to 4 months";
  if (persistence_days  >= 60)         return "3 to 6 months";
  if (persistence_days  >= 30)         return "1 to 3 months";
  return "1 to 3 months";
}

function deriveKeyRisk(t: ThemeIntelligence): string {
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

// Time-horizon bucket — analyst register, no "momentum fading" filler.
function timeBucket(t: ThemeIntelligence): string {
  if (t.momentum_label === "reversing" || t.momentum_label === "cooling") return "Tactical";
  if ((t.persistence_cycles ?? 0) >= 6)  return "Structural";
  if ((t.persistence_cycles ?? 0) >= 3 || t.momentum_label === "accelerating") return "Medium-term";
  return "Near-term";
}

function confTrend(d: number): { label: string; color: string; arrow: string } {
  return d > 2  ? { label: "Rising",  color: "#10b981", arrow: "▲" }
       : d < -2 ? { label: "Falling", color: "#ef4444", arrow: "▼" }
       :          { label: "Stable",  color: "#94a3b8", arrow: "→" };
}

const TIER1_SOURCES = new Set([
  "Bloomberg Markets", "Reuters", "Reuters M&A", "Reuters Business", "Reuters World",
  "WSJ Markets", "Wall Street Journal", "FT Deals", "FT Companies", "Financial Times",
  "Nikkei Asia", "CNBC Economy", "CNBC Companies", "The Information", "AP Business", "AP World",
  "Federal Reserve", "US Treasury", "ECB", "BIS", "IMF", "World Bank", "SEC Filings", "BLS", "EIA",
]);

function sourceQuality(sources: string[]): { label: string; color: string } {
  const t1 = sources.filter(s => TIER1_SOURCES.has(s)).length;
  if (t1 >= 2) return { label: "High", color: "#10b981" };
  if (t1 >= 1) return { label: "Solid", color: "#34d399" };
  return { label: "Mixed", color: "#94a3b8" };
}


// ── Market Intelligence Snapshot ──────────────────────────────────────────────

function SnapCell({ label, value, color, sub }: {
  label: string; value: string; color?: string; sub?: string;
}) {
  return (
    <div className="min-w-0 px-3 py-1.5 border-r border-edge/60 last:border-r-0">
      <p className="text-[6.5px] font-bold uppercase tracking-[0.14em] text-ink-muted/45 mb-0.5 truncate">{label}</p>
      <p className="text-[12px] font-bold leading-tight truncate" style={{ color: color ?? "rgba(255,255,255,0.9)" }}>{value}</p>
      {sub && <p className="text-[7.5px] text-ink-muted/45 mt-px truncate">{sub}</p>}
    </div>
  );
}

function themeRiskScore(t: ThemeIntelligence): number {
  let s = 0;
  if (t.momentum_direction === "bearish") s += 100;
  if (t.momentum_label === "reversing") s += 60;
  else if (t.momentum_label === "cooling") s += 30;
  s += Math.max(0, -(t.momentum_delta ?? 0)) * 2;
  s += (t.volatility_score ?? 0) / 5;
  s += (t.competition_penalty ?? 0) / 5;
  return s;
}

function MarketSnapshot({ themes, sectorData, regime, brief }: {
  themes:     ThemeIntelligence[];
  sectorData: SectorData | null;
  regime:     string;
  brief:      MarketBrief | null | undefined;
}) {
  void sectorData;
  if (themes.length === 0) return null;

  const positions  = computeSectorPositions(themes);
  const total      = positions.length;
  const confirming = positions.filter(p => p.direction !== "bearish").length;
  const conviction = brief?.confidence
    ?? Math.round(themes.reduce((s, t) => s + (t.confidence ?? 0), 0) / themes.length);
  const dominant   = themes[0];
  const fastest    = [...themes].sort((a, b) => (b.momentum_delta ?? 0) - (a.momentum_delta ?? 0))[0];
  const risk       = [...themes].sort((a, b) => themeRiskScore(b) - themeRiskScore(a))[0];
  const opp        = positions.find(p => p.direction === "bullish") ?? positions[0];
  const state      = regime || brief?.market_regime || "Neutral";
  const accent     = regimeAccentColor(state);

  return (
    <div className="mb-2 rounded-xl border border-edge bg-surface overflow-hidden" style={{ borderTop: `2px solid ${accent}` }}>
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 divide-y divide-edge/60 sm:divide-y-0">
        <SnapCell label="Market State" value={state} color={accent} />
        <SnapCell label="Conviction" value={`${convScore(conviction)}`} color={confColor(conviction)} />
        <SnapCell label="Breadth" value={`${confirming}/${total}`} sub="sectors confirming" />
        <SnapCell label="Dominant Theme" value={dominant ? cleanThemeName(dominant.name) : "n/a"} />
        <SnapCell label="Fastest Accelerating" value={fastest ? cleanThemeName(fastest.name) : "n/a"} color="#10b981"
          sub={fastest ? `${(fastest.momentum_delta ?? 0) >= 0 ? "+" : ""}${fastest.momentum_delta ?? 0} mom` : undefined} />
        <SnapCell label="Largest Risk" value={risk ? cleanThemeName(risk.name) : "n/a"} color="#ef4444" />
        <SnapCell label="Largest Opportunity" value={opp ? opp.sector : "n/a"} color="#10b981"
          sub={opp ? `${opp.conviction}% conviction` : undefined} />
      </div>
    </div>
  );
}

// ── Market Internals strip ────────────────────────────────────────────────────

function InternalStat({ label, pos, neg }: { label: string; pos: number; neg: number }) {
  return (
    <div className="flex items-center gap-1.5 px-2.5 py-1 border-r border-edge/50 last:border-r-0 shrink-0">
      <span className="text-[7px] font-bold uppercase tracking-[0.1em] text-ink-muted/45">{label}</span>
      <span className="text-[11px] font-black tabular-nums" style={{ color: "#10b981" }}>{pos}</span>
      <span className="text-ink-muted/30 text-[9px]">/</span>
      <span className="text-[11px] font-black tabular-nums" style={{ color: "#ef4444" }}>{neg}</span>
    </div>
  );
}

function MarketInternals({ themes }: { themes: ThemeIntelligence[] }) {
  if (themes.length === 0) return null;
  const positions = computeSectorPositions(themes);
  const adv = themes.filter(t => (t.momentum_delta ?? 0) > 0).length;
  const dec = themes.filter(t => (t.momentum_delta ?? 0) < 0).length;
  const hi  = themes.filter(t => t.momentum_label === "accelerating").length;
  const lo  = themes.filter(t => t.momentum_label === "reversing").length;
  const sp  = positions.filter(p => p.direction === "bullish").length;
  const sn  = positions.filter(p => p.direction === "bearish").length;
  return (
    <div className="mb-3 rounded-lg border border-edge bg-surface flex items-center flex-wrap overflow-hidden">
      <span className="text-[7px] font-bold uppercase tracking-[0.16em] text-ink-muted/35 px-2.5 py-1 border-r border-edge/50 shrink-0">Internals</span>
      <InternalStat label="Advancers / Decliners" pos={adv} neg={dec} />
      <InternalStat label="New Highs / Lows" pos={hi} neg={lo} />
      <InternalStat label="Sectors +/−" pos={sp} neg={sn} />
    </div>
  );
}



// ── Dominant Narrative ────────────────────────────────────────────────────────

const _MOMENTUM_VERB: Record<string, string> = {
  accelerating: "accelerated", strengthening: "strengthened", stable: "held firm",
  cooling: "cooled", reversing: "reversed", emerging: "emerged",
};

function deriveWhatHappened(brief: MarketBrief | null | undefined, themes: ThemeIntelligence[]): string {
  const bull = themes.filter(t => t.momentum_direction === "bullish").length;
  const bear = themes.filter(t => t.momentum_direction === "bearish").length;
  const net  = bull - bear;
  const r    = (brief?.market_regime ?? "").toLowerCase();
  if (r.includes("risk-off") || net <= -2) return "Risk appetite weakened across asset classes.";
  if (r.includes("risk-on")  || net >=  2) return "Risk appetite firmed across asset classes.";
  return "Markets traded mixed with no dominant directional bias.";
}

function deriveWhy(brief: MarketBrief | null | undefined, top: ThemeIntelligence | undefined): string {
  if (!top) return brief?.narrative_shift ?? "";
  const verb   = _MOMENTUM_VERB[top.momentum_label] ?? "remained in focus";
  const factor = (top.related_macro_factors ?? [])[0];
  return `${cleanThemeName(top.name)} ${verb}${factor ? `, driven by ${cleanMacroLabel(factor)}` : ""}.`;
}

function DominantNarrative({ brief, themes }: {
  brief:  MarketBrief | null | undefined;
  themes: ThemeIntelligence[];
}) {
  const top = themes[0];
  if (!brief && !top) return null;

  const confidence   = brief?.confidence ?? top?.confidence ?? 0;
  const cColor       = confColor(confidence);
  const whatHappened = deriveWhatHappened(brief, themes);
  const whyHappened  = deriveWhy(brief, top);
  const implications = top ? generateWhyItMattersNow(top).slice(0, 3) : [];
  const benef      = top ? themeBeneficiaries(top, 5) : [];
  const losers     = top ? themeLosers(top, 3) : null;
  const drivers    = themes.slice(0, 5);
  const trend      = confTrend(top?.momentum_delta ?? 0);
  const horizon    = top ? timeBucket(top) : "n/a";
  const confirming = top
    ? themes.filter(t => t.momentum_direction === top.momentum_direction).length
    : themes.length;

  return (
    <div className="mb-4 rounded-xl border border-edge overflow-hidden bg-surface"
      style={{ borderTop: `3px solid ${cColor}` }}>
      {/* hero headline */}
      <div className="px-4 pt-3 pb-3">
        <p className="text-[8px] font-bold uppercase tracking-[0.22em] text-ink-muted/45 mb-1.5">Dominant Narrative</p>
        <p className="text-[19px] sm:text-[21px] font-black text-ink leading-[1.12] tracking-tight">{whatHappened}</p>
      </div>

      {/* stats strip */}
      <div className="grid grid-cols-4 divide-x divide-edge/60 border-y border-edge/60" style={{ background: "rgba(255,255,255,0.012)" }}>
        <div className="px-3 py-1.5">
          <p className="text-[6.5px] font-bold uppercase tracking-[0.14em] text-ink-muted/40">Confidence</p>
          <p className="text-[18px] font-black tabular-nums leading-none mt-0.5" style={{ color: cColor }}>{confidence}<span className="text-[10px] opacity-55">%</span></p>
        </div>
        <div className="px-3 py-1.5">
          <p className="text-[6.5px] font-bold uppercase tracking-[0.14em] text-ink-muted/40">Trend</p>
          <p className="text-[12px] font-bold leading-none mt-1.5" style={{ color: trend.color }}>{trend.arrow} {trend.label}</p>
        </div>
        <div className="px-3 py-1.5">
          <p className="text-[6.5px] font-bold uppercase tracking-[0.14em] text-ink-muted/40">Confirming</p>
          <p className="text-[12px] font-bold text-ink leading-none mt-1.5 tabular-nums">{confirming} themes</p>
        </div>
        <div className="px-3 py-1.5">
          <p className="text-[6.5px] font-bold uppercase tracking-[0.14em] text-ink-muted/40">Horizon</p>
          <p className="text-[12px] font-bold text-ink-secondary leading-none mt-1.5">{horizon}</p>
        </div>
      </div>

      {/* why + what matters */}
      <div className="grid sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-edge/60">
        <div className="px-4 py-2.5">
          <p className="text-[7px] font-bold uppercase tracking-[0.16em] text-ink-muted/40 mb-1">Why It Happened</p>
          <p className="text-[12px] text-ink-secondary leading-snug">{whyHappened}</p>
        </div>
        <div className="px-4 py-2.5">
          <p className="text-[7px] font-bold uppercase tracking-[0.16em] text-ink-muted/40 mb-1">Market Impact</p>
          <ul className="space-y-1">
            {implications.map((b, i) => (
              <li key={i} className="flex items-start gap-1.5 text-[11px] text-ink-secondary leading-snug">
                <span className="shrink-0 mt-[5px] w-1 h-1 rounded-full" style={{ background: cColor }} />{b}
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* who wins / who loses — prominent securities */}
      {(benef.length > 0 || losers) && (
        <div className="px-4 py-2.5 border-t border-edge/60 flex flex-wrap items-center gap-x-4 gap-y-2">
          {benef.length > 0 && (
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[8px] font-bold uppercase tracking-[0.16em] text-emerald-700/70">Primary Beneficiaries</span>
              {benef.map(tk => (
                <span key={tk} className="text-[12px] font-black tabular-nums px-1.5 py-0.5 rounded bg-emerald-500/12 text-emerald-700 border border-emerald-500/25">{tk}</span>
              ))}
            </div>
          )}
          {losers && (
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[8px] font-bold uppercase tracking-[0.16em] text-red-600/70">Most Exposed</span>
              {losers.tickers.map(tk => (
                <span key={tk} className="text-[12px] font-black tabular-nums px-1.5 py-0.5 rounded bg-red-500/8 text-red-600/90 border border-red-500/20">{tk}</span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* drivers */}
      {drivers.length > 0 && (
        <div className="px-4 py-2 border-t border-edge/60 flex items-center gap-1.5 flex-wrap" style={{ background: "rgba(37,99,235,0.03)" }}>
          <span className="text-[7px] font-bold uppercase tracking-[0.16em] text-accent/55 mr-1">Root Causes</span>
          {drivers.map(t => {
            const mm = MOMENTUM_META[t.momentum_label] ?? MOMENTUM_META.stable;
            return (
              <span key={t.id} className="flex items-center gap-1 text-[9.5px] font-semibold px-1.5 py-0.5 rounded bg-raised border border-edge text-ink-secondary">
                <span className="w-1 h-1 rounded-full shrink-0" style={{ background: mm.color }} />{cleanThemeName(t.name)}
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}



// ── Today's Changes ───────────────────────────────────────────────────────────

function changeSignificance(d: number): string {
  const a = Math.abs(d);
  return a >= 15 ? "Major" : a >= 8 ? "Notable" : a >= 3 ? "Moderate" : "Minor";
}

function ChangeRow({ t, onClick }: { t: ThemeIntelligence; onClick: () => void }) {
  const d  = t.momentum_delta ?? 0;
  const up = d > 0;
  const clr = up ? "#10b981" : "#ef4444";
  return (
    <button onClick={onClick}
      className="w-full flex items-center gap-2 px-2.5 py-1 rounded hover:bg-raised/50 transition-colors text-left">
      <span className="text-[10px] shrink-0" style={{ color: clr }}>{up ? "▲" : "▼"}</span>
      <span className="text-[11px] font-semibold text-ink truncate flex-1">{cleanThemeName(t.name)}</span>
      <span className="text-[6.5px] uppercase tracking-wide text-ink-muted/40 shrink-0 hidden sm:inline">{changeSignificance(d)}</span>
      <span className="text-[11px] font-black tabular-nums shrink-0 w-9 text-right" style={{ color: clr }}>{up ? "+" : ""}{d}</span>
    </button>
  );
}

function WhatChangedToday({ themes, onThemeClick }: {
  themes:       ThemeIntelligence[];
  onThemeClick: (t: ThemeIntelligence) => void;
}) {
  const moved = useMemo(
    () => [...themes].filter(t => Math.abs(t.momentum_delta ?? 0) >= 1)
            .sort((a, b) => Math.abs(b.momentum_delta ?? 0) - Math.abs(a.momentum_delta ?? 0)),
    [themes],
  );
  if (moved.length === 0) return null;
  const up   = moved.filter(t => (t.momentum_delta ?? 0) > 0).slice(0, 5);
  const down = moved.filter(t => (t.momentum_delta ?? 0) < 0).slice(0, 5);

  return (
    <div className="mb-4">
      <SectionHeader label="Today's Changes" icon={<Zap size={11} className="text-accent shrink-0" />} sub="what actually moved" />
      <div className="grid sm:grid-cols-2 gap-x-3 rounded-lg border border-edge bg-surface px-1.5 py-1.5">
        <div className="space-y-px">
          {up.map(t => <ChangeRow key={t.id} t={t} onClick={() => onThemeClick(t)} />)}
          {up.length === 0 && <p className="text-[9px] text-ink-muted/40 italic px-2.5 py-1">No gainers today</p>}
        </div>
        <div className="space-y-px sm:border-l border-edge/50 sm:pl-2">
          {down.map(t => <ChangeRow key={t.id} t={t} onClick={() => onThemeClick(t)} />)}
          {down.length === 0 && <p className="text-[9px] text-ink-muted/40 italic px-2.5 py-1">No faders today</p>}
        </div>
      </div>
    </div>
  );
}


// ── Section header ─────────────────────────────────────────────────────────────

function SectionHeader({ label, icon, sub }: {
  label: string; icon?: React.ReactNode; sub?: string;
}) {
  return (
    <div className="flex items-center gap-2 mb-2">
      {icon}
      <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-ink-secondary">{label}</span>
      {sub && <span className="text-[9px] text-ink-muted">{sub}</span>}
      <span className="h-px flex-1 bg-edge" />
    </div>
  );
}


// ── Watchlist Panel ───────────────────────────────────────────────────────────

function WatchlistPanel({
  followed, liveThemes, onOpenTheme, onUnfollow, alerts,
}: {
  followed:    FollowedTheme[];
  liveThemes:  ThemeIntelligence[];
  onOpenTheme: (t: ThemeIntelligence) => void;
  onUnfollow:  (id: string) => void;
  alerts:      ThemeAlert[];
}) {
  const [collapsed, setCollapsed] = useState(false);

  if (followed.length === 0) return null;

  const byId = new Map(liveThemes.map(t => [t.id, t]));

  return (
    <div
      className="mb-3 rounded-lg border overflow-hidden bg-surface"
      style={{ borderColor: "var(--color-edge)", borderLeft: "3px solid #2563EB" }}
    >
      {/* Header row */}
      <button
        onClick={() => setCollapsed(v => !v)}
        className="w-full flex items-center justify-between px-3 py-2
                   bg-raised/50 hover:bg-raised transition-colors"
      >
        <div className="flex items-center gap-2">
          <BookmarkCheck size={11} className="text-accent shrink-0" />
          <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-ink-secondary">
            Your Watchlist
          </span>
          <span className="text-[9px] font-bold tabular-nums px-1.5 py-0.5 rounded-full
                           bg-accent/10 text-accent leading-none">
            {followed.length}
          </span>
          {alerts.length > 0 && (
            <span className="text-[8.5px] font-bold px-1.5 py-0.5 rounded-full leading-none
                             text-amber-600 bg-amber-50 border border-amber-200">
              {alerts.length} update{alerts.length !== 1 ? "s" : ""}
            </span>
          )}
        </div>
        <ChevronDown
          size={12}
          className={cn(
            "text-ink-muted/40 transition-transform duration-200 shrink-0",
            collapsed && "-rotate-90",
          )}
        />
      </button>

      {/* Rows */}
      <AnimatePresence initial={false}>
        {!collapsed && (
          <motion.div
            key="watchlist"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="overflow-hidden"
          >
            <div className="divide-y divide-edge/40">
              {followed.map(f => {
                const live    = byId.get(f.id);
                const alert   = alerts.find(a => a.themeId === f.id);
                const evState = live ? computeThemeEvolutionState(live) : null;
                const evMeta  = evState ? THEME_EVOLUTION_META[evState] : null;
                const evClr   = evState ? (EVOLUTION_COLOR[evState] ?? "#94a3b8") : "#94a3b8";
                const score   = live?.confidence ?? null;

                return (
                  <div key={f.id} className="flex items-center gap-2.5 px-3 py-2 group hover:bg-raised/30">
                    {/* Main clickable row */}
                    <button
                      className="flex-1 flex items-center gap-2.5 text-left min-w-0"
                      onClick={() => live && onOpenTheme(live)}
                      disabled={!live}
                    >
                      {evMeta ? (
                        <span
                          className="text-[8px] font-bold uppercase tracking-wide px-1.5 py-0.5
                                     rounded-full leading-none shrink-0 whitespace-nowrap"
                          style={{ color: evClr, background: `${evClr}14`, border: `1px solid ${evClr}22` }}
                        >
                          {evMeta.icon} {evMeta.label}
                        </span>
                      ) : (
                        <span className="text-[8.5px] text-ink-muted/35 shrink-0">inactive</span>
                      )}

                      <span className={cn(
                        "text-[12px] font-semibold truncate flex-1",
                        live ? "text-ink" : "text-ink-muted/50",
                      )}>
                        {f.name}
                      </span>

                      {alert && (
                        <span className={cn(
                          "text-[8px] font-bold px-1.5 py-0.5 rounded-full shrink-0 leading-none",
                          alert.direction === "up"
                            ? "text-emerald-700 bg-emerald-50 border border-emerald-200"
                            : "text-red-600 bg-red-50 border border-red-200",
                        )}>
                          {alert.direction === "up" ? "▲" : "▼"}&nbsp;
                          signal {alert.direction === "up" ? "strengthened" : "weakened"}
                        </span>
                      )}

                      {score !== null && (
                        <span
                          className="text-[9px] font-semibold tabular-nums shrink-0"
                          style={{ color: confColor(score) }}
                        >
                          {score}%
                        </span>
                      )}

                      {live && (
                        <ChevronRight
                          size={10}
                          className="shrink-0 text-ink-muted/20 group-hover:text-ink-muted/50 transition-colors"
                        />
                      )}
                    </button>

                    {/* Unfollow */}
                    <button
                      onClick={() => onUnfollow(f.id)}
                      className="shrink-0 p-1 rounded hover:bg-red-50 hover:text-red-400
                                 text-ink-muted/25 transition-colors"
                      title="Unfollow"
                    >
                      <X size={11} />
                    </button>
                  </div>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}


// ── Market Snapshot Strip ─────────────────────────────────────────────────────

function MarketSnapshotStrip({ marketData }: {
  marketData: Record<string, TickerData | null> | undefined;
}) {
  const loading = marketData === undefined;
  return (
    <div className="flex items-stretch rounded-lg border border-edge bg-surface overflow-x-auto scrollbar-hide mb-3">
      {SNAP_STRIP_KEYS.map((cfg, i) => {
        const ticker  = marketData?.[cfg.key];
        const offline = ticker === null;
        const up      = ticker ? isUp(ticker) : false;
        const chgClr  = up ? "#16a34a" : "#dc2626";

        return (
          <div
            key={cfg.key}
            className={cn(
              "flex flex-col items-center justify-center px-3 py-2 min-w-[72px] flex-1 gap-0.5",
              i > 0 && "border-l border-edge",
            )}
          >
            <span className="text-[8px] font-semibold uppercase tracking-wider text-ink-muted whitespace-nowrap">
              {cfg.label}
            </span>
            {loading ? (
              <span className="text-[12px] font-bold text-ink-muted/30 tabular-nums">…</span>
            ) : offline ? (
              <span className="text-[12px] font-bold text-ink-muted/25 tabular-nums">n/a</span>
            ) : (
              <>
                <span className="text-[12px] font-bold text-ink tabular-nums leading-tight">
                  {fmtSnapPrice(cfg.key, ticker!.price)}
                </span>
                <span className="text-[9.5px] font-semibold tabular-nums leading-tight" style={{ color: chgClr }}>
                  {formatChange(ticker!)}
                </span>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}


// ── Market Intel Bar ──────────────────────────────────────────────────────────
// Dark strip: regime label + clickable asset prices + live status

function MarketIntelBar({
  regime, brief, marketData, activeKey, onTileClick,
  heartbeatStatus, marketOpen, cacheAge,
}: {
  regime:          string;
  brief:           { market_regime: string; primary_driver: string; confidence: number } | undefined;
  marketData:      Record<string, TickerData | null> | undefined;
  activeKey:       SnapshotKey | null;
  onTileClick:     (key: SnapshotKey) => void;
  heartbeatStatus: string;
  marketOpen:      boolean;
  cacheAge:        number | undefined;
}) {
  const label     = regime || brief?.market_regime || "";
  const accentClr = label ? regimeAccentColor(label) : "#818cf8";
  const loading   = marketData === undefined;

  return (
    <div
      className="rounded-lg mb-4 overflow-hidden"
      style={{ background: "rgba(6,10,22,0.95)", border: "1px solid rgba(255,255,255,0.05)" }}
    >
      {/* Top strip: regime + prices */}
      <div className="px-3 py-2 flex items-center gap-0 overflow-x-auto scrollbar-hide">

        {/* Regime */}
        {label && (
          <div className="flex items-baseline gap-1.5 shrink-0 pr-3 mr-3" style={{ borderRight: "1px solid rgba(255,255,255,0.07)" }}>
            <span style={{ fontSize: "6.5px", letterSpacing: "0.2em", color: `${accentClr}50`, fontWeight: 800 }}>REGIME</span>
            <span style={{ fontSize: "11.5px", fontWeight: 700, color: accentClr, letterSpacing: "0.01em" }}>
              {label}
            </span>
            {brief?.confidence !== undefined && (
              <span style={{ fontSize: "8px", color: `${accentClr}50`, fontWeight: 600 }}>
                {brief.confidence}%
              </span>
            )}
          </div>
        )}

        {/* Clickable asset prices */}
        <div className="flex items-center gap-0 flex-1 overflow-x-auto scrollbar-hide">
          {SNAPSHOT_CONFIGS.map((cfg, i) => {
            const t        = marketData?.[cfg.key];
            const isActive = activeKey === cfg.key;
            const offline  = t === null;
            const up       = t ? isUp(t) : false;

            return (
              <button
                key={cfg.key}
                onClick={() => onTileClick(cfg.key)}
                className={cn(
                  "flex items-baseline gap-1 px-2.5 py-0.5 shrink-0 rounded transition-colors duration-100",
                  isActive ? "bg-white/8" : "hover:bg-white/5",
                  i > 0 ? "" : "",
                )}
                style={{
                  borderBottom: isActive ? `1.5px solid ${cfg.color}` : "1.5px solid transparent",
                }}
              >
                <span style={{ fontSize: "8.5px", color: "rgba(255,255,255,0.35)", fontWeight: 600, letterSpacing: "0.02em" }}>
                  {cfg.label}
                </span>
                {loading ? (
                  <span style={{ fontSize: "8px", color: "rgba(255,255,255,0.15)" }}>…</span>
                ) : offline ? (
                  <span style={{ fontSize: "8px", color: "rgba(255,255,255,0.12)" }}>n/a</span>
                ) : (
                  <span
                    className="text-[10px] font-bold tabular-nums"
                    style={{ color: up ? "#10b981" : "#f87171" }}
                  >
                    {formatChange(t!)}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Live status + age */}
        <div className="flex items-center gap-1.5 shrink-0 pl-2" style={{ borderLeft: "1px solid rgba(255,255,255,0.07)" }}>
          <span className={cn(
            "w-1.5 h-1.5 rounded-full shrink-0",
            heartbeatStatus === "live"    ? "bg-emerald-400 animate-pulse" :
            heartbeatStatus === "stale"   ? "bg-amber-400" :
            heartbeatStatus === "offline" ? "bg-red-500" : "bg-slate-600",
          )} />
          {cacheAge !== undefined && (
            <span style={{ fontSize: "7.5px", color: "rgba(255,255,255,0.20)" }}>
              {marketOpen ? "Live" : "Delayed"} · {formatAge(cacheAge)}
            </span>
          )}
        </div>
      </div>

      {/* Secondary: primary driver narrative (if available) */}
      {brief?.primary_driver && (
        <div
          className="px-3 py-1.5 border-t"
          style={{ borderColor: "rgba(255,255,255,0.05)" }}
        >
          <p style={{ fontSize: "10px", color: "rgba(255,255,255,0.33)", lineHeight: 1.5 }}
            className="line-clamp-1">
            {brief.primary_driver}
          </p>
        </div>
      )}
    </div>
  );
}


// ── Lifecycle Journey (used in drawer) ────────────────────────────────────────

function LifecycleJourney({ stage }: { stage: ThemeLifecycleStage }) {
  const currentIdx = LIFECYCLE_STAGES.indexOf(stage);
  return (
    <div className="flex items-center w-full">
      {LIFECYCLE_STAGES.map((s, i) => {
        const isCurrent = i === currentIdx;
        const isPast    = i < currentIdx;
        const sMeta     = THEME_LIFECYCLE_META[s];
        return (
          <div key={s} className={cn("flex items-center", i < LIFECYCLE_STAGES.length - 1 ? "flex-1" : "shrink-0")}>
            <div
              className="w-[6px] h-[6px] rounded-full shrink-0"
              style={{
                background: isCurrent ? sMeta.color : isPast ? `${sMeta.color}40` : "transparent",
                border: `${isCurrent ? 2 : 1}px solid ${isCurrent ? sMeta.color : isPast ? `${sMeta.color}50` : "rgba(148,163,184,0.15)"}`,
                transform: isCurrent ? "scale(1.35)" : "none",
              }}
            />
            {i < LIFECYCLE_STAGES.length - 1 && (
              <div className="flex-1 h-px mx-1"
                style={{ background: i < currentIdx ? `${THEME_LIFECYCLE_META[s].color}25` : "rgba(148,163,184,0.08)" }} />
            )}
          </div>
        );
      })}
    </div>
  );
}


// ── Theme Detail Drawer ───────────────────────────────────────────────────────

// Recent confidence trajectory, reconstructed from current level + momentum delta.
function confSeries(score: number, delta: number, n = 7): number[] {
  const arr: number[] = [];
  for (let i = 0; i < n; i++) arr.push(Math.max(2, Math.min(100, score - delta * (n - 1 - i) * 0.5)));
  return arr;
}

function Sparkline({ data, color, width = 56, height = 16 }: { data: number[]; color: string; width?: number; height?: number }) {
  if (data.length < 2) return null;
  const max = Math.max(...data), min = Math.min(...data), span = Math.max(1, max - min);
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * (width - 2) + 1;
    const y = height - 1 - ((v - min) / span) * (height - 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
  return (
    <svg width={width} height={height} className="shrink-0" aria-hidden>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.25" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

function positioningTakeaway(t: ThemeIntelligence, benefits: string[]): string {
  // Short header pointer that names the securities; the full transmission
  // mechanism and best expressions live in the drawer body below.
  const tk = themeBeneficiaries(t, 3);
  if (tk.length > 0) {
    if (t.momentum_direction === "bearish") return `Most exposed to the downside: ${tk.join(", ")}.`;
    return `Most direct exposure runs through ${tk.join(", ")}.`;
  }
  const sector = benefits[0] ?? (t.related_industries ?? [])[0];
  if (!sector) return "Exposure concentrates in the highest-conviction names across the theme.";
  if (t.momentum_direction === "bearish") return `${sector} carries the most downside if the theme plays out.`;
  if (t.momentum_label === "reversing" || t.momentum_label === "cooling")
    return `${sector} tends to fade first as the theme rolls over.`;
  return `${sector} is the most direct way to express the theme.`;
}

function ThemeDetailDrawer({
  data, onClose, isFollowed, onToggleFollow,
}: {
  data:           DrawerData | null;
  onClose:        () => void;
  isFollowed:     boolean;
  onToggleFollow: () => void;
}) {
  // Lock body scroll while open
  useEffect(() => {
    if (data) document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, [data]);

  if (!data) return null;
  const { theme: t, upstream, downstream, connected, conflicts } = data;
  const publicName = cleanThemeName(t.name);
  const evState    = computeThemeEvolutionState(t);
  const evMeta     = THEME_EVOLUTION_META[evState];
  const evCls      = EVOLUTION_CLS[evState] ?? "text-slate-400";
  const lcStage    = computeThemeLifecycleStage(t);
  const score      = t.confidence ?? 0;
  const cColor     = confColor(score);

  const benefits:  string[] = [];
  const pressures: string[] = [];
  const neutral:   string[] = [];
  for (const ind of (t.related_industries ?? [])) {
    const w = (t.relationship_weights ?? {})[ind];
    if (w?.direction === "positive")      benefits.push(ind);
    else if (w?.direction === "negative") pressures.push(ind);
    else                                  neutral.push(ind);
  }

  const bColor  = borderColorForTheme(t, evState);
  const health  = computeThemeHealth(t);
  const bbCases = generateBullBearCases(t);
  const catalysts      = generateNextCatalysts(t);
  const watchSignals   = generateWatchSignals(t);
  const invalidations  = generateInvalidationSignals(t);
  const briefingSents  = generateIntelligenceBriefing(t);
  const bestExpr       = bestExpressions(t);
  const exposedLosers  = themeLosers(t);

  return (
    <AnimatePresence>
      {data && (
        <>
          {/* Backdrop */}
          <motion.div
            key="bd"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 bg-black/40 z-40"
            onClick={onClose}
          />
          {/* Drawer */}
          <motion.div
            key="drawer"
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 300 }}
            className="fixed right-0 top-0 h-full w-full sm:w-[420px] bg-surface z-50
                       overflow-y-auto shadow-drawer border-l border-edge"
            style={{ borderTop: `3px solid ${bColor}` }}
          >
            {/* Header */}
            <div className="sticky top-0 bg-surface/95 backdrop-blur-sm border-b border-edge px-5 py-4 z-10">
              <div className="flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                    <span className={cn("text-[10px] font-semibold uppercase tracking-wider", evCls)}>
                      {evMeta.icon} {evMeta.label}
                    </span>
                    <span
                      className="text-[8.5px] font-bold px-1.5 py-0.5 rounded leading-none"
                      style={{ color: health.color, background: `${health.color}14` }}
                    >
                      {health.label}
                    </span>
                    {t.evidence_count > 0 && (
                      <span className="text-[9px] text-ink-muted/35">{t.evidence_count} signals</span>
                    )}
                  </div>
                  <h2 className="text-[22px] font-bold text-ink leading-tight tracking-tight">{publicName}</h2>
                  {/* Confidence + recent trajectory sparkline */}
                  <div className="flex items-center gap-2 mt-2">
                    <span className="text-[9px] tabular-nums font-semibold" style={{ color: cColor }}>
                      {convScore(score)} conviction
                    </span>
                    {convBasis(t) && <span className="text-[8px] text-ink-muted/50 tabular-nums">{convBasis(t)}</span>}
                    <Sparkline data={confSeries(score, t.momentum_delta ?? 0)} color={cColor} />
                    <span className="text-[8px] font-bold tabular-nums" style={{ color: (t.momentum_delta ?? 0) >= 0 ? "#10b981" : "#ef4444" }}>
                      {(t.momentum_delta ?? 0) >= 0 ? "+" : ""}{t.momentum_delta ?? 0}
                    </span>
                  </div>
                  {/* Positioning takeaway — analyst note */}
                  <p className="text-[10px] text-ink-secondary leading-snug mt-2 pl-2 border-l-2 italic" style={{ borderColor: bColor }}>
                    {positioningTakeaway(t, benefits)}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0 mt-0.5">
                  {/* Follow / Following toggle */}
                  <button
                    onClick={onToggleFollow}
                    className={cn(
                      "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-semibold",
                      "border transition-all duration-150",
                      isFollowed
                        ? "bg-accent text-white border-accent hover:bg-accent/90"
                        : "bg-surface text-ink-secondary border-edge hover:border-accent hover:text-accent",
                    )}
                  >
                    {isFollowed
                      ? <><BookmarkCheck size={11} /> Following</>
                      : <><Bookmark size={11} /> Follow</>
                    }
                  </button>
                  {/* Close */}
                  <button
                    onClick={onClose}
                    className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-raised
                               text-ink-muted hover:text-ink transition-colors"
                  >
                    <X size={15} />
                  </button>
                </div>
              </div>
            </div>

            {/* Body */}
            <div className="px-5 py-5 space-y-4">

              {/* ── Best Expressions — name the securities first ── */}
              {bestExpr && (
                <div className="rounded-lg border border-emerald-200/60 overflow-hidden">
                  <div className="px-4 py-2.5 border-b border-emerald-200/60 bg-emerald-50/40">
                    <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-emerald-700/80">Best Expressions</p>
                  </div>
                  <div className="px-4 py-3">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {bestExpr.tickers.map(tk => (
                        <span key={tk} className="text-[13px] font-black tabular-nums px-2 py-1 rounded-md bg-emerald-500/12 text-emerald-700 border border-emerald-500/25">{tk}</span>
                      ))}
                    </div>
                    <p className="text-[11px] text-ink-secondary leading-snug mt-2">{bestExpr.why}</p>
                  </div>
                </div>
              )}

              {/* ── Most Exposed Losers ─────────────────────────── */}
              {exposedLosers && (
                <div className="rounded-lg border border-red-200/60 overflow-hidden">
                  <div className="px-4 py-2.5 border-b border-red-200/60 bg-red-50/30 flex items-baseline gap-2">
                    <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-red-600/80">Most Exposed</p>
                    <span className="text-[10px] font-semibold text-ink-secondary">{exposedLosers.sector}</span>
                  </div>
                  <div className="px-4 py-3">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {exposedLosers.tickers.map(tk => (
                        <span key={tk} className="text-[13px] font-black tabular-nums px-2 py-1 rounded-md bg-red-500/8 text-red-600/90 border border-red-500/20">{tk}</span>
                      ))}
                    </div>
                    <p className="text-[11px] text-ink-secondary leading-snug mt-2">{exposedLosers.risk}</p>
                  </div>
                </div>
              )}

              {/* ── Trade Implications ─────────────────────────── */}
              {(() => {
                const timeHorizon = deriveTimeHorizon(t);
                const keyRisk     = deriveKeyRisk(t);
                return (
                  <div className="rounded-lg border border-edge overflow-hidden">
                    <div className="px-4 py-2.5 border-b border-edge bg-raised/60">
                      <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-ink-secondary">Trade Implications</p>
                    </div>
                    <div className="grid grid-cols-2">

                      {/* WINNERS */}
                      <div className="p-3 border-b border-r border-edge bg-emerald-50/40">
                        <p className="text-[8px] font-bold uppercase tracking-[0.18em] text-emerald-700/60 mb-2">
                          ↑ Winners
                        </p>
                        {benefits.length > 0 ? (
                          <div className="space-y-1">
                            {benefits.slice(0, 4).map(ind => (
                              <div key={ind} className="flex items-center gap-1.5">
                                <span className="w-[5px] h-[5px] rounded-full shrink-0 bg-emerald-500" />
                                <span className="text-[11.5px] font-medium text-ink leading-snug">{ind}</span>
                              </div>
                            ))}
                            {benefits.length > 4 && (
                              <p className="text-[9.5px] text-emerald-600/60 pl-3.5">+{benefits.length - 4} more</p>
                            )}
                          </div>
                        ) : (
                          <p className="text-[11px] text-ink-muted italic">n/a</p>
                        )}
                      </div>

                      {/* LOSERS */}
                      <div className="p-3 border-b border-edge bg-red-50/30">
                        <p className="text-[8px] font-bold uppercase tracking-[0.18em] text-red-600/60 mb-2">
                          ↓ Losers
                        </p>
                        {pressures.length > 0 ? (
                          <div className="space-y-1">
                            {pressures.slice(0, 4).map(ind => (
                              <div key={ind} className="flex items-center gap-1.5">
                                <span className="w-[5px] h-[5px] rounded-full shrink-0 bg-red-500" />
                                <span className="text-[11.5px] font-medium text-ink leading-snug">{ind}</span>
                              </div>
                            ))}
                            {pressures.length > 4 && (
                              <p className="text-[9.5px] text-red-500/60 pl-3.5">+{pressures.length - 4} more</p>
                            )}
                          </div>
                        ) : (
                          <p className="text-[11px] text-ink-muted italic">n/a</p>
                        )}
                      </div>

                      {/* TIME HORIZON */}
                      <div className="p-3 border-r border-edge bg-sky-50/20">
                        <p className="text-[8px] font-bold uppercase tracking-[0.18em] text-sky-600/60 mb-2">
                          Time Horizon
                        </p>
                        <p className="text-[12px] font-semibold text-ink leading-snug">{timeHorizon}</p>
                        {t.persistence_cycles > 0 && (
                          <p className="text-[9.5px] text-ink-muted mt-1">
                            {t.persistence_cycles} cycle{t.persistence_cycles !== 1 ? "s" : ""} persistent
                            {t.persistence_days > 0 && ` · ${t.persistence_days}d`}
                          </p>
                        )}
                      </div>

                      {/* KEY RISK */}
                      <div className="p-3 bg-amber-50/25">
                        <p className="text-[8px] font-bold uppercase tracking-[0.18em] text-amber-600/60 mb-2">
                          Key Risk
                        </p>
                        <p className="text-[11.5px] font-medium text-ink leading-snug">{keyRisk}</p>
                        {t.volatility_score > 0 && (
                          <div className="flex items-center gap-1.5 mt-1.5">
                            <span className="text-[8.5px] text-ink-muted">Volatility</span>
                            <div className="w-12 h-[2px] rounded-full bg-edge overflow-hidden">
                              <div className="h-full rounded-full"
                                style={{
                                  width: `${t.volatility_score}%`,
                                  background: t.volatility_score >= 70 ? "#ef4444" : t.volatility_score >= 40 ? "#f59e0b" : "#94a3b8",
                                }} />
                            </div>
                            <span className="text-[8.5px] tabular-nums text-ink-muted">{t.volatility_score}</span>
                          </div>
                        )}
                      </div>

                    </div>
                  </div>
                );
              })()}

              {/* Bull / Bear Cases */}
              <div className="rounded-lg border border-edge overflow-hidden">
                <div className="px-4 py-2.5 border-b border-edge bg-raised/60">
                  <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-ink-secondary">{"What's Working / What's Breaking"}</p>
                </div>
                <div className="grid grid-cols-2">
                  <div className="px-3.5 py-3 border-r border-edge"
                       style={{ borderLeft: "2px solid rgba(16,185,129,0.35)" }}>
                    <p className="text-[7.5px] font-bold uppercase tracking-[0.18em] text-emerald-600/60 mb-1.5">{"What's Working"}</p>
                    <p className="text-[12px] text-ink-secondary leading-relaxed">{bbCases.bull}</p>
                  </div>
                  <div className="px-3.5 py-3"
                       style={{ borderLeft: "2px solid rgba(239,68,68,0.30)" }}>
                    <p className="text-[7.5px] font-bold uppercase tracking-[0.18em] text-red-500/60 mb-1.5">{"What's Breaking"}</p>
                    <p className="text-[12px] text-ink-secondary leading-relaxed">{bbCases.bear}</p>
                  </div>
                </div>
              </div>

              {/* Why It Matters */}
              {(briefingSents.length > 0 || upstream.length > 0) && (
                <div className="rounded-lg border border-edge overflow-hidden">
                  <div className="px-4 py-2.5 border-b border-edge bg-raised/60">
                    <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-ink-secondary">Transmission Mechanism</p>
                  </div>
                  <div className="px-4 py-4 space-y-3">
                    {briefingSents.length > 0 && (
                      <div className="space-y-2">
                        {briefingSents.map((sent, si) => (
                          <p key={si}
                            className="text-[13px] text-ink-secondary leading-[1.65]"
                            style={si === 0 ? { borderLeft: `2px solid ${bColor}40`, paddingLeft: "1rem" } : { paddingLeft: "1rem" }}
                          >
                            {sent}
                          </p>
                        ))}
                      </div>
                    )}
                    {upstream.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 items-center pt-2 border-t border-edge/40">
                        <span className="text-[8.5px] text-ink-muted/50 uppercase tracking-wider font-semibold">
                          Driven by
                        </span>
                        {upstream.map(u => (
                          <span key={u} className="text-[10.5px] text-ink-secondary px-2 py-0.5 rounded bg-raised border border-edge">
                            {cleanMacroLabel(u)}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Sector Exposure */}
              {(neutral.length > 0 || benefits.length > 4 || pressures.length > 4) && (
                <div className="rounded-lg border border-edge overflow-hidden">
                  <div className="px-4 py-2.5 border-b border-edge bg-raised/60">
                    <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-ink-secondary">Sector Exposure</p>
                  </div>
                  <div className="grid grid-cols-2">
                    {(benefits.length > 0 || neutral.length > 0) && (
                      <div className="p-3.5 border-r border-edge/50">
                        <p className="text-[8px] font-bold uppercase tracking-widest text-emerald-600/60 mb-2.5">
                          ↑ Benefits
                        </p>
                        <div className="space-y-1.5">
                          {[...benefits, ...neutral].slice(0, 7).map(ind => (
                            <div key={ind} className="flex items-center gap-2">
                              <span className="w-1 h-1 rounded-full shrink-0"
                                style={{ background: benefits.includes(ind) ? "#10b981" : "#94a3b8" }} />
                              <span className="text-[12px] text-ink-secondary">{ind}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {pressures.length > 0 && (
                      <div className="p-3.5">
                        <p className="text-[8px] font-bold uppercase tracking-widest text-red-500/60 mb-2.5">
                          ↓ Pressures
                        </p>
                        <div className="space-y-1.5">
                          {pressures.slice(0, 7).map(ind => (
                            <div key={ind} className="flex items-center gap-2">
                              <span className="w-1 h-1 rounded-full shrink-0 bg-red-400" />
                              <span className="text-[12px] text-ink-secondary">{ind}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Watch Signals */}
              {watchSignals.length > 0 && (
                <div className="rounded-lg border border-amber-200/60 overflow-hidden">
                  <div className="px-4 py-2.5 border-b border-amber-200/60 bg-amber-50/40">
                    <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-amber-600/80">What Changes Our View</p>
                  </div>
                  <div className="divide-y divide-amber-100/60">
                    {watchSignals.map((sig, i) => (
                      <div key={i} className="px-4 py-3">
                        <p className="text-[11px] font-semibold text-ink mb-0.5">{sig.variable}</p>
                        <p className="text-[11px] text-ink-secondary leading-snug">{sig.condition}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Next Catalysts */}
              {catalysts.length > 0 && (
                <div className="rounded-lg border border-edge overflow-hidden">
                  <div className="px-4 py-2.5 border-b border-edge bg-raised/60">
                    <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-ink-secondary">What Moves It Next</p>
                  </div>
                  <div className="divide-y divide-edge/50">
                    {catalysts.map((cat, i) => (
                      <div key={i} className="px-4 py-3 flex items-start gap-3">
                        <span
                          className="text-[8px] font-bold px-1.5 py-0.5 rounded shrink-0 mt-0.5"
                          style={{
                            color:       cat.direction === "confirming" ? "#10b981" : "#f59e0b",
                            background:  cat.direction === "confirming" ? "rgba(16,185,129,0.10)" : "rgba(245,158,11,0.10)",
                          }}
                        >
                          {cat.direction === "confirming" ? "▲ confirming" : "⚑ risk"}
                        </span>
                        <div className="min-w-0">
                          <p className="text-[11px] font-semibold text-ink mb-0.5">{cat.label}</p>
                          <p className="text-[10.5px] text-ink-secondary leading-snug">{cat.reason}</p>
                        </div>
                        <span className="text-[8px] text-ink-muted/40 shrink-0 mt-0.5">{cat.sensitivity}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Related Themes */}
              {connected.length > 0 && (
                <div className="rounded-lg border border-edge overflow-hidden">
                  <div className="px-4 py-2.5 border-b border-edge bg-raised/60">
                    <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-ink-secondary">Related Themes</p>
                  </div>
                  <div className="p-4 flex flex-wrap gap-2">
                    {connected.map(c => {
                      const lc = c.linkType === "shared-story" ? "#38bdf8" :
                                 c.linkType === "shared-asset" ? "#a78bfa" : "#94a3b8";
                      const linkLabel = c.linkType === "shared-story" ? "shared narrative"
                                      : c.linkType === "shared-asset" ? "shared exposure"
                                      : "sector overlap";
                      return (
                        <span key={c.id} className="text-[11px] px-2.5 py-1.5 rounded-lg font-medium"
                          style={{ color: lc, background: `${lc}12`, border: `1px solid ${lc}28` }}>
                          {cleanThemeName(c.name)}
                          <span className="ml-1.5 text-[8.5px] font-normal" style={{ opacity: 0.55 }}>
                            {linkLabel}
                          </span>
                        </span>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* How It Works */}
              {(upstream.length > 0 || downstream.length > 0) && (
                <div className="rounded-lg border border-edge overflow-hidden">
                  <div className="px-4 py-2.5 border-b border-edge bg-raised/60">
                    <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-ink-secondary">How It Works</p>
                  </div>
                  <div className="flex items-stretch gap-0">
                    {/* Drivers */}
                    <div className="flex-1 bg-raised px-3 py-3">
                      <p className="text-[8px] font-bold uppercase tracking-widest text-ink-muted/35 mb-2">Root Cause</p>
                      <div className="space-y-1">
                        {upstream.slice(0, 3).map(u => (
                          <p key={u} className="text-[11.5px] text-ink-secondary font-medium">{cleanMacroLabel(u)}</p>
                        ))}
                        {upstream.length > 3 && (
                          <p className="text-[10px] text-ink-muted/40">+{upstream.length - 3} more</p>
                        )}
                      </div>
                    </div>
                    {/* Arrow */}
                    <div className="flex items-center justify-center px-2 bg-surface border-x border-edge shrink-0">
                      <span className="text-[13px] text-ink-muted/25 select-none">→</span>
                    </div>
                    {/* Theme */}
                    <div className="flex-1 bg-surface px-3 py-3" style={{ borderBottom: `2px solid ${bColor}40` }}>
                      <p className="text-[8px] font-bold uppercase tracking-widest text-ink-muted/35 mb-2">Theme</p>
                      <p className="text-[12px] font-bold text-ink">{publicName}</p>
                    </div>
                    {/* Arrow */}
                    <div className="flex items-center justify-center px-2 bg-surface border-x border-edge shrink-0">
                      <span className="text-[13px] text-ink-muted/25 select-none">→</span>
                    </div>
                    {/* Impact */}
                    <div className="flex-1 bg-raised px-3 py-3">
                      <p className="text-[8px] font-bold uppercase tracking-widest text-ink-muted/35 mb-2">Impact</p>
                      <div className="space-y-1">
                        {downstream.slice(0, 3).map(d => (
                          <p key={d} className="text-[11.5px] text-ink-secondary line-clamp-1">{d}</p>
                        ))}
                        {downstream.length > 3 && (
                          <p className="text-[10px] text-ink-muted/40">+{downstream.length - 3} more</p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Lifecycle */}
              <div className="rounded-lg border border-edge overflow-hidden">
                <div className="px-4 py-2.5 border-b border-edge bg-raised/60">
                  <div className="flex items-center gap-2">
                    <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-ink-secondary">Lifecycle</p>
                    <span className="text-[9px] font-semibold" style={{ color: THEME_LIFECYCLE_META[lcStage].color }}>
                      · {THEME_LIFECYCLE_META[lcStage].label}
                    </span>
                  </div>
                </div>
                <div className="px-4 py-4">
                  <LifecycleJourney stage={lcStage} />
                  <div className="flex justify-between mt-2">
                    {LIFECYCLE_STAGES.map(s => (
                      <span key={s} className="text-[8px]"
                        style={{
                          color: s === lcStage ? THEME_LIFECYCLE_META[s].color : "rgba(148,163,184,0.28)",
                          fontWeight: s === lcStage ? 700 : 400,
                        }}>
                        {THEME_LIFECYCLE_META[s].label}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              {/* Invalidation Signals */}
              {invalidations.length > 0 && (
                <div className="rounded-lg border border-edge overflow-hidden">
                  <div className="px-4 py-2.5 border-b border-edge bg-raised/60">
                    <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-ink-secondary">Thesis Invalidation</p>
                  </div>
                  <div className="divide-y divide-edge/50">
                    {invalidations.map((inv, i) => (
                      <div key={i} className="px-4 py-3">
                        <p className="text-[11px] font-semibold text-ink mb-1">{inv.condition}</p>
                        <p className="text-[10.5px] text-ink-secondary leading-snug">{inv.impact}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Signal Conflicts */}
              {conflicts.length > 0 && (
                <div className="rounded-lg border border-amber-200/60 overflow-hidden">
                  <div className="px-4 py-2.5 border-b border-amber-200/60 bg-amber-50/40">
                    <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-amber-600/80">Signal Conflicts</p>
                  </div>
                  <div className="divide-y divide-amber-100/60">
                    {conflicts.slice(0, 3).map(c => (
                      <div key={c.id} className="flex items-start gap-2.5 px-4 py-3">
                        <AlertTriangle size={12} className="text-amber-500/70 shrink-0 mt-0.5" />
                        <p className="text-[12px] text-ink-secondary leading-relaxed">{c.description}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}



// ── THEME COMMAND CENTER ──────────────────────────────────────────────────────

const MOMENTUM_META: Record<string, { label: string; color: string }> = {
  accelerating:  { label: "Accelerating",  color: "#10b981" },
  strengthening: { label: "Strengthening", color: "#34d399" },
  stable:        { label: "Stable",        color: "#94a3b8" },
  emerging:      { label: "Emerging",      color: "#52b0c8" },
  cooling:       { label: "Cooling",       color: "#f59e0b" },
  reversing:     { label: "Reversing",     color: "#ef4444" },
};

function themePrimaryDriver(t: ThemeIntelligence): string {
  const cn = t.causal_narrative ?? "";
  if (cn.includes("→")) {
    const parts = cn.split("→").map(s => s.trim());
    const idx = parts.indexOf(t.name);
    if (idx > 0) return cleanThemeName(parts[idx - 1]);
  }
  const f = (t.related_macro_factors ?? [])[0];
  return f ? cleanMacroLabel(f) : "Multiple drivers";
}

function shortRisk(t: ThemeIntelligence): string {
  const r = deriveKeyRisk(t).replace(/\.$/, "").trim();
  if (r.length <= 50) return r;
  const cut = r.slice(0, 48);
  return cut.slice(0, Math.max(cut.lastIndexOf(" "), 32)).trim() + "…";
}

function ThemeCommandCenter({ themes, onThemeClick }: {
  themes:       ThemeIntelligence[];
  onThemeClick: (t: ThemeIntelligence) => void;
}) {
  if (themes.length === 0) return (
    <div className="mb-4">
      <SectionHeader label="Theme Command Center" icon={<Zap size={11} className="text-accent shrink-0" />} />
      <p className="text-[10.5px] text-ink-muted italic">Awaiting first cross-asset read.</p>
    </div>
  );
  const sorted = [...themes].sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0)).slice(0, 8);

  return (
    <div className="mb-4">
      <SectionHeader label="Theme Command Center" icon={<Zap size={11} className="text-accent shrink-0" />}
        sub="what's driving it" />
      <div className="grid sm:grid-cols-2 gap-1.5">
        {sorted.map(t => {
          const mm    = MOMENTUM_META[t.momentum_label] ?? MOMENTUM_META.stable;
          const conf  = t.confidence ?? 0;
          const d     = t.momentum_delta ?? 0;
          const benef  = themeBeneficiaries(t, 3);
          const losers = themeLosers(t, 3);
          return (
            <button key={t.id} onClick={() => onThemeClick(t)}
              className="text-left rounded-lg border border-edge bg-surface flex items-center gap-3 pl-3 pr-3 py-2
                         group transition-colors hover:border-edge-strong hover:bg-raised/40"
              style={{ borderLeft: `3px solid ${mm.color}` }}>
              {/* BIG conviction — rounded, with the evidence that justifies it */}
              <div className="flex flex-col items-center w-12 shrink-0">
                <span className="text-[26px] font-black tabular-nums leading-none" style={{ color: confColor(conf) }}>{convScore(conf)}</span>
                <span className="text-[6px] uppercase tracking-wider text-ink-muted/40 mt-px">conviction</span>
                {convBasis(t) && <span className="text-[6.5px] text-ink-muted/45 tabular-nums leading-tight text-center mt-0.5">{convBasis(t)}</span>}
              </div>
              <div className="min-w-0 flex-1">
                {/* name + momentum delta + horizon */}
                <div className="flex items-center gap-2">
                  <span className="text-[13px] font-bold text-ink truncate group-hover:text-accent transition-colors">{cleanThemeName(t.name)}</span>
                  <span className="text-[11px] font-black tabular-nums shrink-0"
                    style={{ color: d > 0 ? "#10b981" : d < 0 ? "#ef4444" : "rgba(255,255,255,0.28)" }}>
                    {d > 0 ? "▲" : d < 0 ? "▼" : ""}{d > 0 ? "+" : ""}{d}
                  </span>
                  <span className="ml-auto text-[6.5px] font-bold uppercase tracking-wide px-1 py-px rounded shrink-0
                                   bg-raised border border-edge text-ink-muted/55">{timeBucket(t)}</span>
                </div>
                {/* state + driver */}
                <div className="flex items-center gap-1.5 mt-0.5 text-[8.5px]">
                  <span className="font-bold uppercase tracking-wide" style={{ color: mm.color }}>{mm.label}</span>
                  <span className="text-ink-muted/25">·</span>
                  <span className="text-ink-muted/50 truncate"><span className="text-ink-muted/35">Catalyst</span> {themePrimaryDriver(t)}</span>
                </div>
                {/* who wins / who loses — prominent tickers */}
                <div className="flex items-center gap-1.5 mt-1 flex-wrap min-w-0">
                  {benef.length > 0 && (
                    <span className="flex items-center gap-1">
                      <span className="text-[6.5px] font-bold uppercase tracking-wide text-emerald-600/55">Wins</span>
                      {benef.map(tk => (
                        <span key={tk} className="text-[9.5px] font-bold tabular-nums px-1 py-px rounded bg-emerald-500/10 text-emerald-700 border border-emerald-500/20">{tk}</span>
                      ))}
                    </span>
                  )}
                  {losers && (
                    <span className="flex items-center gap-1">
                      <span className="text-[6.5px] font-bold uppercase tracking-wide text-red-500/55">Loses</span>
                      {losers.tickers.map(tk => (
                        <span key={tk} className="text-[9.5px] font-bold tabular-nums px-1 py-px rounded bg-red-500/8 text-red-600/90 border border-red-500/15">{tk}</span>
                      ))}
                    </span>
                  )}
                </div>
                {/* what changes the view */}
                <div className="flex items-center gap-1 mt-px text-[8px] min-w-0">
                  <span className="text-amber-500/50 font-bold uppercase tracking-wide shrink-0">Watch</span>
                  <span className="text-ink-muted/45 truncate">{shortRisk(t)}</span>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}



// ── Transmission Map (market causality — the signature view) ──────────────────

function ChainStage({ caption, tone, children }: { caption: string; tone: string; children: React.ReactNode }) {
  return (
    <div className="shrink-0 rounded-md border border-edge bg-raised/40 px-2.5 py-1.5 flex flex-col justify-center min-w-[88px]">
      <p className="text-[6.5px] font-bold uppercase tracking-[0.16em] mb-0.5" style={{ color: tone }}>{caption}</p>
      <p className="text-[11.5px] font-bold text-ink leading-tight">{children}</p>
    </div>
  );
}

function ChainArrow({ color }: { color: string }) {
  return (
    <div className="shrink-0 flex items-center px-0.5 self-center">
      <span className="text-[15px] font-black leading-none" style={{ color, opacity: 0.7 }}>→</span>
    </div>
  );
}

// Transmission Map: a true causal chain ending in tradeable securities —
// Macro Driver → Theme → Sector → Securities. Built from structured fields
// (related_macro_factors, name, related_industries, themeBeneficiaries) rather
// than parsed prose, so every chain terminates in instruments.
function ThemeTransmission({ themes, onNodeClick }: {
  themes:      ThemeIntelligence[];
  onNodeClick: (t: ThemeIntelligence) => void;
}) {
  const chains = useMemo(() => {
    return [...themes]
      .sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0))
      .map(t => {
        const sectors = t.related_industries ?? [];
        const sector  = sectors.find(s => t.relationship_weights?.[s]?.direction === "positive") ?? sectors[0] ?? null;
        const macro   = (t.related_macro_factors ?? [])[0] ?? null;
        return { t, macro: macro ? cleanMacroLabel(macro) : null, sector, tickers: themeBeneficiaries(t, 3) };
      })
      .filter(c => c.sector && c.tickers.length > 0)
      .slice(0, 5);
  }, [themes]);

  if (chains.length === 0) return null;

  const dirColor = (t: ThemeIntelligence) =>
    t.momentum_direction === "bullish" ? "#10b981"
    : t.momentum_direction === "bearish" ? "#ef4444" : "#64748b";

  return (
    <div className="mb-4">
      <SectionHeader label="Transmission Map" icon={<Network size={11} className="text-accent shrink-0" />}
        sub="macro driver to security, cause to effect" />
      <div className="rounded-xl border border-edge bg-surface divide-y divide-edge/50">
        {chains.map((c, ci) => {
          const clr = dirColor(c.t);
          return (
            <div key={ci} className="px-3 py-2.5 flex items-stretch gap-1 overflow-x-auto">
              {/* Macro Driver */}
              <ChainStage caption="Macro Driver" tone="#818cf8">{c.macro ?? "Macro backdrop"}</ChainStage>
              <ChainArrow color={clr} />
              {/* Theme — clickable */}
              <button onClick={() => onNodeClick(c.t)}
                className="shrink-0 text-left rounded-md border px-2.5 py-1.5 hover:bg-raised transition-colors min-w-[112px]"
                style={{ borderColor: `${clr}55`, background: `${clr}12` }}>
                <p className="text-[6.5px] font-bold uppercase tracking-[0.16em] mb-0.5" style={{ color: clr, opacity: 0.85 }}>Theme</p>
                <p className="text-[12px] font-bold text-ink leading-tight">{cleanThemeName(c.t.name)}</p>
                <p className="text-[7px] tabular-nums mt-0.5" style={{ color: clr }}>{convScore(c.t.confidence ?? 0)} conviction</p>
              </button>
              <ChainArrow color={clr} />
              {/* Sector */}
              <ChainStage caption="Sector" tone="#64748b">{c.sector}</ChainStage>
              <ChainArrow color={clr} />
              {/* Securities — the expression */}
              <div className="shrink-0 rounded-md border border-emerald-500/25 bg-emerald-500/8 px-2.5 py-1.5 flex flex-col justify-center">
                <p className="text-[6.5px] font-bold uppercase tracking-[0.16em] text-emerald-700/70 mb-0.5">Securities</p>
                <div className="flex items-center gap-1">
                  {c.tickers.map(tk => (
                    <span key={tk} className="text-[11px] font-black tabular-nums text-emerald-700">{tk}</span>
                  ))}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}



// ── Sector positioning model ──────────────────────────────────────────────────

type SectorPosition = {
  sector:     string;
  direction:  "bullish" | "bearish" | "neutral";
  conviction: number;
  drivers:    string[];
  trend:      string;       // "Improving" | "Stable" | "Weakening"
  trendColor: string;
  count:      number;       // total themes touching the sector
  supportive: number;       // themes aligned with the net direction
  risk:       string;
  exposures:  string[];
  expressWhy: string;       // concrete reason to own the expressions
  whyBullets: string[];
  horizon:    string;       // lead theme's time horizon
  leadDelta:  number;       // lead theme momentum delta (conviction trend)
};

function sectorThemeSign(t: ThemeIntelligence, sector: string): number {
  const rel = t.relationship_weights?.[sector];
  return rel?.direction === "positive" ? 1
       : rel?.direction === "negative" ? -1
       : t.momentum_direction === "bullish" ? 1
       : t.momentum_direction === "bearish" ? -1 : 0;
}

function computeSectorPositions(themes: ThemeIntelligence[]): SectorPosition[] {
  const map = new Map<string, ThemeIntelligence[]>();
  for (const t of themes) {
    for (const ind of (t.related_industries ?? [])) {
      const arr = map.get(ind) ?? [];
      arr.push(t);
      map.set(ind, arr);
    }
  }
  const out: SectorPosition[] = [];
  for (const [sector, list] of map) {
    list.sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0));
    let score = 0, wsum = 0;
    for (const t of list) {
      const w = (t.relationship_weights?.[sector]?.weight ?? 0.5) * (t.confidence ?? 0);
      score += sectorThemeSign(t, sector) * w; wsum += w;
    }
    const net = wsum ? score / wsum : 0;
    const direction = net > 0.15 ? "bullish" : net < -0.15 ? "bearish" : "neutral";
    const conviction = Math.round(list.reduce((s, t) => s + (t.confidence ?? 0), 0) / list.length);
    const dirSign = direction === "bullish" ? 1 : direction === "bearish" ? -1 : 0;
    const supportive = dirSign === 0 ? list.length : list.filter(t => sectorThemeSign(t, sector) === dirSign).length;
    const imp = list.filter(t => t.momentum_label === "accelerating" || t.momentum_label === "strengthening").length;
    const wk  = list.filter(t => t.momentum_label === "cooling" || t.momentum_label === "reversing").length;
    const trend = imp > wk ? "Improving" : wk > imp ? "Weakening" : "Stable";
    const trendColor = imp > wk ? "#10b981" : wk > imp ? "#ef4444" : "#94a3b8";
    const be = bestExpressions(list[0]);
    const exposures: string[] = be?.tickers ? [...be.tickers] : [];
    for (const t of list.slice(0, 3)) for (const a of (t.related_assets ?? [])) {
      if (a && !exposures.includes(a) && /^[A-Z.]{1,6}$/.test(a)) exposures.push(a);
    }
    out.push({
      sector, direction, conviction,
      drivers: list.slice(0, 2).map(t => cleanThemeName(t.name)),
      trend, trendColor, count: list.length, supportive, risk: deriveKeyRisk(list[0]),
      exposures: exposures.slice(0, 4),
      expressWhy: be?.why ?? "",
      whyBullets: generateWhyItMattersNow(list[0]).slice(0, 3),
      horizon: timeBucket(list[0]), leadDelta: list[0].momentum_delta ?? 0,
    });
  }
  const rank = { bullish: 0, neutral: 1, bearish: 2 } as const;
  return out.sort((a, b) => (rank[a.direction] - rank[b.direction]) || (b.conviction - a.conviction));
}

const DIR_META = {
  bullish: { label: "Bullish", color: "#10b981" },
  bearish: { label: "Bearish", color: "#ef4444" },
  neutral: { label: "Neutral", color: "#94a3b8" },
} as const;



// ── SECTOR POSITIONING ────────────────────────────────────────────────────────

function SectorPositioning({ themes }: { themes: ThemeIntelligence[] }) {
  const positions = useMemo(() => computeSectorPositions(themes), [themes]);
  if (positions.length === 0) return null;
  const bull = positions.filter(p => p.direction === "bullish").length;

  return (
    <div className="mb-4">
      <SectionHeader label="Sector Positioning" icon={<BarChart2 size={11} className="text-accent shrink-0" />}
        sub={`${bull} bullish of ${positions.length} sectors`} />
      <div className="grid sm:grid-cols-2 gap-1.5">
        {positions.map((p, i) => {
          const dm = DIR_META[p.direction];
          return (
            <div key={p.sector} className="rounded-lg border border-edge bg-surface px-3 py-2"
              style={{ borderLeft: `2.5px solid ${dm.color}` }}>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[9px] font-black tabular-nums text-ink-muted/40 shrink-0 w-5">#{i + 1}</span>
                <span className="text-[12px] font-bold text-ink truncate flex-1">{p.sector}</span>
                <span className="text-[8px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded shrink-0"
                  style={{ color: dm.color, background: `${dm.color}15` }}>{dm.label}</span>
                <span className="text-[14px] font-black tabular-nums shrink-0" style={{ color: confColor(p.conviction) }}>{convScore(p.conviction)}</span>
              </div>
              <div className="flex items-center gap-1.5 flex-wrap text-[8.5px] pl-7">
                <span className="text-ink-muted/40">Driven By</span>
                <span className="font-semibold text-ink-secondary">{p.drivers[0]}</span>
                {p.drivers[1] && <><span className="text-ink-muted/20">·</span><span className="text-ink-muted/70">{p.drivers[1]}</span></>}
              </div>
              <div className="flex items-center gap-2 text-[8.5px] mt-px pl-7">
                <span className="tabular-nums text-ink-muted/60"><span className="font-bold text-ink-secondary">{p.supportive} of {p.count}</span> supportive</span>
                <span className="text-ink-muted/20">·</span>
                <span className="font-semibold" style={{ color: p.trendColor }}>{p.trend}</span>
                {p.exposures.length > 0 && (
                  <span className="ml-auto flex items-center gap-1">
                    {p.exposures.slice(0, 3).map(tk => (
                      <span key={tk} className="text-[9px] font-bold tabular-nums px-1 py-px rounded bg-emerald-500/10 text-emerald-700/90 border border-emerald-500/20">{tk}</span>
                    ))}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── HIGHEST CONVICTION OPPORTUNITIES ──────────────────────────────────────────

function OppBlock({ label, color, children }: { label: string; color?: string; children: React.ReactNode }) {
  return (
    <div className="mt-1.5">
      <p className="text-[6.5px] font-bold uppercase tracking-[0.16em] mb-0.5" style={{ color: color ?? "rgba(255,255,255,0.4)" }}>{label}</p>
      {children}
    </div>
  );
}

function HighestConvictionOpportunities({ themes }: { themes: ThemeIntelligence[] }) {
  const opps = useMemo(
    () => computeSectorPositions(themes).filter(p => p.direction === "bullish").slice(0, 4),
    [themes],
  );
  if (opps.length === 0) return null;

  return (
    <div className="mb-4">
      <SectionHeader label="Highest Conviction Opportunities" icon={<Zap size={11} className="text-accent shrink-0" />}
        sub="what can benefit" />
      <div className="grid sm:grid-cols-2 gap-1.5">
        {opps.map(p => {
          const ct = confTrend(p.leadDelta);
          return (
          <div key={p.sector} className="rounded-lg border border-edge bg-surface px-3 py-2.5" style={{ borderTop: "2px solid #10b981" }}>
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-[13px] font-black uppercase tracking-wide text-ink truncate">{p.sector}</span>
              <span className="flex items-baseline gap-1 shrink-0">
                <span className="text-[18px] font-black tabular-nums leading-none" style={{ color: "#10b981" }}>{convScore(p.conviction)}</span>
                <span className="text-[7px] uppercase tracking-wide text-ink-muted/45">conviction</span>
              </span>
            </div>

            <div className="flex items-center gap-2 mt-1 text-[8px]">
              <span className="font-bold" style={{ color: ct.color }}>{ct.arrow} {ct.label}</span>
              <span className="text-ink-muted/25">·</span>
              <span className="text-ink-muted/60">{p.horizon}</span>
              <span className="text-ink-muted/25">·</span>
              <span className="text-ink-muted/60 tabular-nums">{p.supportive}/{p.count} themes</span>
            </div>

            <OppBlock label="Supporting Themes">
              <div className="flex items-center gap-1 flex-wrap">
                {p.drivers.map(d => <span key={d} className="text-[9px] font-semibold px-1.5 py-px rounded bg-raised border border-edge text-ink-secondary">{d}</span>)}
              </div>
            </OppBlock>

            <OppBlock label="Why Investors Care" color="rgba(16,185,129,0.6)">
              <ul className="space-y-0.5">
                {p.whyBullets.map((b, i) => (
                  <li key={i} className="flex items-start gap-1.5 text-[9.5px] text-ink-secondary leading-snug">
                    <span className="shrink-0 mt-[4px] w-1 h-1 rounded-full bg-emerald-500/60" />
                    <span className="line-clamp-2">{b}</span>
                  </li>
                ))}
              </ul>
            </OppBlock>

            <OppBlock label="What Could Break It" color="rgba(245,158,11,0.65)">
              <p className="text-[9px] text-ink-muted/70 leading-snug line-clamp-2">{p.risk}</p>
            </OppBlock>

            {p.exposures.length > 0 && (
              <OppBlock label="Best Expressions">
                <div className="flex items-center gap-1 flex-wrap">
                  {p.exposures.map(tk => (
                    <span key={tk} className="text-[11px] font-bold tabular-nums px-1.5 py-px rounded bg-emerald-500/10 text-emerald-700 border border-emerald-500/20">{tk}</span>
                  ))}
                </div>
                {p.expressWhy && <p className="text-[8.5px] text-ink-muted/60 leading-snug mt-1">{p.expressWhy}</p>}
              </OppBlock>
            )}
          </div>
          );
        })}
      </div>
    </div>
  );
}



// ── EVIDENCE VALIDATION ───────────────────────────────────────────────────────

function EvidenceRow({ cluster, saved, onSave }: {
  cluster: StoryCluster; saved: boolean; onSave: (item: FeedItem) => void;
}) {
  const p = cluster.primary;
  return (
    <div className="flex items-start gap-2 px-3 py-1.5 hover:bg-raised/30 transition-colors group">
      <span className="text-[7.5px] font-bold uppercase tracking-wide mt-[3px] shrink-0 w-12 truncate"
        style={{ color: "rgba(82,176,200,0.6)" }}>{p.category}</span>
      <div className="min-w-0 flex-1">
        <a href={p.url} target="_blank" rel="noopener noreferrer"
          className="text-[11px] font-medium text-ink leading-snug line-clamp-2 hover:text-accent transition-colors">{p.title}</a>
        <p className="text-[8px] text-ink-muted/55 mt-px truncate">
          {p.source}{p.published ? ` · ${p.published}` : ""}{cluster.story_count > 1 ? ` · +${cluster.story_count - 1}` : ""}
        </p>
      </div>
      <button onClick={() => onSave(p)}
        className={cn("p-1 rounded shrink-0 transition-opacity", saved ? "opacity-100" : "opacity-0 group-hover:opacity-100")}
        style={{ color: saved ? "#52b0c8" : "rgba(255,255,255,0.4)" }}>
        {saved ? <BookmarkCheck size={11} /> : <Bookmark size={11} />}
      </button>
    </div>
  );
}

function freshness(items: StoryCluster[]): string {
  // FeedItem only carries a pre-formatted relative `published` string; the top
  // contributing cluster is the highest-signal/most-recent, so use its stamp.
  return items[0]?.primary.published ?? "";
}

function EvidenceValidation({ themes, clusters, savedIds, onSave }: {
  themes:   ThemeIntelligence[];
  clusters: StoryCluster[];
  savedIds: string[];
  onSave:   (item: FeedItem) => void;
}) {
  const [open, setOpen] = useState<Record<string, boolean>>({});

  const groups = useMemo(() => {
    const byId = new Map(clusters.map(c => [c.id, c]));
    const used = new Set<string>();
    const out: Array<{
      theme: ThemeIntelligence; items: StoryCluster[]; sources: string[];
      updated: string; agreement: number; quality: { label: string; color: string };
    }> = [];
    for (const t of [...themes].sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0))) {
      const items: StoryCluster[] = [];
      const sources = new Set<string>();
      for (const id of (t.contributing_cluster_ids ?? [])) {
        const c = byId.get(id);
        if (!c || used.has(id)) continue;
        items.push(c); used.add(id);
        if (c.primary.source) sources.add(c.primary.source);
        for (const r of (c.related ?? [])) if (r.source) sources.add(r.source);
      }
      if (!items.length) continue;
      const src = [...sources];
      const agreement = Math.min(98, 58 + src.length * 7 + (t.cross_category_confirmed ? 12 : 0));
      out.push({ theme: t, items, sources: src, updated: freshness(items), agreement, quality: sourceQuality(src) });
    }
    return out;
  }, [themes, clusters]);

  if (groups.length === 0) return null;

  return (
    <div>
      <SectionHeader label="Evidence Validation" icon={<Network size={11} className="text-accent shrink-0" />}
        sub="how confident are we" />
      <div className="space-y-1">
        {groups.map(({ theme, items, sources, updated, agreement, quality }) => {
          const o = !!open[theme.id];
          return (
            <div key={theme.id} className="rounded-lg border border-edge bg-surface overflow-hidden">
              <button onClick={() => setOpen(p => ({ ...p, [theme.id]: !p[theme.id] }))}
                className="w-full px-3 py-1.5 hover:bg-raised/40 transition-colors">
                <div className="flex items-center gap-2">
                  <ChevronDown size={12} className={cn("text-ink-muted/45 transition-transform shrink-0", o ? "" : "-rotate-90")} />
                  <span className="text-[12px] font-semibold text-ink truncate flex-1 text-left">{cleanThemeName(theme.name)}</span>
                  <span className="flex items-center gap-2 shrink-0 text-[8px] tabular-nums">
                    <span className="font-bold" style={{ color: "#10b981" }}>{items.length} conf</span>
                    <span className="font-bold" style={{ color: "#10b981" }}>{agreement}% agree</span>
                    <span className="font-semibold" style={{ color: quality.color }}>{quality.label} quality</span>
                    <span className="text-ink-muted/45">{sources.length} src</span>
                    {updated && <span className="text-ink-muted/45">· {updated}</span>}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 flex-wrap mt-1 pl-[20px]">
                  {sources.slice(0, 6).map(s => (
                    <span key={s} className="flex items-center gap-1 text-[8px] text-ink-muted">
                      <span style={{ color: "#10b981" }}>✓</span>{s}
                    </span>
                  ))}
                </div>
              </button>
              {o && (
                <div className="divide-y divide-edge/40 border-t border-edge/60">
                  {items.map(c => <EvidenceRow key={c.id} cluster={c} saved={savedIds.includes(c.id)} onSave={onSave} />)}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}



// ── Page ──────────────────────────────────────────────────────────────────────

export default function MarketsPage() {
  const [activeKey,  setActiveKey]  = useState<SnapshotKey | null>(null);
  const [drawerData, setDrawerData] = useState<DrawerData | null>(null);
  const clusterRef = useRef<HTMLDivElement>(null);

  const { data: marketData, meta: marketMeta, heartbeatStatus, marketOpen } = useMarketData();
  const { data }                  = useFeed({ use_ai: true });
  const { riskRegime, volRegime }                              = useMarketState();
  const { savedIds, toggleSave }                               = useSaved();
  const { followed, followedIds, isFollowed, toggle: toggleFollow, unfollow } = useFollowedThemes();

  const clusters      = useMemo(() => data?.clusters           ?? [], [data]);
  const themes        = useMemo(() => data?.theme_intelligence ?? [], [data]);

  const { alerts, dismiss: dismissAlert } = useThemeAlerts(themes);
  const cacheAge      = data?.cache_age_seconds;
  const derivedRegime = data?.sector_data?.derived_regime ?? "";
  const sectorData    = data?.sector_data ?? null;

  // Theme intelligence — computed once, shared by all sections
  const visible = useMemo(
    () => themes.filter(t => t.signal_strength === "strong" || t.signal_strength === "medium"),
    [themes],
  );
  const relMap = useMemo(() => buildThemeRelationshipMap(visible), [visible]);
  const contradictions = useMemo(
    () => detectContradictions(visible, sectorData, riskRegime, volRegime),
    [visible, sectorData, riskRegime, volRegime],
  );

  function openDrawer(t: ThemeIntelligence) {
    dismissAlert(t.id);
    const rel = relMap.get(t.id);
    setDrawerData({
      theme:      t,
      upstream:   rel?.upstream   ?? [],
      downstream: rel?.downstream ?? [],
      connected:  rel?.connected  ?? [],
      conflicts:  contradictions.filter(c => c.themeIds.includes(t.id)),
    });
  }

  function handleFollowToggle(t: ThemeIntelligence) {
    toggleFollow(t, cleanThemeName(t.name));
  }

  const watchlistAlerts = alerts.filter(a => followedIds.includes(a.themeId));

  const activeCfg = SNAPSHOT_CONFIGS.find(c => c.key === activeKey) ?? null;

  function handleTileClick(key: SnapshotKey) {
    if (activeKey === key) {
      setActiveKey(null);
    } else {
      setActiveKey(key);
      setTimeout(() =>
        clusterRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 80);
    }
  }

  return (
    <>
      {/* Argus identity header — compact */}
      <div style={{ background: "rgba(6,10,22,0.97)", borderBottom: "1px solid rgba(255,255,255,0.06)", marginBottom: "16px" }}>
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/argus-icon.png" alt="" style={{ width: 14, height: 14, borderRadius: 3, opacity: 0.80 }} />
            <span style={{ fontSize: "7.5px", letterSpacing: "0.2em", fontWeight: 700, color: "rgba(255,255,255,0.22)" }}>ARGUS</span>
            <div style={{ width: 1, height: 8, background: "rgba(255,255,255,0.09)" }} />
            <h1 style={{ fontSize: "13px", fontWeight: 600, color: "rgba(255,255,255,0.85)", letterSpacing: "0.02em" }}>Markets</h1>
            <span style={{ fontSize: "9.5px", color: "rgba(255,255,255,0.22)" }}>· Intelligence · Themes · Sectors</span>
          </div>
          {marketMeta?.fetchedAt && heartbeatStatus !== "loading" && (
            <div className="flex items-center gap-1 shrink-0">
              <span className={cn(
                "w-1.5 h-1.5 rounded-full",
                heartbeatStatus === "live"  ? "bg-emerald-400 animate-pulse" :
                heartbeatStatus === "stale" ? "bg-amber-400" : "bg-red-500",
              )} />
              <span style={{ fontSize: "8px", color: "rgba(255,255,255,0.22)" }}>
                {formatAge(Math.floor((Date.now() - new Date(marketMeta.fetchedAt).getTime()) / 1000))} ago
              </span>
            </div>
          )}
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 pb-8">

        {/* ══ 1. MARKET STATE — what is happening ══════════════ */}
        <SectionHeader label="Market State" />
        <MarketSnapshot themes={visible} sectorData={sectorData} regime={derivedRegime} brief={data?.market_brief} />
        <MarketInternals themes={visible} />

        {/* Live market snapshot — 6 instruments */}
        <MarketSnapshotStrip marketData={marketData} />

        {/* Market Intel Bar — regime + filter */}
        <MarketIntelBar
          regime={derivedRegime}
          brief={data?.market_brief ?? undefined}
          marketData={marketData}
          activeKey={activeKey}
          onTileClick={handleTileClick}
          heartbeatStatus={heartbeatStatus}
          marketOpen={marketOpen}
          cacheAge={cacheAge}
        />

        {/* Active filter chip */}
        <AnimatePresence>
          {activeCfg && (
            <motion.div
              key="filter"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="mb-3 flex items-center gap-2"
            >
              <span className="text-[8.5px] text-ink-muted/40">Filtering stories by</span>
              <button
                onClick={() => setActiveKey(null)}
                className="flex items-center gap-1 text-[8.5px] font-semibold px-2 py-0.5 rounded-full
                           bg-accent/10 text-accent hover:bg-accent/20 transition-colors"
              >
                {activeCfg.label} <X size={8} />
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ══ 2. DOMINANT NARRATIVE — why it is happening ══════ */}
        <DominantNarrative brief={data?.market_brief} themes={visible} />

        {/* ══ 3. TODAY'S CHANGES — what actually moved ═════════ */}
        <WhatChangedToday themes={visible} onThemeClick={openDrawer} />

        {/* ══ 4. SECTOR POSITIONING — where it matters ═════════ */}
        <SectorPositioning themes={visible} />

        {/* ══ 5. THEME COMMAND CENTER — what's driving it ══════ */}
        <ThemeCommandCenter themes={visible} onThemeClick={openDrawer} />

        {/* ══ 6. TRANSMISSION MAP — how it spreads ═════════════ */}
        <ThemeTransmission themes={visible} onNodeClick={openDrawer} />

        {/* ══ 7. HIGHEST CONVICTION OPPORTUNITIES — what to do ═ */}
        <HighestConvictionOpportunities themes={visible} />

        {/* ══ 7. EVIDENCE VALIDATION — why we believe it ═══════ */}
        <div ref={clusterRef} className="mb-4">
          <EvidenceValidation
            themes={visible}
            clusters={clusters}
            savedIds={savedIds}
            onSave={(item) => toggleSave(item)}
          />
        </div>

        {/* Watchlist — personal tracking, below the core workflow */}
        <WatchlistPanel
          followed={followed}
          liveThemes={visible}
          onOpenTheme={openDrawer}
          onUnfollow={unfollow}
          alerts={watchlistAlerts}
        />

      </div>

      {/* Shared drawer — opened by theme cards, watchlist, and chain nodes */}
      <ThemeDetailDrawer
        data={drawerData}
        onClose={() => setDrawerData(null)}
        isFollowed={drawerData ? isFollowed(drawerData.theme.id) : false}
        onToggleFollow={() => drawerData && handleFollowToggle(drawerData.theme)}
      />
    </>
  );
}
