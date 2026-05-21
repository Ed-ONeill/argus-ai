"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { TrendingUp, TrendingDown, Minus, AlertTriangle, ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { IndustryConfig } from "@/lib/industryConfig";
import type { SectorIntelligence, IndustrySignal } from "@/lib/types";

// ── Sentiment config ──────────────────────────────────────────────────────────

const SENTIMENT = {
  bullish: { label: "Bullish", Icon: TrendingUp,    cls: "text-emerald-700 bg-emerald-50 border-emerald-200" },
  bearish: { label: "Bearish", Icon: TrendingDown,  cls: "text-red-700    bg-red-50    border-red-200"       },
  mixed:   { label: "Mixed",   Icon: AlertTriangle, cls: "text-amber-700  bg-amber-50  border-amber-200"     },
  neutral: { label: "Neutral", Icon: Minus,         cls: "text-ink-muted  bg-raised    border-edge"          },
} as const;

// ── IndustryCard ──────────────────────────────────────────────────────────────

interface IndustryCardProps {
  industry:       IndustryConfig;
  sectorData:     SectorIntelligence | null;
  industrySignal: IndustrySignal | null;
  topTheme:       string | null;
  index:          number;
}

export function IndustryCard({ industry, sectorData, industrySignal, topTheme, index }: IndustryCardProps) {
  const score     = sectorData?.signal_score     ?? 0;
  const sentiment = (
    industrySignal?.momentum_direction ??
    sectorData?.impact_sentiment       ??
    "neutral"
  ) as keyof typeof SENTIMENT;
  const count     = sectorData?.signal_count     ?? 0;
  const alignment = industrySignal?.regime_alignment ?? sectorData?.regime_alignment ?? "neutral";
  const hasData   = sectorData !== null && score > 0;

  const displayText   = industrySignal?.narrative || topTheme || industry.macroDrivers[0];
  const displayChips  = industrySignal?.primary_drivers?.length
    ? industrySignal.primary_drivers.slice(0, 5)
    : industry.keyAssets.slice(0, 5);

  const sc    = SENTIMENT[sentiment] ?? SENTIMENT.neutral;
  const SIcon = sc.Icon;

  const scoreColor =
    score >= 70 ? "#10b981" :
    score >= 40 ? "#f59e0b" :
    score > 0   ? industry.color : "#C2CBD8";

  return (
    <Link href={`/industries/${industry.slug}`} className="block group outline-none">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: index * 0.035, duration: 0.25, ease: "easeOut" }}
        className={cn(
          "relative bg-surface rounded-2xl border border-edge overflow-hidden",
          "transition-all duration-200 ease-out",
          "hover:shadow-card-hover hover:-translate-y-px hover:border-edge-strong",
          "focus-within:ring-2 focus-within:ring-accent/30",
        )}
      >
        {/* Colored top stripe */}
        <div className="h-[3.5px] w-full" style={{ background: industry.color }} />

        <div className="p-4">
          {/* Header: name + arrow */}
          <div className="flex items-start justify-between gap-2 mb-3">
            <div className="min-w-0">
              <h3 className="text-[13.5px] font-bold text-ink leading-tight">
                {industry.name}
              </h3>
              <p className="text-[10px] text-ink-muted mt-0.5 leading-tight line-clamp-1">
                {industry.description}
              </p>
            </div>
            <ArrowUpRight
              size={11}
              className="text-ink-muted/25 group-hover:text-accent group-hover:opacity-100 transition-all shrink-0 mt-0.5"
            />
          </div>

          {/* Sentiment badge + score */}
          <div className="flex items-center justify-between gap-2 mb-3">
            <span className={cn(
              "inline-flex items-center gap-[5px]",
              "text-[9px] font-bold uppercase tracking-widest",
              "px-2 py-[3px] rounded-full border",
              sc.cls,
            )}>
              <SIcon size={8} strokeWidth={2.5} />
              {sc.label}
            </span>
            <span
              className="text-[20px] font-black tabular-nums leading-none"
              style={{ color: scoreColor }}
            >
              {hasData ? score.toFixed(0) : "—"}
            </span>
          </div>

          {/* Score bar */}
          <div className="h-[2.5px] rounded-full bg-raised overflow-hidden mb-3">
            <motion.div
              className="h-full rounded-full"
              style={{ background: scoreColor }}
              initial={{ width: 0 }}
              animate={{ width: hasData ? `${Math.min(score, 100)}%` : "0%" }}
              transition={{ duration: 0.7, ease: "easeOut", delay: index * 0.035 + 0.15 }}
            />
          </div>

          {/* Narrative / top theme + story count */}
          <div className="flex items-start justify-between gap-2 mb-3">
            <p
              className="text-[10px] text-ink-secondary flex-1 leading-snug line-clamp-2"
              title={displayText}
            >
              {displayText}
            </p>
            <span className="text-[9px] font-medium text-ink-muted tabular-nums shrink-0 mt-px">
              {hasData ? `${count} ${count === 1 ? "story" : "stories"}` : "No data"}
            </span>
          </div>

          {/* Driver chips */}
          <div className="flex flex-wrap gap-1 mb-3">
            {displayChips.map(ticker => (
              <span
                key={ticker}
                className="text-[8.5px] font-bold font-mono px-[5px] py-[2px] rounded leading-none"
                style={{ color: industry.color, background: `${industry.color}14` }}
              >
                {ticker}
              </span>
            ))}
          </div>

          {/* Regime alignment footer */}
          <div className="pt-2.5 border-t border-edge/60">
            <span className={cn(
              "text-[8.5px] font-bold uppercase tracking-widest",
              alignment === "tailwind" ? "text-emerald-600" :
              alignment === "headwind" ? "text-red-600"     : "text-ink-muted/60",
            )}>
              {alignment === "tailwind" ? "↑ Regime Tailwind" :
               alignment === "headwind" ? "↓ Regime Headwind" :
               "→ Regime Neutral"}
            </span>
          </div>
        </div>
      </motion.div>
    </Link>
  );
}

// ── Loading skeleton ──────────────────────────────────────────────────────────

export function IndustryCardSkeleton() {
  return (
    <div className="bg-surface rounded-2xl border border-edge overflow-hidden">
      <div className="h-[3.5px] bg-raised animate-pulse" />
      <div className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="space-y-1.5 flex-1">
            <div className="h-3.5 w-32 bg-raised rounded animate-pulse" />
            <div className="h-2.5 w-24 bg-raised rounded animate-pulse" />
          </div>
          <div className="w-2.5 h-2.5 bg-raised rounded animate-pulse mt-0.5" />
        </div>
        <div className="flex items-center justify-between">
          <div className="h-4 w-16 bg-raised rounded-full animate-pulse" />
          <div className="h-5 w-8 bg-raised rounded animate-pulse" />
        </div>
        <div className="h-[2.5px] w-full bg-raised rounded animate-pulse" />
        <div className="flex justify-between">
          <div className="h-2.5 w-28 bg-raised rounded animate-pulse" />
          <div className="h-2.5 w-12 bg-raised rounded animate-pulse" />
        </div>
        <div className="flex gap-1">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-[18px] w-8 bg-raised rounded animate-pulse" />
          ))}
        </div>
        <div className="pt-2.5 border-t border-edge/60">
          <div className="h-2.5 w-24 bg-raised rounded animate-pulse" />
        </div>
      </div>
    </div>
  );
}
