"use client";

import { useState, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchFeed } from "@/lib/api";
import type { FeedParams, FeedResponse } from "@/lib/types";

export function useFeed(initialParams: FeedParams = {}) {
  const [params, setParams] = useState<FeedParams>(initialParams);
  const queryClient = useQueryClient();

  const { data, isLoading, isPending, isFetching, error } = useQuery<FeedResponse>({
    // Key only on the fields the backend request actually varies on. Cosmetic
    // flags (e.g. use_ai, which fetchFeed never sends) and the transient
    // force_refresh must not fragment the cache into duplicate identical fetches.
    queryKey: ["feed", {
      categories: params.categories ?? "",
      sources:    params.sources    ?? "",
      fresh_only: params.fresh_only ?? false,
    }],
    queryFn: () => fetchFeed(params),
    // Backend always returns instantly from cache; keep client-side data fresh
    // for 5 min and auto-poll every 10 min to pick up background refreshes.
    staleTime: 5 * 60 * 1000,
    refetchInterval: 10 * 60 * 1000,
    // Show previous data while a new fetch is in flight — no loading flash.
    placeholderData: (prev) => prev,
  });

  const refresh = useCallback((force = false) => {
    const p = { ...params, force_refresh: force };
    setParams(p);
    queryClient.invalidateQueries({ queryKey: ["feed"] });
  }, [params, queryClient]);

  const updateParams = useCallback((next: Partial<FeedParams>) => {
    setParams(prev => ({ ...prev, ...next, force_refresh: false }));
  }, []);

  return {
    data,
    isLoading,
    isPending,
    isFetching,
    error,
    params,
    refresh,
    updateParams,
    // Derived from backend cache metadata
    isStale:  data?.is_stale          ?? false,
    cacheAge: data?.cache_age_seconds ?? 0,
  };
}
