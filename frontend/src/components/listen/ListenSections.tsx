"use client";

import { useMemo } from "react";
import { motion } from "framer-motion";
import { TickerChip } from "@/components/common/TickerChip";
import { EpisodeCard } from "./EpisodeCard";
import { confColor } from "@/app/markets/marketsShared";
import {
  narrativeRotation, highestConviction, crowdedNarratives, wallStreetMissing,
  mostDiscussedCompanies, sectorsGaining, firmsDriving, influentialEpisodes,
  mostReferencedPeople, mostReferencedFunds, companyThemeHeatmap, proprietarySignals,
} from "@/lib/listenSections";
import type { Episode, ThemeIntelligence } from "@/lib/types";
import type { ThemeEpisodeGroup } from "@/lib/listenIntelligence";

/**
 * ListenSections — the Listen page organized by INVESTMENT QUESTIONS, not podcast
 * category. Each section answers one allocator question with its own visualization
 * (diverging bars, ranked list, table, leaderboard, company/sector bars, episode
 * list). Reuses the page's existing tokens / colours / type — synthesis changes,
 * style does not. Modular: every section is an independent export.
 */

const GREEN = "#10B981", RED = "#EF4444", AMBER = "#F59E0B", CYAN = "#52b0c8", PURPLE = "#8B5CF6", BLUE = "#2563EB", TEAL = "#0891B2";
const dirArrow = (d: number) => d > 0 ? "↑" : d < 0 ? "↓" : "→";
const dirColor = (d: number) => d > 0 ? GREEN : d < 0 ? RED : "#94A3B8";
type ThemeClick = (t: ThemeIntelligence) => void;

function SectionHeader({ title, accent, hint }: { title: string; accent: string; hint?: string }) {
  return (
    <div className="flex items-center gap-2.5 mb-3.5">
      <div className="h-3 w-[3px] rounded-full shrink-0" style={{ background: accent }} />
      <h2 className="text-[13px] font-bold text-ink">{title}</h2>
      {hint && <span className="text-2xs text-ink-muted hidden sm:inline">{hint}</span>}
      <span className="h-px flex-1 bg-edge" />
    </div>
  );
}
function Section({ children }: { children: React.ReactNode }) {
  return (
    <motion.section initial={{ opacity: 0, y: 10 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-50px" }}
      transition={{ duration: 0.35, ease: [0.22, 0, 0.36, 1] }} className="mb-9">{children}</motion.section>
  );
}
function Empty() { return <p className="text-[10.5px] italic text-ink-faint">Insufficient signal</p>; }

// Shared bar row — label (optionally clickable) + bar + value.
function BarRow({ label, pct, color, value, valueColor, onClick, delay = 0 }: {
  label: React.ReactNode; pct: number; color: string; value: string; valueColor?: string; onClick?: () => void; delay?: number;
}) {
  const body = (
    <>
      <span className="text-[11px] font-medium w-40 shrink-0 truncate text-ink-secondary group-hover/row:text-ink transition-colors text-left">{label}</span>
      <div className="flex-1 h-[7px] rounded-full overflow-hidden" style={{ background: "rgba(0,0,0,0.05)" }}>
        <motion.div className="h-full rounded-full" style={{ background: color }}
          initial={{ width: 0 }} whileInView={{ width: `${Math.max(6, pct)}%` }} viewport={{ once: true }}
          transition={{ delay, duration: 0.6, ease: "easeOut" }} />
      </div>
      <span className="text-[11px] font-bold tabular-nums w-12 text-right shrink-0" style={{ color: valueColor ?? color }}>{value}</span>
    </>
  );
  return onClick
    ? <button onClick={onClick} className="w-full flex items-center gap-3 group/row">{body}</button>
    : <div className="flex items-center gap-3 group/row">{body}</div>;
}

// ── Proprietary synthesis signals — single-stat institutional widgets ─────────
export function ProprietarySignals({ groups, episodes, episodeThemeMap }: { groups: ThemeEpisodeGroup[]; episodes: Episode[]; episodeThemeMap: Map<string, ThemeIntelligence[]> }) {
  const signals = useMemo(() => proprietarySignals(groups, episodes, episodeThemeMap), [groups, episodes, episodeThemeMap]);
  if (!signals.length) return null;
  return (
    <Section>
      <SectionHeader title="Proprietary signals" accent={PURPLE} hint="synthesis you can't get from Spotify" />
      <div className="rounded-2xl border border-edge bg-surface overflow-hidden grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-px" style={{ background: "rgb(var(--edge))" }}>
        {signals.map(s => {
          const empty = !s.value || s.value === "—";
          return (
            <div key={s.label} className="bg-surface px-3.5 py-3">
              <p className="text-[8px] font-bold uppercase tracking-[0.11em] text-ink-muted mb-1.5 leading-tight">{s.label}</p>
              {empty ? <p className="text-[10.5px] italic text-ink-faint">Insufficient signal</p> : <>
                <p className="text-[13px] font-bold text-ink leading-tight truncate" style={{ color: s.color }}>{s.value}</p>
                {s.sub && <p className="text-[9px] text-ink-muted mt-0.5 truncate">{s.sub}</p>}
              </>}
            </div>
          );
        })}
      </div>
    </Section>
  );
}

// ── Narrative rotation — what's rotating in vs out (movers · velocity) ─────────
function RotationCol({ label, color, rows, onThemeClick, sign }: { label: string; color: string; rows: ReturnType<typeof narrativeRotation>["inflow"]; onThemeClick: ThemeClick; sign: 1 | -1 }) {
  const max = Math.max(1, ...rows.map(r => Math.abs(r.delta)));
  return (
    <div>
      <SectionHeader title={label} accent={color} />
      <div className="rounded-2xl border border-edge bg-surface p-4 space-y-2">
        {rows.length ? rows.map((r, i) => (
          <BarRow key={r.theme.id} label={r.name} pct={(Math.abs(r.delta) / max) * 100} color={color}
            value={`${sign > 0 ? "▲ +" : "▼ "}${r.delta}`} valueColor={color} onClick={() => onThemeClick(r.theme)} delay={i * 0.05} />
        )) : <Empty />}
      </div>
    </div>
  );
}
export function NarrativeRotation({ groups, onThemeClick }: { groups: ThemeEpisodeGroup[]; onThemeClick: ThemeClick }) {
  const { inflow, outflow } = useMemo(() => narrativeRotation(groups), [groups]);
  if (!inflow.length && !outflow.length) return null;
  return (
    <Section>
      <div className="grid sm:grid-cols-2 gap-3.5">
        <RotationCol label="Rotating in — largest increase" color={GREEN} rows={inflow} onThemeClick={onThemeClick} sign={1} />
        <RotationCol label="Rotating out — largest drop" color={RED} rows={outflow} onThemeClick={onThemeClick} sign={-1} />
      </div>
    </Section>
  );
}

// ── Q3 · Highest-conviction ideas — table ─────────────────────────────────────
export function HighestConviction({ groups, onThemeClick }: { groups: ThemeEpisodeGroup[]; onThemeClick: ThemeClick }) {
  const rows = useMemo(() => highestConviction(groups), [groups]);
  if (!rows.length) return null;
  return (
    <Section>
      <SectionHeader title="What are the highest-conviction ideas?" accent={TEAL} hint="strongest views across the tape" />
      <div className="rounded-2xl border border-edge bg-surface overflow-hidden">
        <div className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-x-4 px-4 py-2 border-b border-edge text-[8px] font-bold uppercase tracking-[0.12em] text-ink-faint">
          <span>Theme</span><span className="text-center">Dir</span><span className="text-right">Conv</span><span className="text-right hidden sm:block">Momentum</span><span className="text-right">Mentions</span>
        </div>
        {rows.map(r => (
          <button key={r.theme.id} onClick={() => onThemeClick(r.theme)}
            className="w-full grid grid-cols-[1fr_auto_auto_auto_auto] gap-x-4 px-4 py-2 items-center text-left border-b border-edge/60 last:border-0 hover:bg-raised/40 transition-colors">
            <span className="text-[11.5px] font-medium truncate text-ink">{r.name}</span>
            <span className="text-[12px] font-bold text-center w-5" style={{ color: dirColor(r.direction) }}>{dirArrow(r.direction)}</span>
            <span className="text-[11px] font-bold tabular-nums text-right w-7" style={{ color: confColor(r.conviction) }}>{r.conviction}</span>
            <span className="text-[10px] text-right capitalize text-ink-muted hidden sm:block w-20 truncate">{r.momentum}</span>
            <span className="text-[11px] tabular-nums text-right text-ink-secondary w-8">{r.mentions}</span>
          </button>
        ))}
      </div>
    </Section>
  );
}

// ── Q4 + Q5 · Crowded vs Missing — two single-question panels, side by side ───
function StatList({ rows, color, metric, onThemeClick }: { rows: ReturnType<typeof crowdedNarratives>; color: string; metric: (r: ReturnType<typeof crowdedNarratives>[number]) => string; onThemeClick: ThemeClick }) {
  return (
    <div className="space-y-2.5">
      {rows.length ? rows.map(r => (
        <button key={r.theme.id} onClick={() => onThemeClick(r.theme)} className="w-full flex items-center gap-2 text-left group/row">
          <span className="text-[11.5px] font-medium flex-1 truncate text-ink-secondary group-hover/row:text-ink transition-colors">{r.name}</span>
          <span className="text-[9.5px] tabular-nums shrink-0" style={{ color }}>{metric(r)}</span>
          <span className="text-[10.5px] font-bold tabular-nums shrink-0 w-6 text-right" style={{ color: confColor(r.conviction) }}>{r.conviction}</span>
        </button>
      )) : <Empty />}
    </div>
  );
}
export function CrowdedAndMissing({ groups, onThemeClick }: { groups: ThemeEpisodeGroup[]; onThemeClick: ThemeClick }) {
  const crowded = useMemo(() => crowdedNarratives(groups), [groups]);
  const missing = useMemo(() => wallStreetMissing(groups), [groups]);
  return (
    <Section>
      <div className="grid sm:grid-cols-2 gap-3.5">
        <div>
          <SectionHeader title="Which narratives are becoming crowded?" accent={AMBER} />
          <div className="rounded-2xl border border-edge bg-surface p-4">
            <StatList rows={crowded} color={AMBER} metric={r => `${r.shows} desks`} onThemeClick={onThemeClick} />
          </div>
        </div>
        <div>
          <SectionHeader title="What is Wall Street missing?" accent={CYAN} />
          <div className="rounded-2xl border border-edge bg-surface p-4">
            <StatList rows={missing} color={CYAN} metric={r => `${r.mentions} mention${r.mentions !== 1 ? "s" : ""}`} onThemeClick={onThemeClick} />
          </div>
        </div>
      </div>
    </Section>
  );
}

// ── Most discussed companies & sectors — bar leaderboards side by side ────────
export function CompaniesAndSectors({ groups, episodes }: { groups: ThemeEpisodeGroup[]; episodes: Episode[] }) {
  const companies = useMemo(() => mostDiscussedCompanies(episodes), [episodes]);
  const sectors   = useMemo(() => sectorsGaining(groups), [groups]);
  const cMax = Math.max(1, ...companies.map(c => c.count));
  const sMax = Math.max(1, ...sectors.map(s => s.count));
  return (
    <Section>
      <div className="grid lg:grid-cols-2 gap-x-8 gap-y-6">
        <div>
          <SectionHeader title="Most discussed companies" accent={GREEN} />
          <div className="rounded-2xl border border-edge bg-surface p-4 space-y-2">
            {companies.length ? companies.map((c, i) => (
              <div key={c.ticker} className="flex items-center gap-3">
                <span className="w-14 shrink-0"><TickerChip ticker={c.ticker} size="md" color="#475569" /></span>
                <div className="flex-1 h-[7px] rounded-full overflow-hidden" style={{ background: "rgba(0,0,0,0.05)" }}>
                  <motion.div className="h-full rounded-full" style={{ background: CYAN }}
                    initial={{ width: 0 }} whileInView={{ width: `${Math.max(6, (c.count / cMax) * 100)}%` }} viewport={{ once: true }} transition={{ delay: i * 0.04, duration: 0.6 }} />
                </div>
                <span className="text-[11px] font-bold tabular-nums w-6 text-right shrink-0 text-ink-muted">{c.count}</span>
              </div>
            )) : <Empty />}
          </div>
        </div>
        <div>
          <SectionHeader title="Most discussed sectors" accent={PURPLE} />
          <div className="rounded-2xl border border-edge bg-surface p-4 space-y-2">
            {sectors.length ? sectors.map((s, i) => (
              <BarRow key={s.sector} label={s.sector} pct={(s.count / sMax) * 100} color={PURPLE} value={`${s.count}`} valueColor="rgba(120,120,140,0.9)" delay={i * 0.04} />
            )) : <Empty />}
          </div>
        </div>
      </div>
    </Section>
  );
}

// ── Most referenced CEOs / voices & funds — two leaderboards ──────────────────
export function PeopleAndFunds({ episodes }: { episodes: Episode[] }) {
  const people = useMemo(() => mostReferencedPeople(episodes), [episodes]);
  const funds  = useMemo(() => mostReferencedFunds(episodes), [episodes]);
  if (!people.length && !funds.length) return null;
  return (
    <Section>
      <div className="grid sm:grid-cols-2 gap-3.5">
        <div>
          <SectionHeader title="Most referenced CEOs & voices" accent={BLUE} />
          <div className="rounded-2xl border border-edge bg-surface p-4 space-y-2.5">
            {people.length ? people.map((p, i) => (
              <div key={p.name} className="flex items-center gap-2.5">
                <span className="text-[11px] font-black tabular-nums w-4 text-ink-faint shrink-0">{i + 1}</span>
                <span className="text-[11.5px] font-medium flex-1 truncate text-ink">{p.name}</span>
                <span className="text-[10px] tabular-nums shrink-0 text-ink-muted">{p.count} mention{p.count !== 1 ? "s" : ""}</span>
              </div>
            )) : <Empty />}
          </div>
        </div>
        <div>
          <SectionHeader title="Most referenced funds" accent={AMBER} />
          <div className="rounded-2xl border border-edge bg-surface p-4 space-y-2.5">
            {funds.length ? funds.map((f, i) => (
              <div key={f.ticker} className="flex items-center gap-2.5">
                <span className="text-[11px] font-black tabular-nums w-4 text-ink-faint shrink-0">{i + 1}</span>
                <span className="shrink-0"><TickerChip ticker={f.ticker} size="md" color="#475569" /></span>
                <span className="flex-1" />
                <span className="text-[10px] tabular-nums shrink-0 text-ink-muted">{f.count} mention{f.count !== 1 ? "s" : ""}</span>
              </div>
            )) : <Empty />}
          </div>
        </div>
      </div>
    </Section>
  );
}

// ── Company × theme heatmap ───────────────────────────────────────────────────
export function CompanyHeatmap({ groups, episodes }: { groups: ThemeEpisodeGroup[]; episodes: Episode[] }) {
  const hm = useMemo(() => companyThemeHeatmap(groups, episodes), [groups, episodes]);
  if (hm.companies.length === 0 || hm.themes.length === 0) return null;
  const short = (s: string) => s.length > 14 ? s.slice(0, 13) + "…" : s;
  return (
    <Section>
      <SectionHeader title="Company mention heatmap" accent={CYAN} hint="which names show up under which narratives" />
      <div className="rounded-2xl border border-edge bg-surface p-4 overflow-x-auto">
        <div className="inline-grid gap-1" style={{ gridTemplateColumns: `56px repeat(${hm.themes.length}, minmax(56px,1fr))` }}>
          <span />
          {hm.themes.map(t => <span key={t} title={t} className="text-[8px] font-bold text-ink-faint text-center self-end pb-1 leading-tight">{short(t)}</span>)}
          {hm.companies.map((co, ci) => (
            <HeatRow key={co} ticker={co} row={hm.cells[ci]} max={hm.max} />
          ))}
        </div>
      </div>
    </Section>
  );
}
function HeatRow({ ticker, row, max }: { ticker: string; row: number[]; max: number }) {
  return (
    <>
      <span className="self-center"><TickerChip ticker={ticker} size="sm" color="#475569" /></span>
      {row.map((v, i) => (
        <div key={i} className="h-7 rounded flex items-center justify-center" title={`${v}`}
          style={{ background: v === 0 ? "rgba(0,0,0,0.03)" : `rgba(82,176,200,${0.14 + (v / max) * 0.66})` }}>
          {v > 0 && <span className="text-[9px] font-bold tabular-nums" style={{ color: v / max > 0.5 ? "#fff" : "rgba(40,60,80,0.8)" }}>{v}</span>}
        </div>
      ))}
    </>
  );
}

// ── Q8 · Which firms are driving the conversation? — leaderboard ──────────────
export function FirmsDriving({ episodes, episodeThemeMap }: { episodes: Episode[]; episodeThemeMap: Map<string, ThemeIntelligence[]> }) {
  const sources = useMemo(() => firmsDriving(episodes, episodeThemeMap), [episodes, episodeThemeMap]);
  if (!sources.length) return null;
  return (
    <Section>
      <SectionHeader title="Which firms are driving today's conversation?" accent={AMBER} hint="source influence by reach & signal" />
      <div className="rounded-2xl border border-edge bg-surface overflow-hidden">
        <div className="grid grid-cols-[auto_1fr_auto_auto_auto] gap-x-4 px-4 py-2 border-b border-edge text-[8px] font-bold uppercase tracking-[0.12em] text-ink-faint">
          <span>#</span><span>Source</span><span className="text-right">Eps</span><span className="text-right hidden sm:block">Avg Rel</span><span className="text-right">Themes</span>
        </div>
        {sources.map((s, i) => (
          <div key={s.show} className="grid grid-cols-[auto_1fr_auto_auto_auto] gap-x-4 px-4 py-2 items-center border-b border-edge/60 last:border-0">
            <span className="text-[11px] font-black tabular-nums w-4 text-ink-faint">{i + 1}</span>
            <span className="text-[11.5px] font-semibold truncate text-ink">{s.show}</span>
            <span className="text-[11px] tabular-nums text-right w-6 text-ink-secondary">{s.episodes}</span>
            <span className="text-[11px] tabular-nums text-right w-10 hidden sm:block" style={{ color: confColor(s.avgRelevance) }}>{s.avgRelevance}</span>
            <span className="text-[11px] tabular-nums text-right w-8 text-ink-secondary">{s.themes}</span>
          </div>
        ))}
      </div>
    </Section>
  );
}

// ── Supporting · the highest-signal conversations (keeps play / save) ─────────
export function InfluentialEpisodes({ episodes, episodeThemeMap, whyListenMap, savedIds, onSave, onPlay, onThemeClick }: {
  episodes: Episode[]; episodeThemeMap: Map<string, ThemeIntelligence[]>; whyListenMap: Map<string, string>;
  savedIds: string[]; onSave: (ep: Episode) => void; onPlay: (ep: Episode) => void; onThemeClick: ThemeClick;
}) {
  const eps = useMemo(() => influentialEpisodes(episodes, episodeThemeMap), [episodes, episodeThemeMap]);
  if (!eps.length) return null;
  return (
    <Section>
      <SectionHeader title="Which conversations should I hear today?" accent={BLUE} hint="each read as an investment note, not a podcast tile" />
      <div className="grid sm:grid-cols-2 gap-3 items-start">
        {eps.map((ep, i) => (
          <EpisodeCard key={ep.id} episode={ep} variant="grid" index={i}
            isSaved={savedIds.includes(ep.id)} onSave={() => onSave(ep)} onPlay={onPlay}
            matchedThemes={episodeThemeMap.get(ep.id)} whyListen={whyListenMap.get(ep.id)} onThemeClick={onThemeClick}
            allEpisodes={episodes} episodeThemeMap={episodeThemeMap} />
        ))}
      </div>
    </Section>
  );
}
