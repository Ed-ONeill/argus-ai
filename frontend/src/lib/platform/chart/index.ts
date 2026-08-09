// platform/chart/index.ts — the canonical chart primitive's public surface.
//
// Consumers import from here only. Stage 1B(a) exposes the sparkline; the same barrel
// serves every later surface (compact/full/analytical/multi) as those stages land, so no
// surface ever reaches past this boundary or forks the renderer (Workstation Reuse Law).

export { ArgusChart, default } from "./ArgusChart";
export {
  SPARKLINE_PRESET,
  COMPACT_PRESET,
  FULL_PRESET,
  ANALYTICAL_PRESET,
  MULTI_PRESET,
  resolveConfig,
} from "./presets";
export {
  toDisplayPoints,
  computeExtent,
  downsample,
  project,
  buildPath,
  changeInfo,
  nearestIndex,
  axisTicks,
} from "./geometry";
export {
  densityForSize,
  variantCeiling,
  effectiveDensity,
  densityFeatures,
} from "./density";
export { qualityBadge, shouldLabelQuality } from "./presentation";
export type {
  ArgusChartProps,
  AsOf,
  ChartConfig,
  ChartContextLayer,
  ChartDensity,
  ChartDimensions,
  ChartExtent,
  ChartLayerKind,
  ChartLayerMarker,
  ChartNavigationIntent,
  ChartNavigationTarget,
  ChartTimeCursor,
  ChartVariant,
  DensityFeatures,
  DisplayPoint,
  DownsampleConfig,
  DownsampleStrategy,
  ProjectedPoint,
} from "./types";
