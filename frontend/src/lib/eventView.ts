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

export interface EvidenceItem { source: string; title: string; url: string; kind: EventEvidenceKind; tier: number; when: string | null; qualified: boolean; }
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

// The first COMPLETE sentence. A terminator only ends a sentence when it is followed by
// whitespace + a capital letter, or by end-of-text — so the periods inside "U.S.", "Q2.",
// "Inc." never truncate the line. Deterministic; never cuts mid-thought.
function firstSentence(text: string): string {
  const clean = (sanitizeCopy(text) ?? "").trim();
  if (!clean) return "";
  const m = clean.match(/^[\s\S]*?[.!?](?=\s+[A-Z]|\s*$)/);
  return (m ? m[0] : clean).trim();
}
// A plain summary line: the first complete sentence, or nothing. No length cap — shortening
// may never leave a sentence ending mid-thought, so we keep the whole sentence or omit it.
function cleanProse(text: string | undefined): string | null {
  const s = firstSentence(text ?? "");
  if (!s) return null;
  return ENGINE_RE.test(s) ? null : s;
}
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
  const names = (ev.companies_direct?.length ? ev.companies_direct : ev.companies) ?? [];
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
    whenISO: ev.first_seen || ev.last_updated || null,
    developing: !!ev.developing,
    summary: cleanProse(ev.why_it_matters),
    visualization: resolveSurfaceVisualization(ev),
  };
}

export function buildEvidence(ev: MarketEvent): EventEvidence | null {
  const items: EvidenceItem[] = (ev.evidence ?? []).slice(0, 8).map((e) => ({
    source: e.source, title: sanitizeCopy(e.title) ?? e.title, url: e.url, kind: e.kind, tier: e.tier, when: e.published, qualified: e.qualified,
  }));
  return items.length ? { items, sourceCount: ev.source_count, corroboration: ev.corroboration_count } : null;
}

export function buildWhoAffected(ev: MarketEvent, linked: ThemeIntelligence[]): WhoAffected {
  const chip = (label: string, kind: EntityKind): EventChip => ({ label: label.trim(), kind });
  const dedupe = (arr: EventChip[]): EventChip[] => {
    const seen = new Set<string>();
    return arr.filter((c) => c.label && !seen.has(c.label.toLowerCase()) && seen.add(c.label.toLowerCase()));
  };

  const companies = dedupe(((ev.companies_direct?.length ? ev.companies_direct : ev.companies) ?? [])
    .slice(0, 5).map((c) => chip(c, isTicker(c) ? "ticker" : "company")));
  const industries = dedupe((ev.industries ?? []).slice(0, 5).map((i) => chip(i, "sector")));
  const rep = repProxy(ev);
  const markets = rep ? [chip(rep.of, "macro")] : [];

  // Beneficiaries / Losers ONLY from signed directional evidence (never inferred).
  const rels = linked.flatMap((t) => Object.entries(t.relationship_weights ?? {}));
  const pick = (dir: "positive" | "negative"): EventChip[] =>
    dedupe(rels.filter(([, r]) => r.direction === dir)
      .sort((a, b) => (b[1].weight ?? 0) - (a[1].weight ?? 0)).slice(0, 4)
      .map(([name]) => chip(name, "sector")));
  const beneficiaries = pick("positive");
  const losers = pick("negative");

  return { directional: beneficiaries.length > 0 || losers.length > 0, beneficiaries, losers, companies, industries, markets };
}

export function buildWhyCare(ev: MarketEvent, explanation: Explanation | null, who: WhoAffected): WhyCare | null {
  const pos = sectionData<{ chains?: { hops: TransmissionHop[] }[] }>(explanation?.sections.position);
  const hops = ev.transmission_chain?.length ? ev.transmission_chain : (pos?.chains?.[0]?.hops ?? []);
  const chain = buildChain(hops);
  if (chain.length >= 2) {
    // Label-agnostic phrasing: no verb is conjugated against an arbitrary market label, so
    // singular ("the Fed") and plural ("Risk-off flows") subjects both read correctly.
    return { read: `The connection runs from ${chain[0].label} to ${chain[chain.length - 1].label}.`, chain };
  }
  const affected = [...who.markets, ...who.beneficiaries, ...who.companies][0];
  return affected ? { read: `The market in focus here is ${affected.label}.`, chain: [] } : null;
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
  if (developing) out.push("Watch for a second independent source; a single report is not yet confirmed.");
  if (why && why.chain.length >= 2) out.push(`Watch whether the link between ${why.chain[0].label} and ${why.chain[why.chain.length - 1].label} persists.`);
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

  return {
    found: true,
    hero: buildHero(ev),
    evidence: buildEvidence(ev),
    whyInvestorsCare,
    whoAffected,
    theOtherSide: buildCounterView(explanation),
    watch: buildWatchView(!!ev.developing, whyInvestorsCare),
  };
}
