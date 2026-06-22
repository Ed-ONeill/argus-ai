"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchFeed } from "@/lib/api";
import type { FeedResponse } from "@/lib/types";

export function useSectors() {
  const { data, isLoading, isFetching, error } = useQuery<FeedResponse>({
    // Must match useFeed's normalized key exactly so this shares the homepage
    // feed cache entry instead of triggering a second identical fetch.
    queryKey:        ["feed", { categories: "", sources: "", fresh_only: false }],
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
