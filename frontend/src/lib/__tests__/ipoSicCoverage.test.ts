/**
 * RC2-C2C — high-confidence SIC coverage additions.
 *
 * Measured on **80 distinct S-1/S-1A filers over 12 business days**
 * (2026-08-18 .. 2026-09-03), built from EDGAR daily indexes. The 424B feed was
 * deliberately excluded: those are post-IPO pricing filings, a different
 * population from what C2b reads, and including them would have biased the
 * measurement.
 *
 *   mapped 35/80 = 43.8%   null 45/80 = 56.2%
 *     of the nulls: 4 had no SIC at all; 41 had a SIC absent from the map
 *
 * Eight codes were added, each with sibling codes already present:
 *
 *   6411 Insurance Agents/Brokers        -> Financials  (joins 6020/6021/6022/6159/6199/6211/6282)
 *   6221 Commodity Contracts Brokers     -> Financials
 *   2080 Beverages                       -> Consumer
 *   3845 Electromedical Apparatus        -> Healthcare  (joins 3825/3826/3841)
 *   3480 Ordnance & Accessories          -> Industrials (joins 3761/3812)
 *   3760 Guided Missiles & Space Vehicles-> Industrials (direct sibling of 3761)
 *   3620 Electrical Industrial Apparatus -> Industrials
 *   3590 Misc Industrial Machinery       -> Industrials (joins 3490/3559/3562)
 *
 * THE MAP CONTRACT IS SECTOR BY SIC CATEGORY. `sector: sic ? (SIC_SECTOR[sic] ??
 * null) : null` is a pure function of the code, with no filer-level logic
 * anywhere in the route. A code is therefore mapped on what the SIC means, not
 * on which issuers happen to use it — which is why 6221 is Financials even
 * though the observed filers were crypto ETF trusts (Canary XRP ETF, Canary
 * Staked TRX ETF). No crypto-specific exception was invented.
 *
 * DELIBERATE NULLS, pinned here so they are not later "fixed" for coverage:
 *
 *   6770 Blank Checks       the largest unmapped code, 10 of 80. A SPAC has no
 *                           operating business and no sector identity until it
 *                           de-SPACs; `sicDescription` already renders "Blank
 *                           Checks", which is MORE informative than a sector.
 *   8742 Mgmt Consulting    too broad, and issuer-selected SIC is unreliable —
 *                           the observed filer was T3 Defense Inc., a defence
 *                           company self-filed as a consultancy.
 *   1400 Mining & Quarrying Argus's nine canonical sectors contain no Materials.
 *   6792 Oil Royalty Traders pending a royalty-trust structural decision.
 *
 * NOT in this slice: the `7389 -> Technology` mapping, whose SEC description is
 * "Services-Business Services, NEC". Recorded as RC2-C2M for its own diagnosis.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(__dirname, "../../..");
const ROUTE = resolve(ROOT, "src/app/api/ipo-pipeline/route.ts");
const src = () => readFileSync(ROUTE, "utf8");

function sicSector(): Record<string, string> {
  const s = src();
  const start = s.indexOf("SIC_SECTOR");
  const block = s.slice(start, s.indexOf("};", start));
  const out: Record<string, string> = {};
  for (const m of block.matchAll(/"(\d+)":\s*"([^"]+)"/g)) out[m[1]] = m[2];
  return out;
}

/** The eight approved additions. */
const ADDED: [string, string, string][] = [
  ["6411", "Financials",  "Insurance Agents, Brokers & Service"],
  ["6221", "Financials",  "Commodity Contracts Brokers & Dealers"],
  ["2080", "Consumer",    "Beverages"],
  ["3845", "Healthcare",  "Electromedical & Electrotherapeutic Apparatus"],
  ["3480", "Industrials", "Ordnance & Accessories"],
  ["3760", "Industrials", "Guided Missiles & Space Vehicles & Parts"],
  ["3620", "Industrials", "Electrical Industrial Apparatus"],
  ["3590", "Industrials", "Misc Industrial & Commercial Machinery"],
];

/** Codes that must stay null — correct, not missing. */
const DELIBERATE_NULLS: [string, string][] = [
  ["6770", "Blank Checks — a SPAC has no operating-sector identity"],
  ["8742", "Management Consulting — too broad, issuer SIC unreliable"],
  ["1400", "Mining & Quarrying — Argus has no Materials sector"],
  ["6792", "Oil Royalty Traders — royalty-trust structure undecided"],
];

// ── The eight additions ─────────────────────────────────────────────────────

describe("high-confidence additions", () => {
  const map = sicSector();

  for (const [sic, sector, desc] of ADDED) {
    it(`SIC ${sic} (${desc}) -> ${sector}`, () => {
      expect(map[sic]).toBe(sector);
    });
  }

  it("the map grew by exactly eight entries", () => {
    expect(Object.keys(map)).toHaveLength(55);   // 47 + 8
  });

  it("every addition yields a non-null sector for a filer carrying that SIC", () => {
    // Mirrors the route: sector = sic ? (SIC_SECTOR[sic] ?? null) : null
    const sectorOf = (sic: string | null) => (sic ? (map[sic] ?? null) : null);
    for (const [sic, sector] of ADDED) expect(sectorOf(sic)).toBe(sector);
  });
});

// ── Nothing existing changed ────────────────────────────────────────────────

describe("no existing mapping changed", () => {
  const map = sicSector();

  const PRESERVED: [string, string][] = [
    ["7372", "Technology"],  ["7371", "Technology"],  ["3674", "Technology"],
    ["7389", "Technology"],  // RC2-C2M candidate — deliberately untouched here
    ["2834", "Healthcare"],  ["3841", "Healthcare"],  ["3825", "Healthcare"],
    ["3826", "Healthcare"],
    ["1311", "Energy"],      ["4911", "Utilities"],   ["4941", "Utilities"],
    ["6020", "Financials"],  ["6199", "Financials"],  ["6211", "Financials"],
    ["5411", "Consumer"],    ["5600", "Consumer"],
    ["3559", "Industrials"], ["3761", "Industrials"], ["3812", "Industrials"],
    ["6512", "Real Estate"], ["6726", "Real Estate"],
    ["4813", "Communications"], ["4899", "Communications"], ["7812", "Communications"],
  ];
  for (const [sic, sector] of PRESERVED) {
    it(`SIC ${sic} still -> ${sector}`, () => expect(map[sic]).toBe(sector));
  }

  it("RC2-C2X: no 'Media & Telecom' value survives", () => {
    expect(Object.values(map)).not.toContain("Media & Telecom");
  });

  it("the emitted vocabulary is still exactly the nine canonical sectors", () => {
    expect([...new Set(Object.values(map))].sort()).toEqual([
      "Communications", "Consumer", "Energy", "Financials", "Healthcare",
      "Industrials", "Real Estate", "Technology", "Utilities",
    ]);
  });

  it("per-sector counts move only by the additions", () => {
    const counts = Object.values(map).reduce<Record<string, number>>(
      (a, v) => ((a[v] = (a[v] ?? 0) + 1), a), {});
    expect(counts).toEqual({
      Technology: 9,                 // unchanged
      Healthcare: 9,                 // 8 + 3845
      Financials: 9,                 // 7 + 6411 + 6221
      Consumer: 7,                   // 6 + 2080
      Industrials: 9,                // 5 + 3480 + 3760 + 3620 + 3590
      Energy: 3, Utilities: 3, "Real Estate": 3, Communications: 3,
    });
  });
});

// ── Deliberate nulls ────────────────────────────────────────────────────────

describe("deliberate nulls are preserved", () => {
  const map = sicSector();

  for (const [sic, why] of DELIBERATE_NULLS) {
    it(`SIC ${sic} stays unmapped — ${why}`, () => {
      expect(map[sic]).toBeUndefined();
    });
  }

  it("6770 is documented as intentional, not missing", () => {
    expect(src()).toContain("6770");
    expect(src()).toMatch(/no operating business and no sector identity/);
  });

  it("the singleton tail is still unmapped", () => {
    for (const sic of ["5063", "5810", "3711", "5200", "4512", "7990",
                       "7310", "8071", "2860", "3730", "2844", "5122", "5412", "3390"]) {
      expect(map[sic]).toBeUndefined();
    }
  });

  it("the ?? null fallback is intact, so unmapped SICs still yield null", () => {
    expect(src()).toContain("sector: sic ? (SIC_SECTOR[sic] ?? null) : null");
    const sectorOf = (sic: string | null) => (sic ? (map[sic] ?? null) : null);
    expect(sectorOf("6770")).toBeNull();
    expect(sectorOf(null)).toBeNull();
  });
});

// ── Coverage arithmetic on the 80-filer sample ──────────────────────────────

describe("80-filer coverage arithmetic", () => {
  const map = sicSector();
  // SIC distribution of the measured sample, by code.
  // The MEASURED SIC distribution of the 80-filer sample, derived from the
  // enriched data — not hand-authored.
  const SAMPLE: Record<string, number> = {
    "2080": 2, "2834": 8, "2836": 2, "2844": 1, "2860": 1, "3390": 1,
    "3480": 1, "3585": 1, "3590": 1, "3620": 1, "3674": 2, "3711": 1,
    "3730": 1, "3760": 1, "3841": 1, "3845": 1, "4512": 1, "4911": 2,
    "4931": 1, "5063": 1, "5122": 1, "5200": 1, "5412": 1, "5600": 1,
    "5810": 1, "6022": 1, "6199": 4, "6221": 4, "6411": 4, "6770": 10,
    "7310": 1, "7371": 2, "7372": 7, "7374": 3, "7389": 1, "7990": 1,
    "8071": 1, "8742": 1,
  };
  const NO_SIC = 4;
  const total = Object.values(SAMPLE).reduce((a, b) => a + b, 0) + NO_SIC;
  const ADDED_CODES = ADDED.map(([s]) => s);

  it("the sample totals 80 filers", () => expect(total).toBe(80));

  it("mapped goes 35 -> 50 (+15)", () => {
    const after = Object.entries(SAMPLE)
      .filter(([sic]) => map[sic]).reduce((a, [, n]) => a + n, 0);
    const gained = Object.entries(SAMPLE)
      .filter(([sic]) => ADDED_CODES.includes(sic)).reduce((a, [, n]) => a + n, 0);
    expect(gained).toBe(15);
    expect(after - gained).toBe(35);
    expect(after).toBe(50);
  });

  it("coverage 43.8% -> 62.5%, residual null 37.5%", () => {
    const after = Object.entries(SAMPLE)
      .filter(([sic]) => map[sic]).reduce((a, [, n]) => a + n, 0);
    expect(+(100 * (after - 15) / total).toFixed(1)).toBe(43.8);
    expect(+(100 * after / total).toFixed(1)).toBe(62.5);
    expect(+(100 * (total - after) / total).toFixed(1)).toBe(37.5);
  });

  it("of the residual, 6770 alone is 10 filers (12.5%); the rest is 25.0%", () => {
    const after = Object.entries(SAMPLE)
      .filter(([sic]) => map[sic]).reduce((a, [, n]) => a + n, 0);
    expect(SAMPLE["6770"]).toBe(10);
    expect(+(100 * SAMPLE["6770"] / total).toFixed(1)).toBe(12.5);
    expect(+(100 * (total - after - SAMPLE["6770"]) / total).toFixed(1)).toBe(25.0);
  });
});

// ── C2b contract and the no-intelligence-path invariant ─────────────────────

describe("the rest of C2b is untouched", () => {
  it("response schema unchanged", () => {
    expect(src()).toContain("sector:            string | null;");
  });

  it("sicDescription and its fallback render are unchanged", () => {
    expect(src()).toContain("sicDescription: json.sicDescription ?? null");
    const page = readFileSync(resolve(ROOT, "src/app/private-markets/page.tsx"), "utf8");
    expect(page).toContain("{filer.sicDescription && !filer.sector && (");
  });

  it("S-1/S-1A narrowing, CIK dedup and newRegistrations are unchanged", () => {
    expect(src()).toContain("S-1/A");
    expect(src()).toContain("parseAtomFeed(xml).slice(0, 30)");
    const page = readFileSync(resolve(ROOT, "src/app/private-markets/page.tsx"), "utf8");
    expect(page).toContain('filers.filter(f => f.formType === "S-1").map(f => f.cik)');
    expect(page).toContain("newRegistrations");
  });

  it("RC2-N4 SEC identity path unchanged", () => {
    expect(src()).toContain("secUserAgent()");
  });

  it("no C2b -> intelligence provisioning path exists", () => {
    const hook = readFileSync(resolve(ROOT, "src/hooks/useArgusIntelligence.ts"), "utf8");
    expect(hook).not.toContain("useIPOPipeline");
    expect(hook).not.toContain("filers");
    const adapters = readFileSync(resolve(ROOT, "src/lib/intelligenceGraphAdapters.ts"), "utf8");
    expect(adapters).not.toContain("IPOFiler");
  });
});
