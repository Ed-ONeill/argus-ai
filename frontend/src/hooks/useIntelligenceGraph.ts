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

export function useIntelligenceGraph(input: UseIntelligenceGraphInput = {}): UseIntelligenceGraphResult {
  const enabled = input.enabled ?? true;
  const { themes, stories, storyThemes, episodes, matchedThemes, deals, privateSignals, snapshots } = input;

  // Rebuild the shared graph from current state. Clearing first keeps it a faithful
  // projection of the data passed in, and dedupe / merge run inside the adapters.
  const build = useMemo<BuildResult | null>(() => {
    if (!enabled) return null;
    intelligenceGraph.clear();
    return buildGraphFromCurrentState({
      themes, stories, storyThemes: storyThemes ?? themes,
      episodes, matchedThemes, deals, privateSignals, snapshots,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, themes, stories, storyThemes, episodes, matchedThemes, deals, privateSignals, snapshots]);

  const summary   = useMemo<GraphSummary>(() => summarizeGraph(), [build]);
  const integrity = useMemo<IntegrityReport>(() => validateGraphIntegrity(), [build]);

  // Reports read the live singleton; keyed on `build` so consumers recompute after a rebuild.
  const getThemeReport   = useCallback((id: string) => getThemeIntelligenceReport(id), [build]);
  const getCompanyReport = useCallback((id: string) => getCompanyIntelligenceReport(id), [build]);
  const validate         = useCallback(() => validateGraphIntegrity(), [build]);

  return {
    ready: build !== null && summary.totalNodes > 0,
    summary, integrity, build,
    getThemeReport, getCompanyReport, validate,
  };
}
