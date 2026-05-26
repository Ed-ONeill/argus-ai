"use client";

import { useMemo } from "react";
import { motion } from "framer-motion";
import { useNarrativeNetwork } from "@/hooks/useNarrativeNetwork";
import { useMarketState } from "@/hooks/useMarketState";
import type { MarketBrief, GraphNode, PropagationChain } from "@/lib/types";

interface MorningBriefingProps {
  brief:     MarketBrief | undefined | null;
  isLoading: boolean;
}

const REGIME_COLOR: Record<string, string> = {
  "Risk-Off Hawkish":      "#b05858",
  "Risk-Off Neutral":      "#b07838",
  "Risk-On Dovish":        "#52b0c8",
  "Risk-On Neutral":       "#6898c8",
  "Stagflationary":        "#c8a040",
  "Neutral/Consolidating": "#8898b8",
};

function getRegimeColor(regime: string): string {
  return REGIME_COLOR[regime] ?? "#8898b8";
}

function buildTransmissionPath(
  chain: PropagationChain | undefined,
  nodes: GraphNode[],
): string | null {
  if (!chain || chain.nodes.length < 2) return null;
  const nodeMap = new Map(nodes.map(n => [n.id, n]));
  const labels  = chain.nodes
    .slice(0, 5)
    .map(id => nodeMap.get(id)?.label)
    .filter((l): l is string => Boolean(l));
  if (labels.length < 2) return null;
  return labels.join(" → ");
}

export function MorningBriefing({ brief, isLoading }: MorningBriefingProps) {
  const { data: netData } = useNarrativeNetwork();
  const ms                = useMarketState();

  const transmission = useMemo(
    () => buildTransmissionPath(netData?.chains?.[0], netData?.nodes ?? []),
    [netData?.chains, netData?.nodes],
  );

  if (isLoading) return <MorningBriefingSkeleton />;
  if (!brief)    return null;

  const color   = getRegimeColor(brief.market_regime);
  const signals = ms.signals ?? [];

  const today = new Date().toLocaleDateString("en-US", {
    weekday: "short", month: "short", day: "numeric",
  });

  return (
    <motion.section
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.42, ease: [0.22, 0, 0.36, 1] }}
      className="relative overflow-hidden mb-8 rounded-lg"
      style={{
        background:   "rgba(6,11,26,0.98)",
        borderTop:    "1px solid rgba(255,255,255,0.09)",
        borderRight:  "1px solid rgba(255,255,255,0.05)",
        borderBottom: "1px solid rgba(255,255,255,0.07)",
        borderLeft:   `3px solid ${color}`,
      }}
    >
      {/* Ambient left-side glow from regime color */}
      <div className="absolute inset-0 pointer-events-none"
        style={{ background: `radial-gradient(ellipse 50% 100% at 0% 50%, ${color}11 0%, transparent 62%)` }} />

      <div className="px-5 py-4 pl-6 relative">

        {/* ── State + date ─────────────────────────────────────────────── */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2.5">
            <span
              className="text-[8px] font-bold uppercase"
              style={{ letterSpacing: "0.18em", color: "rgba(255,255,255,0.32)" }}
            >
              Market State
            </span>
            <div className="h-3 w-px shrink-0" style={{ background: "rgba(255,255,255,0.10)" }} />
            <span className="text-[11px] font-semibold" style={{ color }}>
              {brief.market_regime}
            </span>
          </div>
          <span className="text-[9px] tabular-nums" style={{ color: "rgba(255,255,255,0.26)" }}>
            {today}
          </span>
        </div>

        {/* ── Primary statement — the anchor sentence ───────────────────── */}
        <p
          className="font-semibold leading-snug mb-3"
          style={{ fontSize: "16px", color: "rgba(255,255,255,0.94)", maxWidth: "700px" }}
        >
          {brief.primary_driver}
        </p>

        {/* ── Narrative — supporting context ────────────────────────────── */}
        {brief.narrative_shift && (
          <p
            className="leading-relaxed mb-4"
            style={{ fontSize: "12.5px", color: "rgba(255,255,255,0.58)", maxWidth: "640px" }}
          >
            {brief.narrative_shift}
          </p>
        )}

        {/* ── Transmission path ─────────────────────────────────────────── */}
        {transmission && (
          <div className="flex items-center gap-2.5 mb-4">
            <span
              className="text-[7.5px] font-bold uppercase shrink-0"
              style={{ letterSpacing: "0.16em", color: "rgba(255,255,255,0.28)" }}
            >
              Transmission
            </span>
            <div className="h-px w-4 shrink-0" style={{ background: "rgba(255,255,255,0.08)" }} />
            <p className="text-[11px] font-semibold tracking-wide" style={{ color, opacity: 0.88 }}>
              {transmission}
            </p>
          </div>
        )}

        {/* ── Watch bullets ─────────────────────────────────────────────── */}
        {(brief.trade_implication || brief.risk_scenario) && (
          <div className="mb-4">
            <span
              className="text-[7.5px] font-bold uppercase block mb-2"
              style={{ letterSpacing: "0.16em", color: "rgba(255,255,255,0.28)" }}
            >
              Watch
            </span>
            <div className="space-y-1.5">
              {brief.trade_implication && (
                <p
                  className="flex items-start gap-2 leading-relaxed"
                  style={{ fontSize: "11.5px", color: "rgba(255,255,255,0.72)" }}
                >
                  <span style={{ color, opacity: 0.72, flexShrink: 0, fontWeight: 600 }}>→</span>
                  {brief.trade_implication}
                </p>
              )}
              {brief.risk_scenario && (
                <p
                  className="flex items-start gap-2 leading-relaxed"
                  style={{ fontSize: "11.5px", color: "rgba(255,255,255,0.50)" }}
                >
                  <span style={{ color: "rgba(180,90,90,0.80)", flexShrink: 0, fontWeight: 600 }}>→</span>
                  {brief.risk_scenario}
                </p>
              )}
            </div>
          </div>
        )}

        {/* ── Cross-asset bar ───────────────────────────────────────────── */}
        {signals.length > 0 && (
          <div
            className="flex items-center gap-5 flex-wrap pt-3"
            style={{ borderTop: "1px solid rgba(255,255,255,0.055)" }}
          >
            {signals.map(s => (
              <div key={s.label} className="flex items-center gap-1.5">
                <span className="text-[8px] font-medium" style={{ color: "rgba(255,255,255,0.34)" }}>
                  {s.label}
                </span>
                <span className="text-[9.5px] font-bold" style={{ color: s.color }}>
                  {s.arrow}
                </span>
                <span className="text-[8.5px] font-semibold" style={{ color: s.color }}>
                  {s.value}
                </span>
              </div>
            ))}
          </div>
        )}

      </div>
    </motion.section>
  );
}


function MorningBriefingSkeleton() {
  return (
    <div
      className="relative overflow-hidden mb-8 rounded-lg"
      style={{
        background:   "rgba(6,11,26,0.95)",
        borderLeft:   "3px solid rgba(74,120,184,0.40)",
        borderTop:    "1px solid rgba(255,255,255,0.06)",
        borderRight:  "1px solid rgba(255,255,255,0.04)",
        borderBottom: "1px solid rgba(255,255,255,0.06)",
      }}
    >
      <div className="px-5 py-4 pl-6 space-y-3">
        <div className="flex items-center gap-3">
          <div className="h-2.5 w-20 rounded animate-pulse" style={{ background: "rgba(255,255,255,0.06)" }} />
          <div className="h-2.5 w-28 rounded animate-pulse" style={{ background: "rgba(255,255,255,0.05)" }} />
        </div>
        <div className="h-5 w-3/4 rounded animate-pulse" style={{ background: "rgba(255,255,255,0.07)" }} />
        <div className="h-4 w-full rounded animate-pulse" style={{ background: "rgba(255,255,255,0.05)" }} />
        <div className="h-4 w-2/3 rounded animate-pulse" style={{ background: "rgba(255,255,255,0.04)" }} />
        <div className="h-3 w-1/2 rounded animate-pulse" style={{ background: "rgba(255,255,255,0.035)" }} />
        <div className="flex gap-4 pt-2">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-2.5 w-14 rounded animate-pulse" style={{ background: "rgba(255,255,255,0.04)" }} />
          ))}
        </div>
      </div>
    </div>
  );
}
