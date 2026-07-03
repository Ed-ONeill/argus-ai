/**
 * lib/dataAdapters/index.ts - barrel for the institutional data adapter layer.
 *
 * One import surface for the normalized-provider infrastructure. Concrete providers
 * still register explicitly (see providers/index.ts); importing this barrel does not
 * fetch anything or register anything on its own.
 */

export * from "./types";
export { BaseDataAdapter } from "./BaseDataAdapter";
export type { ObservationInput } from "./BaseDataAdapter";
export { ProviderRegistry, providerRegistry } from "./registry";
export { SecAdapter } from "./sec";
export { FredAdapter, FRED_SERIES } from "./fred";
export { createDefaultProviders, registerDefaultProviders, PLANNED_PROVIDERS } from "./providers";
export { ingestProviderObservations, buildGraphFromProviderData } from "./observationGraphBridge";
export type { IngestProviderStats } from "./observationGraphBridge";
export { runProviderIngestion, runDefaultIngestion, isProviderIngestionEnabled, DEFAULT_UNIVERSE, DEFAULT_FRED_SERIES } from "./providerIngestion";
export type { IngestionConfig, IngestionReport, CompanyRef } from "./providerIngestion";
export { IngestionScheduler, MemoryHealthStore, FileHealthStore, runIngestionOnce } from "./ingestionScheduler";
export type { SchedulerConfig, SchedulerLogger, HealthStore, HealthRecord, TickResult, TickReason } from "./ingestionScheduler";
export { runIngestionDiagnostic, formatDiagnostic } from "./diagnostics";
export type { DiagnosticConfig, DiagnosticResult, DiagnosticIntegrity } from "./diagnostics";
export { MarketDataAdapter, FmpAdapter } from "./marketData";
export type { MarketQuote, OhlcvBar, MarketProviderHealth } from "./marketData";
