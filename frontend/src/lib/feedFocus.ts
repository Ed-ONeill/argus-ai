/**
 * lib/feedFocus.ts — the Argus Market Map controller vocabulary.
 *
 * The Market Map is the operating system for the Feed: selecting a node puts the
 * whole page into Focus mode, and every section below the graph reflects whatever
 * is currently selected. This module is the shared language between the graph
 * (which produces a selected GraphNode) and the page sections (which need to ask
 * "does this story / signal belong to what's selected?").
 *
 * Pure, deterministic reads of already-stored fields — nothing invented.
 */

import type { GraphNode } from "@/lib/graph/types";
import type { FeedItem, StoryCluster, WhatMattersNowItem, ThemeIntelligence } from "@/lib/types";
import { deriveDriver, deriveSector, themeWatch, dirOf } from "@/lib/themeTransmission";
import { themeBeneficiaries } from "@/lib/themeIntelligence";
import { cleanThemeName } from "@/app/markets/marketsShared";

export type FocusKind = "theme" | "sector" | "company" | "driver";

/** A page-level focus, derived from the graph's currently-selected node. */
export interface FeedFocus {
  kind:    FocusKind;
  nodeId:  string;
  label:   string;        // human label (theme name, sector, ticker, driver)
  themes:  string[];      // associated theme names carried by the node
  ticker?: string;        // company focus
  sector?: string;        // sector / company focus
  driver?: string;        // driver focus
}

const KIND_LABEL: Record<FocusKind, string> = {
  theme: "Theme", sector: "Sector", company: "Company", driver: "Macro Driver",
};
export function focusKindLabel(kind: FocusKind): string { return KIND_LABEL[kind]; }

/**
 * Map a graph node to a page-level focus. The market center / event node returns
 * null — that is Global Market mode (no filtering).
 */
export function nodeToFocus(node: GraphNode | null): FeedFocus | null {
  if (!node) return null;
  const themes = node.themes ?? [];
  switch (node.kind) {
    case "theme":
      return { kind: "theme", nodeId: node.id, label: node.label, themes };
    case "sector":
      return { kind: "sector", nodeId: node.id, label: node.label, themes, sector: node.label };
    case "company":
      return { kind: "company", nodeId: node.id, label: node.ticker ?? node.label, themes, ticker: node.ticker, sector: node.sector };
    case "group": // macro driver
      return { kind: "driver", nodeId: node.id, label: node.label, themes, driver: node.label };
    default:
      return null; // event / market center → Global
  }
}

/** The live themes that belong to the active focus. */
export function focusedThemes(focus: FeedFocus, themes: ThemeIntelligence[]): ThemeIntelligence[] {
  switch (focus.kind) {
    case "theme":
      return themes.filter(t => focus.themes.includes(cleanThemeName(t.name)) || focus.themes.includes(t.name));
    case "sector":
      return themes.filter(t => deriveSector(t) === focus.sector);
    case "driver":
      return themes.filter(t => deriveDriver(t) === focus.driver);
    case "company": {
      const tk = (focus.ticker ?? "").toUpperCase();
      return themes.filter(t =>
        focus.themes.includes(cleanThemeName(t.name)) ||
        (tk && themeBeneficiaries(t, 6).map(b => b.toUpperCase()).includes(tk)));
    }
  }
}

// Keyword fallback — tokens that, found in a story, mark it as on-focus. Kept to
// reasonably long tokens so a focus never matches stories on incidental words.
function focusKeywords(focus: FeedFocus, fThemes: ThemeIntelligence[]): string[] {
  const out = new Set<string>();
  const push = (s: string | undefined, minLen: number) => {
    if (!s) return;
    s.toLowerCase().split(/\W+/).filter(w => w.length >= minLen).forEach(w => out.add(w));
  };
  if (focus.kind === "sector") push(focus.sector, 4);
  if (focus.kind === "driver") push(focus.driver, 4);
  if (focus.kind === "theme") focus.themes.forEach(t => push(t, 5));
  for (const t of fThemes) {
    push(cleanThemeName(t.name), 5);
    (t.related_industries ?? []).forEach(s => push(s, 5));
    (t.related_macro_factors ?? []).forEach(s => push(s, 5));
  }
  return [...out];
}

interface FocusMatcher {
  clusterIds: Set<string>;
  keywords:   string[];
  ticker:     string | null;
}

/**
 * Pre-compute the matcher for a focus once, then test many items cheaply. Build
 * this in a useMemo and reuse across every section so the page filters in one pass.
 */
export function buildFocusMatcher(focus: FeedFocus, themes: ThemeIntelligence[]): FocusMatcher {
  const fThemes = focusedThemes(focus, themes);
  return {
    clusterIds: new Set(fThemes.flatMap(t => t.contributing_cluster_ids ?? [])),
    keywords:   focusKeywords(focus, fThemes),
    ticker:     focus.kind === "company" ? (focus.ticker ?? focus.label).toLowerCase() : null,
  };
}

function haystack(item: FeedItem): string {
  return [item.title, item.summary, item.impact, ...(item.affected_entities ?? [])].join(" ").toLowerCase();
}

/** Does a single feed item (e.g. a Signal Pick) belong to the focus? */
export function itemMatchesFocus(item: FeedItem, m: FocusMatcher): boolean {
  const hay = haystack(item);
  if (m.ticker && hay.includes(m.ticker)) return true;
  return m.keywords.some(k => hay.includes(k));
}

/** Does a story cluster belong to the focus? */
export function clusterMatchesFocus(cluster: StoryCluster, m: FocusMatcher): boolean {
  if (m.clusterIds.has(cluster.id)) return true;
  return itemMatchesFocus(cluster.primary, m);
}

export function wmnMatchesFocus(wmn: WhatMattersNowItem, m: FocusMatcher): boolean {
  return clusterMatchesFocus(wmn.cluster, m);
}

// ── Focused desk note — "Today's Market Story", re-read for the selected node ──
export interface FocusStory { headline: string; paragraph: string; watch: string; movers: string[] }

/**
 * The desk note for Focus mode: what the selected entity means right now. Reuses
 * the same theme derivations as the global story so the two read in one voice.
 */
export function buildFocusStory(focus: FeedFocus, themes: ThemeIntelligence[]): FocusStory | null {
  const fThemes = focusedThemes(focus, themes).sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0));
  const lead = fThemes[0];
  const kindLabel = KIND_LABEL[focus.kind].toLowerCase();

  if (!lead) {
    return {
      headline:  focus.label,
      paragraph: `Tracking ${focus.label} as a ${kindLabel}. No firm theme is driving it yet — the read sharpens as confirming signal accumulates.`,
      watch:     "fresh confirmation before sizing conviction",
      movers:    [],
    };
  }

  const dir = dirOf(lead);
  const tilt = dir === "bullish" ? "a constructive tilt" : dir === "bearish" ? "downside pressure" : "a two-way, unresolved tape";
  const narrative = lead.causal_narrative?.trim();

  let paragraph: string;
  if (focus.kind === "company") {
    paragraph = `${focus.label} sits at the receiving end of ${cleanThemeName(lead.name).toLowerCase()}, carrying ${tilt}.`;
  } else if (focus.kind === "sector") {
    paragraph = `${focus.label} is the sector channelling ${cleanThemeName(lead.name).toLowerCase()}${fThemes.length > 1 ? ` and ${fThemes.length - 1} more live ${fThemes.length - 1 === 1 ? "theme" : "themes"}` : ""}, with ${tilt}.`;
  } else if (focus.kind === "driver") {
    paragraph = `${focus.label} is the macro driver behind ${fThemes.slice(0, 2).map(t => cleanThemeName(t.name).toLowerCase()).join(" and ")}, transmitting ${tilt} through the tape.`;
  } else {
    paragraph = narrative || `${cleanThemeName(lead.name)} is live, carrying ${tilt}.`;
  }
  if (focus.kind !== "theme" && narrative) paragraph += ` ${narrative}`;

  return {
    headline:  focus.label,
    paragraph,
    watch:     themeWatch(lead),
    movers:    fThemes.slice(0, 4).map(t => cleanThemeName(t.name)),
  };
}
