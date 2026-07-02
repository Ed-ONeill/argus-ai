/**
 * lib/dataAdapters/BaseDataAdapter.ts - the shared adapter engine.
 *
 * Provides caching (TTL), rate limiting, a retry policy, and health tracking so each
 * concrete provider only implements what is provider-specific: metadata(), the raw
 * request(), and normalize(). The public fetch() orchestrates cache -> rate limit ->
 * retry -> normalize -> validate -> health, always returning normalized
 * ProviderObservations. Pure library, no UI, no em/en dashes.
 */

import { clamp01, round } from "../intelligenceUtils";
import {
  CADENCE_MAX_AGE_DAYS,
  type AdapterContext, type DataAdapter, type FetchLike, type FetchParams, type FetchResult,
  type ObservationQuality, type ObservationType, type EntityType, type ProviderHealth,
  type ProviderId, type ProviderMetadata, type ProviderObservation, type RetryPolicy,
} from "./types";

const boundFetch: FetchLike = (input, init) => fetch(input, init);

interface CacheEntry { at: number; result: FetchResult }

export interface ObservationInput {
  source:             string;
  providerConfidence: number;
  providerTimestamp:  number;
  entityType:         EntityType;
  entityId:           string;
  entityLabel?:       string;
  observationType:    ObservationType;
  payload:            Record<string, unknown>;
  entityConfidence?:  number;
  metadata?:          Record<string, unknown>;
}

export abstract class BaseDataAdapter implements DataAdapter {
  abstract readonly id: ProviderId;

  protected transport: FetchLike;
  protected now: () => number;
  protected apiKey?: string;
  protected retry: RetryPolicy;

  private cache = new Map<string, CacheEntry>();
  private stamps: number[] = [];             // request timestamps for rate limiting
  private connected = false;
  private _lastSyncAt: number | null = null;
  private _lastSyncDurationMs: number | null = null;
  private _lastError: string | null = null;
  private _observationCount = 0;
  private _failureCount = 0;
  private _consecutiveFailures = 0;

  constructor(ctx: AdapterContext = {}) {
    this.transport = ctx.transport ?? boundFetch;
    this.now = ctx.now ?? (() => Date.now());
    this.apiKey = ctx.apiKey;
    this.retry = ctx.retry ?? { retries: 2, baseMs: 200 };
  }

  /* ----- provider-specific (subclass) ----- */
  abstract metadata(): ProviderMetadata;
  abstract normalize(raw: unknown, params?: FetchParams): ProviderObservation[];
  /** Raw network call for the given params. Should throw on non-OK responses. */
  protected abstract request(params: FetchParams): Promise<unknown>;

  /* ----- lifecycle ----- */

  async connect(): Promise<boolean> {
    // Base connect is a metadata sanity check. Providers that need an API key or a
    // live ping should override. Never performs network here so it stays cheap.
    const meta = this.metadata();
    if (meta.requiresApiKey && !this.apiKey) { this.connected = false; return false; }
    this.connected = true;
    return true;
  }

  async fetch(params: FetchParams = {}): Promise<FetchResult> {
    const key = this.cacheKey(params);

    // 1. Cache (TTL from metadata).
    const cached = this.cache.get(key);
    if (cached && this.now() - cached.at < this.metadata().ttlMs) {
      return { ...cached.result, fromCache: true };
    }

    // 2. Rate limit.
    if (!this.allow()) {
      this._lastError = "rate limit exceeded";
      throw new Error(`[${this.id}] rate limit exceeded (${this.metadata().rateLimitPerMin}/min)`);
    }

    // 3. Retry + request + normalize + validate.
    const start = this.now();
    try {
      const raw = await this.withRetry(() => this.request(params));
      const observations = this.validate(this.normalize(raw, params));
      const result: FetchResult = { observations, raw, fromCache: false };
      this.cache.set(key, { at: this.now(), result });
      this.recordSuccess(this.now() - start, observations.length);
      return result;
    } catch (err) {
      this.recordFailure(err);
      throw err;
    }
  }

  /** Default validation: keep only well-formed observations. */
  validate(observations: ProviderObservation[]): ProviderObservation[] {
    return observations.filter(o =>
      !!o && typeof o.entityId === "string" && o.entityId.length > 0 &&
      typeof o.observationType === "string" && o.observationType.length > 0 &&
      Number.isFinite(o.providerTimestamp) && Number.isFinite(o.qualityScore));
  }

  health(): ProviderHealth {
    const entries = [...this.cache.values()];
    const oldest = entries.length ? Math.min(...entries.map(e => e.at)) : null;
    const limit = this.metadata().rateLimitPerMin;
    const cutoff = this.now() - 60_000;
    const active = this.stamps.filter(t => t > cutoff).length;
    return {
      id: this.id,
      state: this.stateOf(),
      lastSyncAt: this._lastSyncAt,
      lastSyncDurationMs: this._lastSyncDurationMs,
      lastError: this._lastError,
      observationCount: this._observationCount,
      failureCount: this._failureCount,
      consecutiveFailures: this._consecutiveFailures,
      cacheEntries: entries.length,
      cacheAgeMs: oldest == null ? null : this.now() - oldest,
      rateLimitRemaining: Math.max(0, limit - active),
    };
  }

  /* ----- protected helpers for subclasses ----- */

  /** Build a fully-formed, quality-graded observation from normalized fields. */
  protected buildObservation(input: ObservationInput): ProviderObservation {
    const quality = this.computeQuality(input.providerTimestamp, input.entityConfidence);
    return {
      id: `${this.id}:${input.observationType}:${input.entityId}:${input.providerTimestamp}`,
      source: input.source,
      provider: this.id,
      providerConfidence: clampScore(input.providerConfidence),
      providerTimestamp: input.providerTimestamp,
      entityType: input.entityType,
      entityId: input.entityId,
      entityLabel: input.entityLabel,
      observationType: input.observationType,
      payload: input.payload,
      qualityScore: quality.quality,
      quality,
      metadata: input.metadata ?? {},
    };
  }

  /** JSON GET helper that throws on non-OK, for subclass request() methods. */
  protected async getJson(url: string, headers: Record<string, string> = {}): Promise<unknown> {
    const res = await this.transport(url, { headers: { Accept: "application/json", ...headers } });
    if (!res.ok) throw new Error(`[${this.id}] HTTP ${res.status} for ${url}`);
    return res.json();
  }

  protected computeQuality(providerTimestamp: number, entityConfidence = 90): ObservationQuality {
    const meta = this.metadata();
    const collectedAt = this.now();
    const ageMs = Math.max(0, collectedAt - providerTimestamp);
    const maxAgeMs = CADENCE_MAX_AGE_DAYS[meta.cadence] * 86_400_000;
    const freshness = round(clamp01(1 - ageMs / maxAgeMs) * 100);
    const reliability = clampScore(meta.reliability);
    const ec = clampScore(entityConfidence);
    const quality = round(reliability * 0.4 + freshness * 0.3 + ec * 0.3);
    return { quality, freshness, providerReliability: reliability, entityConfidence: ec, collectedAt };
  }

  /* ----- internals ----- */

  protected cacheKey(params: FetchParams): string {
    return `${this.id}:${JSON.stringify(params, Object.keys(params).sort())}`;
  }

  private allow(): boolean {
    const limit = this.metadata().rateLimitPerMin;
    const cutoff = this.now() - 60_000;
    this.stamps = this.stamps.filter(t => t > cutoff);
    if (this.stamps.length >= limit) return false;
    this.stamps.push(this.now());
    return true;
  }

  private async withRetry<T>(fn: () => Promise<T>): Promise<T> {
    let lastErr: unknown = new Error("no attempt made");
    for (let attempt = 0; attempt <= this.retry.retries; attempt++) {
      try { return await fn(); }
      catch (err) {
        lastErr = err;
        if (attempt < this.retry.retries) await sleep(this.retry.baseMs * (attempt + 1));
      }
    }
    throw lastErr;
  }

  private recordSuccess(durationMs: number, count: number): void {
    this._lastSyncAt = this.now();
    this._lastSyncDurationMs = durationMs;
    this._observationCount += count;
    this._lastError = null;
    this._consecutiveFailures = 0;
    this.connected = true;
  }

  private recordFailure(err: unknown): void {
    this._failureCount += 1;
    this._consecutiveFailures += 1;
    this._lastError = err instanceof Error ? err.message : String(err);
  }

  private stateOf(): ProviderHealth["state"] {
    if (this._lastSyncAt == null && this._failureCount === 0) return "unknown";
    if (this._consecutiveFailures >= 3) return "down";
    if (this._consecutiveFailures > 0) return "degraded";
    return "healthy";
  }

  /** Test / ops hook: drop cached responses. */
  clearCache(): void { this.cache.clear(); }
}

const clampScore = (n: number): number => Math.max(0, Math.min(100, Number.isFinite(n) ? n : 0));
const sleep = (ms: number): Promise<void> => new Promise(res => setTimeout(res, ms));
