"use client";

import dynamic from "next/dynamic";
import { useState, useMemo, useRef, useCallback, memo } from "react";
import { motion, AnimatePresence } from "framer-motion";

import {
  Zap, Network, BarChart2,
  X, ChevronRight,
  Bookmark, BookmarkCheck, ChevronDown,
} from "lucide-react";
import { cn, formatRelativeAge, timeAgo } from "@/lib/utils";
import { TickerChip } from "@/components/common/TickerChip";
import { useFeed } from "@/hooks/useFeed";
import { useSaved } from "@/hooks/useSaved";
import { useMarketData } from "@/hooks/useMarketData";
import type { StoryCluster, ThemeIntelligence, SectorData, MarketBrief, FeedItem } from "@/lib/types";
import type { TickerData } from "@/hooks/useMarketData";
import {
  computeThemeEvolutionState,
  THEME_EVOLUTION_META,
} from "@/lib/themeEvolution";
import {
  buildThemeRelationshipMap,
  detectContradictions,
  generateNextCatalysts,
  marketCatalystRadar,
  isCatalystCalendarPlaceholder,
  type CatalystKind,
  type RadarCatalyst,
  generateWhyItMattersNow,
  themeBeneficiaries,
  bestExpressions,
  themeLosers,
  securitiesForSector,
  themePersistenceWeight,
  memorySentences,
} from "@/lib/themeIntelligence";
import { useMarketState } from "@/hooks/useMarketState";
import { useFollowedThemes, type FollowedTheme } from "@/hooks/useFollowedThemes";
import { useThemeAlerts, type ThemeAlert } from "@/hooks/useThemeAlerts";
import {
  cleanThemeName,
  cleanMacroLabel,
  confColor,
  convScore,
  convBasis,
  deriveKeyRisk,
  countdownLabel,
  type DrawerData,
} from "./marketsShared";

// Code-split: the drawer only mounts when a theme is opened, so it loads on
// demand instead of shipping in the Markets First Load JS.
const ThemeDetailDrawer = dynamic(
  () => import("@/components/markets/ThemeDetailDrawer").then(m => m.ThemeDetailDrawer),
  { ssr: false },
);


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

const EVOLUTION_COLOR: Record<string, string> = {
  accelerating:  "#10b981",
  strengthening: "#10b981",
  broadening:    "#38bdf8",
  stabilizing:   "#94a3b8",
  peaking:       "#f59e0b",
  weakening:     "#f97316",
  reversing:     "#ef4444",
};

type SnapshotKey = typeof SNAPSHOT_CONFIGS[number]["key"];


// ── Helpers ───────────────────────────────────────────────────────────────────

function formatChange(ticker: TickerData): string {
  if (ticker.key === "TNX")
    return `${ticker.change >= 0 ? "+" : ""}${ticker.change.toFixed(3)}%`;
  if (ticker.key === "VIX")
    return `${ticker.change >= 0 ? "+" : ""}${ticker.change.toFixed(2)}`;
  return `${ticker.changePercent >= 0 ? "+" : ""}${ticker.changePercent.toFixed(2)}%`;
}


function isUp(t: TickerData): boolean {
  return t.key === "TNX" ? t.change > 0 : t.changePercent > 0;
}

// Convert raw SEC filing titles ("8-K, Other Events") into readable labels and
// strip the em dash. Non-filing titles pass through unchanged.
const FILING_FORM_RE = /\b(8-K|10-K|10-Q|S-1|S-3|6-K|20-F|13[DG]|424B\d?|DEF 14A|SC 13[DG])\b\s*[—–-]?\s*(.*)$/i;
function cleanFilingTitle(raw: string): string {
  const m = raw.match(FILING_FORM_RE);
  if (!m) return raw;
  const form    = m[1].toUpperCase();
  const desc    = (m[2] ?? "").trim();
  const company = raw.slice(0, m.index).replace(/[—–-]\s*$/, "").trim();
  const lead    = company ? `${company} ` : "";
  if (!desc || /^other events$/i.test(desc)) return `${lead}${form} filing`.trim();
  return `${lead}${form}: ${desc}`.trim();
}

function regimeAccentColor(regime: string): string {
  const l = regime.toLowerCase();
  if (l.includes("risk-on") || l.includes("goldilocks") || l.includes("expansion")) return "#10b981";
  if (l.includes("risk-off") || l.includes("stagflat") || l.includes("recession"))  return "#f87171";
  if (l.includes("reflat") || l.includes("inflation")) return "#fbbf24";
  return "#818cf8";
}

// Time-horizon bucket, analyst register, no "momentum fading" filler.
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
    <div className="min-w-0 px-3 py-2 border-r border-edge last:border-r-0">
      <p className="text-[7px] font-bold uppercase tracking-[0.16em] text-ink-muted/70 mb-1 truncate">{label}</p>
      {/* Default to dark ink, this card is a white surface, so the previous
          translucent-white default rendered invisibly (the "washed out" look). */}
      <p className="text-[15px] font-black leading-none tracking-tight truncate tabular-nums"
        style={{ color: color ?? "rgb(var(--ink))" }}>{value}</p>
      {sub && <p className="text-[8px] font-semibold text-ink-muted/65 mt-1 truncate">{sub}</p>}
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

function MarketSnapshotBase({ themes, sectorData, regime, brief }: {
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
  // Memory-aware "fastest": weight today's momentum by cross-session persistence
  // so a sustained strengthening theme outranks a one-off single-cycle spike.
  const fastest    = [...themes].sort((a, b) =>
    (b.momentum_delta ?? 0) * themePersistenceWeight(b) - (a.momentum_delta ?? 0) * themePersistenceWeight(a))[0];
  // Memory-aware "largest risk": a theme weakening across multiple sessions is a
  // bigger risk than one that merely dipped today.
  const memRisk    = (t: ThemeIntelligence) =>
    themeRiskScore(t) + (t.memory?.status === "weakening" ? (t.memory.sessions_in_status ?? 0) * 4 : 0);
  const risk       = [...themes].sort((a, b) => memRisk(b) - memRisk(a))[0];
  const opp        = positions.find(p => p.direction === "bullish") ?? positions[0];
  const state      = regime || brief?.market_regime || "Neutral";
  const accent     = regimeAccentColor(state);

  return (
    <div className="mb-3 rounded-xl border border-edge-strong bg-surface shadow-card overflow-hidden"
      style={{ borderTop: `3px solid ${accent}` }}>
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 divide-x divide-y divide-edge sm:divide-y-0">
        <SnapCell label="Market State" value={state} color={accent} />
        <SnapCell label="Conviction" value={`${convScore(conviction)}`} color={confColor(conviction)} />
        <SnapCell label="Breadth" value={`${confirming}/${total}`} sub="sectors confirming" />
        <SnapCell label="Dominant Theme" value={dominant ? cleanThemeName(dominant.name) : "-"} />
        <SnapCell label="Fastest Accelerating" value={fastest ? cleanThemeName(fastest.name) : "-"} color="#10b981"
          sub={fastest ? `${(fastest.momentum_delta ?? 0) >= 0 ? "+" : ""}${fastest.momentum_delta ?? 0} mom` : undefined} />
        <SnapCell label="Largest Risk" value={risk ? cleanThemeName(risk.name) : "-"} color="#ef4444" />
        <SnapCell label="Largest Opportunity" value={opp ? opp.sector : "-"} color="#10b981"
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

// Compact, clickable mover chip, a theme and its momentum delta.
function MoverChip({ t, onClick }: { t: ThemeIntelligence; onClick: () => void }) {
  const d   = t.momentum_delta ?? 0;
  const up  = d > 0;
  const clr = up ? "#10b981" : "#ef4444";
  return (
    <button onClick={onClick}
      className="shrink-0 flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-raised/60 transition-colors">
      <span className="text-[9px]" style={{ color: clr }}>{up ? "▲" : "▼"}</span>
      <span className="text-[10px] font-semibold text-ink-secondary max-w-[120px] truncate">{cleanThemeName(t.name)}</span>
      <span className="text-[10px] font-black tabular-nums" style={{ color: clr }}>{up ? "+" : ""}{d}</span>
    </button>
  );
}

// Market Pulse, one dense band that merges the old Internals strip and the
// "Today's Changes" card: breadth tallies plus the day's biggest theme movers,
// each clickable into the drawer. Replaces two stacked sections with a glance.
function MarketPulseStripBase({ themes, onThemeClick }: {
  themes:       ThemeIntelligence[];
  onThemeClick: (t: ThemeIntelligence) => void;
}) {
  const stats = useMemo(() => {
    const positions = computeSectorPositions(themes);
    const moved = [...themes]
      .filter(t => Math.abs(t.momentum_delta ?? 0) >= 1)
      .sort((a, b) => Math.abs(b.momentum_delta ?? 0) - Math.abs(a.momentum_delta ?? 0));
    return {
      adv: themes.filter(t => (t.momentum_delta ?? 0) > 0).length,
      dec: themes.filter(t => (t.momentum_delta ?? 0) < 0).length,
      hi:  themes.filter(t => t.momentum_label === "accelerating").length,
      lo:  themes.filter(t => t.momentum_label === "reversing").length,
      sp:  positions.filter(p => p.direction === "bullish").length,
      sn:  positions.filter(p => p.direction === "bearish").length,
      movers: moved.slice(0, 6),
    };
  }, [themes]);

  if (themes.length === 0) return null;

  return (
    <div className="mb-3 rounded-lg border border-edge bg-surface flex items-stretch flex-wrap overflow-hidden">
      <span className="self-center text-[7px] font-bold uppercase tracking-[0.16em] text-ink-muted/35 px-2.5 py-1.5 border-r border-edge/50 shrink-0">Pulse</span>
      <InternalStat label="Adv / Dec"    pos={stats.adv} neg={stats.dec} />
      <InternalStat label="Accel / Rev"  pos={stats.hi}  neg={stats.lo} />
      <InternalStat label="Sectors +/−"  pos={stats.sp}  neg={stats.sn} />
      {stats.movers.length > 0 && (
        <div className="flex items-center gap-0.5 px-1.5 py-1 flex-1 min-w-0 overflow-x-auto border-l border-edge/50">
          <span className="text-[7px] font-bold uppercase tracking-[0.1em] text-ink-muted/35 shrink-0 pr-0.5">Movers</span>
          {stats.movers.map(t => <MoverChip key={t.id} t={t} onClick={() => onThemeClick(t)} />)}
        </div>
      )}
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
  const base   = `${cleanThemeName(top.name)} ${verb}${factor ? `, driven by ${cleanMacroLabel(factor)}` : ""}.`;
  // Memory: compare today against the theme's own history, what changed (or held)
  // and whether conviction is rising/falling, so the narrative is not reactive.
  const memLine = memorySentences(top, 0)[0];
  return memLine ? `${base} ${memLine}` : base;
}

function DominantNarrativeBase({ brief, themes }: {
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
  const horizon    = top ? timeBucket(top) : "-";
  const confirming = top
    ? themes.filter(t => t.momentum_direction === top.momentum_direction).length
    : themes.length;

  return (
    <div className="mb-4 rounded-xl border border-edge-strong shadow-card overflow-hidden bg-surface"
      style={{ borderTop: `4px solid ${cColor}` }}>
      {/* hero headline, the focal point */}
      <div className="px-5 pt-4 pb-4">
        <p className="text-[8.5px] font-bold uppercase tracking-[0.24em] text-ink-muted/60 mb-2">Dominant Narrative</p>
        <p className="text-[22px] sm:text-[26px] font-black text-ink leading-[1.1] tracking-tight break-words">{whatHappened}</p>
      </div>

      {/* stats strip, dark-tinted band for rhythm + larger numbers */}
      <div className="grid grid-cols-4 divide-x divide-edge border-y border-edge" style={{ background: "rgba(255,255,255,0.025)" }}>
        <div className="px-3 py-2">
          <p className="text-[7px] font-bold uppercase tracking-[0.14em] text-ink-muted/60">Confidence</p>
          <p className="text-[20px] font-black tabular-nums leading-none mt-1" style={{ color: cColor }}>{confidence}<span className="text-[11px] opacity-60">%</span></p>
        </div>
        <div className="px-3 py-2">
          <p className="text-[7px] font-bold uppercase tracking-[0.14em] text-ink-muted/60">Trend</p>
          <p className="text-[13px] font-bold leading-none mt-2" style={{ color: trend.color }}>{trend.arrow} {trend.label}</p>
        </div>
        <div className="px-3 py-2">
          <p className="text-[7px] font-bold uppercase tracking-[0.14em] text-ink-muted/60">Confirming</p>
          <p className="text-[13px] font-bold text-ink leading-none mt-2 tabular-nums">{confirming} themes</p>
        </div>
        <div className="px-3 py-2">
          <p className="text-[7px] font-bold uppercase tracking-[0.14em] text-ink-muted/60">Horizon</p>
          <p className="text-[13px] font-bold text-ink-secondary leading-none mt-2">{horizon}</p>
        </div>
      </div>

      {/* why (explanation) vs market impact (evidence), visually distinguished */}
      <div className="grid sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-edge">
        <div className="px-5 py-3">
          <p className="text-[7.5px] font-bold uppercase tracking-[0.16em] text-ink-muted/55 mb-1.5">Why It Happened</p>
          <p className="text-[12.5px] text-ink-secondary leading-relaxed break-words">{whyHappened}</p>
        </div>
        <div className="px-5 py-3 bg-raised/50">
          <p className="text-[7.5px] font-bold uppercase tracking-[0.16em] text-ink-muted/55 mb-1.5">Market Impact</p>
          <ul className="space-y-1.5">
            {implications.map((b, i) => (
              <li key={i} className="flex items-start gap-2 text-[11.5px] text-ink-secondary leading-snug break-words">
                <span className="shrink-0 mt-[5px] w-1.5 h-1.5 rounded-full" style={{ background: cColor }} />
                <span>{b}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* who wins / who loses, prominent securities */}
      {(benef.length > 0 || losers) && (
        <div className="px-4 py-2.5 border-t border-edge/60 flex flex-wrap items-center gap-x-4 gap-y-2">
          {benef.length > 0 && (
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[8px] font-bold uppercase tracking-[0.16em] text-emerald-300/70">Primary Beneficiaries</span>
              {benef.map(tk => (
                <TickerChip key={tk} ticker={tk} mono={false} className="text-[12px] font-black tabular-nums px-1.5 py-0.5 rounded bg-emerald-500/12 text-emerald-300 border border-emerald-500/25" />
              ))}
            </div>
          )}
          {losers && (
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[8px] font-bold uppercase tracking-[0.16em] text-red-400/70">Most Exposed</span>
              {losers.tickers.map(tk => (
                <TickerChip key={tk} ticker={tk} mono={false} className="text-[12px] font-black tabular-nums px-1.5 py-0.5 rounded bg-red-500/8 text-red-400/90 border border-red-500/20" />
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



// ── Section header ─────────────────────────────────────────────────────────────

function SectionHeader({ label, icon, sub }: {
  label: string; icon?: React.ReactNode; sub?: string;
}) {
  return (
    // Larger top margin creates clear breathing room / rhythm between sections.
    <div className="flex items-center gap-2 mb-3 mt-6 first:mt-0">
      {/* accent tick gives each section a stronger, scannable anchor */}
      <span className="w-[3px] h-3.5 rounded-full bg-accent shrink-0" />
      {icon}
      <span className="text-[11.5px] font-black uppercase tracking-[0.14em] text-ink">{label}</span>
      {sub && <span className="text-[9px] font-medium text-ink-muted/80">{sub}</span>}
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
      style={{ borderColor: "rgb(var(--edge))", borderLeft: "3px solid #2563EB" }}
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
                            ? "text-emerald-300 bg-emerald-50 border border-emerald-200"
                            : "text-red-400 bg-red-50 border border-red-200",
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
                  <span style={{ fontSize: "8px", color: "rgba(255,255,255,0.12)" }}>-</span>
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
              {marketOpen ? "Live" : "Delayed"} · {formatRelativeAge(cacheAge, { suffix: false })}
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
  // Memory-aware: a cross-session weakening/stale signal is the live risk to flag,
  // ahead of the generic structural risk, so the watch line is not purely reactive.
  const m = t.memory;
  if (m && m.status === "weakening" && (m.sessions_in_status ?? 0) >= 2) {
    return `Weakening ${m.sessions_in_status} sessions, conviction ${m.conviction_window_start}→${m.conviction_current}`;
  }
  if (m && m.status === "stale") return `Dormant, last confirmed ${Math.round(m.last_seen_hours_ago)}h ago`;
  if (m && m.contradictions_today >= 2) return `Contradicted by ${m.contradictions_today} stories today`;
  const r = deriveKeyRisk(t).replace(/\.$/, "").trim();
  if (r.length <= 50) return r;
  const cut = r.slice(0, 48);
  return cut.slice(0, Math.max(cut.lastIndexOf(" "), 32)).trim() + "…";
}

// Short labels and glyphs for each scheduled-catalyst kind.
const CATALYST_META: Record<CatalystKind, { short: string; glyph: string }> = {
  "fomc":           { short: "FOMC",  glyph: "◆" },
  "cpi":            { short: "CPI",   glyph: "▣" },
  "pce":            { short: "PCE",   glyph: "▣" },
  "jobs":           { short: "Jobs",  glyph: "▦" },
  "gdp":            { short: "GDP",   glyph: "▤" },
  "nvda-earnings":  { short: "NVDA",  glyph: "▲" },
  "cloud-earnings": { short: "Cloud", glyph: "▲" },
  "semi-earnings":  { short: "Semis", glyph: "▲" },
  "bank-earnings":  { short: "Banks", glyph: "▲" },
  "opec":           { short: "OPEC+", glyph: "◉" },
  "treasury":       { short: "UST",   glyph: "◇" },
  "china":          { short: "China", glyph: "◈" },
};

// Market-wide upcoming-catalyst strip: the soonest scheduled events across the
// visible themes, with imminent (<=7d) events emphasized.
function CatalystRadarStrip({ catalysts }: { catalysts: RadarCatalyst[] }) {
  if (catalysts.length === 0) return null;
  return (
    <div className="mb-1.5 flex items-center gap-1.5 overflow-x-auto pb-0.5">
      <span className="text-[6.5px] font-bold uppercase tracking-[0.16em] text-ink-muted/40 shrink-0 pr-0.5">Upcoming</span>
      {isCatalystCalendarPlaceholder() && (
        <span title="Dates are indicative placeholders until a live calendar source is connected"
          className="text-[6.5px] font-semibold uppercase tracking-wide text-amber-500/55 shrink-0">est.</span>
      )}
      {catalysts.map(c => {
        const meta = CATALYST_META[c.kind];
        const clr  = c.imminent ? "#f59e0b" : "#818cf8";
        return (
          <span key={`${c.kind}-${c.date.getTime()}`}
            className="shrink-0 flex items-center gap-1.5 rounded-md border px-2 py-1"
            style={{ borderColor: `${clr}33`, background: `${clr}10` }}>
            <span className="text-[10px] leading-none" style={{ color: clr }}>{meta.glyph}</span>
            <span className="flex flex-col leading-none">
              <span className="text-[9.5px] font-bold text-ink">{meta.short}</span>
              <span className="text-[7px] text-ink-muted/55 tabular-nums mt-px">{c.dateLabel}{c.themeCount > 1 ? ` · ${c.themeCount} themes` : ""}</span>
            </span>
            <span className="text-[10px] font-black tabular-nums" style={{ color: clr }}>{countdownLabel(c.daysAway)}</span>
          </span>
        );
      })}
    </div>
  );
}

// Per-theme next-catalyst chips, the soonest dated events that move this theme,
// colored by whether they confirm or threaten the thesis.
function ThemeCatalystRow({ theme }: { theme: ThemeIntelligence }) {
  const cats = useMemo(() => generateNextCatalysts(theme).slice(0, 2), [theme]);
  if (cats.length === 0) return null;
  return (
    <div className="flex items-center gap-1.5 mt-1 flex-wrap min-w-0">
      <span className="text-[6.5px] font-bold uppercase tracking-wide text-indigo-400/55 shrink-0">Next</span>
      {cats.map(c => {
        const meta = CATALYST_META[c.kind];
        const clr  = c.imminent ? "#f59e0b" : c.direction === "confirming" ? "#10b981" : "#a78bfa";
        return (
          <span key={c.kind} title={c.reason}
            className="flex items-center gap-1 rounded px-1 py-px border"
            style={{ borderColor: `${clr}2e`, background: `${clr}12` }}>
            <span className="text-[8px]" style={{ color: clr }}>{c.direction === "confirming" ? "▲" : "⚑"}</span>
            <span className="text-[8.5px] font-bold text-ink-secondary">{meta.short}</span>
            <span className="text-[8.5px] font-black tabular-nums" style={{ color: clr }}>{countdownLabel(c.daysAway)}</span>
          </span>
        );
      })}
    </div>
  );
}

function ThemeCommandCenterBase({ themes, onThemeClick }: {
  themes:       ThemeIntelligence[];
  onThemeClick: (t: ThemeIntelligence) => void;
}) {
  const radar = useMemo(() => marketCatalystRadar(themes, new Date(), 5), [themes]);

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
        sub="conviction, exposure, and the next dated catalyst" />
      <CatalystRadarStrip catalysts={radar} />
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
              {/* BIG conviction, rounded, with the evidence that justifies it */}
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
                    style={{ color: d > 0 ? "#34d399" : d < 0 ? "#f87171" : "rgb(var(--ink-muted) / 0.6)" }}>
                    {d > 0 ? "▲" : d < 0 ? "▼" : ""}{d > 0 ? "+" : ""}{d}
                  </span>
                  <span className="ml-auto text-[6.5px] font-bold uppercase tracking-wide px-1 py-px rounded shrink-0
                                   bg-raised border border-edge text-ink-muted/55">{timeBucket(t)}</span>
                </div>
                {/* state + driver */}
                <div className="flex items-center gap-1.5 mt-0.5 text-[8.5px]">
                  <span className="font-bold uppercase tracking-wide" style={{ color: mm.color }}>{mm.label}</span>
                  <span className="text-ink-muted/25">·</span>
                  <span className="text-ink-muted/50 truncate"><span className="text-ink-muted/35">Driver</span> {themePrimaryDriver(t)}</span>
                </div>
                {/* who wins / who loses, prominent tickers */}
                <div className="flex items-center gap-1.5 mt-1 flex-wrap min-w-0">
                  {benef.length > 0 && (
                    <span className="flex items-center gap-1">
                      <span className="text-[6.5px] font-bold uppercase tracking-wide text-emerald-400/55">Wins</span>
                      {benef.map(tk => (
                        <TickerChip key={tk} ticker={tk} mono={false} className="text-[9.5px] font-bold tabular-nums px-1 py-px rounded bg-emerald-500/10 text-emerald-300 border border-emerald-500/20" />
                      ))}
                    </span>
                  )}
                  {losers && (
                    <span className="flex items-center gap-1">
                      <span className="text-[6.5px] font-bold uppercase tracking-wide text-red-400/55">Loses</span>
                      {losers.tickers.map(tk => (
                        <TickerChip key={tk} ticker={tk} mono={false} className="text-[9.5px] font-bold tabular-nums px-1 py-px rounded bg-red-500/8 text-red-400/90 border border-red-500/15" />
                      ))}
                    </span>
                  )}
                </div>
                {/* next dated catalysts */}
                <ThemeCatalystRow theme={t} />
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



// ── Transmission Map (market causality, the signature view) ──────────────────

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
function ThemeTransmissionBase({ themes, onNodeClick }: {
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

  const [open, setOpen] = useState(false);

  if (chains.length === 0) return null;

  const dirColor = (t: ThemeIntelligence) =>
    t.momentum_direction === "bullish" ? "#10b981"
    : t.momentum_direction === "bearish" ? "#ef4444" : "#64748b";

  return (
    <div className="mb-4">
      {/* Secondary view, collapsed by default; the chains restate exposure the
          Command Center already shows, so this is available on demand only. */}
      <button onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2 mb-2 group">
        <Network size={11} className="text-accent shrink-0" />
        <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-ink-secondary">Transmission Map</span>
        <span className="text-[9px] text-ink-muted">{chains.length} causal chains, macro driver to security</span>
        <span className="h-px flex-1 bg-edge" />
        <ChevronDown size={12} className={cn("text-ink-muted/45 transition-transform shrink-0", open ? "" : "-rotate-90")} />
      </button>
      {!open && (
        <button onClick={() => setOpen(true)}
          className="w-full flex items-center gap-1.5 flex-wrap rounded-lg border border-edge bg-surface px-3 py-2 hover:bg-raised/30 transition-colors">
          {chains.map((c, ci) => (
            <span key={ci} className="flex items-center gap-1 text-[9px]">
              {ci > 0 && <span className="text-ink-muted/20 mr-1">·</span>}
              <span className="font-semibold text-ink-secondary">{cleanThemeName(c.t.name)}</span>
              <span className="text-ink-muted/35">→</span>
              {c.tickers.slice(0, 2).map(tk => (
                <TickerChip key={tk} ticker={tk} mono={false} className="font-bold tabular-nums text-emerald-300/90" />
              ))}
            </span>
          ))}
        </button>
      )}
      {open && (
      <div className="rounded-xl border border-edge bg-surface divide-y divide-edge/50">
        {chains.map((c, ci) => {
          const clr = dirColor(c.t);
          return (
            <div key={ci} className="px-3 py-2.5 flex items-stretch gap-1 overflow-x-auto">
              {/* Macro Driver */}
              <ChainStage caption="Macro Driver" tone="#818cf8">{c.macro ?? "Macro backdrop"}</ChainStage>
              <ChainArrow color={clr} />
              {/* Theme, clickable */}
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
              {/* Securities, the expression */}
              <div className="shrink-0 rounded-md border border-emerald-500/25 bg-emerald-500/8 px-2.5 py-1.5 flex flex-col justify-center">
                <p className="text-[6.5px] font-bold uppercase tracking-[0.16em] text-emerald-300/70 mb-0.5">Securities</p>
                <div className="flex items-center gap-1">
                  {c.tickers.map(tk => (
                    <TickerChip key={tk} ticker={tk} mono={false} className="text-[11px] font-black tabular-nums text-emerald-300" />
                  ))}
                </div>
              </div>
            </div>
          );
        })}
      </div>
      )}
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
      // Memory weighting: a theme persistent/confirmed across sessions carries
      // more weight than a one-day spike; brand-new themes are discounted until
      // confirmation accumulates (themePersistenceWeight returns 1.0 with no memory).
      const w = (t.relationship_weights?.[sector]?.weight ?? 0.5) * (t.confidence ?? 0)
              * themePersistenceWeight(t);
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
    // Sector-specific securities first, so sectors sharing a lead theme differ.
    const exposures: string[] = securitiesForSector(sector);
    if (exposures.length === 0 && be?.tickers) exposures.push(...be.tickers);
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
  // Signal colors tuned for the dark workstation surface, bright enough to read
  // on #0A0F1C without being neon. Green = bullish, red = bearish.
  bullish: { label: "Bullish", color: "#34d399" },
  bearish: { label: "Bearish", color: "#f87171" },
  neutral: { label: "Neutral", color: "#94a3b8" },
} as const;



// ── SECTOR POSITIONING ────────────────────────────────────────────────────────

function OppBlock({ label, color, children }: { label: string; color?: string; children: React.ReactNode }) {
  return (
    <div className="mt-1.5">
      <p className="text-[7px] font-bold uppercase tracking-[0.16em] mb-0.5" style={{ color: color ?? "rgb(var(--ink-muted))" }}>{label}</p>
      {children}
    </div>
  );
}

// Sector Positioning, the single sector view. Every sector ranks here; tapping
// a row expands the full trade case (why it matters, what breaks it, the best
// expressions), so the old standalone "Opportunities" section folds in as
// progressive disclosure rather than a duplicate listing.
function SectorPositioningBase({ themes }: { themes: ThemeIntelligence[] }) {
  const positions = useMemo(() => computeSectorPositions(themes), [themes]);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  if (positions.length === 0) return null;
  const bull = positions.filter(p => p.direction === "bullish").length;

  return (
    <div className="mb-4">
      <SectionHeader label="Sector Positioning" icon={<BarChart2 size={11} className="text-accent shrink-0" />}
        sub={`${bull} bullish of ${positions.length} · expand for the trade`} />
      <div className="grid sm:grid-cols-2 gap-1.5 items-start">
        {positions.map((p, i) => {
          const dm     = DIR_META[p.direction];
          const isOpen = !!open[p.sector];
          const ct     = confTrend(p.leadDelta);
          return (
            <div key={p.sector} className="rounded-lg border border-edge bg-surface"
              style={{ borderLeft: `3px solid ${dm.color}` }}>
              <button onClick={() => setOpen(o => ({ ...o, [p.sector]: !o[p.sector] }))}
                className="w-full text-left px-3 py-2.5 hover:bg-raised/40 transition-colors">
                <div className="flex items-center gap-2.5 mb-1">
                  <span className="text-[13px] font-black tabular-nums text-ink-muted/55 shrink-0 w-6 text-center">{i + 1}</span>
                  <span className="text-[13.5px] font-black text-ink truncate flex-1 tracking-tight">{p.sector}</span>
                  <span className="text-[8px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded shrink-0"
                    style={{ color: dm.color, background: `${dm.color}1a` }}>{dm.label}</span>
                  <span className="text-[19px] font-black tabular-nums leading-none shrink-0" style={{ color: confColor(p.conviction) }}>{convScore(p.conviction)}</span>
                  <ChevronDown size={11} className={cn("text-ink-muted/40 transition-transform shrink-0", isOpen ? "" : "-rotate-90")} />
                </div>
                <div className="flex items-center gap-1.5 flex-wrap text-[9px] pl-[34px]">
                  <span className="text-ink-muted/55 font-bold uppercase tracking-wide text-[7.5px]">Driven by</span>
                  <span className="font-semibold text-ink-secondary">{p.drivers[0]}</span>
                  {p.drivers[1] && <><span className="text-ink-muted/25">·</span><span className="text-ink-muted/70">{p.drivers[1]}</span></>}
                </div>
                <div className="flex items-center gap-2 text-[9px] mt-0.5 pl-[34px]">
                  <span className="tabular-nums text-ink-muted/65"><span className="font-bold text-ink-secondary">{p.supportive} of {p.count}</span> supportive</span>
                  <span className="text-ink-muted/25">·</span>
                  <span className="font-bold" style={{ color: p.trendColor }}>{p.trend}</span>
                  {p.exposures.length > 0 && (
                    <span className="ml-auto flex items-center gap-1">
                      {p.exposures.slice(0, 3).map(tk => (
                        <TickerChip key={tk} ticker={tk} mono={false} className="text-[9px] font-bold tabular-nums px-1.5 py-px rounded bg-emerald-500/12 text-emerald-300 border border-emerald-500/25" />
                      ))}
                    </span>
                  )}
                </div>
              </button>

              {isOpen && (
                <div className="px-3 pb-2.5 pt-1 pl-10 border-t border-edge/50">
                  <div className="flex items-center gap-2 mt-1 text-[8px]">
                    <span className="font-bold" style={{ color: ct.color }}>{ct.arrow} {ct.label}</span>
                    <span className="text-ink-muted/25">·</span>
                    <span className="text-ink-muted/60">{p.horizon}</span>
                    <span className="text-ink-muted/25">·</span>
                    <span className="text-ink-muted/60 tabular-nums">{p.supportive}/{p.count} themes</span>
                  </div>

                  <OppBlock label="Why It Matters" color={p.direction === "bullish" ? "rgba(16,185,129,0.6)" : "rgba(148,163,184,0.7)"}>
                    <ul className="space-y-0.5">
                      {p.whyBullets.map((b, j) => (
                        <li key={j} className="flex items-start gap-1.5 text-[9.5px] text-ink-secondary leading-snug">
                          <span className="shrink-0 mt-[4px] w-1 h-1 rounded-full" style={{ background: dm.color, opacity: 0.6 }} />
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
                          <TickerChip key={tk} ticker={tk} mono={false} className="text-[11px] font-bold tabular-nums px-1.5 py-px rounded bg-emerald-500/10 text-emerald-300 border border-emerald-500/20" />
                        ))}
                      </div>
                      {p.expressWhy && <p className="text-[8.5px] text-ink-muted/60 leading-snug mt-1">{p.expressWhy}</p>}
                    </OppBlock>
                  )}
                </div>
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
          className="text-[11px] font-medium text-ink leading-snug line-clamp-2 hover:text-accent transition-colors">{cleanFilingTitle(p.title)}</a>
        <p className="text-[8px] text-ink-muted/55 mt-px truncate">
          {p.source}{p.published ? ` · ${p.published}` : ""}{cluster.story_count > 1 ? ` · +${cluster.story_count - 1}` : ""}
        </p>
      </div>
      <button onClick={() => onSave(p)}
        className={cn("p-1 rounded shrink-0 transition-opacity", saved ? "opacity-100" : "opacity-0 group-hover:opacity-100")}
        style={{ color: saved ? "#52b0c8" : "rgb(var(--ink-muted) / 0.55)" }}>
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

function EvidenceValidationBase({ themes, clusters, savedIds, onSave }: {
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

// Memoized section components: when the drawer opens (drawerData state changes
// on MarketsPage) these skip re-render entirely because their props (visible
// themes + stable callbacks) are unchanged, no recompute of sector positions,
// transmission chains, or beneficiary lookups.
const MarketSnapshot                = memo(MarketSnapshotBase);
const MarketPulseStrip              = memo(MarketPulseStripBase);
const DominantNarrative             = memo(DominantNarrativeBase);
const ThemeCommandCenter            = memo(ThemeCommandCenterBase);
const ThemeTransmission             = memo(ThemeTransmissionBase);
const SectorPositioning             = memo(SectorPositioningBase);
const EvidenceValidation            = memo(EvidenceValidationBase);

// Lightweight placeholder shown on first load so the page never flashes blank
// while the (cache-warmed) feed response is in flight.
function MarketsSkeleton() {
  return (
    <div className="animate-pulse space-y-3" aria-hidden>
      <div className="h-16 rounded-xl bg-raised/50 border border-edge" />
      <div className="h-9 rounded-lg bg-raised/40 border border-edge" />
      <div className="grid sm:grid-cols-2 gap-3">
        <div className="h-28 rounded-xl bg-raised/40 border border-edge" />
        <div className="h-28 rounded-xl bg-raised/40 border border-edge" />
      </div>
      <div className="h-40 rounded-xl bg-raised/30 border border-edge" />
    </div>
  );
}

export default function MarketsPage() {
  const [activeKey,  setActiveKey]  = useState<SnapshotKey | null>(null);
  const [drawerData, setDrawerData] = useState<DrawerData | null>(null);
  const clusterRef = useRef<HTMLDivElement>(null);

  const { data: marketData, meta: marketMeta, heartbeatStatus, marketOpen } = useMarketData();
  const { data, isLoading }       = useFeed({ use_ai: true });
  const { riskRegime, volRegime }                              = useMarketState();
  const { savedIds, toggleSave }                               = useSaved();
  const { followed, followedIds, isFollowed, toggle: toggleFollow, unfollow } = useFollowedThemes();

  const clusters      = useMemo(() => data?.clusters           ?? [], [data]);
  const themes        = useMemo(() => data?.theme_intelligence ?? [], [data]);

  const { alerts, dismiss: dismissAlert } = useThemeAlerts(themes);
  const cacheAge      = data?.cache_age_seconds;
  const derivedRegime = data?.sector_data?.derived_regime ?? "";
  const sectorData    = data?.sector_data ?? null;

  // Theme intelligence, computed once, shared by all sections
  const visible = useMemo(
    () => themes.filter(t => t.signal_strength === "strong" || t.signal_strength === "medium"),
    [themes],
  );
  const relMap = useMemo(() => buildThemeRelationshipMap(visible), [visible]);
  const contradictions = useMemo(
    () => detectContradictions(visible, sectorData, riskRegime, volRegime),
    [visible, sectorData, riskRegime, volRegime],
  );

  // Stable identity so memoized sections don't re-render when the drawer opens.
  const openDrawer = useCallback((t: ThemeIntelligence) => {
    dismissAlert(t.id);
    const rel = relMap.get(t.id);
    setDrawerData({
      theme:      t,
      upstream:   rel?.upstream   ?? [],
      downstream: rel?.downstream ?? [],
      connected:  rel?.connected  ?? [],
      conflicts:  contradictions.filter(c => c.themeIds.includes(t.id)),
    });
  }, [dismissAlert, relMap, contradictions]);

  const handleFollowToggle = useCallback((t: ThemeIntelligence) => {
    toggleFollow(t, cleanThemeName(t.name));
  }, [toggleFollow]);

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
    <div className="markets-dark min-h-screen" style={{ background: "rgb(var(--canvas))" }}>
      {/* Argus identity header, compact */}
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
                {timeAgo(marketMeta.fetchedAt)}
              </span>
            </div>
          )}
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 pb-8">

        {/* First-load skeleton, avoids a blank page before cache responds */}
        {isLoading && visible.length === 0 && <MarketsSkeleton />}

        {/* ══ 1. MARKET STATE, at-a-glance dashboard ══════════ */}
        <SectionHeader label="Market State" />
        <MarketSnapshot themes={visible} sectorData={sectorData} regime={derivedRegime} brief={data?.market_brief} />

        {/* ══ 2. DOMINANT NARRATIVE, the plain-language read, kept directly
            under the snapshot so the market view is graspable in one screen ══ */}
        <DominantNarrative brief={data?.market_brief} themes={visible} />

        {/* Live prices + regime, single strip (the standalone price tape
            duplicated these instruments and was removed) */}
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

        {/* Market internals + movers, secondary detail, below the headline read */}
        <MarketPulseStrip themes={visible} onThemeClick={openDrawer} />

        {/* ══ 3. THEME COMMAND CENTER, what's driving it + catalysts ══ */}
        <ThemeCommandCenter themes={visible} onThemeClick={openDrawer} />

        {/* ══ 4. SECTOR POSITIONING, where it matters + the trade ══ */}
        <SectorPositioning themes={visible} />

        {/* ══ 5. TRANSMISSION MAP, how it spreads (secondary, collapsed) ══ */}
        <ThemeTransmission themes={visible} onNodeClick={openDrawer} />

        {/* ══ 6. EVIDENCE VALIDATION, why we believe it ═══════ */}
        <div ref={clusterRef} className="mb-4">
          <EvidenceValidation
            themes={visible}
            clusters={clusters}
            savedIds={savedIds}
            onSave={(item) => toggleSave(item)}
          />
        </div>

        {/* Watchlist, personal tracking, below the core workflow */}
        <WatchlistPanel
          followed={followed}
          liveThemes={visible}
          onOpenTheme={openDrawer}
          onUnfollow={unfollow}
          alerts={watchlistAlerts}
        />

      </div>

      {/* Shared drawer, opened by theme cards, watchlist, and chain nodes */}
      <ThemeDetailDrawer
        data={drawerData}
        onClose={() => setDrawerData(null)}
        isFollowed={drawerData ? isFollowed(drawerData.theme.id) : false}
        onToggleFollow={() => drawerData && handleFollowToggle(drawerData.theme)}
      />
    </div>
  );
}
