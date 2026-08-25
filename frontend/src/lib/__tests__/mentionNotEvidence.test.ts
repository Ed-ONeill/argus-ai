/**
 * RC2-E3 — a mention is coverage, not corroboration.
 *
 * `mentions` means "this source discussed/named this entity". Every production
 * producer uses it that way — Story->Company/Theme (Feed), Event->Company,
 * Podcast->Company/Theme and Person->Theme (Listen), Deal->Company (M&A) — and the
 * codebase says so: `ingestEvents` notes the edge "stays `mentions` (contextual)
 * - never conflated", and ExplorerGraph renders it as "Coverage link: reporting
 * names the entity". `maIntel.ts` and `listenIntel.ts` both implement an explicit
 * SUPPORTS / CONTRADICTS / MENTIONS / CONTEXT model documented "never conflated".
 *
 * `evidenceEngine` was the one place that broke that contract, listing `mentions`
 * in POSITIVE_REL beside `supports` and `drives`. Measured before this change: a
 * single mention of any provenance produced verdict `moderate` with trust ~50
 * (Listen 49, Feed 51, M&A 51), and it defeated the RC2-E1 forecast guard — one
 * mention lifted the verdict out of `insufficient_signal`, re-enabling a forecast
 * whose entire basis was "one article named this company" (measured:
 * strengthening, confidence 51, probability 44).
 *
 * THE SUBTLE PART. `G.getNeighbors` returns one entry per neighbour, keeping the
 * FIRST edge found, and `ingestStories` writes `mentions` before `supports` for
 * the same Story->Theme pair. Filtering the output of `getNeighbors` therefore
 * discards the whole neighbour and takes its genuine `supports` edge with it —
 * silently destroying real evidence while appearing to remove only mentions. On
 * the live payload that would have dropped all 49 `supports[Feed]` edges. The
 * engine now walks the full relationship list and keeps the first ADMISSIBLE edge
 * per neighbour. These tests pin that distinction.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { intelligenceGraph as G } from "../intelligenceGraph";
import { ingestThemes, ingestStories, ingestListen, ingestMA } from "../intelligenceGraphAdapters";
import { evaluateEvidenceForNode } from "../evidenceEngine";
import { predictThemeTrajectory, predictCompanyTrajectory } from "../predictionEngine";

const theme = (name: string, id: string) => ({
  id, name, description: "d", signal_strength: "strong", confidence: 70,
  momentum_direction: "bullish", related_industries: ["Semiconductors"],
  related_assets: ["NVDA"], related_macro_factors: ["Power Load Growth"],
  contributing_cluster_ids: ["c1"], contributing_story_count: 2,
  second_order_effects: [], podcast_topics: [],
  last_updated: "2026-08-24T00:00:00Z", momentum_delta: 12,
}) as never;

const story = (id: string, title: string, entities: string[]) => ({
  id, primary: { id, title, url: `https://x/${id}`, source: "Reuters", category: "Markets",
    published: "1h ago", signal_score: 80, signal_strength: "strong",
    affected_entities: entities, summary: "", why_it_matters: "", impact: "", snippet: "" },
  related: [], cluster_score: 0.9, theme_label: title, story_count: 1,
}) as never;

const episode = (id: string, title: string, entities: string[]) => ({
  id, title, show_name: "Odd Lots", publisher: "Bloomberg", description: "d",
  topics: ["Markets"], entities, published_at: "2026-08-24T00:00:00Z",
  relevance_score: 80, why_it_matters: "", audio_url: null, external_url: null,
  image_url: null, duration_seconds: 100, is_briefing: false,
}) as never;

const deal = (id: string, title: string, entities: string[]) => ({
  id, title, url: "u", source: "FT Deals", published: "1h ago", entities,
  dealType: "strategic", sector: "Tech", peFirm: null, signalScore: 80,
  summary: "", whyItMatters: "",
}) as never;

const ev = (label: string) => evaluateEvidenceForNode(G.getNode(label)!.id);

beforeEach(() => G.clear());

// ── A mention alone is never evidence, whatever its provenance ──────────────

describe("mention-only backing yields no evidentiary authority", () => {
  it("Feed: a story that only mentions a company", () => {
    ingestStories([story("c1", "Nvidia in focus", ["NVDA"])], []);
    const e = ev("NVDA");
    expect(e.verdict).toBe("insufficient_signal");
    expect(e.overallTrust).toBe(0);
    expect(e.supportingEvidence).toHaveLength(0);
    expect(e.sourceBreakdown ?? []).toHaveLength(0);
  });

  it("Listen: an episode that only mentions a company", () => {
    ingestListen([episode("e1", "Nvidia talk", ["NVDA"])], [] as never);
    const e = ev("NVDA");
    expect(e.verdict).toBe("insufficient_signal");
    expect(e.overallTrust).toBe(0);
    expect(e.supportingEvidence).toHaveLength(0);
  });

  it("M&A: a deal that only mentions a company", () => {
    ingestMA([deal("d1", "KKR eyes TargetCo", ["NVDA"])], []);
    const e = ev("NVDA");
    expect(e.verdict).toBe("insufficient_signal");
    expect(e.overallTrust).toBe(0);
    expect(e.supportingEvidence).toHaveLength(0);
  });

  it("no forecast can be enabled by mentions alone", () => {
    ingestThemes([theme("AI", "ai")]);
    ingestStories([story("c1", "Nvidia in focus", ["NVDA"])], [theme("AI", "ai")]);
    // Before E3 this exact shape produced "strengthening, confidence 51".
    const p = predictCompanyTrajectory(G.getNode("NVDA")!.id);
    expect(p.found).toBe(false);
    expect(p.expectedDirection).toBe("insufficient_signal");
  });

  it("a mention-only theme is insufficient and unforecastable", () => {
    ingestListen([episode("e1", "Macro chat", [])], [] as never);
    const themes = G.allNodes().filter(n => n.type === "Theme");
    for (const t of themes) {
      expect(evaluateEvidenceForNode(t.id).verdict).toBe("insufficient_signal");
      expect(predictThemeTrajectory(t.id).predictedDirection).toBe("insufficient_signal");
    }
  });
});

// ── The edge survives in the graph ──────────────────────────────────────────

describe("mention edges remain in the graph and traversable", () => {
  beforeEach(() => { ingestListen([episode("e1", "Nvidia talk", ["NVDA"])], [] as never); });

  it("the edge is not deleted", () => {
    const rels = G.getRelationships(G.getNode("NVDA")!.id);
    expect(rels.length).toBeGreaterThan(0);
    expect(rels.some(e => e.relationshipType === "mentions")).toBe(true);
  });

  it("coverage consumers can still count it", () => {
    // "most discussed", heatmaps and "entered the conversation" read the graph
    // (or Episode.entities) directly — they are unaffected by evidence rules.
    const mentions = G.getRelationships(G.getNode("NVDA")!.id)
      .filter(e => e.relationshipType === "mentions");
    expect(mentions).toHaveLength(1);
    expect(mentions[0].originatingPages).toContain("Listen");
  });

  it("neighbours remain reachable for transmission/context", () => {
    expect(G.getNeighbors(G.getNode("NVDA")!.id).length).toBeGreaterThan(0);
  });
});

// ── Real support survives alongside a mention (the masking case) ────────────

describe("a real supports edge survives even when a mention shares the neighbour", () => {
  beforeEach(() => {
    ingestThemes([theme("AI Compute Arms Race", "ai")]);
    // ingestStories writes BOTH mentions and supports for the same Story->Theme
    // pair, with mentions first — the case that naive filtering destroys.
    ingestStories([story("c1", "AI compute demand surges", ["NVDA"])],
                  [theme("AI Compute Arms Race", "ai")]);
  });

  it("the theme keeps its observed support", () => {
    const e = ev("AI Compute Arms Race");
    expect(e.verdict).not.toBe("insufficient_signal");
    expect(e.supportingEvidence.length).toBeGreaterThan(0);
    expect(e.overallTrust).toBeGreaterThan(0);
  });

  it("every admitted item is a supporting relation, never a mention", () => {
    const e = ev("AI Compute Arms Race");
    expect(e.supportingEvidence.every(i => i.relationship !== "mentions")).toBe(true);
    expect(e.supportingEvidence.some(i => i.relationship === "supports")).toBe(true);
  });

  it("both edges still exist on the pair — only authority differs", () => {
    const rels = G.getRelationships(G.getNode("AI Compute Arms Race")!.id);
    expect(rels.some(e => e.relationshipType === "mentions")).toBe(true);
    expect(rels.some(e => e.relationshipType === "supports")).toBe(true);
  });

  it("the mention adds no authority — trust matches support alone", () => {
    const withBoth = ev("AI Compute Arms Race").overallTrust;
    G.clear();
    ingestThemes([theme("AI Compute Arms Race", "ai")]);
    ingestStories([story("c1", "AI compute demand surges", ["NVDA"])],
                  [theme("AI Compute Arms Race", "ai")]);
    expect(ev("AI Compute Arms Race").overallTrust).toBe(withBoth);
  });

  it("the theme remains forecastable from real support", () => {
    const p = predictThemeTrajectory(G.getNode("AI Compute Arms Race")!.id);
    expect(p.predictedDirection).not.toBe("insufficient_signal");
  });
});

// ── Prior contracts unchanged ───────────────────────────────────────────────

describe("E1 and E2 contracts are unchanged", () => {
  it("RC2-E1: ontology-only backing is still inadmissible", () => {
    ingestThemes([theme("AI", "ai")]);
    expect(ev("AI").verdict).toBe("insufficient_signal");
    expect(ev("NVDA").verdict).toBe("insufficient_signal");
  });

  it("RC2-E1: observed provenance is still admissible when it carries support", () => {
    ingestThemes([theme("AI", "ai")]);
    ingestStories([story("c1", "AI demand", ["NVDA"])], [theme("AI", "ai")]);
    expect(ev("AI").supportingEvidence.length).toBeGreaterThan(0);
  });

  it("RC2-G5: belongs_to is still never evidence", () => {
    ingestThemes([theme("AI", "ai")]);
    ingestStories([story("c1", "AI demand", ["NVDA"])], [theme("AI", "ai")]);
    for (const n of G.allNodes()) {
      expect(evaluateEvidenceForNode(n.id).supportingEvidence
        .some(i => i.relationship === "belongs_to")).toBe(false);
    }
  });

  it("no mention appears as evidence anywhere in a populated graph", () => {
    ingestThemes([theme("AI", "ai")]);
    ingestStories([story("c1", "AI demand", ["NVDA"]), story("c2", "Chips rally", ["NVDA"])],
                  [theme("AI", "ai")]);
    ingestListen([episode("e1", "Nvidia talk", ["NVDA"])], [] as never);
    ingestMA([deal("d1", "KKR eyes X", ["NVDA"])], []);
    for (const n of G.allNodes()) {
      expect(evaluateEvidenceForNode(n.id).supportingEvidence
        .some(i => i.relationship === "mentions")).toBe(false);
    }
  });
});
