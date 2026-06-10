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

// Known AI-generated internal theme names → public-facing labels
const THEME_NAME_OVERRIDES: Record<string, string> = {
  "Non-Bank Lending Ascendancy":       "Private Credit",
  "Grid Bottleneck Trade":             "Power Infrastructure",
  "Higher-for-Longer Repricing":       "Interest Rates",
  "Silicon Sovereignty Capex":         "Semiconductor Capex",
  "Deglobalization Capex Cycle":       "Reshoring & Capex",
  "Fiscal Dominance Repricing":        "Fiscal Policy Impact",
  "AI Infrastructure Build-out":       "AI Infrastructure",
  "Credit Cycle Ascendancy":           "Credit Cycle",
  "Energy Transition Capex":           "Energy Transition",
  "Defense Spending Ascendancy":       "Defense Spending",
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


// ── Helpers ───────────────────────────────────────────────────────────────────

function formatPrice(key: string, price: number): string {
  if (key === "TNX") return price.toFixed(3) + "%";
  if (key === "BTC-USD") return "$" + price.toLocaleString("en-US", { maximumFractionDigits: 0 });
  if (key === "VIX") return price.toFixed(2);
  if (key === "BZ=F" || key === "GC=F") return "$" + price.toFixed(2);
  return price.toFixed(2);
}

function formatChange(ticker: TickerData): string {
  if (ticker.key === "TNX")
    return `${ticker.change >= 0 ? "+" : ""}${ticker.change.toFixed(3)}%`;
  if (ticker.key === "VIX")
    return `${ticker.change >= 0 ? "+" : ""}${ticker.change.toFixed(2)} pts`;
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

// Translate AI-generated internal theme names to public-facing labels
function cleanThemeName(raw: string): string {
  if (THEME_NAME_OVERRIDES[raw]) return THEME_NAME_OVERRIDES[raw];
  // Generic word cleanup for common internal jargon
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


// ── Sparkline ─────────────────────────────────────────────────────────────────

function Sparkline({ history, positive }: { history: number[]; positive: boolean }) {
  if (history.length < 3) return <div className="w-[50px] h-[18px]" />;
  const min = Math.min(...history);
  const max = Math.max(...history);
  const span = max - min || 0.001;
  const W = 50, H = 18;
  const pts = history.map((v, i) => {
    const x = (i / (history.length - 1)) * W;
    const y = H - 1 - ((v - min) / span) * (H - 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
  return (
    <svg width={W} height={H} className="overflow-visible opacity-60 shrink-0">
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
        "bg-surface rounded-lg border text-left w-full transition-all duration-150",
        error ? "px-2.5 py-2" : "p-3 shadow-card",
        isActive
          ? "border-edge-strong shadow-card-hover"
          : "border-edge hover:border-edge-strong",
      )}
      style={{
        borderTopWidth: error ? "1px" : "2px",
        borderTopColor: error ? "var(--color-edge)" : config.color,
        ...(isActive && !error ? { boxShadow: `0 0 0 2px ${config.color}25` } : {}),
      }}
    >
      {error ? (
        // Compact offline state — just the label
        <div className="flex items-center justify-between gap-2">
          <p className="text-[10px] font-semibold text-ink-muted/50">{config.label}</p>
          <p className="text-[9px] text-ink-muted/25">—</p>
        </div>
      ) : (
        <>
          <p className="text-[9px] font-bold uppercase tracking-wider text-ink-muted mb-0.5">{config.sub}</p>
          <p className="text-[11px] font-bold text-ink">{config.label}</p>
          {loading ? (
            <div className="mt-1.5 h-7 w-full bg-raised rounded animate-pulse" />
          ) : (
            <div className="mt-1.5 flex items-end justify-between gap-1.5">
              <div className="min-w-0">
                <span className="text-[14px] font-semibold tabular-nums text-ink block">
                  {formatPrice(ticker.key, ticker.price)}
                </span>
                <div className={cn(
                  "flex items-center gap-0.5 text-[10px] font-semibold tabular-nums",
                  up ? "text-emerald-600" : ticker.changePercent !== 0 ? "text-red-500" : "text-ink-muted",
                )}>
                  {up ? <TrendingUp size={10} /> :
                   ticker.changePercent !== 0 ? <TrendingDown size={10} /> : <Minus size={10} />}
                  <span>{formatChange(ticker)}</span>
                </div>
              </div>
              <Sparkline history={ticker.history} positive={up} />
            </div>
          )}
        </>
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
    <div className="flex items-center gap-2.5 mb-3">
      {icon}
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-[9.5px] font-bold uppercase tracking-[0.18em] text-ink-muted/70">{label}</span>
        {sub && <span className="text-[9px] text-ink-muted/35">{sub}</span>}
      </div>
      <span className="h-px flex-1 bg-edge/70" />
    </div>
  );
}


// ── Regime Strip ──────────────────────────────────────────────────────────────
// Full-opacity dark band: matches the Argus header aesthetic exactly

function RegimeStrip({
  regime, brief, heartbeatStatus,
}: {
  regime:          string;
  brief:           { market_regime: string; primary_driver: string; confidence: number } | undefined;
  heartbeatStatus: string;
}) {
  const label     = regime || brief?.market_regime || "";
  if (!label) return null;
  const accentClr = regimeAccentColor(label);

  return (
    <div
      className="rounded-xl mb-3 px-4 py-3 flex items-start justify-between gap-4"
      style={{
        background:   "rgba(6,10,22,0.94)",
        border:       `1px solid ${accentClr}18`,
        boxShadow:    `0 0 0 1px rgba(255,255,255,0.04) inset`,
      }}
    >
      <div className="min-w-0 flex-1">
        <p
          className="text-[7.5px] font-bold uppercase tracking-[0.2em] mb-1"
          style={{ color: `${accentClr}55` }}
        >
          Market Regime
        </p>
        <p className="text-[15px] font-bold leading-tight" style={{ color: accentClr }}>
          {label}
        </p>
        {brief?.primary_driver && (
          <p
            className="text-[10.5px] mt-1 leading-relaxed line-clamp-2"
            style={{ color: "rgba(255,255,255,0.36)" }}
          >
            {brief.primary_driver}
          </p>
        )}
      </div>
      <div className="shrink-0 flex flex-col items-end gap-1.5">
        {brief?.confidence !== undefined && (
          <span
            className="text-[8px] font-bold tabular-nums px-1.5 py-px rounded"
            style={{ color: accentClr, background: `${accentClr}14` }}
          >
            {brief.confidence}% conf.
          </span>
        )}
        <div className="flex items-center gap-1">
          <span className={cn(
            "w-1.5 h-1.5 rounded-full shrink-0",
            heartbeatStatus === "live"    ? "bg-emerald-400 animate-pulse" :
            heartbeatStatus === "stale"   ? "bg-amber-400" :
            heartbeatStatus === "offline" ? "bg-red-500" :
                                            "bg-slate-500",
          )} />
          <span style={{ fontSize: "8px", color: "rgba(255,255,255,0.22)" }}>
            {heartbeatStatus === "live"    ? "Live"    :
             heartbeatStatus === "stale"   ? "Stale"   :
             heartbeatStatus === "offline" ? "Offline" : "—"}
          </span>
        </div>
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
      <div className="grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-9 gap-1.5">
        {tickers.map(({ cfg, t }, i) => {
          const up = isUp(t);
          return (
            <div key={t.key} className={cn(
              "bg-surface border rounded-lg px-2 py-1.5 text-center",
              i === 0 ? "border-edge-strong shadow-card" : "border-edge",
            )}>
              <p className="text-[9px] font-bold text-ink-muted mb-0.5 truncate">{cfg.label}</p>
              {"isYield" in cfg && cfg.isYield && (
                <p className="text-[9px] font-semibold tabular-nums text-ink">{t.price.toFixed(3)}%</p>
              )}
              {"isVix" in cfg && cfg.isVix && (
                <p className="text-[9px] font-semibold tabular-nums text-ink">{t.price.toFixed(1)}</p>
              )}
              <p className={cn(
                "tabular-nums font-bold",
                i === 0 ? "text-[12px]" : "text-[10.5px]",
                up ? "text-emerald-600" : "text-red-500",
              )}>
                {formatChange(t)}
              </p>
            </div>
          );
        })}
      </div>
      {topExplained.length > 0 && (
        <div className="mt-2.5 space-y-1 border-t border-edge/40 pt-2.5">
          {topExplained.map(({ cfg, t, explanation }) => (
            <div key={t.key} className="flex items-start gap-2 text-2xs">
              <span className={cn(
                "font-bold tabular-nums shrink-0 w-[6.5rem]",
                isUp(t) ? "text-emerald-600" : "text-red-500",
              )}>
                {cfg.label} {formatChange(t)}
              </span>
              <span className="leading-relaxed line-clamp-1 flex-1 text-ink-secondary">
                — {explanation}
              </span>
            </div>
          ))}
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
              className="w-[6px] h-[6px] rounded-full shrink-0"
              style={{
                background: isCurrent ? sMeta.color : isPast ? `${sMeta.color}40` : "transparent",
                border:     `${isCurrent ? 2 : 1}px solid ${isCurrent ? sMeta.color : isPast ? `${sMeta.color}50` : "rgba(148,163,184,0.15)"}`,
                transform:  isCurrent ? "scale(1.3)" : "none",
              }}
            />
            {i < LIFECYCLE_STAGES.length - 1 && (
              <div
                className="flex-1 h-px mx-1"
                style={{ background: i < currentIdx ? `${sMeta.color}28` : "rgba(148,163,184,0.08)" }}
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
  const lcStage    = computeThemeLifecycleStage(theme);
  const publicName = cleanThemeName(theme.name);

  return (
    <motion.div
      key="rel-panel"
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.18, ease: "easeInOut" }}
      style={{ overflow: "hidden" }}
    >
      <div className="pt-2.5 mt-1 border-t border-edge/25 space-y-3">

        {/* Lifecycle */}
        <div>
          <p className="text-[7px] font-bold uppercase tracking-widest text-ink-muted/35 mb-2">
            Lifecycle — {THEME_LIFECYCLE_META[lcStage].label}
          </p>
          <div className="px-1.5">
            <LifecycleJourney stage={lcStage} />
          </div>
          <div className="flex justify-between mt-1 px-0.5">
            {LIFECYCLE_STAGES.map(s => (
              <span
                key={s}
                className="text-[6px] font-medium"
                style={{
                  color:      s === lcStage ? THEME_LIFECYCLE_META[s].color : "rgba(148,163,184,0.25)",
                  fontWeight: s === lcStage ? 800 : 400,
                }}
              >
                {THEME_LIFECYCLE_META[s].label}
              </span>
            ))}
          </div>
        </div>

        {/* Causal chain — translated names */}
        {(upstream.length > 0 || downstream.length > 0) && (
          <div>
            <p className="text-[7px] font-bold uppercase tracking-widest text-ink-muted/35 mb-1.5">
              Factor Chain
            </p>
            <div className="grid grid-cols-[1fr_auto_1fr] items-start gap-x-2">
              <div className="space-y-0.5 text-right">
                {upstream.slice(0, 4).map(u => (
                  <div key={u} className="flex items-center justify-end gap-1">
                    <span className="text-[8.5px] text-ink-muted/55 leading-tight">{cleanMacroLabel(u)}</span>
                    <span className="text-[7px] text-ink-muted/18 shrink-0">→</span>
                  </div>
                ))}
              </div>
              <div className="flex items-start justify-center pt-px">
                <div
                  className="px-2 py-1 rounded border text-[7.5px] font-bold text-center leading-tight"
                  style={{
                    borderColor: "var(--color-edge)",
                    color:       "var(--color-ink)",
                    background:  "var(--color-raised)",
                    maxWidth:    80,
                  }}
                >
                  {publicName.length > 20 ? publicName.slice(0, 18) + "…" : publicName}
                </div>
              </div>
              <div className="space-y-0.5">
                {downstream.slice(0, 4).map(d => (
                  <div key={d} className="flex items-center gap-1">
                    <span className="text-[7px] text-ink-muted/18 shrink-0">→</span>
                    <span className="text-[8.5px] text-ink-muted/55 leading-tight line-clamp-1">{d}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Connected themes — translated names */}
        {connected.length > 0 && (
          <div>
            <p className="text-[7px] font-bold uppercase tracking-widest text-ink-muted/35 mb-1">
              Connected Themes
            </p>
            <div className="flex flex-wrap gap-1">
              {connected.map(c => {
                const linkColor = c.linkType === "shared-story" ? "#38bdf8" :
                                  c.linkType === "shared-asset" ? "#a78bfa" : "#94a3b8";
                return (
                  <span
                    key={c.id}
                    className="text-[8.5px] px-1.5 py-px rounded"
                    style={{
                      color:      linkColor,
                      background: `${linkColor}10`,
                      border:     `1px solid ${linkColor}24`,
                    }}
                  >
                    {cleanThemeName(c.name)}
                  </span>
                );
              })}
            </div>
          </div>
        )}

        {/* Signal conflicts */}
        {conflicts.length > 0 && (
          <div>
            <p className="text-[7px] font-bold uppercase tracking-widest text-amber-500/45 mb-1">
              Signal Conflicts
            </p>
            <div className="space-y-0.5">
              {conflicts.slice(0, 2).map(c => (
                <div key={c.id} className="flex items-start gap-1.5">
                  <span className="text-[8.5px] text-amber-500/55 shrink-0">⚠</span>
                  <p className="text-[8.5px] text-ink-muted/55 leading-snug">{c.description}</p>
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
  const publicName = cleanThemeName(t.name);

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
      <div className="px-3 pt-2.5 pb-2.5 space-y-2">

        {/* Status row */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className={cn("text-[9px] font-bold uppercase tracking-wide", evCls)}>
            {evMeta.icon} {evMeta.label}
          </span>
          <span className="text-ink-muted/20 text-[8px]">·</span>
          <div className="flex items-center gap-1.5">
            <div className="w-12 h-[2px] rounded-full bg-raised overflow-hidden">
              <div className="h-full rounded-full" style={{ width: `${confScore}%`, background: confColor }} />
            </div>
            <span className="text-[9px] font-semibold tabular-nums" style={{ color: confColor }}>
              {t.confidence_label || `${confScore}%`}
            </span>
          </div>
          <div className="ml-auto flex items-center gap-1.5">
            {t.evidence_count > 0 && (
              <span className="text-[8px] text-ink-muted/35 tabular-nums">
                {t.evidence_count} signals
              </span>
            )}
            {isConflict && (
              <span className="text-amber-400 text-[9px]" title="Signal conflicts">⚠</span>
            )}
          </div>
        </div>

        {/* Public theme name + upstream drivers */}
        <div>
          <h3 className="text-[13px] font-bold text-ink leading-tight tracking-tight">
            {publicName}
          </h3>
          {upstream.length > 0 && (
            <div className="flex items-center gap-1 flex-wrap mt-1">
              <span className="text-[7px] font-bold uppercase tracking-widest text-ink-muted/30 shrink-0">
                via
              </span>
              {upstream.map(u => (
                <span
                  key={u}
                  className="text-[8px] text-ink-muted/50 px-1 py-px rounded bg-raised border border-edge/60"
                >
                  {cleanMacroLabel(u)}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Causal narrative */}
        {(t.causal_narrative || t.description) && (
          <p
            className="text-[11px] text-ink-secondary leading-relaxed border-l-2 pl-2.5"
            style={{ borderColor: `${borderColor}30` }}
          >
            {t.causal_narrative || t.description}
          </p>
        )}

        {/* Benefits / Pressures */}
        {(benefits.length > 0 || pressures.length > 0 || neutral.length > 0) && (
          <div className="grid grid-cols-2 gap-x-3 pt-0.5">
            {(benefits.length > 0 || neutral.length > 0) && (
              <div>
                <p className="text-[7px] font-bold uppercase tracking-widest text-emerald-600/50 mb-1">
                  ↑ Benefits
                </p>
                <div className="space-y-0.5">
                  {[...benefits, ...neutral].slice(0, 4).map(ind => (
                    <div key={ind} className="flex items-center gap-1.5">
                      <span
                        className="w-[5px] h-[5px] rounded-full shrink-0"
                        style={{ background: benefits.includes(ind) ? "#10b981" : "#94a3b8" }}
                      />
                      <span className="text-[9.5px] text-ink-secondary leading-tight">{ind}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {pressures.length > 0 && (
              <div>
                <p className="text-[7px] font-bold uppercase tracking-widest text-red-500/50 mb-1">
                  ↓ Pressures
                </p>
                <div className="space-y-0.5">
                  {pressures.slice(0, 4).map(ind => (
                    <div key={ind} className="flex items-center gap-1.5">
                      <span className="w-[5px] h-[5px] rounded-full shrink-0 bg-red-400" />
                      <span className="text-[9.5px] text-ink-secondary leading-tight">{ind}</span>
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
            className="flex items-start gap-1.5 rounded px-2 py-1.5"
            style={{ background: "rgba(251,191,36,0.05)", border: "1px solid rgba(251,191,36,0.10)" }}
          >
            <span className="text-[7.5px] font-bold text-amber-500/55 shrink-0 mt-px tracking-wide">WATCH</span>
            <p className="text-[10px] text-ink-muted/60 leading-snug flex-1">
              {t.second_order_effects[0]}
            </p>
          </div>
        )}

        {/* Related themes */}
        {connected.length > 0 && (
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[7px] font-bold uppercase tracking-widest text-ink-muted/30 shrink-0">
              Related
            </span>
            {connected.map(c => (
              <span
                key={c.id}
                className="text-[8.5px] px-1.5 py-px rounded border"
                style={{
                  color:       c.strength === "strong" ? "#38bdf8" : "#64748b",
                  background:  c.strength === "strong" ? "rgba(56,189,248,0.05)" : "var(--color-raised)",
                  borderColor: c.strength === "strong" ? "rgba(56,189,248,0.15)" : "var(--color-edge)",
                }}
              >
                {cleanThemeName(c.name)}
              </span>
            ))}
          </div>
        )}

        {/* Expand toggle */}
        <button
          onClick={() => setExpanded(p => !p)}
          className="flex items-center gap-1 w-full pt-1.5 border-t border-edge/25
                     text-[8px] text-ink-muted/30 hover:text-ink-muted/55 transition-colors"
        >
          {expanded
            ? <><ChevronUp size={8} className="shrink-0" /> Hide factor chain &amp; lifecycle</>
            : <><ChevronDown size={8} className="shrink-0" /> Factor chain &amp; lifecycle</>}
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

  const relMap         = useMemo(() => buildThemeRelationshipMap(visible), [visible]);
  const contradictions = useMemo(
    () => detectContradictions(visible, sectorData, riskRegime, volRegime),
    [visible, sectorData, riskRegime, volRegime],
  );
  const conflictedIds = useMemo(() => getConflictedThemeIds(contradictions), [contradictions]);

  if (visible.length === 0) return (
    <div className="mb-4">
      <SectionHeader label="What's Driving It" icon={<Network size={12} className="text-accent shrink-0" />} />
      <p className="text-[11px] text-ink-muted italic">Theme analysis warming up…</p>
    </div>
  );

  return (
    <div className="mb-4">
      <SectionHeader
        label="What's Driving It"
        icon={<Network size={12} className="text-accent shrink-0" />}
        sub={`${visible.length} active theme${visible.length !== 1 ? "s" : ""}`}
      />
      <div className="space-y-2">
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

  const leaders    = snapshot.filter(s => s.direction === "positive").slice(0, 5);
  const laggards   = snapshot.filter(s => s.direction === "negative").slice(0, 5);
  const mixed      = snapshot.filter(s => s.direction === "mixed").slice(0, 4);
  const maxScore   = snapshot[0]?.signalScore ?? 100;
  const confirming = snapshot.filter(s => s.direction === "positive" || s.direction === "mixed").length;

  function SectorRow({
    sector, signalScore, themeCount, dominantTheme, barColor,
  }: {
    sector: string; signalScore: number; themeCount: number;
    dominantTheme?: string; barColor: string;
  }) {
    const pct = maxScore > 0 ? (signalScore / maxScore) * 100 : 0;
    return (
      <div className="flex items-center gap-2">
        <span className="text-[9.5px] text-ink-secondary w-24 shrink-0 truncate">{sector}</span>
        <div className="w-16 h-[2.5px] rounded-full bg-raised overflow-hidden shrink-0">
          <div className="h-full rounded-full" style={{ width: `${pct}%`, background: barColor }} />
        </div>
        {themeCount > 0 && (
          <span className="text-[7.5px] font-bold shrink-0 tabular-nums" style={{ color: `${barColor}70` }}>
            ×{themeCount}
          </span>
        )}
        {dominantTheme && (
          <span className="text-[8px] truncate min-w-0 flex-1 hidden sm:block" style={{ color: `${barColor}40` }}>
            {dominantTheme}
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="mb-4">
      <SectionHeader
        label="Where It Matters"
        icon={<BarChart2 size={12} className="text-accent shrink-0" />}
        sub={`${confirming} of ${snapshot.length} sectors confirming`}
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {leaders.length > 0 && (
          <div>
            <p className="text-[7.5px] font-bold uppercase tracking-widest text-emerald-600/50 mb-2">
              ↑ Sector Leaders
            </p>
            <div className="space-y-2">
              {leaders.map(s => (
                <SectorRow key={s.sector} sector={s.sector} signalScore={s.signalScore}
                  themeCount={s.themeCount} dominantTheme={s.dominantTheme ?? undefined} barColor="#10b981" />
              ))}
            </div>
          </div>
        )}
        {laggards.length > 0 && (
          <div>
            <p className="text-[7.5px] font-bold uppercase tracking-widest text-red-500/50 mb-2">
              ↓ Under Pressure
            </p>
            <div className="space-y-2">
              {laggards.map(s => (
                <SectorRow key={s.sector} sector={s.sector} signalScore={s.signalScore}
                  themeCount={s.themeCount} dominantTheme={s.dominantTheme ?? undefined} barColor="#ef4444" />
              ))}
            </div>
          </div>
        )}
      </div>

      {mixed.length > 0 && (
        <div className="mt-3 pt-2.5 border-t border-edge/40">
          <p className="text-[7.5px] font-bold uppercase tracking-widest text-amber-500/50 mb-1.5">
            ~ Mixed / Conflicting
          </p>
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {mixed.map(s => (
              <div key={s.sector} className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400/40 shrink-0" />
                <span className="text-[9px] text-ink-muted">{s.sector}</span>
                {s.dominantTheme && (
                  <span className="text-[8px] text-ink-muted/30">— {s.dominantTheme}</span>
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

  const anyLive = marketData !== undefined &&
    SNAPSHOT_CONFIGS.some(cfg => marketData[cfg.key] !== null);

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
      <div style={{ background: "rgba(6,10,22,0.97)", borderBottom: "1px solid rgba(255,255,255,0.07)", marginBottom: "20px" }}>
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-3.5 flex items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5 mb-0.5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/argus-icon.png" alt="" style={{ width: 15, height: 15, borderRadius: 3, opacity: 0.85 }} />
              <span style={{ fontSize: "8px", letterSpacing: "0.18em", fontWeight: 700, color: "rgba(255,255,255,0.25)" }}>
                ARGUS
              </span>
              <div style={{ width: 1, height: 9, background: "rgba(255,255,255,0.10)" }} />
              <h1 style={{ fontSize: "13px", fontWeight: 600, color: "rgba(255,255,255,0.88)", letterSpacing: "0.02em" }}>
                Markets
              </h1>
            </div>
            <p style={{ fontSize: "10px", color: "rgba(255,255,255,0.30)" }}>
              Intelligence · Themes · Sector signals
            </p>
          </div>
          {marketMeta?.fetchedAt && heartbeatStatus !== "loading" && (
            <div className="flex items-center gap-1.5 shrink-0">
              <span className={cn(
                "w-1.5 h-1.5 rounded-full",
                heartbeatStatus === "live"  ? "bg-emerald-400 animate-pulse" :
                heartbeatStatus === "stale" ? "bg-amber-400" : "bg-red-500",
              )} />
              <span style={{ fontSize: "8.5px", color: "rgba(255,255,255,0.25)" }}>
                {formatAge(Math.floor((Date.now() - new Date(marketMeta.fetchedAt).getTime()) / 1000))}
              </span>
            </div>
          )}
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 pb-8">

        {/* ── WHAT'S HAPPENING ────────────────────────────────── */}
        <SectionHeader label="What's Happening" />

        {/* Regime strip — opaque dark band, clearly readable */}
        {!isLoading && (
          <RegimeStrip
            regime={derivedRegime}
            brief={data?.market_brief ?? undefined}
            heartbeatStatus={heartbeatStatus}
          />
        )}

        {/* Asset tiles — on normal canvas, below the dark strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-1.5">
          {SNAPSHOT_CONFIGS.map(cfg => (
            <SnapshotTile
              key={cfg.key}
              config={cfg}
              ticker={marketData ? (marketData[cfg.key] ?? null) : undefined}
              isActive={activeKey === cfg.key}
              onClick={() => handleTileClick(cfg.key)}
            />
          ))}
        </div>
        <p className="text-[8.5px] text-ink-muted/40 flex items-center gap-1 mb-4">
          <AlertCircle size={8} className="shrink-0" />
          {anyLive ? (marketOpen ? "Live prices" : "Delayed ~15 min") : "Price data unavailable"} · Click a tile to filter themes
          {cacheAge !== undefined && ` · Feed ${formatAge(cacheAge)}`}
        </p>

        {/* Biggest Moves */}
        {!isLoading && (
          <div className="mb-5">
            <SectionHeader
              label="Biggest Moves"
              icon={<Zap size={12} className="text-accent shrink-0" />}
            />
            <BiggestMoves data={marketData} clusters={clusters} />
          </div>
        )}

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
          <div className="flex items-center gap-2.5 mb-3">
            <span className="text-[9.5px] font-bold uppercase tracking-[0.18em] text-ink-muted/70">
              Supporting Evidence
            </span>
            {!isLoading && clusters.length > 0 && (
              <span className="text-2xs font-medium text-ink-secondary bg-raised px-1.5 py-px rounded-full">
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
                  className="flex items-center gap-1 text-2xs font-semibold px-1.5 py-px rounded-full
                             bg-accent/10 text-accent hover:bg-accent/20 transition-colors"
                >
                  {activeCfg.label}
                  <X size={8} />
                </motion.button>
              )}
            </AnimatePresence>
            <span className="h-px flex-1 bg-edge/70" />
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

        {/* Only show data-unavailable warning when prices fully offline */}
        {!anyLive && marketData !== undefined && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-50 border border-amber-100 mb-4">
            <AlertTriangle size={10} className="shrink-0 text-amber-500" />
            <p className="text-[10.5px] text-ink-secondary">
              Market prices temporarily unavailable — intelligence sections remain active.
            </p>
          </div>
        )}

      </div>
    </>
  );
}
