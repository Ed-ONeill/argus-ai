// lib/homeBriefing.ts — intelligence ATTACHED TO THE DAY'S LEAD STORY. Not a section of
// its own: the causal read ("why it's moving"), the exposure ("who is affected"), and the
// forward line ("what to watch") all hang off the single most editorially significant real
// event. If that event has no linked theme, there is no interpretation to attach — honest
// omission, never a causal chain bolted onto an unrelated story.
//
// Everything reads in the nouns investors use — companies, markets, macro events,
// commodities, sectors, geopolitics — never the engine's own vocabulary. Pure and
// deterministic; the engine is untouched, only its output is re-expressed.

import type { EntityKind } from "./entity";
import type { FeedResponse, MarketEvent, ThemeIntelligence } from "./types";
import { sanitizeCopy } from "./utils";
import { rankByImportance } from "./intelligenceScore";

export type MarketCategory = "Company" | "Index" | "Macro" | "Commodity" | "Geopolitics" | "Sector";

export interface CausalActor { label: string; kind: EntityKind; }

export interface WhyItsMoving {
  subject: string;
  read: string;           // a calm, readable causal explanation (finance prose)
  chain: CausalActor[];   // real actors in order: CPI -> Yields -> Semiconductors -> NVIDIA
  benefits: CausalActor[];
  atRisk: CausalActor[];
}

export interface HomeBriefingVM {
  hasIntelligence: boolean;
  why: WhyItsMoving | null;    // attached to the lead story; null when nothing to attach
  watchLine: string | null;    // the lead story's forward implication
}

const isTicker = (s: string): boolean => /^[A-Z]{1,5}$/.test(s.trim());

// Keyword -> canonical finance noun. Scanned against the theme NAME first (most
// indicative of what a development is actually about) so the surface reads as markets.
const CATEGORY_RULES: { category: MarketCategory; kind: EntityKind; hits: [RegExp, string][] }[] = [
  { category: "Geopolitics", kind: "macro", hits: [
    [/\bchina\b/i, "China"], [/\btaiwan\b/i, "Taiwan"], [/\brussia\b/i, "Russia"],
    [/\bukraine\b/i, "Ukraine"], [/\biran\b/i, "Iran"], [/\bisrael\b/i, "Israel"],
    [/middle east/i, "Middle East"], [/\btariffs?\b/i, "Tariffs"], [/\bsanctions?\b/i, "Sanctions"],
    [/\bopec\b/i, "OPEC"], [/north korea/i, "North Korea"] ] },
  { category: "Commodity", kind: "macro", hits: [
    [/\bcrude\b|\boil\b|\bbrent\b|\bwti\b/i, "Oil"], [/\bgold\b/i, "Gold"], [/\bsilver\b/i, "Silver"],
    [/\bcopper\b/i, "Copper"], [/natural gas|\bnat gas\b/i, "Natural Gas"], [/\buranium\b/i, "Uranium"],
    [/\blithium\b/i, "Lithium"], [/\bwheat\b/i, "Wheat"] ] },
  { category: "Macro", kind: "macro", hits: [
    [/\bcpi\b/i, "CPI"], [/\bpce\b/i, "PCE"], [/\binflation\b/i, "Inflation"],
    [/federal reserve|\bfed\b|\bfomc\b/i, "Fed"], [/treasury|\byields?\b/i, "Treasury Yields"],
    [/\brates?\b|rate cut|rate hike/i, "Interest Rates"], [/\bjobs?\b|payrolls?|unemployment/i, "Jobs Report"],
    [/\bgdp\b/i, "GDP"], [/\bdollar\b|\bdxy\b/i, "US Dollar"] ] },
  { category: "Index", kind: "macro", hits: [
    [/s&p|sp ?500/i, "S&P 500"], [/nasdaq/i, "Nasdaq"], [/\bdow\b/i, "Dow Jones"],
    [/russell/i, "Russell 2000"], [/\bvix\b|volatility/i, "Volatility"] ] },
];

interface Subject { label: string; kind: EntityKind; category: MarketCategory; }

function classify(theme: ThemeIntelligence): Subject | null {
  const name = theme.name ?? "";
  for (const rule of CATEGORY_RULES) {
    for (const [re, canon] of rule.hits) {
      if (re.test(name)) return { label: canon, kind: rule.kind, category: rule.category };
    }
  }
  const asset = (theme.related_assets ?? []).find((a) => a.trim());
  if (asset) return { label: asset.trim(), kind: isTicker(asset) ? "ticker" : "company", category: "Company" };
  const ind = (theme.related_industries ?? []).find((i) => i.trim());
  if (ind) return { label: ind.trim(), kind: "sector", category: "Sector" };
  const mf = (theme.related_macro_factors ?? []).find((m) => m.trim());
  if (mf) return { label: canonMacro(mf), kind: "macro", category: "Macro" };
  return null;
}

/** Map a macro-factor string to a recognizable finance noun (else the raw string). */
function canonMacro(s: string): string {
  for (const rule of CATEGORY_RULES) {
    for (const [re, canon] of rule.hits) if (re.test(s)) return canon;
  }
  return s.trim();
}

/** Cap free text to N sentences / M words without cutting mid-sentence. */
function cap(text: string, maxSentences: number, maxWords: number): string {
  const clean = sanitizeCopy(text) ?? "";
  const sentences = clean.match(/[^.!?]+[.!?]+/g) ?? [clean];
  let out = "";
  let words = 0;
  for (const s of sentences.slice(0, maxSentences)) {
    const w = s.trim().split(/\s+/).length;
    if (words + w > maxWords) break;
    out += (out ? " " : "") + s.trim();
    words += w;
  }
  return out.trim();
}

function exposures(t: ThemeIntelligence): { benefits: CausalActor[]; atRisk: CausalActor[] } {
  const rels = Object.entries(t.relationship_weights ?? {});
  const pick = (dir: "positive" | "negative"): CausalActor[] =>
    rels.filter(([, r]) => r.direction === dir)
      .sort((a, b) => (b[1].weight ?? 0) - (a[1].weight ?? 0))
      .slice(0, 4)
      .map(([name]) => ({ label: name, kind: "sector" as EntityKind }));
  return { benefits: pick("positive"), atRisk: pick("negative") };
}

/** The theme linked to the day's single most significant real event, or null. */
function leadTheme(feed: FeedResponse | undefined, themes: ThemeIntelligence[]): ThemeIntelligence | null {
  const events: MarketEvent[] = [...(feed?.events ?? [])].sort((a, b) => (b.editorial_score ?? 0) - (a.editorial_score ?? 0));
  const lead = events[0];
  const id = lead?.theme_ids?.[0];
  return id ? themes.find((t) => t.id === id) ?? null : null;
}

function buildWhy(top: ThemeIntelligence | null): WhyItsMoving | null {
  if (!top) return null;

  const macro = (top.related_macro_factors ?? []).map(canonMacro);
  const sector = (top.related_industries ?? [])[0];
  const company = (top.related_assets ?? []).find((a) => a.trim());

  const raw: CausalActor[] = [];
  if (macro[0]) raw.push({ label: macro[0], kind: "macro" });
  if (macro[1] && macro[1] !== macro[0]) raw.push({ label: macro[1], kind: "macro" });
  if (sector) raw.push({ label: sector.trim(), kind: "sector" });
  if (company) raw.push({ label: company.trim(), kind: isTicker(company) ? "ticker" : "company" });
  const chain = raw.filter((a, i) => i === 0 || a.label !== raw[i - 1].label);
  if (chain.length < 2) return null;

  const subject = company?.trim() || sector?.trim() || chain[chain.length - 1].label;
  const verb = top.momentum_direction === "bearish" ? "is under pressure"
    : top.momentum_direction === "bullish" ? "is moving higher" : "is in play";
  const read = cap(top.causal_narrative || top.description || "", 1, 30)
    || sanitizeCopy(`${chain[0].label} is feeding through to ${subject}, which ${verb}.`) || subject;

  const { benefits, atRisk } = exposures(top);
  return { subject, read, chain, benefits, atRisk };
}

/** One forward line attached to the lead story: a real tension if one exists, else its
 *  next second-order effect, else nothing. Never a manufactured question. */
function buildWatchLine(lead: ThemeIntelligence | null, themes: ThemeIntelligence[]): string | null {
  if (!lead) return null;
  const counter = rankByImportance(themes).find(({ theme }) =>
    theme.id !== lead.id && (theme.momentum_label === "cooling" || theme.momentum_label === "reversing"));
  const leadSubj = classify(lead)?.label;
  const cSubj = counter ? classify(counter.theme)?.label : null;
  if (leadSubj && cSubj) return sanitizeCopy(`Can ${leadSubj} hold if ${cSubj} takes over?`);
  const lag = (lead.second_order_effects ?? [])[0];
  return lag ? sanitizeCopy(`Watch if ${lag.toLowerCase()} follows.`) : null;
}

export function buildHomeBriefing(feed: FeedResponse | undefined): HomeBriefingVM {
  const themes = (feed?.theme_intelligence ?? []).filter((t) => t && t.name);
  const lead = leadTheme(feed, themes);
  return {
    hasIntelligence: themes.length > 0,
    why: buildWhy(lead),
    watchLine: buildWatchLine(lead, themes),
  };
}
