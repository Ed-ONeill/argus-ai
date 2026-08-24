/**
 * RC2-G5.1 — the shape RC2-G5's tests missed.
 *
 * G5 was validated only against a COLD archive, where every theme has
 * momentum_delta 0. predictSectorRotation then returns found:false, the Sector
 * thesis is `unavailable`, and the composition ran. In PRODUCTION the archive
 * has accrued: momentum is non-zero, predictSectorRotation resolves, the thesis
 * becomes `partial` with a forward and a NULL headline - and buildHypothesis's
 * `headline ?? identity.label` fallback returned the subject's own name,
 * "Energy", short-circuiting the composition entirely.
 *
 * A subject label by itself is never a hypothesis.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { intelligenceGraph as G } from "../intelligenceGraph";
import { ingestThemes, ingestStories } from "../intelligenceGraphAdapters";
import { buildIntelligenceProfile, type IntelligenceProfile } from "../intelligenceProfile";
import { predictSectorRotation } from "../predictionEngine";
import { buildWorkstationView, buildHypothesis } from "../workstationView";
import { buildSectorForwardView } from "../sectorForward";
import { sectorExposure, industriesOfSector } from "../sectorTaxonomy";
import type { ThemeIntelligence } from "../types";

/** momentum drives predictSectorRotation; non-zero == a warm memory archive. */
function theme(name: string, id: string, inds: string[], momentum: number): ThemeIntelligence {
  return {
    id, name, description: "d", signal_strength: "strong", confidence: 80,
    momentum_direction: momentum > 0 ? "bullish" : "neutral",
    related_industries: inds, related_assets: ["NVDA"],
    related_macro_factors: ["Power Load Growth"], contributing_cluster_ids: [],
    contributing_story_count: 2, second_order_effects: [], podcast_topics: [],
    last_updated: "2026-08-13T00:00:00+00:00", momentum_delta: momentum,
    signal_quality: "confirmed", evidence_count: 4, breadth_score: 3, cross_category_confirmed: true,
  } as unknown as ThemeIntelligence;
}

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
  return { profile, beat: (id: string) => beats.find((b) => b.id === id)! };
}

const WARM = [theme("Grid Bottleneck Trade", "grid", ["Energy"], 12)];
const COLD = [theme("Grid Bottleneck Trade", "grid", ["Energy"], 0)];
const TECH_WARM = [
  theme("AI Compute Arms Race", "ai", ["Semiconductors", "Software"], 14),
  theme("Silicon Sovereignty", "sil", ["Semiconductors"], 9),
];

/** An observed Feed story — provenance the RC2-E1 rule admits as evidence. */
const story = (id: string, title: string, entities: string[]) => ({
  id, primary: { id, title, url: `https://x/${id}`, source: "Reuters", category: "Markets",
    published: "1h ago", signal_score: 85, signal_strength: "strong",
    affected_entities: entities, summary: "", why_it_matters: "", impact: "", snippet: "" },
  related: [], cluster_score: 0.9, theme_label: title, story_count: 1,
});

beforeEach(() => G.clear());

describe("warm memory: a Sector with a recorded forward and no headline", () => {
  /**
   * RC2-E2 SUPERSEDES the three confidence-0 assertions in this block.
   *
   * G5.1 mitigated zero-confidence forward views in COPY - it let the forward
   * through and worded it carefully ("confidence not established", "Recorded
   * rotation: rotating in"). E2 removes zero-confidence forward views at the
   * canonical projection boundary, so that mitigation is unreachable: there is
   * no forward object left to describe.
   *
   * A deliberate semantic supersession, not a weakened test. G5.1's purpose is
   * preserved and still asserted here: a bare entity label is never a
   * hypothesis, a substantive hypothesis is still composed from the canonical
   * chain / sectorForward when those have real backing, and same-label
   * provenance suppression is untouched. The positive control at the end of the
   * file proves a sector with POSITIVE confidence still renders its rotation
   * clause.
   */
  it("a zero-confidence forward is withheld entirely (RC2-E2)", () => {
    ingestThemes(WARM);
    const { profile } = caseFor("Energy", WARM);
    // WARM is ontology-only: after E1 the Sector node has no admissible evidence,
    // so predictSectorRotation's confidence is 0 and E2 withholds the projection.
    expect(profile.thesis.data?.forward ?? null).toBeNull();
    expect(profile.thesis.status).toBe("unavailable");
    expect(profile.thesis.data?.headline ?? null).toBeNull();
  });

  it("NEVER renders the bare subject label as the hypothesis", () => {
    ingestThemes(WARM);
    const h = caseFor("Energy", WARM).beat("hypothesis");
    const d = h.data as { statement: string };
    expect(d.statement).not.toBe("Energy");
    expect(d.statement.split(/\s+/).length).toBeGreaterThan(3);
  });

  it("composes from the canonical chain and forward state instead", () => {
    ingestThemes(WARM);
    const d = caseFor("Energy", WARM).beat("hypothesis").data as { statement: string; basis: string | null };
    expect(d.statement).toMatch(/Testing whether/);
    expect(d.statement).toContain("Grid Bottleneck Trade");
    expect(d.basis).toMatch(/Power Load Growth/);
  });

  it("emits NO recorded-rotation clause when the only forward carries zero confidence", () => {
    // G5.1 asserted this clause was PRESENT. E2 withholds the forward that
    // produced it, so it must now be absent rather than carefully worded.
    ingestThemes(WARM);
    const d = caseFor("Energy", WARM).beat("hypothesis").data as { basis: string | null };
    expect(d.basis ?? "").not.toMatch(/Recorded rotation: rotating (in|out)/);
  });

  it("needs no 'confidence not established' wording - the forecast itself is withheld", () => {
    // The G5.1 mitigation is unreachable under E2: there is no zero-confidence
    // forward left to caveat. What must never appear is a bare confidence-0 read.
    ingestThemes(WARM);
    const { profile } = caseFor("Energy", WARM);
    const d = caseFor("Energy", WARM).beat("hypothesis").data as { basis: string | null };
    expect(profile.thesis.data?.forward ?? null).toBeNull();
    expect(d.basis ?? "").not.toMatch(/confidence 0/);
    expect(d.basis ?? "").not.toMatch(/confidence not established/);
  });

  it("cold memory still composes identically (no regression)", () => {
    ingestThemes(COLD);
    const { profile } = caseFor("Energy", COLD);
    expect(profile.thesis.status).toBe("unavailable");
    const d = caseFor("Energy", COLD).beat("hypothesis").data as { statement: string };
    expect(d.statement).toMatch(/Testing whether/);
  });

  it("Technology keeps Semiconductors/Software provenance under warm memory", () => {
    ingestThemes(TECH_WARM);
    const d = caseFor("Technology", TECH_WARM).beat("hypothesis").data as { statement: string };
    expect(d.statement).not.toBe("Technology");
    expect(d.statement).toMatch(/Semiconductors|Software/);
  });

  it("stays insufficient when nothing is recorded, even warm", () => {
    ingestThemes(TECH_WARM);
    expect(caseFor("Healthcare", TECH_WARM).beat("hypothesis").status).toBe("insufficient");
  });

  it("a recorded narrative still wins over everything", () => {
    ingestThemes(WARM);
    const p = buildIntelligenceProfile("Energy", {
      kindHint: "sector", narrative: { headline: "An injected narrative.", nextWatch: "x" },
    });
    expect(buildHypothesis(p, null)?.statement).toBe("An injected narrative.");
  });

  it("a forward with no canonical exposure states the direction, not the label", () => {
    ingestThemes(WARM);
    const p = buildIntelligenceProfile("Energy", { kindHint: "sector" });
    const h = buildHypothesis(p, { forward: null, chain: null, viaIndustry: null });
    if (h) {
      expect(h.statement).not.toBe("Energy");
      expect(h.statement).toMatch(/Testing whether Energy keeps/);
    }
  });
});

// ── Fix 2: same-label provenance ────────────────────────────────────────────

describe("same-label provenance is not shown as circular", () => {
  it("Energy does not read 'carried by Energy'", () => {
    ingestThemes(WARM);
    const d = caseFor("Energy", WARM).beat("transmission").data as { reading: string; viaIndustry: string | null };
    expect(d.reading).not.toContain("carried by Energy");
    expect(d.reading).toMatch(/leads through to/);
  });

  it("but the typed Industry provenance is PRESERVED in the VM", () => {
    ingestThemes(WARM);
    const d = caseFor("Energy", WARM).beat("transmission").data as { viaIndustry: string | null };
    expect(d.viaIndustry).toBe("Energy");   // not collapsed, not deleted
  });

  it("Technology also drops the redundant clause - the chain already ends there", () => {
    ingestThemes(TECH_WARM);
    const d = caseFor("Technology", TECH_WARM).beat("transmission").data as { reading: string; viaIndustry: string | null; primaryChain: string[] };
    // RC2-G6: the carrier is inside the rendered chain (which may continue to a
    // Company), so naming it again is redundant.
    expect(d.primaryChain).toContain(d.viaIndustry);
    expect(d.reading).not.toContain("carried by");
  });

  it("Technology PRESERVES the typed carrier in the VM regardless", () => {
    ingestThemes(TECH_WARM);
    const d = caseFor("Technology", TECH_WARM).beat("transmission").data as { viaIndustry: string | null };
    expect(["Semiconductors", "Software"]).toContain(d.viaIndustry);
  });

  it("neither Energy nor Technology renders a self-repeating carrier clause", () => {
    for (const [sector, themes] of [["Energy", WARM], ["Technology", TECH_WARM]] as const) {
      G.clear();
      ingestThemes(themes as ThemeIntelligence[]);
      const d = caseFor(sector, themes as ThemeIntelligence[]).beat("transmission").data as { reading: string; viaIndustry: string | null };
      expect(d.reading).not.toContain(`carried by ${d.viaIndustry}`);
      expect(d.viaIndustry).toBeTruthy();
    }
  });
});

// ── RC2-E2 positive control ─────────────────────────────────────────────────

/**
 * The counterpart to the supersession above: E2 withholds ZERO-confidence
 * forwards, not all forwards. A sector with genuinely observed backing still
 * produces a forward view AND still renders its recorded-rotation clause, so
 * G5.1's warm-memory behaviour survives wherever the confidence is real.
 */
describe("a sector with POSITIVE confidence keeps its forward and rotation clause", () => {
  /** Observed Feed stories on the sector label give the Sector node real evidence. */
  const observedEnergy = () => {
    ingestThemes(WARM);
    ingestStories([
      story("s1", "Energy grid strain deepens", ["Energy"]),
      story("s2", "Utilities capex surges", ["Energy"]),
      story("s3", "Power demand hits records", ["Energy"]),
    ] as never, WARM);
  };

  it("the engine reports positive confidence", () => {
    observedEnergy();
    const p = predictSectorRotation("Energy");
    expect(p.found).toBe(true);
    expect(p.confidence).toBeGreaterThan(0);
  });

  it("the forward view is projected, not withheld", () => {
    observedEnergy();
    const f = buildIntelligenceProfile("Energy", { kindHint: "sector" }).thesis.data?.forward;
    expect(f).toBeTruthy();
    expect(f!.confidence).toBeGreaterThan(0);
    expect(f!.direction).toMatch(/rotating (in|out)/);
  });

  it("the recorded-rotation clause is preserved (G5.1 behaviour intact)", () => {
    observedEnergy();
    const d = caseFor("Energy", WARM).beat("hypothesis").data as { basis: string | null };
    expect(d.basis ?? "").toMatch(/Recorded rotation: rotating (in|out)/);
  });

  it("the hypothesis is still never a bare label (G5.1 purpose preserved)", () => {
    observedEnergy();
    const d = caseFor("Energy", WARM).beat("hypothesis").data as { statement: string };
    expect(d.statement).not.toBe("Energy");
    expect(d.statement.split(/\s+/).length).toBeGreaterThan(3);
  });
});
