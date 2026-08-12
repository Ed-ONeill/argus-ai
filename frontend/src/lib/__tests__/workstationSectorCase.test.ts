/**
 * RC2-G5 fixes 3 + 4 — the Workstation reads the canonical hierarchy.
 *
 * A Sector subject previously read its own profile, which collapsed
 * "Power Load Growth -> Grid Bottleneck Trade -> Semiconductors" into
 * "Grid Bottleneck Trade -> Technology" (macro head and carrying industry both
 * lost), and its hypothesis was ALWAYS insufficient because
 * intelligenceProfile supplies a forward view only for company/etf/theme/driver.
 *
 * The chain now comes from the carrying Industry with viaIndustry provenance,
 * and the hypothesis is COMPOSED from two recorded projections - the canonical
 * chain and the RC2-G2 forward state. No new inference, no scoring.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { intelligenceGraph as G } from "../intelligenceGraph";
import { ingestThemes } from "../intelligenceGraphAdapters";
import { buildIntelligenceProfile, type IntelligenceProfile } from "../intelligenceProfile";
import { buildWorkstationView, buildHypothesis, buildTransmission } from "../workstationView";
import { buildSectorForwardView } from "../sectorForward";
import { sectorExposure, industriesOfSector } from "../sectorTaxonomy";
import type { ThemeIntelligence } from "../types";

function theme(name: string, id: string, industries: string[], macros: string[] = ["Power Load Growth"]): ThemeIntelligence {
  return {
    id, name, description: "d", signal_strength: "strong", confidence: 80,
    momentum_direction: "neutral", related_industries: industries, related_assets: ["NVDA"],
    related_macro_factors: macros, contributing_cluster_ids: [], contributing_story_count: 2,
    second_order_effects: [], podcast_topics: [], last_updated: "2026-08-12T00:00:00+00:00",
    signal_quality: "confirmed", evidence_count: 4, breadth_score: 3, cross_category_confirmed: true,
  } as unknown as ThemeIntelligence;
}

const THEMES = [
  theme("AI Compute Arms Race", "ai", ["Semiconductors", "Software"]),
  theme("Silicon Sovereignty", "sil", ["Semiconductors"]),
];

function caseFor(sector: string, themes: ThemeIntelligence[]) {
  const profile = buildIntelligenceProfile(sector, { kindHint: "sector" });
  const forward = buildSectorForwardView({ sector, exposure: sectorExposure(sector), themes, leadership: null });
  const industryProfiles = new Map<string, IntelligenceProfile>();
  for (const ind of industriesOfSector(sector)) {
    const n = G.getNodeOfType(ind, "Industry");
    if (n) industryProfiles.set(ind.toLowerCase(), buildIntelligenceProfile(n.id, { kindHint: "sector" }));
  }
  const view = buildWorkstationView({
    subject: { kind: "sector", id: sector, label: sector },
    profile, ledger: null, themes, industryProfiles, forward,
  });
  const beats = (view as unknown as { beats: { id: string; status: string; data: unknown }[] }).beats;
  return { view, beat: (id: string) => beats.find((b) => b.id === id)! };
}

beforeEach(() => G.clear());

// ── Transmission ────────────────────────────────────────────────────────────

describe("Workstation transmission for a Sector", () => {
  it("Technology shows the TRUE chain through its carrying industry", () => {
    ingestThemes(THEMES);
    const t = caseFor("Technology", THEMES).beat("transmission");
    expect(t.status).toBe("present");
    const d = t.data as { primaryChain: string[]; viaIndustry: string | null; reading: string };
    expect(["Semiconductors", "Software"]).toContain(d.viaIndustry);
    expect(d.primaryChain[d.primaryChain.length - 1]).toBe(d.viaIndustry);
    expect(d.reading).toContain("carried by");
  });

  it("the macro head is preserved, not collapsed to Theme -> Sector", () => {
    ingestThemes(THEMES);
    const d = caseFor("Technology", THEMES).beat("transmission").data as { primaryChain: string[] };
    expect(d.primaryChain[0]).toBe("Power Load Growth");
    expect(d.primaryChain).not.toContain("Technology");   // the sector is not a hop
  });

  it("belongs_to is never a link in the chain", () => {
    ingestThemes(THEMES);
    const d = caseFor("Technology", THEMES).beat("transmission").data as { primaryChain: string[] };
    expect(d.primaryChain).not.toContain("belongs_to");
  });

  it("Energy resolves through its own same-named industry without self-reference", () => {
    const e = [theme("Grid Bottleneck Trade", "grid", ["Energy"])];
    ingestThemes(e);
    const d = caseFor("Energy", e).beat("transmission").data as { primaryChain: string[]; viaIndustry: string | null };
    expect(d.viaIndustry).toBe("Energy");
    expect(d.primaryChain[0]).toBe("Power Load Growth");
    expect(d.primaryChain.filter((x) => x === "Energy")).toHaveLength(1);   // industry only, not twice
  });

  it("weak links stay the SUBJECT's own recorded risks", () => {
    ingestThemes(THEMES);
    const d = caseFor("Technology", THEMES).beat("transmission").data as { weakLinks: string[] };
    expect(d.weakLinks).toEqual([]);   // no negative edges exist; honest empty
  });

  it("falls back to the subject's own path when no industry profile is supplied", () => {
    ingestThemes(THEMES);
    const p = buildIntelligenceProfile("Technology", { kindHint: "sector" });
    const t = buildTransmission(p, null);
    expect(t?.viaIndustry).toBeNull();
  });
});

// ── Hypothesis ──────────────────────────────────────────────────────────────

describe("Workstation hypothesis for a Sector", () => {
  it("Technology composes a real question instead of the bare label", () => {
    ingestThemes(THEMES);
    const h = caseFor("Technology", THEMES).beat("hypothesis");
    expect(h.status).toBe("present");
    const d = h.data as { statement: string; basis: string | null };
    expect(d.statement).not.toBe("Technology");
    expect(d.statement).toMatch(/Testing whether/);
    expect(d.statement).toMatch(/Semiconductors|Software/);      // provenance kept
    expect(d.statement).toContain("Technology");                  // the sector under test
  });

  it("the basis cites the recorded chain and support, with no score", () => {
    ingestThemes(THEMES);
    const d = caseFor("Technology", THEMES).beat("hypothesis").data as { basis: string | null };
    expect(d.basis).toMatch(/Power Load Growth/);
    expect(d.basis).toMatch(/recorded theme/);
    expect(d.basis).toMatch(/confirmed/);
    expect(d.basis).not.toMatch(/\d+%/);
  });

  it("cold memory is reported as no established direction, never as bearish", () => {
    ingestThemes(THEMES);
    const d = caseFor("Technology", THEMES).beat("hypothesis").data as { basis: string | null };
    expect(d.basis).toMatch(/no established thematic direction|no price confirmation|no directional price/);
    expect(d.basis).not.toMatch(/bearish|weakening/);
  });

  it("stays INSUFFICIENT when there is nothing recorded to test", () => {
    ingestThemes(THEMES);                      // nothing touches Healthcare
    const h = caseFor("Healthcare", THEMES).beat("hypothesis");
    expect(h.status).toBe("insufficient");
    expect(h.data).toBeNull();
  });

  it("stays INSUFFICIENT for an ambiguous sector rather than inventing one", () => {
    const c = [theme("Real Income Compression", "ric", ["Consumer"])];
    ingestThemes(c);
    expect(caseFor("Consumer", c).beat("hypothesis").status).toBe("insufficient");
  });

  it("a recorded narrative still wins over the composition", () => {
    ingestThemes(THEMES);
    const p = buildIntelligenceProfile("Technology", {
      kindHint: "sector",
      narrative: { headline: "An injected page narrative.", nextWatch: "x" },
    });
    const h = buildHypothesis(p, { forward: null, chain: null, viaIndustry: null });
    expect(h?.statement).toBe("An injected page narrative.");
  });

  it("is deterministic", () => {
    ingestThemes(THEMES);
    const a = JSON.stringify(caseFor("Technology", THEMES).beat("hypothesis"));
    const b = JSON.stringify(caseFor("Technology", THEMES).beat("hypothesis"));
    expect(a).toBe(b);
  });
});
