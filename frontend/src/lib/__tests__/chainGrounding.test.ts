// RC3-ET1a — event-anchored transmission-chain gating (view model).
//
// A transmission chain may display ONLY when at least one of its company
// exposure-target nodes matches a directly resolved entity of the same event
// (MarketEvent.companies_direct — resolver-named from the event's own text, a
// strict subset of `companies`, which also carries theme-injected assets).
// Ungrounded chains fall to the EXISTING honest fallback; nothing is
// reselected, reordered, or shortened. Passing the gate is minimum direct
// anchoring, not full-chain causal validation.
//
// Fixture provenance: the "retained-record analogue" fixtures reproduce the
// field relationships of persisted production events from
// data/feed_cache/feed_0f875b7be67b.pkl (cycle 2026-07-25T17:26Z) — titles,
// theme linkage, companies vs companies_direct, and persisted
// transmission_chain hops. They are analogues rebuilt for tests, not
// production captures; fixtures marked [SYNTHETIC] are constructed for
// control coverage.

import { describe, expect, it } from "vitest";

import type { Explanation, FeedResponse, MarketEvent, TransmissionHop } from "@/lib/types";
import type { EventDossier } from "@/lib/intel/dossier";
import { buildEventDossier } from "@/lib/intel/dossier";
import { buildEventView, buildWhyCare, buildWhoAffected } from "@/lib/eventView";

function event(over: Partial<MarketEvent> & { id: string }): MarketEvent {
  return {
    title: "", event_type: "single_name", first_seen: "2026-07-25T15:00:00Z", last_updated: "2026-07-25T17:00:00Z",
    corroboration_count: 2, source_count: 2, evidence: [], companies: [], companies_direct: [], industries: [],
    theme_ids: [], confidence: 0, editorial_score: 40, why_it_matters: "", transmission: null, dominant: false,
    developing: false, reporting_period: null, merged_event_ids: [], ...over,
  } as MarketEvent;
}
const hop = (source_uid: string, relationship: string, target_uid: string, source_label: string | null = null): TransmissionHop =>
  ({ source_uid, relationship, target_uid, rel_uid: `rel:${source_uid}|${relationship}|${target_uid}`,
     basis: relationship === "exposed_to" ? "curated_ontology" : "recorded_graph",
     strength: null, confidence: 0.5, source_label });
const feed = (o: Partial<FeedResponse>): FeedResponse => o as FeedResponse;
const view = (o: Partial<FeedResponse>, id: string) => buildEventView(buildEventDossier(id, feed(o)), feed(o))!;

// ── Retained-record analogues (persisted 2026-07-25 cycle) ───────────────────

// COST/"cost" ticker-word collision linked this defense-politics event to the
// consumer-stress theme; chain is the theme's ontology recital, zero
// event-named companies.
const ZELENSKY = event({
  id: "zel1", event_type: "policy",
  title: "Zelensky tries to fix crisis over removal of defence minister",
  theme_ids: ["consumer-stress"],
  companies: ["WMT", "TGT", "HD", "AMZN"], companies_direct: [],
  transmission_chain: [
    hop("theme:ontology:consumer-stress", "correlates", "theme:ontology:treasury-yield-pressure"),
    hop("theme:ontology:consumer-stress", "exposed_to", "company:ticker:AMZN"),
    hop("theme:ontology:consumer-stress", "exposed_to", "company:ticker:HD"),
    hop("theme:ontology:consumer-stress", "exposed_to", "company:ticker:TGT"),
  ],
});

// SO/"so" ticker-word collision linked a wage story to utility-capex-supercycle.
const PAY_RAISES = event({
  id: "pay1", event_type: "market_event",
  title: "Pay raises keep shrinking. Here's how much smaller they'll be next year",
  theme_ids: ["utility-capex-supercycle"],
  companies: ["NEE", "SO", "DUK", "AEP", "XEL"], companies_direct: [],
  transmission_chain: [
    hop("theme:ontology:utility-capex-supercycle", "exposed_to", "company:ticker:AEP"),
    hop("theme:ontology:utility-capex-supercycle", "exposed_to", "company:ticker:DUK"),
    hop("theme:ontology:utility-capex-supercycle", "exposed_to", "company:ticker:NEE"),
  ],
});

// Topical "openai"/"anthropic" mention linked a philanthropy story to
// ai-energy-demand; the AI Capex Supercycle → CEG → EQIX → NEE recital follows.
const AI_PHILANTHROPY = event({
  id: "ipo1", event_type: "market_event",
  title: "Blockbuster I.P.O.s Are Creating New Millionaires. Philanthropies Want a Cut.",
  theme_ids: ["ai-energy-demand", "ai-compute-arms-race"],
  companies: ["NVDA", "CEG", "VST", "NEE", "EQIX", "AVGO", "AMD", "MSFT"], companies_direct: [],
  transmission_chain: [
    hop("driver:ontology:ai-capex-supercycle", "drives", "theme:ontology:ai-energy-demand", "AI Capex Supercycle"),
    hop("theme:ontology:ai-energy-demand", "correlates", "theme:ontology:treasury-yield-pressure"),
    hop("theme:ontology:ai-energy-demand", "exposed_to", "company:ticker:CEG"),
    hop("theme:ontology:ai-energy-demand", "exposed_to", "company:ticker:EQIX"),
    hop("theme:ontology:ai-energy-demand", "exposed_to", "company:ticker:NEE"),
  ],
});

// Circular case: TSLA is resolver-named, but every chain company entered
// event.companies only as a theme-injected asset — the chain and the company
// list overlap without one event-named company in the chain.
const TESLA = event({
  id: "tsla1", event_type: "single_name",
  title: "Tesla Sank 15% on Its Q2 Miss. Wall Street's Average Price Target Fell.",
  theme_ids: ["consumer-stress"],
  companies: ["TSLA", "WMT", "TGT", "HD", "AMZN"], companies_direct: ["TSLA"],
  transmission_chain: [
    hop("theme:ontology:consumer-stress", "correlates", "theme:ontology:treasury-yield-pressure"),
    hop("theme:ontology:consumer-stress", "exposed_to", "company:ticker:AMZN"),
    hop("theme:ontology:consumer-stress", "exposed_to", "company:ticker:HD"),
    hop("theme:ontology:consumer-stress", "exposed_to", "company:ticker:TGT"),
  ],
});

// [SYNTHETIC] fuel-retail M&A analogue of the Essar suspect (not retained):
// energy-theme recital with no event-named company.
const FUEL_MA = event({
  id: "fuel1", event_type: "ma",
  title: "Fuel retailer strikes deal to buy 118 UK petrol stations",
  theme_ids: ["energy-supply"],
  companies: ["XOM", "CVX", "COP", "LNG"], companies_direct: [],
  transmission_chain: [
    hop("driver:ontology:opec-quota", "drives", "theme:ontology:energy-supply", "OPEC+ Quota"),
    hop("theme:ontology:energy-supply", "exposed_to", "company:ticker:COP"),
    hop("theme:ontology:energy-supply", "exposed_to", "company:ticker:CVX"),
    hop("theme:ontology:energy-supply", "exposed_to", "company:ticker:LNG"),
  ],
});

// ── Positive controls: direct target overlap, same machinery ─────────────────

const AI_ROTATION = event({
  id: "rot1", event_type: "single_name",
  title: "Broadcom's AI order sparks rotation as Nvidia slips",
  theme_ids: ["ai-compute-arms-race"],
  companies: ["AVGO", "NVDA", "AMD", "MSFT", "ORCL"], companies_direct: ["AVGO", "NVDA"],
  transmission_chain: [
    hop("driver:ontology:ai-capex-supercycle", "drives", "theme:ontology:ai-compute-arms-race", "AI Capex Supercycle"),
    hop("theme:ontology:ai-compute-arms-race", "exposed_to", "company:ticker:AVGO"),
    hop("theme:ontology:ai-compute-arms-race", "exposed_to", "company:ticker:NVDA"),
    hop("theme:ontology:ai-compute-arms-race", "exposed_to", "company:ticker:AMD"),
  ],
});
const GLP1 = event({
  id: "glp1", event_type: "single_name",
  title: "Lilly and Novo Nordisk extend GLP-1 supply pacts",
  theme_ids: ["glp-1"],
  companies: ["LLY", "NVO", "UNH", "ABBV"], companies_direct: ["LLY", "NVO"],
  transmission_chain: [
    hop("theme:ontology:glp-1", "exposed_to", "company:ticker:LLY"),
    hop("theme:ontology:glp-1", "exposed_to", "company:ticker:NVO"),
    hop("theme:ontology:glp-1", "exposed_to", "company:ticker:ABBV"),
  ],
});
const DEFENSE = event({
  id: "def1", event_type: "policy",
  title: "General Dynamics wins expanded munitions order",
  theme_ids: ["defense"],
  companies: ["GD", "LMT", "NOC", "RTX"], companies_direct: ["GD"],
  transmission_chain: [
    hop("theme:ontology:defense", "exposed_to", "company:ticker:GD"),
    hop("theme:ontology:defense", "exposed_to", "company:ticker:LMT"),
    hop("theme:ontology:defense", "exposed_to", "company:ticker:NOC"),
  ],
});

const noChain = (v: ReturnType<typeof view>) => {
  expect(v.whyInvestorsCare?.chain ?? []).toEqual([]);
  expect(v.whyInvestorsCare?.read ?? "").not.toContain("The connection runs");
  expect(v.watch.join(" ")).not.toContain("Watch whether the link");
};

describe("ungrounded chains are suppressed (retained-record analogues)", () => {
  it("COST/'cost' collision (Zelensky -> consumer-stress): recital suppressed, theme linkage untouched", () => {
    const f = { events: [ZELENSKY] };
    const v = view(f, "zel1");
    noChain(v);
    expect(ZELENSKY.theme_ids).toEqual(["consumer-stress"]);          // bad linkage remains recorded
    expect(ZELENSKY.transmission_chain).toHaveLength(4);              // selection output remains recorded
  });
  it("SO/'so' collision (Pay raises -> utility-capex): recital suppressed", () => {
    noChain(view({ events: [PAY_RAISES] }, "pay1"));
  });
  it("topical AI mention (Philanthropies): AI Capex Supercycle -> CEG/EQIX/NEE recital suppressed", () => {
    noChain(view({ events: [AI_PHILANTHROPY] }, "ipo1"));
  });
  it("[SYNTHETIC] fuel-retail M&A: OPEC+ Quota -> COP/CVX/LNG recital suppressed", () => {
    noChain(view({ events: [FUEL_MA] }, "fuel1"));
  });
  it("circular theme-injected overlap (Tesla): direct company absent from chain -> suppressed", () => {
    const v = view({ events: [TESLA] }, "tsla1");
    noChain(v);
    // the existing fallback still speaks to the event's own named company
    expect(v.whyInvestorsCare?.read).toBe("The market in focus here is TSLA.");
  });
});

describe("fail-closed direct-grounding data", () => {
  it.each([
    ["missing", undefined],
    ["empty", []],
    ["unresolved name (never ticker-matched)", ["Nvidia"]],
  ] as [string, string[] | undefined][])("suppresses when companies_direct is %s", (_label, direct) => {
    const e = event({ id: "fc1", title: "Chipmaker in focus", companies: ["NVDA"],
      companies_direct: direct as string[],
      transmission_chain: [
        hop("driver:ontology:ai-capex-supercycle", "drives", "theme:ontology:t", "AI Capex Supercycle"),
        hop("theme:ontology:t", "exposed_to", "company:ticker:NVDA"),
      ] });
    noChain(view({ events: [e] }, "fc1"));
  });

  it("[SYNTHETIC] macro/theme chain with no company exposure target is suppressed even with direct entities", () => {
    const e = event({ id: "mac1", event_type: "policy", title: "Fresh sanctions land",
      companies: ["XOM"], companies_direct: ["XOM"],
      transmission_chain: [
        hop("driver:ontology:sanctions", "pressures", "driver:ontology:oil-supply", "Sanctions"),
      ] });
    noChain(view({ events: [e] }, "mac1"));
  });
});

describe("no reselection when the selected chain fails the gate", () => {
  it("a lower-ranked grounded alternative chain is NOT promoted", () => {
    const grounded = [hop("theme:ontology:alt", "exposed_to", "company:ticker:TSLA")];
    const explanation = {
      sections: { position: { status: "available", note: "", data: {
        chains: [{ theme_uid: "theme:ontology:consumer-stress", hops: TESLA.transmission_chain },
                 { theme_uid: "theme:ontology:alt", hops: grounded }],
      } } },
    } as unknown as Explanation;
    const dossier: EventDossier = { kind: "event", uid: "event:cluster:tsla1", clusterId: "tsla1",
      found: true, event: TESLA, executive: [], watch: [], explanation };
    const v = buildEventView(dossier, feed({}))!;
    noChain(v);   // chain stays [] — the grounded chains[1] alternative is never promoted
    expect(v.whyInvestorsCare?.read).toBe("The market in focus here is TSLA.");   // existing fallback only
  });
});

describe("positive controls pass unchanged (direct exposure-target overlap)", () => {
  it("AI rotation: AI Capex Supercycle -> AVGO -> NVDA -> AMD preserved exactly", () => {
    const v = view({ events: [AI_ROTATION] }, "rot1");
    expect(v.whyInvestorsCare!.chain.map((c) => c.label)).toEqual(["AI Capex Supercycle", "AVGO", "NVDA", "AMD"]);
    expect(v.whyInvestorsCare!.read).toBe("The connection runs from AI Capex Supercycle to AMD.");
    expect(v.watch).toContain("Watch whether the link between AI Capex Supercycle and AMD persists.");
  });
  it("GLP-1: LLY -> NVO -> ABBV preserved exactly", () => {
    const v = view({ events: [GLP1] }, "glp1");
    expect(v.whyInvestorsCare!.chain.map((c) => c.label)).toEqual(["LLY", "NVO", "ABBV"]);
    expect(v.whyInvestorsCare!.read).toBe("The connection runs from LLY to ABBV.");
  });
  it("Defense: GD -> LMT -> NOC preserved exactly", () => {
    const v = view({ events: [DEFENSE] }, "def1");
    expect(v.whyInvestorsCare!.chain.map((c) => c.label)).toEqual(["GD", "LMT", "NOC"]);
  });
  it("one grounded exposure target suffices; order and length are untouched", () => {
    const v = view({ events: [DEFENSE] }, "def1");
    expect(v.whyInvestorsCare!.chain).toHaveLength(3);   // LMT/NOC recital retained behind the grounded GD
  });
});

describe("payload invariants (the gate reads, never writes)", () => {
  it("events, companies_direct, expanded companies, counts, themes, and hops are byte-identical after gating", () => {
    const f = feed({ events: [ZELENSKY, TESLA, AI_ROTATION] });
    const before = JSON.stringify(f);
    view(f, "zel1"); view(f, "tsla1"); view(f, "rot1");
    buildWhyCare(TESLA, null, buildWhoAffected(TESLA, []));
    expect(JSON.stringify(f)).toBe(before);
  });
});
