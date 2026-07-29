"use client";

import { useQuery } from "@tanstack/react-query";
import { apiGet, UnauthorizedError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { authedQueryState } from "@/lib/authGate";
import type { NarrativeNetworkResponse } from "@/lib/types";

async function fetchNetwork(): Promise<NarrativeNetworkResponse> {
  // Protected backend route → shared authed client (fresh Bearer + 401 handling).
  return apiGet<NarrativeNetworkResponse>("/intelligence/network?debug=true");
}

export function useNarrativeNetwork() {
  const { authReady, accessToken, invalidatingSession } = useAuth();
  const enabled = authedQueryState({ authReady, accessToken, invalidatingSession }).enabled;
  return useQuery<NarrativeNetworkResponse>({
    queryKey:        ["intelligence", "network"],
    queryFn:         fetchNetwork,
    enabled,
    staleTime:       5 * 60 * 1000,        // 5 min
    refetchInterval: 10 * 60 * 1000,       // auto-poll every 10 min
    // Don't retry a definitive 401 (the client already refreshed+retried).
    retry: (failureCount, error) => !(error instanceof UnauthorizedError) && failureCount < 2,
    placeholderData: (prev) => prev,
  });
}
