// platform/health.ts — DX3.1 Refinement B: Provider Health.
//
// Internal operational telemetry only. Continuously measures availability, latency,
// fallback frequency, timeout rate, and success rate per provider by consuming the
// ProviderObservation stream. This NEVER affects intelligence and is NEVER shown to
// users — it exists so provider keep/replace decisions rest on production evidence.

import { observations, type ProviderObservation } from "./observation";

export interface ProviderHealth {
  provider: string;
  calls: number;
  successRate: number;      // ok / calls
  availabilityPct: number;  // (calls - error - timeout) / calls * 100
  avgLatencyMs: number;
  p95LatencyMs: number;
  timeoutRate: number;
  fallbacksUsed: number;    // attempts where attemptIndex > 0
  lastErrorAt: string | null;
}

interface Stats {
  calls: number;
  ok: number;
  error: number;
  timeout: number;
  fallbacks: number;
  latencies: number[];      // bounded window
  lastErrorAt: string | null;
}

const LAT_WINDOW = 200;

function p95(sorted: number[]): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.floor(0.95 * (sorted.length - 1)));
  return sorted[idx];
}

class ProviderHealthService {
  private stats = new Map<string, Stats>();

  constructor() {
    // Health is a pure downstream consumer of the observation stream.
    observations.subscribe((o) => this.ingest(o));
  }

  private ingest(o: ProviderObservation): void {
    let s = this.stats.get(o.provider);
    if (!s) {
      s = { calls: 0, ok: 0, error: 0, timeout: 0, fallbacks: 0, latencies: [], lastErrorAt: null };
      this.stats.set(o.provider, s);
    }
    // "skipped" is not a live call attempt (e.g. Stage 0 entitlement guard) — don't
    // let it distort availability.
    if (o.outcome === "skipped") return;
    s.calls += 1;
    if (o.outcome === "ok") s.ok += 1;
    if (o.outcome === "error") { s.error += 1; s.lastErrorAt = o.requestedAt; }
    if (o.outcome === "timeout") { s.timeout += 1; s.lastErrorAt = o.requestedAt; }
    if (o.attemptIndex > 0) s.fallbacks += 1;
    if (Number.isFinite(o.latencyMs)) {
      s.latencies.push(o.latencyMs);
      if (s.latencies.length > LAT_WINDOW) s.latencies.shift();
    }
  }

  get(provider: string): ProviderHealth {
    const s = this.stats.get(provider);
    if (!s || s.calls === 0) {
      return { provider, calls: 0, successRate: 0, availabilityPct: 0, avgLatencyMs: 0,
        p95LatencyMs: 0, timeoutRate: 0, fallbacksUsed: 0, lastErrorAt: null };
    }
    const sorted = [...s.latencies].sort((a, b) => a - b);
    const avg = s.latencies.reduce((x, y) => x + y, 0) / (s.latencies.length || 1);
    return {
      provider,
      calls: s.calls,
      successRate: s.ok / s.calls,
      availabilityPct: ((s.calls - s.error - s.timeout) / s.calls) * 100,
      avgLatencyMs: Math.round(avg),
      p95LatencyMs: Math.round(p95(sorted)),
      timeoutRate: s.timeout / s.calls,
      fallbacksUsed: s.fallbacks,
      lastErrorAt: s.lastErrorAt,
    };
  }

  all(): ProviderHealth[] {
    return [...this.stats.keys()].map((p) => this.get(p));
  }

  reset(): void {
    this.stats.clear();
  }
}

export const providerHealth = new ProviderHealthService();
