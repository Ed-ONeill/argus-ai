import { NextResponse } from "next/server";
import { FmpAdapter } from "@/lib/dataAdapters/marketData";
import type { ProviderObservation } from "@/lib/dataAdapters/types";

/**
 * /api/explorer-market - server-side FMP bridge for the Intelligence Explorer.
 *
 * The Explorer's graph lives in the browser, but the FMP key must stay on the
 * server. This route runs the existing FmpAdapter (quotes via stable batch-quote
 * with the profile fallback, plus optional daily OHLCV bars) with FMP_API_KEY and
 * returns the NORMALIZED ProviderObservations as JSON. The client pipes them into
 * ingestProviderObservations, which enriches the graph nodes and populates the
 * market observation cache so the data survives graph rebuilds. No key or raw
 * provider response ever reaches the client. No em/en dashes.
 */

export const dynamic = "force-dynamic";

const SYMBOL_RE = /^[A-Z][A-Z0-9.\-]{0,7}$/;
const MAX_SYMBOLS = 5;
const OHLCV_TTL_MS = 6 * 60 * 60 * 1000; // daily bars barely move intraday

// Module-level singleton: the adapter's internal 60s quote cache and rate limiter
// persist across requests in a warm server process.
let adapter: FmpAdapter | null = null;
let warnedMissingKey = false;
function getAdapter(): FmpAdapter | null {
  const key = process.env.FMP_API_KEY;
  if (!key) {
    if (!warnedMissingKey) { warnedMissingKey = true; console.warn("[explorer-market] FMP_API_KEY is not set; Explorer market data disabled"); }
    return null;
  }
  if (!adapter) adapter = new FmpAdapter({ apiKey: key });
  return adapter;
}

const ohlcvCache = new Map<string, { at: number; observations: ProviderObservation[] }>();
const INTRADAY_TTL_MS = 10 * 60 * 1000;
const intradayCache = new Map<string, { at: number; observations: ProviderObservation[]; status: IntradayStatus }>();

type IntradayStatus = "ok" | "blocked" | "empty" | "error";

interface RouteError { dataset: string; symbol?: string; error: string }

/** Dev-only field coverage audit: which payload fields each dataset actually filled. */
function logFieldCoverage(observations: ProviderObservation[]): void {
  if (process.env.NODE_ENV === "production") return;
  const seen = new Set<string>();
  for (const o of observations) {
    const key = `${o.observationType}:${String(o.payload.sourceEndpoint ?? o.payload.interval ?? "")}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const fields = Object.entries(o.payload).filter(([, v]) => v !== null && v !== undefined).map(([k]) => k);
    console.log(`[explorer-market:fields] ${key || o.observationType} -> ${fields.join(",")}`);
  }
}

function parseSymbols(raw: string | null): string[] {
  return (raw ?? "")
    .split(",")
    .map(s => s.trim().toUpperCase())
    .filter(s => SYMBOL_RE.test(s))
    .slice(0, MAX_SYMBOLS);
}

export async function GET(req: Request): Promise<NextResponse> {
  const url = new URL(req.url);
  const symbols = parseSymbols(url.searchParams.get("symbols"));
  const etfs = parseSymbols(url.searchParams.get("etfs"));
  const wantOhlcv = url.searchParams.get("ohlcv") === "1";

  if (symbols.length === 0) {
    return NextResponse.json({ ok: false, reason: "no_valid_symbols", observations: [], errors: [] }, { status: 400 });
  }
  const fmp = getAdapter();
  if (!fmp) {
    return NextResponse.json({ ok: false, reason: "missing_api_key", observations: [], errors: [] });
  }

  const observations: ProviderObservation[] = [];
  const errors: RouteError[] = [];
  let quoteSource: string | null = "batch";
  let intraday: IntradayStatus | null = null;

  // Quotes: one batch call; the adapter falls back per symbol to single /quote
  // merged with /profile, then to profile alone.
  try {
    const res = await fmp.fetch({ dataset: "quote", symbols, etfs });
    observations.push(...res.observations);
    const price = res.observations.find(o => o.observationType === "market_price");
    const src = price?.payload.sourceEndpoint;
    quoteSource = typeof src === "string" && src ? src : "batch";
  } catch (err) {
    quoteSource = null;
    errors.push({ dataset: "quote", error: err instanceof Error ? err.message : String(err) });
  }

  if (wantOhlcv) {
    for (const symbol of symbols) {
      const assetType = etfs.includes(symbol) ? "ETF" : "Company";

      // Daily OHLCV. A plan without EOD access fails gracefully; quotes still ship.
      const cached = ohlcvCache.get(symbol);
      if (cached && Date.now() - cached.at < OHLCV_TTL_MS) {
        observations.push(...cached.observations);
      } else {
        try {
          const res = await fmp.fetch({ dataset: "daily", symbol, assetType });
          ohlcvCache.set(symbol, { at: Date.now(), observations: res.observations });
          observations.push(...res.observations);
        } catch (err) {
          errors.push({ dataset: "daily", symbol, error: err instanceof Error ? err.message : String(err) });
        }
      }

      // Intraday 5min bars for 1D / 1W views. 402/403 marks the plan as blocked so
      // the client can say "plan limited" instead of guessing; the chart falls back
      // to daily bars (1W) or the snapshot state (1D).
      const iCached = intradayCache.get(symbol);
      if (iCached && Date.now() - iCached.at < INTRADAY_TTL_MS) {
        observations.push(...iCached.observations);
        intraday = iCached.status;
      } else {
        try {
          const res = await fmp.fetch({ dataset: "intraday", symbol, interval: "5min", assetType });
          const status: IntradayStatus = res.observations.length > 0 ? "ok" : "empty";
          intradayCache.set(symbol, { at: Date.now(), observations: res.observations, status });
          observations.push(...res.observations);
          intraday = status;
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          intraday = /402|403/.test(msg) ? "blocked" : "error";
          intradayCache.set(symbol, { at: Date.now(), observations: [], status: intraday });
          errors.push({ dataset: "intraday", symbol, error: msg });
        }
      }
    }
  }

  logFieldCoverage(observations);
  if (process.env.NODE_ENV !== "production") {
    console.log(`[explorer-market] ${symbols.join(",")}: ${observations.length} observations, quoteSource=${quoteSource}, intraday=${intraday ?? "skipped"}${errors.length ? `, errors: ${errors.map(e => `${e.dataset}${e.symbol ? ":" + e.symbol : ""} ${e.error}`).join("; ")}` : ""}`);
  }

  return NextResponse.json({
    ok: true,
    symbols,
    observations,
    errors,
    quoteSource,
    intraday,
    fetchedAt: new Date().toISOString(),
  });
}
