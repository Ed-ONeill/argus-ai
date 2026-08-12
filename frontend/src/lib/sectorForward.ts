/**
 * lib/sectorForward.ts — the Sector Forward View (RC2-G2).
 *
 *   Sector forward view = recorded thematic exposure, qualified by evidence
 *   support, reconciled against the sector's own measured price leadership.
 *
 * This is a PROJECTION of intelligence that already exists. It introduces no
 * model, no score, no probability and no prediction API. Every field traces to
 * one owner:
 *
 *   exposure   <- sectorTaxonomy.sectorExposure (Theme -affects-> Industry
 *                 -belongs_to-> Sector; carries its viaIndustry provenance)
 *   support    <- ThemeIntelligence.signal_quality / evidence_count /
 *                 breadth_score / cross_category_confirmed (backend pipeline)
 *   direction  <- ThemeIntelligence.momentum_direction, and ONLY that
 *   price      <- marketRotation.measureSector over the frozen Market-surface
 *                 ETF proxy (lib/marketBlocks), benchmarked to SPY
 *   chain      <- the carrying Industry's recorded Macro -> Theme -> Industry
 *
 * THE COLD-MEMORY RULE. Theme trajectory needs an accrued memory archive. On a
 * cold archive every theme reports momentum_direction "neutral" and
 * momentum_delta 0. That is ABSENCE OF HISTORY, not a bearish reading, so a
 * neutral theme contributes NOTHING to direction and is never counted as
 * evidence against a sector. When no exposed theme carries a direction, the
 * thematic direction is "unestablished" — never "flat", never "negative".
 *
 * We also never assert that a sector will rise because a theme is bullish. The
 * thematic reading and the price reading are two independent statements; the
 * view reports whether they agree, disagree, or cannot be compared.
 *
 * Pure module: no graph writes, no fetching, no clocks.
 */

import type { Leadership } from "./marketRotation";
import { INSIDE_STOCKS } from "./marketBlocks";
import { AMBIGUOUS_INDUSTRIES, industriesOfSector, type SectorExposure } from "./sectorTaxonomy";
import type { ThemeIntelligence } from "./types";

/* ------------------------------------------------------------------ *
 * Vocabulary — reuses existing Argus words. "rising / falling / flat"
 * is the Market surface's own leadership language (marketRotation.Direction).
 * ------------------------------------------------------------------ */

export type ThematicDirection = "positive" | "negative" | "unestablished";
export type PriceDirection = "rising" | "falling" | "flat" | "unavailable";

export type Reconciliation =
  | "confirmed"       // thematic and price agree
  | "divergent"       // thematic and price disagree
  | "thematic-only"   // a directional thematic setup, no directional price evidence
  | "price-only"      // measured leadership, thematic direction not established
  | "unavailable";    // neither side is sufficient

export type UnavailableReason =
  | "ambiguous-taxonomy"   // the sector aggregate is unresolved at source (Consumer)
  | "no-exposure"          // no canonical theme reaches this sector
  | "no-price-proxy"       // no frozen ETF proxy for this sector
  | null;

export interface ForwardExposureItem {
  theme: string;
  /** The Industry that carried this theme into the sector. Never collapsed. */
  viaIndustry: string;
  /** Verbatim pipeline support fields — never blended into a score. */
  signalQuality: string | null;
  evidenceCount: number | null;
  breadth: number | null;
  crossCategoryConfirmed: boolean | null;
  /** momentum_direction verbatim; "neutral" means no history, not bearish. */
  momentumDirection: string | null;
}

export interface SectorForwardView {
  sector: string;
  /** Recorded exposure with provenance, strongest recorded edge first. */
  exposure: ForwardExposureItem[];
  /** Industries that carried the exposure. */
  carryingIndustries: string[];
  thematic: {
    direction: ThematicDirection;
    /** The themes that actually carry a direction (empty when unestablished). */
    basis: string[];
    /** True when directional themes disagree with each other. */
    conflicted: boolean;
    /** True when exposure exists but no theme carries a direction (cold memory). */
    historyUnavailable: boolean;
  };
  price: {
    direction: PriceDirection;
    /** Leadership position vs the benchmark, verbatim from measureSector. */
    relStrength: number | null;
    proxy: string | null;
    proxyOf: string | null;
  };
  reconciliation: Reconciliation;
  reason: UnavailableReason;
  /** Macro -> Theme -> Industry, from the carrying Industry (G4). Never includes
   *  the structural Industry -> Sector hop. */
  chain: string[] | null;
  chainVia: string | null;
}

/* ------------------------------------------------------------------ *
 * Price proxy — read from the FROZEN Market-surface taxonomy, not redefined.
 * Consumer is deliberately absent: the source collapses Staples (XLP,
 * defensive) and Discretionary (XLY, cyclical), so no single proxy is honest.
 * ------------------------------------------------------------------ */

const PROXY_BY_SECTOR: ReadonlyMap<string, string> = new Map(
  INSIDE_STOCKS.filter((b) => b.kind === "sector").map((b) => [b.label, b.symbol]),
);

/** The frozen ETF proxy for a sector, or null when none is honest. */
export function sectorPriceProxy(sector: string): string | null {
  if (industriesOfSector(sector).some((i) => AMBIGUOUS_INDUSTRIES.has(i))) return null;
  return PROXY_BY_SECTOR.get(sector) ?? null;
}

/* ------------------------------------------------------------------ *
 * Builder
 * ------------------------------------------------------------------ */

export interface SectorForwardInput {
  sector: string;
  exposure: SectorExposure;
  /** Canonical themes, for the support + direction fields. */
  themes: ThemeIntelligence[];
  /** measureSector output for the sector's proxy; null when unavailable. */
  leadership?: Leadership | null;
  /** The carrying Industry's recorded chain (G4). */
  chain?: string[] | null;
  chainVia?: string | null;
}

const EMPTY = (sector: string, reason: UnavailableReason): SectorForwardView => ({
  sector, exposure: [], carryingIndustries: [],
  thematic: { direction: "unestablished", basis: [], conflicted: false, historyUnavailable: false },
  price: { direction: "unavailable", relStrength: null, proxy: null, proxyOf: null },
  reconciliation: "unavailable", reason, chain: null, chainVia: null,
});

/** momentum_direction -> a directional reading. "neutral" carries NO direction. */
function directionOf(momentum: string | null | undefined): "positive" | "negative" | null {
  if (momentum === "bullish") return "positive";
  if (momentum === "bearish") return "negative";
  return null;                      // neutral / missing = no history, not bearish
}

function priceDirectionOf(l: Leadership | null | undefined): PriceDirection {
  if (!l || l.absent) return "unavailable";
  return l.direction;               // "rising" | "falling" | "flat"
}

export function buildSectorForwardView(input: SectorForwardInput): SectorForwardView {
  const { sector, exposure, themes } = input;

  // The source taxonomy still collapses this aggregate — stay unresolved.
  if (industriesOfSector(sector).some((i) => AMBIGUOUS_INDUSTRIES.has(i))) {
    return EMPTY(sector, "ambiguous-taxonomy");
  }

  const byName = new Map(themes.map((t) => [t.name.toLowerCase(), t]));
  const items: ForwardExposureItem[] = exposure.themes.map((e) => {
    const t = byName.get(e.label.toLowerCase());
    return {
      theme: e.label,
      viaIndustry: e.viaIndustry,
      signalQuality: t?.signal_quality ?? null,
      evidenceCount: typeof t?.evidence_count === "number" ? t.evidence_count : null,
      breadth: typeof t?.breadth_score === "number" ? t.breadth_score : null,
      crossCategoryConfirmed: typeof t?.cross_category_confirmed === "boolean" ? t.cross_category_confirmed : null,
      momentumDirection: t?.momentum_direction ?? null,
    };
  });

  const proxy = sectorPriceProxy(sector);
  const priceDir = priceDirectionOf(input.leadership);
  const price = {
    direction: priceDir,
    relStrength: input.leadership && !input.leadership.absent ? input.leadership.relStrength : null,
    proxy: proxy,
    proxyOf: proxy ? sector : null,
  };

  if (items.length === 0) {
    // No thematic exposure. Price alone can still be a measured fact.
    const base = EMPTY(sector, proxy ? "no-exposure" : "no-price-proxy");
    if (priceDir === "rising" || priceDir === "falling") {
      return { ...base, price, reconciliation: "price-only", reason: "no-exposure" };
    }
    return { ...base, price };
  }

  // Thematic direction: ONLY from themes that actually carry one.
  const dirs = items.map((i) => directionOf(i.momentumDirection)).filter((d): d is "positive" | "negative" => !!d);
  const positives = dirs.filter((d) => d === "positive").length;
  const negatives = dirs.filter((d) => d === "negative").length;
  const conflicted = positives > 0 && negatives > 0;
  const direction: ThematicDirection =
    conflicted || dirs.length === 0 ? "unestablished" : positives > 0 ? "positive" : "negative";
  const basis = direction === "unestablished" ? []
    : items.filter((i) => directionOf(i.momentumDirection) === direction).map((i) => i.theme);

  const thematic = {
    direction, basis, conflicted,
    // Cold archive: exposure exists, but no theme carries any history yet.
    historyUnavailable: dirs.length === 0,
  };

  // Reconciliation — two independent statements compared, never blended.
  let reconciliation: Reconciliation;
  if (direction === "unestablished") {
    reconciliation = priceDir === "rising" || priceDir === "falling" ? "price-only" : "unavailable";
  } else if (priceDir === "unavailable" || priceDir === "flat") {
    reconciliation = "thematic-only";
  } else if ((direction === "positive" && priceDir === "rising") ||
             (direction === "negative" && priceDir === "falling")) {
    reconciliation = "confirmed";
  } else {
    reconciliation = "divergent";
  }

  return {
    sector,
    exposure: items,
    carryingIndustries: [...exposure.industries],
    thematic,
    price,
    reconciliation,
    reason: reconciliation === "unavailable" && !proxy ? "no-price-proxy" : null,
    chain: input.chain ?? null,
    chainVia: input.chainVia ?? null,
  };
}

/* ------------------------------------------------------------------ *
 * Presentation helper — one plain sentence, no score, no percentage.
 * Kept here so the surface renders a projection rather than composing prose.
 * ------------------------------------------------------------------ */

export function forwardViewSentence(v: SectorForwardView): string {
  const n = v.exposure.length;
  const via = v.carryingIndustries.length ? ` via ${v.carryingIndustries.join(", ")}` : "";
  const themeWord = `${n} recorded theme${n === 1 ? "" : "s"}${via}`;

  switch (v.reconciliation) {
    case "confirmed":
      return `Thematic setup ${v.thematic.direction} (${themeWord}); sector leadership ${v.price.direction}. Price confirms the thematic read.`;
    case "divergent":
      return `Thematic setup ${v.thematic.direction} (${themeWord}); sector leadership ${v.price.direction}. Price and thesis disagree.`;
    case "thematic-only":
      return `Thematic setup ${v.thematic.direction} (${themeWord}). No directional price confirmation available.`;
    case "price-only":
      return n > 0
        ? `Sector leadership ${v.price.direction}. ${themeWord} recorded, but no theme carries an established direction yet, so the thematic read is unavailable.`
        : `Sector leadership ${v.price.direction}. No canonical thematic exposure recorded.`;
    default:
      if (v.reason === "ambiguous-taxonomy")
        return "Unavailable: this sector aggregate is unresolved at source (Staples and Discretionary are collapsed).";
      if (v.reason === "no-price-proxy") return "Unavailable: no sector price proxy.";
      // Exposure can exist while BOTH directional readings are absent. Say so
      // precisely: claiming "no exposure" here would be false.
      if (n > 0)
        return `${themeWord} recorded, but no theme carries an established direction yet and there is no directional price evidence, so no forward view can be formed.`;
      return "Unavailable: no canonical thematic exposure and no directional price evidence.";
  }
}
