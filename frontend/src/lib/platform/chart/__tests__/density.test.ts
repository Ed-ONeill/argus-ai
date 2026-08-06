// Stage 1B(a) — Adaptive Density (PX2.1 Refinement 3). Pure, node-env.
// The same chart exposes more capability as space grows, but each variant caps how far.

import { describe, expect, it } from "vitest";

import {
  densityFeatures,
  densityForSize,
  effectiveDensity,
  variantCeiling,
} from "@/lib/platform/chart/density";

describe("densityForSize", () => {
  it("grows through the bands as the box grows", () => {
    expect(densityForSize(60, 30)).toBe("micro");
    expect(densityForSize(200, 60)).toBe("small");
    expect(densityForSize(300, 120)).toBe("medium");
    expect(densityForSize(600, 260)).toBe("large");
    expect(densityForSize(1000, 400)).toBe("huge");
  });

  it("a tiny width forces micro even when tall (both dimensions matter)", () => {
    expect(densityForSize(50, 400)).toBe("micro");
  });

  it("is deterministic and safe for non-finite sizes", () => {
    expect(densityForSize(Number.NaN, Number.NaN)).toBe("micro");
  });
});

describe("variant ceilings", () => {
  it("caps each variant's maximum capability", () => {
    expect(variantCeiling("sparkline")).toBe("small");
    expect(variantCeiling("compact")).toBe("medium");
    expect(variantCeiling("full")).toBe("large");
    expect(variantCeiling("analytical")).toBe("huge");
    expect(variantCeiling("multi")).toBe("huge");
  });

  it("a sparkline never exceeds 'small' no matter how large the container", () => {
    expect(effectiveDensity("sparkline", 2000, 900)).toBe("small");
    expect(effectiveDensity("sparkline", 60, 20)).toBe("micro");   // still adapts DOWN
  });

  it("a full chart adapts down in a small box but can reach 'large'", () => {
    expect(effectiveDensity("full", 60, 20)).toBe("micro");
    expect(effectiveDensity("full", 600, 260)).toBe("large");
    expect(effectiveDensity("full", 2000, 900)).toBe("large");     // capped at its ceiling
  });
});

describe("densityFeatures — progressive and additive", () => {
  it("micro shows the line only", () => {
    expect(densityFeatures("micro")).toEqual({ line: true, readout: false, annotations: false, analytical: false });
  });
  it("small/medium add the readout but no annotations", () => {
    expect(densityFeatures("small").readout).toBe(true);
    expect(densityFeatures("small").annotations).toBe(false);
    expect(densityFeatures("medium").annotations).toBe(false);
  });
  it("large adds annotations; huge adds analytical", () => {
    expect(densityFeatures("large").annotations).toBe(true);
    expect(densityFeatures("large").analytical).toBe(false);
    expect(densityFeatures("huge").analytical).toBe(true);
  });
});
