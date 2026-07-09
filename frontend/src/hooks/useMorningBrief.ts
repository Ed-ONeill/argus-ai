"use client";

/**
 * useMorningBrief - homepage bridge to the canonical Morning Brief view model
 * (lib/morningBrief.ts, Sprint B1 of docs/ARGUS_MORNING_BRIEF_V2.md).
 *
 * Responsibilities: read the feed, build the shared intelligence graph from it
 * (same controlled bridge Feed/Explorer use), and memoize buildMorningBrief
 * with the injected inputs. Read-only: no memory writes, no graph mutation
 * beyond the standard useIntelligenceGraph rebuild. No UI. No em/en dashes.
 */

import { useMemo } from "react";
import { useFeed } from "@/hooks/useFeed";
import { useIntelligenceGraph } from "@/hooks/useIntelligenceGraph";
import { buildMorningBrief, type MorningBriefVM, type RegimeChange } from "@/lib/morningBrief";

export interface UseMorningBriefOptions {
  regimeStatus?:        RegimeChange | null;
  fallbackRegimeLabel?: string | null;
}

export interface UseMorningBriefResult {
  vm:         MorningBriefVM;
  isLoading:  boolean;
  graphReady: boolean;
}

export function useMorningBrief(opts: UseMorningBriefOptions = {}): UseMorningBriefResult {
  const { data, isLoading } = useFeed();
  const themes = useMemo(() => data?.theme_intelligence ?? [], [data?.theme_intelligence]);
  const clusters = useMemo(() => data?.clusters ?? [], [data?.clusters]);

  // Same graph build the drawer/Explorer perform, gated on data presence; this
  // is what lets the brief's conviction and risks read the evidence and
  // prediction engines instead of trusting summarizer numbers.
  const graph = useIntelligenceGraph({
    enabled: themes.length > 0,
    themes, stories: clusters, storyThemes: themes, matchedThemes: themes,
  });

  const vm = useMemo(
    () => buildMorningBrief({
      marketBrief: data?.market_brief ?? null,
      themes,
      storyClusterCount: clusters.length,
      regimeStatus: opts.regimeStatus ?? null,
      fallbackRegimeLabel: opts.fallbackRegimeLabel ?? null,
      graphReady: graph.ready,
    }),
    // graph.ready is the invalidation tick for the engine-backed reads
    [data?.market_brief, themes, clusters.length, opts.regimeStatus, opts.fallbackRegimeLabel, graph.ready],
  );

  return { vm, isLoading, graphReady: graph.ready };
}
