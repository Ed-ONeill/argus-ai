/**
 * RC2-G5 fix 1 — `belongs_to` is STRUCTURAL and can never be evidence.
 *
 * The Industry -> Sector hop says where a node sits in the taxonomy. It asserts
 * nothing about whether a view is supported. Counting it made a sector's own
 * child industry its single strongest "supporting evidence" at strength 100 and
 * inflated verdicts to `strong` on structure alone. Worse, on Energy - where the
 * Industry and Sector share a display label - it rendered as the sector
 * supporting ITSELF.
 *
 * These tests pin it out of every evidence output: items, source lists, support
 * counts, evidence counts, and the verdict.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { intelligenceGraph as G } from "../intelligenceGraph";
import { ingestThemes } from "../intelligenceGraphAdapters";
import { evaluateEvidenceForNode } from "../evidenceEngine";
import { industriesOfSector } from "../sectorTaxonomy";
import type { ThemeIntelligence } from "../types";

function theme(name: string, id: string, industries: string[]): ThemeIntelligence {
  return {
    id, name, description: "d", signal_strength: "strong", confidence: 70,
    momentum_direction: "neutral", related_industries: industries, related_assets: ["NVDA"],
    related_macro_factors: ["AI Capex Supercycle"], contributing_cluster_ids: [],
    contributing_story_count: 2, second_order_effects: [], podcast_topics: [],
    last_updated: "2026-08-12T00:00:00+00:00",
  } as unknown as ThemeIntelligence;
}

const evidenceFor = (sector: string) => {
  const n = G.getNodeOfType(sector, "Sector")!;
  return evaluateEvidenceForNode(n.id);
};

beforeEach(() => G.clear());

describe("belongs_to cannot contribute to evidence", () => {
  it("never appears as a supporting evidence item", () => {
    ingestThemes([theme("AI Compute Arms Race", "ai", ["Semiconductors"])]);
    const ev = evidenceFor("Technology");
    expect(ev.supportingEvidence.some((e) => e.relationship === "belongs_to")).toBe(false);
    expect(ev.contradictions.some((c) => /belongs_to/.test(c.detail))).toBe(false);
  });

  it("never appears in the source/outlet list", () => {
    ingestThemes([theme("AI Compute Arms Race", "ai", ["Semiconductors", "Software"])]);
    const ev = evidenceFor("Technology");
    const froms = ev.supportingEvidence.map((e) => e.from);
    expect(froms).not.toContain("Semiconductors");
    expect(froms).not.toContain("Software");
  });

  it("a sector whose ONLY edges are structural has no evidence at all", () => {
    ingestThemes([theme("AI Compute Arms Race", "ai", ["Semiconductors"])]);
    const ev = evidenceFor("Technology");
    // Technology's only inbound edge is belongs_to from Semiconductors.
    expect(ev.supportingEvidence).toHaveLength(0);
    expect(ev.verdict).toBe("insufficient_signal");
  });

  it("structure alone can never produce a strong verdict", () => {
    // Five industries all belonging to one sector: five strength-100 edges.
    ingestThemes([
      theme("A", "a", ["Semiconductors"]), theme("B", "b", ["Software"]),
      theme("C", "c", ["Crypto & Digital Assets"]),
    ]);
    const ev = evidenceFor("Technology");
    expect(["strong", "moderate"]).not.toContain(ev.verdict);
  });

  it("does not inflate evidence or independent-source counts", () => {
    ingestThemes([theme("AI Compute Arms Race", "ai", ["Semiconductors", "Software"])]);
    const ev = evidenceFor("Technology");
    expect(ev.supportingEvidence.reduce((s, e) => s + e.evidenceCount, 0)).toBe(0);
    expect(ev.sourceBreakdown ?? []).toHaveLength(0);
  });

  it("Energy: the sector can never appear as its own supporting evidence", () => {
    // Energy is the decisive case - Industry("Energy") and Sector("Energy")
    // share a label, so a type-blind read renders the sector supporting itself.
    ingestThemes([theme("Grid Bottleneck Trade", "grid", ["Energy"])]);
    const ev = evidenceFor("Energy");
    expect(ev.supportingEvidence.some((e) => e.from === "Energy")).toBe(false);
    expect(industriesOfSector("Energy")).toContain("Energy");   // the collision is real
  });

  it("genuine evidence still counts - the exclusion is surgical", () => {
    ingestThemes([theme("AI Compute Arms Race", "ai", ["Semiconductors"])]);
    // The INDUSTRY carries real Theme -> Industry edges and must still be scored.
    const ind = G.getNodeOfType("Semiconductors", "Industry")!;
    const ev = evaluateEvidenceForNode(ind.id);
    expect(ev.found).toBe(true);
    expect(ev.supportingEvidence.length).toBeGreaterThan(0);
    expect(ev.supportingEvidence.some((e) => e.relationship === "belongs_to")).toBe(false);
    expect(ev.supportingEvidence.some((e) => e.relationship === "affects")).toBe(true);
  });

  it("a theme's own evidence is unchanged by the exclusion", () => {
    ingestThemes([theme("AI Compute Arms Race", "ai", ["Semiconductors"])]);
    const t = G.getNode("AI Compute Arms Race")!;
    const ev = evaluateEvidenceForNode(t.id);
    expect(ev.supportingEvidence.some((e) => e.relationship === "belongs_to")).toBe(false);
    expect(ev.supportingEvidence.length).toBeGreaterThan(0);
  });
});
