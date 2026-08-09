// marketBrief — the "Before the Bell" lead, written only from real signals. Verifies the
// morning-note voice, the honest Treasuries mapping (TLT up => yields lower), session
// framing, and honest absence (no inputs -> null; no fabricated futures/calendar). Pure.

import { describe, expect, it } from "vitest";

import { buildMarketBrief } from "@/lib/marketBrief";

describe("buildMarketBrief", () => {
  it("writes a morning note from real moves + the lead story + session", () => {
    const note = buildMarketBrief({
      index: { label: "S&P 500", pct: 0.6 },
      rates: { label: "Treasuries", pct: 0.4 },   // TLT up => yields lower
      oil: { label: "Oil", pct: -2.0 },
      topStory: "Cooler inflation data",
      sessionLabel: "After Hours", live: false,
    });
    expect(note).toContain("After the close");
    expect(note).toContain("the S&P 500 last closed +0.6%");
    expect(note).toContain("Treasury yields eased");
    expect(note).toContain("oil -2.0%");
    expect(note).toContain("In focus: Cooler inflation data");
  });

  it("maps falling bond prices to rising yields", () => {
    const note = buildMarketBrief({
      index: null, rates: { label: "Treasuries", pct: -1.2 }, oil: null,
      topStory: null, sessionLabel: null, live: false,
    });
    expect(note).toContain("Treasury yields pushed higher");
  });

  it("uses the lead story alone when no prices are available (no fabricated moves)", () => {
    expect(buildMarketBrief({
      index: { label: "", pct: null }, rates: null, oil: null,
      topStory: "NVIDIA reports after the close", sessionLabel: null, live: false,
    })).toBe("In focus: NVIDIA reports after the close.");
  });

  it("returns null when there is nothing real to say", () => {
    expect(buildMarketBrief({ index: null, rates: null, oil: null, topStory: null, sessionLabel: null, live: false })).toBeNull();
  });
});
