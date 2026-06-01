"use client";

import { useState, useEffect, useMemo } from "react";
import type { ThemeIntelligence } from "@/lib/types";
import {
  saveSnapshot, loadSnapshot, computeWatchlistDeltas,
  type StoredSnapshot, type WatchlistDelta, type AlertChip,
} from "@/lib/watchlistIntelligence";

export type { WatchlistDelta, AlertChip };

export function useWatchlistIntelligence(
  themes:     ThemeIntelligence[],
  watchedIds: string[],
) {
  const [prevSnapshot, setPrevSnapshot] = useState<StoredSnapshot | null>(null);

  // Load previous session's snapshot once on mount
  useEffect(() => {
    setPrevSnapshot(loadSnapshot());
  }, []);

  // Save current state as baseline for next visit
  useEffect(() => {
    if (themes.length > 0) saveSnapshot(themes);
  }, [themes]);

  const watchedSet = useMemo(() => new Set(watchedIds), [watchedIds]);

  const deltas = useMemo(
    () => computeWatchlistDeltas(themes, watchedSet, prevSnapshot),
    [themes, watchedSet, prevSnapshot],
  );

  // Top 5 most significant changes for watched themes
  const weeklyChanges = useMemo(() => {
    return themes
      .reduce<Array<{ theme: ThemeIntelligence; sentence: string; direction: "up" | "down" }>>(
        (acc, t) => {
          const d = deltas[t.id];
          if (watchedSet.has(t.id) && d && d.changeSentence) {
            acc.push({
              theme:     t,
              sentence:  d.changeSentence,
              direction: d.alertChip?.direction ?? "up",
            });
          }
          return acc;
        },
        [],
      )
      .sort((a, b) => (deltas[b.theme.id]?.priorityScore ?? 0) - (deltas[a.theme.id]?.priorityScore ?? 0))
      .slice(0, 5);
  }, [themes, watchedSet, deltas]);

  // Summary bar: watched themes sorted by priority score (up to 5)
  const watchedRanked = useMemo(() => {
    return themes
      .filter(t => watchedSet.has(t.id))
      .sort((a, b) => (deltas[b.id]?.priorityScore ?? 0) - (deltas[a.id]?.priorityScore ?? 0))
      .slice(0, 5);
  }, [themes, watchedSet, deltas]);

  return { deltas, weeklyChanges, watchedRanked };
}
