// lib/adaptiveHero.ts — the deterministic Adaptive Hero selector (PX3 / PX3.1). Pure.
//
// The Hero adapts its emphasis to the day's LEAD INTELLIGENCE. Today that lead intelligence
// is the most editorially significant real event, read through a small stable descriptor
// (LeadIntelligence) so future canonical objects — a persistent market condition, a
// multi-day narrative — can plug in unchanged (PX3.1 §9). The mode set is closed and
// frozen: chart-dominant, explanation-dominant, text-first. No new modes, no new heroes.
//
// Honesty: chart-dominant requires a real chartable security; mechanism days demote the
// chart to a LABELED representative proxy or omit it; nothing is charted that cannot be.

import type { FeedResponse, MarketEvent } from "./types";

export type HeroMode = "chart-dominant" | "explanation-dominant" | "text-first";

export interface HeroInstrument {
  symbol: string;
  exchange: string;
  representative: boolean;      // true = an authored proxy, never "this IS the event"
  representativeOf?: string;    // the subject the proxy stands in for (labeled in the UI)
}

/** The stable descriptor the selector reads — the extensibility seam (PX3.1 §9). */
export interface LeadIntelligence {
  source: "event";                    // future: "condition" | "narrative" | ...
  driver: "company" | "mechanism";    // price-driven vs mechanism-driven
  headline: string;
  instrument: HeroInstrument | null;
}

export interface AdaptiveHeroPlan {
  mode: HeroMode;
  instrument: HeroInstrument | null;  // dominant OR supporting subject; null = no chart
}

// Company/price-driven lead -> the move is the story. Mechanism-driven -> the why is.
const COMPANY_TYPES = new Set<MarketEvent["event_type"]>(["earnings", "single_name", "price_echo", "ma"]);

const TICKER_RE = /^[A-Z]{1,5}$/;

// Authored representative proxies for mechanism days (labeled, deterministic; order = priority).
const REP_ETF: [RegExp, string, string][] = [
  [/\bcpi\b|\binflation\b|\bpce\b/i, "TIP", "inflation"],
  [/treasury|\byields?\b/i, "TLT", "Treasury yields"],
  [/federal reserve|\bfed\b|\bfomc\b|rate cut|rate hike|\brates?\b/i, "TLT", "rates"],
  [/\bcrude\b|\boil\b|\bbrent\b|\bopec\b/i, "USO", "oil"],
  [/\bgold\b/i, "GLD", "gold"],
  [/\bdollar\b|\bdxy\b/i, "UUP", "the dollar"],
  [/\bchina\b/i, "FXI", "China"],
  [/nasdaq|\btech\b/i, "QQQ", "big tech"],
  [/s&p|\bmarket\b|\bstocks?\b|equit/i, "SPY", "the market"],
];

function companyInstrument(ev: MarketEvent): HeroInstrument | null {
  const names = (ev.companies_direct?.length ? ev.companies_direct : ev.companies) ?? [];
  const ticker = names.map((s) => s.trim()).find((s) => TICKER_RE.test(s));
  return ticker ? { symbol: ticker.toUpperCase(), exchange: "US", representative: false } : null;
}

function representativeInstrument(ev: MarketEvent): HeroInstrument | null {
  const hay = `${ev.title} ${(ev.industries ?? []).join(" ")}`;
  for (const [re, symbol, of] of REP_ETF) {
    if (re.test(hay)) return { symbol, exchange: "US", representative: true, representativeOf: of };
  }
  return null;
}

/** The single most editorially significant real event — today's lead intelligence source. */
export function leadEventOf(feed: FeedResponse | undefined): MarketEvent | null {
  const events = [...(feed?.events ?? [])].sort((a, b) => (b.editorial_score ?? 0) - (a.editorial_score ?? 0));
  return events[0] ?? null;
}

export function leadIntelligenceFromEvent(ev: MarketEvent | null): LeadIntelligence | null {
  if (!ev) return null;
  const driver: LeadIntelligence["driver"] = COMPANY_TYPES.has(ev.event_type) ? "company" : "mechanism";
  const instrument = driver === "company" ? companyInstrument(ev) : representativeInstrument(ev);
  return { source: "event", driver, headline: ev.title, instrument };
}

/** The frozen mode selection — a pure function of the lead-intelligence descriptor. */
export function selectHero(li: LeadIntelligence | null): AdaptiveHeroPlan {
  if (!li) return { mode: "text-first", instrument: null };
  if (li.driver === "company") {
    // A company day charts the security, or — with no chartable one — stays honest text-first.
    return li.instrument
      ? { mode: "chart-dominant", instrument: li.instrument }
      : { mode: "text-first", instrument: null };
  }
  // Mechanism day: the explanation dominates; the chart is supporting (a proxy) or omitted.
  return { mode: "explanation-dominant", instrument: li.instrument };
}

export function planAdaptiveHero(feed: FeedResponse | undefined): AdaptiveHeroPlan {
  return selectHero(leadIntelligenceFromEvent(leadEventOf(feed)));
}
