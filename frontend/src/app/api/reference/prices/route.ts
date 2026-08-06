// app/api/reference/prices/route.ts — Stage 1A: canonical historical prices (server).
//
// Holds the EODHD key server-side; the client never sees it. Serves through the platform
// resolver (EODHD /eod), with a route-level cache + stale-fallback (the proven pattern):
// on provider failure, last-known data is served LABELED stale; if there is none, the
// response is honest absence — never a fabricated series. Observations/health stay
// internal and are never returned.

import { NextResponse } from "next/server";
import { ensureProvidersWired } from "@/lib/platform/wiring";
import type { PriceSeries } from "@/lib/platform/types/prices";

export const dynamic = "force-dynamic";

const TTL_MS = 6 * 60 * 60 * 1000;        // EOD data — cache 6h
const STALE_TTL_MS = 24 * 60 * 60 * 1000; // serve stale up to 24h on failure

interface Entry { series: PriceSeries; storedAt: number }
const cache = new Map<string, Entry>();

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const symbol = (searchParams.get("symbol") ?? "").trim().toUpperCase();
  const exchange = (searchParams.get("exchange") ?? "US").trim().toUpperCase();
  const from = searchParams.get("from") ?? undefined;
  const to = searchParams.get("to") ?? undefined;

  if (!symbol) {
    return NextResponse.json({ series: null, absent: true, reason: "no_symbol" }, { status: 400 });
  }

  const key = `${symbol}.${exchange}:${from ?? ""}:${to ?? ""}`;
  const now = Date.now();
  const cached = cache.get(key);

  // Fresh cache hit.
  if (cached && now - cached.storedAt < TTL_MS) {
    return NextResponse.json({ series: cached.series, quality: cached.series.quality, absent: false, cacheHit: true });
  }

  const registry = ensureProvidersWired();
  const result = await registry.fetchDomain<PriceSeries>("historical_prices", { symbol, exchange, from, to });

  if (!result.absent && result.data) {
    cache.set(key, { series: result.data, storedAt: now });
    return NextResponse.json({ series: result.data, quality: result.quality, absent: false });
  }

  // Provider failed — serve stale (LABELED) if we have a recent copy; else honest absence.
  if (cached && now - cached.storedAt < STALE_TTL_MS) {
    const stale: PriceSeries = { ...cached.series, quality: { ...cached.series.quality, freshness: "stale", grade: "STALE" } };
    return NextResponse.json({ series: stale, quality: stale.quality, absent: false, stale: true });
  }

  return NextResponse.json({ series: null, quality: null, absent: true, reason: result.reason });
}
