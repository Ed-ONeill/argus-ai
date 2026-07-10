/**
 * lib/intelligenceDeltas.ts - the canonical change-detection layer (Sprint B2
 * of docs/ARGUS_MORNING_BRIEF_V2.md section 4.1).
 *
 * Derives MorningBriefDelta records - "what changed since the previous
 * intelligence cycle" - from memory that actually exists. First consumer is
 * the Morning Brief view model; Saved and Alerts are the intended future
 * consumers (surfaces doc sections 3.9 and 7), which is why this layer is its
 * own pure module rather than a private helper.
 *
 * Memory sources and precedence:
 *  1. SERVER (authoritative): the backend theme-memory store, which arrives
 *     already attached to each theme as `ThemeIntelligence.memory`
 *     (ThemeMemory - cross-cycle conviction trends, confirmation and
 *     contradiction counts, per-ticker/sector session counts, staleness).
 *     Every field traces to stored observations; nothing here re-derives it.
 *  2. DEVICE (gap-filler only): localStorage theme snapshots, used ONLY for
 *     what the server payload cannot show - a theme this device tracked
 *     recently that is absent from today's cycle entirely (the server record
 *     rides on present themes, so an absent theme carries no memory). Device
 *     deltas are badged basis "device" and never outrank server deltas.
 *
 * Honesty rules (I1):
 *  - A delta is emitted only when a recorded prior state supports it. No
 *    memory means no deltas - callers degrade to an honest empty state.
 *  - BROKEN is part of the vocabulary (model doc lifecycle section 7.2) but is
 *    NEVER emitted in v1: no system records an invalidation-fired or
 *    contradiction-outweighs-support terminal state yet, and deriving one
 *    from thresholds would fabricate the most consequential event we have.
 *    Tests pin this.
 *  - Every delta answers the four questions with traceable text: what changed
 *    (real numbers), why (recorded counts), why it matters (the theme's real
 *    exposure), what to watch next (derived from stored driver/direction).
 *
 * Pure module, relative imports only, exercised by intelligenceTests.ts
 * (79.x). Inputs are injected; `now` is injectable for determinism. No em/en
 * dashes.
 */

import type { ThemeIntelligence } from "./types";
import type { ProfileSection } from "./intelligenceProfile";
import { themeKey } from "./themeSnapshots";
import { evaluateEvidenceForNode } from "./evidenceEngine";

/* ------------------------------------------------------------------ *
 * Change model
 * ------------------------------------------------------------------ */

export type DeltaKind =
  | "NEW"           // first cross-session observation of a theme
  | "STRENGTHENED"  // recorded conviction trend rising
  | "WEAKENED"      // recorded conviction trend falling
  | "EXPANDED"      // newly linked tickers/sectors (first session on record)
  | "CONTRADICTED"  // contradicting stories recorded this cycle
  | "BROKEN"        // terminal invalidation - vocabulary only, never emitted in v1
  | "REMOVED";      // gone quiet (server stale) or absent from today's cycle (device)

export type DeltaBasis = "server" | "device";

export interface MorningBriefDelta {
  kind:      DeltaKind;
  entity:    string;      // theme name
  /** What changed - always carries the real recorded numbers. */
  what:      string;
  /** Why it changed - the recorded evidence basis (counts, sessions). */
  why:       string;
  /** Why it matters - the theme's real exposure (sectors/tickers on record). */
  matters:   string;
  /** What to watch next - derived from stored driver + direction fields. */
  watch:     string;
  basis:     DeltaBasis;
  /** Ranking weight within its kind (e.g. |conviction change| or a count). */
  magnitude: number;
}

export interface TrackedTheme { themeId: string; themeName: string; lastDate: string }

export interface DeltaInputs {
  themes?:            ThemeIntelligence[];
  /** Device-local snapshot index (themeSnapshots.getTrackedThemes()), for
      absence detection only. */
  previouslyTracked?: TrackedTheme[];
  /** Gates evidence-engine enrichment (graph singleton built by the caller). */
  graphReady?:        boolean;
  /** Injectable clock for deterministic tests. */
  now?:               number;
}

export interface DeltaResult {
  deltas:    MorningBriefDelta[];
  /** False when no memory of any kind existed - the honest first-cycle state. */
  hadMemory: boolean;
}

/* ------------------------------------------------------------------ *
 * Shared derivations (also consumed by lib/morningBrief.ts - one logic home)
 * ------------------------------------------------------------------ */

/** The theme's dominant driver, from its stored fields (no label cosmetics).
    THE single home for this derivation (D9, consolidated in P2 Feed
    unification): themeTransmission.deriveDriver delegates here and adds the
    cosmetic label cleanup. */
export function driverOf(t: ThemeIntelligence): string {
  const cn = t.causal_narrative ?? "";
  if (cn.includes("→")) {
    const head = cn.split("→").map(s => s.trim()).filter(Boolean)[0];
    if (head && head.length > 2) return head;
  }
  return (t.related_macro_factors ?? [])[0] ?? "the macro backdrop";
}

/** Dateless "what to watch" line from stored driver + direction fields.
    THE single home for this derivation (D9): themeTransmission.themeWatch
    delegates here. */
export function watchLineOf(t: ThemeIntelligence): string {
  const d = driverOf(t).toLowerCase();
  const base = /rate|yield|fed|policy/.test(d) ? "bond yields"
    : /financ|credit|spread|default/.test(d) ? "credit spreads"
    : /energy|oil|crude|supply/.test(d) ? "crude and the curve"
    : /dollar|fx|currenc/.test(d) ? "the dollar"
    : /inflation|cpi|price/.test(d) ? "the next inflation print"
    : /power|electr|grid|infra/.test(d) ? "utility and grid orders"
    : "rates and breadth";
  const dir = t.momentum_direction;
  return dir === "bullish" ? `${base} for follow-through`
    : dir === "bearish" ? `${base} for further pressure`
    : `${base} for direction`;
}

/** The theme's real recorded exposure, for the "why it matters" answer. */
function exposureLine(t: ThemeIntelligence): string {
  const sectors = (t.related_industries ?? []).slice(0, 2);
  const tickers = (t.related_assets ?? []).slice(0, 3);
  if (sectors.length === 0 && tickers.length === 0) return "No recorded sector or ticker exposure yet.";
  const parts: string[] = [];
  if (sectors.length) parts.push(`Transmits through ${sectors.join(" and ")}`);
  if (tickers.length) parts.push(`${tickers.join(", ")} exposed`);
  return parts.join("; ") + ".";
}

const plural = (n: number, s: string) => `${n} ${s}${n === 1 ? "" : "s"}`;

/* ------------------------------------------------------------------ *
 * Derivation
 * ------------------------------------------------------------------ */

// Pre-open priority: contradictions and disappearances before confirmations.
const KIND_RANK: Record<DeltaKind, number> = {
  BROKEN: 0, CONTRADICTED: 1, NEW: 2, WEAKENED: 3, STRENGTHENED: 4, EXPANDED: 5, REMOVED: 6,
};

const DEVICE_REMOVED_WINDOW_DAYS = 3;   // absence is only news if the theme was tracked recently

/**
 * Derive the change ledger for the current cycle. Deterministic for fixed
 * inputs; emits nothing without recorded prior state.
 */
export function deriveMorningBriefDeltas(inputs: DeltaInputs = {}): DeltaResult {
  const themes = inputs.themes ?? [];
  const tracked = inputs.previouslyTracked ?? [];
  const graphReady = inputs.graphReady === true;
  const now = inputs.now ?? Date.now();

  const deltas: MorningBriefDelta[] = [];
  let hadMemory = false;

  /* -- server-basis deltas: one pass over the attached backend memory -- */
  for (const t of themes) {
    const mem = t.memory ?? null;
    if (!mem) continue;
    hadMemory = true;
    const watch = `Watch ${watchLineOf(t)}.`;
    const matters = exposureLine(t);

    if (mem.is_new || mem.status === "new") {
      deltas.push({
        kind: "NEW", entity: t.name, basis: "server", magnitude: mem.confirmations_today,
        what: `New theme detected: ${t.name}.`,
        why: `First cross-session observation; ${plural(mem.confirmations_today, "confirming story")} this cycle.`,
        matters, watch,
      });
    } else {
      if (mem.conviction_trend === "rising" && mem.conviction_change > 0) {
        deltas.push({
          kind: "STRENGTHENED", entity: t.name, basis: "server", magnitude: Math.abs(mem.conviction_change),
          what: `${t.name} conviction ${mem.conviction_window_start} to ${mem.conviction_current} (+${mem.conviction_change}).`,
          why: `${mem.status} for ${plural(mem.sessions_in_status, "session")}; ${plural(mem.confirmations_today, "confirming story")} vs ${mem.contradictions_today} contradicting this cycle.`,
          matters, watch,
        });
      }
      if (mem.conviction_trend === "falling" && mem.conviction_change < 0) {
        deltas.push({
          kind: "WEAKENED", entity: t.name, basis: "server", magnitude: Math.abs(mem.conviction_change),
          what: `${t.name} conviction ${mem.conviction_window_start} to ${mem.conviction_current} (${mem.conviction_change}).`,
          why: `${mem.status} for ${plural(mem.sessions_in_status, "session")}; ${plural(mem.contradictions_today, "contradicting story")} vs ${mem.confirmations_today} confirming this cycle.`,
          matters, watch,
        });
      }
    }

    if (mem.contradictions_today > 0) {
      let why = `${plural(mem.confirmations_today, "confirming story")} vs ${mem.contradictions_today} contradicting this cycle; ${mem.contradicting_total} on record overall.`;
      if (graphReady) {
        const ev = evaluateEvidenceForNode(t.name);
        if (ev.found && ev.contradictions.length > 0) why += ` ${ev.contradictions[0].detail}`;
      }
      deltas.push({
        kind: "CONTRADICTED", entity: t.name, basis: "server", magnitude: mem.contradictions_today,
        what: `${plural(mem.contradictions_today, "contradicting story")} recorded against ${t.name} this cycle.`,
        why,
        matters: `Unresolved contradictions cap how far the ${t.name} read can be trusted (evidence model).`,
        watch: `Watch whether follow-up coverage confirms or resolves the contradiction.`,
      });
    }

    if (!mem.is_new && mem.sessions_observed > 1) {
      const newTickers = Object.entries(mem.ticker_sessions ?? {}).filter(([, s]) => s === 1).map(([k]) => k).sort();
      const newSectors = Object.entries(mem.sector_sessions ?? {}).filter(([, s]) => s === 1).map(([k]) => k).sort();
      const added = [...newSectors, ...newTickers].slice(0, 4);
      if (added.length > 0) {
        deltas.push({
          kind: "EXPANDED", entity: t.name, basis: "server", magnitude: added.length,
          what: `${t.name} broadened: newly linked to ${added.join(", ")}.`,
          why: `First recorded session for ${added.join(", ")} on this theme, across ${plural(mem.sessions_observed, "session")} observed.`,
          matters,
          watch: `Watch whether the new linkage repeats across sources or fades as a one-off.`,
        });
      }
    }

    if (mem.is_stale || mem.status === "stale") {
      deltas.push({
        kind: "REMOVED", entity: t.name, basis: "server", magnitude: mem.last_seen_hours_ago,
        what: `${t.name} has gone quiet.`,
        why: `Last confirming evidence ${Math.round(mem.last_seen_hours_ago)}h ago after ${plural(mem.sessions_observed, "session")} observed.`,
        matters,
        watch: `Watch for a fresh confirming story before re-engaging the theme.`,
      });
    }
  }

  /* -- device-basis deltas: absence only (the one thing the server payload
        cannot show, since its memory rides on themes that are present) -- */
  if (tracked.length > 0) hadMemory = true;
  const currentKeys = new Set(themes.map(t => themeKey(t)));
  const cutoff = now - DEVICE_REMOVED_WINDOW_DAYS * 86_400_000;
  for (const prev of tracked) {
    if (currentKeys.has(prev.themeId)) continue;
    const last = Date.parse(prev.lastDate);
    if (!Number.isFinite(last) || last < cutoff) continue;   // old disappearances are not news
    deltas.push({
      kind: "REMOVED", entity: prev.themeName, basis: "device", magnitude: 0,
      what: `${prev.themeName} dropped out of the active theme set.`,
      why: `Tracked in this device's snapshot history (last ${prev.lastDate}); absent from today's cycle.`,
      matters: `Argus is no longer receiving confirming coverage for this theme.`,
      watch: `Watch whether it reappears across sources.`,
    });
  }

  // Deterministic ranking: severity class, then magnitude, then name; server
  // outranks device inside a class. Capped for the brief's five-minute read.
  deltas.sort((a, b) =>
    (KIND_RANK[a.kind] - KIND_RANK[b.kind]) ||
    ((a.basis === "server" ? 0 : 1) - (b.basis === "server" ? 0 : 1)) ||
    (b.magnitude - a.magnitude) ||
    a.entity.localeCompare(b.entity));

  return { deltas: deltas.slice(0, 6), hadMemory };
}

/**
 * Wrap a delta result in the standard section statuses. The ONE home for the
 * ledger's honesty policy (first cycle = unavailable; device-only = partial);
 * the Morning Brief and Markets both consume this - never re-implement it.
 */
export function deltasToSection(result: DeltaResult): ProfileSection<MorningBriefDelta[]> {
  if (!result.hadMemory) {
    return { status: "unavailable", data: null, note: "First cycle: no cross-session memory to compare against yet." };
  }
  if (result.deltas.length === 0) {
    return { status: "partial", data: [], note: "Memory exists but recorded no material changes this cycle." };
  }
  const server = result.deltas.some(d => d.basis === "server");
  return server
    ? { status: "live", data: result.deltas }
    : { status: "partial", data: result.deltas, note: "Only device-local history was available for this read." };
}
