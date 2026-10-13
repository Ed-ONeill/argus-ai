import { directCompanies, latestReportTime } from "./eventPresentation";
// lib/feedStream.ts — the Feed as EDITORIAL DISCOVERY (Law-10 compliance).
//
// The Feed lets you discover what you didn't know to look for. It is organized around
// companies, markets, and events — never internal reasoning objects. Each card stands
// alone (headline · why it matters · who · source) and teaches something the homepage
// Brief did NOT already show: cards the Brief surfaces are excluded here, so every scroll
// is genuinely new (no re-explaining a story from the Brief). Pure and deterministic; the
// reasoning engine is untouched — only its translation to the surface changes.

import type { EntityKind } from "./entity";
import type { FeedItem, FeedResponse, MarketEvent } from "./types";
import { sanitizeCopy } from "./utils";
import { buildTopStories } from "./topStories";

export type FeedCategory = "Company" | "Markets" | "Macro" | "M&A" | "Policy" | "Geopolitics";

export interface FeedCardEntity { label: string; kind: EntityKind; }

export interface FeedCard {
  id: string;
  category: FeedCategory;
  headline: string;              // what happened
  why: string | null;            // why it matters (one plain line; omitted if unavailable)
  entities: FeedCardEntity[];    // the companies / markets it involves
  sources: number | null;        // corroborating sources
  when: string | null;           // ISO, for relative time
  href: string;
  developing: boolean;           // single-source, still corroborating
}

const isTicker = (s: string): boolean => /^[A-Z]{1,5}$/.test(s.trim());

const EVENT_CATEGORY: Record<MarketEvent["event_type"], FeedCategory> = {
  earnings: "Company", single_name: "Company", price_echo: "Markets",
  macro: "Macro", policy: "Policy", ma: "M&A", market_event: "Markets",
};

function toEntities(labels: string[]): FeedCardEntity[] {
  return labels.map((s) => s.trim()).filter(Boolean).slice(0, 3)
    .map((label) => ({ label, kind: isTicker(label) ? "ticker" : "company" }));
}

function fromEvent(ev: MarketEvent): FeedCard {
  const companies = directCompanies(ev);
  return {
    id: ev.id,
    category: EVENT_CATEGORY[ev.event_type] ?? "Markets",
    headline: sanitizeCopy(ev.title) ?? ev.title,
    why: null,
    entities: toEntities(companies),
    sources: ev.source_count || null,
    when: latestReportTime(ev),
    href: `/event/${encodeURIComponent(ev.id)}`,
    developing: !!ev.developing,
  };
}

function normalizeItemCategory(c: string): FeedCategory {
  const s = c.toLowerCase();
  if (s.includes("m&a") || s.includes("deal")) return "M&A";
  if (s.includes("geopolit")) return "Geopolitics";
  if (s.includes("macro")) return "Macro";
  if (s.includes("policy")) return "Policy";
  if (s.includes("company")) return "Company";
  return "Markets";
}

function fromItem(item: FeedItem): FeedCard {
  return {
    id: item.id,
    category: normalizeItemCategory(item.category),
    headline: sanitizeCopy(item.title) ?? item.title,
    why: null,
    entities: toEntities(item.affected_entities ?? []),
    sources: null,
    when: item.published_ts ?? null,
    href: item.url,
    developing: false,
  };
}

/** The editorial Feed: real market developments, ranked, EXCLUDING everything the homepage
 *  Brief already shows — so the Feed only ever teaches something new. */
export function buildFeedStream(feed: FeedResponse | undefined): FeedCard[] {
  if (!feed) return [];
  const shownInBrief = new Set(buildTopStories(feed).map((s) => s.id));

  const events = [...(feed.events ?? [])].sort((a, b) => (b.editorial_score ?? 0) - (a.editorial_score ?? 0));
  if (events.length > 0) {
    return events.filter((ev) => !shownInBrief.has(ev.id)).map(fromEvent);
  }
  // Fallback when canonical events are absent (e.g. a stale cache): clustered stories.
  const primaries = (feed.clusters ?? []).map((c) => c.primary).filter(Boolean);
  return primaries.filter((it) => !shownInBrief.has(it.id)).map(fromItem);
}

/** Cards for a specific set of event ids — the Market Landscape focus view. Unlike the
 *  default stream, this shows the FULL picture for the clicked concept (Brief items
 *  included), because focusing is a deliberate drill-down, not passive discovery. */
export function buildCardsForEventIds(feed: FeedResponse | undefined, ids: Set<string>): FeedCard[] {
  if (!feed || ids.size === 0) return [];
  return (feed.events ?? [])
    .filter((ev) => ids.has(ev.id))
    .sort((a, b) => (b.editorial_score ?? 0) - (a.editorial_score ?? 0))
    .map(fromEvent);
}

/** The market-concept categories actually present in the stream — the filter set. */
export function categoriesOf(cards: FeedCard[]): FeedCategory[] {
  const order: FeedCategory[] = ["Company", "Markets", "Macro", "M&A", "Policy", "Geopolitics"];
  const present = new Set(cards.map((c) => c.category));
  return order.filter((c) => present.has(c));
}
