// lib/marketBlocks.ts — the Market surface's block registry (data only, no engine).
//
// Two zoom levels of one experience: Whole Market (asset classes) and Inside Stocks (equity
// sectors). Each block is a recognizable MARKET NOUN with a real price proxy. Buckets
// (defensive / cyclical) are used only to phrase the plain posture line — never shown.

export type BlockKind = "asset-class" | "sector";
export type Bucket = "defensive" | "cyclical" | "neutral";

export interface MarketBlock {
  id: string;
  label: string;
  symbol: string;
  exchange: string;
  kind: BlockKind;
  bucket: Bucket;
  navSlug?: string;    // sector -> sector/industry depth route
  proxyOf?: string;    // set ONLY when `symbol` is a proxy (e.g. IBIT for Bitcoin) — never presented as the thing itself
}

// Inside Stocks leadership is measured relative to this benchmark.
export const SECTOR_BENCHMARK = { symbol: "SPY", exchange: "US" };

// Whole Market — asset classes. Bitcoin uses the real crypto series when the canonical price
// path serves it; the UI falls back to an explicitly-labeled IBIT proxy only if it is absent.
export const WHOLE_MARKET: MarketBlock[] = [
  { id: "stocks",     label: "Stocks",     symbol: "SPY",     exchange: "US", kind: "asset-class", bucket: "cyclical" },
  { id: "treasuries", label: "Treasuries", symbol: "TLT",     exchange: "US", kind: "asset-class", bucket: "defensive" },
  { id: "gold",       label: "Gold",       symbol: "GLD",     exchange: "US", kind: "asset-class", bucket: "defensive" },
  { id: "dollar",     label: "US Dollar",  symbol: "UUP",     exchange: "US", kind: "asset-class", bucket: "defensive" },
  { id: "oil",        label: "Oil",        symbol: "USO",     exchange: "US", kind: "asset-class", bucket: "cyclical" },
  { id: "crypto",     label: "Bitcoin",    symbol: "BTC-USD", exchange: "CC", kind: "asset-class", bucket: "cyclical" },
];

// Inside Stocks — the eleven equity sectors (SPDR proxies). navSlug points at the closest
// existing industry-depth page; the surface validates it at click time and falls back to
// in-surface focus when a sector has no clean industry match (e.g. Materials).
export const INSIDE_STOCKS: MarketBlock[] = [
  { id: "tech",          label: "Technology",             symbol: "XLK",  exchange: "US", kind: "sector", bucket: "cyclical",  navSlug: "software" },
  { id: "financials",    label: "Financials",             symbol: "XLF",  exchange: "US", kind: "sector", bucket: "cyclical",  navSlug: "financials" },
  { id: "health",        label: "Healthcare",             symbol: "XLV",  exchange: "US", kind: "sector", bucket: "defensive", navSlug: "healthcare" },
  { id: "energy",        label: "Energy",                 symbol: "XLE",  exchange: "US", kind: "sector", bucket: "cyclical",  navSlug: "energy" },
  { id: "industrials",   label: "Industrials",            symbol: "XLI",  exchange: "US", kind: "sector", bucket: "cyclical",  navSlug: "industrials" },
  { id: "staples",       label: "Consumer Staples",       symbol: "XLP",  exchange: "US", kind: "sector", bucket: "defensive", navSlug: "consumer" },
  { id: "discretionary", label: "Consumer Discretionary", symbol: "XLY",  exchange: "US", kind: "sector", bucket: "cyclical",  navSlug: "consumer" },
  { id: "utilities",     label: "Utilities",              symbol: "XLU",  exchange: "US", kind: "sector", bucket: "defensive", navSlug: "utilities" },
  { id: "materials",     label: "Materials",              symbol: "XLB",  exchange: "US", kind: "sector", bucket: "cyclical" },
  { id: "realestate",    label: "Real Estate",            symbol: "XLRE", exchange: "US", kind: "sector", bucket: "neutral",   navSlug: "real-estate" },
  { id: "comm",          label: "Communications",         symbol: "XLC",  exchange: "US", kind: "sector", bucket: "cyclical",  navSlug: "media-telecom" },
];

export const blocksForZoom = (zoom: "whole-market" | "inside-stocks"): MarketBlock[] =>
  zoom === "whole-market" ? WHOLE_MARKET : INSIDE_STOCKS;
