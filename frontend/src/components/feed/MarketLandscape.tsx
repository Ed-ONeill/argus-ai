"use client";

// MarketLandscape — "Today's Market Landscape", the Feed's visual centerpiece (Law 10).
//
// A calm, deliberately composed board of market concepts: a fixed cross-asset spine along
// the bottom (context, with real delayed moves) and today's event protagonists above
// (companies, macro actors, countries — the emphasis), connected by thin lines that exist
// only because a real event links them. Deterministic placement (no force-directed cloud),
// SVG lines behind token-styled DOM chips. Clicking a node focuses the editorial stream to
// that concept and keeps the user in the Feed. No graph metrics, no engine vocabulary.

import { useMemo, type CSSProperties } from "react";
import { useSeries } from "@/lib/platform/hooks/useSeries";
import { toDisplayPoints } from "@/lib/platform/chart";
import { cn } from "@/lib/utils";
import { buildMarketLandscape, type LandscapeNode } from "@/lib/marketLandscape";
import type { PriceSeries } from "@/lib/platform/types/prices";
import type { FeedResponse } from "@/lib/types";

const HEIGHT = 300;
const LOOKBACK_DAYS = 30;

function dayMove(series: PriceSeries | null): number | null {
  const pts = toDisplayPoints(series);
  if (pts.length < 2) return null;
  const last = pts[pts.length - 1].v;
  const prev = pts[pts.length - 2].v;
  return prev === 0 ? null : ((last - prev) / prev) * 100;
}

function nodeStyle(node: LandscapeNode): CSSProperties {
  return { position: "absolute", left: `${node.x}%`, top: `${node.y}%`, transform: "translate(-50%, -50%)" };
}

function SpineNode({ node, active, from, onFocus }: {
  node: LandscapeNode; active: boolean; from: string; onFocus: (n: LandscapeNode) => void;
}) {
  const { series } = useSeries(node.symbol ?? null, { from });
  const move = useMemo(() => dayMove(series), [series]);
  const up = move != null && move > 0;
  const down = move != null && move < 0;
  return (
    <button type="button" onClick={() => onFocus(node)} style={nodeStyle(node)}
      className={cn(
        "flex flex-col items-center gap-0.5 rounded-md px-2 py-1 transition-colors motion-reduce:transition-none",
        active ? "bg-raised" : "hover:bg-raised/40",
      )}>
      <span className="whitespace-nowrap text-[10px] font-semibold text-ink-secondary">{node.label}</span>
      {move != null ? (
        <span className={cn("font-mono text-[9.5px] tabular-nums", up ? "text-emerald-400" : down ? "text-rose-400" : "text-ink-muted")}>
          {up ? "+" : ""}{move.toFixed(1)}%
        </span>
      ) : (
        <span className="font-mono text-[9px] text-ink-faint">delayed</span>
      )}
    </button>
  );
}

function ProtagonistNode({ node, active, onFocus }: {
  node: LandscapeNode; active: boolean; onFocus: (n: LandscapeNode) => void;
}) {
  return (
    <button type="button" onClick={() => onFocus(node)} style={nodeStyle(node)}
      className={cn(
        "flex flex-col items-center gap-0.5 rounded-lg border px-2.5 py-1 transition-colors motion-reduce:transition-none",
        active ? "border-accent/60 bg-accent/10" : "border-edge-subtle bg-raised/60 hover:border-edge",
      )}>
      <span className="whitespace-nowrap text-[12.5px] font-semibold text-ink">{node.label}</span>
      <span className="text-[8px] uppercase tracking-[0.12em] text-ink-faint">in today&rsquo;s news</span>
    </button>
  );
}

export function MarketLandscape({ feed, activeId, onFocus }: {
  feed: FeedResponse | undefined;
  activeId?: string | null;
  onFocus: (node: LandscapeNode) => void;
}) {
  const model = useMemo(() => buildMarketLandscape(feed), [feed]);
  const nodeById = useMemo(() => new Map(model.nodes.map((n) => [n.id, n])), [model]);
  const from = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - LOOKBACK_DAYS);
    return d.toISOString().slice(0, 10);
  }, []);

  return (
    <section aria-label="Today's market landscape"
      className="relative w-full overflow-hidden rounded-2xl border border-edge/60 bg-surface/30" style={{ height: HEIGHT }}>
      <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
        {model.edges.map((e, i) => {
          const a = nodeById.get(e.from);
          const b = nodeById.get(e.to);
          if (!a || !b) return null;
          return (
            <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y}
              stroke="rgb(var(--ink-faint))" strokeOpacity={0.4} strokeWidth={1} vectorEffect="non-scaling-stroke">
              {/* Every connection is explainable in one plain sentence (the event headline). */}
              <title>{e.reason}</title>
            </line>
          );
        })}
      </svg>

      {model.nodes.map((n) =>
        n.spine
          ? <SpineNode key={n.id} node={n} from={from} active={activeId === n.id} onFocus={onFocus} />
          : <ProtagonistNode key={n.id} node={n} active={activeId === n.id} onFocus={onFocus} />,
      )}
    </section>
  );
}
