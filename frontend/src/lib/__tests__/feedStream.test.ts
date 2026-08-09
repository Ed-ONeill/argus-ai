// feedStream — the Law-10 editorial Feed. Verifies it teaches only what the Brief did NOT
// show (dedup), organizes around market-concept categories, omits any engine vocabulary
// (Law 10), and is honest when empty. Pure, node-env.

import { describe, expect, it } from "vitest";

import type { FeedItem, FeedResponse, MarketEvent, StoryCluster } from "@/lib/types";
import { buildCardsForEventIds, buildFeedStream, categoriesOf } from "@/lib/feedStream";

function event(over: Partial<MarketEvent> & { id: string }): MarketEvent {
  return {
    title: `Event ${over.id}`, event_type: "macro", first_seen: "2026-08-06T12:00:00Z",
    last_updated: "2026-08-06T13:00:00Z", corroboration_count: 2, source_count: 3, evidence: [],
    companies: [], companies_direct: [], industries: [], theme_ids: [], confidence: 0,
    editorial_score: 0, why_it_matters: "", transmission: null, dominant: false, developing: false,
    reporting_period: null, merged_event_ids: [], ...over,
  } as MarketEvent;
}

function cluster(id: string, title: string, category = "Markets"): StoryCluster {
  const primary = {
    id, title, url: `https://example.com/${id}`, source: "Reuters", category,
    published: "2026-08-06T12:00:00Z", signal_score: 1, signal_strength: "strong",
    affected_entities: [], summary: "", why_it_matters: "", impact: "", snippet: "",
  } as FeedItem;
  return { id, primary, related: [], cluster_score: 1, theme_label: category, story_count: 1 };
}

const feed = (o: Partial<FeedResponse>): FeedResponse => o as FeedResponse;

describe("buildFeedStream", () => {
  it("excludes everything the Brief already shows (only teaches new)", () => {
    // 7 events; the Brief surfaces the top 5 by editorial score, so the Feed shows ranks 6-7.
    const events = Array.from({ length: 7 }, (_, i) =>
      event({ id: `e${i + 1}`, editorial_score: 100 - i * 10, event_type: "single_name", companies_direct: [`T${i}`] }));
    const cards = buildFeedStream(feed({ events }));
    expect(cards.map((c) => c.id)).toEqual(["e6", "e7"]);
    for (const shown of ["e1", "e2", "e3", "e4", "e5"]) {
      expect(cards.find((c) => c.id === shown)).toBeUndefined();
    }
  });

  it("maps event types to market-concept categories", () => {
    const events = [
      event({ id: "co", event_type: "earnings", editorial_score: 5 }),
      event({ id: "ma", event_type: "ma", editorial_score: 4 }),
      event({ id: "mac", event_type: "macro", editorial_score: 3 }),
      event({ id: "pol", event_type: "policy", editorial_score: 2 }),
      event({ id: "px", event_type: "price_echo", editorial_score: 1 }),
    ];
    // With only 5 events, the Brief takes all 5 — add filler so some reach the Feed.
    const filler = Array.from({ length: 5 }, (_, i) => event({ id: `f${i}`, editorial_score: 50 + i }));
    const cards = buildFeedStream(feed({ events: [...filler, ...events] }));
    const by = Object.fromEntries(cards.map((c) => [c.id, c.category]));
    expect(by).toMatchObject({ co: "Company", ma: "M&A", mac: "Macro", pol: "Policy", px: "Markets" });
  });

  it("omits a why-line that carries engine vocabulary (Law 10), keeps a clean one", () => {
    const filler = Array.from({ length: 5 }, (_, i) => event({ id: `f${i}`, editorial_score: 90 + i }));
    const dirty = event({ id: "dirty", editorial_score: 10, why_it_matters: "This theme's conviction is rising fast." });
    const clean = event({ id: "clean", editorial_score: 9, why_it_matters: "Chip demand is surging into year-end." });
    const cards = buildFeedStream(feed({ events: [...filler, dirty, clean] }));
    expect(cards.find((c) => c.id === "dirty")!.why).toBeNull();
    expect(cards.find((c) => c.id === "clean")!.why).toBe("Chip demand is surging into year-end.");
  });

  it("falls back to clustered stories when no canonical events exist", () => {
    const cards = buildFeedStream(feed({ events: [], clusters: [cluster("c1", "Deal announced", "M&A")] }));
    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({ id: "c1", category: "M&A", headline: "Deal announced", href: "https://example.com/c1" });
  });

  it("is empty when there is no news at all (honest absence)", () => {
    expect(buildFeedStream(undefined)).toEqual([]);
    expect(buildFeedStream(feed({ events: [] }))).toEqual([]);
  });

  it("exposes no engine vocabulary anywhere in the cards", () => {
    const events = Array.from({ length: 8 }, (_, i) =>
      event({ id: `e${i}`, editorial_score: 100 - i, event_type: "single_name", companies_direct: ["NVDA"], why_it_matters: "Demand is strong." }));
    const json = JSON.stringify(buildFeedStream(feed({ events }))).toLowerCase();
    for (const banned of ["theme", "conviction", "transmission", "signal", "regime", "node"]) {
      expect(json, `leaked "${banned}"`).not.toContain(banned);
    }
  });
});

describe("buildCardsForEventIds (Landscape focus view)", () => {
  it("returns cards for exactly the requested events, including ones the Brief shows", () => {
    const events = Array.from({ length: 6 }, (_, i) => event({ id: `e${i}`, editorial_score: 100 - i }));
    // e0 is top-ranked (shown in the Brief) — focus still surfaces it (deliberate drill-down).
    const cards = buildCardsForEventIds(feed({ events }), new Set(["e0", "e5"]));
    expect(cards.map((c) => c.id)).toEqual(["e0", "e5"]);
  });

  it("is empty for an empty id set", () => {
    expect(buildCardsForEventIds(feed({ events: [event({ id: "e0" })] }), new Set())).toEqual([]);
  });
});

describe("categoriesOf", () => {
  it("returns the present categories in canonical order", () => {
    const cards = buildFeedStream(feed({
      events: [
        ...Array.from({ length: 5 }, (_, i) => event({ id: `f${i}`, editorial_score: 90 + i })),
        event({ id: "a", event_type: "policy", editorial_score: 3 }),
        event({ id: "b", event_type: "earnings", editorial_score: 2 }),
      ],
    }));
    expect(categoriesOf(cards)).toEqual(["Company", "Policy"]);
  });
});
