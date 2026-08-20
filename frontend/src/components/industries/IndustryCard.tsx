"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { TrendingUp, TrendingDown, Minus, AlertTriangle, ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { industryIcon } from "./industryIdentity";
import type { IndustryConfig } from "@/lib/industryConfig";
import type { SectorIntelligence, IndustrySignal } from "@/lib/types";
import { buildIndustryCardView, type ThemeSignalFallback } from "@/lib/industryCardView";

export type { ThemeSignalFallback };

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
  themeSignal:    ThemeSignalFallback | null;
  index:          number;
}

export function IndustryCard({ industry, sectorData, industrySignal, topTheme, themeSignal, index }: IndustryCardProps) {
  // RC2-F1: every honesty decision lives in the view model. The card renders it.
  const v = buildIndustryCardView({ industry, sectorData, industrySignal, topTheme, themeSignal });

  const sc    = v.sentiment ? SENTIMENT[v.sentiment] : null;
  const SIcon = sc?.Icon ?? null;
  const IndIcon = industryIcon(industry.slug);

  const shown = v.score ?? 0;
  const scoreColor =
    !v.hasIntelligence    ? "#C2CBD8" :
    shown >= 70           ? "#10b981" :
    shown >= 40           ? "#f59e0b" :
    v.source === "sector" ? industry.color :
    "#8b5cf6";

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

        <div className="p-3.5">
          {/* Header: industry icon + name + arrow */}
          <div className="flex items-start gap-2.5 mb-2.5">
            <span
              className="shrink-0 inline-flex items-center justify-center w-8 h-8 rounded-lg border"
              style={{ background: `${industry.color}12`, borderColor: `${industry.color}26`, color: industry.color }}
            >
              <IndIcon size={15} strokeWidth={1.75} />
            </span>
            <div className="min-w-0 flex-1">
              <h3 className="text-[13.5px] font-bold text-ink leading-tight truncate">
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
          <div className="flex items-center justify-between gap-2 mb-2.5">
            {/* RC2-F1: with no coverage this said "Neutral" (from
                `sentiment ?? "neutral"`) — a current reading synthesised for an
                industry Argus has measured nothing about. It now states the
                absence explicitly; a missing badge would read as an oversight,
                whereas "Not measured" is the finding. */}
            <span className={cn(
              "inline-flex items-center gap-[5px]",
              "text-[9px] font-bold uppercase tracking-widest",
              "px-2 py-[3px] rounded-full border",
              v.stateBadge.measured && sc
                ? sc.cls
                : "text-ink-muted/70 bg-raised border-edge/60 border-dashed",
            )}>
              {v.stateBadge.measured && SIcon && <SIcon size={8} strokeWidth={2.5} />}
              {v.stateBadge.label}
            </span>
            <span
              className="text-[20px] font-black tabular-nums leading-none"
              style={{ color: scoreColor }}
            >
              {v.score !== null ? v.score.toFixed(0) : "-"}
            </span>
          </div>

          {/* Score bar */}
          <div className="h-[2.5px] rounded-full bg-raised overflow-hidden mb-2.5">
            <motion.div
              className="h-full rounded-full"
              style={{ background: scoreColor }}
              initial={{ width: 0 }}
              animate={{ width: v.score !== null ? `${Math.min(v.score, 100)}%` : "0%" }}
              transition={{ duration: 0.7, ease: "easeOut", delay: index * 0.035 + 0.15 }}
            />
          </div>

          {/* Narrative / top theme + story count */}
          <div className="flex items-start justify-between gap-2 mb-3">
            {/* RC2-F1: the intelligence slot carries DERIVED narrative only. With
                no coverage it states the absence; the static macro driver has moved
                to the labelled reference block below. */}
            <p
              className={cn(
                "text-[10px] flex-1 leading-snug line-clamp-2",
                v.hasIntelligence ? "text-ink-secondary" : "text-ink-muted/70 italic",
              )}
              title={v.intelligenceText}
            >
              {v.intelligenceText}
            </p>
            <span className="text-[9px] font-medium text-ink-muted tabular-nums shrink-0 mt-px">
              {v.storyLabel}
            </span>
          </div>

          {/* Driver chips — DERIVED drivers only */}
          {v.drivers.length > 0 && (
            <div className="flex flex-wrap gap-1 mb-3">
              {v.drivers.map(ticker => (
                <span
                  key={ticker}
                  className="text-[8.5px] font-bold font-mono px-[5px] py-[2px] rounded leading-none"
                  style={{ color: industry.color, background: `${industry.color}14` }}
                >
                  {ticker}
                </span>
              ))}
            </div>
          )}

          {/* RC2-F1: static configuration, explicitly labelled as reference and
              given a secondary treatment so it cannot read as a live driver set. */}
          {v.reference && (
            <div className="flex flex-wrap items-center gap-1 mb-3">
              <span className="text-[8px] font-bold uppercase tracking-widest text-ink-muted/60 shrink-0">
                {v.reference.label}
              </span>
              {v.reference.driver && (
                <span className="text-[8.5px] text-ink-muted/70 shrink-0">
                  {v.reference.driver}
                </span>
              )}
              {v.reference.tickers.map(ticker => (
                <span
                  key={ticker}
                  className="text-[8.5px] font-mono px-[5px] py-[2px] rounded leading-none text-ink-muted/60 bg-raised border border-edge/60"
                >
                  {ticker}
                </span>
              ))}
            </div>
          )}

          {/* RC2-F1: the footer used to render "→ Regime Neutral" from
              `alignment ?? "neutral"` even with zero coverage — a current regime
              reading for an industry Argus had measured nothing about. It now
              states the absence instead. */}
          <div className="pt-2.5 border-t border-edge/60 flex items-center gap-2">
            <span className={cn(
              "text-[8.5px] font-bold uppercase tracking-widest flex-1 min-w-0 truncate",
              !v.hasIntelligence                         ? "text-ink-muted/50" :
              v.footer.startsWith("↑")                   ? "text-emerald-600" :
              v.footer.startsWith("↓")                   ? "text-red-600"     :
              (v.footer.includes("accelerating") || v.footer.includes("strengthening"))
                ? "text-emerald-600" :
              (v.footer.includes("cooling") || v.footer.includes("reversing"))
                ? "text-red-600" :
              "text-ink-muted/60",
            )}>
              {v.footer}
            </span>
            {v.themeName && (
              <span className="text-[8px] text-ink-muted/50 shrink-0 truncate max-w-[80px]" title={v.themeName}>
                {v.themeName}
              </span>
            )}
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
