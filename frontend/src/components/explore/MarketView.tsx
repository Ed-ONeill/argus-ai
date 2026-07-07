"use client";

/**
 * components/explore/MarketView.tsx - the institutional market workstation of the
 * Intelligence Explorer (Sprint 1). Bloomberg / FactSet inspired: dense toolbar,
 * large candlestick/line chart with crosshair, OHLC readout, zoom + pan and a
 * volume histogram, three synchronized sub-panels on the same time axis
 * (Conviction History, Catalyst Timeline, Theme Exposure) and a right-docked
 * market metrics rail.
 *
 * Data policy: price/volume/metrics are straight reads of latestMarketData and
 * the recorded OHLCV bars; ATR/RSI/liquidity are transparent derivations of those
 * real inputs. Intelligence sub-panels plot real Memory Engine / graph data when
 * it exists and clearly badged SAMPLE placeholders when it does not - the sample
 * data is deterministic scaffolding for the future integration, never presented
 * as live. No em/en dashes.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import {
  fmtCompact, fmtDay, fmtDate, selectSeriesForRange, CHART_RANGES, RANGE_MS,
  type MarketStructureVM, type PriceSeriesVM, type PricePoint, type TimelineVM,
  type ConvictionPoint, type ThemeExposureItem, type ChartRangeKey,
} from "@/lib/intelligenceShared";
import type { IntradayStatus } from "@/hooks/useExplorerMarketData";

const A = (n: number) => `rgba(255,255,255,${n})`;
const LINE = "#7cc7d8";
const UP = "#34d399", DOWN = "#f87171";

/* ---- shared time axis geometry: every panel uses the same viewBox width ---- */
const W = 1000, PAD_L = 10, PAD_R = 78;
const PLOT_W = W - PAD_L - PAD_R;
const PRICE_H = 300, VOL_H = 64, AXIS_H = 22, CHART_H = PRICE_H + VOL_H + AXIS_H;
const CONV_H = 86, CAT_H = 62;

const fmtTime = (t: number): string => new Date(t).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });

interface TimeWindow { t0: number; t1: number }
const xOfT = (t: number, w: TimeWindow) => PAD_L + ((t - w.t0) / (w.t1 - w.t0 || 1)) * PLOT_W;

/* ---- catalyst / overlay event categories. Real intelligence event types map in;
       market-calendar categories (earnings, FOMC, ...) are future data classes. ---- */
const EVENT_META: Record<string, { label: string; color: string }> = {
  first_detected: { label: "Theme Detected",     color: "#a78bfa" },
  conviction_up:  { label: "Confidence Spike",   color: "#34d399" },
  momentum_up:    { label: "Momentum Shift",     color: "#22d3ee" },
  evidence_up:    { label: "New Evidence",       color: "#2dd4bf" },
  relationships:  { label: "Relationship Added", color: "#8fb8e8" },
  prediction:     { label: "Forecast Revision",  color: "#fbbf24" },
  analog:         { label: "Historical Analog",  color: "#c084fc" },
  earnings:        { label: "Earnings",          color: "#f0b429" },
  fomc:            { label: "FOMC",              color: "#f87171" },
  news:            { label: "Major News",        color: "#94a3b8" },
  export_controls: { label: "Export Controls",   color: "#fb923c" },
  product:         { label: "Product Launch",    color: "#7cc7d8" },
};
interface AxisEvent { t: number; type: string; title: string; detail: string; sample: boolean }

/* ---- deterministic sample scaffolding (badged SAMPLE, never presented as live) ---- */
function hashFrac(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return ((h >>> 0) % 1000) / 1000;
}
function sampleConviction(seed: string, w: TimeWindow, n = 36): ConvictionPoint[] {
  const pts: ConvictionPoint[] = [];
  let v = 35 + hashFrac(seed) * 30;
  for (let i = 0; i < n; i++) {
    v = Math.max(15, Math.min(92, v + (hashFrac(seed + i) - 0.47) * 9));
    pts.push({ t: w.t0 + ((w.t1 - w.t0) * i) / (n - 1), conviction: Math.round(v), confidence: Math.round(v) });
  }
  return pts;
}
function sampleEvents(seed: string, w: TimeWindow): AxisEvent[] {
  const kinds = ["earnings", "fomc", "news", "product", "export_controls", "conviction_up", "evidence_up"];
  return kinds.map((k, i) => ({
    t: w.t0 + (w.t1 - w.t0) * (0.08 + 0.84 * ((i + hashFrac(seed + k)) / kinds.length)),
    type: k, title: EVENT_META[k].label, detail: "Sample event for layout preview.", sample: true,
  })).sort((a, b) => a.t - b.t);
}

/* ---- transparent indicator derivations from real bars (null when insufficient) ---- */
function computeATR(points: PricePoint[], period = 14): number | null {
  const bars = points.filter(p => p.h != null && p.l != null);
  if (bars.length < period + 1) return null;
  const trs: number[] = [];
  for (let i = 1; i < bars.length; i++) {
    const h = bars[i].h!, l = bars[i].l!, pc = bars[i - 1].c;
    trs.push(Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc)));
  }
  const last = trs.slice(-period);
  return last.reduce((s, v) => s + v, 0) / last.length;
}
function computeRSI(points: PricePoint[], period = 14): number | null {
  if (points.length < period + 1) return null;
  const closes = points.map(p => p.c).slice(-(period + 1));
  let gain = 0, loss = 0;
  for (let i = 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    if (d >= 0) gain += d; else loss -= d;
  }
  if (gain + loss === 0) return 50;
  if (loss === 0) return 100;
  const rs = (gain / period) / (loss / period);
  return 100 - 100 / (1 + rs);
}
/** Descriptive liquidity read from dollar volume (log scale, $1M -> 0, ~$300B -> 100). */
function liquidityScore(dollarVolume: number | null): { score: number; tier: string } | null {
  if (dollarVolume == null || dollarVolume <= 0) return null;
  const score = Math.round(Math.max(0, Math.min(100, ((Math.log10(dollarVolume) - 6) / 5.5) * 100)));
  return { score, tier: score >= 70 ? "Deep" : score >= 40 ? "Moderate" : "Thin" };
}

/* ---- tiny UI atoms ---- */
function Badge({ kind }: { kind: "sample" | "live" | "graph" }) {
  const c = kind === "sample" ? "#f0b429" : kind === "graph" ? "#a78bfa" : "#34d399";
  return (
    <span className="text-[7px] font-black uppercase tracking-[0.14em] px-1 py-px rounded-sm" style={{ color: c, background: `${c}1a`, border: `1px solid ${c}40` }}>
      {kind === "sample" ? "Sample" : kind === "graph" ? "Graph" : "Live"}
    </span>
  );
}
function PanelHeader({ label, badge, right }: { label: string; badge: "sample" | "live" | "graph"; right?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 px-3 pt-1.5 pb-0.5">
      <span className="text-[8px] font-black uppercase tracking-[0.18em]" style={{ color: A(0.42) }}>{label}</span>
      <Badge kind={badge} />
      {right && <span className="ml-auto">{right}</span>}
    </div>
  );
}
function MetricRow({ label, value, color, muted }: { label: string; value: string; color?: string; muted?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-2 px-3 py-[3px]">
      <span className="text-[8.5px] font-semibold uppercase tracking-wide" style={{ color: A(0.38) }}>{label}</span>
      <span className="text-[10.5px] font-bold tabular-nums" style={{ color: muted ? A(0.28) : color ?? A(0.88) }}>{value}</span>
    </div>
  );
}
function MetricGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="pt-1.5 pb-1 border-b" style={{ borderColor: A(0.05) }}>
      <p className="text-[7.5px] font-black uppercase tracking-[0.2em] px-3 pb-0.5" style={{ color: A(0.26) }}>{label}</p>
      {children}
    </div>
  );
}

export interface MarketViewProps {
  structure:      MarketStructureVM | null;
  series:         PriceSeriesVM;         // daily bars
  intraday:       PriceSeriesVM;         // intraday bars (5min) when the plan serves them
  intradayStatus: IntradayStatus | null; // provider-plan signal from the route
  ticker:         string;
  accent:         string;
  timeline:       TimelineVM;            // real intelligence events when tracked
  conviction:     ConvictionPoint[];     // real Memory Engine history when tracked
  themeExposure:  ThemeExposureItem[];   // real graph edge strengths when connected
  fallbackThemes: string[];              // theme names without strengths (sample weights)
}

export function MarketView({ structure, series, intraday, intradayStatus, ticker, accent, timeline, conviction, themeExposure, fallbackThemes }: MarketViewProps) {
  const [range, setRange] = useState<ChartRangeKey>("3M");
  const [chartType, setChartType] = useState<"candles" | "line">("candles");
  const [overlayOn, setOverlayOn] = useState(true);
  const [win, setWin] = useState<TimeWindow | null>(null); // zoomed window; null = full range
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const [hoverEvent, setHoverEvent] = useState<AxisEvent | null>(null);
  const chartWrapRef = useRef<HTMLDivElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const dragRef = useRef<{ x: number; w: TimeWindow } | null>(null);
  const nowRef = useRef(Date.now());

  // Honest series pick per range: 1D intraday-only, 1W intraday-or-daily, wider daily.
  const selection = useMemo(() => selectSeriesForRange(range, intraday, series, nowRef.current), [range, intraday, series]);
  const isIntradayChart = selection.interval === "intraday";

  // Base window hugs the selected bars; the zoom window lives inside it. Without
  // bars it spans the nominal range so overlays and sub-panels still have an axis.
  const base = useMemo<TimeWindow>(() => {
    if (selection.points.length >= 2) {
      const t0 = selection.points[0].t, t1 = selection.points[selection.points.length - 1].t;
      const pad = Math.max((t1 - t0) * 0.02, 60_000);
      return { t0: t0 - pad, t1: t1 + pad };
    }
    return { t0: nowRef.current - RANGE_MS[range], t1: nowRef.current };
  }, [selection, range]);
  useEffect(() => { setWin(null); setHoverIdx(null); }, [range]);
  const w = win ?? base;

  const visible = useMemo(() => selection.points.filter(p => p.t >= w.t0 && p.t <= w.t1), [selection, w]);
  const hasChart = visible.length >= 2;
  const candlesOk = useMemo(() => visible.filter(p => p.o != null && p.h != null && p.l != null).length >= 2, [visible]);
  const drawCandles = chartType === "candles" && candlesOk;

  // Price scale over the visible window.
  const scale = useMemo(() => {
    if (!hasChart) return null;
    let lo = Infinity, hi = -Infinity;
    for (const p of visible) { lo = Math.min(lo, p.l ?? p.c); hi = Math.max(hi, p.h ?? p.c); }
    if (hi === lo) { hi += Math.abs(hi) * 0.01 || 1; lo -= Math.abs(lo) * 0.01 || 1; }
    const pad = (hi - lo) * 0.07;
    lo -= pad; hi += pad;
    const yOf = (c: number) => 8 + (1 - (c - lo) / (hi - lo)) * (PRICE_H - 16);
    const maxVol = Math.max(0, ...visible.map(p => p.v ?? 0));
    return { lo, hi, yOf, maxVol };
  }, [visible, hasChart]);

  // Intelligence events on the axis: real timeline events when tracked, else samples.
  const events = useMemo<AxisEvent[]>(() => {
    const real: AxisEvent[] = timeline.available
      ? timeline.events
          .map(e => ({ t: Date.parse(e.date), type: e.type, title: e.title, detail: e.detail, sample: false }))
          .filter(e => Number.isFinite(e.t))
      : [];
    return (real.length > 0 ? real : sampleEvents(ticker, base)).filter(e => e.t >= w.t0 && e.t <= w.t1).sort((a, b) => a.t - b.t);
  }, [timeline, ticker, base, w]);
  const eventsAreSample = !timeline.available || timeline.events.length === 0;

  // Conviction series: real Memory Engine history, else a sample curve.
  const convPts = useMemo<ConvictionPoint[]>(() => {
    const real = conviction.filter(p => p.t >= w.t0 && p.t <= w.t1);
    if (conviction.length >= 2) return real;
    return sampleConviction(ticker, w);
  }, [conviction, ticker, w]);
  const convIsSample = conviction.length < 2;

  // Theme exposure bars: real edge strengths, else names with sample weights.
  const exposure = useMemo(() => {
    if (themeExposure.length > 0) return { items: themeExposure, sample: false };
    const items = fallbackThemes.slice(0, 5).map((label, i) => ({ label, strength: Math.round(82 - i * 14 - hashFrac(ticker + label) * 8 ) }));
    return { items, sample: true };
  }, [themeExposure, fallbackThemes, ticker]);

  /* ---- pointer interaction: crosshair, pan (drag), zoom (wheel) ---- */
  const vxOf = (clientX: number) => {
    const rect = svgRef.current?.getBoundingClientRect();
    return rect ? ((clientX - rect.left) / rect.width) * W : 0;
  };

  const onMove = (e: React.MouseEvent) => {
    if (dragRef.current && hasChart) {
      const dvx = vxOf(e.clientX) - dragRef.current.x;
      const dt = -(dvx / PLOT_W) * (dragRef.current.w.t1 - dragRef.current.w.t0);
      const span = dragRef.current.w.t1 - dragRef.current.w.t0;
      let t0 = dragRef.current.w.t0 + dt, t1 = dragRef.current.w.t1 + dt;
      if (t0 < base.t0) { t0 = base.t0; t1 = t0 + span; }
      if (t1 > base.t1) { t1 = base.t1; t0 = t1 - span; }
      setWin({ t0, t1 });
      return;
    }
    if (!hasChart) return;
    const vx = vxOf(e.clientX);
    let best: number | null = null, bestD = Infinity;
    for (let i = 0; i < visible.length; i++) {
      const d = Math.abs(xOfT(visible[i].t, w) - vx);
      if (d < bestD) { bestD = d; best = i; }
    }
    setHoverIdx(best);
  };
  const onDown = (e: React.MouseEvent) => { if (hasChart) dragRef.current = { x: vxOf(e.clientX), w }; };
  const endDrag = () => { dragRef.current = null; };

  useEffect(() => {
    const el = chartWrapRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (selection.points.length < 2) return;
      e.preventDefault();
      setWin(prev => {
        const cur = prev ?? base;
        const factor = e.deltaY > 0 ? 1.18 : 1 / 1.18;
        const span = Math.min(base.t1 - base.t0, Math.max((base.t1 - base.t0) / 60, (cur.t1 - cur.t0) * factor));
        const rect = el.getBoundingClientRect();
        const frac = Math.max(0, Math.min(1, ((((e.clientX - rect.left) / rect.width) * W) - PAD_L) / PLOT_W));
        const anchor = cur.t0 + (cur.t1 - cur.t0) * frac;
        let t0 = anchor - span * frac, t1 = anchor + span * (1 - frac);
        if (t0 < base.t0) { t0 = base.t0; t1 = t0 + span; }
        if (t1 > base.t1) { t1 = base.t1; t0 = t1 - span; }
        return { t0, t1 };
      });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [base, selection]);

  const hover = hoverIdx !== null ? visible[hoverIdx] : null;
  const readout = hover ?? (visible.length ? visible[visible.length - 1] : null);
  const readoutPrev = (() => {
    const i = readout ? visible.indexOf(readout) : -1;
    return i > 0 ? visible[i - 1] : null;
  })();
  const readoutChg = readout && readoutPrev ? ((readout.c - readoutPrev.c) / readoutPrev.c) * 100 : null;

  const chg = structure?.changePercent ?? null;
  const atr = useMemo(() => (series.available ? computeATR(series.points) : null), [series]);
  const rsi = useMemo(() => (series.available ? computeRSI(series.points) : null), [series]);
  const liq = liquidityScore(structure?.dollarVolume ?? null);
  // VWAP: the quote's value when served, else the latest daily bar's real VWAP.
  const vwapValue = structure?.vwap ?? (series.available ? series.points[series.points.length - 1].vwap : null);
  // "plan limited" only when we KNOW the live-quote endpoints are blocked (the quote
  // came from the profile fallback); "n/a" when a field is genuinely absent.
  const quoteMissing = structure?.source === "profile_fallback" ? "plan limited" : "n/a";

  const xTicks = useMemo(() => {
    const n = 6;
    const intradayLabels = isIntradayChart && range === "1D";
    return Array.from({ length: n }, (_, i) => {
      const t = w.t0 + ((w.t1 - w.t0) * i) / (n - 1);
      return { x: xOfT(t, w), label: intradayLabels ? fmtTime(t) : fmtDay(new Date(t).toISOString()) };
    });
  }, [w, isIntradayChart, range]);

  const yTicks = useMemo(() => {
    if (!scale) return [];
    return [0, 1, 2, 3, 4].map(i => {
      const v = scale.lo + ((scale.hi - scale.lo) * i) / 4;
      return { y: scale.yOf(v), label: v >= 1000 ? fmtCompact(v) : v.toFixed(2) };
    });
  }, [scale]);

  const presentEventTypes = useMemo(() => [...new Set(events.map(e => e.type))].slice(0, 7), [events]);
  const candleW = hasChart ? Math.max(1.4, Math.min(13, (PLOT_W / visible.length) * 0.62)) : 0;

  return (
    <div className="flex-1 min-h-0 flex">
      {/* ── main workstation column ─────────────────────────────────────────── */}
      <div className="flex-1 min-w-0 flex flex-col overflow-y-auto scrollbar-hide">

        {/* toolbar: ranges | chart type | overlay | future controls */}
        <div className="flex items-center gap-1 px-3 py-1.5 border-b shrink-0 flex-wrap" style={{ borderColor: A(0.07), background: A(0.015) }}>
          <div className="flex items-center rounded overflow-hidden" style={{ border: `1px solid ${A(0.1)}` }}>
            {CHART_RANGES.map(k => (
              <button key={k} onClick={() => setRange(k)}
                className="text-[9px] font-bold tabular-nums px-2 py-1 transition-colors"
                style={range === k ? { color: "#0a0e17", background: LINE } : { color: A(0.55), background: "transparent" }}>
                {k}
              </button>
            ))}
          </div>
          <div className="flex items-center rounded overflow-hidden ml-1" style={{ border: `1px solid ${A(0.1)}` }}>
            {(["candles", "line"] as const).map(t => (
              <button key={t} onClick={() => setChartType(t)} disabled={t === "candles" && !candlesOk && series.available}
                className="text-[9px] font-bold uppercase tracking-wide px-2 py-1 transition-colors"
                style={chartType === t ? { color: "#0a0e17", background: LINE } : { color: t === "candles" && !candlesOk ? A(0.25) : A(0.55), background: "transparent" }}>
                {t === "candles" ? "Candles" : "Line"}
              </button>
            ))}
          </div>
          <button onClick={() => setOverlayOn(o => !o)}
            className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-wide px-2 py-1 rounded ml-1 transition-colors"
            style={overlayOn ? { color: accent, background: `${accent}1f`, border: `1px solid ${accent}55` } : { color: A(0.45), border: `1px solid ${A(0.1)}` }}>
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: overlayOn ? accent : A(0.25) }} />
            Intelligence Overlay
          </button>
          {win && (
            <button onClick={() => setWin(null)} className="text-[9px] font-bold uppercase tracking-wide px-2 py-1 rounded transition-colors hover:bg-white/10" style={{ color: A(0.55), border: `1px solid ${A(0.1)}` }}>
              Reset Zoom
            </button>
          )}
          {selection.interval && (
            <span className="text-[8.5px] tabular-nums ml-1" style={{ color: A(0.3) }}>
              {selection.interval === "intraday" ? `${intraday.resolution ?? "5min"} bars` : "daily bars"}
              {selection.fallback === "daily" ? " · intraday sparse, daily shown" : ""} · {selection.points.length} in range
            </span>
          )}
          <div className="ml-auto flex items-center gap-1">
            <button disabled title="Coming soon" className="text-[9px] font-bold uppercase tracking-wide px-2 py-1 rounded cursor-not-allowed" style={{ color: A(0.22), border: `1px solid ${A(0.06)}` }}>Compare</button>
            <button disabled title="Coming soon" className="text-[9px] font-bold uppercase tracking-wide px-2 py-1 rounded cursor-not-allowed" style={{ color: A(0.22), border: `1px solid ${A(0.06)}` }}>Indicators</button>
          </div>
        </div>

        {/* OHLC readout strip: hovered bar, else last visible bar */}
        <div className="flex items-baseline gap-3 px-3 py-1 border-b shrink-0 flex-wrap" style={{ borderColor: A(0.06), minHeight: 24 }}>
          <span className="text-[10px] font-black tracking-tight" style={{ color: A(0.85) }}>{ticker}</span>
          {readout ? (
            <>
              <span className="text-[9px] tabular-nums" style={{ color: A(0.45) }}>{fmtDate(new Date(readout.t).toISOString())}{isIntradayChart ? ` ${fmtTime(readout.t)}` : ""}</span>
              {readout.o != null && <span className="text-[9px] tabular-nums" style={{ color: A(0.6) }}>O <b style={{ color: A(0.85) }}>{readout.o.toFixed(2)}</b></span>}
              {readout.h != null && <span className="text-[9px] tabular-nums" style={{ color: A(0.6) }}>H <b style={{ color: A(0.85) }}>{readout.h.toFixed(2)}</b></span>}
              {readout.l != null && <span className="text-[9px] tabular-nums" style={{ color: A(0.6) }}>L <b style={{ color: A(0.85) }}>{readout.l.toFixed(2)}</b></span>}
              <span className="text-[9px] tabular-nums" style={{ color: A(0.6) }}>C <b style={{ color: A(0.85) }}>{readout.c.toFixed(2)}</b></span>
              {readoutChg !== null && <span className="text-[9px] font-bold tabular-nums" style={{ color: readoutChg >= 0 ? UP : DOWN }}>{readoutChg > 0 ? "+" : ""}{readoutChg.toFixed(2)}%</span>}
              {readout.v != null && <span className="text-[9px] tabular-nums" style={{ color: A(0.5) }}>Vol {fmtCompact(readout.v)}</span>}
            </>
          ) : structure ? (
            <span className="text-[9px] tabular-nums" style={{ color: A(0.5) }}>Last {structure.price.toFixed(2)}{chg !== null ? ` · ${chg > 0 ? "+" : ""}${chg.toFixed(2)}% today` : ""} · snapshot only</span>
          ) : (
            <span className="text-[9px]" style={{ color: A(0.4) }}>No market snapshot recorded yet</span>
          )}
          {hoverEvent && (
            <span className="ml-auto text-[9px] tabular-nums flex items-center gap-1.5" style={{ color: A(0.7) }}>
              <span className="w-1.5 h-1.5 rotate-45 shrink-0" style={{ background: EVENT_META[hoverEvent.type]?.color ?? accent }} />
              {hoverEvent.title} · {fmtDay(new Date(hoverEvent.t).toISOString())}{hoverEvent.sample ? " · sample" : ""}
            </span>
          )}
        </div>

        {/* main chart: price + volume histogram, crosshair, overlay markers */}
        <div ref={chartWrapRef} className="shrink-0 border-b" style={{ borderColor: A(0.07) }}>
          {hasChart && scale ? (
            <svg ref={svgRef} viewBox={`0 0 ${W} ${CHART_H}`} className="w-full block select-none"
              style={{ cursor: dragRef.current ? "grabbing" : "crosshair" }}
              onMouseMove={onMove} onMouseDown={onDown} onMouseUp={endDrag}
              onMouseLeave={() => { setHoverIdx(null); endDrag(); }}>
              {/* recessive grid + right price axis */}
              {yTicks.map((tk, i) => (
                <g key={i}>
                  <line x1={PAD_L} x2={W - PAD_R} y1={tk.y} y2={tk.y} stroke="#ffffff" strokeOpacity={0.045} />
                  <text x={W - PAD_R + 7} y={tk.y + 3} fontSize={9.5} fill={A(0.42)} className="tabular-nums">{tk.label}</text>
                </g>
              ))}
              {xTicks.map((tk, i) => (
                <g key={i}>
                  <line x1={tk.x} x2={tk.x} y1={8} y2={PRICE_H + VOL_H} stroke="#ffffff" strokeOpacity={0.025} />
                  <text x={tk.x} y={CHART_H - 7} fontSize={9} textAnchor="middle" fill={A(0.38)}>{tk.label}</text>
                </g>
              ))}

              {/* intelligence overlay markers */}
              {overlayOn && events.map((ev, i) => {
                const x = xOfT(ev.t, w);
                const col = EVENT_META[ev.type]?.color ?? accent;
                return (
                  <g key={i} onMouseEnter={() => setHoverEvent(ev)} onMouseLeave={() => setHoverEvent(null)}>
                    <line x1={x} x2={x} y1={14} y2={PRICE_H + VOL_H} stroke={col} strokeOpacity={hoverEvent === ev ? 0.55 : 0.22} strokeDasharray="2 4" strokeWidth={1} />
                    <rect x={x - 4} y={6} width={8} height={8} transform={`rotate(45 ${x} 10)`} fill={col} opacity={hoverEvent === ev ? 1 : 0.75} />
                  </g>
                );
              })}

              {/* price marks */}
              {drawCandles ? (
                visible.map((p, i) => {
                  if (p.o == null || p.h == null || p.l == null) return null;
                  const x = xOfT(p.t, w);
                  const up = p.c >= p.o;
                  const col = up ? UP : DOWN;
                  const yO = scale.yOf(p.o), yC = scale.yOf(p.c);
                  return (
                    <g key={i}>
                      <line x1={x} x2={x} y1={scale.yOf(p.h)} y2={scale.yOf(p.l)} stroke={col} strokeWidth={1} strokeOpacity={0.9} />
                      <rect x={x - candleW / 2} y={Math.min(yO, yC)} width={candleW} height={Math.max(1, Math.abs(yC - yO))}
                        fill={up ? "#0a0e17" : col} stroke={col} strokeWidth={1} />
                    </g>
                  );
                })
              ) : (
                <>
                  <defs>
                    <linearGradient id="mv-area" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={LINE} stopOpacity={0.14} />
                      <stop offset="100%" stopColor={LINE} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <path d={`${visible.map((p, i) => `${i === 0 ? "M" : "L"}${xOfT(p.t, w).toFixed(1)},${scale.yOf(p.c).toFixed(1)}`).join("")}L${xOfT(visible[visible.length - 1].t, w).toFixed(1)},${PRICE_H}L${xOfT(visible[0].t, w).toFixed(1)},${PRICE_H}Z`} fill="url(#mv-area)" />
                  <path d={visible.map((p, i) => `${i === 0 ? "M" : "L"}${xOfT(p.t, w).toFixed(1)},${scale.yOf(p.c).toFixed(1)}`).join("")} fill="none" stroke={LINE} strokeWidth={1.8} strokeLinejoin="round" />
                </>
              )}

              {/* last price line + tag */}
              <line x1={PAD_L} x2={W - PAD_R} y1={scale.yOf(visible[visible.length - 1].c)} y2={scale.yOf(visible[visible.length - 1].c)} stroke={LINE} strokeOpacity={0.35} strokeDasharray="2 3" strokeWidth={0.8} />
              <rect x={W - PAD_R + 2} y={scale.yOf(visible[visible.length - 1].c) - 8} width={PAD_R - 6} height={16} rx={2} fill={LINE} />
              <text x={W - PAD_R + 2 + (PAD_R - 6) / 2} y={scale.yOf(visible[visible.length - 1].c) + 3.5} fontSize={9.5} fontWeight={800} textAnchor="middle" fill="#0a0e17" className="tabular-nums">{visible[visible.length - 1].c.toFixed(2)}</text>

              {/* volume histogram */}
              <line x1={PAD_L} x2={W - PAD_R} y1={PRICE_H + 2} y2={PRICE_H + 2} stroke="#ffffff" strokeOpacity={0.07} />
              {scale.maxVol > 0 && visible.map((p, i) => {
                if (!p.v) return null;
                const h = (p.v / scale.maxVol) * (VOL_H - 8);
                const up = p.o != null ? p.c >= p.o : true;
                return <rect key={i} x={xOfT(p.t, w) - candleW / 2} width={Math.max(1, candleW)} y={PRICE_H + VOL_H - h} height={h} fill={up ? UP : DOWN} opacity={hoverIdx === i ? 0.75 : 0.32} />;
              })}
              {scale.maxVol > 0 && <text x={W - PAD_R + 7} y={PRICE_H + 12} fontSize={8.5} fill={A(0.35)} className="tabular-nums">{fmtCompact(scale.maxVol)}</text>}

              {/* crosshair */}
              {hover && (
                <g pointerEvents="none">
                  <line x1={xOfT(hover.t, w)} x2={xOfT(hover.t, w)} y1={8} y2={PRICE_H + VOL_H} stroke="#ffffff" strokeOpacity={0.22} strokeDasharray="3 3" />
                  <line x1={PAD_L} x2={W - PAD_R} y1={scale.yOf(hover.c)} y2={scale.yOf(hover.c)} stroke="#ffffff" strokeOpacity={0.16} strokeDasharray="3 3" />
                  <rect x={W - PAD_R + 2} y={scale.yOf(hover.c) - 8} width={PAD_R - 6} height={16} rx={2} fill="rgba(20,28,40,0.98)" stroke={A(0.2)} />
                  <text x={W - PAD_R + 2 + (PAD_R - 6) / 2} y={scale.yOf(hover.c) + 3.5} fontSize={9.5} fontWeight={700} textAnchor="middle" fill={A(0.9)} className="tabular-nums">{hover.c.toFixed(2)}</text>
                  <circle cx={xOfT(hover.t, w)} cy={scale.yOf(hover.c)} r={3} fill={LINE} stroke="#070b13" strokeWidth={1.5} />
                </g>
              )}
            </svg>
          ) : (
            <div className="relative" style={{ height: 300 }}>
              <svg viewBox={`0 0 ${W} 300`} className="w-full h-full block select-none">
                {structure && (
                  <>
                    <line x1={PAD_L} x2={W - PAD_R} y1={150} y2={150} stroke={LINE} strokeOpacity={0.4} strokeWidth={1.2} strokeDasharray="6 6" />
                    <circle cx={W - PAD_R - 10} cy={150} r={3.5} fill={LINE} />
                    <rect x={W - PAD_R + 2} y={142} width={PAD_R - 6} height={16} rx={2} fill={LINE} />
                    <text x={W - PAD_R + 2 + (PAD_R - 6) / 2} y={153.5} fontSize={9.5} fontWeight={800} textAnchor="middle" fill="#0a0e17" className="tabular-nums">{structure.price.toFixed(2)}</text>
                    <text x={PAD_L + 4} y={140} fontSize={9} fill={A(0.4)}>CURRENT PRICE</text>
                  </>
                )}
                {overlayOn && events.map((ev, i) => {
                  const x = xOfT(ev.t, w);
                  const col = EVENT_META[ev.type]?.color ?? accent;
                  return <g key={i}><line x1={x} x2={x} y1={16} y2={290} stroke={col} strokeOpacity={0.15} strokeDasharray="2 4" /><rect x={x - 3.5} y={8} width={7} height={7} transform={`rotate(45 ${x} 11.5)`} fill={col} opacity={0.6} /></g>;
                })}
                {xTicks.map((tk, i) => <text key={i} x={tk.x} y={294} fontSize={9} textAnchor="middle" fill={A(0.3)}>{tk.label}</text>)}
              </svg>
              <div className="absolute inset-x-0 bottom-8 flex justify-center pointer-events-none">
                <p className="text-[10px] px-3 py-1.5 rounded" style={{ color: A(0.55), background: "rgba(8,12,20,0.88)", border: `1px solid ${A(0.1)}` }}>
                  {range === "1D" || range === "1W"
                    ? intradayStatus === "blocked"
                      ? "Intraday bars unavailable on current provider plan. Showing latest snapshot."
                      : "Intraday bars not recorded yet. Showing latest snapshot."
                    : series.available
                    ? `Not enough recorded bars in the ${range} window. Widen the range.`
                    : structure
                    ? "Historical price series not available yet. Current market snapshot is shown."
                    : "No market data recorded for this entity yet."}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* ── synchronized panel: Conviction History ──────────────────────────── */}
        <div className="shrink-0 border-b" style={{ borderColor: A(0.07) }}>
          <PanelHeader label="Conviction History" badge={convIsSample ? "sample" : "live"}
            right={convPts.length > 0 && <span className="text-[8.5px] tabular-nums" style={{ color: A(0.4) }}>last {convPts[convPts.length - 1].conviction}</span>} />
          <svg viewBox={`0 0 ${W} ${CONV_H}`} className="w-full block select-none">
            {[25, 50, 75].map(v => (
              <line key={v} x1={PAD_L} x2={W - PAD_R} y1={CONV_H - 8 - (v / 100) * (CONV_H - 18)} y2={CONV_H - 8 - (v / 100) * (CONV_H - 18)} stroke="#ffffff" strokeOpacity={0.04} />
            ))}
            <text x={W - PAD_R + 7} y={14} fontSize={8.5} fill={A(0.35)} className="tabular-nums">100</text>
            <text x={W - PAD_R + 7} y={CONV_H - 8} fontSize={8.5} fill={A(0.35)} className="tabular-nums">0</text>
            {convPts.length >= 2 && (
              <path d={convPts.map((p, i) => `${i === 0 ? "M" : "L"}${xOfT(p.t, w).toFixed(1)},${(CONV_H - 8 - (p.conviction / 100) * (CONV_H - 18)).toFixed(1)}`).join("")}
                fill="none" stroke={convIsSample ? A(0.35) : accent} strokeWidth={1.6} strokeLinejoin="round"
                strokeDasharray={convIsSample ? "4 3" : undefined} />
            )}
            {!convIsSample && convPts.map((p, i) => (
              <circle key={i} cx={xOfT(p.t, w)} cy={CONV_H - 8 - (p.conviction / 100) * (CONV_H - 18)} r={2.2} fill={accent} />
            ))}
            {convPts.length < 2 && !convIsSample && (
              <text x={W / 2} y={CONV_H / 2 + 3} fontSize={9.5} textAnchor="middle" fill={A(0.35)}>Conviction history accrues as Argus tracks this entity.</text>
            )}
          </svg>
        </div>

        {/* ── synchronized panel: Catalyst Timeline ───────────────────────────── */}
        <div className="shrink-0 border-b" style={{ borderColor: A(0.07) }}>
          <PanelHeader label="Catalyst Timeline" badge={eventsAreSample ? "sample" : "live"}
            right={
              <span className="flex items-center gap-2 flex-wrap">
                {presentEventTypes.map(t => (
                  <span key={t} className="flex items-center gap-1 text-[7.5px] font-bold uppercase tracking-wide" style={{ color: A(0.35) }}>
                    <span className="w-1.5 h-1.5 rotate-45" style={{ background: EVENT_META[t]?.color ?? accent }} />{EVENT_META[t]?.label ?? t}
                  </span>
                ))}
              </span>
            } />
          <svg viewBox={`0 0 ${W} ${CAT_H}`} className="w-full block select-none">
            <line x1={PAD_L} x2={W - PAD_R} y1={CAT_H / 2} y2={CAT_H / 2} stroke="#ffffff" strokeOpacity={0.08} />
            {events.length === 0 && <text x={W / 2} y={CAT_H / 2 - 8} fontSize={9.5} textAnchor="middle" fill={A(0.35)}>No catalysts in this window.</text>}
            {events.map((ev, i) => {
              const x = xOfT(ev.t, w);
              const col = EVENT_META[ev.type]?.color ?? accent;
              const yOff = (i % 2 === 0 ? -1 : 1) * 9;
              const hot = hoverEvent === ev;
              return (
                <g key={i} style={{ cursor: "default" }} onMouseEnter={() => setHoverEvent(ev)} onMouseLeave={() => setHoverEvent(null)}>
                  <line x1={x} x2={x} y1={CAT_H / 2} y2={CAT_H / 2 + yOff} stroke={col} strokeOpacity={0.5} />
                  <rect x={x - (hot ? 5 : 4)} y={CAT_H / 2 + yOff - (hot ? 5 : 4)} width={hot ? 10 : 8} height={hot ? 10 : 8}
                    transform={`rotate(45 ${x} ${CAT_H / 2 + yOff})`} fill={col} opacity={hot ? 1 : 0.8} />
                  {hot && (
                    <text x={Math.max(PAD_L + 40, Math.min(W - PAD_R - 40, x))} y={yOff < 0 ? CAT_H - 6 : 14} fontSize={9} textAnchor="middle" fill={A(0.75)}>
                      {ev.title} · {fmtDay(new Date(ev.t).toISOString())}
                    </text>
                  )}
                </g>
              );
            })}
          </svg>
        </div>

        {/* ── panel: Theme Exposure ────────────────────────────────────────────── */}
        <div className="shrink-0 pb-2">
          <PanelHeader label="Theme Exposure" badge={exposure.sample ? "sample" : "graph"} />
          {exposure.items.length === 0 ? (
            <p className="text-[9.5px] px-3 py-1.5" style={{ color: A(0.35) }}>No theme exposure identified yet.</p>
          ) : (
            <div className="px-3 pt-0.5 space-y-1">
              {exposure.items.map((it, i) => {
                const max = exposure.items[0].strength || 1;
                return (
                  <div key={it.label} className="flex items-center gap-2">
                    <span className="w-[168px] shrink-0 truncate text-[9.5px] font-semibold" style={{ color: A(0.7) }}>{it.label}</span>
                    <div className="flex-1 h-[9px] rounded-sm overflow-hidden" style={{ background: A(0.05) }}>
                      <div className="h-full rounded-sm" style={{
                        width: `${Math.max(3, (it.strength / max) * 100)}%`,
                        background: exposure.sample ? A(0.22) : `linear-gradient(90deg, ${accent}cc, ${accent}55)`,
                        outline: exposure.sample ? `1px dashed ${A(0.2)}` : undefined,
                      }} />
                    </div>
                    <span className="w-7 shrink-0 text-right text-[9px] font-bold tabular-nums" style={{ color: i === 0 ? A(0.85) : A(0.5) }}>{it.strength}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── right rail: market metrics (market-focused, not intelligence) ────── */}
      <aside className="w-[218px] shrink-0 border-l overflow-y-auto scrollbar-hide" style={{ borderColor: A(0.08), background: A(0.012) }}>
        <div className="px-3 pt-2.5 pb-1.5 border-b" style={{ borderColor: A(0.07) }}>
          <p className="text-[8px] font-black uppercase tracking-[0.2em]" style={{ color: A(0.42) }}>Market Metrics</p>
        </div>

        <MetricGroup label="Price">
          <MetricRow label="Last" value={structure ? structure.price.toFixed(2) : "n/a"} muted={!structure} />
          <MetricRow label="Change" value={chg !== null ? `${chg > 0 ? "+" : ""}${chg.toFixed(2)}%` : "n/a"} color={chg !== null ? (chg >= 0 ? UP : DOWN) : undefined} muted={chg === null} />
          <MetricRow label="Open" value={structure?.open != null ? structure.open.toFixed(2) : quoteMissing} muted={structure?.open == null} />
          <MetricRow label="Prev Close" value={structure?.previousClose != null ? structure.previousClose.toFixed(2) : quoteMissing} muted={structure?.previousClose == null} />
          <MetricRow label="Day High" value={structure?.high != null ? structure.high.toFixed(2) : quoteMissing} muted={structure?.high == null} />
          <MetricRow label="Day Low" value={structure?.low != null ? structure.low.toFixed(2) : quoteMissing} muted={structure?.low == null} />
          <MetricRow label="VWAP" value={vwapValue != null ? vwapValue.toFixed(2) : quoteMissing} muted={vwapValue == null} />
        </MetricGroup>

        <MetricGroup label="Volume">
          <MetricRow label="Volume" value={structure?.volume != null ? fmtCompact(structure.volume) : "n/a"} muted={structure?.volume == null} />
          <MetricRow label="Avg Volume" value={structure?.avgVolume != null ? fmtCompact(structure.avgVolume) : "n/a"} muted={structure?.avgVolume == null} />
          <MetricRow label="Rel Volume" value={structure?.relativeVolume != null ? `${structure.relativeVolume.toFixed(2)}x` : "n/a"} color={structure?.relativeVolume != null && structure.relativeVolume > 1.5 ? UP : undefined} muted={structure?.relativeVolume == null} />
          <MetricRow label="Dollar Vol" value={structure?.dollarVolume != null ? fmtCompact(structure.dollarVolume) : "n/a"} muted={structure?.dollarVolume == null} />
        </MetricGroup>

        <MetricGroup label="Size & Risk">
          <MetricRow label="Market Cap" value={structure?.marketCap != null ? fmtCompact(structure.marketCap) : "n/a"} muted={structure?.marketCap == null} />
          <MetricRow label="Beta" value={structure?.beta != null ? structure.beta.toFixed(2) : "n/a"} muted={structure?.beta == null} />
          <MetricRow label="ATR (14)" value={atr != null ? atr.toFixed(2) : "n/a"} muted={atr == null} />
          <MetricRow label="RSI (14)" value={rsi != null ? rsi.toFixed(0) : "n/a"} color={rsi != null ? (rsi >= 70 ? DOWN : rsi <= 30 ? UP : undefined) : undefined} muted={rsi == null} />
        </MetricGroup>

        <MetricGroup label="52 Week">
          <MetricRow label="High" value={structure?.yearHigh != null ? structure.yearHigh.toFixed(2) : "n/a"} muted={structure?.yearHigh == null} />
          <MetricRow label="Low" value={structure?.yearLow != null ? structure.yearLow.toFixed(2) : "n/a"} muted={structure?.yearLow == null} />
          {structure?.yearPosition != null && (
            <div className="px-3 py-1">
              <div className="relative h-[4px] rounded-full" style={{ background: A(0.07) }}>
                <div className="absolute top-1/2 -translate-y-1/2 w-2 h-2 rounded-full" style={{ left: `calc(${structure.yearPosition}% - 4px)`, background: LINE }} />
              </div>
              <p className="text-[8px] tabular-nums mt-1 text-right" style={{ color: A(0.4) }}>{structure.yearPosition}% of range</p>
            </div>
          )}
        </MetricGroup>

        <MetricGroup label="Ownership & Liquidity">
          <MetricRow label="Liquidity" value={liq ? `${liq.score} · ${liq.tier}` : "n/a"} muted={!liq} />
          <MetricRow label="Inst. Ownership" value="n/a" muted />
          <p className="text-[7.5px] px-3 pb-0.5 leading-snug" style={{ color: A(0.24) }}>Liquidity derived from dollar volume. Ownership awaits a provider.</p>
        </MetricGroup>

        <div className="px-3 py-2">
          {structure?.notes.map(n => (
            <p key={n} className="text-[8px] font-semibold uppercase tracking-wide mb-1" style={{ color: "#7cc7d8" }}>· {n}</p>
          ))}
          <p className="text-[8px] uppercase tracking-wider tabular-nums" style={{ color: structure?.stale ? "#f59e0b" : A(0.3) }}>
            {structure ? `${structure.provider.toUpperCase()} · ${structure.freshness}${structure.stale ? " · STALE" : ""}` : "Awaiting market provider"}
          </p>
        </div>
      </aside>
    </div>
  );
}
