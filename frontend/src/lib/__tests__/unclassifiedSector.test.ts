/**
 * RC2-OS — "Other" is an honest UI fallback, not a sector.
 *
 * `inferSector` returns "Other" when no pattern matches. That means "sector not
 * confidently classified". It does NOT mean a canonical sector, shared economic
 * exposure, comparable-deal membership, a resolved sector taxonomy, or a
 * Workstation sector subject.
 *
 * It appears nowhere in the canonical taxonomy — `industryConfig`'s nine are
 * Communications, Consumer, Energy, Financials, Healthcare, Industrials, Real
 * Estate, Technology and Utilities — and it has no `SECTOR_TO_INDUSTRY` entry.
 *
 * TWO defects, both measured:
 *
 *   GRAPH   `ingestMA` minted it as a Sector node, so every unclassified deal
 *           collapsed into one synthetic hub. On three unrelated deals
 *           (grocery, shipping, law firm): a single "Other" node with three
 *           inbound `affects` edges and those three deals as its neighbours. It
 *           also gave a non-sector a Workstation subject, and made
 *           `sectorExposure("Other")` report `resolved: true` with zero
 *           industries — because that function returns `resolved: false` only
 *           when the Sector NODE is absent. Minting was precisely what made a
 *           non-sector look resolved.
 *
 *   UI      `/ma` matched comparables on `d.sector === deal.sector`, so a
 *           grocery acquisition was presented alongside a shipping sale and a
 *           law-firm merger under "Comparable Deals".
 *
 * Post-RC2-IS the fallback covers ~65% of classifications, so both were about to
 * get much worse.
 *
 * Fixed at the PRODUCER for the graph — `sectorExposure` is untouched and now
 * returns `resolved: false` on its own — and at the PREDICATE for comparables.
 * The visible "Other" label is unchanged everywhere, still without an industry
 * link. No replacement fallback grouping was introduced.
 *
 * Measured before -> after on the required fixture (3 unrelated "Other" deals,
 * 1 Technology, 1 Energy):
 *
 *   nodes 16 -> 15        edges 18 -> 15        DealNodes 5 -> 5
 *   SectorNodes ["Energy","Other","Technology"] -> ["Energy","Technology"]
 *   affects->Other 3 -> 0
 *   sectorExposure("Other").resolved true -> false
 *   canonical Technology/Energy nodes and affects edges: unchanged
 *   INTEL items=2 trustSum=102 forecasts=1 forwards=1 sb=2  ==  IDENTICAL
 */

import { beforeEach, describe, expect, it } from "vitest";
import { intelligenceGraph as G } from "../intelligenceGraph";
import { ingestThemes, ingestStories, ingestMA, isClassifiedSector } from "../intelligenceGraphAdapters";
import { evaluateEvidenceForNode } from "../evidenceEngine";
import { predictThemeTrajectory } from "../predictionEngine";
import { buildIntelligenceProfile } from "../intelligenceProfile";
import { sectorExposure } from "../sectorTaxonomy";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const theme = () => ({
  id: "t1", name: "AI Compute", description: "d", signal_strength: "strong", confidence: 70,
  momentum_direction: "bullish", related_industries: ["Semiconductors"], related_assets: ["NVDA"],
  related_macro_factors: [], contributing_cluster_ids: ["c1"], contributing_story_count: 1,
  second_order_effects: [], podcast_topics: [], last_updated: "2026-09-02T00:00:00Z",
  momentum_delta: 12,
}) as never;

const story = () => ({
  id: "c1", primary: { id: "c1", title: "Chip demand surges", url: "https://x/c1",
    source: "Reuters", category: "Markets", published: "1h ago", signal_score: 80,
    signal_strength: "strong", affected_entities: ["NVDA"], summary: "", why_it_matters: "",
    impact: "", snippet: "" },
  related: [], cluster_score: 0.9, theme_label: "AI Compute", story_count: 1,
}) as never;

const deal = (id: string, title: string, entities: string[], sector: string) => ({
  id, title, url: "u", source: "Reuters", published: "1h ago", entities,
  dealType: "strategic", sector, peFirm: null, signalScore: 80, summary: "", whyItMatters: "",
}) as never;

/** The required fixture: 3 unrelated unclassified + Technology + Energy. */
const FIXTURE = () => [
  deal("d1", "Grocery chain agrees to be acquired", ["KR"], "Other"),
  deal("d2", "Shipping line explores sale", ["ZIM"], "Other"),
  deal("d3", "Law firm merges with rival", ["LAW"], "Other"),
  deal("d4", "Chip designer acquired", ["NVDA"], "Technology"),
  deal("d5", "Pipeline operator acquired", ["XOM"], "Energy"),
];

const ingestAll = () => {
  ingestThemes([theme()]);
  ingestStories([story()], [theme()]);
  ingestMA(FIXTURE(), [theme()]);
};

const sectorNodes = () =>
  G.allNodes().filter(n => n.type === "Sector").map(n => n.label).sort();

beforeEach(() => G.clear());

// ── The classification predicate ────────────────────────────────────────────

describe("isClassifiedSector", () => {
  it('rejects the "Other" fallback', () => {
    expect(isClassifiedSector("Other")).toBe(false);
  });

  it("rejects empty and whitespace", () => {
    expect(isClassifiedSector("")).toBe(false);
    expect(isClassifiedSector("   ")).toBe(false);
  });

  for (const s of ["Technology", "Healthcare", "Energy", "Financials",
                   "Industrials", "Consumer", "Real Estate", "Communications"]) {
    it(`accepts the canonical M&A sector ${s}`, () => {
      expect(isClassifiedSector(s)).toBe(true);
    });
  }
});

// ── Graph: "Other" is never minted ──────────────────────────────────────────

describe('no "Other" Sector node is minted', () => {
  beforeEach(ingestAll);

  it('the "Other" Sector node is absent', () => {
    expect(sectorNodes()).toEqual(["Energy", "Technology"]);
    expect(G.allNodes().some(n => n.type === "Sector" && n.label === "Other")).toBe(false);
  });

  it('zero affects edges target "Other"', () => {
    const toOther = G.allEdges().filter(e =>
      e.relationshipType === "affects" && G.getNode(e.target)?.label === "Other");
    expect(toOther).toHaveLength(0);
  });

  it("no Deal node is lost — the deals themselves remain", () => {
    const deals = G.allNodes().filter(n => n.type === "Deal").map(n => n.label).sort();
    expect(deals).toHaveLength(5);
    expect(deals).toContain("Grocery chain agrees to be acquired");
    expect(deals).toContain("Shipping line explores sale");
    expect(deals).toContain("Law firm merges with rival");
  });

  it("unclassified deals are no longer connected through a shared hub", () => {
    // Before: all three shared the single "Other" node as a neighbour.
    const grocery = G.allNodes().find(n => n.label === "Grocery chain agrees to be acquired")!;
    const neighbours = G.getNeighbors(grocery.id).map(x => x.node.label);
    expect(neighbours).not.toContain("Other");
    expect(neighbours).not.toContain("Shipping line explores sale");
    expect(neighbours).not.toContain("Law firm merges with rival");
  });
});

// ── Canonical sectors are untouched ─────────────────────────────────────────

describe("canonical sector behaviour is unchanged", () => {
  beforeEach(ingestAll);

  for (const s of ["Technology", "Energy"]) {
    it(`${s} still mints a Sector node with its affects edge`, () => {
      const node = G.allNodes().find(n => n.type === "Sector" && n.label === s);
      expect(node).toBeTruthy();
      const affects = G.getRelationships(node!.id).filter(e => e.relationshipType === "affects");
      expect(affects).toHaveLength(1);
      expect(affects[0].originatingPages).toContain("M&A");
    });
  }

  it("RC2-N1: those affects edges remain non-evidentiary", () => {
    for (const s of ["Technology", "Energy"]) {
      const node = G.allNodes().find(n => n.type === "Sector" && n.label === s)!;
      const e = evaluateEvidenceForNode(node.id);
      expect(e.supportingEvidence).toHaveLength(0);
      expect(e.overallTrust).toBe(0);
    }
  });
});

// ── sectorExposure resolves honestly, without special-casing ────────────────

describe("sectorExposure reports Other as unresolved", () => {
  beforeEach(ingestAll);

  it('sectorExposure("Other").resolved is false', () => {
    // Achieved purely by the producer fix — sectorExposure was NOT modified.
    expect(sectorExposure("Other").resolved).toBe(false);
  });

  it("canonical sectors still resolve", () => {
    expect(sectorExposure("Technology").resolved).toBe(true);
    expect(sectorExposure("Technology").industries).toContain("Semiconductors");
  });
});

// ── Comparable grouping ─────────────────────────────────────────────────────

describe("comparable-deal grouping", () => {
  /** The exact predicate `/ma` composes: `a === b && isClassifiedSector(a)`. */
  const sameSector = (a: string, b: string) => a === b && isClassifiedSector(a);

  it("two unclassified deals are NOT same-sector comparables", () => {
    expect(sameSector("Other", "Other")).toBe(false);
  });

  it("legitimate same-sector grouping survives", () => {
    expect(sameSector("Technology", "Technology")).toBe(true);
    expect(sameSector("Energy", "Energy")).toBe(true);
    expect(sameSector("Communications", "Communications")).toBe(true);
  });

  it("different sectors never match", () => {
    expect(sameSector("Technology", "Energy")).toBe(false);
    expect(sameSector("Other", "Technology")).toBe(false);
  });

  it("no replacement fallback grouping is introduced", () => {
    // An unclassified deal simply has no same-sector comparables. It can still
    // match on themeTags, which is a real shared signal — that path is untouched.
    const deals = FIXTURE() as unknown as { id: string; sector: string; title: string }[];
    const comparablesOf = (d: { id: string; sector: string }) =>
      deals.filter(x => x.id !== d.id && sameSector(x.sector, d.sector)).map(x => x.title);
    expect(comparablesOf(deals[0])).toEqual([]);   // grocery
    expect(comparablesOf(deals[1])).toEqual([]);   // shipping
    expect(comparablesOf(deals[2])).toEqual([]);   // law firm
    expect(comparablesOf(deals[3])).toEqual([]);   // only Technology deal
  });

  it("the /ma page composes the guarded predicate at both call sites", () => {
    // Source-level pin: neither comparables list may compare raw sectors again.
    const src = readFileSync(resolve(__dirname, "../../app/ma/page.tsx"), "utf8");
    expect(src).toContain("sameSector(d.sector, deal.sector)");
    expect(src).toContain("sameSector(d.sector, expandedDeal.sector)");
    expect(src).not.toContain("d.sector === deal.sector");
    expect(src).not.toContain("d.sector === expandedDeal.sector");
  });
});

// ── "Other" still renders, still without an industry link ───────────────────

describe('the "Other" label is preserved in the UI', () => {
  const src = () => readFileSync(resolve(__dirname, "../../app/ma/page.tsx"), "utf8");

  it("the sector label is still rendered from deal.sector", () => {
    expect(src()).toContain("{deal.sector}");
  });

  it("the industry link still degrades to a plain span when unmapped", () => {
    // SECTOR_TO_INDUSTRY has no "Other" entry, so the ternary yields the span.
    expect(src()).toContain("industrySlug");
    expect(src()).toContain("SECTOR_TO_INDUSTRY[deal.sector]");
  });

  it('"Other" is still not in SECTOR_TO_INDUSTRY', () => {
    const map = src().slice(src().indexOf("const SECTOR_TO_INDUSTRY"));
    expect(map.slice(0, 300)).not.toContain('"Other"');
  });
});

// ── Zero-delta intelligence ─────────────────────────────────────────────────

describe("intelligence is untouched", () => {
  it("evidence, trust, verdict, forecasts and forwards are unaffected", () => {
    ingestAll();
    let items = 0, trust = 0, forecasts = 0, forwards = 0, sb = 0;
    for (const n of G.allNodes()) {
      if (n.type === "Sector") continue;
      const e = evaluateEvidenceForNode(n.id);
      items += e.supportingEvidence.length + e.contradictingEvidence.length;
      trust += e.overallTrust;
      sb += (e.sourceBreakdown ?? []).length;
      if (n.type === "Theme") {
        if (predictThemeTrajectory(n.id).predictedDirection !== "insufficient_signal") forecasts++;
        if (buildIntelligenceProfile(n.label, { kindHint: "theme" as never }).thesis.data?.forward) forwards++;
      }
    }
    // Measured identical before and after the change.
    expect({ items, trust, forecasts, forwards, sb })
      .toEqual({ items: 2, trust: 102, forecasts: 1, forwards: 1, sb: 2 });
  });

  it("RC2-R1: Deal->Theme is still mentions, never supports", () => {
    ingestAll();
    const t = G.getNode("AI Compute")!;
    const fromDeals = G.getRelationships(t.id).filter(e => G.getNode(e.source)?.type === "Deal");
    expect(fromDeals.length).toBeGreaterThan(0);
    expect(fromDeals.every(e => e.relationshipType === "mentions")).toBe(true);
  });

  it("RC2-E3: those mentions contribute no evidence", () => {
    ingestAll();
    for (const n of G.allNodes()) {
      expect(evaluateEvidenceForNode(n.id).supportingEvidence
        .some(i => i.relationship === "mentions")).toBe(false);
    }
  });

  it("the theme keeps its genuine story support", () => {
    ingestAll();
    const t = G.getNode("AI Compute")!;
    expect(evaluateEvidenceForNode(t.id).supportingEvidence
      .some(i => i.relationship === "supports" && i.type === "Story")).toBe(true);
  });
});

