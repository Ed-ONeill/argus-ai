// Stage 1A — historical prices: normalization, adjusted OHLCV, quality, replay,
// fallback-to-absence, and key secrecy. Uses a mocked fetch — no live EODHD call.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { normalizeEodhdEod } from "@/lib/platform/normalize/eodhdPrices";
import { observations } from "@/lib/platform/observation";
import { providerHealth } from "@/lib/platform/health";
import { ProviderRegistry } from "@/lib/platform/registry";
import { eodhdProvider } from "@/lib/platform/providers/eodhd";
import type { PriceSeries } from "@/lib/platform/types/prices";

// A fully synthetic stand-in — shares nothing with any real credential. The key-secrecy
// assertions only need a distinct string that must never leak into endpoints/observations.
const TOKEN = "test-only-fake-token.DO-NOT-USE";
const NOW = "2026-08-01T00:00:00.000Z";

const RAW = [
  { date: "2026-07-29", open: 104, high: 106, low: 103, close: 105, adjusted_close: 52.5, volume: 1100 },
  { date: "2026-07-28", open: 100, high: 105, low: 99, close: 104, adjusted_close: 52.0, volume: 1000 },
];

beforeEach(() => {
  observations.clear();
  providerHealth.reset();
  process.env.EODHD_API_KEY = TOKEN;
});
afterEach(() => {
  vi.unstubAllGlobals();
});

// ── Normalization / adjusted OHLCV ──────────────────────────────────────────────
describe("normalizeEodhdEod", () => {
  it("maps rows, sorts oldest→newest, marks adjusted", () => {
    const s = normalizeEodhdEod(RAW, "AAPL", "US", NOW)!;
    expect(s.symbol).toBe("AAPL");
    expect(s.adjusted).toBe(true);
    expect(s.points.map((p) => p.t)).toEqual(["2026-07-28", "2026-07-29"]); // sorted
    expect(s.points[1]).toMatchObject({ o: 104, h: 106, l: 103, c: 105, adjClose: 52.5, v: 1100 });
    expect(s.asOf).toBe("2026-07-29T00:00:00.000Z");
  });

  it("adjusted_close is preserved; falls back to close when absent", () => {
    const s = normalizeEodhdEod(
      [{ date: "2026-07-28", open: 10, high: 11, low: 9, close: 10 }], "X", "US", NOW)!;
    expect(s.points[0].adjClose).toBe(10);   // no adjusted_close → close
  });

  it("empty/malformed → null (honest absence upstream)", () => {
    expect(normalizeEodhdEod([], "X", "US", NOW)).toBeNull();
    expect(normalizeEodhdEod("nope", "X", "US", NOW)).toBeNull();
    expect(normalizeEodhdEod([{ foo: 1 }], "X", "US", NOW)).toBeNull();
  });

  it("attaches DELAYED DataQuality with a real delay", () => {
    const s = normalizeEodhdEod(RAW, "AAPL", "US", NOW)!;
    expect(s.quality.source).toBe("eodhd");
    expect(s.quality.grade).toBe("DELAYED");
    expect(s.quality.delayMs).toBeGreaterThan(0);
  });
});

// ── Adapter through the resolver: ok, replay, fallback, key secrecy ─────────────
function mockFetch(response: { ok: boolean; status: number; body: unknown }) {
  vi.stubGlobal("fetch", vi.fn(async () => ({
    ok: response.ok, status: response.status, json: async () => response.body,
  })));
}

describe("EODHD historical_prices via the resolver", () => {
  it("returns a normalized series and records a replayable observation", async () => {
    mockFetch({ ok: true, status: 200, body: RAW });
    const reg = new ProviderRegistry().register(eodhdProvider);
    const res = await reg.fetchDomain<PriceSeries>("historical_prices", { symbol: "aapl" });
    expect(res.absent).toBe(false);
    expect(res.data?.symbol).toBe("AAPL");
    expect(res.data?.points.length).toBe(2);
    expect(res.quality?.grade).toBe("DELAYED");

    const replayed = observations.replay((o) => o.domain === "historical_prices");
    expect(replayed.length).toBe(1);
    expect(replayed[0].provider).toBe("eodhd");
    expect((replayed[0].normalizedPayload as PriceSeries).symbol).toBe("AAPL");
    expect(providerHealth.get("eodhd").successRate).toBe(1);
  });

  it("provider failure (402) → honest absence, no fabricated series", async () => {
    mockFetch({ ok: false, status: 402, body: {} });
    const reg = new ProviderRegistry().register(eodhdProvider);
    const res = await reg.fetchDomain("historical_prices", { symbol: "AAPL" });
    expect(res.absent).toBe(true);
    expect(res.data).toBeNull();
    expect(observations.replay((o) => o.domain === "historical_prices")[0].httpStatus).toBe(402);
  });

  it("KEY SECRECY: the token never appears in the endpoint, observation, or result", async () => {
    mockFetch({ ok: true, status: 200, body: RAW });
    const reg = new ProviderRegistry().register(eodhdProvider);
    const res = await reg.fetchDomain<PriceSeries>("historical_prices", { symbol: "AAPL" });
    const obs = observations.replay((o) => o.domain === "historical_prices")[0];
    expect(obs.endpoint).toBe("/eod/AAPL.US");          // token-free
    expect(JSON.stringify(obs)).not.toContain(TOKEN);
    expect(JSON.stringify(res)).not.toContain(TOKEN);
  });

  it("an unentitled domain is never called (skipped → absence)", async () => {
    const called = vi.fn(async () => ({ ok: true, status: 200, json: async () => RAW }));
    vi.stubGlobal("fetch", called);
    const reg = new ProviderRegistry().register(eodhdProvider);
    const res = await reg.fetchDomain("movers", {});   // not entitled on this plan
    expect(res.absent).toBe(true);
    expect(called).not.toHaveBeenCalled();             // no network for unentitled domains
  });
});
