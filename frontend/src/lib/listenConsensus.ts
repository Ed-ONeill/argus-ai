/**
 * lib/listenConsensus.ts, collective podcast intelligence.
 *
 * Synthesizes what ALL podcasts are collectively saying from the matched themes +
 * episode entities: conversation consensus, the most bullish/bearish theme, the
 * fastest-growing narrative, the most-mentioned company / sector / voice / macro
 * topic, and a "Wall Street Consensus" read on the leading conviction theme.
 *
 * Deterministic, every figure derives from a real field (theme momentum/confidence,
 * entity frequency across episodes). Dependency-light (only the person detector).
 */

import { looksLikePerson } from "./listenIntelligence";
import { sanitizeCopy } from "./utils";
import type { Episode, ThemeIntelligence } from "./types";
import type { ThemeEpisodeGroup } from "./listenIntelligence";

const dirOf = (t: ThemeIntelligence) => t.momentum_direction === "bullish" ? 1 : t.momentum_direction === "bearish" ? -1 : 0;
const cleanName = (s: string) => s.replace(/\s*[-–—:].*$/, "").trim();

function topCount(pairs: Iterable<[string, number]>): { label: string; count: number } | null {
  let best: { label: string; count: number } | null = null;
  for (const [label, count] of pairs) if (!best || count > best.count) best = { label, count };
  return best && best.count > 0 ? best : null;
}

export interface Consensus {
  pct: number;            // bullish share 0..100 (drives the bar)
  label: "Bullish" | "Bearish" | "Mixed"; color: string;
  strength: number | null; // directional conviction % (null when mixed / no signal)
  display: string;        // ready-to-print, never "0%" (e.g. "Bullish 72%" or "Mixed")
  crowding:     string;   // positioning read: crowded vs contested
  themeCount:   number;   // distinct themes discussed
  episodeCount: number;   // distinct podcast episodes discussing those themes
  mentionCount: number;   // total theme×episode mentions (an episode can discuss several)
}
export interface IntelWidget { label: string; value: string; sub?: string; color?: string }

export interface WallStreet { theme: string; pct: number; direction: "Bullish" | "Bearish"; podcasts: number; shows: string[]; positioning: string }

export interface CollectiveIntel {
  read:         string;   // the strategist's one-line synthesis
  consensus:    Consensus;
  widgets:      IntelWidget[];
  wallStreet:   WallStreet | null;
}

export function buildCollectiveIntel(
  episodes: Episode[], themes: ThemeIntelligence[], groups: ThemeEpisodeGroup[],
): CollectiveIntel | null {
  if (groups.length === 0) return null;

  // ── Consensus, bullish vs bearish, weighted by discussion volume ──
  let bull = 0, bear = 0;
  for (const g of groups) {
    const d = dirOf(g.theme);
    if (d > 0) bull += g.matchCount; else if (d < 0) bear += g.matchCount;
  }
  const total = bull + bear;
  const pct   = total ? Math.round((bull / total) * 100) : 50;
  const cLabel: Consensus["label"] = total === 0 ? "Mixed" : pct >= 55 ? "Bullish" : pct <= 45 ? "Bearish" : "Mixed";
  // Directional STRENGTH is the share in the leading direction (never the bullish
  // share when bearish, that produced "bearish (0%)"). Null when there's no signal.
  const strength = total === 0 || cLabel === "Mixed" ? null : cLabel === "Bullish" ? pct : 100 - pct;
  const display  = total === 0 ? "Insufficient directional signal" : cLabel === "Mixed" ? "Mixed" : `${cLabel} ${strength}%`;
  // A "conversation" = a podcast episode discussing a tracked theme. An episode can
  // touch several themes, so distinguish unique episodes from total theme-mentions.
  const episodeIds = new Set<string>();
  for (const g of groups) for (const ep of g.episodes) episodeIds.add(ep.id);
  // Crowding read, extreme one-sided consensus is a positioning risk, not comfort.
  const skew = total === 0 ? 0 : Math.abs(pct - 50);
  const crowding = total === 0 ? "No directional consensus"
    : skew >= 25 ? `Crowded ${cLabel.toLowerCase()}, positioning risk`
    : skew >= 12 ? `Leaning ${cLabel.toLowerCase()}`
    : "Two-sided, contested";
  const consensus: Consensus = {
    pct, label: cLabel,
    color: cLabel === "Bullish" ? "#10B981" : cLabel === "Bearish" ? "#EF4444" : "#94A3B8",
    strength, display, crowding,
    themeCount:   groups.length,
    episodeCount: episodeIds.size,
    mentionCount: groups.reduce((s, g) => s + g.matchCount, 0),
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
  const topCompany = topCount(companyCount);
  const topPerson  = topCount(personCount);

  // ── New entrants & week-over-week change ──
  const isNew = (t: ThemeIntelligence) => t.momentum_label === "emerging" || !!t.memory?.is_new || t.memory?.status === "new";
  const newThemes = groups.filter(g => isNew(g.theme)).sort((a, b) => b.matchCount - a.matchCount);
  const mover = [...groups].sort((a, b) => Math.abs(b.theme.momentum_delta ?? 0) - Math.abs(a.theme.momentum_delta ?? 0))[0];
  const moverDelta = Math.round(mover?.theme.momentum_delta ?? 0);

  // ── Conviction / disagreement / repetition ──
  const highestConv = [...groups].sort((a, b) => (b.theme.confidence ?? 0) - (a.theme.confidence ?? 0))[0];
  const highestDis  = [...groups].sort((a, b) => (b.theme.volatility_score ?? 0) - (a.theme.volatility_score ?? 0))[0];
  // The crowded trade, the narrative carried across the most distinct shows (the
  // most-aligned positioning, where the consensus risk concentrates).
  const repeated = [...groups]
    .map(g => ({ g, shows: new Set(g.episodes.map(e => e.show_name)).size }))
    .sort((a, b) => b.shows - a.shows)[0];
  // Under the radar, high conviction the tape is barely discussing (the un-crowded
  // edge): strongest themes ranked by FEWEST mentions.
  const underRadar = groups
    .filter(g => (g.theme.confidence ?? 0) >= 58)
    .sort((a, b) => a.matchCount - b.matchCount || (b.theme.confidence ?? 0) - (a.theme.confidence ?? 0))[0];

  // Investment-framed reads, each answers a question an allocator would ask, not
  // "what was mentioned." Label = the question; value = the trade; sub = the edge.
  const widgets: IntelWidget[] = [
    { label: "What The Crowd Is Buying", value: bullThemes[0] ? cleanName(bullThemes[0].theme.name) : "-",
      sub: bullThemes[0] ? `consensus long · conviction ${Math.round(bullThemes[0].theme.confidence ?? 0)}` : undefined, color: "#10B981" },
    { label: "What The Crowd Is Fading", value: bearThemes[0] ? cleanName(bearThemes[0].theme.name) : "-",
      sub: bearThemes[0] ? `consensus short · conviction ${Math.round(bearThemes[0].theme.confidence ?? 0)}` : undefined, color: "#EF4444" },
    { label: "The Crowded Trade", value: repeated && repeated.shows >= 2 ? cleanName(repeated.g.theme.name) : "-",
      sub: repeated && repeated.shows >= 2 ? `${repeated.shows} desks aligned, watch positioning` : undefined, color: "#F59E0B" },
    { label: "Under The Radar", value: underRadar ? cleanName(underRadar.theme.name) : "-",
      sub: underRadar ? `conviction ${Math.round(underRadar.theme.confidence ?? 0)}, only ${underRadar.matchCount} mention${underRadar.matchCount !== 1 ? "s" : ""}` : undefined, color: "#8B5CF6" },
    { label: "Where The Debate Is", value: highestDis && (highestDis.theme.volatility_score ?? 0) > 0 ? cleanName(highestDis.theme.name) : "-",
      sub: highestDis && (highestDis.theme.volatility_score ?? 0) > 0 ? "two-sided, dispersion setup" : undefined, color: "#0891B2" },
    { label: "Highest-Conviction Call", value: highestConv ? cleanName(highestConv.theme.name) : "-",
      sub: highestConv ? `conviction ${Math.round(highestConv.theme.confidence ?? 0)}` : undefined, color: "#0891B2" },
    { label: "Gaining Before It's Priced", value: fastest ? cleanName(fastest.theme.name) : "-",
      sub: fastest ? `▲ +${Math.round(fastest.theme.momentum_delta ?? 0)} narrative momentum` : undefined, color: "#52b0c8" },
    { label: "Just Entered The Tape", value: newThemes[0] ? cleanName(newThemes[0].theme.name) : "-",
      sub: newThemes.length > 1 ? `${newThemes.length} new this week` : newThemes[0] ? "new this week" : undefined, color: "#8B5CF6" },
    { label: "Biggest Re-Rating", value: mover && moverDelta !== 0 ? cleanName(mover.theme.name) : "-",
      sub: mover && moverDelta !== 0 ? `${moverDelta > 0 ? "▲ +" : "▼ "}${moverDelta} vs last week` : undefined, color: moverDelta >= 0 ? "#10B981" : "#EF4444" },
    { label: "Single Name In Focus", value: topCompany?.label ?? "-",
      sub: topCompany ? `most-debated · ${topCompany.count} episode${topCompany.count !== 1 ? "s" : ""}` : undefined },
    { label: "Whose Call Carries Weight", value: topPerson?.label ?? "-",
      sub: topPerson ? `most-cited · ${topPerson.count} mention${topPerson.count !== 1 ? "s" : ""}` : undefined },
  ];

  // ── Wall Street Consensus, the leading conviction theme + who's discussing it ──
  const lead = (bullThemes[0] ?? bearThemes[0] ?? groups[0]);
  const leadShows = lead ? new Set(lead.episodes.map(e => e.show_name)).size : 0;
  const wallStreet: WallStreet | null = lead ? {
    theme: cleanName(lead.theme.name),
    pct: Math.round(lead.theme.confidence ?? 0),
    direction: dirOf(lead.theme) < 0 ? "Bearish" : "Bullish",
    podcasts: lead.matchCount,
    shows: [...new Set(lead.episodes.map(e => e.show_name))].slice(0, 6),
    positioning: leadShows >= 4 ? "Crowded, consensus positioning"
      : leadShows >= 2 ? "Building consensus"
      : "Early, limited coverage",
  } : null;

  // ── Strategist's read, the one-line synthesis an allocator would write ──
  const leadName = lead ? cleanName(lead.theme.name) : null;
  let read: string;
  if (!leadName) {
    read = "No directional consensus across the tape, positioning is dispersed.";
  } else if (cLabel === "Mixed" || strength === null) {
    read = `The tape is split on ${leadName}, no directional consensus yet.`;
  } else {
    read = `The tape is leaning ${cLabel.toLowerCase()} on ${leadName} (${strength}% of directional mentions)`;
    read += skew >= 25 ? ", crowded, so the risk is positioning, not thesis." : ".";
    if (underRadar && underRadar.theme.id !== lead.theme.id) {
      read += ` The un-crowded setup: ${cleanName(underRadar.theme.name)}, high conviction but barely discussed.`;
    }
  }

  return { read: sanitizeCopy(read), consensus, widgets, wallStreet };
}
