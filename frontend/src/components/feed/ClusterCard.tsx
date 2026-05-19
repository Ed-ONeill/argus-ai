"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ExternalLink, Bookmark, BookmarkCheck, Zap,
  ChevronDown, Loader2, ChevronRight, Clock, Radio,
} from "lucide-react";
import { cn, impactStyle, catColor } from "@/lib/utils";
import { analyzeItemDeep } from "@/lib/api";
import type { StoryCluster, FeedItem, RelatedStory, DeepAnalysis } from "@/lib/types";

// ── Cross-asset class detection (mirrors backend _cross_asset_score logic) ─────

const _FX   = new Set(["USD","EUR","JPY","GBP","CNY","CHF","AUD","DXY","FX","Dollar","Yen","Euro"]);
const _RATES = new Set(["Treasury","Treasuries","Bonds","Yields","Fed","FOMC","Rates","ECB","BoJ","10Y","2Y","30Y"]);
const _COMM  = new Set(["Oil","WTI","Brent","Gold","Silver","Copper","NG","Commodities","CL","GC","Natural Gas"]);

const ASSET_PILL: Record<string, string> = {
  Equities:    "bg-blue-100  text-blue-800",
  Rates:       "bg-cyan-100  text-cyan-800",
  Commodities: "bg-amber-100 text-amber-800",
  FX:          "bg-violet-100 text-violet-800",
};

function detectAssetClasses(entities: string[], category: string, title: string): string[] {
  const classes = new Set<string>();
  const tl = title.toLowerCase();

  // Category gives us a baseline
  if (category === "Markets") classes.add("Equities");

  for (const e of entities) {
    if (_FX.has(e))   { classes.add("FX");          continue; }
    if (_RATES.has(e)){ classes.add("Rates");        continue; }
    if (_COMM.has(e)) { classes.add("Commodities");  continue; }
    // Short all-caps tokens (e.g. NVDA, AAPL) → equity signal
    if (e.length >= 2 && e.length <= 5 && e === e.toUpperCase()) classes.add("Equities");
  }

  // Title keyword fallback for common rate/commodity terms
  if (!classes.has("Rates") && /\b(yield|rate|bond|treasury|fomc|fed|inflation)\b/.test(tl))
    classes.add("Rates");
  if (!classes.has("Commodities") && /\b(oil|brent|wti|gold|silver|copper|crude)\b/.test(tl))
    classes.add("Commodities");

  return [...classes];
}

interface ClusterCardProps {
  cluster:      StoryCluster;
  isSaved:      boolean;
  onSave:       () => void;
  isNew?:       boolean;
  isWatched?:   boolean;  // true if primary or related items match watchlist
  watchedEntities?: Set<string>;
}

export function ClusterCard({
  cluster, isSaved, onSave, isNew, isWatched, watchedEntities,
}: ClusterCardProps) {
  const { primary: item, related, story_count, theme_label, id } = cluster;

  const [analyzed,     setAnalyzed]     = useState(false);
  const [deepData,     setDeepData]     = useState<DeepAnalysis | null>(null);
  const [deepLoading,  setDeepLoading]  = useState(false);
  const [expanded,     setExpanded]     = useState(false);  // related timeline

  const hasSummary  = !!item.summary;
  const hasAnalysis = hasSummary && !!(item.why_it_matters || item.impact);
  const hasRelated  = related.length > 0;
  const impact      = item.impact ? impactStyle(item.impact) : null;
  const color       = catColor(item.category);
  const score       = Math.round(item.signal_score);

  // Breaking: strong signal + published within last 90 minutes
  const isBreaking = item.signal_strength === "strong" && (() => {
    const m = item.published?.match(/^(\d+)(m|h)/);
    if (!m) return false;
    const mins = m[2] === "h" ? parseInt(m[1]) * 60 : parseInt(m[1]);
    return mins <= 90;
  })();

  async function handleAnalyzeToggle() {
    if (analyzed) { setAnalyzed(false); return; }
    setAnalyzed(true);
    if (!deepData && !deepLoading) {
      setDeepLoading(true);
      try {
        const result = await analyzeItemDeep(item.title, item.snippet);
        setDeepData(result);
      } catch {
        // Non-fatal — panel shows pre-computed fields even without deep data
      } finally {
        setDeepLoading(false);
      }
    }
  }

  // Sort related stories: most-recent first via published_ts
  const sortedRelated = [...related].sort((a, b) => {
    if (!a.published_ts && !b.published_ts) return 0;
    if (!a.published_ts) return 1;
    if (!b.published_ts) return -1;
    return b.published_ts.localeCompare(a.published_ts);
  });

  return (
    <motion.article
      data-cluster-id={id}
      layout="position"
      initial={isNew ? { opacity: 0, x: -10, y: 4 } : { opacity: 0, y: 6 }}
      animate={{ opacity: 1, x: 0, y: 0 }}
      transition={isNew
        ? { duration: 0.28, ease: "easeOut" }
        : { duration: 0.22, ease: "easeOut" }
      }
      whileHover={{ y: -1.5, transition: { duration: 0.14, ease: "easeOut" } }}
      className={cn(
        "group bg-surface rounded-xl border transition-all duration-200",
        isBreaking
          ? "border-red-200/70 shadow-card-hover hover:shadow-lg"
          : item.signal_strength === "strong"
            ? "border-edge-strong shadow-card-hover hover:shadow-lg"
            : "border-edge hover:border-edge-strong shadow-card hover:shadow-card-hover",
        item.signal_strength === "weak" && "opacity-90",
        // Watchlist ring
        isWatched && "ring-1 ring-accent/40",
      )}
    >
      {/* Accent bar — thickness signals importance */}
      <div
        className={cn(
          "rounded-t-xl",
          item.signal_strength === "strong" ? "h-[4px]" :
          item.signal_strength === "medium" ? "h-[3px]" : "h-[2px]",
        )}
        style={{ background: color }}
      />

      <div className="px-4 pt-3.5 pb-4">

        {/* ── Theme label (multi-story clusters only) ────────────────────── */}
        {story_count > 1 && (
          <p
            className="text-2xs font-bold uppercase tracking-[0.12em] mb-1.5 truncate"
            style={{ color }}
          >
            {theme_label}
          </p>
        )}

        {/* ── Header row ────────────────────────────────────────────────────── */}
        <div className="flex items-start gap-2 mb-2.5">
          <div className="flex items-center gap-1.5 shrink-0 mt-0.5 flex-wrap">
            <span
              className="text-2xs font-semibold px-2 py-0.5 rounded-full"
              style={{ background: `${color}12`, color }}
            >
              {item.category}
            </span>
            {isBreaking && (
              <motion.span
                initial={{ opacity: 0, scale: 0.85 }}
                animate={{ opacity: 1, scale: 1 }}
                className="inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full
                           bg-red-50 text-red-600 border border-red-100"
              >
                <motion.span
                  animate={{ opacity: [1, 0.3, 1] }}
                  transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
                >
                  <Radio size={8} />
                </motion.span>
                LIVE
              </motion.span>
            )}
            {isNew && !isBreaking && (
              <motion.span
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                className="text-2xs font-bold px-2 py-0.5 rounded-full
                           bg-emerald-50 text-emerald-700 border border-emerald-100"
              >
                New
              </motion.span>
            )}
          </div>

          {/* Animated score bar + source + time */}
          <div className="flex items-center gap-1.5 ml-auto shrink-0 mt-0.5">
            <div className="flex items-center gap-1" title={`Signal: ${item.signal_strength} · ${score}/100`}>
              <div className="w-10 h-[3px] rounded-full bg-raised overflow-hidden">
                <motion.div
                  className="h-full rounded-full"
                  style={{
                    background: score >= 80 ? "#10b981" : score >= 50 ? "#f59e0b" : "#94a3b8",
                  }}
                  initial={{ width: 0 }}
                  animate={{ width: `${score}%` }}
                  transition={{ duration: 0.6, ease: "easeOut", delay: 0.1 }}
                />
              </div>
              <span className={cn(
                "text-2xs font-bold tabular-nums leading-none",
                score >= 80 ? "text-emerald-600" :
                score >= 50 ? "text-amber-600"   : "text-ink-muted",
              )}>
                {score}
              </span>
            </div>
            <span className="text-2xs text-ink-secondary/75">{item.source}</span>
            <span className="text-2xs text-ink-muted">· {item.published}</span>
          </div>
        </div>

        {/* ── Headline ──────────────────────────────────────────────────────── */}
        <a
          href={item.url}
          target="_blank"
          rel="noopener noreferrer"
          className="block text-[13.5px] font-semibold text-ink leading-snug mb-2
                     hover:text-accent transition-colors"
        >
          {item.title}
          <ExternalLink
            size={10}
            className="inline-block ml-1.5 opacity-0 group-hover:opacity-50 -translate-y-px"
          />
        </a>

        {/* ── Cross-asset breadth pills ─────────────────────────────────────── */}
        {(() => {
          const classes = detectAssetClasses(item.affected_entities, item.category, item.title);
          if (classes.length === 0) return null;
          return (
            <div className="flex items-center gap-1.5 flex-wrap mb-2">
              {classes.map(cls => (
                <span key={cls} className={cn("text-2xs font-semibold px-1.5 py-0.5 rounded", ASSET_PILL[cls])}>
                  {cls}
                </span>
              ))}
            </div>
          );
        })()}

        {/* ── Affected entities ─────────────────────────────────────────────── */}
        {item.affected_entities.length > 0 && (
          <div className="flex items-center gap-1.5 flex-wrap mb-2.5">
            <span className="text-2xs text-ink-muted">Affects:</span>
            {item.affected_entities.map(e => (
              <span
                key={e}
                className={cn(
                  "text-2xs font-medium px-1.5 py-0.5 rounded transition-colors",
                  watchedEntities?.has(e.toLowerCase())
                    ? "bg-accent/10 text-accent ring-1 ring-accent/30"
                    : "bg-raised text-ink-secondary",
                )}
              >
                {e}
              </span>
            ))}
          </div>
        )}

        {/* ── AI summary + expandable desk-note ─────────────────────────────── */}
        {hasSummary && (
          <>
            <p className="text-xs text-ink-secondary leading-relaxed mb-2">
              {item.summary}
            </p>

            {/* Why it matters — always visible below summary; hidden inside panel when analysis is open */}
            {item.why_it_matters && !analyzed && (
              <p
                className="text-[11.5px] text-ink-secondary/75 leading-relaxed mb-3 pl-2.5 italic"
                style={{ borderLeft: `2px solid ${color}30` }}
              >
                {item.why_it_matters}
              </p>
            )}

            {/* Inline desk-note panel */}
            <AnimatePresence initial={false}>
              {analyzed && (
                <motion.div
                  key="analysis"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.22, ease: "easeInOut" }}
                  className="overflow-hidden"
                >
                  <div
                    className="rounded-lg px-3 py-3 mb-3 space-y-3"
                    style={{ background: `${color}08`, borderLeft: `2px solid ${color}30` }}
                  >
                    {item.why_it_matters && (
                      <DeskNoteRow label="Why it matters" color={color}>
                        {item.why_it_matters}
                      </DeskNoteRow>
                    )}

                    {deepLoading ? (
                      <div className="flex items-center gap-2 text-2xs text-ink-muted">
                        <Loader2 size={11} className="animate-spin" />
                        Analyzing…
                      </div>
                    ) : deepData ? (
                      <>
                        {deepData.what_changed && (
                          <DeskNoteRow label="What changed" color={color}>
                            {deepData.what_changed}
                          </DeskNoteRow>
                        )}
                        {deepData.why_markets_care && (
                          <DeskNoteRow label="Why markets care" color={color}>
                            {deepData.why_markets_care}
                          </DeskNoteRow>
                        )}
                        {deepData.who_wins_loses && (
                          <DeskNoteRow label="Who wins / loses" color={color}>
                            {deepData.who_wins_loses}
                          </DeskNoteRow>
                        )}
                        {deepData.what_to_watch && (
                          <DeskNoteRow label="What to watch" color={color}>
                            {deepData.what_to_watch}
                          </DeskNoteRow>
                        )}
                      </>
                    ) : null}

                    {item.impact && (
                      <DeskNoteRow label="Market impact" color={color}>
                        {item.impact}
                      </DeskNoteRow>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* ── Footer ──────────────────────────────────────────────────────── */}
            <div className="flex items-center gap-2 pt-2 border-t border-edge/60">
              {impact && !analyzed && (
                <span className={cn(
                  "text-2xs font-semibold px-2.5 py-1 rounded-full leading-none shrink-0",
                  impact.bg, impact.text,
                )}>
                  {item.impact}
                </span>
              )}

              <div className="flex items-center gap-0.5 ml-auto">
                {hasRelated && (
                  <motion.button
                    whileTap={{ scale: 0.9 }}
                    onClick={() => setExpanded(e => !e)}
                    className={cn(
                      "flex items-center gap-1 text-2xs font-medium px-2 py-1 rounded-md transition-colors",
                      expanded
                        ? "text-ink bg-raised"
                        : "text-ink-secondary hover:text-ink hover:bg-raised",
                    )}
                    title={expanded ? "Collapse related" : "Show related stories"}
                  >
                    <Clock size={10} />
                    {expanded ? "Hide" : `+${story_count - 1} related`}
                    <motion.span
                      animate={{ rotate: expanded ? 180 : 0 }}
                      transition={{ duration: 0.18 }}
                      className="inline-flex"
                    >
                      <ChevronDown size={10} />
                    </motion.span>
                  </motion.button>
                )}

                {hasAnalysis && (
                  <motion.button
                    whileTap={{ scale: 0.9 }}
                    onClick={handleAnalyzeToggle}
                    className={cn(
                      "flex items-center gap-1 text-2xs font-medium px-2 py-1 rounded-md transition-colors",
                      analyzed
                        ? "text-accent bg-accent/8"
                        : "text-accent/80 hover:text-accent hover:bg-accent/8",
                    )}
                    title={analyzed ? "Collapse analysis" : "Inline analysis"}
                  >
                    <Zap size={10} />
                    {analyzed ? "Close" : "Analyze"}
                    <motion.span
                      animate={{ rotate: analyzed ? 180 : 0 }}
                      transition={{ duration: 0.18 }}
                      className="inline-flex"
                    >
                      <ChevronDown size={10} />
                    </motion.span>
                  </motion.button>
                )}

                <motion.button
                  whileTap={{ scale: 0.85 }}
                  onClick={onSave}
                  className={cn(
                    "p-1.5 rounded-md transition-all",
                    isSaved
                      ? "text-accent bg-accent-subtle"
                      : "text-ink-muted hover:text-ink hover:bg-raised",
                  )}
                  title={isSaved ? "Remove bookmark" : "Save"}
                >
                  <AnimatePresence mode="wait" initial={false}>
                    {isSaved ? (
                      <motion.span key="saved"
                        initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0.6, opacity: 0 }} transition={{ duration: 0.15 }}>
                        <BookmarkCheck size={13} />
                      </motion.span>
                    ) : (
                      <motion.span key="unsaved"
                        initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0.6, opacity: 0 }} transition={{ duration: 0.15 }}>
                        <Bookmark size={13} />
                      </motion.span>
                    )}
                  </AnimatePresence>
                </motion.button>
              </div>
            </div>
          </>
        )}

        {/* Snippet fallback (no AI yet) */}
        {!hasSummary && item.snippet && (
          <p className="text-xs text-ink-muted leading-relaxed">
            {item.snippet.slice(0, 180)}
            {item.snippet.length > 180 ? "…" : ""}
          </p>
        )}

        {/* ── Related stories timeline ──────────────────────────────────────── */}
        <AnimatePresence initial={false}>
          {expanded && hasRelated && (
            <motion.div
              key="related"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.24, ease: "easeInOut" }}
              className="overflow-hidden"
            >
              <div className="mt-3 pt-3 border-t border-edge/40">
                <p className="text-2xs font-bold uppercase tracking-widest text-ink-muted mb-2">
                  Related coverage
                </p>
                <div className="space-y-0">
                  {sortedRelated.map((r, i) => (
                    <RelatedStoryRow key={r.id} story={r} isLast={i === sortedRelated.length - 1} />
                  ))}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

      </div>
    </motion.article>
  );
}


// ── Related story row (lightweight timeline entry) ────────────────────────────

function RelatedStoryRow({ story, isLast }: { story: RelatedStory; isLast: boolean }) {
  return (
    <div className={cn(
      "flex items-start gap-2.5 py-2",
      !isLast && "border-b border-edge/30",
    )}>
      {/* Signal dot */}
      <span className={cn(
        "w-1.5 h-1.5 rounded-full shrink-0 mt-[4px]",
        story.signal_strength === "strong" ? "bg-emerald-400" :
        story.signal_strength === "medium"  ? "bg-amber-400"  : "bg-edge-strong",
      )} />

      <div className="min-w-0 flex-1">
        <a
          href={story.url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[12px] text-ink-secondary hover:text-accent transition-colors
                     leading-snug line-clamp-2 font-medium"
        >
          {story.title}
          <ExternalLink size={9} className="inline-block ml-1 opacity-0 group-hover:opacity-50" />
        </a>
        <p className="text-2xs text-ink-muted mt-0.5">
          {story.source} · {story.published}
        </p>
      </div>

      <ChevronRight size={11} className="text-ink-muted/40 shrink-0 mt-[3px]" />
    </div>
  );
}


// ── Desk-note row helper ──────────────────────────────────────────────────────

function DeskNoteRow({
  label, color, children,
}: { label: string; color: string; children: string }) {
  if (!children) return null;
  return (
    <div>
      <p
        className="text-2xs font-bold uppercase tracking-widest mb-0.5"
        style={{ color }}
      >
        {label}
      </p>
      <p className="text-xs text-ink-secondary leading-relaxed">{children}</p>
    </div>
  );
}
