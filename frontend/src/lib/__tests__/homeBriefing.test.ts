// homeBriefing — intelligence ATTACHED TO THE LEAD STORY. Verifies the causal read hangs
// off the day's most significant real event (not merely the top-ranked theme), is written
// in real actors, produces an honest forward line, and never attaches interpretation when
// no real event links to it. Zero theme/conviction/lifecycle leak. Pure, node-env.

import { describe, expect, it } from "vitest";

import type { FeedResponse, MarketEvent, ThemeIntelligence } from "@/lib/types";
import { buildHomeBriefing } from "@/lib/homeBriefing";

function theme(over: Partial<ThemeIntelligence> & { id: string; name: string }): ThemeIntelligence {
  return {
    description: "", causal_narrative: "", signal_strength: "medium", confidence: 50,
    momentum_direction: "neutral", related_industries: [], related_assets: [], related_macro_factors: [],
    contributing_cluster_ids: [], contributing_story_count: 0, second_order_effects: [], podcast_topics: [],
    last_updated: "", relationship_weights: {}, confidence_label: "", signal_quality: "developing",
    evidence_count: 0, persistence_score: 0, volatility_score: 0, cross_category_confirmed: false,
    momentum_label: "stable", momentum_delta: 0, persistence_cycles: 0, competition_penalty: 0,
    breadth_score: 0, persistence_days: 0, memory: null,
    ...over,
  } as ThemeIntelligence;
}

function event(id: string, themeId: string, score: number): MarketEvent {
  return {
    id, title: `Event ${id}`, event_type: "macro", first_seen: "", last_updated: "",
    corroboration_count: 2, source_count: 3, evidence: [], companies: [], companies_direct: [],
    industries: [], theme_ids: [themeId], confidence: 0, editorial_score: score, why_it_matters: "",
    transmission: null, dominant: false, developing: false, reporting_period: null, merged_event_ids: [],
  } as MarketEvent;
}

const feed = (themes: ThemeIntelligence[], events?: MarketEvent[]): FeedResponse =>
  ({ theme_intelligence: themes, events } as FeedResponse);

const AI_POWER = theme({
  id: "1", name: "AI Power Demand", related_macro_factors: ["CPI", "Treasury yields"],
  related_industries: ["Semiconductors"], related_assets: ["NVDA"],
  causal_narrative: "Hot inflation is lifting yields and pressuring rate-sensitive names.",
  relationship_weights: {
    Utilities: { weight: 0.8, type: "direct", direction: "positive" },
    Homebuilders: { weight: 0.7, type: "direct", direction: "negative" },
  },
  momentum_direction: "bullish", second_order_effects: ["credit spreads"],
});

describe("Why the lead is moving — attached to the real event", () => {
  it("builds an actor chain (no theme node) with signed benefits / at-risk", () => {
    const vm = buildHomeBriefing(feed([AI_POWER], [event("e1", "1", 100)]));
    expect(vm.why!.chain.map((c) => c.label)).toEqual(["CPI", "Treasury Yields", "Semiconductors", "NVDA"]);
    expect(vm.why!.benefits.map((b) => b.label)).toContain("Utilities");
    expect(vm.why!.atRisk.map((b) => b.label)).toContain("Homebuilders");
    expect(JSON.stringify(vm.why)).not.toContain("AI Power Demand");
  });

  it("anchors to the day's LEAD STORY, not merely the top-ranked theme", () => {
    const topRanked = theme({
      id: "big", name: "Rate Cut Bets", related_industries: ["Banks"], related_assets: ["JPM"],
      causal_narrative: "Easier policy is lifting financials.", breadth_score: 99, evidence_count: 12, persistence_days: 40,
    });
    const leadStory = theme({
      id: "lead", name: "Oil Supply Shock", related_macro_factors: ["OPEC"], related_industries: ["Energy"],
      related_assets: ["XOM"], causal_narrative: "Supply cuts are pushing crude higher.",
    });
    const vm = buildHomeBriefing(feed([topRanked, leadStory], [event("e1", "lead", 100)]));
    expect(vm.why!.subject).toBe("XOM");   // from the lead story's theme, not JPM
  });

  it("attaches NO interpretation when no real event links to a theme (honest)", () => {
    const vm = buildHomeBriefing(feed([AI_POWER]));   // themes exist, but no events
    expect(vm.hasIntelligence).toBe(true);
    expect(vm.why).toBeNull();
    expect(vm.watchLine).toBeNull();
  });
});

describe("What to watch — a single forward line on the lead", () => {
  it("uses a real tension in market nouns when one exists", () => {
    const cooling = theme({ id: "c", name: "Rate Cut Bets", momentum_label: "cooling", related_industries: ["Banks"] });
    const vm = buildHomeBriefing(feed([AI_POWER, cooling], [event("e1", "1", 100)]));
    expect(vm.watchLine).toContain("Can NVDA hold if");
  });

  it("falls back to the lead's next second-order effect", () => {
    const vm = buildHomeBriefing(feed([AI_POWER], [event("e1", "1", 100)]));
    expect(vm.watchLine).toBe("Watch if credit spreads follows.");
  });
});

describe("honesty", () => {
  it("no themes -> honest absence", () => {
    const vm = buildHomeBriefing(feed([]));
    expect(vm.hasIntelligence).toBe(false);
    expect(vm.why).toBeNull();
    expect(vm.watchLine).toBeNull();
  });

  it("exposes no engine vocabulary in the view-model", () => {
    const vm = buildHomeBriefing(feed([AI_POWER], [event("e1", "1", 100)]));
    const json = JSON.stringify(vm).toLowerCase();
    for (const banned of ["theme", "conviction", "lifecycle", "importance"]) {
      expect(json, `leaked "${banned}"`).not.toContain(banned);
    }
  });
});
