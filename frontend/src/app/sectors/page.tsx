"use client";

import { motion } from "framer-motion";
import {
  Layers, TrendingDown, TrendingUp, RefreshCw, ShieldAlert, Zap,
} from "lucide-react";
import { cn, formatRelativeAge } from "@/lib/utils";
import { useSectors } from "@/hooks/useSectors";
import { SectorLeaderboard } from "@/components/sectors/SectorLeaderboard";
import {
  SectorIntelligenceCard,
  SectorIntelligenceCardSkeleton,
} from "@/components/sectors/SectorIntelligenceCard";
import { sectorColor } from "@/components/sectors/SectorTile";
import type { RotationSignal, SectorData } from "@/lib/types";

// ── Regime badge config ───────────────────────────────────────────────────────

const REGIME_META: Record<string, { cls: string; label: string }> = {
  "Risk-Off Hawkish":     { cls: "bg-red-50    text-red-700    border-red-200",         label: "Risk-Off · Hawkish" },
  "Risk-Off Neutral":     { cls: "bg-orange-50 text-orange-700 border-orange-200",      label: "Risk-Off · Neutral" },
  "Risk-On Dovish":       { cls: "bg-emerald-50 text-emerald-700 border-emerald-200",   label: "Risk-On · Dovish"   },
  "Risk-On Neutral":      { cls: "bg-blue-50   text-blue-700   border-blue-200",        label: "Risk-On · Neutral"  },
  "Stagflationary":       { cls: "bg-amber-50  text-amber-700  border-amber-200",       label: "Stagflationary"     },
  "Neutral/Consolidating":{ cls: "bg-slate-50  text-slate-600  border-slate-200",       label: "Neutral"            },
};

// ── Rotation pattern config ───────────────────────────────────────────────────

const PATTERN_META: Record<string, { label: string; Icon: React.FC<{ size?: number; className?: string }> }> = {
  "risk-off":        { label: "Risk-Off Rotation",  Icon: TrendingDown  },
  "growth-to-value": { label: "Growth → Value",     Icon: RefreshCw     },
  "defensive":       { label: "Defensive Rotation", Icon: ShieldAlert   },
  "commodity":       { label: "Commodity Cycle",    Icon: TrendingUp    },
  "ai-cycle":        { label: "AI / Tech Cycle",    Icon: Zap           },
};

// ── Narrative generator ───────────────────────────────────────────────────────
// Pure function — builds a one-line analyst summary from existing data fields.
// Zero LLM calls. Selects the most specific applicable template.

function generateNarrative(
  sectorData: SectorData | null,
  regime:     string | null,
): string | null {
  if (!sectorData || sectorData.sectors.length === 0) return null;

  const [leader, runner] = sectorData.sectors;
  const rotation         = sectorData.rotation_signals[0] ?? null;
  const regimeLabel      = regime?.replace("Neutral/Consolidating", "Neutral") ?? null;

  if (rotation?.pattern === "risk-off") {
    return `${rotation.to_sector} and Energy are taking leadership as ${
      regimeLabel ? regimeLabel + " conditions" : "macro conditions"
    } compress growth valuations and drive positioning toward yield and commodity exposure.`;
  }
  if (rotation?.pattern === "ai-cycle") {
    return `${leader.name} is capturing dominant signal — AI infrastructure and semiconductor catalysts are concentrating cross-asset momentum into the sector.`;
  }
  if (rotation?.pattern === "commodity") {
    const second = runner?.name ?? "Materials";
    return `Commodity sectors in control: ${leader.name} and ${second} signal concentration suggests supply-side catalysts are the primary market driver.`;
  }
  if (rotation?.pattern === "defensive") {
    return `Defensive rotation underway — ${rotation.to_sector} is attracting signal as growth and consumer momentum fades against a ${regimeLabel ?? "challenging"} backdrop.`;
  }
  if (rotation?.pattern === "growth-to-value") {
    const second = runner?.name ?? "Industrials";
    return `Value rotation: ${leader.name} and ${second} are outpacing growth in signal strength, consistent with a ${regimeLabel ?? "value-favoring"} regime shift.`;
  }

  // No rotation — describe regime alignment
  const tailwindSectors = sectorData.sectors
    .filter(s => s.regime_alignment === "tailwind")
    .slice(0, 2)
    .map(s => s.name);

  if (leader.regime_alignment === "tailwind" && tailwindSectors.length > 0) {
    const tail = tailwindSectors.join(" and ");
    const verb = tailwindSectors.length === 1 ? "carries" : "carry";
    return `${tail} ${verb} regime tailwind in a ${regimeLabel ?? "supportive"} environment — signal concentration aligns with the macro backdrop.`;
  }
  if (leader.regime_alignment === "headwind" && regimeLabel) {
    return `${leader.name} leads despite a ${regimeLabel} headwind — signal divergence from regime positioning warrants monitoring for mean reversion.`;
  }
  if (runner) {
    return `${leader.name} and ${runner.name} are capturing the majority of market signal across ${sectorData.sectors.length} active sectors.`;
  }

  return `${leader.name} leads with signal score ${leader.signal_score.toFixed(0)} — ${sectorData.sectors.length} sector${sectorData.sectors.length !== 1 ? "s" : ""} active.`;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 mb-4">
      <span className="text-xs font-bold uppercase tracking-[0.14em] text-ink">
        {children}
      </span>
      <span className="h-px flex-1 bg-edge" />
    </div>
  );
}

// ── Rotation card ─────────────────────────────────────────────────────────────

function RotationCard({ signal, index }: { signal: RotationSignal; index: number }) {
  const meta     = PATTERN_META[signal.pattern] ?? PATTERN_META["risk-off"];
  const { Icon } = meta;
  const toColor   = sectorColor(signal.to_sector);
  const fromColor = sectorColor(signal.from_sector);
  const confPct   = Math.round(signal.confidence * 100);

  // Confidence tier: high / moderate / low
  const confTierLabel = confPct >= 70 ? "HIGH" : confPct >= 45 ? "MOD" : "LOW";
  const confTierColor =
    confPct >= 70 ? "text-emerald-600" :
    confPct >= 45 ? "text-amber-600"   : "text-ink-muted";

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.07, duration: 0.25, ease: "easeOut" }}
      className="bg-surface rounded-xl border border-edge border-l-[3px] p-4 flex flex-col gap-3"
      style={{ borderLeftColor: toColor }}
    >
      {/* Pattern label + confidence tier */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <Icon size={10} className="text-ink-muted shrink-0" />
          <span className="text-[9.5px] font-bold uppercase tracking-widest text-ink-secondary">
            {meta.label}
          </span>
        </div>
        <span className={cn(
          "text-[9.5px] font-black uppercase tracking-wider tabular-nums",
          confTierColor,
        )}>
          {confTierLabel} · {confPct}%
        </span>
      </div>

      {/* Confidence bar — immediately under the header */}
      <div className="h-[2px] rounded-full bg-raised overflow-hidden -mt-1.5">
        <motion.div
          className="h-full rounded-full"
          style={{ background: toColor }}
          initial={{ width: 0 }}
          animate={{ width: `${confPct}%` }}
          transition={{ duration: 0.6, ease: "easeOut", delay: index * 0.07 + 0.15 }}
        />
      </div>

      {/* FROM → TO — the primary visual anchor */}
      <div className="flex items-baseline gap-2 pt-0.5">
        <span
          className="text-[11.5px] font-semibold leading-tight"
          style={{ color: `${fromColor}70` }}
        >
          {signal.from_sector}
        </span>
        <span className="text-[14px] font-black text-ink-muted/30 shrink-0 leading-none">
          →
        </span>
        <span
          className="text-[13.5px] font-bold leading-tight"
          style={{ color: toColor }}
        >
          {signal.to_sector}
        </span>
      </div>

      {/* Reason — data-forward, no truncation */}
      <p className="text-[11px] text-ink-secondary/75 leading-relaxed">
        {signal.reason}
      </p>
    </motion.div>
  );
}

function RotationCardSkeleton() {
  return (
    <div className="bg-surface rounded-xl border border-edge border-l-[3px] border-l-edge-strong p-4 space-y-3">
      <div className="flex justify-between">
        <div className="h-2.5 w-28 bg-raised rounded animate-pulse" />
        <div className="h-2.5 w-14 bg-raised rounded animate-pulse" />
      </div>
      <div className="h-[2px] w-full bg-raised rounded animate-pulse" />
      <div className="flex items-baseline gap-2">
        <div className="h-3.5 w-20 bg-raised rounded animate-pulse" />
        <div className="h-3 w-4 bg-raised rounded animate-pulse" />
        <div className="h-4 w-24 bg-raised rounded animate-pulse" />
      </div>
      <div className="space-y-1.5">
        <div className="h-2.5 w-full bg-raised rounded animate-pulse" />
        <div className="h-2.5 w-4/5 bg-raised rounded animate-pulse" />
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function SectorsPage() {
  const { sectorData, regime, clusters, isLoading, isFetching, cacheAge } = useSectors();

  const regimeMeta    = regime ? (REGIME_META[regime] ?? null) : null;
  const rotations     = (sectorData?.rotation_signals ?? []).slice(0, 3);
  const showRotations = isLoading || rotations.length > 0;
  const narrative     = generateNarrative(sectorData, regime);
  const dominantColor = sectorColor(sectorData?.dominant_sector ?? "");

  return (
    <div className="bg-canvas min-h-screen">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-8">

        {/* ── Page header ──────────────────────────────────────────────── */}
        <div className="space-y-3">

          {/* Title row */}
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="flex items-center gap-2 mr-1">
              <motion.span
                className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0"
                animate={{ opacity: [1, 0.3, 1] }}
                transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
              />
              <h1 className="text-xl font-bold text-ink tracking-tight flex items-center gap-2">
                <Layers size={16} className="text-ink-secondary" />
                Sectors
              </h1>
            </div>

            {regimeMeta && (
              <span className={cn(
                "text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full border",
                regimeMeta.cls,
              )}>
                {regimeMeta.label}
              </span>
            )}

            {isFetching && !isLoading && (
              <span className="text-2xs text-ink-muted flex items-center gap-1">
                <motion.span
                  animate={{ rotate: 360 }}
                  transition={{ repeat: Infinity, duration: 0.9, ease: "linear" }}
                  className="inline-block"
                >
                  <RefreshCw size={9} />
                </motion.span>
                refreshing
              </span>
            )}

            {!isLoading && cacheAge > 0 && (
              <span className="ml-auto text-2xs text-ink-muted tabular-nums">
                Updated {formatRelativeAge(cacheAge)}
              </span>
            )}
          </div>

          {/* Narrative — analyst pull-quote anchored to dominant sector color */}
          {!isLoading && narrative ? (
            <p
              className="pl-3.5 py-0.5 border-l-[2px] text-[12.5px] text-ink-secondary leading-relaxed"
              style={{ borderLeftColor: `${dominantColor}70` }}
            >
              {narrative}
            </p>
          ) : (
            <p className="text-sm text-ink-secondary">
              Capital rotation intelligence across GICS sectors
            </p>
          )}
        </div>

        {/* ── Sector Leadership ─────────────────────────────────────────── */}
        <section>
          <SectionHeader>Sector Leadership</SectionHeader>
          <SectorLeaderboard
            sectors={sectorData?.sectors ?? []}
            isLoading={isLoading}
          />
        </section>

        {/* ── Capital Rotation ──────────────────────────────────────────── */}
        {showRotations && (
          <section>
            <SectionHeader>Capital Rotation</SectionHeader>
            {isLoading ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {[...Array(3)].map((_, i) => <RotationCardSkeleton key={i} />)}
              </div>
            ) : rotations.length === 0 ? null : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {rotations.map((sig, i) => (
                  <RotationCard
                    key={`${sig.from_sector}-${sig.to_sector}`}
                    signal={sig}
                    index={i}
                  />
                ))}
              </div>
            )}
          </section>
        )}

        {/* ── Sector Intelligence ───────────────────────────────────────── */}
        {(isLoading || (sectorData?.sectors ?? []).length > 0) && (
          <section>
            <SectionHeader>Sector Intelligence</SectionHeader>
            {isLoading ? (
              <div className="space-y-4">
                {[...Array(3)].map((_, i) => (
                  <SectorIntelligenceCardSkeleton key={i} />
                ))}
              </div>
            ) : (
              <div className="space-y-4">
                {(sectorData?.sectors ?? [])
                  .filter(s => s.signal_score >= 10)
                  .slice(0, 5)
                  .map((sector, i) => (
                    <SectorIntelligenceCard
                      key={sector.name}
                      sector={sector}
                      industries={sectorData?.industries ?? []}
                      clusters={clusters}
                      regime={regime}
                      index={i}
                    />
                  ))
                }
              </div>
            )}
          </section>
        )}

      </div>
    </div>
  );
}
