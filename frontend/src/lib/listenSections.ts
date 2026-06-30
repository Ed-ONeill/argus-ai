/**
 * lib/listenSections.ts, derivations for the Listen page's investment questions.
 *
 * The page is organized by the questions an allocator asks, not by podcast
 * category. Each function answers exactly one question from the already-extracted
 * corpus (theme groups + episode entities). Pure & deterministic, same data
 * sources, synthesized differently. The section components are thin renderers.
 */

import type { Episode, ThemeIntelligence } from "./types";
import { looksLikePerson, type ThemeEpisodeGroup } from "./listenIntelligence";

export const cleanName = (s: string) => s.replace(/\s*[-–—:].*$/, "").trim();
const dirOf = (t: ThemeIntelligence) => t.momentum_direction === "bullish" ? 1 : t.momentum_direction === "bearish" ? -1 : 0;
const distinctShows = (g: ThemeEpisodeGroup) => new Set(g.episodes.map(e => e.show_name)).size;
const isNew = (t: ThemeIntelligence) => t.momentum_label === "emerging" || !!t.memory?.is_new || t.memory?.status === "new";

export interface ThemeMove { theme: ThemeIntelligence; name: string; delta: number; direction: number; conviction: number; mentions: number }
function toMove(g: ThemeEpisodeGroup): ThemeMove {
  return { theme: g.theme, name: cleanName(g.theme.name), delta: Math.round(g.theme.momentum_delta ?? 0), direction: dirOf(g.theme), conviction: Math.round(g.theme.confidence ?? 0), mentions: g.matchCount };
}
export interface ThemeStat { theme: ThemeIntelligence; name: string; conviction: number; mentions: number; shows: number; direction: number; momentum: string }
function toStat(g: ThemeEpisodeGroup): ThemeStat {
  return { theme: g.theme, name: cleanName(g.theme.name), conviction: Math.round(g.theme.confidence ?? 0), mentions: g.matchCount, shows: distinctShows(g), direction: dirOf(g.theme), momentum: g.theme.momentum_label ?? "stable" };
}

// Q1 · What changed this week?, biggest narrative shifts (|Δ conviction vs prior cycle|).
export function whatChanged(groups: ThemeEpisodeGroup[]): ThemeMove[] {
  return groups.map(toMove).filter(m => m.delta !== 0).sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)).slice(0, 6);
}

// Q2 · Where is institutional conviction increasing?, themes gaining conviction.
export function convictionRising(groups: ThemeEpisodeGroup[]): ThemeMove[] {
  return groups.map(toMove).filter(m => m.delta > 0).sort((a, b) => b.delta - a.delta).slice(0, 6);
}

// Q3 · What are the highest-conviction ideas?, themes ranked by conviction.
export function highestConviction(groups: ThemeEpisodeGroup[]): ThemeStat[] {
  return groups.map(toStat).sort((a, b) => b.conviction - a.conviction).slice(0, 8);
}

// Q4 · Which narratives are becoming crowded?, most desks aligned on one view.
export function crowdedNarratives(groups: ThemeEpisodeGroup[]): ThemeStat[] {
  return groups.map(toStat).filter(s => s.shows >= 2).sort((a, b) => b.shows - a.shows || b.mentions - a.mentions).slice(0, 5);
}

// Q5 · What is Wall Street missing?, high conviction the tape is barely discussing.
export function wallStreetMissing(groups: ThemeEpisodeGroup[]): ThemeStat[] {
  return groups.map(toStat).filter(s => s.conviction >= 58).sort((a, b) => a.mentions - b.mentions || b.conviction - a.conviction).slice(0, 5);
}

// Q6 · Which companies suddenly entered the conversation?, names surfacing via newly
// emerging narratives (fallback: names concentrated in the freshest episodes).
export interface CompanyRank { ticker: string; count: number }
export function companiesEntering(groups: ThemeEpisodeGroup[], episodes: Episode[]): CompanyRank[] {
  const emergingIds = new Set<string>();
  for (const g of groups) if (isNew(g.theme)) for (const ep of g.episodes) emergingIds.add(ep.id);
  const pool = emergingIds.size > 0
    ? episodes.filter(e => emergingIds.has(e.id))
    : [...episodes].sort((a, b) => (b.published_at ?? "").localeCompare(a.published_at ?? "")).slice(0, 20);
  const m = new Map<string, number>();
  for (const ep of pool) for (const e of ep.entities) if (!looksLikePerson(e)) m.set(e, (m.get(e) ?? 0) + 1);
  return [...m.entries()].map(([ticker, count]) => ({ ticker, count })).sort((a, b) => b.count - a.count).slice(0, 8);
}

// Q7 · Which sectors gained the most discussion?, sector mentions weighted by volume.
export interface SectorRank { sector: string; count: number }
export function sectorsGaining(groups: ThemeEpisodeGroup[]): SectorRank[] {
  const m = new Map<string, number>();
  for (const g of groups) for (const s of g.theme.related_industries ?? []) m.set(s, (m.get(s) ?? 0) + g.matchCount);
  return [...m.entries()].map(([sector, count]) => ({ sector, count })).sort((a, b) => b.count - a.count).slice(0, 6);
}

// Q8 · Which firms are driving today's conversation?, source influence.
export interface SourceRank { show: string; episodes: number; avgRelevance: number; themes: number }
export function firmsDriving(episodes: Episode[], episodeThemes: Map<string, ThemeIntelligence[]>): SourceRank[] {
  const m = new Map<string, { eps: Episode[]; themes: Set<string> }>();
  for (const ep of episodes) {
    const rec = m.get(ep.show_name) ?? { eps: [], themes: new Set<string>() };
    rec.eps.push(ep);
    (episodeThemes.get(ep.id) ?? []).forEach(t => rec.themes.add(t.id));
    m.set(ep.show_name, rec);
  }
  return [...m.entries()]
    .map(([show, { eps, themes }]) => ({ show, episodes: eps.length, avgRelevance: Math.round(eps.reduce((s, e) => s + (e.relevance_score ?? 0), 0) / eps.length), themes: themes.size }))
    .sort((a, b) => b.episodes * b.avgRelevance - a.episodes * a.avgRelevance)
    .slice(0, 6);
}

// ── Narrative rotation, what's rotating into vs out of the conversation ──────
export function narrativeRotation(groups: ThemeEpisodeGroup[]): { inflow: ThemeMove[]; outflow: ThemeMove[] } {
  const moves = groups.map(toMove);
  return {
    inflow:  moves.filter(m => m.delta > 0).sort((a, b) => b.delta - a.delta).slice(0, 5),
    outflow: moves.filter(m => m.delta < 0).sort((a, b) => a.delta - b.delta).slice(0, 5),
  };
}

// ── Most discussed companies, entity mention leaderboard ─────────────────────
export interface CompanyRank2 { ticker: string; count: number }
export function mostDiscussedCompanies(episodes: Episode[]): CompanyRank2[] {
  const m = new Map<string, number>();
  for (const ep of episodes) for (const e of ep.entities) if (!looksLikePerson(e)) m.set(e.toUpperCase(), (m.get(e.toUpperCase()) ?? 0) + 1);
  return [...m.entries()].map(([ticker, count]) => ({ ticker, count })).sort((a, b) => b.count - a.count).slice(0, 8);
}

// ── Most referenced people (CEOs / voices) ────────────────────────────────────
export interface PersonRank { name: string; count: number }
const ORG_SUFFIX = /\b(capital|partners|management|associates|ventures|advisors|advisers|holdings|fund|asset|securities|research)\b/i;
export function mostReferencedPeople(episodes: Episode[]): PersonRank[] {
  const m = new Map<string, number>();
  for (const ep of episodes) for (const e of ep.entities) if (looksLikePerson(e) && !ORG_SUFFIX.test(e)) m.set(e, (m.get(e) ?? 0) + 1);
  return [...m.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count).slice(0, 6);
}

// ── Most referenced funds, fund/alt-manager tickers mentioned ────────────────
const FUND_TICKERS = new Set(["BX", "KKR", "APO", "ARES", "BAM", "BN", "CG", "OWL", "TPG", "BLK", "BEN", "TROW", "ARCC", "OBDC", "STEP"]);
export function mostReferencedFunds(episodes: Episode[]): CompanyRank2[] {
  const m = new Map<string, number>();
  for (const ep of episodes) for (const e of ep.entities) { const u = e.toUpperCase(); if (FUND_TICKERS.has(u)) m.set(u, (m.get(u) ?? 0) + 1); }
  return [...m.entries()].map(([ticker, count]) => ({ ticker, count })).sort((a, b) => b.count - a.count).slice(0, 6);
}

// ── Company × theme heatmap ───────────────────────────────────────────────────
export interface CompanyHeat { companies: string[]; themes: string[]; cells: number[][]; max: number }
export function companyThemeHeatmap(groups: ThemeEpisodeGroup[], episodes: Episode[]): CompanyHeat {
  const companies = mostDiscussedCompanies(episodes).slice(0, 7).map(c => c.ticker);
  const topGroups = groups.slice(0, 6);
  const themes = topGroups.map(g => cleanName(g.theme.name));
  const cells = companies.map(co => topGroups.map(g => g.episodes.filter(ep => ep.entities.some(e => e.toUpperCase() === co)).length));
  return { companies, themes, cells, max: Math.max(1, ...cells.flat()) };
}

// ── Proprietary synthesis metrics (single-stat widgets) ───────────────────────
export interface Signal { label: string; value: string; sub?: string; color?: string }
export function proprietarySignals(groups: ThemeEpisodeGroup[], episodes: Episode[], episodeThemes: Map<string, ThemeIntelligence[]>): Signal[] {
  const total = groups.reduce((s, g) => s + g.matchCount, 0) || 1;
  const top3  = [...groups].sort((a, b) => b.matchCount - a.matchCount).slice(0, 3).reduce((s, g) => s + g.matchCount, 0);
  const crowding = Math.round((top3 / total) * 100);
  const velocity = [...groups].sort((a, b) => Math.abs(b.theme.momentum_delta ?? 0) - Math.abs(a.theme.momentum_delta ?? 0))[0];
  const persistence = [...groups].sort((a, b) => (b.theme.persistence_score ?? 0) - (a.theme.persistence_score ?? 0))[0];
  let bull = 0, bear = 0;
  for (const g of groups) { const d = dirOf(g.theme); if (d > 0) bull += g.matchCount; else if (d < 0) bear += g.matchCount; }
  const consensus = bull >= bear ? 1 : -1;
  const minority = groups.filter(g => dirOf(g.theme) === -consensus && (g.theme.confidence ?? 0) >= 55).sort((a, b) => (b.theme.confidence ?? 0) - (a.theme.confidence ?? 0))[0];
  const podLeader = firmsDriving(episodes, episodeThemes)[0];
  const vDelta = Math.round(velocity?.theme.momentum_delta ?? 0);
  return [
    { label: "Narrative Crowding Score", value: String(crowding), sub: crowding >= 66 ? "highly concentrated" : crowding >= 45 ? "moderately crowded" : "broad-based", color: crowding >= 66 ? "#F59E0B" : "#52b0c8" },
    { label: "Theme Velocity Leader", value: velocity ? cleanName(velocity.theme.name) : "-", sub: velocity ? `Δ ${vDelta > 0 ? "+" : ""}${vDelta} / cycle` : undefined, color: "#10B981" },
    { label: "Theme Persistence Leader", value: persistence ? cleanName(persistence.theme.name) : "-", sub: persistence ? `${Math.round(persistence.theme.persistence_score ?? 0)} persistence` : undefined, color: "#0891B2" },
    { label: "Highest-Conviction Minority View", value: minority ? cleanName(minority.theme.name) : "-", sub: minority ? `against consensus · conv ${Math.round(minority.theme.confidence ?? 0)}` : "no high-conviction dissent", color: "#8B5CF6" },
    { label: "Podcast Influence Leader", value: podLeader ? podLeader.show : "-", sub: podLeader ? `${podLeader.episodes} eps · ${podLeader.themes} themes` : undefined },
  ];
}

// Supporting · the highest-signal conversations (keeps play/save access).
export function influentialEpisodes(episodes: Episode[], episodeThemes: Map<string, ThemeIntelligence[]>): Episode[] {
  const score = (ep: Episode) => {
    const conv = (episodeThemes.get(ep.id) ?? []).reduce((m, t) => Math.max(m, t.confidence ?? 0), 0);
    return (ep.relevance_score ?? 0) + conv * 0.25 + (ep.entities?.length ?? 0) * 2;
  };
  return [...episodes].sort((a, b) => score(b) - score(a)).slice(0, 6);
}
