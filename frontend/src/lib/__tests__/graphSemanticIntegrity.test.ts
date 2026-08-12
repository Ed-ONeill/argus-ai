/**
 * RC2-F — graph semantic integrity.
 *
 * Two confirmed wrong-node-typing defects, both in the ingestion adapters:
 *
 *  F1  Theme nodes were minted from `cluster.theme_label`, which app/clustering.py
 *      builds from the STORY TITLE (_make_theme_label), so 73 of 88 Theme nodes
 *      were story-title pseudo-themes. Separately, `themeLabel()` cut canonical
 *      theme names at the first INTRA-WORD hyphen, renaming
 *      "Higher-for-Longer Repricing" to "Higher".
 *
 *  F2  `affected_entities` carries a curated SECTOR LABEL alongside resolved
 *      company tickers (RC2-A), and the adapters called addCompany() over the
 *      whole list — so "Banks", "Insurance", "Energy", "Defense", "Retail"
 *      existed as Company nodes.
 *
 * The contract: a node typed Theme is a canonical Argus theme; a node typed
 * Company is a company/security. Unknown stays unknown — no fabricated theme,
 * no invented company.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { intelligenceGraph as G } from "../intelligenceGraph";
import { ingestMA, ingestStories, ingestThemes, isSectorEntityLabel } from "../intelligenceGraphAdapters";
import type { ThemeIntelligence } from "../types";

function theme(name: string, id = "t1", clusters: string[] = []): ThemeIntelligence {
  return {
    id, name, description: "d", signal_strength: "strong", confidence: 70,
    momentum_direction: "bullish", related_industries: ["Utilities"], related_assets: ["NVDA"],
    related_macro_factors: [], contributing_cluster_ids: clusters,
    contributing_story_count: 2, second_order_effects: [], podcast_topics: [],
    last_updated: "2026-08-12T00:00:00+00:00",
  } as unknown as ThemeIntelligence;
}

function story(id: string, title: string, themeLabel: string, entities: string[] = []) {
  return {
    id,
    primary: {
      id, title, url: `https://x/${id}`, source: "Bloomberg Markets", category: "Markets",
      published: "2h ago", signal_score: 70, signal_strength: "strong",
      affected_entities: entities, summary: "", why_it_matters: "", impact: "", snippet: "",
    },
    related: [], cluster_score: 0.9, theme_label: themeLabel, story_count: 1,
  } as never;
}

const themeNodes = () => G.allNodes().filter((n) => n.type === "Theme");
const companyNodes = () => G.allNodes().filter((n) => n.type === "Company");
const sectorNodes = () => G.allNodes().filter((n) => n.type === "Sector");
const labels = (ns: { label: string }[]) => ns.map((n) => n.label).sort();

beforeEach(() => G.clear());

// ── F1a: canonical theme names survive intact ───────────────────────────────

describe("F1a — themeLabel must not cut at an intra-word hyphen", () => {
  const CASES: [string, string][] = [
    ["Higher-for-Longer Repricing", "Higher-for-Longer Repricing"],
    ["Non-Bank Lending Ascendancy", "Non-Bank Lending Ascendancy"],
    ["Supply-Side Energy Shock", "Supply-Side Energy Shock"],
    ["Grid Bottleneck Trade", "Grid Bottleneck Trade"],
  ];

  it.each(CASES)("keeps %s intact", (name, expected) => {
    ingestThemes([theme(name)]);
    expect(labels(themeNodes())).toEqual([expected]);
  });

  it.each(["Higher", "Non", "Supply"])("never produces the stump %s", (stump) => {
    ingestThemes([theme("Higher-for-Longer Repricing", "a"), theme("Non-Bank Lending Ascendancy", "b"),
                  theme("Supply-Side Energy Shock", "c")]);
    expect(labels(themeNodes())).not.toContain(stump);
  });

  it("still strips a real qualifier after a spaced separator", () => {
    ingestThemes([theme("Grid Bottleneck Trade - power constraints", "q1")]);
    expect(labels(themeNodes())).toEqual(["Grid Bottleneck Trade"]);
    G.clear();
    ingestThemes([theme("Grid Bottleneck Trade: power constraints", "q2")]);
    expect(labels(themeNodes())).toEqual(["Grid Bottleneck Trade"]);
  });
});

// ── F1b: story titles never become Themes ───────────────────────────────────

describe("F1b — ingestStories must not mint Theme nodes from theme_label", () => {
  const PSEUDO = [
    "Cava Sales Jump Americans…", "Deal Lakers Sold", "YOU Earnings",
    "Revenue Alico Jumps", "Insurance Deal", "Members Trump'S Cabinet Remained…",
  ];

  it.each(PSEUDO)("story-title label %s creates no Theme node", (label) => {
    ingestStories([story("c1", "Some market headline", label)], []);
    expect(themeNodes()).toHaveLength(0);
  });

  it("keeps the Story node even when the cluster label resolves to nothing", () => {
    ingestStories([story("c1", "Cava rises on sales", "Cava Sales Jump…")], []);
    expect(G.allNodes().filter((n) => n.type === "Story")).toHaveLength(1);
    expect(themeNodes()).toHaveLength(0);
  });

  it("an unthemed story stays unthemed rather than getting a fabricated theme", () => {
    ingestThemes([theme("Grid Bottleneck Trade", "grid")]);
    const before = themeNodes().length;
    ingestStories([story("c9", "Unrelated headline", "Unrelated Headline Words")], [theme("Grid Bottleneck Trade", "grid")]);
    expect(themeNodes()).toHaveLength(before);
  });

  it("RESOLVES a cluster label that IS a canonical theme to the canonical node", () => {
    const t = theme("Grid Bottleneck Trade", "grid");
    ingestThemes([t]);
    ingestStories([story("c2", "Power demand headline", "Grid Bottleneck Trade")], [t]);
    expect(labels(themeNodes())).toEqual(["Grid Bottleneck Trade"]);
    const th = G.getNode("Grid Bottleneck Trade")!;
    const rels = G.getRelationships(th.id).map((r) => r.relationshipType);
    expect(rels).toContain("supports");
  });

  it("resolves a canonical theme whose name was hyphenated (no stump, no duplicate)", () => {
    const t = theme("Higher-for-Longer Repricing", "hfl");
    ingestThemes([t]);
    ingestStories([story("c3", "Rates headline", "Higher-for-Longer Repricing")], [t]);
    expect(labels(themeNodes())).toEqual(["Higher-for-Longer Repricing"]);
  });

  it("preserves canonical Story->Theme links via contributing_cluster_ids", () => {
    const t = theme("Grid Bottleneck Trade", "grid", ["c4"]);
    ingestThemes([t]);
    ingestStories([story("c4", "Power headline", "Some Story Title Label")], [t]);
    const th = G.getNode("Grid Bottleneck Trade")!;
    expect(G.getRelationships(th.id).length).toBeGreaterThan(0);
    expect(labels(themeNodes())).toEqual(["Grid Bottleneck Trade"]);
  });

  it("matching is exact, never fuzzy — a near-miss label creates nothing", () => {
    const t = theme("Grid Bottleneck Trade", "grid");
    ingestThemes([t]);
    const before = themeNodes().length;
    ingestStories([story("c5", "h", "Grid Bottleneck")], [t]);        // prefix only
    ingestStories([story("c6", "h", "Grid Bottleneck Trades")], [t]); // plural
    expect(themeNodes()).toHaveLength(before);
  });
});

// ── F2: sector labels are Sectors, not Companies ────────────────────────────

describe("F2 — the entity channel is typed, not blindly company-ified", () => {
  const BAD = ["Banks", "Insurance", "Energy", "Defense", "Retail"];

  it.each(BAD)("%s never becomes a Company node via a story", (label) => {
    ingestStories([story("c1", "A headline", "Label", ["NVDA", label])], []);
    expect(labels(companyNodes())).not.toContain(label);
    expect(labels(sectorNodes())).toContain(label);
  });

  it.each(BAD)("%s never becomes a Company node via a deal", (label) => {
    ingestMA([{
      id: "d1", title: "Acme buys Beta", url: "u", source: "FT Deals", published: "1h ago",
      entities: ["NVDA", label], dealType: "strategic", sector: "Technology", peFirm: null,
      signalScore: 70, summary: "", whyItMatters: "",
    } as never], []);
    expect(labels(companyNodes())).not.toContain(label);
  });

  it("keeps legitimate companies in the same list", () => {
    ingestStories([story("c1", "A headline", "Label", ["NVDA", "Energy"])], []);
    expect(labels(companyNodes())).toContain("NVDA");
  });

  it("does not invent a node for an empty entity value", () => {
    ingestStories([story("c1", "A headline", "Label", ["", "  "])], []);
    expect(companyNodes()).toHaveLength(0);
    expect(sectorNodes()).toHaveLength(0);
  });

  it("a sector label is never used as an acquirer or target", () => {
    ingestMA([{
      id: "d1", title: "Deal", url: "u", source: "FT Deals", published: "1h ago",
      entities: ["Banks", "NVDA"], dealType: "strategic", sector: "Technology", peFirm: null,
      signalScore: 70, summary: "", whyItMatters: "",
    } as never], []);
    const acquires = G.allEdges().filter((e) => e.relationshipType === "acquires");
    for (const e of acquires) {
      expect(G.getNode(e.source)?.type).not.toBe("Sector");
      expect(G.getNode(e.target)?.type).not.toBe("Sector");
    }
  });

  it("isSectorEntityLabel covers exactly the curated backend labels", () => {
    for (const l of BAD) expect(isSectorEntityLabel(l)).toBe(true);
    expect(isSectorEntityLabel("NVDA")).toBe(false);
    expect(isSectorEntityLabel("Nvidia")).toBe(false);
  });
});
