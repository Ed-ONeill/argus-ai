"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchFeedFreshness } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { authedQueryState } from "@/lib/authGate";
import type { FeedFreshness } from "@/lib/types";

interface UseFeedFreshnessOptions {
  categories?:        string;
  sources?:           string;
  fresh_only?:        boolean;
  /** generated_at from the currently-displayed feed snapshot */
  currentGeneratedAt?: string;
  /** How often to poll the lightweight freshness endpoint (ms). Default: 60 s. */
  refetchInterval?:   number;
}

export function useFeedFreshness({
  categories         = "",
  sources            = "",
  fresh_only         = false,
  currentGeneratedAt,
  refetchInterval    = 60_000,
}: UseFeedFreshnessOptions = {}) {
  const { authReady, accessToken, invalidatingSession } = useAuth();
  const enabled = authedQueryState({ authReady, accessToken, invalidatingSession }).enabled;

  const { data } = useQuery<FeedFreshness>({
    queryKey:        ["feed-freshness", categories, sources, fresh_only],
    queryFn:         () => fetchFeedFreshness(categories, sources, fresh_only),
    enabled,
    refetchInterval,
    staleTime:       30_000,
    // Don't show loading state — this is a silent background poll
    placeholderData: (prev) => prev,
  });

  // True when the server has a newer snapshot than what's currently displayed
  const hasNew = !!(
    data?.generated_at &&
    currentGeneratedAt &&
    data.generated_at !== currentGeneratedAt
  );

  return {
    freshness:        data ?? null,
    hasNew,
    cacheAgeSeconds:  data?.cache_age_seconds ?? 0,
    isStale:          data?.is_stale          ?? false,
  };
}
