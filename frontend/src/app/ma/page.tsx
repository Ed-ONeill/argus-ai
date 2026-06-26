"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { GitMerge, Building2, TrendingUp, TrendingDown, AlertCircle, ExternalLink, Clock, ChevronRight, Network, Lightbulb, Target, Landmark, Layers, ShieldCheck, History, Flame, Maximize2, X } from "lucide-react";
import { useMAIntelligence, type MADeal, type DealType } from "@/hooks/useMAIntelligence";
import { useMarketState } from "@/hooks/useMarketState";
import { useMarketData } from "@/hooks/useMarketData";
import { useFeed } from "@/hooks/useFeed";
import { computeThemeEvolutionState, getEvolutionNarrative, filterMAThemes } from "@/lib/themeEvolution";
import { explainMAActivity } from "@/lib/themeIntelligence";
import { clusterDealsByTheme } from "@/lib/industryIntelligence";
import { computeCapitalFlow } from "@/lib/capitalFlow";
import { useThemeWatchlist } from "@/hooks/useThemeWatchlist";
import { timeAgo, cn } from "@/lib/utils";
import { enrichDeal, buildLeagueTables, buildMarketRegime, largestDeals, tickerInfo, type DealContext, type DealIntel } from "@/lib/maIntelligence";
import { buildDealGraph, buildCompanyGraph } from "@/lib/maTransmissionGraph";
import { buildNarrativeGraph } from "@/lib/narrativeGraph";
import { buildSignalProfile, buildPredictions, seedThemeFor, narrativeChain, historicalPattern, type SignalProfile, type Prediction, type NarrativeStep, type HistoricalPattern } from "@/lib/argusReasoning";
import type { ThemeIntelligence } from "@/lib/types";

// Code-split the theme drawer — it only mounts when a theme is selected, so it
// stays out of the M&A page's First Load JS.
const ThemeDrawer = dynamic(
  () => import("@/components/themes/ThemeDrawer").then(m => m.ThemeDrawer),
  { ssr: false },
);

// Heavy interactive graph — lazy-loaded, only mounts inside an expanded deal so
// it never touches First Load JS and never blocks the initial render.
const NetworkGraph = dynamic(() => import("@/components/graph/NetworkGraph"), {
  ssr: false,
  loading: () => (
    <div className="rounded-xl border flex items-center justify-center" style={{ height: 460, borderColor: "rgba(82,176,200,0.2)", background: "rgba(5,9,16,0.6)" }}>
      <span className="text-[11px] animate-pulse" style={{ color: "rgba(255,255,255,0.4)" }}>Building transmission network…</span>
    </div>
  ),
});

// ── Deal type config ──────────────────────────────────────────────────────────

const DEAL_TYPE_META: Record<DealType, { label: string; color: string; bg: string }> = {
  strategic: { label: "Strategic",  color: "#52b0c8", bg: "rgba(82,176,200,0.12)"  },
  sponsor:   { label: "Sponsor",    color: "#a78bfa", bg: "rgba(167,139,250,0.12)" },
  merger:    { label: "Merger",     color: "#34d399", bg: "rgba(52,211,153,0.12)"  },
  rumored:   { label: "Rumored",    color: "#fbbf24", bg: "rgba(251,191,36,0.12)"  },
  withdrawn: { label: "Withdrawn",  color: "#f87171", bg: "rgba(248,113,113,0.12)" },
  spac:      { label: "SPAC",       color: "#fb923c", bg: "rgba(251,146,60,0.12)"  },
};

// Importance treatment per size class.
const SIZE_META: Record<string, { color: string }> = {
  mega:    { color: "#fbbf24" },
  large:   { color: "#52b0c8" },
  medium:  { color: "#94a3b8" },
  small:   { color: "#64748b" },
  unknown: { color: "#a78bfa" },
};

// Deal sector → Argus industry page (cross-linking). Omitted sectors are unlinked.
const SECTOR_TO_INDUSTRY: Record<string, string> = {
  "Technology": "software", "Healthcare": "healthcare", "Energy": "energy",
  "Financials": "financials", "Industrials": "industrials", "Consumer": "consumer",
  "Real Estate": "real-estate", "Media & Telecom": "media-telecom",
};

// ── Sub-components ────────────────────────────────────────────────────────────

function DealTypeBadge({ type }: { type: DealType }) {
  const { label, color, bg } = DEAL_TYPE_META[type];
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold tracking-wide uppercase"
      style={{ color, background: bg, border: `1px solid ${color}22` }}>
      {label}
    </span>
  );
}

// Relative stamp for a deal; if the source value is not a parseable date (it may
// already be a pre-formatted relative string) fall back to showing it as-is.
function formatRelativeTime(published: string): string {
  return timeAgo(published) || published;
}

// Compact metadata chip used across the deal intelligence header.
function MetaChip({ label, color, mono }: { label: string; color?: string; mono?: boolean }) {
  return (
    <span className={cn("px-1.5 py-0.5 rounded text-[10px] font-semibold leading-none", mono && "font-mono")}
      style={{ color: color ?? "rgba(255,255,255,0.5)", background: color ? `${color}14` : "rgba(255,255,255,0.05)", border: `1px solid ${color ? `${color}26` : "rgba(255,255,255,0.07)"}` }}>
      {label}
    </span>
  );
}

// Labeled block inside the expanded intelligence panel.
function IntelBlock({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[8.5px] font-bold uppercase tracking-[0.16em] mb-1" style={{ color: "rgba(255,255,255,0.34)" }}>{label}</p>
      {children}
    </div>
  );
}

// Lettered section header inside the expanded research note (A · Argus Assessment …).
function SecHead({ letter, title, color = "rgba(255,255,255,0.5)", right }: { letter: string; title: string; color?: string; right?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 mb-2.5">
      <span className="flex items-center justify-center w-4 h-4 rounded text-[8px] font-black shrink-0" style={{ color, background: `${color === "rgba(255,255,255,0.5)" ? "rgba(255,255,255,0.08)" : `${color}1f`}` }}>{letter}</span>
      <span className="text-[9.5px] font-bold uppercase tracking-[0.15em]" style={{ color }}>{title}</span>
      {right && <span className="ml-auto">{right}</span>}
    </div>
  );
}

// Ticker chip with a premium hover card (company name / sector / exchange).
// Hover-only, no modal, no click. Named group so it never fights the card's group.
function TickerChip({ ticker, color = "#52b0c8", border = true }: { ticker: string; color?: string; border?: boolean }) {
  const info = tickerInfo(ticker);
  return (
    <span className="relative inline-flex group/tk align-middle">
      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded leading-none cursor-default transition-transform duration-150 group-hover/tk:-translate-y-px"
        style={{ background: `${color}1a`, color, border: border ? `1px solid ${color}2e` : "none" }}>
        {ticker}
      </span>
      {info && (
        <span className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 z-40 w-max max-w-[200px]
          opacity-0 translate-y-1 group-hover/tk:opacity-100 group-hover/tk:translate-y-0 transition-all duration-150 ease-out">
          <span className="block rounded-lg px-2.5 py-2 border"
            style={{ background: "rgba(8,12,20,0.98)", borderColor: "rgba(255,255,255,0.12)", boxShadow: "0 10px 30px rgba(0,0,0,0.6)" }}>
            <span className="block text-[11px] font-semibold leading-tight" style={{ color: "rgba(255,255,255,0.94)" }}>{info.name}</span>
            <span className="flex items-center gap-1.5 mt-1">
              <span className="text-[9px] font-mono font-bold px-1 py-px rounded" style={{ color, background: `${color}1f` }}>{ticker}</span>
              <span className="text-[8.5px]" style={{ color: "rgba(255,255,255,0.44)" }}>{info.sector} · {info.exchange}</span>
            </span>
          </span>
        </span>
      )}
    </span>
  );
}

// Inline labelled set of ticker chips; self-hides when empty.
function TickerSet({ label, tickers, color }: { label: string; tickers: string[]; color: string }) {
  if (tickers.length === 0) return null;
  return (
    <div className="flex items-start gap-1.5 flex-wrap">
      <span className="text-[8px] font-bold uppercase tracking-wide shrink-0 mt-0.5" style={{ color: `${color}c0` }}>{label}</span>
      {tickers.map(t => <TickerChip key={t} ticker={t} color={color} />)}
    </div>
  );
}

// A Market Impact column (Winners / Losers / Follow-on) — header + stacked chips.
function ImpactColumn({ title, icon, tickers, color }: { title: string; icon: React.ReactNode; tickers: string[]; color: string }) {
  return (
    <div className="rounded-lg border p-2" style={{ borderColor: `${color}22`, background: `${color}0a` }}>
      <div className="flex items-center gap-1 mb-1.5" style={{ color }}>
        <span className="shrink-0">{icon}</span>
        <span className="text-[8px] font-bold uppercase tracking-wide leading-tight">{title}</span>
      </div>
      <div className="flex flex-wrap gap-1">
        {tickers.length > 0
          ? tickers.map(t => <TickerChip key={t} ticker={t} color={color} />)
          : <span className="text-[9px]" style={{ color: "rgba(255,255,255,0.28)" }}>—</span>}
      </div>
    </div>
  );
}

// Labeled cell for the scannable parties/metadata row.
function LabeledCell({ label, value, color, link }: { label: string; value: string; color?: string; link?: string }) {
  const body = <span className="text-[11.5px] font-bold leading-none truncate block" style={{ color: color ?? "rgba(255,255,255,0.84)" }}>{value}</span>;
  return (
    <div className="min-w-0">
      <p className="text-[7.5px] font-bold uppercase tracking-[0.16em] mb-1" style={{ color: "rgba(255,255,255,0.3)" }}>{label}</p>
      {link ? <Link href={link} className="hover:opacity-80 transition-opacity">{body}</Link> : body}
    </div>
  );
}

function BulletList({ items, dot }: { items: string[]; dot: string }) {
  return (
    <ul className="space-y-1">
      {items.map((b, i) => (
        <li key={i} className="flex items-start gap-1.5 text-[11px] leading-snug" style={{ color: "rgba(255,255,255,0.6)" }}>
          <span className="shrink-0 mt-[5px] w-1 h-1 rounded-full" style={{ background: dot }} />{b}
        </li>
      ))}
    </ul>
  );
}

function AdvisorRow({ label, names }: { label: string; names: string[] }) {
  if (names.length === 0) return null;
  return (
    <div className="flex items-start gap-1.5 flex-wrap">
      <span className="text-[8.5px] font-bold uppercase tracking-wide shrink-0 mt-1" style={{ color: "rgba(255,255,255,0.34)" }}>{label}</span>
      {names.map(n => <span key={n} className="text-[10px] font-medium px-1.5 py-0.5 rounded" style={{ background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.68)" }}>{n}</span>)}
    </div>
  );
}

// Institutional-confidence colour ramp (shared by card chip + assessment header).
function confidenceColor(score: number): string {
  return score >= 85 ? "#34d399" : score >= 68 ? "#52b0c8" : score >= 50 ? "#fbbf24" : "#fb923c";
}

// Signal-profile micro metric: tiny labelled bar with an explain-why tooltip.
function MiniMetric({ label, value, why }: { label: string; value: number; why: string }) {
  const c = value >= 75 ? "#34d399" : value >= 55 ? "#52b0c8" : value >= 40 ? "#fbbf24" : "#fb923c";
  return (
    <div className="group/mm relative cursor-default">
      <div className="flex items-center justify-between mb-0.5">
        <span className="text-[7.5px] font-bold uppercase tracking-wide leading-none truncate" style={{ color: "rgba(255,255,255,0.4)" }}>{label}</span>
        <span className="text-[8.5px] font-black tabular-nums" style={{ color: c }}>{value}</span>
      </div>
      <div className="h-0.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.07)" }}>
        <div className="h-0.5 rounded-full" style={{ width: `${value}%`, background: c }} />
      </div>
      <span className="pointer-events-none absolute bottom-full left-0 mb-1 z-40 w-max max-w-[170px] opacity-0 translate-y-1 group-hover/mm:opacity-100 group-hover/mm:translate-y-0 transition-all duration-150">
        <span className="block rounded-md px-2 py-1 border text-[8.5px] leading-snug" style={{ background: "rgba(8,12,20,0.98)", borderColor: "rgba(255,255,255,0.12)", color: "rgba(255,255,255,0.78)", boxShadow: "0 8px 22px rgba(0,0,0,0.6)" }}>{why}</span>
      </span>
    </div>
  );
}

// ── Reusable intelligence blocks — shared by the expanded card tabs and the
//    full-intelligence drawer so nothing is duplicated. ───────────────────────────

function AssessmentBlock({ intel, signal, compact = false }: { intel: DealIntel; signal: SignalProfile; compact?: boolean }) {
  const confColor = confidenceColor(intel.confidence.score);
  return (
    <div className="rounded-lg border p-3 pt-2.5" style={{ borderColor: "rgba(167,139,250,0.22)", background: "rgba(167,139,250,0.05)" }}>
      <div className="flex items-center gap-1.5 mb-1.5">
        <span className="text-[8.5px] font-black uppercase tracking-[0.18em]" style={{ color: "rgba(196,181,253,0.95)" }}>Argus Assessment</span>
        <span className="text-[7px] px-1 py-px rounded uppercase tracking-wide font-bold" style={{ color: "rgba(255,255,255,0.4)", background: "rgba(255,255,255,0.06)" }}>interpretation</span>
        <span className="ml-auto flex items-center gap-1.5">
          <span className="text-[7.5px] font-bold uppercase tracking-wide" style={{ color: "rgba(255,255,255,0.4)" }}>Confidence</span>
          <span className="text-[15px] font-black tabular-nums leading-none" style={{ color: confColor }}>{intel.confidence.score}</span>
          <span className="text-[8.5px] font-bold uppercase" style={{ color: confColor }}>{intel.confidence.label}</span>
        </span>
      </div>
      <p className="text-[12px] leading-relaxed" style={{ color: "rgba(255,255,255,0.8)" }}>{intel.argusAssessment}</p>
      {intel.confidence.supports.length > 0 && (
        <div className="flex items-center gap-1.5 flex-wrap mt-2">
          <span className="text-[7.5px] font-bold uppercase tracking-wide" style={{ color: "rgba(255,255,255,0.34)" }}>Supported by</span>
          {intel.confidence.supports.map(s => (
            <span key={s} className="text-[9px] px-1.5 py-0.5 rounded" style={{ background: `${confColor}14`, color: `${confColor}d8`, border: `1px solid ${confColor}26` }}>{s}</span>
          ))}
        </div>
      )}
      {intel.themeTags.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-2.5">
          {intel.themeTags.map(t => (
            <span key={t} className="text-[9px] font-semibold px-2 py-0.5 rounded-full" style={{ background: "rgba(167,139,250,0.12)", color: "#c4b5fd", border: "1px solid rgba(167,139,250,0.22)" }}>{t}</span>
          ))}
        </div>
      )}
      {/* Signal profile + rationale/why-now: deeper detail, full view only */}
      {!compact && (
        <>
          <div className="mt-2.5 pt-2.5 border-t" style={{ borderColor: "rgba(255,255,255,0.07)" }}>
            <div className="flex items-center gap-1.5 mb-1.5">
              <span className="text-[7.5px] font-bold uppercase tracking-[0.14em]" style={{ color: "rgba(255,255,255,0.34)" }}>Signal Profile</span>
              <span className="text-[8.5px] font-black tabular-nums" style={{ color: confidenceColor(signal.composite) }}>{signal.composite}</span>
              <span className="text-[7.5px]" style={{ color: "rgba(255,255,255,0.3)" }}>composite</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-3 gap-y-1.5">
              {signal.scores.map(s => <MiniMetric key={s.label} label={s.label} value={s.value} why={s.why} />)}
            </div>
          </div>
          <div className="grid sm:grid-cols-2 gap-x-5 gap-y-2.5 mt-3 pt-2.5 border-t" style={{ borderColor: "rgba(255,255,255,0.07)" }}>
            <IntelBlock label="Strategic Rationale"><BulletList items={intel.rationaleBullets} dot="rgba(167,139,250,0.6)" /></IntelBlock>
            <IntelBlock label="Why Now"><BulletList items={intel.whyNowBullets} dot="rgba(82,176,200,0.6)" /></IntelBlock>
          </div>
        </>
      )}
    </div>
  );
}

function StatusBlock({ intel }: { intel: DealIntel }) {
  const curIdx = intel.timeline.findIndex(s => s.current);
  const nextMilestone = curIdx >= 0 && curIdx < intel.timeline.length - 1 ? intel.timeline[curIdx + 1].stage : null;
  return (
    <div>
      <SecHead letter="B" title="Deal Status" right={<span className="text-[11px] font-black tabular-nums" style={{ color: intel.completion.color }}>{intel.completion.pct}% · {intel.completion.label}</span>} />
      <div className="flex items-center gap-2 mb-2">
        <span className="text-[7.5px] font-bold uppercase tracking-wide shrink-0" style={{ color: "rgba(255,255,255,0.34)" }}>Est. Completion</span>
        <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.07)" }}>
          <motion.div className="h-1.5 rounded-full" initial={{ width: 0 }} animate={{ width: `${intel.completion.pct}%` }} transition={{ duration: 0.7, ease: "easeOut" }} style={{ background: intel.completion.color }} />
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5 mb-3">
        {intel.completion.drivers.map(d => (
          <span key={d} className="text-[9.5px] px-1.5 py-0.5 rounded font-medium" style={{ background: "rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.58)", border: "1px solid rgba(255,255,255,0.08)" }}>{d}</span>
        ))}
      </div>
      <div className="overflow-x-auto scrollbar-hide -mx-0.5 px-0.5 pt-1 mb-1.5">
        <div className="flex items-center gap-1 min-w-[560px]">
          {intel.timeline.map((s, i) => (
            <div key={s.stage} className="flex items-center gap-1 min-w-0" style={{ flex: i < intel.timeline.length - 1 ? "1 1 0%" : "0 0 auto" }}>
              <div className="group/stage relative flex flex-col items-center gap-1 shrink-0 cursor-default">
                {s.current
                  ? <motion.span className="w-2.5 h-2.5 rounded-full" style={{ background: intel.statusColor, boxShadow: `0 0 0 3px ${intel.statusColor}33` }}
                      animate={{ boxShadow: [`0 0 0 2px ${intel.statusColor}33`, `0 0 0 4px ${intel.statusColor}1a`, `0 0 0 2px ${intel.statusColor}33`] }} transition={{ duration: 2, repeat: Infinity }} />
                  : <span className="w-2 h-2 rounded-full" style={{ background: s.done ? "rgba(82,176,200,0.6)" : "rgba(255,255,255,0.14)" }} />}
                <span className="text-[7.5px] font-semibold uppercase tracking-wide whitespace-nowrap" style={{ color: s.current ? intel.statusColor : s.done ? "rgba(255,255,255,0.5)" : "rgba(255,255,255,0.26)" }}>{s.stage}</span>
                <span className="pointer-events-none absolute bottom-full mb-1.5 left-1/2 -translate-x-1/2 z-40 w-max opacity-0 translate-y-1 group-hover/stage:opacity-100 group-hover/stage:translate-y-0 transition-all duration-150">
                  <span className="block rounded-md px-2 py-1 border text-[8.5px] font-medium" style={{ background: "rgba(8,12,20,0.98)", borderColor: "rgba(255,255,255,0.12)", color: "rgba(255,255,255,0.82)", boxShadow: "0 8px 24px rgba(0,0,0,0.6)" }}>
                    {s.current ? "Current stage" : s.done ? "Completed" : "Upcoming"} · {s.stage}
                  </span>
                </span>
              </div>
              {i < intel.timeline.length - 1 && <div className="flex-1 h-px mb-3.5" style={{ background: s.done ? "rgba(82,176,200,0.4)" : "rgba(255,255,255,0.08)" }} />}
            </div>
          ))}
        </div>
      </div>
      {nextMilestone && (
        <p className="text-[9px] mb-2.5" style={{ color: "rgba(255,255,255,0.42)" }}>
          <span className="font-bold uppercase tracking-wide" style={{ color: `${intel.statusColor}c0` }}>Next milestone:</span> {nextMilestone}
        </p>
      )}
      <IntelBlock label="What to Watch"><BulletList items={intel.whatNextBullets} dot="rgba(251,191,36,0.6)" /></IntelBlock>
    </div>
  );
}

function CapitalSummaryLine({ intel }: { intel: DealIntel }) {
  const f = intel.capitalTransmission.flow;
  return (
    <div className="flex items-center gap-1.5 flex-wrap rounded-md px-2.5 py-1.5" style={{ background: "rgba(82,176,200,0.06)", border: "1px solid rgba(82,176,200,0.14)" }}>
      <span className="text-[8px] font-bold uppercase tracking-wide shrink-0" style={{ color: "rgba(82,176,200,0.7)" }}>Capital</span>
      <span className="text-[10px] font-semibold" style={{ color: "rgba(255,255,255,0.72)" }}>{f.acquirer}</span>
      <span className="text-[10px]" style={{ color: "rgba(82,176,200,0.5)" }}>→</span>
      <span className="text-[10px]" style={{ color: "rgba(255,255,255,0.6)" }}>{f.sector}</span>
      {f.beneficiaries.length > 0 && <><span className="text-[10px]" style={{ color: "rgba(52,211,153,0.55)" }}>→</span>{f.beneficiaries.slice(0, 3).map(t => <TickerChip key={t} ticker={t} color="#34d399" />)}</>}
      {f.pressured.length > 0 && <><span className="text-[9px] font-bold uppercase" style={{ color: "rgba(248,113,113,0.6)" }}>vs</span>{f.pressured.slice(0, 2).map(t => <TickerChip key={t} ticker={t} color="#f87171" />)}</>}
    </div>
  );
}

function ImpactBlock({ intel }: { intel: DealIntel }) {
  const mi = intel.marketImpact;
  const hasImpactTickers = mi.winners.length + mi.losers.length + mi.followOn.length > 0;
  return (
    <div>
      <SecHead letter="C" title="Market Impact" color="rgba(52,211,153,0.8)" />
      {hasImpactTickers ? (
        <div className="grid grid-cols-3 gap-2 mb-2.5">
          <ImpactColumn title="Winners" icon={<TrendingUp size={10} />} tickers={mi.winners} color="#34d399" />
          <ImpactColumn title="Losers" icon={<TrendingDown size={10} />} tickers={mi.losers} color="#f87171" />
          <ImpactColumn title="Follow-on Watchlist" icon={<Target size={10} />} tickers={mi.followOn} color="#fbbf24" />
        </div>
      ) : (
        <div className="mb-2.5"><BulletList items={intel.implicationBullets} dot="rgba(52,211,153,0.6)" /></div>
      )}
      <p className="text-[11px] leading-snug rounded-md px-2.5 py-1.5" style={{ color: "rgba(255,255,255,0.62)", background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.05)" }}>
        <span className="text-[8px] font-bold uppercase tracking-wide mr-1.5" style={{ color: "rgba(52,211,153,0.7)" }}>Re-rating</span>{mi.rerating}
      </p>
    </div>
  );
}

function PredictionBlock({ predictions }: { predictions: Prediction[] }) {
  if (predictions.length === 0) return null;
  return (
    <div>
      <SecHead letter="◆" title="Argus Prediction Engine" color="rgba(251,191,36,0.85)" right={<span className="text-[8px] uppercase tracking-wide" style={{ color: "rgba(255,255,255,0.3)" }}>likelihoods, not certainty</span>} />
      <div className="space-y-2">
        {predictions.map(p => {
          const c = p.probability >= 60 ? "#34d399" : p.probability >= 45 ? "#fbbf24" : "#fb923c";
          return (
            <div key={p.label} className="rounded-lg border px-2.5 py-2" style={{ borderColor: "rgba(255,255,255,0.07)", background: "rgba(255,255,255,0.02)" }}>
              <div className="flex items-center gap-2">
                <span className="text-[8px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded shrink-0" style={{ color: "rgba(255,255,255,0.5)", background: "rgba(255,255,255,0.05)" }}>{p.kind}</span>
                <span className="text-[11px] font-medium leading-tight flex-1 min-w-0" style={{ color: "rgba(255,255,255,0.78)" }}>{p.label}</span>
                <span className="text-[12px] font-black tabular-nums shrink-0" style={{ color: c }}>{p.probability}%</span>
              </div>
              <div className="h-1 rounded-full overflow-hidden my-1.5" style={{ background: "rgba(255,255,255,0.06)" }}>
                <motion.div className="h-1 rounded-full" initial={{ width: 0 }} animate={{ width: `${p.probability}%` }} transition={{ duration: 0.6, ease: "easeOut" }} style={{ background: c }} />
              </div>
              <p className="text-[9.5px] leading-snug" style={{ color: "rgba(255,255,255,0.46)" }}>
                <span className="font-bold" style={{ color: "rgba(255,255,255,0.6)" }}>Why:</span> {p.basis}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function NarrativeBlock({ seedTheme, propagation, memory }: { seedTheme: string | null; propagation: NarrativeStep[]; memory: HistoricalPattern | null }) {
  if (!seedTheme || propagation.length === 0) return null;
  return (
    <div>
      <SecHead letter="❯" title="Narrative Propagation" color="rgba(251,146,60,0.85)" right={<span className="text-[8px] uppercase tracking-wide" style={{ color: "rgba(255,255,255,0.3)" }}>relationship graph</span>} />
      <div className="flex items-center gap-1 flex-wrap rounded-lg border px-2.5 py-2" style={{ borderColor: "rgba(251,146,60,0.15)", background: "rgba(251,146,60,0.04)" }}>
        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: "rgba(251,146,60,0.16)", color: "#fb923c" }}>{seedTheme}</span>
        {propagation.map((s, i) => (
          <span key={i} className="flex items-center gap-1 group/np relative">
            <span className="text-[10px]" style={{ color: "rgba(251,146,60,0.5)" }}>→</span>
            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full cursor-default" style={{ background: "rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.66)" }}>{s.to}</span>
            <span className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-1 z-40 w-max max-w-[180px] opacity-0 translate-y-1 group-hover/np:opacity-100 group-hover/np:translate-y-0 transition-all duration-150">
              <span className="block rounded-md px-2 py-1 border text-[8.5px] leading-snug" style={{ background: "rgba(8,12,20,0.98)", borderColor: "rgba(255,255,255,0.12)", color: "rgba(255,255,255,0.78)", boxShadow: "0 8px 22px rgba(0,0,0,0.6)" }}>
                <b style={{ color: "#fb923c" }}>{s.relation}</b> · {s.rationale}
              </span>
            </span>
          </span>
        ))}
      </div>
      {memory && (
        <p className="text-[9.5px] leading-snug mt-1.5 flex items-start gap-1.5" style={{ color: "rgba(255,255,255,0.46)" }}>
          <History size={11} className="shrink-0 mt-px" style={{ color: "rgba(255,255,255,0.34)" }} />
          <span><span className="font-bold" style={{ color: "rgba(255,255,255,0.6)" }}>Argus memory:</span> {memory.note}</span>
        </p>
      )}
    </div>
  );
}

function ComparablesBlock({ deal, intel }: { deal: MADeal; intel: DealIntel }) {
  if (intel.comparables.length === 0) return null;
  return (
    <div>
      <SecHead letter="◷" title="Comparable Deals" color="rgba(255,255,255,0.5)" right={<span className="text-[8px] uppercase tracking-wide" style={{ color: "rgba(255,255,255,0.3)" }}>{deal.sector} precedents</span>} />
      <div className="grid sm:grid-cols-2 gap-1.5">
        {intel.comparables.map(c => (
          <a key={`${c.acquirer}-${c.target}`} href={`https://www.google.com/search?q=${encodeURIComponent(`${c.acquirer} ${c.target} acquisition`)}`} target="_blank" rel="noopener noreferrer"
            className="group/cmp flex items-center gap-2 rounded-lg border px-2.5 py-1.5 transition-colors hover:border-white/15"
            style={{ borderColor: "rgba(255,255,255,0.07)", background: "rgba(255,255,255,0.02)" }}>
            <History size={11} className="shrink-0" style={{ color: "rgba(255,255,255,0.3)" }} />
            <span className="min-w-0 flex-1">
              <span className="block text-[11px] font-medium leading-tight truncate" style={{ color: "rgba(255,255,255,0.74)" }}>
                {c.acquirer} <span style={{ color: "rgba(255,255,255,0.34)" }}>→</span> {c.target}
              </span>
              <span className="text-[9px]" style={{ color: "rgba(255,255,255,0.36)" }}>{c.value} · {c.year}</span>
            </span>
            <ExternalLink size={10} className="shrink-0 opacity-0 group-hover/cmp:opacity-50 transition-opacity" style={{ color: "rgba(255,255,255,0.6)" }} />
          </a>
        ))}
      </div>
    </div>
  );
}

function SimilarBlock({ similar }: { similar: { d: MADeal; i: DealIntel }[] }) {
  if (similar.length === 0) return null;
  return (
    <div>
      <SecHead letter="≈" title="Similar Recent Deals" color="rgba(167,139,250,0.8)" right={<span className="text-[8px] uppercase tracking-wide" style={{ color: "rgba(255,255,255,0.3)" }}>in this feed</span>} />
      <div className="space-y-2">
        {similar.map(({ d, i }) => (
          <a key={d.id} href={d.url} target="_blank" rel="noopener noreferrer" className="group/sim flex items-start gap-2">
            <span className="w-1.5 h-1.5 rounded-full shrink-0 mt-1.5" style={{ background: i.statusColor }} />
            <span className="min-w-0 flex-1">
              <span className="block text-[11px] leading-tight line-clamp-1 group-hover/sim:text-white/85 transition-colors" style={{ color: "rgba(255,255,255,0.64)" }}>{d.title}</span>
              <span className="text-[8.5px]" style={{ color: "rgba(255,255,255,0.32)" }}>{i.txnType} · {d.sector}{i.dealValue && i.dealValue !== "Undisclosed" ? ` · ${i.dealValue}` : ""}</span>
            </span>
          </a>
        ))}
      </div>
    </div>
  );
}

function TransactionBlock({ intel }: { intel: DealIntel }) {
  const a = intel.advisorSides;
  const hasAdvisors = intel.advisors.banks.length > 0 || intel.advisors.legal.length > 0;
  const hasSidedAdvisors = a.buyFinancial.length + a.sellFinancial.length + a.buyLegal.length + a.sellLegal.length > 0;
  const hasAny = intel.economics.length > 0 || intel.financingDetail.length > 0 || intel.competingBidders.length > 0 || hasAdvisors || a.financing.length > 0 || intel.readThroughGroups.length > 0 || intel.readThrough.length > 0 || intel.dynamicSections.length > 0;
  if (!hasAny) return null;
  return (
    <div>
      <SecHead letter="D" title="Transaction Details" color="rgba(82,176,200,0.8)" />
      {intel.economics.length > 0 && (
        <div className="rounded-lg border grid grid-cols-2 sm:grid-cols-4 divide-x divide-y sm:divide-y-0 mb-3" style={{ borderColor: "rgba(255,255,255,0.07)", background: "rgba(255,255,255,0.015)" }}>
          {intel.economics.map(e => (
            <div key={e.label} className="px-3 py-2" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
              <p className="text-[7.5px] font-bold uppercase tracking-[0.14em]" style={{ color: "rgba(255,255,255,0.34)" }}>{e.label}</p>
              <p className="text-[13px] font-black tabular-nums mt-0.5" style={{ color: "rgba(255,255,255,0.9)" }}>{e.value}</p>
            </div>
          ))}
        </div>
      )}
      <div className="grid sm:grid-cols-2 gap-x-5 gap-y-3">
        {intel.financingDetail.length > 0 && (
          <IntelBlock label="Financing">
            <div className="flex flex-wrap gap-1">{intel.financingDetail.map(f => <span key={f} className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: "rgba(82,176,200,0.1)", color: "rgba(82,176,200,0.8)" }}>{f}</span>)}</div>
          </IntelBlock>
        )}
        {intel.competingBidders.length > 0 && (
          <IntelBlock label="Other Interested Parties">
            <div className="flex flex-wrap gap-1">{intel.competingBidders.map(p => <span key={p} className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: "rgba(251,191,36,0.1)", color: "#fbbf24" }}>{p}</span>)}</div>
          </IntelBlock>
        )}
        {(hasAdvisors || a.financing.length > 0) && (
          <IntelBlock label="Advisor Intelligence">
            {hasSidedAdvisors ? (
              <div className="space-y-1">
                <AdvisorRow label="Buy-side" names={[...a.buyFinancial, ...a.buyLegal]} />
                <AdvisorRow label="Sell-side" names={[...a.sellFinancial, ...a.sellLegal]} />
                <AdvisorRow label="Financing" names={a.financing} />
                <AdvisorRow label="Fairness" names={a.fairness} />
              </div>
            ) : (
              <div className="space-y-1">
                <AdvisorRow label="Financial" names={intel.advisors.banks.filter(b => !a.financing.includes(b) && !a.fairness.includes(b))} />
                <AdvisorRow label="Legal" names={intel.advisors.legal} />
                <AdvisorRow label="Financing" names={a.financing} />
                <AdvisorRow label="Fairness" names={a.fairness} />
              </div>
            )}
          </IntelBlock>
        )}
        {intel.readThroughGroups.length > 0 ? (
          <IntelBlock label="Potential Read-Through">
            <div className="space-y-1.5">
              {intel.readThroughGroups.map(g => {
                const rc = g.role === "Beneficiaries" ? "#34d399" : g.role === "Competitors" ? "#f87171" : g.role === "Suppliers" ? "#52b0c8" : "#a78bfa";
                return <TickerSet key={g.role} label={g.role} tickers={g.tickers} color={rc} />;
              })}
            </div>
          </IntelBlock>
        ) : intel.readThrough.length > 0 && (
          <IntelBlock label="Potential Read-Through">
            <div className="flex flex-wrap gap-1">{intel.readThrough.map(p => <TickerChip key={p} ticker={p} color="#52b0c8" />)}</div>
          </IntelBlock>
        )}
      </div>
      {intel.dynamicSections.length > 0 && (
        <div className="grid sm:grid-cols-2 gap-x-5 gap-y-3 mt-3 pt-3 border-t" style={{ borderColor: "rgba(255,255,255,0.05)" }}>
          {intel.dynamicSections.map(s => (
            <IntelBlock key={s.label} label={s.label}><BulletList items={s.bullets} dot="rgba(255,255,255,0.4)" /></IntelBlock>
          ))}
        </div>
      )}
    </div>
  );
}

function TransmissionDetailBlock({ intel }: { intel: DealIntel }) {
  const ct = intel.capitalTransmission;
  const flowSteps = [
    { label: "Acquirer",       items: [ct.flow.acquirer], color: "#a78bfa", mono: false },
    { label: "Sector",         items: [ct.flow.sector],   color: "#52b0c8", mono: false },
    ...(ct.flow.beneficiaries.length ? [{ label: "Beneficiaries",  items: ct.flow.beneficiaries, color: "#34d399", mono: true }]  : []),
    ...(ct.flow.pressured.length     ? [{ label: "Pressured Peers", items: ct.flow.pressured,     color: "#f87171", mono: true }]  : []),
    ...(ct.flow.themes.length        ? [{ label: "Themes",         items: ct.flow.themes,        color: "#c4b5fd", mono: false }] : []),
  ];
  return (
    <div className="rounded-lg border p-3 pt-2.5" style={{ borderColor: "rgba(82,176,200,0.2)", background: "rgba(82,176,200,0.045)" }}>
      <p className="text-[8.5px] font-black uppercase tracking-[0.16em] mb-2.5" style={{ color: "rgba(82,176,200,0.8)" }}>E · Capital Transmission</p>
      <div className="mb-3">
        {flowSteps.map((step, i) => (
          <div key={step.label} className="flex items-start gap-2.5">
            <div className="flex flex-col items-center shrink-0 pt-1">
              <span className="w-2 h-2 rounded-full" style={{ background: step.color }} />
              {i < flowSteps.length - 1 && <span className="w-px flex-1 min-h-[16px]" style={{ background: "linear-gradient(to bottom, rgba(82,176,200,0.4), rgba(255,255,255,0.08))" }} />}
            </div>
            <div className={cn("min-w-0", i < flowSteps.length - 1 && "pb-1.5")}>
              <p className="text-[7.5px] font-bold uppercase tracking-[0.14em] mb-1" style={{ color: "rgba(255,255,255,0.38)" }}>{step.label}</p>
              <div className="flex flex-wrap gap-1">
                {step.items.map(it => (
                  step.mono
                    ? <TickerChip key={it} ticker={it} color={step.color} />
                    : <span key={it} className="text-[10.5px] px-1.5 py-0.5 rounded font-medium leading-none" style={{ background: `${step.color}18`, color: step.color, border: `1px solid ${step.color}33` }}>{it}</span>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-1.5 flex-wrap mb-2.5 pt-2.5 border-t" style={{ borderColor: "rgba(82,176,200,0.14)" }}>
        {ct.chain.map((step, i) => (
          <span key={i} className="flex items-center gap-1.5">
            {i > 0 && <span className="text-[10px]" style={{ color: "rgba(82,176,200,0.45)" }}>→</span>}
            <span className="text-[10.5px] font-medium leading-tight" style={{ color: "rgba(255,255,255,0.62)" }}>{step}</span>
          </span>
        ))}
      </div>
      <div className="grid sm:grid-cols-2 gap-x-4 gap-y-1">
        {ct.effects.map(e => (
          <p key={e.label} className="text-[10.5px] leading-snug" style={{ color: "rgba(255,255,255,0.55)" }}>
            <span className="font-bold" style={{ color: "rgba(255,255,255,0.72)" }}>{e.label}:</span> {e.text}
          </p>
        ))}
      </div>
    </div>
  );
}

// Find recent deals in the feed similar to the open one (same sector or shared theme).
function findSimilar(deal: MADeal, intel: DealIntel, siblings: MADeal[], ctx: DealContext): { d: MADeal; i: DealIntel }[] {
  const tags = new Set(intel.themeTags);
  return siblings
    .filter(d => d.id !== deal.id)
    .map(d => ({ d, i: enrichDeal(d, ctx) }))
    .filter(({ d, i }) => d.sector === deal.sector || i.themeTags.some(t => tags.has(t)))
    .slice(0, 5);
}

// Adaptive visual weight by significance tier — guides the eye to the biggest deals.
const TIER_STYLE: Record<DealIntel["tier"], { pad: string; title: string; accent: number; bg: number; glow: boolean }> = {
  headline: { pad: "p-5",   title: "text-base sm:text-lg font-semibold", accent: 3.5, bg: 0.05,  glow: true  },
  major:    { pad: "p-4",   title: "text-[15px] font-semibold",          accent: 2.5, bg: 0.035, glow: false },
  standard: { pad: "p-3.5", title: "text-sm font-medium",                accent: 0,   bg: 0.022, glow: false },
  minor:    { pad: "p-3",   title: "text-[13px] font-medium",            accent: 0,   bg: 0.018, glow: false },
};

type DealTab = "Overview" | "Impact" | "Network" | "Comparables" | "Prediction";

function DealCard({ deal, index, ctx, open, onToggle, siblings, onOpenFull }: { deal: MADeal; index: number; ctx: DealContext; open: boolean; onToggle: () => void; siblings: MADeal[]; onOpenFull: () => void }) {
  const [graphMode, setGraphMode] = useState<"deal" | "narrative">("deal");
  const [tab, setTab] = useState<DealTab>("Overview");
  const intel = useMemo(() => enrichDeal(deal, ctx), [deal, ctx]);
  const similar = useMemo(() => open && tab === "Comparables" ? findSimilar(deal, intel, siblings, ctx) : [], [open, tab, deal, intel, siblings, ctx]);
  const hasAdvisors = intel.advisors.banks.length > 0 || intel.advisors.legal.length > 0;
  const sizeColor = SIZE_META[intel.sizeClass]?.color ?? "#a78bfa";
  const industrySlug = SECTOR_TO_INDUSTRY[deal.sector];
  const ts = TIER_STYLE[intel.tier];
  const prominent = intel.tier === "headline" || intel.tier === "major";
  const confColor = confidenceColor(intel.confidence.score);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index, 14) * 0.025, duration: 0.22, layout: { duration: 0.28, ease: "easeOut" } }}
      whileHover={{ y: -1 }}
      className={cn("group rounded-xl border transition-shadow duration-200", open && "ring-1")}
      style={{
        background: open ? `rgba(255,255,255,${ts.bg + 0.01})` : `rgba(255,255,255,${ts.bg})`,
        borderColor: ts.accent > 0 ? `${sizeColor}33` : "rgba(255,255,255,0.06)",
        borderLeft: ts.accent > 0 ? `${ts.accent}px solid ${sizeColor}` : "1px solid rgba(255,255,255,0.06)",
        boxShadow: open ? `0 12px 40px rgba(0,0,0,0.4)` : ts.glow ? `0 0 0 1px ${sizeColor}1f, 0 8px 30px rgba(0,0,0,0.25)` : "none",
        ...(open ? { ["--tw-ring-color" as string]: `${sizeColor}40` } : {}),
      }}
    >
      <div className={ts.pad}>
        {/* Header — importance · type · status · txn · value */}
        <div className="flex items-center gap-1.5 flex-wrap mb-2.5">
          <span className={cn("px-1.5 py-0.5 rounded font-black uppercase tracking-wide leading-none", intel.tier === "headline" ? "text-[10px]" : "text-[9px]")}
            style={{ color: sizeColor, background: `${sizeColor}18`, border: `1px solid ${sizeColor}33` }}>{intel.sizeLabel}</span>
          <DealTypeBadge type={deal.dealType} />
          <MetaChip label={intel.status} color={intel.statusColor} />
          <MetaChip label={intel.txnType} />
          {deal.peFirm && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium leading-none"
              style={{ background: "rgba(167,139,250,0.08)", color: "#c4b5fd", border: "1px solid rgba(167,139,250,0.15)" }}>
              <Building2 size={9} />{deal.peFirm}
            </span>
          )}
          {prominent && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold leading-none" title={`Intelligence confidence ${intel.confidence.score} · ${intel.confidence.label}`}
              style={{ background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.6)", border: "1px solid rgba(255,255,255,0.08)" }}>
              <ShieldCheck size={9} style={{ color: confColor }} />{intel.confidence.score}
            </span>
          )}
          {industrySlug
            ? <Link href={`/industries/${industrySlug}`} className="text-[10px] ml-auto hover:text-white/60 transition-colors" style={{ color: "rgba(255,255,255,0.34)" }}>{deal.sector} ↗</Link>
            : <span className="text-[10px] ml-auto" style={{ color: "rgba(255,255,255,0.26)" }}>{deal.sector}</span>}
        </div>

        {/* Headline (links to source) */}
        <a href={deal.url} target="_blank" rel="noopener noreferrer"
          className={cn("block leading-snug hover:text-white/95 transition-colors", ts.title)}
          style={{ color: "rgba(255,255,255,0.88)" }}>
          {deal.title}
          <ExternalLink size={11} className="inline-block ml-1.5 -translate-y-px opacity-0 group-hover:opacity-40 transition-opacity" />
        </a>

        {/* Scannable parties / metadata row */}
        <div className="flex items-stretch gap-3 mt-2.5 flex-wrap">
          {intel.buyer && <LabeledCell label="Buyer" value={intel.buyer} />}
          {intel.target && <LabeledCell label="Target" value={intel.target} color={deal.dealType === "withdrawn" ? "rgba(248,113,113,0.8)" : "rgba(82,176,200,0.9)"} />}
          {intel.dealValue && <LabeledCell label="Value" value={intel.dealValue} color="rgba(255,255,255,0.95)" />}
          {intel.financing && <LabeledCell label="Consideration" value={intel.financing} />}
          {intel.premium && <LabeledCell label="Premium" value={intel.premium} color="#34d399" />}
          {intel.country && <LabeledCell label="Geography" value={intel.crossBorder ? `${intel.country} · X-border` : intel.country} />}
        </div>

        {/* Tags only (collapsed cards stay scannable — no prose) */}
        {prominent && intel.themeTags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-2.5">
            {intel.themeTags.slice(0, intel.tier === "headline" ? 4 : 3).map(t => (
              <span key={t} className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full" style={{ background: "rgba(167,139,250,0.1)", color: "#c4b5fd", border: "1px solid rgba(167,139,250,0.2)" }}>{t}</span>
            ))}
          </div>
        )}

        {/* Probability of completion — inferred estimate, always visible */}
        <div className="flex items-center gap-2 mt-2.5">
          <span className="text-[8px] font-bold uppercase tracking-[0.14em] shrink-0" style={{ color: "rgba(255,255,255,0.34)" }}>Completion</span>
          <div className="flex-1 h-1 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.07)" }}>
            <motion.div className="h-1 rounded-full" initial={{ width: 0 }} animate={{ width: `${intel.completion.pct}%` }} transition={{ duration: 0.6, ease: "easeOut", delay: 0.1 }} style={{ background: intel.completion.color }} />
          </div>
          <span className="text-[11px] font-black tabular-nums shrink-0" style={{ color: intel.completion.color }}>{intel.completion.pct}%</span>
          <span className="text-[8.5px] font-semibold uppercase tracking-wide shrink-0" style={{ color: `${intel.completion.color}c0` }}>{intel.completion.label}</span>
        </div>

        {/* Footer: rationale + signal chips + time + expand */}
        <div className="flex items-center gap-2 mt-2.5 flex-wrap">
          <span className="text-[10px] font-semibold" style={{ color: "rgba(167,139,250,0.72)" }}>{intel.rationale}</span>
          {intel.synergies && <span className="text-[9px] px-1.5 py-px rounded" style={{ background: "rgba(52,211,153,0.1)", color: "#34d399" }}>{intel.synergies}</span>}
          {hasAdvisors && <span className="text-[9.5px]" style={{ color: "rgba(255,255,255,0.3)" }}>· {intel.advisors.banks.length + intel.advisors.legal.length} advisors</span>}
          {intel.competingBidders.length > 0 && <span className="text-[9px] px-1.5 py-px rounded" style={{ background: "rgba(251,191,36,0.1)", color: "#fbbf24" }}>{intel.competingBidders.length} rival bidder{intel.competingBidders.length > 1 ? "s" : ""}</span>}
          <div className="flex items-center gap-1 ml-auto shrink-0" style={{ color: "rgba(255,255,255,0.28)" }}>
            <Clock size={10} /><span className="text-[10px]">{formatRelativeTime(deal.published)}</span>
          </div>
          <button onClick={onToggle}
            className="flex items-center gap-1 text-[10px] font-semibold transition-colors hover:text-white/70 shrink-0"
            style={{ color: open ? sizeColor : "rgba(255,255,255,0.42)" }}>
            {open ? "Less" : "Intelligence"}
            <ChevronRight size={11} className={cn("transition-transform", open && "rotate-90")} />
          </button>
        </div>
      </div>

      {/* Expanded research note */}
      {open && (() => {
        const signal = buildSignalProfile(deal, intel);
        const predictions = buildPredictions(deal, intel);
        const seedTheme = seedThemeFor(deal, intel);
        const propagation = seedTheme ? narrativeChain(seedTheme, 7) : [];
        const memory = historicalPattern(deal, intel);
        const narrativeModel = seedTheme ? buildNarrativeGraph(seedTheme) : null;
        const activeGraph = graphMode === "narrative" && narrativeModel ? narrativeModel : buildDealGraph(deal, intel);
        const TABS: DealTab[] = ["Overview", "Impact", "Network", "Comparables", "Prediction"];
        return (
        <div className="px-3.5 pb-3.5 pt-3 border-t" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
          {/* Compact tab bar + full-intelligence escape hatch */}
          <div className="flex items-center gap-1 mb-3 flex-wrap">
            {TABS.map(t => (
              <button key={t} onClick={() => setTab(t)} className="text-[10px] font-semibold px-2 py-1 rounded transition-colors"
                style={tab === t ? { background: `${sizeColor}1f`, color: sizeColor } : { background: "rgba(255,255,255,0.03)", color: "rgba(255,255,255,0.45)" }}>{t}</button>
            ))}
            <button onClick={onOpenFull} className="ml-auto flex items-center gap-1 text-[10px] font-semibold px-2 py-1 rounded transition-colors hover:bg-white/10"
              style={{ background: "rgba(82,176,200,0.12)", color: "#7cc7d8", border: "1px solid rgba(82,176,200,0.25)" }}>
              <Maximize2 size={11} />Full intelligence
            </button>
          </div>

          <div className="space-y-4">
            {tab === "Overview" && (<>
              <AssessmentBlock intel={intel} signal={signal} compact />
              <StatusBlock intel={intel} />
              <CapitalSummaryLine intel={intel} />
            </>)}

            {tab === "Impact" && <ImpactBlock intel={intel} />}

            {tab === "Network" && (
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-[9.5px] font-bold uppercase tracking-[0.15em]" style={{ color: "rgba(82,176,200,0.8)" }}>Capital Transmission Network</span>
                  {narrativeModel && (
                    <div className="flex items-center gap-0.5 ml-auto rounded-md p-0.5" style={{ background: "rgba(255,255,255,0.04)" }}>
                      {(["deal", "narrative"] as const).map(m => (
                        <button key={m} onClick={() => setGraphMode(m)} className="text-[9px] font-semibold px-2 py-0.5 rounded transition-colors"
                          style={graphMode === m ? { background: "rgba(82,176,200,0.18)", color: "#7cc7d8" } : { color: "rgba(255,255,255,0.42)" }}>{m === "deal" ? "Capital Flow" : "Narrative"}</button>
                      ))}
                    </div>
                  )}
                </div>
                <NetworkGraph model={activeGraph} height={340} expand={(node) => node.ticker ? buildCompanyGraph(node.ticker) : buildNarrativeGraph(node.label)} />
              </div>
            )}

            {tab === "Comparables" && (<>
              <ComparablesBlock deal={deal} intel={intel} />
              <SimilarBlock similar={similar} />
            </>)}

            {tab === "Prediction" && (<>
              <PredictionBlock predictions={predictions} />
              <NarrativeBlock seedTheme={seedTheme} propagation={propagation} memory={memory} />
            </>)}
          </div>
        </div>
        );
      })()}
    </motion.div>
  );
}

// Full-intelligence drawer — the deep-dive, off the feed. Keeps cards compact.
function DealIntelligenceDrawer({ deal, intel, ctx, siblings, onClose }: { deal: MADeal; intel: DealIntel; ctx: DealContext; siblings: MADeal[]; onClose: () => void }) {
  const [graphMode, setGraphMode] = useState<"deal" | "narrative">("deal");
  const signal = useMemo(() => buildSignalProfile(deal, intel), [deal, intel]);
  const predictions = useMemo(() => buildPredictions(deal, intel), [deal, intel]);
  const seedTheme = seedThemeFor(deal, intel);
  const propagation = seedTheme ? narrativeChain(seedTheme, 7) : [];
  const memory = historicalPattern(deal, intel);
  const narrativeModel = seedTheme ? buildNarrativeGraph(seedTheme) : null;
  const activeGraph = graphMode === "narrative" && narrativeModel ? narrativeModel : buildDealGraph(deal, intel);
  const similar = useMemo(() => findSimilar(deal, intel, siblings, ctx), [deal, intel, siblings, ctx]);
  const confColor = confidenceColor(intel.confidence.score);
  return (
    <>
      <motion.div className="fixed inset-0 z-[60]" style={{ background: "rgba(0,0,0,0.6)" }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
      <motion.aside className="fixed top-0 right-0 bottom-0 z-[61] w-full sm:w-[560px] max-w-full flex flex-col border-l"
        style={{ background: "#070b12", borderColor: "rgba(255,255,255,0.1)" }}
        initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }} transition={{ type: "tween", duration: 0.28, ease: "easeOut" }}>
        <div className="flex items-start gap-2 p-4 border-b shrink-0" style={{ borderColor: "rgba(255,255,255,0.08)" }}>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 mb-1">
              <span className="text-[8.5px] font-black uppercase tracking-[0.16em]" style={{ color: "rgba(82,176,200,0.8)" }}>Full Intelligence</span>
              <span className="flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 rounded" style={{ background: `${confColor}14`, color: confColor }}><ShieldCheck size={9} />{intel.confidence.score} {intel.confidence.label}</span>
            </div>
            <a href={deal.url} target="_blank" rel="noopener noreferrer" className="block text-[14px] font-semibold leading-snug hover:text-white/90 transition-colors" style={{ color: "rgba(255,255,255,0.92)" }}>{deal.title}</a>
          </div>
          <button onClick={onClose} className="shrink-0 p-1 rounded transition-colors hover:bg-white/10" style={{ color: "rgba(255,255,255,0.5)" }}><X size={16} /></button>
        </div>
        <div className="flex-1 overflow-y-auto scrollbar-hide p-4 space-y-4">
          <AssessmentBlock intel={intel} signal={signal} />
          <StatusBlock intel={intel} />
          <ImpactBlock intel={intel} />
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[9.5px] font-bold uppercase tracking-[0.15em]" style={{ color: "rgba(82,176,200,0.8)" }}>Capital Transmission Network</span>
              {narrativeModel && (
                <div className="flex items-center gap-0.5 ml-auto rounded-md p-0.5" style={{ background: "rgba(255,255,255,0.04)" }}>
                  {(["deal", "narrative"] as const).map(m => (
                    <button key={m} onClick={() => setGraphMode(m)} className="text-[9px] font-semibold px-2 py-0.5 rounded transition-colors"
                      style={graphMode === m ? { background: "rgba(82,176,200,0.18)", color: "#7cc7d8" } : { color: "rgba(255,255,255,0.42)" }}>{m === "deal" ? "Capital Flow" : "Narrative"}</button>
                  ))}
                </div>
              )}
            </div>
            <NetworkGraph model={activeGraph} height={420} expand={(node) => node.ticker ? buildCompanyGraph(node.ticker) : buildNarrativeGraph(node.label)} />
          </div>
          <PredictionBlock predictions={predictions} />
          <NarrativeBlock seedTheme={seedTheme} propagation={propagation} memory={memory} />
          <ComparablesBlock deal={deal} intel={intel} />
          <SimilarBlock similar={similar} />
          <TransactionBlock intel={intel} />
          <TransmissionDetailBlock intel={intel} />
        </div>
      </motion.aside>
    </>
  );
}

function StatCard({ label, value, sub, color }: { label: string; value: string | number; sub?: string; color?: string }) {
  return (
    <div className="rounded-xl border p-4" style={{ background: "rgba(255,255,255,0.025)", borderColor: "rgba(255,255,255,0.06)" }}>
      <p className="text-xs mb-1" style={{ color: "rgba(255,255,255,0.38)" }}>{label}</p>
      <p className="text-2xl font-bold tracking-tight" style={{ color: color ?? "rgba(255,255,255,0.88)" }}>
        {value}
      </p>
      {sub && <p className="text-xs mt-0.5" style={{ color: "rgba(255,255,255,0.32)" }}>{sub}</p>}
    </div>
  );
}

function BreakdownRow({ label, count, total, color }: { label: string; count: number; total: number; color: string }) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs w-20 shrink-0" style={{ color: "rgba(255,255,255,0.52)" }}>{label}</span>
      <div className="flex-1 h-1 rounded-full" style={{ background: "rgba(255,255,255,0.06)" }}>
        <div className="h-1 rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className="text-xs w-6 text-right font-mono" style={{ color: "rgba(255,255,255,0.44)" }}>{count}</span>
    </div>
  );
}

// M&A market regime — what the deal tape is signaling, above the deal list.
function MarketRegimeStrip({ metrics }: { metrics: import("@/lib/maIntelligence").RegimeMetric[] }) {
  if (metrics.length === 0) return null;
  return (
    <div className="rounded-xl border mb-6 p-4 sm:p-5" style={{ background: "rgba(255,255,255,0.022)", borderColor: "rgba(255,255,255,0.07)" }}>
      <div className="flex items-center gap-2 mb-3.5">
        <Network size={12} style={{ color: "rgba(82,176,200,0.6)" }} />
        <h2 className="text-xs font-semibold uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.42)", letterSpacing: "0.1em" }}>M&amp;A Market Regime</h2>
        <span className="text-[9px] ml-auto" style={{ color: "rgba(255,255,255,0.26)" }}>what the deal tape is signaling</span>
      </div>
      <div className="grid grid-cols-3 lg:grid-cols-6 gap-x-4 gap-y-4">
        {metrics.map(m => (
          <div key={m.label}>
            <div className="flex items-baseline justify-between gap-1 mb-1.5">
              <span className="text-[9px] font-semibold uppercase tracking-wide leading-tight" style={{ color: "rgba(255,255,255,0.46)" }}>{m.label}</span>
              <span className="text-[15px] font-black tabular-nums leading-none" style={{ color: m.color }}>{m.display}</span>
            </div>
            <div className="h-1 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.06)" }}>
              <div className="h-1 rounded-full" style={{ width: `${Math.max(3, m.pct)}%`, background: m.color }} />
            </div>
            <span className="block text-[8px] mt-1 leading-tight" style={{ color: "rgba(255,255,255,0.3)" }}>{m.hint}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Sidebar dashboard helpers ──────────────────────────────────────────────────

function SbCard({ title, icon, sub, children }: { title: string; icon?: React.ReactNode; sub?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border p-5" style={{ background: "rgba(255,255,255,0.025)", borderColor: "rgba(255,255,255,0.06)" }}>
      <div className="flex items-center gap-2 mb-3.5">
        {icon}
        <h3 className="text-xs font-semibold uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.4)", letterSpacing: "0.1em" }}>{title}</h3>
        {sub && <span className="text-[9px] ml-auto" style={{ color: "rgba(255,255,255,0.26)" }}>{sub}</span>}
      </div>
      {children}
    </div>
  );
}

// League row: rank · name · (metrics). Metrics is freeform on the right.
function LeagueRow({ rank, name, sub, primary, secondary, accent }: {
  rank: number; name: string; sub?: string; primary?: string | null; secondary?: string | null; accent: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[9px] font-mono font-bold tabular-nums w-3 text-right shrink-0" style={{ color: "rgba(255,255,255,0.28)" }}>{rank}</span>
      <div className="min-w-0 flex-1">
        <span className="text-[11.5px] font-medium leading-tight truncate block" style={{ color: "rgba(255,255,255,0.78)" }}>{name}</span>
        {sub && <span className="text-[8.5px] leading-tight truncate block" style={{ color: "rgba(255,255,255,0.34)" }}>{sub}</span>}
      </div>
      {primary && <span className="text-[10.5px] font-mono font-bold tabular-nums shrink-0" style={{ color: accent }}>{primary}</span>}
      {secondary && <span className="text-[9px] font-mono tabular-nums shrink-0 w-5 text-right" style={{ color: "rgba(255,255,255,0.4)" }}>{secondary}</span>}
    </div>
  );
}

// Narrative lifecycle state → label + color (from theme evolution).
function narrativeState(t: ThemeIntelligence): { label: string; color: string } {
  const ev = computeThemeEvolutionState(t);
  if ((t.competition_penalty ?? 0) >= 0.25) return { label: "Crowded", color: "#fb923c" };
  switch (ev) {
    case "accelerating":
    case "strengthening": return { label: "Strengthening", color: "#34d399" };
    case "broadening":    return { label: "Emerging",      color: "#52b0c8" };
    case "weakening":     return { label: "Weakening",     color: "#fbbf24" };
    case "reversing":     return { label: "Breaking",      color: "#f87171" };
    case "peaking":       return { label: "Crowded",       color: "#fb923c" };
    default:              return { label: "Stable",        color: "#94a3b8" };
  }
}

// Contextual sidebar — synchronised to the currently-expanded deal. Replaces the
// generic league tables while a transaction is open.
function DealContextPanel({ deal, intel, similar, onClose, onSelectTheme }: {
  deal: MADeal; intel: DealIntel; similar: { d: MADeal; i: DealIntel }[];
  onClose: () => void; onSelectTheme?: (name: string) => void;
}) {
  const mi = intel.marketImpact;
  const sectorImplication = intel.capitalTransmission.effects.find(e => e.label === "Cross-Sector" || e.label === "Pricing Power" || e.label === "Competitive Landscape") ?? intel.capitalTransmission.effects[0];
  return (
    <>
      {/* Sync header */}
      <div className="rounded-xl border p-4" style={{ background: "rgba(167,139,250,0.06)", borderColor: "rgba(167,139,250,0.2)" }}>
        <div className="flex items-center gap-2 mb-2">
          <span className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-[0.14em]" style={{ color: "rgba(196,181,253,0.95)" }}>
            <Layers size={11} />Deal Context
          </span>
          <button onClick={onClose} className="ml-auto text-[9px] font-semibold uppercase tracking-wide transition-colors hover:text-white/70" style={{ color: "rgba(255,255,255,0.4)" }}>Clear ✕</button>
        </div>
        <p className="text-[12px] font-semibold leading-snug mb-1.5" style={{ color: "rgba(255,255,255,0.9)" }}>
          {intel.buyer && intel.target ? <>{intel.buyer} <span style={{ color: "rgba(255,255,255,0.4)" }}>→</span> {intel.target}</> : deal.title}
        </p>
        <div className="flex items-center gap-1.5 flex-wrap">
          <MetaChip label={intel.status} color={intel.statusColor} />
          <MetaChip label={intel.txnType} />
          <span className="flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 rounded" style={{ background: `${confidenceColor(intel.confidence.score)}14`, color: confidenceColor(intel.confidence.score) }}>
            <ShieldCheck size={9} />{intel.confidence.score} {intel.confidence.label}
          </span>
        </div>
      </div>

      {/* Beneficiary / pressured / follow-on companies */}
      {(mi.winners.length > 0 || mi.losers.length > 0 || mi.followOn.length > 0) && (
        <SbCard title="Related Companies" icon={<Network size={12} style={{ color: "rgba(52,211,153,0.6)" }} />} sub="read-through">
          <div className="space-y-2.5">
            {mi.winners.length > 0 && <TickerSet label="Beneficiaries" tickers={mi.winners} color="#34d399" />}
            {mi.losers.length  > 0 && <TickerSet label="Pressured" tickers={mi.losers} color="#f87171" />}
            {mi.followOn.length > 0 && <TickerSet label="Follow-on" tickers={mi.followOn} color="#fbbf24" />}
          </div>
        </SbCard>
      )}

      {/* Active narrative / related themes */}
      {intel.themeTags.length > 0 && (
        <SbCard title="Active Narratives" icon={<Flame size={12} style={{ color: "rgba(251,146,60,0.6)" }} />} sub="related themes">
          <div className="flex flex-wrap gap-1.5">
            {intel.themeTags.map(t => {
              const clickable = !!onSelectTheme;
              return (
                <button key={t} disabled={!clickable} onClick={() => onSelectTheme?.(t)}
                  className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-full transition-opacity", clickable && "hover:opacity-80")}
                  style={{ background: "rgba(167,139,250,0.12)", color: "#c4b5fd", border: "1px solid rgba(167,139,250,0.22)", cursor: clickable ? "pointer" : "default" }}>{t}</button>
              );
            })}
          </div>
        </SbCard>
      )}

      {/* Sector implications */}
      {sectorImplication && (
        <SbCard title="Sector Implications" icon={<TrendingUp size={12} style={{ color: "rgba(82,176,200,0.6)" }} />} sub={deal.sector}>
          <p className="text-[11px] leading-snug" style={{ color: "rgba(255,255,255,0.6)" }}>{mi.rerating}</p>
          <p className="text-[10.5px] leading-snug mt-1.5" style={{ color: "rgba(255,255,255,0.5)" }}>
            <span className="font-bold" style={{ color: "rgba(255,255,255,0.66)" }}>{sectorImplication.label}:</span> {sectorImplication.text}
          </p>
        </SbCard>
      )}

      {/* Comparable historical transactions */}
      {intel.comparables.length > 0 && (
        <SbCard title="Comparable Deals" icon={<History size={12} style={{ color: "rgba(255,255,255,0.42)" }} />} sub="precedents">
          <div className="space-y-1.5">
            {intel.comparables.map(c => (
              <a key={`${c.acquirer}-${c.target}`} href={`https://www.google.com/search?q=${encodeURIComponent(`${c.acquirer} ${c.target} acquisition`)}`} target="_blank" rel="noopener noreferrer"
                className="group/cmp flex items-center gap-2">
                <span className="min-w-0 flex-1">
                  <span className="block text-[11px] leading-tight truncate group-hover/cmp:text-white/85 transition-colors" style={{ color: "rgba(255,255,255,0.66)" }}>
                    {c.acquirer} <span style={{ color: "rgba(255,255,255,0.34)" }}>→</span> {c.target}
                  </span>
                </span>
                <span className="text-[10px] font-mono font-bold tabular-nums shrink-0" style={{ color: "rgba(255,255,255,0.5)" }}>{c.value}</span>
                <span className="text-[9px] tabular-nums shrink-0 w-7 text-right" style={{ color: "rgba(255,255,255,0.32)" }}>{c.year}</span>
              </a>
            ))}
          </div>
        </SbCard>
      )}

      {/* Similar recent deals — drawn from the live feed */}
      {similar.length > 0 && (
        <SbCard title="Similar Recent Deals" icon={<GitMerge size={12} style={{ color: "rgba(167,139,250,0.6)" }} />} sub="in this feed">
          <div className="space-y-2">
            {similar.map(({ d, i }) => (
              <a key={d.id} href={d.url} target="_blank" rel="noopener noreferrer" className="group/sim flex items-start gap-2">
                <span className="w-1.5 h-1.5 rounded-full shrink-0 mt-1.5" style={{ background: i.statusColor }} />
                <span className="min-w-0 flex-1">
                  <span className="block text-[11px] leading-tight line-clamp-2 group-hover/sim:text-white/85 transition-colors" style={{ color: "rgba(255,255,255,0.62)" }}>{d.title}</span>
                  <span className="text-[8.5px]" style={{ color: "rgba(255,255,255,0.32)" }}>{i.txnType} · {d.sector}{i.dealValue && i.dealValue !== "Undisclosed" ? ` · ${i.dealValue}` : ""}</span>
                </span>
              </a>
            ))}
          </div>
        </SbCard>
      )}
    </>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function MAPage() {
  const [selectedTheme, setSelectedTheme] = useState<ThemeIntelligence | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [drawerId, setDrawerId] = useState<string | null>(null);

  const { deals, breakdown, totalDealCount, isLoading, isError } = useMAIntelligence();
  const { riskRegime, volRegime } = useMarketState();
  const { data: feedData }  = useFeed();
  const { data: marketData } = useMarketData();
  const { isWatched, toggle: toggleThemeWatch } = useThemeWatchlist();

  const maThemes = useMemo(() => {
    const all = feedData?.theme_intelligence ?? [];
    return filterMAThemes(all).slice(0, 4);
  }, [feedData]);

  // Capital flow layers for M&A rationale context
  const capitalFlow = useMemo(() => {
    const tnxRate = marketData?.["TNX"]?.price ?? null;
    return computeCapitalFlow({
      riskRegime,
      volRegime,
      regime: feedData?.sector_data?.derived_regime ?? null,
      tnxRate,
      maDealCount:   deals.length,
      vcDealCount:   0,
      ipoFilerCount: 0,
    });
  }, [riskRegime, volRegime, feedData, marketData, deals.length]);

  const maRationale = useMemo(() => {
    const creditLayer = capitalFlow.layers[2]; // Credit/Leverage
    const maLayer     = capitalFlow.layers[3]; // M&A Activity
    if (!creditLayer || !maLayer) return null;
    return explainMAActivity(
      deals.map(d => ({ dealType: d.dealType, sector: d.sector, peFirm: d.peFirm })),
      maThemes,
      feedData?.sector_data?.derived_regime ?? null,
      { status: creditLayer.status, signal: creditLayer.signal, detail: creditLayer.detail },
      { status: maLayer.status,     signal: maLayer.signal },
    );
  }, [deals, maThemes, feedData, capitalFlow]);

  // Deal-intelligence context: financing window state from the credit layer.
  const dealCtx: DealContext = useMemo(() => {
    const creditLayer = capitalFlow.layers[2];
    return {
      creditOpen: creditLayer ? (creditLayer.status === "accelerating" || creditLayer.status === "expanding") : undefined,
      regime: feedData?.sector_data?.derived_regime ?? undefined,
      riskRegime,
    };
  }, [capitalFlow, feedData, riskRegime]);

  // Live IB dashboard league tables (single pass over the deal set).
  const league         = useMemo(() => buildLeagueTables(deals), [deals]);
  const regime         = useMemo(() => buildMarketRegime(deals, dealCtx), [deals, dealCtx]);
  const biggestDeals   = useMemo(() => largestDeals(deals), [deals]);
  const pendingReviews = useMemo(() => deals.filter(d => enrichDeal(d, dealCtx).status === "Regulatory Review").slice(0, 4), [deals, dealCtx]);
  const pendingVotes   = useMemo(() => deals.filter(d => enrichDeal(d, dealCtx).status === "Shareholder Vote").slice(0, 4), [deals, dealCtx]);

  const dealClusters = useMemo(
    () => clusterDealsByTheme(
      deals.map(d => ({ sector: d.sector, dealType: d.dealType, entities: d.entities })),
      maThemes,
    ),
    [deals, maThemes],
  );

  // Expanded-deal context drives the contextual sidebar (synchronised intelligence).
  const expandedDeal  = useMemo(() => deals.find(d => d.id === expandedId) ?? null, [deals, expandedId]);
  const expandedIntel = useMemo(() => expandedDeal ? enrichDeal(expandedDeal, dealCtx) : null, [expandedDeal, dealCtx]);
  const drawerDeal    = useMemo(() => deals.find(d => d.id === drawerId) ?? null, [deals, drawerId]);
  const drawerIntel   = useMemo(() => drawerDeal ? enrichDeal(drawerDeal, dealCtx) : null, [drawerDeal, dealCtx]);
  const similarDeals  = useMemo(() => {
    if (!expandedDeal || !expandedIntel) return [];
    const tags = new Set(expandedIntel.themeTags);
    return deals
      .filter(d => d.id !== expandedDeal.id)
      .map(d => ({ d, i: enrichDeal(d, dealCtx) }))
      .filter(({ d, i }) => d.sector === expandedDeal.sector || i.themeTags.some(t => tags.has(t)))
      .slice(0, 5);
  }, [deals, expandedDeal, expandedIntel, dealCtx]);

  const regimeColor =
    riskRegime === "risk-on"  ? "#52b0c8" :
    riskRegime === "risk-off" ? "#f87171" : "#94a3b8";


  const activeDeals  = deals.filter(d => d.dealType !== "withdrawn");
  const rumored      = deals.filter(d => d.dealType === "rumored");
  const sponsorDeals = deals.filter(d => d.dealType === "sponsor");

  return (
    <>
    <div className="min-h-screen pb-24" style={{ background: "#030710" }}>

      {/* ── Hero ─────────────────────────────────────────────────────── */}
      <div className="border-b" style={{ borderColor: "rgba(255,255,255,0.06)", background: "rgba(255,255,255,0.01)" }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10">
          <div className="flex items-start justify-between gap-6 flex-wrap">
            <div>
              <div className="flex items-center gap-2.5 mb-3">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center"
                  style={{ background: "rgba(124,58,237,0.15)", border: "1px solid rgba(124,58,237,0.2)" }}>
                  <GitMerge size={15} style={{ color: "#a78bfa" }} />
                </div>
                <span className="text-xs font-semibold tracking-widest uppercase"
                  style={{ color: "rgba(255,255,255,0.32)", letterSpacing: "0.12em" }}>
                  M&A Intelligence
                </span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight mb-2" style={{ color: "rgba(255,255,255,0.92)" }}>
                Deal Flow & Acquisition Activity
              </h1>
              <p className="text-sm max-w-xl" style={{ color: "rgba(255,255,255,0.42)" }}>
                Strategic acquisitions, sponsor buyouts, rumored transactions, and consolidation themes — extracted from live deal intelligence.
              </p>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <span className="text-xs px-2.5 py-1 rounded-full border font-medium"
                style={{ borderColor: `${regimeColor}33`, color: regimeColor, background: `${regimeColor}0f` }}>
                {riskRegime === "risk-on" ? "Risk-On" : riskRegime === "risk-off" ? "Risk-Off" : "Neutral"} Regime
              </span>
            </div>
          </div>

          {/* Stats row */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-8">
            <StatCard label="Active Deals" value={activeDeals.length} sub="strategic + sponsor" color="#52b0c8" />
            <StatCard label="Sponsor / PE" value={sponsorDeals.length} sub="buyouts & take-privates" color="#a78bfa" />
            <StatCard label="Rumored" value={rumored.length} sub="reported / exploring" color="#fbbf24" />
            <StatCard label="Total Tracked" value={totalDealCount} sub="all categories" />
          </div>
        </div>
      </div>

      {/* ── Body ─────────────────────────────────────────────────────── */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        {isError && (
          <div className="mb-6 flex items-center gap-2 rounded-xl border px-4 py-3 text-sm"
            style={{ borderColor: "rgba(248,113,113,0.2)", background: "rgba(248,113,113,0.06)", color: "#fca5a5" }}>
            <AlertCircle size={14} />
            Unable to load M&A intelligence — feed data unavailable.
          </div>
        )}

        {/* M&A market regime — read the tape before any single deal */}
        {!isLoading && deals.length > 0 && <MarketRegimeStrip metrics={regime} />}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* ── Deal Feed ──────────────────────────────────────────────── */}
          <div className="lg:col-span-2">
            <div className="flex items-center gap-2 mb-4">
              <TrendingUp size={14} style={{ color: "#a78bfa" }} />
              <h2 className="text-sm font-semibold" style={{ color: "rgba(255,255,255,0.72)" }}>
                Deal Flow
              </h2>
              {isLoading && (
                <span className="text-xs" style={{ color: "rgba(255,255,255,0.28)" }}>Loading…</span>
              )}
            </div>

            {/* M&A Rationale */}
            {maRationale && !isLoading && deals.length > 0 && (
              <div
                className="rounded-xl border px-4 py-3 mb-4 flex items-start gap-2.5"
                style={{ background: "rgba(167,139,250,0.05)", borderColor: "rgba(167,139,250,0.14)" }}
              >
                <Lightbulb size={12} className="shrink-0 mt-[2px]" style={{ color: "rgba(167,139,250,0.60)" }} />
                <p className="text-[11px] leading-relaxed" style={{ color: "rgba(255,255,255,0.52)" }}>
                  {maRationale}
                </p>
              </div>
            )}

            {/* Consolidation Themes */}
            {dealClusters.length > 0 && !isLoading && (
              <div
                className="rounded-xl border px-4 py-3 mb-4"
                style={{ background: "rgba(82,176,200,0.04)", borderColor: "rgba(82,176,200,0.12)" }}
              >
                <p className="text-[9px] font-bold uppercase tracking-[0.13em] mb-2.5" style={{ color: "rgba(82,176,200,0.50)" }}>
                  Consolidation Themes
                </p>
                <div className="flex flex-wrap gap-2">
                  {dealClusters.map(dc => (
                    <button
                      key={dc.theme.id}
                      onClick={() => setSelectedTheme(dc.theme)}
                      className="flex items-center gap-1.5 px-2 py-1 rounded-lg transition-opacity hover:opacity-80 text-left"
                      style={{ background: "rgba(82,176,200,0.07)", border: "1px solid rgba(82,176,200,0.12)" }}
                    >
                      <span className="text-[10px] font-semibold" style={{ color: "rgba(255,255,255,0.72)" }}>
                        {dc.theme.name}
                      </span>
                      <span className="text-[9px] font-bold tabular-nums" style={{ color: "rgba(82,176,200,0.70)" }}>
                        {dc.dealCount}
                      </span>
                      {dc.sectors.length > 0 && (
                        <span className="text-[8.5px]" style={{ color: "rgba(255,255,255,0.28)" }}>
                          · {dc.sectors.join(", ")}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {!isLoading && deals.length === 0 && (
              <div className="rounded-xl border p-8 text-center"
                style={{ background: "rgba(255,255,255,0.02)", borderColor: "rgba(255,255,255,0.06)" }}>
                <GitMerge size={24} className="mx-auto mb-3" style={{ color: "rgba(255,255,255,0.16)" }} />
                <p className="text-sm" style={{ color: "rgba(255,255,255,0.32)" }}>
                  No M&A deals in the current feed window.
                </p>
                <p className="text-xs mt-1" style={{ color: "rgba(255,255,255,0.2)" }}>
                  Deals appear when PE Hub, PE Wire, or financial sources report activity.
                </p>
              </div>
            )}

            {/* First-load skeleton — keeps the column from reading blank */}
            {isLoading && deals.length === 0 && (
              <div className="space-y-3" aria-hidden>
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="rounded-xl border animate-pulse"
                    style={{ height: 86, background: "rgba(255,255,255,0.03)", borderColor: "rgba(255,255,255,0.06)" }} />
                ))}
              </div>
            )}

            <motion.div layout className="space-y-2.5">
              {deals.map((deal, i) => (
                <DealCard key={deal.id} deal={deal} index={i} ctx={dealCtx}
                  open={expandedId === deal.id}
                  onToggle={() => setExpandedId(prev => prev === deal.id ? null : deal.id)}
                  siblings={deals}
                  onOpenFull={() => setDrawerId(deal.id)} />
              ))}
            </motion.div>
          </div>

          {/* ── Sidebar — contextual when a deal is expanded, else generic ── */}
          <div className="space-y-5 lg:sticky lg:top-4 self-start">
            <AnimatePresence mode="wait" initial={false}>
            {expandedDeal && expandedIntel ? (
              <motion.div key="ctx" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.22 }} className="space-y-5">
                <DealContextPanel deal={expandedDeal} intel={expandedIntel} similar={similarDeals}
                  onClose={() => setExpandedId(null)}
                  onSelectTheme={maThemes.length ? (name) => { const m = maThemes.find(t => t.name === name); if (m) setSelectedTheme(m); } : undefined} />
              </motion.div>
            ) : (
              <motion.div key="generic" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.22 }} className="space-y-5">

            {/* Largest Deals Today — by disclosed value */}
            {biggestDeals.length > 0 && (
              <div className="rounded-xl border p-5" style={{ background: "rgba(255,255,255,0.025)", borderColor: "rgba(255,255,255,0.06)" }}>
                <div className="flex items-center gap-2 mb-3.5">
                  <TrendingUp size={12} style={{ color: "rgba(251,191,36,0.6)" }} />
                  <h3 className="text-xs font-semibold uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.36)", letterSpacing: "0.1em" }}>Largest Deals</h3>
                </div>
                <div className="space-y-2.5">
                  {biggestDeals.map(({ deal, value }) => (
                    <a key={deal.id} href={deal.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 group">
                      <span className="text-[11px] font-mono font-bold tabular-nums shrink-0 w-12" style={{ color: "#fbbf24" }}>{value}</span>
                      <span className="text-[11px] leading-tight line-clamp-1 flex-1 min-w-0 group-hover:text-white/85 transition-colors" style={{ color: "rgba(255,255,255,0.6)" }}>{deal.title}</span>
                    </a>
                  ))}
                </div>
              </div>
            )}

            {/* Deal type breakdown */}
            <div className="rounded-xl border p-5"
              style={{ background: "rgba(255,255,255,0.025)", borderColor: "rgba(255,255,255,0.06)" }}>
              <h3 className="text-xs font-semibold uppercase tracking-widest mb-4"
                style={{ color: "rgba(255,255,255,0.36)", letterSpacing: "0.1em" }}>
                Deal Type Breakdown
              </h3>
              <div className="space-y-2.5">
                {(Object.entries(DEAL_TYPE_META) as [DealType, typeof DEAL_TYPE_META[DealType]][]).map(([type, meta]) => (
                  <BreakdownRow
                    key={type}
                    label={meta.label}
                    count={breakdown[type]}
                    total={totalDealCount}
                    color={meta.color}
                  />
                ))}
              </div>
            </div>

            {/* Financial Advisor League Table */}
            {league.financialAdvisors.length > 0 && (
              <SbCard title="Financial Advisors" icon={<Landmark size={12} style={{ color: "rgba(82,176,200,0.6)" }} />} sub="deals · value">
                <div className="space-y-2">
                  {league.financialAdvisors.map((a, i) => (
                    <LeagueRow key={a.name} rank={i + 1} name={a.name} accent="#52b0c8"
                      sub={a.avgSize ? `avg ${a.avgSize}` : undefined}
                      primary={a.capital ?? undefined} secondary={String(a.deals)} />
                  ))}
                </div>
              </SbCard>
            )}

            {/* PE Leaderboard */}
            {league.sponsors.length > 0 && (
              <SbCard title="PE Leaderboard" icon={<Building2 size={12} style={{ color: "rgba(167,139,250,0.55)" }} />} sub="capital deployed">
                <div className="space-y-2">
                  {league.sponsors.map((s, i) => (
                    <LeagueRow key={s.firm} rank={i + 1} name={s.firm} accent="#a78bfa"
                      sub={[s.topSector, s.avgSize && `avg ${s.avgSize}`].filter(Boolean).join(" · ") || undefined}
                      primary={s.capital ?? undefined} secondary={String(s.deals)} />
                  ))}
                </div>
              </SbCard>
            )}

            {/* Most Active Acquirers */}
            {league.acquirers.length > 0 && (
              <SbCard title="Most Active Acquirers" icon={<Target size={12} style={{ color: "rgba(82,176,200,0.55)" }} />} sub="strategic">
                <div className="space-y-2">
                  {league.acquirers.map((a, i) => (
                    <LeagueRow key={a.name} rank={i + 1} name={a.name} accent="#52b0c8"
                      sub={a.sectors.join(" · ") || undefined} secondary={String(a.deals)} />
                  ))}
                </div>
              </SbCard>
            )}

            {/* Most Active Targets */}
            {league.targets.length > 0 && (
              <SbCard title="Most Active Targets" icon={<Target size={12} style={{ color: "rgba(251,146,60,0.55)" }} />}>
                <div className="space-y-2">
                  {league.targets.map((t, i) => (
                    <LeagueRow key={t.name} rank={i + 1} name={t.name} accent="#fb923c" sub={t.sector} secondary={String(t.deals)} />
                  ))}
                </div>
              </SbCard>
            )}

            {/* Top Legal Advisors */}
            {league.legalAdvisors.length > 0 && (
              <SbCard title="Top Legal Advisors" icon={<Landmark size={12} style={{ color: "rgba(251,191,36,0.55)" }} />}>
                <div className="space-y-2">
                  {league.legalAdvisors.map((l, i) => (
                    <LeagueRow key={l.name} rank={i + 1} name={l.name} accent="#fbbf24" secondary={String(l.deals)} />
                  ))}
                </div>
              </SbCard>
            )}

            {/* Sector Heat Map */}
            {league.sectorHeat.length > 0 && (
              <SbCard title="Sector Heat Map" sub="deals · capital · x-border">
                <div className="space-y-2.5">
                  {league.sectorHeat.map(s => {
                    const heat = Math.min(100, s.deals * 18);
                    return (
                      <div key={s.sector}>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-[11.5px] flex-1 min-w-0 truncate" style={{ color: "rgba(255,255,255,0.66)" }}>{s.sector}</span>
                          {s.capital && <span className="text-[10px] font-mono font-bold tabular-nums shrink-0" style={{ color: "rgba(82,176,200,0.85)" }}>{s.capital}</span>}
                          <span className="text-[10px] font-mono tabular-nums w-5 text-right shrink-0" style={{ color: "rgba(255,255,255,0.44)" }}>{s.deals}</span>
                        </div>
                        <div className="h-1.5 rounded-full overflow-hidden flex" style={{ background: "rgba(255,255,255,0.05)" }}>
                          <div className="h-full" style={{ width: `${heat}%`, background: "linear-gradient(90deg, #52b0c8, #a78bfa)" }} />
                        </div>
                        <div className="flex items-center gap-2 mt-1 text-[8.5px]" style={{ color: "rgba(255,255,255,0.32)" }}>
                          {s.avgSize && <span>avg {s.avgSize}</span>}
                          {s.crossBorderPct > 0 && <span>· {s.crossBorderPct}% x-border</span>}
                          <span className="ml-auto" style={{ color: s.pipeline >= 60 ? "#34d399" : s.pipeline >= 30 ? "#fbbf24" : "rgba(255,255,255,0.32)" }}>
                            {s.pipeline >= 60 ? "▲ active pipeline" : s.pipeline >= 30 ? "→ steady" : "▾ maturing"}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </SbCard>
            )}

            {/* Capital Flow — where capital is transmitting */}
            {league.capitalFlow && (
              <SbCard title="Capital Flow" icon={<Network size={12} style={{ color: "rgba(82,176,200,0.6)" }} />} sub={league.capitalFlow.label}>
                <div className="space-y-0">
                  {league.capitalFlow.chain.map((step, i) => (
                    <div key={i}>
                      <div className="flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: i === 0 ? "#a78bfa" : "rgba(82,176,200,0.6)" }} />
                        <span className="text-[11px] leading-tight" style={{ color: i === 0 ? "rgba(255,255,255,0.78)" : "rgba(255,255,255,0.58)" }}>{step}</span>
                      </div>
                      {i < league.capitalFlow!.chain.length - 1 && <div className="ml-[2.5px] w-px h-3" style={{ background: "rgba(82,176,200,0.3)" }} />}
                    </div>
                  ))}
                </div>
              </SbCard>
            )}

            {/* Regulatory & Votes Watch — pending gating events */}
            {(pendingReviews.length > 0 || pendingVotes.length > 0) && (
              <div className="rounded-xl border p-5" style={{ background: "rgba(255,255,255,0.025)", borderColor: "rgba(255,255,255,0.06)" }}>
                <h3 className="text-xs font-semibold uppercase tracking-widest mb-3.5" style={{ color: "rgba(255,255,255,0.36)", letterSpacing: "0.1em" }}>
                  Pending Decisions
                </h3>
                {pendingReviews.length > 0 && (
                  <div className="mb-3">
                    <p className="text-[8.5px] font-bold uppercase tracking-[0.14em] mb-1.5" style={{ color: "rgba(251,146,60,0.7)" }}>Regulatory Review</p>
                    <div className="space-y-1.5">
                      {pendingReviews.map(d => (
                        <a key={d.id} href={d.url} target="_blank" rel="noopener noreferrer" className="block text-[11px] leading-tight line-clamp-1 hover:text-white/80 transition-colors" style={{ color: "rgba(255,255,255,0.55)" }}>{d.title}</a>
                      ))}
                    </div>
                  </div>
                )}
                {pendingVotes.length > 0 && (
                  <div>
                    <p className="text-[8.5px] font-bold uppercase tracking-[0.14em] mb-1.5" style={{ color: "rgba(167,139,250,0.7)" }}>Shareholder Vote</p>
                    <div className="space-y-1.5">
                      {pendingVotes.map(d => (
                        <a key={d.id} href={d.url} target="_blank" rel="noopener noreferrer" className="block text-[11px] leading-tight line-clamp-1 hover:text-white/80 transition-colors" style={{ color: "rgba(255,255,255,0.55)" }}>{d.title}</a>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Narrative Tracker — deal-theme momentum states */}
            {maThemes.length > 0 && (
              <SbCard title="Narrative Tracker" icon={<Lightbulb size={12} style={{ color: "rgba(255,255,255,0.36)" }} />} sub="momentum by theme">
                <div className="space-y-3">
                  {maThemes.map(t => {
                    const st      = narrativeState(t);
                    const evState = computeThemeEvolutionState(t);
                    return (
                      <div key={t.id} className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: st.color }} />
                          <span className="text-xs font-medium flex-1 min-w-0 truncate" style={{ color: "rgba(255,255,255,0.74)" }}>
                            {t.name}
                          </span>
                          <span className="text-[9.5px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded shrink-0"
                            style={{ color: st.color, background: `${st.color}1a`, letterSpacing: "0.04em" }}>
                            {st.label}
                          </span>
                        </div>
                        <p className="text-[10px] italic leading-snug pl-3.5" style={{ color: "rgba(255,255,255,0.32)" }}>
                          {getEvolutionNarrative(t.name, evState)}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </SbCard>
            )}

            {/* Context note */}
            <div className="rounded-xl border p-4"
              style={{ background: "rgba(255,255,255,0.015)", borderColor: "rgba(255,255,255,0.05)" }}>
              <p className="text-xs leading-relaxed" style={{ color: "rgba(255,255,255,0.32)" }}>
                Deals sourced from PE Hub, PE Wire, FT Deals, and DealBook via live RSS. PE firm detection uses title pattern matching. Sector classification is heuristic — verify independently for investment decisions.
              </p>
              <a
                href="/private-markets"
                className="flex items-center gap-1 mt-3 text-xs font-medium group"
                style={{ color: "rgba(82,176,200,0.72)" }}
              >
                View Capital Flow Transmission
                <ChevronRight size={11} className="group-hover:translate-x-0.5 transition-transform" />
              </a>
            </div>
              </motion.div>
            )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>

    {/* ── Full-intelligence drawer ─────────────────────────────────────── */}
    <AnimatePresence>
      {drawerDeal && drawerIntel && (
        <DealIntelligenceDrawer key={drawerDeal.id} deal={drawerDeal} intel={drawerIntel} ctx={dealCtx} siblings={deals} onClose={() => setDrawerId(null)} />
      )}
    </AnimatePresence>

    {/* ── Theme Drawer ─────────────────────────────────────────────────── */}
    {selectedTheme && (
      <ThemeDrawer
        theme={selectedTheme}
        clusters={feedData?.clusters ?? []}
        deals={deals.map(d => ({ title: d.title, sector: d.sector, dealType: d.dealType, entities: d.entities, url: d.url }))}
        isWatched={isWatched(selectedTheme.id)}
        hasAlert={false}
        onToggleWatch={() => toggleThemeWatch(selectedTheme.id)}
        onClose={() => setSelectedTheme(null)}
      />
    )}
    </>
  );
}
