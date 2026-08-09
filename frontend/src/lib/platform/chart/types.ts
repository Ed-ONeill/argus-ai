// platform/chart/types.ts — the canonical, product-agnostic chart contract (PX2 / PX2.1).
//
// One chart system, every surface (the one-chart principle). These types are the stable
// interface for the whole roadmap: Stage 1B(a) implements the sparkline against them, and
// later surfaces (Drawer/Entity/Explorer/Markets/Workstation) reuse them UNCHANGED
// (Workstation Reuse Law). Interfaces for future capability — Context Layers, navigation
// intents, the time cursor — exist now so nothing has to be rewritten later; inactive
// capabilities remain ABSENT, never faked behind a placeholder (Law of Authored
// Intelligence: the chart renders facts and Argus-authored marks, and invents nothing).

import type { PriceSeries } from "@/lib/platform/types/prices";

// ── Variant + adaptive density ─────────────────────────────────────────────────
// `variant` is a density CEILING, not a fixed UI. The chart adapts DOWN within it as
// space shrinks (PX2.1 Refinement 3 — Adaptive Density).
export type ChartVariant = "sparkline" | "compact" | "full" | "analytical" | "multi";

export type ChartDensity = "micro" | "small" | "medium" | "large" | "huge";

export interface DensityFeatures {
  line: boolean;         // the price path — always true when there is data
  readout: boolean;      // last-value / hover readout
  annotations: boolean;  // Context Layer markers + axis annotations
  analytical: boolean;   // compare / overlays / playback affordances
}

// ── Display + projection geometry (deterministic) ──────────────────────────────
export interface DisplayPoint {
  t: string;   // ISO date of the real bar (never synthesized)
  v: number;   // the plotted value (adjusted close by default)
  i: number;   // original index in the source series (stable identity)
}

export interface ProjectedPoint extends DisplayPoint {
  x: number;   // device-independent pixels
  y: number;
}

export interface ChartExtent {
  min: number;
  max: number;
  first: number;
  last: number;
}

export interface ChartDimensions {
  width: number;
  height: number;
  padding: { top: number; right: number; bottom: number; left: number };
}

// ── Downsampling strategy (interface now; small EOD fixtures rarely trigger it) ──
export type DownsampleStrategy = "none" | "lttb" | "nth";

export interface DownsampleConfig {
  strategy: DownsampleStrategy;
  threshold: number;   // activate only when point count EXCEEDS this
  target: number;      // desired point count after downsampling
}

// ── Context Layers (PX2.1 Refinement 1) — typed now, WIRED NONE in Stage 1B(a) ──
export type ChartLayerKind =
  | "price"          // base layer (the only active layer in 1B(a))
  | "news"
  | "theme"
  | "prediction"
  | "earnings"
  | "macro"
  | "insider"
  | "institutional"
  | "userNotes";

// ── Navigation intents (PX2.1 Refinement 2) — the chart is a navigation surface ──
export type ChartNavigationTarget =
  | "drawer" | "entity" | "marketMap" | "briefSection" | "feed" | "event";

export interface ChartNavigationIntent {
  target: ChartNavigationTarget;
  ref: string;   // uid | symbol | theme key | brief anchor
}

export interface ChartLayerMarker {
  t: string;                        // ISO timestamp of a REAL event (never invented)
  kind: ChartLayerKind;
  label: string;
  intent?: ChartNavigationIntent;   // clicking navigates the institution, not a tooltip
}

export interface ChartContextLayer {
  kind: ChartLayerKind;
  enabled: boolean;    // user toggle
  available: boolean;  // data-gated: false ⇒ absent (never faked)
  markers: ChartLayerMarker[];
}

// ── The time cursor (PX2.1 Refinement 4) — Narrative Playback must not be precluded ──
// asOf === null means "latest" (no truncation). Any consuming surface renders as a pure
// function of (data, asOf) and never assumes "now".
export type AsOf = string | null;

export interface ChartTimeCursor {
  asOf: AsOf;
}

// ── The per-surface configuration (one renderer, config differs, never forked) ──
export interface ChartConfig {
  variant: ChartVariant;
  height: number;            // reserved height (no layout shift)
  minHeight: number;
  fill: boolean;             // restrained gradient fill under the line
  semanticColor: boolean;    // gain/loss color ONLY when semantically valid, else neutral
  showLastValue: "auto" | "always" | "never" | "hover";   // "hover" = idle readout hidden, shown only on scrub
  showQuality: boolean;      // surface the DataQuality label when not live
  downsample: DownsampleConfig;
  animate: boolean;          // one-shot draw-in; never a loop
  asOf: AsOf;
  layers: ChartContextLayer[];   // typed; Stage 1B(a) provides/renders none
}

export interface ArgusChartProps {
  /** Canonical series (Stage 1A). Array support is reserved for compare/multi; Stage
   *  1B(a) renders the primary series only. */
  series?: PriceSeries | PriceSeries[] | null;
  variant?: ChartVariant;
  config?: Partial<ChartConfig>;
  asOf?: AsOf;
  layers?: ChartContextLayer[];
  /** Typed for PX2.1 Refinement 2; no markers are wired in Stage 1B(a), so it is unused. */
  onNavigate?: (intent: ChartNavigationIntent) => void;
  className?: string;
  ariaLabel?: string;
}
