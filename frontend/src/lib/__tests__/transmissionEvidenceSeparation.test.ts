/**
 * RC2-G6 — the transmission invariant.
 *
 *   A transmission path contains ONLY causal/structural market-intelligence
 *   nodes: Driver -> Theme -> Industry/Sector -> Company. Evidence (Story,
 *   Deal, Podcast, MarketMetric) SUPPORTS a mechanism; it is never a hop in one.
 *
 * strongestPath used to append a layer-4 evidence node, so a sector with no
 * recorded upstream rendered as
 *   "Healthcare -> How investors killed AstraZeneca's $400bn megadeal"
 * under "How it transmits". Evidence is not moved out of the Evidence section -
 * it is only kept out of the chain. Evidence scoring, counts and verdicts are
 * untouched.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { intelligenceGraph as G } from "../intelligenceGraph";
import { ingestThemes, ingestStories, ingestMA } from "../intelligenceGraphAdapters";
import { buildIntelligenceProfile, profileKindOfType } from "../intelligenceProfile";
import { buildTransmission } from "../workstationView";
import { evaluateEvidenceForNode } from "../evidenceEngine";
import type { ThemeIntelligence } from "../types";

function theme(name: string, id: string, inds: string[], assets: string[] = ["NVDA"]): ThemeIntelligence {
  return {
    id, name, description: "d", signal_strength: "strong", confidence: 80,
    momentum_direction: "bullish", related_industries: inds, related_assets: assets,
    related_macro_factors: ["Power Load Growth"], contributing_cluster_ids: ["c1"],
    contributing_story_count: 2, second_order_effects: [], podcast_topics: [],
    last_updated: "2026-08-14T00:00:00+00:00", momentum_delta: 10,
    signal_quality: "confirmed", evidence_count: 4, breadth_score: 3, cross_category_confirmed: true,
  } as unknown as ThemeIntelligence;
}

const story = (id: string, title: string, entities: string[]) => ({
  id,
  primary: { id, title, url: `https://x/${id}`, source: "FT Deals", category: "M&A",
             published: "1h ago", signal_score: 80, signal_strength: "strong",
             affected_entities: entities, summary: "", why_it_matters: "", impact: "", snippet: "" },
  related: [], cluster_score: 0.9, theme_label: title, story_count: 1,
}) as never;

const pathOf = (idOrLabel: string, kind = "sector") =>
  buildIntelligenceProfile(idOrLabel, { kindHint: kind as never }).transmission.data?.strongestPath ?? [];

/** Every node in a path must be a recorded, non-evidence graph node. */
function assertCausalOnly(path: string[]) {
  for (const label of path) {
    const n = G.getNode(label) ?? G.getNodeOfType(label, "Industry");
    expect(n, `path node "${label}" must be a recorded graph node`).toBeTruthy();
    expect(profileKindOfType(String(n!.type)), `path node "${label}" (${n!.type}) must not be evidence`)
      .not.toBe("evidence");
  }
}

beforeEach(() => G.clear());

// ── The named production case ───────────────────────────────────────────────

describe("Healthcare: evidence is no longer a transmission hop", () => {
  function healthcareWorld() {
    // A sector whose ONLY connection is an evidence-layer deal - the live shape.
    ingestMA([{
      id: "d1", title: "How investors killed AstraZeneca's $400bn megadeal",
      url: "u", source: "FT Deals", published: "1h ago", entities: ["Healthcare"],
      dealType: "strategic", sector: "Healthcare", peFirm: null, signalScore: 80,
      summary: "", whyItMatters: "",
    } as never], []);
  }

  it("does not render Sector -> Story as a transmission path", () => {
    healthcareWorld();
    const path = pathOf("Healthcare");
    expect(path.some(l => /AstraZeneca/.test(l))).toBe(false);
    expect(path).toEqual([]);            // one node is not a mechanism
  });

  it("yields an honest empty transmission beat rather than a fabricated hop", () => {
    healthcareWorld();
    const p = buildIntelligenceProfile("Healthcare", { kindHint: "sector" });
    const t = buildTransmission(p, null, "Healthcare");
    expect(t?.primaryChain ?? []).toEqual([]);
  });

  it("states NO RECORDED MECHANISM - it never infers one is forming", () => {
    healthcareWorld();
    const p = buildIntelligenceProfile("Healthcare", { kindHint: "sector" });
    const t = buildTransmission(p, null, "Healthcare");
    expect(t?.reading).toBe("No recorded transmission mechanism yet.");
    expect(t?.reading).not.toMatch(/forming|emerging|developing/i);
  });

  it("the empty state carries no carrier clause and no invented hop", () => {
    healthcareWorld();
    const p = buildIntelligenceProfile("Healthcare", { kindHint: "sector" });
    const t = buildTransmission(p, null, "Healthcare");
    expect(t?.reading).not.toContain("carried by");
    expect(t?.viaIndustry).toBeNull();
    expect(t?.primaryChain).toEqual([]);
  });

  it("a populated chain is unaffected by the empty-state copy", () => {
    ingestThemes([theme("AI Compute Arms Race", "ai", ["Semiconductors"])]);
    const ind = G.getNodeOfType("Semiconductors", "Industry")!;
    const p = buildIntelligenceProfile(ind.id, { kindHint: "sector" });
    const t = buildTransmission(p, null, "Semiconductors");
    expect(t?.reading).toMatch(/leads through to/);
    expect(t?.reading).not.toMatch(/No recorded transmission mechanism/);
  });

  /**
   * RC2-N1 SUPERSEDES this assertion. G6 scoped itself to the transmission
   * CHAIN — "evidence scoring, counts and verdicts are untouched" — and this
   * case guarded that. N1 changes evidence deliberately.
   *
   * The fixture is exactly the relation N1 ruled on: the sector's only link is
   * `Deal --affects--> Sector`, and the deal is titled "How investors KILLED
   * AstraZeneca's $400bn megadeal". A collapsed megadeal was producing POSITIVE
   * thesis evidence for Healthcare, because `affects` sat in POSITIVE_REL and
   * carried observed M&A provenance. `affects` means "this deal concerns this
   * sector"; the sector label itself came from a headline regex.
   *
   * What G6 actually proves — that evidence is not a transmission hop — is
   * unaffected and still asserted above. The edge remains in the graph and
   * traversable, so it stays available to structural consumers; it simply no
   * longer carries thesis authority.
   */
  it("the deal edge is still recorded, but is no longer thesis evidence", () => {
    healthcareWorld();
    const n = G.getNodeOfType("Healthcare", "Sector")!;
    const rels = G.getRelationships(n.id);
    expect(rels.some(e => e.relationshipType === "affects")).toBe(true);
    expect(G.getNeighbors(n.id).some(x => /AstraZeneca/.test(x.node.label))).toBe(true);

    const ev = evaluateEvidenceForNode(n.id);
    expect(ev.supportingEvidence.some(e => /AstraZeneca/.test(e.from))).toBe(false);
    expect(ev.verdict).toBe("insufficient_signal");
    expect(ev.overallTrust).toBe(0);
  });
});

// ── Fully populated causal chain ────────────────────────────────────────────

describe("Driver -> Theme -> Industry -> Company is preserved", () => {
  function fullWorld() {
    ingestThemes([theme("AI Compute Arms Race", "ai", ["Semiconductors"], ["NVDA"])]);
    ingestStories([story("c1", "Some supporting story", ["NVDA"])], []);
  }

  it("the synthetic fully-populated case resolves the whole chain in causal order", () => {
    fullWorld();
    const ind = G.getNodeOfType("Semiconductors", "Industry")!;
    const path = pathOf(ind.id);
    expect(path).toEqual(["Power Load Growth", "AI Compute Arms Race", "Semiconductors", "NVDA"]);
    assertCausalOnly(path);
  });

  it("a Company subject keeps its upstream chain and does not end in a story", () => {
    fullWorld();
    const path = pathOf("NVDA", "company");
    expect(path[path.length - 1]).toBe("NVDA");
    assertCausalOnly(path);
  });

  it("a Theme subject sits at its own causal layer, not after the sector", () => {
    fullWorld();
    const path = pathOf("AI Compute Arms Race", "theme");
    expect(path.indexOf("AI Compute Arms Race")).toBeLessThan(path.indexOf("Semiconductors"));
    assertCausalOnly(path);
  });

  it("no path may terminate in an evidence node", () => {
    fullWorld();
    for (const subject of ["NVDA", "AI Compute Arms Race"]) {
      const path = pathOf(subject, "company");
      if (path.length) {
        const last = G.getNode(path[path.length - 1])!;
        expect(profileKindOfType(String(last.type))).not.toBe("evidence");
      }
    }
  });
});

// ── Evidence-only subject ───────────────────────────────────────────────────

describe("an evidence-only world yields no transmission", () => {
  it("a sector connected solely to stories has no path", () => {
    ingestStories([story("c1", "A market story", ["Energy"])], []);
    expect(pathOf("Energy")).toEqual([]);
  });

  it("a Story subject itself never becomes a hop in its own path", () => {
    ingestThemes([theme("AI Compute Arms Race", "ai", ["Semiconductors"])]);
    ingestStories([story("c1", "A market story", ["NVDA"])], []);
    const s = G.allNodes().find(n => n.type === "Story")!;
    const path = buildIntelligenceProfile(s.id, { kindHint: "evidence" as never })
      .transmission.data?.strongestPath ?? [];
    expect(path.some(l => /A market story/.test(l))).toBe(false);
  });
});

// ── Real sectors keep their valid chains ────────────────────────────────────

describe("valid transmission is preserved", () => {
  it("Energy keeps its recorded chain", () => {
    ingestThemes([theme("Grid Bottleneck Trade", "grid", ["Energy"])]);
    const ind = G.getNodeOfType("Energy", "Industry")!;
    const path = pathOf(ind.id);
    expect(path[0]).toBe("Power Load Growth");
    expect(path).toContain("Grid Bottleneck Trade");
    expect(path).toContain("Energy");
    assertCausalOnly(path);
  });

  it("Technology keeps its chain through Semiconductors/Software", () => {
    ingestThemes([theme("AI Compute Arms Race", "ai", ["Semiconductors", "Software"])]);
    for (const ind of ["Semiconductors", "Software"]) {
      const n = G.getNodeOfType(ind, "Industry")!;
      const path = pathOf(n.id);
      expect(path).toContain(ind);
      assertCausalOnly(path);
    }
  });

  it("adding evidence does not change the causal chain at all", () => {
    ingestThemes([theme("AI Compute Arms Race", "ai", ["Semiconductors"])]);
    const ind = G.getNodeOfType("Semiconductors", "Industry")!;
    const before = pathOf(ind.id);
    ingestStories([story("c9", "Loud but irrelevant story", ["NVDA"])], []);
    expect(pathOf(ind.id)).toEqual(before);
  });
});
