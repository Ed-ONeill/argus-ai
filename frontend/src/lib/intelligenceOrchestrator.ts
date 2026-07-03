/**
 * lib/intelligenceOrchestrator.ts - the central coordinator for the Argus stack.
 *
 * Runs the existing subsystems in one deterministic pipeline: provider ingestion ->
 * graph update -> integrity validation -> inference -> narrative transmission ->
 * evidence -> prediction -> memory snapshot, and returns one structured report. It
 * implements none of that logic itself: every stage delegates to the engine that
 * already owns it. Stages are isolated, so a failure in one (or a failing provider)
 * does not stop the rest. Pure library: no React, no UI, no API. No em/en dashes.
 */

import { intelligenceGraph as G } from "./intelligenceGraph";
import { runProviderIngestion, type IngestionConfig, type IngestionReport } from "./dataAdapters/providerIngestion";
import { validateGraphIntegrity } from "./intelligenceGraphDebug";
import { inferMarketState } from "./inferenceEngine";
import type { MarketStateInference } from "./inferenceEngine";
import { rankNarratives, detectEmergingNarratives } from "./narrativeTransmission";
import { evaluateEvidenceForInference } from "./evidenceEngine";
import { predictMarketEvolution } from "./predictionEngine";
import { recordSnapshot, type RecordStats } from "./memoryEngine";

/* ------------------------------------------------------------------ *
 * Report shape
 * ------------------------------------------------------------------ */

export interface IntegritySummary {
  ok: boolean; nodeCount: number; edgeCount: number;
  orphanRelationships: number; duplicateAliases: number; emptyLabels: number; missingEndpoints: number; outOfRangeEdges: number;
  valueScale: string;
}
export interface InferenceSummary {
  found: boolean; oneLineRead: string; strongestThemes: string[]; weakestThemes: string[]; crossMarketConfirmations: number;
}
export interface NarrativeSummary {
  topNarratives: Array<{ label: string; score: number }>; emergingCount: number;
}
export interface EvidenceSummary {
  trustScore: number; evidenceQuality: number; crossSourceConfirmation: number; contradictions: number;
}
export interface PredictionSummary {
  found: boolean;
  strengthening: Array<{ label: string; probability: number }>;
  weakening: Array<{ label: string; probability: number }>;
  morningBriefForecast: string[];
}
export interface MemorySummary { recorded: boolean; date?: string; entitiesRecorded?: number; snapshotsAdded?: number; inferencesAdded?: number; predictionsAdded?: number }

export interface OrchestrationReport {
  ok:                   boolean;
  startedAt:            number;
  finishedAt:           number;
  durationMs:           number;
  providersProcessed:   string[];
  providersSkipped:     Array<{ id: string; reason: string }>;
  observationsIngested: number;
  graphChanges:         { nodesAdded: number; relationshipsAdded: number; before: { nodes: number; edges: number }; after: { nodes: number; edges: number } };
  integrity:            IntegritySummary;
  inference:            InferenceSummary | null;
  narrative:            NarrativeSummary | null;
  evidence:             EvidenceSummary | null;
  prediction:           PredictionSummary | null;
  memory:               MemorySummary;
  timings:              Record<string, number>;
  health:               { providerHealth: IngestionReport["providerHealth"]; integrityOk: boolean; providerFetchErrors: number; stagesFailed: string[] };
  stageErrors:          Array<{ stage: string; error: string }>;
}

export interface OrchestrationConfig {
  now?:          () => number;
  skipIngestion?: boolean;                                             // run engines on the existing graph only
  recordMemory?: boolean;                                              // default true
  ingest?:       (config: IngestionConfig) => Promise<IngestionReport>; // injectable, default runProviderIngestion
  ingestion?:    IngestionConfig;                                      // passed to the ingestion layer
}

/* ------------------------------------------------------------------ *
 * Helpers
 * ------------------------------------------------------------------ */

const clock = (): number => (typeof performance !== "undefined" ? performance.now() : Date.now());
const round2 = (n: number): number => Math.round(n * 100) / 100;
const statsNow = (): { nodes: number; edges: number } => { const s = G.stats(); return { nodes: s.nodes, edges: s.edges }; };

function integritySummary(): IntegritySummary {
  const i = validateGraphIntegrity();
  return {
    ok: i.ok, nodeCount: i.nodeCount, edgeCount: i.edgeCount,
    orphanRelationships: i.orphanRelationships.length, duplicateAliases: i.duplicateAliases.length,
    emptyLabels: i.emptyLabels.length, missingEndpoints: i.missingEndpoints.length, outOfRangeEdges: i.outOfRangeEdges.length,
    valueScale: i.valueScale,
  };
}
const failedIntegrity = (): IntegritySummary => ({ ok: false, nodeCount: 0, edgeCount: 0, orphanRelationships: 0, duplicateAliases: 0, emptyLabels: 0, missingEndpoints: 0, outOfRangeEdges: 0, valueScale: "unknown" });

function summarizeInference(ms: MarketStateInference): InferenceSummary {
  return {
    found: ms.strongestThemes.length > 0 || ms.weakestThemes.length > 0,
    oneLineRead: ms.oneLineRead,
    strongestThemes: ms.strongestThemes.map(t => t.label),
    weakestThemes: ms.weakestThemes.map(t => t.label),
    crossMarketConfirmations: ms.crossMarketConfirmations.length,
  };
}

/* ------------------------------------------------------------------ *
 * Orchestrator
 * ------------------------------------------------------------------ */

export async function orchestrateIntelligence(config: OrchestrationConfig = {}): Promise<OrchestrationReport> {
  const now = config.now ?? (() => Date.now());
  const recordMem = config.recordMemory ?? true;
  const ingestFn = config.ingest ?? runProviderIngestion;
  const startedAt = now();
  const t0 = clock();

  const timings: Record<string, number> = {};
  const stageErrors: Array<{ stage: string; error: string }> = [];

  async function stage<T>(name: string, fn: () => T | Promise<T>): Promise<T | null> {
    const s = clock();
    try { const r = await fn(); timings[name] = round2(clock() - s); return r; }
    catch (err) { timings[name] = round2(clock() - s); stageErrors.push({ stage: name, error: err instanceof Error ? err.message : String(err) }); return null; }
  }

  // 1 + 2. Ingest provider observations and update the graph (delegated).
  let ingestion: IngestionReport | null = null;
  if (!config.skipIngestion) {
    ingestion = await stage("ingestion", () => ingestFn({ force: true, ...(config.ingestion ?? {}), now: config.now }));
  }

  // 3. Graph integrity validation (delegated).
  const integrity = await stage("integrity", () => integritySummary());

  // 4. Inference Engine.
  const marketState = await stage("inference", () => inferMarketState());

  // 5. Narrative Transmission Engine.
  const narrative = await stage<NarrativeSummary>("narrative", () => ({
    topNarratives: rankNarratives(5).map(n => ({ label: n.theme.label, score: n.score })),
    emergingCount: detectEmergingNarratives().length,
  }));

  // 6. Evidence Engine (grades the inference output; only runs when inference produced one).
  const evidence = marketState
    ? await stage<EvidenceSummary>("evidence", () => {
        const e = evaluateEvidenceForInference(marketState);
        return { trustScore: e.trustScore, evidenceQuality: e.evidenceQuality, crossSourceConfirmation: e.crossSourceConfirmation, contradictions: e.contradictions.length };
      })
    : null;

  // 7. Prediction Engine.
  const prediction = await stage<PredictionSummary>("prediction", () => {
    const p = predictMarketEvolution();
    return { found: p.found, strengthening: p.mostLikelyStrengthening, weakening: p.mostLikelyWeakening, morningBriefForecast: p.morningBriefForecast };
  });

  // 8. Memory Engine snapshot.
  const memoryStats = recordMem ? await stage<RecordStats>("memory", () => recordSnapshot({ now: config.now })) : null;

  const totalMs = round2(clock() - t0);
  const finishedAt = now();
  const integrityOk = integrity?.ok ?? false;

  return {
    ok: stageErrors.length === 0 && integrityOk,
    startedAt, finishedAt, durationMs: totalMs,
    providersProcessed: ingestion?.providersCalled ?? [],
    providersSkipped: ingestion?.providersSkipped ?? [],
    observationsIngested: ingestion?.observationsIngested ?? 0,
    graphChanges: {
      nodesAdded: ingestion?.nodesAdded ?? 0,
      relationshipsAdded: ingestion?.relationshipsAdded ?? 0,
      before: ingestion?.graphBefore ?? statsNow(),
      after: ingestion?.graphAfter ?? statsNow(),
    },
    integrity: integrity ?? failedIntegrity(),
    inference: marketState ? summarizeInference(marketState) : null,
    narrative,
    evidence,
    prediction,
    memory: memoryStats ? { recorded: true, ...memoryStats } : { recorded: false },
    timings: { ...timings, totalMs },
    health: {
      providerHealth: ingestion?.providerHealth ?? [],
      integrityOk,
      providerFetchErrors: ingestion?.fetchErrors.length ?? 0,
      stagesFailed: stageErrors.map(s => s.stage),
    },
    stageErrors,
  };
}
