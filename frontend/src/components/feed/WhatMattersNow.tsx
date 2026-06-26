"use client";

import { motion } from "framer-motion";
import { catColor } from "@/lib/utils";
import { classifyImpact } from "@/lib/types";
import { transmissionPath, themeWatch } from "@/lib/themeTransmission";
import { cleanThemeName } from "@/app/markets/marketsShared";
import type { WhatMattersNowItem, ThemeIntelligence } from "@/lib/types";

/**
 * WhatMattersNow — the explanation layer for the Argus Market Map.
 *
 * Each card decodes one live signal into a scannable transmission read:
 * theme · conviction · market impact · driver→sector path · affected tickers ·
 * why it matters · what to watch. Reuses the map's transmission derivations so
 * the two sections speak the same language. Concise, dense, non-repetitive.
 */

interface WhatMattersNowProps {
  items:            WhatMattersNowItem[];
  isLoading:        boolean;
  themes?:          ThemeIntelligence[];
  marketIntensity?: number;
}

const CAT_DARK: Record<string, string> = {
  "#2563EB": "#4f8cf0", "#7C3AED": "#a07cf0", "#DC2626": "#f87171",
  "#0891B2": "#38bdf8", "#D97706": "#fbbf24",
};
const mutedColor = (hex: string): string => CAT_DARK[hex] ?? "#7e8db0";
const pressureColor = (score: number, base: string): string => score >= 78 ? base : score >= 52 ? "#fbbf24" : "#64748b";

const DIR = {
  bullish: { label: "Risk-On",  color: "#34d399" },
  bearish: { label: "Risk-Off", color: "#f87171" },
  mixed:   { label: "Mixed",    color: "#fbbf24" },
} as const;
type Dir = keyof typeof DIR;

function buildThemeMap(items: WhatMattersNowItem[], themes: ThemeIntelligence[]): Record<string, ThemeIntelligence> {
  const map: Record<string, ThemeIntelligence> = {};
  if (!themes.length) return map;
  for (const item of items) {
    const matched = themes
      .filter(t => t.contributing_cluster_ids.includes(item.cluster.id))
      .sort((a, b) => b.confidence - a.confidence);
    if (matched.length) map[item.cluster.id] = matched[0];
  }
  return map;
}

function directionOf(item: WhatMattersNowItem, theme?: ThemeIntelligence): Dir {
  if (theme) return theme.momentum_direction === "bullish" ? "bullish" : theme.momentum_direction === "bearish" ? "bearish" : "mixed";
  const s = classifyImpact(item.cluster.primary.impact ?? "");
  return s === "bullish" ? "bullish" : s === "bearish" ? "bearish" : "mixed";
}

export function WhatMattersNow({ items, isLoading, themes, marketIntensity }: WhatMattersNowProps) {
  if (isLoading) return <WhatMattersNowSkeleton />;
  if (!items.length) return null;

  const top = items.slice(0, 6);
  const themeMap = buildThemeMap(top, themes ?? []);
  const pulseDur = marketIntensity ? Math.max(2.2, 3.0 - (marketIntensity - 0.38) * 1.4) : 3.0;

  const scrollToCluster = (id: string) => {
    const el = document.querySelector(`[data-cluster-id="${id}"]`);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  return (
    <section className="mb-9">
      <div className="flex items-center gap-3 mb-3">
        <div className="flex items-center gap-2 shrink-0">
          <motion.span className="w-2 h-2 rounded-full shrink-0" style={{ background: "rgba(180,140,70,0.72)" }}
            animate={{ opacity: [1, 0.35, 1] }} transition={{ duration: pulseDur, repeat: Infinity, ease: "easeInOut" }} />
          <span className="text-[11px] font-semibold uppercase" style={{ letterSpacing: "0.08em", color: "rgba(255,255,255,0.62)" }}>What Matters Now</span>
        </div>
        <span className="text-[9px] font-medium hidden sm:inline" style={{ color: "rgba(255,255,255,0.36)" }}>the map, decoded</span>
        <div className="flex-1 h-px" style={{ background: "linear-gradient(to right, rgba(255,255,255,0.09), transparent)" }} />
        <span className="text-[9.5px] font-medium shrink-0" style={{ letterSpacing: "0.08em", color: "rgba(255,255,255,0.5)" }}>Signal Pressure</span>
      </div>

      {/* Mobile: horizontal scroll; desktop: dense grid */}
      <div className="flex gap-2.5 overflow-x-auto pb-2 snap-x snap-mandatory md:hidden -mx-1 px-1">
        {top.map((item, i) => <SignalCard key={item.cluster.id} item={item} index={i} theme={themeMap[item.cluster.id]} onClick={() => scrollToCluster(item.cluster.id)} mobile />)}
      </div>
      <div className="hidden md:grid grid-cols-2 lg:grid-cols-3 gap-2.5">
        {top.map((item, i) => <SignalCard key={item.cluster.id} item={item} index={i} theme={themeMap[item.cluster.id]} onClick={() => scrollToCluster(item.cluster.id)} />)}
      </div>
    </section>
  );
}

function SignalCard({ item, index, theme, onClick, mobile }: { item: WhatMattersNowItem; index: number; theme?: ThemeIntelligence; onClick: () => void; mobile?: boolean }) {
  const p = item.cluster.primary;
  const color = mutedColor(catColor(p.category));
  const signal = Math.round(p.signal_score ?? 0);
  const barColor = pressureColor(signal, color);
  const dir = directionOf(item, theme);
  const dc = DIR[dir];
  const conviction = Math.round(theme?.confidence ?? signal);

  const name = theme ? cleanThemeName(theme.name) : item.wmn_label;
  const path = theme ? transmissionPath(theme) : { driver: p.category, sector: null, tickers: [] };
  const why = item.thesis || theme?.causal_narrative || "";
  const watch = theme ? themeWatch(theme) : null;

  return (
    <motion.button
      initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index, 6) * 0.05, duration: 0.3, ease: [0.22, 0, 0.36, 1] }}
      whileHover={{ y: -1, transition: { duration: 0.16 } }}
      onClick={onClick}
      className={`relative overflow-hidden text-left flex flex-col rounded-[10px] snap-start ${mobile ? "w-[250px] flex-shrink-0" : ""}`}
      style={{ background: "#0d1322", borderTop: "1px solid rgba(255,255,255,0.06)", borderRight: "1px solid rgba(255,255,255,0.045)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}
    >
      <span className="absolute left-0 top-0 bottom-0 w-[2.5px]" style={{ background: dc.color, opacity: 0.28 + (signal / 100) * 0.5 }} />
      <div className="absolute inset-0 pointer-events-none" style={{ background: `radial-gradient(ellipse at left top, ${dc.color}0e 0%, transparent 58%)` }} />

      <div className="relative pl-4 pr-3.5 pt-3 pb-3 flex flex-col gap-2">
        {/* theme + conviction */}
        <div className="flex items-start gap-2">
          <span className="text-[13.5px] font-bold leading-snug line-clamp-2 flex-1 min-w-0" style={{ color: "rgba(255,255,255,0.9)" }}>{name}</span>
          <span className="shrink-0 flex flex-col items-end leading-none">
            <span className="text-[16px] font-black tabular-nums" style={{ color: pressureColor(conviction, color) }}>{conviction}</span>
            <span className="text-[7px] font-bold uppercase tracking-wider mt-0.5" style={{ color: "rgba(255,255,255,0.34)" }}>Conviction</span>
          </span>
        </div>

        {/* market impact + signal pressure */}
        <div className="flex items-center gap-2">
          <span className="text-[8.5px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded shrink-0" style={{ color: dc.color, background: `${dc.color}1a` }}>{dc.label}</span>
          <div className="flex-1 h-[2px] rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.06)" }}>
            <motion.div className="h-full rounded-full" initial={{ width: 0 }} animate={{ width: `${signal}%` }} transition={{ duration: 0.7, ease: "easeOut", delay: 0.15 }} style={{ background: barColor }} />
          </div>
          <span className="text-[9.5px] font-bold tabular-nums shrink-0" style={{ color: barColor }}>{signal}</span>
        </div>

        {/* transmission path */}
        <div className="flex items-center gap-1.5 flex-wrap text-[10px] leading-none">
          <span className="text-[7px]" style={{ color: dc.color }}>◆</span>
          <span className="font-semibold truncate max-w-[110px]" style={{ color: "rgba(255,255,255,0.62)" }} title={path.driver}>{path.driver}</span>
          {path.sector && <>
            <span style={{ color: "rgba(255,255,255,0.28)" }}>→</span>
            <span className="font-semibold" style={{ color: "rgba(255,255,255,0.74)" }}>{path.sector}</span>
          </>}
        </div>

        {/* affected tickers */}
        {path.tickers.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {path.tickers.map(tk => (
              <span key={tk} className="text-[9.5px] font-mono font-bold px-1 py-px rounded" style={{ color: dc.color, background: `${dc.color}14` }}>{tk}</span>
            ))}
          </div>
        )}

        {/* why */}
        {why && <p className="text-[10.5px] leading-snug line-clamp-2" style={{ color: "rgba(255,255,255,0.52)" }}>{why}</p>}

        {/* what to watch */}
        {watch && (
          <p className="text-[9.5px] leading-snug flex items-start gap-1" style={{ color: "rgba(255,255,255,0.42)" }}>
            <span className="font-bold uppercase tracking-wide shrink-0" style={{ color: `${dc.color}c0` }}>Watch</span>
            <span className="truncate">{watch}</span>
          </p>
        )}
      </div>
    </motion.button>
  );
}

function WhatMattersNowSkeleton() {
  return (
    <section className="mb-9">
      <div className="flex items-center gap-3 mb-3">
        <div className="h-2.5 w-32 rounded animate-pulse" style={{ background: "rgba(255,255,255,0.06)" }} />
        <div className="flex-1 h-px" style={{ background: "rgba(255,255,255,0.04)" }} />
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-2.5">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="relative overflow-hidden rounded-[10px]" style={{ background: "rgba(8,12,22,0.9)" }}>
            <div className="absolute left-0 top-0 bottom-0 w-[2.5px] animate-pulse" style={{ background: "rgba(74,120,184,0.3)" }} />
            <div className="pl-4 pr-3.5 py-3 space-y-2">
              <div className="h-3.5 w-3/4 rounded animate-pulse" style={{ background: "rgba(255,255,255,0.05)" }} />
              <div className="h-[2px] w-full rounded-full animate-pulse" style={{ background: "rgba(255,255,255,0.05)" }} />
              <div className="h-2.5 w-2/3 rounded animate-pulse" style={{ background: "rgba(255,255,255,0.05)" }} />
              <div className="h-2.5 w-full rounded animate-pulse" style={{ background: "rgba(255,255,255,0.04)" }} />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
