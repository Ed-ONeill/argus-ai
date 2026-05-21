"use client";

import { motion } from "framer-motion";
import { TrendingUp } from "lucide-react";
import { cn, catColor } from "@/lib/utils";
import { classifyImpact } from "@/lib/types";
import type { WhatMattersNowItem, ThemeIntelligence } from "@/lib/types";

interface WhatMattersNowProps {
  items:     WhatMattersNowItem[];
  isLoading: boolean;
  themes?:   ThemeIntelligence[];
}

function buildThemeMap(
  items:  WhatMattersNowItem[],
  themes: ThemeIntelligence[],
): Record<string, ThemeIntelligence> {
  const map: Record<string, ThemeIntelligence> = {};
  if (!themes.length) return map;
  for (const item of items) {
    const id = item.cluster.id;
    const matched = themes
      .filter(t => t.contributing_cluster_ids.includes(id))
      .sort((a, b) => b.confidence - a.confidence);
    if (matched.length > 0) map[id] = matched[0];
  }
  return map;
}

export function WhatMattersNow({ items, isLoading, themes }: WhatMattersNowProps) {
  if (isLoading) return <WhatMattersNowSkeleton />;
  if (!items.length) return null;

  const themeMap = buildThemeMap(items, themes ?? []);

  function scrollToCluster(clusterId: string) {
    const el = document.querySelector(`[data-cluster-id="${clusterId}"]`);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  const [primary, ...rest] = items;

  return (
    <section className="mb-7">
      {/* Section header */}
      <div className="flex items-center gap-3 mb-3">
        <TrendingUp size={13} className="text-accent shrink-0" />
        <span className="text-xs font-bold uppercase tracking-[0.14em] text-ink">
          What Matters Now
        </span>
        <span className="h-px flex-1 bg-edge" />
      </div>

      {/* Mobile: horizontal scroll with all cards */}
      <div className="flex gap-2.5 overflow-x-auto pb-2 snap-x snap-mandatory md:hidden">
        {items.map((item, idx) => (
          <WMNCard
            key={item.cluster.id}
            item={item}
            index={idx}
            matchedTheme={themeMap[item.cluster.id]}
            onClick={() => scrollToCluster(item.cluster.id)}
          />
        ))}
      </div>

      {/* Desktop: primary driver banner + 4-card grid */}
      <div className="hidden md:flex md:flex-col gap-2.5">
        {primary && (
          <PrimaryDriverCard
            item={primary}
            matchedTheme={themeMap[primary.cluster.id]}
            onClick={() => scrollToCluster(primary.cluster.id)}
          />
        )}
        {rest.length > 0 && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
            {rest.map((item, idx) => (
              <WMNCard
                key={item.cluster.id}
                item={item}
                index={idx + 1}
                matchedTheme={themeMap[item.cluster.id]}
                onClick={() => scrollToCluster(item.cluster.id)}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}


// ── Shared constants ──────────────────────────────────────────────────────────

const DIRECTION_CONFIG = {
  bullish: { label: "↑ Bullish", color: "#10b981" },
  bearish: { label: "↓ Bearish", color: "#ef4444" },
  mixed:   { label: "⟷ Mixed",  color: "#f59e0b" },
} as const;

function scoreBarColor(score: number): string {
  return score >= 80 ? "#10b981" : score >= 50 ? "#f59e0b" : "#94a3b8";
}


// ── Primary driver banner (desktop rank-1 card) ───────────────────────────────

function PrimaryDriverCard({
  item, onClick, matchedTheme,
}: { item: WhatMattersNowItem; onClick: () => void; matchedTheme?: ThemeIntelligence }) {
  const { cluster, thesis, wmn_label } = item;
  const p          = cluster.primary;
  const color      = catColor(p.category);
  const score      = Math.round(p.signal_score ?? 0);
  const barColor   = scoreBarColor(score);
  const sentiment  = classifyImpact(p.impact ?? "");
  const dirConfig  = sentiment !== "neutral" ? DIRECTION_CONFIG[sentiment as keyof typeof DIRECTION_CONFIG] : null;
  const storyLabel = cluster.story_count === 1 ? "1 story" : `${cluster.story_count} stories`;

  return (
    <motion.button
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: "easeOut" }}
      whileHover={{ y: -1, transition: { duration: 0.14 } }}
      onClick={onClick}
      className="w-full bg-surface rounded-xl border border-edge-strong shadow-card-hover text-left overflow-hidden"
    >
      <div className="h-[4px] rounded-t-xl" style={{ background: color }} />

      <div className="px-4 pt-3 pb-3 flex flex-col gap-2">
        {/* Badge row */}
        <div className="flex items-center gap-2">
          <span className="text-[9px] font-bold uppercase tracking-[0.2em] px-2 py-0.5 rounded-full bg-accent/10 text-accent border border-accent/20 shrink-0">
            Primary Driver
          </span>
          {dirConfig && (
            <span className="text-[10px] font-semibold shrink-0" style={{ color: dirConfig.color }}>
              {dirConfig.label}
            </span>
          )}
          <span className="ml-auto text-[10.5px] text-ink-muted shrink-0">
            {storyLabel}
            <span className="mx-1 opacity-40">·</span>
            <span style={{ color }}>{p.category}</span>
          </span>
        </div>

        {/* Title */}
        <p className="text-[14px] font-bold text-ink leading-snug">
          {wmn_label || cluster.theme_label}
        </p>

        {/* Thesis */}
        {thesis && (
          <p className="text-[12.5px] text-ink-secondary leading-relaxed line-clamp-2">
            {thesis}
          </p>
        )}

        {/* Score bar */}
        <div className="flex items-center gap-2 mt-0.5">
          <div className="flex-1 h-[3px] rounded-full bg-raised overflow-hidden">
            <motion.div
              className="h-full rounded-full"
              style={{ background: barColor }}
              initial={{ width: 0 }}
              animate={{ width: `${score}%` }}
              transition={{ duration: 0.7, ease: "easeOut", delay: 0.2 }}
            />
          </div>
          <span className="text-[11px] font-bold tabular-nums leading-none" style={{ color: barColor }}>
            {score}
          </span>
        </div>

        {/* Intelligence theme tag */}
        {matchedTheme && (
          <div className="flex items-center gap-1.5 pt-1 border-t border-edge/40 mt-0.5">
            <span className="text-[9px] text-ink-muted shrink-0">Theme:</span>
            <span className="text-[9px] font-bold px-1.5 py-px rounded bg-accent/10 text-accent border border-accent/20 truncate max-w-[180px]">
              {matchedTheme.name}
            </span>
            {matchedTheme.confidence_label && (
              <span className="text-[9px] text-ink-muted shrink-0">
                · {matchedTheme.confidence_label}
              </span>
            )}
          </div>
        )}
      </div>
    </motion.button>
  );
}


// ── Theme card (ranks 2-5) ────────────────────────────────────────────────────

function WMNCard({
  item, index, onClick, matchedTheme,
}: { item: WhatMattersNowItem; index: number; onClick: () => void; matchedTheme?: ThemeIntelligence }) {
  const { cluster, thesis, wmn_label, rank } = item;
  const p        = cluster.primary;
  const color    = catColor(p.category);
  const score    = Math.round(p.signal_score ?? 0);
  const isTop    = rank <= 2;
  const barColor = scoreBarColor(score);

  const storyLabel = cluster.story_count === 1
    ? "1 story"
    : `${cluster.story_count} stories`;

  const sentiment  = classifyImpact(p.impact ?? "");
  const dirConfig  = sentiment !== "neutral" ? DIRECTION_CONFIG[sentiment as keyof typeof DIRECTION_CONFIG] : null;

  return (
    <motion.button
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.06, duration: 0.22, ease: "easeOut" }}
      whileHover={{ y: -2, transition: { duration: 0.14 } }}
      onClick={onClick}
      className={cn(
        "snap-start flex-shrink-0 w-[220px] md:w-auto",
        "bg-surface rounded-xl border transition-all duration-200",
        "shadow-card hover:shadow-card-hover",
        "text-left overflow-hidden flex flex-col",
        isTop
          ? "border-edge-strong hover:border-edge-strong shadow-card-hover"
          : "border-edge hover:border-edge-strong",
      )}
    >
      {/* Category accent bar */}
      <div
        className={isTop ? "h-[4px] rounded-t-xl" : "h-[3px] rounded-t-xl"}
        style={{ background: color }}
      />

      <div className="px-3.5 pt-3 pb-3 flex flex-col flex-1 gap-1.5">

        {/* Title */}
        <p className={cn(
          "font-bold text-ink leading-snug line-clamp-2",
          isTop ? "text-[13px]" : "text-[12px]",
        )}>
          {wmn_label || cluster.theme_label}
        </p>

        {/* Thesis */}
        {thesis ? (
          <p className="text-[11px] text-ink-secondary leading-relaxed line-clamp-2 flex-1">
            {thesis}
          </p>
        ) : (
          <div className="flex-1" />
        )}

        {/* Score bar */}
        <div className="flex items-center gap-2 mt-1">
          <div className="flex-1 h-[3px] rounded-full bg-raised overflow-hidden">
            <motion.div
              className="h-full rounded-full"
              style={{ background: barColor }}
              initial={{ width: 0 }}
              animate={{ width: `${score}%` }}
              transition={{ duration: 0.7, ease: "easeOut", delay: index * 0.06 + 0.2 }}
            />
          </div>
          <span
            className="text-[10px] font-bold tabular-nums leading-none"
            style={{ color: barColor }}
          >
            {score}
          </span>
        </div>

        {/* Metadata row */}
        <div className="flex items-center gap-1.5 mt-0.5">
          <p className="text-[10px] text-ink-muted leading-none flex-1 min-w-0 truncate">
            <span>{storyLabel}</span>
            <span className="mx-1 opacity-40">·</span>
            <span style={{ color }}>{p.category}</span>
            {p.published && (
              <>
                <span className="mx-1 opacity-40">·</span>
                <span>{p.published}</span>
              </>
            )}
          </p>
          {dirConfig && (
            <span
              className="text-[9.5px] font-semibold leading-none shrink-0"
              style={{ color: dirConfig.color }}
            >
              {dirConfig.label}
            </span>
          )}
        </div>

        {/* Intelligence theme tag */}
        {matchedTheme && (
          <div className="flex items-center gap-1 mt-0.5">
            <span
              className="text-[8.5px] font-bold px-1.5 py-px rounded bg-accent/10 text-accent/80 border border-accent/15 truncate max-w-full"
              title={matchedTheme.name}
            >
              ✦ {matchedTheme.name}
            </span>
          </div>
        )}

      </div>
    </motion.button>
  );
}


// ── Skeleton ──────────────────────────────────────────────────────────────────

function WhatMattersNowSkeleton() {
  return (
    <section className="mb-7">
      <div className="flex items-center gap-3 mb-3">
        <div className="h-3 w-3 rounded bg-raised animate-pulse" />
        <div className="h-3 w-36 bg-raised rounded animate-pulse" />
        <span className="h-px flex-1 bg-edge" />
      </div>
      {/* Mobile skeleton */}
      <div className="flex gap-2.5 overflow-x-auto md:hidden">
        {[...Array(5)].map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
      {/* Desktop skeleton */}
      <div className="hidden md:flex md:flex-col gap-2.5">
        <div className="bg-surface border border-edge rounded-xl overflow-hidden">
          <div className="h-[4px] bg-raised animate-pulse" />
          <div className="px-4 py-3 space-y-2.5">
            <div className="h-3 w-24 bg-raised rounded-full animate-pulse" />
            <div className="h-4 w-3/4 bg-raised rounded animate-pulse" />
            <div className="h-3 w-full bg-raised rounded animate-pulse" />
            <div className="h-[3px] w-full bg-raised rounded-full animate-pulse" />
          </div>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
          {[...Array(4)].map((_, i) => <SkeletonCard key={i} />)}
        </div>
      </div>
    </section>
  );
}

function SkeletonCard() {
  return (
    <div className="flex-shrink-0 w-[220px] md:w-auto bg-surface border border-edge rounded-xl overflow-hidden">
      <div className="h-[3px] bg-raised animate-pulse" />
      <div className="p-3.5 space-y-2.5">
        <div className="h-4 w-full bg-raised rounded animate-pulse" />
        <div className="h-3.5 w-4/5 bg-raised rounded animate-pulse" />
        <div className="h-3 w-3/5 bg-raised rounded animate-pulse" />
        <div className="h-[3px] w-full bg-raised rounded-full animate-pulse" />
        <div className="h-2.5 w-3/4 bg-raised rounded animate-pulse" />
      </div>
    </div>
  );
}
