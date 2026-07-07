"use client";

/**
 * components/explore/MarketView.tsx - the default center workspace of the
 * Intelligence Explorer for companies and ETFs: a market-data terminal view.
 *
 * Reads only what already exists on the graph: node.metadata.latestMarketData
 * (via the shared MarketStructureVM) and the historical OHLCV bars the market
 * ingestion may have attached as a mkt:{ticker}:ohlcv node (via PriceSeriesVM).
 * When no historical series exists the chart shows an honest snapshot placeholder;
 * nothing is fabricated. Single-series line, crosshair + tooltip, muted grid.
 * No em/en dashes.
 */

import { useMemo, useRef, useState } from "react";
import { fmtCompact, fmtDay, fmtDate, type MarketStructureVM, type PriceSeriesVM, type PricePoint } from "@/lib/intelligenceShared";

const A = (n: number) => `rgba(255,255,255,${n})`;
const LINE = "#7cc7d8"; // single series hue; contrast-validated against the dark surface

const DAY = 86_400_000;
type RangeKey = "1D" | "5D" | "1M" | "6M" | "YTD" | "1Y";
const RANGES: RangeKey[] = ["1D", "5D", "1M", "6M", "YTD", "1Y"];

function rangeStart(key: RangeKey, now: number): number {
  switch (key) {
    case "1D":  return now - 1 * DAY;
    case "5D":  return now - 5 * DAY;
    case "1M":  return now - 31 * DAY;
    case "6M":  return now - 183 * DAY;
    case "YTD": return new Date(new Date(now).getFullYear(), 0, 1).getTime();
    case "1Y":  return now - 366 * DAY;
  }
}

/* Chart geometry: rendered into a responsive viewBox. */
const CW = 860, CH = 300, PAD_L = 10, PAD_R = 64, PAD_T = 14, PAD_B = 26, VOL_H = 44;

interface ChartVM {
  points: PricePoint[];
  xOf: (t: number) => number;
  yOf: (c: number) => number;
  linePath: string;
  areaPath: string;
  yTicks: Array<{ y: number; label: string }>;
  xTicks: Array<{ x: number; label: string }>;
  maxVol: number;
  up: boolean;
}

function buildChart(points: PricePoint[]): ChartVM | null {
  if (points.length < 2) return null;
  const t0 = points[0].t, t1 = points[points.length - 1].t;
  const closes = points.map(p => p.c);
  let lo = Math.min(...closes), hi = Math.max(...closes);
  if (hi === lo) { hi += Math.abs(hi) * 0.01 || 1; lo -= Math.abs(lo) * 0.01 || 1; }
  const pad = (hi - lo) * 0.06;
  lo -= pad; hi += pad;

  const plotW = CW - PAD_L - PAD_R, plotH = CH - PAD_T - PAD_B;
  const xOf = (t: number) => PAD_L + ((t - t0) / (t1 - t0 || 1)) * plotW;
  const yOf = (c: number) => PAD_T + (1 - (c - lo) / (hi - lo)) * plotH;

  let linePath = "";
  for (let i = 0; i < points.length; i++) {
    linePath += `${i === 0 ? "M" : "L"}${xOf(points[i].t).toFixed(1)},${yOf(points[i].c).toFixed(1)}`;
  }
  const baseY = PAD_T + plotH;
  const areaPath = `${linePath}L${xOf(t1).toFixed(1)},${baseY}L${xOf(t0).toFixed(1)},${baseY}Z`;

  const yTicks = [0, 1, 2, 3].map(i => {
    const v = lo + ((hi - lo) * i) / 3;
    return { y: yOf(v), label: v >= 1000 ? fmtCompact(v) : v.toFixed(2) };
  });
  const tickCount = Math.min(4, points.length);
  const xTicks = Array.from({ length: tickCount }, (_, i) => {
    const p = points[Math.round((i * (points.length - 1)) / (tickCount - 1 || 1))];
    return { x: xOf(p.t), label: fmtDay(new Date(p.t).toISOString()) };
  });

  const maxVol = Math.max(0, ...points.map(p => p.v ?? 0));
  return { points, xOf, yOf, linePath, areaPath, yTicks, xTicks, maxVol, up: points[points.length - 1].c >= points[0].c };
}

function StatCell({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="px-3 py-2 rounded-md" style={{ background: A(0.03), border: `1px solid ${A(0.06)}` }}>
      <p className="text-[12px] font-black tabular-nums leading-none" style={{ color: color ?? A(0.9) }}>{value}</p>
      <p className="text-[7.5px] font-bold uppercase tracking-wider mt-1" style={{ color: A(0.38) }}>{label}</p>
    </div>
  );
}

export function MarketView({ structure, series, ticker }: {
  structure: MarketStructureVM | null;
  series: PriceSeriesVM;
  ticker: string;
}) {
  const now = Date.now();
  const [range, setRange] = useState<RangeKey>("1M");
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  // Which ranges have enough real bars to draw (>= 2 points). Never interpolated.
  const rangeAvail = useMemo(() => {
    const m = new Map<RangeKey, PricePoint[]>();
    for (const k of RANGES) {
      const pts = series.available ? series.points.filter(p => p.t >= rangeStart(k, now)) : [];
      m.set(k, pts);
    }
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [series]);
  const chart = useMemo(() => buildChart(rangeAvail.get(range) ?? []), [rangeAvail, range]);

  const hover = hoverIdx !== null && chart ? chart.points[hoverIdx] : null;

  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!chart || !svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const vx = ((e.clientX - rect.left) / rect.width) * CW;
    let best = 0, bestD = Infinity;
    for (let i = 0; i < chart.points.length; i++) {
      const d = Math.abs(chart.xOf(chart.points[i].t) - vx);
      if (d < bestD) { bestD = d; best = i; }
    }
    setHoverIdx(best);
  };

  if (!structure) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center px-8 text-center">
        <p className="text-[13px] font-semibold" style={{ color: A(0.6) }}>No market data for {ticker} yet</p>
        <p className="text-[11px] leading-snug max-w-[340px] mt-1.5" style={{ color: A(0.38) }}>
          Market structure renders once a market-data provider has observed this entity.
        </p>
      </div>
    );
  }

  const chg = structure.changePercent;
  const chgColor = chg == null ? A(0.5) : chg >= 0 ? "#34d399" : "#f87171";
  const plotBottom = CH - PAD_B;

  return (
    <div className="flex-1 min-h-0 overflow-y-auto scrollbar-hide">
      {/* Tape header: price, daily move, day range. Real values only. */}
      <div className="flex items-baseline gap-4 px-5 pt-4 flex-wrap">
        <span className="text-[34px] font-black tabular-nums leading-none tracking-tight" style={{ color: A(0.97) }}>{structure.price.toFixed(2)}</span>
        {chg !== null && (
          <span className="text-[15px] font-bold tabular-nums" style={{ color: chgColor }}>{chg > 0 ? "+" : ""}{chg.toFixed(2)}% today</span>
        )}
        {structure.low !== null && structure.high !== null && (
          <span className="text-[10px] font-semibold tabular-nums uppercase tracking-wide" style={{ color: A(0.45) }}>
            Day {structure.low.toFixed(2)} - {structure.high.toFixed(2)}
          </span>
        )}
        <span className="ml-auto text-[9px] uppercase tracking-wider tabular-nums" style={{ color: structure.stale ? "#f59e0b" : A(0.4) }}>
          {structure.provider.toUpperCase()} · {structure.freshness}{structure.stale ? " · stale" : ""}
        </span>
      </div>

      {/* Range control */}
      <div className="flex items-center gap-1 px-5 mt-3">
        {RANGES.map(k => {
          const enabled = (rangeAvail.get(k)?.length ?? 0) >= 2;
          const active = range === k;
          return (
            <button key={k} onClick={() => enabled && setRange(k)} disabled={!enabled}
              className="text-[10px] font-bold tabular-nums px-2.5 py-1 rounded transition-colors"
              style={active
                ? { color: "#7cc7d8", background: "rgba(82,176,200,0.16)", border: "1px solid rgba(82,176,200,0.35)" }
                : { color: enabled ? A(0.55) : A(0.22), background: A(0.03), border: `1px solid ${A(0.08)}`, cursor: enabled ? "pointer" : "not-allowed" }}>
              {k}
            </button>
          );
        })}
        {series.available && series.interval && (
          <span className="ml-2 text-[8.5px] uppercase tracking-wider tabular-nums" style={{ color: A(0.3) }}>{series.interval} bars · {series.points.length} on record</span>
        )}
      </div>

      {/* Chart, or the honest snapshot placeholder */}
      <div className="px-5 mt-2.5">
        <div className="rounded-lg border overflow-hidden" style={{ borderColor: A(0.07), background: "rgba(255,255,255,0.015)" }}>
          {chart ? (
            <svg ref={svgRef} viewBox={`0 0 ${CW} ${CH}`} className="w-full block select-none"
              onMouseMove={onMove} onMouseLeave={() => setHoverIdx(null)}>
              <defs>
                <linearGradient id="mv-area" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={LINE} stopOpacity={0.16} />
                  <stop offset="100%" stopColor={LINE} stopOpacity={0} />
                </linearGradient>
              </defs>
              {/* recessive grid + y labels */}
              {chart.yTicks.map((tk, i) => (
                <g key={i}>
                  <line x1={PAD_L} x2={CW - PAD_R} y1={tk.y} y2={tk.y} stroke="#ffffff" strokeOpacity={0.05} />
                  <text x={CW - PAD_R + 8} y={tk.y + 3} fontSize={10} fill={A(0.4)} className="tabular-nums">{tk.label}</text>
                </g>
              ))}
              {chart.xTicks.map((tk, i) => (
                <text key={i} x={tk.x} y={CH - 8} fontSize={9.5} textAnchor="middle" fill={A(0.35)}>{tk.label}</text>
              ))}
              {/* volume shadow bars (real v values only) */}
              {chart.maxVol > 0 && chart.points.map((p, i) => p.v ? (
                <rect key={i} x={chart.xOf(p.t) - 1.5} width={3}
                  y={plotBottom - (p.v / chart.maxVol) * VOL_H} height={(p.v / chart.maxVol) * VOL_H}
                  fill="#ffffff" opacity={hoverIdx === i ? 0.28 : 0.08} />
              ) : null)}
              {/* single-series area + 2px line */}
              <path d={chart.areaPath} fill="url(#mv-area)" />
              <path d={chart.linePath} fill="none" stroke={LINE} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
              {/* last-price marker + direct label */}
              <circle cx={chart.xOf(chart.points[chart.points.length - 1].t)} cy={chart.yOf(chart.points[chart.points.length - 1].c)} r={3.5} fill={LINE} />
              <text x={CW - PAD_R + 8} y={chart.yOf(chart.points[chart.points.length - 1].c) + 3} fontSize={10.5} fontWeight={700} fill={A(0.85)} className="tabular-nums">
                {chart.points[chart.points.length - 1].c.toFixed(2)}
              </text>
              {/* crosshair + tooltip */}
              {hover && (
                <g>
                  <line x1={chart.xOf(hover.t)} x2={chart.xOf(hover.t)} y1={PAD_T} y2={plotBottom} stroke="#ffffff" strokeOpacity={0.18} strokeDasharray="3 3" />
                  <circle cx={chart.xOf(hover.t)} cy={chart.yOf(hover.c)} r={4.5} fill={LINE} stroke="#070b13" strokeWidth={2} />
                  {(() => {
                    const bx = Math.min(Math.max(chart.xOf(hover.t) + 10, PAD_L), CW - PAD_R - 168);
                    return (
                      <g transform={`translate(${bx},${PAD_T + 4})`}>
                        <rect width={160} height={hover.v ? 52 : 38} rx={6} fill="rgba(8,12,20,0.96)" stroke={A(0.14)} />
                        <text x={10} y={16} fontSize={10} fill={A(0.55)}>{fmtDate(new Date(hover.t).toISOString())}</text>
                        <text x={10} y={31} fontSize={12} fontWeight={700} fill={A(0.92)} className="tabular-nums">Close {hover.c.toFixed(2)}</text>
                        {hover.v ? <text x={10} y={45} fontSize={10} fill={A(0.5)} className="tabular-nums">Volume {fmtCompact(hover.v)}</text> : null}
                      </g>
                    );
                  })()}
                </g>
              )}
            </svg>
          ) : (
            <div className="relative" style={{ height: 240 }}>
              {/* snapshot placeholder: a dashed reference line at the current price,
                  clearly annotated. No fabricated history. */}
              <svg viewBox={`0 0 ${CW} 240`} className="w-full h-full block select-none">
                <line x1={PAD_L} x2={CW - PAD_R} y1={120} y2={120} stroke={LINE} strokeOpacity={0.4} strokeWidth={1.5} strokeDasharray="6 6" />
                <circle cx={CW - PAD_R - 10} cy={120} r={4} fill={LINE} />
                <text x={CW - PAD_R + 8} y={124} fontSize={11} fontWeight={700} fill={A(0.85)} className="tabular-nums">{structure.price.toFixed(2)}</text>
                <text x={PAD_L + 4} y={110} fontSize={9.5} fill={A(0.4)}>CURRENT PRICE</text>
              </svg>
              <div className="absolute inset-x-0 bottom-5 flex justify-center pointer-events-none">
                <p className="text-[10.5px] px-3 py-1.5 rounded-md" style={{ color: A(0.55), background: "rgba(8,12,20,0.85)", border: `1px solid ${A(0.1)}` }}>
                  Historical price series not available yet. Current market snapshot is shown.
                </p>
              </div>
            </div>
          )}
        </div>
        {series.available && !chart && (
          <p className="text-[9.5px] mt-1.5" style={{ color: A(0.4) }}>Not enough recorded bars for the {range} window. Pick a wider range.</p>
        )}
      </div>

      {/* Market structure grid: straight reads of latestMarketData, missing cells drop. */}
      <div className="px-5 mt-4 pb-5">
        <p className="text-[9px] font-bold uppercase tracking-[0.18em] mb-2" style={{ color: A(0.34) }}>Market Structure</p>
        <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(128px, 1fr))" }}>
          {structure.volume !== null && <StatCell label="Volume" value={fmtCompact(structure.volume)} />}
          {structure.avgVolume !== null && <StatCell label="Avg Volume" value={fmtCompact(structure.avgVolume)} />}
          {structure.relativeVolume !== null && <StatCell label="Relative Volume" value={`${structure.relativeVolume.toFixed(2)}x`} color={structure.relativeVolume > 1.5 ? "#34d399" : undefined} />}
          {structure.dollarVolume !== null && <StatCell label="Dollar Volume" value={fmtCompact(structure.dollarVolume)} />}
          {structure.marketCap !== null && <StatCell label="Market Cap" value={fmtCompact(structure.marketCap)} />}
          {structure.yearHigh !== null && <StatCell label="52W High" value={structure.yearHigh.toFixed(2)} />}
          {structure.yearLow !== null && <StatCell label="52W Low" value={structure.yearLow.toFixed(2)} />}
          {structure.previousClose !== null && <StatCell label="Prev Close" value={structure.previousClose.toFixed(2)} />}
          {structure.open !== null && <StatCell label="Open" value={structure.open.toFixed(2)} />}
          {structure.vwap !== null && <StatCell label="VWAP" value={structure.vwap.toFixed(2)} />}
          {structure.beta !== null && <StatCell label="Beta (Volatility)" value={structure.beta.toFixed(2)} />}
          {structure.spread !== null && <StatCell label="Bid/Ask Spread" value={structure.spread.toFixed(2)} />}
          {structure.exchange !== null && <StatCell label="Exchange" value={structure.exchange} />}
          <StatCell label="Provider" value={structure.provider.toUpperCase()} />
          <StatCell label="Updated" value={structure.freshness} color={structure.stale ? "#f59e0b" : undefined} />
        </div>

        {structure.yearPosition !== null && structure.yearLow !== null && structure.yearHigh !== null && (
          <div className="mt-3">
            <div className="flex items-baseline justify-between">
              <span className="text-[8.5px] font-bold uppercase tracking-wider" style={{ color: A(0.4) }}>52-Week Position</span>
              <span className="text-[10.5px] font-semibold tabular-nums" style={{ color: A(0.72) }}>{structure.yearPosition}% of range</span>
            </div>
            <div className="relative h-[5px] rounded-full mt-1.5" style={{ background: A(0.08) }}>
              <div className="absolute top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full" style={{ left: `calc(${structure.yearPosition}% - 5px)`, background: LINE, boxShadow: `0 0 8px ${LINE}66` }} />
            </div>
            <div className="flex justify-between mt-1">
              <span className="text-[9px] tabular-nums" style={{ color: A(0.4) }}>{structure.yearLow.toFixed(2)}</span>
              <span className="text-[9px] tabular-nums" style={{ color: A(0.4) }}>{structure.yearHigh.toFixed(2)}</span>
            </div>
          </div>
        )}

        {structure.notes.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-3">
            {structure.notes.map(n => (
              <span key={n} className="text-[8.5px] font-semibold uppercase tracking-wide px-2 py-1 rounded" style={{ color: "#7cc7d8", background: "rgba(82,176,200,0.10)", border: "1px solid rgba(82,176,200,0.25)" }}>{n}</span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
