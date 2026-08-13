/**
 * industryIntelligence.ts — Per-industry intelligence functions.
 *
 * Pure deterministic. Zero API calls. All derived from existing feed fields.
 */

import type { StoryCluster, IndustrySignal, SectorIntelligence, ThemeIntelligence } from "./types";
import type { IndustryConfig } from "./industryConfig";
import { isSectorEntityLabel } from "./intelligenceGraphAdapters";

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
  const assetSet   = new Set(industry.keyAssets.map(a => a.toUpperCase()));
  const leaderSet  = new Set(leaders.map(l => l.toUpperCase()));
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

  // Cluster entity mentions — weighted by cluster quality score
  for (const cl of topClusters) {
    const p       = cl.primary;
    const clScale = 1 + Math.floor(cl.cluster_score / 25); // 1–5 scaling factor
    const isKey   = p.affected_entities.some(e => assetSet.has(e.toUpperCase()));
    for (const entity of p.affected_entities) {
      add(entity, p.why_it_matters || p.title, isKey ? clScale * 2 : clScale);
    }
  }

  // Industry signal top entities — weighted by signal quality
  for (const sig of indSignals) {
    if (!sig.top_entity) continue;
    const sigScale = 2 + Math.floor(sig.signal_score / 20); // 2–7 scaling
    add(sig.top_entity, sig.narrative, sigScale);
  }

  // Sector level top entity
  if (sectorIntel?.top_entity) add(sectorIntel.top_entity, "", 3);

  // Ensure leaders and laggards appear even if not mentioned in current stories
  for (const asset of [...leaders, ...laggards]) {
    const key = asset.toUpperCase();
    if (!map.has(key)) add(asset, "", 1);
  }

  return Array.from(map.entries())
    .map(([key, { originalName, mentions, headlines }]) => {
      const isTicker   = /^[A-Z]{1,6}(-[A-Z]+)?$/.test(key);
      const isKeyAsset = assetSet.has(key);
      const displayName = isKeyAsset
        ? (industry.keyAssets.find(a => a.toUpperCase() === key) ?? originalName)
        : originalName;

      const status: EntitySignal["status"] =
        leaderSet.has(key)  ? "leader" :
        laggardSet.has(key) ? "laggard" : "neutral";

      // Leaders and laggards get a fixed boost so they surface above neutral noise
      const finalScore = mentions + (isKeyAsset ? 2 : 0) + (status !== "neutral" ? 4 : 0);

      return {
        name:       displayName,
        isTicker,
        mentions:   finalScore,
        headline:   headlines[0] ?? "",
        isKeyAsset,
        status,
      };
    })
    // Only show entities that have actual data weight, not ghost keyAssets
    .filter(e => e.mentions > 2 || e.status !== "neutral")
    .sort((a, b) => {
      const rankA = a.status !== "neutral" ? 0 : a.mentions > 4 ? 1 : 2;
      const rankB = b.status !== "neutral" ? 0 : b.mentions > 4 ? 1 : 2;
      if (rankA !== rankB) return rankA - rankB;
      return b.mentions - a.mentions;
    })
    .slice(0, 12);
}

// ── 2. VC & Funding Activity ──────────────────────────────────────────────────

const VC_KW = [
  "raises", "funding round", "series a", "series b", "series c", "series d",
  "series e", "series f", "venture", "growth capital", "seed round",
  "invested in", "backed by", "vc-backed", "startup", "late-stage",
  "led the round", "valuation", "pre-ipo", "early stage", "angel round",
  "equity round", "crossover round", "private placement", "unicorn",
  "venture capital", "growth equity", "strategic investment",
];

export function filterVCFundingClusters(
  industry:    IndustryConfig,
  allClusters: StoryCluster[],
): StoryCluster[] {
  const indLower = industry.name.toLowerCase();
  const secLower = industry.sector.toLowerCase();
  const assetSet = new Set(industry.keyAssets.map(a => a.toUpperCase()));

  return allClusters
    .map(c => {
      const p        = c.primary;
      const haystack = [p.title, p.category, ...(p.affected_entities ?? [])].join(" ").toLowerCase();
      const kwCount  = VC_KW.filter(kw => haystack.includes(kw)).length;
      if (kwCount === 0) return null;

      const industryMatch =
        haystack.includes(indLower) ||
        haystack.includes(secLower) ||
        p.affected_entities.some(e => assetSet.has(e.toUpperCase()));
      if (!industryMatch) return null;

      // Score: keyword density (0–50) + cluster quality (0–100) + asset match bonus
      const assetBonus = p.affected_entities.some(e => assetSet.has(e.toUpperCase())) ? 20 : 0;
      return { cluster: c, score: kwCount * 10 + c.cluster_score + assetBonus };
    })
    .filter((x): x is { cluster: StoryCluster; score: number } => x !== null)
    .sort((a, b) => b.score - a.score)
    .slice(0, 6)
    .map(({ cluster }) => cluster);
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
        sLower.includes(secLower)  ||
        sLower.includes(indLow)    ||
        d.entities.some(e => assetSet.has(e.toUpperCase()))
      );
    })
    .slice(0, 8);
}

// ── 4. Industry Acquirer Intelligence ────────────────────────────────────────

export interface IndustryAcquirer {
  name:      string;
  dealCount: number;
  sectors:   string[];
  dealTypes: string[];
}

export function getIndustryAcquirers(deals: SectorDealItem[]): IndustryAcquirer[] {
  const strategic = deals.filter(d => d.dealType === "strategic" || d.dealType === "merger");
  const map       = new Map<string, { sectors: Set<string>; dealTypes: Set<string> }>();

  for (const d of strategic) {
    // RC2-G5.1: `entities` is FeedItem.affected_entities - since RC2-A that is
    // "resolved company tickers, then at most one curated SECTOR LABEL". Treating
    // every value as an acquirer NAME admitted the sector label as a party, which
    // rendered "Healthcare -> Healthcare" (the label as acquirer, its own sector as
    // the target). A sector is never a party to a deal. Same authority the graph
    // adapters use; entity-resolution semantics are unchanged.
    for (const entity of d.entities.filter(e => !isSectorEntityLabel(e)).slice(0, 2)) {
      if (!entity || entity.trim().length === 0) continue;
      if (!map.has(entity)) map.set(entity, { sectors: new Set(), dealTypes: new Set() });
      map.get(entity)!.sectors.add(d.sector);
      map.get(entity)!.dealTypes.add(d.dealType);
    }
  }

  return Array.from(map.entries())
    .map(([name, { sectors, dealTypes }]) => ({
      name,
      dealCount: strategic.filter(d => d.entities.filter(e => !isSectorEntityLabel(e)).includes(name)).length,
      sectors:   Array.from(sectors),
      dealTypes: Array.from(dealTypes),
    }))
    .filter(p => p.dealCount >= 1)
    .sort((a, b) => b.dealCount - a.dealCount)
    .slice(0, 6);
}

// ── 5. Industry Sponsor Intelligence ─────────────────────────────────────────

export interface IndustrySponsor {
  firm:    string;
  deals:   number;
  sectors: string[];
}

export function getIndustrySponsors(deals: SectorDealItem[]): IndustrySponsor[] {
  const sponsorDeals = deals.filter(d => d.peFirm);
  const map          = new Map<string, Set<string>>();

  for (const d of sponsorDeals) {
    const firm = d.peFirm!;
    if (!map.has(firm)) map.set(firm, new Set());
    map.get(firm)!.add(d.sector);
  }

  return Array.from(map.entries())
    .map(([firm, sectorSet]) => ({
      firm,
      deals:   sponsorDeals.filter(d => d.peFirm === firm).length,
      sectors: Array.from(sectorSet).slice(0, 3),
    }))
    .sort((a, b) => b.deals - a.deals)
    .slice(0, 5);
}

// ── 6. Theme Causal Narrative ─────────────────────────────────────────────────

function _matchingTheme(
  industry: IndustryConfig,
  themes:   ThemeIntelligence[],
): ThemeIntelligence | null {
  const indLower = industry.name.toLowerCase();
  const secLower = industry.sector.toLowerCase();

  return themes
    .filter(t =>
      t.related_industries.some(i =>
        i.toLowerCase().includes(indLower) || i.toLowerCase().includes(secLower)
      ) ||
      t.related_assets.some(a =>
        industry.keyAssets.some(k => k.toUpperCase() === a.toUpperCase())
      )
    )
    .sort((a, b) => (b.persistence_score ?? 0) - (a.persistence_score ?? 0))[0] ?? null;
}

export function getThemeNarrative(
  industry: IndustryConfig,
  themes:   ThemeIntelligence[],
): string | null {
  const match = _matchingTheme(industry, themes);
  return (match?.causal_narrative && match.causal_narrative.length > 30)
    ? match.causal_narrative
    : null;
}

export function getMatchingTheme(
  industry: IndustryConfig,
  themes:   ThemeIntelligence[],
): ThemeIntelligence | null {
  return _matchingTheme(industry, themes);
}

// ── 7. MA Deal Thematic Clustering ────────────────────────────────────────────

export interface DealCluster {
  theme:     ThemeIntelligence;
  dealCount: number;
  sectors:   string[];
}

export function clusterDealsByTheme(
  deals:  { sector: string; dealType: string; entities?: string[] }[],
  themes: ThemeIntelligence[],
): DealCluster[] {
  return themes
    .map(t => {
      const assetSet = new Set(t.related_assets.map(a => a.toUpperCase()));

      const matching = deals.filter(d => {
        const sLower = d.sector.toLowerCase();

        // Industry substring match
        const indMatch = t.related_industries.some(i => {
          const iLower = i.toLowerCase();
          return sLower.includes(iLower) || iLower.includes(sLower);
        });

        // Entity-level asset match (stronger signal)
        const entityMatch = (d.entities ?? []).some(e => assetSet.has(e.toUpperCase()));

        return indMatch || entityMatch;
      });

      const sectorSet = new Set(matching.map(d => d.sector));
      return {
        theme:     t,
        dealCount: matching.length,
        sectors:   Array.from(sectorSet).slice(0, 3),
      };
    })
    .filter(c => c.dealCount >= 2)
    .sort((a, b) => {
      if (b.dealCount !== a.dealCount) return b.dealCount - a.dealCount;
      return (b.theme.persistence_score ?? 0) - (a.theme.persistence_score ?? 0);
    });
}
