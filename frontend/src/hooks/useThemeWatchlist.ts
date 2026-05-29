"use client";

import { useState, useEffect, useCallback } from "react";

const STORAGE_KEY = "argus:theme-watchlist";

export function useThemeWatchlist() {
  const [watchedIds, setWatchedIds] = useState<string[]>([]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setWatchedIds(JSON.parse(raw) as string[]);
    } catch {}
  }, []);

  const toggle = useCallback((themeId: string) => {
    setWatchedIds(prev => {
      const next = prev.includes(themeId)
        ? prev.filter(id => id !== themeId)
        : [...prev, themeId];
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  }, []);

  const isWatched = useCallback(
    (themeId: string) => watchedIds.includes(themeId),
    [watchedIds],
  );

  return { watchedIds, toggle, isWatched };
}
