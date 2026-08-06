// platform/providers/stub.ts — a deterministic, NO-NETWORK provider used only by the
// proof route and tests to exercise the pipeline (resolver → observation → DataQuality →
// health → result / absence) without calling any real or plan-gated endpoint. Never
// registered in production wiring.

import type { DataDomain } from "../domain";
import type { DataProvider, ProviderFetchResult } from "../provider";
import { makeQuality } from "../quality";

const FIXED_UPDATED_AT = "2026-08-01T00:00:00.000Z";

export class StubProvider implements DataProvider {
  readonly name: string;
  readonly version = "stub@1.0.0";
  private readonly domains: Set<DataDomain>;
  private readonly payload: unknown;

  constructor(domains: DataDomain[], payload: unknown, name = "stub") {
    this.name = name;
    this.domains = new Set(domains);
    this.payload = payload;
  }

  serves(domain: DataDomain): boolean {
    return this.domains.has(domain);
  }

  async fetch<T>(domain: DataDomain): Promise<ProviderFetchResult<T>> {
    return {
      data: this.payload as T,
      quality: makeQuality(this.name, FIXED_UPDATED_AT, { grade: "DELAYED", delayMs: 0 }),
      endpoint: `/stub/${domain}`,
      httpStatus: 200,
      outcome: "ok",
    };
  }
}
