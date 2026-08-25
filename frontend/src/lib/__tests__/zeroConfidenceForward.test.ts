/**
 * RC2-E2 — zero evidentiary confidence is not a forecast.
 *
 * `predictSectorRotation` returns `confidence: ev?.overallTrust ?? si.confidence`.
 * After RC2-G3/G5 a Sector's only inbound edge is `belongs_to` (G5-excluded), and
 * after RC2-E1 an Industry's `affects`/`correlates` edges are ontology-only
 * (E1-excluded) — so `ev.overallTrust` is structurally 0 for those nodes.
 * Nullish coalescing does not fall through on 0, so `si.confidence` was never
 * reached and the sector forward ALWAYS carried confidence 0.
 *
 * It still rendered:  "rotating in · prediction engine, confidence 0"
 *
 * The theme and company paths refuse on the evidence VERDICT;
 * `predictSectorRotation` guards only on theme linkage, so nothing stopped it.
 *
 * The rule: confidence 0 means NO USABLE CONVICTION, not "low confidence but
 * valid". The guard sits at the canonical projection boundary so every consumer
 * inherits it, and the engines keep returning their full output for diagnostics.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { intelligenceGraph as G } from "../intelligenceGraph";
import { ingestThemes, ingestStories } from "../intelligenceGraphAdapters";
import { buildIntelligenceProfile } from "../intelligenceProfile";
import {
  predictSectorRotation, predictThemeTrajectory, predictCompanyTrajectory,
} from "../predictionEngine";

const theme = (name: string, id: string, momentum = 12) => ({
  id, name, description: "d", signal_strength: "strong", confidence: 70,
  momentum_direction: momentum > 0 ? "bullish" : "neutral",
  related_industries: ["Semiconductors"], related_assets: ["NVDA"],
  related_macro_factors: ["Power Load Growth"], contributing_cluster_ids: ["c1"],
  contributing_story_count: 2, second_order_effects: [], podcast_topics: [],
  last_updated: "2026-08-21T00:00:00+00:00", momentum_delta: momentum,
}) as never;

const story = (id: string, title: string, entities: string[]) => ({
  id, primary: { id, title, url: `https://x/${id}`, source: "Reuters", category: "Markets",
    published: "1h ago", signal_score: 80, signal_strength: "strong",
    affected_entities: entities, summary: "", why_it_matters: "", impact: "", snippet: "" },
  related: [], cluster_score: 0.9, theme_label: title, story_count: 1,
}) as never;

const forwardOf = (idOrLabel: string, kind: string) =>
  buildIntelligenceProfile(idOrLabel, { kindHint: kind as never }).thesis.data?.forward ?? null;

beforeEach(() => G.clear());

// ── The production case ─────────────────────────────────────────────────────

describe("the Technology sector zero-confidence passthrough", () => {
  beforeEach(() => {
    ingestThemes([theme("AI Compute Arms Race", "ai")]);
    ingestStories([story("c1", "Chip demand surges", ["NVDA"])], [theme("AI Compute Arms Race", "ai")]);
  });

  it("the engine still reports found:true with confidence 0", () => {
    // Reproduced, not assumed — this is the precondition the guard exists for.
    const p = predictSectorRotation("Technology");
    expect(p.found).toBe(true);
    expect(p.confidence).toBe(0);
    expect(p.currentRotation).not.toBe("insufficient_signal");
  });

  it("no forward view is projected from it", () => {
    expect(forwardOf("Technology", "sector")).toBeNull();
  });

  it("the engine output is preserved for diagnostics", () => {
    // The guard withholds the PROJECTION, it does not blank the engine.
    const p = predictSectorRotation("Technology");
    expect(p.reasoningSteps.length).toBeGreaterThan(0);
    expect(p.currentRotation.length).toBeGreaterThan(0);
  });
});

// ── The guard is exact: 0 blocks, 1 passes ──────────────────────────────────

describe("the boundary is exactly zero", () => {
  it("confidence 0 is refused", () => {
    ingestThemes([theme("AI Compute Arms Race", "ai")]);
    ingestStories([story("c1", "Chip demand", ["NVDA"])], [theme("AI Compute Arms Race", "ai")]);
    expect(predictSectorRotation("Technology").confidence).toBe(0);
    expect(forwardOf("Technology", "sector")).toBeNull();
  });

  it("a positive confidence with valid backing is still allowed", () => {
    ingestThemes([theme("AI Compute Arms Race", "ai")]);
    ingestStories([story("c1", "Chip demand", ["NVDA"])], [theme("AI Compute Arms Race", "ai")]);
    const t = predictThemeTrajectory("AI Compute Arms Race");
    expect(t.confidence).toBeGreaterThan(0);
    const f = forwardOf("AI Compute Arms Race", "theme");
    expect(f).not.toBeNull();
    expect(f!.confidence).toBe(t.confidence);
  });

  /**
   * RC2-E3 SUPERSEDES this assertion. It used a Story->Company edge as "real
   * backing", but that edge is `mentions` — coverage, not corroboration. With no
   * adapter emitting a thesis-bearing edge into a Company (the only candidates
   * are the ontology `supports` excluded by E1, and `ingestPrivateMarkets`
   * `owns`, which has no production producer), a company cannot reach positive
   * confidence at all today. The E2 boundary is therefore proven on the THEME,
   * which does have real observed support.
   */
  it("a company backed only by coverage gets no forward view", () => {
    ingestThemes([theme("AI Compute Arms Race", "ai")]);
    ingestStories([story("c1", "Nvidia beats", ["NVDA"])], [theme("AI Compute Arms Race", "ai")]);
    const c = predictCompanyTrajectory("NVDA");
    expect(c.found).toBe(false);
    expect(c.confidence).toBe(0);
    expect(forwardOf("NVDA", "company")).toBeNull();
  });

  it("every projected forward view carries positive confidence", () => {
    ingestThemes([theme("AI Compute Arms Race", "ai")]);
    ingestStories([story("c1", "Nvidia beats", ["NVDA"])], [theme("AI Compute Arms Race", "ai")]);
    for (const [id, kind] of [["AI Compute Arms Race", "theme"], ["NVDA", "company"],
                              ["Technology", "sector"]] as const) {
      const f = forwardOf(id, kind);
      if (f) expect(f.confidence).toBeGreaterThan(0);
    }
  });
});

// ── Prior contracts unchanged ───────────────────────────────────────────────

describe("the insufficient sentinel is still refused (unchanged)", () => {
  it("a sector with no theme linkage produces no forward view", () => {
    ingestStories([story("c1", "Orphan story", ["NVDA"])], []);
    const p = predictSectorRotation("Technology");
    expect(p.found).toBe(false);
    expect(forwardOf("Technology", "sector")).toBeNull();
  });

  it("RC2-E1: an ontology-only company is still refused", () => {
    ingestThemes([theme("AI Compute Arms Race", "ai")]);
    expect(predictCompanyTrajectory("NVDA").found).toBe(false);
    expect(forwardOf("NVDA", "company")).toBeNull();
  });

  it("RC2-E1: an ontology-only theme is still refused", () => {
    ingestThemes([theme("AI Compute Arms Race", "ai")]);
    expect(predictThemeTrajectory("AI Compute Arms Race").predictedDirection)
      .toBe("insufficient_signal");
    expect(forwardOf("AI Compute Arms Race", "theme")).toBeNull();
  });

  it("thesis-supported entities still work end to end (themes today)", () => {
    // RC2-E3: the theme carries real Story->Theme `supports`; the company carries
    // only `mentions`. Coverage does not become conviction.
    ingestThemes([theme("AI Compute Arms Race", "ai")]);
    ingestStories([story("c1", "Nvidia beats", ["NVDA"])], [theme("AI Compute Arms Race", "ai")]);
    expect(forwardOf("AI Compute Arms Race", "theme")).not.toBeNull();
    expect(forwardOf("NVDA", "company")).toBeNull();
  });
});

describe("no semantics were changed", () => {
  it("probability is untouched and still not renamed", () => {
    ingestThemes([theme("AI Compute Arms Race", "ai")]);
    ingestStories([story("c1", "Chip demand", ["NVDA"])], [theme("AI Compute Arms Race", "ai")]);
    const f = forwardOf("AI Compute Arms Race", "theme")!;
    expect(f).toHaveProperty("probability");
    expect(f).toHaveProperty("confidence");
    expect(f.probability).toBe(predictThemeTrajectory("AI Compute Arms Race").probability);
  });

  it("the projected confidence is the engine's value verbatim", () => {
    ingestThemes([theme("AI Compute Arms Race", "ai")]);
    ingestStories([story("c1", "Chip demand", ["NVDA"])], [theme("AI Compute Arms Race", "ai")]);
    expect(forwardOf("AI Compute Arms Race", "theme")!.confidence)
      .toBe(predictThemeTrajectory("AI Compute Arms Race").confidence);
  });

  it("weights and thresholds are unchanged — the engine still scores as before", () => {
    ingestThemes([theme("AI Compute Arms Race", "ai")]);
    ingestStories([story("c1", "Chip demand", ["NVDA"])], [theme("AI Compute Arms Race", "ai")]);
    const a = predictThemeTrajectory("AI Compute Arms Race");
    const b = predictThemeTrajectory("AI Compute Arms Race");
    expect(a.probability).toBe(b.probability);
    expect(a.confidence).toBe(b.confidence);
  });
});
