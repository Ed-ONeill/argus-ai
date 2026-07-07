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

interface RouteError { dataset: string; symbol?: string; error: string }

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

  // Quotes: one batch call (adapter falls back to per-symbol profiles on 402/403).
  try {
    const res = await fmp.fetch({ dataset: "quote", symbols, etfs });
    observations.push(...res.observations);
  } catch (err) {
    errors.push({ dataset: "quote", error: err instanceof Error ? err.message : String(err) });
  }

  // Daily OHLCV per symbol, when requested. A plan without EOD access fails here
  // gracefully: the quote observations above still ship.
  if (wantOhlcv) {
    for (const symbol of symbols) {
      const cached = ohlcvCache.get(symbol);
      if (cached && Date.now() - cached.at < OHLCV_TTL_MS) {
        observations.push(...cached.observations);
        continue;
      }
      try {
        const res = await fmp.fetch({ dataset: "daily", symbol, assetType: etfs.includes(symbol) ? "ETF" : "Company" });
        ohlcvCache.set(symbol, { at: Date.now(), observations: res.observations });
        observations.push(...res.observations);
      } catch (err) {
        errors.push({ dataset: "daily", symbol, error: err instanceof Error ? err.message : String(err) });
      }
    }
  }

  if (process.env.NODE_ENV !== "production") {
    console.log(`[explorer-market] ${symbols.join(",")}: ${observations.length} observations (${errors.length} errors${errors.length ? ": " + errors.map(e => `${e.dataset}${e.symbol ? ":" + e.symbol : ""} ${e.error}`).join("; ") : ""})`);
  }

  return NextResponse.json({
    ok: true,
    symbols,
    observations,
    errors,
    fetchedAt: new Date().toISOString(),
  });
}
