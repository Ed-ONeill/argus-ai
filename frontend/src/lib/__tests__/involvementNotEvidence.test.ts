/**
 * RC2-L1 — M&A involvement is not thesis corroboration.
 *
 * `acquires` is the remaining half of the contract breach RC2-E3 fixed.
 * `maIntel.ts` — the M&A surface's own classifier — files this exact edge under
 * MENTIONS, not SUPPORTS, and its code implements that: `NEG_REL_RE` ->
 * CONTRADICTS, `SUP_REL_RE` -> SUPPORTS, everything else -> MENTIONS.
 * `acquires` matches neither regex.
 *
 * `evidenceEngine` disagreed by ACCIDENT rather than by classification:
 * `acquires` is in neither POSITIVE_REL nor NEGATIVE_REL, and polarity is
 * assigned `NEGATIVE_REL.has(...) ? -1 : 1`, so it fell through to +1.
 *
 * Measured before this change:
 *   MSFT --acquires--> WDAY   both endpoints: verdict moderate, trust 46, 1 item
 *   KKR  --acquires--> WDAY   target: verdict moderate, trust 51, 1 item
 *   item detail: relationship=acquires polarity=1 reliability=40 sourceName=null
 *
 * The edge is broader than "an acquisition": roles are POSITIONAL
 * (`companies[0]` acquires `companies[1]`, the order of `affected_entities`),
 * `dealType` is never consulted so `rumored`/`withdrawn` write the identical
 * edge, and strength/confidence carry the feed item's `signalScore` rather than
 * any deal property. It records that two parties co-occur in an M&A story. That
 * is involvement.
 *
 * The edge is NOT removed. It stays in the graph and remains available to the
 * M&A relationship map, the transmission graph and the debug reports. It simply
 * carries no thesis authority.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { intelligenceGraph as G } from "../intelligenceGraph";
import { ingestMA, ingestThemes, ingestStories } from "../intelligenceGraphAdapters";
import { evaluateEvidenceForNode } from "../evidenceEngine";
import { predictCompanyTrajectory, predictThemeTrajectory } from "../predictionEngine";
import { buildIntelligenceProfile } from "../intelligenceProfile";

const theme = (name = "AI Compute", id = "t") => ({
  id, name, description: "d", signal_strength: "strong", confidence: 70,
  momentum_direction: "bullish", related_industries: ["Semiconductors"],
  related_assets: [], related_macro_factors: [], contributing_cluster_ids: ["c1"],
  contributing_story_count: 2, second_order_effects: [], podcast_topics: [],
  last_updated: "2026-08-25T00:00:00Z", momentum_delta: 12,
}) as never;

const story = (id: string, title: string, entities: string[]) => ({
  id, primary: { id, title, url: `https://x/${id}`, source: "Reuters", category: "Markets",
    published: "1h ago", signal_score: 80, signal_strength: "strong",
    affected_entities: entities, summary: "", why_it_matters: "", impact: "", snippet: "" },
  related: [], cluster_score: 0.9, theme_label: title, story_count: 1,
}) as never;

/** Exactly the shape `toMADeal` emits from an M&A-category FeedItem. */
const deal = (entities: string[], peFirm: string | null, dealType = "strategic") => ({
  id: "d1", title: "Acquirer to buy Target", url: "https://x/d1", source: "Reuters",
  published: "1h ago", entities, dealType, sector: "Software", peFirm,
  signalScore: 80, summary: "s", whyItMatters: "w",
}) as never;

const ev = (label: string) => evaluateEvidenceForNode(G.getNode(label)!.id);
const edgesOf = (label: string) => G.getRelationships(G.getNode(label)!.id);

beforeEach(() => G.clear());

// ── The reproduced defect, now neutral ──────────────────────────────────────

describe("an acquires-only company has no evidentiary authority", () => {
  beforeEach(() => { ingestMA([deal(["MSFT", "WDAY"], null)], []); });

  it("the edge exists in the graph", () => {
    expect(edgesOf("WDAY").some(e => e.relationshipType === "acquires")).toBe(true);
  });

  it("the edge is traversable", () => {
    expect(G.getNeighbors(G.getNode("WDAY")!.id).length).toBeGreaterThan(0);
  });

  it("no evidence items are produced", () => {
    expect(ev("WDAY").supportingEvidence).toHaveLength(0);
  });

  it("sourceBreakdown is empty", () => {
    // Before L1 a deal party was counted as an independent source via the
    // `type:M&A` fallback, because its evidence item had sourceName: null.
    expect(ev("WDAY").sourceBreakdown ?? []).toHaveLength(0);
  });

  it("the verdict is insufficient_signal", () => {
    expect(ev("WDAY").verdict).toBe("insufficient_signal");
  });

  it("overallTrust is 0", () => {
    expect(ev("WDAY").overallTrust).toBe(0);
  });

  it("no contradicting item is manufactured either", () => {
    // Neutral means absent, not negative.
    expect(ev("WDAY").contradictingEvidence).toHaveLength(0);
  });
});

// ── Both endpoints, separately ──────────────────────────────────────────────

describe("acquirer and target are both neutral", () => {
  beforeEach(() => { ingestMA([deal(["MSFT", "WDAY"], null)], []); });

  it("the acquirer receives no thesis evidence", () => {
    // Measured before L1: trust 46, verdict moderate.
    const e = ev("MSFT");
    expect(e.supportingEvidence).toHaveLength(0);
    expect(e.verdict).toBe("insufficient_signal");
    expect(e.overallTrust).toBe(0);
  });

  it("the target receives no thesis evidence", () => {
    const e = ev("WDAY");
    expect(e.supportingEvidence).toHaveLength(0);
    expect(e.verdict).toBe("insufficient_signal");
    expect(e.overallTrust).toBe(0);
  });

  it("graph direction is still preserved — the edge records who acquires whom", () => {
    // L1 removes evidentiary authority, not the recorded fact.
    const edge = edgesOf("WDAY").find(e => e.relationshipType === "acquires")!;
    expect(G.getNode(edge.source)?.label).toBe("MSFT");
    expect(G.getNode(edge.target)?.label).toBe("WDAY");
  });
});

// ── The sponsor path ────────────────────────────────────────────────────────

describe("the sponsor case behaves identically", () => {
  beforeEach(() => { ingestMA([deal(["WDAY"], "KKR", "sponsor")], []); });

  it("Fund -> acquires -> Company remains graph structure", () => {
    const edge = edgesOf("WDAY").find(e => e.relationshipType === "acquires");
    expect(edge).toBeTruthy();
    expect(G.getNode(edge!.source)?.type).toBe("Fund");
  });

  it("the target receives no thesis evidence from it", () => {
    // Measured before L1: trust 51, verdict moderate.
    const e = ev("WDAY");
    expect(e.supportingEvidence).toHaveLength(0);
    expect(e.verdict).toBe("insufficient_signal");
    expect(e.overallTrust).toBe(0);
  });
});

// ── Deal state cannot buy authority ─────────────────────────────────────────

describe("deal state and type do not change admissibility", () => {
  // `dealType` is never consulted at the link site, so every state writes the
  // identical edge. None of them may carry thesis authority.
  for (const dealType of ["strategic", "sponsor", "merger", "rumored", "withdrawn", "spac"]) {
    it(`${dealType} remains contextual only`, () => {
      G.clear();
      ingestMA([deal(["MSFT", "WDAY"], null, dealType)], []);
      const e = ev("WDAY");
      expect(e.supportingEvidence).toHaveLength(0);
      expect(e.overallTrust).toBe(0);
      expect(e.verdict).toBe("insufficient_signal");
      expect(edgesOf("WDAY").some(x => x.relationshipType === "acquires")).toBe(true);
    });
  }
});

// ── Parallel-edge integrity (the E3 masking case, re-pinned) ────────────────

describe("a genuine supports edge survives alongside an acquires edge", () => {
  beforeEach(() => {
    ingestThemes([theme()]);
    ingestStories([story("c1", "AI compute demand surges", ["NVDA"])], [theme()]);
    ingestMA([deal(["MSFT", "WDAY"], null)], [theme()]);
  });

  it("the theme keeps its observed support", () => {
    const e = ev("AI Compute");
    expect(e.supportingEvidence.length).toBeGreaterThan(0);
    expect(e.verdict).not.toBe("insufficient_signal");
    expect(e.overallTrust).toBeGreaterThan(0);
  });

  it("every admitted item is a supporting relation — never acquires, never mentions", () => {
    for (const n of G.allNodes()) {
      const items = evaluateEvidenceForNode(n.id).supportingEvidence;
      expect(items.some(i => i.relationship === "acquires")).toBe(false);
      expect(items.some(i => i.relationship === "mentions")).toBe(false);
    }
  });

  it("the theme's trust is unchanged by the presence of the deal", () => {
    const withDeal = ev("AI Compute").overallTrust;
    G.clear();
    ingestThemes([theme()]);
    ingestStories([story("c1", "AI compute demand surges", ["NVDA"])], [theme()]);
    expect(ev("AI Compute").overallTrust).toBe(withDeal);
  });

  it("a node carrying BOTH acquires and a real supports keeps the support", () => {
    // The E3 defect was filtering `getNeighbors` output, which discarded the
    // whole neighbour and took its genuine `supports` with it. The walk keeps
    // the first ADMISSIBLE edge per neighbour, so this must still hold.
    G.clear();
    ingestThemes([theme()]);
    ingestStories([story("c1", "AI compute demand surges", ["NVDA"])], [theme()]);
    ingestMA([deal(["NVDA", "WDAY"], null)], [theme()]);
    const themeEv = ev("AI Compute");
    expect(themeEv.supportingEvidence.some(i => i.relationship === "supports")).toBe(true);
    // NVDA is an acquires endpoint and still gains nothing from it.
    expect(ev("NVDA").supportingEvidence.some(i => i.relationship === "acquires")).toBe(false);
  });
});

// ── M&A / transmission consumers are unaffected ─────────────────────────────

describe("M&A relationship and transmission consumers still see acquires", () => {
  beforeEach(() => { ingestMA([deal(["MSFT", "WDAY"], null)], []); });

  it("the edge is enumerable from the graph", () => {
    expect(G.allEdges().filter(e => e.relationshipType === "acquires")).toHaveLength(1);
  });

  it("it carries its M&A provenance", () => {
    const edge = G.allEdges().find(e => e.relationshipType === "acquires")!;
    expect(edge.originatingPages).toContain("M&A");
  });

  it("the Deal node and its mentions edges are untouched", () => {
    const dealNode = G.allNodes().find(n => n.type === "Deal");
    expect(dealNode).toBeTruthy();
    expect(edgesOf("WDAY").some(e => e.relationshipType === "mentions")).toBe(true);
  });

  it("neighbours remain reachable for transmission/context", () => {
    expect(G.getNeighbors(G.getNode("MSFT")!.id).length).toBeGreaterThan(0);
  });
});

// ── Forecast / profile behaviour is unchanged from pre-L1 ───────────────────

describe("no forecast is manufactured or removed", () => {
  it("the deal-only company still has no forecast and no forward view", () => {
    // Pre-L1 these were already found=false / forward=null. L1 must not change
    // them in either direction.
    ingestMA([deal(["MSFT", "WDAY"], null)], []);
    for (const label of ["MSFT", "WDAY"]) {
      expect(predictCompanyTrajectory(G.getNode(label)!.id).found).toBe(false);
      expect(buildIntelligenceProfile(label, { kindHint: "company" as never })
        .thesis.data?.forward ?? null).toBeNull();
    }
  });

  it("a theme with real support is still forecastable", () => {
    ingestThemes([theme()]);
    ingestStories([story("c1", "AI compute demand surges", ["NVDA"])], [theme()]);
    ingestMA([deal(["MSFT", "WDAY"], null)], [theme()]);
    expect(predictThemeTrajectory(G.getNode("AI Compute")!.id).predictedDirection)
      .not.toBe("insufficient_signal");
  });
});

// ── Prior contracts unchanged ───────────────────────────────────────────────

describe("E1, E3 and G5 contracts are unchanged", () => {
  it("RC2-G5: belongs_to is still never evidence", () => {
    ingestThemes([theme()]);
    ingestStories([story("c1", "AI demand", ["NVDA"])], [theme()]);
    for (const n of G.allNodes()) {
      expect(evaluateEvidenceForNode(n.id).supportingEvidence
        .some(i => i.relationship === "belongs_to")).toBe(false);
    }
  });

  it("RC2-E1: ontology-only backing is still inadmissible", () => {
    ingestThemes([theme()]);
    expect(ev("AI Compute").verdict).toBe("insufficient_signal");
  });

  it("RC2-E3: mentions are still inadmissible", () => {
    ingestStories([story("c1", "Nvidia in focus", ["NVDA"])], []);
    expect(ev("NVDA").supportingEvidence).toHaveLength(0);
  });

  it("RC2-E1: observed provenance still admits a real supports edge", () => {
    ingestThemes([theme()]);
    ingestStories([story("c1", "AI demand", ["NVDA"])], [theme()]);
    expect(ev("AI Compute").supportingEvidence.length).toBeGreaterThan(0);
  });
});
