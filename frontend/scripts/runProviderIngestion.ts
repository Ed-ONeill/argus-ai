/**
 * scripts/runProviderIngestion.ts - developer-only live ingestion diagnostic.
 *
 * Runs ONE live provider ingestion cycle (SEC CompanyFacts for AAPL, MSFT, NVDA by
 * default; FRED only when FRED_API_KEY is set) and prints exactly what happened plus a
 * graph integrity check. Forced past the feature flag for this diagnostic run only.
 * Schedules nothing. Never crashes on provider failure. No UI. No em/en dashes.
 *
 * Run:
 *   npx tsx scripts/runProviderIngestion.ts
 *   npx tsx scripts/runProviderIngestion.ts --tickers=AAPL:320193,NVDA:1045810
 *   npx tsx scripts/runProviderIngestion.ts --fred=DGS10,UNRATE --no-form4
 *
 * Environment:
 *   FRED_API_KEY   optional; when absent FRED is skipped safely.
 */

import { runIngestionDiagnostic, formatDiagnostic, type DiagnosticConfig } from "../src/lib/dataAdapters/diagnostics";
import type { CompanyRef } from "../src/lib/dataAdapters/providerIngestion";

function parseArgs(argv: string[]): DiagnosticConfig {
  const args = argv.slice(2);
  const get = (name: string): string | undefined => {
    const hit = args.find(a => a.startsWith(`--${name}=`));
    return hit ? hit.slice(name.length + 3) : undefined;
  };
  const has = (name: string): boolean => args.includes(`--${name}`);

  const tickers = get("tickers");
  const companies: CompanyRef[] | undefined = tickers
    ? tickers.split(",").map(pair => {
        const [ticker, cik] = pair.split(":");
        return { ticker: (ticker ?? "").trim().toUpperCase(), cik: (cik ?? "").trim() };
      }).filter(c => c.ticker && c.cik)
    : undefined;

  const fred = get("fred");
  const fredSeries = fred ? fred.split(",").map(s => s.trim()).filter(Boolean) : undefined;

  return {
    companies,
    fredSeries,
    fredApiKey: process.env.FRED_API_KEY,
    includeForm4: has("no-form4") ? false : undefined,
  };
}

async function main(): Promise<void> {
  const config = parseArgs(process.argv);
  if (!process.env.FRED_API_KEY) console.log("[diagnostic] FRED_API_KEY not set, FRED will be skipped\n");
  const result = await runIngestionDiagnostic(config);
  console.log(formatDiagnostic(result));
  const healthy = result.integrity.ok && result.report.observationsIngested > 0;
  console.log(`\n[diagnostic] ${healthy ? "live data reached the graph" : "no data ingested, inspect providers above"}`);
  process.exit(0);
}

void main();
