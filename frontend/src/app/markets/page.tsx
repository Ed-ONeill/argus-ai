"use client";

import { useState, useMemo, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  TrendingUp, TrendingDown, Minus, AlertCircle, AlertTriangle,
  Zap, Network, ChevronDown, ChevronUp, BarChart2, X,
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
    key: "BTC-USD", label: "BTC/USD", sub: "Bitcoin", color: "#D97706",
    filterKw: ["Bitcoin", "BTC", "Ethereum", "ETH", "crypto", "digital asset", "blockchain"],
  },
] as const;

const MOVES_CONFIGS = [
  { key: "SPY",     label: "S&P 500" },
  { key: "QQQ",     label: "Nasdaq"  },
  { key: "IWM",     label: "Russell" },
  { key: "BTC-USD", label: "BTC"     },
  { key: "BZ=F",    label: "Brent"   },
  { key: "GC=F",    label: "Gold"    },
  { key: "DXY",     label: "DXY"     },
  { key: "TNX",     label: "10Y",    isYield: true },
  { key: "VIX",     label: "VIX",    isVix:   true },
] as const;

const TICKER_MATCH_KW: Record<string, string[]> = {
  "SPY":     ["S&P", "SPX", "equity", "equities", "stocks", "NYSE"],
  "QQQ":     ["Nasdaq", "tech", "technology", "QQQ"],
  "IWM":     ["Russell", "small cap", "small-cap", "IWM"],
  "TNX":     ["Treasury", "yield", "yields", "Fed", "FOMC", "rates", "bond"],
  "BTC-USD": ["Bitcoin", "BTC", "crypto", "Ethereum"],
  "BZ=F":    ["oil", "brent", "crude", "WTI", "energy"],
  "GC=F":    ["gold", "precious", "safe-haven"],
  "DXY":     ["dollar", "DXY", "USD", "greenback", "currency", "FX", "forex"],
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

const EVOLUTION_CLS: Record<string, string> = {
  accelerating:  "text-emerald-400",
  strengthening: "text-emerald-400",
  broadening:    "text-sky-400",
  stabilizing:   "text-slate-400",
  peaking:       "text-amber-400",
  weakening:     "text-orange-400",
  reversing:     "text-red-400",
};

const LIFECYCLE_STAGES: ThemeLifecycleStage[] = [
  "emerging", "building", "dominant", "maturing", "retiring",
];

type SnapshotKey = typeof SNAPSHOT_CONFIGS[number]["key"];


// ── Helpers ───────────────────────────────────────────────────────────────────

function formatPrice(key: string, price: number): string {
  if (key === "TNX") return price.toFixed(3) + "%";
  if (key === "BTC-USD") return "$" + price.toLocaleString("en-US", { maximumFractionDigits: 0 });
  if (key === "VIX") return price.toFixed(2);
  if (key === "BZ=F" || key === "GC=F") return "$" + price.toFixed(2);
  return price.toFixed(2);
}

function formatChange(ticker: TickerData): string {
  if (ticker.key === "TNX") {
    return `${ticker.change >= 0 ? "+" : ""}${ticker.change.toFixed(3)}%`;
  }
  if (ticker.key === "VIX") {
    return `${ticker.change >= 0 ? "+" : ""}${ticker.change.toFixed(2)} pts`;
  }
  return `${ticker.changePercent >= 0 ? "+" : ""}${ticker.changePercent.toFixed(2)}%`;
}

function formatAge(seconds: number | undefined): string {
  if (seconds === undefined || seconds < 0) return "";
  if (seconds < 60) return `${Math.round(seconds)}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  return `${Math.floor(seconds / 3600)}h ago`;
}

function isUp(t: TickerData): boolean {
  return t.key === "TNX" ? t.change > 0 : t.changePercent > 0;
}

function cleanMacroLabel(raw: string): string {
  return MACRO_LABEL_MAP[raw] ?? raw;
}

function regimeAccentColor(regime: string): string {
  const l = regime.toLowerCase();
  if (l.includes("risk-on") || l.includes("goldilocks") || l.includes("expansion")) return "#10b981";
  if (l.includes("risk-off") || l.includes("stagflat") || l.includes("recession"))  return "#ef4444";
  if (l.includes("reflat") || l.includes("inflation")) return "#f59e0b";
  return "#6366f1";
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
    if (kws.some(k => hay.includes(k.toLowerCase()))) {
      return c.primary.why_it_matters ?? null;
    }
  }
  return null;
}


// ── Sparkline ─────────────────────────────────────────────────────────────────

function Sparkline({ history, positive }: { history: number[]; positive: boolean }) {
  if (history.length < 3) return <div className="w-[60px] h-[22px]" />;
  const min = Math.min(...history);
  const max = Math.max(...history);
  const span = max - min || 0.001;
  const W = 60, H = 22;
  const pts = history.map((v, i) => {
    const x = (i / (history.length - 1)) * W;
    const y = H - 1 - ((v - min) / span) * (H - 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
  return (
    <svg width={W} height={H} className="overflow-visible opacity-75 shrink-0">
      <polyline points={pts} fill="none" stroke={positive ? "#10b981" : "#ef4444"}
        strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}


// ── SnapshotTile ──────────────────────────────────────────────────────────────

function SnapshotTile({
  config, ticker, isActive, onClick,
}: {
  config:   typeof SNAPSHOT_CONFIGS[number];
  ticker:   TickerData | null | undefined;
  isActive: boolean;
  onClick:  () => void;
}) {
  const loading = ticker === undefined;
  const error   = ticker === null;
  const up      = ticker ? isUp(ticker) : false;

  return (
    <motion.button
      whileTap={{ scale: 0.97 }}
      onClick={onClick}
      className={cn(
        "bg-surface rounded-xl border p-3.5 shadow-card text-left w-full transition-all duration-200",
        isActive
          ? "border-edge-strong shadow-card-hover"
          : "border-edge hover:border-edge-strong hover:shadow-card-hover",
      )}
      style={{
        borderTopWidth: "3px",
        borderTopColor: config.color,
        ...(isActive ? { boxShadow: `0 0 0 2px ${config.color}30, var(--shadow-card-hover)` } : {}),
      }}
    >
      <p className="text-2xs font-bold uppercase tracking-wider text-ink-muted mb-0.5">{config.sub}</p>
      <p className="text-sm font-bold text-ink">{config.label}</p>

      {loading ? (
        <div className="mt-2 h-10 w-full bg-raised rounded animate-pulse" />
      ) : error ? (
        <div className="mt-2 h-10 flex flex-col justify-end">
          <p className="text-[15px] font-semibold text-ink-muted opacity-30">—</p>
          <p className="text-2xs text-ink-muted opacity-50">offline</p>
        </div>
      ) : (
        <div className="mt-2 flex items-end justify-between gap-2">
          <div className="min-w-0">
            <span className="text-[15px] font-semibold tabular-nums text-ink block">
              {formatPrice(ticker.key, ticker.price)}
            </span>
            <div className={cn(
              "flex items-center gap-0.5 mt-0.5 text-2xs font-semibold tabular-nums",
              up ? "text-emerald-600" : ticker.changePercent !== 0 ? "text-red-500" : "text-ink-muted",
            )}>
              {up ? <TrendingUp size={11} /> :
               ticker.changePercent !== 0 ? <TrendingDown size={11} /> : <Minus size={11} />}
              <span>{formatChange(ticker)}</span>
            </div>
          </div>
          <Sparkline history={ticker.history} positive={up} />
        </div>
      )}
    </motion.button>
  );
}


// ── Section header ─────────────────────────────────────────────────────────────

function SectionHeader({
  label, icon, sub,
}: {
  label: string; icon?: React.ReactNode; sub?: string;
}) {
  return (
    <div className="flex items-center gap-3 mb-4">
      {icon}
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-ink-muted/80">{label}</span>
        {sub && <span className="text-[9.5px] text-ink-muted/40">{sub}</span>}
      </div>
      <span className="h-px flex-1 bg-edge/60" />
    </div>
  );
}


// ── WHAT'S HAPPENING ──────────────────────────────────────────────────────────

function WhatHappeningHeader({
  derivedRegime, brief, marketData, activeKey, onTileClick,
  allSnapshotUnavailable, marketOpen, heartbeatStatus, cacheAge,
}: {
  derivedRegime:          string;
  brief:                  { market_regime: string; primary_driver: string; confidence: number } | undefined;
  marketData:             Record<string, TickerData | null> | undefined;
  activeKey:              SnapshotKey | null;
  onTileClick:            (key: SnapshotKey) => void;
  allSnapshotUnavailable: boolean;
  marketOpen:             boolean;
  heartbeatStatus:        string;
  cacheAge:               number | undefined;
}) {
  const regime    = derivedRegime || brief?.market_regime || "";
  const accentClr = regime ? regimeAccentColor(regime) : "#6366f1";

  return (
    <div
      className="rounded-2xl border mb-6 overflow-hidden"
      style={{ background: "rgba(6,10,22,0.65)", borderColor: `${accentClr}22` }}
    >
      {/* Regime strip */}
      <div className="px-4 pt-4 pb-3 border-b" style={{ borderColor: `${accentClr}15` }}>
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-1.5">
              <span
                className="text-[8px] font-bold uppercase tracking-[0.2em]"
                style={{ color: `${accentClr}70` }}
              >
                Market Regime
              </span>
              {brief?.confidence !== undefined && (
                <span
                  className="text-[8px] font-semibold px-1.5 py-px rounded-full border"
                  style={{ color: accentClr, background: `${accentClr}12`, borderColor: `${accentClr}22` }}
                >
                  {brief.confidence}% confidence
                </span>
              )}
            </div>
            <p className="text-[18px] font-bold leading-tight" style={{ color: accentClr }}>
              {regime || "Analyzing market conditions…"}
            </p>
            {brief?.primary_driver && (
              <p className="text-[11px] mt-1 leading-relaxed line-clamp-2"
                style={{ color: "rgba(255,255,255,0.36)" }}>
                {brief.primary_driver}
              </p>
            )}
          </div>
          <div className="shrink-0 flex items-center gap-1.5 mt-0.5">
            <span className={cn(
              "w-1.5 h-1.5 rounded-full",
              heartbeatStatus === "live"     ? "bg-emerald-400 animate-pulse" :
              heartbeatStatus === "stale"    ? "bg-amber-400" :
              heartbeatStatus === "offline"  ? "bg-red-500" :
                                               "bg-slate-400 animate-pulse",
            )} />
            <span style={{ fontSize: "9px", color: "rgba(255,255,255,0.28)" }}>
              {heartbeatStatus === "live"    ? "Live"   :
               heartbeatStatus === "stale"  ? "Stale"  :
               heartbeatStatus === "offline"? "Offline" : "Loading"}
            </span>
          </div>
        </div>
      </div>

      {/* Asset tiles */}
      <div className="px-4 py-3">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          {SNAPSHOT_CONFIGS.map(cfg => (
            <SnapshotTile
              key={cfg.key}
              config={cfg}
              ticker={marketData ? (marketData[cfg.key] ?? null) : undefined}
              isActive={activeKey === cfg.key}
              onClick={() => onTileClick(cfg.key)}
            />
          ))}
        </div>
        {allSnapshotUnavailable && (
          <div className="flex items-center gap-2 mt-3 px-3 py-2 rounded-lg bg-amber-500/8 border border-amber-500/20">
            <AlertTriangle size={10} className="shrink-0 text-amber-400" />
            <p className="text-[10px] leading-snug" style={{ color: "rgba(255,255,255,0.40)" }}>
              Market prices temporarily unavailable — intelligence sections remain active.
            </p>
          </div>
        )}
        <p className="text-[9px] flex items-center gap-1 mt-2" style={{ color: "rgba(255,255,255,0.18)" }}>
          <AlertCircle size={9} className="shrink-0" />
          {marketOpen ? "Live prices" : "Delayed ~15 min"} · Click a tile to filter themes
          {cacheAge !== undefined && ` · Feed ${formatAge(cacheAge)}`}
        </p>
      </div>
    </div>
  );
}


// ── Biggest Moves ─────────────────────────────────────────────────────────────

function BiggestMoves({
  data, clusters,
}: {
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

  const topExplained = tickers
    .slice(0, 5)
    .map(({ cfg, t }) => ({ cfg, t, explanation: findMoveExplanation(t.key, clusters) }))
    .filter((x): x is typeof x & { explanation: string } => x.explanation !== null);

  return (
    <>
      <div className="grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-9 gap-2">
        {tickers.map(({ cfg, t }, i) => {
          const up = isUp(t);
          return (
            <div key={t.key} className={cn(
              "bg-surface/60 border rounded-lg px-2 py-2 text-center",
              i === 0 ? "border-edge-strong" : "border-edge/60",
            )}>
              <p className="text-2xs font-bold text-ink-muted mb-0.5 truncate">{cfg.label}</p>
              {"isYield" in cfg && cfg.isYield && (
                <p className="text-2xs font-semibold tabular-nums text-ink">{t.price.toFixed(3)}%</p>
              )}
              {"isVix" in cfg && cfg.isVix && (
                <p className="text-2xs font-semibold tabular-nums text-ink">{t.price.toFixed(1)}</p>
              )}
              <p className={cn(
                "tabular-nums",
                i === 0 ? "text-[13px] font-extrabold" : "text-xs font-bold",
                up ? "text-emerald-500" : "text-red-500",
              )}>
                {formatChange(t)}
              </p>
            </div>
          );
        })}
      </div>
      {topExplained.length > 0 && (
        <div className="mt-3 space-y-1.5 border-t border-edge/30 pt-3">
          {topExplained.map(({ cfg, t, explanation }) => {
            const up = isUp(t);
            return (
              <div key={t.key} className="flex items-start gap-2.5 text-2xs">
                <span className={cn(
                  "font-bold tabular-nums shrink-0 w-[7rem]",
                  up ? "text-emerald-500" : "text-red-500",
                )}>
                  {cfg.label} {formatChange(t)}
                </span>
                <span className="leading-relaxed line-clamp-1 flex-1 text-ink-secondary">
                  — {explanation}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}


// ── Lifecycle Journey ─────────────────────────────────────────────────────────

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
              className="w-[7px] h-[7px] rounded-full shrink-0"
              style={{
                background:  isCurrent ? sMeta.color : isPast ? `${sMeta.color}45` : "transparent",
                border:      `${isCurrent ? 2 : 1}px solid ${isCurrent ? sMeta.color : isPast ? `${sMeta.color}55` : "rgba(148,163,184,0.18)"}`,
                transform:   isCurrent ? "scale(1.4)" : "none",
              }}
            />
            {i < LIFECYCLE_STAGES.length - 1 && (
              <div
                className="flex-1 h-px mx-1"
                style={{ background: i < currentIdx ? `${sMeta.color}30` : "rgba(148,163,184,0.10)" }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}


// ── Relationship Panel ────────────────────────────────────────────────────────

function RelationshipPanel({
  theme, upstream, downstream, connected, conflicts,
}: {
  theme:      ThemeIntelligence;
  upstream:   string[];
  downstream: string[];
  connected:  { id: string; name: string; linkType: string; strength: string }[];
  conflicts:  { id: string; description: string; type: string; severity: string; themeIds: string[] }[];
}) {
  const lcStage = computeThemeLifecycleStage(theme);
  return (
    <motion.div
      key="rel-panel"
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.2, ease: "easeInOut" }}
      style={{ overflow: "hidden" }}
    >
      <div className="pt-3 mt-1 border-t border-edge/30 space-y-3.5">

        {/* Lifecycle timeline */}
        <div>
          <p className="text-[7px] font-bold uppercase tracking-widest text-ink-muted/40 mb-2.5">
            Lifecycle — {THEME_LIFECYCLE_META[lcStage].label}
          </p>
          <div className="px-2">
            <LifecycleJourney stage={lcStage} />
          </div>
          <div className="flex justify-between mt-1.5 px-1">
            {LIFECYCLE_STAGES.map(s => (
              <span
                key={s}
                className="text-[6.5px] font-medium"
                style={{
                  color:      s === lcStage ? THEME_LIFECYCLE_META[s].color : "rgba(148,163,184,0.28)",
                  fontWeight: s === lcStage ? 800 : 400,
                }}
              >
                {THEME_LIFECYCLE_META[s].label}
              </span>
            ))}
          </div>
        </div>

        {/* Causal chain */}
        {(upstream.length > 0 || downstream.length > 0) && (
          <div>
            <p className="text-[7px] font-bold uppercase tracking-widest text-ink-muted/40 mb-2">
              Causal Chain
            </p>
            <div className="grid grid-cols-[1fr_auto_1fr] items-start gap-x-2">
              <div className="space-y-1 text-right">
                {upstream.slice(0, 4).map(u => (
                  <div key={u} className="flex items-center justify-end gap-1">
                    <span className="text-[9px] text-ink-muted/60 leading-tight">{cleanMacroLabel(u)}</span>
                    <span className="text-[8px] text-ink-muted/20 shrink-0">→</span>
                  </div>
                ))}
              </div>
              <div className="flex items-start justify-center pt-0.5">
                <div
                  className="px-2 py-1 rounded-lg border text-[8.5px] font-bold text-center leading-tight"
                  style={{
                    borderColor: "var(--color-edge-strong)",
                    color: "var(--color-ink)",
                    background: "var(--color-raised)",
                    maxWidth: 84,
                  }}
                >
                  {theme.name.length > 24 ? theme.name.slice(0, 22) + "…" : theme.name}
                </div>
              </div>
              <div className="space-y-1">
                {downstream.slice(0, 4).map(d => (
                  <div key={d} className="flex items-center gap-1">
                    <span className="text-[8px] text-ink-muted/20 shrink-0">→</span>
                    <span className="text-[9px] text-ink-muted/60 leading-tight line-clamp-1">{d}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Connected themes */}
        {connected.length > 0 && (
          <div>
            <p className="text-[7px] font-bold uppercase tracking-widest text-ink-muted/40 mb-1.5">
              Connected Themes
            </p>
            <div className="flex flex-wrap gap-1">
              {connected.map(c => {
                const linkColor = c.linkType === "shared-story" ? "#38bdf8" :
                                  c.linkType === "shared-asset" ? "#a78bfa" : "#94a3b8";
                return (
                  <span
                    key={c.id}
                    className="text-[9px] px-1.5 py-0.5 rounded"
                    style={{
                      color: linkColor,
                      background: `${linkColor}10`,
                      border: `${c.strength === "strong" ? 1.5 : 1}px solid ${linkColor}28`,
                    }}
                  >
                    {c.name}
                  </span>
                );
              })}
            </div>
          </div>
        )}

        {/* Signal conflicts */}
        {conflicts.length > 0 && (
          <div>
            <p className="text-[7px] font-bold uppercase tracking-widest text-amber-500/50 mb-1.5">
              Signal Conflicts
            </p>
            <div className="space-y-1">
              {conflicts.slice(0, 2).map(c => (
                <div key={c.id} className="flex items-start gap-1.5">
                  <span className="text-[9px] text-amber-500/60 shrink-0 mt-px">⚠</span>
                  <p className="text-[9px] text-ink-muted/60 leading-snug">{c.description}</p>
                </div>
              ))}
            </div>
          </div>
        )}

      </div>
    </motion.div>
  );
}


// ── Theme Card ────────────────────────────────────────────────────────────────

function ThemeCard({
  theme, upstream, downstream, connected, conflicts, isConflict, isFirst,
}: {
  theme:      ThemeIntelligence;
  upstream:   string[];
  downstream: string[];
  connected:  { id: string; name: string; linkType: string; strength: string }[];
  conflicts:  { id: string; description: string; type: string; severity: string; themeIds: string[] }[];
  isConflict: boolean;
  isFirst:    boolean;
}) {
  const [expanded, setExpanded] = useState(isFirst);

  const t          = theme;
  const evState    = computeThemeEvolutionState(t);
  const evMeta     = THEME_EVOLUTION_META[evState];
  const evCls      = EVOLUTION_CLS[evState] ?? "text-slate-400";

  const benefits:  string[] = [];
  const pressures: string[] = [];
  const neutral:   string[] = [];
  for (const ind of (t.related_industries ?? [])) {
    const w = (t.relationship_weights ?? {})[ind];
    if (w?.direction === "positive")      benefits.push(ind);
    else if (w?.direction === "negative") pressures.push(ind);
    else                                  neutral.push(ind);
  }

  const borderColor =
    t.momentum_direction === "bullish" ? "#10b981" :
    t.momentum_direction === "bearish" ? "#ef4444" :
    evState === "accelerating" || evState === "strengthening" || evState === "broadening" ? "#10b981" :
    evState === "reversing"    || evState === "weakening" ? "#ef4444" : "#f59e0b";

  const confScore = t.confidence ?? 0;
  const confColor = confScore >= 75 ? "#10b981" : confScore >= 50 ? "#f59e0b" : "#94a3b8";

  return (
    <div
      className="bg-surface rounded-xl border border-edge overflow-hidden"
      style={{ borderLeft: `3px solid ${borderColor}` }}
    >
      <div className="px-4 pt-3.5 pb-3 space-y-3">

        {/* Status row */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className={cn("text-[9.5px] font-bold uppercase tracking-wide", evCls)}>
            {evMeta.icon} {evMeta.label}
          </span>
          <span className="text-ink-muted/25 text-[8px]">·</span>
          <div className="flex items-center gap-1.5">
            <div className="w-16 h-[2.5px] rounded-full bg-raised overflow-hidden">
              <div className="h-full rounded-full" style={{ width: `${confScore}%`, background: confColor }} />
            </div>
            <span className="text-[9.5px] font-semibold tabular-nums" style={{ color: confColor }}>
              {t.confidence_label || `${confScore}%`}
            </span>
          </div>
          <div className="ml-auto flex items-center gap-1.5">
            {t.evidence_count > 0 && (
              <span className="text-[8.5px] text-ink-muted/40 tabular-nums">
                {t.evidence_count} signals
              </span>
            )}
            {isConflict && (
              <span className="text-[10px] text-amber-400" title="Signal conflicts detected">⚠</span>
            )}
          </div>
        </div>

        {/* Theme name + upstream drivers */}
        <div>
          <h3 className="text-[14px] font-bold text-ink leading-tight tracking-tight">{t.name}</h3>
          {upstream.length > 0 && (
            <div className="flex items-center gap-1 flex-wrap mt-1.5">
              <span className="text-[7.5px] font-bold uppercase tracking-widest text-ink-muted/35 shrink-0">
                Driven by
              </span>
              {upstream.map(u => (
                <span
                  key={u}
                  className="text-[8.5px] text-ink-muted/55 px-1.5 py-px rounded bg-raised border border-edge/50"
                >
                  {cleanMacroLabel(u)}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Causal narrative — primary body text */}
        {(t.causal_narrative || t.description) && (
          <p
            className="text-[11.5px] text-ink leading-relaxed border-l-2 pl-3"
            style={{ borderColor: `${borderColor}35` }}
          >
            {t.causal_narrative || t.description}
          </p>
        )}

        {/* Benefits / Pressures */}
        {(benefits.length > 0 || pressures.length > 0 || neutral.length > 0) && (
          <div className="grid grid-cols-2 gap-x-4 gap-y-0 pt-0.5">
            {(benefits.length > 0 || neutral.length > 0) && (
              <div>
                <p className="text-[7.5px] font-bold uppercase tracking-widest text-emerald-500/55 mb-1.5">
                  ↑ Benefits
                </p>
                <div className="space-y-1">
                  {[...benefits, ...neutral].slice(0, 4).map(ind => (
                    <div key={ind} className="flex items-center gap-1.5">
                      <span
                        className="w-1 h-1 rounded-full shrink-0"
                        style={{ background: benefits.includes(ind) ? "#10b981" : "#64748b" }}
                      />
                      <span className="text-[10px] text-ink-secondary leading-tight">{ind}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {pressures.length > 0 && (
              <div>
                <p className="text-[7.5px] font-bold uppercase tracking-widest text-red-400/55 mb-1.5">
                  ↓ Pressures
                </p>
                <div className="space-y-1">
                  {pressures.slice(0, 4).map(ind => (
                    <div key={ind} className="flex items-center gap-1.5">
                      <span className="w-1 h-1 rounded-full shrink-0 bg-red-400" />
                      <span className="text-[10px] text-ink-secondary leading-tight">{ind}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Watch signal */}
        {t.second_order_effects[0] && (
          <div
            className="flex items-start gap-2 rounded-lg px-2.5 py-2"
            style={{ background: "rgba(248,190,65,0.05)", border: "1px solid rgba(248,190,65,0.10)" }}
          >
            <span className="text-[8px] font-bold text-amber-400/60 shrink-0 mt-px tracking-wide">WATCH</span>
            <p className="text-[10.5px] text-ink-muted/65 leading-snug flex-1">
              {t.second_order_effects[0]}
            </p>
          </div>
        )}

        {/* Related themes */}
        {connected.length > 0 && (
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[7.5px] font-bold uppercase tracking-widest text-ink-muted/35 shrink-0">
              Related
            </span>
            {connected.map(c => (
              <span
                key={c.id}
                className="text-[9px] px-1.5 py-px rounded border"
                style={{
                  color:       c.strength === "strong" ? "#38bdf8" : "#64748b",
                  background:  c.strength === "strong" ? "rgba(56,189,248,0.06)" : "var(--color-raised)",
                  borderColor: c.strength === "strong" ? "rgba(56,189,248,0.18)" : "var(--color-edge)",
                }}
              >
                {c.name}
              </span>
            ))}
          </div>
        )}

        {/* Expand toggle */}
        <button
          onClick={() => setExpanded(p => !p)}
          className="flex items-center gap-1 w-full pt-1.5 border-t border-edge/30
                     text-[8.5px] text-ink-muted/35 hover:text-ink-muted/60 transition-colors"
        >
          {expanded
            ? <><ChevronUp size={9} className="shrink-0" /> Hide causal chain &amp; lifecycle</>
            : <><ChevronDown size={9} className="shrink-0" /> Causal chain &amp; lifecycle</>}
        </button>

        <AnimatePresence>
          {expanded && (
            <RelationshipPanel
              theme={t}
              upstream={upstream}
              downstream={downstream}
              connected={connected}
              conflicts={conflicts}
            />
          )}
        </AnimatePresence>

      </div>
    </div>
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
  const visible = themes.filter(
    t => t.signal_strength === "strong" || t.signal_strength === "medium",
  );

  const relMap = useMemo(() => buildThemeRelationshipMap(visible), [visible]);
  const contradictions = useMemo(
    () => detectContradictions(visible, sectorData, riskRegime, volRegime),
    [visible, sectorData, riskRegime, volRegime],
  );
  const conflictedIds = useMemo(() => getConflictedThemeIds(contradictions), [contradictions]);

  if (visible.length === 0) return (
    <div className="mb-6">
      <SectionHeader
        label="What's Driving It"
        icon={<Network size={13} className="text-accent shrink-0" />}
      />
      <p className="text-[11px] text-ink-muted italic">Theme analysis warming up…</p>
    </div>
  );

  return (
    <div className="mb-6">
      <SectionHeader
        label="What's Driving It"
        icon={<Network size={13} className="text-accent shrink-0" />}
        sub={`${visible.length} active theme${visible.length !== 1 ? "s" : ""}`}
      />
      <div className="space-y-3">
        {visible.map((t, i) => {
          const rel = relMap.get(t.id);
          return (
            <ThemeCard
              key={t.id}
              theme={t}
              upstream={rel?.upstream.slice(0, 4) ?? []}
              downstream={rel?.downstream.slice(0, 4) ?? []}
              connected={rel?.connected.slice(0, 3) ?? []}
              conflicts={contradictions.filter(c => c.themeIds.includes(t.id))}
              isConflict={conflictedIds.has(t.id)}
              isFirst={i === 0}
            />
          );
        })}
      </div>
    </div>
  );
}


// ── WHERE IT MATTERS ──────────────────────────────────────────────────────────

function WhereMattersList({
  themes, sectorData,
}: {
  themes:     ThemeIntelligence[];
  sectorData: SectorData | null;
}) {
  const snapshot = useMemo(
    () => computeBreadthSnapshot(themes, sectorData),
    [themes, sectorData],
  );

  if (snapshot.length === 0) return null;

  const leaders  = snapshot.filter(s => s.direction === "positive").slice(0, 5);
  const laggards = snapshot.filter(s => s.direction === "negative").slice(0, 5);
  const mixed    = snapshot.filter(s => s.direction === "mixed").slice(0, 4);
  const maxScore = snapshot[0]?.signalScore ?? 100;
  const confirming = snapshot.filter(
    s => s.direction === "positive" || s.direction === "mixed",
  ).length;

  return (
    <div className="mb-6">
      <SectionHeader
        label="Where It Matters"
        icon={<BarChart2 size={13} className="text-accent shrink-0" />}
        sub={`${confirming} of ${snapshot.length} sectors confirming`}
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        {leaders.length > 0 && (
          <div>
            <p className="text-[8px] font-bold uppercase tracking-widest text-emerald-500/55 mb-2.5">
              ↑ Sector Leaders
            </p>
            <div className="space-y-2.5">
              {leaders.map(s => {
                const pct = maxScore > 0 ? (s.signalScore / maxScore) * 100 : 0;
                return (
                  <div key={s.sector} className="flex items-center gap-2.5">
                    <span className="text-[10px] text-ink-secondary w-28 shrink-0 truncate">{s.sector}</span>
                    <div className="flex-1 h-[3px] rounded-full bg-raised overflow-hidden max-w-[80px]">
                      <div className="h-full rounded-full" style={{ width: `${pct}%`, background: "#10b981" }} />
                    </div>
                    {s.themeCount > 0 && (
                      <span className="text-[8px] font-bold text-emerald-500/50 shrink-0 w-5 tabular-nums">
                        ×{s.themeCount}
                      </span>
                    )}
                    {s.dominantTheme && (
                      <span className="text-[8.5px] text-emerald-500/35 truncate min-w-0 flex-1 hidden sm:block">
                        {s.dominantTheme}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {laggards.length > 0 && (
          <div>
            <p className="text-[8px] font-bold uppercase tracking-widest text-red-400/55 mb-2.5">
              ↓ Under Pressure
            </p>
            <div className="space-y-2.5">
              {laggards.map(s => {
                const pct = maxScore > 0 ? (s.signalScore / maxScore) * 100 : 0;
                return (
                  <div key={s.sector} className="flex items-center gap-2.5">
                    <span className="text-[10px] text-ink-secondary w-28 shrink-0 truncate">{s.sector}</span>
                    <div className="flex-1 h-[3px] rounded-full bg-raised overflow-hidden max-w-[80px]">
                      <div className="h-full rounded-full" style={{ width: `${pct}%`, background: "#ef4444" }} />
                    </div>
                    {s.themeCount > 0 && (
                      <span className="text-[8px] font-bold text-red-400/50 shrink-0 w-5 tabular-nums">
                        ×{s.themeCount}
                      </span>
                    )}
                    {s.dominantTheme && (
                      <span className="text-[8.5px] text-red-400/35 truncate min-w-0 flex-1 hidden sm:block">
                        {s.dominantTheme}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {mixed.length > 0 && (
        <div className="mt-3 pt-3 border-t border-edge/40">
          <p className="text-[8px] font-bold uppercase tracking-widest text-amber-400/55 mb-2">
            ~ Mixed / Conflicting
          </p>
          <div className="flex flex-wrap gap-x-4 gap-y-1.5">
            {mixed.map(s => (
              <div key={s.sector} className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400/45 shrink-0" />
                <span className="text-[9.5px] text-ink-muted">{s.sector}</span>
                {s.dominantTheme && (
                  <span className="text-[8.5px] text-ink-muted/35">— {s.dominantTheme}</span>
                )}
              </div>
            ))}
          </div>
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

  const clusters      = data?.clusters           ?? [];
  const themes        = data?.theme_intelligence ?? [];
  const cacheAge      = data?.cache_age_seconds;
  const derivedRegime = data?.sector_data?.derived_regime ?? "";

  const allSnapshotUnavailable =
    marketData !== undefined &&
    SNAPSHOT_CONFIGS.every(cfg => marketData[cfg.key] === null);

  const activeCfg = SNAPSHOT_CONFIGS.find(c => c.key === activeKey) ?? null;

  const visibleClusters = useMemo(() => {
    if (activeCfg) {
      const filtered = clusters.filter(c =>
        clusterMatchesFilter(c, [...activeCfg.filterKw]),
      );
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
        clusterRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 60);
    }
  }

  return (
    <>
      {/* Argus identity header */}
      <div style={{ background: "rgba(6,10,22,0.97)", borderBottom: "1px solid rgba(255,255,255,0.07)", marginBottom: "24px" }}>
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4 flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5 mb-1">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/argus-icon.png" alt="" style={{ width: 16, height: 16, borderRadius: 3, opacity: 0.85 }} />
              <span style={{ fontSize: "8.5px", letterSpacing: "0.18em", fontWeight: 700, color: "rgba(255,255,255,0.28)" }}>
                ARGUS
              </span>
              <div style={{ width: 1, height: 10, background: "rgba(255,255,255,0.10)" }} />
              <h1 style={{ fontSize: "14px", fontWeight: 600, color: "rgba(255,255,255,0.90)", letterSpacing: "0.02em" }}>
                Markets
              </h1>
            </div>
            <p style={{ fontSize: "11px", color: "rgba(255,255,255,0.36)", letterSpacing: "0.02em" }}>
              Market intelligence · Themes · Sector analysis
            </p>
          </div>
          {marketMeta?.fetchedAt && heartbeatStatus !== "loading" && (
            <div className="flex items-center gap-1.5 shrink-0 self-center">
              <span className={cn(
                "w-1.5 h-1.5 rounded-full",
                heartbeatStatus === "live"  ? "bg-emerald-400 animate-pulse" :
                heartbeatStatus === "stale" ? "bg-amber-400" : "bg-red-500",
              )} />
              <span style={{ fontSize: "9px", color: "rgba(255,255,255,0.28)" }}>
                {formatAge(Math.floor((Date.now() - new Date(marketMeta.fetchedAt).getTime()) / 1000))}
              </span>
            </div>
          )}
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 pb-8">

        {/* ── WHAT'S HAPPENING ────────────────────────────────── */}
        <SectionHeader label="What's Happening" />
        <WhatHappeningHeader
          derivedRegime={derivedRegime}
          brief={data?.market_brief ?? undefined}
          marketData={marketData}
          activeKey={activeKey}
          onTileClick={handleTileClick}
          allSnapshotUnavailable={allSnapshotUnavailable}
          marketOpen={marketOpen}
          heartbeatStatus={heartbeatStatus}
          cacheAge={cacheAge}
        />

        <div className="mb-6">
          <SectionHeader
            label="Biggest Moves"
            icon={<Zap size={13} className="text-accent shrink-0" />}
          />
          <BiggestMoves data={marketData} clusters={clusters} />
        </div>

        {/* ── WHAT'S DRIVING IT ────────────────────────────────── */}
        <IntelligenceThemes
          themes={themes}
          sectorData={data?.sector_data ?? null}
          riskRegime={riskRegime}
          volRegime={volRegime}
        />

        {/* ── WHERE IT MATTERS ─────────────────────────────────── */}
        <WhereMattersList
          themes={themes}
          sectorData={data?.sector_data ?? null}
        />

        {/* ── SUPPORTING EVIDENCE ──────────────────────────────── */}
        <div ref={clusterRef}>
          <div className="flex items-center gap-3 mb-4">
            <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-ink-muted/80">
              Supporting Evidence
            </span>
            {!isLoading && clusters.length > 0 && (
              <span className="text-2xs font-medium text-ink-secondary bg-raised px-2 py-0.5 rounded-full">
                {visibleClusters.length}{activeCfg ? ` of ${clusters.length}` : ""}
              </span>
            )}
            <AnimatePresence>
              {activeCfg && (
                <motion.button
                  key="filter-pill"
                  initial={{ opacity: 0, scale: 0.85 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.85 }}
                  onClick={() => setActiveKey(null)}
                  className="flex items-center gap-1 text-2xs font-semibold px-2 py-0.5 rounded-full
                             bg-accent/10 text-accent hover:bg-accent/20 transition-colors"
                >
                  {activeCfg.label}
                  <X size={9} />
                </motion.button>
              )}
            </AnimatePresence>
            <span className="h-px flex-1 bg-edge/60" />
          </div>
          <div className="mb-6">
            <ClusterStream
              clusters={visibleClusters}
              savedIds={savedIds}
              onSave={(item) => toggleSave(item)}
              isLoading={isLoading}
            />
          </div>
        </div>

      </div>
    </>
  );
}
