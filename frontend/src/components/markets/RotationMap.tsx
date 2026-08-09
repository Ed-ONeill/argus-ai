"use client";

// components/markets/RotationMap.tsx — the canonical visualization the Market surface's
// "rotation-map" descriptor resolves to. Leadership is RELATIVE-FIRST: which column a block
// sits in (gaining vs losing leadership) and its order encode the change in relative
// leadership. Absolute price % is a SUPPORTING readout only — shown small, in its own sign
// colour — so a block can visibly sit in "gaining leadership" while its price is down (and
// vice versa). That divergence is the proof this is a rotation map, not a heatmap.

import { cn } from "@/lib/utils";
import type { MarketVisualization, RotationBlock } from "@/lib/marketView";

type RotationMapViz = Extract<MarketVisualization, { kind: "rotation-map" }>;

const pct = (v: number): string => `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`;

function Tile({ block, onSelect, focused }: { block: RotationBlock; onSelect: (b: RotationBlock) => void; focused: boolean }) {
  const up = block.absPct > 0;
  const down = block.absPct < 0;
  return (
    <button
      type="button"
      onClick={() => onSelect(block)}
      className={cn(
        "flex w-full items-baseline justify-between gap-3 rounded-lg border px-3 py-2 text-left transition-colors motion-reduce:transition-none",
        focused ? "border-accent bg-raised" : "border-edge-subtle bg-raised/50 hover:bg-raised",
      )}
    >
      <span className="flex items-baseline gap-1.5">
        <span className="text-[13.5px] font-semibold text-ink">{block.label}</span>
        {block.proxyOf && (
          <span className="text-[8px] font-semibold uppercase tracking-[0.12em] text-ink-faint">{block.proxyOf} proxy</span>
        )}
      </span>
      {/* absolute % — supporting context only */}
      <span className={cn("font-mono text-[11px] tabular-nums", up ? "text-emerald-400/85" : down ? "text-rose-400/85" : "text-ink-muted")}>
        {pct(block.absPct)}
      </span>
    </button>
  );
}

function Column({ title, arrow, tone, blocks, onSelect, focusedId }: {
  title: string; arrow: string; tone: "up" | "down"; blocks: RotationBlock[];
  onSelect: (b: RotationBlock) => void; focusedId: string | null;
}) {
  return (
    <div>
      <div className="mb-2 flex items-center gap-1.5">
        <span className={cn("text-[13px]", tone === "up" ? "text-emerald-400" : "text-rose-400")} aria-hidden>{arrow}</span>
        <h3 className="text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-faint">{title}</h3>
      </div>
      <div className="flex flex-col gap-1.5">
        {blocks.length === 0
          ? <p className="px-1 text-[12px] text-ink-faint">None this window.</p>
          : blocks.map((b) => <Tile key={b.id} block={b} onSelect={onSelect} focused={focusedId === b.id} />)}
      </div>
    </div>
  );
}

export function RotationMap({ viz, onSelect, focusedId }: {
  viz: RotationMapViz; onSelect: (b: RotationBlock) => void; focusedId: string | null;
}) {
  return (
    <div>
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <Column title="Gaining leadership" arrow="▲" tone="up" blocks={viz.rising} onSelect={onSelect} focusedId={focusedId} />
        <Column title="Losing leadership" arrow="▼" tone="down" blocks={viz.falling} onSelect={onSelect} focusedId={focusedId} />
      </div>

      {viz.steady.length > 0 && (
        <div className="mt-5">
          <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-faint">Little changed</h3>
          <div className="flex flex-wrap gap-1.5">
            {viz.steady.map((b) => <Tile key={b.id} block={b} onSelect={onSelect} focused={focusedId === b.id} />)}
          </div>
        </div>
      )}

      {viz.unavailable.length > 0 && (
        <p className="mt-4 text-[11px] text-ink-faint">
          No data this window: {viz.unavailable.map((b) => b.label).join(", ")}.
        </p>
      )}

      <p className="mt-4 text-[10px] leading-relaxed text-ink-faint">
        Position shows the shift in market leadership over the window. The percentage is price change, shown as context.
      </p>
    </div>
  );
}
