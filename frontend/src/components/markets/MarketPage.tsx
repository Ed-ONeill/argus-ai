"use client";

// components/markets/MarketPage.tsx — the Market surface (Surface #4): "How is the market
// changing?" Anchored by the Rotation Map. Whole Market (asset classes) and Inside Stocks
// (sectors) are two zooms of one experience; default is Whole Market / 1M. Everything is
// price-derived (no engine, no theme/conviction/regime vocabulary, no causal explanation).
// Five-section grammar: Posture, Rotation Map, What's leading & lagging, What changed, What
// could change.

import { useMemo, useState, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useSeriesBatch } from "@/lib/platform/hooks/useSeriesBatch";
import { buildMarketView, type RotationBlock, type Window, type Zoom } from "@/lib/marketView";
import { blocksForZoom, SECTOR_BENCHMARK, type MarketBlock } from "@/lib/marketBlocks";
import { getIndustryBySlug } from "@/lib/industryConfig";
import { RotationMap } from "@/components/markets/RotationMap";
import { cn } from "@/lib/utils";

const WINDOWS: Window[] = ["1W", "1M", "3M"];
const WINDOW_DAYS: Record<Window, number> = { "1W": 9, "1M": 33, "3M": 95 };
const CRYPTO_FALLBACK = { symbol: "IBIT", exchange: "US" };   // labeled Bitcoin proxy when spot BTC is unavailable

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="mb-2.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-ink-faint">{title}</h2>
      {children}
    </section>
  );
}

export default function MarketPage() {
  const router = useRouter();
  const params = useSearchParams();
  const [zoom, setZoom] = useState<Zoom>(params.get("view") === "stocks" ? "inside-stocks" : "whole-market");
  const [window, setWindow] = useState<Window>("1M");
  const [focusedId, setFocusedId] = useState<string | null>(null);

  const blocks = blocksForZoom(zoom);
  // Fetch TWICE the window so the View Model can compare the previous observation to the
  // current one ("what changed"). It splits the series into prior/current halves itself.
  const from = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 2 * WINDOW_DAYS[window]);
    return d.toISOString().slice(0, 10);
  }, [window]);

  // Fetch every block's proxy + the sector benchmark + the Bitcoin proxy fallback, all through
  // the one canonical cached price path. Partial failure degrades per block.
  const fetchList = useMemo(() => {
    const list = blocks.map((b) => ({ symbol: b.symbol, exchange: b.exchange }));
    if (zoom === "inside-stocks") list.push(SECTOR_BENCHMARK);
    else list.push(CRYPTO_FALLBACK);
    return list;
  }, [blocks, zoom]);

  const seriesMap = useSeriesBatch(fetchList, { from });
  const anyLoading = Object.values(seriesMap).some((r) => r.isLoading);

  // Resolve each block's points; for Bitcoin prefer real spot data, else the labeled IBIT proxy.
  const blockInputs = useMemo(() => blocks.map((b) => {
    if (b.id === "crypto") {
      const real = seriesMap[b.symbol]?.series?.points ?? null;
      if (real) return { block: b, points: real };
      const proxy = seriesMap[CRYPTO_FALLBACK.symbol]?.series?.points ?? null;
      return { block: { ...b, proxyOf: "IBIT" } as MarketBlock, points: proxy };
    }
    return { block: b, points: seriesMap[b.symbol]?.series?.points ?? null };
  }), [blocks, seriesMap]);

  const benchmark = zoom === "inside-stocks" ? seriesMap[SECTOR_BENCHMARK.symbol]?.series?.points ?? null : null;
  const view = useMemo(() => buildMarketView({ zoom, window, blocks: blockInputs, benchmark }), [zoom, window, blockInputs, benchmark]);

  const onSelect = (b: RotationBlock) => {
    const nav = b.nav;
    if (nav.kind === "focus-block") setFocusedId((cur) => (cur === nav.id ? null : nav.id));
    else if (nav.kind === "sector") {
      if (getIndustryBySlug(nav.slug)) router.push(`/industries/${nav.slug}`);
      else setFocusedId((cur) => (cur === b.id ? null : b.id));   // no clean industry match -> focus in place
    } else if (nav.kind === "company") router.push(`/intel/company:ticker:${nav.ticker.toUpperCase()}`);
    else if (nav.kind === "event") router.push(`/event/${nav.id}`);
  };

  const setZoomTo = (z: Zoom) => { setZoom(z); setFocusedId(null); };

  return (
    <div className="brief-dark min-h-[calc(100vh-3.5rem)] bg-canvas text-ink">
      <div className="mx-auto max-w-3xl px-5 pb-16 pt-8 sm:px-8">
        <span className="text-[9px] font-semibold uppercase tracking-[0.2em] text-accent">Markets</span>

        <div className="mt-9 flex flex-col gap-9">
          {/* 1. Posture */}
          <h1 className="max-w-[40ch] font-serif text-[clamp(1.3rem,2.8vw,1.9rem)] font-normal leading-[1.28] tracking-[-0.01em] text-ink">
            {view.posture.sentence}
          </h1>

          {/* 2. Rotation Map (with the zoom + window controls) */}
          <section>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div className="flex gap-1" role="group" aria-label="Zoom">
                {(["whole-market", "inside-stocks"] as Zoom[]).map((z) => (
                  <button key={z} type="button" onClick={() => setZoomTo(z)} aria-pressed={z === zoom}
                    className={cn("rounded px-2.5 py-1 text-[11px] font-semibold tracking-wide transition-colors motion-reduce:transition-none",
                      z === zoom ? "bg-raised text-ink" : "text-ink-faint hover:text-ink-secondary")}>
                    {z === "whole-market" ? "Whole market" : "Inside stocks"}
                  </button>
                ))}
              </div>
              <div className="flex gap-1" role="group" aria-label="Timeframe">
                {WINDOWS.map((w) => (
                  <button key={w} type="button" onClick={() => setWindow(w)} aria-pressed={w === window}
                    className={cn("rounded px-2 py-1 text-[11px] font-semibold tracking-wide transition-colors motion-reduce:transition-none",
                      w === window ? "bg-raised text-ink" : "text-ink-faint hover:text-ink-secondary")}>
                    {w}
                  </button>
                ))}
              </div>
            </div>

            {view.visualization.kind === "rotation-map"
              ? <RotationMap viz={view.visualization} onSelect={onSelect} focusedId={focusedId} />
              : <p className="text-[13.5px] text-ink-secondary">{anyLoading ? "Reading the market…" : "Market data is unavailable right now."}</p>}
          </section>

          {/* 3. What changed — transitions since the previous observation (not the current map) */}
          {view.whatChanged.length > 0 && (
            <Section title="What changed">
              <ul className="flex flex-col gap-1.5">
                {view.whatChanged.map((s, i) => <li key={i} className="max-w-[64ch] text-[13.5px] leading-relaxed text-ink-secondary">{s}</li>)}
              </ul>
            </Section>
          )}

          {/* 4. What could change the picture */}
          {view.whatCouldChange.length > 0 && (
            <Section title="What could change the picture">
              <ul className="flex flex-col gap-2">
                {view.whatCouldChange.map((s, i) => <li key={i} className="max-w-[60ch] font-serif text-[14px] italic leading-snug text-ink-secondary">{s}</li>)}
              </ul>
            </Section>
          )}
        </div>
      </div>
    </div>
  );
}
