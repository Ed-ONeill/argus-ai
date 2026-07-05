/**
 * lib/drawerEntity.ts - entity-aware Intelligence Drawer routing (Phase 16).
 *
 * Resolves the active IntelContext into the entity the drawer renders: which
 * entity type it is, which graph key the graph-backed sections read (market
 * structure, forecast, timeline, relationship map), and what the header shows.
 * Companies and ETFs resolve by ticker, exact key first, never through the
 * parent theme, so clicking ARES opens ARES rather than Private Credit. Themes,
 * sectors, drivers, deals and narratives keep the theme-based key. Pure reads
 * of the shared graph singleton: no React, no providers, no engine logic.
 * No em/en dashes.
 */

import { intelligenceGraph as G, normalizeKey } from "./intelligenceGraph";
import type { IntelNode } from "./intelligenceGraph";
import type { IntelContext, IntelKind } from "./intelligenceContext";

export type DrawerEntityType = IntelKind;

export interface DrawerEntity {
  entityType: DrawerEntityType;
  graphKey:   string;          // the key every graph-backed section reads
  title:      string;          // drawer header title (ticker for symbols, theme name otherwise)
  subtitle:   string | null;   // secondary header line (parent theme for symbols)
  node:       IntelNode | null;
  showMarketStructure: boolean; // symbols with latestMarketData only; always false for themes
}

export interface DrawerEntityInputs {
  themeName?:        string | null; // resolved parent theme name, when one exists
  relatedCompanies?: string[];      // related tickers, fallback candidates for symbols
}

/** Company-flavored kinds that resolve by ticker (company and ETF). */
export const isSymbolKindIntel = (kind: IntelKind): boolean => kind === "company" || kind === "etf";

/** Build a company IntelContext from a ticker (the canonical company chip payload). */
export function buildCompanyContext(ticker: string, label?: string, sourceTheme?: string, color?: string): IntelContext {
  return buildSymbolContext("company", ticker, { label, sourceTheme, color });
}

/** Build a symbol (company / ETF) IntelContext keyed by its uppercase ticker. */
export function buildSymbolContext(
  kind: "company" | "etf",
  ticker: string,
  opts: { label?: string; sourceTheme?: string; color?: string } = {},
): IntelContext {
  const t = ticker.toUpperCase();
  return { kind, id: t, label: opts.label ?? t, sourceTheme: opts.sourceTheme, color: opts.color };
}

const hasMarketData = (n: IntelNode | null): boolean =>
  !!n && typeof n.metadata.latestMarketData === "object" && n.metadata.latestMarketData !== null;

/**
 * Does a node alias back to the focused entity? Fuzzy only above ticker length,
 * so "vistra" matches "vistra-corp" but a two-letter ticker cannot substring-match
 * an unrelated company.
 */
function nodeMatchesFocus(node: IntelNode, focusKeys: string[]): boolean {
  return node.aliases.some(a => {
    const k = normalizeKey(a);
    return focusKeys.some(f => f === k || (Math.min(f.length, k.length) >= 4 && (k.includes(f) || f.includes(k))));
  });
}

/**
 * Discriminated resolver from the active context to the drawer's entity.
 * Symbols: exact ticker first (ctx.id, then ctx.label), then related-company
 * tickers whose node aliases back to the focus; the first candidate carrying
 * latestMarketData wins, else the first that resolves to a node at all. Theme
 * names are never used as the graph key for company / ETF contexts.
 */
export function resolveDrawerEntity(ctx: IntelContext, inputs: DrawerEntityInputs = {}): DrawerEntity {
  const themeName = inputs.themeName ?? null;

  if (isSymbolKindIntel(ctx.kind)) {
    const focusKeys = [ctx.id, ctx.label].filter(Boolean).map(normalizeKey);
    const related = (inputs.relatedCompanies ?? []).filter(t => {
      const n = G.getNode(t);
      return !!n && nodeMatchesFocus(n, focusKeys);
    });

    let node: IntelNode | null = null;
    let graphKey = ctx.id || ctx.label;
    for (const key of [ctx.id, ctx.label, ...related]) {
      if (!key) continue;
      const n = G.getNode(key) ?? null;
      if (!n) continue;
      if (!node) { node = n; graphKey = key; }
      if (hasMarketData(n)) { node = n; graphKey = key; break; }
    }

    return {
      entityType: ctx.kind,
      graphKey,
      title: ctx.label || ctx.id,
      subtitle: ctx.sourceTheme ?? themeName,
      node,
      showMarketStructure: hasMarketData(node),
    };
  }

  // Theme-shaped contexts (theme / sector / driver / deal / narrative) keep the
  // theme-based key and never show market structure.
  const graphKey = themeName ?? ctx.label;
  return {
    entityType: ctx.kind,
    graphKey,
    title: graphKey,
    subtitle: null,
    node: G.getNode(graphKey) ?? null,
    showMarketStructure: false,
  };
}
