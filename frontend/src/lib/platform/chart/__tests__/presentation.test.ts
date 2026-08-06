// Stage 1B(a) — the honesty layer: DataQuality labeling. Pure, node-env.
// The load-bearing rule: non-live data is NEVER styled as live.

import { describe, expect, it } from "vitest";

import { makeQuality, type DataQuality } from "@/lib/platform/quality";
import { qualityBadge, shouldLabelQuality } from "@/lib/platform/chart/presentation";

function q(grade: DataQuality["grade"], delayMs = 0): DataQuality {
  return makeQuality("eodhd", "2026-08-01T00:00:00.000Z", { grade, delayMs });
}

describe("qualityBadge", () => {
  it("labels each non-live grade explicitly", () => {
    expect(qualityBadge(q("DELAYED", 60_000))).toEqual({ label: "Delayed", live: false });
    expect(qualityBadge(q("STALE", 9_999_999))).toEqual({ label: "Stale", live: false });
    expect(qualityBadge(q("PARTIAL"))).toEqual({ label: "Partial", live: false });
    expect(qualityBadge(q("ESTIMATED"))).toEqual({ label: "Estimated", live: false });
  });

  it("marks live ONLY when realtime and fresh", () => {
    expect(qualityBadge(q("REALTIME", 0))).toEqual({ label: "Live", live: true });
  });

  it("a REALTIME grade that has gone stale is NOT shown as live", () => {
    const badge = qualityBadge(q("REALTIME", 60 * 60 * 1000));   // an hour of delay
    expect(badge?.live).toBe(false);
    expect(badge?.label).toBe("Delayed");
  });

  it("returns null when there is no quality", () => {
    expect(qualityBadge(null)).toBeNull();
    expect(qualityBadge(undefined)).toBeNull();
  });
});

describe("shouldLabelQuality", () => {
  it("labels non-live data and stays quiet for genuinely live data", () => {
    expect(shouldLabelQuality(q("DELAYED", 60_000))).toBe(true);
    expect(shouldLabelQuality(q("ESTIMATED"))).toBe(true);
    expect(shouldLabelQuality(q("REALTIME", 0))).toBe(false);
    expect(shouldLabelQuality(null)).toBe(false);
  });
});
