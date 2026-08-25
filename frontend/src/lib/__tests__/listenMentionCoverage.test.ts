/**
 * RC2-D2 — populated Episode.entities is COVERAGE, and stays coverage.
 *
 * `Episode.entities` was hardcoded `[]` in the backend, so `ingestListen`'s
 * company loop never executed in production:
 *
 *     for (const entity of ep.entities ?? []) {
 *       const c = addCompany(entity, PAGE_LISTEN);
 *       link(podId, "mentions", c, { page: PAGE_LISTEN });   // never reached
 *     }
 *
 * D2 populates that array from the episode TITLE via the RC2-A resolver, so this
 * path is live for the first time. That makes a previously-dormant question real:
 * a Podcast now writes `mentions` edges into Company nodes on every ingest.
 *
 * RC2-E3 already ruled that a mention is not corroboration. These tests pin that
 * the ruling holds under D2's new volume — that turning the Listen company path
 * on adds conversation coverage WITHOUT adding a single unit of thesis authority.
 *
 * The invariant, stated by the approving instruction:
 *   "D2 may increase conversation intelligence, but Company evidence/forecast
 *    counts must not increase from podcast mentions."
 */

import { beforeEach, describe, expect, it } from "vitest";
import { intelligenceGraph as G } from "../intelligenceGraph";
import { ingestThemes, ingestStories, ingestListen } from "../intelligenceGraphAdapters";
import { evaluateEvidenceForNode } from "../evidenceEngine";
import { predictCompanyTrajectory } from "../predictionEngine";
import { buildIntelligenceProfile } from "../intelligenceProfile";
import { mostDiscussedCompanies, companyThemeHeatmap } from "../listenSections";

const theme = (name: string, id: string) => ({
  id, name, description: "d", signal_strength: "strong", confidence: 70,
  momentum_direction: "bullish", related_industries: ["Semiconductors"],
  related_assets: [], related_macro_factors: ["Power Load Growth"],
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

// Shaped like a real post-D2 episode: canonical tickers resolved from the title.
const episode = (id: string, title: string, entities: string[]) => ({
  id, title, show_name: "Odd Lots", publisher: "Bloomberg", description: "d",
  topics: ["Markets"], entities, published_at: "2026-08-24T00:00:00Z",
  relevance_score: 80, why_it_matters: "", audio_url: null, external_url: null,
  image_url: null, duration_seconds: 100, is_briefing: false,
}) as never;

const evOf = (label: string) => evaluateEvidenceForNode(G.getNode(label)!.id);

beforeEach(() => G.clear());

// ── The path is now live ────────────────────────────────────────────────────

describe("populated entities reach the graph", () => {
  beforeEach(() => {
    ingestListen([episode("e1", "Nvidia Takes Aim at Frontier AI Developers", ["NVDA"])],
                 [] as never);
  });

  it("the company node exists", () => {
    expect(G.getNode("NVDA")).toBeTruthy();
  });

  it("the edge is Episode --mentions--> Company, from Listen", () => {
    const rels = G.getRelationships(G.getNode("NVDA")!.id)
      .filter(e => e.relationshipType === "mentions");
    expect(rels).toHaveLength(1);
    expect(rels[0].originatingPages).toContain("Listen");
  });

  it("the relationship type is unchanged by D2 — still mentions, never supports", () => {
    for (const e of G.getRelationships(G.getNode("NVDA")!.id)) {
      expect(e.relationshipType).toBe("mentions");
    }
  });

  it("multiple resolved tickers each get their own edge", () => {
    G.clear();
    ingestListen([episode("e1", "Home Depot and Lowe's earnings", ["HD", "LOW"])], [] as never);
    for (const t of ["HD", "LOW"]) {
      expect(G.getRelationships(G.getNode(t)!.id)
        .filter(e => e.relationshipType === "mentions")).toHaveLength(1);
    }
  });
});

// ── ...and carries no thesis authority ──────────────────────────────────────

describe("the E3 boundary holds under D2", () => {
  beforeEach(() => {
    ingestListen([episode("e1", "Nvidia Takes Aim at Frontier AI Developers", ["NVDA"])],
                 [] as never);
  });

  it("a company with only Listen mentions is insufficient_signal", () => {
    const e = evOf("NVDA");
    expect(e.verdict).toBe("insufficient_signal");
    expect(e.overallTrust).toBe(0);
    expect(e.supportingEvidence).toHaveLength(0);
    expect(e.sourceBreakdown ?? []).toHaveLength(0);
  });

  it("no forecast is enabled", () => {
    const p = predictCompanyTrajectory(G.getNode("NVDA")!.id);
    expect(p.found).toBe(false);
    expect(p.expectedDirection).toBe("insufficient_signal");
    expect(p.confidence).toBe(0);
  });

  it("profile.forward stays null", () => {
    expect(buildIntelligenceProfile("NVDA", { kindHint: "company" as never })
      .thesis.data?.forward ?? null).toBeNull();
  });

  it("VOLUME does not accumulate into authority", () => {
    // Ten episodes naming the same company is still ten mentions, not a thesis.
    G.clear();
    ingestListen(Array.from({ length: 10 }, (_, i) =>
      episode(`e${i}`, `Nvidia episode ${i}`, ["NVDA"])), [] as never);
    const e = evOf("NVDA");
    expect(e.verdict).toBe("insufficient_signal");
    expect(e.overallTrust).toBe(0);
    expect(e.supportingEvidence).toHaveLength(0);
    expect(predictCompanyTrajectory(G.getNode("NVDA")!.id).found).toBe(false);
  });
});

// ── The invariant, measured as a before/after delta ─────────────────────────

describe("adding Listen mentions changes no evidence count", () => {
  const baseline = () => {
    ingestThemes([theme("AI Compute Arms Race", "ai")]);
    ingestStories([story("c1", "AI compute demand surges", ["NVDA"])],
                  [theme("AI Compute Arms Race", "ai")]);
  };

  it("company evidence and trust are byte-identical with and without mentions", () => {
    baseline();
    const before = evOf("NVDA");
    G.clear();
    baseline();
    ingestListen([episode("e1", "Nvidia and the AI trade", ["NVDA"])], [] as never);
    const after = evOf("NVDA");

    expect(after.verdict).toBe(before.verdict);
    expect(after.overallTrust).toBe(before.overallTrust);
    expect(after.supportingEvidence.length).toBe(before.supportingEvidence.length);
    expect((after.sourceBreakdown ?? []).length).toBe((before.sourceBreakdown ?? []).length);
  });

  it("the theme's real support is not disturbed by the new mention edges", () => {
    // The masking case from E3: a mention sharing a neighbour must not take a
    // genuine `supports` edge with it.
    baseline();
    const before = evOf("AI Compute Arms Race");
    expect(before.supportingEvidence.length).toBeGreaterThan(0);
    G.clear();
    baseline();
    ingestListen([episode("e1", "Nvidia and the AI trade", ["NVDA"])], [] as never);
    const after = evOf("AI Compute Arms Race");
    expect(after.supportingEvidence.length).toBeGreaterThanOrEqual(before.supportingEvidence.length);
    expect(after.supportingEvidence.every(i => i.relationship !== "mentions")).toBe(true);
  });

  it("no mention appears as evidence on any node", () => {
    baseline();
    ingestListen([episode("e1", "Nvidia and Microsoft", ["NVDA", "MSFT"])], [] as never);
    for (const n of G.allNodes()) {
      expect(evaluateEvidenceForNode(n.id).supportingEvidence
        .some(i => i.relationship === "mentions")).toBe(false);
    }
  });
});

// ── Coverage consumers do receive the data ──────────────────────────────────

describe("conversation coverage is what D2 actually delivers", () => {
  const episodes = [
    episode("e1", "Nvidia Takes Aim at Frontier AI Developers", ["NVDA"]),
    episode("e2", "Nvidia's $500B AI Bet", ["NVDA"]),
    episode("e3", "Why Meta is Meh and Microsoft is Mega", ["META", "MSFT"]),
    episode("e4", "A conversation about market structure", []),
  ] as never as Parameters<typeof mostDiscussedCompanies>[0];

  it("the mention leaderboard counts episodes, not conviction", () => {
    const ranked = mostDiscussedCompanies(episodes);
    expect(ranked[0]).toEqual({ ticker: "NVDA", count: 2 });
    expect(ranked.map(r => r.ticker).sort()).toEqual(["META", "MSFT", "NVDA"]);
    // A count is a count: no score, no probability, no trust.
    for (const r of ranked) expect(Object.keys(r).sort()).toEqual(["count", "ticker"]);
  });

  it("an episode that resolves nothing contributes nothing", () => {
    expect(mostDiscussedCompanies([episodes[3]] as never)).toHaveLength(0);
  });

  it("the heatmap is empty when there are no themes to cross", () => {
    const hm = companyThemeHeatmap([], episodes);
    expect(hm.themes).toHaveLength(0);
    expect(hm.cells.every(row => row.length === 0)).toBe(true);
  });
});
