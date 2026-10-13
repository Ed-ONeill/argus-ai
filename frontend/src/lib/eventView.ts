// lib/eventView.ts — the Event surface's canonical View Model (Surface #3): the one pure,
// testable translation between the Intelligence Plane (MarketEvent + canonical Explanation)
// and the EventPage UI. Answers "Why did this happen?" in plain investor language;
// companies/markets/events only — theses, conviction, momentum, transmission uids, regime
// ids, statuses, hashes, engine versions stay invisible.
//
// Architecture (implementation pattern, not yet canonical law): this module is an
// ORCHESTRATOR. Each section is a small pure builder (buildHero, buildEvidence, buildWhyCare,
// buildWhoAffected, buildCounterView, buildWatchView); buildEventView composes them and
// nothing else. The hero carries a SurfaceVisualization descriptor, not an "instrument":
// today it resolves to a price chart; tomorrow it may resolve to another canonical
// visualization without changing the Event page contract. A surface owns one or more such
// descriptors (EventPage happens to use one). All deterministic — no clocks, no network.

import type { EntityKind } from "./entity";
import type { EventDossier } from "./intel/dossier";
import { sectionData, type XCounter } from "./intel/dossier";
import type { Explanation, EventEvidence as RawEventEvidence, FeedResponse, MarketEvent, ThemeIntelligence, TransmissionHop } from "./types";
import { sanitizeCopy } from "./utils";
import { directCompanies, latestReportTime } from "./eventPresentation";

type EventEvidenceKind = RawEventEvidence["kind"];

// ── Surface Visualization descriptor ─────────────────────────────────────────
// A surface names WHAT to show; the UI resolves each descriptor to a concrete artifact.
// A surface owns one or more of these (EventPage uses one; a future Workstation might use
// several). Adding a new visualization kind never changes a surface's contract.
export type VizProminence = "dominant" | "balanced" | "supporting";
export interface PriceChartViz {
  kind: "price-chart";
  prominence: VizProminence;
  symbol: string;
  exchange: string;
  representative: boolean;       // true when a proxy stands in for the subject
  representativeOf?: string;     // the labeled subject the proxy represents
}
export type SurfaceVisualization = PriceChartViz | { kind: "none" };

export interface EventChip { label: string; kind: EntityKind; }

export interface EventHero {
  headline: string;
  typeTag: string;
  whenISO: string | null;
  developing: boolean;
  summary: string | null;               // "what changed", plain (null when only engine-worded)
  visualization: SurfaceVisualization;
}

export interface EvidenceItem { source: string; title: string; url: string; kind: EventEvidenceKind; tier: number; when: string | null; qualified: boolean; excerpt?: string; }
export interface EventEvidence { items: EvidenceItem[]; sourceCount: number; corroboration: number; }
export interface WhyCare { read: string; chain: EventChip[]; }

export interface WhoAffected {
  directional: boolean;             // true only when signed evidence actually populated beneficiaries/losers
  beneficiaries: EventChip[];
  losers: EventChip[];
  companies: EventChip[];
  industries: EventChip[];
  markets: EventChip[];
}

export interface EventView {
  found: boolean;
  hero: EventHero;
  evidence: EventEvidence | null;
  whyInvestorsCare: WhyCare | null;
  whoAffected: WhoAffected;
  theOtherSide: string[] | null;    // null (omitted) when there is no credible other side
  watch: string[];
}

// ── shared plain-language helpers ────────────────────────────────────────────
const isTicker = (s: string): boolean => /^[A-Z]{1,5}$/.test(s.trim());
// Law 10: any re-voiced line carrying an internal-object word is omitted, never shown.
const ENGINE_RE = /\b(themes?|conviction|transmission|momentum|signals?|regime|lifecycle|thesis|theses|node|entities|coherence|ledger|deadband|corroboration)\b/i;

function uidLabel(uid: string): string {
  return (uid.split(":").pop() ?? uid).replace(/[-_]/g, " ").trim();
}
// Capitalize the first character for a label that leads a sentence. Returns a NEW display
// string; the canonical label passed in is never mutated, so the same label renders verbatim
// wherever it is not sentence-initial (e.g. as a chip, or mid-sentence in the causal read).
const cap = (s: string): string => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

const TYPE_TAG: Record<MarketEvent["event_type"], string> = {
  earnings: "Earnings", macro: "Macro", policy: "Policy", ma: "M&A",
  single_name: "Company", price_echo: "Price move", market_event: "Market",
};

// ── instrument resolution (a detail of the price-chart visualization) ─────────
function companyTicker(ev: MarketEvent): string | null {
  const names = directCompanies(ev);
  const t = names.map((s) => s.trim()).find((s) => isTicker(s));
  return t ? t.toUpperCase() : null;
}
// Representative proxies for market/mechanism events (labeled, deterministic).
const REP: [RegExp, string, string][] = [
  [/\bcpi\b|\binflation\b|\bpce\b/i, "TLT", "Treasuries"],
  [/treasur|\byields?\b|federal reserve|\bfed\b|\bfomc\b|rate cut|rate hike|\brates?\b/i, "TLT", "Treasuries"],
  [/\bcrude\b|\boil\b|\bbrent\b|\bopec\b/i, "USO", "Oil"],
  [/\bgold\b/i, "GLD", "Gold"],
  [/\bdollar\b|\bdxy\b/i, "UUP", "the Dollar"],
  [/bitcoin|crypto|\bbtc\b/i, "IBIT", "Bitcoin"],
  [/nasdaq|\btech\b/i, "QQQ", "the Nasdaq"],
  [/s&p|\bmarket\b|\bstocks?\b|equit/i, "SPY", "the S&P 500"],
];
function repProxy(ev: MarketEvent): { symbol: string; of: string } | null {
  const hay = `${ev.title} ${(ev.industries ?? []).join(" ")}`;
  for (const [re, symbol, of] of REP) if (re.test(hay)) return { symbol, of };
  return null;
}
const priceChart = (prominence: VizProminence, symbol: string, of?: string): PriceChartViz =>
  ({ kind: "price-chart", prominence, symbol, exchange: "US", representative: of != null, ...(of != null ? { representativeOf: of } : {}) });

// EventPage-local: company events lead with their own chart, broad-market events balance on
// a representative index, mechanism events lead with explanation and take a proxy chart ONLY
// when one clearly resolves. Not the frozen PX3.1 HeroMode set.
function resolveSurfaceVisualization(ev: MarketEvent): SurfaceVisualization {
  const t = ev.event_type;
  if (t === "earnings" || t === "single_name" || t === "ma") {
    const sym = companyTicker(ev);
    return sym ? priceChart("dominant", sym) : { kind: "none" };
  }
  if (t === "market_event" || t === "price_echo") {
    const rep = repProxy(ev) ?? { symbol: "SPY", of: "the S&P 500" };
    return priceChart("balanced", rep.symbol, rep.of);
  }
  const rep = repProxy(ev);   // macro / policy
  return rep ? priceChart("supporting", rep.symbol, rep.of) : { kind: "none" };
}

// ── actor-chain helpers (why investors care) ─────────────────────────────────
function actorFromUid(uid: string, label: string | null): EventChip | null {
  if (!uid || uid.startsWith("theme:")) return null;         // never surface a theme node
  if (uid.startsWith("company:")) return { label: (uid.split(":").pop() ?? "").toUpperCase(), kind: "ticker" };
  return { label: label ?? cap(uidLabel(uid)), kind: "macro" };   // authored labels verbatim; slugs normalized
}
function buildChain(hops: TransmissionHop[]): EventChip[] {
  const seq: EventChip[] = [];
  hops.forEach((h, i) => {
    if (i === 0) { const a = actorFromUid(h.source_uid, h.source_label); if (a) seq.push(a); }
    const b = actorFromUid(h.target_uid, null);
    if (b) seq.push(b);
  });
  return seq.filter((a, i) => i === 0 || a.label !== seq[i - 1].label);
}

// ── the six pure section builders ────────────────────────────────────────────

export function buildHero(ev: MarketEvent): EventHero {
  return {
    headline: sanitizeCopy(ev.title) ?? ev.title,
    typeTag: TYPE_TAG[ev.event_type] ?? "Market",
    whenISO: latestReportTime(ev),
    developing: !!ev.developing,
    summary: null, // legacy LLM interpretation is not an observed development
    visualization: resolveSurfaceVisualization(ev),
  };
}

export function buildEvidence(ev: MarketEvent): EventEvidence | null {
  const items: EvidenceItem[] = (ev.evidence ?? []).slice(0, 8).map((e) => ({
    source: e.source, title: sanitizeCopy(e.title) ?? e.title, url: e.url, kind: e.kind, tier: e.tier, when: e.published, qualified: e.qualified,
  }));
  return items.length ? { items, sourceCount: ev.source_count, corroboration: ev.corroboration_count } : null;
}

export function buildWhoAffected(ev: MarketEvent, _linked: ThemeIntelligence[]): WhoAffected {
  const chip = (label: string, kind: EntityKind): EventChip => ({ label: label.trim(), kind });
  const dedupe = (arr: EventChip[]): EventChip[] => {
    const seen = new Set<string>();
    return arr.filter((c) => c.label && !seen.has(c.label.toLowerCase()) && seen.add(c.label.toLowerCase()));
  };

  const companies = dedupe(directCompanies(ev)
    .slice(0, 5).map((c) => chip(c, isTicker(c) ? "ticker" : "company")));
  const industries = dedupe((ev.industries ?? []).slice(0, 5).map((i) => chip(i, "sector")));
  const rep = repProxy(ev);
  const markets = rep ? [chip(rep.of, "macro")] : [];

  // relationship_weights is copied from theme configuration. A signed weight
  // describes thematic context; it is not evidence of THIS event's impact.
  const beneficiaries: EventChip[] = [];
  const losers: EventChip[] = [];

  return { directional: beneficiaries.length > 0 || losers.length > 0, beneficiaries, losers, companies, industries, markets };
}

// RC3-ET1a — event-anchored chain gate (explicitly authorized narrow edit to the frozen
// Event surface). The selected chain displays ONLY when at least one of its company
// exposure-target nodes matches a directly resolved entity of THIS event
// (companies_direct: resolver-named from the event's own text — a strict subset of
// `companies`, which also carries theme-injected assets and must never ground a chain).
// Identity is the canonical ticker segment of the company uid, the same convention
// actorFromUid renders; unresolved names never match; missing or empty direct data fails
// closed. A conservative display gate: candidate generation, ordering, and selection are
// untouched, no alternative chain is sought, and passing says only that the event names
// one exposed company — not that every node or edge is causally supported.
function chainGroundedInEvent(ev: MarketEvent, hops: TransmissionHop[]): boolean {
  const direct = new Set((ev.companies_direct ?? []).map((c) => c.trim().toUpperCase()).filter(Boolean));
  if (direct.size === 0) return false;
  return hops.some((h) => {
    const uid = h.target_uid ?? "";
    return uid.startsWith("company:") && direct.has((uid.split(":").pop() ?? "").trim().toUpperCase());
  });
}

export function buildWhyCare(ev: MarketEvent, explanation: Explanation | null, who: WhoAffected): WhyCare | null {
  const pos = sectionData<{ chains?: { hops: TransmissionHop[] }[] }>(explanation?.sections.position);
  const hops = ev.transmission_chain?.length ? ev.transmission_chain : (pos?.chains?.[0]?.hops ?? []);
  const chain = buildChain(hops);
  if (chain.length >= 2 && chainGroundedInEvent(ev, hops)) {
    // Label-agnostic phrasing: no verb is conjugated against an arbitrary market label, so
    // singular ("the Fed") and plural ("Risk-off flows") subjects both read correctly.
    return { read: `Related context includes ${chain[0].label} and ${chain[chain.length - 1].label}. These connections do not establish this event's impact.`, chain };
  }
  const affected = who.companies[0];
  return affected ? { read: `Reporting names ${affected.label}. Company involvement alone does not establish a benefit or loss.`, chain: [] } : null;
}

export function buildCounterView(explanation: Explanation | null): string[] | null {
  const counter = sectionData<XCounter>(explanation?.sections.counter);
  if (!counter || counter.items.length === 0) return null;
  const lines = counter.items.map((it) =>
    it.kind === "recorded_pressure"
      ? `${cap(it.source_label ?? uidLabel(it.source_uid ?? ""))} could weigh against it.`
      : "The trend behind it is already weakening.")
    .filter((s) => s && !ENGINE_RE.test(s));
  return lines.length ? Array.from(new Set(lines)).slice(0, 3) : null;
}

export function buildWatchView(developing: boolean, why: WhyCare | null): string[] {
  const out: string[] = [];
  if (developing) out.push("Watch for reporting from a second qualified source label.");
  if (why && why.chain.length >= 2) out.push("Look for reporting that explains how these connections affect the named companies.");
  return Array.from(new Set(out)).slice(0, 3);
}

// ── orchestrator: compose the pure builders, nothing more ─────────────────────
export function buildEventView(dossier: EventDossier | null, feed: FeedResponse | null | undefined): EventView | null {
  if (!dossier || !dossier.found || !dossier.event) return null;
  const ev = dossier.event;
  const explanation = dossier.explanation;
  const linked = (feed?.theme_intelligence ?? []).filter((t) => (ev.theme_ids ?? []).includes(t.id));

  const whoAffected = buildWhoAffected(ev, linked);
  const whyInvestorsCare = buildWhyCare(ev, explanation, whoAffected);
  const evidence = buildEvidence(ev);
  const reports = (feed?.clusters ?? []).flatMap(c => [c.primary, ...(c.related ?? [])]);
  for (const item of evidence?.items ?? []) {
    const report = reports.find(r => r.url === item.url && r.title === item.title);
    if (report && "snippet" in report && report.snippet?.trim()) item.excerpt = sanitizeCopy(report.snippet) ?? undefined;
  }

  return {
    found: true,
    hero: buildHero(ev),
    evidence,
    whyInvestorsCare,
    whoAffected,
    theOtherSide: null, // theme-level pressure is not an event-specific counterclaim
    watch: buildWatchView(!!ev.developing, whyInvestorsCare),
  };
}
