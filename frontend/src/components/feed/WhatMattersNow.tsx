"use client";

import { motion } from "framer-motion";
import { TrendingUp } from "lucide-react";
import { cn, catColor } from "@/lib/utils";
import { classifyImpact } from "@/lib/types";
import type { WhatMattersNowItem } from "@/lib/types";

interface WhatMattersNowProps {
  items:     WhatMattersNowItem[];
  isLoading: boolean;
}

export function WhatMattersNow({ items, isLoading }: WhatMattersNowProps) {
  if (isLoading) return <WhatMattersNowSkeleton />;
  if (!items.length) return null;

  function scrollToCluster(clusterId: string) {
    const el = document.querySelector(`[data-cluster-id="${clusterId}"]`);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
  }

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

      {/* Card row — horizontal scroll on mobile, grid on md+ */}
      <div className="flex gap-2.5 overflow-x-auto pb-2 md:grid md:grid-cols-3 lg:grid-cols-5 md:overflow-visible md:pb-0 snap-x snap-mandatory">
        {items.map((item, idx) => (
          <WMNCard
            key={item.cluster.id}
            item={item}
            index={idx}
            onClick={() => scrollToCluster(item.cluster.id)}
          />
        ))}
      </div>
    </section>
  );
}


// ── Theme card ────────────────────────────────────────────────────────────────

const DIRECTION_CONFIG = {
  bullish: { label: "↑ Bullish", color: "#10b981" },
  bearish: { label: "↓ Bearish", color: "#ef4444" },
  mixed:   { label: "⟷ Mixed",  color: "#f59e0b" },
} as const;

function WMNCard({
  item, index, onClick,
}: { item: WhatMattersNowItem; index: number; onClick: () => void }) {
  const { cluster, thesis, wmn_label, rank } = item;
  const p        = cluster.primary;
  const color    = catColor(p.category);
  const score    = Math.round(p.signal_score ?? 0);
  const isTop    = rank <= 2;

  const barColor =
    score >= 80 ? "#10b981" :
    score >= 50 ? "#f59e0b" :
                  "#94a3b8";

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
      {/* Category accent bar — thicker for top themes */}
      <div
        className={isTop ? "h-[4px] rounded-t-xl" : "h-[3px] rounded-t-xl"}
        style={{ background: color }}
      />

      <div className="px-3.5 pt-3 pb-3 flex flex-col flex-1 gap-1.5">

        {/* ── Title ──────────────────────────────────────────────────────── */}
        <p className={cn(
          "font-bold text-ink leading-snug line-clamp-2",
          isTop ? "text-[13.5px]" : "text-[12.5px]",
        )}>
          {wmn_label || cluster.theme_label}
        </p>

        {/* ── Thesis — investment implication ────────────────────────────── */}
        {thesis ? (
          <p className="text-[11.5px] text-ink-secondary leading-relaxed line-clamp-2 flex-1">
            {thesis}
          </p>
        ) : (
          <div className="flex-1" />
        )}

        {/* ── Score bar ─────────────────────────────────────────────────── */}
        <div className="flex items-center gap-2 mt-1">
          <div className="flex-1 h-[3px] rounded-full bg-raised overflow-hidden">
            <div
              className="h-full rounded-full"
              style={{ width: `${score}%`, background: barColor }}
            />
          </div>
          <span
            className="text-[10px] font-bold tabular-nums leading-none"
            style={{ color: barColor }}
          >
            {score}
          </span>
        </div>

        {/* ── Metadata row ──────────────────────────────────────────────── */}
        <div className="flex items-center gap-1.5 mt-0.5">
          <p className="text-[10.5px] text-ink-muted leading-none flex-1 min-w-0 truncate">
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
      <div className="flex gap-2.5 overflow-x-auto md:grid md:grid-cols-3 lg:grid-cols-5">
        {[...Array(5)].map((_, i) => (
          <div
            key={i}
            className="flex-shrink-0 w-[220px] md:w-auto bg-surface border border-edge rounded-xl overflow-hidden"
          >
            <div className="h-[3px] bg-raised animate-pulse" />
            <div className="p-3.5 space-y-2.5">
              <div className="h-4 w-full bg-raised rounded animate-pulse" />
              <div className="h-3.5 w-4/5 bg-raised rounded animate-pulse" />
              <div className="h-3 w-3/5 bg-raised rounded animate-pulse" />
              <div className="h-[3px] w-full bg-raised rounded-full animate-pulse" />
              <div className="h-2.5 w-3/4 bg-raised rounded animate-pulse" />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
