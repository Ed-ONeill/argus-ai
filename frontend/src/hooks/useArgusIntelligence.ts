"use client";

/**
 * useArgusIntelligence - THE canonical intelligence provisioning hook
 * (Phase 2.0, docs/ARGUS_INTELLIGENCE_EVERYWHERE_V1.md abstraction A1).
 *
 * Every production surface that needs the intelligence graph mounts this hook
 * and nothing else. It gathers the COMPLETE canonical input set (feed themes
 * and story clusters, M&A deals, Listen episodes, device theme snapshots),
 * accrues the daily theme snapshot once (idempotent per day), and provisions
 * the shared graph through the one canonical mapping
 * (lib/intelligenceProvisioning). Because every surface passes the same
 * inputs read from the same React Query caches, the graph's contents no
 * longer depend on which surface mounted first - the Morning Brief, the
 * drawer, and Explorer read one identical model.
 *
 * Honest degradation: sources still loading contribute nothing yet; the graph
 * rebuilds as each arrives, identically for every mounted surface. Do NOT
 * call useIntelligenceGraph directly from surfaces (see its P2.0 note).
 *
 * No UI. No em/en dashes.
 */

import { useEffect, useMemo } from "react";
import { useFeed } from "@/hooks/useFeed";
import { useMAIntelligence, type MADeal } from "@/hooks/useMAIntelligence";
import { useListenRails } from "@/hooks/useListen";
import { useIntelligenceGraph, type UseIntelligenceGraphResult } from "@/hooks/useIntelligenceGraph";
import { createDailyThemeSnapshots, getThemeHistory, themeKey } from "@/lib/themeSnapshots";
import { canonicalGraphState } from "@/lib/intelligenceProvisioning";
import type { ThemeIntelligence, StoryCluster, Episode, MarketBrief } from "@/lib/types";

export interface ArgusIntelligence extends UseIntelligenceGraphResult {
  /** The gathered canonical inputs, exposed so surfaces never re-fetch them. */
  themes:      ThemeIntelligence[];
  clusters:    StoryCluster[];
  deals:       MADeal[];
  episodes:    Episode[];
  /** Convenience feed reads that ride along with the same query. */
  marketBrief: MarketBrief | null;
  feedLoading: boolean;
}

export function useArgusIntelligence(): ArgusIntelligence {
  const { data, isLoading } = useFeed();
  const { deals } = useMAIntelligence();
  const { allEpisodes } = useListenRails();

  const themes = useMemo(() => data?.theme_intelligence ?? [], [data?.theme_intelligence]);
  const clusters = useMemo(() => data?.clusters ?? [], [data?.clusters]);
  const episodes = useMemo(() => allEpisodes ?? [], [allEpisodes]);

  // Daily theme-memory accrual, in its one home (idempotent per day; the
  // drawer and Explorer previously each ran this effect themselves).
  useEffect(() => {
    if (themes.length === 0) return;
    const dealCountBySector: Record<string, number> = {};
    for (const d of deals) dealCountBySector[d.sector] = (dealCountBySector[d.sector] ?? 0) + 1;
    createDailyThemeSnapshots(themes, { dealCountBySector });
  }, [themes, deals]);

  const snapshots = useMemo(() => themes.flatMap(t => getThemeHistory(themeKey(t))), [themes]);

  // The one canonical mapping + the one rebuild sequence underneath.
  const state = useMemo(
    () => canonicalGraphState({ themes, clusters, episodes, deals, snapshots }),
    [themes, clusters, episodes, deals, snapshots],
  );
  const graph = useIntelligenceGraph({ enabled: true, ...state });

  return {
    ...graph,
    themes, clusters, deals, episodes,
    marketBrief: data?.market_brief ?? null,
    feedLoading: isLoading,
  };
}
