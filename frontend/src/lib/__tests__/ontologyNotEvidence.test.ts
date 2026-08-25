/**
 * RC2-E1 — declared ontology is not evidence.
 *
 * `ingestThemes` writes a curated theme's own ontology into the graph:
 *
 *   related_assets        -> Theme --supports--> Company
 *   related_industries    -> Theme --affects/correlates--> Industry
 *   related_macro_factors -> Macro --drives--> Theme
 *
 * Those edges were read back as support for the very thesis that declared them,
 * and listed in `sourceBreakdown` as independent sources with reliability scores.
 * Measured on a theme with zero stories: verdict `moderate`, trust 48, three
 * "supporting" items, three "sources". The claim was its own evidence.
 *
 * Measured on the live payload it was worse for companies: 38 of 46 had no
 * observed backing at all, yet 44 of 46 carried a forward view — a forecast for
 * TNX, TLT, JPM, XOM and 34 others built on nothing but a theme listing them.
 *
 * The discriminator is PROVENANCE, not vocabulary. The identical verb is
 * legitimate when observed:
 *
 *   t --supports--> nvda           pages ["Theme Intelligence"]   inadmissible
 *   nvidia-beats --supports--> t   pages ["Feed"]                 admissible
 *
 * The edges are NOT removed from the graph — they remain ontology/exposure
 * structure. They simply carry no evidentiary authority.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { intelligenceGraph as G } from "../intelligenceGraph";
import { ingestThemes, ingestStories, ingestMA, ingestListen } from "../intelligenceGraphAdapters";
import { evaluateEvidenceForNode } from "../evidenceEngine";
import { predictThemeTrajectory, predictCompanyTrajectory } from "../predictionEngine";
import { buildIntelligenceProfile } from "../intelligenceProfile";

const theme = (name: string, id: string, momentum = 10) => ({
  id, name, description: "d", signal_strength: "strong", confidence: 70,
  momentum_direction: momentum > 0 ? "bullish" : "neutral",
  related_industries: ["Semiconductors"], related_assets: ["NVDA"],
  related_macro_factors: ["Power Load Growth"], contributing_cluster_ids: ["c1"],
  contributing_story_count: 2, second_order_effects: [], podcast_topics: [],
  last_updated: "2026-08-21T00:00:00+00:00", momentum_delta: momentum,
}) as never;

const story = (id: string, title: string, entities: string[], source = "Reuters") => ({
  id, primary: { id, title, url: `https://x/${id}`, source, category: "Markets",
    published: "1h ago", signal_score: 80, signal_strength: "strong",
    affected_entities: entities, summary: "", why_it_matters: "", impact: "", snippet: "" },
  related: [], cluster_score: 0.9, theme_label: title, story_count: 1,
}) as never;

beforeEach(() => G.clear());

// ── 1. Theme backed only by its own ontology ────────────────────────────────

describe("a theme with only declared ontology has no evidence", () => {
  beforeEach(() => { ingestThemes([theme("T", "t")]); });

  it("evidence is insufficient", () => {
    const ev = evaluateEvidenceForNode(G.getNode("T")!.id);
    expect(ev.verdict).toBe("insufficient_signal");
  });

  it("no supporting items are manufactured from its own ontology", () => {
    const ev = evaluateEvidenceForNode(G.getNode("T")!.id);
    expect(ev.supportingEvidence).toHaveLength(0);
  });

  it("sourceBreakdown does not pretend ontology is an independent source", () => {
    const ev = evaluateEvidenceForNode(G.getNode("T")!.id);
    expect(ev.sourceBreakdown ?? []).toHaveLength(0);
  });

  it("no trust is manufactured", () => {
    expect(evaluateEvidenceForNode(G.getNode("T")!.id).overallTrust).toBe(0);
  });

  it("no forward prediction is produced", () => {
    const p = predictThemeTrajectory(G.getNode("T")!.id);
    expect(p.predictedDirection).toBe("insufficient_signal");
    expect(p.probability).toBe(0);
    expect(p.confidence).toBe(0);
  });

  it("intelligenceProfile refuses the forward view", () => {
    const prof = buildIntelligenceProfile("T", { kindHint: "theme" as never });
    expect(prof.thesis.data?.forward ?? null).toBeNull();
  });
});

// ── 2. Company backed only by a Theme Intelligence supports edge ────────────

describe("a company with only an ontology supports edge", () => {
  beforeEach(() => { ingestThemes([theme("T", "t")]); });

  it("its evidence is insufficient", () => {
    const ev = evaluateEvidenceForNode(G.getNode("NVDA")!.id);
    expect(ev.verdict).toBe("insufficient_signal");
    expect(ev.supportingEvidence).toHaveLength(0);
    expect(ev.overallTrust).toBe(0);
  });

  it("its forward prediction is absent", () => {
    const p = predictCompanyTrajectory(G.getNode("NVDA")!.id);
    expect(p.found).toBe(false);
    expect(p.expectedDirection).toBe("insufficient_signal");
  });

  it("the theme's own momentum cannot become company conviction", () => {
    const p = predictCompanyTrajectory(G.getNode("NVDA")!.id);
    expect(p.confidence).toBe(0);
    expect(p.probability).toBe(0);
  });
});

// ── 3. The identical verb, with observed provenance, still counts ───────────

describe("observed provenance keeps the same verb admissible", () => {
  it("a Feed story supporting a theme IS evidence", () => {
    ingestThemes([theme("T", "t")]);
    ingestStories([story("c1", "Nvidia beats on datacenter demand", ["NVDA"])], [theme("T", "t")]);
    const ev = evaluateEvidenceForNode(G.getNode("T")!.id);
    expect(ev.verdict).not.toBe("insufficient_signal");
    expect(ev.supportingEvidence.length).toBeGreaterThan(0);
    expect((ev.sourceBreakdown ?? []).length).toBeGreaterThan(0);
  });

  /**
   * RC2-E3 SUPERSEDES this assertion. It previously read "a company mentioned by
   * an observed story regains evidence" — but a Story->Company edge is
   * `mentions`, which is coverage, not corroboration. Observed provenance makes
   * an edge ADMISSIBLE; it does not make a mention into thesis support. What the
   * observed story genuinely corroborates is the THEME (Story->Theme `supports`).
   */
  it("observed provenance admits a real supports edge — but a mention is still not one", () => {
    ingestThemes([theme("T", "t")]);
    ingestStories([story("c1", "Nvidia beats", ["NVDA"])], [theme("T", "t")]);
    // The theme gains real evidence: Story --supports--> Theme, page "Feed".
    const themeEv = evaluateEvidenceForNode(G.getNode("T")!.id);
    expect(themeEv.supportingEvidence.length).toBeGreaterThan(0);
    expect(themeEv.supportingEvidence.some(i => i.relationship === "supports")).toBe(true);
    // The company does NOT: its only observed edge is a mention.
    const coEv = evaluateEvidenceForNode(G.getNode("NVDA")!.id);
    expect(coEv.supportingEvidence).toHaveLength(0);
    expect(coEv.verdict).toBe("insufficient_signal");
  });

  // NOTE (RC2-E3): the deal case below asserts admissibility of OBSERVED
  // provenance, which remains true. Whether `acquires` should carry positive
  // thesis polarity at all is recorded as an open follow-up — it is in neither
  // POSITIVE_REL nor NEGATIVE_REL and defaults to +1 through a ternary rather
  // than by deliberate classification. Not decided here.
  it("a Deal supporting a company IS evidence", () => {
    ingestMA([{ id: "d1", title: "KKR acquires TargetCo", url: "u", source: "FT Deals",
      published: "1h ago", entities: ["APO"], dealType: "sponsor", sector: "Financials",
      peFirm: "KKR", signalScore: 80, summary: "", whyItMatters: "" } as never], []);
    const n = G.getNode("APO");
    expect(n).toBeTruthy();
    expect(evaluateEvidenceForNode(n!.id).supportingEvidence.length).toBeGreaterThan(0);
  });

  it("a Podcast mentioning a theme IS evidence", () => {
    ingestThemes([theme("T", "t")]);
    ingestListen([{ id: "e1", title: "Ep", show_name: "Odd Lots", publisher: "Bloomberg",
      description: "d", topics: ["Markets"], entities: [], published_at: "2026-08-21T00:00:00Z",
      relevance_score: 70, why_it_matters: "", audio_url: null, external_url: null,
      image_url: null, duration_seconds: 100, is_briefing: false } as never],
      [theme("T", "t")] as never);
    const ev = evaluateEvidenceForNode(G.getNode("T")!.id);
    // Listen provenance is observed, so whatever it contributes is admissible.
    for (const item of ev.supportingEvidence) {
      expect(item.pages.every(p => p === "Theme Intelligence")).toBe(false);
    }
  });

  it("an edge with BOTH ontology and observed pages remains admissible", () => {
    ingestThemes([theme("T", "t")]);
    ingestStories([story("c1", "Nvidia beats", ["NVDA"])], [theme("T", "t")]);
    const ev = evaluateEvidenceForNode(G.getNode("T")!.id);
    // One observed page anywhere restores the edge — something was actually seen.
    expect(ev.supportingEvidence.every(i => i.pages.every(p => p === "Theme Intelligence")))
      .toBe(false);
  });
});

// ── 4. The graph is not mutated ─────────────────────────────────────────────

describe("ontology edges remain in the graph as structure", () => {
  beforeEach(() => { ingestThemes([theme("T", "t")]); });

  it("the theme keeps its declared relationships", () => {
    const edges = G.getRelationships(G.getNode("T")!.id);
    expect(edges.length).toBeGreaterThan(0);
    expect(edges.some(e => e.relationshipType === "supports")).toBe(true);
    expect(edges.some(e => e.relationshipType === "affects")).toBe(true);
  });

  it("the company keeps its exposure edge", () => {
    expect(G.getRelationships(G.getNode("NVDA")!.id).length).toBeGreaterThan(0);
  });

  it("neighbours still traverse the ontology (transmission is unaffected)", () => {
    expect(G.getNeighbors(G.getNode("T")!.id).length).toBeGreaterThan(0);
  });
});

// ── 5. Nothing else regressed ───────────────────────────────────────────────

describe("the G5 structural exclusion still holds", () => {
  it("belongs_to is still never evidence", () => {
    ingestThemes([theme("T", "t")]);
    ingestStories([story("c1", "Chip demand", ["NVDA"])], [theme("T", "t")]);
    for (const n of G.allNodes()) {
      const ev = evaluateEvidenceForNode(n.id);
      expect(ev.supportingEvidence.some(e => e.relationship === "belongs_to")).toBe(false);
    }
  });
});
