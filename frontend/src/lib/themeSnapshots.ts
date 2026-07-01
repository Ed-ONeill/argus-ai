/**
 * lib/themeSnapshots.ts - durable daily theme memory (Phase 4).
 *
 * Writes one snapshot per theme per day to localStorage so Argus can learn over
 * time: conviction/momentum/persistence trajectories, mention growth across Feed +
 * Listen, and M&A confirmation. Data-layer only for now (localStorage), ready to
 * back onto Supabase later without changing callers. No em/en dashes in output.
 */

import type { ThemeIntelligence } from "./types";

export interface ThemeSnapshot {
  id:                 string;   // `${date}:${themeId}`
  date:               string;   // YYYY-MM-DD
  themeId:            string;
  themeName:          string;
  conviction:         number;
  momentum:           string;
  persistence:        number;
  breadth:            number;
  acceleration:       number;
  relatedCompanies:   string[];
  relatedSectors:     string[];
  sourceCount:        number;
  storyCount:         number;
  mnaDealCount:       number;
  listenMentionCount: number;
  privateSignalScore: number;
  topDrivers:         string[];
  topRisks:           string[];
  summary:            string;
}

const KEY = "argus.themeSnapshots.v1";
const MAX_PER_THEME = 120;

/** Stable memory key for a theme (aligns with the intelligence context id). */
export function themeKey(t: { id?: string; name: string }): string {
  return t.name.replace(/\s*[-:].*$/, "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || (t.id ?? "");
}
function today(): string { return new Date().toISOString().slice(0, 10); }
const isTicker = (s: string) => /^[A-Z][A-Z.]{0,5}$/.test(s);

function load(): ThemeSnapshot[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(window.localStorage.getItem(KEY) ?? "[]"); } catch { return []; }
}
function save(all: ThemeSnapshot[]): void {
  if (typeof window === "undefined") return;
  try { window.localStorage.setItem(KEY, JSON.stringify(all)); } catch { /* quota / disabled */ }
}

export interface SnapshotExtras {
  dealCountBySector?:    Record<string, number>;
  listenMentionByTheme?: Record<string, number>;
}

/** Write today's snapshot for every theme (idempotent per day). */
export function createDailyThemeSnapshots(themes: ThemeIntelligence[], extra: SnapshotExtras = {}): void {
  if (typeof window === "undefined" || themes.length === 0) return;
  const all = load();
  const seen = new Set(all.map(s => s.id));
  const date = today();
  let changed = false;

  for (const t of themes) {
    const tid = themeKey(t);
    const id = `${date}:${tid}`;
    if (seen.has(id)) continue;
    const sectors = t.related_industries ?? [];
    const snap: ThemeSnapshot = {
      id, date, themeId: tid, themeName: t.name.replace(/\s*[-:].*$/, "").trim(),
      conviction:   Math.round(t.confidence ?? 0),
      momentum:     t.momentum_label ?? "stable",
      persistence:  Math.round(t.persistence_score ?? 0),
      breadth:      Math.round(t.breadth_score ?? 0),
      acceleration: Math.round(t.momentum_delta ?? 0),
      relatedCompanies:   (t.related_assets ?? []).filter(isTicker).slice(0, 6),
      relatedSectors:     sectors.slice(0, 4),
      sourceCount:  t.evidence_count ?? 0,
      storyCount:   t.contributing_story_count ?? 0,
      mnaDealCount: sectors.reduce((n, s) => n + (extra.dealCountBySector?.[s] ?? 0), 0),
      listenMentionCount: extra.listenMentionByTheme?.[tid] ?? 0,
      privateSignalScore: Math.round(((t.confidence ?? 0) * 0.5) + ((t.breadth_score ?? 0) * 0.3) + (Math.max(0, t.momentum_delta ?? 0) * 2)),
      topDrivers: (t.related_macro_factors ?? []).slice(0, 3),
      topRisks:   (t.second_order_effects ?? []).slice(0, 2),
      summary:    (t.causal_narrative ?? "").split(". ")[0] || `${t.name.replace(/\s*[-:].*$/, "").trim()} is ${t.momentum_label ?? "active"}.`,
    };
    all.push(snap); seen.add(id); changed = true;
  }

  if (changed) {
    // Cap history per theme so localStorage never grows unbounded.
    const byTheme = new Map<string, ThemeSnapshot[]>();
    for (const s of all) (byTheme.get(s.themeId) ?? byTheme.set(s.themeId, []).get(s.themeId)!).push(s);
    const capped: ThemeSnapshot[] = [];
    for (const list of byTheme.values()) {
      list.sort((a, b) => a.date.localeCompare(b.date));
      capped.push(...list.slice(-MAX_PER_THEME));
    }
    save(capped);
  }
}

/** All snapshots for a theme, oldest first. */
export function getThemeHistory(themeId: string): ThemeSnapshot[] {
  return load().filter(s => s.themeId === themeId).sort((a, b) => a.date.localeCompare(b.date));
}

export interface ThemeDelta {
  hasHistory:     boolean;
  sessions:       number;   // number of snapshots
  days:           number;   // calendar days from first to latest
  convictionFrom: number;
  convictionTo:   number;
  mentionFrom:    number;
  mentionTo:      number;
  dealFrom:       number;
  dealTo:         number;
}

/** Change between the earliest tracked snapshot and the latest. */
export function getThemeDelta(themeId: string): ThemeDelta | null {
  const h = getThemeHistory(themeId);
  if (h.length === 0) return null;
  const first = h[0], last = h[h.length - 1];
  const days = Math.max(0, Math.round((Date.parse(last.date) - Date.parse(first.date)) / 86_400_000));
  return {
    hasHistory:     h.length > 1,
    sessions:       h.length,
    days:           days + 1,
    convictionFrom: first.conviction, convictionTo: last.conviction,
    mentionFrom:    first.listenMentionCount + first.storyCount, mentionTo: last.listenMentionCount + last.storyCount,
    dealFrom:       first.mnaDealCount, dealTo: last.mnaDealCount,
  };
}

/** Human-readable memory lines for the drawer. Empty when tracking just started. */
export function getThemeMemory(themeId: string): { hasHistory: boolean; lines: string[] } {
  const d = getThemeDelta(themeId);
  if (!d || !d.hasHistory) return { hasHistory: false, lines: [] };
  const lines: string[] = [];
  if (d.convictionTo !== d.convictionFrom) {
    const dir = d.convictionTo > d.convictionFrom ? "rose" : "eased";
    lines.push(`Conviction ${dir} from ${d.convictionFrom} to ${d.convictionTo} over ${d.sessions} session${d.sessions !== 1 ? "s" : ""}.`);
  }
  if (d.mentionTo > d.mentionFrom) lines.push("Mentions increased across Listen and Feed.");
  if (d.dealTo > 0 && d.dealTo >= d.dealFrom) lines.push("M&A activity is now confirming the same theme.");
  if (d.days >= 2) lines.push(`This theme has persisted for ${d.days} day${d.days !== 1 ? "s" : ""}.`);
  return { hasHistory: lines.length > 0, lines };
}
