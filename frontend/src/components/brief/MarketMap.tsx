"use client";

// Market Map — the PRIMARY VISUAL IDENTITY of the Living Brief (§MAP″/§MAP‴). The
// screenshot moment: a compact, premium transmission map answering what started this
// · where it flows · who benefits · who loses. Node cards lit from above, the trigger
// glowing in brand accent, a single travelling pulse per connector. Institutional,
// not busy — distinct from the dense Intelligence Network.

import { EntityChip } from "@/components/common/EntityChip";
import { cn } from "@/lib/utils";
import { ExploreLink } from "./ExploreLink";
import type { MapNode, MarketMap as MarketMapVM } from "@/lib/livingBrief";

const WIN = "#34D399";
const LOSE = "#F87171";

const ROLE_LABEL: Record<string, string> = { source: "Trigger", mechanism: "Mechanism", sector: "Flows to" };

function Node({ node }: { node: MapNode }) {
  const trigger = node.role === "source";
  return (
    <div className={cn(
      "flex min-w-[8.5rem] flex-col items-center rounded-2xl px-4 py-3 text-center",
      trigger ? "brief-node-trigger" : "brief-node",
    )}>
      <span className={cn(
        "mb-1 text-[8px] font-semibold uppercase tracking-[0.18em]",
        trigger ? "text-accent" : "text-ink-faint",
      )}>
        {ROLE_LABEL[node.role] ?? "Node"}
      </span>
      <EntityChip kind={node.kind} label={node.label} size="md"
        className={cn("text-[13.5px] font-semibold", trigger ? "text-accent" : "text-ink")} />
    </div>
  );
}

function Connector({ live }: { live?: boolean }) {
  return (
    <div className="flex items-center justify-center py-1.5 md:py-0" aria-hidden>
      <div className="relative h-7 w-px overflow-hidden rounded-full bg-gradient-to-b from-edge-strong/70 to-edge/20 md:h-px md:w-11 md:bg-gradient-to-r">
        {/* The chain only "flows" while the market is actually open — the motion
            means something (transmission is happening now), never decoration. */}
        <span className={cn(
          "absolute top-0 h-2 w-px rounded-full bg-accent shadow-[0_0_8px_rgba(37,99,235,0.9)] md:top-0 md:h-px md:w-2.5",
          live ? "brief-flow-dot" : "left-1/2 opacity-25",
        )} />
      </div>
    </div>
  );
}

function Leaves({ label, nodes, color }: { label: string; nodes: MapNode[]; color: string }) {
  if (nodes.length === 0) return null;
  return (
    <div className="flex flex-col gap-2">
      <span className="text-[9px] font-semibold uppercase tracking-[0.16em]" style={{ color }}>{label}</span>
      <div className="flex flex-wrap gap-2">
        {nodes.map((n, i) => (
          <EntityChip key={`${n.label}-${i}`} kind={n.kind} label={n.label} color={color} size="md"
            className="rounded-lg border border-edge-subtle bg-canvas/40 px-2 py-1 font-semibold" />
        ))}
      </div>
    </div>
  );
}

export function MarketMap({ map, live }: { map: MarketMapVM; live?: boolean }) {
  return (
    <section aria-labelledby="map-heading" className="brief-panel overflow-hidden rounded-[22px] p-6 sm:p-7">
      <div className="mb-3 flex items-baseline justify-between">
        <h2 id="map-heading" className="text-[12px] font-semibold uppercase tracking-[0.22em] text-ink">
          Market Map
        </h2>
        <span className="text-[9.5px] uppercase tracking-[0.16em] text-ink-faint">How the #1 story transmits</span>
      </div>

      {/* The aha — read this in three seconds; the chain below is the proof. */}
      <p className="mb-6 max-w-[44ch] font-serif text-[clamp(1.05rem,2vw,1.35rem)] leading-snug text-ink">
        {map.read}
      </p>

      {/* Transmission spine — vertical on mobile, horizontal on desktop. */}
      <div className="flex flex-col items-center md:flex-row md:flex-wrap md:items-center md:justify-center md:gap-y-3">
        {map.spine.map((node, i) => (
          <div key={i} className="flex flex-col items-center md:flex-row md:items-center">
            <Node node={node} />
            {i < map.spine.length - 1 && <Connector live={live} />}
          </div>
        ))}
      </div>

      {(map.winners.length > 0 || map.losers.length > 0) && (
        <div className="mt-7 flex flex-wrap justify-center gap-x-12 gap-y-5">
          <Leaves label="Who benefits" nodes={map.winners} color={WIN} />
          <Leaves label="Who is hurt" nodes={map.losers} color={LOSE} />
        </div>
      )}

      <div className="mt-7 flex justify-center border-t border-edge-subtle pt-4">
        <ExploreLink label="Explore this chain" entity={map.title} />
      </div>
    </section>
  );
}
