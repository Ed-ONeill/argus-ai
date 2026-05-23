"use client";

import { motion } from "framer-motion";
import { catColor } from "@/lib/utils";
import { classifyImpact } from "@/lib/types";
import type { WhatMattersNowItem, ThemeIntelligence } from "@/lib/types";

interface WhatMattersNowProps {
  items:     WhatMattersNowItem[];
  isLoading: boolean;
  themes?:   ThemeIntelligence[];
}

// Muted institutional equivalents for dark atmospheric context
const MUTED_CAT: Record<string, string> = {
  "#2563EB": "#3a68b8",
  "#7C3AED": "#6040a0",
  "#DC2626": "#8a3838",
  "#0891B2": "#2878a0",
  "#D97706": "#a06020",
};

function mutedColor(brightHex: string): string {
  return MUTED_CAT[brightHex] ?? "#4a5878";
}

function pressureBarColor(score: number, baseColor: string): string {
  if (score >= 78) return baseColor;
  if (score >= 52) return "#a06830";
  return "#3a4a6a";
}

const DIRECTION_CONFIG = {
  bullish: { label: "Risk-On",  color: "rgba(82,176,200,0.80)"  },
  bearish: { label: "Risk-Off", color: "rgba(176,88,88,0.80)"   },
  mixed:   { label: "Mixed",    color: "rgba(180,140,70,0.75)"  },
} as const;

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
      {/* Section header — institutional MNN-matching style */}
      <div className="flex items-center gap-3 mb-3">
        <span
          className="text-[10px] font-bold uppercase shrink-0"
          style={{ letterSpacing: "0.14em", color: "rgba(255,255,255,0.38)" }}
        >
          What Matters Now
        </span>
        <div
          className="flex-1 h-px"
          style={{ background: "linear-gradient(to right, rgba(255,255,255,0.08), transparent)" }}
        />
        <span
          className="text-[9.5px] shrink-0"
          style={{ letterSpacing: "0.06em", color: "rgba(255,255,255,0.20)" }}
        >
          Narrative Pressure
        </span>
      </div>

      {/* Mobile: horizontal scroll */}
      <div className="flex gap-2 overflow-x-auto pb-2 snap-x snap-mandatory md:hidden">
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

      {/* Desktop: primary driver + 4-card grid */}
      <div className="hidden md:flex md:flex-col gap-2">
        {primary && (
          <PrimaryDriverCard
            item={primary}
            matchedTheme={themeMap[primary.cluster.id]}
            onClick={() => scrollToCluster(primary.cluster.id)}
          />
        )}
        {rest.length > 0 && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
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


// ── Primary driver banner (desktop rank-1) ────────────────────────────────────

function PrimaryDriverCard({
  item, onClick, matchedTheme,
}: { item: WhatMattersNowItem; onClick: () => void; matchedTheme?: ThemeIntelligence }) {
  const { cluster, thesis, wmn_label } = item;
  const p              = cluster.primary;
  const color          = mutedColor(catColor(p.category));
  const score          = Math.round(p.signal_score ?? 0);
  const barColor       = pressureBarColor(score, color);
  const sentiment      = classifyImpact(p.impact ?? "");
  const dirConfig      = sentiment !== "neutral" ? DIRECTION_CONFIG[sentiment as keyof typeof DIRECTION_CONFIG] : null;
  const storyLabel     = cluster.story_count === 1 ? "1 story" : `${cluster.story_count} stories`;
  const accentOpacity  = 0.30 + (score / 100) * 0.60;

  return (
    <motion.button
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.22, 0, 0.36, 1] }}
      whileHover={{ y: -1, transition: { duration: 0.18 } }}
      onClick={onClick}
      className="w-full text-left relative overflow-hidden"
      style={{
        background:   "rgba(7,12,24,0.96)",
        border:       "1px solid rgba(255,255,255,0.06)",
        borderRadius: "14px",
      }}
    >
      {/* Left ambient glow from category color */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ background: `radial-gradient(ellipse at left center, ${color}18 0%, transparent 62%)` }}
      />

      {/* Left vertical accent bar — breathing for high-pressure signals */}
      {score >= 80 ? (
        <motion.div
          animate={{ opacity: [accentOpacity, Math.min(accentOpacity + 0.22, 1), accentOpacity] }}
          transition={{ duration: 3.2, repeat: Infinity, ease: "easeInOut" }}
          className="absolute left-0 top-0 bottom-0 w-[3px]"
          style={{ background: color }}
        />
      ) : (
        <div
          className="absolute left-0 top-0 bottom-0 w-[3px]"
          style={{ background: color, opacity: accentOpacity }}
        />
      )}

      {/* Content */}
      <div className="pl-5 pr-4 pt-3.5 pb-3.5 flex flex-col gap-2">

        {/* Top row */}
        <div className="flex items-center gap-2">
          <span
            className="text-[8.5px] font-bold uppercase shrink-0"
            style={{ letterSpacing: "0.18em", color }}
          >
            Primary Driver
          </span>
          {dirConfig && (
            <span className="text-[9.5px] font-semibold shrink-0" style={{ color: dirConfig.color }}>
              {dirConfig.label}
            </span>
          )}
          <span className="ml-auto text-[10px] shrink-0" style={{ color: "rgba(255,255,255,0.28)" }}>
            {storyLabel}
            <span className="mx-1 opacity-50">·</span>
            <span style={{ color }}>{p.category}</span>
          </span>
        </div>

        {/* Title */}
        <p className="font-bold leading-snug" style={{ fontSize: "15px", color: "rgba(255,255,255,0.88)" }}>
          {wmn_label || cluster.theme_label}
        </p>

        {/* Thesis */}
        {thesis && (
          <p
            className="line-clamp-2 leading-relaxed"
            style={{ fontSize: "11.5px", color: "rgba(255,255,255,0.58)" }}
          >
            {thesis}
          </p>
        )}

        {/* Pressure bar */}
        <div className="flex items-center gap-2 mt-0.5">
          <div
            className="flex-1 overflow-hidden"
            style={{ height: "2px", borderRadius: "1px", background: "rgba(255,255,255,0.06)" }}
          >
            <motion.div
              style={{ height: "100%", background: barColor }}
              initial={{ width: 0 }}
              animate={{ width: `${score}%` }}
              transition={{ duration: 0.9, ease: "easeOut", delay: 0.2 }}
            />
          </div>
          <span className="tabular-nums font-bold" style={{ fontSize: "11px", color: barColor }}>
            {score}
          </span>
        </div>

        {/* Theme tag */}
        {matchedTheme && (
          <div className="flex items-center gap-1.5" style={{ marginTop: "2px" }}>
            <span style={{ fontSize: "9px", color: "rgba(255,255,255,0.25)" }}>Theme:</span>
            <span
              className="truncate"
              style={{ fontSize: "9px", color: "rgba(255,255,255,0.45)", maxWidth: "200px" }}
            >
              {matchedTheme.name}
            </span>
            {matchedTheme.confidence_label && (
              <span style={{ fontSize: "9px", color: "rgba(255,255,255,0.22)" }}>
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
  const p              = cluster.primary;
  const color          = mutedColor(catColor(p.category));
  const score          = Math.round(p.signal_score ?? 0);
  const barColor       = pressureBarColor(score, color);
  const storyLabel     = cluster.story_count === 1 ? "1 story" : `${cluster.story_count} stories`;
  const sentiment      = classifyImpact(p.impact ?? "");
  const dirConfig      = sentiment !== "neutral" ? DIRECTION_CONFIG[sentiment as keyof typeof DIRECTION_CONFIG] : null;
  const accentOpacity  = 0.25 + (score / 100) * 0.55;

  return (
    <motion.button
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.08, duration: 0.35, ease: [0.22, 0, 0.36, 1] }}
      whileHover={{ y: -1, transition: { duration: 0.18 } }}
      onClick={onClick}
      className="snap-start flex-shrink-0 w-[210px] md:w-auto text-left relative overflow-hidden flex flex-col"
      style={{
        background:   "rgba(6,10,20,0.94)",
        border:       "1px solid rgba(255,255,255,0.05)",
        borderRadius: "12px",
      }}
    >
      {/* Left vertical accent bar */}
      <div
        className="absolute left-0 top-0 bottom-0 w-[2px]"
        style={{ background: color, opacity: accentOpacity }}
      />

      {/* Dim rank indicator */}
      <span
        className="absolute top-2.5 right-3 tabular-nums font-bold"
        style={{ fontSize: "9px", color: "rgba(255,255,255,0.15)" }}
      >
        {rank}
      </span>

      {/* Content */}
      <div className="pl-4 pr-4 pt-3 pb-3 flex flex-col flex-1 gap-1.5">

        {/* Title */}
        <p
          className="font-bold leading-snug line-clamp-2"
          style={{ fontSize: "13px", color: "rgba(255,255,255,0.84)", paddingRight: "14px" }}
        >
          {wmn_label || cluster.theme_label}
        </p>

        {/* Thesis */}
        {thesis ? (
          <p
            className="line-clamp-2 leading-relaxed flex-1"
            style={{ fontSize: "10.5px", color: "rgba(255,255,255,0.50)" }}
          >
            {thesis}
          </p>
        ) : (
          <div className="flex-1" />
        )}

        {/* Pressure bar */}
        <div className="flex items-center gap-2 mt-1">
          <div
            className="flex-1 overflow-hidden"
            style={{ height: "2px", borderRadius: "1px", background: "rgba(255,255,255,0.05)" }}
          >
            <motion.div
              style={{ height: "100%", background: barColor }}
              initial={{ width: 0 }}
              animate={{ width: `${score}%` }}
              transition={{ duration: 0.8, ease: "easeOut", delay: index * 0.08 + 0.2 }}
            />
          </div>
          <span className="tabular-nums font-bold" style={{ fontSize: "10px", color: barColor }}>
            {score}
          </span>
        </div>

        {/* Metadata row */}
        <div className="flex items-center gap-1.5 mt-0.5">
          <span className="text-[10px] flex-1 min-w-0 truncate" style={{ color: "rgba(255,255,255,0.25)" }}>
            {storyLabel}
            <span className="mx-1 opacity-50">·</span>
            <span style={{ color }}>{p.category}</span>
          </span>
          {dirConfig && (
            <span
              className="text-[9px] font-semibold leading-none shrink-0"
              style={{ color: dirConfig.color }}
            >
              {dirConfig.label}
            </span>
          )}
        </div>

        {/* Theme tag */}
        {matchedTheme && (
          <div className="flex items-center gap-1 mt-0.5 min-w-0">
            <span
              className="truncate"
              style={{ fontSize: "8.5px", color: "rgba(255,255,255,0.35)" }}
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
        <div className="h-2.5 w-32 rounded animate-pulse" style={{ background: "rgba(255,255,255,0.06)" }} />
        <div className="flex-1 h-px" style={{ background: "rgba(255,255,255,0.04)" }} />
      </div>
      {/* Mobile skeleton */}
      <div className="flex gap-2 overflow-x-auto md:hidden">
        {[...Array(5)].map((_, i) => <SkeletonCard key={i} />)}
      </div>
      {/* Desktop skeleton */}
      <div className="hidden md:flex md:flex-col gap-2">
        <div
          className="relative overflow-hidden"
          style={{ background: "rgba(7,12,24,0.96)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "14px" }}
        >
          <div className="absolute left-0 top-0 bottom-0 w-[3px] animate-pulse" style={{ background: "rgba(74,120,184,0.4)" }} />
          <div className="pl-5 pr-4 py-3.5 space-y-2.5">
            <div className="h-2.5 w-20 rounded-full animate-pulse" style={{ background: "rgba(255,255,255,0.06)" }} />
            <div className="h-4 w-3/4 rounded animate-pulse" style={{ background: "rgba(255,255,255,0.06)" }} />
            <div className="h-3 w-full rounded animate-pulse" style={{ background: "rgba(255,255,255,0.06)" }} />
            <div className="h-[2px] w-full rounded-full animate-pulse" style={{ background: "rgba(255,255,255,0.06)" }} />
          </div>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
          {[...Array(4)].map((_, i) => <SkeletonCard key={i} />)}
        </div>
      </div>
    </section>
  );
}

function SkeletonCard() {
  return (
    <div
      className="flex-shrink-0 w-[210px] md:w-auto relative overflow-hidden"
      style={{ background: "rgba(6,10,20,0.94)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: "12px" }}
    >
      <div className="absolute left-0 top-0 bottom-0 w-[2px] animate-pulse" style={{ background: "rgba(74,120,184,0.3)" }} />
      <div className="pl-4 pr-4 py-3 space-y-2">
        <div className="h-3.5 w-full rounded animate-pulse" style={{ background: "rgba(255,255,255,0.05)" }} />
        <div className="h-3 w-4/5 rounded animate-pulse" style={{ background: "rgba(255,255,255,0.05)" }} />
        <div className="h-[2px] w-full rounded-full animate-pulse" style={{ background: "rgba(255,255,255,0.05)" }} />
        <div className="h-2.5 w-3/4 rounded animate-pulse" style={{ background: "rgba(255,255,255,0.05)" }} />
      </div>
    </div>
  );
}
