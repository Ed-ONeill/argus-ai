// lib/topStories.ts — the homepage's "what happened" (real news, not engine ranking).
//
// Institutional investors want the day's real developments first. This surfaces the
// actual news the app already ingests: canonical market events (with real sources and
// corroboration) when present, falling back to the categorized top stories. Nothing is
// invented — every item traces to a real headline. Pure and deterministic.

import type { FeedResponse, MarketEvent } from "./types";
import { sanitizeCopy } from "./utils";

export interface TopStory {
  id: string;
  title: string;
  tag: string;              // Macro | Company | Earnings | M&A | Policy | Price | Market
  companies: string[];      // real companies named by the story
  sources: number | null;   // distinct corroborating sources (null when unknown)
  when: string | null;      // ISO timestamp for relative-time display
  href: string;             // the event page, or the article
}

const EVENT_TAG: Record<MarketEvent["event_type"], string> = {
  macro: "Macro", policy: "Policy", ma: "M&A", earnings: "Earnings",
  single_name: "Company", price_echo: "Price", market_event: "Market",
};

function fromEvents(events: MarketEvent[]): TopStory[] {
  return [...events]
    .sort((a, b) => (b.editorial_score ?? 0) - (a.editorial_score ?? 0))
    .slice(0, 5)
    .map((ev) => {
      const companies = (ev.companies_direct?.length ? ev.companies_direct : ev.companies) ?? [];
      return {
        id: ev.id,
        title: sanitizeCopy(ev.title) ?? ev.title,
        tag: EVENT_TAG[ev.event_type] ?? "Market",
        companies: companies.slice(0, 3),
        sources: ev.corroboration_count || ev.source_count || null,
        when: ev.last_updated || ev.first_seen || null,
        href: `/event/${encodeURIComponent(ev.id)}`,
      };
    });
}

function fromTopStories(feed: FeedResponse): TopStory[] {
  const ts = feed.top_stories;
  if (!ts) return [];
  const slots: [FeedResponse["top_stories"]["top_macro"], string][] = [
    [ts.top_macro, "Macro"], [ts.top_single_name, "Company"], [ts.top_price_move, "Price"],
    [ts.top_deal, "M&A"], [ts.top_policy_risk, "Policy"],
  ];
  return slots
    .filter(([item]) => item)
    .map(([item, tag]) => ({
      id: item!.id,
      title: sanitizeCopy(item!.title) ?? item!.title,
      tag,
      companies: (item!.affected_entities ?? []).slice(0, 3),
      sources: null,
      when: item!.published_ts ?? item!.published ?? null,
      href: item!.url,
    }));
}

export function buildTopStories(feed: FeedResponse | undefined): TopStory[] {
  if (!feed) return [];
  const events = feed.events ?? [];
  if (events.length > 0) return fromEvents(events);
  return fromTopStories(feed);
}
