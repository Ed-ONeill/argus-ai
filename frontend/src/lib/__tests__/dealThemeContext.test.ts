/**
 * RC2-R1 — M&A sector/asset overlap is CONTEXT, not thesis support.
 *
 * `ingestMA` emitted `Deal --supports--> Theme` whenever
 * `hitsSector || hitsAsset` — and `maIntel.ts`, the M&A surface's OWN contract,
 * already said that must not happen, verbatim:
 *
 *     CONTEXT - sector/keyword-level overlap only
 *     A deal in the same sector is NOT automatically support; a headline
 *     keyword is NOT evidence (89.x pins it).
 *
 * The violation was also circular: maIntel classified a deal as SUPPORTS by
 * finding a supporting-type edge that this producer had just created from
 * overlap.
 *
 * Neither input carries direction:
 *   hitsSector  `d.sector` is `inferSector`, an UNANCHORED headline regex.
 *               "/ai/" matches retail, Airlines, Chairman, Spain, raised,
 *               remains, maintenance, email; "/gas/" matches Vegas; "/bank/"
 *               matches Burbank — and Technology is tested first, so all of
 *               those become "Technology". (inferSector's repair is a separate
 *               ledger item and is NOT in scope here.)
 *   hitsAsset   `d.entities` is RC2-A `resolve_entities(title + snippet)` —
 *               companies NAMED in the text. It cannot distinguish acquirer,
 *               target, rumored bidder, a party walking away, or an incidental
 *               comparison.
 *
 * No M&A field reaches directional authority: `dealType` is a headline regex
 * over KIND, `signalScore` is feed relevance, `summary`/`whyItMatters` are LLM
 * prose the IRE-1 contract excludes, and `FeedItem.impact` is LLM-derived and is
 * not carried onto MADeal at all.
 *
 * MEASURED BEFORE THIS CHANGE — a theme whose only link was an overlapping deal:
 *
 *   items=1  moderate  trust=52  direction=strengthening  conf=52  forward=PRESENT
 *
 * identically for ALL SIX deal types including `withdrawn`. On a theme that
 * already had genuine story support it inflated trust 53 -> 67.
 *
 * AFTER: the edge is RETYPED to `mentions`, not deleted. It stays in the graph
 * with its M&A provenance for navigation, transmission and maIntel's own
 * CONTEXT/MENTIONS classification; RC2-E3 already bars `mentions` from thesis
 * evidence. No new verb, no directional heuristic.
 *
 * This is a real production-output REDUCTION.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { intelligenceGraph as G } from "../intelligenceGraph";
import { ingestThemes, ingestStories, ingestMA } from "../intelligenceGraphAdapters";
import { evaluateEvidenceForNode } from "../evidenceEngine";
import { predictThemeTrajectory } from "../predictionEngine";
import { buildIntelligenceProfile } from "../intelligenceProfile";
import { buildMAIntel } from "../maIntel";
import type { ThemeIntelligence } from "../types";

const theme = () => ({
  id: "t1", name: "AI Compute", description: "d", signal_strength: "strong", confidence: 70,
  momentum_direction: "bullish", related_industries: ["Technology"], related_assets: ["NVDA"],
  related_macro_factors: [], contributing_cluster_ids: ["c1"], contributing_story_count: 1,
  second_order_effects: [], podcast_topics: [], last_updated: "2026-09-01T00:00:00Z",
  momentum_delta: 12,
}) as unknown as ThemeIntelligence;

const story = () => ({
  id: "c1", primary: { id: "c1", title: "Chip demand surges", url: "https://x/c1",
    source: "Reuters", category: "Markets", published: "1h ago", signal_score: 80,
    signal_strength: "strong", affected_entities: ["NVDA"], summary: "", why_it_matters: "",
    impact: "", snippet: "" },
  related: [], cluster_score: 0.9, theme_label: "AI Compute", story_count: 1,
}) as never;

const deal = (o: Record<string, unknown> = {}) => ({
  id: "d1", title: String(o.title ?? "Acquirer to buy Target"), url: "u", source: "Reuters",
  published: "1h ago", entities: (o.entities ?? ["NVDA"]) as string[],
  dealType: String(o.dealType ?? "strategic"), sector: String(o.sector ?? "Technology"),
  peFirm: null, signalScore: 80, summary: "", whyItMatters: "",
}) as never;

const T = () => G.getNode("AI Compute")!;
const themeEv = () => evaluateEvidenceForNode(T().id);
const themeFwd = () =>
  buildIntelligenceProfile("AI Compute", { kindHint: "theme" as never }).thesis.data?.forward ?? null;
const dealThemeEdges = () =>
  G.getRelationships(T().id).filter(e => G.getNode(e.source)?.type === "Deal");

beforeEach(() => G.clear());

// ── The edge survives, retyped ──────────────────────────────────────────────

describe("the Deal->Theme edge is retyped, not deleted", () => {
  beforeEach(() => { ingestThemes([theme()]); ingestMA([deal()], [theme()]); });

  it("the edge is present", () => {
    expect(dealThemeEdges()).toHaveLength(1);
  });

  it("its relationship is mentions, never supports", () => {
    expect(dealThemeEdges()[0].relationshipType).toBe("mentions");
    expect(dealThemeEdges().some(e => e.relationshipType === "supports")).toBe(false);
  });

  it("M&A provenance is preserved", () => {
    expect(dealThemeEdges()[0].originatingPages).toContain("M&A");
  });

  it("it remains traversable for graph/context use", () => {
    expect(G.getNeighbors(T().id).some(x => x.node.type === "Deal")).toBe(true);
  });

  it("strength still carries the deal's signalScore", () => {
    // Retyping must not alter the recorded edge weights.
    expect(dealThemeEdges()[0].strength).toBe(80);
  });
});

// ── Zero thesis evidence, by every route into the condition ─────────────────

describe("overlap contributes zero thesis evidence", () => {
  const cases: [string, never][] = [
    ["hitsSector only", deal({ sector: "Technology", entities: ["MSFT"] })],
    ["hitsAsset only",  deal({ sector: "Other", entities: ["NVDA"] })],
    ["both",            deal({ sector: "Technology", entities: ["NVDA"] })],
  ];

  for (const [label, d] of cases) {
    it(`${label}: no evidence, no verdict, no trust`, () => {
      ingestThemes([theme()]);
      ingestMA([d], [theme()]);
      const e = themeEv();
      expect(e.supportingEvidence).toHaveLength(0);
      expect(e.contradictingEvidence).toHaveLength(0);
      expect(e.verdict).toBe("insufficient_signal");
      expect(e.overallTrust).toBe(0);
      expect(e.sourceBreakdown ?? []).toHaveLength(0);
    });
  }

  it("neither condition creates no edge at all (unchanged)", () => {
    ingestThemes([theme()]);
    ingestMA([deal({ sector: "Energy", entities: ["XOM"] })], [theme()]);
    expect(dealThemeEdges()).toHaveLength(0);
  });

  it("no forecast and no forward view from overlap alone", () => {
    ingestThemes([theme()]);
    ingestMA([deal()], [theme()]);
    expect(predictThemeTrajectory(T().id).predictedDirection).toBe("insufficient_signal");
    expect(predictThemeTrajectory(T().id).confidence).toBe(0);
    expect(themeFwd()).toBeNull();
  });
});

// ── Deal status is not thesis polarity ──────────────────────────────────────

describe("all deal statuses behave identically", () => {
  for (const dealType of ["strategic", "sponsor", "merger", "rumored", "withdrawn", "spac"]) {
    it(`${dealType} yields no thesis evidence`, () => {
      ingestThemes([theme()]);
      ingestMA([deal({ dealType })], [theme()]);
      const e = themeEv();
      expect(e.supportingEvidence).toHaveLength(0);
      expect(e.overallTrust).toBe(0);
      expect(dealThemeEdges()[0].relationshipType).toBe("mentions");
    });
  }

  it("a WITHDRAWN deal cannot produce a strengthening theme forward", () => {
    // Measured before R1: withdrawn produced direction "strengthening" at
    // confidence 52 with a forward view present.
    ingestThemes([theme()]);
    ingestMA([deal({ dealType: "withdrawn", title: "Chip deal collapses" })], [theme()]);
    expect(predictThemeTrajectory(T().id).predictedDirection).not.toBe("strengthening");
    expect(themeFwd()).toBeNull();
  });
});

// ── Genuine support is untouched, and no longer inflated ────────────────────

describe("genuine Story->Theme support is preserved exactly", () => {
  it("a story-backed theme keeps its evidence and forward view", () => {
    ingestThemes([theme()]);
    ingestStories([story()], [theme()]);
    const e = themeEv();
    expect(e.supportingEvidence.some(i => i.relationship === "supports" && i.type === "Story")).toBe(true);
    expect(e.verdict).not.toBe("insufficient_signal");
    expect(themeFwd()).not.toBeNull();
  });

  it("adding an overlapping deal changes NOTHING about it", () => {
    // Measured before R1: trust and confidence rose 53 -> 67. The deal must now
    // leave the story-only result exactly intact.
    ingestThemes([theme()]);
    ingestStories([story()], [theme()]);
    const before = {
      items: themeEv().supportingEvidence.length,
      trust: themeEv().overallTrust,
      verdict: themeEv().verdict,
      conf: predictThemeTrajectory(T().id).confidence,
    };
    G.clear();
    ingestThemes([theme()]);
    ingestStories([story()], [theme()]);
    ingestMA([deal()], [theme()]);
    expect({
      items: themeEv().supportingEvidence.length,
      trust: themeEv().overallTrust,
      verdict: themeEv().verdict,
      conf: predictThemeTrajectory(T().id).confidence,
    }).toEqual(before);
  });

  it("the forward view survives where genuine evidence exists", () => {
    ingestThemes([theme()]);
    ingestStories([story()], [theme()]);
    ingestMA([deal()], [theme()]);
    expect(themeFwd()).not.toBeNull();
  });
});

// ── Parallel-edge integrity (RC2-E3 behaviour) ──────────────────────────────

describe("the retyped mentions edge cannot mask genuine support", () => {
  it("Story supports and Deal mentions coexist on the same theme", () => {
    ingestThemes([theme()]);
    ingestStories([story()], [theme()]);
    ingestMA([deal()], [theme()]);
    const rels = G.getRelationships(T().id).map(e => e.relationshipType);
    expect(rels).toContain("supports");
    expect(rels).toContain("mentions");
    expect(themeEv().supportingEvidence.some(i => i.relationship === "supports")).toBe(true);
  });

  it("an independent admissible supports edge from another producer survives", () => {
    // A Deal mentions edge on the SAME neighbour pair must not remove a genuine
    // supports edge — the full-relationship-set walk established by RC2-E3.
    ingestThemes([theme()]);
    ingestMA([deal()], [theme()]);
    const dealNode = G.allNodes().find(n => n.type === "Deal")!;
    G.addRelationship({ source: dealNode.id, target: T().id, relationshipType: "supports",
      strength: 70, confidence: 70, evidenceCount: 1, originatingPages: ["Feed" as never] });
    const rels = G.getRelationships(T().id)
      .filter(e => e.source === dealNode.id).map(e => e.relationshipType);
    expect(rels).toEqual(["mentions", "supports"]);
    // mentions is written FIRST; selection must still find the supports edge.
    expect(themeEv().supportingEvidence.some(i => i.relationship === "supports")).toBe(true);
  });
});

// ── The M&A product contract now agrees with ingestion ──────────────────────

describe("maIntel classifies the retyped edge as non-support", () => {
  it("a sector/keyword-overlap deal is not SUPPORTS", () => {
    ingestThemes([theme()]);
    ingestMA([deal()], [theme()]);
    const vm = buildMAIntel({
      deals: [{ id: "d1", title: "Acquirer to buy Target", sector: "Technology",
                entities: ["NVDA"], dealType: "strategic" }] as never,
      themes: [theme()], graphReady: true,
    });
    const rows = vm.deals.data ?? [];
    for (const row of rows) {
      expect(row.relation).not.toBe("SUPPORTS");
      expect(["CONTEXT", "MENTIONS", "UNCLEAR"]).toContain(row.relation);
    }
  });
});

// ── Graph preservation and prior contracts ──────────────────────────────────

describe("graph structure and prior slices are intact", () => {
  it("node and edge counts are unchanged by the retyping", () => {
    // Retyping alters a label, never the topology.
    ingestThemes([theme()]);
    ingestStories([story()], [theme()]);
    ingestMA([deal()], [theme()]);
    expect(G.allNodes().length).toBe(6);
    expect(G.allEdges().length).toBe(9);
  });

  it("RC2-E3: the new mentions edge cannot enter thesis evidence", () => {
    ingestThemes([theme()]);
    ingestMA([deal()], [theme()]);
    for (const n of G.allNodes()) {
      expect(evaluateEvidenceForNode(n.id).supportingEvidence
        .some(i => i.relationship === "mentions")).toBe(false);
    }
  });

  it("the other M&A edges are untouched", () => {
    ingestThemes([theme()]);
    ingestMA([deal({ entities: ["MSFT", "WDAY"] })], [theme()]);
    const all = G.allEdges().map(e => e.relationshipType);
    expect(all).toContain("acquires");   // L1-excluded, still produced
    expect(all).toContain("affects");    // N1-excluded, still produced
  });

  it("no excluded relation appears as evidence anywhere", () => {
    ingestThemes([theme()]);
    ingestStories([story()], [theme()]);
    ingestMA([deal({ entities: ["MSFT", "WDAY"] })], [theme()]);
    const banned = new Set(["mentions", "acquires", "names", "evidenced_by", "belongs_to",
                            "affects", "transacted", "has_market_metric", "has_financial_metric"]);
    for (const n of G.allNodes()) {
      const e = evaluateEvidenceForNode(n.id);
      for (const i of [...e.supportingEvidence, ...e.contradictingEvidence])
        expect(banned.has(i.relationship)).toBe(false);
    }
  });
});
