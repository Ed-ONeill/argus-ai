"use client";

// components/markets/MarketPage.tsx — the Market surface (Surface #4): "How is the market
// changing?" Anchored by the Rotation Map. Whole Market (asset classes) and Inside Stocks
// (sectors) are two zooms of one experience; default is Whole Market / 1M. Everything is
// price-derived (no engine, no theme/conviction/regime vocabulary, no causal explanation).
// Five-section grammar: Posture, Rotation Map, What's leading & lagging, What changed, What
// could change.

import { useMemo, useState, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { useSeriesBatch } from "@/lib/platform/hooks/useSeriesBatch";
import { buildMarketView, type RotationBlock, type Window, type Zoom } from "@/lib/marketView";
import { blocksForZoom, SECTOR_BENCHMARK, type MarketBlock } from "@/lib/marketBlocks";
import { MarketInspector } from "@/components/markets/MarketInspector";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { RotationMap } from "@/components/markets/RotationMap";
import { cn } from "@/lib/utils";

const WINDOWS: Window[] = ["1W", "1M", "3M"];
const WINDOW_DAYS: Record<Window, number> = { "1W": 9, "1M": 33, "3M": 95 };
const CRYPTO_FALLBACK = { symbol: "IBIT", exchange: "US" };   // labeled Bitcoin proxy when spot BTC is unavailable

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="discovery-panel p-6">
      <h2 className="mb-2.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-ink-faint">{title}</h2>
      {children}
    </section>
  );
}

export default function MarketPage() {
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

  const onSelect = (b: RotationBlock) => setFocusedId(b.id);
  const viz = view.visualization;
  const available = viz.kind === "rotation-map" ? [...viz.rising, ...viz.falling, ...viz.steady] : [];
  const selected = available.find(b => b.id === focusedId) ?? available[0];
  const selectedInput = blockInputs.find(b => b.block.id === selected?.id);
  const selectedSymbol = selectedInput?.block.proxyOf ?? selectedInput?.block.symbol;
  const selectedResult = selectedSymbol ? seriesMap[selectedSymbol] : undefined;
  const selectedState = viz.kind !== "rotation-map" || !selected ? "" : viz.rising.some(b => b.id === selected.id)
    ? "Gaining leadership" : viz.falling.some(b => b.id === selected.id) ? "Losing leadership" : "Little changed";

  const setZoomTo = (z: Zoom) => { setZoom(z); setFocusedId(null); };

  return (
    <div className="brief-dark discovery-page min-h-[calc(100vh-3.5rem)] bg-canvas text-ink">
      <div className="mx-auto relative max-w-7xl px-5 pb-20 pt-10 sm:px-8 sm:pt-14">
        <header className="discovery-enter mb-9 flex flex-wrap items-end justify-between gap-6">
          <div><p className="discovery-eyebrow">Argus / Markets</p>
            <h1 className="mt-4 font-serif text-[clamp(2.4rem,5vw,4.2rem)] leading-[1.06] tracking-tight">A market in motion.<br /><span className="text-cyan-200">A clearer perspective.</span></h1>
            <p className="mt-5 max-w-[58ch] text-sm leading-relaxed text-ink-secondary">See where relative leadership is improving or fading. Explore an asset to understand the price comparison behind the picture.</p>
          </div>
          <Link href="/feed" className="discovery-control">Explore the reporting <ArrowUpRight size={15} /></Link>
        </header>
        <div className="mb-8 border-l-2 border-cyan-200/60 pl-5">
          <p className="discovery-eyebrow">The current picture / {window}</p>
          <p className="mt-3 max-w-[65ch] font-serif text-xl leading-relaxed sm:text-2xl">{anyLoading && viz.kind === "none" ? "Reading the available price history…" : view.posture.sentence}</p>
        </div>
        <div className="flex flex-col gap-8">
          {/* 2. Rotation Map (with the zoom + window controls) */}
          <section>
            <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-edge-subtle bg-surface/40 p-3">
              <div className="flex gap-1" role="group" aria-label="Zoom">
                {(["whole-market", "inside-stocks"] as Zoom[]).map((z) => (
                  <button key={z} type="button" onClick={() => setZoomTo(z)} aria-pressed={z === zoom}
                    className={cn("rounded-xl px-4 py-2.5 text-xs font-semibold tracking-wide transition-colors motion-reduce:transition-none",
                      z === zoom ? "bg-cyan-200 text-slate-950" : "text-ink-secondary hover:text-ink")}>
                    {z === "whole-market" ? "Whole market" : "Inside stocks"}
                  </button>
                ))}
              </div>
              <div className="flex gap-1" role="group" aria-label="Timeframe">
                {WINDOWS.map((w) => (
                  <button key={w} type="button" onClick={() => setWindow(w)} aria-pressed={w === window}
                    className={cn("rounded-lg px-3 py-2 text-xs font-semibold tracking-wide transition-colors motion-reduce:transition-none",
                      w === window ? "bg-cyan-200 text-slate-950" : "text-ink-secondary hover:text-ink")}>
                    {w}
                  </button>
                ))}
              </div>
            </div>

            {viz.kind === "rotation-map" ? (
              <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(300px,1fr)]">
                <div><div className="mb-5 flex items-baseline justify-between gap-4"><h2 className="font-serif text-2xl">The rotation map</h2><span className="font-mono text-[11px] text-ink-secondary">{available.length} references</span></div>
                  <RotationMap viz={viz} onSelect={onSelect} focusedId={selected?.id ?? null} />
                  {selected && <a href="#market-explanation" className="discovery-control mt-4 lg:hidden">Read {selected.label}&rsquo;s position ↓</a>}
                </div>
                <div id="market-explanation" className="min-w-0 scroll-mt-24 lg:sticky lg:top-24">
                  {selected && <MarketInspector key={`${zoom}-${window}-${selected.id}`} block={selected} series={selectedResult?.series ?? null} stale={selectedResult?.stale ?? false} zoom={zoom} state={selectedState} />}
                </div>
              </div>
            ) : <div role="status" className="discovery-panel p-8 text-sm text-ink-secondary">{anyLoading ? "Reading the market…" : "Market data is unavailable right now."}</div>}
          </section>
          <div className="grid gap-5 md:grid-cols-2">
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
    </div>
  );
}
