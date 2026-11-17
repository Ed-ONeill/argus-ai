import { describe, expect, it } from "vitest";
import { enrichDeal, buildLeagueTables } from "../maIntelligence";
import { inferDealType, type MADeal } from "@/hooks/useMAIntelligence";
import { eventSubjectTicker } from "../eventSubject";
import { buildIndustryCardView } from "../industryCardView";
import { INDUSTRIES, getIndustrySignals, getIndustryIntelligence, filterIndustryClusters } from "../industryConfig";
import type { MarketEvent, SectorIntelligence, IndustrySignal } from "../types";

const deal = (title: string, entities: string[] = [], summary = "") => enrichDeal({
  id: "audit", title, entities, summary, dealType: inferDealType(title, false),
  sector: "Other", peFirm: null, signalScore: 50, url: "", source: "test", published: "", whyItMatters: "",
} as MADeal);

describe("production-shaped transaction controls", () => {
  it("never assigns Chevron/Blackstone transaction roles from mention order", () => {
    for (const names of [["BX", "CVX"], ["CVX", "BX"]]) {
      expect(deal("Chevron nears $5bn deal for Blackstone-backed oil producer in US Gulf", names))
        .toMatchObject({ buyer: null, target: null, status: "Negotiating" });
    }
  });
  it("retains explicit acquisition roles", () => {
    expect(deal("Microsoft buys Activision for $69bn", ["ATVI", "MSFT"]))
      .toMatchObject({ buyer: "Microsoft", target: "Activision", status: "Announced" });
  });
  it("does not invent an acquirer in an equal merger", () => {
    expect(deal("Alpha merges with Beta", ["A", "B"]).buyer).toBeNull();
  });
  it.each(["CVC seeks to exit near-€3bn Irca deal with Advent", "CVC plans to back out of Italian deal with Advent"])("preserves withdrawal uncertainty: %s", title => {
    expect(deal(title, [], "The parties signed a deal last year.").status).toBe("Withdrawal reported");
  });
  it("does not promote filing metadata into a signed acquisition", () => {
    const v = deal("APO 8-K — Entry into a Material Definitive Agreement", ["APO"]);
    expect(v.status).toBe("Not established");
    expect(v.timeline).toEqual([]);
  });
  it("does not infer all historical milestones from a current review", () => {
    expect(deal("Regulatory review of Alpha acquisition").timeline).toEqual([
      { stage: "Regulatory Review", done: false, current: true },
    ]);
  });
  it("does not classify SpaceX as a SPAC", () => {
    expect(inferDealType("SpaceX acquires a supplier", false)).toBe("strategic");
    expect(inferDealType("SPAC merger approved", false)).toBe("spac");
  });
  it("does not interpret eye disease as a rumored bid", () => {
    expect(deal("Johnson & Johnson buys eye disease biotech for up to $3.3bn").status).toBe("Announced");
    expect(deal("Alpha eyes acquisition of Beta").status).toBe("Rumored");
  });
  it("retains a stated closing stage and abstains on a denied agreement", () => {
    expect(deal("Alpha acquisition nears closing").status).toBe("Closing");
    expect(deal("Alpha says acquisition not yet completed").status).toBe("Not established");
  });
  it("does not promote a generic business description into a named target", () => {
    expect(deal("Johnson & Johnson buys eye disease biotech for up to $3.3bn"))
      .toMatchObject({ buyer: "Johnson & Johnson", target: null });
  });
  it("requires the competing bidder role to bind to the named firm", () => {
    expect(deal("Chevron nears deal for Blackstone-backed producer", [], "Other suitors are interested.").competingBidders).toEqual([]);
    expect(deal("Alpha buys Beta", [], "Apollo made a rival bid.").competingBidders).toEqual(["Apollo"]);
  });
  it("does not turn generated implications into reported transaction facts", () => {
    const v = enrichDeal({ title: "Alpha buys Beta", summary: "", entities: [], dealType: "strategic", peFirm: null,
      whyItMatters: "Apollo made a rival bid; bankruptcy could drive distressed acquisitions." } as unknown as MADeal);
    expect(v.competingBidders).toEqual([]);
    expect(v.rationale).toBe("Rationale not established");
  });
  it("keeps report counts without presenting overlapping or mixed-currency amounts as deployed capital", () => {
    const v = buildLeagueTables([
      { title: "Blackstone UK report mentions $5bn", summary: "", peFirm: "Blackstone", sector: "Other", dealType: "sponsor" },
      { title: "Blackstone report mentions €5bn", summary: "", peFirm: "Blackstone", sector: "Other", dealType: "sponsor" },
    ] as MADeal[]);
    expect(v.sponsors[0]).toMatchObject({ deals: 2, capital: null, avgSize: null });
    expect(v.sectorHeat[0]).toMatchObject({ deals: 2, capital: null, avgSize: null, crossBorderPct: 0 });
  });
});

describe("event subject controls", () => {
  const subject = (title: string, companies_direct: string[]) => eventSubjectTicker({ title, companies_direct } as MarketEvent);
  it("selects Disney regardless of comparison-company ordering", () => {
    expect(subject("Disney Profit Beats With Marvel Films Powering Streaming", ["NFLX", "DIS"])).toBe("DIS");
  });
  it("abstains when two named companies have no resolved roles", () => {
    expect(subject("Disney and Netflix earnings compared", ["NFLX", "DIS"])).toBeNull();
  });
  it("does not introduce a headline company absent from resolved entities", () => {
    expect(subject("Disney earnings", [])).toBeNull();
  });
});

describe("industry specificity controls", () => {
  it("does not give crypto the entire Technology sector score", () => {
    const industry = INDUSTRIES.find(i => i.name === "Crypto & Digital Assets")!;
    const sector = { name: "Technology", signal_score: 100, signal_count: 23 } as SectorIntelligence;
    const v = buildIndustryCardView({ industry, sectorData: sector, industrySignal: null, topTheme: null, themeSignal: null });
    expect(v.score).toBeNull();
    expect(v.storyLabel).toBe("23 sector stories");
    expect(v.intelligenceText).toContain("not an industry-specific assessment");
    const signal = { name: "AI compute demand", sector: "Technology", signal_score: 100 } as IndustrySignal;
    expect(getIndustrySignals(industry, [signal])).toEqual([]);
    expect(getIndustryIntelligence(industry, [sector], [signal])).toBeNull();
    expect(filterIndustryClusters(industry, [{ primary: { affected_entities: ["NVDA"], title: "Nvidia AI chip orders" }, cluster_score: 80 } as never])).toEqual([]);
  });
});
