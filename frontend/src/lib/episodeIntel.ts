/**
 * lib/episodeIntel.ts - the episode card's intelligence panel, as a THIN
 * PROJECTION of shared engines (rewritten in Phase 2.4 Listen unification).
 *
 * The previous version INVENTED market meaning per episode: keyword-rule
 * catalysts and risks (catalystOf/riskOf), templated implications ("tailwind
 * for X, cleanest expressions..."), bull/bear cases, and rotating pseudo-
 * generated labels. All of that is deleted. Every meaningful field now comes
 * from a shared object:
 *
 *   read / thesis   <- the theme's backend causal narrative (pipeline
 *                      meaning, re-voiced - never a local template)
 *   risk            <- lib/riskRead (prediction invalidation + evidence
 *                      contradictions - the same records Explorer shows)
 *   catalyst        <- theRead.verifiedCatalystsFor (verified, DATELESS) or
 *                      the canonical derived watch line (intelligenceDeltas)
 *   beneficiaries   <- recorded pipeline exposure (related_assets tickers)
 *   atRisk          <- stored negative-weight sectors (recorded fields)
 *
 * similarEpisodes / counterPositionedEpisodes are SELECTION over canonical
 * fields (same-theme membership; opposite recorded momentum_direction over
 * shared exposure). They create no records and infer no episode stance -
 * shared contradiction records live on the risks fields.
 *
 * Pure reads; degrades to nulls, never fabricates. No em/en dashes.
 */

import { sanitizeCopy } from "./utils";
import { buildRiskRead } from "./riskRead";
import { watchLineOf } from "./intelligenceDeltas";
import type { Episode, ThemeIntelligence } from "./types";

const isTicker = (s: string) => /^[A-Z][A-Z.]{0,5}$/.test(s);
const dirOf = (t: ThemeIntelligence): 1 | 0 | -1 => t.momentum_direction === "bullish" ? 1 : t.momentum_direction === "bearish" ? -1 : 0;

function deriveSector(t: ThemeIntelligence): string | null {
  const inds = t.related_industries ?? [];
  return inds.find(s => t.relationship_weights?.[s]?.direction === "positive") ?? inds[0] ?? null;
}
function negativeSectors(t: ThemeIntelligence): string[] {
  return (t.related_industries ?? []).filter(s => t.relationship_weights?.[s]?.direction === "negative");
}
function firstSentence(s?: string): string | null {
  if (!s) return null;
  const c = s.replace(/→/g, ", ").replace(/ {2,}/g, " ").trim();
  const dot = c.indexOf(". ");
  return dot > 12 ? c.slice(0, dot + 1) : c.length <= 165 ? c : null;
}

export interface EpisodeIntel {
  /** Fixed honest label (the rotating pseudo-generated labels are retired). */
  label: string;
  /** The theme's own backend narrative sentence - pipeline meaning re-voiced.
      Null when the pipeline recorded none (the card falls back to relevance
      phrasing, which is presentation, not meaning). */
  read: string | null;
  beneficiaries: string[];        // recorded pipeline exposure (tickers)
  atRisk: string[];               // stored negative-weight sectors
  /** Verified dateless catalyst, or the canonical derived watch line. */
  catalyst: string;
  catalystBasis: "verified" | "derived-watch";
  /** Shared risk record (prediction invalidation, else top contradiction).
      Null when the shared engines record none - never a keyword template. */
  risk: string | null;
  /** Top shared contradiction record, verbatim (replaces the invented
      "contrarian" template). */
  contrarian: string | null;
  confidence: number;
}

export function episodeIntel(ep: Episode, theme: ThemeIntelligence | null | undefined): EpisodeIntel | null {
  if (!theme) return null;
  const rr = buildRiskRead(theme.name, theme);
  const verified = rr.basis === "graph" ? rr.catalysts[0] ?? null : null;
  const read = firstSentence(theme.causal_narrative);

  return {
    label: "Why It Matters",
    read: read ? sanitizeCopy(read) : null,
    beneficiaries: (theme.related_assets ?? []).filter(isTicker).slice(0, 4),
    atRisk: negativeSectors(theme).slice(0, 2),
    catalyst: verified ? sanitizeCopy(verified.label) : sanitizeCopy(`Watch ${watchLineOf(theme)}`),
    catalystBasis: verified ? "verified" : "derived-watch",
    risk: rr.invalidation ?? rr.contradictions[0]?.detail ?? null,
    contrarian: rr.contradictions[0]?.detail ?? null,
    confidence: Math.round(theme.confidence ?? 0),
  };
}

/* ------------------------------------------------------------------ *
 * Expanded briefing - shared records only
 * ------------------------------------------------------------------ */

const uniq = (a: string[]) => [...new Set(a.filter(Boolean))];
function stateVerb(t: ThemeIntelligence): string {
  switch (t.momentum_label) {
    case "accelerating":  return "is accelerating";
    case "strengthening": return "is strengthening";
    case "emerging":      return "is emerging";
    case "cooling":       return "is cooling";
    case "reversing":     return "is reversing";
    default:              return "is active";
  }
}

export interface EpisodeBriefing {
  /** Episode's own description sentence (factual content) + the theme's
      current state (canonical momentum field). */
  executiveSummary: string;
  /** The theme's backend causal narrative - pipeline meaning, never local. */
  thesis: string | null;
  /** Shared risk records, verbatim (riskRead: invalidation + contradictions). */
  risks: string[];
  risksBasis: "shared-engines" | "unavailable";
  /** Verified dateless catalysts + the canonical derived watch line. */
  catalysts: string[];
  /** Stored factual linkage chips (macro factors / topics) - facts, not meaning. */
  relatedNarratives: string[];
}

export function buildBriefing(ep: Episode, theme: ThemeIntelligence | null | undefined): EpisodeBriefing | null {
  if (!theme) return null;
  const rr = buildRiskRead(theme.name, theme);
  const name = theme.name.replace(/\s*[-–—:].*$/, "").trim();
  const sector = deriveSector(theme);
  const desc = firstSentence(ep.description);
  const narrative = firstSentence(theme.causal_narrative);

  const risks = rr.basis === "graph"
    ? uniq([rr.invalidation ?? "", ...rr.contradictions.map(c => c.detail)]).slice(0, 3)
    : [];
  const verified = rr.basis === "graph" ? rr.catalysts.map(c => `${c.label} (verified, no date)`) : [];

  return {
    executiveSummary: sanitizeCopy(
      `${desc ? `${desc} ` : ""}${name} ${stateVerb(theme)}${sector ? `, centered in ${sector}` : ""}.`,
    ),
    thesis: narrative ? sanitizeCopy(narrative) : null,
    risks: risks.map(sanitizeCopy),
    risksBasis: rr.basis === "graph" ? "shared-engines" : "unavailable",
    catalysts: uniq([...verified, `Watch ${watchLineOf(theme)} (derived)`]).slice(0, 3).map(sanitizeCopy),
    relatedNarratives: uniq([...(theme.related_macro_factors ?? []), ...(theme.podcast_topics ?? [])]).slice(0, 5).map(sanitizeCopy),
  };
}

/* ------------------------------------------------------------------ *
 * Corpus selection (no records created, no stance inferred)
 * ------------------------------------------------------------------ */

export function similarEpisodes(ep: Episode, theme: ThemeIntelligence | null | undefined, all: Episode[], themesOf: Map<string, ThemeIntelligence[]>): Episode[] {
  if (!theme) return [];
  return all.filter(e => e.id !== ep.id && (themesOf.get(e.id) ?? []).some(t => t.id === theme.id)).slice(0, 3);
}

/** Episodes attached to themes with the OPPOSITE recorded momentum_direction
    over shared exposure. A counter-POSITIONING selection over canonical
    fields - explicitly NOT a contradiction record (those come from the
    evidence engine via riskRead). */
export function counterPositionedEpisodes(ep: Episode, theme: ThemeIntelligence | null | undefined, all: Episode[], themesOf: Map<string, ThemeIntelligence[]>): Episode[] {
  if (!theme) return [];
  const dir = dirOf(theme);
  if (dir === 0) return [];
  const sector = deriveSector(theme);
  const cos = new Set(ep.entities.filter(isTicker).map(e => e.toUpperCase()));
  return all.filter(e => {
    if (e.id === ep.id) return false;
    const ts = themesOf.get(e.id) ?? [];
    return ts.some(t => dirOf(t) === -dir && (
      (sector && (t.related_industries ?? []).includes(sector)) ||
      e.entities.some(x => cos.has(x.toUpperCase()))
    ));
  }).slice(0, 3);
}
