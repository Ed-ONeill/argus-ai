// Company presentation: direct reporting stays separate from thematic context.
// Theme metadata and legacy prose cannot establish financial impact or forecasts.

import type { EntityKind } from "./entity";
import type { AttributedEvent, CompanyDossier } from "./intel/dossier";
import type { RelationshipRow } from "./api";
import type { MarketEvent } from "./types";
import { sanitizeCopy } from "./utils";
import { directCompanies, latestReportTime } from "./eventPresentation";

export interface ConnectedConcept { label: string; kind: EntityKind; }

// The company's connection memory: the temporal depth the recorded relationship registry gives
// the (otherwise present-tense) ecosystem. Registry-only (first_seen timestamps) — no theme is
// named, no count is stated that could contradict the visible chips. Deeper fade/strength
// evolution needs the per-relationship transition ledger and is intentionally out of scope here.
export interface ConnectionMemory {
  available: boolean;
  trackedSince: string | null;        // ISO — earliest recorded connection (how long mapped)
  mostRecentFormedAt: string | null;  // ISO — newest connection, only when later than trackedSince
}

/** Reduce the recorded relationship rows to the two honest temporal facts the registry supports:
 *  how long the company has been mapped, and when its connection set last grew. Pure. */
export function buildConnectionMemory(relationships: RelationshipRow[] | null | undefined): ConnectionMemory {
  const stamped = (relationships ?? [])
    .map((r) => r.first_seen_at)
    .filter((d): d is string => !!d && Number.isFinite(Date.parse(d)))
    .sort((a, b) => Date.parse(a) - Date.parse(b));
  if (stamped.length === 0) return { available: false, trackedSince: null, mostRecentFormedAt: null };
  const trackedSince = stamped[0];
  const newest = stamped[stamped.length - 1];
  return {
    available: true,
    trackedSince,
    mostRecentFormedAt: Date.parse(newest) > Date.parse(trackedSince) ? newest : null,
  };
}

export interface CompanyDevelopment {
  id: string;
  category: string;            // Company / Markets / Macro / M&A / Policy / Earnings
  headline: string;
  why: string | null;
  companies: string[];
  sources: number | null;
  when: string | null;
  href: string;
  direct: boolean;             // named in the event (vs a related development)
  reason: string | null;       // plain reason for a related development
}

export interface CompanyView {
  ticker: string;
  name: string;
  sector: string | null;
  identified: boolean;
  whyItMatters: string | null;
  lead: CompanyDevelopment | null;
  connections: ConnectedConcept[];
  developments: CompanyDevelopment[];
  earningsFilings: CompanyDevelopment[];
  watch: string[];
  hasContent: boolean;
}

const isTicker = (s: string): boolean => /^[A-Z]{1,5}$/.test(s.trim());

const EVENT_CATEGORY: Record<MarketEvent["event_type"], string> = {
  earnings: "Earnings", single_name: "Company", price_echo: "Markets",
  macro: "Macro", policy: "Policy", ma: "M&A", market_event: "Markets",
};

function toDevelopment(a: AttributedEvent, self: string): CompanyDevelopment {
  const ev = a.event;
  const companies = directCompanies(ev);
  // A related development's reason: keep plain peer/industry reasons; drop any that
  // names an internal object (theme exposure) to a generic phrase.
  const reason = a.attribution === "direct" ? null
    : /theme exposure|unattributed/i.test(a.reason) ? "Related development"
    : a.reason;
  return {
    id: ev.id,
    category: EVENT_CATEGORY[ev.event_type] ?? "Markets",
    headline: sanitizeCopy(ev.title) ?? ev.title,
    why: null,
    companies: companies.filter((c) => c.toUpperCase() !== self).slice(0, 3),
    sources: ev.source_count || null,
    when: latestReportTime(ev),
    href: `/event/${encodeURIComponent(ev.id)}`,
    direct: a.attribution === "direct",
    reason,
  };
}

/** The company's connections as plain market concepts (sectors, peer companies, macro),
 *  derived from the same linked-theme graph the dossier uses — but the themes are never
 *  named; only the recognizable market nouns they carry are surfaced. */
function buildConnections(dossier: CompanyDossier): ConnectedConcept[] {
  const seen = new Set<string>();
  const out: ConnectedConcept[] = [];
  const add = (label: string, kind: EntityKind) => {
    const key = label.trim().toLowerCase();
    if (!label.trim() || seen.has(key) || key === dossier.ticker.toLowerCase()) return;
    seen.add(key);
    out.push({ label: label.trim(), kind });
  };
  for (const t of dossier.linkedThemes) {
    for (const ind of t.related_industries ?? []) add(ind, "sector");
    for (const a of t.related_assets ?? []) add(a, isTicker(a) ? "ticker" : "company");
    for (const m of t.related_macro_factors ?? []) add(m, "macro");
    if (out.length >= 10) break;
  }
  // Sectors and peers first (most recognizable), macro after.
  return out.sort((a, b) => rank(a.kind) - rank(b.kind)).slice(0, 8);
}
const rank = (k: EntityKind): number => (k === "sector" ? 0 : k === "ticker" || k === "company" ? 1 : 2);

function isEarningsOrFiling(ev: MarketEvent): boolean {
  if (ev.event_type === "earnings") return true;
  return (ev.evidence ?? []).some((e) => e.kind === "sec_filing" || e.kind === "transcript" || e.kind === "ir_release");
}

export function buildCompanyView(dossier: CompanyDossier | null): CompanyView | null {
  if (!dossier) return null;
  const directRecord = dossier.record.filter(a => directCompanies(a.event).some(c => c.toUpperCase() === dossier.ticker.toUpperCase()));
  const lead = directRecord[0] ? toDevelopment(directRecord[0], dossier.ticker) : null;
  const whyItMatters = lead?.headline ?? null;
  const leadEventId = lead?.id;
  // The primary story's event must not appear a second time in the chronological list or a
  // third time under earnings & filings. Earnings & filings keeps only DISTINCT records.
  const developments = directRecord
    .filter((a) => a.event.id !== leadEventId)
    .map((a) => toDevelopment(a, dossier.ticker));
  const earningsFilings = directRecord
    .filter((a) => isEarningsOrFiling(a.event) && a.event.id !== leadEventId)
    .map((a) => toDevelopment(a, dossier.ticker));
  const connections = buildConnections(dossier);
  const watch: string[] = [];

  return {
    ticker: dossier.ticker,
    name: dossier.name,
    sector: dossier.sector,
    identified: dossier.identified,
    whyItMatters,
    lead,
    connections,
    developments,
    earningsFilings,
    watch,
    hasContent: !!whyItMatters || connections.length > 0 || developments.length > 0 || watch.length > 0,
  };
}
