/**
 * lib/intel/dossier.ts — the canonical Entity Intelligence dossier model (EI1).
 *
 * ARGUS_ENTITY_INTELLIGENCE_V1: one dossier grammar for every admitted kind.
 * This module is the grammar's data layer — kind-agnostic identity handling,
 * the admission law, and the first kind builder (company). Future kinds add
 * builders here; they never add a second grammar.
 *
 * PURE PROJECTION: every field is read from records other modules own —
 * Market Events (F1/F2 editorial engine), ThemeIntelligence + ThemeMemory,
 * the M3 archive and ledger (fetched by the page, rendered by sections).
 * Nothing here computes meaning; deterministic for fixed inputs; no Date.now
 * in anything that feeds layout or identity.
 */

import type { FeedResponse, MarketEvent, ThemeIntelligence } from "@/lib/types";
import { tickerInfo } from "@/lib/tickerMetadata";
import { themeWatch } from "@/lib/themeTransmission";
import { cleanThemeName } from "@/app/markets/marketsShared";

// ── Canonical identity (mirrors institutional_memory/identity.py) ─────────────

export interface ParsedUid { type: string; namespace: string; key: string; uid: string }

const UID_RE = /^([a-z]+):([a-z0-9_]+):(.+)$/;

/** Parse a canonical `{type}:{namespace}:{key}` uid. Strict; never guesses. */
export function parseUid(raw: string): ParsedUid | null {
  const m = UID_RE.exec(raw ?? "");
  if (!m) return null;
  return { type: m[1], namespace: m[2], key: m[3], uid: raw };
}

export function companyUid(ticker: string): string {
  return `company:ticker:${ticker.toUpperCase()}`;
}

/**
 * The admission law (EI V1 §1.3), frontend mirror: a kind renders a file only
 * when identity + resolver + producing engines exist. EI1 admits the company
 * kind; every other valid uid gets the designed not-covered state, and an
 * invalid uid gets the invalid state — never an empty shell.
 */
export type UidAdmission =
  | { state: "company"; ticker: string; uid: string }
  | { state: "reserved"; uid: string; kind: string }
  | { state: "invalid"; uid: string };

const TICKER_SHAPE = /^[A-Z]{1,5}$/;

export function admitUid(raw: string): UidAdmission {
  const parsed = parseUid(raw);
  if (!parsed) return { state: "invalid", uid: raw };
  if (parsed.type === "company" && parsed.namespace === "ticker") {
    const t = parsed.key.toUpperCase();
    if (TICKER_SHAPE.test(t)) return { state: "company", ticker: t, uid: companyUid(t) };
    return { state: "invalid", uid: raw };
  }
  return { state: "reserved", uid: raw, kind: parsed.type };
}

// ── Event attribution (EI1.1) ───────────────────────────────────────────────────
// WHY an event appears in a company's file, stated explicitly. `direct` is
// earned only by the event NAMING the company (companies_direct — the
// registry resolver over the event's own text); everything else is exposure,
// shown separately and labeled. Theme membership never implies involvement.

export type Attribution =
  | "direct"                 // named in the source event / filing / release
  | "peer"                   // a same-sector company is named — may affect indirectly
  | "industry_exposure"      // concerns the company's industry
  | "theme_exposure"         // connected only through a shared thesis
  | "relationship_exposure"  // recorded supplier/customer/partner link (no engine yet)
  | "unattributed";          // pre-EI1.1 feed cycle — provenance not recorded

export interface AttributedEvent {
  event: MarketEvent;
  attribution: Attribution;
  /** The stated reason, rendered verbatim ("Peer event: Micron Technology"). */
  reason: string;
}

interface AttributionCtx {
  ticker: string;
  sector: string | null;
  industries: Set<string>;          // lowercased — sector + linked themes' industries
  themeIds: Set<string>;
  themeNameById: Map<string, string>;
}

export function classifyAttribution(e: MarketEvent, ctx: AttributionCtx): AttributedEvent | null {
  const direct = e.companies_direct;
  if (direct === undefined) {
    return { event: e, attribution: "unattributed",
             reason: "Attribution unavailable — this feed cycle predates provenance recording" };
  }
  if (direct.includes(ctx.ticker)) return { event: e, attribution: "direct", reason: "Named in the event" };

  // peer: the event names a same-sector company
  if (ctx.sector) {
    for (const d of direct) {
      const info = tickerInfo(d);
      if (info?.sector && info.sector === ctx.sector) {
        return { event: e, attribution: "peer", reason: `Peer event: ${info.name}` };
      }
    }
  }
  // industry: the event's recorded industries intersect the company's
  const hit = (e.industries ?? []).find(i => ctx.industries.has(i.toLowerCase()));
  if (hit) return { event: e, attribution: "industry_exposure", reason: `Industry exposure: ${hit}` };

  // theme: connected only through a shared thesis — exposure, never involvement
  const themeHit = (e.theme_ids ?? []).find(t => ctx.themeIds.has(t));
  if (themeHit) {
    return { event: e, attribution: "theme_exposure",
             reason: `Theme exposure: ${ctx.themeNameById.get(themeHit) ?? themeHit}` };
  }
  // relationship_exposure requires a recorded inter-company relationship
  // engine, which does not exist yet — the class is defined, never guessed.
  return null;   // too weak to include at all
}

// ── Dossier view models (the grammar's sections) ───────────────────────────────

export interface DossierExposure {
  themeId: string;
  themeName: string;
  conviction: number;
  momentumLabel: string;
  direction: "bullish" | "bearish" | "neutral";
  /** Recorded causal narrative — the transmission chain in prose. */
  transmission: string;
  /** What the thesis means, in investor language (the theme's recorded description). */
  meaning: string;
  /** Why THIS company connects — composed from recorded fields, glue words only. */
  whyConnected: string;
  /** How the connection is known: curated ontology asset set = recorded. */
  connection: "recorded" | "derived";
  evidenceCount: number;
  dominant: boolean;
}

export interface DossierCoverage {
  events: number;            // DIRECT events — what happened to the company
  related: number;           // indirect developments — what may affect it
  evidence: number;          // documents across the direct record
  corroborated: number;      // direct events with >= 2 qualified sources
  themes: number;
  /** Earliest direct-event first_seen ISO. Null when the direct record is empty. */
  firstSeen: string | null;
}

export interface DossierWatchItem { text: string; sourceTheme: string }

export interface CompanyDossier {
  kind: "company";
  uid: string;
  ticker: string;
  name: string;
  sector: string | null;
  exchange: string | null;
  /** Whether identity resolved beyond the raw ticker (registry/metadata hit). */
  identified: boolean;
  standing: { sentences: string[]; hasThesis: boolean; onDominantPath: boolean };
  exposures: DossierExposure[];
  /** The Event Record: events that NAME this company, engine rank order. */
  record: AttributedEvent[];
  /** Related Market Developments: exposure-attributed events, reasons stated. */
  related: AttributedEvent[];
  coverage: DossierCoverage;
  watch: DossierWatchItem[];
  /** Linked themes (full records) — the relationship map builds from these. */
  linkedThemes: ThemeIntelligence[];
}

// ── The company kind builder ────────────────────────────────────────────────────

const dirOf = (t: ThemeIntelligence): "bullish" | "bearish" | "neutral" =>
  t.momentum_direction === "bullish" ? "bullish"
  : t.momentum_direction === "bearish" ? "bearish" : "neutral";

/** First sentence of a recorded description, decapitalized for composition —
    unless the first word is an acronym or proper symbol (AI, US, GPU…). */
function becauseClause(description: string): string {
  const first = (description || "").split(/(?<=[.!?])\s/)[0].trim().replace(/[.!?]+$/, "");
  if (!first) return "";
  if (/^[A-Z][A-Z0-9]/.test(first)) return first;   // leading acronym — leave it
  return first.charAt(0).toLowerCase() + first.slice(1);
}

/** "A → B → C" rendered as investor prose: "A feeds B, which transmits into C". */
function chainProse(chain: string): string {
  const hops = chain.split("→").map(s => s.trim()).filter(Boolean);
  if (hops.length < 2) return "";
  if (hops.length === 2) return `${hops[0]} transmits into ${hops[1]}`;
  return `${hops[0]} feeds ${hops.slice(1, -1).join(", then ")}, which transmits into ${hops[hops.length - 1]}`;
}

function exposureOf(t: ThemeIntelligence, dominantId: string | null,
                    companyName: string): DossierExposure {
  const themeName = cleanThemeName(t.name);
  const because = becauseClause(t.description);
  const prose = chainProse(t.causal_narrative || "");
  const whyConnected = because
    ? `${companyName} is exposed to ${themeName} because ${because}${prose ? ` — the recorded chain: ${prose}, and ${companyName} is named in its asset set` : `; ${companyName} is named in its asset set`}.`
    : prose
      ? `${prose}, and ${companyName} is named in this thesis's asset set.`
      : `${companyName} is named in this thesis's curated asset set.`;
  return {
    themeId: t.id,
    themeName,
    conviction: Math.round(t.confidence ?? 0),
    momentumLabel: t.momentum_label || "emerging",
    direction: dirOf(t),
    transmission: t.causal_narrative || "",
    meaning: t.description || "",
    whyConnected,
    connection: "recorded",   // ontology asset sets are curated records
    evidenceCount: t.evidence_count ?? 0,
    dominant: dominantId !== null && t.id === dominantId,
  };
}

/** Standing View copy — 4B voice in investor language: what the connection
    means and why, numbers over adjectives, absence plain. */
function standingSentences(name: string, exposures: DossierExposure[],
                           coverage: DossierCoverage): string[] {
  if (!exposures.length) {
    const tail = coverage.events
      ? `${coverage.events} event${coverage.events === 1 ? "" : "s"} name${coverage.events === 1 ? "s" : ""} it directly this cycle; no standing thesis transmits into it.`
      : coverage.related
        ? `Nothing names it directly this cycle; ${coverage.related} related development${coverage.related === 1 ? "" : "s"} may affect it.`
        : "No events in the current cycle name it.";
    return [`No standing thesis names ${name}.`, tail];
  }
  const top = exposures[0];
  const lines: string[] = [];
  const because = becauseClause(top.meaning);
  lines.push(because
    ? `${name} is exposed to the ${top.themeName} thesis (conviction ${top.conviction}, ${top.momentumLabel}) because ${because}.${top.dominant ? " This is the market's dominant narrative." : ""}`
    : `${name} sits on the ${top.themeName} thesis — conviction ${top.conviction}, ${top.momentumLabel}${top.dominant ? "; the dominant narrative transmits into it." : "."}`);
  if (exposures.length > 1) {
    const rest = exposures.slice(1).map(e => `${e.themeName} (${e.conviction})`).join(" and ");
    lines.push(`It is also named by ${rest} — each explained below.`);
  }
  if (coverage.events || coverage.related) {
    const parts: string[] = [];
    if (coverage.events) parts.push(
      `${coverage.events} event${coverage.events === 1 ? "" : "s"} name${coverage.events === 1 ? "s" : ""} ${name} directly` +
      (coverage.corroborated ? ` (${coverage.corroborated} corroborated by two or more qualified sources)` : ""));
    if (coverage.related) parts.push(
      `${coverage.related} related development${coverage.related === 1 ? "" : "s"} may affect it indirectly`);
    lines.push(parts.join("; ") + ".");
  }
  return lines;
}

/** Company-specific watch questions from the actual exposure chains.
    Themes whose recorded chains share head and tail ask ONE question — the
    same underlying transmission is never asked three times with different
    figures. Chainless themes fall back to themeWatch, deduplicated. */
function buildWatch(linked: ThemeIntelligence[], companyName: string): DossierWatchItem[] {
  interface Group { head: string; tail: string; themes: ThemeIntelligence[] }
  const groups = new Map<string, Group>();
  const fallbacks = new Map<string, DossierWatchItem>();

  for (const t of linked) {
    const hops = (t.causal_narrative || "").split("→").map(s => s.trim()).filter(Boolean);
    if (hops.length >= 2) {
      const key = `${hops[0].toLowerCase()}»${hops[hops.length - 1].toLowerCase()}`;
      const g = groups.get(key);
      if (g) g.themes.push(t);
      else groups.set(key, { head: hops[0], tail: hops[hops.length - 1], themes: [t] });
    } else {
      const text = themeWatch(t);
      if (!text) continue;
      const key = text.toLowerCase().replace(/\s+/g, " ").trim();
      const existing = fallbacks.get(key);
      const themeName = cleanThemeName(t.name);
      if (existing) { if (!existing.sourceTheme.includes(themeName)) existing.sourceTheme += ` · ${themeName}`; }
      else fallbacks.set(key, { text, sourceTheme: themeName });
    }
  }

  const items: DossierWatchItem[] = [];
  for (const g of groups.values()) {
    const named = g.themes
      .map(t => `${cleanThemeName(t.name)} (${Math.round(t.confidence ?? 0)})`)
      .join(", ");
    const lead = g.themes[0];
    items.push(g.themes.length === 1
      ? {
          text: `Does ${g.head} keep feeding ${g.tail}? That chain is why ${companyName} is exposed — ` +
                `conviction ${Math.round(lead.confidence ?? 0)}, ${lead.momentum_label || "emerging"}, ` +
                `${lead.evidence_count ?? 0} sources this cycle.`,
          sourceTheme: cleanThemeName(lead.name),
        }
      : {
          text: `Does ${g.head} keep feeding ${g.tail}? That one recorded chain carries ` +
                `${companyName}'s exposure across ${named} — if it breaks, all of them weaken together.`,
          sourceTheme: g.themes.map(t => cleanThemeName(t.name)).join(" · "),
        });
  }
  return [...items, ...fallbacks.values()];
}

/**
 * Build the company file from the live feed cycle. Memory and ledger sections
 * fetch separately (M3 read APIs) — this covers the spine's live projection:
 * identity, standing view, exposures, event record, coverage, watch.
 * Returns a dossier even when the file is thin — thin is honest, absence is
 * stated by the sections; only a null feed yields null (page renders loading).
 */
export function buildCompanyDossier(ticker: string, feed: FeedResponse | null): CompanyDossier | null {
  if (!feed) return null;
  const T = ticker.toUpperCase();

  const info = tickerInfo(T);
  const themes = feed.theme_intelligence ?? [];

  // exposures: themes whose curated assets name this ticker
  const linked = themes
    .filter(t => (t.related_assets ?? []).some(a => a.toUpperCase() === T))
    .sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0) || a.id.localeCompare(b.id));
  const dominantId = themes.length
    ? [...themes].sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0) || a.id.localeCompare(b.id))[0].id
    : null;
  const name = info?.name ?? T;
  const exposures = linked.map(t => exposureOf(t, dominantId, name));

  // attribute every associated event: named directly → the record;
  // exposure-connected → related developments with the reason stated
  const ctx: AttributionCtx = {
    ticker: T,
    sector: info?.sector ?? null,
    industries: new Set([
      ...(info?.sector ? [info.sector.toLowerCase()] : []),
      ...linked.flatMap(t => (t.related_industries ?? []).map(i => i.toLowerCase())),
    ]),
    themeIds: new Set(linked.map(t => t.id)),
    themeNameById: new Map(linked.map(t => [t.id, cleanThemeName(t.name)])),
  };
  const record: AttributedEvent[] = [];
  const related: AttributedEvent[] = [];
  for (const e of feed.events ?? []) {
    if (!(e.companies ?? []).includes(T)) continue;   // engine association is the gate
    const attributed = classifyAttribution(e, ctx);
    if (!attributed) continue;                        // too weak to include
    (attributed.attribution === "direct" ? record : related).push(attributed);
  }

  const firstSeens = record.map(r => r.event.first_seen).filter(Boolean).sort();
  const coverage: DossierCoverage = {
    events: record.length,
    related: related.length,
    evidence: record.reduce((s, r) => s + (r.event.evidence?.length ?? 0), 0),
    corroborated: record.filter(r => r.event.corroboration_count >= 2).length,
    themes: linked.length,
    firstSeen: firstSeens[0] ?? null,
  };
  return {
    kind: "company",
    uid: companyUid(T),
    ticker: T,
    name,
    sector: info?.sector ?? null,
    exchange: info?.exchange ?? null,
    identified: !!info,
    standing: {
      sentences: standingSentences(name, exposures, coverage),
      hasThesis: exposures.length > 0,
      onDominantPath: exposures.some(e => e.dominant),
    },
    exposures,
    record,
    related,
    coverage,
    watch: buildWatch(linked, name),
    linkedThemes: linked,
  };
}
