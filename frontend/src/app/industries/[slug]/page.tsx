"use client";

import dynamic from "next/dynamic";
import { useState, useMemo } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { motion } from "framer-motion";
import {
  ChevronLeft, TrendingUp, TrendingDown, Minus,
  AlertTriangle, BarChart3, Zap,
  Radio, ShieldAlert, Target, Shuffle, RefreshCw,
  Headphones, ArrowUpRight, Activity, Network, Building2, Sprout,
} from "lucide-react";
import { cn, formatRelativeAge } from "@/lib/utils";
import { TickerChip } from "@/components/common/TickerChip";
import { SessionExpired } from "@/components/common/SessionExpired";
import { useSeriesBatch } from "@/lib/platform/hooks/useSeriesBatch";
import { buildTapeQuote, type TapeQuote } from "@/lib/industryTape";
import { useSectors } from "@/hooks/useSectors";
import { useFeed } from "@/hooks/useFeed";
import { useMAIntelligence } from "@/hooks/useMAIntelligence";
import {
  getIndustryBySlug,
  getSectorIntelligence,
  getIndustrySignals,
  getTopTheme,
  filterIndustryClusters,
} from "@/lib/industryConfig";
import {
  getLiveDevelopments,
  getMomentumState,
  type LiveDevelopment,
  type LeadershipDynamics,
  type MomentumState,
} from "@/lib/sectorIntelligence";
import { useArgusIntelligence } from "@/hooks/useArgusIntelligence";
import { buildIndustriesIntel, type SectorIntelVM } from "@/lib/industriesIntel";
import { type IntelligenceProfile } from "@/lib/intelligenceProfile";
import { cachedProfile } from "@/lib/profileCache";
import { buildRiskRead, type RiskRead } from "@/lib/riskRead";
import { deriveNarratives } from "@/lib/narrativeDerivation";
import { deriveMorningBriefDeltas } from "@/lib/intelligenceDeltas";
import { getTrackedThemes } from "@/lib/themeSnapshots";
import { explorerHrefForNode } from "@/lib/intelligenceShared";
import type { IndustrySignal, StoryCluster, ThemeIntelligence } from "@/lib/types";
import { getThemesForIndustry } from "@/lib/themeGraph";
import { getThemeBeneficiaries, getThemeHeadwinds } from "@/lib/themeImpact";
import {
  getInfluentialEntities,
  filterVCFundingClusters,
  getIndustrySponsorDeals,
  getIndustryAcquirers,
  getIndustrySponsors,
  getMatchingTheme,
  type EntitySignal,
  type SectorDealItem,
  type IndustryAcquirer,
  type IndustrySponsor,
} from "@/lib/industryIntelligence";
import { computeThemeEvolutionState, THEME_EVOLUTION_META } from "@/lib/themeEvolution";
// P2.7 perf: the drawer only mounts on open - load it on demand.
const ThemeDrawer = dynamic(() => import("@/components/themes/ThemeDrawer").then(m => m.ThemeDrawer), { ssr: false });
import { useThemeWatchlist } from "@/hooks/useThemeWatchlist";
import { IndustryArtwork, industryIcon } from "@/components/industries/industryIdentity";
import { cleanThemeName, cleanMacroLabel } from "@/app/markets/marketsShared";
import type { IndustryConfig } from "@/lib/industryConfig";
import { industriesOfSector, sectorExposure } from "@/lib/sectorTaxonomy";
import { intelligenceGraph, normalizeKey } from "@/lib/intelligenceGraph";
import { buildSectorForwardView, forwardViewSentence, sectorPriceProxy } from "@/lib/sectorForward";
import { measureSector } from "@/lib/marketRotation";
import { SECTOR_BENCHMARK } from "@/lib/marketBlocks";

// ── Regime badge (dark-hero variant) ─────────────────────────────────────────

const REGIME_DARK: Record<string, { cls: string; label: string }> = {
  "Risk-Off Hawkish":      { cls: "bg-red-500/20    text-red-300    border-red-400/30",     label: "Risk-Off · Hawkish" },
  "Risk-Off Neutral":      { cls: "bg-orange-500/20 text-orange-300 border-orange-400/30",  label: "Risk-Off · Neutral" },
  "Risk-On Dovish":        { cls: "bg-emerald-500/20 text-emerald-300 border-emerald-400/30", label: "Risk-On · Dovish"  },
  "Risk-On Neutral":       { cls: "bg-blue-500/20   text-blue-300   border-blue-400/30",    label: "Risk-On · Neutral"  },
  "Stagflationary":        { cls: "bg-amber-500/20  text-amber-300  border-amber-400/30",   label: "Stagflationary"     },
  "Neutral/Consolidating": { cls: "bg-slate-500/20  text-slate-300  border-slate-400/30",   label: "Neutral"            },
};

// ── Section label ─────────────────────────────────────────────────────────────

function SectionHeader({ icon: Icon, children }: {
  icon: React.FC<{ size?: number; className?: string; strokeWidth?: number }>;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2.5 mb-4">
      <Icon size={11} className="text-ink-secondary shrink-0" strokeWidth={2} />
      <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-ink">
        {children}
      </span>
      <span className="h-px flex-1 bg-edge" />
    </div>
  );
}

// ── Sentiment meta ────────────────────────────────────────────────────────────

const SENTIMENT = {
  bullish: { label: "Bullish", Icon: TrendingUp,    heroText: "text-emerald-300", bg: "bg-emerald-500/20 border-emerald-400/30 text-emerald-300" },
  bearish: { label: "Bearish", Icon: TrendingDown,  heroText: "text-red-300",     bg: "bg-red-500/20    border-red-400/30    text-red-300"     },
  mixed:   { label: "Mixed",   Icon: AlertTriangle, heroText: "text-amber-300",   bg: "bg-amber-500/20  border-amber-400/30  text-amber-300"   },
  neutral: { label: "Neutral", Icon: Minus,         heroText: "text-white/50",    bg: "bg-white/10      border-white/20       text-white/60"    },
} as const;

// ── Story row ─────────────────────────────────────────────────────────────────

function StoryRow({ cluster, color }: { cluster: StoryCluster; color: string }) {
  const item = cluster.primary;
  const signalCls =
    item.signal_strength === "strong" ? "text-emerald-600 bg-emerald-50 border-emerald-100" :
    item.signal_strength === "medium" ? "text-amber-600   bg-amber-50   border-amber-100"   :
                                        "text-ink-muted   bg-raised     border-edge";
  return (
    <a
      href={item.url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-start gap-2.5 group py-2.5 border-b border-edge/50 last:border-0"
    >
      <span
        className="w-[2.5px] shrink-0 self-stretch rounded-full"
        style={{ background: `${color}60` }}
      />
      <div className="flex-1 min-w-0 space-y-1">
        <p className="text-[12px] font-medium text-ink leading-snug line-clamp-2 group-hover:text-accent transition-colors">
          {item.title}
        </p>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-ink-muted">{item.source}</span>
          <span className={cn(
            "text-[8.5px] font-bold uppercase tracking-wide px-1.5 py-px rounded border",
            signalCls,
          )}>
            {item.signal_strength}
          </span>
          {cluster.related.length > 0 && (
            <span className="text-[9.5px] text-ink-muted/70">
              +{cluster.related.length} related
            </span>
          )}
        </div>
      </div>
      <ArrowUpRight size={10} className="text-ink-muted/30 group-hover:text-accent transition-colors shrink-0 mt-0.5" />
    </a>
  );
}

// ── Industry deal row (M&A / sponsor deals) ───────────────────────────────────

function IndustryDealRow({ deal, color }: { deal: SectorDealItem; color: string }) {
  return (
    <a
      href={deal.url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-start gap-2.5 group py-2.5 border-b border-edge/50 last:border-0"
    >
      <span className="w-[2.5px] shrink-0 self-stretch rounded-full" style={{ background: `${color}60` }} />
      <div className="flex-1 min-w-0 space-y-1">
        <p className="text-[12px] font-medium text-ink leading-snug line-clamp-2 group-hover:text-accent transition-colors">
          {deal.title}
        </p>
        <div className="flex items-center gap-1.5 flex-wrap">
          {deal.peFirm && (
            <span className="text-[9.5px] text-ink-muted/80 font-medium">{deal.peFirm}</span>
          )}
          <span className="text-[8.5px] font-bold uppercase tracking-wide px-1.5 py-px rounded border border-edge text-ink-muted/60 bg-raised">
            {deal.dealType}
          </span>
          {deal.entities.slice(0, 3).map(e => (
            <span key={e} className="text-[8.5px] font-mono font-bold px-1 py-px rounded leading-none" style={{ color, background: `${color}14` }}>
              {e}
            </span>
          ))}
        </div>
      </div>
      <ArrowUpRight size={10} className="text-ink-muted/30 group-hover:text-accent transition-colors shrink-0 mt-0.5" />
    </a>
  );
}

// ── Theme cluster row ─────────────────────────────────────────────────────────

function ThemeRow({ cluster, theme, color, index }: { cluster: StoryCluster; theme: ThemeIntelligence; color: string; index: number }) {
  const score     = cluster.cluster_score;
  const scoreColor = score >= 70 ? "#10b981" : score >= 40 ? "#f59e0b" : color;
  return (
    <motion.div
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: 0.1 + index * 0.06, duration: 0.22, ease: "easeOut" }}
      className="flex items-start gap-3 py-2 border-b border-edge/40 last:border-0"
    >
      <div
        className="w-1 self-stretch rounded-full shrink-0"
        style={{ background: `${scoreColor}60` }}
      />
      <div className="flex-1 min-w-0">
        <p className="text-[12px] font-semibold text-ink leading-tight mb-0.5">
          {theme.name}
        </p>
        <p className="text-[10px] text-ink-muted">
          {cluster.story_count} {cluster.story_count === 1 ? "story" : "stories"}
          {cluster.primary.affected_entities.length > 0 && (
            <span> · {cluster.primary.affected_entities.slice(0, 3).join(", ")}</span>
          )}
        </p>
      </div>
      <span
        className="text-[12px] font-black tabular-nums shrink-0"
        style={{ color: scoreColor }}
      >
        {score.toFixed(0)}
      </span>
    </motion.div>
  );
}

// ── Macro driver chip ─────────────────────────────────────────────────────────

function DriverChip({ label, color }: { label: string; color: string }) {
  return (
    <span
      className="text-[9.5px] font-bold px-2.5 py-1 rounded-lg leading-none"
      style={{ color, background: `${color}12` }}
    >
      {label}
    </span>
  );
}

// ── Industry signal bar ───────────────────────────────────────────────────────

function IndustryBar({ sig, max, color }: { sig: IndustrySignal; max: number; color: string }) {
  const pct = max > 0 ? (sig.signal_score / max) * 100 : 0;
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] text-ink-secondary truncate">{sig.name}</span>
        <span className="text-[10px] font-mono text-ink-muted tabular-nums shrink-0">
          {sig.signal_score.toFixed(0)}
        </span>
      </div>
      <div className="h-[2.5px] rounded-full bg-raised overflow-hidden">
        <motion.div
          className="h-full rounded-full"
          style={{ background: `${color}80` }}
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.6, ease: "easeOut", delay: 0.2 }}
        />
      </div>
    </div>
  );
}

// ── Momentum state badge ──────────────────────────────────────────────────────

const MOMENTUM_META: Record<MomentumState, { label: string; cls: string }> = {
  accelerating:  { label: "Accelerating",  cls: "text-emerald-300 bg-emerald-500/15 border-emerald-400/30" },
  broadening:    { label: "Broadening",    cls: "text-emerald-300 bg-emerald-500/10 border-emerald-400/25" },
  stabilizing:   { label: "Stabilizing",   cls: "text-sky-300    bg-sky-500/15     border-sky-400/30"    },
  consolidating: { label: "Consolidating", cls: "text-white/40   bg-white/5        border-white/15"      },
  fading:        { label: "Fading",        cls: "text-amber-300  bg-amber-500/15   border-amber-400/30"  },
  reversing:     { label: "Reversing",     cls: "text-red-300    bg-red-500/15     border-red-400/30"    },
};

// ── Live developments section ─────────────────────────────────────────────────

const DEV_TYPE_COLOR: Record<LiveDevelopment["type"], string> = {
  live:       "#10b981",
  macro:      "#f59e0b",
  structural: "#64748b",
  risk:       "#ef4444",
};

const DEV_TYPE_LABEL: Record<LiveDevelopment["type"], string> = {
  live:       "live",
  macro:      "macro",
  structural: "structural",
  risk:       "risk",
};

function LiveDevelopmentsSection({ developments }: { developments: LiveDevelopment[] }) {
  if (developments.length === 0) return null;
  return (
    <ul className="space-y-2">
      {developments.map((dev, i) => (
        <motion.li
          key={i}
          initial={{ opacity: 0, x: -6 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.04 + i * 0.035, duration: 0.2, ease: "easeOut" }}
          className="flex items-start gap-2.5"
        >
          <span
            className="text-[7px] mt-[5px] shrink-0 leading-none select-none"
            style={{ color: DEV_TYPE_COLOR[dev.type] }}
          >
            ●
          </span>
          <p className="text-[12px] text-ink-secondary leading-relaxed flex-1">{dev.text}</p>
          <span
            className="text-[7.5px] font-bold uppercase tracking-wide shrink-0 mt-[3px] opacity-50"
            style={{ color: DEV_TYPE_COLOR[dev.type] }}
          >
            {DEV_TYPE_LABEL[dev.type]}
          </span>
        </motion.li>
      ))}
    </ul>
  );
}

// ── Leadership / laggards section ─────────────────────────────────────────────

const LEADERSHIP_STATE_META: Record<LeadershipDynamics["state"], { label: string; color: string }> = {
  accelerating:  { label: "Momentum Accelerating", color: "#10b981" },
  broadening:    { label: "Breadth Broadening",    color: "#10b981" },
  stabilizing:   { label: "Leadership Stable",     color: "#38bdf8" },
  rotating:      { label: "Rotation Active",       color: "#f59e0b" },
  narrowing:     { label: "Breadth Narrowing",     color: "#f97316" },
  consolidating: { label: "Consolidating",         color: "#94a3b8" },
};

function LeadershipSection({ leadership, color }: { leadership: LeadershipDynamics; color: string }) {
  const stateMeta = LEADERSHIP_STATE_META[leadership.state];
  const hasData   = leadership.leaders.length > 0 || leadership.laggards.length > 0;
  if (!hasData) return null;

  return (
    <div className="space-y-3">
      {/* State badge */}
      <div className="flex items-center gap-2">
        <span
          className="text-[8.5px] font-bold uppercase tracking-[0.12em] px-2 py-[3px] rounded-full border"
          style={{ color: stateMeta.color, background: `${stateMeta.color}14`, borderColor: `${stateMeta.color}35` }}
        >
          {stateMeta.label}
        </span>
      </div>

      {/* Leaders */}
      {leadership.leaders.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[9px] font-bold text-emerald-400/80 shrink-0 w-14">↑ Leading</span>
          {leadership.leaders.map(t => (
            <span
              key={t}
              className="text-[9.5px] font-bold font-mono px-1.5 py-0.5 rounded leading-none"
              style={{ color: "#10b981", background: "#10b98118" }}
            >
              {t}
            </span>
          ))}
        </div>
      )}

      {/* Laggards */}
      {leadership.laggards.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[9px] font-bold text-red-400/80 shrink-0 w-14">↓ Lagging</span>
          {leadership.laggards.map(t => (
            <span
              key={t}
              className="text-[9.5px] font-bold font-mono px-1.5 py-0.5 rounded leading-none"
              style={{ color: "#ef4444", background: "#ef444418" }}
            >
              {t}
            </span>
          ))}
        </div>
      )}

      {/* Improving */}
      {leadership.improving.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[9px] font-bold shrink-0 w-14" style={{ color: color + "aa" }}>↗ Improving</span>
          {leadership.improving.map(t => (
            <span
              key={t}
              className="text-[9.5px] font-bold font-mono px-1.5 py-0.5 rounded leading-none"
              style={{ color, background: `${color}14` }}
            >
              {t}
            </span>
          ))}
        </div>
      )}

      {/* Explanation */}
      <p className="text-[10.5px] text-ink-muted leading-relaxed pt-0.5">
        {leadership.explanation}
      </p>
    </div>
  );
}

// ── Industry market tape ──────────────────────────────────────────────────────
// A scrolling ticker of the industry's key symbols, quoted from REAL end-of-day closes (the
// same canonical price route the company hero uses). Each symbol shows its last close, the
// day's move against the prior close, and a sparkline drawn from its ACTUAL recent closes.
// The data is end-of-day, so the tape is labeled delayed / at close and never animates a fake
// tick. Symbols the price route cannot serve are omitted, never invented.

function IndustryTape({ tickers }: { tickers: string[] }) {
  const uniq = useMemo(
    () => Array.from(new Set(tickers.map((t) => t.toUpperCase()).filter(Boolean))).slice(0, 12),
    [tickers],
  );
  // ~45 calendar days back gives enough trading sessions for a 14-point sparkline + a prior close.
  const from = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 45);
    return d.toISOString().slice(0, 10);
  }, []);
  const batchSymbols = useMemo(() => uniq.map((symbol) => ({ symbol })), [uniq]);
  const batch = useSeriesBatch(batchSymbols, { from });

  // Keep only symbols with real closes behind them — honest omission, never a placeholder.
  const available: { sym: string; q: TapeQuote }[] = [];
  for (const sym of uniq) {
    const q = buildTapeQuote(batch[sym]?.series);
    if (q) available.push({ sym, q });
  }
  if (available.length === 0) return null;

  // One oversized group (repeated to ≥18) so a single group exceeds any viewport; two identical
  // groups translated -50% = a seamless loop. Duration ∝ width → constant px/s regardless of count.
  const group = [...available];
  while (group.length < 18) group.push(available[group.length % available.length]);
  const durationS = group.length * 2.7;

  const renderSym = (item: { sym: string; q: TapeQuote }, k: string, i: number) => {
    const { sym, q } = item;
    const col = q.up ? "#34d399" : "#f87171";
    const showSpark = i % 5 === 4;
    return (
      <span key={k} className="inline-flex items-baseline gap-2.5 px-[26px] shrink-0">
        <span className="text-[13px] font-bold font-mono tracking-tight" style={{ color: "rgba(255,255,255,0.92)" }}>{sym}</span>
        <span className="text-[8.5px]" style={{ color: col }}>{q.up ? "▲" : "▼"}</span>
        <span className="text-[13px] font-semibold font-mono tabular-nums inline-block text-right" style={{ color: "rgba(255,255,255,0.78)", minWidth: 48 }}>{q.price.toFixed(2)}</span>
        <span className="text-[12.5px] font-bold font-mono tabular-nums inline-block text-right" style={{ color: col, minWidth: 52 }}>{q.up ? "+" : ""}{q.pct.toFixed(2)}%</span>
        {showSpark && (
          <svg width={30} height={11} viewBox="0 0 30 11" className="self-center" aria-hidden style={{ opacity: 0.42 }}>
            <polyline points={q.spark} fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth={1} strokeLinejoin="round" strokeLinecap="round" />
          </svg>
        )}
        <span className="text-[8px] pl-1 self-center" style={{ color: "rgba(255,255,255,0.16)" }}>•</span>
      </span>
    );
  };

  return (
    <div>
      <div className="relative overflow-hidden border-y border-white/[0.07]"
        style={{ maskImage: "linear-gradient(90deg, transparent, #000 4%, #000 96%, transparent)", WebkitMaskImage: "linear-gradient(90deg, transparent, #000 4%, #000 96%, transparent)" }}>
        <div className="flex items-stretch py-2 whitespace-nowrap tg-tape"
          style={{ width: "max-content", animationDuration: `${durationS}s` }}>
          <div className="flex items-center">{group.map((it, i) => renderSym(it, `a${i}`, i))}</div>
          <div className="flex items-center" aria-hidden>{group.map((it, i) => renderSym(it, `b${i}`, i))}</div>
        </div>
      </div>
      <p className="px-[26px] pt-1 text-right text-[8px] font-semibold uppercase tracking-[0.15em] text-white/30">
        End-of-day prices · delayed
      </p>
    </div>
  );
}

// ── Active theme card (clean, scannable — primary content column) ──────────────

function ActiveThemeCard({ theme, color, onOpen }: {
  theme: ThemeIntelligence; color: string; onOpen: () => void;
}) {
  // Current-state badge only (single snapshot); narrative text is PIPELINE
  // fields only - the editorial getEvolutionNarrative fallback retired (P2.5).
  const evState = computeThemeEvolutionState(theme);
  const evMeta  = THEME_EVOLUTION_META[evState];
  const benef   = getThemeBeneficiaries(theme).slice(0, 4);
  const narrative = (theme.second_order_effects?.[0] || theme.description || "").trim();
  const convColor = theme.confidence >= 70 ? "#10b981" : theme.confidence >= 45 ? "#f59e0b" : "#94a3b8";
  const strengthCls =
    theme.signal_strength === "strong" ? "text-emerald-600 bg-emerald-50 border-emerald-200" :
    theme.signal_strength === "medium" ? "text-amber-600  bg-amber-50  border-amber-200"   :
                                         "text-ink-muted  bg-raised    border-edge";
  return (
    <button type="button" onClick={onOpen}
      className="group text-left bg-surface rounded-xl border border-edge p-4 transition-all hover:border-edge-strong hover:shadow-card-hover w-full">
      {/* Name */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <h4 className="text-[15px] font-black text-ink leading-tight tracking-tight group-hover:text-accent transition-colors">
          {cleanThemeName(theme.name)}
        </h4>
        <span className="shrink-0 text-[20px] font-black tabular-nums leading-none" style={{ color: convColor }}>
          {theme.confidence}
        </span>
      </div>
      {/* State chips */}
      <div className="flex items-center gap-1.5 flex-wrap mb-2.5">
        <span className="text-[8.5px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded border"
          style={{ color: evMeta.color, background: evMeta.bg, borderColor: evMeta.border }}
          title="Current-state badge from today's snapshot - not cross-session history (ThemeMemory owns evolution)">
          {evMeta.label}
        </span>
        {theme.confidence_label && (
          <span className="text-[8.5px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded border" style={{ color, background: `${color}12`, borderColor: `${color}28` }}>
            {theme.confidence_label}
          </span>
        )}
        <span className={cn("text-[8.5px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded border", strengthCls)}>
          {theme.signal_strength}
        </span>
      </div>
      {/* Beneficiaries */}
      {benef.length > 0 && (
        <div className="flex items-center gap-1.5 flex-wrap mb-2.5">
          <span className="text-[8px] font-bold uppercase tracking-[0.14em] text-ink-muted/55">Beneficiaries</span>
          {benef.map(a => (
            <span key={a} className="text-[10px] font-bold font-mono px-1.5 py-0.5 rounded leading-none" style={{ color, background: `${color}12` }}>{a}</span>
          ))}
        </div>
      )}
      {/* Narrative */}
      {narrative && (
        <p className="text-[11.5px] text-ink-secondary leading-relaxed mb-2.5 line-clamp-2">{narrative}</p>
      )}
      {/* Footer: momentum + sources — each a single named metric, not one label standing in
          for two different numbers. */}
      <div className="flex items-center gap-2 pt-2 border-t border-edge/50">
        <span className="text-[9.5px] font-bold tabular-nums" style={{ color: convColor }}>
          {theme.momentum_delta > 0 ? "+" : ""}{theme.momentum_delta} momentum
        </span>
        <span className="text-ink-muted/30">·</span>
        <span className="text-[9.5px] font-medium text-ink-muted tabular-nums">{theme.evidence_count || 0} sources</span>
        <ArrowUpRight size={11} className="ml-auto text-ink-muted/25 group-hover:text-accent transition-colors" />
      </div>
    </button>
  );
}

// ── Industry Transmission Map ─────────────────────────────────────────────────
// Reinforces that an industry does not exist in isolation: each row is a
// Macro Driver → Theme → {this industry} → Companies chain, built from the
// industry's live themes (structural fallback from config when the feed is thin).

interface TransmissionRow { driver: string; theme: string; tickers: string[] }

// STORED-FIELD chains only (theme macro factor -> theme -> recorded assets).
// P2.5: the fabricated "structural demand / capital cycle" fallback rows are
// deleted - when no theme records exposure, the map renders nothing rather
// than an invented chain. The dictionary-backed themeBeneficiaries tail is
// replaced by the theme's own recorded assets (D11 narrowing).
function buildTransmissionRows(industry: IndustryConfig, themes: ThemeIntelligence[]): TransmissionRow[] {
  const keyset = new Set(industry.keyAssets.map(a => a.toUpperCase()));
  const isTicker = (s: string) => /^[A-Z][A-Z.]{0,5}$/.test(s);
  return themes.slice(0, 3).flatMap(t => {
    const macro = (t.related_macro_factors ?? [])[0];
    const benef = (t.related_assets ?? []).filter(isTicker);
    const inInd = benef.filter(tk => keyset.has(tk.toUpperCase()));
    const tickers = (inInd.length > 0 ? inInd : benef).slice(0, 4);
    if (!macro || tickers.length === 0) return [];
    return [{ driver: cleanMacroLabel(macro), theme: cleanThemeName(t.name), tickers }];
  });
}

function IndustryTransmissionMap({ industry, themes }: { industry: IndustryConfig; themes: ThemeIntelligence[] }) {
  const rows = buildTransmissionRows(industry, themes);
  if (rows.length === 0) return null;
  const c = industry.color;
  const Step = ({ children, role }: { children: React.ReactNode; role: string }) => (
    <div className="min-w-0">
      <p className="text-[7.5px] font-bold uppercase tracking-[0.18em] text-ink-muted/55 mb-1">{role}</p>
      {children}
    </div>
  );
  const Arrow = () => <span className="self-center text-[15px] font-semibold px-1 shrink-0" style={{ color: `${c}66` }}>→</span>;
  return (
    <div className="bg-surface rounded-xl border border-edge p-5">
      <div className="flex items-center gap-2 mb-3">
        <Network size={11} className="shrink-0" style={{ color: c }} />
        <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-ink">Industry Transmission Map</span>
        <span className="h-px flex-1 bg-edge" />
        <span className="text-[8.5px] font-semibold uppercase tracking-[0.1em] text-ink-muted/50"
          title="Stored pipeline fields (theme macro factor, recorded assets); the recorded graph path renders in the Recorded Transmission card">
          driver → theme → {industry.shortName} → expressions · stored-field read</span>
      </div>
      <div className="divide-y divide-edge/55">
        {rows.map((r, i) => (
          <div key={i} className="grid items-center py-3"
            style={{ gridTemplateColumns: "minmax(92px,140px) auto minmax(150px,1fr) auto 92px auto minmax(120px,auto)" }}>
            <Step role="Driver">
              <span className="text-[11px] font-semibold text-ink-muted leading-tight line-clamp-2">{r.driver}</span>
            </Step>
            <Arrow />
            <Step role="Theme">
              {/* Theme is the dominant element — largest type, industry accent */}
              <span className="text-[16px] sm:text-[17px] font-black leading-[1.1] line-clamp-2 tracking-tight"
                style={{ color: industry.color, textWrap: "balance" } as React.CSSProperties}>{r.theme}</span>
            </Step>
            <Arrow />
            <Step role="Lands on">
              <span className="inline-flex items-center text-[11px] font-bold leading-tight px-1.5 py-0.5 rounded"
                style={{ color: c, background: `${c}12`, border: `1px solid ${c}26` }}>{industry.shortName}</span>
            </Step>
            <Arrow />
            <Step role="Expressions">
              <span className="inline-flex flex-wrap items-center gap-1">
                {r.tickers.map(tk => (
                  <TickerChip key={tk} ticker={tk} mono={false} color={c}
                    className="text-[10px] font-bold font-mono leading-none px-1.5 py-0.5 rounded"
                    style={{ background: `${c}10` }} />
                ))}
              </span>
            </Step>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Loading skeleton ──────────────────────────────────────────────────────────

function DetailSkeleton({ color: _color }: { color: string }) {
  return (
    <div className="min-h-screen bg-canvas">
      <div
        className="h-[280px]"
        style={{ background: "linear-gradient(135deg, #090F21 0%, #0F1A3D 55%, #1A2B5F 100%)" }}
      />
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="bg-surface rounded-xl border border-edge p-5 space-y-3">
            <div className="h-3 w-32 bg-raised rounded animate-pulse" />
            <div className="space-y-2">
              <div className="h-2.5 w-full bg-raised rounded animate-pulse" />
              <div className="h-2.5 w-5/6 bg-raised rounded animate-pulse" />
              <div className="h-2.5 w-4/5 bg-raised rounded animate-pulse" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function IndustryDetailPage() {
  const [drawerTheme, setDrawerTheme] = useState<ThemeIntelligence | null>(null);

  const params   = useParams();
  const slug     = Array.isArray(params?.slug) ? params.slug[0] : (params?.slug ?? "");
  const industry = getIndustryBySlug(slug);
  const { isWatched, toggle: toggleThemeWatch } = useThemeWatchlist();

  const { sectorData, regime, clusters, isLoading, isFetching, isUnauthorized, cacheAge } = useSectors();
  const derivedRegime = sectorData?.derived_regime ?? "";
  const { data: feedData } = useFeed({});
  const whatMattersNow = feedData?.what_matters_now ?? [];
  const { deals: maDeals } = useMAIntelligence();

  // Shared intelligence (Phase 2.5): the sector projects the SAME profile /
  // risk / ledger / narrative reads Explorer shows for the Sector entity.
  const argus = useArgusIntelligence();
  const sectorKey = industry?.sector ?? "";
  const si = useMemo<SectorIntelVM | null>(() => {
    if (!sectorKey) return null;
    const profiles = new Map<string, IntelligenceProfile>();
    const risks = new Map<string, RiskRead>();
    if (argus.ready) profiles.set(sectorKey.toLowerCase(), cachedProfile(sectorKey));
    risks.set(sectorKey.toLowerCase(), buildRiskRead(sectorKey));
    // RC2-G4: the upstream causal chain lives on the CARRYING INDUSTRY
    // (Macro -> Theme -> Industry). The Sector node cannot see the macro head,
    // which sits three hops away through the structural belongs_to edge.
    const industryProfiles = new Map<string, IntelligenceProfile>();
    if (argus.ready) {
      for (const ind of industriesOfSector(sectorKey)) {
        const node = intelligenceGraph.getNodeOfType(ind, "Industry");
        if (node) industryProfiles.set(ind.toLowerCase(), cachedProfile(node.id));
      }
    }
    const dr = deriveMorningBriefDeltas({ themes: argus.themes, previouslyTracked: getTrackedThemes(), graphReady: argus.ready });
    const vm = buildIndustriesIntel({
      sectors: [sectorKey], themes: argus.themes, profiles, risks, industryProfiles,
      narratives: argus.ready ? deriveNarratives() : [],
      deltas: dr.deltas, graphReady: argus.ready,
    });
    return vm.sectors.data?.[0] ?? null;
  }, [sectorKey, argus.themes, argus.ready]);

  // ── RC2-G2: Sector Forward View ────────────────────────────────────────────
  // A projection, not a prediction: recorded thematic exposure (through the
  // canonical Industry hierarchy), qualified by the pipeline's own support
  // fields, reconciled against the sector's measured leadership from the frozen
  // Market-surface engine. No model, no score, no percentage.
  const forwardProxy = sectorKey ? sectorPriceProxy(sectorKey) : null;
  const forwardFrom = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 66);   // ~1M window, doubled, matching the Market surface
    return d.toISOString().slice(0, 10);
  }, []);
  const forwardSymbols = useMemo(
    () => (forwardProxy ? [{ symbol: forwardProxy }, SECTOR_BENCHMARK] : []),
    [forwardProxy],
  );
  const forwardSeries = useSeriesBatch(forwardSymbols, { from: forwardFrom });
  const forwardView = useMemo(() => {
    if (!sectorKey || !argus.ready) return null;
    const proxyPts = forwardProxy ? forwardSeries[forwardProxy]?.series?.points ?? null : null;
    const benchPts = forwardSeries[SECTOR_BENCHMARK.symbol]?.series?.points ?? null;
    const leadership = proxyPts && benchPts ? measureSector(proxyPts, benchPts) : null;
    return buildSectorForwardView({
      sector: sectorKey,
      exposure: sectorExposure(sectorKey),
      themes: argus.themes,
      leadership,
      chain: si?.transmission ?? null,
      chainVia: si?.transmissionVia ?? null,
    });
  }, [sectorKey, argus.ready, argus.themes, forwardProxy, forwardSeries, si?.transmission, si?.transmissionVia]);

  // The canonical one-line read for the hero, when the projection resolves.
  const forwardSentence = forwardView && forwardView.reconciliation !== "unavailable"
    ? forwardViewSentence(forwardView)
    : null;

  // Not found state
  if (!industry) {
    return (
      <div className="min-h-screen bg-canvas flex items-center justify-center">
        <div className="text-center space-y-3">
          <p className="text-sm text-ink-muted">Industry not found</p>
          <Link
            href="/industries"
            className="inline-flex items-center gap-1.5 text-sm text-accent hover:underline"
          >
            <ChevronLeft size={14} /> Back to Industries
          </Link>
        </div>
      </div>
    );
  }

  // Resolved unauthenticated → sign-in, NOT a permanent skeleton (precedence
  // over loading). Initial auth restoration still shows the skeleton below.
  if (isUnauthorized) return <SessionExpired label="Sign in to view this industry." />;

  if (isLoading) return <DetailSkeleton color={industry.color} />;

  // ── Derived data ────────────────────────────────────────────────────────────
  const sectorIntel    = getSectorIntelligence(industry, sectorData?.sectors ?? []);
  const indSignals     = getIndustrySignals(industry, sectorData?.industries ?? []);
  const bestIndSignal  = indSignals[0] ?? null;
  const topClusters    = filterIndustryClusters(industry, clusters);

  // Phase 2.5: sector meaning comes from the shared reads (si); the editorial
  // thesis/risk/cross-asset/positioning generators are deleted (D2).
  const activeThemes    = getThemesForIndustry(industry.name, feedData?.theme_intelligence ?? []).slice(0, 3);
  // Recorded drivers (graph edges) first; stored theme macro factors as the
  // labeled fallback - the THEMATIC_DRIVERS editorial dictionary is gone.
  const recordedDrivers = si?.drivers ?? [];
  const fallbackDrivers = [...new Set(activeThemes.flatMap(t => (t.related_macro_factors ?? []).slice(0, 2)))]
    .map(cleanMacroLabel).slice(0, 6);
  const liveDevelopments = getLiveDevelopments(topClusters);
  // Leadership = SHARED graph exposure: recorded beneficiaries vs recorded
  // weakening edges (the same reads Explorer shows). Never editorial lists.
  const momentumState   = getMomentumState(sectorIntel, indSignals);
  const leadership: LeadershipDynamics = {
    leaders: (si?.beneficiaries ?? []).map(b => b.label).slice(0, 4),
    laggards: (si?.weakening ?? []).slice(0, 4),
    improving: [],
    state: momentumState === "fading" ? "rotating" : momentumState === "reversing" ? "narrowing" : momentumState,
    explanation: si?.live
      ? "Recorded downstream exposure (graph beneficiaries) vs recorded weakening edges - the same reads Explorer shows for this sector."
      : "Sector entity not resolved in the shared graph yet.",
  };

  const maClusters    = topClusters.filter(c => c.primary.category === "M&A").slice(0, 5);
  const storyClusters = topClusters.filter(c => c.primary.category !== "M&A").slice(0, 10);
  // RC2-G5 (Live Themes): `cluster.theme_label` is an EDITORIAL CLUSTER HEADLINE
  // built from the story title by app/clustering.py::_make_theme_label - never a
  // canonical Argus theme. Rendering it under a "Themes" heading presented
  // "Pivot Regulator Makes" and "Energy Contrarian Investor" as themes. Each
  // cluster is now RESOLVED against the canonical theme set (exact match on the
  // theme's own identifiers, or the theme claiming this cluster id); a cluster
  // that resolves to nothing is OMITTED, never renamed heuristically. The
  // section is empty when nothing resolves, which is the honest answer.
  const canonicalThemes = feedData?.theme_intelligence ?? [];
  const themeClusters = topClusters
    .map(c => {
      const theme = canonicalThemes.find(t =>
        (t.contributing_cluster_ids ?? []).includes(c.id) ||
        normalizeKey(t.name) === normalizeKey(c.theme_label));
      return theme ? { cluster: c, theme } : null;
    })
    .filter((x): x is { cluster: StoryCluster; theme: ThemeIntelligence } => x !== null)
    .slice(0, 6);
  const topTheme      = getTopTheme(industry, clusters, whatMattersNow);

  // Phase 3 + 4 intelligence
  const dealsMapped = maDeals.map(d => ({
    id:        d.id,
    title:     d.title,
    sector:    d.sector,
    dealType:  d.dealType,
    peFirm:    d.peFirm ?? null,
    entities:  d.entities,
    url:       d.url,
    published: d.published,
  }));
  const industrySponsorDeals = getIndustrySponsorDeals(industry, dealsMapped);
  const vcClusters           = filterVCFundingClusters(industry, feedData?.clusters ?? []);
  const keyCompanies         = getInfluentialEntities(industry, topClusters, indSignals, sectorIntel, leadership.leaders, leadership.laggards);
  const matchingTheme        = getMatchingTheme(industry, feedData?.theme_intelligence ?? []);
  const industryAcquirers    = getIndustryAcquirers(industrySponsorDeals);
  const industrySponsors     = getIndustrySponsors(industrySponsorDeals);

  const score     = sectorIntel?.signal_score     ?? 0;
  const sentiment = (
    bestIndSignal?.momentum_direction ??
    sectorIntel?.impact_sentiment     ??
    "neutral"
  ) as keyof typeof SENTIMENT;
  const count     = sectorIntel?.signal_count     ?? 0;
  const alignment = bestIndSignal?.regime_alignment ?? sectorIntel?.regime_alignment ?? "neutral";
  const hasData   = sectorIntel !== null && score > 0;

  const sc         = SENTIMENT[sentiment] ?? SENTIMENT.neutral;
  const SIcon      = sc.Icon;
  const scoreColor = score >= 70 ? "#10b981" : score >= 40 ? "#f59e0b" : score > 0 ? industry.color : "#C2CBD8";
  const regimeMeta = regime ? (REGIME_DARK[regime] ?? null) : null;
  const maxInd     = indSignals[0]?.signal_score ?? 1;

  // RC2-G5 (hero narrative): the primary source is the CANONICAL intelligence
  // this page already computes - the sector forward projection (RC2-G2), which
  // states recorded exposure, its carrying industries and the measured price
  // reconciliation. The previous source, IndustrySignal.narrative, is
  // deterministic TEMPLATE prose (app/sectors.py _INDUSTRY_DESCRIPTOR +
  // _NARRATIVE_VARIANTS) keyed on the backend's PARALLEL thematic industry axis
  // (Energy Transition, LNG, Nuclear), not this page's industryConfig identity -
  // so a page could be headlined by an unrelated industry's template. It is
  // retained only as an explicitly-labelled fallback when the canonical
  // projection has nothing to say, and never overrides it.
  const heroNarrative = forwardSentence ?? bestIndSignal?.narrative ?? null;
  const heroNarrativeIsCanonical = forwardSentence !== null;
  const topStoryTitle = bestIndSignal?.top_story_title ?? null;
  const topStoryUrl   = bestIndSignal?.top_story_url   ?? null;

  return (
    <>
    <div className="min-h-screen bg-canvas">

      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <div
        className="relative overflow-hidden"
        style={{ background: "linear-gradient(135deg, #090F21 0%, #0F1A3D 55%, #1A2B5F 100%)" }}
      >
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage: [
              "linear-gradient(rgba(255,255,255,0.6) 1px, transparent 1px)",
              "linear-gradient(90deg, rgba(255,255,255,0.6) 1px, transparent 1px)",
            ].join(", "),
            backgroundSize: "48px 48px",
          }}
        />

        {/* Industry identity artwork — faint monochrome schematic, recognisable
            before a word is read. Right-anchored, masked into the gradient. */}
        <IndustryArtwork
          slug={industry.slug}
          color="#ffffff"
          className="pointer-events-none absolute top-0 right-0 h-full w-[48%] hidden sm:block"
          style={{ opacity: 0.09, maskImage: "linear-gradient(90deg, transparent, #000 60%)", WebkitMaskImage: "linear-gradient(90deg, transparent, #000 60%)" }}
        />

        <div className="relative max-w-5xl mx-auto px-4 sm:px-6 py-9 sm:py-11">

          {/* Back + breadcrumb */}
          <Link
            href="/industries"
            className="inline-flex items-center gap-1.5 text-white/40 hover:text-white/70 transition-colors mb-6 group"
          >
            <ChevronLeft size={14} className="group-hover:-translate-x-0.5 transition-transform" />
            <span className="text-xs font-medium">Industries</span>
          </Link>

          {/* Status row */}
          <div className="flex flex-wrap items-center gap-2.5 mb-4">
            <div className="flex items-center gap-1.5">
              <span className="rounded-full h-1.5 w-1.5 bg-emerald-500/70" />
              <span className="text-[9px] font-bold uppercase tracking-[0.15em] text-white/40">
                {industry.shortName}{cacheAge > 0 ? ` · Updated ${formatRelativeAge(cacheAge)}` : ""}
              </span>
            </div>
            {regimeMeta && (
              <span className={cn(
                "text-[9px] font-bold uppercase tracking-widest px-2 py-[3px] rounded-full border",
                regimeMeta.cls,
              )}>
                {regimeMeta.label}
              </span>
            )}
            {derivedRegime && (
              <span className="text-[9px] font-bold uppercase tracking-widest px-2 py-[3px] rounded-full border bg-white/10 text-white/50 border-white/15">
                {derivedRegime}
              </span>
            )}
            {hasData && (() => {
              const mm = MOMENTUM_META[momentumState];
              return (
                <span className={cn(
                  "text-[9px] font-bold uppercase tracking-widest px-2 py-[3px] rounded-full border",
                  mm.cls,
                )}>
                  {mm.label}
                </span>
              );
            })()}
            {isFetching && !isLoading && (
              <motion.span
                animate={{ rotate: 360 }}
                transition={{ repeat: Infinity, duration: 0.9, ease: "linear" }}
                className="text-white/25"
              >
                <RefreshCw size={9} />
              </motion.span>
            )}
          </div>

          {/* Industry name + identity icon */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, ease: "easeOut" }}
            className="flex items-center gap-3.5 mb-2"
          >
            {(() => {
              const HeroIcon = industryIcon(industry.slug);
              return (
                <span
                  className="shrink-0 inline-flex items-center justify-center w-11 h-11 sm:w-12 sm:h-12 rounded-xl border"
                  style={{ background: `${industry.color}1f`, borderColor: `${industry.color}44`, color: "#fff" }}
                >
                  <HeroIcon size={22} strokeWidth={1.6} />
                </span>
              );
            })()}
            <h1 className="text-[30px] sm:text-[38px] font-black text-white tracking-tight leading-none">
              {industry.name}
            </h1>
          </motion.div>
          <p className="text-sm text-white/45 mb-4 leading-relaxed">
            {industry.description}
          </p>

          {/* Live narrative */}
          {heroNarrative && (
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.4, delay: 0.15 }}
              className="text-[13px] text-white/65 mb-7 leading-relaxed max-w-2xl italic"
            >
              {!heroNarrativeIsCanonical && (
                <span className="not-italic text-[9px] font-bold uppercase tracking-[0.14em] text-white/35 mr-2">
                  Sector template
                </span>
              )}
              {heroNarrative}
            </motion.p>
          )}
          {!heroNarrative && <div className="mb-7" />}

          {/* Live metrics row */}
          <div className="flex flex-wrap items-end gap-6 mb-7">
            {/* Sentiment */}
            <div>
              <span className={cn(
                "inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest",
                "px-2.5 py-1 rounded-full border",
                sc.bg,
              )}>
                <SIcon size={10} strokeWidth={2.5} />
                {sc.label}
              </span>
            </div>

            {/* Signal score */}
            {hasData && (
              <>
                <div className="w-px h-9 bg-white/10" />
                <div>
                  <p className="text-[28px] font-black tabular-nums leading-none"
                     style={{ color: scoreColor }}>
                    {score.toFixed(0)}
                  </p>
                  <p className="text-[9px] font-medium text-white/35 uppercase tracking-[0.14em] mt-0.5">
                    Signal Score
                  </p>
                </div>
              </>
            )}

            {/* Stories */}
            {hasData && (
              <>
                <div className="w-px h-9 bg-white/10" />
                <div>
                  <p className="text-[28px] font-black text-white tabular-nums leading-none">
                    {count}
                  </p>
                  <p className="text-[9px] font-medium text-white/35 uppercase tracking-[0.14em] mt-0.5">
                    Active Stories
                  </p>
                </div>
              </>
            )}

            {/* Regime alignment */}
            {hasData && (
              <>
                <div className="w-px h-9 bg-white/10" />
                <div>
                  <p className={cn(
                    "text-[13px] font-bold leading-none",
                    alignment === "tailwind" ? "text-emerald-400" :
                    alignment === "headwind" ? "text-red-400"     : "text-white/40",
                  )}>
                    {alignment === "tailwind" ? "↑ Tailwind" :
                     alignment === "headwind" ? "↓ Headwind" : "→ Neutral"}
                  </p>
                  <p className="text-[9px] font-medium text-white/35 uppercase tracking-[0.14em] mt-0.5">
                    Regime
                  </p>
                </div>
              </>
            )}
          </div>

          {/* Key asset chips */}
          <div className="flex flex-wrap gap-1.5 mb-4">
            {industry.keyAssets.map(ticker => (
              <TickerChip key={ticker} ticker={ticker} mono={false} color={industry.color}
                className="text-[10px] font-bold font-mono px-2.5 py-[5px] rounded-lg leading-none"
                style={{ background: `${industry.color}22` }} />
            ))}
          </div>

          {/* Top story link */}
          {topStoryTitle && topStoryUrl && (
            <a
              href={topStoryUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 group"
            >
              <span className="text-[9.5px] font-bold uppercase tracking-[0.12em] text-white/30">
                Top Story
              </span>
              <span className="text-[11px] font-medium text-white/50 group-hover:text-white/80 transition-colors truncate max-w-md leading-tight">
                {topStoryTitle}
              </span>
              <ArrowUpRight size={10} className="text-white/25 group-hover:text-white/60 transition-colors shrink-0" />
            </a>
          )}
        </div>

        {/* Live market tape — key tickers with thematic exposure (no quotes) */}
        <IndustryTape tickers={industry.keyAssets} />
      </div>

      {/* ── Content ──────────────────────────────────────────────────────── */}
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 space-y-4">

        {/* ── What Matters — shared engine reads only (Phase 2.5): forward
            view (prediction engine), the canonical ledger record, and the
            derived narrative membership. Honest partial states; the editorial
            sector thesis generator is deleted. ──────────────────────────── */}
        <motion.section
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.08, duration: 0.25, ease: "easeOut" }}
          className="bg-surface rounded-xl border border-edge p-5"
          style={{ borderLeftColor: industry.color, borderLeftWidth: "3px" }}
        >
          <div className="flex items-center gap-2 mb-3">
            <Zap size={11} className="shrink-0" style={{ color: industry.color }} />
            <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-ink">
              What Matters Now
            </span>
            {si?.narrative && (
              <span className="text-[9px] font-bold px-2 py-px rounded-full ml-1"
                title="Derived-narrative exposure (shared derivation)"
                style={{ color: industry.color, background: `${industry.color}14` }}>
                {cleanThemeName(si.narrative)}
              </span>
            )}
            {topTheme && !si?.narrative && (
              <span className="text-[9px] font-bold px-2 py-px rounded-full ml-1"
                style={{ color: industry.color, background: `${industry.color}14` }}>
                {topTheme}
              </span>
            )}
            {(() => {
              const href = explorerHrefForNode({ type: "Sector", label: industry.sector });
              return href ? (
                <Link href={href} className="ml-auto inline-flex items-center gap-1 text-[9.5px] font-semibold text-accent hover:underline shrink-0">
                  Open in Workstation <ArrowUpRight size={10} />
                </Link>
              ) : null;
            })()}
          </div>
          <div className="space-y-2">
            {forwardView && forwardView.reconciliation !== "unavailable" ? (
              <>
                <p className="text-[13px] text-ink-secondary leading-relaxed">
                  <span className="font-semibold text-ink capitalize">{forwardView.reconciliation.replace("-", " ")}</span>
                  <span className="text-ink-muted"> · recorded exposure reconciled with measured leadership</span>
                  {" — "}{forwardViewSentence(forwardView)}
                </p>
                {forwardView.exposure.length > 0 && (
                  <p className="text-[10.5px] text-ink-muted leading-snug">
                    {forwardView.exposure.slice(0, 4).map(e => `${e.theme} via ${e.viaIndustry}${e.signalQuality ? ` (${e.signalQuality})` : ""}`).join(" · ")}
                  </p>
                )}
                {forwardView.chain && forwardView.chain.length >= 2 && (
                  <p className="text-[10.5px] text-ink-muted leading-snug">
                    {forwardView.chain.join(" → ")}{forwardView.chainVia ? ` · via ${forwardView.chainVia}` : ""}
                  </p>
                )}
              </>
            ) : (
              <p className="text-[11.5px] text-ink-muted leading-relaxed">
                {forwardView ? forwardViewSentence(forwardView) : `No resolvable forward view for ${industry.sector} yet.`}
              </p>
            )}
            {si?.latestChange && (
              <p className="text-[11.5px] text-ink-secondary leading-snug" title={si.latestChange.why}>
                <span className="text-[7.5px] font-bold tracking-[0.12em] px-1 py-0.5 rounded border border-sky-500/40 text-sky-600 mr-1.5 align-middle">
                  {si.latestChange.kind}
                </span>
                {si.latestChange.what}
              </p>
            )}
            {matchingTheme && (
              <button
                onClick={() => setDrawerTheme(matchingTheme)}
                className="text-[9.5px] font-semibold px-2 py-1 rounded transition-opacity hover:opacity-80"
                style={{ background: "rgba(82,176,200,0.08)", color: "rgba(82,176,200,0.70)", border: "1px solid rgba(82,176,200,0.14)" }}
              >
                View Theme
              </button>
            )}
          </div>
        </motion.section>

        {/* ── Industry Transmission Map ─────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.09, duration: 0.25, ease: "easeOut" }}
        >
          <IndustryTransmissionMap industry={industry} themes={activeThemes} />
        </motion.div>

        {/* ── Strategic Intelligence — premium analysis surfaced high ───── */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1, duration: 0.25, ease: "easeOut" }}
          className="grid grid-cols-1 lg:grid-cols-2 gap-4"
        >
          {/* Forward View / What Breaks It / Watch - shared engine records
              (the editorial bull/bear positioning library is deleted, D2) */}
          <div className="bg-surface rounded-xl border border-edge p-5" style={{ borderTopColor: industry.color, borderTopWidth: "2px" }}>
            <SectionHeader icon={TrendingUp}>Positioning · shared engines</SectionHeader>
            <div className="grid grid-cols-2 gap-x-4 gap-y-2.5">
              <div>
                <p className="text-[8.5px] font-bold uppercase tracking-[0.13em] text-emerald-500/80 mb-1">Forward View</p>
                <p className="text-[11px] text-ink-secondary leading-relaxed">
                  {forwardView ? forwardViewSentence(forwardView) : "No resolvable forward view yet."}
                </p>
              </div>
              <div>
                <p className="text-[8.5px] font-bold uppercase tracking-[0.13em] text-red-500/80 mb-1">What Breaks It</p>
                <p className="text-[11px] text-ink-secondary leading-relaxed">
                  {si?.invalidation ?? si?.contradictions[0]?.detail ?? "No recorded invalidation or contradiction for this sector yet."}
                </p>
              </div>
              <div className="col-span-2 pt-1 border-t border-edge/60">
                <p className="text-[8.5px] font-bold uppercase tracking-[0.13em] mb-1" style={{ color: `${industry.color}aa` }}>Watch For</p>
                <p className="text-[10.5px] text-ink-muted leading-relaxed">
                  {si?.watch ?? "No derivable watch item yet."}
                  {si?.watch && <span className="ml-1.5 text-[7px] font-bold tracking-[0.12em] px-1 py-px rounded border border-accent/30 text-accent/70 align-middle">DERIVED</span>}
                </p>
              </div>
            </div>
          </div>

          {/* Risk Factors - the shared risk read, verbatim */}
          <div className="bg-surface rounded-xl border border-edge p-5">
            <SectionHeader icon={ShieldAlert}>Risk Factors · shared engines</SectionHeader>
            {(si && (si.contradictions.length > 0 || si.invalidation || si.weakening.length > 0)) ? (
              <ul className="space-y-2.5">
                {si.invalidation && (
                  <li className="flex items-start gap-2">
                    <AlertTriangle size={10} className="text-amber-500/70 mt-[2px] shrink-0" />
                    <p className="text-[11px] text-ink-secondary leading-relaxed">{si.invalidation} <span className="text-ink-muted">(prediction engine)</span></p>
                  </li>
                )}
                {si.contradictions.slice(0, 2).map((c, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <AlertTriangle size={10} className="text-red-500/70 mt-[2px] shrink-0" />
                    <p className="text-[11px] text-ink-secondary leading-relaxed">{c.detail} <span className="text-ink-muted">sev {c.severity} (evidence engine)</span></p>
                  </li>
                ))}
                {si.weakening.slice(0, 2).map((w, i) => (
                  <li key={`w-${i}`} className="flex items-start gap-2">
                    <span className="w-1 h-1 rounded-full mt-[6px] shrink-0 bg-red-400" />
                    <p className="text-[11px] text-ink-secondary leading-relaxed">Recorded weakening link: {w}</p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[11px] text-ink-muted leading-relaxed">
                No recorded risk records for this sector yet{si?.live ? "." : " (sector entity not in the shared graph)."}
              </p>
            )}
          </div>

          {/* Recorded Transmission - one graph-recorded path (replaces the
              editorial Cross-Asset Effects and Geopolitical Exposure prose) */}
          <div className="bg-surface rounded-xl border border-edge p-5 lg:col-span-2">
            <SectionHeader icon={Target}>Recorded Transmission</SectionHeader>
            {si?.transmission ? (
              <div className="flex items-center gap-1.5 flex-wrap">
                {si.transmission.map((label, i) => (
                  <span key={`${label}-${i}`} className="flex items-center gap-1.5">
                    {i > 0 && <span className="text-[13px]" style={{ color: `${industry.color}66` }}>→</span>}
                    <span className="text-[11px] font-semibold px-2 py-1 rounded-lg border border-edge bg-raised text-ink-secondary">{label}</span>
                  </span>
                ))}
                <span className="text-[8px] font-bold tracking-[0.1em] text-ink-muted/60 ml-1">RECORDED GRAPH EDGES</span>
              </div>
            ) : (
              <p className="text-[11px] text-ink-muted leading-relaxed">
                No recorded transmission path through {industry.sector} yet. Nothing is reconstructed from prose or dictionaries.
              </p>
            )}
          </div>
        </motion.div>

        {/* ── Active Themes — core Argus intelligence, primary column ────── */}
        {activeThemes.length > 0 && (
          <motion.section
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.11, duration: 0.25, ease: "easeOut" }}
          >
            <div className="flex items-center gap-2 mb-3">
              <Network size={11} className="shrink-0" style={{ color: industry.color }} />
              <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-ink">Active Themes</span>
              <span className="text-[9px] font-medium text-ink-muted/70">driving {industry.name}</span>
              <span className="h-px flex-1 bg-edge" />
              <span className="text-[8.5px] font-semibold uppercase tracking-[0.1em] text-ink-muted/50 tabular-nums">{activeThemes.length} active</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {activeThemes.map((t: ThemeIntelligence) => (
                <ActiveThemeCard key={t.id} theme={t} color={industry.color} onOpen={() => setDrawerTheme(t)} />
              ))}
            </div>
          </motion.section>
        )}

        {/* ── Live Developments ─────────────────────────────────────────── */}
        {liveDevelopments.length > 0 && (
          <motion.section
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1, duration: 0.25, ease: "easeOut" }}
            className="bg-surface rounded-xl border border-edge p-5"
          >
            <div className="flex items-center gap-2.5 mb-4">
              <Radio size={11} className="text-emerald-500 shrink-0" strokeWidth={2} />
              <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-ink">
                Live Developments
              </span>
              <span className="h-px flex-1 bg-edge" />
              <span className="text-[8.5px] font-semibold uppercase tracking-[0.10em] text-ink-muted/50">
                {liveDevelopments.filter(d => d.type === "live").length > 0 ? "feed + structural" : "structural"}
              </span>
            </div>
            <LiveDevelopmentsSection developments={liveDevelopments} />
          </motion.section>
        )}

        {/* ── Main 2-col grid ───────────────────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

          {/* Left column (2/3) */}
          <div className="lg:col-span-2 space-y-4">

            {/* Leadership / Laggards */}
            {(leadership.leaders.length > 0 || leadership.laggards.length > 0) && (
              <motion.section
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.13, duration: 0.25, ease: "easeOut" }}
                className="bg-surface rounded-xl border border-edge p-5"
              >
                <SectionHeader icon={TrendingUp}>Leadership Dynamics</SectionHeader>
                <LeadershipSection leadership={leadership} color={industry.color} />
              </motion.section>
            )}

            {/* Live Themes */}
            {themeClusters.length > 0 && (
              <motion.section
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.12, duration: 0.25, ease: "easeOut" }}
                className="bg-surface rounded-xl border border-edge p-5"
              >
                <SectionHeader icon={Activity}>Live Themes</SectionHeader>
                <div>
                  {themeClusters.map((x, i) => (
                    <ThemeRow key={x.cluster.id} cluster={x.cluster} theme={x.theme} color={industry.color} index={i} />
                  ))}
                </div>
              </motion.section>
            )}

            {/* Top Stories */}
            {storyClusters.length > 0 && (
              <motion.section
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.16, duration: 0.25, ease: "easeOut" }}
                className="bg-surface rounded-xl border border-edge p-5"
              >
                <SectionHeader icon={BarChart3}>Top Stories</SectionHeader>
                <div>
                  {storyClusters.map(cl => (
                    <StoryRow key={cl.id} cluster={cl} color={industry.color} />
                  ))}
                </div>
              </motion.section>
            )}

            {/* VC & Funding */}
            {vcClusters.length > 0 && (
              <motion.section
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.18, duration: 0.25, ease: "easeOut" }}
                className="bg-surface rounded-xl border border-edge p-5"
              >
                <SectionHeader icon={Sprout}>VC & Funding</SectionHeader>
                <div>
                  {vcClusters.map(cl => (
                    <StoryRow key={cl.id} cluster={cl} color={industry.color} />
                  ))}
                </div>
              </motion.section>
            )}

            {/* M&A Activity */}
            <motion.section
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2, duration: 0.25, ease: "easeOut" }}
              className="bg-surface rounded-xl border border-edge p-5"
            >
              <SectionHeader icon={Shuffle}>M&A Activity</SectionHeader>
              {maClusters.length > 0 && (
                <div className="mb-3">
                  {maClusters.map(cl => (
                    <StoryRow key={cl.id} cluster={cl} color={industry.color} />
                  ))}
                </div>
              )}
              {industrySponsorDeals.length > 0 && (
                <div className={maClusters.length > 0 ? "pt-2 border-t border-edge/40" : ""}>
                  {maClusters.length > 0 && (
                    <p className="text-[9px] font-bold uppercase tracking-[0.13em] text-ink-muted/50 mb-2">Sponsor & PE</p>
                  )}
                  {industrySponsorDeals.map(d => (
                    <IndustryDealRow key={d.id} deal={d} color={industry.color} />
                  ))}
                </div>
              )}
              {maClusters.length === 0 && industrySponsorDeals.length === 0 && (
                // P2.5: the editorial maTheme paragraph no longer stands in for
                // missing intelligence - the empty state is stated honestly.
                <p className="text-[10px] text-ink-muted">
                  No active M&A stories or recorded deals in the current feed window.
                </p>
              )}
            </motion.section>

            {/* Cross-Asset Effects, Positioning, Risk Factors, and Geopolitical
                Exposure now live in the Strategic Intelligence band near the top
                of the page (surfaced higher per the institutional reorder). */}
          </div>

          {/* Right column (1/3) */}
          <div className="space-y-4">

            {/* Sub-industry signals */}
            {indSignals.length > 0 && (
              <motion.section
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.14, duration: 0.25, ease: "easeOut" }}
                className="bg-surface rounded-xl border border-edge p-4"
              >
                <SectionHeader icon={BarChart3}>Sub-Industries</SectionHeader>
                <div className="space-y-3">
                  {indSignals.slice(0, 5).map(sig => (
                    <IndustryBar key={sig.name} sig={sig} max={maxInd} color={industry.color} />
                  ))}
                </div>
              </motion.section>
            )}

            {/* Macro Drivers */}
            <motion.section
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.17, duration: 0.25, ease: "easeOut" }}
              className="bg-surface rounded-xl border border-edge p-4"
            >
              <SectionHeader icon={BarChart3}>
                {recordedDrivers.length > 0 ? "Drivers · recorded edges" : "Drivers · stored-field read"}
              </SectionHeader>
              {recordedDrivers.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {recordedDrivers.map(d => (
                    <span key={d.label} title={`${d.relationship.replace(/_/g, " ")} (strength ${Math.round(d.strength)}) - recorded graph edge`}>
                      <DriverChip label={cleanMacroLabel(d.label)} color={industry.color} />
                    </span>
                  ))}
                </div>
              ) : fallbackDrivers.length > 0 ? (
                <div className="flex flex-wrap gap-1.5" title="Stored theme macro factors (pipeline fields); graph drivers unavailable">
                  {fallbackDrivers.map(d => (
                    <DriverChip key={d} label={d} color={industry.color} />
                  ))}
                </div>
              ) : (
                <p className="text-[11px] text-ink-muted leading-relaxed">No recorded drivers for this sector yet.</p>
              )}
            </motion.section>

            {/* Thematic Exposure — beneficiaries & headwinds from active themes */}
            {activeThemes.length > 0 && (() => {
              const beneficiarySet = new Set<string>();
              const headwindSet    = new Set<string>();
              activeThemes.forEach((t: ThemeIntelligence) => {
                getThemeBeneficiaries(t).forEach(a => beneficiarySet.add(a));
                getThemeHeadwinds(t).forEach(a => { if (!beneficiarySet.has(a)) headwindSet.add(a); });
              });
              const bens = [...beneficiarySet].slice(0, 8);
              const hwds = [...headwindSet].slice(0, 8);
              if (bens.length === 0 && hwds.length === 0) return null;
              return (
                <motion.section
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.20, duration: 0.25, ease: "easeOut" }}
                  className="bg-surface rounded-xl border border-edge p-4"
                >
                  <SectionHeader icon={Target}>Thematic Exposure</SectionHeader>
                  <div className="space-y-2.5">
                    {bens.length > 0 && (
                      <div className="flex items-start gap-2 flex-wrap">
                        <span className="text-[8.5px] font-bold shrink-0 mt-[3px]" style={{ color: "#10b98180" }}>↑ Benefits</span>
                        {bens.map(a => (
                          <TickerChip key={a} ticker={a} mono={false} color="#10b981"
                            className="text-[9.5px] font-bold font-mono px-1.5 py-0.5 rounded leading-none"
                            style={{ background: "rgba(16,185,129,0.09)" }} />
                        ))}
                      </div>
                    )}
                    {hwds.length > 0 && (
                      <div className="flex items-start gap-2 flex-wrap">
                        <span className="text-[8.5px] font-bold shrink-0 mt-[3px]" style={{ color: "#ef444480" }}>↓ Headwinds</span>
                        {hwds.map(a => (
                          <TickerChip key={a} ticker={a} mono={false} color="#ef4444"
                            className="text-[9.5px] font-bold font-mono px-1.5 py-0.5 rounded leading-none"
                            style={{ background: "rgba(239,68,68,0.09)" }} />
                        ))}
                      </div>
                    )}
                  </div>
                </motion.section>
              );
            })()}

            {/* Key Companies */}
            {keyCompanies.length > 0 && (
              <motion.section
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.21, duration: 0.25, ease: "easeOut" }}
                className="bg-surface rounded-xl border border-edge p-4"
              >
                <SectionHeader icon={Building2}>Key Companies</SectionHeader>
                <div className="space-y-2">
                  {keyCompanies.map((e: EntitySignal) => {
                    const statusColor =
                      e.status === "leader"  ? "#10b981" :
                      e.status === "laggard" ? "#ef4444" :
                      e.isKeyAsset           ? industry.color : "#94a3b8";
                    return (
                      <div key={e.name} className="flex items-center gap-2 min-w-0">
                        <span
                          className={cn(
                            "text-[10.5px] font-bold leading-none shrink-0",
                            e.isTicker ? "font-mono" : "font-sans",
                          )}
                          style={{ color: statusColor }}
                        >
                          {e.name}
                        </span>
                        {e.status !== "neutral" && (
                          <span className="text-[9px] font-bold shrink-0" style={{ color: statusColor }}>
                            {e.status === "leader" ? "↑" : "↓"}
                          </span>
                        )}
                        {e.headline && (
                          <span className="text-[9px] text-ink-muted/55 truncate flex-1 min-w-0">
                            {e.headline}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </motion.section>
            )}

            {/* Acquirer Intelligence */}
            {industryAcquirers.length > 0 && (
              <motion.section
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.225, duration: 0.25, ease: "easeOut" }}
                className="bg-surface rounded-xl border border-edge p-4"
              >
                <SectionHeader icon={Target}>Acquirer Intelligence</SectionHeader>
                <div className="space-y-2">
                  {industryAcquirers.map((a: IndustryAcquirer) => (
                    <div key={a.name} className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <span className="text-[10.5px] font-bold font-mono" style={{ color: industry.color }}>
                          {a.name}
                        </span>
                        {a.sectors.length > 0 && (
                          <p className="text-[9px] text-ink-muted/60 mt-0.5 truncate">
                            {a.sectors.join(" · ")}
                          </p>
                        )}
                      </div>
                      <span className="text-[10px] font-mono text-ink-muted/50 shrink-0">
                        ×{a.dealCount}
                      </span>
                    </div>
                  ))}
                </div>
              </motion.section>
            )}

            {/* Active Sponsors */}
            {industrySponsors.length > 0 && (
              <motion.section
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.24, duration: 0.25, ease: "easeOut" }}
                className="bg-surface rounded-xl border border-edge p-4"
              >
                <SectionHeader icon={Building2}>Active Sponsors</SectionHeader>
                <div className="space-y-2.5">
                  {industrySponsors.map((s: IndustrySponsor) => (
                    <div key={s.firm}>
                      <div className="flex items-center justify-between mb-0.5">
                        <span className="text-[11px] font-medium text-ink">{s.firm}</span>
                        <span className="text-[10px] font-mono font-bold" style={{ color: industry.color }}>
                          {s.deals} deal{s.deals > 1 ? "s" : ""}
                        </span>
                      </div>
                      {s.sectors.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {s.sectors.map((sec, i) => (
                            <span
                              key={sec}
                              className="text-[8.5px] px-1.5 py-px rounded leading-none"
                              style={{
                                background: i === 0 ? `${industry.color}14` : "transparent",
                                color:      i === 0 ? industry.color : "var(--color-ink-muted)",
                                border:     `1px solid ${i === 0 ? `${industry.color}30` : "var(--color-edge)"}`,
                              }}
                            >
                              {sec}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </motion.section>
            )}

            {/* Related Listening */}
            <motion.section
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.29, duration: 0.25, ease: "easeOut" }}
              className="rounded-xl overflow-hidden"
              style={{ background: `linear-gradient(135deg, ${industry.color}18 0%, ${industry.color}08 100%)` }}
            >
              <div className="border border-edge p-4 rounded-xl">
                <SectionHeader icon={Headphones}>Listen & Learn</SectionHeader>
                <p className="text-[11.5px] text-ink-secondary leading-relaxed mb-3">
                  Find podcasts and briefings covering {industry.name} themes, earnings, and macro drivers.
                </p>
                <Link
                  href={`/listen`}
                  className={cn(
                    "inline-flex items-center gap-2 px-3 py-2 rounded-lg text-[11px] font-semibold",
                    "transition-all duration-150 hover:opacity-90 hover:-translate-y-px",
                  )}
                  style={{ background: industry.color, color: "#fff" }}
                >
                  <Radio size={11} />
                  Open Listen
                  <ArrowUpRight size={10} />
                </Link>
              </div>
            </motion.section>

          </div>
        </div>

      </div>
    </div>

    {/* ── Theme Drawer ────────────────────────────────────────────────────── */}
    {drawerTheme && (
      <ThemeDrawer
        theme={drawerTheme}
        clusters={feedData?.clusters ?? []}
        deals={industrySponsorDeals.map(d => ({ title: d.title, sector: d.sector, dealType: d.dealType, entities: d.entities, url: d.url }))}
        isWatched={isWatched(drawerTheme.id)}
        hasAlert={false}
        onToggleWatch={() => toggleThemeWatch(drawerTheme.id)}
        onClose={() => setDrawerTheme(null)}
      />
    )}
    </>
  );
}
