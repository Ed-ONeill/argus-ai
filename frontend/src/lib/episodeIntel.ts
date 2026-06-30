/**
 * lib/episodeIntel.ts — turns an episode + its matched theme into the investment
 * intelligence an episode card should lead with (implication, beneficiaries, at-
 * risk, catalyst, risk, contrarian) plus a CONTEXTUAL summary label that rotates
 * by the episode's signal profile, so cards read as dynamically generated rather
 * than templated. Light: reads stored theme fields only, no heavy engine.
 */

import type { Episode, ThemeIntelligence } from "./types";

const isTicker = (s: string) => /^[A-Z][A-Z.]{0,5}$/.test(s);
const dirOf = (t: ThemeIntelligence): 1 | 0 | -1 => t.momentum_direction === "bullish" ? 1 : t.momentum_direction === "bearish" ? -1 : 0;

function deriveSector(t: ThemeIntelligence): string | null {
  const inds = t.related_industries ?? [];
  return inds.find(s => t.relationship_weights?.[s]?.direction === "positive") ?? inds[0] ?? null;
}
function negativeSectors(t: ThemeIntelligence): string[] {
  return (t.related_industries ?? []).filter(s => t.relationship_weights?.[s]?.direction === "negative");
}
function firstSentence(s?: string): string | null {
  if (!s) return null;
  const c = s.replace(/→|->/g, "—").trim();
  const dot = c.indexOf(". ");
  return dot > 12 ? c.slice(0, dot + 1) : c.length <= 165 ? c : null;
}
function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function catalystOf(t: ThemeIntelligence): string {
  const d = [t.name, ...(t.related_macro_factors ?? [])].join(" ").toLowerCase();
  if (/rate|yield|fed|fomc|policy/.test(d)) return "Next FOMC / rate path";
  if (/cpi|inflation|pce|price/.test(d)) return "Next inflation print";
  if (/\bai\b|chip|semi|gpu|data.?center/.test(d)) return "Hyperscaler capex guidance";
  if (/energy|oil|crude|power|grid|nuclear|util/.test(d)) return "Power demand & utility orders";
  if (/credit|lend|spread|bank/.test(d)) return "Credit spreads & bank lending";
  if (/defense|nato|military|rearm/.test(d)) return "Defense budget headlines";
  const macro = (t.related_macro_factors ?? [])[0];
  return macro ? `Watch ${macro}` : "Next confirming data point";
}
function riskOf(t: ThemeIntelligence): string {
  const d = [t.name, ...(t.related_macro_factors ?? [])].join(" ").toLowerCase();
  if (/credit|lend|spread|bank/.test(d)) return "Credit spreads normalize and bank lending reopens";
  if (/rate|yield|fed/.test(d)) return "Rates fall and the cost-of-capital edge fades";
  if (/\bai\b|chip|semi|gpu|data.?center/.test(d)) return "Hyperscaler capex is cut";
  if (/energy|power|grid|nuclear|util/.test(d)) return "Power-demand growth disappoints versus buildout";
  if (/defense|nato|military|rearm/.test(d)) return "A durable de-escalation reverses the cycle";
  return "The macro driver behind the move reverses";
}

export interface EpisodeIntel {
  label: string;          // rotating contextual summary label
  read: string;           // the read that matches the label
  beneficiaries: string[]; // tickers that benefit
  atRisk: string[];        // sectors under pressure
  catalyst: string;        // next confirming event
  risk: string;            // what invalidates the thesis
  confidence: number;      // narrative confidence
  contrarian: string | null;
}

const NEUTRAL_LABELS = ["Investment Takeaway", "Market Implication", "Strategist View", "Why It Matters", "Institutional Read"];

export function episodeIntel(ep: Episode, theme: ThemeIntelligence | null | undefined): EpisodeIntel | null {
  if (!theme) return null;
  const dir = dirOf(theme);
  const sector = deriveSector(theme) ?? "the sector";
  const conf = Math.round(theme.confidence ?? 0);
  const vol = theme.volatility_score ?? 0;
  const mom = theme.momentum_label;
  const beneficiaries = (theme.related_assets ?? []).filter(isTicker).slice(0, 4);
  const atRisk = negativeSectors(theme).slice(0, 2);
  const catalyst = catalystOf(theme);
  const risk = riskOf(theme);
  const narrative = firstSentence(theme.causal_narrative);

  const implication = dir > 0
    ? `Tailwind for ${sector}${beneficiaries.length ? ` — ${beneficiaries.slice(0, 2).join(" / ")} the cleanest expressions` : ""}.`
    : dir < 0
    ? `Pressure on ${sector}${atRisk.length ? ` and ${atRisk[0]}` : ""} — the exposed names carry downgrade risk.`
    : `Two-way setup in ${sector}; positioning is rotating faster than the narrative resolves.`;

  const contrarian = vol >= 60
    ? `Two-sided debate — fade risk if the consensus call on ${sector} is wrong.`
    : (conf >= 72 && mom === "accelerating")
    ? "Consensus is leaning in; the contrarian risk is positioning, not thesis."
    : null;

  // Contextual + deterministically-varied label so cards don't feel templated.
  const h = hash(ep.id);
  let label: string, read: string;
  if (dir < 0 || mom === "reversing") { label = "Key Risk"; read = `${risk}. ${implication}`; }
  else if (vol >= 60) { label = "Contrarian View"; read = contrarian ?? implication; }
  else if (mom === "emerging" || theme.memory?.is_new) { label = "Why It Matters"; read = narrative ?? implication; }
  else if (mom === "accelerating" && conf >= 70) { label = h % 2 ? "Institutional Read" : "Strategist View"; read = implication; }
  else if (h % 5 === 0) { label = "Catalyst"; read = `${catalyst} is the next test. ${implication}`; }
  else { label = NEUTRAL_LABELS[h % NEUTRAL_LABELS.length]; read = narrative && h % 2 === 0 ? narrative : implication; }

  return { label, read, beneficiaries, atRisk, catalyst, risk, confidence: conf, contrarian };
}

// ── Full institutional briefing — what an analyst hands you after listening ────
const uniq = (a: string[]) => [...new Set(a.filter(Boolean))];
function stateVerb(t: ThemeIntelligence): string {
  switch (t.momentum_label) {
    case "accelerating":  return "is accelerating";
    case "strengthening": return "is strengthening";
    case "emerging":      return "is emerging";
    case "cooling":       return "is cooling";
    case "reversing":     return "is reversing";
    default:              return "is active";
  }
}

export interface EpisodeBriefing {
  executiveSummary: string;
  thesis:           string;
  bull:             string;
  bear:             string;
  risks:            string[];
  catalysts:        string[];
  relatedNarratives: string[];
}

export function buildBriefing(ep: Episode, theme: ThemeIntelligence | null | undefined): EpisodeBriefing | null {
  if (!theme) return null;
  const dir = dirOf(theme);
  const name = theme.name.replace(/\s*[-–—:].*$/, "").trim();
  const sector = deriveSector(theme) ?? "the sector";
  const ben = (theme.related_assets ?? []).filter(isTicker).slice(0, 3);
  const driver = (theme.related_macro_factors ?? [])[0] ?? "the macro backdrop";
  const catalyst = catalystOf(theme);
  const risk = riskOf(theme);
  const narrative = firstSentence(theme.causal_narrative);
  const desc = firstSentence(ep.description);

  const implication = dir > 0
    ? `tailwind for ${sector}` : dir < 0 ? `pressure on ${sector}` : `a two-way setup in ${sector}`;

  const secondOrder = (theme.second_order_effects ?? []).map(s => s.replace(/\s+/g, " ").trim()).filter(s => s.length > 12 && !s.includes("→"));

  return {
    executiveSummary: desc
      ? `${desc} The institutional read: ${implication}.`
      : `${name} ${stateVerb(theme)} — ${implication}. ${narrative ?? `${driver} is the driver into ${sector}.`}`,
    thesis: `${name} ${stateVerb(theme)}, centered in ${sector}. The case rests on ${driver} sustaining direction into ${sector}${ben.length ? `, with ${ben.join(", ")} the cleanest expressions` : ""}.`,
    bull: dir >= 0
      ? `If ${driver} holds, ${sector} earnings inflect and ${ben[0] ?? "the leaders"} re-rate as flows concentrate.`
      : `Stabilization in ${driver} sets up a mean-reversion in oversold ${sector} names.`,
    bear: `If ${risk.toLowerCase()}, ${sector} de-rates and the crowded ${dir >= 0 ? "long" : "short"} unwinds.`,
    risks: uniq([risk + ".", ...secondOrder.slice(0, 1), "Positioning is crowded if the tape has already priced this."]).slice(0, 3),
    catalysts: uniq([catalyst, ...(theme.related_macro_factors ?? []).slice(0, 2).map(m => `Watch ${m}`)]).slice(0, 3),
    relatedNarratives: uniq([...(theme.related_macro_factors ?? []), ...(theme.podcast_topics ?? []), ...secondOrder.slice(0, 1)]).slice(0, 5),
  };
}

// ── Corpus-aware: similar & contradicting episodes ────────────────────────────
export function similarEpisodes(ep: Episode, theme: ThemeIntelligence | null | undefined, all: Episode[], themesOf: Map<string, ThemeIntelligence[]>): Episode[] {
  if (!theme) return [];
  return all.filter(e => e.id !== ep.id && (themesOf.get(e.id) ?? []).some(t => t.id === theme.id)).slice(0, 3);
}

export function contradictingEpisodes(ep: Episode, theme: ThemeIntelligence | null | undefined, all: Episode[], themesOf: Map<string, ThemeIntelligence[]>): Episode[] {
  if (!theme) return [];
  const dir = dirOf(theme);
  if (dir === 0) return [];
  const sector = deriveSector(theme);
  const cos = new Set(ep.entities.filter(isTicker).map(e => e.toUpperCase()));
  return all.filter(e => {
    if (e.id === ep.id) return false;
    const ts = themesOf.get(e.id) ?? [];
    return ts.some(t => dirOf(t) === -dir && (
      (sector && (t.related_industries ?? []).includes(sector)) ||
      e.entities.some(x => cos.has(x.toUpperCase()))
    ));
  }).slice(0, 3);
}
