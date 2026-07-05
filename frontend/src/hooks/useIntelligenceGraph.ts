"use client";

/**
 * useIntelligenceGraph - controlled bridge from loaded app data to the Market
 * Intelligence Graph. Given whatever data a caller already has (themes, stories,
 * episodes, deals, private signals, snapshots), it rebuilds the shared graph and
 * exposes the report + integrity helpers. Tolerant of missing data: any absent
 * source is simply skipped, and reports degrade to `found: false` rather than throw.
 *
 * No UI. No em/en dashes.
 */

import { useMemo, useCallback } from "react";
import { intelligenceGraph } from "@/lib/intelligenceGraph";
import {
  buildGraphFromCurrentState, summarizeGraph,
  type BuildResult, type GraphSummary, type PrivateSignalInput,
} from "@/lib/intelligenceGraphAdapters";
import {
  validateGraphIntegrity, getThemeIntelligenceReport, getCompanyIntelligenceReport,
  type IntegrityReport, type ThemeIntelligenceReport, type CompanyIntelligenceReport,
} from "@/lib/intelligenceGraphDebug";
import { reingestCachedMarketObservations } from "@/lib/dataAdapters/observationGraphBridge";
import type { ThemeIntelligence, StoryCluster, FeedItem, Episode } from "@/lib/types";
import type { MADeal } from "@/hooks/useMAIntelligence";
import type { ThemeSnapshot } from "@/lib/themeSnapshots";

export interface UseIntelligenceGraphInput {
  /** Only build the graph when true (e.g., a drawer is open). Default true. */
  enabled?:        boolean;
  themes?:         ThemeIntelligence[];
  stories?:        (StoryCluster | FeedItem)[];
  storyThemes?:    ThemeIntelligence[];
  episodes?:       Episode[];
  matchedThemes?:  (ThemeIntelligence | string)[];
  deals?:          MADeal[];
  privateSignals?: PrivateSignalInput[];
  snapshots?:      ThemeSnapshot[];
}

export interface UseIntelligenceGraphResult {
  ready:            boolean;
  summary:          GraphSummary;
  integrity:        IntegrityReport;
  build:            BuildResult | null;
  getThemeReport:   (themeOrId: string) => ThemeIntelligenceReport;
  getCompanyReport: (tickerOrName: string) => CompanyIntelligenceReport;
  validate:         () => IntegrityReport;
}

const EMPTY_SUMMARY: GraphSummary = {
  totalNodes: 0, totalRelationships: 0, nodesByType: {}, topConnectedNodes: [], strongestRelationships: [],
};
const EMPTY_INTEGRITY: IntegrityReport = {
  ok: true, nodeCount: 0, edgeCount: 0, orphanRelationships: [], duplicateAliases: [],
  emptyLabels: [], missingEndpoints: [], valueScale: "empty", outOfRangeEdges: [],
};

export function useIntelligenceGraph(input: UseIntelligenceGraphInput = {}): UseIntelligenceGraphResult {
  const enabled = input.enabled ?? true;
  const { themes, stories, storyThemes, episodes, matchedThemes, deals, privateSignals, snapshots } = input;

  // Rebuild the shared graph from current state, then read summary + integrity in the
  // same pass. Clearing first keeps the graph a faithful projection of the data passed
  // in; dedupe / merge run inside the adapters. Deriving summary and integrity here (not
  // in separate memos keyed on the build result) keeps every dependency honest.
  const { build, summary, integrity } = useMemo(() => {
    if (!enabled) return { build: null as BuildResult | null, summary: EMPTY_SUMMARY, integrity: EMPTY_INTEGRITY };
    intelligenceGraph.clear();
    const built = buildGraphFromCurrentState({
      themes, stories, storyThemes: storyThemes ?? themes,
      episodes, matchedThemes, deals, privateSignals, snapshots,
    });
    // Re-apply provider market observations wiped by the clear, so the drawer's graph
    // carries node.metadata.latestMarketData when market ingestion has run.
    reingestCachedMarketObservations();
    return { build: built, summary: summarizeGraph(), integrity: validateGraphIntegrity() };
  }, [enabled, themes, stories, storyThemes, episodes, matchedThemes, deals, privateSignals, snapshots]);

  // Reports and validation read the live singleton at call time, so results always
  // reflect the current graph regardless of function identity. Stable references.
  const getThemeReport   = useCallback((id: string) => getThemeIntelligenceReport(id), []);
  const getCompanyReport = useCallback((id: string) => getCompanyIntelligenceReport(id), []);
  const validate         = useCallback(() => validateGraphIntegrity(), []);

  return {
    ready: build !== null && summary.totalNodes > 0,
    summary, integrity, build,
    getThemeReport, getCompanyReport, validate,
  };
}
