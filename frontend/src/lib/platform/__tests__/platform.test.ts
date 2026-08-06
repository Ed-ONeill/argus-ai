// Stage 0 platform foundation — required regressions: key secrecy, plane isolation,
// determinism, replay, Workstation reuse, and fallback-to-absence.

import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { makeQuality, freshnessFor, isLive } from "@/lib/platform/quality";
import { observations, redactParams } from "@/lib/platform/observation";
import { providerHealth } from "@/lib/platform/health";
import { ProviderRegistry } from "@/lib/platform/registry";
import { eodhdProvider } from "@/lib/platform/providers/eodhd";
import { StubProvider } from "@/lib/platform/providers/stub";
import { eodhdConfig } from "@/lib/platform/config";

const PLATFORM_DIR = path.resolve(__dirname, "..");
const SRC_DIR = path.resolve(__dirname, "../../..");

function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return e.name === "__tests__" || e.name === "node_modules" ? [] : walk(p);
    if (/\.test\.tsx?$/.test(e.name)) return [];   // production code only
    return p.endsWith(".ts") || p.endsWith(".tsx") ? [p] : [];
  });
}
function importsOf(file: string): string[] {
  const src = fs.readFileSync(file, "utf8");
  return [...src.matchAll(/from\s+["']([^"']+)["']/g)].map((m) => m[1]);
}

beforeEach(() => { observations.clear(); providerHealth.reset(); });
afterEach(() => { delete (globalThis as { window?: unknown }).window; });

// ── Determinism ────────────────────────────────────────────────────────────────
describe("determinism", () => {
  it("makeQuality / freshness are pure", () => {
    expect(freshnessFor(0)).toBe("fresh");
    expect(freshnessFor(60_000)).toBe("delayed");
    expect(freshnessFor(60 * 60_000)).toBe("stale");
    expect(makeQuality("eodhd", "2026-01-01T00:00:00.000Z", { grade: "DELAYED", delayMs: 0 }))
      .toEqual(makeQuality("eodhd", "2026-01-01T00:00:00.000Z", { grade: "DELAYED", delayMs: 0 }));
    expect(isLive(makeQuality("x", "t", { grade: "ESTIMATED" }))).toBe(false);
  });

  it("fetchDomain data is identical across runs", async () => {
    const reg = () => new ProviderRegistry().register(new StubProvider(["fundamentals"], { a: 1, b: [2, 3] }, "fmp"));
    const r1 = await reg().fetchDomain<{ a: number }>("fundamentals", { symbol: "X" });
    const r2 = await reg().fetchDomain<{ a: number }>("fundamentals", { symbol: "X" });
    expect(r1.data).toEqual(r2.data);
    expect(r1.absent).toBe(false);
  });
});

// ── Fallback to absence ─────────────────────────────────────────────────────────
describe("fallback ladder ends in honest absence", () => {
  it("EODHD skipped → fallback provider succeeds (fallback used)", async () => {
    const reg = new ProviderRegistry()
      .register(eodhdProvider)
      .register(new StubProvider(["fundamentals"], { ok: true }, "fmp"));
    const res = await reg.fetchDomain<{ ok: boolean }>("fundamentals", { symbol: "X" });
    expect(res.absent).toBe(false);
    expect(res.data).toEqual({ ok: true });
    expect(res.observations[0].provider).toBe("eodhd");
    expect(res.observations[0].outcome).toBe("skipped");
    expect(res.observations.at(-1)?.attemptIndex).toBe(1);   // fallback used
  });

  it("canonical-only domain with nothing entitled → absent (gated), never fabricated", async () => {
    const reg = new ProviderRegistry().register(eodhdProvider);
    const res = await reg.fetchDomain("movers", {});
    expect(res.absent).toBe(true);
    expect(res.data).toBeNull();
    expect(res.reason).toBe("gated");
  });

  it("no registered provider → absent (no_provider)", async () => {
    const res = await new ProviderRegistry().fetchDomain("calendar", {});
    expect(res.absent).toBe(true);
    expect(res.reason).toBe("no_provider");
  });
});

// ── Replay ──────────────────────────────────────────────────────────────────────
describe("replay", () => {
  it("every attempt is recorded and reconstructs the result", async () => {
    const reg = new ProviderRegistry().register(new StubProvider(["fundamentals"], { eps: 1.23 }, "fmp"));
    const res = await reg.fetchDomain<{ eps: number }>("fundamentals", { symbol: "AAPL" });
    const replayed = observations.replay((o) => o.domain === "fundamentals" && o.scope === "AAPL");
    expect(replayed.length).toBe(1);
    expect(replayed[0].normalizedPayload).toEqual(res.data);
    expect(replayed[0].provider).toBe("fmp");
    expect(replayed[0].endpoint).toBe("/stub/fundamentals");
  });
});

// ── Key secrecy ──────────────────────────────────────────────────────────────────
describe("key secrecy", () => {
  it("params are key-redacted in observations", () => {
    expect(redactParams({ symbol: "AAPL", api_token: "SECRET", apiKey: "S2" }))
      .toEqual({ symbol: "AAPL", api_token: "[redacted]", apiKey: "[redacted]" });
  });

  it("the key never lands in a recorded observation", async () => {
    process.env.EODHD_API_KEY = "SUPER_SECRET_TOKEN";
    const reg = new ProviderRegistry()
      .register(new StubProvider(["fundamentals"], { ok: true }, "fmp"));
    await reg.fetchDomain("fundamentals", { symbol: "X", api_token: process.env.EODHD_API_KEY });
    const dump = JSON.stringify(observations.recent(10));
    expect(dump).not.toContain("SUPER_SECRET_TOKEN");
  });

  it("config is server-only (throws in a browser context)", () => {
    (globalThis as { window?: unknown }).window = {};
    expect(() => eodhdConfig()).toThrow(/server-only/);
  });

  it("only config.ts reads the EODHD key, and via a non-public env var", () => {
    const readers = walk(PLATFORM_DIR).filter((f) => /EODHD_API_KEY/.test(fs.readFileSync(f, "utf8")));
    expect(readers.map((f) => path.basename(f))).toEqual(["config.ts"]);
    // Reads a non-public env var only — never a client-exposed NEXT_PUBLIC_ key.
    expect(fs.readFileSync(path.join(PLATFORM_DIR, "config.ts"), "utf8"))
      .not.toMatch(/process\.env\.NEXT_PUBLIC_/);
  });
});

// ── Plane isolation + Workstation reuse ─────────────────────────────────────────
describe("plane isolation & Workstation reuse", () => {
  const FORBIDDEN = /@\/components|@\/hooks|@\/lib\/(livingBrief|intelligenceScore|marketSession|feeds|materiality)|@\/app\/api\/feed/;

  it("platform layer imports nothing from the Intelligence Plane or any product UI", () => {
    for (const file of walk(PLATFORM_DIR)) {
      for (const imp of importsOf(file)) {
        expect(imp, `${path.basename(file)} imports ${imp}`).not.toMatch(FORBIDDEN);
        // Product-agnostic: any @/ import must stay within the platform package.
        if (imp.startsWith("@/")) expect(imp.startsWith("@/lib/platform")).toBe(true);
      }
    }
  });

  it("Provider Health is imported only by platform code and the proof route (never intelligence)", () => {
    const importers = walk(SRC_DIR).filter((f) =>
      /from\s+["'][^"']*platform\/health["']/.test(fs.readFileSync(f, "utf8")));
    for (const f of importers) {
      const rel = path.relative(SRC_DIR, f).replace(/\\/g, "/");
      expect(rel === "lib/platform/health.ts"
        || rel.startsWith("lib/platform/")
        || rel === "app/api/platform/proof/route.ts").toBe(true);
    }
  });
});

// ── Provider Health telemetry ───────────────────────────────────────────────────
describe("provider health", () => {
  it("accumulates real stats; skipped attempts do not distort availability", async () => {
    const reg = new ProviderRegistry()
      .register(eodhdProvider)
      .register(new StubProvider(["fundamentals"], { ok: true }, "fmp"));
    await reg.fetchDomain("fundamentals", { symbol: "X" });
    expect(providerHealth.get("fmp").calls).toBe(1);
    expect(providerHealth.get("fmp").successRate).toBe(1);
    expect(providerHealth.get("fmp").fallbacksUsed).toBe(1);   // it was the fallback
    expect(providerHealth.get("eodhd").calls).toBe(0);         // skipped ≠ a live call
  });
});
