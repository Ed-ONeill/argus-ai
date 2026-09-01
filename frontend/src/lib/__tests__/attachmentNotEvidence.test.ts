/**
 * RC2-L3 — a data attachment is not a thesis claim, and excluding it UNMASKS the
 * direction the adapter already encodes.
 *
 * `observationGraphBridge` links provider observations onto the entity they
 * describe: `has_market_metric`, `has_financial_metric`, `transacted`. All three
 * say "this datum belongs to this entity"; none asserts a direction. The bridge
 * says so itself — `handleMarket` is documented "Purely descriptive: no bullish or
 * bearish inference from a price move", and its module header states "When
 * direction is ambiguous it uses mentions or correlates rather than inventing a
 * claim". The bridge's representation was already more precise than the evidence
 * engine's, which assigned +1 through the `NEGATIVE_REL.has(...) ? -1 : 1`
 * fall-through.
 *
 * Measured before this change — opposite states were indistinguishable:
 *
 *   price   +7.1%  -> moderate, trust 46, +[has_market_metric]
 *   price   -8.2%  -> moderate, trust 46, +[has_market_metric]      IDENTICAL
 *   revenue +200   -> moderate, trust 54, +[has_financial_metric]
 *   revenue -200   -> moderate, trust 54, +[has_financial_metric]   IDENTICAL
 *   insider BUY / SELL / UNKNOWN -> all moderate, trust 54, +[transacted],
 *                                   contradictingEvidence EMPTY on the SELL
 *
 * That last line is the defect this slice really fixes. `handleInsider` derives
 * direction from deterministic SEC Form 4 fields and already writes CLASSIFIED
 * verbs beside the bare fact (buy -> owns + supports, sell -> weakens, unknown ->
 * mentions). But `transacted` is linked FIRST and `admissibleNeighbors` keeps the
 * first ADMISSIBLE edge per neighbour, so it masked the directional edge and an
 * insider SALE read as positive support.
 *
 * These tests therefore run the REAL bridge, not hand-built edges, so they prove
 * L3 restores a distinction the adapter already encodes.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { intelligenceGraph as G } from "../intelligenceGraph";
import {
  ingestProviderObservations, clearMarketObservationCache,
} from "../dataAdapters/observationGraphBridge";
import { ingestThemes, ingestStories } from "../intelligenceGraphAdapters";
import { evaluateEvidenceForNode } from "../evidenceEngine";
import { predictThemeTrajectory } from "../predictionEngine";

/** A well-formed ProviderObservation, as the real providers emit them. */
const obs = (o: Record<string, unknown>) => ({
  id: String(o.id ?? "o1"),
  source: String(o.source ?? "EODHD"),
  provider: (o.provider ?? "fmp") as never,
  providerConfidence: 80,
  providerTimestamp: Date.UTC(2026, 7, 27),
  entityType: "Company",
  entityId: String(o.entityId ?? "NVDA"),
  entityLabel: "NVDA",
  observationType: o.observationType as never,
  payload: (o.payload ?? {}) as Record<string, unknown>,
  qualityScore: 80,
  quality: { quality: 80, freshness: 90, providerReliability: 80, entityConfidence: 90,
             collectedAt: Date.UTC(2026, 7, 27) },
  metadata: {},
}) as never;

const price = (change: number) => obs({ observationType: "market_price",
  payload: { price: 100 + change, change, changePercent: change } });
const financial = (change: number) => obs({ observationType: "financials",
  source: "SEC EDGAR", provider: "sec",
  payload: { label: "Revenues", concept: "Revenues", value: 800 + change, priorValue: 800, change } });
/** Form 4 acquiredDisposedCode: "A" acquired (buy), "D" disposed (sell). */
const insider = (code: string) => obs({ observationType: "insider_transaction",
  source: "SEC EDGAR", provider: "sec",
  payload: { insiderName: "Jane Doe", role: "CFO", acquiredDisposedCode: code,
             transactionValue: 5_000_000, shares: 40_000 } });

const co = () => G.getNode("NVDA")!;
const ev = () => evaluateEvidenceForNode(co().id);
const verbs = () => G.getRelationships(co().id).map(r => r.relationshipType);

beforeEach(() => { G.clear(); clearMarketObservationCache(); });

// ── The unmasking fix: direction survives, the bare fact does not ───────────

describe("insider direction is restored, not merely removed", () => {
  it("BUY keeps genuine POSITIVE evidence", () => {
    ingestProviderObservations([insider("A")]);
    const e = ev();
    expect(verbs()).toContain("transacted");          // the fact is still recorded
    expect(e.supportingEvidence.length).toBeGreaterThan(0);
    expect(e.supportingEvidence.some(i => i.relationship === "transacted")).toBe(false);
    expect(e.supportingEvidence.some(i => ["supports", "owns"].includes(i.relationship))).toBe(true);
    expect(e.supportingEvidence.every(i => i.polarity === 1)).toBe(true);
    expect(e.overallTrust).toBeGreaterThan(0);
  });

  it("SELL keeps genuine NEGATIVE evidence", () => {
    // Before L3 this produced verdict moderate, trust 54, ONE +[transacted] item
    // and contradictingEvidence EMPTY — an insider sale reading as support.
    ingestProviderObservations([insider("D")]);
    const e = ev();
    expect(verbs()).toContain("transacted");
    expect(e.contradictingEvidence.length).toBeGreaterThan(0);
    expect(e.contradictingEvidence.some(i => i.relationship === "weakens")).toBe(true);
    expect(e.contradictingEvidence.every(i => i.polarity === -1)).toBe(true);
    expect(e.supportingEvidence.some(i => i.relationship === "transacted")).toBe(false);
  });

  it("BUY and SELL are now DISTINGUISHABLE", () => {
    ingestProviderObservations([insider("A")]);
    const buy = { sup: ev().supportingEvidence.length, con: ev().contradictingEvidence.length };
    G.clear(); clearMarketObservationCache();
    ingestProviderObservations([insider("D")]);
    const sell = { sup: ev().supportingEvidence.length, con: ev().contradictingEvidence.length };
    expect(buy).not.toEqual(sell);
    expect(buy.sup).toBeGreaterThan(0);
    expect(buy.con).toBe(0);
    expect(sell.con).toBeGreaterThan(0);
  });

  it("a NONDIRECTIONAL transaction produces neither", () => {
    // unknown direction -> the bridge writes `mentions`, which E3 excludes.
    ingestProviderObservations([insider("?")]);
    const e = ev();
    expect(verbs()).toContain("transacted");
    expect(verbs()).toContain("mentions");
    expect(e.supportingEvidence).toHaveLength(0);
    expect(e.contradictingEvidence).toHaveLength(0);
    expect(e.verdict).toBe("insufficient_signal");
    expect(e.overallTrust).toBe(0);
  });
});

// ── Metric attachments carry no direction, in either state ──────────────────

describe("market metrics are descriptive only", () => {
  for (const [label, change] of [["price UP", +8], ["price DOWN", -8]] as const) {
    it(`${label}: attachment present and traversable, zero thesis evidence`, () => {
      ingestProviderObservations([price(change)]);
      expect(verbs()).toContain("has_market_metric");
      expect(G.getNeighbors(co().id).length).toBeGreaterThan(0);
      const e = ev();
      expect(e.supportingEvidence).toHaveLength(0);
      expect(e.contradictingEvidence).toHaveLength(0);
      expect(e.verdict).toBe("insufficient_signal");
      expect(e.overallTrust).toBe(0);
      expect(e.sourceBreakdown ?? []).toHaveLength(0);
    });
  }

  it("opposite price moves cannot manufacture opposite or positive claims", () => {
    ingestProviderObservations([price(+8)]);
    const up = ev();
    G.clear(); clearMarketObservationCache();
    ingestProviderObservations([price(-8)]);
    const down = ev();
    for (const e of [up, down]) {
      expect(e.supportingEvidence).toHaveLength(0);
      expect(e.contradictingEvidence).toHaveLength(0);
      expect(e.overallTrust).toBe(0);
    }
  });

  it("the latest market snapshot on the node is untouched", () => {
    ingestProviderObservations([price(+8)]);
    expect(co().metadata?.latestMarketData).toBeTruthy();
  });
});

describe("financial metrics are descriptive only", () => {
  for (const [label, change] of [["improving", +200], ["deteriorating", -200]] as const) {
    it(`${label}: attachment present and traversable, zero thesis evidence`, () => {
      ingestProviderObservations([financial(change)]);
      expect(verbs()).toContain("has_financial_metric");
      expect(G.getNeighbors(co().id).length).toBeGreaterThan(0);
      const e = ev();
      expect(e.supportingEvidence).toHaveLength(0);
      expect(e.verdict).toBe("insufficient_signal");
      expect(e.overallTrust).toBe(0);
    });
  }

  it("improving and deteriorating are equally silent", () => {
    ingestProviderObservations([financial(+200)]);
    const a = ev().overallTrust;
    G.clear(); clearMarketObservationCache();
    ingestProviderObservations([financial(-200)]);
    expect(ev().overallTrust).toBe(a);
    expect(a).toBe(0);
  });
});

// ── A metric-only company, and multiplicity ─────────────────────────────────

describe("attachment multiplicity cannot inflate anything", () => {
  const six = () => ingestProviderObservations([
    obs({ id: "a", observationType: "market_price", payload: { price: 100, change: 1 } }),
    obs({ id: "b", observationType: "volume", payload: { volume: 1e6 } }),
    obs({ id: "c", observationType: "liquidity", payload: { spread: 0.01 } }),
    obs({ id: "d", observationType: "ohlcv", payload: { interval: "daily", close: 100 } }),
    obs({ id: "e", observationType: "financials", payload: { label: "Revenues", value: 1 } }),
    obs({ id: "f", observationType: "financials", payload: { label: "Margin", value: 2 } }),
  ]);

  it("a metric-only company is insufficient_signal with trust 0", () => {
    // Before L3: moderate, trust 49, six supporting items.
    six();
    const e = ev();
    expect(e.verdict).toBe("insufficient_signal");
    expect(e.overallTrust).toBe(0);
    expect(e.supportingEvidence).toHaveLength(0);
  });

  it("six attachments admit no evidence, no evidenceCount, no thesis sources", () => {
    six();
    const e = ev();
    expect(e.supportingEvidence.reduce((s, i) => s + i.evidenceCount, 0)).toBe(0);
    expect(e.sourceBreakdown ?? []).toHaveLength(0);
    expect(new Set(e.supportingEvidence.map(i => i.sourceName)).size).toBe(0);
  });

  it("all six edges are still present and traversable", () => {
    six();
    const v = verbs();
    expect(v.filter(x => x === "has_market_metric")).toHaveLength(4);
    expect(v.filter(x => x === "has_financial_metric")).toHaveLength(2);
    expect(G.getNeighbors(co().id).length).toBeGreaterThan(0);
  });

  it("adding attachments to a company with real evidence changes nothing", () => {
    ingestProviderObservations([insider("A")]);
    const before = ev().overallTrust;
    six();
    expect(ev().overallTrust).toBe(before);
  });
});

// ── Parallel-edge integrity, stated generically ─────────────────────────────

describe("an excluded attachment never masks an admissible relationship", () => {
  it("the same neighbour pair carrying both keeps the admissible one", () => {
    // Person -> Company carries `transacted` (excluded, written FIRST) plus the
    // admissible directional pair `owns` and `supports`. Selection keeps the
    // first ADMISSIBLE edge per neighbour — here `owns`, which is in
    // POSITIVE_REL — so exactly one positive item is admitted and the direction
    // survives. Pre-L3 the kept edge was `transacted` and the direction was lost.
    ingestProviderObservations([insider("A")]);
    const personEdges = G.getRelationships(co().id)
      .filter(r => G.getNode(r.source)?.type === "Person")
      .map(r => r.relationshipType);
    expect(personEdges).toEqual(["transacted", "owns", "supports"]);
    const items = ev().supportingEvidence;
    expect(items).toHaveLength(1);
    expect(["owns", "supports"]).toContain(items[0].relationship);
    expect(items[0].polarity).toBe(1);
  });

  it("selection is not a filter over collapsed getNeighbors output", () => {
    // If the engine filtered getNeighbors (one entry per neighbour, first edge
    // wins) the whole Person neighbour would be dropped along with `supports`.
    ingestProviderObservations([insider("A")]);
    expect(ev().supportingEvidence.length).toBeGreaterThan(0);
  });

  it("Story->Theme support still survives beside unrelated attachments", () => {
    const t = {
      id: "t1", name: "AI Compute", description: "d", signal_strength: "strong", confidence: 70,
      momentum_direction: "bullish", related_industries: ["Semiconductors"], related_assets: [],
      related_macro_factors: [], contributing_cluster_ids: ["c1"], contributing_story_count: 2,
      second_order_effects: [], podcast_topics: [], last_updated: "2026-08-27T00:00:00Z",
      momentum_delta: 12,
    } as never;
    ingestThemes([t]);
    ingestStories([{ id: "c1", primary: { id: "c1", title: "Chip demand surges",
      url: "https://x/c1", source: "Reuters", category: "Markets", published: "1h ago",
      signal_score: 80, signal_strength: "strong", affected_entities: ["NVDA"], summary: "",
      why_it_matters: "", impact: "", snippet: "" }, related: [], cluster_score: 0.9,
      theme_label: "AI Compute", story_count: 1 } as never], [t]);
    const themeTrust = evaluateEvidenceForNode(G.getNode("AI Compute")!.id).overallTrust;
    ingestProviderObservations([price(+8), financial(+200)]);
    const after = evaluateEvidenceForNode(G.getNode("AI Compute")!.id);
    expect(after.overallTrust).toBe(themeTrust);
    expect(after.supportingEvidence.some(i => i.relationship === "supports")).toBe(true);
    expect(predictThemeTrajectory(G.getNode("AI Compute")!.id).predictedDirection)
      .not.toBe("insufficient_signal");
  });
});

// ── Prior contracts unchanged ───────────────────────────────────────────────

describe("E3, L1 and L2 contracts are unchanged", () => {
  it("no attachment verb appears as evidence anywhere", () => {
    ingestProviderObservations([price(+8), financial(+200), insider("A")]);
    const banned = new Set(["transacted", "has_market_metric", "has_financial_metric",
                            "mentions", "acquires", "names", "evidenced_by", "belongs_to"]);
    for (const n of G.allNodes()) {
      const e = evaluateEvidenceForNode(n.id);
      for (const i of [...e.supportingEvidence, ...e.contradictingEvidence])
        expect(banned.has(i.relationship)).toBe(false);
    }
  });

  /**
   * RC2-FT SUPERSEDES this pin. It asserted `depends_on` remained ADMISSIBLE,
   * and it existed for one narrow reason: to prove that slice had not silently
   * ruled a verb it had explicitly left open. That guard did its job.
   *
   * The fall-through slice now rules it deliberately. `depends_on` is
   * unclassified and has no producer, and the architectural rule is that an
   * unclassified verb must not acquire positive thesis meaning merely by
   * existing in the type vocabulary. This is NOT a claim that `depends_on` is
   * inherently neutral forever — it is the claim that it must be classified
   * before it can be evidence.
   */
  it("RC2-FT: depends_on is now inadmissible by default", () => {
    // L3 must not have quietly ruled it. It has no producer, so it is pinned
    // directly: an explicit depends_on edge still passes admissibility.
    const a = G.addNode({ label: "AAA", type: "Company", aliases: ["AAA"],
      sources: ["Feed" as never], metadata: { source: "Reuters" } }).id;
    const b = G.addNode({ label: "BBB", type: "Company", aliases: ["BBB"],
      sources: ["Feed" as never], metadata: { source: "Reuters" } }).id;
    G.addRelationship({ source: a, target: b, relationshipType: "depends_on",
      strength: 80, confidence: 80, evidenceCount: 1, originatingPages: ["Feed" as never] });
    expect(evaluateEvidenceForNode(b).supportingEvidence
      .some(i => i.relationship === "depends_on")).toBe(false);
  });

  it("the classified observation verbs still work — credit spread direction", () => {
    // handleMacro writes supports/weakens/correlates from a deterministic change.
    ingestProviderObservations([obs({ observationType: "credit_spread", entityId: "BAMLH0A0HYM2",
      source: "FRED", provider: "fred", entityLabel: "US HY OAS",
      payload: { label: "US HY OAS", change: +12 } })]);
    const stress = G.allNodes().find(n => n.label === "Credit Stress");
    expect(stress).toBeTruthy();
    expect(evaluateEvidenceForNode(stress!.id).supportingEvidence
      .some(i => i.relationship === "supports")).toBe(true);
  });
});
