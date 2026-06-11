"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Zap, Network, BarChart2,
  X, ChevronRight, AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useFeed } from "@/hooks/useFeed";
import { useSaved } from "@/hooks/useSaved";
import { useMarketData } from "@/hooks/useMarketData";
import { ClusterStream } from "@/components/feed/ClusterStream";
import type { StoryCluster, ThemeIntelligence, SectorData } from "@/lib/types";
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
  getConflictedThemeIds,
  computeBreadthSnapshot,
} from "@/lib/themeIntelligence";
import { useMarketState } from "@/hooks/useMarketState";


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

const MOVES_CONFIGS = [
  { key: "SPY",     label: "S&P"    },
  { key: "QQQ",     label: "Nasdaq" },
  { key: "IWM",     label: "IWM"    },
  { key: "BTC-USD", label: "BTC"    },
  { key: "BZ=F",    label: "Brent"  },
  { key: "GC=F",    label: "Gold"   },
  { key: "DXY",     label: "DXY"    },
  { key: "TNX",     label: "10Y",   isYield: true },
  { key: "VIX",     label: "VIX",   isVix:   true },
] as const;

const TICKER_MATCH_KW: Record<string, string[]> = {
  "SPY":     ["S&P", "SPX", "equity", "equities", "stocks", "NYSE"],
  "QQQ":     ["Nasdaq", "tech", "technology", "QQQ"],
  "IWM":     ["Russell", "small cap", "small-cap", "IWM"],
  "TNX":     ["Treasury", "yield", "yields", "Fed", "FOMC", "rates", "bond"],
  "BTC-USD": ["Bitcoin", "BTC", "crypto", "Ethereum"],
  "BZ=F":    ["oil", "brent", "crude", "WTI", "energy"],
  "GC=F":    ["gold", "precious", "safe-haven"],
  "DXY":     ["dollar", "DXY", "USD", "greenback", "currency", "FX"],
  "VIX":     ["VIX", "volatility"],
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

const EVOLUTION_CLS: Record<string, string> = {
  accelerating:  "text-emerald-500",
  strengthening: "text-emerald-500",
  broadening:    "text-sky-400",
  stabilizing:   "text-slate-400",
  peaking:       "text-amber-400",
  weakening:     "text-orange-400",
  reversing:     "text-red-500",
};

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
  return raw
    .replace(/\bAscendancy\b/gi, "")
    .replace(/\bRepricing\b/gi, "")
    .replace(/\bSovereign(?:ty)?\b/gi, "")
    .replace(/\bDominance\b/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim() || raw;
}

function regimeAccentColor(regime: string): string {
  const l = regime.toLowerCase();
  if (l.includes("risk-on") || l.includes("goldilocks") || l.includes("expansion")) return "#10b981";
  if (l.includes("risk-off") || l.includes("stagflat") || l.includes("recession"))  return "#f87171";
  if (l.includes("reflat") || l.includes("inflation")) return "#fbbf24";
  return "#818cf8";
}

function clusterMatchesFilter(c: StoryCluster, keywords: string[]): boolean {
  const hay = [c.primary.title, c.primary.category, ...c.primary.affected_entities]
    .join(" ").toLowerCase();
  return keywords.some(kw => hay.includes(kw.toLowerCase()));
}

function findMoveExplanation(tickerKey: string, clusters: StoryCluster[]): string | null {
  const kws = TICKER_MATCH_KW[tickerKey] ?? [];
  if (kws.length === 0) return null;
  for (const c of clusters) {
    const hay = [c.primary.title, ...c.primary.affected_entities].join(" ").toLowerCase();
    if (kws.some(k => hay.includes(k.toLowerCase())))
      return c.primary.why_it_matters ?? null;
  }
  return null;
}

function confColor(score: number): string {
  return score >= 75 ? "#10b981" : score >= 50 ? "#f59e0b" : "#94a3b8";
}

function borderColorForTheme(t: ThemeIntelligence, evState: string): string {
  if (t.momentum_direction === "bullish") return "#10b981";
  if (t.momentum_direction === "bearish") return "#ef4444";
  if (evState === "accelerating" || evState === "strengthening" || evState === "broadening") return "#10b981";
  if (evState === "reversing"    || evState === "weakening") return "#ef4444";
  return "#f59e0b";
}


// ── Section header ─────────────────────────────────────────────────────────────

function SectionHeader({ label, icon, sub }: {
  label: string; icon?: React.ReactNode; sub?: string;
}) {
  return (
    <div className="flex items-center gap-2 mb-2">
      {icon}
      <span className="text-[9px] font-bold uppercase tracking-[0.18em] text-ink-muted/60">{label}</span>
      {sub && <span className="text-[8.5px] text-ink-muted/30">{sub}</span>}
      <span className="h-px flex-1 bg-edge/60" />
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
                  <span style={{ fontSize: "8px", color: "rgba(255,255,255,0.12)" }}>—</span>
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


// ── Biggest Moves ─────────────────────────────────────────────────────────────

function BiggestMoves({ data, clusters }: {
  data:     Record<string, TickerData | null> | undefined;
  clusters: StoryCluster[];
}) {
  if (!data) return null;

  const tickers = MOVES_CONFIGS
    .map(c => ({ cfg: c, t: data[c.key] as TickerData | null }))
    .filter((x): x is { cfg: typeof MOVES_CONFIGS[number]; t: TickerData } =>
      x.t !== null && x.t !== undefined)
    .sort((a, b) => Math.abs(b.t.changePercent) - Math.abs(a.t.changePercent));

  if (tickers.length === 0) return null;

  const explanations = tickers.slice(0, 4)
    .map(({ cfg, t }) => ({ cfg, t, text: findMoveExplanation(t.key, clusters) }))
    .filter((x): x is typeof x & { text: string } => x.text !== null);

  return (
    <>
      {/* Compact ticker strip */}
      <div className="flex items-center gap-1.5 flex-wrap mb-2">
        {tickers.map(({ cfg, t }, i) => {
          const up = isUp(t);
          return (
            <div
              key={t.key}
              className={cn(
                "flex items-baseline gap-1 px-2 py-1 rounded border bg-surface",
                i === 0 ? "border-edge-strong" : "border-edge/70",
              )}
            >
              <span className="text-[8.5px] font-bold text-ink-muted">{cfg.label}</span>
              {"isYield" in cfg && cfg.isYield && (
                <span className="text-[8.5px] font-semibold tabular-nums text-ink-muted">{t.price.toFixed(3)}%</span>
              )}
              {"isVix" in cfg && cfg.isVix && (
                <span className="text-[8.5px] font-semibold tabular-nums text-ink-muted">{t.price.toFixed(1)}</span>
              )}
              <span className={cn(
                "font-bold tabular-nums",
                i === 0 ? "text-[11px]" : "text-[10px]",
                up ? "text-emerald-600" : "text-red-500",
              )}>
                {formatChange(t)}
              </span>
            </div>
          );
        })}
      </div>
      {/* Explanations — one line each */}
      {explanations.length > 0 && (
        <div className="space-y-0.5 border-t border-edge/30 pt-2">
          {explanations.map(({ cfg, t, text }) => (
            <div key={t.key} className="flex items-start gap-2 text-[9.5px]">
              <span className={cn(
                "font-bold tabular-nums shrink-0 w-[5.5rem]",
                isUp(t) ? "text-emerald-600" : "text-red-500",
              )}>
                {cfg.label} {formatChange(t)}
              </span>
              <span className="text-ink-muted leading-snug line-clamp-1 flex-1">— {text}</span>
            </div>
          ))}
        </div>
      )}
    </>
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

function ThemeDetailDrawer({
  data, onClose,
}: {
  data:    DrawerData | null;
  onClose: () => void;
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

  const bColor = borderColorForTheme(t, evState);

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
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className={cn("text-[10px] font-semibold uppercase tracking-wider", evCls)}>
                      {evMeta.icon} {evMeta.label}
                    </span>
                    {t.evidence_count > 0 && (
                      <span className="text-[9px] text-ink-muted/35">{t.evidence_count} signals</span>
                    )}
                  </div>
                  <h2 className="text-[22px] font-bold text-ink leading-tight tracking-tight">{publicName}</h2>
                  {/* Confidence below the name — slim, unobtrusive */}
                  <div className="flex items-center gap-2 mt-2">
                    <div className="w-24 h-[2px] rounded-full bg-raised overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${score}%`, background: cColor }} />
                    </div>
                    <span className="text-[9px] tabular-nums" style={{ color: cColor }}>
                      {t.confidence_label || `${score}% confidence`}
                    </span>
                  </div>
                </div>
                <button
                  onClick={onClose}
                  className="shrink-0 w-8 h-8 flex items-center justify-center rounded-lg hover:bg-raised
                             text-ink-muted hover:text-ink transition-colors mt-0.5"
                >
                  <X size={15} />
                </button>
              </div>
            </div>

            {/* Body */}
            <div className="px-5 py-5 space-y-6">

              {/* Upstream drivers */}
              {upstream.length > 0 && (
                <div>
                  <p className="text-[9.5px] font-bold uppercase tracking-widest text-ink-muted/40 mb-2">
                    Driven By
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {upstream.map(u => (
                      <span
                        key={u}
                        className="text-[11px] text-ink-secondary px-2.5 py-1 rounded bg-raised border border-edge"
                      >
                        {cleanMacroLabel(u)}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Full causal narrative */}
              {(t.causal_narrative || t.description) && (
                <div>
                  <p className="text-[9.5px] font-bold uppercase tracking-widest text-ink-muted/40 mb-2">
                    Why It Matters
                  </p>
                  <p className="text-[13.5px] text-ink-secondary leading-[1.65] border-l-2 pl-4"
                    style={{ borderColor: `${bColor}40` }}>
                    {t.causal_narrative || t.description}
                  </p>
                </div>
              )}

              {/* Benefits / Pressures */}
              {(benefits.length > 0 || pressures.length > 0 || neutral.length > 0) && (
                <div className="grid grid-cols-2 gap-5">
                  {(benefits.length > 0 || neutral.length > 0) && (
                    <div>
                      <p className="text-[9.5px] font-bold uppercase tracking-widest text-emerald-600/60 mb-2.5">
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
                    <div>
                      <p className="text-[9.5px] font-bold uppercase tracking-widest text-red-500/60 mb-2.5">
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
              )}

              {/* Watch signals */}
              {t.second_order_effects.length > 0 && (
                <div>
                  <p className="text-[9.5px] font-bold uppercase tracking-widest text-amber-500/60 mb-2.5">
                    Watch For
                  </p>
                  <div className="space-y-2.5">
                    {t.second_order_effects.slice(0, 3).map((effect, i) => (
                      <div key={i} className="flex items-start gap-3 p-3 rounded-lg bg-amber-50/50 border border-amber-100">
                        <span className="text-amber-500 shrink-0 mt-0.5 font-bold text-[11px]">›</span>
                        <p className="text-[12.5px] text-ink-secondary leading-relaxed">{effect}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Related themes */}
              {connected.length > 0 && (
                <div>
                  <p className="text-[9.5px] font-bold uppercase tracking-widest text-ink-muted/40 mb-2.5">
                    Related Themes
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {connected.map(c => {
                      const lc = c.linkType === "shared-story" ? "#38bdf8" :
                                 c.linkType === "shared-asset" ? "#a78bfa" : "#94a3b8";
                      return (
                        <span key={c.id} className="text-[11px] px-2.5 py-1 rounded-full font-medium"
                          style={{ color: lc, background: `${lc}12`, border: `1px solid ${lc}28` }}>
                          {cleanThemeName(c.name)}
                        </span>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Narrative flow: Driver → Theme → Impact (replaces factor chain diagram) */}
              {(upstream.length > 0 || downstream.length > 0) && (
                <div>
                  <p className="text-[9.5px] font-bold uppercase tracking-widest text-ink-muted/40 mb-3">
                    How It Works
                  </p>
                  <div className="flex items-stretch gap-0 rounded-lg border border-edge overflow-hidden">
                    {/* Drivers */}
                    <div className="flex-1 bg-raised px-3 py-3">
                      <p className="text-[8px] font-bold uppercase tracking-widest text-ink-muted/35 mb-2">Driver</p>
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
              <div>
                <p className="text-[9.5px] font-bold uppercase tracking-widest text-ink-muted/40 mb-3">
                  Lifecycle — <span style={{ color: THEME_LIFECYCLE_META[lcStage].color }}>
                    {THEME_LIFECYCLE_META[lcStage].label}
                  </span>
                </p>
                <LifecycleJourney stage={lcStage} />
                <div className="flex justify-between mt-1.5">
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

              {/* Signal conflicts */}
              {conflicts.length > 0 && (
                <div>
                  <p className="text-[9.5px] font-bold uppercase tracking-widest text-amber-500/60 mb-2.5">
                    Signal Conflicts
                  </p>
                  <div className="space-y-2">
                    {conflicts.slice(0, 3).map(c => (
                      <div key={c.id} className="flex items-start gap-2.5 p-3 rounded-lg bg-amber-50/40 border border-amber-100/80">
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


// ── Compact Theme Card (analyst note style) ───────────────────────────────────

function CompactThemeCard({
  theme, isConflict, onClick,
}: {
  theme:      ThemeIntelligence;
  isConflict: boolean;
  onClick:    () => void;
}) {
  const t          = theme;
  const evState    = computeThemeEvolutionState(t);
  const evMeta     = THEME_EVOLUTION_META[evState];
  const evCls      = EVOLUTION_CLS[evState] ?? "text-slate-400";
  const publicName = cleanThemeName(t.name);
  const narrative  = t.causal_narrative || t.description || "";
  const score      = t.confidence ?? 0;
  const cColor     = confColor(score);
  const bColor     = borderColorForTheme(t, evState);

  const benefits:  string[] = [];
  const pressures: string[] = [];
  for (const ind of (t.related_industries ?? [])) {
    const w = (t.relationship_weights ?? {})[ind];
    if (w?.direction === "positive")      benefits.push(ind);
    else if (w?.direction === "negative") pressures.push(ind);
  }

  return (
    <button
      onClick={onClick}
      className="w-full text-left bg-surface border border-edge rounded-lg
                 hover:border-edge-strong hover:shadow-sm transition-all duration-100 group"
      style={{ borderLeft: `3px solid ${bColor}` }}
    >
      <div className="px-4 pt-3 pb-3 space-y-2">

        {/* Status row — tiny, secondary */}
        <div className="flex items-center justify-between gap-2">
          <span className={cn("text-[9px] font-semibold uppercase tracking-wider", evCls)}>
            {evMeta.icon} {evMeta.label}
          </span>
          <div className="flex items-center gap-2">
            {isConflict && (
              <span className="text-[8.5px] text-amber-400" title="Signal conflict">⚠ conflicting signals</span>
            )}
            <span className="text-[9px] tabular-nums text-ink-muted/50" style={{ color: cColor }}>
              {score}% confidence
            </span>
            <ChevronRight
              size={11}
              className="text-ink-muted/25 group-hover:text-ink-muted/60 transition-colors"
            />
          </div>
        </div>

        {/* Theme name — large and prominent */}
        <h3 className="text-[15px] font-bold text-ink leading-snug">
          {publicName}
        </h3>

        {/* Thesis — readable body copy */}
        {narrative && (
          <p className="text-[11.5px] text-ink-secondary leading-relaxed line-clamp-2">
            {narrative}
          </p>
        )}

        {/* Winners / Losers — clear labeled lines */}
        {(benefits.length > 0 || pressures.length > 0) && (
          <div className="space-y-0.5 pt-0.5">
            {benefits.length > 0 && (
              <p className="text-[10.5px] leading-snug">
                <span className="text-emerald-600 font-semibold">↑ Benefits&nbsp;</span>
                <span className="text-ink-secondary">
                  {benefits.slice(0, 3).join(" · ")}
                  {benefits.length > 3 && <span className="text-ink-muted/40"> +{benefits.length - 3} more</span>}
                </span>
              </p>
            )}
            {pressures.length > 0 && (
              <p className="text-[10.5px] leading-snug">
                <span className="text-red-500 font-semibold">↓ Pressures&nbsp;</span>
                <span className="text-ink-secondary">
                  {pressures.slice(0, 3).join(" · ")}
                  {pressures.length > 3 && <span className="text-ink-muted/40"> +{pressures.length - 3} more</span>}
                </span>
              </p>
            )}
          </div>
        )}

      </div>
    </button>
  );
}


// ── WHAT'S DRIVING IT ─────────────────────────────────────────────────────────

function IntelligenceThemes({
  themes, sectorData, riskRegime, volRegime,
}: {
  themes:     ThemeIntelligence[];
  sectorData: SectorData | null;
  riskRegime: "risk-on" | "neutral" | "risk-off";
  volRegime:  "low" | "moderate" | "elevated" | "high";
}) {
  const [drawerData, setDrawerData] = useState<DrawerData | null>(null);

  const visible = themes.filter(
    t => t.signal_strength === "strong" || t.signal_strength === "medium",
  );

  const relMap         = useMemo(() => buildThemeRelationshipMap(visible), [visible]);
  const contradictions = useMemo(
    () => detectContradictions(visible, sectorData, riskRegime, volRegime),
    [visible, sectorData, riskRegime, volRegime],
  );
  const conflictedIds  = useMemo(() => getConflictedThemeIds(contradictions), [contradictions]);

  function openDrawer(t: ThemeIntelligence) {
    const rel = relMap.get(t.id);
    setDrawerData({
      theme:      t,
      upstream:   rel?.upstream ?? [],
      downstream: rel?.downstream ?? [],
      connected:  rel?.connected ?? [],
      conflicts:  contradictions.filter(c => c.themeIds.includes(t.id)),
    });
  }

  if (visible.length === 0) return (
    <div className="mb-4">
      <SectionHeader label="What's Driving It" icon={<Network size={11} className="text-accent shrink-0" />} />
      <p className="text-[10.5px] text-ink-muted italic">Theme analysis warming up…</p>
    </div>
  );

  return (
    <>
      <div className="mb-4">
        <SectionHeader
          label="What's Driving It"
          icon={<Network size={11} className="text-accent shrink-0" />}
          sub={`${visible.length} theme${visible.length !== 1 ? "s" : ""} · click for detail`}
        />
        <div className="space-y-2">
          {visible.map(t => (
            <CompactThemeCard
              key={t.id}
              theme={t}
              isConflict={conflictedIds.has(t.id)}
              onClick={() => openDrawer(t)}
            />
          ))}
        </div>
      </div>

      <ThemeDetailDrawer
        data={drawerData}
        onClose={() => setDrawerData(null)}
      />
    </>
  );
}


// ── WHERE IT MATTERS ──────────────────────────────────────────────────────────

function WhereMattersList({ themes, sectorData }: {
  themes:     ThemeIntelligence[];
  sectorData: SectorData | null;
}) {
  const snapshot = useMemo(
    () => computeBreadthSnapshot(themes, sectorData),
    [themes, sectorData],
  );

  if (snapshot.length === 0) return null;

  const leaders    = snapshot.filter(s => s.direction === "positive").slice(0, 6);
  const laggards   = snapshot.filter(s => s.direction === "negative").slice(0, 6);
  const mixed      = snapshot.filter(s => s.direction === "mixed").slice(0, 4);
  const maxScore   = snapshot[0]?.signalScore ?? 100;
  const confirming = snapshot.filter(s => s.direction === "positive" || s.direction === "mixed").length;

  return (
    <div className="mb-4">
      <SectionHeader
        label="Where It Matters"
        icon={<BarChart2 size={11} className="text-accent shrink-0" />}
        sub={`${confirming}/${snapshot.length} sectors confirming`}
      />

      <div className="grid grid-cols-2 gap-x-4 gap-y-1">
        {/* Leaders column header */}
        {leaders.length > 0 && (
          <p className="text-[7.5px] font-bold uppercase tracking-widest text-emerald-600/50 mb-0.5">
            ↑ Leaders
          </p>
        )}
        {laggards.length > 0 && (
          <p className="text-[7.5px] font-bold uppercase tracking-widest text-red-500/50 mb-0.5">
            ↓ Pressure
          </p>
        )}

        {/* Interleaved rows */}
        {Array.from({ length: Math.max(leaders.length, laggards.length) }).map((_, i) => (
          <>
            {/* Leader row */}
            <div key={`l-${i}`} className={cn("flex items-center gap-1.5", !leaders[i] ? "invisible" : "")}>
              {leaders[i] && (
                <>
                  <span className="text-[9.5px] text-ink-secondary w-24 shrink-0 truncate">
                    {leaders[i].sector}
                  </span>
                  <div className="w-12 h-[2px] rounded-full bg-raised overflow-hidden shrink-0">
                    <div className="h-full rounded-full"
                      style={{ width: `${maxScore > 0 ? (leaders[i].signalScore / maxScore) * 100 : 0}%`, background: "#10b981" }} />
                  </div>
                  {leaders[i].themeCount > 0 && (
                    <span className="text-[7.5px] text-emerald-600/50 tabular-nums">×{leaders[i].themeCount}</span>
                  )}
                </>
              )}
            </div>
            {/* Laggard row */}
            <div key={`r-${i}`} className={cn("flex items-center gap-1.5", !laggards[i] ? "invisible" : "")}>
              {laggards[i] && (
                <>
                  <span className="text-[9.5px] text-ink-secondary w-24 shrink-0 truncate">
                    {laggards[i].sector}
                  </span>
                  <div className="w-12 h-[2px] rounded-full bg-raised overflow-hidden shrink-0">
                    <div className="h-full rounded-full"
                      style={{ width: `${maxScore > 0 ? (laggards[i].signalScore / maxScore) * 100 : 0}%`, background: "#ef4444" }} />
                  </div>
                  {laggards[i].themeCount > 0 && (
                    <span className="text-[7.5px] text-red-500/50 tabular-nums">×{laggards[i].themeCount}</span>
                  )}
                </>
              )}
            </div>
          </>
        ))}
      </div>

      {mixed.length > 0 && (
        <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-2 pt-2 border-t border-edge/40">
          <span className="text-[7.5px] font-bold uppercase tracking-widest text-amber-500/50 shrink-0">Mixed</span>
          {mixed.map(s => (
            <span key={s.sector} className="text-[9px] text-ink-muted">{s.sector}</span>
          ))}
        </div>
      )}
    </div>
  );
}


// ── Page ──────────────────────────────────────────────────────────────────────

export default function MarketsPage() {
  const [activeKey, setActiveKey] = useState<SnapshotKey | null>(null);
  const clusterRef = useRef<HTMLDivElement>(null);

  const { data: marketData, meta: marketMeta, heartbeatStatus, marketOpen } = useMarketData();
  const { data, isLoading }       = useFeed({ use_ai: true });
  const { riskRegime, volRegime } = useMarketState();
  const { savedIds, toggleSave }  = useSaved();

  const clusters      = useMemo(() => data?.clusters           ?? [], [data]);
  const themes        = useMemo(() => data?.theme_intelligence ?? [], [data]);
  const cacheAge      = data?.cache_age_seconds;
  const derivedRegime = data?.sector_data?.derived_regime ?? "";

  const activeCfg = SNAPSHOT_CONFIGS.find(c => c.key === activeKey) ?? null;

  const visibleClusters = useMemo(() => {
    if (activeCfg) {
      const filtered = clusters.filter(c => clusterMatchesFilter(c, [...activeCfg.filterKw]));
      return filtered.length > 0 ? filtered : clusters;
    }
    const focused = clusters.filter(
      c => c.primary.category === "Markets" || c.primary.category === "Geopolitical",
    );
    return focused.length > 0 ? focused : clusters;
  }, [clusters, activeCfg]);

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

        {/* ── WHAT'S HAPPENING ─────────────────────────────── */}
        <SectionHeader label="What's Happening" />

        {/* Market Intel Bar — regime + prices + filter in one dark strip */}
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

        {/* Biggest Moves */}
        <div className="mb-4">
          <SectionHeader label="Biggest Moves" icon={<Zap size={11} className="text-accent shrink-0" />} />
          <BiggestMoves data={marketData} clusters={clusters} />
        </div>

        {/* ── WHAT'S DRIVING IT ────────────────────────────── */}
        <IntelligenceThemes
          themes={themes}
          sectorData={data?.sector_data ?? null}
          riskRegime={riskRegime}
          volRegime={volRegime}
        />

        {/* ── WHERE IT MATTERS ─────────────────────────────── */}
        <WhereMattersList
          themes={themes}
          sectorData={data?.sector_data ?? null}
        />

        {/* ── SUPPORTING EVIDENCE ──────────────────────────── */}
        <div ref={clusterRef}>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-[9px] font-bold uppercase tracking-[0.18em] text-ink-muted/60">
              Supporting Evidence
            </span>
            {!isLoading && clusters.length > 0 && (
              <span className="text-[8.5px] text-ink-muted/40 bg-raised px-1.5 py-px rounded-full">
                {visibleClusters.length}{activeCfg ? ` of ${clusters.length}` : ""}
              </span>
            )}
            <span className="h-px flex-1 bg-edge/60" />
          </div>
          <ClusterStream
            clusters={visibleClusters}
            savedIds={savedIds}
            onSave={(item) => toggleSave(item)}
            isLoading={isLoading}
          />
        </div>

      </div>
    </>
  );
}
