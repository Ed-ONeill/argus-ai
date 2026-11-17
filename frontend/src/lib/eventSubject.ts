import type { MarketEvent } from "./types";
import { tickerInfo } from "./tickerMetadata";
import { directCompanies } from "./eventPresentation";

const GENERIC = new Set(["the", "walt", "inc", "incorporated", "corporation", "corp", "company", "group", "holdings", "limited", "plc", "bank", "of", "and", "general", "american", "united", "global"]);
const words = (s: string) => s.toLowerCase().match(/[a-z0-9]+/g) ?? [];

/** Presentation only: never add entities or infer a subject from registry order. */
export function eventSubjectTicker(ev: MarketEvent): string | null {
  const candidates = [...new Set(directCompanies(ev).map(s => s.trim().toUpperCase()))]
    .filter(s => /^[A-Z]{1,5}$/.test(s));
  const titleWords = new Set(words(ev.title));
  const explicitTickers = new Set(ev.title.match(/\b[A-Z]{1,5}\b/g) ?? []);
  const named = candidates.filter(ticker => {
    if (explicitTickers.has(ticker)) return true;
    const name = tickerInfo(ticker)?.name;
    if (!name) return false;
    const distinctive = words(name).filter(w => w.length >= 4 && !GENERIC.has(w));
    return distinctive.length > 0 && distinctive.some(w => titleWords.has(w));
  });
  if (named.length === 1) return named[0];
  // A sole resolved company is useful even for a pronoun-only headline. Multiple
  // named companies require a role-aware resolver; omit the dominant chart.
  return named.length === 0 && candidates.length === 1 ? candidates[0] : null;
}
