"use client";

import { motion } from "framer-motion";
import { Globe2, RefreshCw, LayoutGrid } from "lucide-react";
import { cn } from "@/lib/utils";
import { useSectors } from "@/hooks/useSectors";
import { useFeed } from "@/hooks/useFeed";
import { IndustryCard, IndustryCardSkeleton } from "@/components/industries/IndustryCard";
import {
  INDUSTRIES,
  getSectorIntelligence,
  getIndustrySignals,
  getTopTheme,
} from "@/lib/industryConfig";

// ── Regime badge config (dark-hero variant) ───────────────────────────────────

const REGIME_META: Record<string, { cls: string; label: string }> = {
  "Risk-Off Hawkish":      { cls: "bg-red-500/20    text-red-300    border-red-400/30",     label: "Risk-Off · Hawkish" },
  "Risk-Off Neutral":      { cls: "bg-orange-500/20 text-orange-300 border-orange-400/30",  label: "Risk-Off · Neutral" },
  "Risk-On Dovish":        { cls: "bg-emerald-500/20 text-emerald-300 border-emerald-400/30", label: "Risk-On · Dovish"  },
  "Risk-On Neutral":       { cls: "bg-blue-500/20   text-blue-300   border-blue-400/30",    label: "Risk-On · Neutral"  },
  "Stagflationary":        { cls: "bg-amber-500/20  text-amber-300  border-amber-400/30",   label: "Stagflationary"     },
  "Neutral/Consolidating": { cls: "bg-slate-500/20  text-slate-300  border-slate-400/30",   label: "Neutral"            },
};

function formatAge(s: number): string {
  if (s < 60)   return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function IndustriesPage() {
  const { sectorData, regime, clusters, isLoading, isFetching, cacheAge } = useSectors();
  const { data: feedData } = useFeed({});

  const whatMattersNow = feedData?.what_matters_now ?? [];
  const regimeMeta     = regime ? (REGIME_META[regime] ?? null) : null;

  const activeCount  = (sectorData?.sectors ?? []).filter(s => s.signal_score > 0).length;
  const totalStories = (sectorData?.sectors ?? []).reduce((n, s) => n + s.signal_count, 0);
  const dominant     = sectorData?.dominant_sector ?? null;

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

          {/* Live pill + regime badge */}
          <div className="flex flex-wrap items-center gap-2.5 mb-5">
            <div className="flex items-center gap-1.5">
              <span className="relative flex h-1.5 w-1.5">
                <span className="animate-ping absolute inset-0 rounded-full bg-emerald-400 opacity-75" />
                <span className="relative rounded-full h-1.5 w-1.5 bg-emerald-500" />
              </span>
              <span className="text-[9.5px] font-bold uppercase tracking-[0.15em] text-emerald-400">
                Live Intelligence
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
                {isLoading ? "—" : activeCount}
              </p>
              <p className="text-[9px] font-semibold text-white/35 uppercase tracking-[0.15em] mt-1">
                Active Sectors
              </p>
            </div>
            <div className="w-px h-10 bg-white/10 hidden sm:block" />
            <div>
              <p className="text-[26px] font-black text-white tabular-nums leading-none">
                {isLoading ? "—" : totalStories}
              </p>
              <p className="text-[9px] font-semibold text-white/35 uppercase tracking-[0.15em] mt-1">
                Active Stories
              </p>
            </div>
            <div className="w-px h-10 bg-white/10 hidden sm:block" />
            <div>
              <p className="text-[15px] font-bold text-white/80 leading-none">
                {isLoading ? "—" : (dominant ?? "No Leader")}
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
                    {formatAge(cacheAge)}
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
                return (
                  <IndustryCard
                    key={industry.slug}
                    industry={industry}
                    sectorData={sectorIntel}
                    industrySignal={industrySignal}
                    topTheme={topTheme}
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
