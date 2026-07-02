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

export interface TestResult { name: string; ok: boolean; detail?: string }
export interface TestSummary { total: number; passed: number; failed: number; results: TestResult[] }

function assert(cond: unknown, message: string): void {
  if (!cond) throw new Error(message);
}

export function runIntelligenceTests(): TestSummary {
  const results: TestResult[] = [];
  const test = (name: string, fn: () => void) => {
    try { fn(); results.push({ name, ok: true }); }
    catch (e) { results.push({ name, ok: false, detail: e instanceof Error ? e.message : String(e) }); }
  };

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

  const passed = results.filter(r => r.ok).length;
  return { total: results.length, passed, failed: results.length - passed, results };
}

// Allow direct execution: `npx tsx src/lib/intelligenceTests.ts`
const proc = (globalThis as { process?: { argv?: string[]; exit?: (code: number) => void } }).process;
if (proc && Array.isArray(proc.argv) && /intelligenceTests\.(ts|js)$/.test(proc.argv[1] ?? "")) {
  const summary = runIntelligenceTests();
  for (const r of summary.results) console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.name}${r.detail ? "  :: " + r.detail : ""}`);
  console.log(`\n${summary.passed}/${summary.total} passed`);
  proc.exit?.(summary.failed ? 1 : 0);
}
