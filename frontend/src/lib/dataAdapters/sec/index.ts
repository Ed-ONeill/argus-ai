/**
 * lib/dataAdapters/sec/index.ts - SEC EDGAR provider (Provider #1).
 *
 * Expands Argus beyond the existing 8-K / S-1 headline usage into structured data:
 *  - CompanyFacts (XBRL) -> company_profile + financials observations
 *  - Form 4 (recent filings) -> insider_transaction observations
 *  - 13F -> institutional_holding observations (architecture ready, parsing stubbed)
 *
 * All free, official, highest reliability tier. Reads only public EDGAR endpoints.
 * Pure library, no UI, no em/en dashes.
 */

import { BaseDataAdapter } from "../BaseDataAdapter";
import type { AdapterContext, FetchParams, ProviderId, ProviderMetadata, ProviderObservation } from "../types";

const SEC_UA = "Argus Research argus-data@example.com";
const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : NaN);
const asRecord = (v: unknown): Record<string, unknown> => (v && typeof v === "object" ? v as Record<string, unknown> : {});
const asArray = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const parseDate = (v: unknown): number => { const t = Date.parse(String(v)); return Number.isFinite(t) ? t : Date.now(); };

/** XBRL us-gaap concepts we surface, with friendly labels. */
interface ConceptSpec { concept: string; label: string; unit: string; taxonomy: "us-gaap" | "dei" }

/**
 * XBRL concepts surfaced as fundamentals. First matching label wins, so synonymous
 * tags (multiple revenue or debt concepts) collapse to one metric. Units vary: USD
 * for money, "USD/shares" for EPS, "shares" for share counts.
 */
const TRACKED_CONCEPTS: ConceptSpec[] = [
  { concept: "Revenues", label: "Revenue", unit: "USD", taxonomy: "us-gaap" },
  { concept: "RevenueFromContractWithCustomerExcludingAssessedTax", label: "Revenue", unit: "USD", taxonomy: "us-gaap" },
  { concept: "GrossProfit", label: "Gross Profit", unit: "USD", taxonomy: "us-gaap" },
  { concept: "OperatingIncomeLoss", label: "Operating Income", unit: "USD", taxonomy: "us-gaap" },
  { concept: "NetIncomeLoss", label: "Net Income", unit: "USD", taxonomy: "us-gaap" },
  { concept: "EarningsPerShareDiluted", label: "EPS (Diluted)", unit: "USD/shares", taxonomy: "us-gaap" },
  { concept: "EarningsPerShareBasic", label: "EPS (Basic)", unit: "USD/shares", taxonomy: "us-gaap" },
  { concept: "Assets", label: "Total Assets", unit: "USD", taxonomy: "us-gaap" },
  { concept: "Liabilities", label: "Total Liabilities", unit: "USD", taxonomy: "us-gaap" },
  { concept: "StockholdersEquity", label: "Shareholders Equity", unit: "USD", taxonomy: "us-gaap" },
  { concept: "CashAndCashEquivalentsAtCarryingValue", label: "Cash and Equivalents", unit: "USD", taxonomy: "us-gaap" },
  { concept: "LongTermDebtNoncurrent", label: "Long-Term Debt", unit: "USD", taxonomy: "us-gaap" },
  { concept: "LongTermDebt", label: "Long-Term Debt", unit: "USD", taxonomy: "us-gaap" },
  { concept: "ResearchAndDevelopmentExpense", label: "R&D Expense", unit: "USD", taxonomy: "us-gaap" },
  { concept: "PaymentsToAcquirePropertyPlantAndEquipment", label: "Capital Expenditure", unit: "USD", taxonomy: "us-gaap" },
  { concept: "PaymentsForRepurchaseOfCommonStock", label: "Share Buybacks", unit: "USD", taxonomy: "us-gaap" },
  { concept: "CommonStockSharesOutstanding", label: "Shares Outstanding", unit: "shares", taxonomy: "us-gaap" },
  { concept: "EntityCommonStockSharesOutstanding", label: "Shares Outstanding", unit: "shares", taxonomy: "dei" },
  { concept: "WeightedAverageNumberOfDilutedSharesOutstanding", label: "Diluted Shares", unit: "shares", taxonomy: "us-gaap" },
];

/** Derived margins: numerator / Revenue, expressed as a percentage. Deterministic arithmetic. */
const MARGIN_SPECS: Array<{ label: string; numerator: string }> = [
  { label: "Gross Margin", numerator: "Gross Profit" },
  { label: "Operating Margin", numerator: "Operating Income" },
  { label: "Net Margin", numerator: "Net Income" },
];

interface XbrlPoint { end?: string; val?: number; fy?: number; fp?: string; form?: string; filed?: string }

export class SecAdapter extends BaseDataAdapter {
  readonly id: ProviderId = "sec";

  constructor(ctx: AdapterContext = {}) { super(ctx); }

  metadata(): ProviderMetadata {
    return {
      id: "sec",
      name: "SEC EDGAR",
      description: "US Securities and Exchange Commission filings: XBRL company facts, Form 4 insider filings, 13F institutional holdings.",
      reliability: 100,
      cadence: "quarterly",
      ttlMs: 6 * 60 * 60 * 1000,     // 6 hours
      rateLimitPerMin: 300,          // SEC fair-access guidance is ~10 req/s
      costTier: "free",
      requiresApiKey: false,
      supportsEntities: ["Company", "Person", "Institution"],
      supportsObservations: ["company_profile", "financials", "insider_transaction", "institutional_holding"],
      docsUrl: "https://www.sec.gov/edgar/sec-api-documentation",
    };
  }

  protected async request(params: FetchParams): Promise<unknown> {
    const dataset = String(params.dataset ?? "companyfacts");
    const cik = this.resolveCik(params);
    if (dataset === "companyfacts") return this.getJson(`https://data.sec.gov/api/xbrl/companyfacts/CIK${cik}.json`, { "User-Agent": SEC_UA });
    if (dataset === "form4" || dataset === "submissions") return this.getJson(`https://data.sec.gov/submissions/CIK${cik}.json`, { "User-Agent": SEC_UA });
    if (dataset === "13f") return { note: "13F architecture-ready, parsing not yet implemented", holdings: [] };
    throw new Error(`[sec] unknown dataset: ${dataset}`);
  }

  normalize(raw: unknown, params: FetchParams = {}): ProviderObservation[] {
    const dataset = String(params.dataset ?? "companyfacts");
    const ticker = params.ticker ? String(params.ticker).toUpperCase() : undefined;
    if (dataset === "companyfacts") return this.normalizeCompanyFacts(raw, ticker);
    if (dataset === "form4" || dataset === "submissions") return this.normalizeForm4(raw, ticker);
    if (dataset === "13f") return this.normalize13F(raw, ticker);
    return [];
  }

  /* ----- normalizers ----- */

  private normalizeCompanyFacts(raw: unknown, ticker?: string): ProviderObservation[] {
    const r = asRecord(raw);
    const cik = num(r.cik);
    const entityName = typeof r.entityName === "string" ? r.entityName : undefined;
    const entityId = ticker ?? (Number.isFinite(cik) ? `CIK${String(cik).padStart(10, "0")}` : "");
    if (!entityId) return [];

    const out: ProviderObservation[] = [];
    out.push(this.buildObservation({
      source: "SEC EDGAR", providerConfidence: 99, providerTimestamp: this.now(),
      entityType: "Company", entityId, entityLabel: entityName,
      observationType: "company_profile", entityConfidence: ticker ? 99 : 85,
      payload: { cik: Number.isFinite(cik) ? cik : null, entityName },
      metadata: { dataset: "companyfacts" },
    }));

    const facts = asRecord(r.facts);
    const seen = new Set<string>();
    const values = new Map<string, number>();   // label -> latest reported value (for margins)
    for (const spec of TRACKED_CONCEPTS) {
      if (seen.has(spec.label)) continue;
      const tax = asRecord(facts[spec.taxonomy]);
      const units = asRecord(asRecord(tax[spec.concept]).units);
      const points = (asArray(units[spec.unit]) as XbrlPoint[]).filter(p => Number.isFinite(num(p.val)) && p.end);
      if (points.length === 0) continue;
      const latest = points.sort((a, b) => parseDate(b.end) - parseDate(a.end))[0];
      seen.add(spec.label);
      values.set(spec.label, num(latest.val));
      out.push(this.buildObservation({
        source: "SEC EDGAR", providerConfidence: 98, providerTimestamp: parseDate(latest.filed ?? latest.end),
        entityType: "Company", entityId, entityLabel: entityName,
        observationType: "financials", entityConfidence: ticker ? 99 : 85,
        payload: { concept: spec.concept, label: spec.label, value: num(latest.val), unit: spec.unit, periodEnd: latest.end, fiscalYear: latest.fy, fiscalPeriod: latest.fp, form: latest.form },
        metadata: { dataset: "companyfacts" },
      }));
    }

    // Derived margins from reported facts (arithmetic only, flagged as derived).
    const revenue = values.get("Revenue");
    if (revenue && Number.isFinite(revenue) && revenue !== 0) {
      for (const m of MARGIN_SPECS) {
        const numerator = values.get(m.numerator);
        if (numerator == null || !Number.isFinite(numerator)) continue;
        out.push(this.buildObservation({
          source: "SEC EDGAR", providerConfidence: 96, providerTimestamp: this.now(),
          entityType: "Company", entityId, entityLabel: entityName,
          observationType: "financials", entityConfidence: ticker ? 99 : 85,
          payload: { concept: m.label.replace(/\s+/g, ""), label: m.label, value: Math.round((numerator / revenue) * 10000) / 100, unit: "%", derived: true, basis: `${m.numerator} / Revenue` },
          metadata: { dataset: "companyfacts", derived: true },
        }));
      }
    }
    return out;
  }

  private normalizeForm4(raw: unknown, ticker?: string): ProviderObservation[] {
    const r = asRecord(raw);
    const cik = num(r.cik);
    const entityId = ticker ?? (Number.isFinite(cik) ? `CIK${String(cik).padStart(10, "0")}` : "");
    const entityName = typeof r.name === "string" ? r.name : undefined;
    if (!entityId) return [];

    const recent = asRecord(asRecord(r.filings).recent);
    const forms = asArray(recent.form).map(String);
    const dates = asArray(recent.filingDate).map(String);
    const accns = asArray(recent.accessionNumber).map(String);
    const docs = asArray(recent.primaryDocument).map(String);

    const out: ProviderObservation[] = [];
    for (let i = 0; i < forms.length && out.length < 20; i++) {
      if (forms[i] !== "4") continue;
      const filed = dates[i] ?? "";
      out.push(this.buildObservation({
        source: "SEC EDGAR", providerConfidence: 97, providerTimestamp: parseDate(filed),
        entityType: "Company", entityId, entityLabel: entityName,
        observationType: "insider_transaction", entityConfidence: ticker ? 99 : 85,
        payload: { form: "4", filingDate: filed, accessionNumber: accns[i], primaryDocument: docs[i] },
        metadata: { dataset: "form4", note: "filing-level; share detail requires the Form 4 XML" },
      }));
    }
    return out;
  }

  private normalize13F(raw: unknown, ticker?: string): ProviderObservation[] {
    // Architecture ready. Real 13F parsing (information table XML) lands later; when
    // it does, each holding becomes an institutional_holding observation here.
    const holdings = asArray(asRecord(raw).holdings);
    if (holdings.length === 0) return [];
    const entityId = ticker ?? "unknown";
    return holdings.map((h, i) => {
      const hr = asRecord(h);
      return this.buildObservation({
        source: "SEC EDGAR", providerConfidence: 95, providerTimestamp: this.now(),
        entityType: "Institution", entityId: String(hr.institution ?? `${entityId}-${i}`),
        observationType: "institutional_holding", entityConfidence: 80,
        payload: hr, metadata: { dataset: "13f" },
      });
    });
  }

  private resolveCik(params: FetchParams): string {
    const raw = params.cik ?? params.CIK;
    if (raw == null) throw new Error("[sec] cik is required");
    const digits = String(raw).replace(/\D/g, "");
    if (!digits) throw new Error("[sec] invalid cik");
    return digits.padStart(10, "0");
  }
}
