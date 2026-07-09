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
import { getTrackedThemes } from "@/lib/themeSnapshots";
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

  // Device-local snapshot index, read once per mount: absence detection for
  // the change ledger (server memory rides on present themes and cannot see
  // themes that vanished). SSR-safe: returns [] without a window.
  const previouslyTracked = useMemo(() => getTrackedThemes(), []);

  const vm = useMemo(
    () => buildMorningBrief({
      marketBrief: data?.market_brief ?? null,
      themes,
      clusters: clusters.map(c => ({ id: c.id, title: c.primary.title, source: c.primary.source ?? null })),
      storyClusterCount: clusters.length,
      regimeStatus: opts.regimeStatus ?? null,
      fallbackRegimeLabel: opts.fallbackRegimeLabel ?? null,
      previouslyTracked,
      graphReady: graph.ready,
    }),
    // graph.ready is the invalidation tick for the engine-backed reads
    [data?.market_brief, themes, clusters, opts.regimeStatus, opts.fallbackRegimeLabel, previouslyTracked, graph.ready],
  );

  return { vm, isLoading, graphReady: graph.ready };
}
