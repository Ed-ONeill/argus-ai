"use client";

import { useState, useEffect, useMemo } from "react";
import { motion } from "framer-motion";
import { X, Network, Bookmark, BookmarkCheck, AlertCircle } from "lucide-react";
import type { ThemeIntelligence } from "@/lib/types";
import {
  computeThemeMomentum,
  LIFECYCLE_META,
  type LifecycleState,
  type ThemeMomentumResult,
} from "@/lib/themeMomentum";
import { convictionLabel } from "@/lib/themeImpact";
import { generateIntelligenceAlerts, type IntelligenceAlert } from "@/lib/themeIntelligence";
import { deriveMorningBriefDeltas, type MorningBriefDelta } from "@/lib/intelligenceDeltas";
import { getTrackedThemes } from "@/lib/themeSnapshots";

// ── Safe fallback for missing/failed momentum computation ─────────────────────

const MOMENTUM_FALLBACK: ThemeMomentumResult = {
  lifecycleState:  "Mature",
  momentumLabel:   "Stable",
  momentumScore:   0,
  signalScore:     0,
  persistenceScore: 0,
  breadthScore:    0,
  components: {
    storyActivity: 0, podcastMentions: 0,
    industryPenetration: 0, maActivity: 0, vcActivity: 0,
  },
};

// ── Color helpers ──────────────────────────────────────────────────────────────

const SIGNAL_COLOR: Record<string, string> = {
  strong: "#10B981",
  medium: "#F59E0B",
  weak:   "#6B7280",
};

function momentumColor(label: string): string {
  if (label === "accelerating" || label === "strengthening") return "#10B981";
  if (label === "cooling"      || label === "reversing")     return "#EF4444";
  if (label === "emerging")                                  return "#52b0c8";
  return "rgba(255,255,255,0.42)";
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface ThemeTerminalProps {
  themes:        ThemeIntelligence[];
  watchedIds:    string[];
  hasAlert:      (id: string) => boolean;
  onToggleWatch: (id: string) => void;
  onSelectTheme: (theme: ThemeIntelligence) => void;
  onClose:       () => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function ThemeTerminal({
  themes, watchedIds, hasAlert, onToggleWatch, onSelectTheme, onClose,
}: ThemeTerminalProps) {
  const [filter, setFilter] = useState<"all" | "watchlist">("all");
  const [sortBy, setSortBy] = useState<"signal" | "persistence" | "momentum" | "lifecycle">("signal");

  // Phase 2.1 (Saved unification): the terminal's watchlist intelligence is
  // the CANONICAL change ledger (intelligenceDeltas over server ThemeMemory +
  // device snapshot history) - the same records the Morning Brief, Markets,
  // and Saved show, verbatim. The parallel watchlist snapshot store
  // (lib/watchlistIntelligence, D4) was deleted; the terminal only selects
  // and orders.
  const watchedSet = useMemo(() => new Set(watchedIds), [watchedIds]);
  const ledger = useMemo(
    () => deriveMorningBriefDeltas({ themes, previouslyTracked: getTrackedThemes() }),
    [themes],
  );
  // Highest-ranked ledger record per theme id, preserving canonical order.
  const deltaByThemeId = useMemo(() => {
    const idByName = new Map(themes.map(t => [t.name.toLowerCase(), t.id]));
    const m = new Map<string, { delta: MorningBriefDelta; rank: number }>();
    ledger.deltas.forEach((d, i) => {
      const id = idByName.get(d.entity.toLowerCase());
      if (id && !m.has(id)) m.set(id, { delta: d, rank: i });
    });
    return m;
  }, [ledger, themes]);

  const isUpKind = (k: MorningBriefDelta["kind"]) =>
    k === "STRENGTHENED" || k === "NEW" || k === "EXPANDED";

  // Watched changes: canonical records filtered to the watch, canonical order.
  const watchedChanges = useMemo(
    () => ledger.deltas
      .map(d => ({ delta: d, theme: themes.find(t => t.name.toLowerCase() === d.entity.toLowerCase()) ?? null }))
      .filter((x): x is { delta: MorningBriefDelta; theme: ThemeIntelligence } => x.theme !== null && watchedSet.has(x.theme.id))
      .slice(0, 5),
    [ledger, themes, watchedSet],
  );

  // Summary bar: watched themes, ledger-changed first, then by conviction.
  const watchedRanked = useMemo(
    () => [...themes]
      .filter(t => watchedSet.has(t.id))
      .sort((a, b) =>
        ((deltaByThemeId.get(a.id)?.rank ?? Number.POSITIVE_INFINITY) - (deltaByThemeId.get(b.id)?.rank ?? Number.POSITIVE_INFINITY)) ||
        ((b.confidence ?? 0) - (a.confidence ?? 0)))
      .slice(0, 5),
    [themes, watchedSet, deltaByThemeId],
  );

  // ESC to close
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // momentumMap MUST be declared before sorted — sorted's comparator closes over it.
  const momentumMap = useMemo(
    () => new Map(themes.map(t => {
      try {
        return [t.id, computeThemeMomentum(t)] as const;
      } catch (err) {
        if (process.env.NODE_ENV !== "production") {
          console.warn("[ThemeTerminal] momentum computation failed for theme:", t.id, err);
        }
        return [t.id, MOMENTUM_FALLBACK] as const;
      }
    })),
    [themes],
  );

  const SIGNAL_RANK: Record<string, number>    = { strong: 3, medium: 2, weak: 1 };
  const MOMENTUM_RANK: Record<string, number>  = {
    accelerating: 5, strengthening: 4, emerging: 3, stable: 2, cooling: 1, reversing: 0,
  };
  const LIFECYCLE_RANK: Record<LifecycleState, number> = {
    Dominant: 5, Accelerating: 4, Emerging: 3, Mature: 2, Reversing: 1, Broken: 0,
  };

  const sorted = [...themes].sort((a, b) => {
    if (sortBy === "persistence") return (b.persistence_score ?? 0) - (a.persistence_score ?? 0);
    if (sortBy === "momentum")    return (MOMENTUM_RANK[b.momentum_label] ?? 0) - (MOMENTUM_RANK[a.momentum_label] ?? 0);
    if (sortBy === "lifecycle") {
      const la = (momentumMap.get(a.id) ?? MOMENTUM_FALLBACK).lifecycleState;
      const lb = (momentumMap.get(b.id) ?? MOMENTUM_FALLBACK).lifecycleState;
      return (LIFECYCLE_RANK[lb] ?? 0) - (LIFECYCLE_RANK[la] ?? 0);
    }
    // signal: strong first, then by persistence_score
    const srank = (SIGNAL_RANK[b.signal_strength] ?? 0) - (SIGNAL_RANK[a.signal_strength] ?? 0);
    return srank !== 0 ? srank : (b.persistence_score ?? 0) - (a.persistence_score ?? 0);
  });

  const displayed = filter === "watchlist"
    ? [...themes]
        .filter(t => watchedIds.includes(t.id))
        .sort((a, b) =>
          ((deltaByThemeId.get(a.id)?.rank ?? Number.POSITIVE_INFINITY) - (deltaByThemeId.get(b.id)?.rank ?? Number.POSITIVE_INFINITY)) ||
          ((b.confidence ?? 0) - (a.confidence ?? 0)))
    : sorted;


  const alertCount = themes.filter(t => hasAlert(t.id)).length;

  const intelligenceAlerts: IntelligenceAlert[] = useMemo(
    () => generateIntelligenceAlerts(themes),
    [themes],
  );

  const convictionMap = useMemo(
    // P2.7: conviction is the PIPELINE number (canonical owner).
    () => new Map(themes.map(t => [t.id, Math.round(t.confidence ?? 0)] as const)),
    [themes],
  );

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.16 }}
      className="fixed inset-0 z-50 flex flex-col overflow-hidden"
      style={{ background: "#030710" }}
    >
      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div
        className="shrink-0 px-6 py-4"
        style={{ borderBottom: "1px solid rgba(255,255,255,0.06)", background: "rgba(3,7,16,0.97)" }}
      >
        <div className="max-w-5xl mx-auto flex items-center gap-4 flex-wrap">
          {/* Title */}
          <div className="flex items-center gap-2.5 shrink-0">
            <Network size={15} style={{ color: "#52b0c8" }} />
            <div>
              <h1
                className="text-[10px] font-bold uppercase tracking-[0.18em]"
                style={{ color: "rgba(255,255,255,0.72)" }}
              >
                Theme Intelligence Terminal
              </h1>
              <p className="text-[9px] mt-0.5" style={{ color: "rgba(255,255,255,0.28)" }}>
                {themes.length} active theme{themes.length !== 1 ? "s" : ""}
                {alertCount > 0 && (
                  <span className="ml-2 font-bold" style={{ color: "#F59E0B" }}>
                    · {alertCount} signal change{alertCount !== 1 ? "s" : ""}
                  </span>
                )}
              </p>
            </div>
          </div>

          {/* Lifecycle distribution */}
          <div className="hidden md:flex items-center gap-3 flex-1 flex-wrap">
            {(["Dominant", "Accelerating", "Emerging", "Mature", "Reversing", "Broken"] as const).map(lc => {
              const count = themes.filter(t => momentumMap.get(t.id)?.lifecycleState === lc).length;
              if (count === 0) return null;
              const meta = LIFECYCLE_META[lc];
              return (
                <div key={lc} className="flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: meta.color }} />
                  <span className="text-[9px]" style={{ color: "rgba(255,255,255,0.28)" }}>{lc}</span>
                  <span className="text-[9px] font-bold tabular-nums" style={{ color: "rgba(255,255,255,0.48)" }}>{count}</span>
                </div>
              );
            })}
          </div>

          {/* Sort */}
          <div className="flex items-center gap-1">
            {(["signal", "lifecycle", "persistence", "momentum"] as const).map(s => (
              <button
                key={s}
                onClick={() => setSortBy(s)}
                className="text-[9.5px] font-medium px-2.5 py-1 rounded capitalize transition-colors"
                style={{
                  background: sortBy === s ? "rgba(82,176,200,0.12)" : "transparent",
                  color:      sortBy === s ? "#52b0c8" : "rgba(255,255,255,0.30)",
                  border:     sortBy === s ? "1px solid rgba(82,176,200,0.22)" : "1px solid transparent",
                }}
              >
                {s}
              </button>
            ))}
          </div>

          {/* Filter */}
          <div className="flex items-center gap-1">
            {(["all", "watchlist"] as const).map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className="text-[9.5px] font-medium px-2.5 py-1 rounded capitalize transition-colors"
                style={{
                  background: filter === f ? "rgba(251,191,36,0.10)" : "transparent",
                  color:      filter === f ? "#F59E0B" : "rgba(255,255,255,0.30)",
                  border:     filter === f ? "1px solid rgba(251,191,36,0.18)" : "1px solid transparent",
                }}
              >
                {f === "watchlist" ? `Watched${watchedIds.length > 0 ? ` (${watchedIds.length})` : ""}` : "All"}
              </button>
            ))}
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-white/[0.05] transition-colors shrink-0"
            style={{ color: "rgba(255,255,255,0.36)" }}
          >
            <X size={15} />
          </button>
        </div>
      </div>

      {/* ── Watchlist Summary Bar ───────────────────────────────────────────── */}
      {watchedRanked.length > 0 && (
        <div
          className="shrink-0 px-6 py-2.5"
          style={{ borderBottom: "1px solid rgba(255,255,255,0.04)", background: "rgba(251,191,36,0.015)" }}
        >
          <div className="max-w-5xl mx-auto">
            <div className="flex items-center gap-2 mb-1.5">
              <p className="text-[8px] font-bold uppercase tracking-[0.16em]"
                style={{ color: "rgba(251,191,36,0.45)" }}>Watched Themes</p>
              {watchedIds.length > 5 && (
                <span className="text-[8px]" style={{ color: "rgba(255,255,255,0.22)" }}>
                  +{watchedIds.length - 5} more
                </span>
              )}
            </div>
            <div className="flex items-center gap-5 flex-wrap">
              {watchedRanked.map(t => {
                const d     = t.momentum_delta ?? 0;
                const color = d > 0 ? "#10B981" : d < 0 ? "#EF4444" : "rgba(255,255,255,0.38)";
                const arrow = d > 0 ? "▲" : d < 0 ? "▼" : "·";
                return (
                  <button
                    key={t.id}
                    onClick={() => onSelectTheme(t)}
                    className="flex items-center gap-1.5 hover:opacity-80 transition-opacity"
                  >
                    <span className="text-[9px] font-bold" style={{ color }}>{arrow}</span>
                    <span className="text-[10px] font-semibold" style={{ color: "rgba(255,255,255,0.65)" }}>
                      {t.name}
                    </span>
                    {d !== 0 && (
                      <span className="text-[8.5px] font-mono tabular-nums" style={{ color }}>
                        ({d > 0 ? "+" : ""}{Math.round(d)})
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ── Intelligence Alerts strip ────────────────────────────────────────── */}
      {intelligenceAlerts.length > 0 && filter === "all" && (
        <div
          className="shrink-0 px-6 py-3 hidden md:block"
          style={{ borderBottom: "1px solid rgba(255,255,255,0.04)", background: "rgba(255,255,255,0.010)" }}
        >
          <div className="max-w-5xl mx-auto">
            <p className="text-[8px] font-bold uppercase tracking-[0.16em] mb-2.5" style={{ color: "rgba(255,255,255,0.22)" }}>
              Intelligence Alerts
            </p>
            <div className="grid grid-cols-2 gap-x-8 gap-y-1.5">
              {intelligenceAlerts.map(alert => {
                const isUp       = alert.direction === "up";
                const isMajor    = alert.severity === "major";
                const isNotable  = alert.severity === "notable";
                const arrowColor = isUp
                  ? isMajor ? "#10B981" : isNotable ? "rgba(16,185,129,0.75)" : "rgba(16,185,129,0.50)"
                  : isMajor ? "#EF4444" : isNotable ? "rgba(239,68,68,0.75)"  : "rgba(239,68,68,0.50)";
                const theme = themes.find(t => t.id === alert.themeId);
                return (
                  <div key={alert.themeId} className="flex items-baseline gap-1.5 min-w-0">
                    <span className="text-[9px] font-bold shrink-0 tabular-nums" style={{ color: arrowColor }}>
                      {isUp ? "▲" : "▼"}
                    </span>
                    {theme ? (
                      <button
                        onClick={() => onSelectTheme(theme)}
                        className="text-[9.5px] font-semibold shrink-0 hover:opacity-80 transition-opacity"
                        style={{ color: isMajor ? "rgba(255,255,255,0.78)" : "rgba(255,255,255,0.55)" }}
                      >
                        {alert.themeName}
                      </button>
                    ) : (
                      <span
                        className="text-[9.5px] font-semibold shrink-0"
                        style={{ color: "rgba(255,255,255,0.55)" }}
                      >
                        {alert.themeName}
                      </span>
                    )}
                    <span className="text-[9px] truncate" style={{ color: "rgba(255,255,255,0.28)" }}>
                      · {alert.description}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ── Theme grid ──────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-5xl mx-auto px-6 py-6">

          {/* ── What Changed: the canonical ledger, filtered to the watch ──── */}
          {filter === "watchlist" && watchedChanges.length > 0 && (
            <div className="mb-5 rounded-xl p-4"
              style={{ background: "rgba(255,255,255,0.018)", border: "1px solid rgba(255,255,255,0.06)" }}>
              <p className="text-[8px] font-bold uppercase tracking-[0.16em] mb-3"
                style={{ color: "rgba(255,255,255,0.28)" }}>What Changed · shared change ledger</p>
              <div className="space-y-1.5">
                {watchedChanges.map(({ theme: t, delta }) => (
                  <button
                    key={`${delta.kind}-${t.id}`}
                    onClick={() => onSelectTheme(t)}
                    className="flex items-center gap-2 w-full text-left hover:opacity-80 transition-opacity"
                    title={delta.why}
                  >
                    <span
                      className="text-[9px] font-bold shrink-0"
                      style={{ color: isUpKind(delta.kind) ? "#10B981" : "#EF4444" }}
                    >
                      {isUpKind(delta.kind) ? "▲" : "▼"}
                    </span>
                    <span className="text-[10.5px]" style={{ color: "rgba(255,255,255,0.58)" }}>
                      {delta.what}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
          {displayed.length === 0 ? (
            <p className="text-center py-16 text-sm" style={{ color: "rgba(255,255,255,0.28)" }}>
              {filter === "watchlist" ? "No themes on your watchlist." : "No active themes."}
            </p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {displayed.map((theme, i) => {
                const watched        = watchedIds.includes(theme.id);
                const alert          = hasAlert(theme.id);
                const sColor   = SIGNAL_COLOR[theme.signal_strength] ?? "#6B7280";
                const momentum = momentumMap.get(theme.id) ?? MOMENTUM_FALLBACK;
                const lcMeta   = LIFECYCLE_META[momentum.lifecycleState] ?? LIFECYCLE_META.Mature;

                return (
                  <motion.div
                    key={theme.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.02, duration: 0.20 }}
                    className="relative rounded-xl cursor-pointer group"
                    style={{
                      background:   "rgba(255,255,255,0.025)",
                      border:       "1px solid rgba(255,255,255,0.06)",
                      transition:   "border-color 0.18s ease",
                    }}
                    onClick={() => onSelectTheme(theme)}
                    onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.borderColor = "rgba(255,255,255,0.11)"; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.borderColor = "rgba(255,255,255,0.06)"; }}
                  >
                    {/* Signal stripe */}
                    <div
                      className="absolute top-0 left-0 right-0 h-[2px] rounded-t-xl"
                      style={{ background: sColor }}
                    />

                    <div className="p-4 pt-5">
                      {/* Header */}
                      <div className="flex items-start gap-2 mb-2.5">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 mb-1.5 flex-wrap">
                            <span
                              className="text-[9px] font-bold uppercase tracking-[0.11em] px-1.5 py-0.5 rounded"
                              style={{ background: `${sColor}18`, color: sColor }}
                            >
                              {theme.signal_strength}
                            </span>
                            <span
                              className="text-[9px] font-bold uppercase tracking-[0.11em] px-1.5 py-0.5 rounded"
                              style={{ background: lcMeta.bg, color: lcMeta.color }}
                            >
                              {lcMeta.label}
                            </span>
                            {alert && (
                              <AlertCircle size={10} style={{ color: "#F59E0B" }} aria-label="Signal changed" />
                            )}
                            {watched && deltaByThemeId.get(theme.id) && (() => {
                              // Canonical ledger record for this theme; the chip
                              // renders its KIND verbatim - no local thresholds.
                              const { delta } = deltaByThemeId.get(theme.id)!;
                              const up = isUpKind(delta.kind);
                              const chipColor = up ? "#10B981" : "#EF4444";
                              return (
                                <span
                                  className="text-[8.5px] font-bold px-1.5 py-0.5 rounded"
                                  style={{ background: `${chipColor}14`, color: chipColor }}
                                  title={delta.what}
                                >
                                  {up ? "▲" : "▼"} {delta.kind}
                                </span>
                              );
                            })()}
                          </div>
                          <h3
                            className="text-[12.5px] font-semibold leading-snug group-hover:text-white/90 transition-colors"
                            style={{ color: "rgba(255,255,255,0.80)" }}
                          >
                            {theme.name}
                          </h3>
                        </div>
                        <button
                          onClick={e => { e.stopPropagation(); onToggleWatch(theme.id); }}
                          className="p-1.5 rounded-lg hover:bg-white/[0.06] transition-colors shrink-0"
                          style={{ color: watched ? "#F59E0B" : "rgba(255,255,255,0.20)" }}
                          title={watched ? "Remove from watchlist" : "Watch theme"}
                        >
                          {watched ? <BookmarkCheck size={12} /> : <Bookmark size={12} />}
                        </button>
                      </div>

                      {/* Description */}
                      <p
                        className="text-[11.5px] leading-relaxed mb-3 line-clamp-2"
                        style={{ color: "rgba(255,255,255,0.38)" }}
                      >
                        {theme.description}
                      </p>

                      {/* Footer */}
                      {(() => {
                        const cv = convictionMap.get(theme.id) ?? 0;
                        const cvColor = cv >= 70 ? "#10B981" : cv >= 45 ? "#F59E0B" : "#EF4444";
                        return (
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span
                                className="text-[10px] font-semibold"
                                style={{ color: momentumColor(theme.momentum_label) }}
                              >
                                {momentum.momentumLabel}
                              </span>
                              <span
                                className="text-[9px] font-mono tabular-nums px-1 py-0.5 rounded"
                                style={{
                                  background: momentum.momentumScore >= 0 ? "rgba(16,185,129,0.10)" : "rgba(239,68,68,0.10)",
                                  color:      momentum.momentumScore >= 0 ? "#10B981" : "#EF4444",
                                }}
                              >
                                {momentum.momentumScore > 0 ? "+" : ""}{momentum.momentumScore}
                              </span>
                              <span
                                className="text-[8.5px] font-bold tabular-nums px-1.5 py-0.5 rounded"
                                style={{ background: `${cvColor}12`, color: cvColor }}
                                title={`Conviction: ${convictionLabel(cv)}`}
                              >
                                CV {cv}
                              </span>
                            </div>
                            <div className="flex flex-col gap-1 items-end shrink-0">
                              <div className="flex items-center gap-1.5">
                                <span className="text-[8px]" style={{ color: "rgba(255,255,255,0.20)" }}>P</span>
                                <div className="w-10 h-1 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.06)" }}>
                                  <div className="h-full rounded-full" style={{ width: `${theme.persistence_score ?? 0}%`, background: sColor }} />
                                </div>
                              </div>
                              <div className="flex items-center gap-1.5">
                                <span className="text-[8px]" style={{ color: "rgba(255,255,255,0.20)" }}>B</span>
                                <div className="w-10 h-1 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.06)" }}>
                                  <div className="h-full rounded-full" style={{ width: `${theme.breadth_score ?? 0}%`, background: "rgba(82,176,200,0.60)" }} />
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })()}

                      {/* Industries (first 2) */}
                      {(theme.related_industries ?? []).length > 0 && (
                        <div className="mt-2.5 flex flex-wrap gap-1">
                          {theme.related_industries.slice(0, 2).map(ind => (
                            <span
                              key={ind}
                              className="text-[9px] px-1.5 py-0.5 rounded"
                              style={{
                                background: "rgba(82,176,200,0.07)",
                                color:      "rgba(82,176,200,0.60)",
                              }}
                            >
                              {ind}
                            </span>
                          ))}
                          {theme.related_industries.length > 2 && (
                            <span className="text-[9px]" style={{ color: "rgba(255,255,255,0.20)" }}>
                              +{theme.related_industries.length - 2}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}
