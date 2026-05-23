"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ExternalLink, Bookmark, BookmarkCheck, Zap,
  ChevronDown, Loader2, ChevronRight, Clock, Radio,
} from "lucide-react";
import { cn, catColor } from "@/lib/utils";
import { classifyImpact } from "@/lib/types";
import { analyzeItemDeep } from "@/lib/api";
import type { StoryCluster, FeedItem, RelatedStory, DeepAnalysis } from "@/lib/types";

// ── Cross-asset class detection (mirrors backend _cross_asset_score logic) ─────

const _FX   = new Set(["USD","EUR","JPY","GBP","CNY","CHF","AUD","DXY","FX","Dollar","Yen","Euro"]);
const _RATES = new Set(["Treasury","Treasuries","Bonds","Yields","Fed","FOMC","Rates","ECB","BoJ","10Y","2Y","30Y"]);
const _COMM  = new Set(["Oil","WTI","Brent","Gold","Silver","Copper","NG","Commodities","CL","GC","Natural Gas"]);

// Dark-context asset class pill styling
const ASSET_PILL: Record<string, { bg: string; color: string }> = {
  Equities:    { bg: "rgba(28,52,120,0.35)",  color: "rgba(120,168,240,0.90)" },
  Rates:       { bg: "rgba(16,70,90,0.35)",   color: "rgba(80,180,210,0.90)"  },
  Commodities: { bg: "rgba(80,52,8,0.35)",    color: "rgba(200,156,68,0.90)"  },
  FX:          { bg: "rgba(60,28,110,0.35)",  color: "rgba(160,120,230,0.90)" },
};

// Dark-context impact badge styling
interface DarkImpact { bg: string; color: string }
function darkImpactStyle(impact: string): DarkImpact {
  const s = classifyImpact(impact);
  return {
    bullish: { bg: "rgba(22,68,40,0.40)",  color: "rgba(88,188,120,0.92)"  },
    bearish: { bg: "rgba(80,20,20,0.40)",  color: "rgba(196,96,96,0.92)"   },
    neutral: { bg: "rgba(24,38,70,0.40)",  color: "rgba(134,166,210,0.88)" },
    mixed:   { bg: "rgba(70,50,16,0.40)",  color: "rgba(196,158,72,0.92)"  },
  }[s];
}

function detectAssetClasses(entities: string[], category: string, title: string): string[] {
  const classes = new Set<string>();
  const tl = title.toLowerCase();

  if (category === "Markets") classes.add("Equities");

  for (const e of entities) {
    if (_FX.has(e))   { classes.add("FX");          continue; }
    if (_RATES.has(e)){ classes.add("Rates");        continue; }
    if (_COMM.has(e)) { classes.add("Commodities");  continue; }
    if (e.length >= 2 && e.length <= 5 && e === e.toUpperCase()) classes.add("Equities");
  }

  if (!classes.has("Rates") && /\b(yield|rate|bond|treasury|fomc|fed|inflation)\b/.test(tl))
    classes.add("Rates");
  if (!classes.has("Commodities") && /\b(oil|brent|wti|gold|silver|copper|crude)\b/.test(tl))
    classes.add("Commodities");

  return [...classes];
}

interface ClusterCardProps {
  cluster:          StoryCluster;
  isSaved:          boolean;
  onSave:           () => void;
  isNew?:           boolean;
  isWatched?:       boolean;
  watchedEntities?: Set<string>;
}

export function ClusterCard({
  cluster, isSaved, onSave, isNew, isWatched, watchedEntities,
}: ClusterCardProps) {
  const { primary: item, related, story_count, theme_label, id } = cluster;

  const [analyzed,    setAnalyzed]    = useState(false);
  const [deepData,    setDeepData]    = useState<DeepAnalysis | null>(null);
  const [deepLoading, setDeepLoading] = useState(false);
  const [expanded,    setExpanded]    = useState(false);

  const hasSummary  = !!item.summary;
  const hasAnalysis = hasSummary && !!(item.why_it_matters || item.impact);
  const hasRelated  = related.length > 0;
  const impact      = item.impact ? darkImpactStyle(item.impact) : null;
  const color       = catColor(item.category);
  const score       = Math.round(item.signal_score);

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

  const sortedRelated = [...related].sort((a, b) => {
    if (!a.published_ts && !b.published_ts) return 0;
    if (!a.published_ts) return 1;
    if (!b.published_ts) return -1;
    return b.published_ts.localeCompare(a.published_ts);
  });

  const cardBorder = isBreaking
    ? "1px solid rgba(180,60,60,0.35)"
    : item.signal_strength === "strong"
      ? "1px solid rgba(255,255,255,0.12)"
      : "1px solid rgba(255,255,255,0.07)";
  const cardShadow = isBreaking
    ? "0 4px 20px rgba(160,40,40,0.20), 0 1px 6px rgba(0,0,0,0.40)"
    : item.signal_strength === "strong"
      ? "0 3px 14px rgba(0,0,0,0.35), 0 1px 4px rgba(0,0,0,0.25)"
      : "0 2px 8px rgba(0,0,0,0.30), 0 1px 3px rgba(0,0,0,0.18)";

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
        "group rounded-xl transition-all duration-200",
        item.signal_strength === "weak" && "opacity-85",
        isWatched && "ring-1 ring-accent/40",
      )}
      style={{
        background: "rgba(6,10,20,0.92)",
        border:     cardBorder,
        boxShadow:  cardShadow,
      }}
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
          <p className="text-2xs font-bold uppercase tracking-[0.12em] mb-1.5 truncate"
            style={{ color }}>
            {theme_label}
          </p>
        )}

        {/* ── Header row ────────────────────────────────────────────────────── */}
        <div className="flex items-start gap-2 mb-2.5">
          <div className="flex items-center gap-1.5 shrink-0 mt-0.5 flex-wrap">
            <span className="text-2xs font-semibold px-2 py-0.5 rounded-full"
              style={{ background: `${color}18`, color }}>
              {item.category}
            </span>
            {isBreaking && (
              <motion.span
                initial={{ opacity: 0, scale: 0.85 }}
                animate={{ opacity: 1, scale: 1 }}
                className="inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                style={{
                  background: "rgba(100,20,20,0.40)",
                  color:      "rgba(220,100,100,0.95)",
                  border:     "1px solid rgba(180,60,60,0.40)",
                }}
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
                className="text-2xs font-bold px-2 py-0.5 rounded-full"
                style={{
                  background: "rgba(16,68,40,0.40)",
                  color:      "rgba(80,190,120,0.92)",
                  border:     "1px solid rgba(40,140,80,0.35)",
                }}
              >
                New
              </motion.span>
            )}
          </div>

          {/* Animated score bar + source + time */}
          <div className="flex items-center gap-1.5 ml-auto shrink-0 mt-0.5">
            <div className="flex items-center gap-1"
              title={`Signal: ${item.signal_strength} · ${score}/100`}>
              <div className="w-10 h-[3px] rounded-full overflow-hidden"
                style={{ background: "rgba(255,255,255,0.08)" }}>
                <motion.div
                  className="h-full rounded-full"
                  style={{
                    background: score >= 80 ? "#52b0c8" : score >= 50 ? "#a07030" : "#4a5878",
                  }}
                  initial={{ width: 0 }}
                  animate={{ width: `${score}%` }}
                  transition={{ duration: 0.6, ease: "easeOut", delay: 0.1 }}
                />
              </div>
              <span className="text-2xs font-bold tabular-nums leading-none"
                style={{
                  color: score >= 80 ? "rgba(82,176,200,0.90)"
                       : score >= 50 ? "rgba(160,112,48,0.90)"
                       : "rgba(140,160,190,0.75)",
                }}>
                {score}
              </span>
            </div>
            <span className="text-2xs" style={{ color: "rgba(255,255,255,0.52)" }}>
              {item.source}
            </span>
            <span className="text-2xs" style={{ color: "rgba(255,255,255,0.35)" }}>
              · {item.published}
            </span>
          </div>
        </div>

        {/* ── Headline ──────────────────────────────────────────────────────── */}
        <a
          href={item.url}
          target="_blank"
          rel="noopener noreferrer"
          className="block text-[13.5px] font-semibold leading-snug mb-2
                     hover:text-accent transition-colors"
          style={{ color: "rgba(255,255,255,0.88)" }}
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
              {classes.map(cls => {
                const pill = ASSET_PILL[cls];
                return (
                  <span key={cls} className="text-2xs font-semibold px-1.5 py-0.5 rounded"
                    style={pill ? { background: pill.bg, color: pill.color } : {}}>
                    {cls}
                  </span>
                );
              })}
            </div>
          );
        })()}

        {/* ── Affected entities ─────────────────────────────────────────────── */}
        {item.affected_entities.length > 0 && (
          <div className="flex items-center gap-1.5 flex-wrap mb-2.5">
            <span className="text-2xs" style={{ color: "rgba(255,255,255,0.42)" }}>Affects:</span>
            {item.affected_entities.map(e => (
              <span
                key={e}
                className="text-2xs font-medium px-1.5 py-0.5 rounded transition-colors"
                style={watchedEntities?.has(e.toLowerCase())
                  ? { background: "rgba(30,80,160,0.35)", color: "#52b0c8",
                      outline: "1px solid rgba(82,176,200,0.35)" }
                  : { background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.62)" }
                }
              >
                {e}
              </span>
            ))}
          </div>
        )}

        {/* ── AI summary + expandable desk-note ─────────────────────────────── */}
        {hasSummary && (
          <>
            <p className="text-xs leading-relaxed mb-2"
              style={{ color: "rgba(255,255,255,0.72)" }}>
              {item.summary}
            </p>

            {item.why_it_matters && !analyzed && (
              <p
                className="text-[11.5px] leading-relaxed mb-3 pl-2.5 italic"
                style={{ color: "rgba(255,255,255,0.60)", borderLeft: `2px solid ${color}38` }}
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
                    style={{ background: `${color}0a`, borderLeft: `2px solid ${color}38` }}
                  >
                    {item.why_it_matters && (
                      <DeskNoteRow label="Why it matters" color={color}>
                        {item.why_it_matters}
                      </DeskNoteRow>
                    )}

                    {deepLoading ? (
                      <div className="flex items-center gap-2 text-2xs"
                        style={{ color: "rgba(255,255,255,0.45)" }}>
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
            <div className="flex items-center gap-2 pt-2"
              style={{ borderTop: "1px solid rgba(255,255,255,0.07)" }}>
              {impact && !analyzed && (
                <span className="text-2xs font-semibold px-2.5 py-1 rounded-full leading-none shrink-0"
                  style={{ background: impact.bg, color: impact.color }}>
                  {item.impact}
                </span>
              )}

              <div className="flex items-center gap-0.5 ml-auto">
                {hasRelated && (
                  <motion.button
                    whileTap={{ scale: 0.9 }}
                    onClick={() => setExpanded(e => !e)}
                    className="flex items-center gap-1 text-2xs font-medium px-2 py-1 rounded-md transition-colors"
                    style={{
                      color:      expanded ? "rgba(255,255,255,0.82)" : "rgba(255,255,255,0.55)",
                      background: expanded ? "rgba(255,255,255,0.08)" : "transparent",
                    }}
                    onMouseEnter={e => {
                      if (!expanded) {
                        e.currentTarget.style.color = "rgba(255,255,255,0.82)";
                        e.currentTarget.style.background = "rgba(255,255,255,0.06)";
                      }
                    }}
                    onMouseLeave={e => {
                      if (!expanded) {
                        e.currentTarget.style.color = "rgba(255,255,255,0.55)";
                        e.currentTarget.style.background = "transparent";
                      }
                    }}
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
                  className="p-1.5 rounded-md transition-all"
                  style={{
                    color:      isSaved ? "#52b0c8" : "rgba(255,255,255,0.42)",
                    background: isSaved ? "rgba(82,176,200,0.10)" : "transparent",
                  }}
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
          <p className="text-xs leading-relaxed" style={{ color: "rgba(255,255,255,0.52)" }}>
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
              <div className="mt-3 pt-3"
                style={{ borderTop: "1px solid rgba(255,255,255,0.07)" }}>
                <p className="text-2xs font-bold uppercase tracking-widest mb-2"
                  style={{ color: "rgba(255,255,255,0.42)" }}>
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
  const dotColor = story.signal_strength === "strong"
    ? "rgba(52,176,130,0.85)"
    : story.signal_strength === "medium"
      ? "rgba(180,130,40,0.80)"
      : "rgba(80,100,140,0.60)";

  return (
    <div className="flex items-start gap-2.5 py-2"
      style={!isLast ? { borderBottom: "1px solid rgba(255,255,255,0.06)" } : {}}>
      <span className="w-1.5 h-1.5 rounded-full shrink-0 mt-[4px]"
        style={{ background: dotColor }} />

      <div className="min-w-0 flex-1">
        <a
          href={story.url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[12px] leading-snug line-clamp-2 font-medium hover:text-accent transition-colors"
          style={{ color: "rgba(255,255,255,0.68)" }}
        >
          {story.title}
          <ExternalLink size={9} className="inline-block ml-1 opacity-0 group-hover:opacity-50" />
        </a>
        <p className="text-2xs mt-0.5" style={{ color: "rgba(255,255,255,0.38)" }}>
          {story.source} · {story.published}
        </p>
      </div>

      <ChevronRight size={11} className="shrink-0 mt-[3px]"
        style={{ color: "rgba(255,255,255,0.28)" }} />
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
      <p className="text-2xs font-bold uppercase tracking-widest mb-0.5"
        style={{ color }}>
        {label}
      </p>
      <p className="text-xs leading-relaxed" style={{ color: "rgba(255,255,255,0.68)" }}>
        {children}
      </p>
    </div>
  );
}
