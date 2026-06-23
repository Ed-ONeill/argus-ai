"use client";

import { useMemo } from "react";
import { motion } from "framer-motion";
import type { ThemeIntelligence, MarketBrief } from "@/lib/types";
import { cleanThemeName, cleanMacroLabel, confColor, convScore } from "@/app/markets/marketsShared";
import { themeBeneficiaries } from "@/lib/themeIntelligence";

/**
 * MarketTransmission — the Feed hero.
 *
 * Replaces the old Market Narrative Network graph. Instead of an AI-style node
 * cloud that has to be interpreted, this answers the one question that should be
 * instant on open: *what is transmitting through the market right now?* — as a
 * dense Driver → Theme → Sector → Companies board with conviction, momentum, and
 * confirmation counts. Pure read of existing theme_intelligence; no new data.
 *
 * It is the explanation layer between the markets engine and the feed below it;
 * the IntelligenceStrip (sectors / today's changes / leaders) stays underneath
 * and answers "what is the market state beneath that transmission?".
 */

interface MarketTransmissionProps {
  themes:     ThemeIntelligence[];
  brief?:     MarketBrief | null;
  regime?:    string;          // short regime label for the header
  isLoading?: boolean;
  onSelect?:  (clusterId: string) => void;   // scroll the feed to the theme's lead story
}

interface Chain {
  theme:         ThemeIntelligence;
  driver:        string;
  sector:        string;
  tickers:       string[];
  conviction:    number;
  momentum:      number;
  confirmations: number;
  direction:     "bullish" | "bearish" | "neutral";
}

const DIR_COLOR: Record<Chain["direction"], string> = {
  bullish: "#34d399",
  bearish: "#f87171",
  neutral: "#94a3b8",
};

// Upstream macro driver: prefer the causal-narrative head, fall back to the
// theme's first related macro factor. Always a real stored value, never invented.
function deriveDriver(t: ThemeIntelligence): string {
  const cn = t.causal_narrative ?? "";
  if (cn.includes("→")) {
    const head = cn.split("→").map(s => s.trim()).filter(Boolean)[0];
    if (head && head.length > 2) return cleanMacroLabel(head);
  }
  const macro = (t.related_macro_factors ?? [])[0];
  return macro ? cleanMacroLabel(macro) : "Macro backdrop";
}

// The sector the theme lands on: first positively-weighted industry, else the first.
function deriveSector(t: ThemeIntelligence): string | null {
  const inds = t.related_industries ?? [];
  return inds.find(s => t.relationship_weights?.[s]?.direction === "positive") ?? inds[0] ?? null;
}

function buildChains(themes: ThemeIntelligence[]): Chain[] {
  return [...themes]
    .sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0))
    .map<Chain | null>(t => {
      const sector  = deriveSector(t);
      const tickers = themeBeneficiaries(t, 3);
      if (!sector || tickers.length === 0) return null;   // only complete chains
      return {
        theme:         t,
        driver:        deriveDriver(t),
        sector,
        tickers,
        conviction:    t.confidence ?? 0,
        momentum:      t.momentum_delta ?? 0,
        confirmations: t.memory?.confirmations_today || t.evidence_count || t.contributing_story_count || 0,
        direction:
          t.momentum_direction === "bullish" ? "bullish" :
          t.momentum_direction === "bearish" ? "bearish" : "neutral",
      };
    })
    .filter((c): c is Chain => c !== null)
    .slice(0, 3);
}

// ── Sub-components ──────────────────────────────────────────────────────────────

function Arrow() {
  return <span className="shrink-0 text-[15px] font-light leading-none" style={{ color: "rgba(255,255,255,0.22)" }}>→</span>;
}

function Metric({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="flex flex-col items-end">
      <span className="text-[19px] font-black tabular-nums leading-none" style={{ color: color ?? "rgba(255,255,255,0.92)" }}>{value}</span>
      <span className="text-[8px] font-bold uppercase tracking-[0.13em] mt-1" style={{ color: "rgba(255,255,255,0.4)" }}>{label}</span>
    </div>
  );
}

function TransmissionCard({ chain, rank, onSelect }: { chain: Chain; rank: number; onSelect?: (id: string) => void }) {
  const { theme, driver, sector, tickers, conviction, momentum, confirmations, direction } = chain;
  const accent     = DIR_COLOR[direction];
  const convC      = confColor(conviction);
  const momColor   = momentum > 0 ? "#34d399" : momentum < 0 ? "#f87171" : "rgba(255,255,255,0.45)";
  const clusterId  = (theme.contributing_cluster_ids ?? [])[0];

  return (
    <motion.button
      type="button"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: rank * 0.05, ease: [0.22, 0, 0.36, 1] }}
      onClick={() => clusterId && onSelect?.(clusterId)}
      className="group w-full text-left rounded-xl overflow-hidden flex items-stretch transition-colors"
      style={{ background: "#111827", border: "1px solid rgba(255,255,255,0.06)" }}
    >
      {/* direction accent rail */}
      <div className="w-[3px] shrink-0" style={{ background: accent }} />

      {/* the chain: Driver → Theme → Sector → Companies */}
      <div className="flex-1 min-w-0 px-4 py-3.5">
        {/* headline: theme name, the most important element */}
        <div className="flex items-center gap-2 mb-2 flex-wrap">
          <span className="text-[15px] sm:text-[16px] font-black tracking-tight leading-none break-words"
            style={{ color: "rgba(255,255,255,0.96)" }}>
            {cleanThemeName(theme.name)}
          </span>
          <span className="text-[8px] font-bold uppercase tracking-[0.12em] px-1.5 py-0.5 rounded leading-none shrink-0"
            style={{ color: accent, background: `${accent}1e` }}>
            {direction === "bullish" ? "Risk-On" : direction === "bearish" ? "Risk-Off" : "Mixed"}
          </span>
        </div>

        {/* the transmission chain */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[11px] font-semibold" style={{ color: "rgba(255,255,255,0.55)" }}>{driver}</span>
          <Arrow />
          <span className="text-[11px] font-semibold" style={{ color: "rgba(255,255,255,0.7)" }}>{sector}</span>
          <Arrow />
          <span className="flex items-center gap-1">
            {tickers.map(tk => (
              <span key={tk} className="text-[10.5px] font-bold tabular-nums px-1.5 py-0.5 rounded"
                style={{ color: accent, background: `${accent}14`, border: `1px solid ${accent}30` }}>{tk}</span>
            ))}
          </span>
        </div>
      </div>

      {/* metrics rail */}
      <div className="shrink-0 flex items-center gap-5 px-5 py-3.5 border-l"
        style={{ borderColor: "rgba(255,255,255,0.06)", background: "rgba(255,255,255,0.015)" }}>
        <Metric label="Conviction" value={`${convScore(conviction)}`} color={convC} />
        <Metric label="Momentum" value={`${momentum > 0 ? "+" : ""}${Math.round(momentum)}`} color={momColor} />
        <Metric label="Confirms" value={`${confirmations}`} />
      </div>
    </motion.button>
  );
}

function TransmissionSkeleton() {
  return (
    <div className="space-y-2.5" aria-hidden>
      {[0, 1, 2].map(i => (
        <div key={i} className="h-[72px] rounded-xl animate-pulse"
          style={{ background: "#111827", border: "1px solid rgba(255,255,255,0.05)" }} />
      ))}
    </div>
  );
}

// ── Main ────────────────────────────────────────────────────────────────────────

export function MarketTransmission({ themes, brief, regime, isLoading, onSelect }: MarketTransmissionProps) {
  const chains = useMemo(() => buildChains(themes), [themes]);

  if (!isLoading && chains.length === 0) return null;

  const regimeLabel = regime || brief?.market_regime || "";
  const avgConv = chains.length
    ? Math.round(chains.reduce((s, c) => s + c.conviction, 0) / chains.length)
    : 0;

  return (
    <section className="max-w-5xl mx-auto px-4 sm:px-6 pt-5">
      {/* header */}
      <div className="flex items-center gap-3 mb-3">
        <span className="w-[3px] h-4 rounded-full shrink-0" style={{ background: "#52b0c8" }} />
        <span className="text-[12px] font-black uppercase tracking-[0.14em]" style={{ color: "rgba(255,255,255,0.92)" }}>
          Today&apos;s Transmission
        </span>
        <span className="text-[9px] font-medium hidden sm:inline" style={{ color: "rgba(255,255,255,0.45)" }}>
          what is driving markets right now
        </span>
        <span className="h-px flex-1" style={{ background: "rgba(255,255,255,0.07)" }} />
        {regimeLabel && (
          <span className="text-[9.5px] font-bold uppercase tracking-[0.08em] shrink-0" style={{ color: "rgba(255,255,255,0.6)" }}>
            {regimeLabel}
          </span>
        )}
        {!isLoading && avgConv > 0 && (
          <span className="text-[9.5px] font-bold tabular-nums shrink-0" style={{ color: confColor(avgConv) }}>
            Conv {convScore(avgConv)}
          </span>
        )}
      </div>

      {isLoading
        ? <TransmissionSkeleton />
        : (
          <div className="space-y-2.5">
            {chains.map((c, i) => (
              <TransmissionCard key={c.theme.id} chain={c} rank={i} onSelect={onSelect} />
            ))}
          </div>
        )}
    </section>
  );
}
