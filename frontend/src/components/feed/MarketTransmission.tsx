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

// Connector between chain links. Self-centers so it sits beside the values
// regardless of the (taller) theme step.
function Arrow() {
  return <span className="shrink-0 self-center text-[16px] font-light leading-none" style={{ color: "rgba(255,255,255,0.26)" }}>→</span>;
}

// One labelled link in the Driver → Theme → Sector → Expressions chain.
function ChainStep({ label, labelColor, children }: { label: string; labelColor?: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0 flex flex-col justify-center">
      <span className="text-[8px] font-bold uppercase tracking-[0.18em] mb-1"
        style={{ color: labelColor ?? "rgba(255,255,255,0.38)" }}>{label}</span>
      {children}
    </div>
  );
}

function TransmissionCard({ chain, rank, onSelect }: { chain: Chain; rank: number; onSelect?: (id: string) => void }) {
  const { theme, driver, sector, tickers, conviction, momentum, confirmations, direction } = chain;
  const accent     = DIR_COLOR[direction];
  const convC      = confColor(conviction);
  const momColor   = momentum > 0 ? "#34d399" : momentum < 0 ? "#f87171" : "rgba(255,255,255,0.5)";
  const momArrow   = momentum > 0 ? "▲" : momentum < 0 ? "▼" : "→";
  const clusterId  = (theme.contributing_cluster_ids ?? [])[0];

  return (
    <motion.button
      type="button"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: rank * 0.05, ease: [0.22, 0, 0.36, 1] }}
      whileHover={{ y: -1, transition: { duration: 0.15 } }}
      onClick={() => clusterId && onSelect?.(clusterId)}
      className="group w-full text-left rounded-xl overflow-hidden flex items-stretch cursor-pointer
                 border border-white/[0.07] bg-[#111827] transition-colors duration-150
                 hover:bg-[#151d30] hover:border-white/[0.14]"
    >
      {/* direction accent rail */}
      <div className="w-[3px] shrink-0 transition-all group-hover:w-[4px]" style={{ background: accent }} />

      {/* the explicit chain: DRIVER → THEME → SECTOR → EXPRESSIONS */}
      <div className="flex-1 min-w-0 px-5 py-4">
        <div className="flex items-stretch gap-3.5 sm:gap-5 flex-wrap">

          <ChainStep label="Driver">
            <span className="text-[12.5px] sm:text-[13px] font-semibold leading-tight" style={{ color: "rgba(255,255,255,0.62)" }}>{driver}</span>
          </ChainStep>

          <Arrow />

          <ChainStep label="Theme" labelColor={accent}>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[21px] sm:text-[24px] font-black tracking-[-0.01em] leading-[1.04] break-words"
                style={{ color: "rgba(255,255,255,0.98)" }}>
                {cleanThemeName(theme.name)}
              </span>
              <span className="text-[8px] font-bold uppercase tracking-[0.12em] px-1.5 py-0.5 rounded leading-none shrink-0"
                style={{ color: accent, background: `${accent}1e` }}>
                {direction === "bullish" ? "Risk-On" : direction === "bearish" ? "Risk-Off" : "Mixed"}
              </span>
            </div>
          </ChainStep>

          <Arrow />

          <ChainStep label="Sector">
            <span className="text-[12.5px] sm:text-[13px] font-semibold leading-tight" style={{ color: "rgba(255,255,255,0.8)" }}>{sector}</span>
          </ChainStep>

          <Arrow />

          <ChainStep label="Expressions">
            <span className="text-[13px] sm:text-[13.5px] font-bold tabular-nums tracking-tight leading-tight whitespace-nowrap"
              style={{ color: accent }}>
              {tickers.join("  •  ")}
            </span>
          </ChainStep>
        </div>
      </div>

      {/* metrics rail — conviction dominant, momentum strong, confirms secondary */}
      <div className="shrink-0 flex items-center gap-5 sm:gap-6 px-5 sm:px-6 py-4 border-l"
        style={{ borderColor: "rgba(255,255,255,0.07)", background: "rgba(255,255,255,0.018)" }}>
        {/* Conviction — the single most prominent number on the card */}
        <div className="flex flex-col items-end">
          <span className="text-[34px] sm:text-[40px] font-black tabular-nums leading-[0.9]" style={{ color: convC }}>
            {convScore(conviction)}
          </span>
          <span className="text-[8px] font-bold uppercase tracking-[0.18em] mt-1" style={{ color: "rgba(255,255,255,0.42)" }}>Conviction</span>
        </div>

        {/* Momentum — strengthened with arrow + tinted pill */}
        <div className="flex flex-col items-end">
          <span className="text-[15px] sm:text-[16px] font-black tabular-nums leading-none px-2 py-1 rounded-md"
            style={{ color: momColor, background: `${momColor}1f` }}>
            {momArrow} {momentum > 0 ? "+" : ""}{Math.round(momentum)}
          </span>
          <span className="text-[8px] font-bold uppercase tracking-[0.18em] mt-1" style={{ color: "rgba(255,255,255,0.42)" }}>Momentum</span>
          <span className="text-[8.5px] font-medium tabular-nums mt-0.5" style={{ color: "rgba(255,255,255,0.4)" }}>
            {confirmations} {confirmations === 1 ? "confirmation" : "confirmations"}
          </span>
        </div>
      </div>

      {/* clickable affordance */}
      <div className="shrink-0 flex items-center pr-3 pl-0.5">
        <span className="text-[17px] leading-none text-white/25 transition-all group-hover:text-white/55 group-hover:translate-x-0.5">›</span>
      </div>
    </motion.button>
  );
}

function TransmissionSkeleton() {
  return (
    <div className="space-y-2.5" aria-hidden>
      {[0, 1, 2].map(i => (
        <div key={i} className="h-[90px] rounded-xl animate-pulse"
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
