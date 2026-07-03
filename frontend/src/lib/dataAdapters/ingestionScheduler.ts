/**
 * lib/dataAdapters/ingestionScheduler.ts - server-side scheduler for provider ingestion.
 *
 * Drives the existing runProviderIngestion() pipeline on a cadence, mirroring the
 * Python FeedRefresher daemon but for the TypeScript adapter layer. It does NOT touch
 * UI, graph logic, inference, or prediction: it only decides when to run ingestion,
 * prevents overlap, persists provider health, and logs the outcome.
 *
 * Gated OFF unless ARGUS_ENABLE_PROVIDER_INGESTION=true (or { force: true }). SEC runs
 * at least daily; FRED runs on its own cadence (daily by default, can be aligned to
 * macro releases). Idempotency is inherited from the pipeline. No em/en dashes.
 *
 * Deploy either as a long-running worker (scheduler.start()) or a cron that runs one
 * tick: `npx tsx src/lib/dataAdapters/ingestionScheduler.ts`.
 */

import {
  runProviderIngestion, isProviderIngestionEnabled, DEFAULT_UNIVERSE, DEFAULT_FRED_SERIES,
  type IngestionConfig, type IngestionReport, type CompanyRef,
} from "./providerIngestion";

const DAY_MS = 24 * 60 * 60 * 1000;

/* ------------------------------------------------------------------ *
 * Logging + health persistence (pluggable)
 * ------------------------------------------------------------------ */

export interface SchedulerLogger {
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
}

const consoleLogger: SchedulerLogger = {
  info: (m, meta) => console.log(`[provider-ingestion] ${m}`, meta ?? ""),
  warn: (m, meta) => console.warn(`[provider-ingestion] ${m}`, meta ?? ""),
  error: (m, meta) => console.error(`[provider-ingestion] ${m}`, meta ?? ""),
};

export interface HealthRecord {
  provider:           string;
  runAt:              number;
  state:              string;
  observationCount:   number;
  failureCount:       number;
  lastSyncAt:         number | null;
  nodesAdded:         number;
  relationshipsAdded: number;
  durationMs:         number;
}

export interface HealthStore {
  persist(records: HealthRecord[]): void | Promise<void>;
  load(): HealthRecord[] | Promise<HealthRecord[]>;
}

/** Default in-process store. Swap for a file or DB store in production. */
export class MemoryHealthStore implements HealthStore {
  private records: HealthRecord[] = [];
  persist(records: HealthRecord[]): void { this.records.push(...records); }
  load(): HealthRecord[] { return [...this.records]; }
  latestByProvider(): Record<string, HealthRecord> {
    const out: Record<string, HealthRecord> = {};
    for (const r of this.records) if (!out[r.provider] || r.runAt >= out[r.provider].runAt) out[r.provider] = r;
    return out;
  }
}

/** JSON-file store. Uses node:fs via dynamic import so it never bundles into a client. */
export class FileHealthStore implements HealthStore {
  constructor(private path: string) {}
  async load(): Promise<HealthRecord[]> {
    try {
      const fs = await import("node:fs/promises");
      return JSON.parse(await fs.readFile(this.path, "utf8")) as HealthRecord[];
    } catch { return []; }
  }
  async persist(records: HealthRecord[]): Promise<void> {
    try {
      const fs = await import("node:fs/promises");
      const existing = await this.load();
      await fs.writeFile(this.path, JSON.stringify([...existing, ...records].slice(-500), null, 2), "utf8");
    } catch { /* persistence is best-effort */ }
  }
}

/* ------------------------------------------------------------------ *
 * Scheduler
 * ------------------------------------------------------------------ */

export interface SchedulerConfig {
  now?:              () => number;
  secIntervalMs?:    number;        // default 24h
  fredIntervalMs?:   number;        // default 24h
  marketIntervalMs?: number;        // default 1h (market data is realtime)
  companies?:        CompanyRef[];
  fredSeries?:       string[];
  fredApiKey?:       string;
  includeForm4?:     boolean;
  marketSymbols?:    string[];      // tickers / ETFs for FMP market data (empty = no market cadence)
  marketEtfs?:       string[];
  fmpApiKey?:        string;
  force?:            boolean;       // run regardless of the env flag
  flagOverride?:     boolean;       // hard-set enabled/disabled (bypasses env), for tests/deploys
  logger?:           SchedulerLogger;
  healthStore?:      HealthStore;
  ingest?:           (config: IngestionConfig) => Promise<IngestionReport>;   // injectable for tests
  ingestionConfig?:  Partial<IngestionConfig>;   // extra config merged into each run (e.g. transport)
}

export type TickReason = "ok" | "disabled" | "overlap" | "not-due" | "error";

export interface TickResult {
  ran:     boolean;
  reason:  TickReason;
  reports: { sec?: IngestionReport; fred?: IngestionReport; market?: IngestionReport };
  error?:  string;
}

export class IngestionScheduler {
  private now: () => number;
  private secIntervalMs: number;
  private fredIntervalMs: number;
  private marketIntervalMs: number;
  private companies: CompanyRef[];
  private fredSeries: string[];
  private fredApiKey?: string;
  private includeForm4: boolean;
  private marketSymbols: string[];
  private marketEtfs?: string[];
  private fmpApiKey?: string;
  private force: boolean;
  private flagOverride?: boolean;
  private logger: SchedulerLogger;
  private healthStore: HealthStore;
  private ingest: (config: IngestionConfig) => Promise<IngestionReport>;
  private extra: Partial<IngestionConfig>;

  private running = false;
  private lastSecRunAt: number | null = null;
  private lastFredRunAt: number | null = null;
  private lastMarketRunAt: number | null = null;
  private runs = 0;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(cfg: SchedulerConfig = {}) {
    this.now = cfg.now ?? (() => Date.now());
    this.secIntervalMs = cfg.secIntervalMs ?? DAY_MS;
    this.fredIntervalMs = cfg.fredIntervalMs ?? DAY_MS;
    this.marketIntervalMs = cfg.marketIntervalMs ?? 60 * 60 * 1000;
    this.companies = cfg.companies ?? DEFAULT_UNIVERSE;
    this.fredSeries = cfg.fredSeries ?? DEFAULT_FRED_SERIES;
    this.fredApiKey = cfg.fredApiKey;
    this.includeForm4 = cfg.includeForm4 ?? true;
    this.marketSymbols = cfg.marketSymbols ?? [];
    this.marketEtfs = cfg.marketEtfs;
    this.fmpApiKey = cfg.fmpApiKey;
    this.force = cfg.force ?? false;
    this.flagOverride = cfg.flagOverride;
    this.logger = cfg.logger ?? consoleLogger;
    this.healthStore = cfg.healthStore ?? new MemoryHealthStore();
    this.ingest = cfg.ingest ?? runProviderIngestion;
    this.extra = cfg.ingestionConfig ?? {};
  }

  private enabled(): boolean {
    if (this.force) return true;
    if (this.flagOverride !== undefined) return this.flagOverride;
    return isProviderIngestionEnabled();
  }

  /** One scheduling decision. Runs whichever providers are due, never overlapping. */
  async tick(): Promise<TickResult> {
    const now = this.now();

    if (!this.enabled()) {
      this.logger.info("skipped: ingestion disabled (set ARGUS_ENABLE_PROVIDER_INGESTION=true to enable)");
      return { ran: false, reason: "disabled", reports: {} };
    }
    if (this.running) {
      this.logger.warn("skipped: a previous ingestion is still running (overlap prevented)");
      return { ran: false, reason: "overlap", reports: {} };
    }

    this.running = true;
    const reports: TickResult["reports"] = {};
    try {
      const secDue = this.lastSecRunAt == null || now - this.lastSecRunAt >= this.secIntervalMs;
      const fredDue = this.lastFredRunAt == null || now - this.lastFredRunAt >= this.fredIntervalMs;
      const marketDue = this.marketSymbols.length > 0 && (this.lastMarketRunAt == null || now - this.lastMarketRunAt >= this.marketIntervalMs);
      if (!secDue && !fredDue && !marketDue) {
        this.logger.info("nothing due", { lastSecRunAt: this.lastSecRunAt, lastFredRunAt: this.lastFredRunAt, lastMarketRunAt: this.lastMarketRunAt });
        return { ran: false, reason: "not-due", reports: {} };
      }

      const records: HealthRecord[] = [];

      if (secDue) {
        const report = await this.ingest({ companies: this.companies, fredSeries: [], includeForm4: this.includeForm4, force: this.force, now: this.now, ...this.extra });
        reports.sec = report;
        this.lastSecRunAt = now;
        this.logRun("sec", report);
        records.push(...toHealth("sec", report, now));
      }

      if (fredDue) {
        const report = await this.ingest({ companies: [], fredSeries: this.fredSeries, fredApiKey: this.fredApiKey, force: this.force, now: this.now, ...this.extra });
        reports.fred = report;
        this.lastFredRunAt = now;
        this.logRun("fred", report);
        records.push(...toHealth("fred", report, now));
      }

      if (marketDue) {
        const report = await this.ingest({ companies: [], fredSeries: [], marketSymbols: this.marketSymbols, marketEtfs: this.marketEtfs, fmpApiKey: this.fmpApiKey, force: this.force, now: this.now, ...this.extra });
        reports.market = report;
        this.lastMarketRunAt = now;
        this.logRun("market", report);
        records.push(...toHealth("fmp", report, now));
      }

      this.runs += 1;
      if (records.length) await this.healthStore.persist(records);
      return { ran: true, reason: "ok", reports };
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      this.logger.error("ingestion tick failed", { error });
      return { ran: false, reason: "error", reports, error };
    } finally {
      this.running = false;
    }
  }

  /** Long-running worker mode: tick immediately, then every tickIntervalMs. */
  start(tickIntervalMs = 60 * 60 * 1000): void {
    if (this.timer) return;
    this.logger.info("scheduler started", { tickIntervalMs, secIntervalMs: this.secIntervalMs, fredIntervalMs: this.fredIntervalMs });
    void this.tick();
    this.timer = setInterval(() => { void this.tick(); }, tickIntervalMs);
  }

  stop(): void {
    if (this.timer) { clearInterval(this.timer); this.timer = null; this.logger.info("scheduler stopped"); }
  }

  status(): { running: boolean; runs: number; lastSecRunAt: number | null; lastFredRunAt: number | null; lastMarketRunAt: number | null } {
    return { running: this.running, runs: this.runs, lastSecRunAt: this.lastSecRunAt, lastFredRunAt: this.lastFredRunAt, lastMarketRunAt: this.lastMarketRunAt };
  }

  private logRun(provider: string, r: IngestionReport): void {
    if (r.enabled === false) { this.logger.warn(`${provider} run gated off by feature flag`); return; }
    this.logger.info(`${provider} ingestion complete`, {
      providersCalled: r.providersCalled,
      observationsFetched: r.observationsFetched,
      observationsIngested: r.observationsIngested,
      nodesAdded: r.nodesAdded,
      relationshipsAdded: r.relationshipsAdded,
      graphBefore: r.graphBefore,
      graphAfter: r.graphAfter,
      errorsSkipped: r.errorsSkipped,
      durationMs: r.durationMs,
    });
    if (r.fetchErrors.length) this.logger.warn(`${provider} had ${r.fetchErrors.length} fetch error(s)`, { fetchErrors: r.fetchErrors });
    if (r.providersSkipped.length) this.logger.warn(`${provider} skipped provider(s)`, { skipped: r.providersSkipped });
  }
}

function toHealth(providerId: string, r: IngestionReport, runAt: number): HealthRecord[] {
  return r.providerHealth
    .filter(h => String(h.id) === providerId)
    .map(h => ({
      provider: String(h.id), runAt, state: h.state,
      observationCount: h.observationCount, failureCount: h.failureCount, lastSyncAt: h.lastSyncAt,
      nodesAdded: r.nodesAdded, relationshipsAdded: r.relationshipsAdded, durationMs: r.durationMs,
    }));
}

/** Convenience: run exactly one scheduling tick. */
export function runIngestionOnce(config: SchedulerConfig = {}): Promise<TickResult> {
  return new IngestionScheduler(config).tick();
}

/* ------------------------------------------------------------------ *
 * Cron entrypoint: `npx tsx src/lib/dataAdapters/ingestionScheduler.ts`
 * ------------------------------------------------------------------ */

const proc = (globalThis as { process?: { argv?: string[]; env?: Record<string, string | undefined>; exit?: (code: number) => void } }).process;
if (proc && Array.isArray(proc.argv) && /ingestionScheduler\.(ts|js)$/.test(proc.argv[1] ?? "")) {
  const healthPath = proc.env?.ARGUS_HEALTH_PATH ?? "./provider-health.json";
  const scheduler = new IngestionScheduler({ healthStore: new FileHealthStore(healthPath), fredApiKey: proc.env?.FRED_API_KEY });
  scheduler.tick().then(result => {
    console.log(`[provider-ingestion] tick done ran=${result.ran} reason=${result.reason}`);
    proc.exit?.(result.reason === "error" ? 1 : 0);
  });
}
