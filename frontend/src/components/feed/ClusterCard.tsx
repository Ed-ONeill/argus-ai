"use client";

import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ExternalLink, Bookmark, BookmarkCheck, Zap,
  ChevronDown, Loader2, ChevronRight, Clock, Radio,
} from "lucide-react";
import { cn, catColor } from "@/lib/utils";
import { analyzeItemDeep } from "@/lib/api";
import type { StoryCluster, FeedItem, RelatedStory, DeepAnalysis, ThemeIntelligence } from "@/lib/types";
import type { ClusterAffinity } from "@/lib/feedRanker";

const IS_DEV = process.env.NODE_ENV === "development";

// Dev-only annotation explaining why a story landed where it did in the ranked
// feed. Renders the additive affinity breakdown + the matched-preference reasons.
function RankedBecause({ affinity }: { affinity: ClusterAffinity }) {
  if (!IS_DEV) return null;
  // Three states: on-thesis (theme/sector) · secondary (asset/region only) · none.
  const state: "thesis" | "secondary" | "none" =
    affinity.hasAffinity ? "thesis" : affinity.reasons.length ? "secondary" : "none";
  const palette = {
    thesis:    { bg: "rgba(82,176,200,0.07)",  bd: "rgba(82,176,200,0.18)",  fg: "rgba(82,176,200,0.92)" },
    secondary: { bg: "rgba(200,160,64,0.07)",  bd: "rgba(200,160,64,0.20)",  fg: "rgba(210,180,110,0.92)" },
    none:      { bg: "rgba(160,80,80,0.08)",   bd: "rgba(160,80,80,0.20)",   fg: "rgba(210,140,140,0.92)" },
  }[state];
  return (
    <div
      className="mb-1.5 px-2 py-1 rounded text-[9.5px] leading-snug font-mono"
      style={{ background: palette.bg, border: `1px solid ${palette.bd}`, color: palette.fg }}
    >
      <span className="opacity-70">rank {Math.round(affinity.finalRank)}</span>
      <span className="opacity-40">
        {" "}· conv {affinity.convictionScore} · src {affinity.sourceAuthorityScore}
        {" "}· top {affinity.topicPriorityScore} · thm {affinity.themeMatchScore}
        {" "}· sec {affinity.sectorMatchScore} · ast {affinity.assetClassMatchScore}
        {" "}· mkt {affinity.marketFocusScore}
        {affinity.penalty ? ` · pen ${affinity.penalty}` : ""}
      </span>
      <div className="mt-0.5 font-sans font-semibold">
        {state === "thesis"    && <>Ranked because: {affinity.reasons.map(r => `+ ${r}`).join("  ")}</>}
        {state === "secondary" && <>Secondary (downranked): {affinity.reasons.map(r => `+ ${r}`).join("  ")}</>}
        {state === "none"      && <>Downranked — no preference overlap</>}
      </div>
    </div>
  );
}

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

// ── Analysis helpers ──────────────────────────────────────────────────────────

const BULL_LABELS = new Set(["accelerating", "strengthening", "emerging"]);
const BEAR_LABELS = new Set(["reversing", "cooling"]);

// Public-facing names for known internal theme labels — never expose raw names
const KNOWN_DRIVER_LABELS: Record<string, string> = {
  "Higher-for-Longer Repricing":   "Interest Rates",
  "Grid Bottleneck Trade":          "Power Infrastructure",
  "Baseload Scarcity Premium":      "Utility Capacity",
  "Credit Transmission Breakdown":  "Bank Credit Conditions",
  "Metabolic Disease Repricing":    "Healthcare Demand Shift",
  "Crypto Market Structure":        "Digital Asset Flows",
  "Non-Bank Lending Ascendancy":    "Private Credit",
  "PBOC Easing Rotation":           "China Policy Support",
  "NATO Rearmament Cycle":          "Defense Spending",
  "Silicon Sovereignty Capex":      "Semiconductor Capex",
};

function getPublicThemeLabel(theme: ThemeIntelligence): string | null {
  const known = KNOWN_DRIVER_LABELS[theme.name];
  if (known) return known;
  // Fall back to first macro factor (already public-facing)
  const macro0 = (theme.related_macro_factors ?? [])[0];
  if (macro0) return macro0;
  return null; // Do not expose raw theme.name
}

// Vague phrases that should never appear in rendered copy
const VAGUE_PHRASES = [
  "multiple converging", "several directions", "various factors",
  "market participants", "broad pressure", "many factors",
  "various drivers", "multiple factors", "various conditions",
  "several factors",
];

function hasVagueProse(text: string): boolean {
  const l = text.toLowerCase();
  return VAGUE_PHRASES.some(p => l.includes(p));
}

// Jaccard word-overlap — used to detect materially identical bull/bear cases
function wordOverlap(a: string, b: string): number {
  const words = (s: string) =>
    new Set(s.toLowerCase().split(/\W+/).filter(w => w.length > 3));
  const wa = words(a);
  const wb = words(b);
  const inter = [...wa].filter(w => wb.has(w)).length;
  const union = new Set([...wa, ...wb]).size;
  return union === 0 ? 0 : inter / union;
}

function impactDir(s: string): "bullish" | "bearish" | "mixed" | null {
  const l = s.toLowerCase();
  if (l.startsWith("bullish")) return "bullish";
  if (l.startsWith("bearish")) return "bearish";
  if (l.startsWith("mixed"))   return "mixed";
  return null;
}

function stripDir(s: string): string {
  return s.replace(/^(bullish|bearish|mixed)[:\s–—]*/i, "").trim();
}

function firstSent(text: string | undefined | null): string | null {
  if (!text || text.length < 15 || text.includes(" → ")) return null;
  const dot = text.indexOf(".");
  return dot > 15 ? text.slice(0, dot + 1).trim() : null;
}

// Returns the first sentence of an effect string, or the full text if it is
// short and complete; never truncates mid-sentence.
function cleanEff(eff: string): string | null {
  const s = firstSent(eff);
  if (s && !hasVagueProse(s)) return s;
  // Only use raw effect if it is short enough to be a complete thought
  if (!s && eff.length <= 130) {
    const clean = eff.endsWith(".") ? eff : eff + ".";
    return hasVagueProse(clean) ? null : clean;
  }
  return null;
}

function deriveBullCase(
  theme: ThemeIntelligence | undefined,
  deep: DeepAnalysis | null,
): string | null {
  if (deep?.who_wins_loses && !hasVagueProse(deep.who_wins_loses))
    return deep.who_wins_loses;
  if (!theme) return null;
  const isBull = theme.momentum_direction === "bullish" || BULL_LABELS.has(theme.momentum_label);
  if (isBull) {
    const c = firstSent(theme.causal_narrative);
    if (c && !hasVagueProse(c)) return c;
    const ind    = (theme.related_industries ?? [])[0];
    const persist = theme.persistence_cycles ?? 0;
    const driver  = (theme.related_macro_factors ?? [])[0]?.toLowerCase();
    if (ind && persist >= 3)
      return `${ind} has seen ${persist} consecutive periods of earnings improvement${theme.cross_category_confirmed ? ", with cross-sector confirmation" : ""}.`;
    if (ind && driver)
      return `${ind} earnings are directly tied to ${driver}. Participation is ${(theme.breadth_score ?? 0) >= 60 ? "broad across the sector" : "concentrated in leading names"}.`;
    if (ind)
      return `${ind} earnings are benefiting from this driver. Breadth is ${(theme.breadth_score ?? 0) >= 60 ? "broad" : "concentrated in a small number of names"}.`;
  }
  const ind0 = (theme.related_industries ?? [])[0];
  if (ind0 && (theme.breadth_score ?? 0) < 50)
    return `Pressure on ${ind0} appears concentrated (breadth ${Math.round(theme.breadth_score ?? 0)}). A stabilisation of the driver could support a mean-reversion trade.`;
  return null;
}

function deriveBearCase(
  theme: ThemeIntelligence | undefined,
): string | null {
  if (!theme) return null;
  const isBear = theme.momentum_direction === "bearish" || BEAR_LABELS.has(theme.momentum_label);
  if (isBear) {
    const c = firstSent(theme.causal_narrative);
    if (c && !hasVagueProse(c)) return c;
  }
  const eff = (theme.second_order_effects ?? []).find(e => e && !e.includes(" → ") && e.length >= 20);
  if (eff) {
    const r = cleanEff(eff);
    if (r) return r;
  }
  const ind0 = (theme.related_industries ?? [])[0];
  if (theme.momentum_label === "reversing" && ind0)
    return `${ind0} estimates face downgrade risk if the reversal accelerates beyond current breadth.`;
  if (theme.momentum_label === "cooling" && ind0)
    return `${ind0} momentum is softening. Margin assumptions are most vulnerable to volume disappointment.`;
  return null;
}

// bearCaseText is passed to avoid returning the same sentence as the bear case
function deriveWatchNext(
  theme: ThemeIntelligence | undefined,
  deep: DeepAnalysis | null,
  bearCaseText: string | null,
): string | null {
  if (deep?.what_to_watch && !hasVagueProse(deep.what_to_watch)) return deep.what_to_watch;
  const effs = (theme?.second_order_effects ?? []).filter(e => e && !e.includes(" → ") && e.length >= 20);
  for (const eff of effs) {
    const r = cleanEff(eff);
    if (r) {
      // Don't repeat content that's already in the bear case
      if (!bearCaseText || wordOverlap(r, bearCaseText) <= 0.60) return r;
    }
  }
  const f = (theme?.related_macro_factors ?? []).slice(0, 2);
  if (f.length) return `Watch ${f.join(" and ")} for confirmation or reversal of this thesis.`;
  return null;
}

interface ClusterCardProps {
  cluster:          StoryCluster;
  isSaved:          boolean;
  onSave:           () => void;
  isNew?:           boolean;
  isWatched?:       boolean;
  watchedEntities?: Set<string>;
  matchedTheme?:    ThemeIntelligence;
  affinity?:        ClusterAffinity;  // preference-affinity breakdown (dev annotation)
}

export function ClusterCard({
  cluster, isSaved, onSave, isNew, isWatched, watchedEntities, matchedTheme, affinity,
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
        {IS_DEV && affinity && <div className="px-3.5 pt-2"><RankedBecause affinity={affinity} /></div>}
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

        {/* ── Dev: why this story ranked here ──────────────────────────── */}
        {IS_DEV && affinity && <RankedBecause affinity={affinity} />}

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
          {/* Sentiment badge — always visible, derived from impact field */}
          {item.impact && (() => {
            const dir = impactDir(item.impact);
            if (!dir) return null;
            const [label, clr, bg] =
              dir === "bullish" ? ["↑ Bullish", "#10B981", "rgba(16,185,129,0.12)"] :
              dir === "bearish" ? ["↓ Bearish", "#EF4444", "rgba(239,68,68,0.10)"] :
                                  ["↕ Mixed",   "#F59E0B", "rgba(245,158,11,0.10)"];
            return (
              <span className="text-[8px] font-semibold px-1.5 py-0.5 rounded-full shrink-0 leading-none"
                    style={{ color: clr, background: bg }}>
                {label}
              </span>
            );
          })()}
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
                  <AnalysisNote
                    item={item}
                    color={color}
                    matchedTheme={matchedTheme}
                    themeLabel={theme_label}
                    deepData={deepData}
                    deepLoading={deepLoading}
                  />
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




// ── Research note section ─────────────────────────────────────────────────────

function NoteSection({
  label, color, children, last = false,
}: { label: string; color: string; children: React.ReactNode; last?: boolean }) {
  return (
    <div className="px-3 py-2.5"
      style={!last ? { borderBottom: "1px solid rgba(255,255,255,0.05)" } : {}}>
      <p className="text-[8.5px] font-bold uppercase tracking-[0.13em] mb-1"
        style={{ color: `${color}cc` }}>
        {label}
      </p>
      <div className="text-[11.5px] leading-relaxed" style={{ color: "rgba(255,255,255,0.74)" }}>
        {children}
      </div>
    </div>
  );
}


// ── Analysis note — full research panel ──────────────────────────────────────

function AnalysisNote({
  item, color, matchedTheme, themeLabel, deepData, deepLoading,
}: {
  item:          FeedItem;
  color:         string;
  matchedTheme:  ThemeIntelligence | undefined;
  themeLabel:    string;
  deepData:      DeepAnalysis | null;
  deepLoading:   boolean;
}) {
  const dir         = item.impact ? impactDir(item.impact) : null;
  const impactBody  = item.impact ? stripDir(item.impact)  : null;
  const bullCaseRaw = deriveBullCase(matchedTheme, deepData);
  const bearCaseRaw = deriveBearCase(matchedTheme);
  // Suppress the bear case when it is materially identical to the bull case
  const bearCase    = bullCaseRaw && bearCaseRaw && wordOverlap(bullCaseRaw, bearCaseRaw) > 0.70
    ? null : bearCaseRaw;
  const bullCase    = bullCaseRaw;
  const watchNext   = deriveWatchNext(matchedTheme, deepData, bearCase);

  const industries       = (matchedTheme?.related_industries ?? []).slice(0, 5);
  const macroFacts       = (matchedTheme?.related_macro_factors ?? []).slice(0, 4);
  const themePublicLabel = matchedTheme ? getPublicThemeLabel(matchedTheme) : null;
  // Only show Themes & Drivers when there is actual displayable content
  const hasDrivers       = !!(themePublicLabel || macroFacts.length
    || (themeLabel && themeLabel !== item.category));

  const dirColor  = dir === "bullish" ? "#10B981" : dir === "bearish" ? "#EF4444" : "#F59E0B";
  const sectorDir = matchedTheme?.momentum_direction;
  const chipBg    = sectorDir === "bullish" ? "rgba(16,185,129,0.10)"
                  : sectorDir === "bearish" ? "rgba(239,68,68,0.10)"
                  :                           "rgba(255,255,255,0.06)";
  const chipColor = sectorDir === "bullish" ? "rgba(16,185,129,0.85)"
                  : sectorDir === "bearish" ? "rgba(239,68,68,0.80)"
                  :                           "rgba(255,255,255,0.52)";
  const chipPfx   = sectorDir === "bullish" ? "+" : sectorDir === "bearish" ? "−" : "→";

  // How many sections will render — last section gets no bottom border
  const sections = [
    !!item.why_it_matters,
    !!impactBody,
    industries.length > 0,
    !!(bullCase || deepLoading),
    !!bearCase,
    hasDrivers,
    !!(watchNext || deepLoading),
  ];
  const lastIdx = sections.lastIndexOf(true);

  return (
    <div
      className="rounded-md mb-3 overflow-hidden"
      style={{ background: `${color}09`, border: `1px solid ${color}28` }}
    >
      {/* 1. Why It Matters */}
      {item.why_it_matters && (
        <NoteSection label="Why It Matters" color={color} last={lastIdx === 0}>
          {item.why_it_matters}
        </NoteSection>
      )}

      {/* 2. Market Impact */}
      {impactBody && (
        <div className="px-3 py-2.5"
          style={lastIdx !== 1 ? { borderBottom: "1px solid rgba(255,255,255,0.05)" } : {}}>
          <div className="flex items-center gap-2 mb-1">
            <p className="text-[8.5px] font-bold uppercase tracking-[0.13em]"
              style={{ color: `${color}cc` }}>
              Market Impact
            </p>
            {dir && (
              <span className="text-[8px] font-semibold px-1.5 py-0.5 rounded-full"
                style={{ color: dirColor, background: `${dirColor}18` }}>
                {dir === "bullish" ? "↑ Bullish" : dir === "bearish" ? "↓ Bearish" : "↕ Mixed"}
              </span>
            )}
          </div>
          <p className="text-[11.5px] leading-relaxed" style={{ color: "rgba(255,255,255,0.74)" }}>
            {impactBody}
          </p>
        </div>
      )}

      {/* 3. Affected Sectors */}
      {industries.length > 0 && (
        <div className="px-3 py-2.5"
          style={lastIdx !== 2 ? { borderBottom: "1px solid rgba(255,255,255,0.05)" } : {}}>
          <p className="text-[8.5px] font-bold uppercase tracking-[0.13em] mb-1.5"
            style={{ color: `${color}cc` }}>
            Affected Sectors
          </p>
          <div className="flex flex-wrap gap-1.5">
            {industries.map(ind => (
              <span key={ind}
                className="text-[9.5px] font-medium px-1.5 py-0.5 rounded"
                style={{ background: chipBg, color: chipColor }}>
                {chipPfx} {ind}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* 4. Bull Case */}
      {(bullCase || deepLoading) && (
        <div className="px-3 py-2.5"
          style={{
            borderBottom: lastIdx !== 3 ? "1px solid rgba(255,255,255,0.05)" : undefined,
            borderLeft:   "2px solid rgba(16,185,129,0.35)",
          }}>
          <p className="text-[8.5px] font-bold uppercase tracking-[0.13em] mb-1"
            style={{ color: "rgba(16,185,129,0.75)" }}>
            Bull Case
          </p>
          {bullCase ? (
            <p className="text-[11.5px] leading-relaxed" style={{ color: "rgba(255,255,255,0.74)" }}>
              {bullCase}
            </p>
          ) : (
            <div className="flex items-center gap-1.5 text-[10px]"
              style={{ color: "rgba(255,255,255,0.35)" }}>
              <Loader2 size={9} className="animate-spin" /> Analyzing…
            </div>
          )}
        </div>
      )}

      {/* 5. Bear Case */}
      {bearCase && (
        <div className="px-3 py-2.5"
          style={{
            borderBottom: lastIdx !== 4 ? "1px solid rgba(255,255,255,0.05)" : undefined,
            borderLeft:   "2px solid rgba(239,68,68,0.35)",
          }}>
          <p className="text-[8.5px] font-bold uppercase tracking-[0.13em] mb-1"
            style={{ color: "rgba(239,68,68,0.72)" }}>
            Bear Case
          </p>
          <p className="text-[11.5px] leading-relaxed" style={{ color: "rgba(255,255,255,0.74)" }}>
            {bearCase}
          </p>
        </div>
      )}

      {/* 6. Themes & Drivers */}
      {hasDrivers && (
        <div className="px-3 py-2.5"
          style={lastIdx !== 5 ? { borderBottom: "1px solid rgba(255,255,255,0.05)" } : {}}>
          <p className="text-[8.5px] font-bold uppercase tracking-[0.13em] mb-1.5"
            style={{ color: `${color}cc` }}>
            Themes &amp; Drivers
          </p>
          <div className="flex flex-wrap gap-1.5">
            {themePublicLabel && (
              <span className="text-[9.5px] font-medium px-1.5 py-0.5 rounded-full"
                style={{ background: "rgba(82,176,200,0.12)", color: "rgba(82,176,200,0.88)" }}>
                {themePublicLabel}
              </span>
            )}
            {!themePublicLabel && themeLabel && themeLabel !== item.category && (
              <span className="text-[9.5px] font-medium px-1.5 py-0.5 rounded-full"
                style={{ background: `${color}18`, color: `${color}cc` }}>
                {themeLabel}
              </span>
            )}
            {macroFacts.map(f => (
              <span key={f}
                className="text-[9.5px] px-1.5 py-0.5 rounded-full"
                style={{ background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.50)" }}>
                {f}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* 7. What To Watch Next */}
      {(watchNext || deepLoading) && (
        <div className="px-3 py-2.5">
          <p className="text-[8.5px] font-bold uppercase tracking-[0.13em] mb-1"
            style={{ color: `${color}cc` }}>
            What To Watch Next
          </p>
          {watchNext ? (
            <p className="text-[11.5px] leading-relaxed" style={{ color: "rgba(255,255,255,0.74)" }}>
              {watchNext}
            </p>
          ) : (
            <div className="flex items-center gap-1.5 text-[10px]"
              style={{ color: "rgba(255,255,255,0.35)" }}>
              <Loader2 size={9} className="animate-spin" /> Fetching signals…
            </div>
          )}
        </div>
      )}
    </div>
  );
}
