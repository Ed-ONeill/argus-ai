/**
 * lib/marketMap.ts, Argus Market Map adapter + morning desk note.
 *
 * Turns live theme intelligence + market state into:
 *   • a GraphModel for the reusable NetworkGraph engine (macro driver → theme →
 *     sector → assets, a capital-transmission map of how markets are moving), and
 *   • a "Today's Market Story" institutional desk note (deterministic, no LLM).
 *
 * Pure read of stored theme fields, nothing invented.
 */

import type { ThemeIntelligence } from "@/lib/types";
import { themeBeneficiaries } from "@/lib/themeIntelligence";
import { tickerInfo } from "@/lib/maIntelligence";
import { cleanThemeName } from "@/app/markets/marketsShared";
import { sanitizeCopy } from "@/lib/utils";
import { dirOf, deriveDriver, deriveSector } from "@/lib/themeTransmission";
import type { GraphModel, GraphNode, GraphEdge, RelationType } from "@/lib/graph/types";

export { transmissionPath, themeWatch } from "@/lib/themeTransmission";

export interface MarketSnapshot {
  riskRegime: "risk-on" | "neutral" | "risk-off";
  volRegime?: string;
  regimeLabel?: string;
}

// Tickers common to the market map that aren't in the M&A TICKER_META dictionary.
const MKT_TICKERS: Record<string, { name: string; sector: string }> = {
  NEE: { name: "NextEra Energy", sector: "Utilities" },
  VST: { name: "Vistra Corp.", sector: "Utilities" },
  DUK: { name: "Duke Energy", sector: "Utilities" },
  SO:  { name: "Southern Company", sector: "Utilities" },
  ARES:{ name: "Ares Management", sector: "Financials" },
  TLT: { name: "iShares 20+ Yr Treasury", sector: "Rates" },
  IEF: { name: "iShares 7-10 Yr Treasury", sector: "Rates" },
  HYG: { name: "iShares High-Yield Credit", sector: "Credit" },
  USO: { name: "United States Oil Fund", sector: "Energy" },
  GLD: { name: "SPDR Gold Shares", sector: "Commodities" },
  SLB: { name: "SLB (Schlumberger)", sector: "Energy" },
  ETN: { name: "Eaton Corporation", sector: "Industrials" },
  GEV: { name: "GE Vernova", sector: "Industrials" },
  SMCI:{ name: "Super Micro Computer", sector: "Technology" },
};
function assetMeta(t: string): { name?: string; sector?: string; exchange?: string } {
  const info = tickerInfo(t);
  if (info) return { name: info.name, sector: info.sector, exchange: info.exchange };
  const m = MKT_TICKERS[t.toUpperCase()];
  return m ? { name: m.name, sector: m.sector } : {};
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

/** Build the Argus Market Map: macro driver → theme → sector → assets. */
export function buildMarketMap(themes: ThemeIntelligence[], snap: MarketSnapshot): GraphModel {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const seen = new Set<string>();
  const add = (n: GraphNode) => { if (!seen.has(n.id)) { seen.add(n.id); nodes.push(n); } };
  const link = (s: string, t: string, type: RelationType, weight: number, stage: number, reason?: string, ths?: string[]) => {
    if (seen.has(s) && seen.has(t)) edges.push({ source: s, target: t, type, weight, stage, reason, themes: ths });
  };

  const centerId = "market";
  const regimeLabel = snap.regimeLabel || (snap.riskRegime === "risk-on" ? "Risk-On" : snap.riskRegime === "risk-off" ? "Risk-Off" : "Mixed");
  add({ id: centerId, label: "Market Center", kind: "event", role: "event", stage: 0, name: "Today's Market Center", reason: `Current regime: ${regimeLabel}` });

  const ranked = [...themes].sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0)).slice(0, 6);

  for (const t of ranked) {
    const sector = deriveSector(t);
    const tickers = themeBeneficiaries(t, 3);
    if (!sector || tickers.length === 0) continue;
    const name = cleanThemeName(t.name);
    const conf = Math.round(t.confidence ?? 60);
    const dir = dirOf(t);
    const driver = deriveDriver(t);

    // macro driver (deduped across themes that share one)
    const drvId = `drv:${slug(driver)}`;
    add({ id: drvId, label: driver, kind: "group", role: "cross-sector", stage: 1, reason: "Macro driver feeding the narrative" });
    link(centerId, drvId, "cross-sector", 0.6, 1, "Macro driver");

    // theme
    const thId = `th:${slug(name)}`;
    add({ id: thId, label: name, kind: "theme", role: "theme", stage: 1, confidence: conf, themes: [name], reason: t.causal_narrative || "Active market narrative", recenterable: false });
    link(drvId, thId, "theme", Math.max(0.45, conf / 100), 1, "Narrative", [name]);

    // sector (deduped)
    const secId = `sec:${slug(sector)}`;
    add({ id: secId, label: sector, kind: "sector", role: "sector", stage: 2, themes: [name], reason: "Sector carrying the transmission" });
    link(thId, secId, "sector", 0.66, 2, "Sector", [name]);

    // assets, coloured by the theme's direction (bullish=beneficiary, bearish=pressured)
    const role: RelationType = dir === "bearish" ? "competitor" : dir === "neutral" ? "supplier" : "beneficiary";
    tickers.forEach((tk, i) => {
      const meta = assetMeta(tk);
      const id = `co:${tk}`;
      add({ id, label: tk, kind: "company", role, stage: 3, ticker: tk, confidence: Math.max(40, conf - 6 - i * 4), beneficiaryScore: dir === "bearish" ? 36 - i * 5 : 78 - i * 7, themes: [name], isPublic: true, reason: dir === "bearish" ? "Pressured by the narrative" : "Expression of the narrative", ...meta });
      link(secId, id, role, 0.6 - i * 0.07, 3, dir === "bearish" ? "Pressured" : "Expression", [name]);
    });
  }

  return { id: `market:${Date.now()}`, centerId, title: "Argus Market Map", subtitle: regimeLabel, nodes, edges };
}

// ── Today's Market Story, institutional morning desk note (deterministic) ─────
export interface MarketStory { paragraph: string; watch: string; movers: string[] }

function confirmSignal(driver: string): string {
  const d = driver.toLowerCase();
  if (/rate|yield|fed|policy|financ/.test(d)) return "whether bond yields confirm the move or reverse it";
  if (/energy|oil|crude|supply/.test(d)) return "whether crude holds its bid or fades";
  if (/dollar|fx|currenc/.test(d)) return "whether the dollar extends or stalls";
  if (/inflation|cpi|price/.test(d)) return "the next inflation print for confirmation";
  if (/credit|spread|default/.test(d)) return "whether credit spreads widen from here";
  return "whether rates and the dollar confirm the rotation";
}

export function buildMarketStory(themes: ThemeIntelligence[], snap: MarketSnapshot): MarketStory | null {
  const ranked = [...themes]
    .filter(t => deriveSector(t) && themeBeneficiaries(t, 1).length)
    .sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0))
    .slice(0, 5);
  if (ranked.length === 0) return null;

  const bull = ranked.filter(t => dirOf(t) === "bullish");
  const bear = ranked.filter(t => dirOf(t) === "bearish");
  const uniq = (a: string[]) => [...new Set(a)].filter(Boolean);
  const favored  = uniq(bull.map(t => deriveSector(t) as string)).slice(0, 2);
  const pressured = uniq(bear.map(t => deriveSector(t) as string)).slice(0, 2);
  const lead = ranked[0];
  const driver = deriveDriver(lead);

  // 1, what is moving
  const leadName = cleanThemeName(lead.name).toLowerCase();
  let s1: string;
  if (bull.length && bear.length) {
    s1 = `Markets are repricing ${cleanThemeName(bull[0].name).toLowerCase()} and ${cleanThemeName(bear[0].name).toLowerCase()} at the same time.`;
  } else if (snap.riskRegime === "risk-off") {
    s1 = `Markets are de-risking around ${leadName}, with conviction concentrating rather than broadening.`;
  } else if (snap.riskRegime === "risk-on") {
    s1 = `Markets are leaning into ${leadName}, rewarding the narrative as risk appetite holds.`;
  } else {
    s1 = `Markets are working through ${leadName} without a decisive regime tilt.`;
  }

  // 2, rotation
  let s2: string;
  if (favored.length && pressured.length) {
    s2 = `The immediate rotation favors ${favored.join(" and ")} while keeping ${pressured.join(" and ")} under pressure.`;
  } else if (favored.length) {
    s2 = `Flows tilt toward ${favored.join(" and ")}, with the rest of the tape following rather than leading.`;
  } else if (pressured.length) {
    s2 = `${pressured.join(" and ")} carry the pressure; nothing is yet attracting decisive sponsorship.`;
  } else {
    s2 = `Sector leadership is unsettled, positioning is rotating faster than the narrative is resolving.`;
  }

  // 3, what to watch
  const s3 = `The next signal is ${confirmSignal(driver)}.`;

  return {
    paragraph: sanitizeCopy(`${s1} ${s2}`),
    watch: sanitizeCopy(s3),
    movers: ranked.slice(0, 4).map(t => cleanThemeName(t.name)),
  };
}
