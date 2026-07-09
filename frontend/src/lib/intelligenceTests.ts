/**
 * lib/intelligenceTests.ts - lightweight validation tests for the intelligence layer.
 *
 * No test framework is configured, so this is a self-contained suite: a tiny assert
 * harness plus focused checks. Import and call `runIntelligenceTests()`, or run it
 * directly with:  npx tsx src/lib/intelligenceTests.ts
 *
 * Covers: alias merging, graph integrity, relationship deduplication, missing-node
 * handling, inference scoring, narrative path generation, and insufficient-signal
 * handling. Focused on the intelligence layer, not UI. No em/en dashes.
 */

import { IntelligenceGraph, intelligenceGraph } from "./intelligenceGraph";
import { createDebugGraphFromSampleData, validateGraphIntegrity } from "./intelligenceGraphDebug";
import { scoreInference, inferTheme } from "./inferenceEngine";
import { buildNarrativePath, explainNarrative } from "./narrativeTransmission";
import {
  rankEvidenceSources, scoreEvidence, detectContradictions, evaluateEvidenceForNode,
  evaluateEvidenceForInference,
} from "./evidenceEngine";
import {
  predictThemeTrajectory, predictCompanyTrajectory, predictMarketEvolution,
  rankFutureOpportunities, rankFutureRisks, detectInflectionPoints,
} from "./predictionEngine";
import { BaseDataAdapter } from "./dataAdapters/BaseDataAdapter";
import { ProviderRegistry, providerRegistry } from "./dataAdapters/registry";
import { SecAdapter } from "./dataAdapters/sec";
import { FredAdapter } from "./dataAdapters/fred";
import { registerDefaultProviders } from "./dataAdapters/providers";
import { ingestProviderObservations, reingestCachedMarketObservations, clearMarketObservationCache, marketObservationCacheSize } from "./dataAdapters/observationGraphBridge";
import { runProviderIngestion } from "./dataAdapters/providerIngestion";
import { IngestionScheduler, MemoryHealthStore } from "./dataAdapters/ingestionScheduler";
import { runIngestionDiagnostic } from "./dataAdapters/diagnostics";
import {
  recordSnapshot, getEntityHistory, compareSnapshots, detectHistoricalPatterns,
  summarizeEvolution, findHistoricalAnalogs, resetMemory,
} from "./memoryEngine";
import { orchestrateIntelligence } from "./intelligenceOrchestrator";
import { FmpAdapter, MarketDataAdapter } from "./dataAdapters/marketData";
import { resolveDrawerEntity, buildCompanyContext, buildSymbolContext } from "./drawerEntity";
import { selectSeriesForRange, EMPTY_SERIES as EMPTY_PRICE_SERIES, type PriceSeriesVM, type PricePoint } from "./marketSeries";
import { buildRelationshipMap, expandMap, countExpansion, deriveEdgeTrend } from "./causalMap";
import { buildIntelligenceProfile, PROFILE_VERSION } from "./intelligenceProfile";
import { deriveNarratives, findNarrativeForTheme, narrativeKeyOfDrivers, DERIVED_NARRATIVE_VERSION } from "./narrativeDerivation";
import type { SchedulerLogger } from "./dataAdapters/ingestionScheduler";
import type { IngestionReport } from "./dataAdapters/providerIngestion";
import type { AdapterContext, FetchLike, FetchParams, ProviderMetadata, ProviderObservation } from "./dataAdapters/types";

export interface TestResult { name: string; ok: boolean; detail?: string }
export interface TestSummary { total: number; passed: number; failed: number; results: TestResult[] }

function assert(cond: unknown, message: string): void {
  if (!cond) throw new Error(message);
}

// A canned Response transport so adapters are tested without real network access.
const makeTransport = (body: unknown, ok = true): FetchLike =>
  async () => new Response(ok ? JSON.stringify(body) : "error", { status: ok ? 200 : 500 });

// A URL-routing transport: returns the first body whose pattern matches the request URL.
const routingTransport = (routes: Array<[RegExp, unknown]>): FetchLike =>
  async (url) => {
    for (const [re, body] of routes) if (re.test(url)) return new Response(JSON.stringify(body), { status: 200 });
    return new Response("not found", { status: 404 });
  };

// Minimal adapter to exercise BaseDataAdapter behaviors (cache, rate limit, retry, quality).
class TinyAdapter extends BaseDataAdapter {
  readonly id = "tiny";
  private limit: number;
  private mode: "ok" | "fail";
  private ts: number;
  constructor(ctx: AdapterContext = {}, opts: { limit?: number; mode?: "ok" | "fail"; ts?: number } = {}) {
    super(ctx);
    this.limit = opts.limit ?? 300;
    this.mode = opts.mode ?? "ok";
    this.ts = opts.ts ?? this.now();
  }
  metadata(): ProviderMetadata {
    return { id: "tiny", name: "Tiny", description: "test adapter", reliability: 80, cadence: "daily", ttlMs: 60_000, rateLimitPerMin: this.limit, costTier: "free", requiresApiKey: false, supportsEntities: ["Company"], supportsObservations: ["financials"] };
  }
  protected async request(params: FetchParams): Promise<unknown> {
    if (this.mode === "fail") throw new Error("boom");
    return { v: 1, params };
  }
  normalize(raw: unknown, params: FetchParams = {}): ProviderObservation[] {
    return [this.buildObservation({ source: "Tiny", providerConfidence: 80, providerTimestamp: this.ts, entityType: "Company", entityId: String(params.id ?? "X"), observationType: "financials", payload: { raw } })];
  }
}

export async function runIntelligenceTests(): Promise<TestSummary> {
  const results: TestResult[] = [];
  const tests: Array<[string, () => void | Promise<void>]> = [];
  const test = (name: string, fn: () => void | Promise<void>) => { tests.push([name, fn]); };

  // 1. Alias merging: NVDA / Nvidia / NVIDIA collapse into one node.
  test("alias merging", () => {
    const g = new IntelligenceGraph();
    g.addNode({ label: "NVDA", type: "Company", aliases: ["NVDA", "Nvidia", "NVIDIA"] });
    g.addNode({ label: "Nvidia", type: "Company" });   // should resolve to the same node
    g.addNode({ label: "NVIDIA", type: "Company" });
    assert(g.stats().nodes === 1, `expected 1 node, got ${g.stats().nodes}`);
    assert(g.getNode("Nvidia") === g.getNode("NVDA"), "Nvidia and NVDA should resolve to one node");
    assert(g.getNode("NVIDIA")?.id === g.getNode("NVDA")?.id, "NVIDIA should resolve to the same id");
  });

  // 2. Relationship deduplication: re-asserting an edge does not duplicate it.
  test("relationship deduplication", () => {
    const g = new IntelligenceGraph();
    g.addNode({ label: "AI Infrastructure", type: "Theme" });
    g.addNode({ label: "NVDA", type: "Company" });
    g.addRelationship({ source: "AI Infrastructure", target: "NVDA", relationshipType: "supports", evidenceCount: 1 });
    g.addRelationship({ source: "AI Infrastructure", target: "NVDA", relationshipType: "supports", evidenceCount: 1, originatingPages: ["Feed"] });
    const rels = g.getRelationships("AI Infrastructure");
    assert(rels.length === 1, `expected 1 edge, got ${rels.length}`);
    assert(rels[0].evidenceCount === 2, `expected evidenceCount 2, got ${rels[0].evidenceCount}`);
    assert(rels[0].originatingPages.includes("Feed"), "originatingPages should union on re-assert");
  });

  // 3. Missing node handling: unknown lookups and dangling edges are rejected.
  test("missing node handling", () => {
    const g = new IntelligenceGraph();
    g.addNode({ label: "AI Infrastructure", type: "Theme" });
    assert(g.getNode("Nonexistent") === undefined, "unknown node should be undefined");
    const edge = g.addRelationship({ source: "AI Infrastructure", target: "Nonexistent", relationshipType: "supports" });
    assert(edge === undefined, "edge with a missing endpoint should be rejected");
    assert(g.getRelationships("AI Infrastructure").length === 0, "no edge should have been created");
  });

  // 4. Graph integrity: the seeded sample graph is internally consistent.
  test("graph integrity", () => {
    createDebugGraphFromSampleData();
    const rep = validateGraphIntegrity();
    assert(rep.ok, `integrity failed: ${JSON.stringify(rep.orphanRelationships)} ${JSON.stringify(rep.duplicateAliases)}`);
    assert(rep.valueScale === "0..100", `expected 0..100 scale, got ${rep.valueScale}`);
  });

  // 5. Inference scoring: bounded 0..100 and monotonic in the strong direction.
  test("inference scoring", () => {
    const low = scoreInference({ confidence: 10, conviction: 10, evidenceCount: 0, originatingPages: 0, persistence: 0, momentum: 0 }).score;
    const high = scoreInference({ confidence: 90, conviction: 90, evidenceCount: 20, originatingPages: 5, persistence: 80, momentum: 12 }).score;
    assert(low >= 0 && low <= 100, `low score out of bounds: ${low}`);
    assert(high >= 0 && high <= 100, `high score out of bounds: ${high}`);
    assert(high > low, `expected stronger inputs to score higher: ${high} vs ${low}`);
    const empty = scoreInference({}).score;
    assert(empty === 0, `empty inputs should score 0, got ${empty}`);
  });

  // 6. Narrative path generation: a real spine with a macro origin and terminals.
  test("narrative path generation", () => {
    createDebugGraphFromSampleData();
    const p = buildNarrativePath("AI Infrastructure");
    assert(p.found, "path should be found");
    assert(p.origin?.type === "Macro", `expected a macro origin, got ${p.origin?.type}`);
    assert(p.theme?.label === "AI Infrastructure", "theme should be the anchor");
    assert(p.terminalNodes.length > 0, "expected downstream terminals");
    assert(p.path.length >= 2, "expected a multi-step spine");
  });

  // 7. Insufficient signal handling: unknown entities never fabricate a thesis.
  test("insufficient signal handling", () => {
    createDebugGraphFromSampleData();
    const t = inferTheme("Definitely Not A Real Theme");
    assert(t.direction === "insufficient_signal", `expected insufficient_signal, got ${t.direction}`);
    assert(t.found === false, "unknown theme should not be found");
    const ex = explainNarrative("Definitely Not A Real Theme");
    assert(ex.found === false, "unknown narrative should not be found");
    assert(ex.currentState === "insufficient_signal", "narrative state should be insufficient_signal");
  });

  // 8. Source reliability weighting: transparent, ordered, primary tier at the top.
  test("source reliability weighting", () => {
    const ranks = rankEvidenceSources();
    assert(ranks[0].weight === 100, `top source should weigh 100, got ${ranks[0].weight}`);
    const w = (s: string) => ranks.find(r => r.source === s)?.weight ?? -1;
    assert(w("Bloomberg") === 95, `Bloomberg should weigh 95, got ${w("Bloomberg")}`);
    assert(w("Social media") < w("Reuters"), "social media should rank below Reuters");
    for (let i = 1; i < ranks.length; i++) assert(ranks[i - 1].weight >= ranks[i].weight, "ranks must be sorted descending");
  });

  // 9. Evidence scoring: bounded, monotonic, contradictions reduce the total.
  test("evidence scoring", () => {
    const weak = scoreEvidence({ sourceReliability: 15, independentSources: 1, relationshipStrength: 20, relationshipConfidence: 20, evidenceCount: 1, originatingPages: 1, recencyDays: 40, conviction: 20 });
    const strong = scoreEvidence({ sourceReliability: 95, independentSources: 5, relationshipStrength: 80, relationshipConfidence: 85, evidenceCount: 18, originatingPages: 5, recencyDays: 1, conviction: 85, persistence: 80 });
    assert(strong.totalScore > weak.totalScore, `strong should outscore weak: ${strong.totalScore} vs ${weak.totalScore}`);
    assert(strong.totalScore <= 100 && weak.totalScore >= 0, "scores must be in bounds");
    const clean = scoreEvidence({ sourceReliability: 90, independentSources: 4, relationshipStrength: 70, relationshipConfidence: 70, evidenceCount: 10, originatingPages: 4, recencyDays: 2, conviction: 70 });
    const contradicted = scoreEvidence({ sourceReliability: 90, independentSources: 4, relationshipStrength: 70, relationshipConfidence: 70, evidenceCount: 10, originatingPages: 4, recencyDays: 2, conviction: 70, contradictionSeverity: 120 });
    assert(contradicted.totalScore < clean.totalScore, "contradictions must lower the score");
  });

  // 10. Contradiction detection: a weakens edge is found, and only from graph evidence.
  test("contradiction detection", () => {
    // detectContradictions reads the shared singleton.
    intelligenceGraph.clear();
    intelligenceGraph.addNode({ label: "AI Infrastructure", type: "Theme", momentum: 5 });
    intelligenceGraph.addNode({ label: "Rate Shock", type: "Macro" });
    intelligenceGraph.addRelationship({ source: "Rate Shock", target: "AI Infrastructure", relationshipType: "weakens", strength: 60, confidence: 60, originatingPages: ["Feed"] });
    const found = detectContradictions("AI Infrastructure");
    assert(found.some(c => c.kind === "weakening_relationship"), "should detect the weakening relationship");
    assert(found.some(c => c.kind === "low_diversity"), "single source type should read as low diversity");
  });

  // 11. Evidence insufficient-signal handling.
  test("evidence insufficient signal", () => {
    const ev = evaluateEvidenceForNode("Definitely Not A Node");
    assert(ev.verdict === "insufficient_signal", `expected insufficient_signal, got ${ev.verdict}`);
    assert(ev.evidenceScore === 0 && !ev.found, "unknown node should score 0 and be not found");
  });

  // 12. Adjusted confidence drops below the original when contradictions exist.
  test("adjusted confidence with contradictions", () => {
    createDebugGraphFromSampleData();
    intelligenceGraph.addNode({ label: "Regulatory Crackdown", type: "Macro" });
    intelligenceGraph.addRelationship({ source: "Regulatory Crackdown", target: "AI Infrastructure", relationshipType: "weakens", strength: 65, confidence: 65, originatingPages: ["Feed"] });
    const inf = inferTheme("AI Infrastructure");
    const ie = evaluateEvidenceForInference(inf);
    assert(ie.contradictions.length > 0, "should surface contradictions");
    assert(ie.adjustedConfidence < inf.confidence, `adjusted (${ie.adjustedConfidence}) should be below original (${inf.confidence})`);
  });

  // 13. Strong evidence when cross-source confirmation is high (clean sample).
  test("strong evidence on cross-source confirmation", () => {
    createDebugGraphFromSampleData();
    const ev = evaluateEvidenceForNode("AI Infrastructure");
    assert(ev.found, "node should be found");
    assert(ev.confirmationScore >= 60, `expected high confirmation, got ${ev.confirmationScore}`);
    assert(ev.verdict === "strong" || ev.verdict === "moderate", `expected strong/moderate, got ${ev.verdict}`);
  });

  // 14. Prediction insufficient-signal for unknown themes.
  test("prediction insufficient signal", () => {
    createDebugGraphFromSampleData();
    const p = predictThemeTrajectory("Totally Unknown Theme");
    assert(p.predictedDirection === "insufficient_signal", `expected insufficient_signal, got ${p.predictedDirection}`);
    assert(p.found === false, "unknown theme should not be found");
    assert(p.probability === 0 && p.confidence === 0, "unknown theme should score 0");
  });

  // 15. Probability and confidence stay within 0..100.
  test("prediction score bounds", () => {
    createDebugGraphFromSampleData();
    for (const label of ["AI Infrastructure", "Nuclear Energy"]) {
      const p = predictThemeTrajectory(label);
      assert(p.probability >= 0 && p.probability <= 100, `probability out of bounds for ${label}: ${p.probability}`);
      assert(p.confidence >= 0 && p.confidence <= 100, `confidence out of bounds for ${label}: ${p.confidence}`);
    }
  });

  // 16. Stronger evidence yields higher probability than weaker evidence.
  test("stronger evidence higher probability", () => {
    createDebugGraphFromSampleData();
    const strong = predictThemeTrajectory("AI Infrastructure");   // 5 sources, high momentum
    const weak = predictThemeTrajectory("Nuclear Energy");        // fewer sources, lower momentum
    assert(strong.probability > weak.probability, `expected AI Infrastructure (${strong.probability}) above Nuclear Energy (${weak.probability})`);
  });

  // 17. Contradictions lower probability or confidence.
  test("contradictions lower prediction", () => {
    createDebugGraphFromSampleData();
    const base = predictThemeTrajectory("AI Infrastructure");
    intelligenceGraph.addNode({ label: "Regulatory Crackdown", type: "Macro" });
    intelligenceGraph.addRelationship({ source: "Regulatory Crackdown", target: "AI Infrastructure", relationshipType: "weakens", strength: 65, confidence: 65, originatingPages: ["Feed"] });
    const after = predictThemeTrajectory("AI Infrastructure");
    assert(after.probability < base.probability || after.confidence < base.confidence,
      `contradictions should lower probability or confidence: prob ${base.probability}->${after.probability}, conf ${base.confidence}->${after.confidence}`);
  });

  // 18. Alias resolution: company predictions for Nvidia and NVDA resolve to one node.
  test("prediction alias resolution", () => {
    createDebugGraphFromSampleData();
    const byName = predictCompanyTrajectory("Nvidia");
    const byTicker = predictCompanyTrajectory("NVDA");
    assert(byName.found && byTicker.found, "both company predictions should be found");
    assert(byName.company?.id === byTicker.company?.id, `Nvidia and NVDA should resolve together: ${byName.company?.id} vs ${byTicker.company?.id}`);
  });

  // 19. Inflection points only surface themes with sufficient signal.
  test("inflection points sufficient signal", () => {
    createDebugGraphFromSampleData();
    for (const ip of detectInflectionPoints()) {
      assert(ip.evidenceScore >= 55, `inflection ${ip.theme.label} should have evidence >= 55, got ${ip.evidenceScore}`);
      assert(predictThemeTrajectory(ip.theme.id).found, `inflection ${ip.theme.label} should be a real forecastable theme`);
    }
  });

  // 20. rankFutureOpportunities is sorted descending by score.
  test("opportunities sorted descending", () => {
    createDebugGraphFromSampleData();
    const ranked = rankFutureOpportunities();
    for (let i = 1; i < ranked.length; i++) assert(ranked[i - 1].score >= ranked[i].score, `opportunities not sorted at ${i}: ${ranked[i - 1].score} < ${ranked[i].score}`);
  });

  // 21. rankFutureRisks is sorted descending by score.
  test("risks sorted descending", () => {
    createDebugGraphFromSampleData();
    const ranked = rankFutureRisks();
    for (let i = 1; i < ranked.length; i++) assert(ranked[i - 1].score >= ranked[i].score, `risks not sorted at ${i}: ${ranked[i - 1].score} < ${ranked[i].score}`);
  });

  // 22. Market evolution degrades to a safe default on an empty graph.
  test("market evolution empty graph", () => {
    intelligenceGraph.clear();
    const m = predictMarketEvolution();
    assert(m.found === false, "empty graph should report found false");
    assert(m.mostLikelyStrengthening.length === 0 && m.mostLikelyWeakening.length === 0, "no themes should be predicted");
    assert(m.topOpportunities.length === 0 && m.largestRisks.length === 0, "no opportunities or risks on empty graph");
    assert(m.morningBriefForecast.length > 0, "forecast should still return a safe message");
  });

  // 23. Provider registry lifecycle: register, get, list, health, unregister.
  test("provider registry lifecycle", () => {
    const reg = new ProviderRegistry();
    const a = new TinyAdapter();
    reg.registerProvider(a);
    assert(reg.getProvider("tiny") === a, "should retrieve the registered provider");
    assert(reg.listProviders().length === 1, "should list one provider");
    assert(reg.healthReport()[0].id === "tiny", "health report should include the provider");
    assert(reg.metadataReport()[0].name === "Tiny", "metadata report should include the provider");
    assert(reg.unregisterProvider("tiny") === true, "should unregister");
    assert(reg.listProviders().length === 0, "should be empty after unregister");
  });

  // 24. SEC CompanyFacts normalizes into company_profile + financials observations.
  test("SEC companyfacts normalization", () => {
    const NOW = Date.parse("2026-01-15");
    const sec = new SecAdapter({ now: () => NOW });
    const facts = { cik: 320193, entityName: "Apple Inc.", facts: { "us-gaap": {
      Revenues: { units: { USD: [{ end: "2025-09-30", val: 391035000000, fy: 2025, fp: "FY", form: "10-K", filed: "2025-10-30" }] } },
      NetIncomeLoss: { units: { USD: [{ end: "2025-09-30", val: 99803000000, filed: "2025-10-30" }] } },
    } } };
    const obs = sec.validate(sec.normalize(facts, { dataset: "companyfacts", ticker: "AAPL" }));
    assert(obs.length >= 2, `expected profile + financials, got ${obs.length}`);
    assert(obs.some(o => o.observationType === "company_profile"), "should include company_profile");
    const rev = obs.find(o => o.observationType === "financials" && o.payload.label === "Revenue");
    assert(!!rev, "should include a revenue financial");
    assert(rev!.entityId === "AAPL", "entityId should be the ticker");
    assert(rev!.quality.providerReliability === 100, "SEC reliability should be 100");
    assert(rev!.qualityScore >= 0 && rev!.qualityScore <= 100, "qualityScore should be within bounds");
  });

  // 25. SEC fetch caches identical requests (async).
  test("SEC fetch caches by params", async () => {
    const NOW = Date.parse("2026-01-15");
    const facts = { cik: 320193, entityName: "Apple Inc.", facts: { "us-gaap": { Revenues: { units: { USD: [{ end: "2025-09-30", val: 391035000000, filed: "2025-10-30" }] } } } } };
    const sec = new SecAdapter({ now: () => NOW, transport: makeTransport(facts), retry: { retries: 0, baseMs: 0 } });
    const r1 = await sec.fetch({ dataset: "companyfacts", cik: 320193, ticker: "AAPL" });
    assert(r1.fromCache === false && r1.observations.length > 0, "first fetch should return live observations");
    const r2 = await sec.fetch({ dataset: "companyfacts", cik: 320193, ticker: "AAPL" });
    assert(r2.fromCache === true, "second identical fetch should hit cache");
    assert(sec.health().observationCount === r1.observations.length, "observation count should reflect one live sync");
  });

  // 26. FRED normalizes a series into a category-typed macro observation.
  test("FRED series normalization", () => {
    const NOW = Date.parse("2026-01-15");
    const fred = new FredAdapter({ now: () => NOW, apiKey: "test" });
    const raw = { observations: [{ date: "2026-01-01", value: "4.10" }, { date: "2026-01-14", value: "4.25" }] };
    const obs = fred.validate(fred.normalize(raw, { seriesId: "DGS10" }));
    assert(obs.length === 1, "should emit one latest observation");
    assert(obs[0].observationType === "interest_rate", `DGS10 should map to interest_rate, got ${obs[0].observationType}`);
    assert(obs[0].entityId === "DGS10", "entityId should be the series id");
    assert(obs[0].payload.value === 4.25, "should use the latest value");
    assert(obs[0].payload.change === 0.15, `change should be 0.15, got ${obs[0].payload.change}`);
  });

  // 27. Base validate() filters malformed observations.
  test("adapter validate filters malformed", () => {
    const tiny = new TinyAdapter();
    const good = tiny.normalize({}, { id: "GOOD" });
    const bad = [{ ...good[0], entityId: "" }, { ...good[0], qualityScore: NaN }] as unknown as ProviderObservation[];
    const filtered = tiny.validate([...good, ...bad]);
    assert(filtered.length === 1, `should keep only the valid observation, got ${filtered.length}`);
  });

  // 28. Rate limiting rejects requests beyond the per-minute budget (async).
  test("adapter rate limiting", async () => {
    const NOW = Date.parse("2026-01-15");
    const tiny = new TinyAdapter({ now: () => NOW, retry: { retries: 0, baseMs: 0 } }, { limit: 1 });
    await tiny.fetch({ id: "A" });
    let threw = false;
    try { await tiny.fetch({ id: "B" }); } catch { threw = true; }
    assert(threw, "second distinct call within the minute should exceed the rate limit");
  });

  // 29. Failures are tracked and escalate provider health (async).
  test("adapter failure health tracking", async () => {
    const tiny = new TinyAdapter({ retry: { retries: 0, baseMs: 0 } }, { mode: "fail" });
    for (const id of ["A", "B", "C"]) { try { await tiny.fetch({ id }); } catch { /* expected */ } }
    const h = tiny.health();
    assert(h.failureCount === 3, `expected 3 failures, got ${h.failureCount}`);
    assert(h.state === "down", `expected down after 3 consecutive failures, got ${h.state}`);
  });

  // 30. Freshness decays with observation age.
  test("observation freshness decays with age", () => {
    const NOW = Date.parse("2026-01-15");
    const fresh = new TinyAdapter({ now: () => NOW }, { ts: NOW }).normalize({}, { id: "F" })[0];
    const stale = new TinyAdapter({ now: () => NOW }, { ts: NOW - 40 * 86_400_000 }).normalize({}, { id: "S" })[0];
    assert(fresh.quality.freshness > stale.quality.freshness, `fresh (${fresh.quality.freshness}) should exceed stale (${stale.quality.freshness})`);
    assert(stale.quality.freshness === 0, "40-day-old daily data should be fully stale");
  });

  // 31. Default providers (SEC + FRED) register on the shared registry.
  test("default providers register", () => {
    providerRegistry.clear();
    registerDefaultProviders({ apiKey: "test" });
    const ids = providerRegistry.listProviders().map(p => String(p.id)).sort();
    assert(ids.includes("sec") && ids.includes("fred"), `should register sec and fred, got ${ids.join(",")}`);
    assert(providerRegistry.metadataReport().every(m => m.reliability >= 0 && m.reliability <= 100), "metadata reliability should be in bounds");
    providerRegistry.clear();
  });

  // Shared fixtures for the observation-graph bridge tests.
  const BRIDGE_NOW = Date.parse("2026-01-15");
  const appleFacts = { cik: 320193, entityName: "Apple Inc.", facts: { "us-gaap": {
    Revenues: { units: { USD: [{ end: "2025-09-30", val: 391035000000, fy: 2025, fp: "FY", form: "10-K", filed: "2025-10-30" }] } },
    NetIncomeLoss: { units: { USD: [{ end: "2025-09-30", val: 99803000000, filed: "2025-10-30" }] } },
  } } };
  const fredRaw = { observations: [{ date: "2026-01-01", value: "4.10" }, { date: "2026-01-14", value: "4.25" }] };
  const insiderObs: ProviderObservation = {
    id: "sec:insider_transaction:AAPL:1", source: "SEC EDGAR", provider: "sec", providerConfidence: 97,
    providerTimestamp: BRIDGE_NOW, entityType: "Company", entityId: "AAPL", entityLabel: "Apple Inc.",
    observationType: "insider_transaction", payload: { insiderName: "Tim Cook", role: "CEO", direction: "buy", shares: 10000 },
    qualityScore: 90, quality: { quality: 90, freshness: 100, providerReliability: 100, entityConfidence: 99, collectedAt: BRIDGE_NOW }, metadata: {},
  };

  // 32. SEC financial observations create/update a Company node with metric links.
  test("bridge SEC financials to graph", () => {
    intelligenceGraph.clear();
    const sec = new SecAdapter({ now: () => BRIDGE_NOW });
    const stats = ingestProviderObservations(sec.normalize(appleFacts, { dataset: "companyfacts", ticker: "AAPL" }));
    assert(stats.observationsIngested >= 2, `expected profile + financials, ingested ${stats.observationsIngested}`);
    const company = intelligenceGraph.getNode("AAPL");
    assert(!!company && company.type === "Company", "should create a Company node");
    const metrics = intelligenceGraph.getNeighbors(company!.id).filter(n => n.node.type === "FinancialMetric");
    assert(metrics.length >= 1, "company should link to financial metric nodes");
    assert(metrics.some(m => m.edge.relationshipType === "has_financial_metric"), "edge should be has_financial_metric");
    assert(stats.providersUsed.includes("sec") && stats.averageQualityScore > 0, "stats should reflect the SEC provider");
  });

  // 33. Form 4 observations create Person and Company links.
  test("bridge Form 4 to person and company", () => {
    intelligenceGraph.clear();
    ingestProviderObservations([insiderObs]);
    const person = intelligenceGraph.getNode("Tim Cook");
    const company = intelligenceGraph.getNode("AAPL");
    assert(!!person && person.type === "Person", "should create a Person node");
    assert(!!company && company.type === "Company", "should create the issuer Company node");
    const rels = intelligenceGraph.getRelationships(person!.id).map(e => e.relationshipType);
    assert(rels.includes("transacted"), "person should have transacted the company");
    assert(rels.includes("owns") && rels.includes("supports"), "a buy should create owns + supports edges");
  });

  // 34. FRED interest-rate observations create Macro + MacroSeries nodes.
  test("bridge FRED interest rate to macro", () => {
    intelligenceGraph.clear();
    const fred = new FredAdapter({ now: () => BRIDGE_NOW, apiKey: "test" });
    ingestProviderObservations(fred.normalize(fredRaw, { seriesId: "DGS10" }));
    const macro = intelligenceGraph.getNode("Interest Rates");
    const series = intelligenceGraph.getNode("10-Year Treasury Yield");
    assert(!!macro && macro.type === "Macro", "should create the Interest Rates macro node");
    assert(!!series && series.type === "MacroSeries", "should create the macro series node");
    assert(intelligenceGraph.getRelationships(series!.id).some(e => e.relationshipType === "drives"), "series should drive the macro concept");
  });

  // 35. Malformed observations are skipped safely.
  test("bridge skips malformed observations", () => {
    intelligenceGraph.clear();
    const stats = ingestProviderObservations([
      { observationType: "financials" } as unknown as ProviderObservation,
      null as unknown as ProviderObservation,
    ]);
    assert(stats.errorsSkipped >= 2, `malformed observations should be skipped, got ${stats.errorsSkipped}`);
    assert(stats.observationsIngested === 0, "no valid observations should be ingested");
  });

  // 36. Provider quality metadata is preserved on the resulting node.
  test("bridge preserves provider quality metadata", () => {
    intelligenceGraph.clear();
    const fred = new FredAdapter({ now: () => BRIDGE_NOW, apiKey: "test" });
    ingestProviderObservations(fred.normalize(fredRaw, { seriesId: "DGS10" }));
    const series = intelligenceGraph.getNode("10-Year Treasury Yield");
    const meta = series!.metadata;
    assert(typeof meta.providerReliability === "number" && typeof meta.qualityScore === "number" && typeof meta.freshness === "number", "quality metadata should be preserved on the node");
    assert(meta.provider === "fred" && meta.source === "FRED", "provider and source should be preserved");
  });

  // 37. Graph integrity remains clean after provider ingestion.
  test("bridge keeps graph integrity clean", () => {
    intelligenceGraph.clear();
    const sec = new SecAdapter({ now: () => BRIDGE_NOW });
    const fred = new FredAdapter({ now: () => BRIDGE_NOW, apiKey: "test" });
    ingestProviderObservations(sec.normalize(appleFacts, { dataset: "companyfacts", ticker: "AAPL" }));
    ingestProviderObservations([insiderObs]);
    ingestProviderObservations(fred.normalize(fredRaw, { seriesId: "DGS10" }));
    const rep = validateGraphIntegrity();
    assert(rep.ok, `graph should stay clean: orphans=${JSON.stringify(rep.orphanRelationships)} dup=${JSON.stringify(rep.duplicateAliases)} empty=${JSON.stringify(rep.emptyLabels)}`);
  });

  // Shared fixtures for the controlled ingestion tests.
  const submissionsFix = { cik: 320193, name: "Apple Inc.", filings: { recent: {
    form: ["4", "10-K"], filingDate: ["2026-01-10", "2025-10-30"], accessionNumber: ["a1", "a2"], primaryDocument: ["d1", "d2"],
  } } };
  const secFredTransport = routingTransport([
    [/companyfacts/, appleFacts],
    [/submissions/, submissionsFix],
    [/stlouisfed/, fredRaw],
  ]);
  const singleUniverse = [{ ticker: "AAPL", cik: 320193 }];

  // 38. Ingestion skips unavailable providers safely (no FRED key).
  test("ingestion skips unavailable providers", async () => {
    intelligenceGraph.clear();
    const report = await runProviderIngestion({ companies: singleUniverse, fredApiKey: "", transport: secFredTransport, now: () => BRIDGE_NOW, force: true });
    assert(report.providersSkipped.some(p => p.id === "fred"), "FRED should be skipped without an API key");
    assert(report.providersCalled.includes("sec"), "SEC should still be called");
    assert(Array.isArray(report.providerHealth), "a report should still be returned");
  });

  // 39. SEC CompanyFacts result reaches the graph.
  test("ingestion SEC reaches graph", async () => {
    intelligenceGraph.clear();
    const report = await runProviderIngestion({ companies: singleUniverse, includeForm4: true, transport: secFredTransport, now: () => BRIDGE_NOW, force: true });
    assert(report.observationsIngested > 0, "should ingest SEC observations");
    assert(report.nodesAdded > 0, "should add nodes to the graph");
    assert(!!intelligenceGraph.getNode("AAPL"), "the Apple company node should exist");
    assert(report.graphAfter.nodes > report.graphBefore.nodes, "graph should grow");
  });

  // 40. FRED result reaches the graph when a key is supplied.
  test("ingestion FRED reaches graph", async () => {
    intelligenceGraph.clear();
    const report = await runProviderIngestion({ companies: [], fredSeries: ["DGS10"], fredApiKey: "test", transport: secFredTransport, now: () => BRIDGE_NOW, force: true });
    assert(report.providersCalled.includes("fred"), "FRED should be called with a key");
    assert(!!intelligenceGraph.getNode("Interest Rates"), "the Interest Rates macro node should exist");
    assert(!!intelligenceGraph.getNode("10-Year Treasury Yield"), "the macro series node should exist");
  });

  // 41. Provider health updates after ingestion.
  test("ingestion updates provider health", async () => {
    intelligenceGraph.clear();
    const report = await runProviderIngestion({ companies: singleUniverse, fredSeries: ["DGS10"], fredApiKey: "test", transport: secFredTransport, now: () => BRIDGE_NOW, force: true });
    const sec = report.providerHealth.find(h => h.id === "sec");
    const fred = report.providerHealth.find(h => h.id === "fred");
    assert(!!sec && sec.state === "healthy" && sec.observationCount > 0, "SEC health should reflect a successful sync");
    assert(!!fred && fred.observationCount > 0, "FRED health should reflect a successful sync");
  });

  // 42. Graph integrity remains clean after controlled ingestion.
  test("ingestion keeps graph integrity clean", async () => {
    intelligenceGraph.clear();
    await runProviderIngestion({ companies: singleUniverse, includeForm4: true, fredSeries: ["DGS10", "BAMLH0A0HYM2"], fredApiKey: "test", transport: secFredTransport, now: () => BRIDGE_NOW, force: true });
    const rep = validateGraphIntegrity();
    assert(rep.ok, `graph should stay clean: orphans=${JSON.stringify(rep.orphanRelationships)} dup=${JSON.stringify(rep.duplicateAliases)} empty=${JSON.stringify(rep.emptyLabels)}`);
  });

  // 43. Ingestion is gated off by default (no flag, no force).
  test("ingestion gated off by default", async () => {
    intelligenceGraph.clear();
    const report = await runProviderIngestion({ companies: singleUniverse, transport: secFredTransport, now: () => BRIDGE_NOW });
    assert(report.enabled === false, "ingestion should be disabled without the feature flag");
    assert(report.providersCalled.length === 0, "no providers should be called when gated off");
    assert(report.graphAfter.nodes === report.graphBefore.nodes, "the graph must be untouched when gated off");
  });

  // 44. Expanded SEC fundamentals: EPS, capex, buybacks, shares, and derived margins.
  test("SEC expanded fundamentals and margins", () => {
    const richFacts = { cik: 320193, entityName: "Apple Inc.", facts: { "us-gaap": {
      Revenues: { units: { USD: [{ end: "2025-09-30", val: 400000000000, filed: "2025-10-30", form: "10-K" }] } },
      GrossProfit: { units: { USD: [{ end: "2025-09-30", val: 180000000000, filed: "2025-10-30" }] } },
      NetIncomeLoss: { units: { USD: [{ end: "2025-09-30", val: 100000000000, filed: "2025-10-30" }] } },
      EarningsPerShareDiluted: { units: { "USD/shares": [{ end: "2025-09-30", val: 6.5, filed: "2025-10-30" }] } },
      PaymentsToAcquirePropertyPlantAndEquipment: { units: { USD: [{ end: "2025-09-30", val: 11000000000, filed: "2025-10-30" }] } },
      PaymentsForRepurchaseOfCommonStock: { units: { USD: [{ end: "2025-09-30", val: 90000000000, filed: "2025-10-30" }] } },
      CommonStockSharesOutstanding: { units: { shares: [{ end: "2025-09-30", val: 15000000000, filed: "2025-10-30" }] } },
    } } };
    const sec = new SecAdapter({ now: () => BRIDGE_NOW });
    const obs = sec.normalize(richFacts, { dataset: "companyfacts", ticker: "AAPL" });
    const labels = obs.filter(o => o.observationType === "financials").map(o => String(o.payload.label));
    for (const want of ["EPS (Diluted)", "Capital Expenditure", "Share Buybacks", "Shares Outstanding", "Gross Margin", "Net Margin"]) {
      assert(labels.includes(want), `expected a ${want} observation, got ${labels.join(", ")}`);
    }
    const eps = obs.find(o => o.payload.label === "EPS (Diluted)");
    assert(eps!.payload.unit === "USD/shares" && eps!.payload.value === 6.5, "EPS should keep its per-share unit and value");
    const net = obs.find(o => o.payload.label === "Net Margin");
    assert(net!.payload.value === 25 && net!.payload.derived === true, `net margin should be 25% derived, got ${net!.payload.value}`);
  });

  // 45. Ingestion is idempotent: a second identical run adds nothing.
  test("ingestion is idempotent", async () => {
    intelligenceGraph.clear();
    const cfg = { companies: singleUniverse, includeForm4: true, fredSeries: ["DGS10"], fredApiKey: "test", transport: secFredTransport, now: () => BRIDGE_NOW, force: true };
    const r1 = await runProviderIngestion(cfg);
    const r2 = await runProviderIngestion(cfg);
    assert(r1.nodesAdded > 0, "first run should add nodes");
    assert(r2.nodesAdded === 0 && r2.relationshipsAdded === 0, `second identical run should add nothing, got nodes=${r2.nodesAdded} rels=${r2.relationshipsAdded}`);
  });

  // Shared helpers for the scheduler tests.
  const fakeReport = (): IngestionReport => ({
    enabled: true, providersCalled: ["sec"], providersSkipped: [], observationsFetched: 0, observationsIngested: 0,
    errorsSkipped: 0, nodesAdded: 0, relationshipsAdded: 0, providerHealth: [], graphBefore: { nodes: 0, edges: 0 },
    graphAfter: { nodes: 0, edges: 0 }, fetchErrors: [], durationMs: 0,
  });
  const captureLogger = (sink: string[]): SchedulerLogger => ({
    info: (m) => sink.push(`info:${m}`), warn: (m) => sink.push(`warn:${m}`), error: (m) => sink.push(`error:${m}`),
  });

  // 46. Scheduler is gated off unless enabled.
  test("scheduler gated off by default", async () => {
    let called = 0;
    const s = new IngestionScheduler({ flagOverride: false, ingest: async () => { called += 1; return fakeReport(); } });
    const r = await s.tick();
    assert(r.reason === "disabled" && r.ran === false, "tick should be disabled without the flag");
    assert(called === 0, "ingestion should not run when disabled");
  });

  // 47. Scheduler runs SEC and FRED when due and persists provider health.
  test("scheduler runs and persists health", async () => {
    intelligenceGraph.clear();
    const NOW = BRIDGE_NOW;
    const store = new MemoryHealthStore();
    const logs: string[] = [];
    const s = new IngestionScheduler({
      force: true, now: () => NOW, healthStore: store, logger: captureLogger(logs),
      companies: singleUniverse, fredSeries: ["DGS10"], fredApiKey: "test",
      ingestionConfig: { transport: secFredTransport },
    });
    const r = await s.tick();
    assert(r.ran === true && r.reason === "ok", "first tick should run");
    assert(!!r.reports.sec && !!r.reports.fred, "both SEC and FRED should run when both are due");
    const records = store.load();
    assert(records.some(x => x.provider === "sec") && records.some(x => x.provider === "fred"), "health should be persisted for both providers");
    assert(logs.some(l => l.includes("ingestion complete")), "run should be logged");
  });

  // 48. Overlap prevention: a second tick during an in-flight run is rejected.
  test("scheduler prevents overlapping runs", async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>(res => { release = res; });
    const s = new IngestionScheduler({ force: true, now: () => BRIDGE_NOW, ingest: async () => { await gate; return fakeReport(); } });
    const first = s.tick();               // starts, sets running, awaits the gate
    const second = await s.tick();        // sees running, should be rejected
    assert(second.reason === "overlap" && second.ran === false, "overlapping tick should be prevented");
    release();
    await first;
  });

  // 49. Cadence: nothing is due again until the interval elapses.
  test("scheduler respects cadence", async () => {
    let now = BRIDGE_NOW;
    let calls = 0;
    const s = new IngestionScheduler({ force: true, now: () => now, secIntervalMs: 86_400_000, fredIntervalMs: 86_400_000, ingest: async () => { calls += 1; return fakeReport(); } });
    const r1 = await s.tick();
    assert(r1.ran === true, "first tick should run");
    const before = calls;
    now += 60_000; // one minute later
    const r2 = await s.tick();
    assert(r2.ran === false && r2.reason === "not-due", "a tick within the interval should not run");
    assert(calls === before, "no ingestion should happen when nothing is due");
    now += 86_400_000; // a day later
    const r3 = await s.tick();
    assert(r3.ran === true, "a tick after the interval should run again");
  });

  // 50. Diagnostic runner calls ingestion exactly once and checks integrity.
  test("diagnostic runs ingestion once", async () => {
    intelligenceGraph.clear();
    let count = 0;
    const d = await runIngestionDiagnostic({ ingest: async () => { count += 1; return fakeReport(); } });
    assert(count === 1, `ingestion should be called exactly once, got ${count}`);
    assert(typeof d.integrity.ok === "boolean", "integrity should be evaluated");
    assert(typeof d.integrity.nodeCount === "number", "integrity should report node counts");
  });

  // 51. Missing FRED key skips FRED safely.
  test("diagnostic skips FRED without key", async () => {
    intelligenceGraph.clear();
    const d = await runIngestionDiagnostic({ companies: singleUniverse, fredApiKey: "", transport: secFredTransport, now: () => BRIDGE_NOW });
    assert(d.report.providersSkipped.some(p => p.id === "fred"), "FRED should be skipped without a key");
    assert(d.report.providersCalled.includes("sec"), "SEC should still be called");
  });

  // 52. Diagnostic checks graph integrity after a live-shaped run.
  test("diagnostic checks integrity", async () => {
    intelligenceGraph.clear();
    const d = await runIngestionDiagnostic({ companies: singleUniverse, fredApiKey: "test", fredSeries: ["DGS10"], transport: secFredTransport, now: () => BRIDGE_NOW });
    assert(d.integrity.ok === true, "integrity should be clean after ingestion");
    assert(d.integrity.nodeCount > 0, "integrity should count nodes");
    assert(d.report.observationsIngested > 0, "observations should reach the graph");
  });

  // 53. A failed provider fetch returns a report instead of throwing.
  test("diagnostic tolerates provider failure", async () => {
    intelligenceGraph.clear();
    const failing: FetchLike = async () => new Response("upstream error", { status: 500 });
    const d = await runIngestionDiagnostic({ companies: singleUniverse, fredApiKey: "", includeForm4: false, transport: failing, now: () => BRIDGE_NOW, retry: { retries: 0, baseMs: 0 } });
    assert(d.report.fetchErrors.length >= 1, "provider failure should be recorded as fetch errors");
    assert(d.report.observationsIngested === 0, "no observations should be ingested on failure");
    assert(typeof d.integrity.ok === "boolean", "integrity should still be evaluated after a failure");
  });

  // 54. Memory records node snapshots plus inference and prediction history.
  test("memory records and reads entity history", () => {
    createDebugGraphFromSampleData();
    resetMemory();
    const stats = recordSnapshot({ now: () => Date.parse("2026-01-10") });
    assert(stats.entitiesRecorded > 0, "should record snapshots for graph nodes");
    const h = getEntityHistory("AI Infrastructure");
    assert("found" in h, "history should be found for a recorded theme");
    if ("found" in h) {
      assert(h.snapshots.length === 1, `one snapshot expected, got ${h.snapshots.length}`);
      assert(h.inferences.length === 1 && h.predictions.length === 1, "a theme should store inference and prediction");
    }
  });

  // 55. Unknown entities return a structured insufficient_history response.
  test("memory insufficient history for unknown", () => {
    resetMemory();
    const h = getEntityHistory("Nonexistent Entity XYZ");
    assert("status" in h && h.status === "insufficient_history", "unknown entity should return insufficient_history");
  });

  // 56. Snapshot comparison computes metric deltas across days.
  test("memory compares snapshots across days", () => {
    createDebugGraphFromSampleData();
    resetMemory();
    recordSnapshot({ now: () => Date.parse("2026-01-10") });
    intelligenceGraph.updateNode("AI Infrastructure", { confidence: 90, momentum: 10 });
    recordSnapshot({ now: () => Date.parse("2026-01-12") });
    const c = compareSnapshots("AI Infrastructure");
    assert("found" in c, "comparison should be available with two snapshots");
    if ("found" in c) {
      assert(c.days === 2, `expected 2 days, got ${c.days}`);
      assert(c.deltas.confidence !== 0, "a confidence delta should be captured");
    }
    const single = compareSnapshots("Definitely Unknown");
    assert("status" in single && single.status === "insufficient_history", "no history should be insufficient");
  });

  // 57. Pattern detection identifies a steady rise.
  test("memory detects steady rise", () => {
    createDebugGraphFromSampleData();
    resetMemory();
    intelligenceGraph.updateNode("AI Infrastructure", { confidence: 70 });
    recordSnapshot({ now: () => Date.parse("2026-01-10") });
    intelligenceGraph.updateNode("AI Infrastructure", { confidence: 80 });
    recordSnapshot({ now: () => Date.parse("2026-01-11") });
    intelligenceGraph.updateNode("AI Infrastructure", { confidence: 90 });
    recordSnapshot({ now: () => Date.parse("2026-01-12") });
    const p = detectHistoricalPatterns("AI Infrastructure");
    assert("found" in p, "patterns should be available with three snapshots");
    if ("found" in p) assert(p.patterns.some(x => x.pattern === "steady_rise"), `should detect steady_rise, got ${p.patterns.map(x => x.pattern).join(", ")}`);
  });

  // 58. Evolution summary needs two snapshots, and analogs rank by similarity.
  test("memory summarizes evolution and finds analogs", () => {
    createDebugGraphFromSampleData();
    resetMemory();
    recordSnapshot({ now: () => Date.parse("2026-01-10") });
    const one = summarizeEvolution("AI Infrastructure");
    assert("status" in one && one.status === "insufficient_history", "one snapshot is insufficient to summarize");
    intelligenceGraph.updateNode("AI Infrastructure", { confidence: 90, momentum: 9 });
    intelligenceGraph.updateNode("Nuclear Energy", { confidence: 74 });
    recordSnapshot({ now: () => Date.parse("2026-01-13") });
    const s = summarizeEvolution("AI Infrastructure");
    assert("found" in s && s.lines.length > 0, "two snapshots should yield an evolution summary");
    const a = findHistoricalAnalogs("AI Infrastructure");
    assert("found" in a, "analogs should be available with cross-entity history");
    if ("found" in a) assert(a.analogs.length > 0 && a.analogs[0].similarity >= 0 && a.analogs[0].similarity <= 100, "analogs should be ranked with a bounded similarity");
  });

  // 59. Successful orchestration runs every stage on a populated graph.
  test("orchestrator successful run", async () => {
    createDebugGraphFromSampleData();
    resetMemory();
    const report = await orchestrateIntelligence({ skipIngestion: true, now: () => Date.parse("2026-01-10") });
    assert(report.ok === true, `expected ok run, stageErrors=${JSON.stringify(report.stageErrors)} integrity=${report.integrity.ok}`);
    assert(report.integrity.ok === true, "integrity should be clean on the sample graph");
    assert(!!report.inference && report.inference.found, "inference stage should produce a market read");
    assert(!!report.prediction && report.prediction.found, "prediction stage should produce a forecast");
    assert(!!report.evidence && typeof report.evidence.trustScore === "number", "evidence stage should grade the inference");
    assert(!!report.narrative, "narrative stage should run");
    assert(report.memory.recorded === true && (report.memory.entitiesRecorded ?? 0) > 0, "memory snapshot should be recorded");
    assert(typeof report.timings.totalMs === "number", "timing statistics should be present");
  });

  // 60. A failing ingestion stage does not stop the rest of the pipeline.
  test("orchestrator partial failure continues", async () => {
    createDebugGraphFromSampleData();
    resetMemory();
    const report = await orchestrateIntelligence({ now: () => Date.parse("2026-01-10"), ingest: async () => { throw new Error("provider boom"); } });
    assert(report.stageErrors.some(s => s.stage === "ingestion"), "ingestion failure should be recorded");
    assert(report.ok === false, "an ingestion failure should make the run not ok");
    assert(!!report.inference && !!report.prediction, "downstream engines should still run after a stage failure");
    assert(report.health.stagesFailed.includes("ingestion"), "health should list the failed stage");
  });

  // 61. Empty provider run completes cleanly with no observations.
  test("orchestrator empty provider run", async () => {
    intelligenceGraph.clear();
    resetMemory();
    const report = await orchestrateIntelligence({ now: () => Date.parse("2026-01-10"), ingestion: { companies: [], fredApiKey: "", transport: secFredTransport } });
    assert(report.observationsIngested === 0, "no observations should be ingested with an empty universe and no FRED key");
    assert(report.integrity.ok === true, "an empty graph should be integrity clean");
    assert(report.ok === true, "an empty run with no errors should be ok");
    assert(!!report.prediction && report.prediction.found === false, "prediction should report no forecast on an empty graph");
  });

  // 62. Integrity failures are surfaced without aborting the pipeline.
  test("orchestrator surfaces integrity failure", async () => {
    intelligenceGraph.clear();
    intelligenceGraph.addNode({ label: "   ", type: "Company" });   // blank label -> integrity failure
    resetMemory();
    const report = await orchestrateIntelligence({ skipIngestion: true, now: () => Date.parse("2026-01-10") });
    assert(report.integrity.ok === false, "blank label should fail integrity");
    assert(report.integrity.emptyLabels >= 1, "the blank-label node should be counted");
    assert(report.ok === false, "an integrity failure should make the run not ok");
    assert(typeof report.timings.totalMs === "number", "the pipeline should still complete and report timings");
  });

  // Shared fixtures for the market-data tests.
  const MKT_NOW = Date.parse("2026-01-15T15:00:00Z");
  const fmpAAPL = [{ symbol: "AAPL", name: "Apple Inc.", price: 190.5, changesPercentage: 1.2, dayHigh: 192, dayLow: 188, open: 189, previousClose: 188.2, volume: 50000000, avgVolume: 60000000, marketCap: 3000000000000, timestamp: Math.floor(MKT_NOW / 1000) }];
  const fmpSPY  = [{ symbol: "SPY", name: "SPDR S&P 500 ETF", price: 500, changesPercentage: 0.5, dayHigh: 502, dayLow: 498, open: 499, previousClose: 497.5, volume: 70000000, avgVolume: 80000000, isEtf: true, timestamp: Math.floor(MKT_NOW / 1000) }];
  const fmpStale = [{ symbol: "MSFT", name: "Microsoft", price: 400, changesPercentage: 0.1, volume: 20000000, avgVolume: 25000000, timestamp: Math.floor((MKT_NOW - 5 * 86_400_000) / 1000) }];
  const mkFmp = () => new FmpAdapter({ now: () => MKT_NOW, apiKey: "test", retry: { retries: 0, baseMs: 0 } });

  // 63. Stock quote observations reach the graph and enrich the Company node.
  test("market quote reaches graph", () => {
    intelligenceGraph.clear();
    const obs = mkFmp().normalize(fmpAAPL, { dataset: "quote", symbols: ["AAPL"] });
    const stats = ingestProviderObservations(obs);
    assert(stats.observationsIngested >= 3, `expected price + volume + liquidity, got ${stats.observationsIngested}`);
    const node = intelligenceGraph.getNode("AAPL");
    assert(!!node && node.type === "Company", "AAPL company node should exist");
    const lmd = node!.metadata.latestMarketData as Record<string, unknown> | undefined;
    assert(!!lmd && lmd.price === 190.5 && lmd.changePercent === 1.2, "latestMarketData should be enriched on the node");
    const metrics = intelligenceGraph.getNeighbors(node!.id).filter(n => n.node.type === "MarketMetric");
    assert(metrics.length >= 3 && metrics.every(m => m.edge.relationshipType === "has_market_metric"), "market metrics should link via has_market_metric");
  });

  // 64. ETF quotes create an ETF node.
  test("market ETF quote reaches graph", () => {
    intelligenceGraph.clear();
    ingestProviderObservations(mkFmp().normalize(fmpSPY, { dataset: "quote", symbols: ["SPY"] }));
    const spy = intelligenceGraph.getNode("SPY");
    assert(!!spy && spy.type === "ETF", `SPY should be an ETF node, got ${spy?.type}`);
  });

  // 65. Volume and liquidity are preserved on their metric nodes.
  test("market volume and liquidity preserved", () => {
    intelligenceGraph.clear();
    ingestProviderObservations(mkFmp().normalize(fmpAAPL, { dataset: "quote", symbols: ["AAPL"] }));
    const vol = intelligenceGraph.getNode("mkt:AAPL:volume");
    const liq = intelligenceGraph.getNode("mkt:AAPL:liquidity");
    assert(!!vol && vol.metadata.volume === 50000000 && vol.metadata.avgVolume === 60000000, "volume metric should preserve raw volume");
    assert(vol!.metadata.relativeVolume === 0.83, `relative volume should be 0.83, got ${vol!.metadata.relativeVolume}`);
    assert(!!liq && liq.metadata.dollarVolume === 190.5 * 50000000, "liquidity metric should preserve dollar volume");
  });

  // 66. OHLCV bars reach the graph.
  test("market ohlcv reaches graph", () => {
    intelligenceGraph.clear();
    const bars = { symbol: "AAPL", historical: [{ date: "2026-01-14", open: 1, high: 2, low: 0.5, close: 1.5, volume: 100 }, { date: "2026-01-15", open: 1.5, high: 2.5, low: 1, close: 2, volume: 200 }] };
    ingestProviderObservations(mkFmp().normalize(bars, { dataset: "daily", symbol: "AAPL" }));
    const oh = intelligenceGraph.getNode("mkt:AAPL:ohlcv");
    assert(!!oh && Array.isArray(oh.metadata.bars) && (oh.metadata.bars as unknown[]).length === 2, "ohlcv metric should carry the bar series");
  });

  // 67. Stale data is flagged on the observation, the node, and provider health.
  test("market stale data flagged", () => {
    intelligenceGraph.clear();
    const fmp = mkFmp();
    const obs = fmp.normalize(fmpStale, { dataset: "quote", symbols: ["MSFT"] });
    const price = obs.find(o => o.observationType === "market_price");
    assert(price!.metadata.stale === true, "an old quote should be flagged stale on the observation");
    ingestProviderObservations(obs);
    const node = intelligenceGraph.getNode("MSFT");
    assert((node!.metadata.latestMarketData as Record<string, unknown>).stale === true, "stale flag should reach the node");
    const h = fmp.health() as unknown as { staleTickers: number; tickerCount: number };
    assert(h.staleTickers >= 1 && h.tickerCount >= 1, "provider health should count stale and total tickers");
  });

  // Fallback fixtures: batch-quote returns 402, per-symbol /stable/profile serves data.
  const profiles: Record<string, Record<string, unknown>> = {
    AAPL: { symbol: "AAPL", companyName: "Apple Inc.", price: 190.5, changePercentage: 1.2, volume: 50000000, averageVolume: 60000000, marketCap: 3000000000000, beta: 1.25, range: "164-199", exchange: "NASDAQ", sector: "Technology", industry: "Consumer Electronics", isEtf: false },
    MSFT: { symbol: "MSFT", companyName: "Microsoft", price: 400, changePercentage: 0.5, volume: 20000000, averageVolume: 25000000, marketCap: 2800000000000, beta: 0.9, exchange: "NASDAQ", sector: "Technology", industry: "Software", isEtf: false },
    SPY:  { symbol: "SPY", companyName: "SPDR S&P 500 ETF", price: 500, changePercentage: 0.4, volume: 70000000, averageVolume: 80000000, isEtf: true },
  };
  const fallbackTx = (avail: string[]): FetchLike => async (url) => {
    const u = String(url);
    if (u.includes("/batch-quote")) return new Response("Payment Required", { status: 402 });
    if (u.includes("/profile?symbol=")) {
      const sym = decodeURIComponent(u.split("symbol=")[1].split("&")[0]).toUpperCase();
      return avail.includes(sym) ? new Response(JSON.stringify([profiles[sym]]), { status: 200 }) : new Response("Not Found", { status: 404 });
    }
    return new Response("not found", { status: 404 });
  };

  // 68c. Batch-quote success path parses without a fallback marker.
  test("FMP batch-quote success path", async () => {
    intelligenceGraph.clear();
    const fmp = new FmpAdapter({ now: () => MKT_NOW, apiKey: "test", retry: { retries: 0, baseMs: 0 }, transport: routingTransport([[/batch-quote/, fmpAAPL]]) });
    const res = await fmp.fetch({ dataset: "quote", symbols: ["AAPL"] });
    const price = res.observations.find(o => o.observationType === "market_price");
    assert(!!price && price.payload.price === 190.5, "batch quote should parse price");
    assert(price!.metadata.sourceEndpoint === undefined, "batch success should not be marked as a fallback");
  });

  // 68d. Batch-quote 402 falls back to /stable/profile and preserves profile fields.
  test("FMP 402 falls back to profile", async () => {
    intelligenceGraph.clear();
    const fmp = new FmpAdapter({ now: () => MKT_NOW, apiKey: "test", retry: { retries: 0, baseMs: 0 }, transport: fallbackTx(["AAPL"]) });
    const res = await fmp.fetch({ dataset: "quote", symbols: ["AAPL"] });
    const price = res.observations.find(o => o.observationType === "market_price");
    assert(!!price && price.metadata.sourceEndpoint === "profile_fallback", "profile fallback should be marked");
    assert(price!.payload.price === 190.5 && price!.payload.changePercent === 1.2, "price and change should be preserved");
    assert(price!.payload.sector === "Technology" && price!.payload.beta === 1.25 && price!.payload.exchange === "NASDAQ", "profile reference fields should be preserved");
    ingestProviderObservations(res.observations);
    const node = intelligenceGraph.getNode("AAPL");
    assert(!!node && (node.metadata.latestMarketData as Record<string, unknown>).sector === "Technology", "profile data should reach the graph");
  });

  // 68e. Multiple symbols each fall back to their own profile request.
  test("FMP fallback handles multiple symbols", async () => {
    intelligenceGraph.clear();
    const fmp = new FmpAdapter({ now: () => MKT_NOW, apiKey: "test", retry: { retries: 0, baseMs: 0 }, transport: fallbackTx(["AAPL", "MSFT"]) });
    const res = await fmp.fetch({ dataset: "quote", symbols: ["AAPL", "MSFT"] });
    ingestProviderObservations(res.observations);
    assert(!!intelligenceGraph.getNode("AAPL") && !!intelligenceGraph.getNode("MSFT"), "both symbols should ingest via the profile fallback");
    assert(res.observations.filter(o => o.observationType === "market_price").every(o => o.metadata.sourceEndpoint === "profile_fallback"), "all should be fallback-sourced");
  });

  // 68f. ETF symbols still create an ETF node through the profile fallback.
  test("FMP fallback keeps ETF support", async () => {
    intelligenceGraph.clear();
    const fmp = new FmpAdapter({ now: () => MKT_NOW, apiKey: "test", retry: { retries: 0, baseMs: 0 }, transport: fallbackTx(["SPY"]) });
    const res = await fmp.fetch({ dataset: "quote", symbols: ["SPY"], etfs: ["SPY"] });
    ingestProviderObservations(res.observations);
    const spy = intelligenceGraph.getNode("SPY");
    assert(!!spy && spy.type === "ETF", `SPY should be an ETF node via fallback, got ${spy?.type}`);
  });

  // 68g. Market observations survive a graph clear/rebuild (drawer wiring).
  test("market observations survive graph rebuild", () => {
    intelligenceGraph.clear();
    clearMarketObservationCache();
    ingestProviderObservations(mkFmp().normalize(fmpAAPL, { dataset: "quote", symbols: ["AAPL"] }));
    assert(!!intelligenceGraph.getNode("AAPL")?.metadata.latestMarketData, "market data should be present after ingest");
    assert(marketObservationCacheSize() > 0, "market observations should be cached");
    // Simulate useIntelligenceGraph clearing and rebuilding the graph.
    intelligenceGraph.clear();
    assert(!intelligenceGraph.getNode("AAPL"), "the clear should wipe the node");
    const applied = reingestCachedMarketObservations();
    assert(applied > 0, "cached market observations should re-apply on rebuild");
    const node = intelligenceGraph.getNode("AAPL");
    assert(!!node && (node.metadata.latestMarketData as Record<string, unknown>).price === 190.5, "latestMarketData should be restored after rebuild");
  });

  // 68h. Non-market observations are not cached by the market wiring.
  test("non-market observations are not cached", () => {
    clearMarketObservationCache();
    const sec = new SecAdapter({ now: () => MKT_NOW });
    ingestProviderObservations(sec.normalize(appleFacts, { dataset: "companyfacts", ticker: "AAPL" }));
    assert(marketObservationCacheSize() === 0, "SEC financials should not populate the market cache");
    clearMarketObservationCache();
  });

  // 68b. FMP calls the current stable batch-quote endpoint, not the legacy one.
  test("FMP uses stable batch-quote endpoint", async () => {
    let capturedUrl = "";
    const captureTx: FetchLike = async (url) => { capturedUrl = String(url); return new Response(JSON.stringify([...fmpAAPL]), { status: 200 }); };
    const fmp = new FmpAdapter({ now: () => MKT_NOW, apiKey: "test", retry: { retries: 0, baseMs: 0 }, transport: captureTx });
    await fmp.fetch({ dataset: "quote", symbols: ["AAPL"] });
    assert(capturedUrl.includes("/stable/batch-quote?symbols=AAPL"), `should call the stable batch-quote endpoint, got ${capturedUrl}`);
    assert(!capturedUrl.includes("/api/v3/quote/"), "should not call the legacy /api/v3/quote endpoint");
  });

  // 68. Market provider is a separate, generic path (Yahoo route untouched).
  test("market provider separate and generic", () => {
    const fmp = mkFmp();
    const md = fmp.metadata();
    assert(md.id === "fmp" && md.cadence === "realtime", "FMP should be a distinct realtime provider");
    assert(["market_price", "volume", "liquidity", "ohlcv"].every(t => md.supportsObservations.includes(t)), "FMP should support the market observation types");
    assert(fmp instanceof MarketDataAdapter, "FMP should extend the generic MarketDataAdapter for future providers");
    intelligenceGraph.clear();
    ingestProviderObservations(mkFmp().normalize(fmpAAPL, { dataset: "quote", symbols: ["AAPL"] }));
    ingestProviderObservations(mkFmp().normalize(fmpSPY, { dataset: "quote", symbols: ["SPY"] }));
    const rep = validateGraphIntegrity();
    assert(rep.ok, `graph should stay clean after market ingestion: ${JSON.stringify(rep.emptyLabels)}`);
  });

  // 69. runProviderIngestion fetches market data (opt-in) and it reaches the graph.
  test("ingestion wires FMP market data", async () => {
    intelligenceGraph.clear();
    const tx = routingTransport([[/financialmodelingprep.*batch-quote/, [...fmpAAPL, ...fmpSPY]]]);
    const report = await runProviderIngestion({ force: true, companies: [], fredApiKey: "", marketSymbols: ["AAPL", "SPY"], marketEtfs: ["SPY"], fmpApiKey: "test", transport: tx, now: () => MKT_NOW });
    assert(report.providersCalled.includes("fmp"), "FMP should be called when marketSymbols are provided");
    assert(report.providerHealth.some(h => String(h.id) === "fmp"), "FMP health should be in the report");
    const node = intelligenceGraph.getNode("AAPL");
    assert(!!node && (node.metadata.latestMarketData as Record<string, unknown> | undefined)?.price === 190.5, "market data should reach the graph through ingestion");
    const spy = intelligenceGraph.getNode("SPY");
    assert(!!spy && spy.type === "ETF", "ETF symbol should ingest as an ETF node");
  });

  // 70. The scheduler runs the market cadence alongside SEC and FRED, gated by the flag.
  test("scheduler runs market cadence", async () => {
    const calls: string[] = [];
    const ingestSpy = async (cfg: import("./dataAdapters/providerIngestion").IngestionConfig) => {
      if (cfg.marketSymbols?.length) calls.push("market");
      else if (cfg.companies?.length) calls.push("sec");
      else if (cfg.fredSeries?.length) calls.push("fred");
      return fakeReport();
    };
    const s = new IngestionScheduler({
      force: true, now: () => MKT_NOW, ingest: ingestSpy,
      companies: [{ ticker: "AAPL", cik: 1 }], fredSeries: ["DGS10"], marketSymbols: ["AAPL", "SPY"],
      secIntervalMs: 86_400_000, fredIntervalMs: 86_400_000, marketIntervalMs: 3_600_000,
    });
    const r1 = await s.tick();
    assert(r1.ran && r1.reason === "ok", "first tick should run");
    assert(calls.includes("sec") && calls.includes("fred") && calls.includes("market"), `all three cadences should run first, got ${calls.join(",")}`);
    assert(!!r1.reports.market, "the market report should be present");
    const r2 = await s.tick();
    assert(r2.ran === false && r2.reason === "not-due", "a second tick within every interval should do nothing");
  });

  // 71. Phase 16: entity-aware drawer routing. Symbols resolve to their own ticker
  // node, never through the parent theme; themes never show market structure.
  test("drawer routes ARES to ARES not Private Credit", () => {
    intelligenceGraph.clear();
    intelligenceGraph.addNode({ label: "Private Credit", type: "Theme" });
    intelligenceGraph.addNode({ label: "ARES", type: "Company", metadata: { latestMarketData: { price: 141.3, changePercent: 0.6, provider: "fmp" } } });
    const e = resolveDrawerEntity(buildCompanyContext("ARES"), { themeName: "Private Credit", relatedCompanies: ["ARES", "BX", "APO"] });
    assert(e.entityType === "company", "an ARES click should stay a company drawer");
    assert(e.title === "ARES", `title should be ARES, got ${e.title}`);
    assert(e.subtitle === "Private Credit", "the parent theme should be the subtitle, not the title");
    assert(!!e.node && e.node.id === intelligenceGraph.getNode("ARES")!.id, "the graph key should resolve the ARES ticker node");
    assert(e.showMarketStructure, "market structure should show for a company with latestMarketData");
  });

  test("drawer routes NVDA to NVDA not AI Infrastructure", () => {
    intelligenceGraph.clear();
    intelligenceGraph.addNode({ label: "AI Infrastructure", type: "Theme" });
    intelligenceGraph.addNode({ label: "NVDA", type: "Company", aliases: ["Nvidia"] });
    const e = resolveDrawerEntity({ kind: "company", id: "NVDA", label: "NVDA" }, { themeName: "AI Infrastructure", relatedCompanies: ["NVDA", "VST"] });
    assert(e.entityType === "company" && e.title === "NVDA", "an NVDA click should stay a company drawer titled NVDA");
    assert(!!e.node && e.node.id === intelligenceGraph.getNode("NVDA")!.id, "the graph key should resolve the NVDA node, not the theme");
    assert(!e.showMarketStructure, "market structure should hide when the company has no latestMarketData");
  });

  test("drawer routes theme to theme entity", () => {
    intelligenceGraph.clear();
    // Even a theme node that (wrongly) carried market data must not show the block.
    intelligenceGraph.addNode({ label: "Private Credit", type: "Theme", metadata: { latestMarketData: { price: 1 } } });
    const e = resolveDrawerEntity({ kind: "theme", id: "private-credit", label: "Private Credit" }, { themeName: "Private Credit" });
    assert(e.entityType === "theme" && e.title === "Private Credit", "a theme click should stay a theme drawer");
    assert(!e.showMarketStructure, "market structure must stay hidden for themes");
  });

  test("drawer routes ETF with market structure", () => {
    intelligenceGraph.clear();
    intelligenceGraph.addNode({ label: "SPY", type: "ETF", metadata: { latestMarketData: { price: 512.4, provider: "fmp" } } });
    const e = resolveDrawerEntity(buildSymbolContext("etf", "spy"), {});
    assert(e.entityType === "etf" && e.title === "SPY", "an ETF click should open an ETF drawer titled by ticker");
    assert(e.showMarketStructure, "market structure should show for an ETF with latestMarketData");
    // Graceful fallback: an unknown ETF still resolves, with no node and no market block.
    const g = resolveDrawerEntity(buildSymbolContext("etf", "XYZQ"), {});
    assert(g.title === "XYZQ" && g.node === null && !g.showMarketStructure, "an unknown ETF should fall back gracefully");
  });

  // 72. Explorer market pipeline: FMP observations fetched server-side and ingested
  // through the bridge stay readable in the Explorer's entity resolution across the
  // clear/rebuild cycle useIntelligenceGraph performs (clear + reingest cache).
  test("explorer context gets latestMarketData for NVDA after rebuild", async () => {
    intelligenceGraph.clear();
    clearMarketObservationCache();
    const fmpNVDA = [{ symbol: "NVDA", name: "NVIDIA Corp", price: 1234.5, changesPercentage: 2.1, dayHigh: 1250, dayLow: 1201, open: 1210, previousClose: 1209.1, volume: 30000000, avgVolume: 42000000, marketCap: 3100000000000, timestamp: Math.floor(MKT_NOW / 1000) }];
    const fmp = new FmpAdapter({ now: () => MKT_NOW, apiKey: "test", retry: { retries: 0, baseMs: 0 }, transport: routingTransport([[/batch-quote/, fmpNVDA]]) });
    const res = await fmp.fetch({ dataset: "quote", symbols: ["NVDA"] });
    ingestProviderObservations(res.observations);
    // Simulate the Explorer page's graph rebuild from app data.
    intelligenceGraph.clear();
    reingestCachedMarketObservations();
    const e = resolveDrawerEntity({ kind: "company", id: "NVDA", label: "NVDA" }, {});
    assert(!!e.node, "NVDA should resolve to a graph node in Explorer context");
    const lmd = e.node!.metadata.latestMarketData as Record<string, unknown> | undefined;
    assert(!!lmd && lmd.price === 1234.5 && lmd.provider === "fmp", `latestMarketData should survive the rebuild, got ${JSON.stringify(lmd ?? null)}`);
    assert(e.showMarketStructure, "Explorer market structure should show for NVDA after ingest");
  });

  // 72b. Daily OHLCV bars ingested for a ticker survive the rebuild and carry the
  // t/c fields the Explorer price chart reads (buildPriceSeries contract).
  test("explorer ohlcv bars survive rebuild for the price chart", async () => {
    intelligenceGraph.clear();
    clearMarketObservationCache();
    const daily = { symbol: "XOM", historical: [
      { date: "2026-01-13", open: 100, high: 104, low: 99, close: 103, volume: 10000000 },
      { date: "2026-01-14", open: 103, high: 106, low: 102, close: 105, volume: 12000000 },
      { date: "2026-01-15", open: 105, high: 107, low: 104, close: 106, volume: 11000000 },
    ] };
    const fmp = new FmpAdapter({ now: () => MKT_NOW, apiKey: "test", retry: { retries: 0, baseMs: 0 }, transport: routingTransport([[/historical-price-eod/, daily]]) });
    const res = await fmp.fetch({ dataset: "daily", symbol: "XOM", assetType: "Company" });
    ingestProviderObservations(res.observations);
    intelligenceGraph.clear();
    reingestCachedMarketObservations();
    const node = intelligenceGraph.getNode("mkt:XOM:ohlcv");
    assert(!!node && Array.isArray(node.metadata.bars), "the ohlcv node should survive the rebuild");
    const bars = node!.metadata.bars as Array<Record<string, unknown>>;
    assert(bars.length === 3 && typeof bars[0].t === "number" && typeof bars[0].c === "number", "bars should carry numeric t/c for the price series");
    assert(node!.metadata.interval === "daily", `interval should be daily, got ${node!.metadata.interval}`);
    assert(!!intelligenceGraph.getNode("XOM"), "the XOM company node should exist from the ohlcv ingest");
  });

  // 73. Phase 2 market pipeline: quote fallback chain, intraday coexistence, and
  // honest range selection for the Explorer chart.
  const singleQuoteTx: FetchLike = async (url) => {
    const u = String(url);
    if (u.includes("/batch-quote")) return new Response("Payment Required", { status: 402 });
    if (u.includes("/quote?symbol=NVDA")) return new Response(JSON.stringify([{ symbol: "NVDA", name: "NVIDIA Corporation", price: 196.9, changePercentage: 1.4, volume: 120000000, dayLow: 193.5, dayHigh: 198.2, yearHigh: 212.2, yearLow: 86.6, marketCap: 4800000000000, open: 194.1, previousClose: 194.2, exchange: "NASDAQ", timestamp: Math.floor(MKT_NOW / 1000) }]), { status: 200 });
    if (u.includes("/profile?symbol=NVDA")) return new Response(JSON.stringify([{ symbol: "NVDA", companyName: "NVIDIA Corporation", beta: 2.12, averageVolume: 180000000, range: "86.62-212.19", sector: "Technology", isEtf: false }]), { status: 200 });
    return new Response("nf", { status: 404 });
  };

  test("FMP single-quote fallback fills day fields", async () => {
    intelligenceGraph.clear();
    clearMarketObservationCache();
    const fmp = new FmpAdapter({ now: () => MKT_NOW, apiKey: "test", retry: { retries: 0, baseMs: 0 }, transport: singleQuoteTx });
    const res = await fmp.fetch({ dataset: "quote", symbols: ["NVDA"] });
    const price = res.observations.find(o => o.observationType === "market_price");
    assert(!!price && price.metadata.sourceEndpoint === "quote_profile", `single quote should be marked quote_profile, got ${price?.metadata.sourceEndpoint}`);
    assert(price!.payload.open === 194.1 && price!.payload.previousClose === 194.2, "open and previous close should come from /quote");
    assert(price!.payload.high === 198.2 && price!.payload.low === 193.5, "day high/low should come from /quote");
    assert(price!.payload.yearHigh === 212.2 && price!.payload.yearLow === 86.6, "52-week high/low should be numeric from /quote");
    assert(price!.payload.avgVolume === 180000000 && price!.payload.beta === 2.12, "avg volume and beta should merge in from /profile");
    ingestProviderObservations(res.observations);
    const lmd = intelligenceGraph.getNode("NVDA")!.metadata.latestMarketData as Record<string, unknown>;
    assert(lmd.open === 194.1 && lmd.yearHigh === 212.2 && lmd.sourceEndpoint === "quote_profile", "merged quote fields should reach the node");
  });

  const dailyBarsNVDA = { symbol: "NVDA", historical: [
    { date: "2026-01-13", open: 190, high: 195, low: 188, close: 193, volume: 90000000, vwap: 191.4 },
    { date: "2026-01-14", open: 193, high: 197, low: 192, close: 196, volume: 95000000, vwap: 194.8 },
    { date: "2026-01-15", open: 196, high: 199, low: 195, close: 197, volume: 88000000, vwap: 197.1 },
  ] };
  const intraBarsNVDA = [
    { date: "2026-01-15 15:45:00", open: 196.4, high: 196.9, low: 196.2, close: 196.8, volume: 400000 },
    { date: "2026-01-15 15:50:00", open: 196.8, high: 197.2, low: 196.6, close: 197.0, volume: 380000 },
    { date: "2026-01-15 15:55:00", open: 197.0, high: 197.4, low: 196.9, close: 197.3, volume: 420000 },
    { date: "2026-01-15 16:00:00", open: 197.3, high: 197.5, low: 197.0, close: 197.1, volume: 500000 },
  ];

  test("intraday and daily ohlcv coexist and survive rebuild", async () => {
    intelligenceGraph.clear();
    clearMarketObservationCache();
    const fmp = new FmpAdapter({ now: () => MKT_NOW, apiKey: "test", retry: { retries: 0, baseMs: 0 }, transport: routingTransport([[/historical-price-eod/, dailyBarsNVDA], [/historical-chart/, intraBarsNVDA]]) });
    ingestProviderObservations((await fmp.fetch({ dataset: "daily", symbol: "NVDA", assetType: "Company" })).observations);
    ingestProviderObservations((await fmp.fetch({ dataset: "intraday", symbol: "NVDA", interval: "5min", assetType: "Company" })).observations);
    intelligenceGraph.clear();
    reingestCachedMarketObservations();
    const d = intelligenceGraph.getNode("mkt:NVDA:ohlcv");
    const i = intelligenceGraph.getNode("mkt:NVDA:ohlcv:intraday");
    assert(!!d && d.metadata.interval === "daily" && (d.metadata.bars as unknown[]).length === 3, "daily series should survive on its legacy node");
    assert(!!i && i.metadata.interval === "intraday" && i.metadata.resolution === "5min" && (i.metadata.bars as unknown[]).length === 4, "intraday series should survive on its own node");
    const dailyVwap = (d!.metadata.bars as Array<Record<string, unknown>>)[2].vwap;
    assert(dailyVwap === 197.1, `daily bars should carry vwap, got ${dailyVwap}`);
  });

  test("missing intraday degrades gracefully to daily", async () => {
    intelligenceGraph.clear();
    clearMarketObservationCache();
    const tx: FetchLike = async (url) => String(url).includes("historical-price-eod")
      ? new Response(JSON.stringify(dailyBarsNVDA), { status: 200 })
      : new Response("Payment Required", { status: 402 });
    const fmp = new FmpAdapter({ now: () => MKT_NOW, apiKey: "test", retry: { retries: 0, baseMs: 0 }, transport: tx });
    ingestProviderObservations((await fmp.fetch({ dataset: "daily", symbol: "NVDA", assetType: "Company" })).observations);
    let threw = false;
    try { await fmp.fetch({ dataset: "intraday", symbol: "NVDA", interval: "5min", assetType: "Company" }); } catch { threw = true; }
    assert(threw, "a blocked intraday endpoint should throw so the route can flag plan-limited");
    assert(!!intelligenceGraph.getNode("mkt:NVDA:ohlcv"), "daily bars should still be available");
    assert(!intelligenceGraph.getNode("mkt:NVDA:ohlcv:intraday"), "no intraday node should be fabricated");
  });

  test("1D never renders daily bars as intraday", () => {
    const NOW = MKT_NOW;
    const mkDaily = (): PriceSeriesVM => ({
      available: true, interval: "daily", resolution: null, provider: "fmp",
      points: Array.from({ length: 30 }, (_, i): PricePoint => ({ t: NOW - (30 - i) * 86_400_000, c: 100 + i, o: 100 + i, h: 101 + i, l: 99 + i, v: 1000, vwap: null })),
    });
    const mkIntra = (): PriceSeriesVM => ({
      available: true, interval: "intraday", resolution: "5min", provider: "fmp",
      points: Array.from({ length: 24 }, (_, i): PricePoint => ({ t: NOW - (24 - i) * 300_000, c: 100, o: 100, h: 100.5, l: 99.5, v: 1000, vwap: null })),
    });
    const no1d = selectSeriesForRange("1D", EMPTY_PRICE_SERIES, mkDaily(), NOW);
    assert(no1d.interval === null && no1d.fallback === "snapshot" && no1d.points.length === 0, "1D without intraday must show the snapshot state, never daily bars");
    const wk = selectSeriesForRange("1W", EMPTY_PRICE_SERIES, mkDaily(), NOW);
    assert(wk.interval === "daily" && wk.fallback === "daily" && wk.points.length >= 2, "1W without intraday should fall back to daily bars");
    const yes1d = selectSeriesForRange("1D", mkIntra(), mkDaily(), NOW);
    assert(yes1d.interval === "intraday" && yes1d.fallback === "none" && yes1d.points.length >= 4, "1D with intraday bars should render them");
    const m1 = selectSeriesForRange("1M", mkIntra(), mkDaily(), NOW);
    assert(m1.interval === "daily", "1M and wider render daily bars");
  });

  // 74. Sprint 3B causal engine: multi-hop chains, relationship intelligence,
  // and progressive expansion of existing relationships.
  const seedCausalGraph = () => {
    intelligenceGraph.clear();
    const add = (label: string, type: string) => intelligenceGraph.addNode({ label, type: type as never });
    add("AI Capex", "Macro");
    add("AI Infrastructure", "Theme");
    add("Semiconductors", "Sector");
    add("NVDA", "Company");
    add("AMD", "Company");
    add("ASML", "Company");
    add("Blackwell sold out", "Story");
    const rel = (source: string, relationshipType: string, target: string, strength = 70) =>
      intelligenceGraph.addRelationship({ source, target, relationshipType: relationshipType as never, strength, confidence: 70 });
    rel("AI Capex", "drives", "AI Infrastructure", 82);
    rel("AI Infrastructure", "drives", "Semiconductors", 76);
    rel("AI Infrastructure", "supports", "NVDA", 88);
    rel("NVDA", "competes_with", "AMD", 64);
    rel("ASML", "supplies", "NVDA", 58);
    rel("Blackwell sold out", "mentions", "NVDA", 45);
  };

  test("causal chains surface driver and sector at two hops", () => {
    seedCausalGraph();
    const m = buildRelationshipMap("NVDA", { causalChains: true, maxFirst: 8, maxSecond: 8 });
    const labels = new Set(m.nodes.map(n => n.label));
    assert(labels.has("AI Infrastructure") && labels.has("Blackwell sold out"), "first-degree theme and story should be present");
    assert(labels.has("AI Capex"), "the macro driver should surface via the theme (Driver -> Theme -> Company chain)");
    assert(labels.has("Semiconductors"), "the sector should surface via the theme");
    const driverEdge = m.edges.find(e => e.from.label === "AI Capex" || e.to.label === "AI Capex");
    assert(!!driverEdge && /driv/.test(driverEdge.type), "the driver should connect through its real drives edge");
  });

  test("relationship intelligence rides on every map edge", () => {
    seedCausalGraph();
    // Re-assert one edge so it reads as strengthening.
    intelligenceGraph.addRelationship({ source: "AI Infrastructure", target: "NVDA", relationshipType: "supports", strength: 90, confidence: 75 });
    const m = buildRelationshipMap("NVDA", { causalChains: true, maxFirst: 8, maxSecond: 8 });
    const supp = m.edges.find(e => e.type === "supports");
    assert(!!supp, "supports edge should be on the map");
    assert(supp!.trend === "strengthening", `a re-asserted edge should read strengthening, got ${supp!.trend}`);
    assert(Number.isFinite(supp!.firstObserved) && supp!.lastObserved >= supp!.firstObserved, "edges should carry their observed lifetime");
    const single = m.edges.find(e => e.type === "mentions");
    assert(!!single && single.trend === "stable", "a single observation should read stable");
  });

  test("edge trend derivation is honest", () => {
    intelligenceGraph.clear();
    intelligenceGraph.addNode({ label: "A", type: "Theme" });
    intelligenceGraph.addNode({ label: "B", type: "Company" });
    const e1 = intelligenceGraph.addRelationship({ source: "A", target: "B", relationshipType: "supports", strength: 50, confidence: 50 })!;
    const a = intelligenceGraph.getNode("A")!, b = intelligenceGraph.getNode("B")!;
    assert(deriveEdgeTrend(e1, a, b) === "stable", "one observation is stable");
    const e2 = intelligenceGraph.addRelationship({ source: "A", target: "B", relationshipType: "supports" })!;
    assert(deriveEdgeTrend(e2, a, b) === "strengthening", "re-assertion is strengthening");
    // Edge quiet while both endpoints stayed active well past it -> weakening.
    const stale = { ...e2, evidenceCount: 1, lastObserved: e2.firstObserved };
    const activeA = { ...a, lastSeen: e2.firstObserved + 48 * 3_600_000 };
    const activeB = { ...b, lastSeen: e2.firstObserved + 48 * 3_600_000 };
    assert(deriveEdgeTrend(stale, activeA, activeB) === "weakening", "a quiet edge between active nodes weakens");
  });

  test("expansion reveals existing relationships by intent, idempotently", () => {
    seedCausalGraph();
    // Small base map that leaves AMD and ASML hidden.
    const base = buildRelationshipMap("NVDA", { maxFirst: 1, maxSecond: 0 });
    assert(!base.nodes.some(n => n.label === "AMD"), "AMD should start hidden");
    assert(countExpansion(base, "competitors") === 1, "competitor expansion should count AMD");
    const withComp = expandMap(base, "competitors");
    assert(withComp.nodes.some(n => n.label === "AMD"), "competitor expansion should reveal AMD");
    assert(withComp.edges.some(e => e.type === "competes_with"), "only the real competes_with edge is added");
    assert(!withComp.nodes.some(n => n.label === "ASML"), "competitor expansion must not drag in suppliers");
    const again = expandMap(withComp, "competitors");
    assert(again.nodes.length === withComp.nodes.length, "expansion is idempotent");
    const withSupp = expandMap(withComp, "suppliers");
    assert(withSupp.nodes.some(n => n.label === "ASML"), "supplier expansion should reveal ASML via its supplies edge");
    const withMacro = expandMap(base, "macro");
    assert(withMacro.nodes.some(n => n.label === "AI Capex"), "macro expansion should reveal the driver through the visible theme");
  });

  // 75. System 1: the canonical Intelligence Profile contract (read-only
  // composition of existing engines; honest section statuses; never throws).
  test("intelligence profile assembles for a company", () => {
    seedCausalGraph();
    const p = buildIntelligenceProfile("NVDA");
    assert(p.version === PROFILE_VERSION && p.entityKey === "NVDA", "profile carries version and key");
    assert(p.identity.status === "live" && p.identity.data?.kind === "company", `identity should resolve as company, got ${p.identity.data?.kind}`);
    assert(p.identity.data!.causalLayer === 3, "companies sit at causal layer 3");
    assert(p.drivers.status === "live" && (p.drivers.data ?? []).some(d => d.label === "AI Infrastructure"), "the theme should appear as an upstream driver link");
    assert((p.drivers.data ?? []).some(d => d.label === "AI Capex" && d.via === "AI Infrastructure"), "the two-hop macro driver should carry its via entity");
    assert(p.transmission.status === "live" && (p.transmission.data?.strongestPath ?? []).includes("NVDA"), "transmission path should include the entity itself");
    assert(p.confidence.status === "live" && p.confidence.data!.explanation.length > 0, "confidence must always decompose into an explanation");
    // Sections without underlying data must degrade honestly, never fabricate.
    for (const s of [p.thesis, p.evidence, p.evolution, p.watch, p.risks]) {
      assert(s.status !== "live" || s.data !== null, "live sections must carry data");
      assert(s.status !== "unavailable" || s.data === null, "unavailable sections must carry null");
    }
  });

  test("intelligence profile is honest for unknown entities", () => {
    intelligenceGraph.clear();
    const p = buildIntelligenceProfile("ZZZQ-DOES-NOT-EXIST");
    assert(p.identity.status === "unavailable" && p.identity.data === null, "unknown entity yields unavailable identity");
    assert(p.drivers.status === "unavailable" && p.evidence.status === "unavailable" && p.watch.status === "unavailable", "all sections degrade to unavailable");
  });

  test("intelligence profile answers for a theme with beneficiaries", () => {
    seedCausalGraph();
    const p = buildIntelligenceProfile("AI Infrastructure", { narrative: { headline: "Hyperscaler capex accelerates AI compute demand.", nextWatch: "capex guidance revisions" } });
    assert(p.identity.data?.kind === "theme" && p.identity.data.causalLayer === 1, "theme identity resolves at layer 1");
    assert((p.drivers.data ?? []).some(d => d.label === "AI Capex"), "the macro driver is upstream of the theme");
    assert(p.beneficiaries.status === "live" && (p.beneficiaries.data ?? []).some(b => b.label === "NVDA"), "downstream companies are beneficiaries");
    assert(p.thesis.data?.headline === "Hyperscaler capex accelerates AI compute demand.", "injected narrative rides on the thesis section");
    assert((p.watch.data?.items ?? []).some(w => w.includes("capex guidance")), "injected watch item appears in watch next");
  });

  // 76. System 1 integration: Explorer consumes the profile. These pin the
  // contract the Explorer page relies on: stability, honest degradation, no
  // fabrication, and that the profile's forward view mirrors the prediction
  // engine reads the page used to make directly (drift guard, profile doc
  // section 5).
  const allSections = (p: ReturnType<typeof buildIntelligenceProfile>) =>
    [p.identity, p.thesis, p.drivers, p.transmission, p.beneficiaries, p.risks, p.evidence, p.confidence, p.evolution, p.watch];

  test("intelligence profile is stable for a fixed graph", () => {
    seedCausalGraph();
    const strip = (p: ReturnType<typeof buildIntelligenceProfile>) => JSON.stringify({ ...p, generatedAt: 0 });
    assert(strip(buildIntelligenceProfile("NVDA")) === strip(buildIntelligenceProfile("NVDA")), "same graph must yield the same profile");
    assert(strip(buildIntelligenceProfile("AI Infrastructure")) === strip(buildIntelligenceProfile("AI Infrastructure")), "stability holds for themes too");
  });

  test("profile forward view mirrors the prediction engine (Explorer drift guard)", () => {
    seedCausalGraph();
    const p = buildIntelligenceProfile("NVDA");
    const eng = predictCompanyTrajectory("NVDA");
    if (eng.found && eng.expectedDirection !== "insufficient_signal") {
      const f = p.thesis.data?.forward;
      assert(!!f, "profile must carry a forward view when the engine resolves");
      assert(f!.direction === eng.expectedDirection && f!.probability === eng.probability && f!.confidence === eng.confidence,
        "the forward view must be the engine read, unmodified");
      assert(p.risks.data?.invalidation === (eng.invalidation || null), "invalidation must be the engine falsifier, unmodified");
    } else {
      assert(!p.thesis.data?.forward, "no engine signal must mean no fabricated forward view");
    }
  });

  test("explorer-facing sections degrade honestly on a sparse graph", () => {
    intelligenceGraph.clear();
    intelligenceGraph.addNode({ label: "LONE", type: "Company" as never });
    const p = buildIntelligenceProfile("LONE");
    assert(p.identity.status === "live", "identity is live for any known node");
    for (const s of allSections(p)) {
      assert(s.status !== "unavailable" || s.data === null, "unavailable sections must carry null data");
      assert(s.status === "unavailable" || s.data !== null, "live/partial sections must carry data");
    }
    assert(p.transmission.status === "unavailable", "no neighbors must mean no transmission story");
    assert((p.drivers.data ?? []).length === 0 && (p.beneficiaries.data ?? []).length === 0, "no edges must mean no fabricated links");
    assert(p.confidence.status === "live" && p.confidence.data!.explanation.length > 0, "confidence still decomposes for a lone node");
  });

  test("unknown entities never throw or fabricate, even with injected narrative", () => {
    intelligenceGraph.clear();
    const p = buildIntelligenceProfile("GHOST-TICKER", { kindHint: "company", narrative: { headline: "Should not surface.", nextWatch: "nothing" } });
    for (const s of allSections(p))
      assert(s.status === "unavailable" && s.data === null, "an unknown entity must come back fully unavailable, narrative or not");
  });

  test("injected narrative rides the profile verbatim and changes nothing else", () => {
    seedCausalGraph();
    const bare = buildIntelligenceProfile("NVDA");
    const p = buildIntelligenceProfile("NVDA", { narrative: { headline: "NVDA supplies the AI buildout.", nextWatch: "Blackwell shipment pace" } });
    assert(p.thesis.data?.headline === "NVDA supplies the AI buildout.", "headline is carried verbatim");
    assert((p.watch.data?.items ?? []).includes("Blackwell shipment pace"), "the injected watch item is carried verbatim, unprefixed");
    const strip = (x: ReturnType<typeof buildIntelligenceProfile>) =>
      JSON.stringify({ drivers: x.drivers, beneficiaries: x.beneficiaries, transmission: x.transmission, evidence: x.evidence, confidence: x.confidence, risks: x.risks });
    assert(strip(bare) === strip(p), "injection must not alter data-derived sections");
  });

  // 77. System 2: the Narrative Derivation Engine. A DerivedNarrative is an
  // ephemeral grouping of themes sharing a driver set - derived, never stored,
  // keyed by canonical driver ids so it survives theme renames, and carrying
  // no narrative-level confidence/lifecycle/velocity (fabrication today).
  const seedNarrativeGraph = (themeAName = "AI Infrastructure") => {
    intelligenceGraph.clear();
    const add = (label: string, type: string) => intelligenceGraph.addNode({ label, type: type as never });
    add("AI Capex", "Macro");
    add("GLP-1 Adoption", "Macro");
    add(themeAName, "Theme");
    add("Datacenter Power", "Theme");
    add("Obesity Drugs", "Theme");          // single-theme driver: not a narrative
    add("Semiconductors", "Sector");
    add("Utilities", "Sector");
    add("NVDA", "Company");
    add("AMD", "Company");
    add("VST", "Company");
    const rel = (source: string, relationshipType: string, target: string, strength: number, pages: string[] = []) =>
      intelligenceGraph.addRelationship({ source, target, relationshipType: relationshipType as never, strength, confidence: 70, originatingPages: pages as never[] });
    rel("AI Capex", "drives", themeAName, 82, ["Feed"]);
    rel("AI Capex", "drives", "Datacenter Power", 74, ["Feed"]);   // same page on both driver edges
    rel("GLP-1 Adoption", "drives", "Obesity Drugs", 70);
    rel(themeAName, "drives", "Semiconductors", 76);
    rel("Datacenter Power", "drives", "Utilities", 72);
    rel(themeAName, "supports", "NVDA", 88, ["Feed"]);
    rel(themeAName, "supports", "AMD", 64, ["Markets"]);
    rel("Datacenter Power", "supports", "NVDA", 60, ["Feed"]);     // shared asset, shared page
    rel("Datacenter Power", "supports", "VST", 78);
  };

  test("derived narratives cluster themes by shared driver, honestly", () => {
    seedNarrativeGraph();
    const out = deriveNarratives();
    assert(out.length === 1, `one shared-driver grouping expected, got ${out.length}`);
    const n = out[0];
    assert(n.version === DERIVED_NARRATIVE_VERSION && n.derived === true, "derived marker and version must ride on the object");
    assert(n.key === "ai-capex", `key must be the canonical driver id, got ${n.key}`);
    const memberLabels = (n.members.data ?? []).map(m => m.label);
    assert(memberLabels.includes("AI Infrastructure") && memberLabels.includes("Datacenter Power"), "both themes on the shared driver are members");
    assert(!memberLabels.includes("Obesity Drugs"), "a driver with one theme is a theme, not a narrative");
    const assets = n.exposure.data?.assets ?? [];
    const nvda = assets.filter(a => a.label === "NVDA");
    assert(nvda.length === 1 && nvda[0].memberCount === 2, "a shared asset appears once with its member count, never duplicated");
    assert((n.members.data ?? []).every(m => m.driverLinks.length > 0), "every member carries its real driver edges");
  });

  test("derived narratives are deterministic and read-only (no stored nodes)", () => {
    seedNarrativeGraph();
    const before = intelligenceGraph.stats();
    const strip = (ns: ReturnType<typeof deriveNarratives>) => JSON.stringify(ns.map(n => ({ ...n, generatedAt: 0 })));
    assert(strip(deriveNarratives()) === strip(deriveNarratives()), "same graph must yield the same derivation");
    const after = intelligenceGraph.stats();
    assert(before.nodes === after.nodes && before.edges === after.edges, "derivation must not create nodes or relationships");
    assert(intelligenceGraph.nodesOfType("Narrative").length === 0, "no stored Narrative nodes may exist after derivation");
  });

  test("narrative key is stable across theme renames", () => {
    seedNarrativeGraph("AI Infrastructure");
    const a = deriveNarratives()[0];
    seedNarrativeGraph("AI Compute Buildout");   // same driver set, renamed theme
    const b = deriveNarratives()[0];
    assert(!!a && !!b && a.key === b.key, `driver-set key must survive a theme rename (${a?.key} vs ${b?.key})`);
    assert(narrativeKeyOfDrivers(["power-prices", "ai-capex"]) === "ai-capex+power-prices", "keys are sorted canonical driver ids");
  });

  test("drivers with identical member sets merge into one driver-set narrative", () => {
    seedNarrativeGraph();
    intelligenceGraph.addNode({ label: "Power Prices", type: "Macro" as never });
    intelligenceGraph.addRelationship({ source: "Power Prices", target: "AI Infrastructure", relationshipType: "drives" as never, strength: 66, confidence: 70 });
    intelligenceGraph.addRelationship({ source: "Power Prices", target: "Datacenter Power", relationshipType: "drives" as never, strength: 80, confidence: 70 });
    const out = deriveNarratives();
    assert(out.length === 1, `identical member sets must merge, got ${out.length} narratives`);
    assert(out[0].key === "ai-capex+power-prices", `merged key must carry the full driver set, got ${out[0].key}`);
    assert((out[0].driverSet.data ?? []).length === 2, "both drivers ride on the merged narrative");
  });

  test("derived narratives never blend a narrative-level confidence or fake temporal fields", () => {
    seedNarrativeGraph();
    const n = deriveNarratives()[0];
    for (const k of ["confidence", "conviction", "lifecycle", "velocity", "acceleration", "probability", "analogs", "history"])
      assert(!(k in n), `field "${k}" must not exist on a DerivedNarrative in v1`);
    assert(n.coherence.status === "partial" && !!n.coherence.data?.explanation, "coherence is a decomposed heuristic, marked partial");
    if (n.evidence.data) {
      const keys = Object.keys(n.evidence.data).sort().join(",");
      assert(keys === "distinctPages,perMember", `evidence carries only per-member reads and a distinct-page union, got ${keys}`);
      assert(n.evidence.data.distinctPages.filter(p => p === "Feed").length === 1, "a page shared by members is counted once, never summed");
    }
    if (n.forward.data) assert(n.forward.data.every(f => !!f.themeId), "forward views are member-level reads, never a narrative forecast");
  });

  test("narrative derivation degrades honestly on sparse and empty graphs", () => {
    intelligenceGraph.clear();
    assert(deriveNarratives().length === 0, "an empty graph derives no narratives");
    intelligenceGraph.addNode({ label: "Lone Theme", type: "Theme" as never });
    intelligenceGraph.addNode({ label: "Another Theme", type: "Theme" as never });
    assert(deriveNarratives().length === 0, "themes without shared drivers derive no narratives");
    assert(findNarrativeForTheme("Lone Theme") === null, "a theme outside every grouping resolves to null, not a fabricated narrative");
    seedNarrativeGraph();
    const hit = findNarrativeForTheme("AI Infrastructure");
    assert(!!hit && hit.key === "ai-capex", "a member theme resolves to its derived narrative");
    for (const s of [hit!.driverSet, hit!.members, hit!.exposure, hit!.evidence, hit!.forward, hit!.coherence]) {
      assert(s.status !== "unavailable" || s.data === null, "unavailable sections must carry null data");
      assert(s.status === "unavailable" || s.data !== null, "live/partial sections must carry data");
    }
  });

  for (const [name, fn] of tests) {
    try { await fn(); results.push({ name, ok: true }); }
    catch (e) { results.push({ name, ok: false, detail: e instanceof Error ? e.message : String(e) }); }
  }
  const passed = results.filter(r => r.ok).length;
  return { total: results.length, passed, failed: results.length - passed, results };
}

// Allow direct execution: `npx tsx src/lib/intelligenceTests.ts`
const proc = (globalThis as { process?: { argv?: string[]; exit?: (code: number) => void } }).process;
if (proc && Array.isArray(proc.argv) && /intelligenceTests\.(ts|js)$/.test(proc.argv[1] ?? "")) {
  runIntelligenceTests().then(summary => {
    for (const r of summary.results) console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.name}${r.detail ? "  :: " + r.detail : ""}`);
    console.log(`\n${summary.passed}/${summary.total} passed`);
    proc.exit?.(summary.failed ? 1 : 0);
  });
}
