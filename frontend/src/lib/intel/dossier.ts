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

// ── Dossier view models (the grammar's sections) ───────────────────────────────

export interface DossierExposure {
  themeId: string;
  themeName: string;
  conviction: number;
  momentumLabel: string;
  direction: "bullish" | "bearish" | "neutral";
  /** Recorded causal narrative — the transmission chain in prose. */
  transmission: string;
  evidenceCount: number;
  dominant: boolean;
}

export interface DossierCoverage {
  events: number;
  evidence: number;
  corroborated: number;      // events with >= 2 qualified sources
  themes: number;
  /** Earliest event first_seen ISO — the file's observable start. Null when empty. */
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
  /** Events naming this company, in editorial rank order (engine-owned). */
  events: MarketEvent[];
  coverage: DossierCoverage;
  watch: DossierWatchItem[];
  /** Linked themes (full records) — the relationship map builds from these. */
  linkedThemes: ThemeIntelligence[];
}

// ── The company kind builder ────────────────────────────────────────────────────

const dirOf = (t: ThemeIntelligence): "bullish" | "bearish" | "neutral" =>
  t.momentum_direction === "bullish" ? "bullish"
  : t.momentum_direction === "bearish" ? "bearish" : "neutral";

function exposureOf(t: ThemeIntelligence, dominantId: string | null): DossierExposure {
  return {
    themeId: t.id,
    themeName: cleanThemeName(t.name),
    conviction: Math.round(t.confidence ?? 0),
    momentumLabel: t.momentum_label || "emerging",
    direction: dirOf(t),
    transmission: t.causal_narrative || "",
    evidenceCount: t.evidence_count ?? 0,
    dominant: dominantId !== null && t.id === dominantId,
  };
}

/** Standing View copy — 4B voice: numbers over adjectives, absence plain. */
function standingSentences(name: string, exposures: DossierExposure[],
                           coverage: DossierCoverage): string[] {
  if (!exposures.length) {
    const tail = coverage.events
      ? `${coverage.events} event${coverage.events === 1 ? "" : "s"} in the file; none currently transmit through a standing thesis.`
      : "No events in the current cycle name it.";
    return [`No standing thesis names ${name}.`, tail];
  }
  const top = exposures[0];
  const lines: string[] = [];
  lines.push(
    `${name} sits on the ${top.themeName} thesis — conviction ${top.conviction}, ${top.momentumLabel}` +
    (top.dominant ? "; the dominant narrative transmits into it." : "."));
  if (top.transmission) lines.push(top.transmission);
  if (exposures.length > 1) {
    const rest = exposures.slice(1).map(e => `${e.themeName} (${e.conviction})`).join(", ");
    lines.push(`Also named by ${rest}.`);
  }
  if (coverage.events) {
    lines.push(
      `${coverage.events} event${coverage.events === 1 ? "" : "s"} in the file, ` +
      `${coverage.corroborated} corroborated by two or more qualified sources.`);
  }
  return lines;
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
  const exposures = linked.map(t => exposureOf(t, dominantId));

  // the event record: engine-ranked events naming this company (order preserved)
  const events = (feed.events ?? []).filter(e => (e.companies ?? []).includes(T));

  const firstSeens = events.map(e => e.first_seen).filter(Boolean).sort();
  const coverage: DossierCoverage = {
    events: events.length,
    evidence: events.reduce((s, e) => s + (e.evidence?.length ?? 0), 0),
    corroborated: events.filter(e => e.corroboration_count >= 2).length,
    themes: linked.length,
    firstSeen: firstSeens[0] ?? null,
  };

  const name = info?.name ?? T;
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
    events,
    coverage,
    watch: linked.map(t => ({ text: themeWatch(t), sourceTheme: cleanThemeName(t.name) }))
                 .filter(w => !!w.text),
    linkedThemes: linked,
  };
}
