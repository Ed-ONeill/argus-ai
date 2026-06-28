/**
 * lib/tickerMetadata.ts — centralized ticker reference data.
 *
 * Single source of truth for the company name / sector / exchange behind any
 * ticker symbol shown anywhere in Argus. Kept dependency-free and light so the
 * shared <TickerChip> (and any page) can read it without pulling a heavy engine.
 * `maIntelligence.ts` re-exports `tickerInfo`/`TickerInfo` from here, so existing
 * imports keep working and there is exactly one dictionary to maintain.
 */

export interface TickerInfo {
  name:      string;
  sector:    string;
  exchange?: string;   // optional — ETFs / rates / indices may not have one
}

const TICKER_META: Record<string, TickerInfo> = {
  // ── Technology / Software ──
  MSFT: { name: "Microsoft Corporation", sector: "Technology", exchange: "NASDAQ" },
  AAPL: { name: "Apple Inc.", sector: "Technology", exchange: "NASDAQ" },
  ORCL: { name: "Oracle Corporation", sector: "Technology", exchange: "NYSE" },
  CRM:  { name: "Salesforce, Inc.", sector: "Technology", exchange: "NYSE" },
  NOW:  { name: "ServiceNow, Inc.", sector: "Technology", exchange: "NYSE" },
  ADBE: { name: "Adobe Inc.", sector: "Technology", exchange: "NASDAQ" },
  PANW: { name: "Palo Alto Networks", sector: "Technology", exchange: "NASDAQ" },
  SNOW: { name: "Snowflake Inc.", sector: "Technology", exchange: "NYSE" },
  DDOG: { name: "Datadog, Inc.", sector: "Technology", exchange: "NASDAQ" },
  CRWD: { name: "CrowdStrike Holdings", sector: "Technology", exchange: "NASDAQ" },
  ZS:   { name: "Zscaler, Inc.", sector: "Technology", exchange: "NASDAQ" },
  FTNT: { name: "Fortinet, Inc.", sector: "Technology", exchange: "NASDAQ" },
  WDAY: { name: "Workday, Inc.", sector: "Technology", exchange: "NASDAQ" },
  SMCI: { name: "Super Micro Computer", sector: "Technology", exchange: "NASDAQ" },
  DELL: { name: "Dell Technologies", sector: "Technology", exchange: "NYSE" },
  VRT:  { name: "Vertiv Holdings", sector: "Technology", exchange: "NYSE" },
  // ── Semiconductors / AI hardware ──
  NVDA: { name: "NVIDIA Corporation", sector: "Semiconductors", exchange: "NASDAQ" },
  AVGO: { name: "Broadcom Inc.", sector: "Semiconductors", exchange: "NASDAQ" },
  AMD:  { name: "Advanced Micro Devices", sector: "Semiconductors", exchange: "NASDAQ" },
  TSM:  { name: "Taiwan Semiconductor", sector: "Semiconductors", exchange: "NYSE" },
  ASML: { name: "ASML Holding N.V.", sector: "Semiconductors", exchange: "NASDAQ" },
  INTC: { name: "Intel Corporation", sector: "Semiconductors", exchange: "NASDAQ" },
  ARM:  { name: "Arm Holdings plc", sector: "Semiconductors", exchange: "NASDAQ" },
  QCOM: { name: "QUALCOMM Incorporated", sector: "Semiconductors", exchange: "NASDAQ" },
  MU:   { name: "Micron Technology", sector: "Semiconductors", exchange: "NASDAQ" },
  AMAT: { name: "Applied Materials", sector: "Semiconductors", exchange: "NASDAQ" },
  KLAC: { name: "KLA Corporation", sector: "Semiconductors", exchange: "NASDAQ" },
  LRCX: { name: "Lam Research", sector: "Semiconductors", exchange: "NASDAQ" },
  ON:   { name: "ON Semiconductor", sector: "Semiconductors", exchange: "NASDAQ" },
  // ── Healthcare ──
  LLY:  { name: "Eli Lilly and Company", sector: "Healthcare", exchange: "NYSE" },
  MRK:  { name: "Merck & Co., Inc.", sector: "Healthcare", exchange: "NYSE" },
  ABBV: { name: "AbbVie Inc.", sector: "Healthcare", exchange: "NYSE" },
  PFE:  { name: "Pfizer Inc.", sector: "Healthcare", exchange: "NYSE" },
  AMGN: { name: "Amgen Inc.", sector: "Healthcare", exchange: "NASDAQ" },
  GILD: { name: "Gilead Sciences", sector: "Healthcare", exchange: "NASDAQ" },
  VRTX: { name: "Vertex Pharmaceuticals", sector: "Healthcare", exchange: "NASDAQ" },
  BMY:  { name: "Bristol Myers Squibb", sector: "Healthcare", exchange: "NYSE" },
  TMO:  { name: "Thermo Fisher Scientific", sector: "Healthcare", exchange: "NYSE" },
  DHR:  { name: "Danaher Corporation", sector: "Healthcare", exchange: "NYSE" },
  IQV:  { name: "IQVIA Holdings", sector: "Healthcare", exchange: "NYSE" },
  UNH:  { name: "UnitedHealth Group", sector: "Healthcare", exchange: "NYSE" },
  CVS:  { name: "CVS Health Corporation", sector: "Healthcare", exchange: "NYSE" },
  // ── Energy ──
  XOM:  { name: "Exxon Mobil Corporation", sector: "Energy", exchange: "NYSE" },
  CVX:  { name: "Chevron Corporation", sector: "Energy", exchange: "NYSE" },
  COP:  { name: "ConocoPhillips", sector: "Energy", exchange: "NYSE" },
  EOG:  { name: "EOG Resources", sector: "Energy", exchange: "NYSE" },
  DVN:  { name: "Devon Energy", sector: "Energy", exchange: "NYSE" },
  OXY:  { name: "Occidental Petroleum", sector: "Energy", exchange: "NYSE" },
  LNG:  { name: "Cheniere Energy", sector: "Energy", exchange: "NYSE" },
  WMB:  { name: "Williams Companies", sector: "Energy", exchange: "NYSE" },
  SLB:  { name: "SLB (Schlumberger)", sector: "Energy", exchange: "NYSE" },
  HAL:  { name: "Halliburton Company", sector: "Energy", exchange: "NYSE" },
  BKR:  { name: "Baker Hughes Company", sector: "Energy", exchange: "NASDAQ" },
  KMI:  { name: "Kinder Morgan", sector: "Energy", exchange: "NYSE" },
  USO:  { name: "United States Oil Fund", sector: "Energy", exchange: "NYSE Arca" },
  // ── Utilities / Power & Grid ──
  NEE:  { name: "NextEra Energy", sector: "Utilities", exchange: "NYSE" },
  CEG:  { name: "Constellation Energy", sector: "Utilities", exchange: "NASDAQ" },
  VST:  { name: "Vistra Corp.", sector: "Utilities", exchange: "NYSE" },
  TLN:  { name: "Talen Energy", sector: "Utilities", exchange: "NASDAQ" },
  SO:   { name: "Southern Company", sector: "Utilities", exchange: "NYSE" },
  DUK:  { name: "Duke Energy", sector: "Utilities", exchange: "NYSE" },
  AEP:  { name: "American Electric Power", sector: "Utilities", exchange: "NASDAQ" },
  EXC:  { name: "Exelon Corporation", sector: "Utilities", exchange: "NASDAQ" },
  NRG:  { name: "NRG Energy", sector: "Utilities", exchange: "NYSE" },
  AES:  { name: "The AES Corporation", sector: "Utilities", exchange: "NYSE" },
  CCJ:  { name: "Cameco Corporation", sector: "Energy", exchange: "NYSE" },
  // ── Financials / Private capital ──
  JPM:  { name: "JPMorgan Chase & Co.", sector: "Financials", exchange: "NYSE" },
  GS:   { name: "Goldman Sachs Group", sector: "Financials", exchange: "NYSE" },
  MS:   { name: "Morgan Stanley", sector: "Financials", exchange: "NYSE" },
  BAC:  { name: "Bank of America", sector: "Financials", exchange: "NYSE" },
  C:    { name: "Citigroup Inc.", sector: "Financials", exchange: "NYSE" },
  WFC:  { name: "Wells Fargo & Company", sector: "Financials", exchange: "NYSE" },
  BX:   { name: "Blackstone Inc.", sector: "Financials", exchange: "NYSE" },
  KKR:  { name: "KKR & Co. Inc.", sector: "Financials", exchange: "NYSE" },
  APO:  { name: "Apollo Global Management", sector: "Financials", exchange: "NYSE" },
  ARES: { name: "Ares Management", sector: "Financials", exchange: "NYSE" },
  SPGI: { name: "S&P Global Inc.", sector: "Financials", exchange: "NYSE" },
  MCO:  { name: "Moody's Corporation", sector: "Financials", exchange: "NYSE" },
  // ── Industrials / Electrical equipment ──
  GE:   { name: "GE Aerospace", sector: "Industrials", exchange: "NYSE" },
  GEV:  { name: "GE Vernova", sector: "Industrials", exchange: "NYSE" },
  HON:  { name: "Honeywell International", sector: "Industrials", exchange: "NASDAQ" },
  RTX:  { name: "RTX Corporation", sector: "Industrials", exchange: "NYSE" },
  ETN:  { name: "Eaton Corporation", sector: "Industrials", exchange: "NYSE" },
  PWR:  { name: "Quanta Services", sector: "Industrials", exchange: "NYSE" },
  PH:   { name: "Parker-Hannifin", sector: "Industrials", exchange: "NYSE" },
  EMR:  { name: "Emerson Electric", sector: "Industrials", exchange: "NYSE" },
  CMI:  { name: "Cummins Inc.", sector: "Industrials", exchange: "NYSE" },
  PCAR: { name: "PACCAR Inc.", sector: "Industrials", exchange: "NASDAQ" },
  DOV:  { name: "Dover Corporation", sector: "Industrials", exchange: "NYSE" },
  URI:  { name: "United Rentals", sector: "Industrials", exchange: "NYSE" },
  FAST: { name: "Fastenal Company", sector: "Industrials", exchange: "NASDAQ" },
  // ── Consumer ──
  PG:   { name: "Procter & Gamble", sector: "Consumer Staples", exchange: "NYSE" },
  KO:   { name: "The Coca-Cola Company", sector: "Consumer Staples", exchange: "NYSE" },
  PEP:  { name: "PepsiCo, Inc.", sector: "Consumer Staples", exchange: "NASDAQ" },
  MDLZ: { name: "Mondelez International", sector: "Consumer Staples", exchange: "NASDAQ" },
  KMB:  { name: "Kimberly-Clark", sector: "Consumer Staples", exchange: "NYSE" },
  CL:   { name: "Colgate-Palmolive", sector: "Consumer Staples", exchange: "NYSE" },
  EL:   { name: "Estée Lauder Companies", sector: "Consumer Staples", exchange: "NYSE" },
  ADM:  { name: "Archer-Daniels-Midland", sector: "Consumer Staples", exchange: "NYSE" },
  BG:   { name: "Bunge Global SA", sector: "Consumer Staples", exchange: "NYSE" },
  SYY:  { name: "Sysco Corporation", sector: "Consumer Staples", exchange: "NYSE" },
  WMT:  { name: "Walmart Inc.", sector: "Consumer Staples", exchange: "NYSE" },
  COST: { name: "Costco Wholesale", sector: "Consumer Staples", exchange: "NASDAQ" },
  AMZN: { name: "Amazon.com, Inc.", sector: "Consumer Discretionary", exchange: "NASDAQ" },
  TSLA: { name: "Tesla, Inc.", sector: "Consumer Discretionary", exchange: "NASDAQ" },
  // ── Real Estate ──
  PLD:  { name: "Prologis, Inc.", sector: "Real Estate", exchange: "NYSE" },
  AMT:  { name: "American Tower", sector: "Real Estate", exchange: "NYSE" },
  EQIX: { name: "Equinix, Inc.", sector: "Real Estate", exchange: "NASDAQ" },
  DLR:  { name: "Digital Realty Trust", sector: "Real Estate", exchange: "NYSE" },
  O:    { name: "Realty Income", sector: "Real Estate", exchange: "NYSE" },
  SPG:  { name: "Simon Property Group", sector: "Real Estate", exchange: "NYSE" },
  WELL: { name: "Welltower Inc.", sector: "Real Estate", exchange: "NYSE" },
  CBRE: { name: "CBRE Group", sector: "Real Estate", exchange: "NYSE" },
  JLL:  { name: "Jones Lang LaSalle", sector: "Real Estate", exchange: "NYSE" },
  VICI: { name: "VICI Properties", sector: "Real Estate", exchange: "NYSE" },
  // ── Communication Services ──
  GOOGL:{ name: "Alphabet Inc.", sector: "Communication Services", exchange: "NASDAQ" },
  GOOG: { name: "Alphabet Inc.", sector: "Communication Services", exchange: "NASDAQ" },
  META: { name: "Meta Platforms", sector: "Communication Services", exchange: "NASDAQ" },
  NFLX: { name: "Netflix, Inc.", sector: "Communication Services", exchange: "NASDAQ" },
  DIS:  { name: "The Walt Disney Company", sector: "Communication Services", exchange: "NYSE" },
  TMUS: { name: "T-Mobile US", sector: "Communication Services", exchange: "NASDAQ" },
  VZ:   { name: "Verizon Communications", sector: "Communication Services", exchange: "NYSE" },
  T:    { name: "AT&T Inc.", sector: "Communication Services", exchange: "NYSE" },
  WBD:  { name: "Warner Bros. Discovery", sector: "Communication Services", exchange: "NASDAQ" },
  PARA: { name: "Paramount Global", sector: "Communication Services", exchange: "NASDAQ" },
  TTD:  { name: "The Trade Desk", sector: "Communication Services", exchange: "NASDAQ" },
  ROKU: { name: "Roku, Inc.", sector: "Communication Services", exchange: "NASDAQ" },
  // ── Rates / Credit / Commodity proxies ──
  TLT:  { name: "iShares 20+ Yr Treasury Bond ETF", sector: "Rates", exchange: "NASDAQ" },
  IEF:  { name: "iShares 7–10 Yr Treasury Bond ETF", sector: "Rates", exchange: "NASDAQ" },
  TNX:  { name: "10-Year Treasury Yield Index", sector: "Rates" },
  HYG:  { name: "iShares High Yield Corporate Bond ETF", sector: "Credit", exchange: "NYSE Arca" },
  GLD:  { name: "SPDR Gold Shares", sector: "Commodities", exchange: "NYSE Arca" },
};

/** Reference metadata for a ticker symbol, or null if unknown. */
export function tickerInfo(t: string): TickerInfo | null {
  return TICKER_META[t.toUpperCase()] ?? null;
}
