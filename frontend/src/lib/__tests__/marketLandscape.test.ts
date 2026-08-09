// marketLandscape — "Today's Market Landscape" model (Law-10 Feed centerpiece). Verifies
// the fixed cross-asset spine is always present, protagonists and edges are strictly
// event-driven, density is pruned, it degrades to the spine on quiet days, and no engine
// vocabulary appears. Pure, node-env.

import { describe, expect, it } from "vitest";

import type { FeedResponse, MarketEvent } from "@/lib/types";
import { buildMarketLandscape } from "@/lib/marketLandscape";

function event(over: Partial<MarketEvent> & { id: string }): MarketEvent {
  return {
    title: `Event ${over.id}`, event_type: "macro", first_seen: "", last_updated: "",
    corroboration_count: 0, source_count: 0, evidence: [], companies: [], companies_direct: [],
    industries: [], theme_ids: [], confidence: 0, editorial_score: 0, why_it_matters: "",
    transmission: null, dominant: false, developing: false, reporting_period: null, merged_event_ids: [],
    ...over,
  } as MarketEvent;
}
const feed = (events: MarketEvent[]): FeedResponse => ({ events } as FeedResponse);

const SPINE_IDS = ["spine:sp500", "spine:nasdaq", "spine:treasuries", "spine:oil", "spine:gold", "spine:dollar", "spine:bitcoin"];

describe("buildMarketLandscape", () => {
  it("always includes the fixed cross-asset spine, even with no events (degrades to spine)", () => {
    const m = buildMarketLandscape(undefined);
    const spine = m.nodes.filter((n) => n.spine);
    expect(spine.map((n) => n.id).sort()).toEqual([...SPINE_IDS].sort());
    expect(spine.every((n) => !!n.symbol && n.y > 70)).toBe(true);   // spine along the bottom
    expect(m.edges).toEqual([]);
    expect(m.protagonistCount).toBe(0);
  });

  it("adds event protagonists and event-driven edges (a real event links the concepts)", () => {
    const m = buildMarketLandscape(feed([
      event({ id: "e1", event_type: "macro", title: "Oil jumps as OPEC extends cuts", companies_direct: ["XOM"], editorial_score: 100 }),
    ]));
    const ids = m.nodes.map((n) => n.id);
    expect(ids).toContain("co:XOM");        // a company protagonist
    expect(ids).toContain("macro:OPEC");    // a macro-actor protagonist
    // both connect to the market the event is about, each with a plain-language reason
    const xomEdge = m.edges.find((e) => e.from === "co:XOM" && e.to === "spine:oil");
    expect(xomEdge).toMatchObject({ from: "co:XOM", to: "spine:oil", reason: "Oil jumps as OPEC extends cuts" });
    expect(m.edges.find((e) => e.from === "macro:OPEC" && e.to === "spine:oil")).toBeTruthy();
    // the spine market records the event
    expect(m.nodes.find((n) => n.id === "spine:oil")!.eventIds).toContain("e1");
  });

  it("extracts a macro actor and maps a Fed event to Treasuries", () => {
    const m = buildMarketLandscape(feed([event({ id: "e2", event_type: "macro", title: "Fed holds rates steady", editorial_score: 90 })]));
    expect(m.nodes.find((n) => n.id === "macro:Fed")).toBeTruthy();
    expect(m.edges.find((e) => e.from === "macro:Fed" && e.to === "spine:treasuries")?.reason).toBe("Fed holds rates steady");
  });

  it("every drawn connection carries a one-sentence plain-language reason", () => {
    const m = buildMarketLandscape(feed([
      event({ id: "e1", event_type: "macro", title: "Oil jumps as OPEC extends cuts", companies_direct: ["XOM"], editorial_score: 100 }),
      event({ id: "e2", event_type: "macro", title: "Fed holds rates steady", editorial_score: 90 }),
    ]));
    expect(m.edges.length).toBeGreaterThan(0);
    expect(m.edges.every((e) => typeof e.reason === "string" && e.reason.trim().length > 0)).toBe(true);
  });

  it("keeps the spine permanently anchored regardless of protagonists", () => {
    const quiet = buildMarketLandscape(undefined);
    const busy = buildMarketLandscape(feed([
      event({ id: "e1", event_type: "macro", title: "Oil jumps", companies_direct: ["XOM"], editorial_score: 100 }),
    ]));
    const pos = (m: ReturnType<typeof buildMarketLandscape>) =>
      m.nodes.filter((n) => n.spine).map((n) => `${n.id}:${n.x.toFixed(1)}:${n.y}`);
    expect(pos(busy)).toEqual(pos(quiet));   // spine positions never move
  });

  it("prunes protagonists to keep density in band (<= 7 protagonists, <= 14 total)", () => {
    const many = Array.from({ length: 20 }, (_, i) =>
      event({ id: `e${i}`, event_type: "single_name", title: `${["AAA", "BBB", "CCC", "DDD", "EEE", "FFF", "GGG", "HHH", "III", "JJJ"][i % 10]} moves`, companies_direct: [`T${i}`], editorial_score: 100 - i }));
    const m = buildMarketLandscape(feed(many));
    expect(m.protagonistCount).toBeLessThanOrEqual(7);
    expect(m.nodes.length).toBeLessThanOrEqual(14);
  });

  it("has NO edges when no event connects concepts (never fabricates relationships)", () => {
    // a pure single-name event with no market subject -> a lone protagonist, no edge
    const m = buildMarketLandscape(feed([event({ id: "e", event_type: "single_name", title: "Privco raises a round", companies_direct: ["ABC"], editorial_score: 5 })]));
    expect(m.nodes.find((n) => n.id === "co:ABC")).toBeTruthy();
    expect(m.edges).toEqual([]);
  });

  it("exposes no engine vocabulary anywhere in the model", () => {
    const m = buildMarketLandscape(feed([
      event({ id: "e1", event_type: "macro", title: "Oil and the Fed drive stocks", companies_direct: ["XOM"], editorial_score: 100 }),
    ]));
    const json = JSON.stringify(m).toLowerCase();
    for (const banned of ["theme", "conviction", "transmission", "coherence", "lifecycle", "signal", "regime", "entities"]) {
      expect(json, `leaked "${banned}"`).not.toContain(banned);
    }
  });
});
