"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { motion } from "framer-motion";
import {
  ChevronLeft, TrendingUp, TrendingDown, Minus,
  AlertTriangle, Globe, BarChart3, Zap,
  Radio, ShieldAlert, Target, Shuffle, RefreshCw,
  Headphones, ArrowUpRight, Activity, Network, Building2, Sprout,
} from "lucide-react";
import { cn } from "@/lib/utils";
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
  generateThesis,
  getCrossAssetEffects,
  getRiskFactors,
  getKeyDrivers,
  getLiveDevelopments,
  getLeadershipDynamics,
  getPositioningNarrative,
  getMomentumState,
  type LiveDevelopment,
  type LeadershipDynamics,
  type MomentumState,
} from "@/lib/sectorIntelligence";
import type { IndustrySignal, StoryCluster, ThemeIntelligence } from "@/lib/types";
import { getThemesForIndustry } from "@/lib/themeGraph";
import { getThemeBeneficiaries, getThemeHeadwinds } from "@/lib/themeImpact";
import {
  getInfluentialEntities,
  filterVCFundingClusters,
  getIndustrySponsorDeals,
  getIndustryAcquirers,
  getIndustrySponsors,
  getThemeNarrative,
  getMatchingTheme,
  type EntitySignal,
  type SectorDealItem,
  type IndustryAcquirer,
  type IndustrySponsor,
} from "@/lib/industryIntelligence";
import { computeThemeEvolutionState, getEvolutionNarrative, THEME_EVOLUTION_META } from "@/lib/themeEvolution";
import { ThemeDrawer } from "@/components/themes/ThemeDrawer";
import { useThemeWatchlist } from "@/hooks/useThemeWatchlist";
import { IndustryArtwork, industryIcon } from "@/components/industries/industryIdentity";
import { themeBeneficiaries } from "@/lib/themeIntelligence";
import { cleanThemeName, cleanMacroLabel } from "@/app/markets/marketsShared";
import type { IndustryConfig } from "@/lib/industryConfig";

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

function ThemeRow({ cluster, color, index }: { cluster: StoryCluster; color: string; index: number }) {
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
          {cluster.theme_label}
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
// A Bloomberg-style scrolling tape of the industry's key tickers. NOTE: the data
// layer is macro-only (no per-equity quotes), so this shows NO prices — the
// arrow is a real THEMATIC exposure read (beneficiary ▲ / headwind ▾ of the
// industry's active themes), never a fabricated price move.

function IndustryTape({ tickers, benefit, headwind }: {
  tickers: string[]; benefit: Set<string>; headwind: Set<string>;
}) {
  if (tickers.length === 0) return null;
  const Row = ({ keyPrefix }: { keyPrefix: string }) => (
    <>
      {tickers.map(tk => {
        const up = benefit.has(tk.toUpperCase());
        const dn = headwind.has(tk.toUpperCase());
        const color = up ? "#34d399" : dn ? "#f87171" : "rgba(255,255,255,0.5)";
        return (
          <span key={`${keyPrefix}-${tk}`} className="inline-flex items-center gap-1.5 px-3.5 shrink-0">
            <span className="text-[11px] font-bold font-mono tracking-tight text-white/80">{tk}</span>
            <span className="text-[9px] leading-none" style={{ color }}>{up ? "▲" : dn ? "▾" : "·"}</span>
          </span>
        );
      })}
    </>
  );
  return (
    <div className="tg-tape-wrap relative overflow-hidden border-y border-white/[0.07]"
      style={{ maskImage: "linear-gradient(90deg, transparent, #000 6%, #000 94%, transparent)", WebkitMaskImage: "linear-gradient(90deg, transparent, #000 6%, #000 94%, transparent)" }}>
      <div className="flex items-center py-2 whitespace-nowrap tg-tape" style={{ width: "max-content" }}>
        <div className="flex items-center"><Row keyPrefix="a" /></div>
        <div className="flex items-center" aria-hidden><Row keyPrefix="b" /></div>
      </div>
    </div>
  );
}

// ── Active theme card (clean, scannable — primary content column) ──────────────

function ActiveThemeCard({ theme, color, onOpen }: {
  theme: ThemeIntelligence; color: string; onOpen: () => void;
}) {
  const evState = computeThemeEvolutionState(theme);
  const evMeta  = THEME_EVOLUTION_META[evState];
  const benef   = getThemeBeneficiaries(theme).slice(0, 4);
  const narrative = (theme.second_order_effects?.[0] || theme.description || getEvolutionNarrative(theme.name, evState) || "").trim();
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
          style={{ color: evMeta.color, background: evMeta.bg, borderColor: evMeta.border }}>
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
      {/* Footer: conviction + sources */}
      <div className="flex items-center gap-2 pt-2 border-t border-edge/50">
        <span className="text-[9.5px] font-bold tabular-nums" style={{ color: convColor }}>
          {theme.momentum_delta > 0 ? "+" : ""}{theme.momentum_delta || theme.confidence} conviction
        </span>
        <span className="text-ink-muted/30">·</span>
        <span className="text-[9.5px] font-medium text-ink-muted tabular-nums">{theme.evidence_count || theme.contributing_story_count || 0} sources</span>
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

function buildTransmissionRows(industry: IndustryConfig, themes: ThemeIntelligence[]): TransmissionRow[] {
  const keyset = new Set(industry.keyAssets.map(a => a.toUpperCase()));
  const rows = themes.slice(0, 3).map(t => {
    const driver = cleanMacroLabel((t.related_macro_factors ?? [])[0] ?? industry.macroDrivers[0] ?? "Macro backdrop");
    const benef  = themeBeneficiaries(t, 6);
    const inInd  = benef.filter(tk => keyset.has(tk.toUpperCase()));
    const tickers = (inInd.length > 0 ? inInd : benef).slice(0, 4);
    return { driver, theme: cleanThemeName(t.name), tickers: tickers.length ? tickers : industry.keyAssets.slice(0, 4) };
  });
  if (rows.length > 0) return rows;
  // Structural fallback so every industry shows its transmission.
  return industry.macroDrivers.slice(0, 2).map((d, i) => ({
    driver: cleanMacroLabel(d),
    theme: `${industry.name} ${i === 0 ? "structural demand" : "capital cycle"}`,
    tickers: industry.keyAssets.slice(i * 4, i * 4 + 4),
  }));
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
        <span className="text-[8.5px] font-semibold uppercase tracking-[0.1em] text-ink-muted/50">driver → theme → {industry.shortName} → expressions</span>
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
                  <span key={tk} className="text-[10px] font-bold font-mono leading-none px-1.5 py-0.5 rounded"
                    style={{ color: c, background: `${c}10` }}>{tk}</span>
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

  const { sectorData, regime, clusters, isLoading, isFetching } = useSectors();
  const derivedRegime = sectorData?.derived_regime ?? "";
  const { data: feedData } = useFeed({});
  const whatMattersNow = feedData?.what_matters_now ?? [];
  const { deals: maDeals } = useMAIntelligence();

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

  if (isLoading) return <DetailSkeleton color={industry.color} />;

  // ── Derived data ────────────────────────────────────────────────────────────
  const sectorIntel    = getSectorIntelligence(industry, sectorData?.sectors ?? []);
  const indSignals     = getIndustrySignals(industry, sectorData?.industries ?? []);
  const bestIndSignal  = indSignals[0] ?? null;
  const topClusters    = filterIndustryClusters(industry, clusters);

  const thesis  = sectorIntel ? generateThesis(sectorIntel, indSignals, regime) : null;
  const [cxA, cxB] = sectorIntel ? getCrossAssetEffects(industry.sector, regime) : ["", ""];
  const [rkA, rkB] = sectorIntel ? getRiskFactors(industry.sector, regime)       : ["", ""];
  const drivers = sectorIntel
    ? getKeyDrivers(sectorIntel, indSignals, topClusters)
    : industry.macroDrivers.slice(0, 6);

  const activeThemes    = getThemesForIndustry(industry.name, feedData?.theme_intelligence ?? []).slice(0, 3);
  // Thematic exposure sets (real signal: beneficiary / headwind of active themes),
  // shared by the market tape and the Thematic Exposure module.
  const tapeBenefit  = new Set<string>();
  const tapeHeadwind = new Set<string>();
  for (const t of activeThemes) {
    getThemeBeneficiaries(t).forEach(a => tapeBenefit.add(a.toUpperCase()));
    getThemeHeadwinds(t).forEach(a => { if (!tapeBenefit.has(a.toUpperCase())) tapeHeadwind.add(a.toUpperCase()); });
  }
  const liveDevelopments = getLiveDevelopments(industry.slug, sectorIntel, indSignals, topClusters, regime);
  const leadership      = getLeadershipDynamics(industry.slug, sectorIntel, indSignals, regime);
  const positioning     = getPositioningNarrative(industry.slug, sectorIntel, regime);
  const momentumState   = getMomentumState(sectorIntel, indSignals);

  const maClusters    = topClusters.filter(c => c.primary.category === "M&A").slice(0, 5);
  const storyClusters = topClusters.filter(c => c.primary.category !== "M&A").slice(0, 10);
  const themeClusters = topClusters.slice(0, 6);
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
  const themeNarrative       = getThemeNarrative(industry, feedData?.theme_intelligence ?? []);
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

  // Live narrative from best industry signal
  const heroNarrative = bestIndSignal?.narrative ?? null;
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
              <span className="relative flex h-1.5 w-1.5">
                <span className="animate-ping absolute inset-0 rounded-full bg-emerald-400 opacity-75" />
                <span className="relative rounded-full h-1.5 w-1.5 bg-emerald-500" />
              </span>
              <span className="text-[9px] font-bold uppercase tracking-[0.15em] text-white/40">
                {industry.shortName} · Live
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
              <span
                key={ticker}
                className="text-[10px] font-bold font-mono px-2.5 py-[5px] rounded-lg leading-none"
                style={{ color: industry.color, background: `${industry.color}22` }}
              >
                {ticker}
              </span>
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
        <IndustryTape tickers={industry.keyAssets.slice(0, 14)} benefit={tapeBenefit} headwind={tapeHeadwind} />
      </div>

      {/* ── Content ──────────────────────────────────────────────────────── */}
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 space-y-4">

        {/* ── What Matters ──────────────────────────────────────────────── */}
        {thesis && (
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
              {topTheme && (
                <span
                  className="text-[9px] font-bold px-2 py-px rounded-full ml-1"
                  style={{ color: industry.color, background: `${industry.color}14` }}
                >
                  {topTheme}
                </span>
              )}
            </div>
            <p className="text-[13px] text-ink-secondary leading-relaxed">
              {thesis}
            </p>
            {themeNarrative && (
              <div className="mt-2.5 pt-2.5 border-t border-edge/40 flex items-start gap-2">
                <p className="flex-1 text-[11.5px] text-ink-muted/70 leading-relaxed italic">
                  {themeNarrative}
                </p>
                {matchingTheme && (
                  <button
                    onClick={() => setDrawerTheme(matchingTheme)}
                    className="shrink-0 text-[9.5px] font-semibold px-2 py-1 rounded transition-opacity hover:opacity-80 mt-0.5"
                    style={{ background: "rgba(82,176,200,0.08)", color: "rgba(82,176,200,0.70)", border: "1px solid rgba(82,176,200,0.14)" }}
                  >
                    View Theme
                  </button>
                )}
              </div>
            )}
          </motion.section>
        )}

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
          {/* Positioning */}
          <div className="bg-surface rounded-xl border border-edge p-5" style={{ borderTopColor: industry.color, borderTopWidth: "2px" }}>
            <SectionHeader icon={TrendingUp}>Positioning</SectionHeader>
            <div className="grid grid-cols-2 gap-x-4 gap-y-2.5">
              <div>
                <p className="text-[8.5px] font-bold uppercase tracking-[0.13em] text-emerald-500/80 mb-1">Bull Case</p>
                <p className="text-[11px] text-ink-secondary leading-relaxed">{positioning.bull}</p>
              </div>
              <div>
                <p className="text-[8.5px] font-bold uppercase tracking-[0.13em] text-red-500/80 mb-1">Bear Case</p>
                <p className="text-[11px] text-ink-secondary leading-relaxed">{positioning.bear}</p>
              </div>
              <div className="col-span-2 pt-1 border-t border-edge/60">
                <p className="text-[8.5px] font-bold uppercase tracking-[0.13em] mb-1" style={{ color: `${industry.color}aa` }}>Watch For</p>
                <p className="text-[10.5px] text-ink-muted leading-relaxed">{positioning.watchFor}</p>
              </div>
            </div>
          </div>

          {/* Risk Factors */}
          <div className="bg-surface rounded-xl border border-edge p-5">
            <SectionHeader icon={ShieldAlert}>Risk Factors</SectionHeader>
            {(rkA || rkB) ? (
              <ul className="space-y-2.5">
                {[rkA, rkB].filter(Boolean).map((line, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <AlertTriangle size={10} className="text-amber-500/70 mt-[2px] shrink-0" />
                    <p className="text-[11px] text-ink-secondary leading-relaxed">{line}</p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[11px] text-ink-muted leading-relaxed">No acute sector-specific risk flags in the current regime window.</p>
            )}
          </div>

          {/* Geopolitical Exposure */}
          <div className="bg-surface rounded-xl border border-edge p-5">
            <SectionHeader icon={Globe}>Geopolitical Exposure</SectionHeader>
            <p className="text-[11.5px] text-ink-secondary leading-relaxed">{industry.geopoliticalExposure}</p>
          </div>

          {/* Cross-Asset Effects */}
          <div className="bg-surface rounded-xl border border-edge p-5">
            <SectionHeader icon={Target}>Cross-Asset Effects</SectionHeader>
            {(cxA || cxB) ? (
              <ul className="space-y-2.5">
                {[cxA, cxB].filter(Boolean).map((line, i) => (
                  <li key={i} className="flex items-start gap-2.5">
                    <span className="w-1 h-1 rounded-full mt-[6px] shrink-0" style={{ background: industry.color }} />
                    <p className="text-[12px] text-ink-secondary leading-relaxed">{line}</p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[11px] text-ink-muted leading-relaxed">Cross-asset spillover is muted in the current regime.</p>
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
                  {themeClusters.map((cl, i) => (
                    <ThemeRow key={cl.id} cluster={cl} color={industry.color} index={i} />
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
                <div className="space-y-2">
                  <p className="text-[11.5px] text-ink-secondary leading-relaxed">
                    {industry.maTheme}
                  </p>
                  <p className="text-[10px] text-ink-muted">
                    No active M&A stories in the current feed window.
                  </p>
                </div>
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
              <SectionHeader icon={BarChart3}>Macro Drivers</SectionHeader>
              <div className="flex flex-wrap gap-1.5">
                {drivers.map(d => (
                  <DriverChip key={d} label={d} color={industry.color} />
                ))}
              </div>
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
                          <span
                            key={a}
                            className="text-[9.5px] font-bold font-mono px-1.5 py-0.5 rounded leading-none"
                            style={{ background: "rgba(16,185,129,0.09)", color: "#10b981" }}
                          >
                            {a}
                          </span>
                        ))}
                      </div>
                    )}
                    {hwds.length > 0 && (
                      <div className="flex items-start gap-2 flex-wrap">
                        <span className="text-[8.5px] font-bold shrink-0 mt-[3px]" style={{ color: "#ef444480" }}>↓ Headwinds</span>
                        {hwds.map(a => (
                          <span
                            key={a}
                            className="text-[9.5px] font-bold font-mono px-1.5 py-0.5 rounded leading-none"
                            style={{ background: "rgba(239,68,68,0.09)", color: "#ef4444" }}
                          >
                            {a}
                          </span>
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

        {/* ── Market Sensitivity (full width) ──────────────────────────── */}
        <motion.section
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.32, duration: 0.25, ease: "easeOut" }}
          className="bg-surface rounded-xl border border-edge p-5"
        >
          <SectionHeader icon={BarChart3}>Market Sensitivity</SectionHeader>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
            {industry.macroDrivers.map(driver => (
              <div
                key={driver}
                className="rounded-lg p-3 text-center"
                style={{ background: `${industry.color}0a`, border: `1px solid ${industry.color}20` }}
              >
                <p className="text-[11px] font-semibold text-ink leading-tight">{driver}</p>
                <div className="mt-1.5 h-[2px] rounded-full bg-raised overflow-hidden">
                  <div
                    className="h-full rounded-full"
                    style={{ width: "70%", background: industry.color }}
                  />
                </div>
              </div>
            ))}
          </div>
        </motion.section>

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
