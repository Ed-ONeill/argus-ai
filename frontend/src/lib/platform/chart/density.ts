// platform/chart/density.ts — Adaptive Density (PX2.1 Refinement 3). Pure + deterministic.
//
// The SAME <ArgusChart> progressively exposes capability as space grows, rather than a
// fixed UI per variant. `densityForSize` reads the measured box; `variant` imposes a
// CEILING so a sparkline never grows axes or analytical chrome no matter how large its
// container. `densityFeatures` says what each density is allowed to show.

import type { ChartDensity, ChartVariant, DensityFeatures } from "./types";

const ORDER: ChartDensity[] = ["micro", "small", "medium", "large", "huge"];

/** The intrinsic density a measured box can support (ignoring the variant ceiling). */
export function densityForSize(width: number, height: number): ChartDensity {
  const w = Number.isFinite(width) ? width : 0;
  const h = Number.isFinite(height) ? height : 0;
  if (h < 40 || w < 80) return "micro";
  if (h < 72 || w < 180) return "small";
  if (h < 160 || w < 420) return "medium";
  if (h < 320 || w < 760) return "large";
  return "huge";
}

/** Each variant caps how capable it may become — the one-chart principle with restraint. */
export function variantCeiling(variant: ChartVariant): ChartDensity {
  switch (variant) {
    case "sparkline": return "small";    // line, and a readout when space permits
    case "compact":   return "medium";
    case "full":      return "large";
    case "analytical":
    case "multi":     return "huge";
  }
}

function rank(d: ChartDensity): number {
  return ORDER.indexOf(d);
}

/** The density actually applied: the measured density clamped to the variant ceiling. */
export function effectiveDensity(
  variant: ChartVariant,
  width: number,
  height: number,
): ChartDensity {
  const measured = densityForSize(width, height);
  const ceiling = variantCeiling(variant);
  return rank(measured) <= rank(ceiling) ? measured : ceiling;
}

/** What a given density is permitted to render. Progressive, additive, deterministic. */
export function densityFeatures(density: ChartDensity): DensityFeatures {
  switch (density) {
    case "micro":  return { line: true, readout: false, annotations: false, analytical: false };
    case "small":  return { line: true, readout: true,  annotations: false, analytical: false };
    case "medium": return { line: true, readout: true,  annotations: false, analytical: false };
    case "large":  return { line: true, readout: true,  annotations: true,  analytical: false };
    case "huge":   return { line: true, readout: true,  annotations: true,  analytical: true };
  }
}
