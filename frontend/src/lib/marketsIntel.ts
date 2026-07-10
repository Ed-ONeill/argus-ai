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
import type { ThemeIntelligence } from "./types";

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
  /** Market-impact bullets: the Read's recorded exposure + the ledger's
      "why it matters" lines for member themes. Recorded facts only - replaces
      the retired generateWhyItMattersNow advice templates (Phase 2.4). */
  impact:     ProfileSection<string[]>;
}

/**
 * Recorded-fact impact bullets for ONE theme (Sector Positioning expanded
 * cards). Every bullet is a phrasing of stored pipeline fields or attached
 * server ThemeMemory - a current-state and recorded-exposure read, never
 * invented positioning advice and never a temporal claim from one snapshot.
 */
export function themeImpactBullets(t: ThemeIntelligence): string[] {
  const bullets: string[] = [];

  const d = Math.round(t.momentum_delta ?? 0);
  bullets.push(
    `Signal is ${t.momentum_label ?? "stable"}${d !== 0 ? ` (${d > 0 ? "+" : ""}${d} momentum delta this cycle)` : ""}, ${t.signal_strength ?? "unrated"} strength.`,
  );

  const sectors = (t.related_industries ?? []).slice(0, 2);
  const tickers = (t.related_assets ?? []).slice(0, 3);
  if (sectors.length || tickers.length) {
    const parts: string[] = [];
    if (sectors.length) parts.push(`Transmits through ${sectors.join(" and ")}`);
    if (tickers.length) parts.push(`${tickers.join(", ")} on record as exposed`);
    bullets.push(parts.join("; ") + ".");
  }

  const m = t.memory;
  if (m && m.sessions_observed >= 2) {
    bullets.push(
      `Observed across ${m.sessions_observed} sessions; conviction ${m.conviction_first} to ${m.conviction_current}` +
      (m.contradictions_today > 0 ? `, ${m.contradictions_today} contradicting stor${m.contradictions_today === 1 ? "y" : "ies"} this cycle.` : "."),
    );
  }

  return bullets.slice(0, 3);
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

  /* -- market impact: the Read's recorded exposure + member "matters" lines
        from the shared ledger. Selection and phrasing only; both sources are
        canonical objects other surfaces already show. -- */
  const bullets: string[] = [];
  const exp = read.exposure.data;
  if (exp) {
    const sectors = exp.sectors.slice(0, 2).map(s => s.label);
    const companies = exp.companies.slice(0, 3).map(c => c.label);
    if (sectors.length || companies.length) {
      const parts: string[] = [];
      if (sectors.length) parts.push(`Transmits through ${sectors.join(" and ")}`);
      if (companies.length) parts.push(`${companies.join(", ")} most exposed on record`);
      bullets.push(parts.join("; ") + ".");
    }
  }
  const memberSet = new Set((thesis?.members ?? []).map(m => m.name.toLowerCase()));
  for (const d of deltaResult.deltas) {
    if (!memberSet.has(d.entity.toLowerCase())) continue;
    if (bullets.length >= 3) break;
    if (!bullets.includes(d.matters)) bullets.push(d.matters);
  }
  const impact: ProfileSection<string[]> = bullets.length > 0
    ? { status: "live", data: bullets.slice(0, 3) }
    : { status: "unavailable", data: null, note: "No recorded exposure or ledger entries to derive market impact from yet." };

  return { read, conviction, changed, impact };
}
