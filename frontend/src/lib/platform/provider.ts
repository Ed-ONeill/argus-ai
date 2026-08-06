// platform/provider.ts — the DataProvider interface every provider adapter implements
// (EODHD, FMP, FRED, SEC). Preserves the existing provider-abstraction idea: a provider
// declares the domains it serves and returns a normalized ProviderFetchResult. Providers
// return FACTS only — they never author intelligence (Law of Authored Intelligence).

import type { DataDomain } from "./domain";
import type { DataQuality } from "./quality";
import type { ProviderOutcome } from "./observation";

export interface ProviderFetchResult<T> {
  data: T | null;
  quality: DataQuality | null;
  endpoint: string;              // never contains the key
  httpStatus: number | null;
  outcome: ProviderOutcome;      // ok | empty | error | timeout | skipped
}

export interface DataProvider {
  readonly name: string;
  readonly version: string;
  serves(domain: DataDomain): boolean;
  fetch<T>(domain: DataDomain, params: Record<string, unknown>): Promise<ProviderFetchResult<T>>;
}

export function skipped<T>(endpoint: string): ProviderFetchResult<T> {
  return { data: null, quality: null, endpoint, httpStatus: null, outcome: "skipped" };
}
