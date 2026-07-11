"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { GitMerge, Building2, TrendingUp, AlertCircle, ExternalLink, Clock, ChevronRight, Network, Lightbulb, Target, Landmark, Layers, ShieldCheck, History, Flame, Maximize2, X } from "lucide-react";
import { useMAIntelligence, type MADeal, type DealType } from "@/hooks/useMAIntelligence";
import { useMarketState } from "@/hooks/useMarketState";
import { useMarketData } from "@/hooks/useMarketData";
import { useFeed } from "@/hooks/useFeed";
import { computeThemeEvolutionState, filterMAThemes } from "@/lib/themeEvolution";
import { explainMAActivity } from "@/lib/themeIntelligence";
import { clusterDealsByTheme } from "@/lib/industryIntelligence";
import { computeCapitalFlow } from "@/lib/capitalFlow";
import { useThemeWatchlist } from "@/hooks/useThemeWatchlist";
import { timeAgo, cn } from "@/lib/utils";
import { enrichDeal, buildLeagueTables, buildMarketRegime, largestDeals, tickerInfo, type DealContext, type DealIntel } from "@/lib/maIntelligence";
import { buildDealGraph, buildCompanyGraph, buildThemeGraph } from "@/lib/maTransmissionGraph";
import { buildSignalProfile, type SignalProfile } from "@/lib/argusReasoning";
// Phase 2.6: shared intelligence (the same engines every unified surface reads)
import { useArgusIntelligence } from "@/hooks/useArgusIntelligence";
import { buildMAIntel, type DealIntelShared } from "@/lib/maIntel";
import { type IntelligenceProfile } from "@/lib/intelligenceProfile";
import { cachedProfile } from "@/lib/profileCache";
import { buildRiskRead, type RiskRead } from "@/lib/riskRead";
import { deriveNarratives } from "@/lib/narrativeDerivation";
import { deriveMorningBriefDeltas } from "@/lib/intelligenceDeltas";
import { getTrackedThemes } from "@/lib/themeSnapshots";
import { intelligenceGraph } from "@/lib/intelligenceGraph";
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
// ImpactColumn: unused after the D3 migration (deleted).
function LabeledCell({ label, value, color, link }: { label: string; value: string; color?: string; link?: string }) {
  const body = <span className="text-[11.5px] font-bold leading-none truncate block" style={{ color: color ?? "rgba(255,255,255,0.84)" }}>{value}</span>;
  return (
    <div className="min-w-0">
      <p className="text-[7.5px] font-bold uppercase tracking-[0.16em] mb-1" style={{ color: "rgba(255,255,255,0.3)" }}>{label}</p>
      {link ? <Link href={link} className="hover:opacity-80 transition-opacity">{body}</Link> : body}
    </div>
  );
}

// BulletList: unused after the D3 migration (deleted).
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

function AssessmentBlock({ intel, shared, signal, compact = false }: { intel: DealIntel; shared: DealIntelShared | null; signal: SignalProfile; compact?: boolean }) {
  return (
    <div className="rounded-lg border p-3 pt-2.5" style={{ borderColor: "rgba(167,139,250,0.22)", background: "rgba(167,139,250,0.05)" }}>
      <div className="flex items-center gap-1.5 mb-1.5">
        <span className="text-[8.5px] font-black uppercase tracking-[0.18em]" style={{ color: "rgba(196,181,253,0.95)" }}>Shared Intelligence Read</span>
        <span className="text-[7px] px-1 py-px rounded uppercase tracking-wide font-bold" style={{ color: "rgba(255,255,255,0.4)", background: "rgba(255,255,255,0.06)" }}
          title="Evidence classification against the tracked theme set: SUPPORTS/CONTRADICTS require a recorded graph edge; a headline keyword is never evidence">
          {shared ? `${shared.relation} · ${shared.relationBasis}` : "graph unavailable"}
        </span>
      </div>
      {shared?.relatedTheme ? (
        <p className="text-[12px] leading-relaxed" style={{ color: "rgba(255,255,255,0.8)" }}>
          {shared.relation === "SUPPORTS" ? "Recorded support for" : shared.relation === "CONTRADICTS" ? "Recorded contradiction of" : shared.relation === "MENTIONS" ? "Recorded mention of" : "Sector-level context for"}{" "}
          <b>{shared.relatedTheme}</b>{shared.narrative ? ` - member of the derived narrative ${shared.narrative}` : ""}.
        </p>
      ) : (
        <p className="text-[11px] leading-relaxed" style={{ color: "rgba(255,255,255,0.5)" }}>
          No recorded or resolved link between this deal and the tracked theme set. Nothing is inferred.
        </p>
      )}
      {shared?.latestChange && (
        <p className="text-[10.5px] mt-1.5" style={{ color: "rgba(255,255,255,0.62)" }} title={shared.latestChange.why}>
          <span className="text-[7px] font-bold tracking-[0.12em] px-1 py-px rounded border mr-1.5" style={{ color: "#7cc7d8", borderColor: "rgba(124,199,216,0.4)" }}>{shared.latestChange.kind}</span>
          {shared.latestChange.what}
        </p>
      )}
      {(shared?.acquirer?.key || shared?.target?.key) && (
        <div className="grid sm:grid-cols-2 gap-2 mt-2">
          {[shared!.acquirer, shared!.target].map((e, i) => e?.key ? (
            <div key={i} className="rounded-md px-2 py-1.5" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
              <p className="text-[7.5px] font-bold uppercase tracking-wide" style={{ color: "rgba(255,255,255,0.34)" }}>{i === 0 ? "Acquirer" : "Target"} · Explorer read</p>
              <p className="text-[11px] font-semibold" style={{ color: "rgba(255,255,255,0.8)" }}>
                {e.key}{e.conviction !== null ? ` · conviction ${e.conviction}` : ""}{e.verdict ? ` · ${e.verdict}` : ""}
              </p>
              {e.forward && <p className="text-[9.5px] mt-0.5" style={{ color: "rgba(255,255,255,0.5)" }}>{e.forward.direction} (prediction engine, confidence {e.forward.confidence})</p>}
            </div>
          ) : null)}
        </div>
      )}
      {shared?.risks && (shared.risks.invalidation || shared.risks.contradictions.length > 0) && (
        <div className="mt-2 space-y-1">
          {shared.risks.invalidation && <p className="text-[10px]" style={{ color: "rgba(251,191,36,0.8)" }}>⚠ {shared.risks.invalidation} <span style={{ color: "rgba(255,255,255,0.35)" }}>(prediction engine)</span></p>}
          {shared.risks.contradictions.slice(0, 2).map((c, i) => (
            <p key={i} className="text-[10px]" style={{ color: "rgba(248,113,113,0.8)" }}>⚠ {c.detail} <span style={{ color: "rgba(255,255,255,0.35)" }}>sev {c.severity} (evidence engine)</span></p>
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
      {!compact && (
        <div className="mt-2.5 pt-2.5 border-t" style={{ borderColor: "rgba(255,255,255,0.07)" }}>
          <div className="flex items-center gap-1.5 mb-1.5">
            <span className="text-[7.5px] font-bold uppercase tracking-[0.14em]" style={{ color: "rgba(255,255,255,0.34)" }}>Coverage Signal</span>
            <span className="text-[8.5px] font-black tabular-nums" style={{ color: confidenceColor(signal.composite) }}>{signal.composite}</span>
            <span className="text-[7.5px]" style={{ color: "rgba(255,255,255,0.3)" }}>reporting quality, not market conviction</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-3 gap-y-1.5">
            {signal.scores.map(s => <MiniMetric key={s.label} label={s.label} value={s.value} why={s.why} />)}
          </div>
        </div>
      )}
    </div>
  );
}

function StatusBlock({ intel, shared }: { intel: DealIntel; shared: DealIntelShared | null }) {
  const curIdx = intel.timeline.findIndex(s => s.current);
  const nextMilestone = curIdx >= 0 && curIdx < intel.timeline.length - 1 ? intel.timeline[curIdx + 1].stage : null;
  return (
    <div>
      <SecHead letter="B" title="Deal Status" right={<span className="text-[9px] font-bold uppercase tracking-wide" style={{ color: intel.statusColor }}>{intel.status}</span>} />
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
      {shared?.risks?.watch ? (
        <IntelBlock label="What to Watch · shared engines">
          <p className="text-[10.5px] leading-snug" style={{ color: "rgba(255,255,255,0.62)" }}>
            {shared.risks.watch}
            <span className="ml-1.5 text-[7px] font-bold tracking-[0.12em] px-1 py-px rounded border align-middle" style={{ color: "#7cc7d8", borderColor: "rgba(124,199,216,0.35)" }}>DERIVED</span>
          </p>
        </IntelBlock>
      ) : (
        <p className="text-[9.5px]" style={{ color: "rgba(255,255,255,0.36)" }}>No derivable watch condition for the resolved entities yet.</p>
      )}
    </div>
  );
}

function CapitalSummaryLine({ intel, shared }: { intel: DealIntel; shared: DealIntelShared | null }) {
  // Recorded reads only: resolved acquirer -> stated sector -> the sector
  // profile's recorded beneficiaries (the invented transmission flow is gone).
  const acquirer = shared?.acquirer?.key ?? intel.buyer;
  const bene = shared?.sectorBeneficiaries ?? [];
  if (!acquirer && bene.length === 0) return null;
  return (
    <div className="flex items-center gap-1.5 flex-wrap rounded-md px-2.5 py-1.5" style={{ background: "rgba(82,176,200,0.06)", border: "1px solid rgba(82,176,200,0.14)" }}
      title="Resolved entities + the sector profile's recorded downstream beneficiaries (shared graph)">
      <span className="text-[8px] font-bold uppercase tracking-wide shrink-0" style={{ color: "rgba(82,176,200,0.7)" }}>Recorded</span>
      {acquirer && <span className="text-[10px] font-semibold" style={{ color: "rgba(255,255,255,0.72)" }}>{acquirer}</span>}
      <span className="text-[10px]" style={{ color: "rgba(82,176,200,0.5)" }}>→</span>
      <span className="text-[10px]" style={{ color: "rgba(255,255,255,0.6)" }}>{"sector" in (shared ?? {}) ? "" : ""}{intel.buyer ? "" : ""}{/* sector label */}</span>
      <span className="text-[10px]" style={{ color: "rgba(255,255,255,0.6)" }}>{shared?.relatedTheme ?? "unresolved"}</span>
      {bene.length > 0 && <><span className="text-[10px]" style={{ color: "rgba(52,211,153,0.55)" }}>→</span>{bene.slice(0, 3).map(t => <TickerChip key={t} ticker={t} color="#34d399" />)}</>}
    </div>
  );
}

function ImpactBlock({ shared }: { shared: DealIntelShared | null }) {
  const bene = shared?.sectorBeneficiaries ?? [];
  const risks = shared?.risks ?? null;
  return (
    <div>
      <SecHead letter="C" title="Exposure & Risks · shared engines" color="rgba(52,211,153,0.8)" />
      {bene.length > 0 ? (
        <div className="mb-2.5">
          <p className="text-[8px] font-bold uppercase tracking-wide mb-1" style={{ color: "rgba(52,211,153,0.7)" }}>Recorded sector beneficiaries</p>
          <div className="flex flex-wrap gap-1">{bene.map(t => <TickerChip key={t} ticker={t} color="#34d399" />)}</div>
        </div>
      ) : (
        <p className="text-[10px] mb-2.5" style={{ color: "rgba(255,255,255,0.4)" }}>No recorded downstream beneficiaries for the deal sector yet. Winners and losers are never invented.</p>
      )}
      {risks && (risks.invalidation || risks.contradictions.length > 0) ? (
        <div className="space-y-1">
          {risks.invalidation && <p className="text-[10.5px]" style={{ color: "rgba(251,191,36,0.8)" }}>⚠ {risks.invalidation} <span style={{ color: "rgba(255,255,255,0.35)" }}>(prediction engine)</span></p>}
          {risks.contradictions.slice(0, 2).map((c, i) => (
            <p key={i} className="text-[10.5px]" style={{ color: "rgba(248,113,113,0.8)" }}>⚠ {c.detail} <span style={{ color: "rgba(255,255,255,0.35)" }}>sev {c.severity} (evidence engine)</span></p>
          ))}
        </div>
      ) : (
        <p className="text-[10px]" style={{ color: "rgba(255,255,255,0.4)" }}>No recorded risk records for the resolved entities yet.</p>
      )}
    </div>
  );
}

// PredictionBlock / NarrativeBlock: DELETED (Phase 2.6, D3). Page-local
// probability engines and curated narrative propagation may not render as
// intelligence; the shared forward views ride the Shared Intelligence Read.

function ComparablesBlock({ deal, intel, bare }: { deal: MADeal; intel: DealIntel; bare?: boolean }) {
  if (intel.comparables.length === 0) return null;
  return (
    <div>
      {!bare && <SecHead letter="◷" title="Comparable Deals" color="rgba(255,255,255,0.5)" right={<span className="text-[8px] uppercase tracking-wide" style={{ color: "rgba(255,255,255,0.3)" }}>{deal.sector} · curated historical reference</span>} />}
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

function SimilarBlock({ similar, bare }: { similar: { d: MADeal; i: DealIntel }[]; bare?: boolean }) {
  if (similar.length === 0) return null;
  return (
    <div>
      {!bare && <SecHead letter="≈" title="Similar Recent Deals" color="rgba(167,139,250,0.8)" right={<span className="text-[8px] uppercase tracking-wide" style={{ color: "rgba(255,255,255,0.3)" }}>in this feed</span>} />}
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

function hasTxnDetails(intel: DealIntel): boolean {
  const a = intel.advisorSides;
  const hasAdvisors = intel.advisors.banks.length > 0 || intel.advisors.legal.length > 0;
  return intel.economics.length > 0 || intel.financingDetail.length > 0 || intel.competingBidders.length > 0 || hasAdvisors || a.financing.length > 0;
}

function TransactionBlock({ intel, bare }: { intel: DealIntel; bare?: boolean }) {
  const a = intel.advisorSides;
  const hasAdvisors = intel.advisors.banks.length > 0 || intel.advisors.legal.length > 0;
  const hasSidedAdvisors = a.buyFinancial.length + a.sellFinancial.length + a.buyLegal.length + a.sellLegal.length > 0;
  if (!hasTxnDetails(intel)) return null;
  return (
    <div>
      {!bare && <SecHead letter="D" title="Transaction Details" color="rgba(82,176,200,0.8)" />}
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
        {/* Read-through peer dictionaries + dynamic sections: DELETED (Phase
            2.6, D3) - recorded beneficiaries render in Exposure & Risks. */}
      </div>
    </div>
  );
}

// TransmissionDetailBlock: DELETED (Phase 2.6, D3) - the invented capital
// transmission chains are gone; the Network view renders RECORDED graph edges.

// Find recent deals in the feed similar to the open one (same sector or shared theme).
function findSimilar(deal: MADeal, intel: DealIntel, siblings: MADeal[], _ctx: DealContext): { d: MADeal; i: DealIntel }[] {
  const tags = new Set(intel.themeTags);
  return siblings
    .filter(d => d.id !== deal.id)
    .map(d => ({ d, i: enrichDeal(d) }))
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

type DealTab = "Overview" | "Impact" | "Network" | "Comparables";

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
  const shared = ctx.shared?.get(deal.id) ?? null;

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
          {prominent && shared?.relatedTheme && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold leading-none"
              title={`${shared.relation} (${shared.relationBasis}) - evidence classification against ${shared.relatedTheme}`}
              style={{ background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.6)", border: "1px solid rgba(255,255,255,0.08)" }}>
              <ShieldCheck size={9} style={{ color: shared.relation === "SUPPORTS" ? "#34d399" : shared.relation === "CONTRADICTS" ? "#f87171" : "#7cc7d8" }} />{shared.relation}
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

        {/* Phase 2.6: the inferred completion-probability bar is deleted -
            invented odds are not intelligence. Factual status renders above. */}

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
        const themeModel = shared?.relatedTheme ? buildThemeGraph(shared.relatedTheme) : null;
        const activeGraph = graphMode === "narrative" && themeModel ? themeModel : buildDealGraph(deal, intel);
        const TABS: DealTab[] = ["Overview", "Impact", "Network", "Comparables"];
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

          <div className="space-y-3">
            {tab === "Overview" && (<>
              <AssessmentBlock intel={intel} shared={shared} signal={signal} compact />
              <StatusBlock intel={intel} shared={shared} />
              <CapitalSummaryLine intel={intel} shared={shared} />
            </>)}

            {tab === "Impact" && <ImpactBlock shared={shared} />}

            {tab === "Network" && (
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-[9.5px] font-bold uppercase tracking-[0.15em]" style={{ color: "rgba(82,176,200,0.8)" }}>Capital Transmission Network</span>
                  {themeModel && (
                    <div className="flex items-center gap-0.5 ml-auto rounded-md p-0.5" style={{ background: "rgba(255,255,255,0.04)" }}>
                      {(["deal", "narrative"] as const).map(m => (
                        <button key={m} onClick={() => setGraphMode(m)} className="text-[9px] font-semibold px-2 py-0.5 rounded transition-colors"
                          style={graphMode === m ? { background: "rgba(82,176,200,0.18)", color: "#7cc7d8" } : { color: "rgba(255,255,255,0.42)" }}>{m === "deal" ? "Capital Flow" : "Narrative"}</button>
                      ))}
                    </div>
                  )}
                </div>
                {activeGraph ? (
                  <NetworkGraph model={activeGraph} height={340} expand={(node) => node.ticker ? buildCompanyGraph(node.ticker) : buildThemeGraph(node.label)} />
                ) : (
                  <p className="text-[10px] py-6 text-center" style={{ color: "rgba(255,255,255,0.4)" }}>No recorded relationships for this deal in the shared graph yet. Networks are never fabricated.</p>
                )}
              </div>
            )}

            {tab === "Comparables" && (<>
              <ComparablesBlock deal={deal} intel={intel} />
              <SimilarBlock similar={similar} />
            </>)}
          </div>
        </div>
        );
      })()}
    </motion.div>
  );
}

// Collapsible "show more" section for the drawer's lower-priority detail.
function DrawerAccordion({ title, children, defaultOpen = false }: { title: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-lg border" style={{ borderColor: "rgba(255,255,255,0.07)", background: "rgba(255,255,255,0.015)" }}>
      <button onClick={() => setOpen(o => !o)} className="w-full flex items-center gap-2 px-3 py-2 transition-colors hover:bg-white/[0.02]">
        <span className="text-[9px] font-bold uppercase tracking-[0.14em]" style={{ color: "rgba(255,255,255,0.55)" }}>{title}</span>
        <span className="ml-auto text-[8.5px] font-semibold uppercase tracking-wide" style={{ color: "rgba(255,255,255,0.32)" }}>{open ? "Hide" : "Show more"}</span>
        <ChevronRight size={13} className={cn("transition-transform", open && "rotate-90")} style={{ color: "rgba(255,255,255,0.4)" }} />
      </button>
      {open && (
        <div className="px-3 pb-3 pt-1 border-t" style={{ borderColor: "rgba(255,255,255,0.05)" }}>{children}</div>
      )}
    </div>
  );
}

// Full-intelligence drawer — the deep-dive, off the feed. Keeps cards compact.
function DealIntelligenceDrawer({ deal, intel, ctx, siblings, onClose }: { deal: MADeal; intel: DealIntel; ctx: DealContext; siblings: MADeal[]; onClose: () => void }) {
  const [graphMode, setGraphMode] = useState<"deal" | "narrative">("deal");
  const signal = useMemo(() => buildSignalProfile(deal, intel), [deal, intel]);
  const shared = ctx.shared?.get(deal.id) ?? null;
  const themeModel = shared?.relatedTheme ? buildThemeGraph(shared.relatedTheme) : null;
  const activeGraph = graphMode === "narrative" && themeModel ? themeModel : buildDealGraph(deal, intel);
  const similar = useMemo(() => findSimilar(deal, intel, siblings, ctx), [deal, intel, siblings, ctx]);
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
              {shared?.relatedTheme && (
                <span className="flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 rounded" style={{ background: "rgba(124,199,216,0.12)", color: "#7cc7d8" }}
                  title={`Evidence classification (${shared.relationBasis}) against ${shared.relatedTheme}`}>
                  <ShieldCheck size={9} />{shared.relation}
                </span>
              )}
            </div>
            <a href={deal.url} target="_blank" rel="noopener noreferrer" className="block text-[14px] font-semibold leading-snug hover:text-white/90 transition-colors" style={{ color: "rgba(255,255,255,0.92)" }}>{deal.title}</a>
          </div>
          <button onClick={onClose} className="shrink-0 p-1 rounded transition-colors hover:bg-white/10" style={{ color: "rgba(255,255,255,0.5)" }}><X size={16} /></button>
        </div>
        <div className="flex-1 overflow-y-auto scrollbar-hide p-4 space-y-3">
          {/* High-priority intelligence, with the network as the centrepiece */}
          <AssessmentBlock intel={intel} shared={shared} signal={signal} />
          <StatusBlock intel={intel} shared={shared} />
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[9.5px] font-bold uppercase tracking-[0.15em]" style={{ color: "rgba(82,176,200,0.8)" }}>Capital Transmission Network</span>
              {themeModel && (
                <div className="flex items-center gap-0.5 ml-auto rounded-md p-0.5" style={{ background: "rgba(255,255,255,0.04)" }}>
                  {(["deal", "narrative"] as const).map(m => (
                    <button key={m} onClick={() => setGraphMode(m)} className="text-[9px] font-semibold px-2 py-0.5 rounded transition-colors"
                      style={graphMode === m ? { background: "rgba(82,176,200,0.18)", color: "#7cc7d8" } : { color: "rgba(255,255,255,0.42)" }}>{m === "deal" ? "Capital Flow" : "Narrative"}</button>
                  ))}
                </div>
              )}
            </div>
            {activeGraph ? (
              <NetworkGraph model={activeGraph} height={420} expand={(node) => node.ticker ? buildCompanyGraph(node.ticker) : buildThemeGraph(node.label)} />
            ) : (
              <p className="text-[10px] py-8 text-center" style={{ color: "rgba(255,255,255,0.4)" }}>No recorded relationships for this deal in the shared graph yet. Networks are never fabricated.</p>
            )}
          </div>
          <ImpactBlock shared={shared} />

          {/* Lower-priority deep detail — collapsed by default */}
          {intel.comparables.length > 0 && (
            <DrawerAccordion title="Comparable Deals"><ComparablesBlock deal={deal} intel={intel} bare /></DrawerAccordion>
          )}
          {similar.length > 0 && (
            <DrawerAccordion title="Similar Recent Deals"><SimilarBlock similar={similar} bare /></DrawerAccordion>
          )}
          {hasTxnDetails(intel) && (
            <DrawerAccordion title="Transaction Details"><TransactionBlock intel={intel} bare /></DrawerAccordion>
          )}
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
function DealContextPanel({ deal, intel, shared, similar, onClose, onSelectTheme }: {
  deal: MADeal; intel: DealIntel; shared: DealIntelShared | null; similar: { d: MADeal; i: DealIntel }[];
  onClose: () => void; onSelectTheme?: (name: string) => void;
}) {
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
          {shared?.relatedTheme && (
            <span className="flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 rounded" style={{ background: "rgba(124,199,216,0.12)", color: "#7cc7d8" }}
              title={`Evidence classification (${shared.relationBasis}) against ${shared.relatedTheme}`}>
              <ShieldCheck size={9} />{shared.relation}
            </span>
          )}
        </div>
      </div>

      {/* Recorded sector beneficiaries (shared graph) - the dictionary
          read-through winners/losers/follow-on lists are deleted (D3) */}
      {(shared?.sectorBeneficiaries ?? []).length > 0 && (
        <SbCard title="Related Companies" icon={<Network size={12} style={{ color: "rgba(52,211,153,0.6)" }} />} sub="recorded graph edges">
          <div className="space-y-2.5">
            <TickerSet label="Recorded beneficiaries" tickers={shared!.sectorBeneficiaries} color="#34d399" />
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

      {/* Shared risks (verbatim engine records) - templated sector
          implications and re-rating prose are deleted (D3) */}
      {shared?.risks && (shared.risks.invalidation || shared.risks.contradictions.length > 0) && (
        <SbCard title="Risks · shared engines" icon={<TrendingUp size={12} style={{ color: "rgba(82,176,200,0.6)" }} />} sub={deal.sector}>
          {shared.risks.invalidation && <p className="text-[10.5px] leading-snug" style={{ color: "rgba(251,191,36,0.8)" }}>⚠ {shared.risks.invalidation}</p>}
          {shared.risks.contradictions.slice(0, 2).map((c, i) => (
            <p key={i} className="text-[10.5px] leading-snug mt-1" style={{ color: "rgba(248,113,113,0.8)" }}>⚠ {c.detail} <span style={{ color: "rgba(255,255,255,0.35)" }}>sev {c.severity}</span></p>
          ))}
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
  // Phase 2.6: the shared per-deal reads (lib/maIntel) ride the deal context -
  // profiles/risks/narratives/ledger records identical to Explorer's.
  const argus = useArgusIntelligence();
  const sharedByDeal = useMemo(() => {
    if (deals.length === 0) return new Map<string, DealIntelShared>();
    const facts = deals.map(d => {
      const i = enrichDeal(d);
      return { id: d.id, title: d.title, sector: d.sector, entities: d.entities, acquirer: i.buyer, target: i.target };
    });
    const profiles = new Map<string, IntelligenceProfile>();
    const risks = new Map<string, RiskRead>();
    if (argus.ready) {
      const keys = new Set<string>();
      for (const f of facts) for (const k of [f.acquirer, f.target, f.sector, ...(f.entities ?? [])]) if (k) keys.add(k);
      for (const k of keys) {
        const node = intelligenceGraph.getNode(k);
        if (!node || profiles.has(node.label.toLowerCase())) continue;
        profiles.set(node.label.toLowerCase(), cachedProfile(node.label));
        risks.set(node.label.toLowerCase(), buildRiskRead(node.label));
      }
    }
    const dr = deriveMorningBriefDeltas({ themes: argus.themes, previouslyTracked: getTrackedThemes(), graphReady: argus.ready });
    const vm = buildMAIntel({
      deals: facts, themes: argus.themes, profiles, risks,
      narratives: argus.ready ? deriveNarratives() : [],
      deltas: dr.deltas, graphReady: argus.ready,
    });
    return new Map((vm.deals.data ?? []).map(x => [x.dealId, x]));
  }, [deals, argus.themes, argus.ready]);

  const dealCtx: DealContext = useMemo(() => {
    const creditLayer = capitalFlow.layers[2];
    return {
      creditOpen: creditLayer ? (creditLayer.status === "accelerating" || creditLayer.status === "expanding") : undefined,
      regime: feedData?.sector_data?.derived_regime ?? undefined,
      riskRegime,
      shared: sharedByDeal,
    };
  }, [capitalFlow, feedData, riskRegime, sharedByDeal]);

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
                <DealContextPanel deal={expandedDeal} intel={expandedIntel} shared={sharedByDeal.get(expandedDeal.id) ?? null} similar={similarDeals}
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
                        {(t.second_order_effects?.[0] || t.description) && (
                          <p className="text-[10px] italic leading-snug pl-3.5" style={{ color: "rgba(255,255,255,0.32)" }}>
                            {t.second_order_effects?.[0] || t.description}
                          </p>
                        )}
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
