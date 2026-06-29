"use client";

import { motion } from "framer-motion";
import { buildCollectiveIntel, type IntelWidget } from "@/lib/listenConsensus";
import type { Episode, ThemeIntelligence } from "@/lib/types";
import type { ThemeEpisodeGroup } from "@/lib/listenIntelligence";

/**
 * IntelligenceLayer — the collective read across every podcast. Summarizes the
 * conversation (consensus, most bullish/bearish theme, fastest narrative, most-
 * mentioned company/sector/voice/macro) plus a Wall Street Consensus card on the
 * leading conviction theme. Argus light tokens, restrained motion, no clutter.
 */

function Widget({ w }: { w: IntelWidget }) {
  return (
    <div className="px-3.5 py-3">
      <p className="text-[8px] font-bold uppercase tracking-[0.12em] text-ink-muted mb-1.5 leading-tight">{w.label}</p>
      <p className="text-[13px] font-bold text-ink leading-tight truncate" style={{ color: w.color }}>{w.value}</p>
      {w.sub && <p className="text-[9.5px] text-ink-muted mt-0.5 truncate">{w.sub}</p>}
    </div>
  );
}

interface Props {
  episodes: Episode[];
  themes:   ThemeIntelligence[];
  groups:   ThemeEpisodeGroup[];
}

export function IntelligenceLayer({ episodes, themes, groups }: Props) {
  const intel = buildCollectiveIntel(episodes, themes, groups);
  if (!intel) return null;
  const { consensus: c, widgets, wallStreet: ws } = intel;

  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.05 }}
      className="mb-8"
    >
      {/* Eyebrow — the question this section answers */}
      <div className="flex items-center gap-2.5 mb-2.5">
        <span className="text-[11px] font-black uppercase tracking-[0.14em] text-ink">What Wall Street Is Talking About</span>
        <span className="text-[9px] font-medium text-ink-muted hidden sm:inline">synthesized across every podcast</span>
        <span className="h-px flex-1 bg-edge" />
        <span className="text-[9.5px] font-semibold text-ink-muted shrink-0">{c.podcastCount} conversations</span>
      </div>

      <div className="grid lg:grid-cols-5 gap-3.5">
        {/* Left — consensus + widget grid */}
        <div className="lg:col-span-3 rounded-2xl border border-edge bg-surface overflow-hidden">
          {/* Conversation Consensus strip */}
          <div className="flex items-center gap-3.5 px-4 py-3 border-b border-edge flex-wrap">
            <span className="text-[9px] font-bold uppercase tracking-[0.14em] text-ink-muted shrink-0">Conversation Consensus</span>
            <span className="text-[17px] font-black tabular-nums leading-none shrink-0" style={{ color: c.color }}>{c.pct}%</span>
            <span className="text-[10px] font-bold uppercase tracking-wide shrink-0" style={{ color: c.color }}>{c.label}</span>
            <div className="flex-1 min-w-[80px] h-1.5 rounded-full overflow-hidden flex" style={{ background: "rgba(239,68,68,0.18)" }}>
              <motion.div className="h-full" style={{ background: "#10B981" }}
                initial={{ width: 0 }} animate={{ width: `${c.pct}%` }} transition={{ duration: 1.1, ease: [0.22, 0, 0.36, 1] }} />
            </div>
            <span className="text-[9.5px] text-ink-muted shrink-0 hidden sm:inline">{c.themeCount} themes</span>
          </div>
          {/* Widget grid — hairline-separated research cells */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-px" style={{ background: "rgb(var(--edge))" }}>
            {widgets.map((w, i) => (
              <motion.div key={w.label} className="bg-surface"
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 + i * 0.03, duration: 0.25 }}>
                <Widget w={w} />
              </motion.div>
            ))}
          </div>
        </div>

        {/* Right — Wall Street Consensus */}
        {ws && (
          <div className="lg:col-span-2 rounded-2xl border border-edge bg-surface p-5 flex flex-col">
            <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-ink-muted mb-2.5">Wall Street Consensus</p>
            <h3 className="text-[19px] font-black leading-[1.08] tracking-tight text-ink mb-3">{ws.theme}</h3>
            <div className="flex items-baseline gap-2.5 mb-4">
              <span className="text-[24px] font-black tabular-nums leading-none" style={{ color: ws.direction === "Bullish" ? "#10B981" : "#EF4444" }}>{ws.pct}%</span>
              <span className="text-[11px] font-bold uppercase tracking-wide" style={{ color: ws.direction === "Bullish" ? "#10B981" : "#EF4444" }}>{ws.direction}</span>
              <span className="text-[11px] font-semibold text-ink-muted ml-auto">{ws.podcasts} Podcasts</span>
            </div>
            <p className="text-[8px] font-bold uppercase tracking-[0.14em] text-ink-faint mb-2">Discussed On</p>
            <div className="flex flex-wrap gap-1.5 mt-auto">
              {ws.shows.map(s => (
                <span key={s} className="tg-chip text-[10px] font-medium px-2 py-0.5 rounded-full border border-edge text-ink-secondary bg-raised/40 truncate max-w-[120px]">{s}</span>
              ))}
            </div>
          </div>
        )}
      </div>
    </motion.section>
  );
}
