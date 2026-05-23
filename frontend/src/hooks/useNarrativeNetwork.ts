"use client";

import { useQuery } from "@tanstack/react-query";
import type { NarrativeNetworkResponse } from "@/lib/types";

async function fetchNetwork(): Promise<NarrativeNetworkResponse> {
  const res = await fetch("/api/intelligence/network?debug=true");
  if (!res.ok) throw new Error(`[narrative-network] ${res.status}`);
  return res.json();
}

export function useNarrativeNetwork() {
  return useQuery<NarrativeNetworkResponse>({
    queryKey:        ["intelligence", "network"],
    queryFn:         fetchNetwork,
    staleTime:       5 * 60 * 1000,        // 5 min
    refetchInterval: 10 * 60 * 1000,       // auto-poll every 10 min
    retry:           2,
    placeholderData: (prev) => prev,
  });
}
