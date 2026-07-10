/**
 * lib/marketsIntel.ts - the Markets surface projection of the shared
 * intelligence (Phase 2.2: Markets becomes the Intelligence Terminal).
 *
 * Markets answers five investor questions, all as projections of objects that
 * already exist - never page-local synthesis:
 *
 *   What changed?        the shared change ledger, grouped by narrative
 *                        membership instead of tickers
 *   Why?                 the SAME DerivedNarrative thesis The Read shows
 *                        (pass-through of the ReadVM; Markets re-voices only)
 *   Where is capital     the Read's transmission chain over the canonically
 *   flowing?             provisioned graph
 *   What breaks it?      the Read's falsifiers + the standing contradiction
 *   What to watch?       the Read's watch items and verified catalysts, with
 *                        the honest no-confirmed-catalyst state
 *
 * The conviction number replaces the summarizer's confidence permanently on
 * this page (structurally: this module never sees the MarketBrief) and always
 * decomposes. Pure module, relative imports only, exercised by
 * intelligenceTests.ts (84.x). No em/en dashes.
 */

import type { ReadVM } from "./theRead";
import { deltasToSection, type DeltaResult, type MorningBriefDelta } from "./intelligenceDeltas";
import type { ProfileSection } from "./intelligenceProfile";

export interface MarketsConviction {
  /** Leading narrative member's backend conviction. Never a summarizer number. */
  value:       number;
  themeName:   string;
  explanation: string;   // full decomposition (I4)
}

export interface MarketsChanged {
  /** Deltas touching the dominant narrative's members - the rotation story. */
  narrative: MorningBriefDelta[];
  /** Everything else the ledger recorded this cycle. */
  broader:   MorningBriefDelta[];
}

export interface MarketsIntelVM {
  /** The shared Read, passed through untouched: Markets projects it and can
      therefore never disagree with the Morning Brief or Explorer about it. */
  read:       ReadVM;
  conviction: ProfileSection<MarketsConviction>;
  changed:    ProfileSection<MarketsChanged>;
}

/** Project the shared Read + change ledger into the Markets view model. */
export function buildMarketsIntel(read: ReadVM, deltaResult: DeltaResult): MarketsIntelVM {
  const thesis = read.thesis.data;

  /* -- conviction: leading member, decomposed via the thesis's own credentials -- */
  let conviction: ProfileSection<MarketsConviction>;
  if (thesis && thesis.members.length > 0) {
    const m = thesis.members[0];
    const explanation = [
      `${m.name} conviction ${m.conviction}, computed by the theme pipeline${m.trend ? ` and ${m.trend} per cross-session memory` : ""}.`,
      thesis.whyDominant,
      thesis.coherence ? thesis.coherence.explanation : null,
    ].filter(Boolean).join(" ");
    conviction = { status: "live", data: { value: m.conviction, themeName: m.name, explanation } };
  } else {
    conviction = { status: "unavailable", data: null, note: "No thesis to read conviction from yet." };
  }

  /* -- what changed: the shared ledger (one policy home: deltasToSection),
        grouped by narrative membership instead of tickers -- */
  const base = deltasToSection(deltaResult);
  let changed: ProfileSection<MarketsChanged>;
  if (base.data === null) {
    changed = { status: base.status, data: null, ...(base.note ? { note: base.note } : {}) };
  } else {
    const members = new Set((thesis?.members ?? []).map(x => x.name.toLowerCase()));
    changed = {
      status: base.status,
      data: {
        narrative: base.data.filter(d => members.has(d.entity.toLowerCase())),
        broader:   base.data.filter(d => !members.has(d.entity.toLowerCase())),
      },
      ...(base.note ? { note: base.note } : {}),
    };
  }

  return { read, conviction, changed };
}
