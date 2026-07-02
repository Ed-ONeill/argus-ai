/**
 * lib/dataAdapters/fred/index.ts - FRED provider (Provider #2).
 *
 * Federal Reserve Economic Data: structured macro series covering interest rates,
 * the yield curve, inflation, employment, GDP, and credit spreads. Normalizes each
 * series into macro / economic observations. Free with an API key. Reads only the
 * public FRED observations endpoint. Pure library, no UI, no em/en dashes.
 */

import { BaseDataAdapter } from "../BaseDataAdapter";
import type { AdapterContext, EntityType, FetchParams, ObservationType, ProviderId, ProviderMetadata, ProviderObservation } from "../types";

const asRecord = (v: unknown): Record<string, unknown> => (v && typeof v === "object" ? v as Record<string, unknown> : {});
const asArray = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const parseDate = (v: unknown): number => { const t = Date.parse(String(v)); return Number.isFinite(t) ? t : Date.now(); };

interface SeriesInfo { observationType: ObservationType; entityType: EntityType; label: string }

/** Curated map of the series Argus cares about, by category. Extend freely. */
export const FRED_SERIES: Record<string, SeriesInfo> = {
  // Interest rates
  DGS10:      { observationType: "interest_rate", entityType: "Macro", label: "10-Year Treasury Yield" },
  DGS2:       { observationType: "interest_rate", entityType: "Macro", label: "2-Year Treasury Yield" },
  FEDFUNDS:   { observationType: "interest_rate", entityType: "Macro", label: "Federal Funds Rate" },
  // Yield curve
  T10Y2Y:     { observationType: "yield_curve", entityType: "Macro", label: "10Y-2Y Spread" },
  T10Y3M:     { observationType: "yield_curve", entityType: "Macro", label: "10Y-3M Spread" },
  // Inflation
  CPIAUCSL:   { observationType: "inflation", entityType: "Economic", label: "CPI (All Urban Consumers)" },
  PCEPI:      { observationType: "inflation", entityType: "Economic", label: "PCE Price Index" },
  // Employment
  UNRATE:     { observationType: "employment", entityType: "Economic", label: "Unemployment Rate" },
  PAYEMS:     { observationType: "employment", entityType: "Economic", label: "Nonfarm Payrolls" },
  // GDP
  GDP:        { observationType: "gdp", entityType: "Economic", label: "Gross Domestic Product" },
  GDPC1:      { observationType: "gdp", entityType: "Economic", label: "Real GDP" },
  // Credit spreads
  BAMLH0A0HYM2: { observationType: "credit_spread", entityType: "Macro", label: "High Yield OAS" },
  BAMLC0A0CM:   { observationType: "credit_spread", entityType: "Macro", label: "IG Corporate OAS" },
};

export class FredAdapter extends BaseDataAdapter {
  readonly id: ProviderId = "fred";

  constructor(ctx: AdapterContext = {}) { super(ctx); }

  metadata(): ProviderMetadata {
    return {
      id: "fred",
      name: "FRED (Federal Reserve Economic Data)",
      description: "Structured macro series: interest rates, yield curve, inflation, employment, GDP, credit spreads.",
      reliability: 100,
      cadence: "daily",
      ttlMs: 6 * 60 * 60 * 1000,     // 6 hours
      rateLimitPerMin: 120,
      costTier: "free",
      requiresApiKey: true,
      supportsEntities: ["Macro", "Economic"],
      supportsObservations: ["interest_rate", "yield_curve", "inflation", "employment", "gdp", "credit_spread", "macro_series"],
      docsUrl: "https://fred.stlouisfed.org/docs/api/fred/",
    };
  }

  async connect(): Promise<boolean> {
    return !!this.apiKey;
  }

  protected async request(params: FetchParams): Promise<unknown> {
    const seriesId = String(params.seriesId ?? "").trim();
    if (!seriesId) throw new Error("[fred] seriesId is required");
    if (!this.apiKey) throw new Error("[fred] apiKey is required");
    const url = `https://api.stlouisfed.org/fred/series/observations?series_id=${encodeURIComponent(seriesId)}&api_key=${encodeURIComponent(this.apiKey)}&file_type=json&sort_order=asc`;
    return this.getJson(url);
  }

  normalize(raw: unknown, params: FetchParams = {}): ProviderObservation[] {
    const seriesId = String(params.seriesId ?? "").trim();
    if (!seriesId) return [];
    const info: SeriesInfo = FRED_SERIES[seriesId] ?? { observationType: "macro_series", entityType: "Macro", label: seriesId };

    const points = asArray(asRecord(raw).observations)
      .map(asRecord)
      .filter(p => p.value !== "." && Number.isFinite(Number(p.value)));
    if (points.length === 0) return [];

    const latest = points[points.length - 1];
    const prev = points.length >= 2 ? points[points.length - 2] : null;
    const value = Number(latest.value);
    const previousValue = prev ? Number(prev.value) : null;

    return [this.buildObservation({
      source: "FRED", providerConfidence: 99, providerTimestamp: parseDate(latest.date),
      entityType: info.entityType, entityId: seriesId, entityLabel: info.label,
      observationType: info.observationType, entityConfidence: 99,
      payload: {
        seriesId, label: info.label, date: String(latest.date), value,
        previousValue, change: previousValue == null ? null : Number((value - previousValue).toFixed(4)),
        observationCount: points.length,
      },
      metadata: { category: info.observationType },
    })];
  }
}
