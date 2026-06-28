"use client";

import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, ExternalLink, Bookmark, BookmarkCheck, Radio, ArrowRight, AlertTriangle } from "lucide-react";
import { catColor, timeAgo } from "@/lib/utils";
import { classifyImpact } from "@/lib/types";
import { transmissionPath, dirOf, themeWatch } from "@/lib/themeTransmission";
import { themeBeneficiaries, generateNextCatalysts, generateThesis, generateBullBearCases } from "@/lib/themeIntelligence";
import { Beam, useBeam } from "@/lib/feedHighlight";
import { TickerChip } from "@/components/common/TickerChip";
import { cleanThemeName } from "@/app/markets/marketsShared";
import type { StoryCluster, FeedItem, ThemeIntelligence, RelatedStory } from "@/lib/types";

/**
 * IntelligenceStream — the Live Market Stream re-imagined as a living intelligence
 * report, NOT a feed of identical news cards. Each event renders at a different
 * visual weight depending on signal:
 *
 *   • Tier 1 → Lead Dossier: a vertical intelligence report (Macro Event →
 *     Transmission Chain → Affected Sectors/Companies → Market Impact →
 *     Supporting Articles → Contradictory Signals → Prediction → Probability
 *     Changes → Institutional Watch), expandable for the deep blocks.
 *   • Tier 2 → Transmission Row: one compact horizontal line (event · chain ·
 *     impact · tickers · source).
 *   • Tier 3 → Signal Cluster: the long tail grouped into one dense block.
 *
 * Scrolling moves through heterogeneous blocks, not endless headlines. Pure reads
 * of stored fields + existing theme-intelligence derivations.
 */

const GREEN = "#34d399", RED = "#f87171", AMBER = "#fbbf24", SLATE = "#8ea3c4", CYAN = "#52b0c8";
const dirColor = (d: string) => d === "bullish" ? GREEN : d === "bearish" ? RED : AMBER;
const dirArrow = (d: string) => d === "bullish" ? "↑" : d === "bearish" ? "↓" : "↕";

function stripDir(s?: string | null): string {
  return (s ?? "").replace(/^(bullish|bearish|mixed)[:\s–—-]*/i, "").trim();
}
// The market implication — the "so what" that leads each entry. Prefers the
// stored impact read, falls back to a composed transmission consequence.
function implicationOf(item: FeedItem, sector: string | null, driver: string, dir: string): string {
  const raw = stripDir(item.impact);
  if (raw.length > 10) return raw;
  const where = sector ?? driver;
  return dir === "bullish" ? `Tailwind for ${where} — capital rotating toward the most exposed names.`
    : dir === "bearish" ? `Pressure on ${where} — the exposed names carry downgrade risk.`
    : `Crosscurrents in ${where} — positioning rotating faster than the narrative resolves.`;
}

interface Props {
  clusters:         StoryCluster[];
  themes?:          ThemeIntelligence[];
  savedIds:         string[];
  onSave:           (item: FeedItem) => void;
  newIds?:          Set<string>;
  watchedEntities?: Set<string>;
  isLoading:        boolean;
}

function matchTheme(cluster: StoryCluster, themes?: ThemeIntelligence[]): ThemeIntelligence | undefined {
  if (!themes?.length) return undefined;
  const byId = themes.find(t => (t.contributing_cluster_ids ?? []).includes(cluster.id));
  if (byId) return byId;
  const hay = [cluster.primary.title, ...(cluster.primary.affected_entities ?? [])].join(" ").toLowerCase();
  let best: ThemeIntelligence | undefined, bestScore = 0;
  for (const t of themes) {
    const words = [...(t.related_macro_factors ?? []), ...(t.related_industries ?? []), t.name]
      .flatMap(s => s.toLowerCase().split(/\W+/).filter(w => w.length >= 6));
    const score = words.filter(w => hay.includes(w)).length;
    if (score > bestScore) { bestScore = score; best = t; }
  }
  return bestScore >= 1 ? best : undefined;
}

function tierOf(cluster: StoryCluster, isWatched: boolean): 1 | 2 | 3 {
  const score = Math.round(cluster.primary.signal_score);
  const strength = cluster.primary.signal_strength;
  if (score >= 75) return 1;
  if ((strength === "weak" || score < 40) && !isWatched) return 3;
  return 2;
}

const isWatchedCluster = (c: StoryCluster, w?: Set<string>) =>
  !!w && (c.primary.affected_entities ?? []).some(e => w.has(e.toLowerCase()));

export function IntelligenceStream({ clusters, themes, savedIds, onSave, newIds, watchedEntities, isLoading }: Props) {
  const rows = useMemo(() => clusters.map(c => {
    const watched = isWatchedCluster(c, watchedEntities);
    return { cluster: c, theme: matchTheme(c, themes), tier: tierOf(c, watched), watched };
  }), [clusters, themes, watchedEntities]);

  if (isLoading) {
    return <div className="space-y-2.5">{[...Array(5)].map((_, i) => <BlockSkeleton key={i} delay={i * 0.05} />)}</div>;
  }
  if (!clusters.length) {
    return (
      <div className="py-16 text-center">
        <p className="text-sm" style={{ color: "rgba(255,255,255,0.38)" }}>No stories match the current view.</p>
        <p className="text-xs mt-1" style={{ color: "rgba(255,255,255,0.24)" }}>Select a different node or category above.</p>
      </div>
    );
  }

  // Tier-3 long tail is grouped into a single clustered block at the end.
  const tail = rows.filter(r => r.tier === 3);
  const body = rows.filter(r => r.tier !== 3);
  let dossiers = 0;

  return (
    <div className="space-y-4">
      {body.map(({ cluster, theme, tier, watched }) => {
        // Cap full dossiers so the report stays varied; extra tier-1s become rows.
        const asDossier = tier === 1 && theme && dossiers < 3;
        if (asDossier) dossiers++;
        return asDossier ? (
          <LeadDossier key={cluster.id} cluster={cluster} theme={theme!} watchedEntities={watchedEntities}
            isSaved={savedIds.includes(cluster.id)} onSave={() => onSave(cluster.primary)} isNew={newIds?.has(cluster.id)} />
        ) : (
          <TransmissionRow key={cluster.id} cluster={cluster} theme={theme} watched={watched} watchedEntities={watchedEntities}
            isSaved={savedIds.includes(cluster.id)} onSave={() => onSave(cluster.primary)} isNew={newIds?.has(cluster.id)} />
        );
      })}
      {tail.length > 0 && <ClusteredTail rows={tail} />}
    </div>
  );
}

// ── Lead Dossier — the full vertical intelligence report ──────────────────────
function LeadDossier({ cluster, theme, isSaved, onSave, isNew, watchedEntities }: {
  cluster: StoryCluster; theme: ThemeIntelligence; isSaved: boolean; onSave: () => void; isNew?: boolean; watchedEntities?: Set<string>;
}) {
  const [expanded, setExpanded] = useState(false);
  const item = cluster.primary;
  const dir = dirOf(theme);
  const dc = dirColor(dir);
  const score = Math.round(item.signal_score);
  const path = transmissionPath(theme);
  const companies = [...new Set([...(item.affected_entities ?? []), ...themeBeneficiaries(theme, 4)])].slice(0, 8);
  const sectors = (theme.related_industries ?? []).slice(0, 4);
  const related = [...cluster.related].sort((a, b) => (b.published_ts ?? "").localeCompare(a.published_ts ?? ""));
  const cases = generateBullBearCases(theme);
  const cats = generateNextCatalysts(theme);
  const catalyst = cats.find(c => c.direction === "confirming") ?? cats[0] ?? null;
  const mem = theme.memory;
  const isBreaking = item.signal_strength === "strong" && /^(\d+)(m|h)/.test(item.published ?? "");
  // Shared context tokens — hovering anything in this dossier lights the matching
  // theme / sector / driver / company across the whole page (and the graph nodes).
  const ctx: (string | null)[] = [cleanThemeName(theme.name), path.sector, path.driver];
  const strengthening = theme.momentum_label === "accelerating" || theme.momentum_label === "strengthening";

  return (
    <motion.article
      data-cluster-id={cluster.id}
      initial={isNew ? { opacity: 0, x: -8 } : { opacity: 0, y: 6 }} animate={{ opacity: 1, x: 0, y: 0 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      className="relative overflow-hidden pl-1"
      style={{ background: "linear-gradient(110deg, rgba(20,28,46,0.32), transparent 60%)", borderLeft: `3px solid ${dc}` }}
    >
      {/* Conviction glow on the accent — pulses while the theme is strengthening */}
      {strengthening && <div aria-hidden className="tg-glow absolute left-0 top-0 bottom-0 w-[3px] pointer-events-none" style={{ background: dc, boxShadow: `0 0 12px ${dc}` }} />}
      {/* One-shot transmission wave when this event is newly arrived */}
      {isNew && <div aria-hidden className="tg-wave absolute inset-y-0 w-1/3 pointer-events-none z-10" style={{ background: `linear-gradient(to right, transparent, ${dc}24, transparent)` }} />}

      {/* Block 1 — Signal-led header: the theme + market read are the headline;
          the news story is demoted to a supporting source line. */}
      <div className="relative px-4 pt-3.5 pb-3.5 border-b" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
        <div className="absolute inset-0 pointer-events-none" style={{ background: `radial-gradient(ellipse at left top, ${dc}0e, transparent 60%)` }} />
        <div className="relative flex items-center gap-2 mb-2">
          <span className="w-1.5 h-1.5 rounded-full" style={{ background: dc, boxShadow: `0 0 8px ${dc}` }} />
          <span className="text-[8px] font-black uppercase tracking-[0.16em]" style={{ color: dc }}>{dir === "bullish" ? "Risk-On Signal" : dir === "bearish" ? "Risk-Off Signal" : "Crosscurrent"}</span>
          <span className="text-[8px] font-semibold uppercase tracking-wide" style={{ color: "rgba(255,255,255,0.4)" }}>· {theme.momentum_label}</span>
          {isBreaking && (
            <span className="inline-flex items-center gap-1 text-[8px] font-bold" style={{ color: RED }}>
              <motion.span animate={{ opacity: [1, 0.3, 1] }} transition={{ duration: 1.4, repeat: Infinity }}><Radio size={7} /></motion.span>LIVE
            </span>
          )}
          <span className="ml-auto text-[8px] font-bold tabular-nums" style={{ color: "rgba(255,255,255,0.5)" }}>CV {Math.round(theme.confidence ?? 0)}</span>
          <button onClick={onSave} className="p-1 rounded transition-colors shrink-0" style={{ color: isSaved ? CYAN : "rgba(255,255,255,0.4)" }}>
            {isSaved ? <BookmarkCheck size={13} /> : <Bookmark size={13} />}
          </button>
        </div>
        <div className="relative flex items-start gap-3.5">
          <div className="shrink-0 flex flex-col items-center pt-0.5">
            <span className="text-[27px] font-black tabular-nums leading-none" style={{ color: dc }}>{score}</span>
            <span className="text-[7px] font-bold uppercase tracking-wider mt-0.5" style={{ color: "rgba(255,255,255,0.36)" }}>Signal</span>
          </div>
          <div className="min-w-0 flex-1">
            <Beam tokens={[cleanThemeName(theme.name), ...ctx]} className="text-[16px] font-black leading-tight tracking-[-0.01em] block" style={{ color: "rgba(255,255,255,0.96)" }}>{cleanThemeName(theme.name)}</Beam>
            <p className="text-[12.5px] leading-snug mt-1 font-medium" style={{ color: "rgba(255,255,255,0.84)" }}>{implicationOf(item, path.sector, path.driver, dir)}</p>
            <a href={item.url} target="_blank" rel="noopener noreferrer" className="mt-1.5 flex items-start gap-1.5 hover:opacity-90 transition-opacity" style={{ color: "rgba(255,255,255,0.42)" }}>
              <span className="text-[10px] font-medium shrink-0 uppercase tracking-wide opacity-70">{item.source}</span>
              <span className="text-[10.5px] leading-snug line-clamp-1">{item.title}</span>
              <ExternalLink size={9} className="opacity-40 shrink-0 mt-0.5" />
            </a>
          </div>
        </div>
      </div>

      {/* Block 2 — Transmission Chain (horizontal flow) */}
      <div className="px-4 py-3 border-b" style={{ borderColor: "rgba(255,255,255,0.05)" }}>
        <BlockLabel>Transmission Chain</BlockLabel>
        <div className="flex items-center gap-1.5 flex-wrap">
          <ChainNode label={path.driver} color={SLATE} tokens={[path.driver, ...ctx]} />
          <ArrowRight size={12} style={{ color: "rgba(255,255,255,0.3)" }} />
          <ChainNode label={cleanThemeName(theme.name)} color={dc} emphasis tokens={[cleanThemeName(theme.name), ...ctx]} />
          {path.sector && <><ArrowRight size={12} style={{ color: "rgba(255,255,255,0.3)" }} /><ChainNode label={path.sector} color={CYAN} tokens={[path.sector, ...ctx]} /></>}
          {companies.length > 0 && <><ArrowRight size={12} style={{ color: "rgba(255,255,255,0.3)" }} /><ChainNode label={`${companies.length} names`} color={dc} tokens={[...companies, ...ctx]} /></>}
        </div>
      </div>

      {/* Block 3 — Affected Sectors + Companies (two columns, separated by air) */}
      <div className="grid sm:grid-cols-2 gap-x-8 gap-y-3 px-4 py-3.5 border-b" style={{ borderColor: "rgba(255,255,255,0.05)" }}>
        <div>
          <BlockLabel>Affected Sectors</BlockLabel>
          <div className="flex flex-wrap gap-x-2.5 gap-y-1">
            {sectors.length ? sectors.map(s => (
              <Beam key={s} tokens={[s, ...ctx]} className="text-[10px] font-medium inline-block" style={{ color: dc }}>
                {dir === "bullish" ? "+ " : dir === "bearish" ? "− " : "→ "}{s}
              </Beam>
            )) : <Empty />}
          </div>
        </div>
        <div>
          <BlockLabel>Affected Companies</BlockLabel>
          <div className="flex flex-wrap gap-x-2.5 gap-y-1">
            {companies.length ? companies.map(c => (
              <Beam key={c} tokens={[c, ...ctx]}>
                <TickerChip ticker={c} size="md" color={watchedEntities?.has(c.toLowerCase()) ? CYAN : "rgba(255,255,255,0.7)"} className="!text-[10px]" />
              </Beam>
            )) : <Empty />}
          </div>
        </div>
      </div>

      {/* Block 4 — Conviction & confirmation (the strength behind the signal) */}
      <div className="px-4 py-2.5 border-b flex items-center gap-x-5 gap-y-1.5 flex-wrap" style={{ borderColor: "rgba(255,255,255,0.05)" }}>
        <ConvStat label="Conviction" value={`${Math.round(theme.confidence ?? 0)}`} color={dc} />
        <ConvStat label="Momentum" value={theme.momentum_label} color={dc} />
        {(theme.momentum_delta ?? 0) !== 0 && (
          <ConvStat label="Δ Cycle" value={`${(theme.momentum_delta ?? 0) > 0 ? "+" : ""}${Math.round(theme.momentum_delta ?? 0)}`} color={(theme.momentum_delta ?? 0) > 0 ? GREEN : RED} />
        )}
        <ConvStat label="Breadth" value={`${Math.round(theme.breadth_score ?? 0)}`} />
        {mem && mem.confirming_total > 0 && <ConvStat label="Confirmations" value={`${mem.confirming_total}`} color={GREEN} />}
      </div>

      {/* Expandable deep blocks */}
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div key="deep" initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.26, ease: "easeInOut" }} className="overflow-hidden">
            {/* Block 5 — Supporting Articles (timeline) */}
            {related.length > 0 && (
              <div className="px-4 py-3 border-b" style={{ borderColor: "rgba(255,255,255,0.05)" }}>
                <BlockLabel>Supporting Articles · {related.length}</BlockLabel>
                <div className="space-y-0">
                  {related.slice(0, 5).map((r, i) => <SupportRow key={r.id} story={r} last={i === Math.min(related.length, 5) - 1} tokens={ctx} />)}
                </div>
              </div>
            )}

            {/* Block 6 — Contradictory Signals (distinct red) */}
            <div className="px-4 py-3 border-b" style={{ borderColor: "rgba(255,255,255,0.05)", background: "rgba(239,68,68,0.03)" }}>
              <div className="flex items-center gap-1.5 mb-1.5">
                <AlertTriangle size={9} style={{ color: RED }} />
                <span className="text-[7.5px] font-bold uppercase tracking-[0.14em]" style={{ color: "rgba(248,113,113,0.85)" }}>Contradictory Signals</span>
                {mem && mem.contradicting_total > 0 && <span className="text-[8px] font-bold ml-auto" style={{ color: RED }}>{mem.contradictions_today > 0 ? `${mem.contradictions_today} today · ` : ""}{mem.contradicting_total} total</span>}
              </div>
              <p className="text-[11px] leading-snug" style={{ color: "rgba(255,255,255,0.62)" }}>
                {cases.bear || "No material counter-signal in the current evidence — confirmation is one-sided, which itself is a crowding risk."}
              </p>
            </div>

            {/* Block 7 — Prediction (emphasised) */}
            <div className="px-4 py-3 border-b" style={{ borderColor: "rgba(255,255,255,0.05)", borderLeft: `2px solid ${dc}` }}>
              <BlockLabel>Prediction</BlockLabel>
              <p className="text-[11.5px] leading-relaxed" style={{ color: "rgba(255,255,255,0.78)" }}>{generateThesis(theme)}</p>
              {catalyst && (
                <p className="text-[9.5px] mt-1.5 flex items-center gap-1.5" style={{ color: "rgba(255,255,255,0.46)" }}>
                  <span className="font-bold uppercase tracking-wide" style={{ color: `${dc}c0` }}>Test</span>
                  {catalyst.label} · {catalyst.dateLabel} ({catalyst.daysAway}d)
                </p>
              )}
            </div>

            {/* Block 8 — Probability Changes (conviction trend bar) */}
            <div className="px-4 py-3 border-b" style={{ borderColor: "rgba(255,255,255,0.05)" }}>
              <BlockLabel>Probability Changes</BlockLabel>
              <ProbabilityBar theme={theme} />
            </div>

            {/* Block 9 — Institutional Watch */}
            <div className="px-4 py-3" style={{ background: "rgba(82,176,200,0.04)" }}>
              <BlockLabel>Institutional Watch</BlockLabel>
              <p className="text-[11px] leading-snug" style={{ color: "rgba(255,255,255,0.64)" }}>
                Watch <b style={{ color: "rgba(255,255,255,0.82)" }}>{themeWatch(theme)}</b>. {mem?.lifecycle ? `Pattern: ${mem.lifecycle}.` : ""}
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Expand toggle */}
      <button onClick={() => setExpanded(e => !e)} className="w-full flex items-center justify-center gap-1.5 py-2 text-[10px] font-semibold transition-colors hover:bg-white/[0.03]"
        style={{ color: "rgba(255,255,255,0.5)", borderTop: "1px solid rgba(255,255,255,0.06)" }}>
        {expanded ? "Collapse dossier" : "Expand full intelligence"}
        <motion.span animate={{ rotate: expanded ? 180 : 0 }} transition={{ duration: 0.2 }} className="inline-flex"><ChevronDown size={11} /></motion.span>
      </button>
    </motion.article>
  );
}

// ── Transmission Row — compact horizontal block ───────────────────────────────
function TransmissionRow({ cluster, theme, watched, isSaved, onSave, isNew, watchedEntities }: {
  cluster: StoryCluster; theme?: ThemeIntelligence; watched: boolean; isSaved: boolean; onSave: () => void; isNew?: boolean; watchedEntities?: Set<string>;
}) {
  const item = cluster.primary;
  const color = catColor(item.category);
  const dir = theme ? dirOf(theme) : classifyImpact(item.impact ?? "");
  const dc = dirColor(dir);
  const score = Math.round(item.signal_score);
  const path = theme ? transmissionPath(theme) : { driver: item.category, sector: null as string | null, tickers: [] as string[] };
  const tickers = (item.affected_entities ?? []).slice(0, 3);
  const rowCtx: (string | null)[] = [path.driver, path.sector, theme ? cleanThemeName(theme.name) : null];

  return (
    <motion.article
      data-cluster-id={cluster.id}
      initial={isNew ? { opacity: 0, x: -8 } : { opacity: 0, y: 4 }} animate={{ opacity: 1, x: 0, y: 0 }} transition={{ duration: 0.22 }}
      whileHover={{ x: 2 }}
      className="group relative"
      style={{ borderLeft: `2px solid ${watched ? CYAN : dc}` }}
    >
      <div className="pl-3.5 pr-2 py-2.5 transition-colors group-hover:bg-white/[0.02]">
        {/* Row 1 — signal magnitude · propagation · conviction */}
        <div className="flex items-center gap-2.5 mb-1">
          <span className="flex items-baseline gap-0.5 shrink-0">
            <span className="text-[10px] font-bold" style={{ color: dc }}>{dirArrow(dir)}</span>
            <span className="text-[16px] font-black tabular-nums leading-none" style={{ color: dc }}>{score}</span>
          </span>
          <div className="flex items-center gap-1.5 min-w-0 flex-1">
            <Beam tokens={[path.driver, ...rowCtx]} className="text-[10px] font-medium truncate" title={path.driver} style={{ color: `${color}d8` }}>{path.driver}</Beam>
            {path.sector && <><span className="text-[9px]" style={{ color: "rgba(255,255,255,0.24)" }}>→</span><Beam tokens={[path.sector, ...rowCtx]} className="text-[10px] font-semibold shrink-0" style={{ color: "rgba(255,255,255,0.72)" }}>{path.sector}</Beam></>}
          </div>
          {theme && <span className="text-[9px] font-bold tabular-nums shrink-0" style={{ color: "rgba(255,255,255,0.5)" }}>CV {Math.round(theme.confidence ?? 0)}</span>}
          <button onClick={onSave} className="p-0.5 rounded shrink-0" style={{ color: isSaved ? CYAN : "rgba(255,255,255,0.32)" }}>
            {isSaved ? <BookmarkCheck size={11} /> : <Bookmark size={11} />}
          </button>
        </div>
        {/* Row 2 — the market implication (the read) */}
        <p className="text-[12px] font-medium leading-snug" style={{ color: "rgba(255,255,255,0.84)" }}>{implicationOf(item, path.sector, path.driver, dir)}</p>
        {/* Row 3 — affected assets + the news demoted to supporting context */}
        <div className="flex items-center gap-2 mt-1.5">
          {tickers.length > 0 && (
            <span className="flex items-center gap-2 shrink-0">
              {tickers.map(t => (
                <Beam key={t} tokens={[t, ...rowCtx]}>
                  <TickerChip ticker={t} size="sm" color={watchedEntities?.has(t.toLowerCase()) ? CYAN : "rgba(255,255,255,0.55)"} className="!text-[9px]" />
                </Beam>
              ))}
            </span>
          )}
          <a href={item.url} target="_blank" rel="noopener noreferrer" className="text-[10px] truncate flex-1 min-w-0 hover:opacity-90 transition-opacity" style={{ color: "rgba(255,255,255,0.4)" }}>
            <span className="opacity-70">{item.source}</span> · {item.title}
          </a>
          <span className="text-[8.5px] shrink-0" style={{ color: "rgba(255,255,255,0.3)" }}>{item.published}</span>
        </div>
      </div>
    </motion.article>
  );
}

// ── Clustered Tail — the long tail grouped into one dense block ────────────────
function ClusteredTail({ rows }: { rows: { cluster: StoryCluster; theme?: ThemeIntelligence }[] }) {
  const [open, setOpen] = useState(false);
  const shown = open ? rows : rows.slice(0, 6);
  return (
    <div className="pt-3 mt-1">
      <div className="flex items-center gap-2.5 mb-2">
        <span className="text-[8px] font-bold uppercase tracking-[0.18em]" style={{ color: "rgba(255,255,255,0.38)" }}>Also Moving</span>
        <span className="text-[8.5px] tabular-nums" style={{ color: "rgba(255,255,255,0.28)" }}>{rows.length} lower-signal</span>
        <div className="flex-1 h-px" style={{ background: "linear-gradient(to right, rgba(255,255,255,0.07), transparent)" }} />
      </div>
      <div className="grid sm:grid-cols-2 gap-x-8 gap-y-0.5">
        {shown.map(({ cluster: c, theme }) => (
          <TailItem key={c.id} cluster={c} theme={theme} />
        ))}
      </div>
      {rows.length > 6 && (
        <button onClick={() => setOpen(o => !o)} className="mt-2 text-[9.5px] font-semibold transition-colors hover:text-white" style={{ color: "rgba(255,255,255,0.44)" }}>
          {open ? "Show less" : `Show ${rows.length - 6} more →`}
        </button>
      )}
    </div>
  );
}

// ── Shared building blocks ────────────────────────────────────────────────────
function TailItem({ cluster, theme }: { cluster: StoryCluster; theme?: ThemeIntelligence }) {
  const color = catColor(cluster.primary.category);
  const tokens = [...(cluster.primary.affected_entities ?? []), theme ? cleanThemeName(theme.name) : null, cluster.primary.category];
  const { dimStyle, handlers } = useBeam(tokens);
  return (
    <a {...handlers} data-cluster-id={cluster.id} href={cluster.primary.url} target="_blank" rel="noopener noreferrer"
      className="flex items-baseline gap-2 py-1.5 min-w-0 transition-colors hover:bg-white/[0.02]" style={{ ...dimStyle }}>
      <span className="text-[10px] font-black tabular-nums shrink-0 w-5 text-right" style={{ color: "rgba(255,255,255,0.5)" }}>{Math.round(cluster.primary.signal_score)}</span>
      {(cluster.primary.affected_entities ?? [])[0] && (
        <TickerChip ticker={(cluster.primary.affected_entities ?? [])[0]} size="xs" color={`${color}c0`} className="shrink-0" />
      )}
      <span className="text-[10.5px] leading-tight truncate flex-1 min-w-0" style={{ color: "rgba(255,255,255,0.48)" }}>{cluster.primary.title}</span>
    </a>
  );
}

function BlockLabel({ children }: { children: React.ReactNode }) {
  return <p className="text-[7.5px] font-bold uppercase tracking-[0.14em] mb-1.5" style={{ color: "rgba(255,255,255,0.34)" }}>{children}</p>;
}

function ConvStat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <span className="flex items-baseline gap-1.5">
      <span className="text-[12.5px] font-black tabular-nums capitalize leading-none" style={{ color: color ?? "rgba(255,255,255,0.82)" }}>{value}</span>
      <span className="text-[7.5px] font-bold uppercase tracking-wider" style={{ color: "rgba(255,255,255,0.34)" }}>{label}</span>
    </span>
  );
}
function Empty() { return <span className="text-[9.5px]" style={{ color: "rgba(255,255,255,0.36)" }}>—</span>; }

function ChainNode({ label, color, emphasis, tokens }: { label: string; color: string; emphasis?: boolean; tokens?: (string | null | undefined)[] }) {
  return (
    <Beam tokens={tokens ?? [label]} className="text-[10px] font-semibold px-2 py-1 rounded-lg truncate max-w-[140px] inline-block"
      style={emphasis
        ? { color, background: `${color}1e`, border: `1px solid ${color}3a` }
        : { color: "rgba(255,255,255,0.7)", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}>
      {label}
    </Beam>
  );
}

function ProbabilityBar({ theme }: { theme: ThemeIntelligence }) {
  const mem = theme.memory;
  const from = mem ? mem.conviction_window_start : Math.max(0, Math.round((theme.confidence ?? 0) - (theme.momentum_delta ?? 0)));
  const to = mem ? mem.conviction_current : Math.round(theme.confidence ?? 0);
  const delta = to - from;
  const trend = mem?.conviction_trend ?? (delta > 0 ? "rising" : delta < 0 ? "falling" : "stable");
  const tc = trend === "rising" ? GREEN : trend === "falling" ? RED : SLATE;
  return (
    <div>
      <div className="flex items-center gap-2 mb-1.5">
        <span className="text-[12px] font-black tabular-nums" style={{ color: "rgba(255,255,255,0.5)" }}>{from}</span>
        <ArrowRight size={11} style={{ color: tc }} />
        <span className="text-[15px] font-black tabular-nums" style={{ color: tc }}>{to}</span>
        <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded ml-1" style={{ color: tc, background: `${tc}1a` }}>{trend} {delta > 0 ? `+${delta}` : delta}</span>
        {mem && <span className="text-[8.5px] ml-auto" style={{ color: "rgba(255,255,255,0.36)" }}>over {mem.sessions_observed} sessions</span>}
      </div>
      <div className="relative h-[3px] rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.07)" }}>
        <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${Math.max(3, Math.min(100, to))}%`, background: tc }} />
        <div className="absolute inset-y-0 w-px" style={{ left: `${Math.max(0, Math.min(100, from))}%`, background: "rgba(255,255,255,0.5)" }} />
      </div>
    </div>
  );
}

function SupportRow({ story, last, tokens }: { story: RelatedStory; last: boolean; tokens?: (string | null | undefined)[] }) {
  const dot = story.signal_strength === "strong" ? GREEN : story.signal_strength === "medium" ? AMBER : SLATE;
  return (
    <Beam tokens={tokens ?? []} className="flex items-start gap-2 py-1.5" style={!last ? { borderBottom: "1px solid rgba(255,255,255,0.04)" } : undefined}>
      <span className="w-1.5 h-1.5 rounded-full shrink-0 mt-[5px]" style={{ background: dot, opacity: 0.8 }} />
      <a href={story.url} target="_blank" rel="noopener noreferrer" className="text-[11px] leading-snug line-clamp-1 flex-1 hover:opacity-80 transition-opacity" style={{ color: "rgba(255,255,255,0.66)" }}>{story.title}</a>
      <span className="text-[8.5px] tabular-nums shrink-0 mt-0.5" style={{ color: "rgba(255,255,255,0.34)" }}>{story.source}{story.published_ts ? ` · ${timeAgo(story.published_ts)}` : ""}</span>
    </Beam>
  );
}

function BlockSkeleton({ delay }: { delay: number }) {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay }} className="rounded-xl overflow-hidden"
      style={{ background: "rgba(8,12,20,0.55)", borderLeft: "3px solid rgba(255,255,255,0.06)" }}>
      <div className="px-4 py-3 space-y-2.5">
        <div className="h-3 w-1/3 rounded animate-pulse" style={{ background: "rgba(255,255,255,0.06)" }} />
        <div className="h-4 w-4/5 rounded animate-pulse" style={{ background: "rgba(255,255,255,0.05)" }} />
        <div className="h-8 w-full rounded animate-pulse" style={{ background: "rgba(255,255,255,0.03)" }} />
      </div>
    </motion.div>
  );
}
