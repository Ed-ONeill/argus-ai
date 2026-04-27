"use client";

import { useQuery } from "@tanstack/react-query";
import type { TickerData } from "@/app/api/market-data/route";

export type { TickerData };

export function useMarketData() {
  return useQuery<Record<string, TickerData | null>>({
    queryKey:        ["market-data"],
    queryFn:         () => fetch("/api/market-data").then(r => r.json()),
    staleTime:       5 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
    retry:           2,
  });
}
