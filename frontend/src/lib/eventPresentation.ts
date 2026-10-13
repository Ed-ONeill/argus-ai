import type { MarketEvent } from "./types";

// The current event contract has reporting and contextual relationships, but no
// claim-to-evidence record establishing a directional financial implication.
// Theme conviction, signed ontology weights and legacy LLM prose cannot fill it.
export const IMPLICATION_LIMIT = "A supported financial implication has not been established for this event.";

export function directCompanies(event: MarketEvent): string[] {
  return [...new Set((event.companies_direct ?? []).map(s => s.trim()).filter(Boolean))];
}

// Publication time must come from a dated source. first_seen/last_updated can
// fall back to the pipeline clock in the producer; do not label them publication.
export function latestReportTime(event: MarketEvent): string | null {
  const dates = (event.evidence ?? []).map(e => e.published)
    .filter((s): s is string => !!s && Number.isFinite(Date.parse(s)));
  return dates.sort((a, b) => Date.parse(b) - Date.parse(a))[0] ?? null;
}
