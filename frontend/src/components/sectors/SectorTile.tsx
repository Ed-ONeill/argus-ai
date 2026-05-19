"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import type { SectorIntelligence } from "@/lib/types";

// ── Sector colour palette ─────────────────────────────────────────────────────

export const SECTOR_COLORS: Record<string, string> = {
  "Technology":     "#2563EB",
  "Financials":     "#0891B2",
  "Energy":         "#D97706",
  "Industrials":    "#64748B",
  "Healthcare":     "#059669",
  "Consumer":       "#7C3AED",
  "Utilities":      "#0D9488",
  "Materials":      "#92400E",
  "Real Estate":    "#B91C1C",
  "Communications": "#6D28D9",
};

export function sectorColor(name: string): string {
  return SECTOR_COLORS[name] ?? "#6B7280";
}

// ── Alignment badge ───────────────────────────────────────────────────────────

const ALIGN_META = {
  tailwind: { label: "↑ tailwind", cls: "text-emerald-600 bg-emerald-50 border-emerald-100" },
  headwind: { label: "↓ headwind", cls: "text-red-600    bg-red-50    border-red-100"       },
  neutral:  { label: "neutral",    cls: "text-ink-muted  bg-raised    border-edge"          },
} as const;

// ── Visual tier ───────────────────────────────────────────────────────────────
// leader:    rank 1 — dominant card with extra content + pulse
// prominent: rank 2–3, score ≥ 20 — standard weight
// standard:  rank 4+, score ≥ 20 — compact, full opacity
// quiet:     score < 20 — recedes visually

type Tier = "leader" | "prominent" | "standard" | "quiet";

function getTier(rank: number, score: number): Tier {
  if (rank === 1)               return "leader";
  if (rank <= 3 && score >= 20) return "prominent";
  if (score < 20)               return "quiet";
  return "standard";
}

// ── Component ─────────────────────────────────────────────────────────────────

interface SectorTileProps {
  sector: SectorIntelligence;
  index:  number;
  rank:   number;
}

export function SectorTile({ sector, index, rank }: SectorTileProps) {
  const color = sectorColor(sector.name);
  const score = sector.signal_score;
  const tier  = getTier(rank, score);

  const align = ALIGN_META[sector.regime_alignment as keyof typeof ALIGN_META]
    ?? ALIGN_META.neutral;

  const barColor =
    score >= 70 ? "#10b981" :
    score >= 40 ? "#f59e0b" :
    color;

  const targetOpacity = tier === "quiet" ? 0.38 : 1;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: targetOpacity, y: 0 }}
      transition={{ delay: index * 0.05, duration: 0.26, ease: "easeOut" }}
      className={cn(
        "relative bg-surface rounded-xl border border-edge border-l-[3px] flex flex-col",
        tier === "leader"               && "p-4 gap-3 border-edge-strong shadow-sm",
        (tier === "prominent" ||
         tier === "standard")           && "p-3.5 gap-2.5",
        tier === "quiet"                && "p-3 gap-2",
      )}
      style={{ borderLeftColor: color }}
    >
      {/* ── Name row ─────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-1.5 min-w-0">

        <div className="flex items-center gap-1.5 min-w-0">
          {/* Pulse dot on leader only */}
          {tier === "leader" && (
            <motion.span
              className="w-1.5 h-1.5 rounded-full shrink-0 mt-px"
              style={{ background: color }}
              animate={{ opacity: [1, 0.35, 1] }}
              transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }}
            />
          )}
          <span className={cn(
            "font-bold text-ink leading-tight truncate",
            tier === "leader"    && "text-[14px]",
            tier === "prominent" && "text-[12px]",
            tier === "standard"  && "text-[11.5px]",
            tier === "quiet"     && "text-[10.5px] text-ink-secondary",
          )}>
            {sector.name}
          </span>
        </div>

        <span className={cn(
          "font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded border shrink-0",
          tier === "leader" ? "text-[9.5px]" : "text-[8.5px]",
          align.cls,
        )}>
          {align.label}
        </span>
      </div>

      {/* ── Score + bar ───────────────────────────────────────────────── */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-1">
          <span className={cn(
            "uppercase tracking-widest text-ink-muted",
            tier === "leader" ? "text-[10px]" : "text-2xs",
          )}>
            Signal
          </span>
          <span className={cn(
            "tabular-nums leading-none",
            tier === "leader"    ? "text-[16px] font-black" :
            tier === "prominent" ? "text-[13px] font-bold"  :
                                   "text-[11px] font-bold",
            score >= 70 ? "text-emerald-600" :
            score >= 40 ? "text-amber-600"   : "text-ink-muted",
          )}>
            {score.toFixed(0)}
          </span>
        </div>

        <div className={cn(
          "rounded-full bg-raised overflow-hidden",
          tier === "leader" ? "h-[4px]" :
          tier === "quiet"  ? "h-[2px]" : "h-[3px]",
        )}>
          <motion.div
            className="h-full rounded-full"
            style={{ background: barColor }}
            initial={{ width: 0 }}
            animate={{ width: `${score}%` }}
            transition={{ duration: 0.65, ease: "easeOut", delay: index * 0.05 + 0.12 }}
          />
        </div>
      </div>

      {/* ── Leader: headline preview ──────────────────────────────────── */}
      {tier === "leader" && sector.top_story_title && (
        <p className="text-[10.5px] text-ink-secondary/65 leading-snug line-clamp-2 -mt-1">
          {sector.top_story_title}
        </p>
      )}

      {/* ── Footer ───────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-1">
        <span className={cn(
          "text-ink-muted",
          tier === "quiet" ? "text-[9.5px]" : "text-2xs",
        )}>
          {sector.signal_count}{" "}
          {sector.signal_count === 1 ? "story" : "stories"}
        </span>
        {tier !== "quiet" && sector.top_entity && (
          <span
            className="text-[9.5px] font-bold px-1.5 py-0.5 rounded leading-none"
            style={{ color, background: `${color}14` }}
          >
            {sector.top_entity}
          </span>
        )}
      </div>
    </motion.div>
  );
}
