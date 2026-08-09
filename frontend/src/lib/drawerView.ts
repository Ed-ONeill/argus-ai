// lib/drawerView.ts — the Drawer's canonical View Model (Surface #5): the product's PROOF
// LAYER. One question only: "What evidence supports this?" It leads with the actual sourced
// records behind a focused entity — grouped by canonical story/event, documents within — and
// nothing else. No Signal, conviction, momentum, graph, timeline, prediction, or provenance
// labels (those move to the future Workstation). No opaque Argus scores; trust is expressed as
// editorial states derived only from the sourced records. Pure and deterministic.
//
// Grouping identity is CANONICAL (event.id === StoryCluster.id) — documents are never merged
// because their headlines merely look similar.

import type { Episode, MarketEvent, StoryCluster, ThemeIntelligence, EventEvidence } from "./types";
import type { MADeal } from "@/hooks/useMAIntelligence";
import type { IntelContext } from "./intelligenceContext";
import type { MarketStructureVM } from "./intelligenceShared";
import { canonicalEntityHref } from "./intelligenceShared";
import { tickerInfo } from "./tickerMetadata";
import { sanitizeCopy } from "./utils";

export type DocKind = "news" | "filing" | "transcript" | "ir" | "deal" | "conversation";
export type TrustState = "primary" | "corroborated" | "developing" | "single";

export interface EvidenceDoc { outlet: string; title: string; url: string; dateISO: string | null; kind: DocKind }
export interface EvidenceStory {
  id: string;
  headline: string;
  whenISO: string | null;
  docs: EvidenceDoc[];
  sourceCount: number;     // distinct independent outlets actually shown
  state: TrustState;
  stateLabel: string;      // editorial, never a score
}
export interface ReferencedIn { events: number; stories: number; earnings: number; deals: number }
export interface PriceStrip { symbol: string; price: string; changePct: number | null; freshness: string }
export interface DrawerView {
  head: { label: string; kindLabel: string };
  orientation: string | null;
  price: PriceStrip | null;
  referencedIn: ReferencedIn | null;
  stories: EvidenceStory[];
  hasEvidence: boolean;
  continueHref: string | null;
}

export interface DrawerInputs {
  context: IntelContext;
  events: MarketEvent[];
  clusters: StoryCluster[];
  deals: MADeal[];
  episodes: Episode[];
  themes: ThemeIntelligence[];
  market: MarketStructureVM | null;   // company/ETF only; resolved by the component
}

const lc = (s: string): string => s.toLowerCase();
const up = (s: string): string => s.toUpperCase();
// Orientation must be DESCRIPTIVE only — never explain or recommend.
const ANALYSIS_RE = /\b(because|benefits?|benefit|should|expected to|poised|likely to|due to|driven by|thanks to|set to)\b/i;
const ENGINE_RE = /\b(themes?|conviction|transmission|momentum|signals?|regime|thesis|theses|ledger|node|graph)\b/i;

const KIND_LABEL: Record<IntelContext["kind"], string> = {
  company: "Company", etf: "ETF", sector: "Sector", driver: "Market force",
  theme: "Market theme", narrative: "Market theme", deal: "Deal",
};
const EV_KIND: Record<EventEvidence["kind"], DocKind> = { sec_filing: "filing", transcript: "transcript", ir_release: "ir", news: "news" };
const PRIMARY_KINDS = new Set<DocKind>(["filing", "transcript", "ir"]);
const KIND_RANK: Record<DocKind, number> = { filing: 0, transcript: 1, ir: 2, deal: 3, news: 4, conversation: 5 };

function firstSentence(text: string): string {
  const clean = (sanitizeCopy(text) ?? "").trim();
  if (!clean) return "";
  const m = clean.match(/^[\s\S]*?[.!?](?=\s+[A-Z]|\s*$)/);
  return (m ? m[0] : clean).trim();
}

// Resolve a focused theme/sector/driver/company context to its live theme (enrichment only).
function resolveTheme(ctx: IntelContext, themes: ThemeIntelligence[]): ThemeIntelligence | null {
  const byConf = (a: ThemeIntelligence, b: ThemeIntelligence): number => (b.confidence ?? 0) - (a.confidence ?? 0);
  const name = lc(ctx.label);
  if (ctx.kind === "theme" || ctx.kind === "narrative")
    return themes.filter((t) => lc(t.name) === name || lc(t.name).includes(name)).sort(byConf)[0] ?? null;
  if (ctx.kind === "sector")
    return themes.filter((t) => (t.related_industries ?? []).some((s) => lc(s) === name)).sort(byConf)[0] ?? null;
  if (ctx.kind === "driver")
    return themes.filter((t) => (t.related_macro_factors ?? []).some((m) => lc(m) === name)).sort(byConf)[0] ?? null;
  if (ctx.kind === "company" || ctx.kind === "etf")
    return themes.filter((t) => (t.related_assets ?? []).map(up).includes(up(ctx.id))).sort(byConf)[0] ?? null;
  return null;
}

// ── which sourced records reference the focused entity (deterministic, no fuzzy merge) ──
interface Matches { events: MarketEvent[]; clusters: StoryCluster[]; deals: MADeal[]; episodes: Episode[]; theme: ThemeIntelligence | null }

function matchSets(input: DrawerInputs): Matches {
  const { context: ctx, events, clusters, deals, episodes, themes } = input;
  const theme = resolveTheme(ctx, themes);
  const ticker = ctx.kind === "company" || ctx.kind === "etf" ? up(ctx.id) : null;
  const themeId = theme?.id ?? null;
  const clusterIds = new Set(theme?.contributing_cluster_ids ?? []);
  const sectorName = ctx.kind === "sector" ? lc(ctx.label) : null;

  const namesUp = (arr?: string[]): string[] => (arr ?? []).map(up);
  const eventHit = (e: MarketEvent): boolean =>
    (!!ticker && (namesUp(e.companies_direct).includes(ticker) || namesUp(e.companies).includes(ticker))) ||
    (!!themeId && (e.theme_ids ?? []).includes(themeId)) ||
    clusterIds.has(e.id) ||
    (!!sectorName && (e.industries ?? []).some((i) => lc(i) === sectorName));

  const matchedEvents = events.filter(eventHit);
  const eventIds = new Set(matchedEvents.map((e) => e.id));

  const clusterHit = (c: StoryCluster): boolean =>
    (clusterIds.has(c.id) || (!!ticker && namesUp(c.primary.affected_entities).includes(ticker))) && !eventIds.has(c.id);
  const matchedClusters = clusters.filter(clusterHit);

  const dealHit = (d: MADeal): boolean =>
    (!!ticker && namesUp(d.entities).includes(ticker)) || (!!sectorName && lc(d.sector) === sectorName);
  const matchedDeals = deals.filter(dealHit);

  const epHit = (ep: Episode): boolean => !!ticker && namesUp(ep.entities).includes(ticker);
  const matchedEpisodes = episodes.filter(epHit);

  return { events: matchedEvents, clusters: matchedClusters, deals: matchedDeals, episodes: matchedEpisodes, theme };
}

// ── the pure section builders ─────────────────────────────────────────────────

export function buildOrientation(ctx: IntelContext, theme: ThemeIntelligence | null): string | null {
  let candidate = "";
  if (ctx.kind === "company" || ctx.kind === "etf") {
    const info = tickerInfo(up(ctx.id));
    if (info) candidate = ctx.kind === "etf" || /etf|fund/i.test(info.sector)
      ? `${info.name} is an exchange-traded fund.`
      : `${info.name} is a ${info.sector} company.`;
  } else if (theme) {
    candidate = firstSentence(theme.description ?? "");
  }
  const s = (sanitizeCopy(candidate) ?? "").trim();
  if (!s || ANALYSIS_RE.test(s) || ENGINE_RE.test(s)) return null;   // descriptive-only, or omitted
  return s;
}

export function buildPriceStrip(ctx: IntelContext, market: MarketStructureVM | null): PriceStrip | null {
  if (!(ctx.kind === "company" || ctx.kind === "etf") || !market) return null;
  const p = market.price;
  return {
    symbol: up(ctx.id),
    price: p >= 1000 ? p.toFixed(0) : p.toFixed(2),
    changePct: market.changePercent,
    // Honest delay CLASS, not a relative age: these quotes are delayed/EOD (matching the Company
    // and Markets surfaces). Showing a bare age ("just now") read a delayed quote as fresh.
    freshness: market.stale ? "stale" : "delayed",
  };
}

export function buildReferencedIn(m: Matches): ReferencedIn | null {
  const earnings = m.events.filter((e) => e.event_type === "earnings").length;
  const events = m.events.length - earnings;
  const ref: ReferencedIn = { events, stories: m.clusters.length, earnings, deals: m.deals.length };
  return events + ref.stories + earnings + ref.deals > 0 ? ref : null;
}

function docsFromEvidence(evidence: EventEvidence[]): EvidenceDoc[] {
  const seen = new Set<string>();
  const docs = evidence
    .filter((e) => e.url && !seen.has(e.url) && seen.add(e.url))
    .map((e) => ({ outlet: e.source, title: sanitizeCopy(e.title) ?? e.title, url: e.url, dateISO: e.published, kind: EV_KIND[e.kind] }));
  return docs.sort((a, b) => (KIND_RANK[a.kind] - KIND_RANK[b.kind]) || (b.dateISO ?? "").localeCompare(a.dateISO ?? "")).slice(0, 6);
}

function editorialState(docs: EvidenceDoc[], developing: boolean): { state: TrustState; stateLabel: string } {
  const primary = docs.find((d) => PRIMARY_KINDS.has(d.kind));
  if (primary) {
    const label = primary.kind === "filing" ? "Primary filing" : primary.kind === "transcript" ? "Primary transcript" : "Primary disclosure";
    return { state: "primary", stateLabel: label };
  }
  const outlets = new Set(docs.map((d) => lc(d.outlet.trim())));
  if (outlets.size >= 2) return { state: "corroborated", stateLabel: `Supported by ${outlets.size} independent sources` };
  if (developing) return { state: "developing", stateLabel: "Still developing, awaiting confirmation" };
  return { state: "single", stateLabel: "Single source" };
}

const outletsOf = (docs: EvidenceDoc[]): number => new Set(docs.map((d) => lc(d.outlet.trim()))).size;

// EDITORIAL ORDERING POLICY (product behavior, not incidental implementation order):
//   • Stories are ordered REVERSE-CHRONOLOGICALLY by their most recent document — the
//     current investigative front leads. Chronology lives BETWEEN stories.
//   • Ties (same timestamp) break by evidence strength so the better-proven story leads:
//     primary > corroborated > developing > single.
//   • The list is capped (the drawer is a preview; the full record lives on the entity page).
//   • DOCUMENTS WITHIN a story lead with primary sources (filing -> transcript -> disclosure),
//     then coverage (news / deal / conversation) by recency: primary proof before reporting.
const STATE_RANK: Record<TrustState, number> = { primary: 0, corroborated: 1, developing: 2, single: 3 };
const STORY_CAP = 8;

export function buildEvidenceStories(m: Matches): EvidenceStory[] {
  const stories: EvidenceStory[] = [];

  for (const e of m.events) {
    const docs = docsFromEvidence(e.evidence ?? []);
    if (docs.length === 0) continue;
    const when = docs[0].dateISO ?? e.last_updated ?? e.first_seen ?? null;
    stories.push({ id: e.id, headline: sanitizeCopy(e.title) ?? e.title, whenISO: when, docs, sourceCount: outletsOf(docs), ...editorialState(docs, !!e.developing) });
  }
  for (const c of m.clusters) {
    const p = c.primary;
    if (!p?.url) continue;
    const docs: EvidenceDoc[] = [{ outlet: p.source, title: sanitizeCopy(p.title) ?? p.title, url: p.url, dateISO: p.published ?? null, kind: "news" }];
    // A cluster with many articles is corroborated even though we surface the lead source.
    const state = c.story_count >= 2
      ? { state: "corroborated" as TrustState, stateLabel: `Supported by ${c.story_count} independent sources` }
      : { state: "single" as TrustState, stateLabel: "Single source" };
    stories.push({ id: c.id, headline: sanitizeCopy(p.title) ?? p.title, whenISO: p.published ?? null, docs, sourceCount: Math.max(1, c.story_count), ...state });
  }
  for (const d of m.deals) {
    if (!d.url) continue;
    stories.push({ id: d.id, headline: sanitizeCopy(d.title) ?? d.title, whenISO: d.published ?? null,
      docs: [{ outlet: d.source, title: sanitizeCopy(d.title) ?? d.title, url: d.url, dateISO: d.published ?? null, kind: "deal" }],
      sourceCount: 1, state: "single", stateLabel: "Single source" });
  }
  for (const ep of m.episodes) {
    const url = ep.external_url;
    if (!url) continue;
    stories.push({ id: ep.id, headline: sanitizeCopy(ep.title) ?? ep.title, whenISO: ep.published_at ?? null,
      docs: [{ outlet: ep.show_name || ep.publisher, title: sanitizeCopy(ep.title) ?? ep.title, url, dateISO: ep.published_at ?? null, kind: "conversation" }],
      sourceCount: 1, state: "single", stateLabel: "Single source" });
  }

  // Per the editorial ordering policy above: reverse-chronological, ties broken by strength.
  return stories
    .sort((a, b) => (b.whenISO ?? "").localeCompare(a.whenISO ?? "") || (STATE_RANK[a.state] - STATE_RANK[b.state]))
    .slice(0, STORY_CAP);
}

// ── orchestrator ──────────────────────────────────────────────────────────────
export function buildDrawerView(input: DrawerInputs): DrawerView | null {
  const ctx = input.context;
  if (!ctx || !ctx.label) return null;
  const m = matchSets(input);
  const stories = buildEvidenceStories(m);

  return {
    head: { label: ctx.label, kindLabel: KIND_LABEL[ctx.kind] },
    orientation: buildOrientation(ctx, m.theme),
    price: buildPriceStrip(ctx, input.market),
    referencedIn: buildReferencedIn(m),
    stories,
    hasEvidence: stories.length > 0,
    // Onward to the entity's canonical home: company -> /intel; etf and every investigatable kind
    // (theme/sector/driver/narrative) -> the Workstation. Never routes an ETF to the Company page.
    continueHref: canonicalEntityHref(ctx.kind, ctx.id, ctx.label),
  };
}
