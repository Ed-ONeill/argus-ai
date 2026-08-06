// Stage 1B(a) — deterministic chart geometry. Pure, node-env; no DOM, no canvas, no time.
// These lock the honesty + determinism contracts: adjusted-close usage, real gaps stay
// gaps, no interpolation, malformed excluded, asOf truncation, and downsample activation.

import { describe, expect, it } from "vitest";

import type { PricePoint, PriceSeries } from "@/lib/platform/types/prices";
import { makeQuality } from "@/lib/platform/quality";
import {
  buildPath,
  changeInfo,
  computeExtent,
  downsample,
  project,
  toDisplayPoints,
} from "@/lib/platform/chart/geometry";
import type { ChartDimensions, DownsampleConfig } from "@/lib/platform/chart/types";

function pt(t: string, c: number, adjClose = c): PricePoint {
  return { t, o: c, h: c, l: c, c, adjClose, v: 100 };
}

function series(points: PricePoint[]): PriceSeries {
  return {
    symbol: "AAPL",
    exchange: "US",
    points,
    adjusted: true,
    asOf: points.length ? points[points.length - 1].t : "",
    quality: makeQuality("eodhd", "2026-08-01T00:00:00.000Z", { grade: "DELAYED", delayMs: 60_000 }),
  };
}

const DIMS: ChartDimensions = { width: 100, height: 40, padding: { top: 0, right: 0, bottom: 0, left: 0 } };

describe("toDisplayPoints", () => {
  it("preserves oldest→newest order and uses ADJUSTED close by default", () => {
    const s = series([pt("2026-07-27", 100, 50), pt("2026-07-28", 104, 52), pt("2026-07-29", 105, 52.5)]);
    const dp = toDisplayPoints(s);
    expect(dp.map((p) => p.t)).toEqual(["2026-07-27", "2026-07-28", "2026-07-29"]);
    expect(dp.map((p) => p.v)).toEqual([50, 52, 52.5]);   // adjClose, not raw close
  });

  it("uses raw close when useRaw is set", () => {
    const s = series([pt("2026-07-28", 104, 52)]);
    expect(toDisplayPoints(s, { useRaw: true })[0].v).toBe(104);
  });

  it("real gaps remain gaps: non-consecutive dates add NO synthetic points (no interpolation)", () => {
    const s = series([pt("2026-07-01", 10), pt("2026-07-02", 11), pt("2026-07-31", 20)]);
    const dp = toDisplayPoints(s);
    expect(dp.length).toBe(3);                     // exactly the real bars, nothing invented
    expect(dp.map((p) => p.t)).toEqual(["2026-07-01", "2026-07-02", "2026-07-31"]);
  });

  it("excludes malformed points deterministically (bad value or bad date)", () => {
    const bad: PriceSeries = series([pt("2026-07-28", 10)]);
    // inject malformed rows around the good one
    bad.points = [
      { ...pt("2026-07-27", 9), adjClose: Number.NaN },       // NaN value → dropped
      pt("2026-07-28", 10, 10),                                // good
      { ...pt("", 11), t: "" } as PricePoint,                  // empty date → dropped
      { t: "2026-07-30", o: 1, h: 1, l: 1, c: 1, adjClose: undefined as unknown as number, v: 1 }, // undefined value → dropped
    ];
    const dp = toDisplayPoints(bad);
    expect(dp).toHaveLength(1);
    expect(dp[0]).toMatchObject({ t: "2026-07-28", v: 10, i: 1 });   // original index preserved
  });

  it("no valid points ⇒ empty (honest absence upstream)", () => {
    expect(toDisplayPoints(series([]))).toEqual([]);
    expect(toDisplayPoints(null)).toEqual([]);
    expect(toDisplayPoints(undefined)).toEqual([]);
    expect(toDisplayPoints(series([{ ...pt("2026-07-28", 1), adjClose: Number.POSITIVE_INFINITY }]))).toEqual([]);
  });

  it("asOf truncates FUTURE points deterministically (playback-safe)", () => {
    const s = series([pt("2026-07-27", 10), pt("2026-07-28", 11), pt("2026-07-29", 12), pt("2026-07-30", 13)]);
    const dp = toDisplayPoints(s, { asOf: "2026-07-28" });
    expect(dp.map((p) => p.t)).toEqual(["2026-07-27", "2026-07-28"]);
    // full-ISO asOf compares on the date part
    expect(toDisplayPoints(s, { asOf: "2026-07-29T23:59:59.000Z" }).map((p) => p.t))
      .toEqual(["2026-07-27", "2026-07-28", "2026-07-29"]);
    // asOf === null means latest (no truncation)
    expect(toDisplayPoints(s, { asOf: null })).toHaveLength(4);
  });
});

describe("computeExtent / project / buildPath", () => {
  it("computeExtent reports min/max/first/last", () => {
    const dp = toDisplayPoints(series([pt("a".padEnd(10, "1"), 10), pt("b".padEnd(10, "1"), 30), pt("c".padEnd(10, "1"), 20)]));
    expect(computeExtent(dp)).toEqual({ min: 10, max: 30, first: 10, last: 20 });
    expect(computeExtent([])).toBeNull();
  });

  it("project is deterministic: equal x-spacing, y inverted, edges pinned", () => {
    const dp = toDisplayPoints(series([pt("2026-07-27", 10), pt("2026-07-28", 20), pt("2026-07-29", 30)]));
    const pr = project(dp, computeExtent(dp)!, DIMS);
    expect(pr.map((p) => p.x)).toEqual([0, 50, 100]);        // equal spacing across width 100
    expect(pr[0].y).toBe(40);                                // min value → bottom
    expect(pr[2].y).toBe(0);                                 // max value → top
    expect(buildPath(pr)).toBe("M 0 40 L 50 20 L 100 0");
  });

  it("a flat series maps to the vertical middle (no divide-by-zero)", () => {
    const dp = toDisplayPoints(series([pt("2026-07-27", 15), pt("2026-07-28", 15)]));
    const pr = project(dp, computeExtent(dp)!, DIMS);
    expect(pr.every((p) => p.y === 20)).toBe(true);
  });

  it("identical inputs yield identical coordinates (pure/deterministic)", () => {
    const dp = toDisplayPoints(series([pt("2026-07-27", 10), pt("2026-07-28", 25), pt("2026-07-29", 12)]));
    const a = buildPath(project(dp, computeExtent(dp)!, DIMS));
    const b = buildPath(project(dp, computeExtent(dp)!, DIMS));
    expect(a).toBe(b);
  });
});

describe("downsample", () => {
  const many = (n: number) =>
    toDisplayPoints(series(Array.from({ length: n }, (_, k) => pt(`2026-${String((k % 12) + 1).padStart(2, "0")}-01`, k))));

  it("does NOT activate at or below threshold", () => {
    const dp = many(50);
    const cfg: DownsampleConfig = { strategy: "lttb", threshold: 50, target: 20 };
    expect(downsample(dp, cfg)).toBe(dp);            // untouched (identity)
  });

  it("activates ABOVE threshold and hits the target count, keeping first+last", () => {
    const dp = many(500);
    const cfg: DownsampleConfig = { strategy: "lttb", threshold: 100, target: 80 };
    const out = downsample(dp, cfg);
    expect(out.length).toBe(80);
    expect(out[0]).toEqual(dp[0]);
    expect(out[out.length - 1]).toEqual(dp[dp.length - 1]);
  });

  it("nth strategy is deterministic and endpoint-preserving", () => {
    const dp = many(300);
    const out = downsample(dp, { strategy: "nth", threshold: 100, target: 50 });
    expect(out.length).toBe(50);
    expect(out[0]).toEqual(dp[0]);
    expect(out[out.length - 1]).toEqual(dp[dp.length - 1]);
    expect(downsample(dp, { strategy: "nth", threshold: 100, target: 50 })).toEqual(out);
  });

  it("strategy 'none' is always identity", () => {
    const dp = many(500);
    expect(downsample(dp, { strategy: "none", threshold: 1, target: 10 })).toBe(dp);
  });
});

describe("changeInfo", () => {
  it("computes first→last change and direction", () => {
    const up = changeInfo(toDisplayPoints(series([pt("2026-07-27", 100), pt("2026-07-28", 110)])));
    expect(up).toMatchObject({ first: 100, last: 110, absChange: 10, pctChange: 10, direction: "up" });
    const down = changeInfo(toDisplayPoints(series([pt("2026-07-27", 100), pt("2026-07-28", 90)])));
    expect(down?.direction).toBe("down");
    const flat = changeInfo(toDisplayPoints(series([pt("2026-07-27", 50), pt("2026-07-28", 50)])));
    expect(flat?.direction).toBe("flat");
  });

  it("never fabricates infinity when the first value is 0", () => {
    const c = changeInfo(toDisplayPoints(series([pt("2026-07-27", 0), pt("2026-07-28", 5)])));
    expect(c?.pctChange).toBe(0);
  });

  it("returns null for no points", () => {
    expect(changeInfo([])).toBeNull();
  });
});
