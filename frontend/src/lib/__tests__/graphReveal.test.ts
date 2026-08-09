// graphReveal — the Workstation exhibit's progressive-reveal resolver (Surface #7, Stage 2).
// The investigation thread controls the exhibit: each beat's reveal stage narrows emphasis over
// the SAME MapVM, never removing a node and never fabricating one. Enforces: primary shows only
// the chain, evidence expands to evidence-backed branches, breaks flags the weak edges, history
// overlays prior paths ONLY when real data exists, and everything degrades honestly.

import { describe, expect, it } from "vitest";

import type { MapVM, MapNode, MapEdge, EdgeTrend } from "@/lib/causalMap";
import { computeReveal, chainNodeIds, breakingEdgeIds } from "@/lib/graphReveal";

const node = (id: string, label: string, type: string, degree: 0 | 1 | 2): MapNode => ({
  id, label, type, confidence: 70, importance: 60, relCount: 2, x: 0, y: 0, r: 5, degree, angle: 0,
});
const edge = (id: string, from: MapNode, to: MapNode, type: string, evidenceCount: number, trend: EdgeTrend): MapEdge => ({
  id, a: from.id, b: to.id, from, to, type, strength: 60, confidence: 60, evidenceCount, sources: evidenceCount,
  trend, firstObserved: 0, lastObserved: 0, pages: [],
});

const AI = node("ai", "AI Infrastructure", "Theme", 0);
const CAPEX = node("capex", "AI capex", "Macro", 1);
const NVDA = node("nvda", "NVDA", "Company", 1);
const POWER = node("power", "Power supply", "Sector", 1);
const EARN = node("earn", "NVIDIA earnings", "Story", 2);

const E1 = edge("e1", CAPEX, AI, "drives", 2, "strengthening");
const E2 = edge("e2", AI, NVDA, "exposed_to", 2, "stable");
const E3 = edge("e3", AI, POWER, "pressures", 0, "weakening");
const E4 = edge("e4", NVDA, EARN, "mentions", 3, "stable");

const MAP: MapVM = {
  available: true, nodes: [AI, CAPEX, NVDA, POWER, EARN], edges: [E1, E2, E3, E4],
  width: 960, height: 400, cx: 480, cy: 200, r1: 64, r2: 98,
};
const INPUT = { primaryChain: ["AI capex", "AI Infrastructure", "NVDA"], weakLinks: ["Power supply"] };

describe("the primary reveal shows only the causal chain", () => {
  it("restricts to the center plus the chain-named nodes, and nothing else", () => {
    const r = computeReveal(MAP, "primary", INPUT);
    expect(r.restrict).toBe(true);
    expect(new Set(r.nodeIds)).toEqual(new Set(["ai", "capex", "nvda"]));
    expect(r.nodeIds).not.toContain("power");   // weak link is not part of the primary chain
    expect(r.nodeIds).not.toContain("earn");    // evidence is not shown until the evidence beat
    expect(r.breakingEdgeIds).toEqual([]);
    expect(r.priorPathEdgeIds).toEqual([]);
  });

  it("does not restrict to nothing when the profile named no resolvable chain (honest fallback)", () => {
    const r = computeReveal(MAP, "primary", { primaryChain: ["nonexistent"], weakLinks: [] });
    expect(r.restrict).toBe(false);   // exhibit is never blanked
  });
});

describe("the evidence reveal expands only evidence-backed branches", () => {
  it("adds the nodes reachable through an edge that carries real evidence", () => {
    const r = computeReveal(MAP, "evidence", INPUT);
    expect(r.nodeIds).toContain("earn");    // NVDA -> earnings carries evidence, so it expands in
    expect(r.nodeIds).not.toContain("power"); // the power link carries no evidence, stays dim
    expect(r.breakingEdgeIds).toEqual([]);
  });
});

describe("the breaks reveal highlights the weak / invalidating edges", () => {
  it("flags exactly the weakening / pressure edge, keeping the expanded view", () => {
    const r = computeReveal(MAP, "breaks", INPUT);
    expect(r.breakingEdgeIds).toContain("e3");
    expect(r.breakingEdgeIds).not.toContain("e1");
    expect(r.breakingEdgeIds).not.toContain("e4");
    expect(r.nodeIds).toContain("earn");    // still expanded from the evidence stage
  });

  it("brings the weak-link endpoints forward so the highlighted edges connect to visible nodes", () => {
    const r = computeReveal(MAP, "breaks", INPUT);
    expect(r.nodeIds).toContain("power");   // the weak link itself must be visible at this beat
  });

  it("breakingEdgeIds is derivable directly and matches trend / type / weak-link touch", () => {
    expect(breakingEdgeIds(MAP, ["Power supply"])).toEqual(["e3"]);
  });
});

describe("the historical reveal overlays prior paths only when real data exists", () => {
  it("omits the overlay honestly when no resolved paths are supplied", () => {
    const r = computeReveal(MAP, "history", INPUT);
    expect(r.priorPathAvailable).toBe(false);
    expect(r.priorPathEdgeIds).toEqual([]);
  });

  it("overlays the prior path (and pulls in its nodes) when a real ledger provides one", () => {
    const r = computeReveal(MAP, "history", { ...INPUT, priorPaths: [{ id: "p1", label: "Q3 replay", edgeIds: ["e1", "e2"] }] });
    expect(r.priorPathAvailable).toBe(true);
    expect(r.priorPathEdgeIds).toEqual(["e1", "e2"]);
    expect(r.nodeIds).toEqual(expect.arrayContaining(["ai", "capex", "nvda"]));
  });

  it("ignores prior-path edge ids that are not in the map (no fabrication)", () => {
    const r = computeReveal(MAP, "history", { ...INPUT, priorPaths: [{ id: "p1", label: "ghost", edgeIds: ["nope"] }] });
    expect(r.priorPathAvailable).toBe(false);
    expect(r.priorPathEdgeIds).toEqual([]);
  });
});

describe("honest degradation", () => {
  it("returns a no-restriction empty reveal for an unavailable map", () => {
    const r = computeReveal({ ...MAP, available: false, nodes: [], edges: [] }, "breaks", INPUT);
    expect(r.restrict).toBe(false);
    expect(r.nodeIds).toEqual([]);
    expect(r.breakingEdgeIds).toEqual([]);
  });

  it("chainNodeIds always includes the center node", () => {
    expect(chainNodeIds(MAP, [])).toContain("ai");
  });
});
