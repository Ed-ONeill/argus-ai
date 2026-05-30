"use client";

import { useEffect, useMemo } from "react";
import { motion } from "framer-motion";
import { X, Bookmark, BookmarkCheck, ExternalLink, Headphones } from "lucide-react";
import type { ThemeIntelligence, StoryCluster, Episode } from "@/lib/types";
import { matchEpisodeThemes } from "@/lib/listenIntelligence";
import {
  computeThemeMomentum, computeMomentumTrend, computeSignalChanges, parseCausalChain,
  LIFECYCLE_META,
  type ThemeMomentumResult,
} from "@/lib/themeMomentum";
import {
  computeCrossAssetImpact,
  computeConvictionScore, convictionLabel,
  type CrossAssetImpact,
} from "@/lib/themeImpact";
import {
  computeSignalDeltas, generateWeeklyChange,
  computeIndustryExposureRanking, computeAssetExposure,
  type SignalDelta, type AssetExposure,
} from "@/lib/themeSignalDelta";
import {
  generateNextCatalysts, generateBullBearCases, generateWatchSignals,
  type ThemeCatalyst, type BullBearCases, type WatchSignal,
} from "@/lib/themeIntelligence";

function fmtDur(s: number): string {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

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

// ── Section wrapper ────────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[9px] font-bold uppercase tracking-[0.14em] mb-2"
        style={{ color: "rgba(255,255,255,0.28)" }}>
        {title}
      </p>
      {children}
    </div>
  );
}

// ── Deal shape accepted by the drawer ─────────────────────────────────────────

export interface DrawerDeal {
  title?:    string;
  sector:    string;
  dealType:  string;
  entities?: string[];
  url?:      string;
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface ThemeDrawerProps {
  theme:            ThemeIntelligence;
  clusters:         StoryCluster[];
  deals:            DrawerDeal[];
  episodes?:        Episode[];
  isWatched:        boolean;
  hasAlert:         boolean;
  alertDirection?:  "up" | "down";
  onToggleWatch:    () => void;
  onClose:          () => void;
  sourceContext?:   "listen";  // elevates Podcasts section when opened from Listen
}

// ── Component ─────────────────────────────────────────────────────────────────

export function ThemeDrawer({
  theme, clusters, deals, episodes = [],
  isWatched, hasAlert, alertDirection,
  onToggleWatch, onClose, sourceContext,
}: ThemeDrawerProps) {

  // ESC to close
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const sColor = SIGNAL_COLOR[theme.signal_strength] ?? "#6B7280";

  // Connected stories — clusters referenced by this theme
  const connectedClusters = clusters
    .filter(c => (theme.contributing_cluster_ids ?? []).includes(c.id))
    .slice(0, 6);

  // Connected deals — sector or entity match
  const assetSet = new Set((theme.related_assets    ?? []).map(a => a.toUpperCase()));
  const indTerms = (theme.related_industries ?? []).map(i => i.toLowerCase());
  const connectedDeals = deals
    .filter(d => {
      const sec = d.sector.toLowerCase();
      return (
        indTerms.some(ind => sec.includes(ind) || ind.includes(sec)) ||
        (d.entities ?? []).some(e => assetSet.has(e.toUpperCase()))
      );
    })
    .slice(0, 5);

  // Connected podcasts — episodes that match this theme
  const connectedEpisodes = episodes
    .filter(ep => matchEpisodeThemes(ep, [theme], 1).length > 0)
    .slice(0, 5);

  // Momentum engine — full computation with all available context
  const momentum = useMemo((): ThemeMomentumResult => {
    try {
      return computeThemeMomentum(theme, { episodes, clusters, deals });
    } catch (err) {
      if (process.env.NODE_ENV !== "production") {
        console.warn("[ThemeDrawer] momentum computation failed:", err);
      }
      return MOMENTUM_FALLBACK;
    }
  }, [theme, episodes, clusters, deals]);
  const lcMeta       = LIFECYCLE_META[momentum.lifecycleState] ?? LIFECYCLE_META.Mature;
  const trendPoints  = useMemo(
    () => computeMomentumTrend(theme, momentum.momentumScore),
    [theme, momentum.momentumScore],
  );
  const signalChanges     = useMemo(() => computeSignalChanges(theme), [theme]);
  const causalChain       = useMemo(() => parseCausalChain(theme.causal_narrative ?? ""), [theme.causal_narrative]);
  const crossAssetImpacts: CrossAssetImpact[] = useMemo(() => computeCrossAssetImpact(theme), [theme]);
  const signalDeltas: SignalDelta[]            = useMemo(() => computeSignalDeltas(theme), [theme]);
  const weeklyChange      = useMemo(() => generateWeeklyChange(theme), [theme]);
  const industryExposure  = useMemo(() => computeIndustryExposureRanking(theme), [theme]);
  const assetExposure: AssetExposure[] = useMemo(() => computeAssetExposure(theme), [theme]);
  const conviction        = useMemo(() => computeConvictionScore(theme), [theme]);
  const cvLabel           = convictionLabel(conviction);
  const catalysts: ThemeCatalyst[]   = useMemo(() => generateNextCatalysts(theme),  [theme]);
  const bullBear: BullBearCases      = useMemo(() => generateBullBearCases(theme),   [theme]);
  const watchSignals: WatchSignal[]  = useMemo(() => generateWatchSignals(theme),    [theme]);

  // Top relationship weights
  const topRelationships = Object.entries(theme.relationship_weights ?? {})
    .sort(([, a], [, b]) => b.weight - a.weight)
    .slice(0, 5);

  return (
    // Backdrop
    <div
      className="fixed inset-0 z-50 flex justify-end"
      style={{ background: "rgba(0,0,0,0.65)" }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <motion.div
        initial={{ x: "100%" }}
        animate={{ x: 0 }}
        exit={{ x: "100%" }}
        transition={{ type: "spring", damping: 34, stiffness: 290 }}
        className="relative flex flex-col overflow-y-auto"
        style={{
          width:      "min(480px, 100vw)",
          height:     "100vh",
          background: "#050c1e",
          borderLeft: "1px solid rgba(255,255,255,0.07)",
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Signal stripe */}
        <div className="h-[3px] shrink-0" style={{ background: sColor }} />

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div
          className="sticky top-0 z-10 px-5 py-4 flex items-start gap-3 shrink-0"
          style={{ background: "#050c1e", borderBottom: "1px solid rgba(255,255,255,0.06)" }}
        >
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1.5 flex-wrap">
              <span
                className="text-[9.5px] font-bold uppercase tracking-[0.13em] px-2 py-0.5 rounded-full"
                style={{
                  background: `${sColor}18`,
                  color:       sColor,
                  border:      `1px solid ${sColor}30`,
                }}
              >
                {theme.signal_strength}
              </span>
              <span
                className="text-[9.5px] font-bold px-2 py-0.5 rounded-full"
                style={{ background: lcMeta.bg, color: lcMeta.color, border: `1px solid ${lcMeta.color}30` }}
              >
                {lcMeta.label}
              </span>
              {hasAlert && (
                <span
                  className="text-[9.5px] font-bold px-2 py-0.5 rounded-full"
                  style={{
                    background: alertDirection === "up" ? "rgba(16,185,129,0.15)" : "rgba(239,68,68,0.15)",
                    color:      alertDirection === "up" ? "#10B981" : "#EF4444",
                    border:     `1px solid ${alertDirection === "up" ? "#10B981" : "#EF4444"}30`,
                  }}
                >
                  Signal {alertDirection === "up" ? "↑" : "↓"}
                </span>
              )}
              {signalChanges.map(sc => (
                <span
                  key={sc.label}
                  className="text-[9px] font-semibold px-1.5 py-0.5 rounded"
                  style={{
                    background: sc.direction === "up" ? "rgba(16,185,129,0.10)" : "rgba(239,68,68,0.10)",
                    color:      sc.direction === "up" ? "#10B981" : "#EF4444",
                  }}
                >
                  {sc.direction === "up" ? "▲" : "▼"} {sc.label}
                </span>
              ))}
              <span className="text-[10px]" style={{ color: "rgba(255,255,255,0.30)" }}>
                {theme.confidence_label}
              </span>
            </div>
            <h2 className="text-[15px] font-semibold leading-tight" style={{ color: "rgba(255,255,255,0.88)" }}>
              {theme.name}
            </h2>
          </div>

          <div className="flex items-center gap-1 shrink-0 mt-0.5">
            <button
              onClick={onToggleWatch}
              className="p-2 rounded-lg transition-colors hover:bg-white/[0.05]"
              style={{ color: isWatched ? "#F59E0B" : "rgba(255,255,255,0.28)" }}
              title={isWatched ? "Remove from watchlist" : "Add to watchlist"}
            >
              {isWatched ? <BookmarkCheck size={14} /> : <Bookmark size={14} />}
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-lg transition-colors hover:bg-white/[0.05]"
              style={{ color: "rgba(255,255,255,0.28)" }}
            >
              <X size={14} />
            </button>
          </div>
        </div>

        {/* ── Body ───────────────────────────────────────────────────────── */}
        <div className="flex-1 px-5 py-5 space-y-5">

          {/* Description */}
          {theme.description && (
            <p className="text-[12.5px] leading-relaxed" style={{ color: "rgba(255,255,255,0.50)" }}>
              {theme.description}
            </p>
          )}

          {/* Signal Deltas — most important: change events, not state */}
          {signalDeltas.length > 0 && (
            <div
              className="rounded-xl p-3.5"
              style={{ background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.07)" }}
            >
              <p className="text-[9px] font-bold uppercase tracking-[0.14em] mb-2.5"
                style={{ color: "rgba(255,255,255,0.24)" }}>
                Signal Delta
              </p>
              <div className="flex flex-wrap gap-1.5">
                {signalDeltas.map((d, i) => {
                  const color = d.direction === "up" ? "#10B981" : "#EF4444";
                  const arrow = d.direction === "up" ? "▲" : "▼";
                  const opacity = d.magnitude === "strong" ? 1.0 : d.magnitude === "moderate" ? 0.80 : 0.60;
                  return (
                    <span
                      key={i}
                      className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-1 rounded-lg"
                      style={{
                        background: `${color}12`,
                        color,
                        border:     `1px solid ${color}25`,
                        opacity,
                      }}
                    >
                      <span className="text-[9px]">{arrow}</span>
                      <span className="text-[9px] opacity-60">{d.category}</span>
                      <span>{d.label}</span>
                    </span>
                  );
                })}
              </div>
            </div>
          )}

          {/* What Changed This Week */}
          <div
            className="rounded-xl p-3.5"
            style={{ background: "rgba(82,176,200,0.035)", border: "1px solid rgba(82,176,200,0.09)" }}
          >
            <p className="text-[9px] font-bold uppercase tracking-[0.14em] mb-2"
              style={{ color: "rgba(82,176,200,0.45)" }}>
              What Changed
            </p>
            <p className="text-[12px] leading-relaxed" style={{ color: "rgba(255,255,255,0.60)" }}>
              {weeklyChange}
            </p>
          </div>

          {/* Next Catalyst */}
          {catalysts.length > 0 && (
            <div
              className="rounded-xl p-3.5"
              style={{ background: "rgba(251,191,36,0.030)", border: "1px solid rgba(251,191,36,0.10)" }}
            >
              <p className="text-[9px] font-bold uppercase tracking-[0.14em] mb-2.5"
                style={{ color: "rgba(251,191,36,0.55)" }}>
                Next Catalyst
              </p>
              <div className="space-y-2">
                {catalysts.map(cat => (
                  <div key={cat.label} className="flex items-start gap-2">
                    <span
                      className="text-[8.5px] font-bold px-1.5 py-0.5 rounded shrink-0 mt-0.5"
                      style={{
                        background: cat.direction === "confirming" ? "rgba(16,185,129,0.12)" : "rgba(239,68,68,0.12)",
                        color:      cat.direction === "confirming" ? "#10B981" : "#EF4444",
                      }}
                    >
                      {cat.direction === "confirming" ? "✓ Confirming" : "⚠ Risk"}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] font-semibold leading-snug" style={{ color: "rgba(255,255,255,0.72)" }}>
                        {cat.label}
                      </p>
                      <p className="text-[10px] leading-snug mt-0.5" style={{ color: "rgba(255,255,255,0.35)" }}>
                        {cat.reason}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Podcasts — hoisted here when opened from Listen */}
          {sourceContext === "listen" && connectedEpisodes.length > 0 && (
            <Section title={`Podcasts · ${connectedEpisodes.length}`}>
              <div className="space-y-3">
                {connectedEpisodes.map(ep => (
                  <div key={ep.id} className="flex items-start gap-2.5">
                    <div
                      className="shrink-0 w-7 h-7 rounded-lg flex items-center justify-center mt-0.5"
                      style={{ background: "rgba(16,185,129,0.08)", border: "1px solid rgba(16,185,129,0.14)" }}
                    >
                      <Headphones size={11} style={{ color: "rgba(16,185,129,0.70)" }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[12px] leading-snug line-clamp-2"
                        style={{ color: "rgba(255,255,255,0.72)" }}>
                        {ep.title}
                      </p>
                      <p className="text-[10px] mt-0.5 flex items-center gap-1.5"
                        style={{ color: "rgba(255,255,255,0.30)" }}>
                        <span>{ep.show_name}</span>
                        {ep.duration_seconds > 0 && (
                          <><span style={{ color: "rgba(255,255,255,0.16)" }}>·</span>
                          <span>{fmtDur(ep.duration_seconds)}</span></>
                        )}
                      </p>
                    </div>
                    {ep.external_url && (
                      <a
                        href={ep.external_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="shrink-0 p-1.5 rounded-lg transition-colors hover:bg-white/[0.05]"
                        style={{ color: "rgba(16,185,129,0.60)" }}
                      >
                        <ExternalLink size={11} />
                      </a>
                    )}
                  </div>
                ))}
              </div>
            </Section>
          )}

          {/* Causal chain */}
          {causalChain.length > 0 && (
            <div
              className="rounded-xl p-3.5"
              style={{ background: "rgba(82,176,200,0.04)", border: "1px solid rgba(82,176,200,0.10)" }}
            >
              <p className="text-[9px] font-bold uppercase tracking-[0.14em] mb-2.5"
                style={{ color: "rgba(82,176,200,0.50)" }}>
                Causal Chain
              </p>
              <div className="space-y-0">
                {causalChain.map((step, i) => (
                  <div key={i}>
                    <p className="text-[12px] leading-snug" style={{ color: "rgba(255,255,255,0.65)" }}>
                      {step}
                    </p>
                    {i < causalChain.length - 1 && (
                      <p className="text-[11px] leading-none my-1.5" style={{ color: "rgba(82,176,200,0.38)" }}>↓</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Signal metrics */}
          <div className="grid grid-cols-2 gap-2">
            {[
              { label: "Signal Score", value: String(momentum.signalScore),         unit: "/100"     },
              { label: "Persistence",  value: String(theme.persistence_score ?? 0), unit: "/100"     },
              { label: "Breadth",      value: String(theme.breadth_score ?? 0),      unit: "/100"     },
              { label: "Evidence",     value: String(theme.evidence_count ?? 0),     unit: " sources" },
            ].map(m => (
              <div
                key={m.label}
                className="rounded-lg p-2.5 text-center"
                style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.05)" }}
              >
                <p className="text-[9px] font-bold uppercase tracking-[0.10em] mb-0.5"
                  style={{ color: "rgba(255,255,255,0.26)" }}>{m.label}</p>
                <p className="text-[16px] font-bold tabular-nums leading-tight"
                  style={{ color: "rgba(255,255,255,0.82)" }}>
                  {m.value}
                  <span className="text-[9px] font-normal" style={{ color: "rgba(255,255,255,0.26)" }}>
                    {m.unit}
                  </span>
                </p>
              </div>
            ))}
          </div>

          {/* Conviction row */}
          <div
            className="flex items-center justify-between px-3.5 py-2.5 rounded-xl"
            style={{ background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.05)" }}
          >
            <div>
              <p className="text-[9px] font-bold uppercase tracking-[0.12em] mb-0.5"
                style={{ color: "rgba(255,255,255,0.26)" }}>Conviction</p>
              <p className="text-[10.5px]" style={{ color: "rgba(255,255,255,0.45)" }}>
                {cvLabel} Conviction
              </p>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-20 h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.06)" }}>
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${conviction}%`,
                    background: conviction >= 70 ? "#10B981" : conviction >= 45 ? "#F59E0B" : "#EF4444",
                  }}
                />
              </div>
              <span
                className="text-[15px] font-black tabular-nums leading-none"
                style={{
                  color: conviction >= 70 ? "#10B981" : conviction >= 45 ? "#F59E0B" : "#EF4444",
                }}
              >
                {conviction}
              </span>
            </div>
          </div>

          {/* Bull Case / Bear Case */}
          <div className="grid grid-cols-2 gap-2">
            <div
              className="rounded-xl p-3"
              style={{ background: "rgba(16,185,129,0.04)", border: "1px solid rgba(16,185,129,0.10)" }}
            >
              <p className="text-[8.5px] font-bold uppercase tracking-[0.13em] mb-1.5"
                style={{ color: "rgba(16,185,129,0.55)" }}>
                Bull Case
              </p>
              <p className="text-[11px] leading-relaxed" style={{ color: "rgba(255,255,255,0.52)" }}>
                {bullBear.bull}
              </p>
            </div>
            <div
              className="rounded-xl p-3"
              style={{ background: "rgba(239,68,68,0.04)", border: "1px solid rgba(239,68,68,0.10)" }}
            >
              <p className="text-[8.5px] font-bold uppercase tracking-[0.13em] mb-1.5"
                style={{ color: "rgba(239,68,68,0.55)" }}>
                Bear Case
              </p>
              <p className="text-[11px] leading-relaxed" style={{ color: "rgba(255,255,255,0.52)" }}>
                {bullBear.bear}
              </p>
            </div>
          </div>

          {/* Momentum row */}
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-[9px] font-bold uppercase tracking-[0.12em]"
              style={{ color: "rgba(255,255,255,0.28)" }}>Momentum</span>
            <span className="text-[11px] font-semibold capitalize"
              style={{ color: momentumColor(theme.momentum_label) }}>
              {theme.momentum_label}
            </span>
            <span
              className="text-[10px] font-bold font-mono tabular-nums px-1.5 py-0.5 rounded"
              style={{
                background: momentum.momentumScore >= 0 ? "rgba(16,185,129,0.10)" : "rgba(239,68,68,0.10)",
                color:      momentum.momentumScore >= 0 ? "#10B981" : "#EF4444",
              }}
            >
              {momentum.momentumScore > 0 ? "+" : ""}{momentum.momentumScore}
            </span>
            {theme.momentum_delta !== 0 && (
              <span className="text-[10px] font-mono"
                style={{ color: theme.momentum_delta > 0 ? "#10B981" : "#EF4444" }}>
                Δ{theme.momentum_delta > 0 ? "+" : ""}{theme.momentum_delta.toFixed(0)}
              </span>
            )}
            <span style={{ color: "rgba(255,255,255,0.18)" }}>·</span>
            <span className="text-[10px]" style={{ color: "rgba(255,255,255,0.28)" }}>
              {theme.persistence_cycles} cycle{theme.persistence_cycles !== 1 ? "s" : ""}
            </span>
            {theme.cross_category_confirmed && (
              <span
                className="text-[9px] font-bold px-1.5 py-0.5 rounded"
                style={{ background: "rgba(16,185,129,0.10)", color: "#10B981" }}
              >
                Cross-confirmed
              </span>
            )}
          </div>

          {/* Momentum Breakdown */}
          <Section title="Momentum Breakdown">
            <div className="space-y-2">
              {([
                { label: "Story Activity",       value: momentum.components.storyActivity       },
                { label: "Podcast Mentions",     value: momentum.components.podcastMentions     },
                { label: "Industry Penetration", value: momentum.components.industryPenetration },
                { label: "M&A Activity",         value: momentum.components.maActivity          },
                { label: "VC Activity",          value: momentum.components.vcActivity          },
              ] as const).map(({ label, value }) => (
                <div key={label} className="flex items-center gap-2">
                  <span className="text-[10px] w-36 shrink-0" style={{ color: "rgba(255,255,255,0.42)" }}>
                    {label}
                  </span>
                  <div className="flex-1 h-1 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.06)" }}>
                    <div
                      className="h-full rounded-full transition-all"
                      style={{ width: `${value}%`, background: sColor }}
                    />
                  </div>
                  <span className="text-[9.5px] font-mono tabular-nums w-6 text-right shrink-0"
                    style={{ color: "rgba(255,255,255,0.30)" }}>
                    {value}
                  </span>
                </div>
              ))}
            </div>
          </Section>

          {/* Momentum trend history */}
          <Section title="Momentum History">
            <div className="flex items-end gap-2">
              {trendPoints.map(pt => {
                const barH  = Math.max(3, Math.round(Math.abs(pt.score) / 100 * 44));
                const color = pt.score >= 0 ? "#10B981" : "#EF4444";
                const alpha = 0.45 + Math.abs(pt.score) / 100 * 0.50;
                return (
                  <div key={pt.period} className="flex-1 flex flex-col items-center gap-1">
                    <div className="w-full flex items-end justify-center" style={{ height: 44 }}>
                      <div
                        className="w-full rounded-sm"
                        style={{ height: barH, background: color, opacity: alpha }}
                      />
                    </div>
                    <span
                      className="text-[8.5px] font-mono tabular-nums"
                      style={{ color }}
                    >
                      {pt.score > 0 ? "+" : ""}{pt.score}
                    </span>
                    <span className="text-[8px]" style={{ color: "rgba(255,255,255,0.22)" }}>
                      {pt.period}
                    </span>
                  </div>
                );
              })}
            </div>
          </Section>

          {/* Cross-Asset Impact */}
          {crossAssetImpacts.length > 0 && (
            <Section title="Cross-Asset Impact">
              <div className="flex flex-wrap gap-3">
                {crossAssetImpacts.map(item => {
                  const color =
                    item.direction === "positive" ? "#10B981" :
                    item.direction === "negative" ? "#EF4444" : "#94A3B8";
                  return (
                    <div key={item.label} className="flex flex-col items-start gap-1 min-w-[76px]">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[11px] font-bold leading-none" style={{ color }}>
                          {item.direction === "positive" ? "↑" : item.direction === "negative" ? "↓" : "→"}
                        </span>
                        <span className="text-[10px]" style={{ color: "rgba(255,255,255,0.52)" }}>
                          {item.label}
                        </span>
                      </div>
                      <div className="w-full h-[2.5px] rounded-full overflow-hidden"
                        style={{ background: "rgba(255,255,255,0.06)" }}>
                        <div
                          className="h-full rounded-full"
                          style={{ width: `${item.magnitude}%`, background: color, opacity: 0.65 }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </Section>
          )}

          {/* Beneficiaries & Headwinds 2.0 */}
          {assetExposure.length > 0 && (
            <Section title="Beneficiaries / Headwinds">
              <div className="space-y-1.5">
                {assetExposure.map(a => {
                  const color   = a.score > 0 ? "#10B981" : a.score < 0 ? "#EF4444" : "#94A3B8";
                  const arrow   = a.score > 0 ? "↑" : a.score < 0 ? "↓" : "→";
                  const absScore = Math.abs(a.score);
                  return (
                    <div key={a.ticker} className="flex items-center gap-2.5">
                      <span
                        className="font-mono font-bold text-[10.5px] shrink-0 w-10 leading-none"
                        style={{ color }}
                      >
                        {a.ticker}
                      </span>
                      <span className="text-[9px] font-bold tabular-nums shrink-0 w-6 text-right" style={{ color }}>
                        {arrow}{absScore}
                      </span>
                      <div className="flex-1 h-[2px] rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.05)" }}>
                        <div
                          className="h-full rounded-full"
                          style={{ width: `${absScore}%`, background: color, opacity: 0.65 }}
                        />
                      </div>
                      <span className="text-[9px] shrink-0 truncate max-w-[100px]"
                        style={{ color: "rgba(255,255,255,0.28)" }}>
                        {a.reason}
                      </span>
                    </div>
                  );
                })}
              </div>
            </Section>
          )}

          {/* Second order effects */}
          {(theme.second_order_effects ?? []).length > 0 && (
            <Section title="Second Order Effects">
              <ul className="space-y-1.5">
                {theme.second_order_effects.map((effect, i) => (
                  <li key={i} className="flex items-start gap-2 text-[12px]"
                    style={{ color: "rgba(255,255,255,0.52)" }}>
                    <span className="mt-1.5 shrink-0 w-1 h-1 rounded-full"
                      style={{ background: "rgba(82,176,200,0.55)" }} />
                    {effect}
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {/* Connected stories */}
          {connectedClusters.length > 0 && (
            <Section title={`Stories · ${connectedClusters.length}`}>
              <div className="space-y-2">
                {connectedClusters.map(c => (
                  <a
                    key={c.id}
                    href={c.primary.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-start gap-2.5 group"
                  >
                    <span
                      className="mt-0.5 shrink-0 text-[9px] font-bold tabular-nums px-1.5 py-0.5 rounded"
                      style={{ background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.28)" }}
                    >
                      {c.cluster_score}
                    </span>
                    <p
                      className="text-[12px] leading-snug group-hover:text-white/80 transition-colors"
                      style={{ color: "rgba(255,255,255,0.58)" }}
                    >
                      {c.primary.title}
                      <ExternalLink size={8} className="inline ml-1 opacity-40" />
                    </p>
                  </a>
                ))}
              </div>
            </Section>
          )}

          {/* Industry Exposure Ranking */}
          {industryExposure.length > 0 && (
            <Section title="Industry Exposure">
              <div className="space-y-2">
                {industryExposure.map(e => {
                  const color = e.score > 0 ? "#10B981" : e.score < 0 ? "#EF4444" : "#94A3B8";
                  const absScore = Math.abs(e.score);
                  return (
                    <div key={e.industry} className="flex items-center gap-2.5">
                      <span
                        className="text-[10.5px] shrink-0 truncate"
                        style={{ color: "rgba(255,255,255,0.60)", width: 120 }}
                      >
                        {e.industry}
                      </span>
                      <div className="flex-1 h-[2.5px] rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.06)" }}>
                        <div
                          className="h-full rounded-full"
                          style={{ width: `${absScore}%`, background: color }}
                        />
                      </div>
                      <span
                        className="text-[10px] font-bold tabular-nums shrink-0 w-8 text-right"
                        style={{ color }}
                      >
                        {e.score > 0 ? "+" : ""}{e.score}
                      </span>
                    </div>
                  );
                })}
              </div>
            </Section>
          )}

          {/* Watch Signals */}
          {watchSignals.length > 0 && (
            <Section title="Watch">
              <div className="space-y-2">
                {watchSignals.map(sig => (
                  <div key={sig.variable} className="flex items-start gap-2">
                    <span
                      className="shrink-0 mt-1 w-1.5 h-1.5 rounded-full"
                      style={{ background: "rgba(82,176,200,0.55)" }}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] font-semibold leading-snug" style={{ color: "rgba(255,255,255,0.65)" }}>
                        {sig.variable}
                      </p>
                      <p className="text-[10px] leading-snug mt-0.5" style={{ color: "rgba(255,255,255,0.32)" }}>
                        {sig.condition}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </Section>
          )}

          {/* Connected assets */}
          {(theme.related_assets ?? []).length > 0 && (
            <Section title="Assets">
              <div className="flex flex-wrap gap-1.5">
                {theme.related_assets.map(asset => (
                  <span
                    key={asset}
                    className="text-[11px] font-bold px-2 py-0.5 rounded font-mono"
                    style={{
                      background: "rgba(255,255,255,0.05)",
                      color:      "rgba(255,255,255,0.65)",
                      border:     "1px solid rgba(255,255,255,0.08)",
                    }}
                  >
                    {asset}
                  </span>
                ))}
              </div>
            </Section>
          )}

          {/* Macro factors */}
          {(theme.related_macro_factors ?? []).length > 0 && (
            <Section title="Macro Factors">
              <div className="flex flex-wrap gap-1.5">
                {theme.related_macro_factors.map(f => (
                  <span
                    key={f}
                    className="text-[11px] px-2.5 py-0.5 rounded"
                    style={{
                      background: "rgba(251,191,36,0.06)",
                      color:      "rgba(251,191,36,0.70)",
                      border:     "1px solid rgba(251,191,36,0.12)",
                    }}
                  >
                    {f}
                  </span>
                ))}
              </div>
            </Section>
          )}

          {/* Connected deals */}
          {connectedDeals.length > 0 && (
            <Section title={`Related Deals · ${connectedDeals.length}`}>
              <div className="space-y-2">
                {connectedDeals.map((d, i) => (
                  <div key={i} className="flex items-center gap-2 text-[12px]">
                    <span
                      className="shrink-0 text-[9px] font-semibold uppercase px-1.5 py-0.5 rounded"
                      style={{ background: "rgba(167,139,250,0.10)", color: "#c4b5fd" }}
                    >
                      {d.dealType}
                    </span>
                    {d.url ? (
                      <a
                        href={d.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hover:text-white/80 transition-colors"
                        style={{ color: "rgba(255,255,255,0.60)" }}
                      >
                        {d.title ?? d.sector}
                        <ExternalLink size={8} className="inline ml-1 opacity-40" />
                      </a>
                    ) : (
                      <span style={{ color: "rgba(255,255,255,0.60)" }}>{d.title ?? d.sector}</span>
                    )}
                  </div>
                ))}
              </div>
            </Section>
          )}

          {/* Relationship Strength — narrative network */}
          {topRelationships.length > 0 && (
            <Section title="Connected Themes">
              <div className="space-y-2">
                {topRelationships.map(([relName, rel]) => {
                  const barColor =
                    rel.direction === "positive" ? "#10B981" :
                    rel.direction === "negative" ? "#EF4444" : "#F59E0B";
                  const dirArrow =
                    rel.direction === "positive" ? "→" :
                    rel.direction === "negative" ? "↙" : "~";
                  const typeLabel =
                    rel.type === "macro_overlap" ? "Macro" :
                    rel.type === "narrative"     ? "Narrative" :
                    rel.type === "indirect"      ? "Indirect" : "Direct";
                  const strength = Math.round(rel.weight * 100);
                  return (
                    <div key={relName} className="flex items-center gap-2">
                      <span className="text-[11px] shrink-0 font-mono" style={{ color: barColor }}>
                        {dirArrow}
                      </span>
                      <p className="text-[11.5px] flex-1 min-w-0 truncate"
                        style={{ color: "rgba(255,255,255,0.68)" }}>
                        {relName}
                      </p>
                      <span
                        className="text-[8px] font-semibold px-1 py-0.5 rounded shrink-0"
                        style={{ background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.28)" }}
                      >
                        {typeLabel}
                      </span>
                      <span
                        className="text-[12px] font-black tabular-nums shrink-0 w-7 text-right"
                        style={{ color: barColor }}
                      >
                        {strength}
                      </span>
                    </div>
                  );
                })}
              </div>
            </Section>
          )}

          {/* Connected podcasts — default position (below relationships) */}
          {sourceContext !== "listen" && connectedEpisodes.length > 0 && (
            <Section title={`Podcasts · ${connectedEpisodes.length}`}>
              <div className="space-y-3">
                {connectedEpisodes.map(ep => (
                  <div key={ep.id} className="flex items-start gap-2.5">
                    <div
                      className="shrink-0 w-7 h-7 rounded-lg flex items-center justify-center mt-0.5"
                      style={{ background: "rgba(16,185,129,0.08)", border: "1px solid rgba(16,185,129,0.14)" }}
                    >
                      <Headphones size={11} style={{ color: "rgba(16,185,129,0.70)" }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[12px] leading-snug line-clamp-2"
                        style={{ color: "rgba(255,255,255,0.72)" }}>
                        {ep.title}
                      </p>
                      <p className="text-[10px] mt-0.5 flex items-center gap-1.5"
                        style={{ color: "rgba(255,255,255,0.30)" }}>
                        <span>{ep.show_name}</span>
                        {ep.duration_seconds > 0 && (
                          <><span style={{ color: "rgba(255,255,255,0.16)" }}>·</span>
                          <span>{fmtDur(ep.duration_seconds)}</span></>
                        )}
                      </p>
                    </div>
                    {ep.external_url && (
                      <a
                        href={ep.external_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="shrink-0 p-1.5 rounded-lg transition-colors hover:bg-white/[0.05]"
                        style={{ color: "rgba(16,185,129,0.60)" }}
                      >
                        <ExternalLink size={11} />
                      </a>
                    )}
                  </div>
                ))}
              </div>
            </Section>
          )}

          {/* Podcast topics */}
          {(theme.podcast_topics ?? []).length > 0 && (
            <Section title="Podcast Topics">
              <div className="flex flex-wrap gap-1.5">
                {theme.podcast_topics.map(t => (
                  <span
                    key={t}
                    className="text-[11px] px-2.5 py-0.5 rounded-full"
                    style={{
                      background: "rgba(16,185,129,0.07)",
                      color:      "rgba(16,185,129,0.75)",
                      border:     "1px solid rgba(16,185,129,0.12)",
                    }}
                  >
                    {t}
                  </span>
                ))}
              </div>
            </Section>
          )}

          {/* Bottom padding */}
          <div className="h-4" />
        </div>
      </motion.div>
    </div>
  );
}
