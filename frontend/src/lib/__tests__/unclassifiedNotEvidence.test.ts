/**
 * RC2-FT — an unclassified relationship is not evidence.
 *
 * The engine's architectural default was `NEGATIVE_REL.has(rel) ? -1 : 1`:
 * anything not explicitly negative became positive thesis support. Every
 * exclusion slice so far existed because some verb fell through that default —
 *
 *   E3  mentions                        coverage      -> moderate / trust ~50
 *   L1  acquires                        involvement   -> both deal parties ~46
 *   L2  names, evidenced_by             attribution,
 *                                       provenance    -> latent behind the Event skip
 *   L3  transacted, has_*_metric        attachment    -> insider SELL read as
 *                                                        support; opposite price
 *                                                        moves indistinguishable
 *   N1  affects                         involvement   -> a KILLED megadeal
 *                                                        supported its sector and
 *                                                        resurrected a sector
 *                                                        forward at confidence 51
 *
 * Each was the same bug wearing a different verb. This slice closes the class:
 * admission now requires EXPLICIT membership in POSITIVE_REL or NEGATIVE_REL, so
 * a new verb cannot acquire positive thesis meaning merely by existing.
 *
 * ZERO live output delta. Measured on a populated fixture (18 nodes, 32 edges,
 * spanning themes / stories / Listen / M&A / Events) the before and after dumps
 * are byte-identical: items, polarity, trust, verdicts, sourceBreakdown,
 * forecasts, forwards and node/edge counts. Every verb admissible today is
 * already classified; the set of relationships both admissible and unclassified
 * is empty.
 *
 * The exclusion sets remain LOAD-BEARING and must not be deleted: `mentions`
 * (E3) and `affects` (N1) are IN POSITIVE_REL, so a positive allowlist alone
 * would re-admit them. That is pinned below.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { intelligenceGraph as G } from "../intelligenceGraph";
import { ingestThemes, ingestStories, ingestMA } from "../intelligenceGraphAdapters";
import { evaluateEvidenceForNode } from "../evidenceEngine";

const theme = () => ({
  id: "t1", name: "AI Compute", description: "d", signal_strength: "strong", confidence: 70,
  momentum_direction: "bullish", related_industries: ["Semiconductors"], related_assets: [],
  related_macro_factors: [], contributing_cluster_ids: ["c1"], contributing_story_count: 2,
  second_order_effects: [], podcast_topics: [], last_updated: "2026-08-31T00:00:00Z",
  momentum_delta: 12,
}) as never;

const story = () => ({
  id: "c1", primary: { id: "c1", title: "Chip demand surges", url: "https://x/c1",
    source: "Reuters", category: "Markets", published: "1h ago", signal_score: 80,
    signal_strength: "strong", affected_entities: ["NVDA"], summary: "", why_it_matters: "",
    impact: "", snippet: "" },
  related: [], cluster_score: 0.9, theme_label: "AI Compute", story_count: 1,
}) as never;

/** Two plain Company nodes joined by one explicit verb — the minimal probe. */
function pair(rel: string): { a: string; b: string } {
  const a = G.addNode({ label: "AAA", type: "Company", aliases: ["AAA"],
    sources: ["Feed" as never], metadata: { source: "Reuters" } }).id;
  const b = G.addNode({ label: "BBB", type: "Company", aliases: ["BBB"],
    sources: ["Feed" as never], metadata: { source: "Reuters" } }).id;
  G.addRelationship({ source: a, target: b, relationshipType: rel,
    strength: 80, confidence: 80, evidenceCount: 1, originatingPages: ["Feed" as never] });
  return { a, b };
}
const itemsOn = (id: string) => {
  const e = evaluateEvidenceForNode(id);
  return [...e.supportingEvidence, ...e.contradictingEvidence];
};

beforeEach(() => G.clear());

// ── Explicitly classified verbs keep their polarity ─────────────────────────

describe("classified relationships are unchanged", () => {
  for (const rel of ["supports", "drives", "raises_demand_for", "owns", "correlates"]) {
    it(`${rel} is admitted at +1`, () => {
      const { b } = pair(rel);
      const items = itemsOn(b);
      expect(items).toHaveLength(1);
      expect(items[0].relationship).toBe(rel);
      expect(items[0].polarity).toBe(1);
    });
  }

  it("weakens is admitted at -1", () => {
    const { b } = pair("weakens");
    const e = evaluateEvidenceForNode(b);
    expect(e.contradictingEvidence).toHaveLength(1);
    expect(e.contradictingEvidence[0].polarity).toBe(-1);
    expect(e.supportingEvidence).toHaveLength(0);
  });
});

// ── Latent classified verbs retain their intended behaviour ─────────────────

describe("latent classified relationships keep their meaning", () => {
  // No producer writes these today, but they are deliberately classified. If a
  // producer ever appears they must behave as declared, not be silently dropped.
  it("supplies would be positive", () => {
    const { b } = pair("supplies");
    const items = itemsOn(b);
    expect(items).toHaveLength(1);
    expect(items[0].polarity).toBe(1);
  });

  for (const rel of ["competes_with", "reduces_supply_of"]) {
    it(`${rel} would be negative`, () => {
      const { b } = pair(rel);
      const e = evaluateEvidenceForNode(b);
      expect(e.contradictingEvidence).toHaveLength(1);
      expect(e.contradictingEvidence[0].polarity).toBe(-1);
      expect(e.supportingEvidence).toHaveLength(0);
    });
  }
});

// ── The new contract ────────────────────────────────────────────────────────

describe("unclassified relationships are inadmissible", () => {
  it("a novel verb nobody has classified contributes nothing", () => {
    const { b } = pair("influences_somehow");
    const e = evaluateEvidenceForNode(b);
    expect(e.supportingEvidence).toHaveLength(0);
    expect(e.contradictingEvidence).toHaveLength(0);
    expect(e.verdict).toBe("insufficient_signal");
    expect(e.overallTrust).toBe(0);
    expect(e.sourceBreakdown ?? []).toHaveLength(0);
  });

  it("the edge is still in the graph and traversable", () => {
    const { b } = pair("influences_somehow");
    expect(G.getRelationships(b).some(r => r.relationshipType === "influences_somehow")).toBe(true);
    expect(G.getNeighbors(b).length).toBeGreaterThan(0);
  });

  it("depends_on is inadmissible", () => {
    // Ruled by this slice. It is unclassified and has no producer; it must be
    // classified before it can be evidence.
    const { b } = pair("depends_on");
    expect(itemsOn(b)).toHaveLength(0);
    expect(evaluateEvidenceForNode(b).verdict).toBe("insufficient_signal");
  });

  it("an unclassified verb never becomes positive by default", () => {
    for (const rel of ["depends_on", "influences_somehow", "relates_to", "x"]) {
      G.clear();
      const { b } = pair(rel);
      expect(itemsOn(b).some(i => i.polarity === 1)).toBe(false);
      expect(evaluateEvidenceForNode(b).overallTrust).toBe(0);
    }
  });
});

// ── The exclusion sets remain load-bearing ──────────────────────────────────

describe("membership in POSITIVE_REL is necessary but NOT sufficient", () => {
  it("mentions stays inadmissible despite being in POSITIVE_REL", () => {
    const { b } = pair("mentions");
    expect(itemsOn(b)).toHaveLength(0);
    expect(evaluateEvidenceForNode(b).overallTrust).toBe(0);
  });

  it("affects stays inadmissible despite being in POSITIVE_REL", () => {
    const { b } = pair("affects");
    expect(itemsOn(b)).toHaveLength(0);
    expect(evaluateEvidenceForNode(b).overallTrust).toBe(0);
  });

  for (const rel of ["acquires", "names", "evidenced_by", "transacted",
                     "has_market_metric", "has_financial_metric", "belongs_to"]) {
    it(`${rel} remains inadmissible`, () => {
      const { b } = pair(rel);
      expect(itemsOn(b)).toHaveLength(0);
    });
  }
});

// ── Parallel-edge integrity ─────────────────────────────────────────────────

describe("a rejected unclassified edge cannot mask a legitimate one", () => {
  const both = (first: string, second: string) => {
    const a = G.addNode({ label: "AAA", type: "Company", aliases: ["AAA"],
      sources: ["Feed" as never], metadata: { source: "Reuters" } }).id;
    const b = G.addNode({ label: "BBB", type: "Company", aliases: ["BBB"],
      sources: ["Feed" as never], metadata: { source: "Reuters" } }).id;
    for (const rel of [first, second]) {
      G.addRelationship({ source: a, target: b, relationshipType: rel,
        strength: 80, confidence: 80, evidenceCount: 1, originatingPages: ["Feed" as never] });
    }
    return b;
  };

  it("an unclassified edge written FIRST does not hide a supports edge", () => {
    const b = both("influences_somehow", "supports");
    const items = itemsOn(b);
    expect(items).toHaveLength(1);
    expect(items[0].relationship).toBe("supports");
    expect(items[0].polarity).toBe(1);
  });

  it("an unclassified edge written FIRST does not hide a weakens edge", () => {
    const b = both("influences_somehow", "weakens");
    const e = evaluateEvidenceForNode(b);
    expect(e.contradictingEvidence).toHaveLength(1);
    expect(e.contradictingEvidence[0].relationship).toBe("weakens");
  });

  it("selection walks the full relationship set, not collapsed getNeighbors", () => {
    // getNeighbors keeps one entry per neighbour (first edge wins). If the
    // engine filtered that output, the whole neighbour would vanish with its
    // genuine edge.
    const b = both("depends_on", "supports");
    expect(G.getRelationships(b).map(r => r.relationshipType))
      .toEqual(["depends_on", "supports"]);
    expect(itemsOn(b).map(i => i.relationship)).toEqual(["supports"]);
  });
});

// ── Prior contracts unchanged on a real graph ───────────────────────────────

describe("E1, E3, G5, L1, L2, L3 and N1 remain green", () => {
  beforeEach(() => {
    ingestThemes([theme()]);
    ingestStories([story()], [theme()]);
    ingestMA([{ id: "d1", title: "Acquirer to buy Target", url: "u", source: "Reuters",
      published: "1h ago", entities: ["MSFT", "WDAY"], dealType: "strategic",
      sector: "Technology", peFirm: null, signalScore: 80, summary: "",
      whyItMatters: "" } as never], [theme()]);
  });

  it("only classified, non-excluded relations are admitted anywhere", () => {
    const allowed = new Set(["supports", "drives", "raises_demand_for", "supplies",
                             "owns", "correlates", "weakens", "reduces_supply_of",
                             "competes_with"]);
    for (const n of G.allNodes()) {
      const e = evaluateEvidenceForNode(n.id);
      for (const i of [...e.supportingEvidence, ...e.contradictingEvidence]) {
        expect(allowed.has(i.relationship)).toBe(true);
        expect(Math.abs(i.polarity)).toBe(1);
      }
    }
  });

  it("RC2-E1: the ontology-only theme edges are still inadmissible", () => {
    const ind = G.allNodes().find(x => x.type === "Industry")!;
    expect(evaluateEvidenceForNode(ind.id).supportingEvidence).toHaveLength(0);
  });

  it("the theme keeps its real observed support", () => {
    const t = G.getNode("AI Compute")!;
    const e = evaluateEvidenceForNode(t.id);
    expect(e.supportingEvidence.some(i => i.relationship === "supports")).toBe(true);
    expect(e.overallTrust).toBeGreaterThan(0);
  });
});
