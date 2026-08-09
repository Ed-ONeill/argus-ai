// app/api/reference/prices/route.ts — Stage 1A: canonical historical prices (server).
//
// Holds the EODHD key server-side; the client never sees it. Serves through the platform
// resolver (EODHD /eod), with a route-level cache + stale-fallback (the proven pattern):
// on provider failure, last-known data is served LABELED stale; if there is none, the
// response is honest absence — never a fabricated series. Observations/health stay
// internal and are never returned.
//
// COST GUARD (H5): the underlying EODHD key is METERED/paid. A cache HIT is free and served
// ungated. A cache MISS may spend the paid quota, so it requires an authenticated user AND is
// per-user rate limited — this closes the open quota/cost-abuse exposure without slowing the
// common cache-hit path. (This route is excluded from the auth middleware, so the gate lives here.)

import { NextResponse } from "next/server";
import { ensureProvidersWired } from "@/lib/platform/wiring";
import { createClient } from "@/lib/supabase/server";
import type { PriceSeries } from "@/lib/platform/types/prices";

export const dynamic = "force-dynamic";

const TTL_MS = 6 * 60 * 60 * 1000;        // EOD data — cache 6h
const STALE_TTL_MS = 24 * 60 * 60 * 1000; // serve stale up to 24h on failure

interface Entry { series: PriceSeries; storedAt: number }
const cache = new Map<string, Entry>();

// Per-user sliding-window limit on the PAID (cache-miss) path. Generous enough for a normal first
// page load (a dozen-plus symbols, then 6h-cached), tight enough to stop a loop from burning the
// metered key. In-memory per instance (resets on deploy) — a cost backstop layered on the auth gate.
const RL_WINDOW_MS = 60_000;
const RL_MAX = 80;
const hits = new Map<string, number[]>();
function rateLimited(userId: string, now: number): boolean {
  const recent = (hits.get(userId) ?? []).filter((t) => now - t < RL_WINDOW_MS);
  recent.push(now);
  hits.set(userId, recent);
  return recent.length > RL_MAX;
}

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

  // Fresh cache hit — free, served without gating.
  if (cached && now - cached.storedAt < TTL_MS) {
    return NextResponse.json({ series: cached.series, quality: cached.series.quality, absent: false, cacheHit: true });
  }

  // Cache miss => this request may spend the metered EODHD key. Require a real user, then rate-limit.
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ series: null, absent: true, reason: "unauthenticated" }, { status: 401 });
  }
  if (rateLimited(user.id, now)) {
    return NextResponse.json({ series: null, absent: true, reason: "rate_limited" }, { status: 429 });
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
