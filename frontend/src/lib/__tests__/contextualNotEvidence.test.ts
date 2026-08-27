/**
 * RC2-L2 — semantic hardening: contextual and provenance relations are
 * inadmissible by RULING, not by accident.
 *
 * The RC2-L2 diagnosis concluded that the canonical Event layer contains no
 * independent thesis-bearing observation:
 *
 *   names        - direct involvement/attribution, not support
 *   mentions     - contextual coverage, already E3-excluded
 *   evidenced_by - provenance, and self-evidence if admitted
 *   supports     - a DUPLICATE Event->Theme form of the Story->Theme support
 *                  already admitted, both derived from the same theme
 *                  `contributing_cluster_ids` entry for the same cluster
 *
 * Event corroboration/source counts establish that an event OCCURRED. They say
 * nothing about whether it supports or contradicts a thesis, and `MarketEvent`
 * carries no directional field.
 *
 * So Event nodes stay excluded. This slice does NOT lift that exclusion — it
 * removes the layer's reliance on it. Today `names` and `evidenced_by` are
 * protected only by the Event-neighbour skip; both are unclassified and would
 * therefore fall through to polarity +1 the moment that skip moved. Simulated
 * before this change, on a fixture with corroboration 3:
 *
 *   lift skip entirely           -> 4 new items, 2 SILENT FALL-THROUGHS
 *   lift skip + keep E3/L1 rules -> 3 new items, STILL 2 SILENT FALL-THROUGHS
 *
 * That second line is the trap this slice closes: the intuitive fix does not
 * work. The L1 rule carries forward — unclassified does not mean positive.
 *
 * Deliberately NOT ruled here, and reported as open ledger items:
 *   depends_on  - inert (no producer), but it is the converse of `supplies`,
 *                 which IS classified thesis-bearing. Ruling it without that
 *                 analysis would encode an inconsistency.
 *   transacted / has_market_metric / has_financial_metric - LIVE. Written by
 *                 observationGraphBridge on every provision, unclassified, and
 *                 blocked by nothing. Excluding them would change product
 *                 output, so it cannot ride a zero-output hardening slice.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { intelligenceGraph as G } from "../intelligenceGraph";
import { ingestThemes, ingestStories, ingestEvents, ingestMA } from "../intelligenceGraphAdapters";
import { evaluateEvidenceForNode } from "../evidenceEngine";
import { predictThemeTrajectory } from "../predictionEngine";

const theme = () => ({
  id: "t1", name: "AI Compute", description: "d", signal_strength: "strong", confidence: 70,
  momentum_direction: "bullish", related_industries: ["Semiconductors"], related_assets: [],
  related_macro_factors: [], contributing_cluster_ids: ["c1"], contributing_story_count: 2,
  second_order_effects: [], podcast_topics: [], last_updated: "2026-08-26T00:00:00Z",
  momentum_delta: 12,
}) as never;

/** cluster id "c1" — the Story aliases it, and the Event's `id` matches it. */
const story = () => ({
  id: "c1", primary: { id: "c1", title: "Nvidia cuts datacenter guidance", url: "https://x/c1",
    source: "Reuters", category: "Markets", published: "1h ago", signal_score: 80,
    signal_strength: "strong", affected_entities: ["NVDA"], summary: "", why_it_matters: "",
    impact: "", snippet: "" },
  related: [], cluster_score: 0.9, theme_label: "AI Compute", story_count: 1,
}) as never;

const event = () => ({
  id: "c1", uid: "ev_01", title: "Nvidia cuts datacenter guidance",
  event_type: "single_name", first_seen: "2026-08-26T00:00:00Z",
  last_updated: "2026-08-26T00:00:00Z",
  corroboration_count: 3, source_count: 3,
  evidence: [{ source: "Reuters", title: "t", url: "u", published: null, tier: 1,
               kind: "news", qualified: true }],
  companies: ["NVDA", "AMD"], companies_direct: ["NVDA"],
  industries: ["Semiconductors"], theme_ids: ["t1"], confidence: 70, editorial_score: 80,
  why_it_matters: "", transmission: null, dominant: true, developing: false,
  reporting_period: null, merged_event_ids: [],
}) as never;

/** Production argument order: (events, explanations, themes). */
const ingestAll = () => {
  ingestThemes([theme()]);
  ingestStories([story()], [theme()]);
  ingestEvents([event()], {}, [theme()]);
};

const eventNode = () => G.allNodes().find(n => n.type === "Event")!;
const edgesOfEvent = () => G.getRelationships(eventNode().id);
const relOf = (verb: string) => edgesOfEvent().find(e => e.relationshipType === verb);
const companyEv = (ticker: string) => {
  const n = G.allNodes().find(x => x.type === "Company" && x.label === ticker)!;
  return evaluateEvidenceForNode(n.id);
};

beforeEach(() => G.clear());

// ── names: attribution stays attribution ────────────────────────────────────

describe("names is involvement, not support", () => {
  beforeEach(ingestAll);

  it("the edge exists", () => {
    expect(relOf("names")).toBeTruthy();
  });

  it("the edge is traversable from the Event", () => {
    expect(G.getNeighbors(eventNode().id).length).toBeGreaterThan(0);
  });

  it("the directly-named company gains no evidence", () => {
    const e = companyEv("NVDA");
    expect(e.supportingEvidence).toHaveLength(0);
    expect(e.contradictingEvidence).toHaveLength(0);
    expect(e.verdict).toBe("insufficient_signal");
    expect(e.overallTrust).toBe(0);
  });

  it("it is inadmissible by RULING, not only by the Event skip", () => {
    // The edge is rejected on its verb alone — re-anchored on a non-Event
    // source so the node-type skip cannot be what produces the result.
    G.clear();
    const a = G.addNode({ label: "AAA", type: "Company", aliases: ["AAA"], sources: ["Feed" as never] }).id;
    const b = G.addNode({ label: "BBB", type: "Company", aliases: ["BBB"], sources: ["Feed" as never] }).id;
    G.addRelationship({ source: a, target: b, relationshipType: "names",
      strength: 80, confidence: 80, evidenceCount: 1, originatingPages: ["Feed" as never] });
    expect(evaluateEvidenceForNode(b).supportingEvidence).toHaveLength(0);
    expect(evaluateEvidenceForNode(b).verdict).toBe("insufficient_signal");
  });
});

// ── evidenced_by: provenance never becomes corroboration ────────────────────

describe("evidenced_by is provenance, not corroboration", () => {
  beforeEach(ingestAll);

  it("the edge exists", () => {
    expect(relOf("evidenced_by")).toBeTruthy();
  });

  it("it points at the Story built from the same cluster id", () => {
    const edge = relOf("evidenced_by")!;
    const target = G.getNode(edge.target)!;
    expect(target.type).toBe("Story");
    // Same cluster: the Event's id and the Story's alias are both "c1".
    expect(eventNode().metadata?.cluster_id).toBe("c1");
  });

  it("no Story->Event->Story loop can form", () => {
    const storyNode = G.allNodes().find(n => n.type === "Story")!;
    const items = evaluateEvidenceForNode(storyNode.id).supportingEvidence;
    expect(items.some(i => i.relationship === "evidenced_by")).toBe(false);
    expect(items.some(i => i.type === "Event")).toBe(false);
  });

  it("it is inadmissible by RULING, not only by the Event skip", () => {
    G.clear();
    const s = G.addNode({ label: "SSS", type: "Story", aliases: ["SSS"], sources: ["Feed" as never],
      metadata: { source: "Reuters" } }).id;
    const c = G.addNode({ label: "CCC", type: "Company", aliases: ["CCC"], sources: ["Feed" as never] }).id;
    G.addRelationship({ source: c, target: s, relationshipType: "evidenced_by",
      strength: 80, confidence: 80, evidenceCount: 1, originatingPages: ["Feed" as never] });
    expect(evaluateEvidenceForNode(c).supportingEvidence).toHaveLength(0);
    expect(evaluateEvidenceForNode(s).supportingEvidence).toHaveLength(0);
  });
});

// ── The Event->Theme duplicate stays inert ──────────────────────────────────

describe("the Event->Theme supports duplicate does not double-count", () => {
  beforeEach(ingestAll);

  it("both edges exist — Story->Theme and Event->Theme", () => {
    const themeNode = G.allNodes().find(n => n.type === "Theme")!;
    const supports = G.getRelationships(themeNode.id).filter(e => e.relationshipType === "supports");
    const sourceTypes = supports.map(e => G.getNode(e.source)?.type);
    expect(sourceTypes).toContain("Story");
    expect(sourceTypes).toContain("Event");
  });

  it("the theme's evidence counts the Story support once, and not the Event's", () => {
    // Both derive from the SAME theme.contributing_cluster_ids entry for the
    // same cluster. Admitting the Event form would double-count one observation
    // and inflate independentSources. The Event exclusion keeps it inert.
    const themeNode = G.allNodes().find(n => n.type === "Theme")!;
    const items = evaluateEvidenceForNode(themeNode.id).supportingEvidence;
    expect(items.some(i => i.type === "Event")).toBe(false);
    expect(items.filter(i => i.relationship === "supports")).toHaveLength(1);
  });

  it("theme trust is identical with and without the Event ingested", () => {
    const themeNode = G.allNodes().find(n => n.type === "Theme")!;
    const withEvent = evaluateEvidenceForNode(themeNode.id).overallTrust;
    G.clear();
    ingestThemes([theme()]);
    ingestStories([story()], [theme()]);
    const withoutEvent = evaluateEvidenceForNode(
      G.allNodes().find(n => n.type === "Theme")!.id).overallTrust;
    expect(withEvent).toBe(withoutEvent);
  });
});

// ── Corroboration is existence, not thesis support ──────────────────────────

describe("Event corroboration counts create no thesis evidence", () => {
  it("corroboration 3 does not lift any company or theme", () => {
    ingestAll();
    expect(companyEv("NVDA").overallTrust).toBe(0);
    expect(companyEv("AMD").overallTrust).toBe(0);
  });

  it("raising corroboration changes nothing downstream", () => {
    ingestThemes([theme()]);
    ingestStories([story()], [theme()]);
    ingestEvents([{ ...(event() as object), corroboration_count: 9, source_count: 9 } as never], {}, [theme()]);
    const themeNode = G.allNodes().find(n => n.type === "Theme")!;
    const highTrust = evaluateEvidenceForNode(themeNode.id).overallTrust;
    G.clear();
    ingestAll();
    expect(evaluateEvidenceForNode(
      G.allNodes().find(n => n.type === "Theme")!.id).overallTrust).toBe(highTrust);
    expect(companyEv("NVDA").overallTrust).toBe(0);
  });
});

// ── Nothing contextual reaches sourceBreakdown ──────────────────────────────

describe("no contextual or provenance relation enters sourceBreakdown", () => {
  it("across a fully populated graph", () => {
    ingestAll();
    ingestMA([{ id: "d1", title: "A to buy B", url: "u", source: "Reuters", published: "1h ago",
      entities: ["MSFT", "WDAY"], dealType: "strategic", sector: "Software", peFirm: null,
      signalScore: 80, summary: "", whyItMatters: "" } as never], [theme()]);
    const banned = new Set(["mentions", "acquires", "names", "evidenced_by", "belongs_to"]);
    for (const n of G.allNodes()) {
      const e = evaluateEvidenceForNode(n.id);
      for (const i of e.supportingEvidence) expect(banned.has(i.relationship)).toBe(false);
      for (const i of e.contradictingEvidence) expect(banned.has(i.relationship)).toBe(false);
      // sourceBreakdown is built from `supporting` only, so it inherits the rule.
      expect((e.sourceBreakdown ?? []).length).toBeLessThanOrEqual(e.supportingEvidence.length);
    }
  });
});

// ── Genuine support and parallel-edge integrity ─────────────────────────────

describe("genuine support survives", () => {
  it("Story->Theme supports remains admissible", () => {
    ingestAll();
    const themeNode = G.allNodes().find(n => n.type === "Theme")!;
    const e = evaluateEvidenceForNode(themeNode.id);
    expect(e.supportingEvidence.some(i => i.relationship === "supports" && i.type === "Story")).toBe(true);
    expect(e.verdict).not.toBe("insufficient_signal");
    expect(e.overallTrust).toBeGreaterThan(0);
  });

  it("the theme remains forecastable", () => {
    ingestAll();
    expect(predictThemeTrajectory(G.allNodes().find(n => n.type === "Theme")!.id)
      .predictedDirection).not.toBe("insufficient_signal");
  });

  it("parallel contextual + genuine support keeps the support", () => {
    // ingestStories writes `mentions` before `supports` for the same pair — the
    // RC2-E3 masking case. Re-pinned with the L2 exclusions layered on.
    ingestAll();
    const themeNode = G.allNodes().find(n => n.type === "Theme")!;
    const rels = G.getRelationships(themeNode.id);
    expect(rels.some(e => e.relationshipType === "mentions")).toBe(true);
    expect(rels.some(e => e.relationshipType === "supports")).toBe(true);
    expect(evaluateEvidenceForNode(themeNode.id).supportingEvidence.length).toBeGreaterThan(0);
  });
});

// ── Prior contracts unchanged ───────────────────────────────────────────────

describe("E3, L1 and G5 contracts are unchanged", () => {
  beforeEach(ingestAll);

  it("RC2-E3: mentions is still 0 evidence", () => {
    expect(companyEv("AMD").supportingEvidence).toHaveLength(0);
  });

  it("RC2-L1: acquires is still 0 evidence", () => {
    ingestMA([{ id: "d1", title: "A to buy B", url: "u", source: "Reuters", published: "1h ago",
      entities: ["MSFT", "WDAY"], dealType: "strategic", sector: "Software", peFirm: null,
      signalScore: 80, summary: "", whyItMatters: "" } as never], []);
    expect(companyEv("WDAY").supportingEvidence).toHaveLength(0);
    expect(companyEv("WDAY").overallTrust).toBe(0);
  });

  it("RC2-G5: belongs_to is still never evidence", () => {
    for (const n of G.allNodes()) {
      expect(evaluateEvidenceForNode(n.id).supportingEvidence
        .some(i => i.relationship === "belongs_to")).toBe(false);
    }
  });

  it("the Event-node exclusion is still in force", () => {
    // L2 is defence-in-depth BESIDE this skip, not a replacement for it.
    for (const n of G.allNodes()) {
      expect(evaluateEvidenceForNode(n.id).supportingEvidence
        .some(i => i.type === "Event")).toBe(false);
    }
  });
});
