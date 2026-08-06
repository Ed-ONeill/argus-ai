"use client";

// platform/chart/ArgusChart.tsx — THE canonical Argus chart (PX2 / PX2.1). One renderer,
// every surface. Stage 1B(a) implements the sparkline; Market Pulse / Drawer / Entity
// adopt it unchanged in 1B(b)-(d) (the one-chart principle, Workstation Reuse Law).
//
// Rendering: a custom Canvas draws the price path and a restrained optional fill; a DOM
// overlay carries the readout and the DataQuality label and is the prepared boundary for
// future crosshair / markers / axes / tooltips. No external charting library. The
// component takes a canonical PriceSeries (Stage 1A) as a prop and never fetches, never
// calls a provider, and never authors intelligence — it renders facts only.
//
// Honesty: it plots only real adjusted-close values, shows real gaps as gaps, renders
// nothing when there is no valid series, and NEVER styles delayed/stale/estimated/partial
// data as live (a live dot appears only when the fact is genuinely realtime-and-fresh).

import { useEffect, useMemo, useRef, useState } from "react";

import type { DataQuality } from "@/lib/platform/quality";
import type { PriceSeries } from "@/lib/platform/types/prices";
import { densityFeatures, effectiveDensity } from "./density";
import {
  changeInfo,
  computeExtent,
  downsample,
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

interface DrawColors {
  line: string;
  fillTop: string;
  fillBottom: string;
  liveDot: boolean;
}

function pickColors(
  el: HTMLElement | null,
  change: ChangeInfo | null,
  semantic: boolean,
  live: boolean,
): DrawColors {
  const styles = el ? getComputedStyle(el) : null;
  let triplet = tokenRGB(styles, "--ink-secondary", FALLBACK.neutral);
  if (semantic && change && change.direction !== "flat") {
    triplet = change.direction === "up" ? FALLBACK.up : FALLBACK.down;
  }
  return {
    line: rgb(triplet),
    fillTop: rgb(triplet, 0.14),
    fillBottom: rgb(triplet, 0),
    liveDot: live,   // never true for delayed/stale/estimated/partial data
  };
}

// ── pure canvas paint (guarded; a no-op when there is no 2D context) ──
function paint(
  canvas: HTMLCanvasElement,
  projected: ProjectedPoint[],
  dims: ChartDimensions,
  colors: DrawColors,
  fill: boolean,
  progress: number,
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

  // Live affordance: a small solid dot at the last real bar, ONLY when genuinely live.
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
    ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
    : false;
}

const PADDING = { top: 3, right: 2, bottom: 3, left: 2 };

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

  const series = primarySeries(props.series);
  const quality: DataQuality | null = series?.quality ?? null;

  // ── pure geometry (deterministic; asOf-truncated; downsampled past the threshold) ──
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
  const showReadout =
    !absent && features.readout && cfg.showLastValue !== "never" && change != null;
  const showQualityLabel = showReadout && cfg.showQuality && !!badge && !badge.live;

  // ── responsive sizing (ResizeObserver); reserved height prevents layout shift ──
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

  // ── paint: high-DPI canvas, one-shot draw-in (instant under reduced motion) ──
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || absent || size.width <= 0) return;
    const dims: ChartDimensions = { width: size.width, height: size.height, padding: PADDING };
    const extent = computeExtent(displayPoints);
    if (!extent) return;
    const projected = project(displayPoints, extent, dims);
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
  }, [displayPoints, change, live, size.width, size.height, cfg.animate, cfg.fill, cfg.semanticColor, absent]);

  // ── accessible summary (color-independent; honest about reliability) ──
  const symbol = series?.symbol ?? "";
  const dirWord = change?.direction === "up" ? "up" : change?.direction === "down" ? "down" : "flat";
  const computedLabel = absent
    ? symbol ? `${symbol} price chart unavailable` : "Price chart unavailable"
    : `${symbol} ${dirWord} ${Math.abs(change?.pctChange ?? 0).toFixed(2)} percent over ${displayPoints.length} sessions${badge ? `, ${badge.label.toLowerCase()} data` : ""}`;
  const ariaLabel = props.ariaLabel ?? computedLabel;

  const signGlyph = change?.direction === "up" ? "+" : change?.direction === "down" ? "-" : "";

  return (
    <div
      ref={containerRef}
      role="img"
      aria-label={ariaLabel}
      data-argus-chart={variant}
      data-density={density}
      data-absent={absent ? "true" : "false"}
      className={props.className}
      style={{ position: "relative", height: cfg.height, minHeight: cfg.minHeight, width: "100%" }}
    >
      {/* Reserved space always occupies the same box; absence never collapses it. */}
      {!absent && (
        <canvas ref={canvasRef} aria-hidden="true" style={{ display: "block", width: "100%", height: "100%" }} />
      )}

      {showReadout && change && (
        <div
          className="argus-chart-readout"
          style={{
            position: "absolute", top: 0, right: 0, display: "flex", alignItems: "baseline",
            gap: 6, pointerEvents: "none",
          }}
        >
          <span style={{ fontVariantNumeric: "tabular-nums", fontSize: 12 }}>{fmt(change.last)}</span>
          <span
            data-direction={change.direction}
            style={{ fontVariantNumeric: "tabular-nums", fontSize: 11 }}
          >
            {signGlyph}{Math.abs(change.pctChange).toFixed(2)}%
          </span>
          {showQualityLabel && badge && (
            <span
              data-quality={badge.label}
              data-live="false"
              style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: "0.08em", opacity: 0.6 }}
            >
              {badge.label}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

export default ArgusChart;
