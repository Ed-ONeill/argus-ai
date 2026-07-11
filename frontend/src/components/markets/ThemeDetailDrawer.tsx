"use client";

import { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, AlertTriangle, Bookmark, BookmarkCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ThemeIntelligence } from "@/lib/types";
import {
  computeThemeEvolutionState,
  THEME_EVOLUTION_META,
  computeThemeLifecycleStage,
  THEME_LIFECYCLE_META,
  type ThemeLifecycleStage,
} from "@/lib/themeEvolution";
import { computeThemeHealth, themeBeneficiaries } from "@/lib/themeIntelligence";

// P2.7 (D12): the briefing / bull-bear / keyword watch & invalidation
// templates are deleted; prose is pipeline fields or shared records only.
function pipelineSentences(narrative?: string | null, max = 2): string[] {
  if (!narrative) return [];
  return narrative.replace(/→/g, ", ").replace(/ {2,}/g, " ").split(/(?<=\.)\s+/).map(x => x.trim()).filter(x => x.length > 12).slice(0, max);
}
import {
  cleanThemeName,
  cleanMacroLabel,
  confColor,
  convScore,
  convBasis,
  deriveKeyRisk,
  type DrawerData,
} from "@/app/markets/marketsShared";

const EVOLUTION_CLS: Record<string, string> = {
  accelerating:  "text-emerald-500",
  strengthening: "text-emerald-500",
  broadening:    "text-sky-400",
  stabilizing:   "text-slate-400",
  peaking:       "text-amber-400",
  weakening:     "text-orange-400",
  reversing:     "text-red-400",
};

const LIFECYCLE_STAGES: ThemeLifecycleStage[] = [
  "emerging", "building", "dominant", "maturing", "retiring",
];

function borderColorForTheme(t: ThemeIntelligence, evState: string): string {
  if (t.momentum_direction === "bullish") return "#10b981";
  if (t.momentum_direction === "bearish") return "#ef4444";
  if (evState === "accelerating" || evState === "strengthening" || evState === "broadening") return "#10b981";
  if (evState === "reversing"    || evState === "weakening") return "#ef4444";
  return "#f59e0b";
}

function deriveTimeHorizon(t: ThemeIntelligence): string {
  const { momentum_label, persistence_cycles, signal_quality, persistence_days } = t;
  if (momentum_label === "reversing")  return "Late cycle";
  if (momentum_label === "cooling")    return "1 to 3 months";
  if (momentum_label === "emerging")   return "Near term";
  if (persistence_cycles >= 6)         return "Structural";
  if (persistence_cycles >= 4)         return "6 to 12 months";
  if (momentum_label === "accelerating" && signal_quality === "confirmed") return "3 to 6 months";
  if (momentum_label === "strengthening") return "2 to 4 months";
  if (persistence_days  >= 60)         return "3 to 6 months";
  if (persistence_days  >= 30)         return "1 to 3 months";
  return "1 to 3 months";
}

// ── Lifecycle Journey ─────────────────────────────────────────────────────────

function LifecycleJourney({ stage }: { stage: ThemeLifecycleStage }) {
  const currentIdx = LIFECYCLE_STAGES.indexOf(stage);
  return (
    <div className="flex items-center w-full">
      {LIFECYCLE_STAGES.map((s, i) => {
        const isCurrent = i === currentIdx;
        const isPast    = i < currentIdx;
        const sMeta     = THEME_LIFECYCLE_META[s];
        return (
          <div key={s} className={cn("flex items-center", i < LIFECYCLE_STAGES.length - 1 ? "flex-1" : "shrink-0")}>
            <div
              className="w-[6px] h-[6px] rounded-full shrink-0"
              style={{
                background: isCurrent ? sMeta.color : isPast ? `${sMeta.color}40` : "transparent",
                border: `${isCurrent ? 2 : 1}px solid ${isCurrent ? sMeta.color : isPast ? `${sMeta.color}50` : "rgba(148,163,184,0.15)"}`,
                transform: isCurrent ? "scale(1.35)" : "none",
              }}
            />
            {i < LIFECYCLE_STAGES.length - 1 && (
              <div className="flex-1 h-px mx-1"
                style={{ background: i < currentIdx ? `${THEME_LIFECYCLE_META[s].color}25` : "rgba(148,163,184,0.08)" }} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// Recent confidence trajectory, reconstructed from current level + momentum delta.
function confSeries(score: number, delta: number, n = 7): number[] {
  const arr: number[] = [];
  for (let i = 0; i < n; i++) arr.push(Math.max(2, Math.min(100, score - delta * (n - 1 - i) * 0.5)));
  return arr;
}

function Sparkline({ data, color, width = 56, height = 16 }: { data: number[]; color: string; width?: number; height?: number }) {
  if (data.length < 2) return null;
  const max = Math.max(...data), min = Math.min(...data), span = Math.max(1, max - min);
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * (width - 2) + 1;
    const y = height - 1 - ((v - min) / span) * (height - 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
  return (
    <svg width={width} height={height} className="shrink-0" aria-hidden>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.25" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

function positioningTakeaway(t: ThemeIntelligence, benefits: string[]): string {
  // Short header pointer that names the securities; the full transmission
  // mechanism and best expressions live in the drawer body below.
  const tk = themeBeneficiaries(t, 3);
  if (tk.length > 0) {
    if (t.momentum_direction === "bearish") return `Most exposed to the downside: ${tk.join(", ")}.`;
    return `Most direct exposure runs through ${tk.join(", ")}.`;
  }
  const sector = benefits[0] ?? (t.related_industries ?? [])[0];
  if (!sector) return "Exposure concentrates in the highest-conviction names across the theme.";
  if (t.momentum_direction === "bearish") return `${sector} carries the most downside if the theme plays out.`;
  if (t.momentum_label === "reversing" || t.momentum_label === "cooling")
    return `${sector} tends to fade first as the theme rolls over.`;
  return `${sector} is the most direct way to express the theme.`;
}

// ── Theme Detail Drawer ───────────────────────────────────────────────────────

export function ThemeDetailDrawer({
  data, onClose, isFollowed, onToggleFollow,
}: {
  data:           DrawerData | null;
  onClose:        () => void;
  isFollowed:     boolean;
  onToggleFollow: () => void;
}) {
  // Lock body scroll while open
  useEffect(() => {
    if (data) document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, [data]);

  if (!data) return null;
  const { theme: t, upstream, downstream, connected, conflicts, shared } = data;
  const publicName = cleanThemeName(t.name);
  const evState    = computeThemeEvolutionState(t);
  const evMeta     = THEME_EVOLUTION_META[evState];
  const evCls      = EVOLUTION_CLS[evState] ?? "text-slate-400";
  const lcStage    = computeThemeLifecycleStage(t);
  const score      = t.confidence ?? 0;
  const cColor     = confColor(score);

  const benefits:  string[] = [];
  const pressures: string[] = [];
  const neutral:   string[] = [];
  for (const ind of (t.related_industries ?? [])) {
    const w = (t.relationship_weights ?? {})[ind];
    if (w?.direction === "positive")      benefits.push(ind);
    else if (w?.direction === "negative") pressures.push(ind);
    else                                  neutral.push(ind);
  }

  const bColor  = borderColorForTheme(t, evState);
  const health  = computeThemeHealth(t);
  // Phase 2.4: catalysts / invalidation / watch / conflicts come from the
  // shared risk read (lib/riskRead - the same engine records Explorer and the
  // Morning Brief show). The stored-field keyword generators survive ONLY as
  // the labeled fallback when the graph was unavailable at open time.
  const hasShared      = shared !== null && shared.basis === "graph";
  const catalysts      = hasShared ? shared.catalysts : [];
  const sharedWatch    = hasShared ? shared.watchItems : [];
  const sharedInvalidation = hasShared ? shared.invalidation : null;
  const sharedConflicts    = hasShared ? shared.contradictions : [];
  const briefingSents  = pipelineSentences(t.causal_narrative, 3);
  // P2.5 (D11): recorded exposure only - the curated securities dictionary
  // (bestExpressions winWhy / themeLosers loseWhy) is deleted. Downside
  // exposure = shared weakening edges, else recorded negative-weight sectors.
  const bestTickers    = themeBeneficiaries(t, 4);
  const negSectors     = (t.related_industries ?? []).filter(s => (t.relationship_weights ?? {})[s]?.direction === "negative");
  const exposedLabels  = hasShared && shared.weakening.length > 0
    ? { labels: shared.weakening.map(w => w.label).slice(0, 3), basis: "shared" as const }
    : negSectors.length > 0
      ? { labels: negSectors.slice(0, 3), basis: "stored" as const }
      : null;

  return (
    <AnimatePresence>
      {data && (
        <>
          {/* Backdrop */}
          <motion.div
            key="bd"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 bg-black/40 z-40"
            onClick={onClose}
          />
          {/* Drawer */}
          <motion.div
            key="drawer"
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 300 }}
            className="fixed right-0 top-0 h-full w-full sm:w-[420px] bg-surface z-50
                       overflow-y-auto shadow-drawer border-l border-edge"
            style={{ borderTop: `3px solid ${bColor}` }}
          >
            {/* Header */}
            <div className="sticky top-0 bg-surface/95 backdrop-blur-sm border-b border-edge px-5 py-4 z-10">
              <div className="flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                    <span className={cn("text-[10px] font-semibold uppercase tracking-wider", evCls)}
                      title="Current-state badge from today's snapshot - not cross-session history (ThemeMemory owns evolution)">
                      {evMeta.icon} {evMeta.label}
                    </span>
                    <span
                      className="text-[8.5px] font-bold px-1.5 py-0.5 rounded leading-none"
                      style={{ color: health.color, background: `${health.color}14` }}
                    >
                      {health.label}
                    </span>
                    {t.evidence_count > 0 && (
                      <span className="text-[9px] text-ink-muted/35">{t.evidence_count} signals</span>
                    )}
                  </div>
                  <h2 className="text-[22px] font-bold text-ink leading-tight tracking-tight">{publicName}</h2>
                  {/* Confidence + recent trajectory sparkline */}
                  <div className="flex items-center gap-2 mt-2">
                    <span className="text-[9px] tabular-nums font-semibold" style={{ color: cColor }}>
                      {convScore(score)} conviction
                    </span>
                    {convBasis(t) && <span className="text-[8px] text-ink-muted/50 tabular-nums">{convBasis(t)}</span>}
                    <Sparkline data={confSeries(score, t.momentum_delta ?? 0)} color={cColor} />
                    <span className="text-[8px] font-bold tabular-nums" style={{ color: (t.momentum_delta ?? 0) >= 0 ? "#10b981" : "#ef4444" }}>
                      {(t.momentum_delta ?? 0) >= 0 ? "+" : ""}{t.momentum_delta ?? 0}
                    </span>
                  </div>
                  {/* Positioning takeaway — analyst note */}
                  <p className="text-[10px] text-ink-secondary leading-snug mt-2 pl-2 border-l-2 italic" style={{ borderColor: bColor }}>
                    {positioningTakeaway(t, benefits)}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0 mt-0.5">
                  {/* Follow / Following toggle */}
                  <button
                    onClick={onToggleFollow}
                    className={cn(
                      "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-semibold",
                      "border transition-all duration-150",
                      isFollowed
                        ? "bg-accent text-white border-accent hover:bg-accent/90"
                        : "bg-surface text-ink-secondary border-edge hover:border-accent hover:text-accent",
                    )}
                  >
                    {isFollowed
                      ? <><BookmarkCheck size={11} /> Following</>
                      : <><Bookmark size={11} /> Follow</>
                    }
                  </button>
                  {/* Close */}
                  <button
                    onClick={onClose}
                    className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-raised
                               text-ink-muted hover:text-ink transition-colors"
                  >
                    <X size={15} />
                  </button>
                </div>
              </div>
            </div>

            {/* Body */}
            <div className="px-5 py-5 space-y-4">

              {/* ── Recorded Exposure — memory-confirmed + pipeline tickers ── */}
              {bestTickers.length > 0 && (
                <div className="rounded-lg border border-emerald-500/25 overflow-hidden">
                  <div className="px-4 py-2.5 border-b border-emerald-500/25 bg-emerald-500/12">
                    <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-emerald-300/80">Recorded Exposure</p>
                  </div>
                  <div className="px-4 py-3">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {bestTickers.map(tk => (
                        <span key={tk} className="text-[13px] font-black tabular-nums px-2 py-1 rounded-md bg-emerald-500/12 text-emerald-300 border border-emerald-500/25">{tk}</span>
                      ))}
                    </div>
                    <p className="text-[11px] text-ink-secondary leading-snug mt-2">
                      Memory-confirmed tickers first, then pipeline exposure. Recorded fields only.
                    </p>
                  </div>
                </div>
              )}

              {/* ── Most Exposed — shared weakening edges, else recorded
                     negative-weight sectors (no dictionary risk prose) ── */}
              {exposedLabels && (
                <div className="rounded-lg border border-red-500/25 overflow-hidden">
                  <div className="px-4 py-2.5 border-b border-red-500/25 bg-red-500/12 flex items-baseline gap-2">
                    <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-red-400/80">Most Exposed</p>
                    <span className="text-[8px] font-bold tracking-[0.1em] text-red-400/55">
                      {exposedLabels.basis === "shared" ? "RECORDED WEAKENING EDGES" : "STORED-FIELD READ"}
                    </span>
                  </div>
                  <div className="px-4 py-3">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {exposedLabels.labels.map(lb => (
                        <span key={lb} className="text-[12px] font-bold px-2 py-1 rounded-md bg-red-500/8 text-red-400/90 border border-red-500/20">{lb}</span>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* ── Trade Implications ─────────────────────────── */}
              {(() => {
                const timeHorizon = deriveTimeHorizon(t);
                const keyRisk     = deriveKeyRisk(t);
                return (
                  <div className="rounded-lg border border-edge overflow-hidden">
                    <div className="px-4 py-2.5 border-b border-edge bg-raised/60">
                      <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-ink-secondary">Trade Implications</p>
                    </div>
                    <div className="grid grid-cols-2">

                      {/* WINNERS */}
                      <div className="p-3 border-b border-r border-edge bg-emerald-500/12">
                        <p className="text-[8px] font-bold uppercase tracking-[0.18em] text-emerald-300/60 mb-2">
                          ↑ Winners
                        </p>
                        {benefits.length > 0 ? (
                          <div className="space-y-1">
                            {benefits.slice(0, 4).map(ind => (
                              <div key={ind} className="flex items-center gap-1.5">
                                <span className="w-[5px] h-[5px] rounded-full shrink-0 bg-emerald-500" />
                                <span className="text-[11.5px] font-medium text-ink leading-snug">{ind}</span>
                              </div>
                            ))}
                            {benefits.length > 4 && (
                              <p className="text-[9.5px] text-emerald-400/60 pl-3.5">+{benefits.length - 4} more</p>
                            )}
                          </div>
                        ) : (
                          <p className="text-[11px] text-ink-muted italic">-</p>
                        )}
                      </div>

                      {/* LOSERS */}
                      <div className="p-3 border-b border-edge bg-red-500/12">
                        <p className="text-[8px] font-bold uppercase tracking-[0.18em] text-red-400/60 mb-2">
                          ↓ Losers
                        </p>
                        {pressures.length > 0 ? (
                          <div className="space-y-1">
                            {pressures.slice(0, 4).map(ind => (
                              <div key={ind} className="flex items-center gap-1.5">
                                <span className="w-[5px] h-[5px] rounded-full shrink-0 bg-red-500" />
                                <span className="text-[11.5px] font-medium text-ink leading-snug">{ind}</span>
                              </div>
                            ))}
                            {pressures.length > 4 && (
                              <p className="text-[9.5px] text-red-400/60 pl-3.5">+{pressures.length - 4} more</p>
                            )}
                          </div>
                        ) : (
                          <p className="text-[11px] text-ink-muted italic">-</p>
                        )}
                      </div>

                      {/* TIME HORIZON */}
                      <div className="p-3 border-r border-edge bg-sky-500/12">
                        <p className="text-[8px] font-bold uppercase tracking-[0.18em] text-sky-600/60 mb-2">
                          Time Horizon
                        </p>
                        <p className="text-[12px] font-semibold text-ink leading-snug">{timeHorizon}</p>
                        {t.persistence_cycles > 0 && (
                          <p className="text-[9.5px] text-ink-muted mt-1">
                            {t.persistence_cycles} cycle{t.persistence_cycles !== 1 ? "s" : ""} persistent
                            {t.persistence_days > 0 && ` · ${t.persistence_days}d`}
                          </p>
                        )}
                      </div>

                      {/* KEY RISK */}
                      <div className="p-3 bg-amber-500/12">
                        <p className="text-[8px] font-bold uppercase tracking-[0.18em] text-amber-600/60 mb-2">
                          Key Risk
                        </p>
                        <p className="text-[11.5px] font-medium text-ink leading-snug">{keyRisk}</p>
                        {t.volatility_score > 0 && (
                          <div className="flex items-center gap-1.5 mt-1.5">
                            <span className="text-[8.5px] text-ink-muted">Volatility</span>
                            <div className="w-12 h-[2px] rounded-full bg-edge overflow-hidden">
                              <div className="h-full rounded-full"
                                style={{
                                  width: `${t.volatility_score}%`,
                                  background: t.volatility_score >= 70 ? "#ef4444" : t.volatility_score >= 40 ? "#f59e0b" : "#94a3b8",
                                }} />
                            </div>
                            <span className="text-[8.5px] tabular-nums text-ink-muted">{t.volatility_score}</span>
                          </div>
                        )}
                      </div>

                    </div>
                  </div>
                );
              })()}

              {/* Bull / Bear Cases */}
              <div className="rounded-lg border border-edge overflow-hidden">
                <div className="px-4 py-2.5 border-b border-edge bg-raised/60">
                  <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-ink-secondary">{"What's Working / What's Breaking"}</p>
                </div>
                <div className="grid grid-cols-2">
                  <div className="px-3.5 py-3 border-r border-edge"
                       style={{ borderLeft: "2px solid rgba(16,185,129,0.35)" }}>
                    <p className="text-[7.5px] font-bold uppercase tracking-[0.18em] text-emerald-400/60 mb-1.5">Pipeline Thesis</p>
                    <p className="text-[12px] text-ink-secondary leading-relaxed">
                      {briefingSents[0] ?? "No recorded thesis narrative from the pipeline."}
                    </p>
                  </div>
                  <div className="px-3.5 py-3"
                       style={{ borderLeft: "2px solid rgba(239,68,68,0.30)" }}>
                    <p className="text-[7.5px] font-bold uppercase tracking-[0.18em] text-red-400/60 mb-1.5">What Breaks It · shared engines</p>
                    <p className="text-[12px] text-ink-secondary leading-relaxed">
                      {sharedInvalidation ?? sharedConflicts[0]?.detail ?? "No recorded invalidation or contradiction yet."}
                    </p>
                  </div>
                </div>
              </div>

              {/* Why It Matters */}
              {(briefingSents.length > 0 || upstream.length > 0) && (
                <div className="rounded-lg border border-edge overflow-hidden">
                  <div className="px-4 py-2.5 border-b border-edge bg-raised/60">
                    <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-ink-secondary">Transmission Mechanism</p>
                  </div>
                  <div className="px-4 py-4 space-y-3">
                    {briefingSents.length > 0 && (
                      <div className="space-y-2">
                        {briefingSents.map((sent, si) => (
                          <p key={si}
                            className="text-[13px] text-ink-secondary leading-[1.65]"
                            style={si === 0 ? { borderLeft: `2px solid ${bColor}40`, paddingLeft: "1rem" } : { paddingLeft: "1rem" }}
                          >
                            {sent}
                          </p>
                        ))}
                      </div>
                    )}
                    {upstream.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 items-center pt-2 border-t border-edge/40">
                        <span className="text-[8.5px] text-ink-muted/50 uppercase tracking-wider font-semibold">
                          Driven by
                        </span>
                        {upstream.map(u => (
                          <span key={u} className="text-[10.5px] text-ink-secondary px-2 py-0.5 rounded bg-raised border border-edge">
                            {cleanMacroLabel(u)}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Sector Exposure */}
              {(neutral.length > 0 || benefits.length > 4 || pressures.length > 4) && (
                <div className="rounded-lg border border-edge overflow-hidden">
                  <div className="px-4 py-2.5 border-b border-edge bg-raised/60">
                    <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-ink-secondary">Sector Exposure</p>
                  </div>
                  <div className="grid grid-cols-2">
                    {(benefits.length > 0 || neutral.length > 0) && (
                      <div className="p-3.5 border-r border-edge/50">
                        <p className="text-[8px] font-bold uppercase tracking-widest text-emerald-400/60 mb-2.5">
                          ↑ Benefits
                        </p>
                        <div className="space-y-1.5">
                          {[...benefits, ...neutral].slice(0, 7).map(ind => (
                            <div key={ind} className="flex items-center gap-2">
                              <span className="w-1 h-1 rounded-full shrink-0"
                                style={{ background: benefits.includes(ind) ? "#10b981" : "#94a3b8" }} />
                              <span className="text-[12px] text-ink-secondary">{ind}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {pressures.length > 0 && (
                      <div className="p-3.5">
                        <p className="text-[8px] font-bold uppercase tracking-widest text-red-400/60 mb-2.5">
                          ↓ Pressures
                        </p>
                        <div className="space-y-1.5">
                          {pressures.slice(0, 7).map(ind => (
                            <div key={ind} className="flex items-center gap-2">
                              <span className="w-1 h-1 rounded-full shrink-0 bg-red-400" />
                              <span className="text-[12px] text-ink-secondary">{ind}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* What Changes Our View - shared watch items (derived, dateless),
                  or the labeled stored-field fallback when the graph was down */}
              {sharedWatch.length > 0 && (
                <div className="rounded-lg border border-amber-500/25 overflow-hidden">
                  <div className="px-4 py-2.5 border-b border-amber-500/25 bg-amber-500/12 flex items-center justify-between">
                    <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-amber-600/80">What Changes Our View</p>
                    <p className="text-[7.5px] font-bold tracking-[0.1em] text-amber-600/55">DERIVED</p>
                  </div>
                  <div className="divide-y divide-amber-500/15">
                    {sharedWatch.map((item, i) => (
                      <div key={`sw-${i}`} className="px-4 py-3">
                        <p className="text-[11px] text-ink-secondary leading-snug">{item}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Catalysts - verified, dateless (recorded series/releases in the
                  shared graph). No dated calendar is ingested; nothing simulated. */}
              {catalysts.length > 0 && (
                <div className="rounded-lg border border-edge overflow-hidden">
                  <div className="px-4 py-2.5 border-b border-edge bg-raised/60 flex items-center justify-between">
                    <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-ink-secondary">Catalysts</p>
                    <p className="text-[8px] font-bold tracking-[0.1em]" style={{ color: "#fbbf24" }}>VERIFIED · NO DATE</p>
                  </div>
                  <div className="divide-y divide-edge/50">
                    {catalysts.map((cat, i) => (
                      <div key={i} className="px-4 py-3 flex items-start gap-3">
                        <span className="text-[13px] leading-none mt-0.5" style={{ color: "#a78bfa" }}>◆</span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
                            <span className="text-[11px] font-semibold text-ink">{cat.label}</span>
                            <span className="text-[7.5px] font-bold px-1 py-px rounded leading-none text-ink-muted bg-raised border border-edge">
                              feeds {cat.feeds}
                            </span>
                          </div>
                          <p className="text-[10.5px] text-ink-secondary leading-snug">{cat.detail}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Related Themes */}
              {connected.length > 0 && (
                <div className="rounded-lg border border-edge overflow-hidden">
                  <div className="px-4 py-2.5 border-b border-edge bg-raised/60">
                    <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-ink-secondary">Related Themes</p>
                  </div>
                  <div className="p-4 flex flex-wrap gap-2">
                    {connected.map(c => {
                      const lc = c.linkType === "shared-story" ? "#38bdf8" :
                                 c.linkType === "shared-asset" ? "#a78bfa" : "#94a3b8";
                      const linkLabel = c.linkType === "shared-story" ? "shared narrative"
                                      : c.linkType === "shared-asset" ? "shared exposure"
                                      : "sector overlap";
                      return (
                        <span key={c.id} className="text-[11px] px-2.5 py-1.5 rounded-lg font-medium"
                          style={{ color: lc, background: `${lc}12`, border: `1px solid ${lc}28` }}>
                          {cleanThemeName(c.name)}
                          <span className="ml-1.5 text-[8.5px] font-normal" style={{ opacity: 0.55 }}>
                            {linkLabel}
                          </span>
                        </span>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* How It Works */}
              {(upstream.length > 0 || downstream.length > 0) && (
                <div className="rounded-lg border border-edge overflow-hidden">
                  <div className="px-4 py-2.5 border-b border-edge bg-raised/60">
                    <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-ink-secondary">How It Works</p>
                  </div>
                  <div className="flex items-stretch gap-0">
                    {/* Drivers */}
                    <div className="flex-1 bg-raised px-3 py-3">
                      <p className="text-[8px] font-bold uppercase tracking-widest text-ink-muted/35 mb-2">Root Cause</p>
                      <div className="space-y-1">
                        {upstream.slice(0, 3).map(u => (
                          <p key={u} className="text-[11.5px] text-ink-secondary font-medium">{cleanMacroLabel(u)}</p>
                        ))}
                        {upstream.length > 3 && (
                          <p className="text-[10px] text-ink-muted/40">+{upstream.length - 3} more</p>
                        )}
                      </div>
                    </div>
                    {/* Arrow */}
                    <div className="flex items-center justify-center px-2 bg-surface border-x border-edge shrink-0">
                      <span className="text-[13px] text-ink-muted/25 select-none">→</span>
                    </div>
                    {/* Theme */}
                    <div className="flex-1 bg-surface px-3 py-3" style={{ borderBottom: `2px solid ${bColor}40` }}>
                      <p className="text-[8px] font-bold uppercase tracking-widest text-ink-muted/35 mb-2">Theme</p>
                      <p className="text-[12px] font-bold text-ink">{publicName}</p>
                    </div>
                    {/* Arrow */}
                    <div className="flex items-center justify-center px-2 bg-surface border-x border-edge shrink-0">
                      <span className="text-[13px] text-ink-muted/25 select-none">→</span>
                    </div>
                    {/* Impact */}
                    <div className="flex-1 bg-raised px-3 py-3">
                      <p className="text-[8px] font-bold uppercase tracking-widest text-ink-muted/35 mb-2">Impact</p>
                      <div className="space-y-1">
                        {downstream.slice(0, 3).map(d => (
                          <p key={d} className="text-[11.5px] text-ink-secondary line-clamp-1">{d}</p>
                        ))}
                        {downstream.length > 3 && (
                          <p className="text-[10px] text-ink-muted/40">+{downstream.length - 3} more</p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Lifecycle */}
              <div className="rounded-lg border border-edge overflow-hidden">
                <div className="px-4 py-2.5 border-b border-edge bg-raised/60">
                  <div className="flex items-center gap-2">
                    <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-ink-secondary">Lifecycle</p>
                    <span className="text-[9px] font-semibold" style={{ color: THEME_LIFECYCLE_META[lcStage].color }}>
                      · {THEME_LIFECYCLE_META[lcStage].label}
                    </span>
                  </div>
                </div>
                <div className="px-4 py-4">
                  <LifecycleJourney stage={lcStage} />
                  <div className="flex justify-between mt-2">
                    {LIFECYCLE_STAGES.map(s => (
                      <span key={s} className="text-[8px]"
                        style={{
                          color: s === lcStage ? THEME_LIFECYCLE_META[s].color : "rgba(148,163,184,0.28)",
                          fontWeight: s === lcStage ? 700 : 400,
                        }}>
                        {THEME_LIFECYCLE_META[s].label}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              {/* Thesis Invalidation - the prediction engine's recorded
                  condition (same record as Explorer/profile risks), or the
                  labeled keyword-template fallback without the graph */}
              {sharedInvalidation && (
                <div className="rounded-lg border border-edge overflow-hidden">
                  <div className="px-4 py-2.5 border-b border-edge bg-raised/60 flex items-center justify-between">
                    <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-ink-secondary">Thesis Invalidation</p>
                    <p className="text-[8px] text-ink-muted/45 font-bold tracking-[0.1em]">PREDICTION ENGINE</p>
                  </div>
                  <div className="divide-y divide-edge/50">
                    {sharedInvalidation && (
                      <div className="px-4 py-3">
                        <p className="text-[11px] font-semibold text-ink mb-1">{sharedInvalidation}</p>
                        <p className="text-[10.5px] text-ink-secondary leading-snug">Recorded invalidation condition for the forward view of this theme.</p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Signal Conflicts - shared evidence-engine contradiction records
                  (identical to Explorer / the Read), or the labeled stored-field
                  theme-overlap fallback when the graph was unavailable */}
              {(sharedConflicts.length > 0 || conflicts.length > 0) && (
                <div className="rounded-lg border border-amber-500/25 overflow-hidden">
                  <div className="px-4 py-2.5 border-b border-amber-500/25 bg-amber-500/12 flex items-center justify-between">
                    <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-amber-600/80">Signal Conflicts</p>
                    <p className="text-[7.5px] font-bold tracking-[0.1em] text-amber-600/55">
                      {sharedConflicts.length > 0 ? "EVIDENCE ENGINE" : "STORED-FIELD READ"}
                    </p>
                  </div>
                  <div className="divide-y divide-amber-500/15">
                    {sharedConflicts.slice(0, 3).map((c, i) => (
                      <div key={`sc-${i}`} className="flex items-start gap-2.5 px-4 py-3">
                        <AlertTriangle size={12} className="text-amber-500/70 shrink-0 mt-0.5" />
                        <p className="text-[12px] text-ink-secondary leading-relaxed">
                          {c.detail} <span className="text-ink-muted">sev {c.severity}</span>
                        </p>
                      </div>
                    ))}
                    {sharedConflicts.length === 0 && conflicts.slice(0, 3).map(c => (
                      <div key={c.id} className="flex items-start gap-2.5 px-4 py-3">
                        <AlertTriangle size={12} className="text-amber-500/70 shrink-0 mt-0.5" />
                        <p className="text-[12px] text-ink-secondary leading-relaxed">{c.description}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
