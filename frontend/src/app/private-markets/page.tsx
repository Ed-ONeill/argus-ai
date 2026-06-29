"use client";

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Layers, ArrowDown, ExternalLink, Building2, FileText, RefreshCw, AlertCircle, ChevronRight } from "lucide-react";
import { useMarketState } from "@/hooks/useMarketState";
import { useMarketData } from "@/hooks/useMarketData";
import { useMAIntelligence } from "@/hooks/useMAIntelligence";
import { useIPOPipeline, type IPOFiler } from "@/hooks/useIPOPipeline";
import {
  computeCapitalFlow,
  FLOW_STATUS_COLOR,
  FLOW_STATUS_LABEL,
  type CapitalFlowLayer,
  type FlowStatus,
} from "@/lib/capitalFlow";
import {
  flowPressure, capitalDestinations, capitalSources, biggestFlow,
  flowStrength, flowTimeline, radarAxes, takeaways,
  type FlowItem, type FlowMetric, type TimelineNode, type RadarAxis,
} from "@/lib/capitalFlowIntel";
import { TickerChip } from "@/components/common/TickerChip";
import { useFeed } from "@/hooks/useFeed";
import {
  computeThemeEvolutionState,
  getEvolutionNarrative,
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

function SectionLabel({ children, accent = "#52b0c8" }: { children: React.ReactNode; accent?: string }) {
  return (
    <div className="flex items-center gap-2 mb-4">
      <div className="w-1.5 h-1.5 rounded-full" style={{ background: accent }} />
      <h2 className="text-sm font-semibold" style={{ color: "rgba(255,255,255,0.72)" }}>{children}</h2>
    </div>
  );
}

// Reveal wrapper — staggered scroll-in; nothing appears abruptly.
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
      <div className="flex-1 min-w-[140px] h-2 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.06)" }}>
        <motion.div className="h-full rounded-full" style={{ background: `linear-gradient(90deg, ${p.color}88, ${p.color})` }}
          initial={{ width: 0 }} animate={{ width: `${p.score}%` }} transition={{ duration: 1.4, ease: [0.22, 0, 0.36, 1] }} />
      </div>
      <span className="text-[22px] font-black tabular-nums leading-none shrink-0" style={{ color: p.color }}>{p.score}</span>
      <span className="text-[10px] font-bold uppercase tracking-[0.14em] shrink-0" style={{ color: p.color }}>{p.label}</span>
      <span className="flex items-center gap-1 text-[10px] font-semibold shrink-0" style={{ color: p.trend === "improving" ? "#22c55e" : p.trend === "deteriorating" ? "#ef4444" : "rgba(255,255,255,0.5)" }}>
        {p.trend === "improving" ? "▲" : p.trend === "deteriorating" ? "▼" : "▪"} {p.trendLabel}
      </span>
      <span className="text-[10px] hidden sm:inline shrink-0" style={{ color: "rgba(255,255,255,0.4)" }}>{p.liquidity}</span>
    </div>
  );
}

// ── 2 + 3 · Flow item row (destination / source) ───────────────────────────────
function FlowItemRow({ item, max, i }: { item: FlowItem; max: number; i: number }) {
  const w = Math.round((Math.abs(item.value) / max) * 100);
  return (
    <motion.div className="flex items-center gap-3"
      initial={{ opacity: 0, x: -8 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }}
      transition={{ delay: i * 0.05, duration: 0.3 }}>
      <span className="text-[11px] font-medium w-32 shrink-0 truncate" style={{ color: "rgba(255,255,255,0.7)" }}>{item.label}</span>
      <div className="flex-1 h-[6px] rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.05)" }}>
        <motion.div className="h-full rounded-full" style={{ background: item.color }}
          initial={{ width: 0 }} whileInView={{ width: `${Math.max(4, w)}%` }} viewport={{ once: true }}
          transition={{ delay: i * 0.05 + 0.1, duration: 0.7, ease: "easeOut" }} />
      </div>
      <span className="text-[11px] font-bold tabular-nums w-9 text-right shrink-0" style={{ color: item.color }}>
        {item.value > 0 ? "+" : ""}{item.value}
      </span>
    </motion.div>
  );
}

function FlowColumn({ title, items, accent }: { title: string; items: FlowItem[]; accent: string }) {
  const max = Math.max(1, ...items.map(i => Math.abs(i.value)));
  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-[0.14em] mb-3" style={{ color: accent }}>{title}</p>
      <div className="space-y-2.5">
        {items.length ? items.map((it, i) => <FlowItemRow key={it.label} item={it} max={max} i={i} />)
          : <p className="text-[11px]" style={{ color: "rgba(255,255,255,0.3)" }}>No material rotation detected.</p>}
      </div>
    </div>
  );
}

// ── 4 · Today's Biggest Flow ───────────────────────────────────────────────────
function BiggestFlowCard({ flow }: { flow: ReturnType<typeof biggestFlow> }) {
  if (!flow) return null;
  const dc = flow.direction > 0 ? "#22c55e" : flow.direction < 0 ? "#ef4444" : "#fbbf24";
  return (
    <div className="relative rounded-xl border overflow-hidden p-5"
      style={{ borderColor: `${dc}33`, background: `linear-gradient(135deg, ${dc}0e, rgba(255,255,255,0.015) 55%)` }}>
      <div aria-hidden className="tg-glow absolute left-0 top-4 bottom-4 w-[2px] rounded-full" style={{ background: dc }} />
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <p className="text-[9px] font-bold uppercase tracking-[0.18em] mb-1.5" style={{ color: "rgba(255,255,255,0.42)" }}>Today&apos;s Biggest Flow</p>
          <div className="flex items-center gap-2">
            <span className="text-[20px] font-black leading-none" style={{ color: "rgba(255,255,255,0.95)" }}>{flow.label}</span>
            <span className="text-[18px] font-black" style={{ color: dc }}>{flow.direction > 0 ? "↑" : flow.direction < 0 ? "↓" : "↔"}</span>
          </div>
        </div>
        <div className="flex flex-col items-end shrink-0">
          <span className="text-[26px] font-black tabular-nums leading-none" style={{ color: dc }}>{flow.confidence}</span>
          <span className="text-[8px] font-bold uppercase tracking-wider" style={{ color: "rgba(255,255,255,0.4)" }}>Confidence</span>
        </div>
      </div>
      <div className="grid sm:grid-cols-2 gap-x-5 gap-y-3 mt-4">
        <TakeawayLine label="Reason" value={flow.reason} />
        <div>
          <p className="text-[8px] font-bold uppercase tracking-[0.14em] mb-1" style={{ color: "rgba(255,255,255,0.36)" }}>Beneficiaries</p>
          {flow.beneficiaries.length ? (
            <div className="flex flex-wrap gap-x-2.5 gap-y-1">
              {flow.beneficiaries.map(b => <TickerChip key={b} ticker={b} size="md" color="#22c55e" />)}
            </div>
          ) : <p className="text-[11px]" style={{ color: "rgba(255,255,255,0.3)" }}>—</p>}
        </div>
        <TakeawayLine label="Invalidation" value={flow.invalidation} color="#f87171" />
      </div>
    </div>
  );
}

// ── 5 · Flow Strength ──────────────────────────────────────────────────────────
function FlowStrengthGrid({ metrics }: { metrics: FlowMetric[] }) {
  const col = (v: number) => v >= 66 ? "#22c55e" : v >= 40 ? "#fbbf24" : "#f97316";
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-4">
      {metrics.map((m, i) => (
        <motion.div key={m.label}
          initial={{ opacity: 0, y: 8 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.05, duration: 0.3 }}>
          <div className="flex items-baseline justify-between mb-1">
            <span className="text-[9.5px] font-medium" style={{ color: "rgba(255,255,255,0.55)" }}>{m.label}</span>
            <span className="text-[12px] font-black tabular-nums" style={{ color: col(m.value) }}>{m.value}</span>
          </div>
          <div className="h-[5px] rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.05)" }}>
            <motion.div className="h-full rounded-full" style={{ background: col(m.value) }}
              initial={{ width: 0 }} whileInView={{ width: `${m.value}%` }} viewport={{ once: true }} transition={{ delay: i * 0.05 + 0.1, duration: 0.7, ease: "easeOut" }} />
          </div>
        </motion.div>
      ))}
    </div>
  );
}

// ── 6 · Transmission Timeline ──────────────────────────────────────────────────
function TransmissionTimeline({ nodes }: { nodes: TimelineNode[] }) {
  const [open, setOpen] = useState<number | null>(null);
  return (
    <div className="flex flex-col gap-0">
      {nodes.map((n, i) => {
        const color = FLOW_STATUS_COLOR[n.status];
        return (
          <div key={`${n.label}-${i}`}>
            <motion.button onMouseEnter={() => setOpen(i)} onMouseLeave={() => setOpen(null)}
              initial={{ opacity: 0, x: -8 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.05, duration: 0.3 }}
              className="w-full flex items-center gap-3 text-left group">
              <span className="w-2 h-2 rounded-full shrink-0" style={{ background: color, boxShadow: `0 0 8px ${color}66` }} />
              <span className="text-[11px] font-semibold w-28 shrink-0 truncate" style={{ color: "rgba(255,255,255,0.78)" }}>{n.label}</span>
              <span className="text-[9.5px]" style={{ color }}>{n.signal}</span>
              <span className="ml-auto text-[8.5px] tabular-nums shrink-0" style={{ color: "rgba(255,255,255,0.28)" }}>{FLOW_STATUS_LABEL[n.status]}</span>
            </motion.button>
            <div className="overflow-hidden transition-all duration-200" style={{ maxHeight: open === i ? 48 : 0, opacity: open === i ? 1 : 0 }}>
              <p className="text-[10px] leading-snug pl-5 py-1.5" style={{ color: "rgba(255,255,255,0.42)" }}>{n.evidence}</p>
            </div>
            {i < nodes.length - 1 && <div className="ml-[3px] w-px h-3" style={{ background: "rgba(255,255,255,0.12)" }} />}
          </div>
        );
      })}
    </div>
  );
}

// ── 7 · Live Capital Radar ─────────────────────────────────────────────────────
function CapitalRadar({ axes }: { axes: RadarAxis[] }) {
  const size = 220, c = size / 2, R = 78;
  const pt = (i: number, r: number) => {
    const a = (Math.PI * 2 * i) / axes.length - Math.PI / 2;
    return [c + Math.cos(a) * r, c + Math.sin(a) * r] as const;
  };
  const poly = axes.map((ax, i) => pt(i, R * ax.value).join(",")).join(" ");
  return (
    <div className="flex items-center justify-center">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {[0.33, 0.66, 1].map(g => (
          <polygon key={g} points={axes.map((_, i) => pt(i, R * g).join(",")).join(" ")}
            fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth={1} />
        ))}
        {axes.map((_, i) => { const [x, y] = pt(i, R); return <line key={i} x1={c} y1={c} x2={x} y2={y} stroke="rgba(255,255,255,0.06)" strokeWidth={1} />; })}
        <motion.polygon points={poly} fill="rgba(82,176,200,0.14)" stroke="#52b0c8" strokeWidth={1.5}
          initial={{ opacity: 0, scale: 0.6 }} whileInView={{ opacity: 1, scale: 1 }} viewport={{ once: true }}
          transition={{ duration: 0.7, ease: [0.22, 0, 0.36, 1] }} style={{ transformOrigin: "center" }} />
        {axes.map((ax, i) => {
          const [x, y] = pt(i, R * ax.value);
          const [lx, ly] = pt(i, R + 16);
          return (
            <g key={ax.label}>
              <motion.circle cx={x} cy={y} r={2.5} fill="#7cc7d8"
                animate={{ opacity: [0.5, 1, 0.5] }} transition={{ duration: 3, repeat: Infinity, delay: i * 0.35, ease: "easeInOut" }} />
              <text x={lx} y={ly} fontSize={7.5} fontWeight={600} textAnchor={lx < c - 4 ? "end" : lx > c + 4 ? "start" : "middle"}
                dominantBaseline="middle" fill="rgba(255,255,255,0.5)">{ax.label}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// ── 8 · Institutional takeaways ────────────────────────────────────────────────
function TakeawayLine({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div>
      <p className="text-[8px] font-bold uppercase tracking-[0.14em] mb-1" style={{ color: "rgba(255,255,255,0.36)" }}>{label}</p>
      <p className="text-[11px] leading-snug" style={{ color: color ?? "rgba(255,255,255,0.78)" }}>{value}</p>
    </div>
  );
}

function TakeawaysGrid({ items }: { items: { label: string; value: string }[] }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-4">
      {items.map((t, i) => (
        <motion.div key={t.label}
          initial={{ opacity: 0, y: 8 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.04, duration: 0.3 }}>
          <TakeawayLine label={t.label} value={t.value} color={t.label === "Most At Risk" || t.label === "Invalidation" ? "#f87171" : t.label === "Most Leveraged" ? "#34d399" : undefined} />
        </motion.div>
      ))}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function PrivateMarketsPage() {
  const { riskRegime, volRegime } = useMarketState();
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

  const vcDealCount = useMemo(() =>
    deals.filter(d => d.dealType === "sponsor").length,
    [deals],
  );

  const capitalThemes = useMemo(() => {
    const all = feedData?.theme_intelligence ?? [];
    return filterCapitalFlowThemes(all).slice(0, 4);
  }, [feedData]);

  const capitalFlow = useMemo(() => computeCapitalFlow({
    riskRegime,
    volRegime,
    regime,
    tnxRate,
    maDealCount:   totalDealCount,
    vcDealCount,
    ipoFilerCount: filers.length,
  }), [riskRegime, volRegime, regime, tnxRate, totalDealCount, vcDealCount, filers.length]);

  const openLayers   = capitalFlow.layers.filter(l => l.status === "accelerating" || l.status === "expanding").length;
  const closedLayers = capitalFlow.layers.filter(l => l.status === "contracting"  || l.status === "blocked").length;

  // ── Institutional intelligence — all derived from the live flow + themes ────
  const allThemes = useMemo(() => feedData?.theme_intelligence ?? [], [feedData]);
  const rateHigh  = tnxRate !== null && tnxRate > 4.5;
  const riskOff   = riskRegime === "risk-off";
  const layers    = capitalFlow.layers;
  const destinations = useMemo(() => capitalDestinations(allThemes, layers), [allThemes, layers]);
  const sources      = useMemo(() => capitalSources(allThemes, layers, rateHigh, riskOff), [allThemes, layers, rateHigh, riskOff]);
  const biggest      = useMemo(() => biggestFlow(allThemes), [allThemes]);
  const strength     = useMemo(() => flowStrength(layers, allThemes), [layers, allThemes]);
  const timeline     = useMemo(() => flowTimeline(layers, destinations), [layers, destinations]);
  const radar        = useMemo(() => radarAxes(allThemes, layers, riskOff), [allThemes, layers, riskOff]);
  const takeawayItems = useMemo(() => takeaways(layers, allThemes, rateHigh, riskOff), [layers, allThemes, rateHigh, riskOff]);

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
                borderColor: openLayers >= 4 ? "#22c55e33" : closedLayers >= 4 ? "#ef444433" : "#fbbf2433",
                color:       openLayers >= 4 ? "#22c55e"   : closedLayers >= 4 ? "#ef4444"   : "#fbbf24",
                background:  openLayers >= 4 ? "#22c55e0f" : closedLayers >= 4 ? "#ef44440f" : "#fbbf240f",
              }}>
              {openLayers >= 4 ? "Capital Flowing" : closedLayers >= 4 ? "Capital Constrained" : "Mixed Transmission"}
            </span>
            <span className="text-[10px] px-2 py-1 rounded-full" style={{ background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.36)" }}>
              {openLayers} of 8 layers open
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

            {/* 4 · Today's Biggest Flow — the focal point */}
            {biggest && <Reveal><BiggestFlowCard flow={biggest} /></Reveal>}

            {/* Transmission chain */}
            <div>
              <div className="flex items-center gap-2 mb-5">
                <div className="w-1.5 h-1.5 rounded-full" style={{ background: "#52b0c8" }} />
                <h2 className="text-sm font-semibold" style={{ color: "rgba(255,255,255,0.72)" }}>
                  Capital Flow Transmission
                </h2>
                <span className="text-xs" style={{ color: "rgba(255,255,255,0.28)" }}>
                  Monetary Policy → IPO Window
                </span>
              </div>
              <CapitalFlowChain layers={layers} />
              <p className="mt-4 text-[10px] leading-relaxed" style={{ color: "rgba(255,255,255,0.22)" }}>
                Capital flow status derived from live market regime, 10Y yield, M&A deal activity, and SEC EDGAR S-1 pipeline. Updated in real time as conditions change.
              </p>
            </div>

            {/* 2 + 3 · Where capital is going / leaving */}
            <Reveal>
              <SectionLabel>Capital Rotation</SectionLabel>
              <div className="grid sm:grid-cols-2 gap-x-8 gap-y-6">
                <FlowColumn title="Where Capital Is Going" items={destinations} accent="#34d399" />
                <FlowColumn title="Where Capital Is Leaving" items={sources} accent="#f87171" />
              </div>
            </Reveal>

            {/* 5 · Flow strength */}
            <Reveal>
              <SectionLabel>Flow Strength</SectionLabel>
              <FlowStrengthGrid metrics={strength} />
            </Reveal>

            {/* 6 + 7 · Transmission timeline + rotation radar */}
            <Reveal>
              <div className="grid sm:grid-cols-2 gap-x-8 gap-y-6">
                <div>
                  <SectionLabel>Transmission Timeline</SectionLabel>
                  <TransmissionTimeline nodes={timeline} />
                </div>
                <div>
                  <SectionLabel>Live Capital Radar</SectionLabel>
                  <CapitalRadar axes={radar} />
                </div>
              </div>
            </Reveal>

            {/* 8 · Institutional takeaways */}
            <Reveal>
              <SectionLabel>Institutional Takeaways</SectionLabel>
              <TakeawaysGrid items={takeawayItems} />
            </Reveal>
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
                        <p className="text-[10px] italic leading-snug"
                          style={{ color: "rgba(255,255,255,0.36)" }}>
                          {getEvolutionNarrative(t.name, evState)}
                        </p>
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
