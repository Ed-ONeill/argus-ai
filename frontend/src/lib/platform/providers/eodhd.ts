// platform/providers/eodhd.ts — the EODHD adapter.
//
// Stage 1A wires ONE endpoint: historical_prices → /eod (adjusted OHLCV), the only
// domain entitled by the "EOD Historical Data — All World" plan. Every other domain is
// unentitled and returns `skipped` → honest absence; it is NEVER called. The API token
// is used only to build the outbound URL server-side — it never appears in the returned
// endpoint, the ProviderObservation, or any response (key secrecy).

import { eodhdConfig } from "../config";
import type { DataDomain } from "../domain";
import { normalizeEodhdEod } from "../normalize/eodhdPrices";
import { skipped, type DataProvider, type ProviderFetchResult } from "../provider";
import type { PriceSeries } from "../types/prices";

export const EODHD_DOMAINS: DataDomain[] = [
  "historical_prices", "intraday", "realtime_prices", "corporate_actions",
  "calendar", "movers", "fundamentals", "insider", "etf_holdings", "macro", "news",
];

// Token-free endpoint templates — used for observation/replay labels only.
const ENDPOINT: Partial<Record<DataDomain, string>> = {
  historical_prices: "/eod/{symbol}.{exchange}",
  intraday: "/intraday/{symbol}",
  realtime_prices: "/real-time/{symbol}",
  corporate_actions: "/div|splits/{symbol}",
  calendar: "/calendar|/economic-events",
  movers: "/screener|/eod-bulk-last-day",
  fundamentals: "/fundamentals/{symbol}",
  insider: "/insider-transactions",
  etf_holdings: "/fundamentals/{symbol}#ETF_Data",
  macro: "/macro-indicator/{country}",
  news: "/news",
};

const TIMEOUT_MS = 8_000;

export class EODHDProvider implements DataProvider {
  readonly name = "eodhd";
  readonly version = "eodhd-adapter@0.2.0-stage1a";

  serves(domain: DataDomain): boolean {
    return EODHD_DOMAINS.includes(domain);
  }

  async fetch<T>(domain: DataDomain, params: Record<string, unknown> = {}): Promise<ProviderFetchResult<T>> {
    const cfg = eodhdConfig();               // server-only; throws in a browser context
    const template = ENDPOINT[domain] ?? `/${domain}`;

    // Unentitled domains are NEVER called — honest absence via the resolver.
    if (!cfg.entitledDomains.includes(domain)) return skipped<T>(template);
    if (!cfg.configured) {
      return { data: null, quality: null, endpoint: template, httpStatus: null, outcome: "error" };
    }
    if (domain === "historical_prices") return this.fetchEod<T>(cfg.baseUrl, cfg.apiToken, params);
    return skipped<T>(template);             // entitled but not yet implemented
  }

  private async fetchEod<T>(
    baseUrl: string, apiToken: string, params: Record<string, unknown>,
  ): Promise<ProviderFetchResult<T>> {
    const symbol = String(params.symbol ?? "").trim().toUpperCase();
    const exchange = String(params.exchange ?? "US").trim().toUpperCase();
    const tokenFreeEndpoint = `/eod/${symbol}.${exchange}`;   // NEVER contains the token
    if (!symbol) {
      return { data: null, quality: null, endpoint: "/eod", httpStatus: null, outcome: "error" };
    }

    const url = new URL(`${baseUrl}/eod/${symbol}.${exchange}`);
    url.searchParams.set("api_token", apiToken);   // used for the fetch only
    url.searchParams.set("fmt", "json");
    url.searchParams.set("period", "d");
    if (typeof params.from === "string") url.searchParams.set("from", params.from);
    if (typeof params.to === "string") url.searchParams.set("to", params.to);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(url.toString(), { signal: controller.signal });
      if (!res.ok) {
        return { data: null, quality: null, endpoint: tokenFreeEndpoint, httpStatus: res.status, outcome: "error" };
      }
      const raw = await res.json();
      const series = normalizeEodhdEod(raw, symbol, exchange, new Date().toISOString());
      if (!series) {
        return { data: null, quality: null, endpoint: tokenFreeEndpoint, httpStatus: res.status, outcome: "empty" };
      }
      return { data: series as T, quality: series.quality, endpoint: tokenFreeEndpoint, httpStatus: res.status, outcome: "ok" };
    } catch (err) {
      const timedOut = err instanceof Error && err.name === "AbortError";
      return { data: null, quality: null, endpoint: tokenFreeEndpoint, httpStatus: null, outcome: timedOut ? "timeout" : "error" };
    } finally {
      clearTimeout(timer);
    }
  }
}

export const eodhdProvider = new EODHDProvider();
export type { PriceSeries };
