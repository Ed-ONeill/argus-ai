"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ExternalLink, Bookmark, BookmarkCheck, Zap,
  ChevronDown, Loader2, ChevronRight, Clock, Radio,
} from "lucide-react";
import { cn, catColor } from "@/lib/utils";
import { analyzeItemDeep } from "@/lib/api";
import type { StoryCluster, FeedItem, RelatedStory, DeepAnalysis, ThemeIntelligence } from "@/lib/types";

const MOMENTUM_COLOR: Record<string, string> = {
  accelerating:  "#10B981",
  strengthening: "#34D399",
  emerging:      "#52b0c8",
  stable:        "rgba(255,255,255,0.38)",
  cooling:       "#F59E0B",
  reversing:     "#EF4444",
};

const MOMENTUM_BG: Record<string, string> = {
  accelerating:  "rgba(16,185,129,0.10)",
  strengthening: "rgba(52,211,153,0.10)",
  emerging:      "rgba(82,176,200,0.10)",
  stable:        "rgba(255,255,255,0.05)",
  cooling:       "rgba(245,158,11,0.10)",
  reversing:     "rgba(239,68,68,0.10)",
};

interface ClusterCardProps {
  cluster:          StoryCluster;
  isSaved:          boolean;
  onSave:           () => void;
  isNew?:           boolean;
  isWatched?:       boolean;
  watchedEntities?: Set<string>;
  matchedTheme?:    ThemeIntelligence;
}

export function ClusterCard({
  cluster, isSaved, onSave, isNew, isWatched, watchedEntities, matchedTheme,
}: ClusterCardProps) {
  const { primary: item, related, story_count, theme_label, id } = cluster;

  const [analyzed,    setAnalyzed]    = useState(false);
  const [deepData,    setDeepData]    = useState<DeepAnalysis | null>(null);
  const [deepLoading, setDeepLoading] = useState(false);
  const [expanded,    setExpanded]    = useState(false);

  const hasSummary  = !!item.summary;
  const hasAnalysis = hasSummary && !!(item.why_it_matters || item.impact);
  const hasRelated  = related.length > 0;
  const color       = catColor(item.category);
  const score       = Math.round(item.signal_score);

  const isBreaking = item.signal_strength === "strong" && (() => {
    const m = item.published?.match(/^(\d+)(m|h)/);
    if (!m) return false;
    const mins = m[2] === "h" ? parseInt(m[1]) * 60 : parseInt(m[1]);
    return mins <= 90;
  })();

  // Visual tier — drives rendering density
  // Watched entities are always promoted to Tier 2 minimum
  const tier: 1 | 2 | 3 =
    score >= 75 ? 1 :
    (item.signal_strength === "weak" || score < 40) && !isWatched ? 3 : 2;

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

  // Left border weight scales with tier
  const leftAccent = isBreaking
    ? "rgba(180,56,56,0.85)"
    : item.signal_strength === "strong"
      ? `${color}90`
      : item.signal_strength === "medium"
        ? `${color}55`
        : `${color}38`;

  const leftBorderW = tier === 1 ? "4px" : "2px";

  // ── Tier 3: compressed row (noise) ────────────────────────────────────────
  if (tier === 3) {
    return (
      <article
        data-cluster-id={id}
        className="group rounded overflow-hidden"
        style={{
          background:   "rgba(5,9,20,0.70)",
          borderTop:    "1px solid rgba(255,255,255,0.04)",
          borderRight:  "1px solid rgba(255,255,255,0.03)",
          borderBottom: "1px solid rgba(255,255,255,0.04)",
          borderLeft:   `2px solid ${leftAccent}`,
          opacity:      0.62,
        }}
      >
        <div className="px-3.5 py-2 flex items-center gap-2.5 min-w-0">
          <span className="text-[9.5px] font-medium shrink-0" style={{ color }}>
            {item.category}
          </span>
          <span className="text-[10px] opacity-20 shrink-0">·</span>
          <a
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[12.5px] font-medium leading-tight line-clamp-1 flex-1 min-w-0
                       hover:opacity-80 transition-opacity"
            style={{ color: "rgba(255,255,255,0.78)" }}
          >
            {item.title}
          </a>
          <span
            className="text-[8.5px] tabular-nums font-mono shrink-0 ml-1"
            style={{ color: "rgba(255,255,255,0.34)" }}
          >
            {score}
          </span>
        </div>
      </article>
    );
  }

  // ── Tier 1 / Tier 2: full card ─────────────────────────────────────────────
  return (
    <motion.article
      data-cluster-id={id}
      layout="position"
      initial={isNew ? { opacity: 0, x: -8, y: 4 } : { opacity: 0, y: 4 }}
      animate={{ opacity: 1, x: 0, y: 0 }}
      transition={isNew
        ? { duration: 0.28, ease: "easeOut" }
        : { duration: 0.22, ease: "easeOut" }
      }
      whileHover={{ y: -1, transition: { duration: 0.18, ease: "easeOut" } }}
      className={cn(
        "group rounded-lg overflow-hidden",
        isWatched && "ring-1 ring-accent/30",
      )}
      style={{
        background:   tier === 1 ? "rgba(8,14,32,0.97)" : "rgba(7,12,28,0.95)",
        borderTop:    "1px solid rgba(255,255,255,0.08)",
        borderRight:  "1px solid rgba(255,255,255,0.05)",
        borderBottom: "1px solid rgba(255,255,255,0.06)",
        borderLeft:   `${leftBorderW} solid ${leftAccent}`,
      }}
    >
      <div className={cn("px-3.5", tier === 1 ? "pt-4 pb-4" : "pt-2.5 pb-3")}>

        {/* ── Theme intelligence row ───────────────────────────────────── */}
        {matchedTheme ? (
          <div className="flex items-center gap-2 mb-1.5 flex-wrap">
            <span
              className="text-[9.5px] font-medium truncate"
              style={{ color: "rgba(82,176,200,0.80)", maxWidth: 200 }}
            >
              {matchedTheme.name}
            </span>
            <span
              className="text-[7.5px] font-bold px-1.5 py-0.5 rounded capitalize shrink-0"
              style={{
                background: MOMENTUM_BG[matchedTheme.momentum_label]  ?? "rgba(255,255,255,0.05)",
                color:      MOMENTUM_COLOR[matchedTheme.momentum_label] ?? "rgba(255,255,255,0.38)",
              }}
            >
              {matchedTheme.momentum_label}
            </span>
            {(matchedTheme.momentum_delta ?? 0) !== 0 && (
              <span
                className="text-[8.5px] font-mono font-semibold tabular-nums shrink-0"
                style={{
                  color: (matchedTheme.momentum_delta ?? 0) > 0 ? "#10B981" : "#EF4444",
                }}
              >
                {(matchedTheme.momentum_delta ?? 0) > 0 ? "+" : ""}{Math.round(matchedTheme.momentum_delta ?? 0)}
              </span>
            )}
            <span
              className="text-[8px] ml-auto shrink-0"
              style={{ color: "rgba(255,255,255,0.26)" }}
            >
              CV {Math.round(matchedTheme.confidence ?? 0)}
            </span>
          </div>
        ) : story_count > 1 ? (
          <p className="text-[9.5px] font-medium uppercase tracking-[0.08em] mb-1.5 truncate"
            style={{ color: `${color}c0` }}>
            {theme_label}
          </p>
        ) : null}

        {/* ── Header row ──────────────────────────────────────────────── */}
        <div className="flex items-center gap-2 mb-2">
          <span className="text-[10.5px] font-semibold" style={{ color }}>
            {item.category}
          </span>
          {isBreaking && (
            <span className="inline-flex items-center gap-1 text-[9px] font-semibold"
              style={{ color: "rgba(210,80,80,0.90)" }}>
              <motion.span
                animate={{ opacity: [1, 0.3, 1] }}
                transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
              >
                <Radio size={7} />
              </motion.span>
              LIVE
            </span>
          )}
          <span className="ml-auto text-[9px] tabular-nums font-mono"
            style={{ color: "rgba(255,255,255,0.38)" }}>
            {score}
          </span>
        </div>

        {/* ── Headline ────────────────────────────────────────────────── */}
        <a
          href={item.url}
          target="_blank"
          rel="noopener noreferrer"
          className={cn(
            "block font-semibold leading-snug mb-2 hover:text-accent transition-colors",
            tier === 1 ? "text-[15px]" : "text-[14px]",
          )}
          style={{ color: "rgba(255,255,255,0.93)" }}
        >
          {item.title}
          <ExternalLink
            size={10}
            className="inline-block ml-1.5 opacity-0 group-hover:opacity-40 -translate-y-px"
          />
        </a>

        {/* ── Affected entities — inline text, no pills ────────────────── */}
        {item.affected_entities.length > 0 && (
          <p className="text-[10px] mb-2 truncate"
            style={{ color: "rgba(255,255,255,0.48)" }}>
            {item.affected_entities.slice(0, 4).map((e, i) => (
              <span key={e}>
                {i > 0 && <span className="mx-1 opacity-50">·</span>}
                <span style={watchedEntities?.has(e.toLowerCase())
                  ? { color: "rgba(82,176,200,0.88)" } : {}}>
                  {e}
                </span>
              </span>
            ))}
            {item.affected_entities.length > 4 && (
              <span className="opacity-60"> +{item.affected_entities.length - 4}</span>
            )}
          </p>
        )}

        {/* ── Impact preview — theme industry exposure ─────────────────── */}
        {matchedTheme && (matchedTheme.related_industries ?? []).length > 0 && (
          <div className="flex items-center gap-2 flex-wrap mb-2">
            {(matchedTheme.related_industries ?? []).slice(0, 3).map(ind => {
              const dir    = matchedTheme.momentum_direction;
              const clr    = dir === "bullish"  ? "rgba(16,185,129,0.62)" :
                             dir === "bearish"  ? "rgba(239,68,68,0.58)" :
                                                  "rgba(255,255,255,0.32)";
              const prefix = dir === "bullish"  ? "+" :
                             dir === "bearish"  ? "−" : "→";
              return (
                <span key={ind} className="text-[9.5px] font-medium" style={{ color: clr }}>
                  {prefix} {ind}
                </span>
              );
            })}
          </div>
        )}

        {/* ── AI summary + desk-note ──────────────────────────────────── */}
        {hasSummary && (
          <>
            <p className="text-[12px] leading-relaxed mb-2"
              style={{ color: "rgba(255,255,255,0.78)" }}>
              {item.summary}
            </p>

            {item.why_it_matters && !analyzed && (
              <p
                className="text-[11.5px] leading-relaxed mb-3 pl-2.5 italic"
                style={{ color: "rgba(255,255,255,0.64)", borderLeft: `1px solid ${color}55` }}
              >
                {item.why_it_matters}
              </p>
            )}

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
                    className="rounded-md px-3 py-3 mb-3 space-y-3"
                    style={{ background: `${color}0d`, borderLeft: `1px solid ${color}40` }}
                  >
                    {item.why_it_matters && (
                      <DeskNoteRow label="Why it matters" color={color}>
                        {item.why_it_matters}
                      </DeskNoteRow>
                    )}

                    {deepLoading ? (
                      <div className="flex items-center gap-2 text-[10px]"
                        style={{ color: "rgba(255,255,255,0.45)" }}>
                        <Loader2 size={10} className="animate-spin" />
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

            {/* ── Footer ──────────────────────────────────────────────── */}
            <div className="flex items-center gap-1 pt-2"
              style={{ borderTop: "1px solid rgba(255,255,255,0.08)" }}>

              <span className="text-[10px] flex-1 truncate"
                style={{ color: "rgba(255,255,255,0.44)" }}>
                {item.source}
                {item.published && (
                  <span className="ml-1" style={{ color: "rgba(255,255,255,0.26)" }}>
                    · {item.published}
                  </span>
                )}
              </span>

              <div className="flex items-center gap-0.5 shrink-0">
                {hasRelated && (
                  <button
                    onClick={() => setExpanded(e => !e)}
                    className="flex items-center gap-1 text-[10px] font-medium px-2 py-1
                               rounded transition-colors"
                    style={{ color: expanded ? "rgba(255,255,255,0.72)" : "rgba(255,255,255,0.50)" }}
                  >
                    <Clock size={9} />
                    {expanded ? "Hide" : `+${story_count - 1}`}
                    <motion.span
                      animate={{ rotate: expanded ? 180 : 0 }}
                      transition={{ duration: 0.18 }}
                      className="inline-flex"
                    >
                      <ChevronDown size={9} />
                    </motion.span>
                  </button>
                )}

                {hasAnalysis && (
                  <button
                    onClick={handleAnalyzeToggle}
                    className={cn(
                      "flex items-center gap-1 text-[10px] font-medium px-2 py-1 rounded transition-colors",
                    )}
                    style={{
                      color: analyzed ? "#52b0c8" : "rgba(82,176,200,0.78)",
                    }}
                  >
                    <Zap size={9} />
                    {analyzed ? "Close" : "Analyze"}
                  </button>
                )}

                <motion.button
                  whileTap={{ scale: 0.85 }}
                  onClick={onSave}
                  className="p-1.5 rounded transition-all"
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
                        <BookmarkCheck size={12} />
                      </motion.span>
                    ) : (
                      <motion.span key="unsaved"
                        initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0.6, opacity: 0 }} transition={{ duration: 0.15 }}>
                        <Bookmark size={12} />
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
          <p className="text-xs leading-relaxed" style={{ color: "rgba(255,255,255,0.60)" }}>
            {item.snippet.slice(0, 180)}
            {item.snippet.length > 180 ? "…" : ""}
          </p>
        )}

        {/* ── Related stories timeline ─────────────────────────────────── */}
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
                <p className="text-[9.5px] font-semibold uppercase tracking-[0.10em] mb-2"
                  style={{ color: "rgba(255,255,255,0.52)" }}>
                  Related coverage
                </p>
                <div className="space-y-0">
                  {sortedRelated.map((r, i) => (
                    <RelatedStoryRow
                      key={r.id}
                      story={r}
                      isLast={i === sortedRelated.length - 1}
                    />
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


// ── Related story row ─────────────────────────────────────────────────────────

function RelatedStoryRow({ story, isLast }: { story: RelatedStory; isLast: boolean }) {
  const dotColor = story.signal_strength === "strong"
    ? "rgba(52,160,120,0.90)"
    : story.signal_strength === "medium"
      ? "rgba(160,120,40,0.85)"
      : "rgba(70,90,130,0.65)";

  return (
    <div className="flex items-start gap-2.5 py-2"
      style={!isLast ? { borderBottom: "1px solid rgba(255,255,255,0.05)" } : {}}>
      <span className="w-1.5 h-1.5 rounded-full shrink-0 mt-[4px]"
        style={{ background: dotColor }} />
      <div className="min-w-0 flex-1">
        <a
          href={story.url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[11.5px] leading-snug line-clamp-2 font-medium
                     hover:text-accent transition-colors"
          style={{ color: "rgba(255,255,255,0.70)" }}
        >
          {story.title}
          <ExternalLink size={9} className="inline-block ml-1 opacity-0 group-hover:opacity-40" />
        </a>
        <p className="text-[9.5px] mt-0.5" style={{ color: "rgba(255,255,255,0.40)" }}>
          {story.source} · {story.published}
        </p>
      </div>
      <ChevronRight size={10} className="shrink-0 mt-[3px]"
        style={{ color: "rgba(255,255,255,0.32)" }} />
    </div>
  );
}


// ── Desk-note row ─────────────────────────────────────────────────────────────

function DeskNoteRow({
  label, color, children,
}: { label: string; color: string; children: string }) {
  if (!children) return null;
  return (
    <div>
      <p className="text-[9px] font-bold uppercase tracking-[0.12em] mb-0.5"
        style={{ color }}>
        {label}
      </p>
      <p className="text-[11.5px] leading-relaxed" style={{ color: "rgba(255,255,255,0.72)" }}>
        {children}
      </p>
    </div>
  );
}
