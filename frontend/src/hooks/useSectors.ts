"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchFeed, UnauthorizedError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { authedQueryState } from "@/lib/authGate";
import type { FeedResponse } from "@/lib/types";

export function useSectors() {
  const { authReady, accessToken, invalidatingSession } = useAuth();
  // Same shared gate as Feed/Listen: never call fetchFeed() before auth has
  // settled with a usable token (Industries + sector-detail were racing the
  // initial session restoration and getting 401s).
  const authState = authedQueryState({ authReady, accessToken, invalidatingSession });
  const enabled = authState.enabled;

  const { data, isLoading, isFetching, error } = useQuery<FeedResponse>({
    // Must match useFeed's normalized key exactly so this shares the homepage
    // feed cache entry instead of triggering a second identical fetch.
    queryKey:        ["feed", { categories: "", sources: "", fresh_only: false }],
    queryFn:         () => fetchFeed({}),
    enabled,
    staleTime:       5 * 60 * 1000,
    refetchInterval: 10 * 60 * 1000,
    placeholderData: (prev) => prev,
  });

  return {
    sectorData:  data?.sector_data                    ?? null,
    regime:      data?.market_brief?.market_regime    ?? null,
    clusters:    data?.clusters                       ?? [],
    marketBrief: data?.market_brief                   ?? null,
    // Keep the loading state only while auth is RESOLVING (isAuthWaiting) — a
    // resolved signed-out state must NOT read as a permanent skeleton.
    isLoading:   (isLoading || authState.isAuthWaiting) && !data,
    isFetching,
    isStale:     data?.is_stale          ?? false,
    cacheAge:    data?.cache_age_seconds ?? 0,
    error,
    // Distinct auth-aware state so Industries/sector pages can tell "waiting for
    // session" from "unauthenticated" from a genuine failure or empty result.
    isAuthWaiting:  authState.isAuthWaiting,
    isUnauthorized: authState.isUnauthenticated || error instanceof UnauthorizedError,
  };
}
