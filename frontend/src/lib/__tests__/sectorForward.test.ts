/**
 * RC2-G2 — the Sector Forward View.
 *
 *   recorded thematic exposure, qualified by evidence support, reconciled
 *   against the sector's own measured price leadership.
 *
 * A projection, not a prediction. No model, no score, no probability.
 *
 * The rule these tests exist to protect: on a cold memory archive every theme
 * reports momentum_direction "neutral". That is ABSENCE OF HISTORY. It must
 * never be read as bearish, weakening, or evidence against a sector, and it
 * must never be manufactured into a direction.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { intelligenceGraph as G } from "../intelligenceGraph";
import { ingestThemes } from "../intelligenceGraphAdapters";
import { sectorExposure } from "../sectorTaxonomy";
import { buildSectorForwardView, forwardViewSentence, sectorPriceProxy } from "../sectorForward";
import type { Leadership } from "../marketRotation";
import type { ThemeIntelligence } from "../types";

function theme(name: string, id: string, industries: string[], over: Partial<ThemeIntelligence> = {}): ThemeIntelligence {
  return {
    id, name, description: "d", signal_strength: "strong", confidence: 70,
    momentum_direction: "neutral", related_industries: industries, related_assets: ["NVDA"],
    related_macro_factors: ["AI Capex Supercycle"], contributing_cluster_ids: [],
    contributing_story_count: 2, second_order_effects: [], podcast_topics: [],
    last_updated: "2026-08-12T00:00:00+00:00",
    signal_quality: "confirmed", evidence_count: 4, breadth_score: 3, cross_category_confirmed: true,
    ...over,
  } as unknown as ThemeIntelligence;
}

const lead = (direction: Leadership["direction"], relStrength = 1.2): Leadership =>
  ({ relStrength, direction, leadDelta: 0.2, absPct: 1.0, absent: false });
const ABSENT_LEAD: Leadership = { relStrength: 0, direction: "flat", leadDelta: 0, absPct: 0, absent: true };

function view(sector: string, themes: ThemeIntelligence[], leadership: Leadership | null) {
  return buildSectorForwardView({ sector, exposure: sectorExposure(sector), themes, leadership });
}

beforeEach(() => G.clear());

// ── Reconciliation matrix (synthetic fixtures) ──────────────────────────────

describe("reconciliation states", () => {
  it("thematic positive + rising leadership => confirmed", () => {
    const t = theme("AI Compute Arms Race", "ai", ["Semiconductors"], { momentum_direction: "bullish" });
    ingestThemes([t]);
    const v = view("Technology", [t], lead("rising"));
    expect(v.thematic.direction).toBe("positive");
    expect(v.price.direction).toBe("rising");
    expect(v.reconciliation).toBe("confirmed");
  });

  it("thematic negative + falling leadership => confirmed", () => {
    const t = theme("Real Income Compression", "ric", ["Financials"], { momentum_direction: "bearish" });
    ingestThemes([t]);
    const v = view("Financials", [t], lead("falling", -1.4));
    expect(v.thematic.direction).toBe("negative");
    expect(v.reconciliation).toBe("confirmed");
  });

  it("thematic positive + falling leadership => divergent", () => {
    const t = theme("AI Compute Arms Race", "ai", ["Semiconductors"], { momentum_direction: "bullish" });
    ingestThemes([t]);
    expect(view("Technology", [t], lead("falling")).reconciliation).toBe("divergent");
  });

  it("thematic direction with no price series => thematic-only", () => {
    const t = theme("AI Compute Arms Race", "ai", ["Semiconductors"], { momentum_direction: "bullish" });
    ingestThemes([t]);
    expect(view("Technology", [t], null).reconciliation).toBe("thematic-only");
    expect(view("Technology", [t], ABSENT_LEAD).reconciliation).toBe("thematic-only");
  });

  it("flat leadership is not disagreement => thematic-only", () => {
    const t = theme("AI Compute Arms Race", "ai", ["Semiconductors"], { momentum_direction: "bullish" });
    ingestThemes([t]);
    expect(view("Technology", [t], lead("flat")).reconciliation).toBe("thematic-only");
  });

  it("measured leadership with no exposure => price-only", () => {
    const v = view("Technology", [], lead("rising"));
    expect(v.exposure).toEqual([]);
    expect(v.reconciliation).toBe("price-only");
  });

  it("neither side sufficient => unavailable", () => {
    expect(view("Technology", [], null).reconciliation).toBe("unavailable");
    expect(view("Technology", [], lead("flat")).reconciliation).toBe("unavailable");
  });

  it("conflicting theme directions do not resolve to a majority", () => {
    const a = theme("Bull Theme", "a", ["Semiconductors"], { momentum_direction: "bullish" });
    const b = theme("Bear Theme", "b", ["Semiconductors"], { momentum_direction: "bearish" });
    const c = theme("Bull Two", "c", ["Software"], { momentum_direction: "bullish" });
    ingestThemes([a, b, c]);
    const v = view("Technology", [a, b, c], lead("rising"));
    expect(v.thematic.conflicted).toBe(true);
    expect(v.thematic.direction).toBe("unestablished");   // never "positive" by 2-to-1
    expect(v.reconciliation).toBe("price-only");
  });
});

// ── The cold-memory rule ────────────────────────────────────────────────────

describe("cold memory is absence, never bearishness", () => {
  it("all-neutral themes yield unestablished, NOT negative", () => {
    const t = theme("AI Compute Arms Race", "ai", ["Semiconductors"]);   // neutral
    ingestThemes([t]);
    const v = view("Technology", [t], null);
    expect(v.thematic.direction).toBe("unestablished");
    expect(v.thematic.direction).not.toBe("negative");
    expect(v.thematic.historyUnavailable).toBe(true);
    expect(v.thematic.basis).toEqual([]);
  });

  it("neutral themes never produce a divergent or confirmed reading", () => {
    const t = theme("AI Compute Arms Race", "ai", ["Semiconductors"]);
    ingestThemes([t]);
    for (const d of ["rising", "falling"] as const) {
      const v = view("Technology", [t], lead(d));
      expect(v.reconciliation).toBe("price-only");
      expect(["confirmed", "divergent"]).not.toContain(v.reconciliation);
    }
  });

  it("exposure and support survive even when direction does not", () => {
    const t = theme("AI Compute Arms Race", "ai", ["Semiconductors"]);
    ingestThemes([t]);
    const v = view("Technology", [t], lead("rising"));
    expect(v.exposure).toHaveLength(1);
    expect(v.exposure[0].signalQuality).toBe("confirmed");
    expect(v.exposure[0].evidenceCount).toBe(4);
    expect(v.exposure[0].breadth).toBe(3);
    expect(v.exposure[0].momentumDirection).toBe("neutral");
  });

  it("the sentence says the thematic read is unavailable, not negative", () => {
    const t = theme("AI Compute Arms Race", "ai", ["Semiconductors"]);
    ingestThemes([t]);
    const s = forwardViewSentence(view("Technology", [t], lead("rising")));
    expect(s).toMatch(/no theme carries an established direction/i);
    expect(s).not.toMatch(/bearish|weakening|negative/i);
  });
});

// ── Provenance ──────────────────────────────────────────────────────────────

describe("provenance is preserved", () => {
  it("every exposed theme names the industry that carried it", () => {
    const a = theme("AI Compute Arms Race", "ai", ["Semiconductors"]);
    const b = theme("Higher-for-Longer Repricing", "hfl", ["Software"]);
    ingestThemes([a, b]);
    const v = view("Technology", [a, b], null);
    expect(v.exposure.map(e => e.viaIndustry).sort()).toEqual(["Semiconductors", "Software"]);
    expect(v.carryingIndustries.sort()).toEqual(["Semiconductors", "Software"]);
  });

  it("never renders belongs_to as transmission", () => {
    const t = theme("AI Compute Arms Race", "ai", ["Semiconductors"]);
    ingestThemes([t]);
    const v = buildSectorForwardView({
      sector: "Technology", exposure: sectorExposure("Technology"), themes: [t],
      leadership: null, chain: ["AI Capex Supercycle", "AI Compute Arms Race", "Semiconductors"], chainVia: "Semiconductors",
    });
    expect(JSON.stringify(v)).not.toContain("belongs_to");
    expect(v.chain).toEqual(["AI Capex Supercycle", "AI Compute Arms Race", "Semiconductors"]);
    expect(v.chain).not.toContain("Technology");
  });
});

// ── Honest unavailable states ───────────────────────────────────────────────

describe("honest unavailable states", () => {
  it("Consumer stays unresolved while the source collapses Staples/Discretionary", () => {
    const t = theme("Real Income Compression", "ric", ["Consumer"]);
    ingestThemes([t]);
    const v = view("Consumer", [t], lead("rising"));
    expect(v.reconciliation).toBe("unavailable");
    expect(v.reason).toBe("ambiguous-taxonomy");
    expect(v.exposure).toEqual([]);
    expect(sectorPriceProxy("Consumer")).toBeNull();
    expect(forwardViewSentence(v)).toMatch(/unresolved at source/i);
  });

  it("a sector with no canonical exposure and no price stays unavailable", () => {
    const v = view("Communications", [], null);
    expect(v.reconciliation).toBe("unavailable");
    expect(v.exposure).toEqual([]);
    expect(forwardViewSentence(v)).toMatch(/no canonical thematic exposure/i);
  });

  it("unavailable WITH exposure never claims there is no exposure", () => {
    // exposure recorded, no theme direction (cold), no directional price
    const t = theme("AI Compute Arms Race", "ai", ["Semiconductors"]);
    ingestThemes([t]);
    const v = view("Technology", [t], lead("flat"));
    expect(v.reconciliation).toBe("unavailable");
    expect(v.exposure).toHaveLength(1);
    const s = forwardViewSentence(v);
    expect(s).not.toMatch(/no canonical thematic exposure/i);
    expect(s).toMatch(/1 recorded theme/);
    expect(s).toMatch(/no forward view can be formed/i);
  });

  it("never fills an unavailable state with invented direction", () => {
    const v = view("Healthcare", [], null);
    expect(v.thematic.direction).toBe("unestablished");
    expect(v.price.direction).toBe("unavailable");
    expect(forwardViewSentence(v)).toMatch(/unavailable/i);
  });
});

// ── Shape guarantees ────────────────────────────────────────────────────────

describe("no new model is introduced", () => {
  it("carries no score, probability, or confidence number", () => {
    const t = theme("AI Compute Arms Race", "ai", ["Semiconductors"], { momentum_direction: "bullish" });
    ingestThemes([t]);
    const v = view("Technology", [t], lead("rising"));
    const json = JSON.stringify(v);
    expect(json).not.toMatch(/"score"|"probability"|"confidence"/);
    expect(forwardViewSentence(v)).not.toMatch(/\d+%/);
  });

  it("support fields are verbatim, never blended", () => {
    const t = theme("T", "t", ["Semiconductors"], { evidence_count: 8, breadth_score: 5, signal_quality: "developing" });
    ingestThemes([t]);
    const e = view("Technology", [t], null).exposure[0];
    expect(e.evidenceCount).toBe(8);
    expect(e.breadth).toBe(5);
    expect(e.signalQuality).toBe("developing");
  });

  it("price proxies come from the frozen Market taxonomy", () => {
    expect(sectorPriceProxy("Technology")).toBe("XLK");
    expect(sectorPriceProxy("Utilities")).toBe("XLU");
    expect(sectorPriceProxy("Real Estate")).toBe("XLRE");
    expect(sectorPriceProxy("Communications")).toBe("XLC");
    expect(sectorPriceProxy("Consumer")).toBeNull();
  });

  it("is deterministic", () => {
    const t = theme("AI Compute Arms Race", "ai", ["Semiconductors"], { momentum_direction: "bullish" });
    ingestThemes([t]);
    expect(JSON.stringify(view("Technology", [t], lead("rising"))))
      .toBe(JSON.stringify(view("Technology", [t], lead("rising"))));
  });
});
