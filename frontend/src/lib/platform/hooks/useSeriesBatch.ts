"use client";

// platform/hooks/useSeriesBatch.ts — fetch many price series at once, reusing the EXACT
// canonical query path of useSeries (same cache key, same server route). No second cache or
// provider; each symbol is an independent cached query, so a partial provider failure
// degrades per symbol rather than failing the whole set. Built for the Market Rotation Map.

import { useQueries } from "@tanstack/react-query";
import { fetchSeries, seriesQueryKey, type SeriesResponse, type UseSeriesOptions, type UseSeriesResult } from "./useSeries";

export interface BatchSymbol { symbol: string; exchange?: string }

export function useSeriesBatch(
  symbols: BatchSymbol[],
  opts: { from?: string; to?: string; enabled?: boolean } = {},
): Record<string, UseSeriesResult> {
  const results = useQueries({
    queries: symbols.map((it) => {
      const o: UseSeriesOptions = { exchange: it.exchange, from: opts.from, to: opts.to };
      return {
        queryKey: seriesQueryKey(it.symbol, o),
        queryFn: () => fetchSeries(it.symbol, o),
        enabled: (opts.enabled ?? true) && !!it.symbol,
        staleTime: 6 * 60 * 60 * 1000,
        refetchInterval: 6 * 60 * 60 * 1000,
        placeholderData: (prev: SeriesResponse | undefined) => prev,
      };
    }),
  });

  const map: Record<string, UseSeriesResult> = {};
  symbols.forEach((it, i) => {
    const q = results[i];
    const enabled = (opts.enabled ?? true) && !!it.symbol;
    map[it.symbol] = {
      series: q.data?.series ?? null,
      quality: q.data?.quality ?? null,
      absent: q.data?.absent ?? !enabled,
      stale: q.data?.stale ?? false,
      isLoading: q.isLoading && enabled,
      isError: q.isError,
      refetch: () => void q.refetch(),
    };
  });
  return map;
}
