"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ExternalLink, Bookmark, BookmarkCheck, Zap, ChevronDown, Loader2 } from "lucide-react";
import { cn, impactStyle, catColor } from "@/lib/utils";
import { analyzeItemDeep } from "@/lib/api";
import type { FeedItem, DeepAnalysis } from "@/lib/types";

interface StoryCardProps {
  item:    FeedItem;
  isSaved: boolean;
  onSave:  () => void;
  isNew?:  boolean;
}

export function StoryCard({ item, isSaved, onSave, isNew }: StoryCardProps) {
  const [analyzed,       setAnalyzed]       = useState(false);
  const [deepData,       setDeepData]       = useState<DeepAnalysis | null>(null);
  const [deepLoading,    setDeepLoading]    = useState(false);

  const hasSummary  = !!item.summary;
  const hasAnalysis = hasSummary && !!(item.why_it_matters || item.impact);
  const impact      = item.impact ? impactStyle(item.impact) : null;
  const color       = catColor(item.category);

  async function handleAnalyzeToggle() {
    if (analyzed) {
      setAnalyzed(false);
      return;
    }
    setAnalyzed(true);
    // Fetch deep fields lazily the first time the panel is opened
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

  return (
    <motion.article
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
        item.signal_strength === "strong"
          ? "border-edge-strong shadow-card-hover hover:shadow-lg"
          : "border-edge hover:border-edge-strong shadow-card hover:shadow-card-hover",
        item.signal_strength === "weak" && "opacity-90",
      )}
    >
      {/* Accent bar */}
      <div className="h-[2.5px] rounded-t-xl" style={{ background: color }} />

      <div className="px-4 pt-3.5 pb-4">

        {/* ── Header row ────────────────────────────────────────────── */}
        <div className="flex items-start gap-2 mb-2.5">
          <div className="flex items-center gap-1.5 shrink-0 mt-0.5 flex-wrap">
            <span
              className="text-2xs font-semibold px-2 py-0.5 rounded-full"
              style={{ background: `${color}12`, color }}
            >
              {item.category}
            </span>
            {isNew && (
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
          <div className="flex items-center gap-1.5 ml-auto shrink-0 mt-0.5">
            <span
              className={cn(
                "w-1.5 h-1.5 rounded-full shrink-0",
                item.signal_strength === "strong" ? "bg-emerald-400" :
                item.signal_strength === "medium"  ? "bg-amber-400"  : "bg-edge-strong"
              )}
              title={`Signal: ${item.signal_strength}`}
            />
            {item.signal_score > 0 && (
              <span className={cn(
                "text-2xs font-bold tabular-nums leading-none",
                item.signal_score >= 80 ? "text-emerald-600" :
                item.signal_score >= 50 ? "text-amber-600"   : "text-ink-muted",
              )}>
                {Math.round(item.signal_score)}
              </span>
            )}
            <span className="text-2xs text-ink-secondary/75">{item.source}</span>
            <span className="text-2xs text-ink-muted">· {item.published}</span>
          </div>
        </div>

        {/* ── Headline ──────────────────────────────────────────────── */}
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

        {/* ── Affected entities ─────────────────────────────────────── */}
        {item.affected_entities.length > 0 && (
          <div className="flex items-center gap-1.5 flex-wrap mb-2.5">
            <span className="text-2xs text-ink-muted">Affects:</span>
            {item.affected_entities.map(e => (
              <span
                key={e}
                className="text-2xs font-medium px-1.5 py-0.5 rounded bg-raised text-ink-secondary"
              >
                {e}
              </span>
            ))}
          </div>
        )}

        {/* ── AI-enriched section ───────────────────────────────────── */}
        {hasSummary && (
          <>
            <p className="text-xs text-ink-secondary leading-relaxed mb-3">
              {item.summary}
            </p>

            {/* Inline analysis panel */}
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
                      <AnalysisRow label="Why it matters" color={color}>
                        {item.why_it_matters}
                      </AnalysisRow>
                    )}

                    {/* Lazy-loaded desk-note fields */}
                    {deepLoading ? (
                      <div className="flex items-center gap-2 text-2xs text-ink-muted">
                        <Loader2 size={11} className="animate-spin" />
                        Analyzing…
                      </div>
                    ) : deepData ? (
                      <>
                        {deepData.what_changed && (
                          <AnalysisRow label="What changed" color={color}>
                            {deepData.what_changed}
                          </AnalysisRow>
                        )}
                        {deepData.why_markets_care && (
                          <AnalysisRow label="Why markets care" color={color}>
                            {deepData.why_markets_care}
                          </AnalysisRow>
                        )}
                        {deepData.who_wins_loses && (
                          <AnalysisRow label="Who wins / loses" color={color}>
                            {deepData.who_wins_loses}
                          </AnalysisRow>
                        )}
                        {deepData.what_to_watch && (
                          <AnalysisRow label="What to watch" color={color}>
                            {deepData.what_to_watch}
                          </AnalysisRow>
                        )}
                      </>
                    ) : null}

                    {item.impact && (
                      <AnalysisRow label="Market impact" color={color}>
                        {item.impact}
                      </AnalysisRow>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* ── Footer ──────────────────────────────────────────────── */}
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

      </div>
    </motion.article>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function AnalysisRow({
  label, color, children,
}: { label: string; color: string; children: string }) {
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
