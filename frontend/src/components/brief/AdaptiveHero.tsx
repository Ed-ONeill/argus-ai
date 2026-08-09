"use client";

// AdaptiveHero — the homepage's center of gravity (PX3 / PX3.1). It renders the lead story
// with an emphasis that ADAPTS to the day's intelligence, never a fixed template:
//   chart-dominant     — a company/price day: the living full chart leads, intelligence below
//   explanation-dominant — a macro/policy day: the explanation leads, a small proxy chart supports (or is omitted)
//   text-first         — no chartable security: the lead block alone
// One shared ArgusChart primitive (config only). LeadStory is reused UNCHANGED for the
// what/why/who/watch. Honest at runtime: if the resolved series is actually absent, a
// chart-dominant day degrades to text-first rather than showing an empty hero.

import { useMemo, useState } from "react";
import { ArgusChart, changeInfo, toDisplayPoints } from "@/lib/platform/chart";
import { useSeries } from "@/lib/platform/hooks/useSeries";
import { EntityChip } from "@/components/common/EntityChip";
import { cn } from "@/lib/utils";
import type { AdaptiveHeroPlan } from "@/lib/adaptiveHero";
import type { WhyItsMoving } from "@/lib/homeBriefing";
import type { TopStory } from "@/lib/topStories";
import { LeadStory } from "./LeadStory";

const RANGES = ["1M", "3M", "6M", "1Y", "5Y"] as const;
type Range = (typeof RANGES)[number];
const RANGE_DAYS: Record<Range, number> = { "1M": 31, "3M": 93, "6M": 186, "1Y": 372, "5Y": 1830 };

function fromForRange(r: Range): string {
  const d = new Date();
  d.setDate(d.getDate() - RANGE_DAYS[r]);
  return d.toISOString().slice(0, 10);
}

export function AdaptiveHero({ story, plan, why, watchLine }: {
  story: TopStory;
  plan: AdaptiveHeroPlan;
  why: WhyItsMoving | null;
  watchLine: string | null;
}) {
  const inst = plan.instrument;
  const [range, setRange] = useState<Range>("6M");
  const from = useMemo(() => fromForRange(range), [range]);

  const { series, isLoading } = useSeries(inst?.symbol ?? null, {
    exchange: inst?.exchange, from, enabled: !!inst,
  });

  const points = useMemo(() => toDisplayPoints(series), [series]);
  const change = useMemo(() => changeInfo(points), [points]);
  const chartReady = !!inst && points.length >= 2;

  // Honest runtime degradation: a chart-dominant day with no real series falls to text-first.
  const mode = plan.mode === "chart-dominant" && !chartReady && !isLoading ? "text-first" : plan.mode;

  const chart = inst && chartReady ? (
    <figure className="m-0">
      <figcaption className="mb-2 flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <EntityChip kind="ticker" label={inst.symbol} size="md" className="text-[15px] font-semibold text-ink" />
        {inst.representative && (
          <span className="text-[9px] font-semibold uppercase tracking-[0.14em] text-ink-faint">
            representative for {inst.representativeOf}
          </span>
        )}
      </figcaption>
      <ArgusChart
        series={series}
        variant={mode === "chart-dominant" ? "full" : "compact"}
        config={{ height: mode === "chart-dominant" ? 260 : 120 }}
        ariaLabel={`${inst.symbol} price, ${change ? `${change.direction} ${Math.abs(change.pctChange).toFixed(2)} percent over ${points.length} sessions` : ""}, delayed`}
      />
      {mode === "chart-dominant" && (
        <div className="mt-2 flex gap-1" role="group" aria-label="Timeframe">
          {RANGES.map((r) => (
            <button key={r} type="button" onClick={() => setRange(r)} aria-pressed={r === range}
              className={cn(
                "rounded px-2 py-0.5 text-[10px] font-semibold tracking-wide transition-colors motion-reduce:transition-none",
                r === range ? "bg-raised text-ink" : "text-ink-faint hover:text-ink-secondary",
              )}>
              {r}
            </button>
          ))}
        </div>
      )}
    </figure>
  ) : null;

  if (mode === "chart-dominant") {
    return (
      <div className="flex flex-col gap-5">
        {chart}
        <LeadStory story={story} why={why} watchLine={watchLine} />
      </div>
    );
  }

  if (mode === "explanation-dominant") {
    return (
      <div className="flex flex-col gap-5">
        <LeadStory story={story} why={why} watchLine={watchLine} />
        {chart}
      </div>
    );
  }

  // text-first
  return <LeadStory story={story} why={why} watchLine={watchLine} />;
}
