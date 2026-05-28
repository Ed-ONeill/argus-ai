"use client";

import { useQuery } from "@tanstack/react-query";
import type { TickerData, MarketMeta } from "@/app/api/market-data/route";

export type { TickerData };
export type { MarketMeta };

export type HeartbeatStatus = "loading" | "live" | "stale" | "degraded" | "offline";

interface MarketResponse {
  tickers: Record<string, TickerData | null>;
  meta:    MarketMeta;
}

function parseMarketResponse(raw: unknown): MarketResponse {
  if (raw && typeof raw === "object" && "tickers" in raw) {
    return raw as MarketResponse;
  }
  // Backward-compat: flat record from old route format
  return {
    tickers: raw as Record<string, TickerData | null>,
    meta: { fetchedAt: new Date().toISOString(), isMarketOpen: false, tickerCount: 0, failCount: 0, staleCount: 0 },
  };
}

const STALE_MS = 3 * 60 * 1000;

export function useMarketData() {
  const query = useQuery<MarketResponse>({
    queryKey:             ["market-data"],
    queryFn:              () =>
      fetch("/api/market-data").then(r => r.json()).then(parseMarketResponse),
    staleTime:            30_000,
    refetchInterval:      60_000,
    retry:                3,
    retryDelay:           (n) => Math.min(1_000 * 2 ** n, 20_000),
    placeholderData:      (prev) => prev,
    refetchOnWindowFocus: true,
    refetchOnReconnect:   true,
  });

  const tickers = query.data?.tickers;
  const meta    = query.data?.meta;

  const dataAge = meta ? Date.now() - new Date(meta.fetchedAt).getTime() : null;
  const isStale = dataAge !== null && dataAge > STALE_MS;

  const hasStaleProviderData = (meta?.staleCount ?? 0) > 0;

  let heartbeatStatus: HeartbeatStatus = "loading";
  if (!query.isPending) {
    if (!tickers) {
      heartbeatStatus = "offline";
    } else {
      const vals      = Object.values(tickers);
      const nullCount = vals.filter(v => v === null).length;
      if (nullCount === vals.length)          heartbeatStatus = "offline";
      else if (isStale || hasStaleProviderData) heartbeatStatus = "stale";
      else if (nullCount > 0)                 heartbeatStatus = "degraded";
      else                                    heartbeatStatus = "live";
    }
  }

  return {
    data:            tickers as Record<string, TickerData | null> | undefined,
    meta,
    isStale,
    heartbeatStatus,
    marketOpen:      meta?.isMarketOpen ?? false,
    isLoading:       query.isLoading,
    isPending:       query.isPending,
    isFetching:      query.isFetching,
    isError:         query.isError,
    error:           query.error,
    refetch:         query.refetch,
    status:          query.status,
  };
}
