/**
 * lib/intelligenceHealth.ts - developer-only diagnostics for the intelligence layer.
 *
 * Reports the shape and health of the Market Intelligence Graph plus timing for the
 * inference and narrative engines. This is a diagnostic utility, NOT a production UI
 * surface: nothing here is imported by a page or component. Read-only against the
 * live graph, except when you pass a `rebuild` callback to measure a rebuild.
 *
 * Usage (dev console / script):
 *   import { intelligenceHealthReport, printIntelligenceHealth } from "@/lib/intelligenceHealth";
 *   printIntelligenceHealth();
 *
 * No em/en dashes in output.
 */

import { intelligenceGraph as G } from "./intelligenceGraph";
import type { SourcePage } from "./intelligenceGraph";
import { summarizeGraph, type BuildResult } from "./intelligenceGraphAdapters";
import { validateGraphIntegrity } from "./intelligenceGraphDebug";
import { inferMarketState } from "./inferenceEngine";
import { findTransmissionChains } from "./narrativeTransmission";

const nowMs = (): number => (typeof performance !== "undefined" ? performance.now() : Date.now());

export interface IntelligenceHealthReport {
  timestamp:            string;
  totalNodes:           number;
  totalRelationships:   number;
  nodesByType:          Record<string, number>;
  relationshipsByType:  Record<string, number>;
  integrityOk:          boolean;
  integrityIssues:      string[];
  duplicatesMerged:     number | null;   // from a passed rebuild result, else null
  sourceDistribution:   Record<string, number>;   // node contributions by source page
  snapshotCount:        number;          // total stored theme-history points in the graph
  topConnectedNodes:    Array<{ label: string; type: string; degree: number }>;
  timings: {
    graphRebuildMs:  number | null;
    inferenceMs:     number;
    narrativeMs:     number;
  };
}

export interface HealthOptions {
  /** Optional rebuild to time. If it returns a BuildResult, duplicatesMerged is read from it. */
  rebuild?: () => BuildResult | void;
}

export function intelligenceHealthReport(opts: HealthOptions = {}): IntelligenceHealthReport {
  // Optional rebuild timing.
  let graphRebuildMs: number | null = null;
  let duplicatesMerged: number | null = null;
  if (opts.rebuild) {
    const t = nowMs();
    const result = opts.rebuild();
    graphRebuildMs = round2(nowMs() - t);
    if (result && "total" in result) duplicatesMerged = result.total.duplicatesMerged;
  }

  const summary = summarizeGraph();
  const integrity = validateGraphIntegrity();
  const edges = G.allEdges();
  const nodes = G.allNodes();

  // Relationship count by type.
  const relationshipsByType: Record<string, number> = {};
  for (const e of edges) relationshipsByType[e.relationshipType] = (relationshipsByType[e.relationshipType] ?? 0) + 1;

  // Source distribution across nodes (a node counts once per contributing source).
  const sourceDistribution: Record<string, number> = {};
  for (const n of nodes) for (const src of n.sources as SourcePage[]) sourceDistribution[src] = (sourceDistribution[src] ?? 0) + 1;

  // Stored snapshot history points (attached to Theme nodes by the snapshot adapter).
  let snapshotCount = 0;
  for (const n of nodes) {
    const hist = n.metadata?.history;
    if (Array.isArray(hist)) snapshotCount += hist.length;
  }

  // Integrity issue summary (counts only, human readable).
  const integrityIssues: string[] = [];
  if (integrity.orphanRelationships.length) integrityIssues.push(`${integrity.orphanRelationships.length} orphan relationships`);
  if (integrity.duplicateAliases.length) integrityIssues.push(`${integrity.duplicateAliases.length} duplicate aliases`);
  if (integrity.emptyLabels.length) integrityIssues.push(`${integrity.emptyLabels.length} empty labels`);
  if (integrity.missingEndpoints.length) integrityIssues.push(`${integrity.missingEndpoints.length} missing endpoints`);
  if (integrity.outOfRangeEdges.length) integrityIssues.push(`${integrity.outOfRangeEdges.length} out-of-range edges`);

  // Engine timings against the current graph.
  const ti = nowMs(); inferMarketState();       const inferenceMs = round2(nowMs() - ti);
  const tn = nowMs(); findTransmissionChains();  const narrativeMs = round2(nowMs() - tn);

  return {
    timestamp: new Date().toISOString(),
    totalNodes: summary.totalNodes,
    totalRelationships: summary.totalRelationships,
    nodesByType: summary.nodesByType,
    relationshipsByType,
    integrityOk: integrity.ok,
    integrityIssues,
    duplicatesMerged,
    sourceDistribution,
    snapshotCount,
    topConnectedNodes: summary.topConnectedNodes.map(n => ({ label: n.label, type: n.type, degree: n.degree })),
    timings: { graphRebuildMs, inferenceMs, narrativeMs },
  };
}

const round2 = (n: number): number => Math.round(n * 100) / 100;

/** Console-print the health report as readable lines. Development only. */
export function printIntelligenceHealth(opts: HealthOptions = {}): IntelligenceHealthReport {
  const r = intelligenceHealthReport(opts);
  const line = (k: string, v: unknown) => console.log(`  ${k.padEnd(22)} ${typeof v === "object" ? JSON.stringify(v) : v}`);
  console.log("=== Argus Intelligence Health ===");
  line("timestamp", r.timestamp);
  line("nodes", r.totalNodes);
  line("relationships", r.totalRelationships);
  line("nodesByType", r.nodesByType);
  line("relationshipsByType", r.relationshipsByType);
  line("integrity", r.integrityOk ? "healthy" : `issues: ${r.integrityIssues.join(", ")}`);
  line("duplicatesMerged", r.duplicatesMerged ?? "n/a (no rebuild)");
  line("sourceDistribution", r.sourceDistribution);
  line("snapshotCount", r.snapshotCount);
  line("graphRebuildMs", r.timings.graphRebuildMs ?? "n/a");
  line("inferenceMs", r.timings.inferenceMs);
  line("narrativeMs", r.timings.narrativeMs);
  line("topConnected", r.topConnectedNodes.map(n => `${n.label}(${n.degree})`).join(", "));
  return r;
}
