import type { ThemeIntelligence } from "./types";

export function getThemesForIndustry(
  industryName: string,
  themes: ThemeIntelligence[],
): ThemeIntelligence[] {
  return themes.filter(t => t.related_industries.includes(industryName));
}

export function getThemesForAsset(
  ticker: string,
  themes: ThemeIntelligence[],
): ThemeIntelligence[] {
  return themes.filter(t => t.related_assets.includes(ticker));
}

export function getThemesForCluster(
  clusterId: string,
  themes: ThemeIntelligence[],
): ThemeIntelligence[] {
  return themes.filter(t => t.contributing_cluster_ids.includes(clusterId));
}

export function getPrimaryTheme(
  themes: ThemeIntelligence[],
): ThemeIntelligence | null {
  if (!themes.length) return null;
  return [...themes].sort((a, b) => b.confidence - a.confidence)[0] ?? null;
}

export function getSecondOrderEffects(theme: ThemeIntelligence): string[] {
  return theme.second_order_effects;
}
