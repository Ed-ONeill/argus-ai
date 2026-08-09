// drawerView — the Drawer's proof layer (Surface #5). Verifies evidence is GROUPED by
// canonical story/event (never merged by headline similarity), documents sit within their
// story primary-first, chronology runs ACROSS stories, trust is editorial (not a score),
// orientation is descriptive-only, "Referenced in" counts are plain, and NO engine vocabulary
// or opaque score survives. Pure, node-env.

import { describe, expect, it } from "vitest";

import type { EventEvidence, MarketEvent, ThemeIntelligence } from "@/lib/types";
import type { MADeal } from "@/hooks/useMAIntelligence";
import type { IntelContext } from "@/lib/intelligenceContext";
import { buildDrawerView, buildOrientation, type DrawerInputs } from "@/lib/drawerView";

const doc = (source: string, title: string, kind: EventEvidence["kind"], published: string): EventEvidence =>
  ({ source, title, url: `https://x.co/${source}-${published}`, published, tier: 1, kind, qualified: true });

function event(over: Partial<MarketEvent> & { id: string }): MarketEvent {
  return {
    title: "", event_type: "single_name", first_seen: "2026-08-06T09:00:00Z", last_updated: "2026-08-06T12:00:00Z",
    corroboration_count: 0, source_count: 0, evidence: [], companies: ["NVDA"], companies_direct: ["NVDA"], industries: [],
    theme_ids: [], confidence: 0, editorial_score: 0, why_it_matters: "", transmission: null, dominant: false,
    developing: false, reporting_period: null, merged_event_ids: [], ...over,
  } as MarketEvent;
}
const NVDA: IntelContext = { kind: "company", id: "NVDA", label: "NVDA" };
const inputs = (over: Partial<DrawerInputs>): DrawerInputs =>
  ({ context: NVDA, events: [], clusters: [], deals: [], episodes: [], themes: [], market: null, ...over });

describe("evidence is grouped by story, documents within", () => {
  it("one event = one story; its evidence are the documents, primary docs first", () => {
    const v = buildDrawerView(inputs({ events: [event({
      id: "e1", title: "NVIDIA beats on data-center demand",
      evidence: [doc("Reuters", "Nvidia tops estimates", "news", "2026-08-06T10:00:00Z"), doc("SEC", "Nvidia 10-Q", "sec_filing", "2026-08-06T11:00:00Z")],
    })] }));
    expect(v!.stories).toHaveLength(1);
    expect(v!.stories[0].headline).toBe("NVIDIA beats on data-center demand");
    expect(v!.stories[0].docs.map((d) => d.kind)).toEqual(["filing", "news"]);   // primary first
  });

  it("does NOT merge two distinct events even when headlines look similar", () => {
    const v = buildDrawerView(inputs({ events: [
      event({ id: "e1", title: "Nvidia beats estimates", evidence: [doc("Reuters", "a", "news", "2026-08-06T10:00:00Z")] }),
      event({ id: "e2", title: "Nvidia beats estimates again", evidence: [doc("Bloomberg", "b", "news", "2026-08-05T10:00:00Z")] }),
    ] }));
    expect(v!.stories.map((s) => s.id)).toEqual(["e1", "e2"]);   // two stories, canonical ids
  });

  it("chronology runs across stories (newest story first), not across documents", () => {
    const v = buildDrawerView(inputs({ events: [
      event({ id: "old", title: "Older", evidence: [doc("Reuters", "a", "news", "2026-08-01T10:00:00Z")] }),
      event({ id: "new", title: "Newer", evidence: [doc("Reuters", "b", "news", "2026-08-07T10:00:00Z")] }),
    ] }));
    expect(v!.stories.map((s) => s.id)).toEqual(["new", "old"]);
  });

  it("breaks same-timestamp ties by evidence strength (primary before single)", () => {
    const t = "2026-08-06T10:00:00Z";
    const v = buildDrawerView(inputs({ events: [
      event({ id: "single", title: "Single", evidence: [doc("Blog", "a", "news", t)] }),
      event({ id: "primary", title: "Primary", evidence: [doc("SEC", "10-Q", "sec_filing", t)] }),
    ] }));
    expect(v!.stories.map((s) => s.id)).toEqual(["primary", "single"]);
  });
});

describe("editorial trust states (not scores)", () => {
  const build = (over: Partial<MarketEvent>) => buildDrawerView(inputs({ events: [event({ id: "e", ...over })] }))!.stories[0];
  it("a primary document -> 'Primary filing/transcript/disclosure'", () => {
    expect(build({ evidence: [doc("SEC", "10-Q", "sec_filing", "2026-08-06T10:00:00Z")] }).stateLabel).toBe("Primary filing");
    expect(build({ evidence: [doc("IR", "call", "transcript", "2026-08-06T10:00:00Z")] }).stateLabel).toBe("Primary transcript");
  });
  it("multiple outlets -> 'Supported by N independent sources'", () => {
    const s = build({ evidence: [doc("Reuters", "a", "news", "2026-08-06T10:00:00Z"), doc("Bloomberg", "b", "news", "2026-08-06T10:00:00Z"), doc("WSJ", "c", "news", "2026-08-06T10:00:00Z")] });
    expect(s.stateLabel).toBe("Supported by 3 independent sources");
  });
  it("single developing source -> 'Still developing, awaiting confirmation'", () => {
    expect(build({ developing: true, evidence: [doc("Bloomberg", "a", "news", "2026-08-06T10:00:00Z")] }).stateLabel).toBe("Still developing, awaiting confirmation");
  });
  it("single confirmed source -> 'Single source'", () => {
    expect(build({ developing: false, evidence: [doc("Reuters", "a", "news", "2026-08-06T10:00:00Z")] }).stateLabel).toBe("Single source");
  });
});

describe("referenced in, orientation, price, honesty", () => {
  it("counts events, earnings reports, and deals separately", () => {
    const deal: MADeal = { id: "d1", title: "Acq", url: "https://x.co/d", source: "Reuters", published: "2026-08-06T10:00:00Z", entities: ["NVDA"], dealType: "merger", sector: "Semiconductors", peFirm: null, signalScore: 0, summary: "", whyItMatters: "" };
    const v = buildDrawerView(inputs({
      events: [event({ id: "e1", evidence: [doc("R", "a", "news", "2026-08-06T10:00:00Z")] }), event({ id: "e2", event_type: "earnings", evidence: [doc("R", "b", "news", "2026-08-06T10:00:00Z")] })],
      deals: [deal],
    }));
    expect(v!.referencedIn).toEqual({ events: 1, stories: 0, earnings: 1, deals: 1 });
  });

  it("orientation is descriptive for a company, and omitted when analysis leaks in", () => {
    expect(buildOrientation(NVDA, null)).toBe("NVIDIA Corporation is a Semiconductors company.");
    // a theme whose description explains/recommends must be dropped
    const t = { id: "t", name: "AI", description: "AI wins because demand should keep rising." } as ThemeIntelligence;
    expect(buildOrientation({ kind: "theme", id: "ai", label: "AI" }, t)).toBeNull();
  });

  it("shows a compact price strip only for tradable kinds, never as a hero object", () => {
    const v = buildDrawerView(inputs({ market: { price: 176.2, changePercent: 1.4, stale: false, freshness: "delayed" } as DrawerInputs["market"] }));
    expect(v!.price).toMatchObject({ symbol: "NVDA", price: "176.20", changePct: 1.4 });
    expect(v!.continueHref).toBe("/company/NVDA");
  });

  it("is honestly empty when nothing sourced references the entity", () => {
    const v = buildDrawerView(inputs({ events: [event({ id: "e", companies_direct: ["AAPL"], companies: ["AAPL"], evidence: [doc("R", "a", "news", "2026-08-06T10:00:00Z")] })] }));
    expect(v!.hasEvidence).toBe(false);
    expect(v!.stories).toEqual([]);
    expect(v!.referencedIn).toBeNull();
  });

  it("exposes NO engine vocabulary and no opaque scores", () => {
    const v = buildDrawerView(inputs({ events: [event({ id: "e", evidence: [doc("Reuters", "Nvidia tops estimates", "news", "2026-08-06T10:00:00Z")] })] }));
    const json = JSON.stringify(v).toLowerCase();
    for (const banned of ["conviction", "momentum", "signal", "transmission", "regime", "thesis", "overalltrust", "strength", "confidence", "relationship", "graph", "node"]) {
      expect(json, `leaked ${banned}`).not.toContain(banned);
    }
  });
});
