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

const FMP_BASE = "https://financialmodelingprep.com/api/v3";

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
      const symbols = (Array.isArray(params.symbols) ? (params.symbols as unknown[]) : []).map(s => String(s).toUpperCase()).join(",");
      if (!symbols) throw new Error("[fmp] symbols are required for a quote");
      return this.getJson(`${FMP_BASE}/quote/${symbols}?apikey=${key}`);
    }
    if (dataset === "intraday") {
      const symbol = String(params.symbol ?? "").toUpperCase();
      return this.getJson(`${FMP_BASE}/historical-chart/5min/${symbol}?apikey=${key}`);
    }
    if (dataset === "daily") {
      const symbol = String(params.symbol ?? "").toUpperCase();
      return this.getJson(`${FMP_BASE}/historical-price-full/${symbol}?apikey=${key}`);
    }
    throw new Error(`[fmp] unknown dataset: ${dataset}`);
  }

  protected parseQuotes(raw: unknown, params: FetchParams): MarketQuote[] {
    const etfs = new Set((Array.isArray(params.etfs) ? (params.etfs as unknown[]) : []).map(s => String(s).toUpperCase()));
    return asArray(raw).map(asRecord).filter(r => r.symbol).map(r => {
      const symbol = String(r.symbol).toUpperCase();
      const ts = r.timestamp != null ? Number(r.timestamp) * 1000 : this.now();
      return {
        symbol,
        name: str(r.name) || undefined,
        assetType: (r.isEtf === true || etfs.has(symbol)) ? "ETF" : "Company",
        price: num(r.price),
        open: marketNum(r.open), high: marketNum(r.dayHigh), low: marketNum(r.dayLow), previousClose: marketNum(r.previousClose),
        changePercent: marketNum(r.changesPercentage),
        volume: marketNum(r.volume), avgVolume: marketNum(r.avgVolume),
        vwap: marketNum(r.vwap), marketCap: marketNum(r.marketCap), bid: marketNum(r.bid), ask: marketNum(r.ask),
        timestamp: Number.isFinite(ts) ? ts : this.now(),
      } as MarketQuote;
    });
  }

  protected parseBars(raw: unknown): OhlcvBar[] {
    const rows = Array.isArray(raw) ? raw : asArray(asRecord(raw).historical);
    return rows.map(asRecord).filter(r => r.date).map(r => ({
      t: Date.parse(String(r.date)), o: num(r.open), h: num(r.high), l: num(r.low), c: num(r.close), v: num(r.volume),
    })).filter(b => Number.isFinite(b.t)).sort((a, b) => a.t - b.t);
  }
}
