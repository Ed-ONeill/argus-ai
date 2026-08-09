"use client";

import { useMemo } from "react";
import { useFeed } from "./useFeed";
import type { FeedItem } from "@/lib/types";

export type DealType = "strategic" | "sponsor" | "merger" | "rumored" | "withdrawn" | "spac";

export interface MADeal {
  id:           string;
  title:        string;
  url:          string;
  source:       string;
  published:    string;
  entities:     string[];
  dealType:     DealType;
  sector:       string;
  peFirm:       string | null;
  signalScore:  number;
  summary:      string;
  whyItMatters: string;
}

export interface MABreakdown {
  strategic: number;
  sponsor:   number;
  merger:    number;
  rumored:   number;
  withdrawn: number;
  spac:      number;
}

export interface MASponsorActivity {
  firm:  string;
  deals: number;
}

export interface MAIntelligence {
  deals:              MADeal[];
  breakdown:          MABreakdown;
  sponsors:           MASponsorActivity[];
  sectorDistribution: Record<string, number>;
  totalDealCount:     number;
  isLoading:          boolean;
  isError:            boolean;
}

// ── PE firm detection ─────────────────────────────────────────────────────────

const PE_PATTERNS: [string, RegExp][] = [
  ["KKR",                 /\bkkr\b/i],
  ["Blackstone",          /blackstone/i],
  ["Apollo",              /apollo\s+global|apollo\s+management/i],
  ["Carlyle",             /carlyle/i],
  ["Vista Equity",        /vista\s+equity/i],
  ["Francisco Partners",  /francisco\s+partners/i],
  ["Thoma Bravo",         /thoma\s+bravo/i],
  ["Silver Lake",         /silver\s+lake/i],
  ["Warburg Pincus",      /warburg\s+pincus/i],
  ["General Atlantic",    /general\s+atlantic/i],
  ["TPG",                 /\btpg\b/i],
  ["Bain Capital",        /bain\s+capital/i],
  ["Advent International",/advent\s+international/i],
  ["Apax",                /\bapax\b/i],
  ["CVC",                 /\bcvc\s+capital|\bcvc\s+partners/i],
  ["EQT",                 /\beqt\b/i],
  ["Hellman & Friedman",  /hellman.*friedman|h&f\b/i],
  ["Permira",             /permira/i],
  ["Clearlake",           /clearlake/i],
  ["Hg Capital",          /\bhg\s+capital|\bhgcapital/i],
  ["Leonard Green",       /leonard\s+green/i],
  ["Madison Dearborn",    /madison\s+dearborn/i],
  ["Veritas Capital",     /veritas\s+capital/i],
  ["GTCR",                /\bgtcr\b/i],
  ["Cerberus",            /cerberus/i],
  ["Ares Management",     /\bares\s+management|\bares\s+capital/i],
  ["Blue Owl",            /blue\s+owl/i],
  ["Insight Partners",    /insight\s+partners/i],
  ["Accel-KKR",           /accel.?kkr/i],
  ["Searchlight",         /searchlight\s+capital/i],
  ["Nordic Capital",      /nordic\s+capital/i],
  ["Berkshire Partners",  /berkshire\s+partners/i],
];

const SECTOR_PATTERNS: [string, RegExp][] = [
  ["Technology",      /software|saas|cloud|cyber|ai|chip|semi|digital|fintech|data\s+center/i],
  ["Healthcare",      /health|pharma|biotech|medtech|medical|drug|clinical|genomic/i],
  ["Energy",          /energy|oil|gas|lng|renewable|power|utility|nuclear|pipeline|midstream/i],
  ["Financials",      /financ|bank|insur|asset\s+manag|credit|lending|broker|wealth/i],
  ["Industrials",     /industri|manufactur|aerospace|defense|logistic|freight|rail|robot/i],
  ["Consumer",        /consumer|retail|restaurant|hospitality|travel|leisure|apparel|food/i],
  ["Real Estate",     /real\s+estate|reit|property|infrastructure|data\s+center\s+reit/i],
  ["Media & Telecom", /media|telecom|streaming|broadcast|advertis|publish|wireless|social/i],
];

function detectPEFirm(text: string): string | null {
  for (const [firm, re] of PE_PATTERNS) {
    if (re.test(text)) return firm;
  }
  return null;
}

function inferDealType(title: string, hasSponsor: boolean): DealType {
  if (/withdrawn|terminat|pulled|abandoned|call(?:s|ed)?\s+off|walk(?:s|ed)?\s+away/i.test(title)) return "withdrawn";
  if (/spac|blank\s+check|de-?spac/i.test(title))                                                  return "spac";
  if (/rumor|report(?:edly)?|explore|consider|eye(?:ing)?|weigh|approach(?:ed)?|in\s+talks/i.test(title)) return "rumored";
  if (/merge|combination|joint\s+venture/i.test(title))                                             return "merger";
  if (hasSponsor)                                                                                    return "sponsor";
  return "strategic";
}

function inferSector(title: string, entities: string[]): string {
  const text = `${title} ${entities.join(" ")}`;
  for (const [sector, re] of SECTOR_PATTERNS) {
    if (re.test(text)) return sector;
  }
  return "Other";
}

function toMADeal(item: FeedItem): MADeal {
  const text   = `${item.title} ${item.summary}`;
  const peFirm = detectPEFirm(text);
  return {
    id:           item.id,
    title:        item.title,
    url:          item.url,
    source:       item.source,
    published:    item.published,
    entities:     item.affected_entities,
    dealType:     inferDealType(item.title, peFirm !== null),
    sector:       inferSector(item.title, item.affected_entities),
    peFirm,
    signalScore:  item.signal_score,
    summary:      item.summary,
    whyItMatters: item.why_it_matters,
  };
}

const EMPTY_BREAKDOWN: MABreakdown = { strategic: 0, sponsor: 0, merger: 0, rumored: 0, withdrawn: 0, spac: 0 };

export function useMAIntelligence(): MAIntelligence {
  const { data, isLoading, error } = useFeed();

  return useMemo(() => {
    if (!data) return {
      deals: [], breakdown: { ...EMPTY_BREAKDOWN }, sponsors: [],
      sectorDistribution: {}, totalDealCount: 0, isLoading, isError: !!error,
    };

    // Guard: sibling feed fields (events/explanations) are documented as possibly absent on stale
    // caches, so a partial payload with a missing `items` must degrade, not crash the consumers
    // (useMAIntelligence feeds useArgusIntelligence -> Evidence Drawer + Workstation).
    const maItems = (data.items ?? []).filter(i => i.category === "M&A");
    const deals   = maItems.map(toMADeal).sort((a, b) => b.signalScore - a.signalScore);

    const breakdown    = { ...EMPTY_BREAKDOWN };
    const sponsorCts:  Record<string, number> = {};
    const sectorDist:  Record<string, number> = {};

    for (const d of deals) {
      breakdown[d.dealType]++;
      if (d.peFirm) sponsorCts[d.peFirm] = (sponsorCts[d.peFirm] ?? 0) + 1;
      sectorDist[d.sector] = (sectorDist[d.sector] ?? 0) + 1;
    }

    const sponsors = Object.entries(sponsorCts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([firm, ct]) => ({ firm, deals: ct }));

    return { deals, breakdown, sponsors, sectorDistribution: sectorDist, totalDealCount: deals.length, isLoading, isError: !!error };
  }, [data, isLoading, error]);
}
