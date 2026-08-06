// platform/registry.ts — provider registry + per-domain resolver + the fetch ladder.
//
// Canonical-provider-per-domain (DX2 §2): EODHD is primary; FMP/SEC/FRED are secondary
// fallbacks. fetchDomain walks canonical → fallbacks, emits one ProviderObservation per
// attempt (feeding replay + Provider Health), and TERMINATES IN HONEST ABSENCE — never a
// fabricated value. Instantiable so the app singleton and isolated proofs/tests don't
// share mutable state.

import { absence, type DataDomain, type DomainResult } from "./domain";
import { observations, type ProviderObservation } from "./observation";
import type { DataProvider } from "./provider";

// Canonical ordering per domain (names; resolved against the registry). EODHD primary;
// FMP kept as secondary through Stage 1 (never removed until overlap is measured).
export const DOMAIN_PROVIDERS: Record<DataDomain, string[]> = {
  historical_prices: ["eodhd", "fmp"],
  intraday: ["eodhd", "fmp"],
  realtime_prices: ["eodhd", "fmp"],
  corporate_actions: ["eodhd"],
  calendar: ["eodhd", "fmp"],
  movers: ["eodhd"],
  fundamentals: ["eodhd", "sec", "fmp"],
  insider: ["eodhd", "sec"],
  etf_holdings: ["eodhd"],
  macro: ["eodhd", "fred"],
  news: ["eodhd"],
};

export class ProviderRegistry {
  private providers = new Map<string, DataProvider>();

  register(p: DataProvider): this {
    this.providers.set(p.name, p);
    return this;
  }

  /** Canonical → fallback provider chain for a domain (registered ones only). */
  resolve(domain: DataDomain): DataProvider[] {
    return (DOMAIN_PROVIDERS[domain] ?? [])
      .map((name) => this.providers.get(name))
      .filter((p): p is DataProvider => !!p && p.serves(domain));
  }

  async fetchDomain<T>(domain: DataDomain, params: Record<string, unknown> = {}): Promise<DomainResult<T>> {
    const chain = this.resolve(domain);
    if (chain.length === 0) return absence<T>(domain, "no_provider");

    const trail: ProviderObservation[] = [];
    for (let i = 0; i < chain.length; i++) {
      const provider = chain[i];
      const requestedAt = new Date().toISOString();
      const started = Date.now();
      let res;
      try {
        res = await provider.fetch<T>(domain, params);
      } catch {
        res = { data: null, quality: null, endpoint: `/${domain}`, httpStatus: null, outcome: "error" as const };
      }
      const obs = observations.record({
        provider: provider.name,
        endpoint: res.endpoint,
        domain,
        scope: typeof params.symbol === "string" ? params.symbol : undefined,
        params,                              // sink redacts key-like fields
        attemptIndex: i,
        requestedAt,
        latencyMs: Date.now() - started,
        httpStatus: res.httpStatus,
        providerVersion: provider.version,
        cacheHit: false,
        outcome: res.outcome,
        normalizedPayload: res.data,
        quality: res.quality,
      });
      trail.push(obs);

      if (res.outcome === "ok" && res.data != null) {
        return { domain, data: res.data, quality: res.quality, absent: false, reason: "ok", observations: trail };
      }
    }

    // Every provider skipped/failed → honest absence, with the full attempt trail.
    const allSkipped = trail.length > 0 && trail.every((o) => o.outcome === "skipped");
    return absence<T>(domain, allSkipped ? "gated" : "all_failed", trail);
  }
}

/** The application-wide registry (real providers register here at wiring time). */
export const registry = new ProviderRegistry();
