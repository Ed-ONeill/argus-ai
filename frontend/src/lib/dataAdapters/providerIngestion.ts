/**
 * lib/dataAdapters/providerIngestion.ts - controlled provider ingestion path.
 *
 * A dev-gated / internal utility (NOT wired to any page, hook, or schedule) that
 * fetches SEC CompanyFacts, SEC Form 4, and selected FRED series through the
 * normalized adapter layer and pipes the results into the Market Intelligence Graph
 * via observationGraphBridge. Everything is tolerant: missing API keys, rate limits,
 * and network failures are recorded, never thrown. Returns a structured ingestion
 * report. No UI, no automatic production scheduling. No em/en dashes.
 */

import { intelligenceGraph as G } from "../intelligenceGraph";
import { SecAdapter } from "./sec";
import { FredAdapter } from "./fred";
import { FmpAdapter } from "./marketData";
import { providerRegistry } from "./registry";
import { buildGraphFromProviderData } from "./observationGraphBridge";
import type { FetchLike, FetchResult, ProviderHealth, RetryPolicy } from "./types";

export interface CompanyRef { ticker: string; cik: string | number }

export interface IngestionConfig {
  companies?:     CompanyRef[];      // ticker + CIK universe for SEC
  fredSeries?:    string[];          // FRED series ids
  fredApiKey?:    string;            // falls back to process.env.FRED_API_KEY
  includeForm4?:  boolean;           // also pull Form 4 filings per company
  marketSymbols?: string[];          // tickers / ETFs for FMP market data (opt-in; empty = no market fetch)
  marketEtfs?:    string[];          // which market symbols are ETFs
  fmpApiKey?:     string;            // falls back to process.env.FMP_API_KEY
  enabled?:       boolean;           // explicit gate override (true forces on, false forces off)
  force?:         boolean;           // dev override: run even when the feature flag is off
  transport?:     FetchLike;         // injectable for tests
  now?:           () => number;
  retry?:         RetryPolicy;
}

export interface IngestionReport {
  enabled:              boolean;
  providersCalled:      string[];
  providersSkipped:     Array<{ id: string; reason: string }>;
  observationsFetched:  number;
  observationsIngested: number;
  errorsSkipped:        number;
  nodesAdded:           number;
  relationshipsAdded:   number;
  providerHealth:       ProviderHealth[];
  graphBefore:          { nodes: number; edges: number };
  graphAfter:           { nodes: number; edges: number };
  fetchErrors:          Array<{ provider: string; params: string; error: string }>;
  durationMs:           number;
}

/** A small, well-known default universe (ticker + SEC CIK). */
export const DEFAULT_UNIVERSE: CompanyRef[] = [
  { ticker: "AAPL", cik: 320193 },
  { ticker: "MSFT", cik: 789019 },
  { ticker: "NVDA", cik: 1045810 },
];

/** Default FRED series across rates, curve, inflation, employment, credit. */
export const DEFAULT_FRED_SERIES = ["DGS10", "T10Y2Y", "CPIAUCSL", "UNRATE", "BAMLH0A0HYM2"];

/** Default ETFs to treat as ETF entities when market data runs. */
export const DEFAULT_MARKET_ETFS = ["SPY", "QQQ"];

function envVar(name: string): string | undefined {
  const proc = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process;
  return proc?.env?.[name];
}
const envFredKey = (): string | undefined => envVar("FRED_API_KEY");
const envFmpKey = (): string | undefined => envVar("FMP_API_KEY");

/**
 * Feature flag. Provider ingestion stays OFF unless explicitly enabled, so it can be
 * validated before production rollout. Set ARGUS_ENABLE_PROVIDER_INGESTION=1 (or true)
 * to turn it on, or pass { force: true } / { enabled: true } to runProviderIngestion.
 */
export function isProviderIngestionEnabled(): boolean {
  const v = (envVar("ARGUS_ENABLE_PROVIDER_INGESTION") ?? envVar("ARGUS_PROVIDER_INGESTION") ?? "").toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "on";
}

function disabledReport(startedAt: number, now: () => number, graph: { nodes: number; edges: number }): IngestionReport {
  return {
    enabled: false,
    providersCalled: [], providersSkipped: [{ id: "sec", reason: "ingestion disabled" }, { id: "fred", reason: "ingestion disabled" }],
    observationsFetched: 0, observationsIngested: 0, errorsSkipped: 0, nodesAdded: 0, relationshipsAdded: 0,
    providerHealth: [], graphBefore: graph, graphAfter: graph, fetchErrors: [], durationMs: Math.max(0, now() - startedAt),
  };
}

/**
 * Run one controlled ingestion pass. Adds provider-derived nodes to the shared graph.
 * Safe to call from a dev console or an internal script; never throws.
 */
export async function runProviderIngestion(config: IngestionConfig = {}): Promise<IngestionReport> {
  const now = config.now ?? (() => Date.now());
  const startedAt = now();

  // Feature-flag gate: off by default so this can be validated before production.
  const gateOpen = config.enabled === true || config.force === true ||
    (config.enabled !== false && isProviderIngestionEnabled());
  if (!gateOpen) return disabledReport(startedAt, now, statsOf());

  const companies = config.companies ?? DEFAULT_UNIVERSE;
  const fredSeries = config.fredSeries ?? DEFAULT_FRED_SERIES;
  const fredApiKey = config.fredApiKey ?? envFredKey();
  const marketSymbols = (config.marketSymbols ?? []).map(s => s.toUpperCase());   // opt-in
  const marketEtfs = config.marketEtfs ?? DEFAULT_MARKET_ETFS;
  const fmpApiKey = config.fmpApiKey ?? envFmpKey();
  const ctx = { transport: config.transport, now: config.now, retry: config.retry };

  const graphBefore = statsOf();
  const results: FetchResult[] = [];
  const fetchErrors: IngestionReport["fetchErrors"] = [];
  const providersCalled = new Set<string>();
  const providersSkipped: IngestionReport["providersSkipped"] = [];

  const sec = new SecAdapter(ctx);
  const fred = new FredAdapter({ ...ctx, apiKey: fredApiKey });
  const fmp = new FmpAdapter({ ...ctx, apiKey: fmpApiKey });
  providerRegistry.registerProvider(sec);
  providerRegistry.registerProvider(fred);
  providerRegistry.registerProvider(fmp);

  // ----- SEC CompanyFacts (+ optional Form 4) across the universe -----
  await sec.connect();
  for (const { ticker, cik } of companies) {
    await safeFetch(sec.id, { dataset: "companyfacts", cik, ticker }, () => sec.fetch({ dataset: "companyfacts", cik, ticker }), results, fetchErrors, providersCalled);
    if (config.includeForm4) {
      await safeFetch(sec.id, { dataset: "form4", cik, ticker }, () => sec.fetch({ dataset: "form4", cik, ticker }), results, fetchErrors, providersCalled);
    }
  }

  // ----- FRED (skipped gracefully when no API key) -----
  const fredAvailable = await fred.connect();
  if (!fredAvailable) {
    providersSkipped.push({ id: fred.id, reason: "missing API key" });
  } else {
    for (const seriesId of fredSeries) {
      await safeFetch(fred.id, { seriesId }, () => fred.fetch({ seriesId }), results, fetchErrors, providersCalled);
    }
  }

  // ----- FMP market data (opt-in via marketSymbols, skipped gracefully when no key) -----
  if (marketSymbols.length > 0) {
    const fmpAvailable = await fmp.connect();
    if (!fmpAvailable) {
      providersSkipped.push({ id: fmp.id, reason: "missing API key" });
    } else {
      await safeFetch(fmp.id, { dataset: "quote", symbols: marketSymbols }, () => fmp.fetch({ dataset: "quote", symbols: marketSymbols, etfs: marketEtfs }), results, fetchErrors, providersCalled);
    }
  }

  // ----- Pipe normalized observations into the graph -----
  const ingest = buildGraphFromProviderData(results);
  const graphAfter = statsOf();

  return {
    enabled: true,
    providersCalled: [...providersCalled],
    providersSkipped,
    observationsFetched: results.reduce((sum, r) => sum + r.observations.length, 0),
    observationsIngested: ingest.observationsIngested,
    errorsSkipped: ingest.errorsSkipped + fetchErrors.length,
    nodesAdded: ingest.nodesAdded,
    relationshipsAdded: ingest.relationshipsAdded,
    providerHealth: [sec.health(), fred.health(), fmp.health()],
    graphBefore, graphAfter,
    fetchErrors,
    durationMs: Math.max(0, now() - startedAt),
  };
}

/** Convenience: ingest the default universe and series. Requires a FRED key for FRED. */
export function runDefaultIngestion(fredApiKey?: string): Promise<IngestionReport> {
  return runProviderIngestion({ includeForm4: true, fredApiKey });
}

/* ------------------------------------------------------------------ */

function statsOf(): { nodes: number; edges: number } {
  const s = G.stats();
  return { nodes: s.nodes, edges: s.edges };
}

async function safeFetch(
  provider: string,
  params: Record<string, unknown>,
  run: () => Promise<FetchResult>,
  results: FetchResult[],
  fetchErrors: IngestionReport["fetchErrors"],
  providersCalled: Set<string>,
): Promise<void> {
  try {
    const result = await run();
    results.push(result);
    providersCalled.add(provider);
  } catch (err) {
    fetchErrors.push({ provider, params: JSON.stringify(params), error: err instanceof Error ? err.message : String(err) });
  }
}
