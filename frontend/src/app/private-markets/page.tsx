"use client";

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Layers, ArrowDown, ExternalLink, Building2, FileText, RefreshCw, AlertCircle, ChevronRight } from "lucide-react";
import { useMarketState } from "@/hooks/useMarketState";
import { useCreditSpread } from "@/hooks/useCreditSpread";
import { useMarketData } from "@/hooks/useMarketData";
import { useMAIntelligence } from "@/hooks/useMAIntelligence";
import { useIPOPipeline, type IPOFiler } from "@/hooks/useIPOPipeline";
import {
  computeCapitalFlow,
  measuredCoverage,
  directionalLayers,
  FLOW_STATUS_COLOR,
  FLOW_STATUS_LABEL,
  type CapitalFlowLayer,
  type FlowStatus,
} from "@/lib/capitalFlow";
import { flowPressure } from "@/lib/capitalFlowIntel";
// Phase 2.6: capital-flow MEANING comes from the shared engines
import { useArgusIntelligence } from "@/hooks/useArgusIntelligence";
import { buildPrivateIntel, type PrivateFlowItem } from "@/lib/maIntel";
import { buildTheRead } from "@/lib/theRead";
import { buildRiskRead, type RiskRead } from "@/lib/riskRead";
import { deriveNarratives } from "@/lib/narrativeDerivation";
import { deriveMorningBriefDeltas } from "@/lib/intelligenceDeltas";
import { getTrackedThemes } from "@/lib/themeSnapshots";
import { TickerChip } from "@/components/common/TickerChip";
import { useFeed } from "@/hooks/useFeed";
import {
  computeThemeEvolutionState,
  filterCapitalFlowThemes,
  THEME_EVOLUTION_META,
} from "@/lib/themeEvolution";

// ── Capital Flow Transmission ─────────────────────────────────────────────────

function FlowStatusBadge({ status }: { status: FlowStatus }) {
  const color = FLOW_STATUS_COLOR[status];
  const label = FLOW_STATUS_LABEL[status];
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold tracking-wide"
      style={{ color, background: `${color}14`, border: `1px solid ${color}28` }}>
      {label}
    </span>
  );
}

function FlowConnector({ status, seq, dim }: { status: FlowStatus; seq: number; dim: boolean }) {
  const color = FLOW_STATUS_COLOR[status];
  const flowing = status === "accelerating" || status === "expanding";
  return (
    <div className="flex flex-col items-center py-0.5 transition-opacity duration-300" style={{ opacity: dim ? 0.22 : 1 }}>
      <div className="w-px h-4 relative overflow-hidden" style={{ background: `${color}22` }}>
        {flowing && (
          <motion.div
            className="absolute inset-x-0 h-2"
            style={{ background: `linear-gradient(to bottom, transparent, ${color}, transparent)` }}
            animate={{ y: [-8, 16] }}
            transition={{ repeat: Infinity, duration: 0.9, ease: "linear" }}
          />
        )}
        {/* travelling packet glow */}
        <div aria-hidden className="tg-packet absolute inset-0" style={{ background: color, animationDelay: `${seq * 0.18}s` }} />
      </div>
      <ArrowDown size={10} style={{ color: `${color}60` }} />
    </div>
  );
}

const CHAIN_CELL = {
  hidden:  { opacity: 0, x: -12 },
  visible: { opacity: 1, x: 0, transition: { duration: 0.35, ease: [0.22, 0, 0.36, 1] } },
};

function FlowLayerCard({ layer, seq, dim, lit, isHovered, onHover }: {
  layer: CapitalFlowLayer; seq: number; dim: boolean; lit: boolean; isHovered: boolean; onHover: () => void;
}) {
  const color    = FLOW_STATUS_COLOR[layer.status];
  const isOpen   = layer.status === "accelerating" || layer.status === "expanding";
  const isClosed = layer.status === "contracting" || layer.status === "blocked";
  const accel    = layer.status === "accelerating";

  return (
    <div
      onMouseEnter={onHover}
      className="relative rounded-xl border p-4 transition-all duration-200"
      style={{
        background:   isOpen ? `${color}08` : isClosed ? "rgba(248,113,113,0.04)" : "rgba(255,255,255,0.025)",
        // micro-interaction: brighter border on hover, propagation-aware fade/dim
        borderColor:  isHovered ? `${color}66` : lit ? `${color}3a` : isOpen ? `${color}22` : isClosed ? "rgba(248,113,113,0.14)" : "rgba(255,255,255,0.06)",
        opacity:      dim ? 0.3 : isClosed ? 0.8 : 1,
        transform:    isHovered ? "translateY(-2px)" : "none",
        boxShadow:    isHovered ? `0 10px 32px ${color}26, 0 0 0 1px ${color}33` : "none",
      }}
    >
      {/* travelling packet — a glow that briefly lights this node as the pulse passes */}
      <div aria-hidden className="tg-packet absolute inset-0 rounded-xl pointer-events-none"
        style={{ boxShadow: `inset 0 0 22px ${color}44`, border: `1px solid ${color}`, animationDelay: `${seq * 0.18}s` }} />
      {/* accelerating node — soft breathing accent (calm for neutral, none for closed) */}
      {accel && <div aria-hidden className="tg-glow absolute left-0 top-3 bottom-3 w-[2px] rounded-full" style={{ background: color }} />}

      <div className="relative flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className="text-xs font-semibold" style={{ color: "rgba(255,255,255,0.82)" }}>
              {layer.label}
            </span>
            <span className="text-[10px]" style={{ color: "rgba(255,255,255,0.28)" }}>
              {layer.sublabel}
            </span>
          </div>
          <p className="text-xs leading-relaxed" style={{ color: "rgba(255,255,255,0.44)" }}>
            {layer.detail}
          </p>
        </div>
        <div className="shrink-0 flex flex-col items-end gap-1.5">
          <FlowStatusBadge status={layer.status} />
          <span className="text-[10px] font-mono" style={{ color: "rgba(255,255,255,0.32)" }}>
            {layer.indicator}
          </span>
        </div>
      </div>
    </div>
  );
}

// The transmission chain: a live capital-flow engine. A pulse travels downstream
// (CSS, per-element delay); hovering any node isolates everything downstream of it.
function CapitalFlowChain({ layers }: { layers: CapitalFlowLayer[] }) {
  const [hovered, setHovered] = useState<number | null>(null);
  return (
    <motion.div
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: "-60px" }}
      variants={{ visible: { transition: { staggerChildren: 0.07 } } }}
      onMouseLeave={() => setHovered(null)}
    >
      {layers.map((layer, i) => {
        const downstream = hovered === null || i >= hovered;   // hovered node + everything below
        const dim        = hovered !== null && !downstream;
        return (
          <motion.div key={layer.id} variants={CHAIN_CELL}>
            <FlowLayerCard
              layer={layer} seq={i * 2}
              dim={dim} lit={hovered !== null && downstream} isHovered={hovered === i}
              onHover={() => setHovered(i)}
            />
            {i < layers.length - 1 && (
              <FlowConnector status={layer.status} seq={i * 2 + 1} dim={hovered !== null && i < hovered} />
            )}
          </motion.div>
        );
      })}
    </motion.div>
  );
}

// ── IPO Pipeline ──────────────────────────────────────────────────────────────

function IPOFilerRow({ filer, index }: { filer: IPOFiler; index: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.03, duration: 0.2 }}
      className="flex items-center gap-3 py-2.5 border-b"
      style={{ borderColor: "rgba(255,255,255,0.05)" }}
    >
      <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
        style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.07)" }}>
        <FileText size={12} style={{ color: "rgba(255,255,255,0.36)" }} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium truncate" style={{ color: "rgba(255,255,255,0.78)" }}>
          {filer.companyName}
        </p>
        <div className="flex items-center gap-2 mt-0.5">
          {filer.sector && (
            <span className="text-[10px]" style={{ color: "rgba(255,255,255,0.32)" }}>
              {filer.sector}
            </span>
          )}
          {filer.stateOfIncorp && (
            <span className="text-[10px]" style={{ color: "rgba(255,255,255,0.22)" }}>
              {filer.stateOfIncorp}
            </span>
          )}
          {filer.sicDescription && !filer.sector && (
            <span className="text-[10px] truncate" style={{ color: "rgba(255,255,255,0.28)" }}>
              {filer.sicDescription}
            </span>
          )}
        </div>
      </div>
      <div className="shrink-0 text-right">
        <p className="text-[10px]" style={{ color: "rgba(255,255,255,0.28)" }}>
          {filer.filingDate}
        </p>
        <p className="text-[10px] font-mono" style={{ color: "rgba(255,255,255,0.20)" }}>
          CIK {filer.cik}
        </p>
      </div>
    </motion.div>
  );
}

// ── Sponsor deals section ─────────────────────────────────────────────────────

function SponsorDealRow({ deal, index }: { deal: { title: string; peFirm: string | null; sector: string; url: string; published: string }; index: number }) {
  return (
    <motion.a
      href={deal.url}
      target="_blank"
      rel="noopener noreferrer"
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04, duration: 0.22 }}
      className="group flex items-start gap-3 py-2.5 border-b hover:bg-white/[0.02] transition-colors rounded"
      style={{ borderColor: "rgba(255,255,255,0.05)" }}
    >
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium leading-snug group-hover:text-white/90 transition-colors"
          style={{ color: "rgba(255,255,255,0.72)" }}>
          {deal.title}
        </p>
        <div className="flex items-center gap-2 mt-1">
          {deal.peFirm && (
            <span className="text-[10px] flex items-center gap-1" style={{ color: "#c4b5fd" }}>
              <Building2 size={9} />
              {deal.peFirm}
            </span>
          )}
          <span className="text-[10px]" style={{ color: "rgba(255,255,255,0.28)" }}>{deal.sector}</span>
        </div>
      </div>
      <ExternalLink size={11} className="shrink-0 mt-0.5 opacity-0 group-hover:opacity-30 transition-opacity" style={{ color: "rgba(255,255,255,0.5)" }} />
    </motion.a>
  );
}

// ── Shared building blocks ─────────────────────────────────────────────────────

// SectionLabel: unused after the D10 migration (deleted).
function Reveal({ children, className, delay = 0 }: { children: React.ReactNode; className?: string; delay?: number }) {
  return (
    <motion.div className={className}
      initial={{ opacity: 0, y: 14 }} whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-50px" }} transition={{ duration: 0.4, delay, ease: [0.22, 0, 0.36, 1] }}>
      {children}
    </motion.div>
  );
}

// ── 1 · Capital Pressure Bar ───────────────────────────────────────────────────
function CapitalPressureBar({ layers }: { layers: CapitalFlowLayer[] }) {
  const p = useMemo(() => flowPressure(layers), [layers]);
  return (
    <div className="flex items-center gap-4 sm:gap-6 mt-6 px-4 py-3 rounded-xl border flex-wrap"
      style={{ borderColor: "rgba(255,255,255,0.07)", background: "rgba(255,255,255,0.02)" }}>
      <span className="text-[10px] font-bold uppercase tracking-[0.16em] shrink-0" style={{ color: "rgba(255,255,255,0.5)" }}>Private Capital Flow</span>
      {/* RC2-C2a: below majority coverage the meter shows NO directional verdict -
          no bar fill, no score, no trend arrow. The score is still computed and
          available on `p.score`, but rendering it here would read as a verdict. */}
      <div className="flex-1 min-w-[140px] h-2 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.06)" }}>
        {p.sufficient && (
          <motion.div className="h-full rounded-full" style={{ background: `linear-gradient(90deg, ${p.color}88, ${p.color})` }}
            initial={{ width: 0 }} animate={{ width: `${p.score}%` }} transition={{ duration: 1.4, ease: [0.22, 0, 0.36, 1] }} />
        )}
      </div>
      {p.sufficient && (
        <span className="text-[22px] font-black tabular-nums leading-none shrink-0" style={{ color: p.color }}>{p.score}</span>
      )}
      <span className="text-[10px] font-bold uppercase tracking-[0.14em] shrink-0" style={{ color: p.color }}>{p.label}</span>
      <span className="flex items-center gap-1 text-[10px] font-semibold shrink-0" style={{ color: p.sufficient ? (p.trend === "improving" ? "#22c55e" : p.trend === "deteriorating" ? "#ef4444" : "rgba(255,255,255,0.5)") : "rgba(255,255,255,0.45)" }}>
        {p.sufficient ? (p.trend === "improving" ? "▲" : p.trend === "deteriorating" ? "▼" : "▪") : ""} {p.trendLabel}
      </span>
      <span className="text-[10px] hidden sm:inline shrink-0" style={{ color: "rgba(255,255,255,0.4)" }}>{p.liquidity}</span>
    </div>
  );
}

// FlowItemRow: DELETED (Phase 2.6, D10).

// FlowColumn / BiggestFlowCard// FlowColumn / BiggestFlowCard / FlowStrengthGrid / TransmissionTimeline /
// CapitalRadar / TakeawaysGrid: DELETED (Phase 2.6, D10). Keyword-scored
// destinations/sources, invented invalidations, derived flow scores, and the
// "smart money" takeaways were page-local meaning. The shared engines answer
// those questions now (SharedFlowsPanel below).

function SharedFlowsPanel({ thesisLine, flows, note }: { thesisLine: string | null; flows: PrivateFlowItem[]; note?: string }) {
  return (
    <div className="rounded-xl border p-5" style={{ background: "rgba(82,176,200,0.04)", borderColor: "rgba(82,176,200,0.16)" }}>
      <div className="flex items-center gap-2 mb-2">
        <span className="text-[9px] font-black uppercase tracking-[0.16em]" style={{ color: "rgba(124,199,216,0.9)" }}>Where Capital Is Concentrating · shared engines</span>
        {note && <span className="text-[8.5px] italic" style={{ color: "rgba(255,255,255,0.3)" }}>{note}</span>}
      </div>
      {thesisLine ? (
        <p className="text-[13px] leading-relaxed mb-3" style={{ color: "rgba(255,255,255,0.82)" }}
          title="The SAME thesis line The Read / Markets / Feed show - one model">{thesisLine}</p>
      ) : (
        <p className="text-[11px] mb-3" style={{ color: "rgba(255,255,255,0.4)" }}>No shared Read thesis available yet.</p>
      )}
      <div className="space-y-2.5">
        {flows.map(f => (
          <div key={f.theme} className="rounded-lg border px-3 py-2" style={{ borderColor: "rgba(255,255,255,0.07)", background: "rgba(255,255,255,0.02)" }}>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[11.5px] font-semibold" style={{ color: "rgba(255,255,255,0.82)" }}>{f.theme}</span>
              <span className="text-[12px] font-black tabular-nums" style={{ color: f.conviction >= 70 ? "#34d399" : f.conviction >= 45 ? "#fbbf24" : "#94a3b8" }}>{f.conviction}</span>
              <span className="text-[8.5px] font-bold uppercase tracking-wide" style={{ color: f.direction === "bullish" ? "#34d399" : f.direction === "bearish" ? "#f87171" : "rgba(255,255,255,0.4)" }}>{f.direction}</span>
              {f.narrative && <span className="text-[8.5px] font-semibold px-1.5 py-0.5 rounded-full" style={{ background: "rgba(167,139,250,0.12)", color: "#c4b5fd" }}>{f.narrative}</span>}
              {f.beneficiaries.length > 0 && <span className="ml-auto flex items-center gap-1">{f.beneficiaries.slice(0, 3).map(t => <TickerChip key={t} ticker={t} color="#34d399" />)}</span>}
            </div>
            {f.latestChange && (
              <p className="text-[10px] mt-1" style={{ color: "rgba(255,255,255,0.55)" }} title={f.latestChange.why}>
                <span className="text-[7px] font-bold tracking-[0.12em] px-1 py-px rounded border mr-1.5" style={{ color: "#7cc7d8", borderColor: "rgba(124,199,216,0.4)" }}>{f.latestChange.kind}</span>
                {f.latestChange.what}
              </p>
            )}
            {(f.invalidation || f.watch) && (
              <p className="text-[9.5px] mt-1" style={{ color: "rgba(255,255,255,0.42)" }}>
                {f.invalidation ? <>⚠ {f.invalidation} <span style={{ color: "rgba(255,255,255,0.28)" }}>(prediction engine)</span></> : <>Watch {f.watch} <span className="text-[7px] font-bold tracking-[0.1em] px-1 py-px rounded border align-middle" style={{ color: "#7cc7d8", borderColor: "rgba(124,199,216,0.35)" }}>DERIVED</span></>}
              </p>
            )}
          </div>
        ))}
        {flows.length === 0 && <p className="text-[10.5px]" style={{ color: "rgba(255,255,255,0.4)" }}>No themes with recorded exposure this cycle.</p>}
      </div>
    </div>
  );
}

// ── Page ─// ── Page ──────────────────────────────────────────────────────────────────────

export default function PrivateMarketsPage() {
  const { riskRegime, volRegime } = useMarketState();
  const credit = useCreditSpread();   // RC2-C1: the only credit authority
  const { data: marketData }      = useMarketData();
  const { data: feedData }        = useFeed();
  const { deals, totalDealCount, isLoading: maLoading } = useMAIntelligence();
  const { filers, isLoading: ipoLoading, isError: ipoError, refetch: ipoRefetch } = useIPOPipeline();

  const tnxRate = useMemo(() => {
    const tnx = marketData?.["TNX"];
    return tnx?.price ?? null;
  }, [marketData]);

  const regime = feedData?.sector_data?.derived_regime ?? null;

  const sponsorDeals = useMemo(() =>
    deals.filter(d => d.dealType === "sponsor" || d.dealType === "strategic").slice(0, 10),
    [deals],
  );

  const capitalThemes = useMemo(() => {
    const all = feedData?.theme_intelligence ?? [];
    return filterCapitalFlowThemes(all).slice(0, 4);
  }, [feedData]);

  // RC2-C2b: narrow the raw EDGAR list to what it can actually support - distinct
  // issuers filing a NEW S-1, with the period the data itself covers. The full
  // list (amendments included) is still rendered in the pipeline table below;
  // only the Capital Flow observation is narrowed.
  const ipoObservation = useMemo(() => {
    if (!filers.length) return null;
    const dates = filers.map(f => f.filingDate).filter(Boolean).sort();
    return {
      newRegistrations: new Set(
        filers.filter(f => f.formType === "S-1").map(f => f.cik),
      ).size,
      rawEntries:  filers.length,
      windowStart: dates[0] ?? null,
      windowEnd:   dates[dates.length - 1] ?? null,
    };
  }, [filers]);

  const capitalFlow = useMemo(() => computeCapitalFlow({
    riskRegime,
    volRegime,
    regime,
    tnxRate,
    maDealCount:   totalDealCount,
    ipoFilings:    ipoObservation,
    credit,
  }), [riskRegime, volRegime, regime, tnxRate, totalDealCount, ipoObservation, credit]);

  // RC2-C2a: the regime chip is a THIRD aggregate over the same layers, and it
  // must obey the same measurement-sufficiency contract as buildSummary and
  // flowPressure. Its thresholds were absolute (>= 4 of 8) and its caption said
  // "of 8", both of which assumed every layer was measurable.
  const coverage     = measuredCoverage(capitalFlow.layers);
  // RC2-C2b: direction is judged over layers with directional authority only.
  // Observational layers count toward coverage but never toward a verdict.
  const directional  = directionalLayers(capitalFlow.layers);
  const openLayers   = directional.filter(l => l.status === "accelerating" || l.status === "expanding").length;
  const closedLayers = directional.filter(l => l.status === "contracting"  || l.status === "blocked").length;
  // Same proportional rule the summary uses, over the directional set.
  const chipMajority = Math.ceil(directional.length / 2);
  const chipVerdict  = !coverage.sufficient ? "Not measured"
    : openLayers   >= chipMajority ? "Capital Flowing"
    : closedLayers >= chipMajority ? "Capital Constrained"
    : "Mixed Transmission";
  const chipColor    = !coverage.sufficient ? "#64748b"
    : openLayers   >= chipMajority ? "#22c55e"
    : closedLayers >= chipMajority ? "#ef4444"
    : "#fbbf24";

  // ── Institutional intelligence — all derived from the live flow + themes ────
  const layers    = capitalFlow.layers;
  // Phase 2.6 (D10): capital-flow MEANING is a shared-engine projection - the
  // keyword destination/source scores, invented invalidations, flow-strength
  // composites, radar, and "smart money" takeaways are deleted.
  const argus = useArgusIntelligence();
  const privateIntel = useMemo(() => {
    const dr = deriveMorningBriefDeltas({ themes: argus.themes, previouslyTracked: getTrackedThemes(), graphReady: argus.ready });
    const read = buildTheRead({ themes: argus.themes, deltas: dr.deltas, graphReady: argus.ready });
    const risks = new Map<string, RiskRead>();
    for (const t of argus.themes.slice(0, 12)) risks.set(t.name.toLowerCase(), buildRiskRead(t.name, t));
    return buildPrivateIntel({
      themes: argus.themes,
      readThesisLine: read.thesis.data?.thesisLine ?? null,
      risks, narratives: argus.ready ? deriveNarratives() : [],
      deltas: dr.deltas, graphReady: argus.ready,
    });
  }, [argus.themes, argus.ready]);

  return (
    <div className="min-h-screen pb-24" style={{ background: "#030710" }}>

      {/* ── Hero ─────────────────────────────────────────────────────── */}
      <div className="border-b" style={{ borderColor: "rgba(255,255,255,0.06)", background: "rgba(255,255,255,0.01)" }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10">
          <div className="flex items-start gap-3 mb-3">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center"
              style={{ background: "rgba(82,176,200,0.12)", border: "1px solid rgba(82,176,200,0.18)" }}>
              <Layers size={15} style={{ color: "#52b0c8" }} />
            </div>
            <span className="text-xs font-semibold tracking-widest uppercase mt-2"
              style={{ color: "rgba(255,255,255,0.32)", letterSpacing: "0.12em" }}>
              Private Markets
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight mb-2" style={{ color: "rgba(255,255,255,0.92)" }}>
            Capital Flow Intelligence
          </h1>
          <p className="text-sm max-w-2xl" style={{ color: "rgba(255,255,255,0.42)" }}>
            {capitalFlow.summary}
          </p>

          {/* Regime summary chips */}
          <div className="flex items-center gap-2 mt-5 flex-wrap">
            <span className="text-[10px] px-2.5 py-1 rounded-full border font-medium"
              style={{
                borderColor: `${chipColor}33`,
                color:       chipColor,
                background:  `${chipColor}0f`,
              }}>
              {chipVerdict}
            </span>
            <span className="text-[10px] px-2 py-1 rounded-full" style={{ background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.36)" }}>
              {coverage.sufficient
                ? `${openLayers} of ${directional.length} directional layers open`
                : `${coverage.measured} of ${coverage.total} layers measured`}
            </span>
            {regime && (
              <span className="text-[10px] px-2 py-1 rounded-full" style={{ background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.36)" }}>
                {regime}
              </span>
            )}
          </div>

          {/* 1 · Capital Pressure Bar — instant health of private markets */}
          <CapitalPressureBar layers={layers} />
        </div>
      </div>

      {/* ── Body ─────────────────────────────────────────────────────── */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-8 items-start">

          {/* ── Capital Flow — main column ───────────────────────────── */}
          <div className="lg:col-span-3 space-y-10">

            {/* Shared capital read — the same thesis/risks every surface shows */}
            <Reveal>
              <SharedFlowsPanel
                thesisLine={privateIntel.thesisLine.data}
                flows={privateIntel.flows.data ?? []}
                note={privateIntel.flows.note}
              />
            </Reveal>

            {/* Transmission chain */}
            <div>
              <div className="flex items-center gap-2 mb-5">
                <div className="w-1.5 h-1.5 rounded-full" style={{ background: "#52b0c8" }} />
                <h2 className="text-sm font-semibold" style={{ color: "rgba(255,255,255,0.72)" }}>
                  Capital Flow Transmission
                </h2>
                <span className="text-xs" style={{ color: "rgba(255,255,255,0.28)" }}>
                  Monetary Policy → IPO Filing Activity
                </span>
              </div>
              <CapitalFlowChain layers={layers} />
              <p className="mt-4 text-[10px] leading-relaxed" style={{ color: "rgba(255,255,255,0.22)" }}>
                {/* RC2-C2b: the old caption claimed "M&A deal activity" and "updated in
                    real time". Neither held: the M&A figure is Argus feed coverage, the
                    credit series is daily/T+1 and the S-1 data covers the few business
                    days EDGAR returns. */}
                Directional layers derive from live market regime, the 10Y yield and the measured US high-yield OAS (daily, T+1). M&amp;A and IPO layers are observational counts — Argus feed coverage and SEC EDGAR S-1 registrations — and do not set direction.
              </p>
            </div>

            {/* Phase 2.6: the Capital Rotation / Flow Strength / Timeline /
                Radar / Takeaways sections are deleted (D10) - they rendered
                keyword-scored and templated meaning. The factual transmission
                chain above and the shared reads replace them. */}
          </div>

          {/* ── Right column — permanent intelligence panel (sticky) ─── */}
          <div className="lg:col-span-2 space-y-6 lg:sticky lg:top-6 lg:self-start">

            {/* IPO Pipeline */}
            <div className="rounded-xl border p-5"
              style={{ background: "rgba(255,255,255,0.025)", borderColor: "rgba(255,255,255,0.06)" }}>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-sm font-semibold" style={{ color: "rgba(255,255,255,0.78)" }}>
                    IPO Pipeline
                  </h3>
                  <p className="text-[10px] mt-0.5" style={{ color: "rgba(255,255,255,0.3)" }}>
                    SEC EDGAR S-1 filings
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {!ipoLoading && (
                    <span className="text-xs font-mono" style={{ color: "rgba(255,255,255,0.36)" }}>
                      {filers.length} filers
                    </span>
                  )}
                  <button
                    onClick={() => ipoRefetch()}
                    className="p-1.5 rounded-lg hover:bg-white/[0.05] transition-colors"
                    style={{ color: "rgba(255,255,255,0.28)" }}
                    title="Refresh IPO data"
                  >
                    <RefreshCw size={11} className={ipoLoading ? "animate-spin" : ""} />
                  </button>
                </div>
              </div>

              {ipoError && (
                <div className="flex items-center gap-2 text-xs rounded-lg px-3 py-2 mb-3"
                  style={{ background: "rgba(248,113,113,0.08)", color: "#fca5a5" }}>
                  <AlertCircle size={11} />
                  Unable to fetch EDGAR data.
                </div>
              )}

              {ipoLoading ? (
                <div className="space-y-2">
                  {[1, 2, 3].map(i => (
                    <div key={i} className="h-10 rounded-lg animate-pulse" style={{ background: "rgba(255,255,255,0.04)" }} />
                  ))}
                </div>
              ) : filers.length === 0 ? (
                <div className="text-center py-6">
                  <FileText size={20} className="mx-auto mb-2" style={{ color: "rgba(255,255,255,0.14)" }} />
                  <p className="text-xs" style={{ color: "rgba(255,255,255,0.28)" }}>No recent S-1 filings</p>
                </div>
              ) : (
                <div className="max-h-80 overflow-y-auto">
                  {filers.slice(0, 20).map((filer, i) => (
                    <IPOFilerRow key={`${filer.cik}-${i}`} filer={filer} index={i} />
                  ))}
                </div>
              )}

              <div className="mt-3 flex items-center justify-between">
                <p className="text-[10px]" style={{ color: "rgba(255,255,255,0.22)" }}>
                  Data sourced from SEC EDGAR. Refreshes hourly.
                </p>
                <a
                  href="https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent&type=S-1"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-[10px] hover:opacity-70 transition-opacity"
                  style={{ color: "rgba(82,176,200,0.6)" }}
                >
                  View on EDGAR
                  <ExternalLink size={9} />
                </a>
              </div>
            </div>

            {/* Capital Flow Themes */}
            {capitalThemes.length > 0 && (
              <div className="rounded-xl border p-5"
                style={{ background: "rgba(255,255,255,0.025)", borderColor: "rgba(255,255,255,0.06)" }}>
                <h3 className="text-sm font-semibold mb-4" style={{ color: "rgba(255,255,255,0.78)" }}>
                  Narrative Themes
                </h3>
                <div className="space-y-3">
                  {capitalThemes.map(t => {
                    const evState = computeThemeEvolutionState(t);
                    const evMeta  = THEME_EVOLUTION_META[evState];
                    return (
                      <div key={t.id} className="space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded border"
                            style={{ color: evMeta.color, background: evMeta.bg, borderColor: evMeta.border }}>
                            {evMeta.icon} {evMeta.label}
                          </span>
                          <span className="text-xs font-medium flex-1 truncate"
                            style={{ color: "rgba(255,255,255,0.72)" }}>
                            {t.name}
                          </span>
                        </div>
                        {(t.second_order_effects?.[0] || t.description) && (
                          <p className="text-[10px] italic leading-snug"
                            style={{ color: "rgba(255,255,255,0.36)" }}>
                            {t.second_order_effects?.[0] || t.description}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* PE / Sponsor deals */}
            {sponsorDeals.length > 0 && (
              <div className="rounded-xl border p-5"
                style={{ background: "rgba(255,255,255,0.025)", borderColor: "rgba(255,255,255,0.06)" }}>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-semibold" style={{ color: "rgba(255,255,255,0.78)" }}>
                    Sponsor Activity
                  </h3>
                  <a href="/ma" className="flex items-center gap-0.5 text-[10px] group"
                    style={{ color: "rgba(82,176,200,0.6)" }}>
                    All deals
                    <ChevronRight size={10} className="group-hover:translate-x-0.5 transition-transform" />
                  </a>
                </div>
                <div>
                  {sponsorDeals.map((deal, i) => (
                    <SponsorDealRow key={deal.id} deal={deal} index={i} />
                  ))}
                </div>
              </div>
            )}

            {!maLoading && sponsorDeals.length === 0 && (
              <div className="rounded-xl border p-5"
                style={{ background: "rgba(255,255,255,0.02)", borderColor: "rgba(255,255,255,0.05)" }}>
                <h3 className="text-sm font-semibold mb-2" style={{ color: "rgba(255,255,255,0.72)" }}>
                  Sponsor Activity
                </h3>
                <p className="text-xs" style={{ color: "rgba(255,255,255,0.3)" }}>
                  No sponsor or PE-backed deals in the current feed window.
                </p>
                <a href="/ma" className="flex items-center gap-1 text-xs mt-3 group"
                  style={{ color: "rgba(82,176,200,0.6)" }}>
                  View full M&A intelligence
                  <ChevronRight size={11} className="group-hover:translate-x-0.5 transition-transform" />
                </a>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
