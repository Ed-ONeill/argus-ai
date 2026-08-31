/**
 * RC2-N1 — `affects` is structural/involvement, not directional thesis evidence.
 *
 * Two producers, neither asserting a direction:
 *
 *   Theme --affects--> Industry   declared ontology exposure. Already E1-excluded
 *                                 (ontology-only provenance), and still read by
 *                                 `sectorTaxonomy` to project themes onto sectors.
 *   Deal  --affects--> Sector     "this deal concerns this sector", where the
 *                                 sector came from `inferSector` — a regex sweep
 *                                 over the headline. `dealType` is never
 *                                 consulted, so announced / rumored / withdrawn /
 *                                 completed all write the identical edge.
 *
 * The M&A form carries OBSERVED provenance so E1 never touched it, and `affects`
 * is in POSITIVE_REL — so it was admitted at +1.
 *
 * MEASURED BEFORE THIS CHANGE, from one deal:
 *
 *   Sector "Technology"   items=1  verdict=moderate  trust=51  rels=[affects]
 *   sourceBreakdown       [{ source: "Deal", type: "Deal", count: 1, reliability: 97 }]
 *   sector forward        { direction: "rotating in", confidence: 51,
 *                           reasons: [..., "Cross-source evidence"] }
 *
 * That last line is why N1 matters more than the earlier exclusions: it reached
 * FORECASTS. RC2-E2 blocks only `confidence === 0`, and sector confidence was
 * structurally 0 — until `affects` supplied 51. Excluding it restores E2's
 * intended state rather than adding a new rule.
 *
 * This slice is a REAL PRODUCTION-OUTPUT REDUCTION, not zero-output hardening.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { intelligenceGraph as G } from "../intelligenceGraph";
import { ingestThemes, ingestStories, ingestMA } from "../intelligenceGraphAdapters";
import { evaluateEvidenceForNode } from "../evidenceEngine";
import { predictSectorRotation, predictThemeTrajectory } from "../predictionEngine";
import { buildIntelligenceProfile } from "../intelligenceProfile";
import { sectorExposure } from "../sectorTaxonomy";

const theme = () => ({
  id: "t1", name: "AI Compute", description: "d", signal_strength: "strong", confidence: 70,
  momentum_direction: "bullish", related_industries: ["Semiconductors"], related_assets: [],
  related_macro_factors: [], contributing_cluster_ids: ["c1"], contributing_story_count: 2,
  second_order_effects: [], podcast_topics: [], last_updated: "2026-08-28T00:00:00Z",
  momentum_delta: 12,
}) as never;

const story = () => ({
  id: "c1", primary: { id: "c1", title: "Chip demand surges", url: "https://x/c1",
    source: "Reuters", category: "Markets", published: "1h ago", signal_score: 80,
    signal_strength: "strong", affected_entities: ["NVDA"], summary: "", why_it_matters: "",
    impact: "", snippet: "" },
  related: [], cluster_score: 0.9, theme_label: "AI Compute", story_count: 1,
}) as never;

/** Exactly the shape `toMADeal` emits; `sector` is what `inferSector` returned. */
const deal = (dealType = "strategic", sector = "Technology") => ({
  id: "d1", title: "Acquirer to buy Target", url: "u", source: "Reuters", published: "1h ago",
  entities: ["MSFT", "WDAY"], dealType, sector, peFirm: null, signalScore: 80,
  summary: "", whyItMatters: "",
}) as never;

const sectorNode = () => G.allNodes().find(n => n.type === "Sector" && n.label === "Technology")!;
const sectorEv = () => evaluateEvidenceForNode(sectorNode().id);
const sectorForward = () =>
  buildIntelligenceProfile("Technology", { kindHint: "sector" as never }).thesis.data?.forward ?? null;

beforeEach(() => G.clear());

// ── The measured before/after ───────────────────────────────────────────────

describe("a sector backed only by affects", () => {
  beforeEach(() => { ingestMA([deal()], []); });

  it("the edge is still in the graph", () => {
    const rels = G.getRelationships(sectorNode().id);
    expect(rels.some(e => e.relationshipType === "affects")).toBe(true);
  });

  it("the edge is still traversable", () => {
    expect(G.getNeighbors(sectorNode().id).length).toBeGreaterThan(0);
  });

  it("it carries its M&A provenance unchanged", () => {
    const edge = G.getRelationships(sectorNode().id).find(e => e.relationshipType === "affects")!;
    expect(edge.originatingPages).toContain("M&A");
  });

  it("zero thesis evidence — was 1 item, moderate, trust ~51", () => {
    const e = sectorEv();
    expect(e.supportingEvidence).toHaveLength(0);
    expect(e.contradictingEvidence).toHaveLength(0);
    expect(e.verdict).toBe("insufficient_signal");
    expect(e.overallTrust).toBe(0);
  });

  it("no sourceBreakdown entry — the Deal is no longer a 97-reliability source", () => {
    expect(sectorEv().sourceBreakdown ?? []).toHaveLength(0);
  });

  it("no 'Cross-source evidence' reason from a Deal-only affects case", () => {
    const e = sectorEv();
    const text = JSON.stringify(e.reasoningSteps ?? []);
    expect(text).not.toContain("Cross-source evidence");
    expect(sectorForward()).toBeNull();
  });
});

// ── The E2 boundary is restored ─────────────────────────────────────────────

describe("no sector forward can be resurrected by affects", () => {
  const withThemeAndStory = () => {
    ingestThemes([theme()]);
    ingestStories([story()], [theme()]);
  };

  it("without a deal the sector forward is null (unchanged E2 behaviour)", () => {
    withThemeAndStory();
    expect(predictSectorRotation("Technology").confidence).toBe(0);
    expect(sectorForward()).toBeNull();
  });

  it("WITH a deal the sector forward is STILL null — was PRESENT at confidence 51", () => {
    withThemeAndStory();
    ingestMA([deal()], [theme()]);
    expect(sectorEv().overallTrust).toBe(0);
    expect(predictSectorRotation("Technology").confidence).toBe(0);
    expect(sectorForward()).toBeNull();
  });

  it("adding the deal changes nothing about the sector", () => {
    withThemeAndStory();
    const before = { trust: sectorEv().overallTrust, verdict: sectorEv().verdict,
                     conf: predictSectorRotation("Technology").confidence };
    ingestMA([deal()], [theme()]);
    expect({ trust: sectorEv().overallTrust, verdict: sectorEv().verdict,
             conf: predictSectorRotation("Technology").confidence }).toEqual(before);
  });
});

// ── Deal status cannot buy authority ────────────────────────────────────────

describe("no direction is inferred from deal status", () => {
  for (const dealType of ["strategic", "sponsor", "merger", "rumored", "withdrawn", "spac"]) {
    it(`${dealType} contributes no thesis evidence`, () => {
      G.clear();
      ingestMA([deal(dealType)], []);
      const e = sectorEv();
      expect(e.supportingEvidence).toHaveLength(0);
      expect(e.contradictingEvidence).toHaveLength(0);
      expect(e.overallTrust).toBe(0);
      expect(G.getRelationships(sectorNode().id).some(x => x.relationshipType === "affects")).toBe(true);
    });
  }

  it("the headline-derived sector label is not a thesis either", () => {
    // `inferSector` regex-matched "Technology" out of the title. Whatever it
    // returns, the edge carries no direction.
    G.clear();
    ingestMA([deal("strategic", "Healthcare")], []);
    const s = G.allNodes().find(n => n.type === "Sector" && n.label === "Healthcare")!;
    expect(evaluateEvidenceForNode(s.id).supportingEvidence).toHaveLength(0);
    expect(evaluateEvidenceForNode(s.id).overallTrust).toBe(0);
  });
});

// ── Structural / projection consumers are preserved ─────────────────────────

describe("structural consumers keep working", () => {
  it("sectorTaxonomy still projects themes onto a sector via Theme->affects->Industry", () => {
    ingestThemes([theme()]);
    const carriers = sectorExposure("Technology");
    // Semiconductors belongs_to Technology, and the theme affects Semiconductors.
    expect(carriers.industries).toContain("Semiconductors");
    expect(carriers.themes.map(t => t.label)).toContain("AI Compute");
  });

  it("the Theme->Industry affects edge is present with its ontology provenance", () => {
    ingestThemes([theme()]);
    const ind = G.allNodes().find(n => n.type === "Industry")!;
    const edge = G.getRelationships(ind.id).find(e => e.relationshipType === "affects")!;
    expect(edge).toBeTruthy();
    expect(edge.originatingPages).toEqual(["Theme Intelligence"]);
  });

  it("RC2-E1: Theme->Industry affects remains inadmissible as evidence", () => {
    ingestThemes([theme()]);
    const ind = G.allNodes().find(n => n.type === "Industry")!;
    const e = evaluateEvidenceForNode(ind.id);
    expect(e.supportingEvidence).toHaveLength(0);
    expect(e.verdict).toBe("insufficient_signal");
  });
});

// ── Parallel-edge integrity ─────────────────────────────────────────────────

describe("a genuine supports edge survives beside affects", () => {
  it("the deal's supports->Theme edge is still admitted", () => {
    ingestThemes([theme()]);
    ingestMA([deal("strategic", "Semiconductors")], [theme()]);
    // ingestMA links Deal --supports--> Theme when the deal's sector or assets
    // intersect the theme. That is a real supporting relation and must survive.
    const t = G.getNode("AI Compute")!;
    const items = evaluateEvidenceForNode(t.id).supportingEvidence;
    expect(items.some(i => i.relationship === "supports")).toBe(true);
    expect(items.some(i => i.relationship === "affects")).toBe(false);
  });

  it("selection still walks the full relationship set, not collapsed getNeighbors", () => {
    // The theme carries mentions + supports from the story on the same pair.
    ingestThemes([theme()]);
    ingestStories([story()], [theme()]);
    ingestMA([deal()], [theme()]);
    const t = G.getNode("AI Compute")!;
    const rels = G.getRelationships(t.id).map(r => r.relationshipType);
    expect(rels).toContain("mentions");
    expect(rels).toContain("supports");
    const e = evaluateEvidenceForNode(t.id);
    expect(e.supportingEvidence.some(i => i.relationship === "supports")).toBe(true);
    expect(predictThemeTrajectory(t.id).predictedDirection).not.toBe("insufficient_signal");
  });

  it("no affects appears as evidence anywhere in a populated graph", () => {
    ingestThemes([theme()]);
    ingestStories([story()], [theme()]);
    ingestMA([deal()], [theme()]);
    for (const n of G.allNodes()) {
      const e = evaluateEvidenceForNode(n.id);
      for (const i of [...e.supportingEvidence, ...e.contradictingEvidence])
        expect(i.relationship).not.toBe("affects");
    }
  });
});

// ── Prior contracts unchanged ───────────────────────────────────────────────

describe("E1, E3, L1, L2 and L3 contracts are unchanged", () => {
  beforeEach(() => {
    ingestThemes([theme()]);
    ingestStories([story()], [theme()]);
    ingestMA([deal()], [theme()]);
  });

  it("mentions, acquires, names, evidenced_by and the attachments stay excluded", () => {
    const banned = new Set(["mentions", "acquires", "names", "evidenced_by", "belongs_to",
                            "transacted", "has_market_metric", "has_financial_metric", "affects"]);
    for (const n of G.allNodes()) {
      const e = evaluateEvidenceForNode(n.id);
      for (const i of [...e.supportingEvidence, ...e.contradictingEvidence])
        expect(banned.has(i.relationship)).toBe(false);
    }
  });

  it("the theme still has real observed support and a forecast", () => {
    const t = G.getNode("AI Compute")!;
    expect(evaluateEvidenceForNode(t.id).supportingEvidence.length).toBeGreaterThan(0);
    expect(predictThemeTrajectory(t.id).predictedDirection).not.toBe("insufficient_signal");
  });

  it("depends_on is still untouched and still admissible", () => {
    const a = G.addNode({ label: "AAA", type: "Company", aliases: ["AAA"],
      sources: ["Feed" as never], metadata: { source: "Reuters" } }).id;
    const b = G.addNode({ label: "BBB", type: "Company", aliases: ["BBB"],
      sources: ["Feed" as never], metadata: { source: "Reuters" } }).id;
    G.addRelationship({ source: a, target: b, relationshipType: "depends_on",
      strength: 80, confidence: 80, evidenceCount: 1, originatingPages: ["Feed" as never] });
    expect(evaluateEvidenceForNode(b).supportingEvidence
      .some(i => i.relationship === "depends_on")).toBe(true);
  });
});
