"use client";

import type { ReactNode } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { sectorColor } from "./SectorTile";
import {
  generateThesis,
  getCrossAssetEffects,
  getRiskFactors,
  getKeyDrivers,
  filterSectorClusters,
} from "@/lib/sectorIntelligence";
import type { SectorIntelligence, IndustrySignal, StoryCluster } from "@/lib/types";

// ── Alignment badge config ────────────────────────────────────────────────────

const ALIGN_META = {
  tailwind: { label: "↑ tailwind", cls: "text-emerald-600 bg-emerald-50 border-emerald-100" },
  headwind: { label: "↓ headwind", cls: "text-red-600    bg-red-50    border-red-100"       },
  neutral:  { label: "neutral",    cls: "text-ink-muted  bg-raised    border-edge"          },
} as const;

// ── Sub-section label ─────────────────────────────────────────────────────────

function SubLabel({ children }: { children: ReactNode }) {
  return (
    <span className="text-[9px] font-bold uppercase tracking-[0.12em] text-ink-muted">
      {children}
    </span>
  );
}

// ── Industry bar ──────────────────────────────────────────────────────────────

function IndustryBar({
  industry,
  maxScore,
  delay,
  color,
}: {
  industry: IndustrySignal;
  maxScore: number;
  delay:    number;
  color:    string;
}) {
  const pct = maxScore > 0 ? (industry.signal_score / maxScore) * 100 : 0;
  return (
    <div className="space-y-0.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10.5px] text-ink-secondary truncate leading-tight">
          {industry.name}
        </span>
        <span className="text-[10px] font-mono text-ink-muted tabular-nums shrink-0">
          {industry.signal_score.toFixed(0)}
        </span>
      </div>
      <div className="h-[2px] rounded-full bg-raised overflow-hidden">
        <motion.div
          className="h-full rounded-full"
          style={{ background: `${color}80` }}
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.6, ease: "easeOut", delay }}
        />
      </div>
    </div>
  );
}

// ── Story row ─────────────────────────────────────────────────────────────────

function StoryRow({ cluster, color }: { cluster: StoryCluster; color: string }) {
  const item = cluster.primary;
  const signalCls =
    item.signal_strength === "strong" ? "text-emerald-600 bg-emerald-50 border-emerald-100" :
    item.signal_strength === "medium" ? "text-amber-600   bg-amber-50   border-amber-100"   :
                                        "text-ink-muted   bg-raised     border-edge";
  return (
    <a
      href={item.url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-start gap-2.5 group"
    >
      <span
        className="w-[2px] shrink-0 self-stretch rounded-full mt-0.5"
        style={{ background: `${color}50` }}
      />
      <div className="flex-1 min-w-0 space-y-0.5">
        <p className="text-[11.5px] font-medium text-ink leading-snug line-clamp-1 group-hover:text-accent transition-colors">
          {item.title}
        </p>
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-ink-muted">{item.source}</span>
          <span className={cn(
            "text-[9px] font-semibold uppercase tracking-wide px-1.5 py-px rounded border",
            signalCls,
          )}>
            {item.signal_strength}
          </span>
        </div>
      </div>
    </a>
  );
}

// ── Main card ─────────────────────────────────────────────────────────────────

interface SectorIntelligenceCardProps {
  sector:     SectorIntelligence;
  industries: IndustrySignal[];
  clusters:   StoryCluster[];
  regime:     string | null;
  index:      number;
}

export function SectorIntelligenceCard({
  sector,
  industries,
  clusters,
  regime,
  index,
}: SectorIntelligenceCardProps) {
  const color = sectorColor(sector.name);
  const score = sector.signal_score;

  const sectorIndustries = industries
    .filter(i => i.sector === sector.name)
    .sort((a, b) => b.signal_score - a.signal_score)
    .slice(0, 4);

  const sectorClusters = filterSectorClusters(clusters, sector.name, 3);

  const thesis            = generateThesis(sector, sectorIndustries, regime);
  const [crossA, crossB]  = getCrossAssetEffects(sector.name, regime);
  const [riskA, riskB]    = getRiskFactors(sector.name, regime);
  const drivers           = getKeyDrivers(sector, sectorIndustries, sectorClusters);

  const align        = ALIGN_META[sector.regime_alignment as keyof typeof ALIGN_META] ?? ALIGN_META.neutral;
  const maxIndustry  = sectorIndustries[0]?.signal_score ?? 1;
  const barColor     = score >= 70 ? "#10b981" : score >= 40 ? "#f59e0b" : color;
  const cardDelay    = index * 0.08;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: cardDelay, duration: 0.28, ease: "easeOut" }}
      className="bg-surface rounded-xl border border-edge border-l-[3px] p-4 space-y-3"
      style={{ borderLeftColor: color }}
    >
      {/* ── Header ───────────────────────────────────────────────────── */}
      <div className="space-y-2">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <motion.span
              className="w-1.5 h-1.5 rounded-full shrink-0"
              style={{ background: color }}
              animate={{ opacity: [1, 0.35, 1] }}
              transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut", delay: index * 0.3 }}
            />
            <h3 className="text-[15px] font-bold text-ink leading-tight truncate">
              {sector.name}
            </h3>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className={cn(
              "text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border",
              align.cls,
            )}>
              {align.label}
            </span>
            <span className={cn(
              "text-[18px] font-black tabular-nums leading-none",
              score >= 70 ? "text-emerald-600" :
              score >= 40 ? "text-amber-600"   : "text-ink-muted",
            )}>
              {score.toFixed(0)}
            </span>
          </div>
        </div>

        {/* Score bar */}
        <div className="h-[3px] rounded-full bg-raised overflow-hidden">
          <motion.div
            className="h-full rounded-full"
            style={{ background: barColor }}
            initial={{ width: 0 }}
            animate={{ width: `${score}%` }}
            transition={{ duration: 0.7, ease: "easeOut", delay: cardDelay + 0.15 }}
          />
        </div>

        <p className="text-[10px] text-ink-muted">
          {sector.signal_count} {sector.signal_count === 1 ? "story" : "stories"}
          {sector.top_entity && (
            <> · <span className="font-semibold" style={{ color }}>{sector.top_entity}</span></>
          )}
        </p>
      </div>

      {/* ── Thesis ───────────────────────────────────────────────────── */}
      <p
        className="pl-3 py-0.5 border-l-[2px] text-[11.5px] text-ink-secondary leading-snug"
        style={{ borderLeftColor: `${color}60` }}
      >
        {thesis}
      </p>

      {/* ── Industries + Key Drivers ──────────────────────────────────── */}
      {(sectorIndustries.length > 0 || drivers.length > 0) && (
        <div className="grid grid-cols-2 gap-x-4 gap-y-2">
          {sectorIndustries.length > 0 && (
            <div className="space-y-1.5">
              <SubLabel>Industries</SubLabel>
              <div className="space-y-1.5">
                {sectorIndustries.map((ind, i) => (
                  <IndustryBar
                    key={ind.name}
                    industry={ind}
                    maxScore={maxIndustry}
                    delay={cardDelay + 0.2 + i * 0.06}
                    color={color}
                  />
                ))}
              </div>
            </div>
          )}
          {drivers.length > 0 && (
            <div className={cn(
              "space-y-1.5",
              sectorIndustries.length === 0 && "col-span-2",
            )}>
              <SubLabel>Key Drivers</SubLabel>
              <div className="flex flex-wrap gap-1">
                {drivers.map(driver => (
                  <span
                    key={driver}
                    className="text-[9.5px] font-semibold px-1.5 py-0.5 rounded leading-none"
                    style={{ color, background: `${color}12` }}
                  >
                    {driver}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Cross-Asset + Risk Factors ────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-2 pt-2.5 border-t border-edge/50">
        <div className="space-y-1.5">
          <SubLabel>Cross-Asset</SubLabel>
          <ul className="space-y-1.5">
            {[crossA, crossB].map((line, i) => (
              <li key={i} className="flex items-start gap-1.5">
                <span className="text-[10px] text-ink-muted/50 shrink-0 mt-[1px] leading-none">·</span>
                <span className="text-[10.5px] text-ink-secondary leading-snug">{line}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="space-y-1.5">
          <SubLabel>Risk Factors</SubLabel>
          <ul className="space-y-1.5">
            {[riskA, riskB].map((line, i) => (
              <li key={i} className="flex items-start gap-1.5">
                <span className="text-[10px] text-amber-500/60 shrink-0 mt-[1px] leading-none">⚠</span>
                <span className="text-[10.5px] text-ink-secondary leading-snug">{line}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* ── Top Stories ───────────────────────────────────────────────── */}
      {sectorClusters.length > 0 && (
        <div className="space-y-2 pt-2.5 border-t border-edge/50">
          <SubLabel>Top Stories</SubLabel>
          <div className="space-y-2.5">
            {sectorClusters.map(cluster => (
              <StoryRow key={cluster.id} cluster={cluster} color={color} />
            ))}
          </div>
        </div>
      )}
    </motion.div>
  );
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

export function SectorIntelligenceCardSkeleton() {
  return (
    <div className="bg-surface rounded-xl border border-edge border-l-[3px] border-l-edge-strong p-4 space-y-3">
      {/* Header */}
      <div className="space-y-2">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-raised" />
            <div className="h-4 w-28 bg-raised rounded animate-pulse" />
          </div>
          <div className="flex items-center gap-2">
            <div className="h-4 w-16 bg-raised rounded animate-pulse" />
            <div className="h-5 w-8 bg-raised rounded animate-pulse" />
          </div>
        </div>
        <div className="h-[3px] w-full bg-raised rounded animate-pulse" />
        <div className="h-2.5 w-20 bg-raised rounded animate-pulse" />
      </div>
      {/* Thesis */}
      <div className="pl-3 border-l-[2px] border-edge/40 space-y-1.5">
        <div className="h-2.5 w-full bg-raised rounded animate-pulse" />
        <div className="h-2.5 w-5/6 bg-raised rounded animate-pulse" />
        <div className="h-2.5 w-4/5 bg-raised rounded animate-pulse" />
      </div>
      {/* Industries + Drivers */}
      <div className="grid grid-cols-2 gap-x-4">
        <div className="space-y-1.5">
          <div className="h-2 w-16 bg-raised rounded animate-pulse" />
          {[...Array(3)].map((_, i) => (
            <div key={i} className="space-y-1">
              <div className="flex justify-between">
                <div className="h-2 w-20 bg-raised rounded animate-pulse" />
                <div className="h-2 w-5 bg-raised rounded animate-pulse" />
              </div>
              <div className="h-[2px] w-full bg-raised rounded animate-pulse" />
            </div>
          ))}
        </div>
        <div className="space-y-2">
          <div className="h-2 w-16 bg-raised rounded animate-pulse" />
          <div className="flex flex-wrap gap-1">
            {[14, 10, 16, 12, 14, 10].map((w, i) => (
              <div key={i} className={`h-4 w-${w} bg-raised rounded animate-pulse`} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
