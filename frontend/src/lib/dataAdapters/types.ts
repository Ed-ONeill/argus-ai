/**
 * lib/dataAdapters/types.ts - the normalized contract every external data provider
 * conforms to before entering Argus.
 *
 * No engine should know whether a datum came from SEC, FRED, Financial Modeling Prep,
 * Polygon, Finnhub, FactSet, or Bloomberg. Every provider normalizes into the same
 * ProviderObservation shape with an attached quality layer, so downstream engines
 * (Evidence, Graph, Inference) can treat all sources uniformly. Pure types plus a
 * couple of value constants. No UI, no React, no em/en dashes.
 */

export type ProviderId =
  | "sec" | "fred" | "fmp" | "finnhub" | "polygon" | "intrinio"
  | "factset" | "capitaliq" | "bloomberg"
  | (string & {});

export type EntityType =
  | "Company" | "Macro" | "Economic" | "Institution" | "Person" | "Sector"
  | (string & {});

export type ObservationType =
  | "company_profile" | "financials" | "insider_transaction" | "institutional_holding"
  | "interest_rate" | "yield_curve" | "inflation" | "employment" | "gdp"
  | "credit_spread" | "macro_series"
  | (string & {});

export type Cadence = "realtime" | "daily" | "weekly" | "monthly" | "quarterly" | "annual" | "event";

export type CostTier = "free" | "freemium" | "paid";

/** Quality layer attached to every observation. Feeds the Evidence Engine later. */
export interface ObservationQuality {
  quality:             number;   // 0..100 overall grade
  freshness:           number;   // 0..100 from age vs the provider cadence
  providerReliability: number;   // 0..100 base reliability of the provider
  entityConfidence:    number;   // 0..100 how sure we mapped the right entity
  collectedAt:         number;   // epoch ms the observation was collected
}

/** The one internal format. `payload` holds the normalized, provider-agnostic datum. */
export interface ProviderObservation {
  id:                 string;          // stable dedupe id
  source:             string;          // upstream label, e.g. "SEC EDGAR"
  provider:           ProviderId;
  providerConfidence: number;          // 0..100 provider confidence in this datum
  providerTimestamp:  number;          // epoch ms of the datum, as reported by provider
  entityType:         EntityType;
  entityId:           string;          // normalized key (ticker / CIK / series id)
  entityLabel?:       string;
  observationType:    ObservationType;
  payload:            Record<string, unknown>;
  qualityScore:       number;          // convenience mirror of quality.quality
  quality:            ObservationQuality;
  metadata:           Record<string, unknown>;
}

export interface ProviderMetadata {
  id:                   ProviderId;
  name:                 string;
  description:          string;
  reliability:          number;        // 0..100 base tier
  cadence:              Cadence;
  ttlMs:                number;        // cache TTL
  rateLimitPerMin:      number;
  costTier:             CostTier;
  requiresApiKey:       boolean;
  supportsEntities:     EntityType[];
  supportsObservations: ObservationType[];
  docsUrl?:             string;
}

export type ProviderHealthState = "unknown" | "healthy" | "degraded" | "down";

export interface ProviderHealth {
  id:                  ProviderId;
  state:               ProviderHealthState;
  lastSyncAt:          number | null;
  lastSyncDurationMs:  number | null;
  lastError:           string | null;
  observationCount:    number;         // cumulative normalized observations emitted
  failureCount:        number;
  consecutiveFailures: number;
  cacheEntries:        number;
  cacheAgeMs:          number | null;  // age of the oldest live cache entry
  rateLimitRemaining:  number;
}

export interface FetchResult {
  observations: ProviderObservation[];
  raw?:         unknown;
  fromCache:    boolean;
}

/** Provider-specific query. Kept generic so the base orchestrator stays uniform. */
export type FetchParams = Record<string, unknown>;

/** Injectable transport so adapters are testable without real network access. */
export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface RetryPolicy { retries: number; baseMs: number }

export interface AdapterContext {
  transport?: FetchLike;
  now?:       () => number;
  apiKey?:    string;
  retry?:     RetryPolicy;
}

/** The interface every adapter implements. */
export interface DataAdapter {
  readonly id: ProviderId;
  connect():   Promise<boolean>;
  fetch(params?: FetchParams): Promise<FetchResult>;
  normalize(raw: unknown, params?: FetchParams): ProviderObservation[];
  validate(observations: ProviderObservation[]): ProviderObservation[];
  health():    ProviderHealth;
  metadata():  ProviderMetadata;
}

/** Max acceptable age (days) per cadence, used to grade freshness. */
export const CADENCE_MAX_AGE_DAYS: Record<Cadence, number> = {
  realtime: 1, daily: 5, weekly: 14, monthly: 45, quarterly: 130, annual: 400, event: 30,
};
