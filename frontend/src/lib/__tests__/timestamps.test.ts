/**
 * OP4.0 (Sprint 3): timestamp view-model contract.
 * Real epochs from real ISO strings; unknown stays unknown — Date.now() is
 * never a substitute for a missing observation time.
 */

import { describe, expect, it } from "vitest";
import { observationEpochs, toEpochMs } from "../timestamps";

const ISO = "2026-07-21T09:30:00+00:00";
const ISO_MS = Date.parse(ISO);

describe("toEpochMs", () => {
  it("parses ISO-8601 UTC strings", () => {
    expect(toEpochMs(ISO)).toBe(ISO_MS);
  });

  it("returns null for missing or invalid values — never fabricates", () => {
    expect(toEpochMs(null)).toBeNull();
    expect(toEpochMs(undefined)).toBeNull();
    expect(toEpochMs("")).toBeNull();
    expect(toEpochMs("2h ago")).toBeNull();     // display strings are not timestamps
  });
});

describe("observationEpochs", () => {
  it("prefers publication time", () => {
    expect(observationEpochs({ published_ts: ISO, fetched_at: "2026-07-21T09:45:00+00:00" }))
      .toEqual({ firstSeen: ISO_MS, lastSeen: ISO_MS });
  });

  it("falls back to fetch time when publication time is unknown", () => {
    const fetched = "2026-07-21T09:45:00+00:00";
    expect(observationEpochs({ published_ts: null, fetched_at: fetched }))
      .toEqual({ firstSeen: Date.parse(fetched), lastSeen: Date.parse(fetched) });
  });

  it("returns null when neither exists — honest absence, no Date.now()", () => {
    expect(observationEpochs({})).toBeNull();
    expect(observationEpochs({ published_ts: null, fetched_at: null })).toBeNull();
  });
});
