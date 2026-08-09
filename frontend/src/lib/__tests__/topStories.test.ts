// topStories — the homepage's "what happened", from REAL news. Verifies it prefers
// canonical market events (ranked, corroborated), falls back to the categorized top
// stories, and never invents anything. Pure, node-env.

import { describe, expect, it } from "vitest";

import type { FeedItem, FeedResponse, MarketEvent, TopStories } from "@/lib/types";
import { buildTopStories } from "@/lib/topStories";

function event(over: Partial<MarketEvent> & { id: string }): MarketEvent {
  return {
    title: "", event_type: "macro", first_seen: "2026-08-06T12:00:00Z",
    last_updated: "2026-08-06T13:00:00Z", corroboration_count: 0, source_count: 0, evidence: [],
    companies: [], companies_direct: [], industries: [], theme_ids: [], confidence: 0,
    editorial_score: 0, why_it_matters: "", transmission: null, dominant: false, developing: false,
    reporting_period: null, merged_event_ids: [], ...over,
  } as MarketEvent;
}

function item(id: string, title: string): FeedItem {
  return {
    id, title, url: `https://example.com/${id}`, source: "Reuters", category: "Markets",
    published: "2026-08-06T12:00:00Z", signal_score: 1, signal_strength: "strong",
    affected_entities: [], summary: "", why_it_matters: "", impact: "", snippet: "",
  } as FeedItem;
}

const feed = (over: Partial<FeedResponse>): FeedResponse => over as FeedResponse;

describe("buildTopStories", () => {
  it("prefers canonical events, ranked by editorial score, with real sources", () => {
    const events: MarketEvent[] = [
      event({ id: "e1", title: "Fed holds rates", event_type: "macro", editorial_score: 50, corroboration_count: 3, companies_direct: ["JPM"] }),
      event({ id: "e2", title: "NVIDIA beats and guides higher", event_type: "earnings", editorial_score: 90, corroboration_count: 5, companies_direct: ["NVDA"] }),
    ];
    const ts = buildTopStories(feed({ events }));
    expect(ts.map((s) => s.title)).toEqual(["NVIDIA beats and guides higher", "Fed holds rates"]);
    expect(ts[0]).toMatchObject({ tag: "Earnings", companies: ["NVDA"], sources: 5, href: "/event/e2" });
  });

  it("falls back to categorized top stories when no events are present", () => {
    const top_stories: TopStories = {
      top_macro: item("m", "CPI comes in cooler"), top_single_name: null, top_price_move: null,
      top_deal: null, top_policy_risk: item("p", "New tariff threat"),
    };
    const ts = buildTopStories(feed({ events: [], top_stories }));
    expect(ts.map((s) => s.tag)).toEqual(["Macro", "Policy"]);
    expect(ts[0]).toMatchObject({ title: "CPI comes in cooler", href: "https://example.com/m", sources: null });
  });

  it("returns [] when there is no news at all (honest absence)", () => {
    expect(buildTopStories(undefined)).toEqual([]);
    expect(buildTopStories(feed({ events: [] }))).toEqual([]);
  });
});
