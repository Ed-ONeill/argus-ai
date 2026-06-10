"use client";

import React, { useState } from "react";
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
                  <StoryResearchNote
                    item={item}
                    color={color}
                    deepData={deepData}
                    deepLoading={deepLoading}
                  />
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


function storyImpactDir(s: string): "bullish" | "bearish" | "mixed" | null {
  const l = s.toLowerCase();
  if (l.startsWith("bullish")) return "bullish";
  if (l.startsWith("bearish")) return "bearish";
  if (l.startsWith("mixed"))   return "mixed";
  return null;
}

function storyStripDir(s: string): string {
  return s.replace(/^(bullish|bearish|mixed)[:\s–—]*/i, "").trim();
}

const STORY_VAGUE = [
  "multiple converging", "several directions", "various factors",
  "market participants", "broad pressure", "many factors", "several factors",
];
function storyClean(s: string | null | undefined): string | null {
  if (!s || s.trim().length < 10) return null;
  const l = s.toLowerCase();
  return STORY_VAGUE.some(p => l.includes(p)) ? null : s;
}

// Use borderTop for section dividers so the final section never has an orphaned
// bottom border — simpler than tracking which section renders last.
function StoryNoteRow({
  label, color, notFirst = true, children,
}: { label: string; color: string; notFirst?: boolean; children: React.ReactNode }) {
  return (
    <div className="px-3 py-2.5"
      style={notFirst ? { borderTop: `1px solid ${color}14` } : {}}>
      <p className="text-[8.5px] font-bold uppercase tracking-[0.13em] mb-1"
        style={{ color }}>
        {label}
      </p>
      <div className="text-xs leading-relaxed text-ink-secondary">
        {children}
      </div>
    </div>
  );
}

function StoryResearchNote({
  item, color, deepData, deepLoading,
}: {
  item:        FeedItem;
  color:       string;
  deepData:    DeepAnalysis | null;
  deepLoading: boolean;
}) {
  const dir        = item.impact ? storyImpactDir(item.impact) : null;
  const impactBody = item.impact ? storyClean(storyStripDir(item.impact)) : null;
  const dirColor   = dir === "bullish" ? "#059669" : dir === "bearish" ? "#DC2626" : "#D97706";
  const entities   = item.affected_entities.slice(0, 6);

  const whatChanged = storyClean(deepData?.what_changed);
  const whyMarkets  = storyClean(deepData?.why_markets_care);
  const whoWins     = storyClean(deepData?.who_wins_loses);
  const watchNext   = storyClean(deepData?.what_to_watch);

  // Track whether any section has rendered so dividers are placed correctly
  let sectionCount = 0;

  return (
    <div
      className="rounded-lg mb-3 overflow-hidden"
      style={{ background: `${color}07`, border: `1px solid ${color}22` }}
    >
      {/* 1. Why It Matters */}
      {item.why_it_matters && (() => { const first = sectionCount++ === 0; return (
        <StoryNoteRow label="Why It Matters" color={color} notFirst={!first}>
          {item.why_it_matters}
        </StoryNoteRow>
      ); })()}

      {/* 2. Market Impact */}
      {impactBody && (() => { const first = sectionCount++ === 0; return (
        <div className="px-3 py-2.5"
          style={!first ? { borderTop: `1px solid ${color}14` } : {}}>
          <div className="flex items-center gap-2 mb-1">
            <p className="text-[8.5px] font-bold uppercase tracking-[0.13em]"
              style={{ color }}>
              Market Impact
            </p>
            {dir && (
              <span className="text-[8px] font-semibold px-1.5 py-0.5 rounded-full"
                style={{ color: dirColor, background: `${dirColor}15` }}>
                {dir === "bullish" ? "↑ Bullish" : dir === "bearish" ? "↓ Bearish" : "↕ Mixed"}
              </span>
            )}
          </div>
          <p className="text-xs leading-relaxed text-ink-secondary">{impactBody}</p>
        </div>
      ); })()}

      {/* 3. Affected Entities */}
      {entities.length > 0 && (() => { const first = sectionCount++ === 0; return (
        <div className="px-3 py-2.5"
          style={!first ? { borderTop: `1px solid ${color}14` } : {}}>
          <p className="text-[8.5px] font-bold uppercase tracking-[0.13em] mb-1.5"
            style={{ color }}>
            Affected Entities
          </p>
          <div className="flex flex-wrap gap-1.5">
            {entities.map(e => (
              <span key={e}
                className="text-[9.5px] font-medium px-1.5 py-0.5 rounded bg-raised text-ink-secondary">
                {e}
              </span>
            ))}
            {item.affected_entities.length > 6 && (
              <span className="text-[9.5px] text-ink-muted">
                +{item.affected_entities.length - 6}
              </span>
            )}
          </div>
        </div>
      ); })()}

      {/* 4–7: Deep analysis fields */}
      {deepLoading && !deepData ? (
        <div className="px-3 py-3 flex items-center gap-2 text-2xs text-ink-muted"
          style={sectionCount > 0 ? { borderTop: `1px solid ${color}14` } : {}}>
          <Loader2 size={11} className="animate-spin" />
          Analyzing…
        </div>
      ) : deepData ? (
        <>
          {whatChanged && (() => { const first = sectionCount++ === 0; return (
            <StoryNoteRow label="What Changed" color={color} notFirst={!first}>
              {whatChanged}
            </StoryNoteRow>
          ); })()}
          {whyMarkets && (() => { const first = sectionCount++ === 0; return (
            <StoryNoteRow label="Why Markets Care" color={color} notFirst={!first}>
              {whyMarkets}
            </StoryNoteRow>
          ); })()}
          {whoWins && (() => { const notFirst = sectionCount++ > 0; return (
            <div className="px-3 py-2.5"
              style={{
                borderTop:  notFirst ? `1px solid ${color}14` : undefined,
                borderLeft: "2px solid rgba(16,185,129,0.30)",
              }}>
              <p className="text-[8.5px] font-bold uppercase tracking-[0.13em] mb-1"
                style={{ color: "#059669" }}>
                Bull Case / Positioning
              </p>
              <p className="text-xs leading-relaxed text-ink-secondary">{whoWins}</p>
            </div>
          ); })()}
          {watchNext && (() => { const first = sectionCount++ === 0; return (
            <StoryNoteRow label="What To Watch Next" color={color} notFirst={!first}>
              {watchNext}
            </StoryNoteRow>
          ); })()}
        </>
      ) : null}
    </div>
  );
}
