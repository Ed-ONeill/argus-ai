// platform/chart/presets.ts — per-surface CONFIG, never a forked renderer.
//
// Every surface renders through the single <ArgusChart>; it differs only by the config
// object it passes. Presets encode the defaults for each variant. Stage 1B(a) ships the
// sparkline preset (used next by the Market Pulse, the Drawer, and Entity pages in
// 1B(b)-(d)); the richer presets are declared so later stages fill them in without
// touching the renderer. No preset draws anything — they are data, not rendering.

import type { ChartConfig, ChartVariant, DownsampleConfig } from "./types";

// Large series (5Y/MAX daily, or decades) downsample; small EOD fixtures pass through.
const DEFAULT_DOWNSAMPLE: DownsampleConfig = { strategy: "lttb", threshold: 1200, target: 800 };

const BASE: Omit<ChartConfig, "variant"> = {
  height: 40,
  minHeight: 24,
  fill: false,
  semanticColor: true,
  showLastValue: "auto",
  showQuality: true,
  downsample: DEFAULT_DOWNSAMPLE,
  animate: true,
  asOf: null,
  layers: [],
};

export const SPARKLINE_PRESET: ChartConfig = {
  ...BASE,
  variant: "sparkline",
  height: 40,
  minHeight: 20,
  fill: false,        // restrained: a bare line by default; consumers may opt into fill
};

// Declared for later stages (1B(c)/(d) and beyond). Same renderer, richer defaults.
export const COMPACT_PRESET: ChartConfig = { ...BASE, variant: "compact", height: 160, minHeight: 96, fill: true };
export const FULL_PRESET: ChartConfig = { ...BASE, variant: "full", height: 320, minHeight: 200, fill: true };
export const ANALYTICAL_PRESET: ChartConfig = { ...BASE, variant: "analytical", height: 420, minHeight: 260, fill: true };
export const MULTI_PRESET: ChartConfig = { ...BASE, variant: "multi", height: 320, minHeight: 200, fill: true };

const PRESETS: Record<ChartVariant, ChartConfig> = {
  sparkline: SPARKLINE_PRESET,
  compact: COMPACT_PRESET,
  full: FULL_PRESET,
  analytical: ANALYTICAL_PRESET,
  multi: MULTI_PRESET,
};

/** Resolve the effective config for a variant, applying any per-instance overrides. */
export function resolveConfig(variant: ChartVariant, overrides?: Partial<ChartConfig>): ChartConfig {
  return { ...PRESETS[variant], ...(overrides ?? {}), variant };
}
