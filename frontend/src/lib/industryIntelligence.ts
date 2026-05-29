/**
 * industryIntelligence.ts — Per-industry intelligence functions.
 *
 * Pure deterministic. Zero API calls. All derived from existing feed fields.
 */

import type { StoryCluster, IndustrySignal, SectorIntelligence, ThemeIntelligence } from "./types";
import type { IndustryConfig } from "./industryConfig";

// ── 1. Influential Entity Intelligence ───────────────────────────────────────

export interface EntitySignal {
  name:       string;
  isTicker:   boolean;
  mentions:   number;
  headline:   string;
  isKeyAsset: boolean;
  status:     "leader" | "laggard" | "neutral";
}

export function getInfluentialEntities(
  industry:    IndustryConfig,
  topClusters: StoryCluster[],
  indSignals:  IndustrySignal[],
  sectorIntel: SectorIntelligence | null,
  leaders:     string[],
  laggards:    string[],
): EntitySignal[] {
  const assetSet  = new Set(industry.keyAssets.map(a => a.toUpperCase()));
  const leaderSet = new Set(leaders.map(l => l.toUpperCase()));
  const laggardSet = new Set(laggards.map(l => l.toUpperCase()));

  const map = new Map<string, { originalName: string; mentions: number; headlines: string[] }>();

  function add(name: string, headline = "", weight = 1) {
    if (!name || name.trim().length < 2) return;
    const key = name.toUpperCase();
    if (!map.has(key)) map.set(key, { originalName: name, mentions: 0, headlines: [] });
    const e = map.get(key)!;
    e.mentions += weight;
    if (headline && e.headlines.length < 2) e.headlines.push(headline);
  }

  // Cluster entity mentions
  for (const cl of topClusters) {
    const p = cl.primary;
    const isKey = p.affected_entities.some(e => assetSet.has(e.toUpperCase()));
    for (const entity of p.affected_entities) {
      add(entity, p.why_it_matters || p.title, isKey ? 2 : 1);
    }
  }

  // Industry signal top entities (high signal quality)
  for (const sig of indSignals) {
    if (sig.top_entity) add(sig.top_entity, sig.narrative, 4);
  }

  // Sector top entity
  if (sectorIntel?.top_entity) add(sectorIntel.top_entity, "", 2);

  // Ensure all keyAssets are represented
  for (const asset of industry.keyAssets) {
    add(asset, "", assetSet.has(asset.toUpperCase()) ? 1 : 0);
  }

  return Array.from(map.entries())
    .map(([key, { originalName, mentions, headlines }]) => {
      const isTicker  = /^[A-Z]{1,6}(-[A-Z]+)?$/.test(key);
      const isKeyAsset = assetSet.has(key);
      const displayName = isKeyAsset
        ? (industry.keyAssets.find(a => a.toUpperCase() === key) ?? originalName)
        : originalName;

      const status: EntitySignal["status"] =
        leaderSet.has(key)  ? "leader" :
        laggardSet.has(key) ? "laggard" : "neutral";

      return {
        name:       displayName,
        isTicker,
        mentions:   mentions + (isKeyAsset ? 3 : 0) + (status !== "neutral" ? 2 : 0),
        headline:   headlines[0] ?? "",
        isKeyAsset,
        status,
      };
    })
    .filter(e => e.mentions > 0)
    .sort((a, b) => {
      // Leaders/laggards first, then keyAssets, then by mention count
      const rankA = a.status !== "neutral" ? 0 : a.isKeyAsset ? 1 : 2;
      const rankB = b.status !== "neutral" ? 0 : b.isKeyAsset ? 1 : 2;
      if (rankA !== rankB) return rankA - rankB;
      return b.mentions - a.mentions;
    })
    .slice(0, 10);
}

// ── 2. VC & Funding Activity ──────────────────────────────────────────────────

const VC_KW = [
  "raises", "funding round", "series a", "series b", "series c", "series d",
  "venture", "growth capital", "seed round", "invested in", "backed",
  "vc-backed", "startup", "late-stage", "led the round", "valuation",
];

export function filterVCFundingClusters(
  industry:    IndustryConfig,
  allClusters: StoryCluster[],
): StoryCluster[] {
  const indLower  = industry.name.toLowerCase();
  const secLower  = industry.sector.toLowerCase();
  const assetSet  = new Set(industry.keyAssets.map(a => a.toUpperCase()));

  return allClusters
    .filter(c => {
      const p       = c.primary;
      const haystack = [p.title, p.category, ...(p.affected_entities ?? [])].join(" ").toLowerCase();
      if (!VC_KW.some(kw => haystack.includes(kw))) return false;
      return (
        haystack.includes(indLower) ||
        haystack.includes(secLower) ||
        p.affected_entities.some(e => assetSet.has(e.toUpperCase()))
      );
    })
    .sort((a, b) => b.cluster_score - a.cluster_score)
    .slice(0, 4);
}

// ── 3. Industry-Specific Sponsor / Deal Activity ──────────────────────────────

export interface SectorDealItem {
  id:        string;
  title:     string;
  sector:    string;
  dealType:  string;
  peFirm:    string | null;
  entities:  string[];
  url:       string;
  published: string;
}

export function getIndustrySponsorDeals(
  industry: IndustryConfig,
  deals:    SectorDealItem[],
): SectorDealItem[] {
  const secLower = industry.sector.toLowerCase();
  const indLow   = industry.name.toLowerCase();
  const assetSet = new Set(industry.keyAssets.map(a => a.toUpperCase()));

  return deals
    .filter(d => {
      const sLower = d.sector.toLowerCase();
      return (
        sLower.includes(secLower) ||
        sLower.includes(indLow)   ||
        d.entities.some(e => assetSet.has(e.toUpperCase()))
      );
    })
    .slice(0, 6);
}

// ── 4. Theme Causal Narrative ─────────────────────────────────────────────────

export function getThemeNarrative(
  industry: IndustryConfig,
  themes:   ThemeIntelligence[],
): string | null {
  const indLower = industry.name.toLowerCase();
  const secLower = industry.sector.toLowerCase();

  const match = themes
    .filter(t =>
      t.causal_narrative &&
      t.causal_narrative.length > 30 &&
      (
        t.related_industries.some(i => i.toLowerCase().includes(indLower) || i.toLowerCase().includes(secLower)) ||
        t.related_assets.some(a => industry.keyAssets.some(k => k.toUpperCase() === a.toUpperCase()))
      )
    )
    .sort((a, b) => (b.persistence_score ?? 0) - (a.persistence_score ?? 0))[0];

  return match?.causal_narrative ?? null;
}

// ── 5. MA Deal Thematic Clustering ────────────────────────────────────────────

export interface DealCluster {
  theme:     ThemeIntelligence;
  dealCount: number;
  sectors:   string[];
}

export function clusterDealsByTheme(
  deals:  { sector: string; dealType: string }[],
  themes: ThemeIntelligence[],
): DealCluster[] {
  return themes
    .map(t => {
      const matching = deals.filter(d => {
        const sLower = d.sector.toLowerCase();
        return t.related_industries.some(i => {
          const iLower = i.toLowerCase();
          return sLower.includes(iLower) || iLower.includes(sLower);
        });
      });

      const sectorSet = new Set(matching.map(d => d.sector));
      return {
        theme:     t,
        dealCount: matching.length,
        sectors:   Array.from(sectorSet).slice(0, 3),
      };
    })
    .filter(c => c.dealCount > 0)
    .sort((a, b) => b.dealCount - a.dealCount);
}
