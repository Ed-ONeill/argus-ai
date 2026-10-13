// ETF reference observations. Session clocks and retrieval times never replace bar dates.
import type { PriceSeries } from "./platform/types/prices";
import { toDisplayPoints } from "./platform/chart/geometry";

export const ETF_LOOKBACK_DAYS = 120;
export interface AssetMove { label: string; pct: number | null; asOf?: string | null; stale?: boolean; }
export interface ETFObservation extends AssetMove { close: number; asOf: string; }
export interface MarketBriefInput {
  index: AssetMove | null;
  rates: AssetMove | null;
  oil: AssetMove | null;
  topStory: string | null;
  sessionLabel: string | null;
  live: boolean;
}

export function etfObservation(series: PriceSeries | null, symbol: string, label: string, stale = false): ETFObservation | null {
  if (!series || series.symbol !== symbol || series.exchange !== "US") return null;
  const points = toDisplayPoints(series).filter(p => Number.isFinite(Date.parse(p.t)));
  const last = points.at(-1);
  const previous = points.at(-2);
  if (!last || last.v <= 0) return null;
  return {
    label, close: last.v, asOf: last.t.slice(0, 10),
    pct: previous && previous.v > 0 ? ((last.v - previous.v) / previous.v) * 100 : null,
    stale: stale || series.quality?.freshness === "stale" || series.quality?.grade === "STALE",
  };
}

const pct = (p: number): string => `${p >= 0 ? "+" : "-"}${Math.abs(p).toFixed(1)}%`;
export function buildMarketBrief(input: MarketBriefInput): string | null {
  const moves = [input.index, input.rates, input.oil]
    .filter((m): m is AssetMove => !!m && m.pct != null && Number.isFinite(m.pct))
    .map(m => `${m.label} ${pct(m.pct!)} (${m.asOf ?? "date unavailable"}${m.stale ? "; marked stale" : ""})`);
  const note = moves.length ? `Latest available ETF adjusted-close changes: ${moves.join("; ")}. Dates are trading sessions (UTC), not live quotes.` : "";
  const story = input.topStory ? `In focus: ${input.topStory.replace(/\.$/, "")}.` : "";
  return [note, story].filter(Boolean).join(" ") || null;
}
