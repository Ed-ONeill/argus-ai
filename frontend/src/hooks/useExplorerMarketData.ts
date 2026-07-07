"use client";

/**
 * useExplorerMarketData - client bridge from /api/explorer-market into the
 * Market Intelligence Graph.
 *
 * Fetches server-normalized FMP observations (quotes + daily OHLCV) for one
 * symbol and ingests them via ingestProviderObservations. That call both writes
 * node.metadata.latestMarketData / mkt:{ticker}:ohlcv onto the live graph AND
 * fills the market observation cache, so useIntelligenceGraph's clear/rebuild
 * cycle re-applies the data automatically. Consumers re-read the graph when
 * `version` bumps. Keys never reach the client; this hook only sees normalized
 * observations. No em/en dashes.
 */

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ingestProviderObservations } from "@/lib/dataAdapters/observationGraphBridge";
import { intelligenceGraph as G } from "@/lib/intelligenceGraph";
import type { ProviderObservation } from "@/lib/dataAdapters/types";

export type IntradayStatus = "ok" | "blocked" | "empty" | "error";

interface ExplorerMarketResponse {
  ok:            boolean;
  reason?:       string;
  observations:  ProviderObservation[];
  errors?:       Array<{ dataset: string; symbol?: string; error: string }>;
  quoteSource?:  string | null;
  intraday?:     IntradayStatus | null;
}

export interface UseExplorerMarketDataResult {
  /** Bumps after each successful ingest; add to memo deps that read the graph. */
  version:    number;
  ok:         boolean;
  reason:     string | null;
  isFetching: boolean;
  /** Which quote endpoint served: "batch", "quote_profile", "profile_fallback", null while unknown. */
  quoteSource: string | null;
  /** Whether intraday bars are served on this plan: null while unknown. */
  intradayStatus: IntradayStatus | null;
}

export function useExplorerMarketData({ enabled, ticker, isEtf }: { enabled: boolean; ticker: string; isEtf?: boolean }): UseExplorerMarketDataResult {
  const symbol = (ticker || "").trim().toUpperCase();
  const [version, setVersion] = useState(0);

  const query = useQuery<ExplorerMarketResponse>({
    queryKey: ["explorer-market", symbol, !!isEtf],
    enabled:  enabled && symbol.length > 0,
    queryFn: async () => {
      const qs = new URLSearchParams({ symbols: symbol, ohlcv: "1" });
      if (isEtf) qs.set("etfs", symbol);
      const res = await fetch(`/api/explorer-market?${qs.toString()}`);
      if (!res.ok) throw new Error(`explorer-market HTTP ${res.status}`);
      return res.json();
    },
    staleTime:       60_000,
    refetchInterval: 120_000,
    retry:           2,
    placeholderData: prev => prev,
  });

  const data = query.data;
  useEffect(() => {
    if (!data) return;
    if (!data.ok || !Array.isArray(data.observations) || data.observations.length === 0) {
      if (process.env.NODE_ENV !== "production") {
        console.debug(`[useExplorerMarketData] ${symbol}: no observations (reason=${data.reason ?? "empty"}, errors=${(data.errors ?? []).length})`);
      }
      return;
    }
    const stats = ingestProviderObservations(data.observations);
    setVersion(v => v + 1);
    if (process.env.NODE_ENV !== "production") {
      const lmd = !!G.getNode(symbol)?.metadata?.latestMarketData;
      const bars = !!G.getNode(`mkt:${symbol}:ohlcv`);
      console.debug(`[useExplorerMarketData] ${symbol}: ingested ${stats.observationsIngested}/${data.observations.length} obs, +${stats.nodesAdded} nodes; latestMarketData=${lmd}, ohlcv=${bars}${(data.errors ?? []).length ? `, provider errors: ${data.errors!.map(e => `${e.dataset} ${e.error}`).join("; ")}` : ""}`);
    }
  }, [data, symbol]);

  return {
    version,
    ok: data?.ok ?? false,
    reason: data && !data.ok ? data.reason ?? "unknown" : null,
    isFetching: query.isFetching,
    quoteSource: data?.quoteSource ?? null,
    intradayStatus: data?.intraday ?? null,
  };
}
