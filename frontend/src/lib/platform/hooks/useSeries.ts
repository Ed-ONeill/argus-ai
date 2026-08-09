"use client";

// platform/hooks/useSeries.ts — the reusable, product-agnostic price-series primitive
// (DX3.2 domain 1). One hook every surface reuses unchanged — Brief, Feed, Drawer,
// Entity, Explorer, Markets, and the future Workstation (Workstation Reuse Law). It
// speaks only to the server route (key stays server-side) and surfaces DataQuality so
// consumers can label delayed/stale and honor honest absence.

import { useQuery } from "@tanstack/react-query";
import type { DataQuality } from "@/lib/platform/quality";
import type { PriceSeries } from "@/lib/platform/types/prices";

export interface SeriesResponse {
  series: PriceSeries | null;
  quality: DataQuality | null;
  absent: boolean;
  stale?: boolean;
  reason?: string;
}

export interface UseSeriesOptions {
  exchange?: string;
  from?: string;   // YYYY-MM-DD
  to?: string;
  enabled?: boolean;
}

export interface UseSeriesResult {
  series: PriceSeries | null;
  quality: DataQuality | null;
  absent: boolean;
  stale: boolean;
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
}

// The canonical price-query path. Exported so multi-symbol consumers (useSeriesBatch) reuse
// the SAME cache key + fetch — never a second cache or provider.
export function seriesQueryKey(symbol: string | null | undefined, opts: UseSeriesOptions = {}) {
  return ["reference", "prices", symbol, opts.exchange ?? "US", opts.from ?? "", opts.to ?? ""] as const;
}

export async function fetchSeries(symbol: string, opts: UseSeriesOptions): Promise<SeriesResponse> {
  const qs = new URLSearchParams({ symbol });
  if (opts.exchange) qs.set("exchange", opts.exchange);
  if (opts.from) qs.set("from", opts.from);
  if (opts.to) qs.set("to", opts.to);
  const res = await fetch(`/api/reference/prices?${qs.toString()}`);
  return res.json();
}

export function useSeries(symbol: string | null | undefined, opts: UseSeriesOptions = {}): UseSeriesResult {
  const enabled = (opts.enabled ?? true) && !!symbol;
  const q = useQuery<SeriesResponse>({
    queryKey: seriesQueryKey(symbol, opts),
    queryFn: () => fetchSeries(symbol as string, opts),
    enabled,
    staleTime: 6 * 60 * 60 * 1000,       // EOD — 6h
    refetchInterval: 6 * 60 * 60 * 1000,
    placeholderData: (prev) => prev,
  });

  return {
    series: q.data?.series ?? null,
    quality: q.data?.quality ?? null,
    absent: q.data?.absent ?? !enabled,   // honest absence until loaded / when disabled
    stale: q.data?.stale ?? false,
    isLoading: q.isLoading && enabled,
    isError: q.isError,
    refetch: () => void q.refetch(),
  };
}

/** Alias — the concrete price flavor of the generic series primitive. */
export const usePrices = useSeries;
