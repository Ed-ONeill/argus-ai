"use client";

// platform/chart/ArgusChart.tsx — THE canonical Argus chart (PX2 / PX2.1). ONE renderer,
// every surface and every density: the sparkline (Stage 1B(a), Market Pulse) and now the
// FULL variant (Stage 1B(c)) that anchors the Adaptive Hero — same component, config only.
//
// Rendering: a custom Canvas draws the price path + restrained fill; a DOM overlay carries
// the crosshair, axes, and readout (PX2.2/2.3). No external charting library. The component
// takes a canonical PriceSeries (Stage 1A) as a prop and never fetches, never calls a
// provider, and never authors intelligence — it renders facts only.
//
// Honesty: it plots only real adjusted-close values, shows real gaps as gaps, renders
// nothing when there is no valid series, and NEVER styles delayed/stale/estimated/partial
// data as live (a live dot appears only when the fact is genuinely realtime-and-fresh). The
// crosshair snaps to real bars — no value is ever read between samples.

import { useEffect, useMemo, useRef, useState } from "react";

import type { DataQuality } from "@/lib/platform/quality";
import type { PriceSeries } from "@/lib/platform/types/prices";
import { densityFeatures, effectiveDensity } from "./density";
import {
  axisTicks,
  changeInfo,
  computeExtent,
  downsample,
  nearestIndex,
  project,
  toDisplayPoints,
  type ChangeInfo,
} from "./geometry";
import { qualityBadge } from "./presentation";
import { resolveConfig } from "./presets";
import type { ArgusChartProps, ChartDimensions, ProjectedPoint } from "./types";

// ── color resolution (auto-themes off the CSS token vars; semantic only when valid) ──
const FALLBACK = { neutral: "148 163 184", up: "52 211 153", down: "251 113 133" };

function tokenRGB(styles: CSSStyleDeclaration | null, name: string, fallback: string): string {
  const raw = styles?.getPropertyValue(name).trim();
  return raw && raw.length > 0 ? raw : fallback;
}
function rgb(triplet: string, alpha = 1): string {
  return alpha >= 1 ? `rgb(${triplet})` : `rgb(${triplet} / ${alpha})`;
}

function directionTriplet(change: ChangeInfo | null, semantic: boolean): string {
  if (semantic && change && change.direction !== "flat") {
    return change.direction === "up" ? FALLBACK.up : FALLBACK.down;
  }
  return FALLBACK.neutral;
}

interface DrawColors { line: string; fillTop: string; fillBottom: string; liveDot: boolean; }

function pickColors(el: HTMLElement | null, change: ChangeInfo | null, semantic: boolean, live: boolean): DrawColors {
  const styles = el ? getComputedStyle(el) : null;
  let triplet = tokenRGB(styles, "--ink-secondary", directionTriplet(change, semantic));
  if (semantic && change && change.direction !== "flat") triplet = directionTriplet(change, semantic);
  return { line: rgb(triplet), fillTop: rgb(triplet, 0.14), fillBottom: rgb(triplet, 0), liveDot: live };
}

// ── pure canvas paint (guarded; a no-op when there is no 2D context) ──
function paint(
  canvas: HTMLCanvasElement, projected: ProjectedPoint[], dims: ChartDimensions,
  colors: DrawColors, fill: boolean, progress: number,
): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const dpr = (typeof window !== "undefined" && window.devicePixelRatio) || 1;
  const { width, height } = dims;
  canvas.width = Math.max(1, Math.round(width * dpr));
  canvas.height = Math.max(1, Math.round(height * dpr));
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);
  if (projected.length === 0) return;

  ctx.save();
  if (progress < 1) {
    ctx.beginPath();
    ctx.rect(0, 0, width * Math.max(0, Math.min(1, progress)), height);
    ctx.clip();
  }

  const baseY = height - dims.padding.bottom;
  if (fill && projected.length > 1) {
    const grad = ctx.createLinearGradient(0, dims.padding.top, 0, baseY);
    grad.addColorStop(0, colors.fillTop);
    grad.addColorStop(1, colors.fillBottom);
    ctx.beginPath();
    ctx.moveTo(projected[0].x, baseY);
    for (const p of projected) ctx.lineTo(p.x, p.y);
    ctx.lineTo(projected[projected.length - 1].x, baseY);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();
  }

  ctx.beginPath();
  projected.forEach((p, k) => (k === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
  ctx.strokeStyle = colors.line;
  ctx.lineWidth = 1.5;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.stroke();
  ctx.restore();

  if (colors.liveDot) {
    const last = projected[projected.length - 1];
    ctx.beginPath();
    ctx.arc(last.x, last.y, 2, 0, Math.PI * 2);
    ctx.fillStyle = colors.line;
    ctx.fill();
  }
}

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? window.matchMedia("(prefers-reduced-motion: reduce)").matches : false;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function axisDate(t: string): string {
  const [y, m] = t.split("-");
  const mon = MONTHS[(Number(m) || 1) - 1] ?? "";
  return `${mon} '${(y ?? "").slice(2)}`;
}
function longDate(t: string): string {
  const [y, m, d] = t.split("-");
  return `${MONTHS[(Number(m) || 1) - 1] ?? ""} ${Number(d)}, ${y}`;
}

function paddingFor(showAxes: boolean) {
  return showAxes ? { top: 10, right: 46, bottom: 20, left: 8 } : { top: 3, right: 2, bottom: 3, left: 2 };
}

function primarySeries(series: ArgusChartProps["series"]): PriceSeries | null {
  if (!series) return null;
  return Array.isArray(series) ? series[0] ?? null : series;
}

function fmt(v: number): string {
  return v >= 1000 ? v.toFixed(0) : v >= 1 ? v.toFixed(2) : v.toFixed(4);
}

export function ArgusChart(props: ArgusChartProps) {
  const variant = props.variant ?? "sparkline";
  const cfg = resolveConfig(variant, {
    ...props.config,
    ...(props.asOf !== undefined ? { asOf: props.asOf } : {}),
  });

  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ width: 0, height: cfg.height });
  const [hover, setHover] = useState<number | null>(null);

  const series = primarySeries(props.series);
  const quality: DataQuality | null = series?.quality ?? null;

  const displayPoints = useMemo(
    () => downsample(toDisplayPoints(series, { asOf: cfg.asOf }), cfg.downsample),
    [series, cfg.asOf, cfg.downsample],
  );
  const change = useMemo(() => changeInfo(displayPoints), [displayPoints]);
  const absent = displayPoints.length === 0;

  const badge = qualityBadge(quality);
  const live = !!badge?.live;
  const density = effectiveDensity(variant, size.width, size.height);
  const features = densityFeatures(density);
  const showAxes = !absent && features.annotations;   // large+ : full variant
  const interactive = showAxes;                        // crosshair only where axes live

  const dims: ChartDimensions = useMemo(
    () => ({ width: size.width, height: size.height, padding: paddingFor(showAxes) }),
    [size.width, size.height, showAxes],
  );
  const extent = useMemo(() => computeExtent(displayPoints), [displayPoints]);
  const projected = useMemo(
    () => (extent && size.width > 0 && !absent ? project(displayPoints, extent, dims) : []),
    [displayPoints, extent, dims, size.width, absent],
  );

  // ── responsive sizing; reserved height prevents layout shift ──
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      setSize({ width: r.width, height: r.height || cfg.height });
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [cfg.height]);

  // Reset the crosshair when the data or range changes (no stale hover across series).
  useEffect(() => { setHover(null); }, [series, cfg.asOf]);

  // ── paint: high-DPI canvas, one-shot draw-in (instant under reduced motion) ──
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || absent || projected.length === 0) return;
    const colors = pickColors(containerRef.current, change, cfg.semanticColor, live);
    if (!cfg.animate || prefersReducedMotion() || typeof requestAnimationFrame === "undefined") {
      paint(canvas, projected, dims, colors, cfg.fill, 1);
      return;
    }
    let raf = 0;
    let start = -1;
    const DURATION = 420;
    const step = (ts: number) => {
      if (start < 0) start = ts;
      const p = Math.min(1, (ts - start) / DURATION);
      paint(canvas, projected, dims, colors, cfg.fill, p);
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [projected, dims, change, live, cfg.animate, cfg.fill, cfg.semanticColor, absent]);

  // ── interaction: crosshair snaps to the nearest REAL bar (never between samples) ──
  const onMove = (e: React.PointerEvent) => {
    if (!interactive || projected.length === 0) return;
    const el = containerRef.current;
    if (!el) return;
    const x = e.clientX - el.getBoundingClientRect().left;
    const idx = nearestIndex(projected, x);
    setHover(idx >= 0 ? idx : null);
  };
  const onKey = (e: React.KeyboardEvent) => {
    if (!interactive || projected.length === 0) return;
    const cur = hover ?? projected.length - 1;
    if (e.key === "ArrowLeft") { setHover(Math.max(0, cur - 1)); e.preventDefault(); }
    else if (e.key === "ArrowRight") { setHover(Math.min(projected.length - 1, cur + 1)); e.preventDefault(); }
    else if (e.key === "Home") { setHover(0); e.preventDefault(); }
    else if (e.key === "End") { setHover(projected.length - 1); e.preventDefault(); }
    else if (e.key === "Escape") { setHover(null); }
  };

  // ── readout: the ACTIVE bar (hovered, else last) and its change from the range start ──
  const activeIndex = !absent ? hover ?? displayPoints.length - 1 : -1;
  const activePoint = activeIndex >= 0 ? displayPoints[activeIndex] : null;
  const first = displayPoints[0]?.v;
  const activeDelta = activePoint && first != null ? activePoint.v - first : 0;
  const activePct = activePoint && first ? (activeDelta / first) * 100 : 0;
  const activeDir = activeDelta > 0 ? "up" : activeDelta < 0 ? "down" : "flat";
  const idle = hover == null;
  // "hover" keeps the idle chart quiet (a single price authority elsewhere owns the quote);
  // the readout still appears on scrub. "auto"/"always" show it at rest as before.
  const showReadout = !absent && features.readout && !!activePoint
    && cfg.showLastValue !== "never" && !(cfg.showLastValue === "hover" && idle);
  const showQualityLabel = showReadout && cfg.showQuality && !!badge && !badge.live;
  const dotColor = rgb(directionTriplet(change, cfg.semanticColor));

  const symbol = series?.symbol ?? "";
  const dirWord = change?.direction === "up" ? "up" : change?.direction === "down" ? "down" : "flat";
  const computedLabel = absent
    ? symbol ? `${symbol} price chart unavailable` : "Price chart unavailable"
    : `${symbol} ${dirWord} ${Math.abs(change?.pctChange ?? 0).toFixed(2)} percent over ${displayPoints.length} sessions${badge ? `, ${badge.label.toLowerCase()} data` : ""}`;
  const ariaLabel = props.ariaLabel ?? computedLabel;
  const signGlyph = activeDir === "up" ? "+" : activeDir === "down" ? "-" : "";

  const plotTop = dims.padding.top;
  const plotBottom = size.height - dims.padding.bottom;

  return (
    <div
      ref={containerRef}
      role="img"
      aria-label={ariaLabel}
      data-argus-chart={variant}
      data-density={density}
      data-absent={absent ? "true" : "false"}
      tabIndex={interactive ? 0 : undefined}
      onPointerMove={interactive ? onMove : undefined}
      onPointerLeave={interactive ? () => setHover(null) : undefined}
      onKeyDown={interactive ? onKey : undefined}
      className={props.className}
      style={{ position: "relative", height: cfg.height, minHeight: cfg.minHeight, width: "100%", outline: "none" }}
    >
      {!absent && (
        <canvas ref={canvasRef} aria-hidden="true" style={{ display: "block", width: "100%", height: "100%" }} />
      )}

      {/* Sparse axes (full variant) */}
      {showAxes && projected.length > 1 && (
        <>
          {axisTicks(displayPoints.length, 4).map((i) => (
            <span key={`d${i}`} aria-hidden data-axis="date"
              style={{
                position: "absolute", left: projected[i].x, top: plotBottom + 4, transform: "translateX(-50%)",
                fontSize: 9, whiteSpace: "nowrap", color: "rgb(var(--ink-faint))", fontVariantNumeric: "tabular-nums",
              }}>
              {axisDate(displayPoints[i].t)}
            </span>
          ))}
          {extent && [extent.max, extent.min].map((v, k) => (
            <span key={`v${k}`} aria-hidden data-axis="value"
              style={{
                position: "absolute", right: 2, top: k === 0 ? plotTop - 5 : plotBottom - 5,
                fontSize: 9, color: "rgb(var(--ink-faint))", fontVariantNumeric: "tabular-nums",
              }}>
              {fmt(v)}
            </span>
          ))}
        </>
      )}

      {/* Crosshair — snaps to a real bar */}
      {interactive && hover != null && activePoint && projected[activeIndex] && (
        <>
          <div aria-hidden data-crosshair="line"
            style={{
              position: "absolute", left: projected[activeIndex].x, top: plotTop, height: Math.max(0, plotBottom - plotTop),
              width: 1, background: "rgba(148,163,184,0.35)", pointerEvents: "none",
            }} />
          <div aria-hidden data-crosshair="dot"
            style={{
              position: "absolute", left: projected[activeIndex].x - 3, top: projected[activeIndex].y - 3,
              width: 6, height: 6, borderRadius: 6, background: dotColor, pointerEvents: "none",
            }} />
        </>
      )}

      {/* Readout — active bar + change from the range start */}
      {showReadout && activePoint && (
        <div
          className="argus-chart-readout"
          aria-live="polite"
          style={{
            position: "absolute", top: 0, ...(showAxes ? { left: 0 } : { right: 0 }),
            display: "flex", alignItems: "baseline", gap: 6, pointerEvents: "none",
          }}
        >
          {showAxes && (
            <span data-readout="date" style={{ fontSize: 10, color: "rgb(var(--ink-faint))" }}>{longDate(activePoint.t)}</span>
          )}
          <span style={{ fontVariantNumeric: "tabular-nums", fontSize: showAxes ? 14 : 12 }}>{fmt(activePoint.v)}</span>
          <span data-direction={activeDir} style={{ fontVariantNumeric: "tabular-nums", fontSize: showAxes ? 12 : 11 }}>
            {signGlyph}{Math.abs(activePct).toFixed(2)}%
          </span>
          {showQualityLabel && badge && (
            <span data-quality={badge.label} data-live="false"
              style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: "0.08em", opacity: 0.6 }}>
              {badge.label}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

export default ArgusChart;
