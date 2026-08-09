"use client";

import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Globe2, RefreshCw, LayoutGrid } from "lucide-react";
import { cn, formatRelativeAge } from "@/lib/utils";
import { useSectors } from "@/hooks/useSectors";
import { useFeed } from "@/hooks/useFeed";
import { SessionExpired } from "@/components/common/SessionExpired";
import { IndustryCard, IndustryCardSkeleton, type ThemeSignalFallback } from "@/components/industries/IndustryCard";
import {
  INDUSTRIES,
  getSectorIntelligence,
  getIndustrySignals,
  getTopTheme,
} from "@/lib/industryConfig";
import type { ThemeIntelligence, IndustryActivation } from "@/lib/types";

// ── Regime badge config (dark-hero variant) ───────────────────────────────────

const REGIME_META: Record<string, { cls: string; label: string }> = {
  "Risk-Off Hawkish":      { cls: "bg-red-500/20    text-red-300    border-red-400/30",     label: "Risk-Off · Hawkish" },
  "Risk-Off Neutral":      { cls: "bg-orange-500/20 text-orange-300 border-orange-400/30",  label: "Risk-Off · Neutral" },
  "Risk-On Dovish":        { cls: "bg-emerald-500/20 text-emerald-300 border-emerald-400/30", label: "Risk-On · Dovish"  },
  "Risk-On Neutral":       { cls: "bg-blue-500/20   text-blue-300   border-blue-400/30",    label: "Risk-On · Neutral"  },
  "Stagflationary":        { cls: "bg-amber-500/20  text-amber-300  border-amber-400/30",   label: "Stagflationary"     },
  "Neutral/Consolidating": { cls: "bg-slate-500/20  text-slate-300  border-slate-400/30",   label: "Neutral"            },
};

function activationToSignal(
  ia: IndustryActivation,
): ThemeSignalFallback | null {
  if (ia.score <= 0) return null;
  return {
    score:         ia.score,
    sentiment:     ia.sentiment,
    storyCount:    ia.active_story_count,
    narrative:     ia.related_theme_names[0] ?? ia.industry,
    chips:         ia.related_assets.slice(0, 5),
    themeName:     ia.related_theme_names[0] ?? "",
    momentumLabel: ia.momentum_label,
  };
}

function deriveThemeSignal(
  industryName: string,
  themes: ThemeIntelligence[],
): ThemeSignalFallback | null {
  const matching = themes.filter(t => t.related_industries.includes(industryName));
  if (!matching.length) return null;
  const best = [...matching].sort((a, b) => b.confidence - a.confidence)[0];
  const rel   = (best.relationship_weights ?? {})[industryName];
  const weight = rel?.weight ?? 0.5;
  const score  = Math.round(best.confidence * weight);
  if (score <= 0) return null;
  const direction = rel?.direction;
  return {
    score,
    sentiment: direction === "positive" ? "bullish"
             : direction === "negative" ? "bearish"
             : "neutral",
    storyCount:    best.contributing_story_count,
    narrative:     best.description,
    chips:         best.related_assets.slice(0, 5),
    themeName:     best.name,
    momentumLabel: best.momentum_label ?? "emerging",
  };
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function IndustriesPage() {
  const queryClient = useQueryClient();
  const { sectorData, regime, clusters, isLoading, isFetching, cacheAge, isUnauthorized } = useSectors();
  const { data: feedData } = useFeed({});

  // On mount: invalidate the feed cache so the page always fetches fresh data.
  // The backend's ProcessedFeedCache may have been updated since the TanStack
  // client last fetched (staleTime could still be within its 5-min window).
  useEffect(() => {
    queryClient.invalidateQueries({ queryKey: ["feed"] });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Resolved unauthenticated (or active invalidation) → sign-in, NOT a permanent
  // skeleton. Initial auth restoration still shows the skeleton via isLoading.
  if (isUnauthorized) return <SessionExpired label="Sign in to view Industries intelligence." />;

  const whatMattersNow   = feedData?.what_matters_now ?? [];
  const allThemes        = feedData?.theme_intelligence ?? [];
  const activations      = feedData?.industry_activation ?? [];
  const regimeMeta       = regime ? (REGIME_META[regime] ?? null) : null;

  const hasSectorData    = (sectorData?.sectors?.length ?? 0) > 0;
  // Distinguish between "has sector data" and "has scored sector data"
  const hasSectorScores  = hasSectorData && sectorData!.sectors.some(s => s.signal_score > 0);
  const hasActivations   = activations.some(ia => ia.score > 0);
  // Themes with any signal (not just non-weak) as last-resort count
  const activeThemes     = allThemes.filter(t => t.signal_strength !== "weak");
  const anyThemes        = allThemes.filter(t => t.contributing_story_count > 0);

  // activeCount: prefer scored sector data → scored activations → any theme → industries with theme links
  const activeCount  = hasSectorScores
    ? (sectorData!.sectors.filter(s => s.signal_score > 0).length)
    : hasActivations
    ? activations.filter(ia => ia.score > 0).length
    : activeThemes.length > 0
    ? activeThemes.length
    : activations.filter(ia => ia.related_theme_ids.length > 0).length;

  // totalStories: same cascade
  const totalStories = hasSectorScores
    ? sectorData!.sectors.reduce((n, s) => n + s.signal_count, 0)
    : hasActivations
    ? activations.reduce((n, ia) => n + ia.active_story_count, 0)
    : anyThemes.reduce((n, t) => n + t.contributing_story_count, 0);

  // dominant sector: prefer structured data → highest-scored activation → top theme
  const sortedActivations = [...activations].sort((a, b) => b.score - a.score);
  const dominant     = sectorData?.dominant_sector
    ?? (hasActivations
      ? (sortedActivations[0]?.industry ?? null)
      : (activeThemes[0]?.name ?? anyThemes[0]?.name ?? null));

  return (
    <div className="min-h-screen bg-canvas">

      {/* ── Hero ───────────────────────────────────────────────────────────── */}
      <div
        className="relative overflow-hidden"
        style={{ background: "linear-gradient(135deg, #090F21 0%, #0F1A3D 55%, #1A2B5F 100%)" }}
      >
        {/* Subtle grid texture */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage: [
              "linear-gradient(rgba(255,255,255,0.6) 1px, transparent 1px)",
              "linear-gradient(90deg, rgba(255,255,255,0.6) 1px, transparent 1px)",
            ].join(", "),
            backgroundSize: "48px 48px",
          }}
        />

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 py-10 sm:py-14">

          {/* Intelligence pill + regime badge */}
          <div className="flex flex-wrap items-center gap-2.5 mb-5">
            <div className="flex items-center gap-1.5">
              <span className="rounded-full h-1.5 w-1.5 bg-emerald-500/70" />
              <span className="text-[9.5px] font-bold uppercase tracking-[0.15em] text-emerald-400">
                Market Intelligence
              </span>
            </div>

            {regimeMeta && (
              <span className={cn(
                "text-[9.5px] font-bold uppercase tracking-widest",
                "px-2.5 py-[3px] rounded-full border",
                regimeMeta.cls,
              )}>
                {regimeMeta.label}
              </span>
            )}

            {isFetching && !isLoading && (
              <motion.span
                animate={{ rotate: 360 }}
                transition={{ repeat: Infinity, duration: 0.9, ease: "linear" }}
                className="text-white/25"
              >
                <RefreshCw size={9} />
              </motion.span>
            )}
          </div>

          {/* Title block */}
          <div className="mb-6">
            <div className="flex items-center gap-3 mb-2">
              <Globe2 size={24} className="text-white/60 shrink-0" strokeWidth={1.5} />
              <h1 className="text-[28px] sm:text-[34px] font-black text-white tracking-tight leading-none">
                Industry Intelligence
              </h1>
            </div>
            <p className="text-sm text-white/45 max-w-2xl leading-relaxed ml-[calc(24px+0.75rem)]">
              Track how macro, policy, M&A, rates, and geopolitics impact every major industry.
            </p>
          </div>

          {/* Stats row */}
          <div className="flex flex-wrap items-end gap-7">
            <div>
              <p className="text-[26px] font-black text-white tabular-nums leading-none">
                {isLoading ? "-" : activeCount}
              </p>
              <p className="text-[9px] font-semibold text-white/35 uppercase tracking-[0.15em] mt-1">
                Active Sectors
              </p>
            </div>
            <div className="w-px h-10 bg-white/10 hidden sm:block" />
            <div>
              <p className="text-[26px] font-black text-white tabular-nums leading-none">
                {isLoading ? "-" : totalStories}
              </p>
              <p className="text-[9px] font-semibold text-white/35 uppercase tracking-[0.15em] mt-1">
                Active Stories
              </p>
            </div>
            <div className="w-px h-10 bg-white/10 hidden sm:block" />
            <div>
              <p className="text-[15px] font-bold text-white/80 leading-none">
                {isLoading ? "-" : (dominant ?? "No Leader")}
              </p>
              <p className="text-[9px] font-semibold text-white/35 uppercase tracking-[0.15em] mt-1">
                Leading Sector
              </p>
            </div>
            {!isLoading && cacheAge > 0 && (
              <>
                <div className="w-px h-10 bg-white/10 hidden md:block" />
                <div className="hidden md:block">
                  <p className="text-[13px] font-medium text-white/50 leading-none">
                    {formatRelativeAge(cacheAge)}
                  </p>
                  <p className="text-[9px] font-semibold text-white/25 uppercase tracking-[0.15em] mt-1">
                    Last Updated
                  </p>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* ── Grid ───────────────────────────────────────────────────────────── */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">

        {/* Section header */}
        <div className="flex items-center gap-3 mb-6">
          <LayoutGrid size={12} className="text-ink-secondary shrink-0" />
          <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-ink">
            Market Coverage
          </span>
          <span className="h-px flex-1 bg-edge" />
          <span className="text-[9.5px] text-ink-muted tabular-nums">
            {INDUSTRIES.length} industries
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {isLoading
            ? [...Array(INDUSTRIES.length)].map((_, i) => (
                <IndustryCardSkeleton key={i} />
              ))
            : INDUSTRIES.map((industry, i) => {
                const sectorIntel    = getSectorIntelligence(industry, sectorData?.sectors ?? []);
                const industrySignal = getIndustrySignals(industry, sectorData?.industries ?? [])[0] ?? null;
                const topTheme       = getTopTheme(industry, clusters, whatMattersNow);
                const activation     = activations.find(ia => ia.industry === industry.name) ?? null;
                // Prefer scored activation data regardless of whether industrySignal exists.
                // Activation comes from the theme pipeline; industrySignal from sector keywords.
                // When sectors have no keyword matches, activation is the only signal source.
                const themeSignal    = activation && activation.score > 0
                  ? activationToSignal(activation)
                  : industrySignal === null
                  ? deriveThemeSignal(industry.name, allThemes)
                  : null;
                return (
                  <IndustryCard
                    key={industry.slug}
                    industry={industry}
                    sectorData={sectorIntel}
                    industrySignal={industrySignal}
                    topTheme={topTheme}
                    themeSignal={themeSignal}
                    index={i}
                  />
                );
              })
          }
        </div>
      </div>
    </div>
  );
}
