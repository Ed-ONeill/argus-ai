/**
 * lib/feedNarrative.ts - the Feed's voice over the shared narrative thesis
 * (Phase 2 Feed unification; retires marketMap.buildMarketStory, debt D6).
 *
 * The hero's "Today's Market Story" is no longer synthesized ad hoc from theme
 * fields: it is the SAME DerivedNarrative thesis The Read shows on the Morning
 * Brief, re-voiced for the feed. Injection, not derivation: this module takes
 * the assembled ReadVM (built once from the canonically provisioned graph) and
 * only phrases it - sentence 1 is the shared thesis line VERBATIM, so the feed
 * hero and The Read can never tell different stories about the same data.
 *
 * Honest degradation mirrors The Read's: no derivable narrative renders the
 * single-theme fallback (mode "theme"); no themes renders nothing.
 *
 * Pure module, relative imports only, exercised by intelligenceTests.ts
 * (83.x). No em/en dashes in code strings.
 */

import type { ReadVM } from "./theRead";
import type { ThemeIntelligence } from "./types";

export interface MarketStoryVM {
  paragraph: string;
  watch:     string;
  movers:    string[];
  /** Same honesty marker as the Read thesis: "theme" = single-theme fallback. */
  mode:      "narrative" | "theme";
}

export interface MarketStorySnapshot { riskRegime: "risk-on" | "neutral" | "risk-off" }

const shortName = (s: string) => s.replace(/\s*[-:].*$/, "").trim();

/**
 * Phrase the feed hero's story from the shared Read. Sentence 1 is the thesis
 * line verbatim; sentence 2 is feed voice over stored direction fields (the
 * counterweight) or the regime; the watch line is the shared derived watch
 * item. Returns null when The Read has no thesis (no themes yet).
 */
export function buildMarketStoryVM(
  read: ReadVM,
  themes: ThemeIntelligence[],
  snap: MarketStorySnapshot,
): MarketStoryVM | null {
  const thesis = read.thesis.data;
  if (!thesis) return null;

  const bear = themes
    .filter(t => t.momentum_direction === "bearish")
    .sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0))[0] ?? null;
  const counterweight = bear && !thesis.members.some(m => m.name === bear.name)
    ? `The counterweight is ${shortName(bear.name)}, still under pressure.`
    : snap.riskRegime === "risk-off"
      ? "Risk appetite is not confirming it: conviction is concentrating rather than broadening."
      : snap.riskRegime === "risk-on"
        ? "Risk appetite is confirming it, rewarding the story as it broadens."
        : "The regime is mixed; positioning is rotating faster than the story is resolving.";

  const w = read.watch.data?.[0] ?? null;
  return {
    paragraph: `${thesis.thesisLine} ${counterweight}`,
    watch: w ? `The next signal is ${w.text}.` : "The next signal is fresh confirmation across sources.",
    movers: thesis.members.map(m => m.name),
    mode: thesis.mode,
  };
}
