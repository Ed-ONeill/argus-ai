// eventView — the Event surface (Surface #3) translation: the engine-worded event record
// becomes the plain "Why did this happen?" grammar. Verifies the event-local hero layout
// (chart / balanced / explanation — NOT the frozen global HeroMode set), the six sections,
// the hard directional-evidence rule for beneficiaries/losers, honest omission, and that NO
// engine vocabulary survives. Built through the real buildEventDossier. Pure, node-env.

import { describe, expect, it } from "vitest";

import type { Explanation, FeedResponse, MarketEvent, ThemeIntelligence, ThemeRelationship } from "@/lib/types";
import type { EventDossier } from "@/lib/intel/dossier";
import { buildEventDossier } from "@/lib/intel/dossier";
import { buildEventView, buildHero, buildWhoAffected } from "@/lib/eventView";

function theme(over: Partial<ThemeIntelligence> & { id: string; name: string }): ThemeIntelligence {
  return {
    description: "", causal_narrative: "", signal_strength: "medium", confidence: 50,
    momentum_direction: "neutral", related_industries: [], related_assets: [], related_macro_factors: [],
    contributing_cluster_ids: [], contributing_story_count: 0, second_order_effects: [], podcast_topics: [],
    last_updated: "", relationship_weights: {}, confidence_label: "", signal_quality: "developing",
    evidence_count: 0, persistence_score: 0, volatility_score: 0, cross_category_confirmed: false,
    momentum_label: "stable", momentum_delta: 0, persistence_cycles: 0, competition_penalty: 0,
    breadth_score: 0, ...over,
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
const rel = (weight: number, direction: ThemeRelationship["direction"]): ThemeRelationship => ({ weight, type: "direct", direction });
const feed = (o: Partial<FeedResponse>): FeedResponse => o as FeedResponse;
const ev = (o: Partial<FeedResponse>, id: string) => buildEventView(buildEventDossier(id, feed(o)), feed(o))!;

const wire = (source: string, title: string, url: string) =>
  ({ source, title, url, published: "2026-08-06T10:00:00Z", tier: 1, kind: "news" as const, qualified: true });

// ── Company earnings: chart-dominant, own ticker, real causal chain ──
const EARN = event({
  id: "e1", event_type: "earnings", title: "NVIDIA beats on data-center demand",
  companies: ["NVDA"], companies_direct: ["NVDA"], industries: ["Semiconductors"], theme_ids: ["t1"],
  why_it_matters: "Data-center orders are surging into year-end.",
  evidence: [wire("Reuters", "Nvidia tops estimates", "https://x.co/1"), wire("Bloomberg", "Chip demand accelerates", "https://x.co/2")],
  transmission_chain: [{ source_uid: "driver:ai-demand", relationship: "drives", target_uid: "company:nvda", rel_uid: "r1", basis: "recorded_graph", strength: 0.8, confidence: 0.7, source_label: "AI demand" }],
});
const AI = theme({ id: "t1", name: "AI Infrastructure", related_industries: ["Semiconductors"] });

describe("hero (primary visualization descriptor)", () => {
  it("company events resolve to a dominant price chart on the company itself", () => {
    const v = ev({ theme_intelligence: [AI], events: [EARN] }, "e1");
    expect(v.hero.visualization).toMatchObject({ kind: "price-chart", prominence: "dominant", symbol: "NVDA", representative: false });
    expect(v.hero.typeTag).toBe("Earnings");
  });

  it("broad-market events resolve to a balanced chart on a labeled representative index", () => {
    const v = ev({ events: [event({ id: "m1", event_type: "market_event", title: "Stocks slide as risk appetite fades" })] }, "m1");
    expect(v.hero.visualization).toMatchObject({ kind: "price-chart", prominence: "balanced", symbol: "SPY", representative: true, representativeOf: "the S&P 500" });
  });

  it("macro/policy events take a supporting proxy chart ONLY when one clearly resolves, else none", () => {
    const withProxy = ev({ events: [event({ id: "p1", event_type: "macro", title: "Fed holds rates steady", why_it_matters: "Policymakers signaled patience on cuts." })] }, "p1");
    expect(withProxy.hero.visualization).toMatchObject({ kind: "price-chart", prominence: "supporting", symbol: "TLT", representative: true, representativeOf: "Treasuries" });

    const noProxy = ev({ events: [event({ id: "p2", event_type: "policy", title: "Antitrust review announced by regulators" })] }, "p2");
    expect(noProxy.hero.visualization).toEqual({ kind: "none" });   // no visualization invented when nothing clearly represents it
  });
});

describe("what changed (the hero's plain summary)", () => {
  it("re-voices plainly from the record", () => {
    expect(ev({ events: [EARN] }, "e1").hero.summary).toBe("Data-center orders are surging into year-end.");
  });
  it("omits the line when the only summary carries internal vocabulary", () => {
    const v = ev({ events: [event({ id: "x", why_it_matters: "Conviction on the AI thesis rose beyond the deadband." })] }, "x");
    expect(v.hero.summary).toBeNull();
  });
});

describe("pure builders compose in isolation", () => {
  it("each section builder is callable on its own inputs, no orchestrator needed", () => {
    expect(buildHero(EARN).visualization).toMatchObject({ kind: "price-chart", symbol: "NVDA" });
    const who = buildWhoAffected(EARN, [AI]);
    expect(who.companies.map((c) => c.label)).toContain("NVDA");
    expect(who.industries.map((c) => c.label)).toContain("Semiconductors");
  });
});

describe("evidence", () => {
  it("lists the real sources and counts, else is honestly absent", () => {
    const v = ev({ events: [EARN] }, "e1");
    expect(v.evidence!.items.map((i) => i.source)).toEqual(["Reuters", "Bloomberg"]);
    expect(v.evidence!.sourceCount).toBe(4);
    expect(ev({ events: [event({ id: "bare", evidence: [] })] }, "bare").evidence).toBeNull();
  });
});

describe("why investors care", () => {
  it("reads the causal chain as market actors, never a theme node", () => {
    const v = ev({ theme_intelligence: [AI], events: [EARN] }, "e1");
    expect(v.whyInvestorsCare!.chain.map((c) => c.label)).toEqual(["AI demand", "NVDA"]);
    expect(v.whyInvestorsCare!.read).toBe("The connection runs from AI demand to NVDA.");
  });
  it("drops theme nodes out of the actor chain", () => {
    const v = ev({ events: [event({ id: "c", companies_direct: ["JPM"], transmission_chain: [
      { source_uid: "driver:fed", relationship: "drives", target_uid: "theme:rates", rel_uid: "r", basis: "recorded_graph", strength: null, confidence: null, source_label: "the Fed" },
      { source_uid: "theme:rates", relationship: "pressures", target_uid: "company:jpm", rel_uid: "r2", basis: "recorded_graph", strength: null, confidence: null, source_label: null },
    ] })] }, "c");
    expect(v.whyInvestorsCare!.chain.map((c) => c.label)).toEqual(["the Fed", "JPM"]);
  });
  it("is null when there is neither a chain nor anything affected", () => {
    expect(ev({ events: [event({ id: "n", event_type: "policy", title: "Antitrust review announced" })] }, "n").whyInvestorsCare).toBeNull();
  });
});

describe("who's affected (hard directional-evidence rule)", () => {
  const SIGNED = theme({ id: "t2", name: "Rate cuts", relationship_weights: { Homebuilders: rel(0.8, "positive"), Banks: rel(0.6, "negative") } });
  const CUT = event({ id: "e2", event_type: "macro", title: "Fed signals a rate cut", theme_ids: ["t2"], companies_direct: ["XHB"], industries: ["Homebuilding"] });

  it("populates beneficiaries/losers ONLY from signed relationship evidence", () => {
    const v = ev({ theme_intelligence: [SIGNED], events: [CUT] }, "e2");
    expect(v.whoAffected.directional).toBe(true);
    expect(v.whoAffected.beneficiaries.map((c) => c.label)).toEqual(["Homebuilders"]);
    expect(v.whoAffected.losers.map((c) => c.label)).toEqual(["Banks"]);
  });
  it("never infers a winner/loser without signed evidence — falls back to neutral groups", () => {
    const v = ev({ theme_intelligence: [theme({ id: "t3", name: "unsigned" })], events: [event({ id: "e3", event_type: "macro", title: "CPI comes in hot", theme_ids: ["t3"], industries: ["Retail"] })] }, "e3");
    expect(v.whoAffected.directional).toBe(false);
    expect(v.whoAffected.beneficiaries).toEqual([]);
    expect(v.whoAffected.losers).toEqual([]);
    expect(v.whoAffected.industries.map((c) => c.label)).toContain("Retail");
    expect(v.whoAffected.markets.map((c) => c.label)).toContain("Treasuries");   // CPI -> representative market
  });
});

describe("the other side (only when a credible one exists)", () => {
  const dossierWith = (items: unknown[]): EventDossier => ({
    kind: "event", uid: "event:cluster:e1", clusterId: "e1", found: true, event: EARN, executive: [], watch: [],
    explanation: { sections: { counter: { status: "available", note: "", data: { searched: [], items } } } } as unknown as Explanation,
  });

  it("re-voices recorded pressures plainly, dropping edge ids and theme names", () => {
    const v = buildEventView(dossierWith([{ kind: "recorded_pressure", source_label: "China", theme: "AI Infrastructure", basis: "recorded_graph" }]), feed({}))!;
    expect(v.theOtherSide).toEqual(["China could weigh against it."]);
  });
  it("is omitted (null) when the symmetric search found nothing", () => {
    expect(ev({ events: [EARN] }, "e1").theOtherSide).toBeNull();   // no explanation attached -> no other side
  });
});

describe("what to watch", () => {
  it("asks for a second source while developing, and tracks the live chain", () => {
    const v = ev({ events: [event({ ...EARN, id: "d1", developing: true })] }, "d1");
    expect(v.watch[0]).toContain("second independent source");
    expect(v.watch.some((w) => w.includes("AI demand") && w.includes("NVDA"))).toBe(true);
  });
});

describe("copy correctness (F1-F3 regressions)", () => {
  // F1 — a visible sentence is never truncated mid-thought by an abbreviation period or a cap.
  it("keeps a complete sentence containing 'U.S.' instead of cutting at the abbreviation", () => {
    const v = ev({ events: [event({ id: "u", why_it_matters: "A single report says the chipmaker is scouting sites for a third U.S. fab." })] }, "u");
    expect(v.hero.summary).toBe("A single report says the chipmaker is scouting sites for a third U.S. fab.");
  });
  it("still returns only the first complete sentence when several are present", () => {
    const v = ev({ events: [event({ id: "m2", why_it_matters: "Rates held steady. Cuts were pushed out to next year." })] }, "m2");
    expect(v.hero.summary).toBe("Rates held steady.");
  });

  // F2 — no verb is conjugated against a market label; singular and plural both read correctly.
  it("phrases the causal read and watch label-agnostically for a plural subject", () => {
    const v = ev({ events: [event({ id: "s2", event_type: "policy", title: "Fresh sanctions land",
      transmission_chain: [{ source_uid: "driver:sanctions", relationship: "pressures", target_uid: "driver:oil-supply", rel_uid: "r", basis: "recorded_graph", strength: null, confidence: null, source_label: "Sanctions" }] })] }, "s2");
    expect(v.whyInvestorsCare!.read).toBe("The connection runs from Sanctions to Oil supply.");
    expect(v.watch).toContain("Watch whether the link between Sanctions and Oil supply persists.");
    expect([v.whyInvestorsCare!.read, ...v.watch].join(" ")).not.toMatch(/feeds|keeps feeding/);
  });

  // F3 — a label leading a sentence is capitalized for display but preserved verbatim
  // ("the Fed") wherever it is not sentence-initial; the canonical label is never mutated.
  it("capitalizes a label at sentence start without mutating it elsewhere", () => {
    const FED = event({ id: "fed2", event_type: "macro", title: "Fed holds rates steady",
      transmission_chain: [{ source_uid: "driver:fed", relationship: "drives", target_uid: "driver:treasury-yields", rel_uid: "r", basis: "recorded_graph", strength: null, confidence: null, source_label: "the Fed" }] });
    const dossier: EventDossier = {
      kind: "event", uid: "event:cluster:fed2", clusterId: "fed2", found: true, event: FED, executive: [], watch: [],
      explanation: { sections: { counter: { status: "available", note: "", data: { searched: [], items: [{ kind: "recorded_pressure", source_label: "the Fed", theme: "", basis: "recorded_graph" }] } } } } as unknown as Explanation,
    };
    const v = buildEventView(dossier, feed({}))!;
    expect(v.theOtherSide).toEqual(["The Fed could weigh against it."]);                        // sentence-start: capitalized
    expect(v.whyInvestorsCare!.read).toBe("The connection runs from the Fed to Treasury yields.");  // mid-sentence: verbatim
    expect(v.whyInvestorsCare!.chain[0].label).toBe("the Fed");                                 // canonical label untouched
  });
});

describe("honesty & Law 10", () => {
  it("returns null when the event is not in the current cycle or the feed is unreachable", () => {
    expect(buildEventView(null, null)).toBeNull();
    expect(buildEventView(buildEventDossier("missing", feed({ events: [EARN] })), feed({ events: [EARN] }))).toBeNull();
  });
  it("exposes NO engine vocabulary and no theme name anywhere", () => {
    const v = ev({ theme_intelligence: [AI, theme({ id: "t2", name: "Rate cuts", relationship_weights: { Homebuilders: rel(0.8, "positive") } })], events: [EARN] }, "e1");
    const json = JSON.stringify(v).toLowerCase();
    for (const banned of ["conviction", "transmission", "thesis", "theses", "ledger", "momentum", "regime", "deadband", "\"theme\"", "signal_quality"]) {
      expect(json, `leaked ${banned}`).not.toContain(banned);
    }
    expect(json).not.toContain("ai infrastructure");   // theme names never surface
  });
});
