"use client";

import { useState, useMemo, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  BarChart2, TrendingUp, TrendingDown, Minus, AlertCircle,
  Activity, Zap, ArrowUpRight, ArrowDownRight, X, Target,
} from "lucide-react";
import { cn, catColor } from "@/lib/utils";
import { useFeed } from "@/hooks/useFeed";
import { useSaved } from "@/hooks/useSaved";
import { useMarketData } from "@/hooks/useMarketData";
import { ClusterStream } from "@/components/feed/ClusterStream";
import type { StoryCluster, FeedItem, WhatMattersNowItem } from "@/lib/types";
import type { TickerData } from "@/hooks/useMarketData";


// ── Snapshot tile config ───────────────────────────────────────────────────────

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

// Tickers shown in Biggest Moves (sorted by |change%| client-side)
const MOVES_CONFIGS = [
  { key: "SPY",     label: "S&P 500"   },
  { key: "QQQ",     label: "Nasdaq"    },
  { key: "BTC-USD", label: "BTC"       },
  { key: "BZ=F",    label: "Brent Oil" },
  { key: "GC=F",    label: "Gold"      },
  { key: "TNX",     label: "10Y",      isYield: true  },
  { key: "VIX",     label: "VIX",      isVix:   true  },
] as const;

// Keywords for matching tickers to clusters (Biggest Moves explanations)
const TICKER_MATCH_KW: Record<string, string[]> = {
  "SPY":     ["S&P", "SPX", "equity", "equities", "stocks", "NYSE"],
  "QQQ":     ["Nasdaq", "tech", "technology", "QQQ"],
  "TNX":     ["Treasury", "yield", "yields", "Fed", "FOMC", "rates", "bond"],
  "BTC-USD": ["Bitcoin", "BTC", "crypto", "Ethereum"],
  "BZ=F":    ["oil", "brent", "crude", "WTI", "energy"],
  "GC=F":    ["gold", "precious", "safe-haven"],
  "VIX":     ["VIX", "volatility"],
};

type SnapshotKey = typeof SNAPSHOT_CONFIGS[number]["key"];

// Entity → ticker key (for Key Assets directional arrows)
const ENTITY_TO_TICKER: Record<string, string> = {
  "S&P": "SPY", "SPX": "SPY", "Equities": "SPY", "S&P 500": "SPY", "NYSE": "SPY",
  "Nasdaq": "QQQ", "Tech": "QQQ",
  "10Y": "TNX", "2Y": "TNX", "Treasury": "TNX", "Treasuries": "TNX",
  "Yields": "TNX", "Rates": "TNX", "Fed": "TNX", "FOMC": "TNX",
  "Oil": "BZ=F", "Brent": "BZ=F", "WTI": "BZ=F", "Crude": "BZ=F",
  "Gold": "GC=F",
  "Bitcoin": "BTC-USD", "BTC": "BTC-USD", "Crypto": "BTC-USD",
  "VIX": "VIX",
};


// ── Formatting helpers ─────────────────────────────────────────────────────────

function formatPrice(key: string, price: number): string {
  if (key === "TNX") return price.toFixed(3) + "%";
  if (key === "BTC-USD") return "$" + price.toLocaleString("en-US", { maximumFractionDigits: 0 });
  if (key === "VIX") return price.toFixed(2);
  if (key === "BZ=F" || key === "GC=F") return "$" + price.toFixed(2);
  return price.toFixed(2);
}

function formatChange(ticker: TickerData): string {
  if (ticker.key === "TNX") {
    const s = ticker.change >= 0 ? "+" : "";
    return `${s}${ticker.change.toFixed(3)}%`;
  }
  if (ticker.key === "VIX") {
    const s = ticker.change >= 0 ? "+" : "";
    return `${s}${ticker.change.toFixed(2)} pts`;
  }
  const s = ticker.changePercent >= 0 ? "+" : "";
  return `${s}${ticker.changePercent.toFixed(2)}%`;
}

function formatSign(val: number, dec = 2): string {
  return `${val >= 0 ? "+" : ""}${val.toFixed(dec)}`;
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

function entityDirection(
  entity: string,
  data: Record<string, TickerData | null> | undefined,
): "up" | "down" | "flat" {
  if (!data) return "flat";
  const key = ENTITY_TO_TICKER[entity];
  if (!key) return "flat";
  const t = data[key];
  if (!t) return "flat";
  const pct = key === "TNX" ? t.change : t.changePercent;
  return pct > 0.1 ? "up" : pct < -0.1 ? "down" : "flat";
}

// Standard asset classes shown in Key Assets row, ordered by market importance
const KEY_ASSET_DEFS = [
  {
    label:     "Equities",
    tickerKey: "SPY",
    keywords:  ["equit", "s&p", "stock", "nasdaq", "dow", "market", "risk-on", "risk-off"],
    forCats:   ["Markets", "Geopolitical"],
  },
  {
    label:     "Yields",
    tickerKey: "TNX",
    keywords:  ["yield", "treasury", "bond", "rate", "fed", "fomc", "inflation", "taper", "pivot"],
    forCats:   ["Markets"],
    isYield:   true,
  },
  {
    label:     "Oil",
    tickerKey: "BZ=F",
    keywords:  ["oil", "energy", "brent", "wti", "crude", "opec", "petroleum", "refin"],
    forCats:   [] as string[],
  },
  {
    label:     "Gold",
    tickerKey: "GC=F",
    keywords:  ["gold", "safe-haven", "safe haven", "geopolit", "sanction", "conflict", "war", "haven"],
    forCats:   ["Geopolitical"],
  },
  {
    label:     "VIX",
    tickerKey: "VIX",
    keywords:  ["vix", "volatil", "risk-off", "fear", "hedge"],
    forCats:   ["Geopolitical"],
  },
] as const;

/**
 * Derive which standard asset classes are both relevant to a WMN item AND
 * currently moving in marketData. Returns labelled pills with live direction
 * and change string — used in the Primary Driver Key Assets row.
 */
function deriveKeyAssets(
  item: WhatMattersNowItem,
  data: Record<string, TickerData | null> | undefined,
): { label: string; dir: "up" | "down"; change: string }[] {
  if (!data) return [];
  const p = item.cluster.primary;
  const haystack = [
    p.title,
    p.category,
    item.wmn_label ?? "",
    ...(p.affected_entities ?? []),
  ].join(" ").toLowerCase();

  const result: { label: string; dir: "up" | "down"; change: string }[] = [];

  for (const def of KEY_ASSET_DEFS) {
    const t = data[def.tickerKey];
    if (!t) continue;

    const isRelevant =
      def.forCats.includes(p.category) ||
      def.keywords.some(k => haystack.includes(k));
    if (!isRelevant) continue;

    // Only show when the asset is meaningfully moving
    const raw       = def.tickerKey === "TNX" ? t.change : t.changePercent;
    const threshold = def.tickerKey === "TNX" ? 0.02 : 0.15;
    if (Math.abs(raw) < threshold) continue;

    const dir = raw > 0 ? "up" : "down";
    const changeStr =
      def.tickerKey === "TNX"
        ? `${raw >= 0 ? "+" : ""}${raw.toFixed(3)}%`
        : `${raw >= 0 ? "+" : ""}${raw.toFixed(1)}%`;

    result.push({ label: def.label, dir, change: changeStr });
  }

  return result;
}

function clusterMatchesFilter(c: StoryCluster, keywords: string[]): boolean {
  const haystack = [c.primary.title, c.primary.category, ...c.primary.affected_entities]
    .join(" ").toLowerCase();
  return keywords.some(kw => haystack.includes(kw.toLowerCase()));
}

/**
 * Score how strongly a WMN item aligns with current live market moves.
 * Higher = this theme is more likely to be *causing* what's moving right now.
 *
 * Macro / geopolitical themes get a baseline boost; specific themes only score
 * highly when the market data confirms their asset class is actually moving.
 */
function marketAlignmentScore(
  item: WhatMattersNowItem,
  data: Record<string, TickerData | null> | undefined,
): number {
  if (!data) return 0;
  const p = item.cluster.primary;
  const haystack = [
    p.title,
    p.category,
    item.wmn_label ?? "",
    ...(p.affected_entities ?? []),
  ].join(" ").toLowerCase();

  let score = 0;
  const spy  = data["SPY"];
  const qqq  = data["QQQ"];
  const tnx  = data["TNX"];
  const oil  = data["BZ=F"];
  const gold = data["GC=F"];
  const vix  = data["VIX"];

  // ── VIX elevated or spiking → geopolitical/macro themes dominate ────────────
  if (vix) {
    if (vix.price >= 20 || vix.changePercent > 8)
      score += p.category === "Geopolitical" || p.category === "Markets" ? 4 : 0;
    else if (vix.price >= 15 || vix.changePercent > 4)
      score += p.category === "Geopolitical" || p.category === "Markets" ? 2 : 0;
  }

  // ── Equities moving → reward macro / equity-linked themes ───────────────────
  const avgEq = spy && qqq ? (spy.changePercent + qqq.changePercent) / 2 : null;
  if (avgEq !== null && Math.abs(avgEq) > 0.8) {
    if (p.category === "Markets" || p.category === "Geopolitical") score += 2;
    if (["s&p", "nasdaq", "equity", "equities", "stock", "nyse"].some(k => haystack.includes(k))) score += 1;
  }

  // ── Oil moving > 1.5% → reward energy / supply themes ─────────────────────
  if (oil && Math.abs(oil.changePercent) > 1.5) {
    if (["oil", "energy", "brent", "wti", "opec", "crude", "petroleum"].some(k => haystack.includes(k)))
      score += 3;
  }

  // ── Rates moving > 5bp → reward Fed / rate themes ─────────────────────────
  if (tnx && Math.abs(tnx.change) > 0.05) {
    if (["fed", "fomc", "rate", "yield", "treasury", "inflation", "taper", "pivot", "bonds"].some(k => haystack.includes(k)))
      score += 3;
  }

  // ── Gold rising → reward safe-haven / geopolitical themes ─────────────────
  if (gold && gold.changePercent > 0.5) {
    if (["gold", "safe-haven", "safe haven", "geopolit"].some(k => haystack.includes(k))) score += 2;
    if (p.category === "Geopolitical") score += 1;
  }

  // ── Category baseline (macro/geo are inherently cross-asset) ──────────────
  if (p.category === "Geopolitical") score += 2;
  if (p.category === "Markets")      score += 1;

  // ── Multi-story confirmation ───────────────────────────────────────────────
  if (item.cluster.story_count > 1) score += 1;

  // ── Penalise single-sector Company stories unless nothing else qualifies ───
  if (p.category === "Company" && item.cluster.story_count === 1) score = Math.max(score - 2, 0);

  return score;
}

function findMoveExplanation(
  tickerKey:        string,
  clusters:         StoryCluster[],
  primaryClusterId: string | undefined = undefined,
): { text: string; isPrimary: boolean } | null {
  const kws = TICKER_MATCH_KW[tickerKey] ?? [];
  if (kws.length === 0) return null;

  // Prefer the Primary Driver's cluster when it matches the ticker
  if (primaryClusterId) {
    const pc = clusters.find(c => c.id === primaryClusterId);
    if (pc) {
      const hay = [pc.primary.title, ...pc.primary.affected_entities].join(" ").toLowerCase();
      if (kws.some(k => hay.includes(k.toLowerCase())) && pc.primary.why_it_matters) {
        return { text: pc.primary.why_it_matters, isPrimary: true };
      }
    }
  }

  for (const c of clusters) {
    const hay = [c.primary.title, ...c.primary.affected_entities].join(" ").toLowerCase();
    if (kws.some(k => hay.includes(k.toLowerCase()))) {
      return c.primary.why_it_matters
        ? { text: c.primary.why_it_matters, isPrimary: false }
        : null;
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
  const color = positive ? "#10b981" : "#ef4444";
  return (
    <svg width={W} height={H} className="overflow-visible opacity-75 shrink-0">
      <polyline points={pts} fill="none" stroke={color}
        strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}


// ── Snapshot tile ──────────────────────────────────────────────────────────────

function SnapshotTile({
  config, ticker, isActive, onClick,
}: {
  config: typeof SNAPSHOT_CONFIGS[number];
  ticker: TickerData | null | undefined;
  isActive: boolean;
  onClick: () => void;
}) {
  const loading = ticker === undefined;
  const error   = ticker === null;
  const up      = ticker ? isUp(ticker) : false;
  const { label, sub, color } = config;

  return (
    <motion.button
      whileTap={{ scale: 0.97 }}
      onClick={onClick}
      className={cn(
        "bg-surface rounded-xl border p-3.5 shadow-card text-left w-full",
        "transition-all duration-200",
        isActive
          ? "border-edge-strong shadow-card-hover"
          : "border-edge hover:border-edge-strong hover:shadow-card-hover",
      )}
      style={{
        borderTopWidth: "3px",
        borderTopColor: color,
        ...(isActive ? { boxShadow: `0 0 0 2px ${color}30, var(--shadow-card-hover)` } : {}),
      }}
    >
      <p className="text-2xs font-bold uppercase tracking-wider text-ink-muted mb-0.5">{sub}</p>
      <p className="text-sm font-bold text-ink">{label}</p>

      {loading ? (
        <div className="mt-2 h-10 w-full bg-raised rounded animate-pulse" />
      ) : error ? (
        <p className="mt-2 text-xs text-ink-muted">Unavailable</p>
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
               ticker.changePercent !== 0 ? <TrendingDown size={11} /> :
               <Minus size={11} />}
              <span>{formatChange(ticker)}</span>
            </div>
          </div>
          <Sparkline history={ticker.history} positive={up} />
        </div>
      )}
    </motion.button>
  );
}


// ── Market Pulse ──────────────────────────────────────────────────────────────

interface PulseIndicator {
  label:  string;
  reason: string;   // 1-line context: "S&P +0.8%, Nasdaq +1.1%"
  color:  string;
  dir:    "up" | "down" | "flat";
}

function derivePulse(d: Record<string, TickerData | null> | undefined): {
  sentiment:   PulseIndicator;
  rates:       PulseIndicator;
  commodities: PulseIndicator;
  volatility:  PulseIndicator;
} | null {
  if (!d) return null;
  const spy = d["SPY"], qqq = d["QQQ"], tnx = d["TNX"],
        oil = d["BZ=F"], vix = d["VIX"];

  // ── Risk sentiment ────────────────────────────────────────────────────────
  const avgEq = spy && qqq ? (spy.changePercent + qqq.changePercent) / 2 : null;
  const sentiment: PulseIndicator = avgEq === null
    ? { label: "Unknown",  reason: "market data unavailable",              color: "#6B7280", dir: "flat" }
    : avgEq > 0.5
    ? { label: "Risk-On",  reason: `S&P ${formatSign(spy!.changePercent)}%, Nasdaq ${formatSign(qqq!.changePercent)}% — risk assets bid`,
        color: "#10b981", dir: "up" }
    : avgEq < -0.5
    ? { label: "Risk-Off", reason: `S&P ${formatSign(spy!.changePercent)}%, Nasdaq ${formatSign(qqq!.changePercent)}% — deleveraging`,
        color: "#ef4444", dir: "down" }
    : { label: "Cautious", reason: `S&P ${formatSign(spy!.changePercent)}%, Nasdaq ${formatSign(qqq!.changePercent)} — mixed signals`,
        color: "#f59e0b", dir: "flat" };

  // ── Rates ─────────────────────────────────────────────────────────────────
  const rates: PulseIndicator = !tnx
    ? { label: "Unknown",        reason: "yield data unavailable",                   color: "#6B7280", dir: "flat" }
    : tnx.change > 0.03
    ? { label: "Yields Rising",  reason: `10Y ${formatSign(tnx.change, 3)}% — cost of capital rising`,
        color: "#ef4444", dir: "up" }
    : tnx.change < -0.03
    ? { label: "Yields Falling", reason: `10Y ${formatSign(tnx.change, 3)}% — bonds bid, easing pressure`,
        color: "#10b981", dir: "down" }
    : { label: "Yields Stable",  reason: `10Y at ${tnx.price.toFixed(3)}% — no rate repricing`,
        color: "#6B7280", dir: "flat" };

  // ── Commodities ───────────────────────────────────────────────────────────
  const commodities: PulseIndicator = !oil
    ? { label: "Unknown",     reason: "commodity data unavailable",                      color: "#6B7280", dir: "flat" }
    : oil.changePercent > 0.5
    ? { label: "Oil Rising",  reason: `Brent ${formatSign(oil.changePercent)}% — inflation pressure, margin headwind`,
        color: "#f59e0b", dir: "up" }
    : oil.changePercent < -0.5
    ? { label: "Oil Falling", reason: `Brent ${formatSign(oil.changePercent)}% — energy costs ease, demand concern`,
        color: "#6B7280", dir: "down" }
    : { label: "Oil Stable",  reason: `Brent near $${oil.price.toFixed(0)} — commodities flat`,
        color: "#6B7280", dir: "flat" };

  // ── Volatility ────────────────────────────────────────────────────────────
  const vixLvl  = vix?.price ?? 0;
  const vixChg  = vix?.changePercent ?? 0;
  const vixTier = vixLvl < 15 ? "Low" : vixLvl < 20 ? "Moderate" : vixLvl < 25 ? "Elevated" : "High";
  const vixDir  = vixChg > 5 ? "up" : vixChg < -5 ? "down" : "flat";
  const vixColor = vixLvl < 15 ? "#10b981" : vixLvl < 20 ? "#6B7280" : vixLvl < 25 ? "#f59e0b" : "#ef4444";
  const vixReason = vixDir === "up"
    ? `VIX ${vixLvl.toFixed(1)} — spiking, hedging demand rising`
    : vixDir === "down"
    ? `VIX ${vixLvl.toFixed(1)} — calming, options bid falling`
    : vixTier === "Low"      ? `VIX ${vixLvl.toFixed(1)} — calm market conditions`
    : vixTier === "Moderate" ? `VIX ${vixLvl.toFixed(1)} — some risk-off positioning`
    : vixTier === "Elevated" ? `VIX ${vixLvl.toFixed(1)} — elevated, watch for spikes`
    :                          `VIX ${vixLvl.toFixed(1)} — high, flight-to-quality likely`;
  const volatility: PulseIndicator = {
    label: `VIX ${vixTier}`, reason: vixReason, color: vixColor, dir: vixDir as PulseIndicator["dir"],
  };

  return { sentiment, rates, commodities, volatility };
}

function PulseTile({ title, indicator }: { title: string; indicator: PulseIndicator }) {
  return (
    <div className="bg-surface border border-edge rounded-xl px-3 py-2.5 flex-1 min-w-0">
      <p className="text-2xs font-bold uppercase tracking-wider text-ink-muted mb-1 truncate">{title}</p>
      <div className="flex items-center gap-1 mb-0.5">
        {indicator.dir === "up"   && <ArrowUpRight   size={12} style={{ color: indicator.color }} />}
        {indicator.dir === "down" && <ArrowDownRight  size={12} style={{ color: indicator.color }} />}
        {indicator.dir === "flat" && <Minus           size={12} style={{ color: indicator.color }} />}
        <span className="text-xs font-semibold truncate" style={{ color: indicator.color }}>
          {indicator.label}
        </span>
      </div>
      <p className="text-2xs text-ink-muted leading-snug line-clamp-2">{indicator.reason}</p>
    </div>
  );
}

function MarketPulse({ data }: { data: Record<string, TickerData | null> | undefined }) {
  const pulse = derivePulse(data);
  if (!pulse) return null;
  return (
    <div className="mb-5">
      <SectionHeader label="Market Pulse" icon={<Activity size={13} className="text-accent shrink-0" />} />
      <div className="flex gap-2 flex-wrap sm:flex-nowrap">
        <PulseTile title="Sentiment"   indicator={pulse.sentiment}   />
        <PulseTile title="Rates"       indicator={pulse.rates}       />
        <PulseTile title="Commodities" indicator={pulse.commodities} />
        <PulseTile title="Volatility"  indicator={pulse.volatility}  />
      </div>
    </div>
  );
}


// ── Biggest Moves ─────────────────────────────────────────────────────────────

function BiggestMoves({
  data, clusters, primaryDriver,
}: {
  data:          Record<string, TickerData | null> | undefined;
  clusters:      StoryCluster[];
  primaryDriver: WhatMattersNowItem | null;
}) {
  if (!data) return null;

  const primaryClusterId = primaryDriver?.cluster.id;

  const tickers = MOVES_CONFIGS
    .map(c => ({ cfg: c, t: data[c.key] as TickerData | null }))
    .filter((x): x is { cfg: typeof MOVES_CONFIGS[number]; t: TickerData } =>
      x.t !== null && x.t !== undefined)
    .sort((a, b) => Math.abs(b.t.changePercent) - Math.abs(a.t.changePercent));

  if (tickers.length === 0) return null;

  // Explanations for top movers — primary driver's cluster takes priority
  const topExplained = tickers
    .slice(0, 5)
    .map(({ cfg, t }) => ({
      cfg, t,
      result: findMoveExplanation(t.key, clusters, primaryClusterId),
    }))
    .filter((x): x is typeof x & { result: NonNullable<typeof x.result> } =>
      x.result !== null)
    .map(({ cfg, t, result }) => ({ cfg, t, explanation: result.text, isPrimary: result.isPrimary }));

  return (
    <div className="mb-5">
      <SectionHeader label="Biggest Moves" icon={<Zap size={13} className="text-accent shrink-0" />} />

      {/* Compact ticker grid */}
      <div className="grid grid-cols-4 sm:grid-cols-7 gap-2">
        {tickers.map(({ cfg, t }, i) => {
          const up = isUp(t);
          const isLargest = i === 0;
          return (
            <div key={t.key} className={cn(
              "bg-surface border rounded-lg px-2 py-2 text-center",
              isLargest ? "border-edge-strong shadow-card" : "border-edge",
            )}>
              <p className={cn(
                "text-2xs font-bold mb-0.5 truncate",
                isLargest ? "text-ink-secondary" : "text-ink-muted",
              )}>{cfg.label}</p>
              {"isYield" in cfg && cfg.isYield && (
                <p className="text-2xs font-semibold tabular-nums text-ink">{t.price.toFixed(3)}%</p>
              )}
              {"isVix" in cfg && cfg.isVix && (
                <p className="text-2xs font-semibold tabular-nums text-ink">{t.price.toFixed(1)}</p>
              )}
              <p className={cn(
                "tabular-nums",
                isLargest ? "text-[13px] font-extrabold" : "text-xs font-bold",
                up ? "text-emerald-600" : "text-red-500",
              )}>
                {formatChange(t)}
              </p>
            </div>
          );
        })}
      </div>

      {/* Explanations for top movers — primary driver aligned rows shown distinctly */}
      {topExplained.length > 0 && (
        <div className="mt-3 space-y-1.5 border-t border-edge/50 pt-3">
          {topExplained.map(({ cfg, t, explanation, isPrimary }) => {
            const up = isUp(t);
            return (
              <div key={t.key} className="flex items-start gap-2.5 text-2xs">
                <span className={cn(
                  "font-bold tabular-nums shrink-0 w-[7rem]",
                  up ? "text-emerald-600" : "text-red-500",
                )}>
                  {cfg.label} {formatChange(t)}
                </span>
                <span className={cn(
                  "leading-relaxed line-clamp-1 flex-1",
                  isPrimary ? "text-ink font-medium" : "text-ink-secondary",
                )}>
                  — {explanation}
                </span>
                {isPrimary && primaryDriver && (
                  <span className="text-2xs font-semibold text-accent shrink-0 ml-1">
                    ↑ Primary Driver
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}


// ── Primary Driver ────────────────────────────────────────────────────────────

function PrimaryDriver({
  item,
  marketData,
}: {
  item:       WhatMattersNowItem;
  marketData: Record<string, TickerData | null> | undefined;
}) {
  const { cluster, thesis, wmn_label } = item;
  const p     = cluster.primary;
  const color = catColor(p.category);
  const score = Math.round(p.signal_score ?? 0);

  const barColor = score >= 80 ? "#10b981" : score >= 50 ? "#f59e0b" : "#94a3b8";

  function scrollToCluster() {
    document.querySelector(`[data-cluster-id="${cluster.id}"]`)
      ?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  const storyLabel = cluster.story_count > 1 ? `${cluster.story_count} stories` : "1 story";

  return (
    <div className="mb-5">
      <SectionHeader
        label="Primary Driver"
        icon={<Target size={13} className="text-accent shrink-0" />}
      />
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, ease: "easeOut" }}
        className="bg-surface rounded-xl border border-edge-strong shadow-card-hover overflow-hidden"
      >
        {/* Thick accent bar */}
        <div className="h-1" style={{ background: color }} />

        <div className="px-4 pt-4 pb-4">
          {/* Category + score */}
          <div className="flex items-center gap-2 mb-2.5">
            <span
              className="text-2xs font-semibold px-2 py-0.5 rounded-full"
              style={{ background: `${color}15`, color }}
            >
              {p.category}
            </span>
            <span
              className="text-2xs font-bold tabular-nums"
              style={{ color: barColor }}
            >
              {score}
            </span>
            <span className="text-2xs text-ink-muted ml-auto">{storyLabel}</span>
          </div>

          {/* Theme label */}
          <p className="text-[15px] font-bold text-ink leading-snug mb-2">
            {wmn_label || cluster.theme_label}
          </p>

          {/* Thesis */}
          {thesis && (
            <p className="text-xs text-ink-secondary leading-relaxed mb-3 line-clamp-2">
              {thesis}
            </p>
          )}

          {/* Key Assets — curated asset classes with live directional moves */}
          {(() => {
            const assets = deriveKeyAssets(item, marketData);
            if (assets.length === 0) return null;
            return (
              <div className="flex items-center gap-1.5 flex-wrap mb-3">
                <span className="text-2xs text-ink-muted shrink-0">Key assets:</span>
                {assets.map(({ label, dir, change }) => (
                  <span
                    key={label}
                    className="text-2xs font-semibold px-1.5 py-0.5 rounded"
                    style={{
                      background: dir === "up" ? "#10b98120" : "#ef444420",
                      color:      dir === "up" ? "#059669"   : "#dc2626",
                    }}
                  >
                    {label} {dir === "up" ? "↑" : "↓"}
                    <span className="opacity-60 ml-0.5 font-normal">{change}</span>
                  </span>
                ))}
              </div>
            );
          })()}

          {/* Score bar + jump button */}
          <div className="flex items-center gap-3 pt-2 border-t border-edge/50">
            <div className="flex items-center gap-2 flex-1">
              <div className="flex-1 h-[3px] rounded-full bg-raised overflow-hidden max-w-[80px]">
                <div className="h-full rounded-full" style={{ width: `${score}%`, background: barColor }} />
              </div>
              <span className="text-2xs text-ink-muted">Signal strength</span>
            </div>
            <button
              onClick={scrollToCluster}
              className="text-2xs font-semibold text-accent hover:text-accent/80 transition-colors shrink-0"
            >
              View theme ↓
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}


// ── Top Movers ────────────────────────────────────────────────────────────────

const MOVER_GROUPS = [
  { label: "Stocks & Indices", keywords: ["s&p", "nasdaq", "dow", "equity", "stock", "shares", "earnings", "rally", "selloff"] },
  { label: "Crypto",           keywords: ["bitcoin", "btc", "ethereum", "eth", "crypto", "digital asset"] },
  { label: "Commodities",      keywords: ["oil", "brent", "wti", "crude", "gold", "silver", "copper", "commodity", "natural gas"] },
] as const;

function SignalDot({ strength }: { strength: string }) {
  return (
    <span className={cn(
      "inline-block w-1.5 h-1.5 rounded-full shrink-0",
      strength === "strong" ? "bg-emerald-400" :
      strength === "medium" ? "bg-amber-400"   : "bg-edge-strong",
    )} />
  );
}

function TopMovers({
  items, clusterByItemId,
}: {
  items:           FeedItem[];
  clusterByItemId: Map<string, StoryCluster>;
}) {
  const groups = MOVER_GROUPS.map(({ label, keywords }) => ({
    label,
    items: items
      .filter(item => keywords.some(kw => item.title.toLowerCase().includes(kw)))
      .slice(0, 3),
  })).filter(g => g.items.length > 0);

  if (groups.length === 0) return null;

  return (
    <div className="mb-6">
      <SectionHeader label="Top Movers" />
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {groups.map(({ label, items: groupItems }) => (
          <div key={label}>
            <p className="text-2xs font-bold uppercase tracking-wider text-ink-muted mb-2">{label}</p>
            <div className="space-y-2">
              {groupItems.map(item => {
                const cluster      = clusterByItemId.get(item.id);
                const implication  = item.why_it_matters || cluster?.primary.why_it_matters || "";
                return (
                  <a
                    key={item.id}
                    href={item.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block group"
                  >
                    <div className="bg-surface rounded-lg border border-edge px-3 py-2.5
                                    hover:border-edge-strong hover:shadow-card transition-all duration-150">
                      <p className="text-xs font-semibold text-ink leading-snug group-hover:text-accent
                                    transition-colors line-clamp-2 mb-1.5">
                        {item.title}
                      </p>
                      {implication && (
                        <p className="text-2xs text-ink-secondary leading-relaxed line-clamp-2 mb-1.5 italic">
                          {implication}
                        </p>
                      )}
                      <div className="flex items-center gap-1.5">
                        <SignalDot strength={item.signal_strength} />
                        <span className="text-2xs text-ink-muted">{item.source} · {item.published}</span>
                      </div>
                    </div>
                  </a>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}


// ── Shared helpers ────────────────────────────────────────────────────────────

function SectionHeader({ label, icon }: { label: string; icon?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 mb-3">
      {icon}
      <span className="text-xs font-bold uppercase tracking-[0.14em] text-ink">{label}</span>
      <span className="h-px flex-1 bg-edge" />
    </div>
  );
}


// ── Page ──────────────────────────────────────────────────────────────────────

export default function MarketsPage() {
  const [activeKey, setActiveKey] = useState<SnapshotKey | null>(null);
  const clusterRef = useRef<HTMLDivElement>(null);

  const { data: marketData }     = useMarketData();
  const { data, isLoading }      = useFeed({ use_ai: true });
  const { savedIds, toggleSave } = useSaved();

  const clusters = data?.clusters         ?? [];
  const wmn      = data?.what_matters_now ?? [];
  const cacheAge = data?.cache_age_seconds;
  const allItems = data?.items            ?? [];

  // Primary Driver: WMN item most aligned with *current* market moves
  // Prefers macro/geo themes that explain live price action; falls back to
  // the top-ranked qualifying item if alignment scores are all zero (no data).
  const primaryDriver = useMemo(() => {
    // Quality filter — exclude single-stock weak stories
    const qualified = wmn.filter(item => {
      const p = item.cluster.primary;
      return (
        (p.signal_score ?? 0) >= 55 ||
        item.cluster.story_count > 1 ||
        p.category === "Geopolitical" ||
        (p.category === "Markets" && p.signal_strength === "strong")
      );
    });

    const candidates = qualified.length > 0 ? qualified : wmn.slice(0, 3);
    if (candidates.length === 0) return null;

    // Score each candidate by live market alignment
    const scored = candidates.map(item => ({
      item,
      score: marketAlignmentScore(item, marketData),
    }));
    scored.sort((a, b) => b.score - a.score);

    // If any candidate has a non-zero alignment score, use the best one.
    // Otherwise fall back to the top WMN item (cluster_score ranked).
    return scored[0].score > 0 ? scored[0].item : candidates[0];
  }, [wmn, marketData]);

  // Cluster lookup by primary item ID (for TopMovers cross-reference)
  const clusterByItemId = useMemo(() => {
    const map = new Map<string, StoryCluster>();
    for (const c of clusters) map.set(c.primary.id, c);
    return map;
  }, [clusters]);

  // Active tile config
  const activeCfg = SNAPSHOT_CONFIGS.find(c => c.key === activeKey) ?? null;

  // Visible clusters: filter by active tile, else Markets + Geopolitical
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
      setTimeout(() => clusterRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 60);
    }
  }

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-7">

      {/* ── Page header ──────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2.5">
          <BarChart2 size={18} className="text-accent" />
          <h1 className="text-xl font-bold text-ink">Markets</h1>
        </div>
        {cacheAge !== undefined && (
          <span className="text-2xs text-ink-muted flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shrink-0" />
            Updated {formatAge(cacheAge)}
          </span>
        )}
      </div>
      <p className="text-sm text-ink-secondary mb-5">
        Macro, equities, rates, and global market moves.
      </p>

      {/* 1. Market Snapshot */}
      <div className="mb-0">
        <SectionHeader label="Market Snapshot" />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
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
        <p className="text-2xs text-ink-muted flex items-center gap-1 mt-2 mb-5">
          <AlertCircle size={10} className="shrink-0" />
          Delayed ~15 min via Yahoo Finance · Click a tile to filter themes · Refreshes every 5 min
        </p>
      </div>

      {/* 2. Market Pulse */}
      <MarketPulse data={marketData} />

      {/* 3. Biggest Moves */}
      <BiggestMoves data={marketData} clusters={clusters} primaryDriver={primaryDriver} />

      {/* 4. Primary Driver */}
      {primaryDriver && <PrimaryDriver item={primaryDriver} marketData={marketData} />}

      {/* 5. Clustered themes */}
      <div ref={clusterRef}>
        <div className="flex items-center gap-3 mb-3">
          <span className="text-xs font-bold uppercase tracking-[0.14em] text-ink">Market Themes</span>
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
          <span className="h-px flex-1 bg-edge" />
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

      {/* 6. Top Movers */}
      <TopMovers items={allItems} clusterByItemId={clusterByItemId} />

    </div>
  );
}
