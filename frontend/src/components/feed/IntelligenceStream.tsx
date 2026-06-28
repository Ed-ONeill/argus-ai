"use client";

import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, ExternalLink, Bookmark, BookmarkCheck, Radio, ArrowRight, AlertTriangle } from "lucide-react";
import { catColor, timeAgo } from "@/lib/utils";
import { classifyImpact } from "@/lib/types";
import { transmissionPath, dirOf, themeWatch } from "@/lib/themeTransmission";
import { themeBeneficiaries, generateNextCatalysts, generateThesis, generateBullBearCases } from "@/lib/themeIntelligence";
import { Beam, useBeam } from "@/lib/feedHighlight";
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
    <div className="space-y-3">
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
  const color = catColor(item.category);
  const dir = dirOf(theme);
  const dc = dirColor(dir);
  const score = Math.round(item.signal_score);
  const path = transmissionPath(theme);
  const companies = [...new Set([...(item.affected_entities ?? []), ...themeBeneficiaries(theme, 4)])].slice(0, 8);
  const sectors = (theme.related_industries ?? []).slice(0, 4);
  const impactSent = classifyImpact(item.impact ?? "");
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
      className="relative rounded-xl overflow-hidden"
      style={{ background: "linear-gradient(180deg, #131c2e, #0c1220)", border: "1px solid rgba(255,255,255,0.08)", borderLeft: `4px solid ${dc}` }}
    >
      {/* Conviction glow on the accent — pulses while the theme is strengthening */}
      {strengthening && <div aria-hidden className="tg-glow absolute left-0 top-0 bottom-0 w-[3px] pointer-events-none" style={{ background: dc, boxShadow: `0 0 12px ${dc}` }} />}
      {/* One-shot transmission wave when this event is newly arrived */}
      {isNew && <div aria-hidden className="tg-wave absolute inset-y-0 w-1/3 pointer-events-none z-10" style={{ background: `linear-gradient(to right, transparent, ${dc}24, transparent)` }} />}

      {/* Block 1 — Macro Event (large) */}
      <div className="relative px-4 pt-3.5 pb-3.5 border-b" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
        <div className="absolute inset-0 pointer-events-none" style={{ background: `radial-gradient(ellipse at left top, ${dc}0e, transparent 60%)` }} />
        <div className="relative flex items-center gap-2 mb-1.5">
          <span className="text-[8px] font-black uppercase tracking-[0.16em]" style={{ color: dc }}>Lead Event</span>
          <span className="text-[9.5px] font-semibold" style={{ color }}>{item.category}</span>
          {isBreaking && (
            <span className="inline-flex items-center gap-1 text-[8px] font-bold" style={{ color: RED }}>
              <motion.span animate={{ opacity: [1, 0.3, 1] }} transition={{ duration: 1.4, repeat: Infinity }}><Radio size={7} /></motion.span>LIVE
            </span>
          )}
          <span className="text-[9px] font-semibold ml-auto px-1.5 py-0.5 rounded" style={{ color: dc, background: `${dc}1a` }}>{cleanThemeName(theme.name)}</span>
          <button onClick={onSave} className="p-1 rounded transition-colors shrink-0" style={{ color: isSaved ? CYAN : "rgba(255,255,255,0.4)" }}>
            {isSaved ? <BookmarkCheck size={13} /> : <Bookmark size={13} />}
          </button>
        </div>
        <a href={item.url} target="_blank" rel="noopener noreferrer" className="relative block text-[16px] font-bold leading-snug tracking-[-0.01em] hover:opacity-90 transition-opacity" style={{ color: "rgba(255,255,255,0.97)" }}>
          {item.title}<ExternalLink size={11} className="inline-block ml-1.5 opacity-30 -translate-y-px" />
        </a>
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

      {/* Block 3 — Affected Sectors + Companies (clustered, two columns) */}
      <div className="grid sm:grid-cols-2 gap-px border-b" style={{ background: "rgba(255,255,255,0.05)", borderColor: "rgba(255,255,255,0.05)" }}>
        <div className="px-4 py-3" style={{ background: "#0c1220" }}>
          <BlockLabel>Affected Sectors</BlockLabel>
          <div className="flex flex-wrap gap-1.5">
            {sectors.length ? sectors.map(s => (
              <Beam key={s} tokens={[s, ...ctx]} className="text-[9.5px] font-medium px-1.5 py-0.5 rounded inline-block" style={{ color: dc, background: `${dc}14` }}>
                {dir === "bullish" ? "+ " : dir === "bearish" ? "− " : "→ "}{s}
              </Beam>
            )) : <Empty />}
          </div>
        </div>
        <div className="px-4 py-3" style={{ background: "#0c1220" }}>
          <BlockLabel>Affected Companies</BlockLabel>
          <div className="flex flex-wrap gap-1">
            {companies.length ? companies.map(c => (
              <Beam key={c} tokens={[c, ...ctx]} className="text-[9.5px] font-mono font-bold px-1.5 py-0.5 rounded inline-block"
                style={watchedEntities?.has(c.toLowerCase())
                  ? { color: CYAN, background: "rgba(82,176,200,0.16)", border: "1px solid rgba(82,176,200,0.3)" }
                  : { color: "rgba(255,255,255,0.66)", background: "rgba(255,255,255,0.05)" }}>{c}</Beam>
            )) : <Empty />}
          </div>
        </div>
      </div>

      {/* Block 4 — Market Impact (gauge) */}
      <div className="px-4 py-3 border-b" style={{ borderColor: "rgba(255,255,255,0.05)" }}>
        <div className="flex items-center gap-3">
          <div className="shrink-0 flex flex-col items-center">
            <span className="text-[20px] font-black tabular-nums leading-none" style={{ color: dc }}>{score}</span>
            <span className="text-[7px] font-bold uppercase tracking-wider mt-0.5" style={{ color: "rgba(255,255,255,0.36)" }}>Signal</span>
          </div>
          <div className="flex-1 min-w-0">
            <BlockLabel>Market Impact</BlockLabel>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[8.5px] font-bold uppercase px-1.5 py-0.5 rounded" style={{ color: dc, background: `${dc}1a` }}>
                {impactSent === "bullish" ? "↑ Bullish" : impactSent === "bearish" ? "↓ Bearish" : "↕ Mixed"}
              </span>
              <div className="flex-1 h-[3px] rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.07)" }}>
                <div className="h-full rounded-full" style={{ width: `${score}%`, background: dc }} />
              </div>
            </div>
            {item.impact && <p className="text-[11px] leading-snug" style={{ color: "rgba(255,255,255,0.6)" }}>{item.impact.replace(/^(bullish|bearish|mixed)[:\s–—]*/i, "")}</p>}
          </div>
        </div>
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
      whileHover={{ x: 1 }}
      className="group rounded-lg overflow-hidden"
      style={{ background: "#0f1626", border: "1px solid rgba(255,255,255,0.05)", borderLeft: `2px solid ${dc}`, boxShadow: watched ? `inset 0 0 0 1px ${CYAN}30` : undefined }}
    >
      <div className="px-3.5 py-2.5">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-[8px] font-bold uppercase tracking-wide px-1 py-0.5 rounded" style={{ color: dc, background: `${dc}16` }}>
            {dir === "bullish" ? "↑" : dir === "bearish" ? "↓" : "↕"}
          </span>
          <Beam tokens={[path.driver, ...rowCtx]} className="text-[9px] font-medium truncate" title={path.driver} style={{ color: `${color}d0` }}>{path.driver}</Beam>
          {path.sector && <><span style={{ color: "rgba(255,255,255,0.26)" }}>→</span><Beam tokens={[path.sector, ...rowCtx]} className="text-[9px] font-semibold shrink-0" style={{ color: "rgba(255,255,255,0.66)" }}>{path.sector}</Beam></>}
          <span className="ml-auto text-[9px] font-mono tabular-nums shrink-0" style={{ color: "rgba(255,255,255,0.4)" }}>{score}</span>
          <button onClick={onSave} className="p-0.5 rounded shrink-0" style={{ color: isSaved ? CYAN : "rgba(255,255,255,0.32)" }}>
            {isSaved ? <BookmarkCheck size={11} /> : <Bookmark size={11} />}
          </button>
        </div>
        <a href={item.url} target="_blank" rel="noopener noreferrer" className="block text-[13px] font-semibold leading-snug truncate hover:opacity-85 transition-opacity" style={{ color: "rgba(255,255,255,0.9)" }}>{item.title}</a>
        <div className="flex items-center gap-2 mt-1">
          {tickers.length > 0 && (
            <span className="flex items-center gap-1 min-w-0">
              {tickers.map(t => (
                <Beam key={t} tokens={[t, ...rowCtx]} className="text-[8.5px] font-mono font-bold" style={{ color: watchedEntities?.has(t.toLowerCase()) ? CYAN : "rgba(255,255,255,0.5)" }}>{t}</Beam>
              ))}
            </span>
          )}
          <span className="text-[8.5px] ml-auto shrink-0" style={{ color: "rgba(255,255,255,0.34)" }}>{item.source} · {item.published}</span>
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
    <div className="rounded-lg overflow-hidden" style={{ background: "rgba(8,12,20,0.6)", border: "1px solid rgba(255,255,255,0.05)" }}>
      <div className="px-3.5 py-2 flex items-center gap-2" style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
        <span className="text-[8px] font-bold uppercase tracking-[0.14em]" style={{ color: "rgba(255,255,255,0.4)" }}>Also Moving</span>
        <span className="text-[8.5px] tabular-nums" style={{ color: "rgba(255,255,255,0.3)" }}>{rows.length} lower-signal stories</span>
      </div>
      <div className="grid sm:grid-cols-2 gap-px" style={{ background: "rgba(255,255,255,0.04)" }}>
        {shown.map(({ cluster: c, theme }) => (
          <TailItem key={c.id} cluster={c} theme={theme} />
        ))}
      </div>
      {rows.length > 6 && (
        <button onClick={() => setOpen(o => !o)} className="w-full py-1.5 text-[9.5px] font-semibold transition-colors hover:bg-white/[0.03]" style={{ color: "rgba(255,255,255,0.46)" }}>
          {open ? "Show less" : `Show ${rows.length - 6} more`}
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
      className="flex items-center gap-2 px-3 py-2 min-w-0 transition-colors hover:bg-white/[0.03]" style={{ background: "rgba(8,12,20,0.85)", ...dimStyle }}>
      <span className="w-1 h-1 rounded-full shrink-0" style={{ background: color, opacity: 0.6 }} />
      <span className="text-[11px] leading-tight truncate flex-1" style={{ color: "rgba(255,255,255,0.6)" }}>{cluster.primary.title}</span>
      <span className="text-[8px] font-mono tabular-nums shrink-0" style={{ color: "rgba(255,255,255,0.3)" }}>{Math.round(cluster.primary.signal_score)}</span>
    </a>
  );
}

function BlockLabel({ children }: { children: React.ReactNode }) {
  return <p className="text-[7.5px] font-bold uppercase tracking-[0.14em] mb-1.5" style={{ color: "rgba(255,255,255,0.34)" }}>{children}</p>;
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
