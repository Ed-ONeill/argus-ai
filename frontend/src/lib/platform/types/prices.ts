// platform/types/prices.ts — the canonical PriceSeries (DX3.2 domain 1).
//
// Product-agnostic: consumed unchanged by Brief, Feed, Drawer, Entity, Explorer,
// Markets, and the future Workstation (Workstation Reuse Law). Adjusted OHLCV; every
// series self-describes its DataQuality so consumers reason about reliability.

import type { DataQuality } from "../quality";

export interface PricePoint {
  t: string;         // ISO date "YYYY-MM-DD" (EOD)
  o: number;
  h: number;
  l: number;
  c: number;         // raw close
  adjClose: number;  // split/dividend-adjusted close
  v: number;         // volume
}

export interface PriceSeries {
  symbol: string;         // "AAPL"
  exchange: string;       // "US"
  points: PricePoint[];   // ordered oldest → newest (deterministic)
  adjusted: boolean;      // adjClose reflects splits/dividends
  asOf: string;           // ISO — the last bar's date
  quality: DataQuality;
}
