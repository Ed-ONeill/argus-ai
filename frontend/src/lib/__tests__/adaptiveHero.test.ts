// adaptiveHero — the deterministic Adaptive Hero selector (PX3.1). Verifies the three
// frozen modes, honest instrument resolution (real ticker / labeled proxy / none), and the
// extensibility seam (a null descriptor -> text-first). Pure, node-env.

import { describe, expect, it } from "vitest";

import type { FeedResponse, MarketEvent } from "@/lib/types";
import { leadIntelligenceFromEvent, planAdaptiveHero, selectHero } from "@/lib/adaptiveHero";

function event(over: Partial<MarketEvent> & { id: string; event_type: MarketEvent["event_type"] }): MarketEvent {
  return {
    title: "", first_seen: "", last_updated: "",
    corroboration_count: 0, source_count: 0, evidence: [], companies: [], companies_direct: [],
    industries: [], theme_ids: [], confidence: 0, editorial_score: 0, why_it_matters: "",
    transmission: null, dominant: false, developing: false, reporting_period: null, merged_event_ids: [],
    ...over,
  } as MarketEvent;
}
const feed = (events: MarketEvent[]): FeedResponse => ({ events } as FeedResponse);

describe("Adaptive Hero selector", () => {
  it("a company/earnings day with a ticker -> chart-dominant of that security", () => {
    const plan = planAdaptiveHero(feed([event({ id: "e", event_type: "earnings", title: "NVIDIA beats", companies_direct: ["NVDA"], editorial_score: 100 })]));
    expect(plan.mode).toBe("chart-dominant");
    expect(plan.instrument).toMatchObject({ symbol: "NVDA", representative: false, exchange: "US" });
  });

  it("a company day with NO chartable ticker -> honest text-first (never a fabricated hero)", () => {
    const plan = planAdaptiveHero(feed([event({ id: "e", event_type: "single_name", title: "Startup raises round", companies_direct: ["Some Private Co"], editorial_score: 100 })]));
    expect(plan).toEqual({ mode: "text-first", instrument: null });
  });

  it("a macro day -> explanation-dominant with a LABELED representative proxy", () => {
    const plan = planAdaptiveHero(feed([event({ id: "e", event_type: "macro", title: "Oil jumps as OPEC extends cuts", editorial_score: 100 })]));
    expect(plan.mode).toBe("explanation-dominant");
    expect(plan.instrument).toMatchObject({ symbol: "USO", representative: true, representativeOf: "oil" });
  });

  it("a macro day with no relevant proxy -> explanation-dominant, chart omitted", () => {
    const plan = planAdaptiveHero(feed([event({ id: "e", event_type: "policy", title: "Antitrust reshuffle at the agency", editorial_score: 100 })]));
    expect(plan.mode).toBe("explanation-dominant");
    expect(plan.instrument).toBeNull();
  });

  it("no event -> text-first (extensibility seam: a null lead-intelligence descriptor)", () => {
    expect(planAdaptiveHero(feed([]))).toEqual({ mode: "text-first", instrument: null });
    expect(leadIntelligenceFromEvent(null)).toBeNull();
    expect(selectHero(null)).toEqual({ mode: "text-first", instrument: null });
  });

  it("selects the highest editorial-score event as the lead intelligence", () => {
    const plan = planAdaptiveHero(feed([
      event({ id: "a", event_type: "macro", title: "Oil ticks up", editorial_score: 10 }),
      event({ id: "b", event_type: "earnings", title: "Apple beats", companies_direct: ["AAPL"], editorial_score: 99 }),
    ]));
    expect(plan).toMatchObject({ mode: "chart-dominant", instrument: { symbol: "AAPL" } });
  });
});
