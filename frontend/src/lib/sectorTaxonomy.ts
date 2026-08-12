/**
 * lib/sectorTaxonomy.ts — the ONE canonical sector/industry taxonomy contract
 * (RC2-G3).
 *
 * THE problem this solves: `ThemeIntelligence.related_industries` speaks a pure
 * INDUSTRY vocabulary (all 11 emitted values are exact `industryConfig`
 * industry names), but the graph typed every one of them as a `Sector`. Seven
 * of the twelve curated industries carry a name identical to their parent
 * sector (Energy, Financials, Industrials, Consumer, Healthcare, Real Estate,
 * Utilities), so the error was invisible — until the four industries whose name
 * DIFFERS from their sector (Semiconductors, Software, Crypto & Digital Assets
 * -> Technology; Aerospace & Defense -> Industrials) made a whole sector look
 * empty. Technology carried zero theme edges while ten canonical themes named
 * its industries.
 *
 * The contract:
 *
 *     Theme --affects--> Industry --belongs_to--> Sector
 *
 * The Theme -> Industry edge preserves the MOST SPECIFIC claim the source
 * actually made: a theme that said "Semiconductors" is recorded as
 * Semiconductors and is never rewritten as "Technology". Sector exposure is
 * DERIVED by rolling up through `belongs_to`; a Theme -> Sector edge is never
 * duplicated for convenience.
 *
 * This module does NOT introduce a taxonomy. It reads the single existing
 * authority — `industryConfig.INDUSTRIES`, whose `sector` field already maps
 * all 12 industries onto 9 sectors and covers 11 of 11 emitted values. The
 * backend `app/sectors.py INDUSTRY_MAP` is a DIFFERENT axis (thematic
 * industries: AI Infrastructure, Data Centers, Private Credit...) and is
 * deliberately not consulted here.
 *
 * Pure module. No graph writes, no UI.
 */

import { INDUSTRIES } from "./industryConfig";
import { normalizeKey } from "./intelligenceGraph";

/** Industry name -> parent sector, from the one existing authority. */
export const INDUSTRY_TO_SECTOR: ReadonlyMap<string, string> = new Map(
  INDUSTRIES.map((i) => [i.name, i.sector]),
);

/** Parent sector -> its constituent industries. */
export const SECTOR_TO_INDUSTRIES: ReadonlyMap<string, readonly string[]> = (() => {
  const m = new Map<string, string[]>();
  for (const i of INDUSTRIES) (m.get(i.sector) ?? m.set(i.sector, []).get(i.sector)!).push(i.name);
  return m;
})();

/**
 * Industries whose parent sector is AMBIGUOUS and must stay unresolved.
 *
 * "Consumer" collapses two distinct canonical sectors that the frozen Market
 * taxonomy (lib/marketBlocks.ts) keeps apart with different proxies AND
 * different buckets — Consumer Staples (XLP, defensive) and Consumer
 * Discretionary (XLY, cyclical). That bucket split is load-bearing in
 * marketView.buildPosture ("toward defensives" vs "into cyclicals"), so
 * collapsing it would destroy the very distinction the Rotation Map exists to
 * express. Its own keyAssets mix both (WMT/COST/MCD alongside TSLA/HD/NKE).
 *
 * Theme -> Industry("Consumer") relationships are PRESERVED in full; only the
 * Industry -> Sector rollup is withheld, until the source ontology emits
 * "Consumer Staples" and "Consumer Discretionary" separately.
 * Recorded as a source-taxonomy follow-up, not resolved by a guess here.
 */
export const AMBIGUOUS_INDUSTRIES: ReadonlySet<string> = new Set(["Consumer"]);

/** Canonical graph id for an Industry node. Namespaced so it can never collide
 *  with the Sector of the same name (Industry("Energy") != Sector("Energy")).
 *  Returns the NORMALIZED id the graph actually stores, so callers can use it
 *  for a direct `getNode` without a second normalization step. */
export const industryNodeId = (name: string): string => normalizeKey(`industry:${name}`);

/** True when the value is a known industry in the canonical taxonomy. */
export const isCanonicalIndustry = (name: string): boolean => INDUSTRY_TO_SECTOR.has(name);

/**
 * The industry's parent sector, or null when it cannot be resolved honestly:
 * an unknown industry, or an ambiguous aggregate. Never guesses a parent.
 */
export function parentSectorOf(industry: string): string | null {
  if (AMBIGUOUS_INDUSTRIES.has(industry)) return null;
  return INDUSTRY_TO_SECTOR.get(industry) ?? null;
}

/** Why a parent sector is unavailable — for honest reporting, never for copy. */
export function unresolvedReason(industry: string): "ambiguous" | "unknown" | null {
  if (AMBIGUOUS_INDUSTRIES.has(industry)) return "ambiguous";
  return INDUSTRY_TO_SECTOR.has(industry) ? null : "unknown";
}

/** The industries that roll up into a sector (empty for an unknown sector). */
export const industriesOfSector = (sector: string): readonly string[] =>
  SECTOR_TO_INDUSTRIES.get(sector) ?? [];

/* ------------------------------------------------------------------ *
 * Sector exposure rollup
 *
 * The ONLY sanctioned way to read sector-level thematic exposure. It walks the
 * recorded hierarchy — Sector <-belongs_to- Industry <-affects- Theme — so
 * every result traces to two real edges. It never reads a Theme -> Sector edge
 * (none is written) and never infers a parent.
 * ------------------------------------------------------------------ */

import { intelligenceGraph as G } from "./intelligenceGraph";

export interface SectorExposure {
  sector: string;
  /** Themes reaching the sector, with the industry that carried them. */
  themes: { label: string; viaIndustry: string; strength: number }[];
  /** Industries that resolved into this sector and carried at least one theme. */
  industries: string[];
  /** Industries that name this sector but are unresolved (ambiguous/unknown). */
  withheld: { industry: string; reason: "ambiguous" | "unknown" }[];
  /** False when the sector node is absent or no industry rolls into it. */
  resolved: boolean;
}

/**
 * Roll canonical theme exposure up to a sector through `belongs_to`.
 * Deterministic: themes are ranked by the recorded edge strength, then label.
 */
export function sectorExposure(sector: string): SectorExposure {
  const withheld: SectorExposure["withheld"] = [];
  for (const ind of industriesOfSector(sector)) {
    const reason = unresolvedReason(ind);
    if (reason) withheld.push({ industry: ind, reason });
  }

  const sectorNode = G.getNodeOfType(sector, "Sector");
  if (!sectorNode) return { sector, themes: [], industries: [], withheld, resolved: false };

  const seen = new Map<string, { label: string; viaIndustry: string; strength: number }>();
  const industries: string[] = [];

  for (const { node: industry, edge } of G.getNeighbors(sectorNode.id)) {
    if (industry.type !== "Industry" || edge.relationshipType !== "belongs_to") continue;
    let carried = false;
    for (const { node: theme, edge: te } of G.getNeighbors(industry.id)) {
      if (theme.type !== "Theme" || te.relationshipType !== "affects") continue;
      carried = true;
      const prev = seen.get(theme.id);
      if (!prev || te.strength > prev.strength) {
        seen.set(theme.id, { label: theme.label, viaIndustry: industry.label, strength: te.strength });
      }
    }
    if (carried) industries.push(industry.label);
  }

  const themes = [...seen.values()].sort(
    (a, b) => (b.strength - a.strength) || a.label.localeCompare(b.label));
  return { sector, themes, industries: industries.sort(), withheld, resolved: true };
}
