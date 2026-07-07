/**
 * lib/dataAdapters/marketData/fmp.ts - Financial Modeling Prep market-data provider.
 *
 * The first concrete MarketDataAdapter: it fetches quotes and OHLCV bars from FMP and
 * parses them into the canonical MarketQuote / OhlcvBar shapes. Adding Twelve Data,
 * Polygon, Finnhub, or Intrinio later means writing the same three methods against a
 * different endpoint. Free (freemium) with an API key. No em/en dashes.
 */

import { MarketDataAdapter, marketNum, type MarketQuote, type OhlcvBar } from "./MarketDataAdapter";
import type { AdapterContext, FetchParams, ProviderId, ProviderMetadata } from "../types";

const asRecord = (v: unknown): Record<string, unknown> => (v && typeof v === "object" ? v as Record<string, unknown> : {});
const asArray = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const str = (v: unknown): string => (typeof v === "string" ? v : "");
const num = (v: unknown): number => { const n = marketNum(v); return n ?? 0; };

// Current stable API base. The legacy /api/v3 endpoints are no longer supported.
const FMP_STABLE = "https://financialmodelingprep.com/stable";

export class FmpAdapter extends MarketDataAdapter {
  readonly id: ProviderId = "fmp";

  constructor(ctx: AdapterContext = {}) { super(ctx); }

  metadata(): ProviderMetadata {
    return {
      id: "fmp",
      name: "Financial Modeling Prep",
      description: "Stock and ETF market data: quotes, volume, liquidity, and OHLCV bars.",
      reliability: 82,
      cadence: "realtime",
      ttlMs: 60_000,                 // 1 minute
      rateLimitPerMin: 300,
      costTier: "freemium",
      requiresApiKey: true,
      supportsEntities: ["Company", "ETF"],
      supportsObservations: ["market_price", "volume", "liquidity", "ohlcv"],
      docsUrl: "https://site.financialmodelingprep.com/developer/docs",
    };
  }

  async connect(): Promise<boolean> { return !!this.apiKey; }

  protected async marketRequest(params: FetchParams): Promise<unknown> {
    if (!this.apiKey) throw new Error("[fmp] apiKey is required");
    const dataset = String(params.dataset ?? "quote");
    const key = encodeURIComponent(this.apiKey);
    if (dataset === "quote") {
      const symbols = (Array.isArray(params.symbols) ? (params.symbols as unknown[]) : []).map(s => String(s).toUpperCase());
      if (!symbols.length) throw new Error("[fmp] symbols are required for a quote");
      // Preferred: stable batch-quote (full quotes for stocks and ETFs by symbol list).
      const res = await this.transport(`${FMP_STABLE}/batch-quote?symbols=${symbols.join(",")}&apikey=${key}`, { headers: { Accept: "application/json" } });
      if (res.ok) return { endpoint: "batch", rows: asArray(await res.json()) };
      // Plans without batch access get 402/403/404: fall back per symbol to the
      // single /quote (intraday fields) merged with /profile (beta, avg volume,
      // range, sector), then to profile alone when /quote is also unavailable.
      if (res.status === 402 || res.status === 403 || res.status === 404) {
        return { endpoint: "mixed", rows: await this.fetchSingles(symbols, key) };
      }
      throw new Error(`[fmp] HTTP ${res.status} for batch-quote`);
    }
    if (dataset === "intraday") {
      const symbol = String(params.symbol ?? "").toUpperCase();
      const interval = ["5min", "15min", "1hour"].includes(String(params.interval)) ? String(params.interval) : "5min";
      return this.getJson(`${FMP_STABLE}/historical-chart/${interval}?symbol=${symbol}&apikey=${key}`);
    }
    if (dataset === "daily") {
      const symbol = String(params.symbol ?? "").toUpperCase();
      return this.getJson(`${FMP_STABLE}/historical-price-eod/full?symbol=${symbol}&apikey=${key}`);
    }
    throw new Error(`[fmp] unknown dataset: ${dataset}`);
  }

  /**
   * Per-symbol fallback: /stable/quote (live day fields) merged over /stable/profile
   * (reference fields). Quote values win on overlap since they are fresher. A failure
   * on one symbol or one endpoint never fails the rest.
   */
  private async fetchSingles(symbols: string[], key: string): Promise<unknown[]> {
    const rows: unknown[] = [];
    for (const sym of symbols) {
      const get = async (path: string): Promise<Record<string, unknown> | null> => {
        try {
          const res = await this.transport(`${FMP_STABLE}${path}&apikey=${key}`, { headers: { Accept: "application/json" } });
          if (!res.ok) return null;
          const arr = asArray(await res.json());
          return arr.length ? asRecord(arr[0]) : null;
        } catch { return null; }
      };
      const quote = await get(`/quote?symbol=${sym}`);
      const prof = await get(`/profile?symbol=${sym}`);
      if (quote) rows.push({ ...(prof ?? {}), ...quote, __endpoint: "single" });
      else if (prof) rows.push({ ...prof, __endpoint: "profile" });
    }
    return rows;
  }

  protected parseQuotes(raw: unknown, params: FetchParams): MarketQuote[] {
    const etfs = new Set((Array.isArray(params.etfs) ? (params.etfs as unknown[]) : []).map(s => String(s).toUpperCase()));
    // marketRequest wraps quote results as { endpoint, rows }; a bare array is treated as batch.
    const wrapper = asRecord(raw);
    const rows = Array.isArray(raw) ? raw : (Array.isArray(wrapper.rows) ? wrapper.rows : []);

    return rows.map(asRecord).filter(r => r.symbol).map(r => {
      const symbol = String(r.symbol).toUpperCase();
      const isEtf = r.isEtf === true || etfs.has(symbol);
      const rowEndpoint = str(r.__endpoint);

      if (rowEndpoint === "profile") {
        // /stable/profile alone: company-level snapshot. Preserve the fields it provides.
        return {
          symbol, name: str(r.companyName) || str(r.name) || undefined, assetType: isEtf ? "ETF" : "Company",
          price: num(r.price), changePercent: marketNum(r.changePercentage ?? r.changesPercentage),
          volume: marketNum(r.volume), avgVolume: marketNum(r.averageVolume ?? r.avgVolume),
          marketCap: marketNum(r.marketCap), beta: marketNum(r.beta), range: str(r.range) || undefined,
          exchange: str(r.exchange) || str(r.exchangeShortName) || undefined, sector: str(r.sector) || undefined, industry: str(r.industry) || undefined,
          timestamp: this.now(), sourceEndpoint: "profile_fallback",
        } as MarketQuote;
      }

      const ts = r.timestamp != null ? Number(r.timestamp) * 1000 : this.now();
      return {
        symbol, name: str(r.name) || str(r.companyName) || undefined, assetType: isEtf ? "ETF" : "Company",
        price: num(r.price),
        open: marketNum(r.open), high: marketNum(r.dayHigh), low: marketNum(r.dayLow), previousClose: marketNum(r.previousClose),
        // Stable uses changePercentage / averageVolume; legacy used changesPercentage / avgVolume.
        changePercent: marketNum(r.changePercentage ?? r.changesPercentage),
        volume: marketNum(r.volume), avgVolume: marketNum(r.avgVolume ?? r.averageVolume),
        vwap: marketNum(r.vwap), marketCap: marketNum(r.marketCap), bid: marketNum(r.bid), ask: marketNum(r.ask),
        beta: marketNum(r.beta), range: str(r.range) || undefined,
        yearHigh: marketNum(r.yearHigh), yearLow: marketNum(r.yearLow),
        exchange: str(r.exchange) || undefined, sector: str(r.sector) || undefined, industry: str(r.industry) || undefined,
        timestamp: Number.isFinite(ts) ? ts : this.now(),
        // Single /quote + /profile merge is still a fallback; batch rows carry no marker.
        sourceEndpoint: rowEndpoint === "single" ? "quote_profile" : undefined,
      } as MarketQuote;
    });
  }

  protected parseBars(raw: unknown): OhlcvBar[] {
    const rows = Array.isArray(raw) ? raw : asArray(asRecord(raw).historical);
    return rows.map(asRecord).filter(r => r.date).map(r => ({
      t: Date.parse(String(r.date)), o: num(r.open), h: num(r.high), l: num(r.low), c: num(r.close), v: num(r.volume),
      vwap: marketNum(r.vwap),
    })).filter(b => Number.isFinite(b.t)).sort((a, b) => a.t - b.t);
  }
}
