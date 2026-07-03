/**
 * lib/dataAdapters/marketData/MarketDataAdapter.ts - generic market-data provider base.
 *
 * A provider-agnostic layer over BaseDataAdapter for stock and ETF market data. Any
 * concrete provider (Financial Modeling Prep first, later Twelve Data, Polygon,
 * Finnhub, Intrinio) only implements the raw request and how to parse that provider's
 * shape into the canonical MarketQuote / OhlcvBar. This class handles the normalization
 * into ProviderObservation, staleness flagging, and market-specific health metrics.
 *
 * Neutral by design: it records price, volume, and liquidity. It never treats a price
 * move up or down as bullish or bearish. Pure library, no UI, no em/en dashes.
 */

import { BaseDataAdapter } from "../BaseDataAdapter";
import type { EntityType, FetchParams, ProviderHealth, ProviderObservation } from "../types";

export interface MarketQuote {
  symbol:         string;
  name?:          string;
  assetType:      "Company" | "ETF";
  price:          number;
  open?:          number;
  high?:          number;
  low?:           number;
  previousClose?: number;
  changePercent?: number;
  volume?:        number;
  avgVolume?:     number;
  vwap?:          number;
  marketCap?:     number;
  bid?:           number;
  ask?:           number;
  // Extra reference fields, populated by the profile fallback when quotes are unavailable.
  beta?:          number;
  range?:         string;
  exchange?:      string;
  sector?:        string;
  industry?:      string;
  sourceEndpoint?: string;   // e.g. "profile_fallback"
  timestamp:      number;    // epoch ms
}

export interface OhlcvBar { t: number; o: number; h: number; l: number; c: number; v: number }

export interface MarketProviderHealth extends ProviderHealth {
  tickerCount:   number;
  failedTickers: number;
  staleTickers:  number;
  avgLatencyMs:  number;
}

const numU = (v: unknown): number | undefined => {
  const n = typeof v === "string" ? parseFloat(v.replace(/[%,\s]/g, "")) : v;
  return typeof n === "number" && Number.isFinite(n) ? n : undefined;
};
const round2 = (n: number): number => Math.round(n * 100) / 100;
const perfNow = (): number => (typeof performance !== "undefined" ? performance.now() : Date.now());

export abstract class MarketDataAdapter extends BaseDataAdapter {
  protected mTickers = new Set<string>();
  protected mFailed = 0;
  protected mStale = 0;
  protected mLatencies: number[] = [];

  /* ----- provider-specific (subclass) ----- */
  protected abstract marketRequest(params: FetchParams): Promise<unknown>;
  protected abstract parseQuotes(raw: unknown, params: FetchParams): MarketQuote[];
  protected abstract parseBars(raw: unknown, params: FetchParams): OhlcvBar[];

  /** Times every raw request centrally so latency lands in health. */
  protected async request(params: FetchParams): Promise<unknown> {
    const t0 = perfNow();
    try { return await this.marketRequest(params); }
    finally { this.recordLatency(perfNow() - t0); }
  }

  normalize(raw: unknown, params: FetchParams = {}): ProviderObservation[] {
    const dataset = String(params.dataset ?? "quote");
    if (dataset === "quote") return this.emitQuotes(this.parseQuotes(raw, params), params);
    if (dataset === "intraday" || dataset === "daily") {
      const symbol = String(params.symbol ?? "").toUpperCase();
      const bars = this.parseBars(raw, params);
      return symbol && bars.length ? [this.emitOhlcv(symbol, params, bars, dataset)] : [];
    }
    return [];
  }

  health(): MarketProviderHealth {
    const base = super.health();
    return {
      ...base,
      tickerCount: this.mTickers.size,
      failedTickers: this.mFailed,
      staleTickers: this.mStale,
      avgLatencyMs: this.mLatencies.length ? round2(this.mLatencies.reduce((s, x) => s + x, 0) / this.mLatencies.length) : 0,
    };
  }

  /* ----- normalization ----- */

  private emitQuotes(quotes: MarketQuote[], params: FetchParams): ProviderObservation[] {
    const requested = (Array.isArray(params.symbols) ? (params.symbols as unknown[]) : quotes.map(q => q.symbol)).map(s => String(s).toUpperCase());
    const returned = new Set(quotes.map(q => q.symbol));
    this.mFailed += requested.filter(s => !returned.has(s)).length;

    const out: ProviderObservation[] = [];
    for (const q of quotes) {
      this.mTickers.add(q.symbol);
      const relVol = q.avgVolume && q.avgVolume > 0 && q.volume != null ? round2(q.volume / q.avgVolume) : null;
      const dollarVol = q.price != null && q.volume != null ? Math.round(q.price * q.volume) : null;

      const price = this.build(q, "market_price", {
        price: q.price, open: q.open ?? null, high: q.high ?? null, low: q.low ?? null, previousClose: q.previousClose ?? null,
        changePercent: q.changePercent ?? null, volume: q.volume ?? null, avgVolume: q.avgVolume ?? null,
        relativeVolume: relVol, dollarVolume: dollarVol, vwap: q.vwap ?? null, marketCap: q.marketCap ?? null,
        bid: q.bid ?? null, ask: q.ask ?? null,
        beta: q.beta ?? null, range: q.range ?? null, exchange: q.exchange ?? null, sector: q.sector ?? null, industry: q.industry ?? null,
        timestamp: q.timestamp,
      });
      const stale = price.quality.freshness < 50;
      price.metadata.stale = stale;
      if (stale) this.mStale += 1;
      out.push(price);

      const vol = this.build(q, "volume", { volume: q.volume ?? null, avgVolume: q.avgVolume ?? null, relativeVolume: relVol, timestamp: q.timestamp });
      vol.metadata.stale = stale; out.push(vol);

      const liq = this.build(q, "liquidity", { dollarVolume: dollarVol, vwap: q.vwap ?? null, bid: q.bid ?? null, ask: q.ask ?? null, spread: q.bid != null && q.ask != null ? round2(q.ask - q.bid) : null, timestamp: q.timestamp });
      liq.metadata.stale = stale; out.push(liq);
    }
    return out;
  }

  private emitOhlcv(symbol: string, params: FetchParams, bars: OhlcvBar[], interval: string): ProviderObservation {
    this.mTickers.add(symbol);
    const assetType: EntityType = String(params.assetType ?? "Company") === "ETF" ? "ETF" : "Company";
    const last = bars[bars.length - 1];
    const obs = this.buildObservation({
      source: this.metadata().name, providerConfidence: 95, providerTimestamp: last.t,
      entityType: assetType, entityId: symbol, entityLabel: undefined, observationType: "ohlcv", entityConfidence: 98,
      payload: { interval, count: bars.length, latest: last, bars: bars.slice(-100), timestamp: last.t },
      metadata: { interval },
    });
    obs.metadata.stale = obs.quality.freshness < 50;
    return obs;
  }

  private build(q: MarketQuote, observationType: string, payload: Record<string, unknown>): ProviderObservation {
    const metadata: Record<string, unknown> = { assetType: q.assetType };
    if (q.sourceEndpoint) metadata.sourceEndpoint = q.sourceEndpoint;
    return this.buildObservation({
      source: this.metadata().name, providerConfidence: 96, providerTimestamp: q.timestamp,
      entityType: q.assetType, entityId: q.symbol, entityLabel: q.name, observationType, entityConfidence: 98,
      payload, metadata,
    });
  }

  protected recordLatency(ms: number): void {
    this.mLatencies.push(ms);
    if (this.mLatencies.length > 50) this.mLatencies.shift();
  }
}

export { numU as marketNum, round2 as marketRound2 };
