/**
 * RC2-G3 — canonical sector/industry taxonomy.
 *
 *   Theme --affects--> Industry --belongs_to--> Sector
 *
 * The recorded ontology claim ("Semiconductors") is preserved verbatim; sector
 * exposure is DERIVED through the hierarchy. No Theme -> Sector edge is ever
 * written, no parent is inferred, and an ambiguous aggregate stays unresolved.
 *
 * Identity: Industry and Sector nodes may share a display label but must never
 * collapse into one graph node — and the existing type-blind lookups that every
 * frozen surface relies on must keep answering exactly as they did.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { intelligenceGraph as G } from "../intelligenceGraph";
import { ingestThemes, ingestStories, ingestEvents } from "../intelligenceGraphAdapters";
import {
  AMBIGUOUS_INDUSTRIES, INDUSTRY_TO_SECTOR, industriesOfSector, industryNodeId,
  isCanonicalIndustry, parentSectorOf, sectorExposure, unresolvedReason,
} from "../sectorTaxonomy";
import type { MarketEvent, ThemeIntelligence } from "../types";

function theme(name: string, id: string, industries: string[], confidence = 70): ThemeIntelligence {
  return {
    id, name, description: "d", signal_strength: "strong", confidence,
    momentum_direction: "neutral", related_industries: industries, related_assets: ["NVDA"],
    related_macro_factors: [], contributing_cluster_ids: [], contributing_story_count: 2,
    second_order_effects: [], podcast_topics: [], last_updated: "2026-08-12T00:00:00+00:00",
  } as unknown as ThemeIntelligence;
}

const industryNodes = () => G.allNodes().filter((n) => n.type === "Industry");
const belongsTo = () => G.allEdges().filter((e) => e.relationshipType === "belongs_to");
const themeToSector = () => G.allEdges().filter((e) => {
  const s = G.getNode(e.source), t = G.getNode(e.target);
  return s?.type === "Theme" && t?.type === "Sector";
});

beforeEach(() => G.clear());

// ── The contract ────────────────────────────────────────────────────────────

describe("Theme --affects--> Industry --belongs_to--> Sector", () => {
  it("records the most-specific claim on an Industry, not the parent sector", () => {
    ingestThemes([theme("AI Compute Arms Race", "ai", ["Semiconductors"])]);
    const ind = G.getNodeOfType("Semiconductors", "Industry");
    expect(ind?.type).toBe("Industry");
    const affects = G.getRelationships(ind!.id).filter((e) => e.relationshipType === "affects");
    expect(affects).toHaveLength(1);
    expect(G.getNode(affects[0].source)?.label).toBe("AI Compute Arms Race");
  });

  it("never writes a Theme -> Sector edge", () => {
    ingestThemes([
      theme("AI Compute Arms Race", "ai", ["Semiconductors", "Software"]),
      theme("Grid Bottleneck Trade", "grid", ["Utilities", "Energy"]),
    ]);
    expect(themeToSector()).toHaveLength(0);
  });

  it("links the industry to its canonical parent sector", () => {
    ingestThemes([theme("AI Compute Arms Race", "ai", ["Semiconductors"])]);
    const ind = G.getNodeOfType("Semiconductors", "Industry")!;
    const sec = G.getNodeOfType("Technology", "Sector")!;
    const edge = belongsTo().find((e) => e.source === ind.id && e.target === sec.id);
    expect(edge).toBeTruthy();
  });

  it("does not rewrite Semiconductors as Technology", () => {
    ingestThemes([theme("AI Compute Arms Race", "ai", ["Semiconductors"])]);
    expect(G.getNodeOfType("Technology", "Industry")).toBeUndefined();
    expect(industryNodes().map((n) => n.label)).toEqual(["Semiconductors"]);
  });
});

// ── Identity: label collision must not collapse ─────────────────────────────

describe("Industry and Sector identity are distinct", () => {
  const COLLIDING = ["Energy", "Utilities", "Real Estate", "Financials", "Industrials", "Healthcare"];

  it.each(COLLIDING)("Industry(%s) and its Sector coexist as separate nodes", (name) => {
    ingestThemes([theme("T", "t", [name])]);
    const ind = G.getNodeOfType(name, "Industry");
    const sec = G.getNodeOfType(name, "Sector");
    expect(ind).toBeTruthy();
    expect(sec).toBeTruthy();
    expect(ind!.id).not.toBe(sec!.id);
    expect(ind!.label).toBe(sec!.label);          // display labels may match
    expect(ind!.id).toBe(industryNodeId(name));   // canonical ids differ
  });

  it("lookup can explicitly resolve either kind", () => {
    ingestThemes([theme("T", "t", ["Energy"])]);
    expect(G.getNodeOfType("Energy", "Industry")!.type).toBe("Industry");
    expect(G.getNodeOfType("Energy", "Sector")!.type).toBe("Sector");
    expect(G.getNodeOfType("Energy", "Company")).toBeUndefined();  // never falls back across types
  });

  it("the untyped lookup stays deterministic and keeps answering with the Sector", () => {
    ingestThemes([theme("T", "t", ["Energy"])]);
    const untyped = G.getNode("Energy");
    expect(untyped?.type).toBe("Sector");
    // and it is stable across repeated ingestion order
    G.clear();
    ingestThemes([theme("A", "a", ["Energy"]), theme("B", "b", ["Energy"])]);
    expect(G.getNode("Energy")?.type).toBe("Sector");
  });

  it("the industry namespace never leaks into the global alias index", () => {
    ingestThemes([theme("T", "t", ["Semiconductors"])]);
    // Semiconductors has no Sector of that name, so an untyped read must MISS
    // rather than silently hand back the Industry.
    expect(G.getNode("Semiconductors")).toBeUndefined();
    expect(G.getNode(industryNodeId("Semiconductors"))?.type).toBe("Industry");
  });

  it("re-ingesting is idempotent — one Industry node, one belongs_to edge", () => {
    ingestThemes([theme("T", "t", ["Energy"])]);
    ingestThemes([theme("T", "t", ["Energy"])]);
    expect(industryNodes()).toHaveLength(1);
    expect(belongsTo()).toHaveLength(1);
  });
});

// ── No frozen resolution regresses ──────────────────────────────────────────

describe("frozen Company / Theme / Event resolution is unaffected", () => {
  it("Company lookup is unchanged", () => {
    ingestThemes([theme("T", "t", ["Energy"])]);
    expect(G.getNode("NVDA")?.type).toBe("Company");
    expect(G.getNodeOfType("NVDA", "Company")?.type).toBe("Company");
  });

  it("Theme lookup is unchanged", () => {
    ingestThemes([theme("Grid Bottleneck Trade", "grid", ["Utilities"])]);
    expect(G.getNode("Grid Bottleneck Trade")?.type).toBe("Theme");
  });

  it("Event identity still resolves by uid and is not absorbed", () => {
    const UID = "ev_01ABCDEFGHJKMNPQRSTVWXYZ0";
    ingestThemes([theme("Grid Bottleneck Trade", "grid", ["Utilities"])]);
    ingestEvents([{
      id: "c1", title: "Some event", event_type: "macro",
      first_seen: "2026-08-12T09:00:00+00:00", last_updated: "2026-08-12T10:00:00+00:00",
      corroboration_count: 2, source_count: 2, evidence: [], companies: [], companies_direct: [],
      industries: [], theme_ids: ["grid"], confidence: 70, editorial_score: 50,
      why_it_matters: "", transmission: null, transmission_chain: [], dominant: false,
      developing: false, reporting_period: null, merged_event_ids: [], uid: UID, cycles_observed: 1,
    } as MarketEvent], {}, [theme("Grid Bottleneck Trade", "grid", ["Utilities"])]);
    expect(G.getNode(`event:${UID}`)?.type).toBe("Event");
  });

  it("story sector labels still produce Sector nodes, not Industries", () => {
    ingestStories([{
      id: "c1",
      primary: { id: "c1", title: "A headline", url: "u", source: "s", category: "Markets",
        published: "1h ago", signal_score: 60, signal_strength: "medium",
        affected_entities: ["NVDA", "Energy"], summary: "", why_it_matters: "", impact: "", snippet: "" },
      related: [], cluster_score: 0.8, theme_label: "X", story_count: 1,
    } as never], []);
    expect(G.getNodeOfType("Energy", "Sector")?.type).toBe("Sector");
    expect(G.getNodeOfType("Energy", "Industry")).toBeUndefined();
  });
});

// ── Rollup ──────────────────────────────────────────────────────────────────

describe("sector exposure rolls up through belongs_to", () => {
  function world() {
    ingestThemes([
      theme("AI Compute Arms Race", "ai", ["Semiconductors", "Software"], 80),
      theme("Silicon Sovereignty", "sil", ["Semiconductors"], 60),
      theme("Crypto Market Structure", "cry", ["Crypto & Digital Assets"], 40),
      theme("Grid Bottleneck Trade", "grid", ["Utilities", "Energy"], 79),
      theme("NATO Rearmament Cycle", "nato", ["Aerospace & Defense"], 55),
      theme("Real Income Compression", "ric", ["Consumer"], 66),
    ]);
  }

  it("Technology aggregates its three industries without any Theme->Sector edge", () => {
    world();
    const e = sectorExposure("Technology");
    expect(e.resolved).toBe(true);
    expect(e.themes.map((t) => t.label).sort())
      .toEqual(["AI Compute Arms Race", "Crypto Market Structure", "Silicon Sovereignty"]);
    expect(e.industries).toEqual(["Crypto & Digital Assets", "Semiconductors", "Software"]);
    expect(themeToSector()).toHaveLength(0);
  });

  it("names the industry that carried each theme", () => {
    world();
    const e = sectorExposure("Technology");
    const ai = e.themes.find((t) => t.label === "AI Compute Arms Race")!;
    expect(["Semiconductors", "Software"]).toContain(ai.viaIndustry);
  });

  it("Industrials picks up Aerospace & Defense", () => {
    world();
    expect(sectorExposure("Industrials").themes.map((t) => t.label)).toContain("NATO Rearmament Cycle");
  });

  it("deduplicates a theme that names two industries of the same sector", () => {
    world();
    const e = sectorExposure("Technology");
    expect(e.themes.filter((t) => t.label === "AI Compute Arms Race")).toHaveLength(1);
  });

  it("is deterministic — ranked by recorded strength then label", () => {
    world();
    const a = sectorExposure("Technology").themes.map((t) => t.label);
    const b = sectorExposure("Technology").themes.map((t) => t.label);
    expect(a).toEqual(b);
    const strengths = sectorExposure("Technology").themes.map((t) => t.strength);
    expect([...strengths].sort((x, y) => y - x)).toEqual(strengths);
  });

  it("an absent sector node resolves to false, never to a guess", () => {
    world();
    const e = sectorExposure("Communications");
    expect(e.resolved).toBe(false);
    expect(e.themes).toEqual([]);
  });
});

// ── Consumer stays ambiguous ────────────────────────────────────────────────

describe("Consumer is withheld at sector level, preserved at industry level", () => {
  it("writes no belongs_to edge for Consumer", () => {
    ingestThemes([theme("Real Income Compression", "ric", ["Consumer"])]);
    expect(belongsTo()).toHaveLength(0);
    expect(G.getNodeOfType("Consumer", "Industry")).toBeTruthy();
  });

  it("preserves the Theme -> Industry(Consumer) relationship in full", () => {
    ingestThemes([theme("Real Income Compression", "ric", ["Consumer"])]);
    const ind = G.getNodeOfType("Consumer", "Industry")!;
    expect(G.getRelationships(ind.id).some((e) => e.relationshipType === "affects")).toBe(true);
  });

  it("reports the withheld rollup with its reason", () => {
    ingestThemes([theme("Real Income Compression", "ric", ["Consumer"])]);
    const e = sectorExposure("Consumer");
    expect(e.themes).toEqual([]);
    expect(e.withheld).toEqual([{ industry: "Consumer", reason: "ambiguous" }]);
  });

  it("parentSectorOf never guesses for an ambiguous or unknown industry", () => {
    expect(parentSectorOf("Consumer")).toBeNull();
    expect(unresolvedReason("Consumer")).toBe("ambiguous");
    expect(parentSectorOf("Not An Industry")).toBeNull();
    expect(unresolvedReason("Not An Industry")).toBe("unknown");
    expect(parentSectorOf("Semiconductors")).toBe("Technology");
  });
});

// ── Taxonomy is read from the one authority ─────────────────────────────────

describe("the taxonomy has one source", () => {
  it("covers every industry with a parent sector", () => {
    for (const [ind, sec] of INDUSTRY_TO_SECTOR) {
      expect(typeof sec).toBe("string");
      expect(isCanonicalIndustry(ind)).toBe(true);
    }
  });

  it("Technology owns exactly the three name-distinct industries", () => {
    expect([...industriesOfSector("Technology")].sort())
      .toEqual(["Crypto & Digital Assets", "Semiconductors", "Software"]);
  });

  it("only Consumer is ambiguous", () => {
    expect([...AMBIGUOUS_INDUSTRIES]).toEqual(["Consumer"]);
  });
});
