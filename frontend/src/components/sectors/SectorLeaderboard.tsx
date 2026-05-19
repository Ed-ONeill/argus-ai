"use client";

import { SectorTile, sectorColor } from "./SectorTile";
import type { SectorIntelligence } from "@/lib/types";

interface SectorLeaderboardProps {
  sectors:   SectorIntelligence[];
  isLoading: boolean;
}

export function SectorLeaderboard({ sectors, isLoading }: SectorLeaderboardProps) {
  if (isLoading) return <SkeletonLeaderboard />;

  if (sectors.length === 0) {
    return (
      <div className="py-14 text-center border border-dashed border-edge rounded-xl">
        <p className="text-sm text-ink-secondary">No sector signals detected yet.</p>
        <p className="text-xs text-ink-muted mt-1">
          Waiting for the first pipeline cycle to complete.
        </p>
      </div>
    );
  }

  const leader   = sectors[0];
  const laggard  = sectors[sectors.length - 1];
  const spread   = Math.round(leader.signal_score - laggard.signal_score);
  const leaderColor  = sectorColor(leader.name);
  const laggardColor = sectorColor(laggard.name);

  return (
    <div className="space-y-3">
      {/* items-start: tiles keep their natural height — leader's extra content
          doesn't stretch adjacent tiles in the same grid row */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5 items-start">
        {sectors.map((sector, i) => (
          <SectorTile
            key={sector.name}
            sector={sector}
            index={i}
            rank={i + 1}
          />
        ))}
      </div>

      {/* Summary strip */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-0.5 pt-1 border-t border-edge/50">

        <div className="flex items-center gap-1.5">
          <span className="text-2xs font-semibold uppercase tracking-wider text-ink-muted">
            Leading
          </span>
          <span
            className="text-[11px] font-bold px-1.5 py-0.5 rounded"
            style={{ color: leaderColor, background: `${leaderColor}14` }}
          >
            {leader.name}
          </span>
          <span className="text-[11px] font-mono text-ink-muted tabular-nums">
            {leader.signal_score.toFixed(0)}
          </span>
        </div>

        <span className="h-3 w-px bg-edge shrink-0" />

        <div className="flex items-center gap-1.5">
          <span className="text-2xs font-semibold uppercase tracking-wider text-ink-muted">
            Lagging
          </span>
          <span
            className="text-[11px] font-medium"
            style={{ color: laggardColor }}
          >
            {laggard.name}
          </span>
          <span className="text-[11px] font-mono text-ink-muted tabular-nums">
            {laggard.signal_score.toFixed(0)}
          </span>
        </div>

        <span className="h-3 w-px bg-edge shrink-0" />

        <div className="flex items-center gap-1">
          <span className="text-2xs font-semibold uppercase tracking-wider text-ink-muted">
            Spread
          </span>
          <span className="text-[11px] font-mono tabular-nums text-ink-muted">
            {spread}
          </span>
        </div>

        <span className="ml-auto text-2xs text-ink-muted tabular-nums">
          {sectors.length} sector{sectors.length !== 1 ? "s" : ""} active
        </span>
      </div>
    </div>
  );
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

function SkeletonLeaderboard() {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5 items-start">
        {[...Array(5)].map((_, i) => (
          <div
            key={i}
            className={
              i === 0
                ? "bg-surface rounded-xl border border-edge border-l-[3px] border-l-edge-strong p-4 space-y-3"
                : "bg-surface rounded-xl border border-edge border-l-[3px] border-l-edge-strong p-3.5 space-y-3"
            }
          >
            <div className="flex items-start justify-between gap-1">
              <div className={i === 0 ? "h-4 w-24 bg-raised rounded animate-pulse" : "h-3 w-20 bg-raised rounded animate-pulse"} />
              <div className="h-3 w-12 bg-raised rounded animate-pulse" />
            </div>
            <div className="space-y-1.5">
              <div className="flex justify-between">
                <div className="h-2 w-8 bg-raised rounded animate-pulse" />
                <div className={i === 0 ? "h-4 w-6 bg-raised rounded animate-pulse" : "h-2 w-5 bg-raised rounded animate-pulse"} />
              </div>
              <div className={i === 0 ? "h-[4px] w-full bg-raised rounded animate-pulse" : "h-[3px] w-full bg-raised rounded animate-pulse"} />
            </div>
            {i === 0 && (
              <div className="space-y-1">
                <div className="h-2.5 w-full bg-raised rounded animate-pulse" />
                <div className="h-2.5 w-3/4 bg-raised rounded animate-pulse" />
              </div>
            )}
            <div className="h-2.5 w-12 bg-raised rounded animate-pulse" />
          </div>
        ))}
      </div>
      <div className="h-3.5 w-72 bg-raised rounded animate-pulse" />
    </div>
  );
}
