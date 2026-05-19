"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchFeed } from "@/lib/api";
import type { FeedResponse } from "@/lib/types";

export function useSectors() {
  const { data, isLoading, isFetching, error } = useQuery<FeedResponse>({
    // Same key as useFeed() with no params — shares the homepage cache entry.
    queryKey:        ["feed", {}],
    queryFn:         () => fetchFeed({}),
    staleTime:       5 * 60 * 1000,
    refetchInterval: 10 * 60 * 1000,
    placeholderData: (prev) => prev,
  });

  return {
    sectorData:  data?.sector_data                    ?? null,
    regime:      data?.market_brief?.market_regime    ?? null,
    clusters:    data?.clusters                       ?? [],
    marketBrief: data?.market_brief                   ?? null,
    isLoading:   isLoading && !data,
    isFetching,
    isStale:     data?.is_stale          ?? false,
    cacheAge:    data?.cache_age_seconds ?? 0,
    error,
  };
}
