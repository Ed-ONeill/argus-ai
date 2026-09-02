/**
 * RC2-CC — a C1 failure must not be shared-cached for an hour.
 *
 * `/api/credit-spread` has a single return path, so EVERY response left with the
 * same header:
 *
 *   Cache-Control: public, s-maxage=3600, stale-while-revalidate=1800
 *
 * Correct for a measured T+1 daily series; wrong for a failure. `public` +
 * `s-maxage=3600` makes an `unavailable` payload shared-cacheable for 60
 * minutes, and `stale-while-revalidate=1800` permits a further 30 while
 * revalidating — so one transient FRED blip can be served back long after FRED
 * recovered. That matches the signature seen across three recorded occurrences:
 * `unavailable` stable over many minutes, then autonomous recovery with no
 * deploy.
 *
 * DISTINCT from `next: { revalidate: 3600 }` on the outbound fetch, which is
 * Next's Data Cache keyed on the FRED request and stores only successful
 * responses. Only the response header changed; the fetch is untouched.
 *
 * `stale` deliberately keeps the shared policy — it is a SUCCESSFUL measurement
 * carrying a real `asOf` and business-day age. `unparseable` joins `unavailable`
 * because it means FRED served something unreadable.
 *
 * These tests do NOT claim any CDN honours the header. They prove Argus no
 * longer instructs intermediaries to cache the failure. The FRED root cause
 * remains unproven and blocked on Railway log access.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { creditStateFromCsv, FRED_CSV_URL, FRED_SERIES_ID } from "../creditSpread";

const SHARED = "public, s-maxage=3600, stale-while-revalidate=1800";
const NOSTORE = "no-store";

/** A CSV FRED would serve: two observations, freshest T+1. */
function csv(rows: [string, string][]): string {
  return ["observation_date,BAMLH0A0HYM2", ...rows.map(([d, v]) => `${d},${v}`)].join("\n");
}

const businessDaysAgo = (n: number): string => {
  const d = new Date();
  let left = n;
  while (left > 0) {
    d.setUTCDate(d.getUTCDate() - 1);
    const day = d.getUTCDay();
    if (day !== 0 && day !== 6) left--;
  }
  return d.toISOString().slice(0, 10);
};

/** Load the route with a stubbed global fetch. */
async function callRoute(impl: () => Promise<Response> | Response) {
  vi.stubGlobal("fetch", vi.fn(impl));
  vi.resetModules();
  const mod = await import("../../app/api/credit-spread/route");
  const res = await mod.GET();
  return {
    status: res.status,
    cacheControl: res.headers.get("cache-control"),
    body: await res.json() as {
      credit: Record<string, unknown>;
      meta: Record<string, unknown>;
    },
    fetchMock: globalThis.fetch as unknown as ReturnType<typeof vi.fn>,
  };
}

const okCsv = (text: string) =>
  new Response(text, { status: 200, headers: { "content-type": "text/csv" } });

beforeEach(() => vi.unstubAllGlobals());
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

// ── The header matrix, all four response classes ────────────────────────────

describe("cache policy by response class", () => {
  it("measured -> shared cache (unchanged)", async () => {
    const r = await callRoute(() => okCsv(csv([
      [businessDaysAgo(2), "3.10"], [businessDaysAgo(1), "3.13"],
    ])));
    expect(r.body.credit.measured).toBe(true);
    expect(r.cacheControl).toBe(SHARED);
  });

  it("stale -> shared cache (unchanged, deliberately)", async () => {
    // A real measurement, just older than the five-business-day tolerance.
    const r = await callRoute(() => okCsv(csv([
      [businessDaysAgo(21), "3.10"], [businessDaysAgo(20), "3.13"],
    ])));
    expect(r.body.credit.measured).toBe(false);
    expect(r.body.credit.reason).toBe("stale");
    expect(r.cacheControl).toBe(SHARED);
  });

  it("unavailable (thrown) -> no-store", async () => {
    const r = await callRoute(() => { throw new Error("network unreachable"); });
    expect(r.body.credit).toEqual({ measured: false, reason: "unavailable" });
    expect(r.cacheControl).toBe(NOSTORE);
  });

  it("unavailable (non-ok HTTP) -> no-store", async () => {
    const r = await callRoute(() => new Response("", { status: 503 }));
    expect(r.body.credit.reason).toBe("unavailable");
    expect(r.cacheControl).toBe(NOSTORE);
  });

  it("unavailable (abort/timeout) -> no-store", async () => {
    const r = await callRoute(() => {
      const e = new Error("The operation was aborted");
      e.name = "AbortError";
      throw e;
    });
    expect(r.body.credit.reason).toBe("unavailable");
    expect(r.cacheControl).toBe(NOSTORE);
  });

  it("unparseable -> no-store", async () => {
    const r = await callRoute(() => okCsv("observation_date,BAMLH0A0HYM2\n"));
    expect(r.body.credit.reason).toBe("unparseable");
    expect(r.cacheControl).toBe(NOSTORE);
  });

  it("a failure never carries a shared-cache directive", async () => {
    for (const impl of [
      () => { throw new Error("boom"); },
      () => new Response("", { status: 500 }),
      () => okCsv("observation_date,BAMLH0A0HYM2\n"),
    ]) {
      const r = await callRoute(impl);
      expect(r.cacheControl).not.toContain("s-maxage");
      expect(r.cacheControl).not.toContain("stale-while-revalidate");
      expect(r.cacheControl).not.toContain("public");
    }
  });
});

// ── Payload is untouched in every class ─────────────────────────────────────

describe("response payload is unchanged", () => {
  it("measured values, asOf, age, direction and changeBp are unchanged", async () => {
    const prior = businessDaysAgo(2), latest = businessDaysAgo(1);
    const text = csv([[prior, "3.10"], [latest, "3.13"]]);
    const r = await callRoute(() => okCsv(text));
    // The route must return exactly what the pure parser produced.
    expect(r.body.credit).toEqual(creditStateFromCsv(text));
    expect(r.body.credit.asOf).toBe(latest);
    expect(r.body.credit.priorAsOf).toBe(prior);
    expect(r.body.credit.changeBp).toBe(3);
    expect(r.body.credit.direction).toBe("widening");
    expect(r.body.credit.businessDaysStale).toBe(1);
  });

  it("stale payload keeps its honest disclosure fields", async () => {
    const text = csv([[businessDaysAgo(21), "3.10"], [businessDaysAgo(20), "3.13"]]);
    const r = await callRoute(() => okCsv(text));
    expect(r.body.credit).toEqual(creditStateFromCsv(text));
    expect(r.body.credit.asOf).toBeTruthy();
    expect(typeof r.body.credit.businessDaysStale).toBe("number");
  });

  it("failure payloads are the same shape as before", async () => {
    const thrown = await callRoute(() => { throw new Error("x"); });
    expect(thrown.body.credit).toEqual({ measured: false, reason: "unavailable" });
    const bad = await callRoute(() => okCsv("observation_date,BAMLH0A0HYM2\n"));
    expect(bad.body.credit).toEqual({ measured: false, reason: "unparseable" });
  });

  it("meta is unchanged in every class", async () => {
    const meta = { seriesId: FRED_SERIES_ID, label: "US HY OAS", cadence: "daily-t+1" };
    for (const impl of [
      () => okCsv(csv([[businessDaysAgo(2), "3.10"], [businessDaysAgo(1), "3.13"]])),
      () => { throw new Error("x"); },
      () => okCsv("observation_date,BAMLH0A0HYM2\n"),
    ]) {
      expect((await callRoute(impl)).body.meta).toEqual(meta);
    }
  });

  it("HTTP status is 200 for every class, as before", async () => {
    for (const impl of [
      () => okCsv(csv([[businessDaysAgo(2), "3.10"], [businessDaysAgo(1), "3.13"]])),
      () => { throw new Error("x"); },
      () => new Response("", { status: 503 }),
    ]) {
      expect((await callRoute(impl)).status).toBe(200);
    }
  });
});

// ── The outbound request is untouched ───────────────────────────────────────

describe("the FRED request is unchanged", () => {
  it("same URL, User-Agent, revalidate and abort signal", async () => {
    const r = await callRoute(() => okCsv(csv([
      [businessDaysAgo(2), "3.10"], [businessDaysAgo(1), "3.13"],
    ])));
    const [url, init] = r.fetchMock.mock.calls[0] as [string, RequestInit & { next?: unknown }];
    expect(url).toBe(FRED_CSV_URL);
    expect((init.headers as Record<string, string>)["User-Agent"]).toBe("Argus-AI/1.0");
    expect(init.next).toEqual({ revalidate: 3600 });
    expect(init.signal).toBeTruthy();
  });

  it("the 8s timeout constant is unchanged in source", async () => {
    const { readFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    const src = readFileSync(
      resolve(__dirname, "../../app/api/credit-spread/route.ts"), "utf8");
    expect(src).toContain("const FETCH_TIMEOUT_MS = 8_000;");
    expect(src).toContain("next: { revalidate: 3600 }");
  });
});

// ── Reproduction: the failure is no longer pinned by our own policy ─────────

describe("a failure does not pin itself downstream", () => {
  it("first call fails and is non-cacheable; the route is re-entered on the next call", async () => {
    // Proves only that Argus stops instructing intermediaries to keep the
    // failure — NOT that any particular CDN honours the header.
    let calls = 0;
    const impl = () => {
      calls += 1;
      if (calls === 1) throw new Error("transient FRED failure");
      return okCsv(csv([[businessDaysAgo(2), "3.10"], [businessDaysAgo(1), "3.13"]]));
    };
    const first = await callRoute(impl);
    expect(first.body.credit.reason).toBe("unavailable");
    expect(first.cacheControl).toBe(NOSTORE);

    const second = await callRoute(impl);
    expect(second.body.credit.measured).toBe(true);
    expect(second.cacheControl).toBe(SHARED);
    expect(calls).toBe(2);           // the route really was re-entered
  });
});
