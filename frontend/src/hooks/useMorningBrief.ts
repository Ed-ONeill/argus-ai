"use client";

/**
 * useMorningBrief - homepage bridge to the canonical Morning Brief view model
 * (lib/morningBrief.ts, Sprint B1 of docs/ARGUS_MORNING_BRIEF_V2.md).
 *
 * Responsibilities: read the feed, build the shared intelligence graph from it
 * (same controlled bridge Feed/Explorer use), and memoize buildMorningBrief
 * with the injected inputs. Read-only: no memory writes, no graph mutation
 * beyond the canonical provisioning rebuild (useArgusIntelligence, P2.0).
 * No UI. No em/en dashes.
 */

import { useMemo } from "react";
import { useArgusIntelligence } from "@/hooks/useArgusIntelligence";
import { useFollowedThemes } from "@/hooks/useFollowedThemes";
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
  // Canonical intelligence provisioning (P2.0): the brief reads the same graph,
  // built from the same complete input set, as Explorer and the drawer - the
  // homepage can no longer rebuild the singleton into a weaker state.
  const graph = useArgusIntelligence();
  const { themes, clusters, marketBrief, feedLoading } = graph;

  // Device-local snapshot index, read once per mount: absence detection for
  // the change ledger (server memory rides on present themes and cannot see
  // themes that vanished). SSR-safe: returns [] without a window.
  const previouslyTracked = useMemo(() => getTrackedThemes(), []);

  // Personalization signal: followed themes reorder/badge research priorities
  // only - the underlying intelligence is identical for every user.
  const { followed } = useFollowedThemes();
  const followedThemeNames = useMemo(() => followed.map(f => f.name), [followed]);

  const vm = useMemo(
    () => buildMorningBrief({
      marketBrief,
      themes,
      clusters: clusters.map(c => ({ id: c.id, title: c.primary.title, source: c.primary.source ?? null })),
      storyClusterCount: clusters.length,
      regimeStatus: opts.regimeStatus ?? null,
      fallbackRegimeLabel: opts.fallbackRegimeLabel ?? null,
      previouslyTracked,
      followedThemeNames,
      graphReady: graph.ready,
    }),
    // graph.ready is the invalidation tick for the engine-backed reads
    [marketBrief, themes, clusters, opts.regimeStatus, opts.fallbackRegimeLabel, previouslyTracked, followedThemeNames, graph.ready],
  );

  return { vm, isLoading: feedLoading, graphReady: graph.ready };
}
