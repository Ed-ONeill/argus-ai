/**
 * lib/listenConsensus.ts — collective podcast intelligence.
 *
 * Synthesizes what ALL podcasts are collectively saying from the matched themes +
 * episode entities: conversation consensus, the most bullish/bearish theme, the
 * fastest-growing narrative, the most-mentioned company / sector / voice / macro
 * topic, and a "Wall Street Consensus" read on the leading conviction theme.
 *
 * Deterministic — every figure derives from a real field (theme momentum/confidence,
 * entity frequency across episodes). Dependency-light (only the person detector).
 */

import { looksLikePerson } from "./listenIntelligence";
import type { Episode, ThemeIntelligence } from "./types";
import type { ThemeEpisodeGroup } from "./listenIntelligence";

const dirOf = (t: ThemeIntelligence) => t.momentum_direction === "bullish" ? 1 : t.momentum_direction === "bearish" ? -1 : 0;
const cleanName = (s: string) => s.replace(/\s*[-–—:].*$/, "").trim();

function topCount(pairs: Iterable<[string, number]>): { label: string; count: number } | null {
  let best: { label: string; count: number } | null = null;
  for (const [label, count] of pairs) if (!best || count > best.count) best = { label, count };
  return best && best.count > 0 ? best : null;
}

export interface Consensus { pct: number; label: "Bullish" | "Bearish" | "Mixed"; color: string; themeCount: number; podcastCount: number }
export interface IntelWidget { label: string; value: string; sub?: string; color?: string }

export interface WallStreet { theme: string; pct: number; direction: "Bullish" | "Bearish"; podcasts: number; shows: string[] }

export interface CollectiveIntel {
  consensus:    Consensus;
  widgets:      IntelWidget[];
  wallStreet:   WallStreet | null;
}

export function buildCollectiveIntel(
  episodes: Episode[], themes: ThemeIntelligence[], groups: ThemeEpisodeGroup[],
): CollectiveIntel | null {
  if (groups.length === 0) return null;

  // ── Consensus — bullish vs bearish, weighted by discussion volume ──
  let bull = 0, bear = 0;
  for (const g of groups) {
    const d = dirOf(g.theme);
    if (d > 0) bull += g.matchCount; else if (d < 0) bear += g.matchCount;
  }
  const total = bull + bear;
  const pct   = total ? Math.round((bull / total) * 100) : 50;
  const cLabel: Consensus["label"] = pct >= 55 ? "Bullish" : pct <= 45 ? "Bearish" : "Mixed";
  const consensus: Consensus = {
    pct, label: cLabel,
    color: cLabel === "Bullish" ? "#10B981" : cLabel === "Bearish" ? "#EF4444" : "#94A3B8",
    themeCount: groups.length,
    podcastCount: groups.reduce((s, g) => s + g.matchCount, 0),
  };

  // ── Themes by sentiment / momentum ──
  const score = (g: ThemeEpisodeGroup) => (g.theme.confidence ?? 0) * (1 + g.matchCount / 6);
  const bullThemes = groups.filter(g => dirOf(g.theme) > 0).sort((a, b) => score(b) - score(a));
  const bearThemes = groups.filter(g => dirOf(g.theme) < 0).sort((a, b) => score(b) - score(a));
  const fastest    = [...groups].sort((a, b) => (b.theme.momentum_delta ?? 0) - (a.theme.momentum_delta ?? 0))[0];

  // ── Entity frequency across episodes (companies / people) ──
  const companyCount = new Map<string, number>();
  const personCount  = new Map<string, number>();
  for (const ep of episodes) {
    for (const e of ep.entities) {
      const m = looksLikePerson(e) ? personCount : companyCount;
      m.set(e, (m.get(e) ?? 0) + 1);
    }
  }
  // ── Sector / macro frequency from matched themes, weighted by discussion volume ──
  const sectorCount = new Map<string, number>();
  const macroCount  = new Map<string, number>();
  for (const g of groups) {
    for (const s of g.theme.related_industries ?? []) sectorCount.set(s, (sectorCount.get(s) ?? 0) + g.matchCount);
    for (const m of g.theme.related_macro_factors ?? []) macroCount.set(m, (macroCount.get(m) ?? 0) + g.matchCount);
  }

  const topCompany = topCount(companyCount);
  const topPerson  = topCount(personCount);
  const topSector  = topCount(sectorCount);
  const topMacro   = topCount(macroCount);

  const widgets: IntelWidget[] = [
    { label: "Most Bullish Theme", value: bullThemes[0] ? cleanName(bullThemes[0].theme.name) : "—",
      sub: bullThemes[0] ? `Conviction ${Math.round(bullThemes[0].theme.confidence ?? 0)}` : undefined, color: "#10B981" },
    { label: "Most Bearish Theme", value: bearThemes[0] ? cleanName(bearThemes[0].theme.name) : "—",
      sub: bearThemes[0] ? `Conviction ${Math.round(bearThemes[0].theme.confidence ?? 0)}` : undefined, color: "#EF4444" },
    { label: "Fastest-Growing Narrative", value: fastest ? cleanName(fastest.theme.name) : "—",
      sub: fastest ? `▲ +${Math.round(fastest.theme.momentum_delta ?? 0)} momentum` : undefined, color: "#52b0c8" },
    { label: "Most Mentioned Company", value: topCompany?.label ?? "—",
      sub: topCompany ? `${topCompany.count} episodes` : undefined },
    { label: "Most Mentioned Sector", value: topSector?.label ?? "—",
      sub: topSector ? `across ${topSector.count} discussions` : undefined },
    { label: "Most Mentioned Voice", value: topPerson?.label ?? "—",
      sub: topPerson ? `${topPerson.count} mentions` : undefined },
    { label: "Most Mentioned Macro Topic", value: topMacro?.label ?? "—",
      sub: topMacro ? `${topMacro.count} discussions` : undefined },
  ];

  // ── Wall Street Consensus — the leading conviction theme + who's discussing it ──
  const lead = (bullThemes[0] ?? bearThemes[0] ?? groups[0]);
  const wallStreet: WallStreet | null = lead ? {
    theme: cleanName(lead.theme.name),
    pct: Math.round(lead.theme.confidence ?? 0),
    direction: dirOf(lead.theme) < 0 ? "Bearish" : "Bullish",
    podcasts: lead.matchCount,
    shows: [...new Set(lead.episodes.map(e => e.show_name))].slice(0, 6),
  } : null;

  return { consensus, widgets, wallStreet };
}
