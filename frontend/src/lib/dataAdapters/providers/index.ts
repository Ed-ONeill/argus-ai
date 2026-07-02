/**
 * lib/dataAdapters/providers/index.ts - provider wiring and the future-provider catalog.
 *
 * Concrete adapters are constructed here and registered explicitly. Nothing registers
 * on import, so the production bundle stays inert until a caller opts in. Adding a new
 * institutional provider (Financial Modeling Prep, Finnhub, Polygon, Intrinio, FactSet,
 * Capital IQ, Bloomberg) means writing one adapter and listing it here: no engine
 * changes, because everything normalizes into ProviderObservation. No em/en dashes.
 */

import { providerRegistry } from "../registry";
import { SecAdapter } from "../sec";
import { FredAdapter } from "../fred";
import type { AdapterContext, DataAdapter, ProviderMetadata } from "../types";

/** Build the currently-implemented providers. */
export function createDefaultProviders(ctx: AdapterContext = {}): DataAdapter[] {
  return [new SecAdapter(ctx), new FredAdapter(ctx)];
}

/** Register the implemented providers on the shared registry. Explicit, opt-in. */
export function registerDefaultProviders(ctx: AdapterContext = {}): DataAdapter[] {
  const providers = createDefaultProviders(ctx);
  for (const p of providers) providerRegistry.registerProvider(p);
  return providers;
}

/**
 * Planned providers: metadata-only descriptors so the registry, dashboard, and docs
 * can show the roadmap. Implementing one is a drop-in: extend BaseDataAdapter, emit
 * ProviderObservations, and add it to createDefaultProviders. No engine touches this.
 */
export const PLANNED_PROVIDERS: ProviderMetadata[] = [
  { id: "fmp", name: "Financial Modeling Prep", description: "Fundamentals, estimates, ratios.", reliability: 82, cadence: "daily", ttlMs: 3_600_000, rateLimitPerMin: 300, costTier: "freemium", requiresApiKey: true, supportsEntities: ["Company"], supportsObservations: ["financials", "company_profile"], docsUrl: "https://site.financialmodelingprep.com/developer/docs" },
  { id: "finnhub", name: "Finnhub", description: "Fundamentals, estimates, insider, sentiment.", reliability: 80, cadence: "daily", ttlMs: 3_600_000, rateLimitPerMin: 60, costTier: "freemium", requiresApiKey: true, supportsEntities: ["Company"], supportsObservations: ["financials", "insider_transaction"], docsUrl: "https://finnhub.io/docs/api" },
  { id: "polygon", name: "Polygon.io", description: "Prices, fundamentals, reference data.", reliability: 85, cadence: "realtime", ttlMs: 60_000, rateLimitPerMin: 300, costTier: "freemium", requiresApiKey: true, supportsEntities: ["Company"], supportsObservations: ["financials", "company_profile"], docsUrl: "https://polygon.io/docs" },
  { id: "intrinio", name: "Intrinio", description: "Fundamentals, estimates, filings.", reliability: 86, cadence: "daily", ttlMs: 3_600_000, rateLimitPerMin: 100, costTier: "paid", requiresApiKey: true, supportsEntities: ["Company"], supportsObservations: ["financials", "company_profile"], docsUrl: "https://docs.intrinio.com" },
  { id: "factset", name: "FactSet", description: "Institutional fundamentals, estimates, ownership.", reliability: 96, cadence: "daily", ttlMs: 3_600_000, rateLimitPerMin: 120, costTier: "paid", requiresApiKey: true, supportsEntities: ["Company", "Institution"], supportsObservations: ["financials", "institutional_holding"], docsUrl: "https://developer.factset.com" },
  { id: "capitaliq", name: "S&P Capital IQ", description: "Deep fundamentals, transcripts, estimates.", reliability: 96, cadence: "daily", ttlMs: 3_600_000, rateLimitPerMin: 120, costTier: "paid", requiresApiKey: true, supportsEntities: ["Company", "Institution"], supportsObservations: ["financials", "institutional_holding"], docsUrl: "https://www.spglobal.com/marketintelligence" },
  { id: "bloomberg", name: "Bloomberg", description: "Real-time institutional data and news.", reliability: 98, cadence: "realtime", ttlMs: 30_000, rateLimitPerMin: 240, costTier: "paid", requiresApiKey: true, supportsEntities: ["Company", "Macro", "Institution"], supportsObservations: ["financials", "macro_series", "institutional_holding"], docsUrl: "https://www.bloomberg.com/professional/support/api-library" },
];
