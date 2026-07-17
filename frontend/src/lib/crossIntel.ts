/**
 * lib/crossIntel.ts - the cross-page thematic aggregator (Phase 3).
 *
 * LEGACY-PATH (IRE-1, ARGUS_INSTITUTIONAL_REASONING_ENGINE_V1, audit R3): the
 * firstSentence() string surgery over causal_narrative prose is exactly what
 * the typed transmission_chain retires — read chains from the backend
 * Explanation instead as consumers migrate (IRE-5). Do not extend the prose
 * processing here.
 *
 * Given the active intelligence context, resolve it to a live theme and gather
 * everything that connects to it across the product: related companies, sectors,
 * stories, M&A deals, private capital read, and Listen conversations, plus
 * momentum / conviction / persistence and a risk + opportunity read. Light reads
 * of already-fetched data. No em/en dashes in output.
 */

import type { ThemeIntelligence, StoryCluster, Episode } from "./types";
import type { MADeal } from "@/hooks/useMAIntelligence";
import type { IntelContext } from "./intelligenceContext";
import { deriveDriver, deriveSector, themeWatch, dirOf } from "./themeTransmission";
import { cleanThemeName } from "@/app/markets/marketsShared";

const lc = (s: string) => s.toLowerCase();
const isTicker = (s: string) => /^[A-Z][A-Z.]{0,5}$/.test(s);
const firstSentence = (s?: string): string => {
  if (!s) return "";
  const c = s.replace(/→/g, ", ").replace(/ {2,}/g, " ").trim();
  const dot = c.indexOf(". ");
  return dot > 12 ? c.slice(0, dot + 1) : c;
};

export interface RelatedPage { label: string; href: string; note: string }

export interface CrossIntel {
  theme:        ThemeIntelligence | null;
  themeKey:     string;
  title:        string;
  kindLabel:    string;
  what:         string;
  why:          string;
  companies:    string[];
  sectors:      string[];
  drivers:      string[];
  stories:      StoryCluster[];
  deals:        MADeal[];
  listen:       Episode[];
  conviction:   number | null;
  momentum:     string | null;
  persistence:  number | null;
  acceleration: number | null;
  nextWatch:    string;
  relatedPages: RelatedPage[];
}

function resolveTheme(ctx: IntelContext, themes: ThemeIntelligence[]): ThemeIntelligence | null {
  const byConf = (a: ThemeIntelligence, b: ThemeIntelligence) => (b.confidence ?? 0) - (a.confidence ?? 0);
  const name = lc(ctx.label);
  if (ctx.kind === "theme" || ctx.kind === "narrative")
    return themes.filter(t => lc(cleanThemeName(t.name)) === name || lc(cleanThemeName(t.name)).includes(name)).sort(byConf)[0] ?? null;
  if (ctx.kind === "sector")
    return themes.filter(t => (t.related_industries ?? []).some(s => lc(s) === name) || lc(deriveSector(t) ?? "") === name).sort(byConf)[0] ?? null;
  if (ctx.kind === "driver")
    return themes.filter(t => (t.related_macro_factors ?? []).some(m => lc(m) === name) || lc(deriveDriver(t)) === name).sort(byConf)[0] ?? null;
  if (ctx.kind === "company" || ctx.kind === "etf") {
    const tk = ctx.id.toUpperCase();
    return themes.filter(t => (t.related_assets ?? []).map(a => a.toUpperCase()).includes(tk)).sort(byConf)[0] ?? null;
  }
  return null;
}

export interface CrossInputs {
  themes:   ThemeIntelligence[];
  clusters: StoryCluster[];
  deals:    MADeal[];
  episodes: Episode[];
}

export function buildCrossIntel(ctx: IntelContext, { themes, clusters, deals, episodes }: CrossInputs): CrossIntel {
  const theme = resolveTheme(ctx, themes);
  const KIND_LABEL: Record<IntelContext["kind"], string> = {
    theme: "Theme", company: "Company", etf: "ETF", sector: "Sector", driver: "Macro Driver", deal: "M&A Deal", narrative: "Narrative",
  };
  // Symbol contexts (company / ETF) keep their own identity: the resolved theme
  // enriches the picture but never replaces the entity in the title or the read.
  const symbolCtx = ctx.kind === "company" || ctx.kind === "etf";

  const sector = theme ? deriveSector(theme) : (ctx.kind === "sector" ? ctx.label : null);
  const dir = theme ? dirOf(theme) : "neutral";
  const companies = theme ? (theme.related_assets ?? []).filter(isTicker).slice(0, 6)
    : symbolCtx ? [ctx.label.toUpperCase()] : [];
  const sectors = theme ? (theme.related_industries ?? []).slice(0, 4) : (sector ? [sector] : []);
  const drivers = theme ? (theme.related_macro_factors ?? []).slice(0, 3) : (ctx.kind === "driver" ? [ctx.label] : []);

  // Tokens the context matches on (for stories / deals / listen).
  const tokens = new Set<string>([lc(ctx.label), ctx.id.toLowerCase(), ...companies.map(lc), ...sectors.map(lc)]);
  const hit = (text: string) => { const h = lc(text); return [...tokens].some(t => t.length >= 3 && h.includes(t)); };

  // Related stories (by contributing cluster id, then keyword).
  const clusterIds = new Set(theme?.contributing_cluster_ids ?? []);
  const stories = clusters
    .filter(c => clusterIds.has(c.id) || hit(`${c.primary.title} ${(c.primary.affected_entities ?? []).join(" ")}`))
    .slice(0, 4);

  // Related M&A deals (sector match, then company / keyword).
  const relDeals = deals
    .filter(d => (sector && lc(d.sector) === lc(sector)) || hit(`${d.title} ${d.sector}`))
    .slice(0, 4);

  // Related Listen conversations (entity / keyword).
  const relEpisodes = episodes
    .filter(ep => hit(`${ep.title} ${(ep.entities ?? []).join(" ")}`))
    .slice(0, 4);

  const conviction = theme ? Math.round(theme.confidence ?? 0) : null;
  const accel = theme ? Math.round(theme.momentum_delta ?? 0) : null;

  // P2.7 (D8): the privateRead / opportunity / risk template outputs are
  // DELETED - crossIntel is now routing + narrative injection only. Risk and
  // forward meaning come from shared profiles (Explorer/drawer render them).

  const relatedPages: RelatedPage[] = [
    { label: "Feed", href: "/feed", note: `${stories.length} related stor${stories.length === 1 ? "y" : "ies"}` },
    { label: "Markets", href: "/markets", note: sector ? `${sector} sector` : "sector view" },
    ...(sectors.length ? [{ label: "Industries", href: "/industries", note: `${sectors.length} exposed` }] : []),
    ...(relDeals.length ? [{ label: "M&A", href: "/ma", note: `${relDeals.length} related deal${relDeals.length === 1 ? "" : "s"}` }] : []),
    { label: "Private", href: "/private-markets", note: "capital flow" },
    ...(relEpisodes.length ? [{ label: "Listen", href: "/listen", note: `${relEpisodes.length} conversation${relEpisodes.length === 1 ? "" : "s"}` }] : []),
  ];

  return {
    theme,
    themeKey: theme ? cleanThemeName(theme.name).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") : ctx.id,
    title: symbolCtx ? (ctx.label || ctx.id) : theme ? cleanThemeName(theme.name) : ctx.label,
    kindLabel: KIND_LABEL[ctx.kind],
    what: symbolCtx
      ? theme
        ? `${ctx.label} is a tracked ${KIND_LABEL[ctx.kind].toLowerCase()} exposed to ${cleanThemeName(theme.name)}, ${sector ? `a ${dir} read on ${sector}` : `a ${dir} market narrative`}.`
        : `${ctx.label} is being tracked as a ${KIND_LABEL[ctx.kind].toLowerCase()}.`
      : theme
      ? `${cleanThemeName(theme.name)}: ${sector ? `a ${dir} read on ${sector}` : `a ${dir} market narrative`}, driven by ${drivers[0] ?? "the macro backdrop"}.`
      : `${ctx.label} is being tracked as a ${KIND_LABEL[ctx.kind].toLowerCase()}.`,
    why: theme ? (firstSentence(theme.causal_narrative) || `${cleanThemeName(theme.name)} is an active tracked narrative.`) : "Select where it appears to see how the read firms up.",
    companies, sectors, drivers, stories, deals: relDeals, listen: relEpisodes,
    conviction, momentum: theme?.momentum_label ?? null, persistence: theme ? Math.round(theme.persistence_score ?? 0) : null, acceleration: accel,
    nextWatch: theme ? themeWatch(theme) : "fresh confirmation before sizing conviction",
    relatedPages,
  };
}
