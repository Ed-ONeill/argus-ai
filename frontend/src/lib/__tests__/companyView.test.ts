// companyView — the Law-10 company page translation. Verifies the engine-worded
// CompanyDossier is re-voiced into plain market concepts: connections are sectors/peers/
// macro (never themes), "why it matters" and "what to watch" are plain, developments come
// from real events, and NO engine vocabulary survives. Built through the real dossier
// pipeline. Pure, node-env.

import { describe, expect, it } from "vitest";

import type { FeedResponse, MarketEvent, ThemeIntelligence } from "@/lib/types";
import type { RelationshipRow } from "@/lib/api";
import { buildCompanyDossier } from "@/lib/intel/dossier";
import { buildCompanyView, buildConnectionMemory } from "@/lib/companyView";

function theme(over: Partial<ThemeIntelligence> & { id: string; name: string }): ThemeIntelligence {
  return {
    description: "", causal_narrative: "", signal_strength: "medium", confidence: 50,
    momentum_direction: "neutral", related_industries: [], related_assets: [], related_macro_factors: [],
    contributing_cluster_ids: [], contributing_story_count: 0, second_order_effects: [], podcast_topics: [],
    last_updated: "", relationship_weights: {}, confidence_label: "", signal_quality: "developing",
    evidence_count: 0, persistence_score: 0, volatility_score: 0, cross_category_confirmed: false,
    momentum_label: "stable", momentum_delta: 0, persistence_cycles: 0, competition_penalty: 0,
    breadth_score: 0, persistence_days: 0, memory: null, ...over,
  } as ThemeIntelligence;
}

function event(over: Partial<MarketEvent> & { id: string }): MarketEvent {
  return {
    title: "", event_type: "single_name", first_seen: "2026-08-06T09:00:00Z", last_updated: "2026-08-06T12:00:00Z",
    corroboration_count: 3, source_count: 4, evidence: [], companies: [], companies_direct: [], industries: [],
    theme_ids: [], confidence: 0, editorial_score: 0, why_it_matters: "", transmission: null, dominant: false,
    developing: false, reporting_period: null, merged_event_ids: [], ...over,
  } as MarketEvent;
}
const feed = (o: Partial<FeedResponse>): FeedResponse => o as FeedResponse;

const AI = theme({
  id: "t1", name: "AI Infrastructure", related_assets: ["NVDA"], related_industries: ["Semiconductors"],
  related_macro_factors: ["Data center demand"], description: "Accelerating data-center spending across hyperscalers.",
  causal_narrative: "AI demand → data centers → chips", confidence: 80, momentum_label: "accelerating",
  momentum_direction: "bullish", evidence_count: 5,
});
const EARN = event({
  id: "e1", event_type: "earnings", title: "NVIDIA beats on data-center demand", companies: ["NVDA"],
  companies_direct: ["NVDA"], theme_ids: ["t1"], why_it_matters: "Data-center orders are surging into year-end.",
  corroboration_count: 6, industries: ["Semiconductors"],
});
// A DISTINCT earnings/filing record — so earnings & filings has genuinely new content.
const FILE = event({
  id: "e2", event_type: "earnings", title: "NVIDIA files its quarterly report", companies: ["NVDA"],
  companies_direct: ["NVDA"], theme_ids: ["t1"], why_it_matters: "The filing shows widening margins.",
  corroboration_count: 3, industries: ["Semiconductors"],
});

describe("buildCompanyView", () => {
  const view = buildCompanyView(buildCompanyDossier("NVDA", feed({ theme_intelligence: [AI], events: [EARN, FILE] })))!;

  it("surfaces connections as market concepts, never the theme, never itself", () => {
    expect(view.ticker).toBe("NVDA");
    expect(view.connections.map((c) => c.label)).toContain("Semiconductors");
    expect(view.connections.find((c) => c.label === "NVDA")).toBeUndefined();
  });

  it("exposes NO engine vocabulary and no theme name anywhere", () => {
    const json = JSON.stringify(view).toLowerCase();
    for (const banned of ["conviction", "transmission", "thesis", "ledger", "momentum", "regime", "\"theme\""]) {
      expect(json, `leaked ${banned}`).not.toContain(banned);
    }
    expect(json).not.toContain("ai infrastructure");   // the theme name is never shown
  });

  it("writes 'why it matters' plainly, from what happened to the company", () => {
    expect(view.whyItMatters).toBe("Data-center orders are surging into year-end.");
  });

  it("excludes the lead event everywhere, keeping only DISTINCT earnings/filings", () => {
    // e1 is the primary story ("why it matters"); it never repeats in the list or section.
    expect(view.developments.find((d) => d.id === "e1")).toBeUndefined();
    expect(view.earningsFilings.find((d) => d.id === "e1")).toBeUndefined();
    // e2 is a distinct record — it appears in the list and is the only earnings/filing.
    expect(view.developments.find((d) => d.id === "e2")).toMatchObject({ direct: true, category: "Earnings" });
    expect(view.earningsFilings.map((d) => d.id)).toEqual(["e2"]);
  });

  it("omits earnings & filings when the only earnings record is the lead event", () => {
    const only = buildCompanyView(buildCompanyDossier("NVDA", feed({ theme_intelligence: [AI], events: [EARN] })))!;
    expect(only.earningsFilings).toEqual([]);          // section would render empty -> omitted
    expect(only.developments).toEqual([]);             // lead event excluded, nothing else
  });

  it("keeps only the plain forward question in 'what to watch'", () => {
    expect(view.watch[0]).toBe("Does AI demand keep feeding chips?");
    expect(view.watch.join(" ")).not.toMatch(/conviction|chain/i);
  });

  it("is honest when the company has nothing", () => {
    expect(buildCompanyView(null)).toBeNull();
    const empty = buildCompanyView(buildCompanyDossier("ZZZZ", feed({ theme_intelligence: [], events: [] })))!;
    expect(empty.hasContent).toBe(false);
    expect(empty.developments).toEqual([]);
    expect(empty.whyItMatters).toBeNull();
    expect(empty.connections).toEqual([]);
  });
});

describe("buildConnectionMemory (relationship-memory enrichment)", () => {
  const rel = (over: Partial<RelationshipRow> & { rel_uid: string; first_seen_at?: string }): RelationshipRow => ({
    source_uid: "theme:t1", target_uid: "company:ticker:NVDA", relationship_type: "exposed_to", ...over,
  });

  it("is unavailable (silently omitted) when there are no recorded relationships", () => {
    expect(buildConnectionMemory(null)).toMatchObject({ available: false, trackedSince: null, mostRecentFormedAt: null });
    expect(buildConnectionMemory([])).toMatchObject({ available: false });
    // rows without a first_seen timestamp cannot ground a claim -> still unavailable
    expect(buildConnectionMemory([rel({ rel_uid: "r1" })])).toMatchObject({ available: false });
  });

  it("reports how long the company has been mapped, from the earliest recorded connection", () => {
    const m = buildConnectionMemory([
      rel({ rel_uid: "r1", first_seen_at: "2026-05-10T00:00:00Z" }),
      rel({ rel_uid: "r2", first_seen_at: "2026-03-02T00:00:00Z" }),
    ]);
    expect(m.available).toBe(true);
    expect(m.trackedSince).toBe("2026-03-02T00:00:00Z");   // earliest, not the newest
  });

  it("surfaces the most recent formation only when the set grew after the first connection", () => {
    const grew = buildConnectionMemory([
      rel({ rel_uid: "r1", first_seen_at: "2026-03-02T00:00:00Z" }),
      rel({ rel_uid: "r2", first_seen_at: "2026-07-15T00:00:00Z" }),
    ]);
    expect(grew.mostRecentFormedAt).toBe("2026-07-15T00:00:00Z");

    // A stable set (all connections formed at the same time) collapses to the "since" clause only.
    const stable = buildConnectionMemory([
      rel({ rel_uid: "r1", first_seen_at: "2026-03-02T00:00:00Z" }),
      rel({ rel_uid: "r2", first_seen_at: "2026-03-02T00:00:00Z" }),
    ]);
    expect(stable.mostRecentFormedAt).toBeNull();
  });

  it("ignores unparseable timestamps without fabricating a date", () => {
    const m = buildConnectionMemory([
      rel({ rel_uid: "r1", first_seen_at: "not-a-date" }),
      rel({ rel_uid: "r2", first_seen_at: "2026-04-01T00:00:00Z" }),
    ]);
    expect(m).toMatchObject({ available: true, trackedSince: "2026-04-01T00:00:00Z", mostRecentFormedAt: null });
  });
});
