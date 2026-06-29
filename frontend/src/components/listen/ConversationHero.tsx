"use client";

import { motion } from "framer-motion";
import { TickerChip } from "@/components/common/TickerChip";
import { cleanThemeName, confColor } from "@/app/markets/marketsShared";
import type { ThemeEpisodeGroup } from "@/lib/listenIntelligence";

/**
 * ConversationHero — the Listen page's institutional hero.
 *
 * Reframes "what the financial world is discussing today" as intelligence: the
 * single most-discussed theme (volume · momentum · consensus · confidence ·
 * companies · sectors) plus a horizontal "Conversation Momentum" ranking of the
 * week's hottest discussions. Built on Argus semantic tokens so it matches the
 * page it lives on and the rest of the platform. Subtle motion only.
 */

const DIRECTION: Record<string, { label: string; color: string }> = {
  bullish: { label: "Bullish", color: "#10B981" },
  bearish: { label: "Bearish", color: "#EF4444" },
  neutral: { label: "Mixed",   color: "#94A3B8" },
};

const BAR = "#52b0c8";

function Metric({ label, value, color, sub }: { label: string; value: string; color?: string; sub?: string }) {
  return (
    <div className="px-3.5 first:pl-0">
      <p className="text-[8.5px] font-bold uppercase tracking-[0.13em] text-ink-muted mb-1">{label}</p>
      <p className="text-[17px] font-black tabular-nums leading-none" style={{ color: color ?? "rgb(var(--ink))" }}>{value}</p>
      {sub && <p className="text-[9px] font-medium text-ink-muted mt-1 capitalize">{sub}</p>}
    </div>
  );
}

interface Props {
  groups:       ThemeEpisodeGroup[];   // ranked by discussion volume (matchCount)
  onThemeClick: (theme: ThemeEpisodeGroup["theme"]) => void;
}

export function ConversationHero({ groups, onThemeClick }: Props) {
  if (groups.length === 0) return null;

  const lead   = groups[0];
  const t      = lead.theme;
  const dir    = DIRECTION[t.momentum_direction] ?? DIRECTION.neutral;
  const conf   = Math.round(t.confidence ?? 0);
  const delta  = Math.round(t.momentum_delta ?? 0);
  const deltaColor = delta > 0 ? "#10B981" : delta < 0 ? "#EF4444" : "#94A3B8";
  const companies = (t.related_assets ?? []).filter(a => /^[A-Z][A-Z.]{0,5}$/.test(a)).slice(0, 5);
  const sectors   = (t.related_industries ?? []).slice(0, 3);
  const maxVol    = Math.max(1, ...groups.map(g => g.matchCount));

  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.32, ease: [0.22, 0, 0.36, 1] }}
      className="mb-8"
    >
      {/* Signature eyebrow */}
      <div className="flex items-center gap-2.5 mb-2.5">
        <span className="relative flex h-2 w-2 shrink-0">
          <span className="tg-live-dot absolute inline-flex h-full w-full rounded-full" style={{ background: BAR }} />
          <span className="relative inline-flex h-2 w-2 rounded-full" style={{ background: BAR }} />
        </span>
        <span className="text-[11px] font-black uppercase tracking-[0.14em] text-ink">Today&apos;s Most Discussed</span>
        <span className="text-[9px] font-medium text-ink-muted hidden sm:inline">what the financial world is discussing</span>
        <span className="h-px flex-1 bg-edge" />
        <span className="text-[9.5px] font-semibold text-ink-muted shrink-0">{groups.length} themes tracked</span>
      </div>

      <div className="grid lg:grid-cols-5 gap-3.5">
        {/* Lead theme — the conversation's center of gravity */}
        <button
          onClick={() => onThemeClick(t)}
          className="lg:col-span-3 text-left rounded-2xl border border-edge bg-surface p-5 hover:border-edge-strong transition-all duration-200 hover:shadow-card-hover group"
        >
          <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-ink-muted mb-2">Leading the conversation</p>
          <h2 className="text-[22px] sm:text-[26px] font-black leading-[1.04] tracking-tight text-ink group-hover:text-navy transition-colors mb-4">
            {cleanThemeName(t.name)}
          </h2>

          {/* Metric strip — volume · momentum · consensus · confidence */}
          <div className="flex items-stretch divide-x divide-edge mb-4">
            <Metric label="Podcasts" value={String(lead.matchCount)} sub={lead.matchCount === 1 ? "episode" : "episodes"} />
            <Metric label="Momentum" value={`${delta > 0 ? "▲" : delta < 0 ? "▼" : "▪"} ${delta > 0 ? "+" : ""}${delta}`} color={deltaColor} sub={t.momentum_label} />
            <Metric label="Consensus" value={dir.label} color={dir.color} />
            <Metric label="Confidence" value={String(conf)} color={confColor(conf)} />
          </div>

          {/* Companies + sectors */}
          <div className="flex flex-col gap-2.5">
            {companies.length > 0 && (
              <div className="flex items-center gap-2.5">
                <span className="text-[8.5px] font-bold uppercase tracking-[0.13em] text-ink-muted w-16 shrink-0">Companies</span>
                <div className="flex flex-wrap gap-x-2.5 gap-y-1">
                  {companies.map(c => <TickerChip key={c} ticker={c} size="md" color="#475569" />)}
                </div>
              </div>
            )}
            {sectors.length > 0 && (
              <div className="flex items-center gap-2.5">
                <span className="text-[8.5px] font-bold uppercase tracking-[0.13em] text-ink-muted w-16 shrink-0">Sectors</span>
                <div className="flex flex-wrap gap-1.5">
                  {sectors.map(s => (
                    <span key={s} className="tg-chip text-[10px] font-medium px-1.5 py-0.5 rounded leading-none"
                      style={{ background: "rgba(82,176,200,0.08)", color: "rgba(82,176,200,0.85)" }}>{s}</span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </button>

        {/* Conversation Momentum — the week's hottest discussions by volume */}
        <div className="lg:col-span-2 rounded-2xl border border-edge bg-surface p-5">
          <div className="flex items-center gap-2 mb-4">
            <span className="text-[9px] font-bold uppercase tracking-[0.14em] text-ink-muted">Conversation Momentum</span>
            <span className="h-px flex-1 bg-edge" />
            <span className="text-[8.5px] text-ink-faint">this week</span>
          </div>
          <div className="space-y-2.5">
            {groups.map((g, i) => {
              const w = Math.round((g.matchCount / maxVol) * 100);
              return (
                <button key={g.theme.id} onClick={() => onThemeClick(g.theme)} className="w-full flex items-center gap-2.5 group/row">
                  <span className="text-[10.5px] font-medium w-28 shrink-0 truncate text-left text-ink-secondary group-hover/row:text-ink transition-colors">
                    {cleanThemeName(g.theme.name)}
                  </span>
                  <div className="flex-1 h-[7px] rounded-full overflow-hidden" style={{ background: "rgba(0,0,0,0.05)" }}>
                    <motion.div className="h-full rounded-full" style={{ background: BAR, opacity: 1 - i * 0.14 }}
                      initial={{ width: 0 }} animate={{ width: `${Math.max(6, w)}%` }}
                      transition={{ delay: 0.15 + i * 0.07, duration: 0.7, ease: [0.22, 0, 0.36, 1] }} />
                  </div>
                  <span className="text-[10px] font-bold tabular-nums w-4 text-right shrink-0 text-ink-muted">{g.matchCount}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </motion.section>
  );
}
