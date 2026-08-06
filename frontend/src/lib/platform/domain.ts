// platform/domain.ts — the Market-Reference data domains and the canonical result
// envelope. Every domain fetch resolves to a DomainResult whose fallback ladder ends
// in HONEST ABSENCE (data: null, absent: true) — never a fabricated value.

import type { DataQuality } from "./quality";
import type { ProviderObservation } from "./observation";

export type DataDomain =
  | "historical_prices"
  | "intraday"
  | "realtime_prices"
  | "corporate_actions"
  | "calendar"
  | "movers"
  | "fundamentals"
  | "insider"
  | "etf_holdings"
  | "macro"
  | "news";

export type AbsenceReason = "ok" | "no_provider" | "not_entitled" | "all_failed" | "gated";

export interface DomainResult<T> {
  domain: DataDomain;
  data: T | null;
  quality: DataQuality | null;
  absent: boolean;
  reason: AbsenceReason;
  observations: ProviderObservation[];   // the attempt trail, for replay
}

export function absence<T>(
  domain: DataDomain,
  reason: AbsenceReason,
  observations: ProviderObservation[] = [],
): DomainResult<T> {
  return { domain, data: null, quality: null, absent: true, reason, observations };
}
