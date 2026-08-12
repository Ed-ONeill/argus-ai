/**
 * RC2-G4 — Sector consumers read the canonical hierarchy.
 *
 * Under G3 a Sector has no direct Theme neighbour: exposure arrives as
 * Theme --affects--> Industry --belongs_to--> Sector. Consumers that scanned
 * first-degree neighbours therefore reported "no active theme linkage" while
 * exposure demonstrably existed — a FALSE statement, worse than an honest empty.
 *
 * These tests bind the three migrated consumers, and the rule that the
 * structural belongs_to hop is never presented as a causal step.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { intelligenceGraph as G } from "../intelligenceGraph";
import { ingestThemes } from "../intelligenceGraphAdapters";
import { inferSector } from "../inferenceEngine";
import { buildNarrativePath } from "../narrativeTransmission";
import { buildIndustriesIntel } from "../industriesIntel";
import { cachedProfile } from "../profileCache";
import { buildRiskRead } from "../riskRead";
import { sectorExposure, industriesOfSector } from "../sectorTaxonomy";
import type { IntelligenceProfile } from "../intelligenceProfile";
import type { ThemeIntelligence } from "../types";

function theme(name: string, id: string, industries: string[], macros: string[] = [], confidence = 70): ThemeIntelligence {
  return {
    id, name, description: "d", signal_strength: "strong", confidence,
    momentum_direction: "neutral", related_industries: industries, related_assets: ["NVDA"],
    related_macro_factors: macros, contributing_cluster_ids: [], contributing_story_count: 2,
    second_order_effects: [], podcast_topics: [], last_updated: "2026-08-12T00:00:00+00:00",
  } as unknown as ThemeIntelligence;
}

/** Technology's exposure arrives only through Semiconductors / Software. */
function techWorld() {
  ingestThemes([
    theme("AI Compute Arms Race", "ai", ["Semiconductors", "Software"], ["AI Capex Supercycle"], 80),
    theme("Silicon Sovereignty", "sil", ["Semiconductors"], ["Export Controls"], 60),
  ]);
}

const industryProfilesFor = (sector: string) => {
  const m = new Map<string, IntelligenceProfile>();
  for (const ind of industriesOfSector(sector)) {
    const n = G.getNodeOfType(ind, "Industry");
    if (n) m.set(ind.toLowerCase(), cachedProfile(n.id));
  }
  return m;
};

beforeEach(() => G.clear());

// ── 1. inferSector ──────────────────────────────────────────────────────────

describe("inferSector reads through belongs_to", () => {
  it("no longer claims 'no active theme linkage' when exposure exists", () => {
    techWorld();
    const inf = inferSector("Technology");
    expect(inf.found).toBe(true);
    expect(inf.thesis).not.toMatch(/no active theme linkage/i);
    expect(inf.strengtheningThemes.length + inf.weakeningThemes.length +
           inf.exposedCompanies.length + inf.macroDrivers.length).toBeGreaterThan(0);
  });

  it("surfaces the macro drivers recorded upstream of the carrying themes", () => {
    techWorld();
    expect(inferSector("Technology").macroDrivers.length).toBeGreaterThan(0);
  });

  it("surfaces companies exposed through the carrying industries", () => {
    techWorld();
    expect(inferSector("Technology").exposedCompanies).toContain("NVDA");
  });

  it("never reports belongs_to as a relationship", () => {
    techWorld();
    const inf = inferSector("Technology");
    expect(JSON.stringify(inf)).not.toContain("belongs_to");
  });

  it("is unchanged for a non-Sector subject", () => {
    techWorld();
    const ind = G.getNodeOfType("Semiconductors", "Industry")!;
    const a = JSON.stringify(inferSector(ind.id));
    const b = JSON.stringify(inferSector(ind.id));
    expect(a).toBe(b);
    expect(inferSector(ind.id).found).toBe(true);
  });

  it("stays honest when the sector genuinely has no exposure", () => {
    techWorld();   // nothing touches Healthcare
    const inf = inferSector("Healthcare");
    expect(inf.strengtheningThemes).toEqual([]);
    expect(inf.macroDrivers).toEqual([]);
  });

  it("is deterministic across repeated reads", () => {
    techWorld();
    expect(JSON.stringify(inferSector("Technology"))).toBe(JSON.stringify(inferSector("Technology")));
  });
});

// ── 2. centralTheme via narrativeTransmission ───────────────────────────────

describe("narrative context resolves for a Sector through its industries", () => {
  it("a Sector with only hierarchical exposure still resolves a narrative", () => {
    techWorld();
    const sec = G.getNodeOfType("Technology", "Sector")!;
    const direct = G.getNeighbors(sec.id).filter(x => x.node.type === "Theme");
    expect(direct).toHaveLength(0);                      // no direct Theme edge
    const path = buildNarrativePath(sec.id);
    expect(path.found).toBe(true);                       // yet the narrative resolves
    expect(path.theme).toBeTruthy();
  });

  it("is deterministic", () => {
    techWorld();
    const a = JSON.stringify(buildNarrativePath("Technology"));
    const b = JSON.stringify(buildNarrativePath("Technology"));
    expect(a).toBe(b);
  });

  it("does not create a Theme -> Sector edge as a side effect", () => {
    techWorld();
    buildNarrativePath("Technology");
    const t2s = G.allEdges().filter(e => {
      const s = G.getNode(e.source), t = G.getNode(e.target);
      return s?.type === "Theme" && t?.type === "Sector";
    });
    expect(t2s).toHaveLength(0);
  });
});

// ── 3. buildIndustriesIntel composition ─────────────────────────────────────

describe("Industries composes exposure + industry chain + sector evidence", () => {
  function vmFor(sector: string) {
    const profiles = new Map<string, IntelligenceProfile>();
    const node = G.getNodeOfType(sector, "Sector");
    if (node) profiles.set(sector.toLowerCase(), cachedProfile(sector));
    const risks = new Map([[sector.toLowerCase(), buildRiskRead(sector)]]);
    return buildIndustriesIntel({
      sectors: [sector], themes: [
        theme("AI Compute Arms Race", "ai", ["Semiconductors", "Software"], ["AI Capex Supercycle"], 80),
        theme("Silicon Sovereignty", "sil", ["Semiconductors"], ["Export Controls"], 60),
      ],
      profiles, risks, industryProfiles: industryProfilesFor(sector), graphReady: true,
    }).sectors.data?.[0];
  }

  it("exposes themes that reach the sector only through its industries", () => {
    techWorld();
    const vm = vmFor("Technology")!;
    expect(vm.themes.map(t => t.name).sort()).toEqual(["AI Compute Arms Race", "Silicon Sovereignty"]);
  });

  it("retains viaIndustry provenance for every exposed theme", () => {
    techWorld();
    const vm = vmFor("Technology")!;
    expect(vm.themeProvenance.length).toBe(vm.themes.length);
    for (const p of vm.themeProvenance) {
      expect(["Semiconductors", "Software", "Crypto & Digital Assets"]).toContain(p.viaIndustry);
    }
  });

  it("takes the causal chain from the carrying industry and attributes it", () => {
    techWorld();
    const vm = vmFor("Technology")!;
    expect(vm.transmission).toBeTruthy();
    expect(vm.transmissionVia).toBeTruthy();
    expect(["Semiconductors", "Software"]).toContain(vm.transmissionVia!);
  });

  it("never renders belongs_to as a hop in the chain", () => {
    techWorld();
    const vm = vmFor("Technology")!;
    expect(vm.transmission ?? []).not.toContain("belongs_to");
    // the structural parent must not appear as a link in its own chain
    expect((vm.transmission ?? []).filter(x => x === "Technology")).toHaveLength(0);
  });

  it("keeps sector-owned evidence and risk on the Sector profile", () => {
    techWorld();
    const vm = vmFor("Technology")!;
    const rr = buildRiskRead("Technology");
    expect(vm.contradictions).toEqual(rr.contradictions);
    expect(vm.invalidation).toEqual(rr.invalidation ?? null);
  });

  it("does not flatten into a synthetic Sector profile — sources stay separable", () => {
    techWorld();
    const vm = vmFor("Technology")!;
    // exposure from the rollup, chain from an industry, risk from the sector
    expect(vm.themes.length).toBe(sectorExposure("Technology").themes.length);
    expect(vm.transmissionVia).not.toBe("Technology");
  });

  it("Consumer stays unresolved at sector level", () => {
    ingestThemes([theme("Real Income Compression", "ric", ["Consumer"], ["Real Wage Growth"])]);
    const vm = buildIndustriesIntel({
      sectors: ["Consumer"], themes: [theme("Real Income Compression", "ric", ["Consumer"])],
      profiles: new Map(), risks: new Map(), graphReady: true,
    }).sectors.data?.[0];
    expect(vm?.themes).toEqual([]);
    expect(vm?.themeProvenance).toEqual([]);
  });

  it("an unexposed sector yields no themes and no chain", () => {
    techWorld();
    const vm = vmFor("Healthcare");
    expect(vm?.themes ?? []).toEqual([]);
    expect(vm?.transmission ?? null).toBeNull();
  });
});
