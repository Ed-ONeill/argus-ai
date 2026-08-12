"use client";

/**
 * useIntelligenceGraph - controlled bridge from loaded app data to the Market
 * Intelligence Graph. Given whatever data a caller already has (themes, stories,
 * episodes, deals, private signals, snapshots), it rebuilds the shared graph and
 * exposes the report + integrity helpers. Tolerant of missing data: any absent
 * source is simply skipped, and reports degrade to `found: false` rather than throw.
 *
 * No UI. No em/en dashes.
 *
 * P2.0 NOTE: this hook is the low-level bridge, not the provisioning contract.
 * Production surfaces must use hooks/useArgusIntelligence (the canonical
 * provisioning path with the complete input set); calling this hook directly
 * from a surface with a reduced input set reintroduces the cross-surface
 * inconsistency P2.0 eliminated (Intelligence Everywhere doc, D1).
 */

import { useMemo, useCallback } from "react";
import {
  summarizeGraph,
  type BuildResult, type GraphSummary, type PrivateSignalInput,
} from "@/lib/intelligenceGraphAdapters";
import {
  validateGraphIntegrity, getThemeIntelligenceReport, getCompanyIntelligenceReport,
  type IntegrityReport, type ThemeIntelligenceReport, type CompanyIntelligenceReport,
} from "@/lib/intelligenceGraphDebug";
import { provisionGraphState } from "@/lib/intelligenceProvisioning";
import type { ThemeIntelligence, StoryCluster, FeedItem, Episode, MarketEvent } from "@/lib/types";
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
  // OP4.1 — the canonical event layer. These MUST be declared here: this input
  // type is the narrow point of the provisioning path, and a key it does not
  // name is silently dropped before provisionGraphState (RC2 root cause E).
  events?:         MarketEvent[];
  explanations?:   Record<string, unknown>;
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
  const { themes, stories, storyThemes, episodes, matchedThemes, deals, privateSignals, snapshots,
          events, explanations } = input;

  // Rebuild the shared graph from current state, then read summary + integrity in the
  // same pass. Clearing first keeps the graph a faithful projection of the data passed
  // in; dedupe / merge run inside the adapters. Deriving summary and integrity here (not
  // in separate memos keyed on the build result) keeps every dependency honest.
  const { build, summary, integrity } = useMemo(() => {
    if (!enabled) return { build: null as BuildResult | null, summary: EMPTY_SUMMARY, integrity: EMPTY_INTEGRITY };
    // One rebuild sequence for the whole app (clear -> build -> re-apply cached
    // market observations): lib/intelligenceProvisioning.provisionGraphState.
    const built = provisionGraphState({
      themes, stories, storyThemes: storyThemes ?? themes,
      episodes, matchedThemes, deals, privateSignals, snapshots,
      events, explanations,
    });
    return { build: built, summary: summarizeGraph(), integrity: validateGraphIntegrity() };
  }, [enabled, themes, stories, storyThemes, episodes, matchedThemes, deals, privateSignals, snapshots,
      events, explanations]);

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
