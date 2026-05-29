"use client";

import { useState, useEffect, useMemo } from "react";
import { motion } from "framer-motion";
import { X, Network, Bookmark, BookmarkCheck, AlertCircle } from "lucide-react";
import type { ThemeIntelligence } from "@/lib/types";
import { computeThemeMomentum, LIFECYCLE_META } from "@/lib/themeMomentum";

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
  const [sortBy, setSortBy] = useState<"signal" | "persistence" | "momentum">("signal");

  // ESC to close
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const SIGNAL_RANK: Record<string, number> = { strong: 3, medium: 2, weak: 1 };
  const MOMENTUM_RANK: Record<string, number> = {
    accelerating: 5, strengthening: 4, emerging: 3, stable: 2, cooling: 1, reversing: 0,
  };

  const sorted = [...themes].sort((a, b) => {
    if (sortBy === "persistence") return (b.persistence_score ?? 0) - (a.persistence_score ?? 0);
    if (sortBy === "momentum")    return (MOMENTUM_RANK[b.momentum_label] ?? 0) - (MOMENTUM_RANK[a.momentum_label] ?? 0);
    // signal: strong first, then by persistence_score
    const srank = (SIGNAL_RANK[b.signal_strength] ?? 0) - (SIGNAL_RANK[a.signal_strength] ?? 0);
    return srank !== 0 ? srank : (b.persistence_score ?? 0) - (a.persistence_score ?? 0);
  });

  const displayed = filter === "watchlist"
    ? sorted.filter(t => watchedIds.includes(t.id))
    : sorted;

  const signalCounts = {
    strong: themes.filter(t => t.signal_strength === "strong").length,
    medium: themes.filter(t => t.signal_strength === "medium").length,
    weak:   themes.filter(t => t.signal_strength === "weak").length,
  };

  const alertCount = themes.filter(t => hasAlert(t.id)).length;

  const momentumMap = useMemo(
    () => new Map(themes.map(t => [t.id, computeThemeMomentum(t)])),
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

          {/* Signal legend */}
          <div className="hidden md:flex items-center gap-4 flex-1">
            {(["strong", "medium", "weak"] as const).map(s => (
              <div key={s} className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full shrink-0" style={{ background: SIGNAL_COLOR[s] }} />
                <span className="text-[10px] capitalize" style={{ color: "rgba(255,255,255,0.36)" }}>{s}</span>
                <span className="text-[10px] font-bold tabular-nums" style={{ color: "rgba(255,255,255,0.55)" }}>
                  {signalCounts[s]}
                </span>
              </div>
            ))}
          </div>

          {/* Sort */}
          <div className="flex items-center gap-1">
            {(["signal", "persistence", "momentum"] as const).map(s => (
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
                {f === "watchlist" ? `Watchlist (${watchedIds.length})` : "All"}
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

      {/* ── Theme grid ──────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-5xl mx-auto px-6 py-6">
          {displayed.length === 0 ? (
            <p className="text-center py-16 text-sm" style={{ color: "rgba(255,255,255,0.28)" }}>
              {filter === "watchlist" ? "No themes on your watchlist." : "No active themes."}
            </p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {displayed.map((theme, i) => {
                const watched  = watchedIds.includes(theme.id);
                const alert    = hasAlert(theme.id);
                const sColor   = SIGNAL_COLOR[theme.signal_strength] ?? "#6B7280";
                const momentum = momentumMap.get(theme.id)!;
                const lcMeta   = LIFECYCLE_META[momentum.lifecycleState];

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
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5">
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
                        </div>
                        <div className="flex flex-col gap-1 items-end">
                          <div className="flex items-center gap-1.5">
                            <span className="text-[8px]" style={{ color: "rgba(255,255,255,0.20)" }}>P</span>
                            <div className="w-12 h-1 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.06)" }}>
                              <div className="h-full rounded-full" style={{ width: `${theme.persistence_score ?? 0}%`, background: sColor }} />
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <span className="text-[8px]" style={{ color: "rgba(255,255,255,0.20)" }}>B</span>
                            <div className="w-12 h-1 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.06)" }}>
                              <div className="h-full rounded-full" style={{ width: `${theme.breadth_score ?? 0}%`, background: "rgba(82,176,200,0.60)" }} />
                            </div>
                          </div>
                        </div>
                      </div>

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
