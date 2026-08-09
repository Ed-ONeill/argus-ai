// workstationView — the Workstation's investigation thread (Surface #7). Enforces the frozen
// seven-beat grammar and its laws: fixed beat order, one unique question per beat, honest
// absence, credibility-gated history, the graph reveals progressively, the causal chain lives
// ONLY in beat 2, and the View Model exposes descriptors only (no implementation/render vocab).

import { describe, expect, it } from "vitest";

import type { IntelligenceProfile } from "@/lib/intelligenceProfile";
import type { ThemeIntelligence } from "@/lib/types";
import { buildDocket, buildHistoricalRecord, buildWorkstationView, type WorkstationInputs } from "@/lib/workstationView";

const sec = <T,>(data: T | null, status: "live" | "partial" | "unavailable" = data == null ? "unavailable" : "live") => ({ status, data });

function mkProfile(over: Partial<Record<keyof IntelligenceProfile, unknown>> = {}): IntelligenceProfile {
  const base = {
    version: 1, entityKey: "ai", generatedAt: 0,
    identity: sec({ id: "ai", label: "AI Infrastructure", kind: "theme", nodeType: "Theme", aliases: [], description: "Accelerating data-center spending across hyperscalers.", causalLayer: 1, firstSeen: 0, lastSeen: 0, sources: [] }),
    thesis: sec({ headline: "Data-center spending is accelerating and broadening beyond the megacaps.", forward: null }),
    drivers: sec([]),
    transmission: sec({ stages: [{ layer: 0, caption: "Drivers", entities: ["AI capex"] }, { layer: 1, caption: "Themes", entities: ["AI Infrastructure"] }, { layer: 3, caption: "Companies", entities: ["NVDA"] }], strongestPath: ["AI capex", "AI Infrastructure", "NVDA"], upstreamCount: 1, downstreamCount: 2 }),
    beneficiaries: sec([]),
    risks: sec({ invalidation: "A downturn in hyperscaler capex guidance.", weakening: [{ id: "pwr", label: "Power supply", nodeType: "Sector", relationship: "weakens", strength: 0.3, confidence: 0.4, trend: "flat", via: null }], contradictions: [{ detail: "The memory record shows the trend cooling.", severity: 2 }] }),
    evidence: sec({ verdict: "strong", overallTrust: 80, supporting: [{ from: "NVIDIA earnings", relationship: "supports", strength: 0.8, confidence: 0.7, pages: ["Reuters", "Bloomberg", "SEC"] }, { from: "Power demand", relationship: "supports", strength: 0.5, confidence: 0.5, pages: ["Nikkei"] }], sourceBreakdown: [], totalEvidence: 4 }),
    confidence: sec({ existence: 90, conviction: 70, trust: 80, verdict: "strong", explanation: "decomposed" }),
    evolution: sec({ firstSeen: "", sessions: 2, deltas: null, lines: [], patterns: [], analogs: [] }),
    watch: sec({ items: ["Watch the next hyperscaler capex guide."] }),
    ...over,
  };
  return base as unknown as IntelligenceProfile;
}

const SUBJECT = { kind: "theme", id: "ai", label: "AI Infrastructure" };
const caseView = (over: Partial<WorkstationInputs> = {}) =>
  buildWorkstationView({ subject: SUBJECT, profile: mkProfile(), ledger: null, themes: [], ...over });

const ORDER = ["hypothesis", "transmission", "evidence", "support", "breaks", "history", "watch"];

describe("the seven-beat grammar", () => {
  it("emits exactly the frozen beat order, each with one unique question", () => {
    const v = caseView();
    expect(v.mode).toBe("case");
    expect(v.beats!.map((b) => b.id)).toEqual(ORDER);
    const qs = v.beats!.map((b) => b.question);
    expect(new Set(qs).size).toBe(7);
    for (const q of qs) expect(q.length).toBeGreaterThan(0);
  });

  it("each beat except the last hands off to the next with a transition line", () => {
    const v = caseView();
    for (const b of v.beats!.slice(0, 6)) expect(b.transitionToNext).toBeTruthy();
    expect(v.beats![6].transitionToNext).toBeNull();
  });
});

describe("the graph exhibit reveals progressively", () => {
  it("beat 2 carries the primary chain, the full stages, and the weak links as distinct descriptors", () => {
    const t = caseView().beats![1].data as { primaryChain: string[]; stages: unknown[]; weakLinks: string[] };
    expect(t.primaryChain).toEqual(["AI capex", "AI Infrastructure", "NVDA"]);   // initial reveal
    expect(t.stages).toHaveLength(3);                                            // expands as evidence is read
    expect(t.weakLinks).toEqual(["Power supply"]);                              // highlighted at "what breaks it"
  });
});

describe("evidence and support (evidence-first, no score)", () => {
  it("grades each link by independent sources", () => {
    const e = caseView().beats![2].data as { links: { link: string; strength: string; sources: number }[]; independentSources: number };
    expect(e.links[0]).toMatchObject({ link: "NVIDIA earnings", strength: "strong", sources: 3 });
    expect(e.links[1]).toMatchObject({ link: "Power demand", strength: "thin", sources: 1 });
    expect(e.independentSources).toBe(4);
  });
  it("answers 'how much supports this view' as support only — decomposed, no confidence number", () => {
    const s = caseView().beats![3].data as { level: string; supports: string[]; against: string[] };
    expect(s.level).toBe("Moderate");
    expect(s.supports.join(" ")).toMatch(/4 independent sources/);
    expect(s.against.join(" ")).toMatch(/unresolved contradiction/);
    expect(s.against.join(" ")).toMatch(/single source/);
    expect(JSON.stringify(s).toLowerCase()).not.toContain("confidence");
  });
});

describe("history is credibility-gated", () => {
  it("gates when there is no ledger or too few resolved predictions", () => {
    expect(buildHistoricalRecord(null).gated).toBe(true);
    expect(buildHistoricalRecord({ open: 3, resolved: 5, confirmed: 4, contradicted: 1 }).gated).toBe(true);
  });
  it("ungates only once enough have resolved, and always shows a gate note", () => {
    const r = buildHistoricalRecord({ open: 4, resolved: 12, confirmed: 9, contradicted: 3 });
    expect(r.gated).toBe(false);
    expect(r.note.length).toBeGreaterThan(0);
    expect(caseView().beats![5].data).toMatchObject({ gated: true });   // no ledger source in v1 -> honest gate
  });
});

describe("honesty, laws, and descriptor purity", () => {
  it("marks beats insufficient (not fabricated) when a profile section is unavailable", () => {
    const v = caseView({ profile: mkProfile({ thesis: sec(null), evidence: sec(null), watch: sec(null) }) });
    const byId = Object.fromEntries(v.beats!.map((b) => [b.id, b]));
    for (const id of ["hypothesis", "evidence", "support", "watch"]) {
      expect(byId[id].status).toBe("insufficient");
      expect(byId[id].data).toBeNull();
    }
  });

  it("keeps the causal chain in beat 2 only — no other beat explains the mechanism", () => {
    const v = caseView();
    for (const b of v.beats!) {
      if (b.id === "transmission") continue;
      expect(JSON.stringify(b.data ?? "").toLowerCase()).not.toMatch(/leads through|transmits| drives |→/);
    }
  });

  it("exposes descriptors only — no implementation or render vocabulary", () => {
    const json = JSON.stringify(caseView()).toLowerCase();
    for (const banned of ["explorergraph", "usearg", "hook", "component", "react", "svg", "canvas", "classname", ".tsx", "overalltrust", "conviction:", "momentum"]) {
      expect(json, `leaked ${banned}`).not.toContain(banned);
    }
  });

  it("docket mode lists subjects worth investigating, ranked, with a plain reason", () => {
    const themes = [
      { id: "t1", name: "AI Infrastructure", momentum_delta: 2, momentum_label: "stable", signal_quality: "confirmed" },
      { id: "t2", name: "Rate Cuts", momentum_delta: 9, momentum_label: "accelerating", signal_quality: "confirmed" },
    ] as unknown as ThemeIntelligence[];
    const d = buildDocket(themes);
    expect(d[0]).toMatchObject({ id: "t2", label: "Rate Cuts", reason: "gaining ground" });   // biggest change first
    const v = buildWorkstationView({ subject: null, profile: null, ledger: null, themes });
    expect(v.mode).toBe("docket");
    expect(v.beats).toBeNull();
  });
});
