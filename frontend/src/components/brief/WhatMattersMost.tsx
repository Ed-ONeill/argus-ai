"use client";

// What Matters Most — the signature Argus surface (§WMM′/§WMM″), given the visual
// weight it deserves: oversized ultralight rank numerals (Legend/Linear), a calm
// hover lift, fading hairline dividers. Five items ranked strictly by Importance;
// each answers what · why it matters · who benefits · who's at risk · the three axes
// · lifecycle. No filler, no bare theme names.

import { EntityChip } from "@/components/common/EntityChip";
import { IntelligenceScore } from "./IntelligenceScore";
import { LifecycleBadge } from "./LifecycleBadge";
import { ExploreLink } from "./ExploreLink";
import type { EntitySpec, WhatMattersItem } from "@/lib/livingBrief";

const WIN = "#34D399";
const LOSE = "#F87171";

function ChipRow({ label, entities, color }: { label: string; entities: EntitySpec[]; color?: string }) {
  if (entities.length === 0) return null;
  return (
    <div className="flex items-baseline gap-2.5">
      <span className="w-16 shrink-0 text-[8.5px] font-semibold uppercase tracking-[0.14em] text-ink-faint">{label}</span>
      <div className="flex flex-wrap gap-1.5">
        {entities.map((e, i) => (
          <EntityChip key={`${e.label}-${i}`} kind={e.kind} label={e.label} color={color} size="md"
            className="rounded-lg border border-edge-subtle bg-raised/60 px-2 py-0.5 font-semibold" />
        ))}
      </div>
    </div>
  );
}

function Item({ item, rank }: { item: WhatMattersItem; rank: number }) {
  return (
    <li className="grid grid-cols-[2.5rem_1fr] gap-x-5 sm:grid-cols-[3.25rem_1fr] sm:gap-x-7">
      <span className="select-none pt-1 font-mono text-[34px] font-thin leading-none text-ink-faint/60 tabular-nums sm:text-[44px]">
        {rank}
      </span>
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <EntityChip kind="theme" label={item.headline} size="md"
            className="text-[19px] font-semibold leading-tight tracking-[-0.015em] text-ink sm:text-[21px]" />
          <LifecycleBadge lifecycle={item.lifecycle} />
        </div>
        <p className="max-w-[58ch] text-[13.5px] leading-relaxed text-ink-secondary">{item.why}</p>
        {/* Benefits / at-risk only; neutral "exposed" is owned once, by the Market Map. */}
        {(item.winners.length > 0 || item.losers.length > 0) && (
          <div className="flex flex-col gap-1.5 pt-1">
            <ChipRow label="Benefits" entities={item.winners} color={WIN} />
            <ChipRow label="At risk" entities={item.losers} color={LOSE} />
          </div>
        )}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
          <IntelligenceScore importance={item.importance} confidence={item.confidence} evidence={item.evidence} />
          <ExploreLink label="Trace this" entity={item.headline} />
        </div>
        {item.nextCatalyst && (
          <p className="text-[11px] text-ink-muted">Next catalyst: {item.nextCatalyst}</p>
        )}
      </div>
    </li>
  );
}

export function WhatMattersMost({ items }: { items: WhatMattersItem[] }) {
  if (items.length === 0) return null;
  return (
    <section aria-labelledby="wmm-heading">
      <h2 id="wmm-heading" className="text-[12px] font-semibold uppercase tracking-[0.22em] text-ink">
        What Matters Most
      </h2>
      {/* Whitespace, not borders, separates the five. The oversized numerals do the
          scanning work; the headline leads each item. */}
      <ol className="mt-9 flex flex-col gap-12">
        {items.map((item, i) => <Item key={item.id} item={item} rank={i + 1} />)}
      </ol>
    </section>
  );
}
