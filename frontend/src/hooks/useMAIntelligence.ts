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

/**
 * RC2-IS: sector matching is LEXICAL, not arbitrary-substring.
 *
 * These patterns were unanchored, so a keyword matched anywhere inside an
 * unrelated word. Measured on 720 real upstream production-feed headlines:
 * `/ai/` alone matched 90 as a substring — "ret-ai-l", "sp-ai-n", "ch-ai-rman",
 * "r-ai-sed", "rem-ai-ns", "m-ai-ntenance", "em-ai-l", "-ai-rlines" — plus
 * `/bank/` 14 ("Bur-bank"), `/gas/` 7 ("Ve-gas"), `/power/` 5, `/semi/` 1
 * ("Semi-annual"). Because Technology is tested FIRST, those all landed there:
 * headlines such as "US Strikes Targets in Iran Around Strait of Hormuz" and
 * "EU Considers Front-Loading Ukraine Loan" classified as Technology, which took
 * Technology to 24.9% of the corpus.
 *
 * Two rules, chosen from measurement rather than applied mechanically:
 *
 *   LEADING BOUNDARY for stems — `\bchip` still matches "chips" and
 *   "chipmaker", `\bdata\s+center` still matches "Data Centers", `\brobot`
 *   still matches "Robotics", `\bbank` still matches "banking" but NOT
 *   "Burbank", `\bgas`-family no longer matches "Vegas". Every suffixed form
 *   observed in the corpus under this rule was legitimate.
 *
 *   FULL TOKEN for short, high-collision tokens, with their real inflections
 *   spelled out. A blanket `\b…\b` here would have been WRONG: `\bsemi\b`
 *   destroys "semiconductor" and `\brail\b` destroys "railroad", both of which
 *   the corpus contains as genuine matches. So the legitimate forms are
 *   enumerated instead of guessed.
 *
 * Deterministic, current-fields-only, no LLM and no external data. The sector
 * taxonomy, the precedence order and the "Other" fallback are all unchanged.
 * ("Other" being minted as a literal Sector node is a separate ledger item and
 * is deliberately untouched here, even though safer matching makes it commoner.)
 */
const SECTOR_PATTERNS: [string, RegExp][] = [
  ["Technology",      /\bsoftware|\bsaas\b|\bcloud|\bcyber|\bai\b|\bchip|\bsemi\b|\bsemiconduct|\bdigital|\bfintech|\bdata\s+center/i],
  ["Healthcare",      /\bhealth|\bpharma|\bbiotech|\bmedtech|\bmedical|\bdrug|\bclinical|\bgenomic/i],
  ["Energy",          /\benergy|\boils?\b|\bgas\b|\bgasoline|\blng\b|\brenewable|\bpower|\butility|\bnuclear|\bpipeline|\bmidstream/i],
  ["Financials",      /\bfinanc|\bbank|\binsur|\basset\s+manag|\bcredit|\blending|\bbroker|\bwealth/i],
  ["Industrials",     /\bindustri|\bmanufactur|\baerospace|\bdefense|\blogistic|\bfreight|\brail(?:road)?s?\b|\brobot/i],
  ["Consumer",        /\bconsumer|\bretail|\brestaurant|\bhospitality|\btravel|\bleisure|\bapparel|\bfood/i],
  ["Real Estate",     /\breal\s+estate|\breits?\b|\bproperty|\binfrastructure|\bdata\s+center\s+reit/i],
  ["Media & Telecom", /\bmedia|\btelecom|\bstreaming|\bbroadcast|\badvertis|\bpublish|\bwireless|\bsocial/i],
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

/**
 * Exported for RC2-IS regression pinning only. Pure, deterministic, and
 * unchanged in behaviour by that export — no consumer outside `toMADeal` calls
 * it, and the taxonomy, precedence order and "Other" fallback are untouched.
 */
export function inferSector(title: string, entities: string[]): string {
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
