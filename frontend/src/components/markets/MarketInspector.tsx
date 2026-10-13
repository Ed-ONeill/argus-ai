"use client";

import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { ArgusChart } from "@/lib/platform/chart";
import { getIndustryBySlug } from "@/lib/industryConfig";
import type { PriceSeries } from "@/lib/platform/types/prices";
import type { RotationBlock, Zoom } from "@/lib/marketView";

export function MarketInspector({ block, series, zoom, state, stale }: {
  block: RotationBlock; series: PriceSeries | null; zoom: Zoom; state: string; stale: boolean;
}) {
  // Match the current observation half used by buildMarketView, not the entire fetch.
  const current = series ? { ...series, points: series.points.slice(Math.floor(series.points.length / 2)) } : null;
  const start = current?.points.at(0)?.t;
  const end = current?.points.at(-1)?.t;
  const industry = block.nav.kind === "sector" && getIndustryBySlug(block.nav.slug) ? block.nav.slug : null;
  const delta = zoom === "inside-stocks" ? block.leadDelta * 100 : block.leadDelta;
  const signed = (n: number) => `${n >= 0 ? "+" : ""}${n.toFixed(2)}`;
  return (
    <section aria-label={`${block.label} explained`} className="discovery-panel discovery-enter min-w-0 p-5 sm:p-6">
      <p className="discovery-eyebrow">Under the surface</p>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2"><h2 className="font-serif text-3xl">{block.label}</h2><span className="rounded-full border border-cyan-200/20 px-3 py-1 text-[11px] text-cyan-200">{state}</span></div>
      <p className="mt-2 text-xs text-ink-secondary">{series ? `${series.symbol} · ${series.exchange === "US" ? "ETF proxy" : "Spot reference"}` : "Reference unavailable"}</p>
      <div className="my-5 border-y border-edge-subtle py-4">
        <div className="flex items-baseline justify-between gap-2"><span className="text-xs text-ink-secondary">Price change in this observation</span><span className="font-mono text-xl">{signed(block.absPct)}%</span></div>
        {current && <div className="mt-4"><ArgusChart series={current} variant="sparkline" config={{ height: 100, semanticColor: false }} ariaLabel={`${series?.symbol} adjusted-close history for the selected observation`} /></div>}
        <p className="mt-3 font-mono text-[10px] text-ink-secondary">{start && end ? `${start} → ${end} · UTC` : "Observation dates unavailable"}</p>
        <p className="mt-1 text-[10px] text-ink-secondary">Adjusted closes · {stale || series?.quality?.freshness === "stale" || series?.quality?.grade === "STALE" ? "Marked stale" : "Latest available history"}. Not live quotes.</p>
      </div>
      <h3 className="text-sm font-semibold">Why this position?</h3>
      <p className="mt-2 text-xs leading-relaxed text-ink-secondary">{zoom === "whole-market"
        ? "Leadership compares each asset's return after adjusting for how much its price fluctuates. The map groups assets by whether that relative measure improved or faded between the two halves of this observation."
        : "Leadership compares this sector's return with SPY. The map groups sectors by whether that advantage improved or faded between the two halves of this observation."}</p>
      <dl className="mt-4 flex items-center justify-between gap-3 rounded-xl bg-white/[0.03] p-3 text-xs"><dt className="text-ink-secondary">Leadership change</dt><dd className="font-mono text-cyan-200">{signed(delta)} {zoom === "inside-stocks" ? "pp" : "score"}</dd></dl>
      <p className="mt-3 text-[11px] leading-relaxed text-ink-secondary">A rising price can still lose leadership. Small shifts fall into “Little changed”; a broadly quiet market is also grouped there. These price comparisons do not explain causes or predict returns.</p>
      {industry && <Link className="mt-5 flex items-center justify-between border-t border-edge pt-4 text-sm text-cyan-200" href={`/industries/${industry}`}>Explore related industry <ArrowUpRight size={16} /></Link>}
    </section>
  );
}
