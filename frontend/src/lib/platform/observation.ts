// platform/observation.ts — DX3.1 Refinement 4: the universal ProviderObservation.
//
// EVERY provider response (EODHD, FMP, FRED, SEC) normalizes into one of these — the
// platform's Raw-plane record and the foundation for replay / explainability /
// provider comparison / performance metrics. A ProviderObservation is a FACT ABOUT A
// FETCH; it never authors intelligence (Law of Authored Intelligence). It also never
// stores the API key — params are redacted at record time.

import type { DataQuality } from "./quality";

export type ProviderOutcome = "ok" | "empty" | "error" | "timeout" | "skipped";

export interface ProviderObservation<T = unknown> {
  provider: string;          // "eodhd" | "fmp" | ...
  endpoint: string;          // "/eod/{sym}" — never contains the key
  domain: string;
  scope?: string;            // symbol | exchange | window
  params: Record<string, unknown>;   // KEY-REDACTED
  attemptIndex: number;      // 0 = canonical provider; >0 = a fallback was used
  requestedAt: string;       // ISO
  latencyMs: number;
  httpStatus: number | null;
  providerVersion: string;
  cacheHit: boolean;
  outcome: ProviderOutcome;
  normalizedPayload: T | null;   // the typed Reference result (replayable)
  quality: DataQuality | null;
}

// Fields that must never be persisted into an observation (defense in depth).
const REDACT_KEYS = /^(api[_-]?token|api[_-]?key|token|key|secret|password|authorization)$/i;

export function redactParams(params: Record<string, unknown> | undefined): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(params ?? {})) {
    out[k] = REDACT_KEYS.test(k) ? "[redacted]" : v;
  }
  return out;
}

/** Bounded in-memory sink: the replay ring + a subscriber fan-out (Provider Health). */
class ObservationSink {
  private ring: ProviderObservation[] = [];
  private subs = new Set<(o: ProviderObservation) => void>();
  readonly max = 500;

  record(o: ProviderObservation): ProviderObservation {
    const safe = { ...o, params: redactParams(o.params) };
    this.ring.push(safe);
    if (this.ring.length > this.max) this.ring.shift();
    for (const fn of this.subs) fn(safe);
    return safe;
  }

  recent(n = 50): ProviderObservation[] {
    return this.ring.slice(-n);
  }

  /** Replay: reconstruct exactly what a provider returned, for explainability. */
  replay(predicate: (o: ProviderObservation) => boolean): ProviderObservation[] {
    return this.ring.filter(predicate);
  }

  subscribe(fn: (o: ProviderObservation) => void): () => void {
    this.subs.add(fn);
    return () => this.subs.delete(fn);
  }

  clear(): void {
    this.ring = [];
  }
}

export const observations = new ObservationSink();
