/**
 * lib/dataAdapters/diagnostics.ts - developer-only ingestion diagnostic.
 *
 * Runs exactly one provider ingestion cycle (forced past the feature flag) and reports
 * precisely what happened, plus a graph integrity check afterwards. This proves live
 * data flows end to end before any automation is enabled. It schedules nothing, exposes
 * nothing to users, and never throws on provider failure. No UI, no em/en dashes.
 */

import {
  runProviderIngestion, DEFAULT_UNIVERSE, DEFAULT_FRED_SERIES,
  type IngestionConfig, type IngestionReport, type CompanyRef,
} from "./providerIngestion";
import type { FetchLike, RetryPolicy } from "./types";
import { validateGraphIntegrity } from "../intelligenceGraphDebug";

export interface DiagnosticConfig {
  companies?:    CompanyRef[];
  fredSeries?:   string[];
  fredApiKey?:   string;
  includeForm4?: boolean;
  transport?:    FetchLike;                                            // injectable for tests
  now?:          () => number;
  retry?:        RetryPolicy;
  ingest?:       (config: IngestionConfig) => Promise<IngestionReport>; // injectable for tests
}

export interface DiagnosticIntegrity {
  ok:                  boolean;
  nodeCount:           number;
  edgeCount:           number;
  orphanRelationships: number;
  duplicateAliases:    number;
  emptyLabels:         number;
  missingEndpoints:    number;
  outOfRangeEdges:     number;
  valueScale:          string;
  error?:              string;
}

export interface DiagnosticResult {
  report:    IngestionReport;
  integrity: DiagnosticIntegrity;
}

function failReport(err: unknown): IngestionReport {
  return {
    enabled: true, providersCalled: [], providersSkipped: [], observationsFetched: 0, observationsIngested: 0,
    errorsSkipped: 1, nodesAdded: 0, relationshipsAdded: 0, providerHealth: [],
    graphBefore: { nodes: 0, edges: 0 }, graphAfter: { nodes: 0, edges: 0 },
    fetchErrors: [{ provider: "unknown", params: "{}", error: err instanceof Error ? err.message : String(err) }], durationMs: 0,
  };
}

function summarizeIntegrity(): DiagnosticIntegrity {
  try {
    const i = validateGraphIntegrity();
    return {
      ok: i.ok, nodeCount: i.nodeCount, edgeCount: i.edgeCount,
      orphanRelationships: i.orphanRelationships.length, duplicateAliases: i.duplicateAliases.length,
      emptyLabels: i.emptyLabels.length, missingEndpoints: i.missingEndpoints.length,
      outOfRangeEdges: i.outOfRangeEdges.length, valueScale: i.valueScale,
    };
  } catch (err) {
    return { ok: false, nodeCount: 0, edgeCount: 0, orphanRelationships: 0, duplicateAliases: 0, emptyLabels: 0, missingEndpoints: 0, outOfRangeEdges: 0, valueScale: "unknown", error: err instanceof Error ? err.message : String(err) };
  }
}

/** Run one forced ingestion cycle and check integrity. Never throws. */
export async function runIngestionDiagnostic(config: DiagnosticConfig = {}): Promise<DiagnosticResult> {
  const ingest = config.ingest ?? runProviderIngestion;
  let report: IngestionReport;
  try {
    report = await ingest({
      force: true,
      companies: config.companies ?? DEFAULT_UNIVERSE,
      fredSeries: config.fredSeries ?? DEFAULT_FRED_SERIES,
      fredApiKey: config.fredApiKey,
      includeForm4: config.includeForm4 ?? true,
      transport: config.transport,
      now: config.now,
      retry: config.retry,
    });
  } catch (err) {
    report = failReport(err);
  }
  return { report, integrity: summarizeIntegrity() };
}

/** Human-readable rendering of a diagnostic result. No dashes. */
export function formatDiagnostic(d: DiagnosticResult): string {
  const r = d.report;
  const lines: string[] = [];
  lines.push("=== Provider Ingestion Diagnostic ===");
  lines.push(`enabled              ${r.enabled}`);
  lines.push(`providersCalled      ${r.providersCalled.join(", ") || "none"}`);
  lines.push(`providersSkipped     ${r.providersSkipped.map(p => `${p.id} (${p.reason})`).join(", ") || "none"}`);
  lines.push(`observationsFetched  ${r.observationsFetched}`);
  lines.push(`observationsIngested ${r.observationsIngested}`);
  lines.push(`nodesAdded           ${r.nodesAdded}`);
  lines.push(`relationshipsAdded   ${r.relationshipsAdded}`);
  lines.push(`graphBefore          nodes=${r.graphBefore.nodes} edges=${r.graphBefore.edges}`);
  lines.push(`graphAfter           nodes=${r.graphAfter.nodes} edges=${r.graphAfter.edges}`);
  lines.push(`errorsSkipped        ${r.errorsSkipped}`);
  lines.push(`durationMs           ${r.durationMs}`);
  lines.push("providerHealth:");
  for (const h of r.providerHealth) {
    lines.push(`  ${String(h.id).padEnd(6)} state=${h.state} observations=${h.observationCount} failures=${h.failureCount} lastSyncAt=${h.lastSyncAt ?? "never"}`);
  }
  if (r.fetchErrors.length) {
    lines.push("fetchErrors:");
    for (const e of r.fetchErrors) lines.push(`  ${e.provider} ${e.params} :: ${e.error}`);
  } else {
    lines.push("fetchErrors          none");
  }
  const i = d.integrity;
  lines.push(`integrity            ok=${i.ok} nodes=${i.nodeCount} edges=${i.edgeCount} orphans=${i.orphanRelationships} dupAliases=${i.duplicateAliases} emptyLabels=${i.emptyLabels} missingEndpoints=${i.missingEndpoints} outOfRange=${i.outOfRangeEdges} scale=${i.valueScale}${i.error ? ` error=${i.error}` : ""}`);
  return lines.join("\n");
}
