/**
 * RC2-C2X — C2b's SIC map carried an INDUSTRY name in a sector field.
 *
 * The canonical taxonomy is Sector "Communications" -> Industry "Media & Telecom".
 * `SIC_SECTOR` maps 47 SIC codes to nine values, and eight of those nine were
 * already canonical SECTOR names — including "Utilities", which the M&A
 * classifier cannot even emit. Only three entries carried the industry name:
 *
 *   4813  Telephone Communications
 *   4899  Communications Services NEC
 *   7812  Motion Picture Production
 *
 * The same level error RC2-TX corrected in the M&A classifier — but WITHOUT the
 * structural consequence. TX's version minted a third graph identity and
 * fragmented Communications intelligence. This one mints nothing:
 *
 *   IPOFiler.sector is rendered at EXACTLY ONE site
 *   (private-markets/page.tsx: a muted <span>, with `sicDescription` shown as a
 *   fallback when sector is null), and `filers` is otherwise consumed only for
 *   the row list, the filer count, and `ipoObservation` — which reads
 *   filingDate, formType and cik, NOT sector.
 *
 *   IPO data is NOT a provisioning input to useArgusIntelligence /
 *   intelligenceProvisioning, so C2b's sector cannot reach Sector nodes,
 *   Industry nodes, Workstation, sectorExposure, transmission, evidence, trust,
 *   forecasts or forward views.
 *
 * So this is a display-taxonomy correction, and it is intelligence-neutral BY
 * CONSTRUCTION rather than by measured delta.
 *
 * Measured: 47 mappings before and after; exactly 3 keys changed; 44 byte-for-byte
 * unchanged; no keys added or removed. "Media & Telecom" 3 -> 0,
 * "Communications" 0 -> 3.
 *
 * NOT addressed here, recorded separately: a bounded production-shaped sample had
 * 4 of 9 filers with SICs absent from the map (6770 Blank Checks twice, 3620
 * Electrical Industrial Apparatus, 3480 Ordnance). That is coverage, not
 * taxonomy, and warrants its own diagnosis.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(__dirname, "../../..");
const ROUTE = resolve(ROOT, "src/app/api/ipo-pipeline/route.ts");
const src = () => readFileSync(ROUTE, "utf8");

/** Parse the live SIC_SECTOR literal out of the route. */
function sicSector(): Record<string, string> {
  const s = src();
  const start = s.indexOf("SIC_SECTOR");
  const block = s.slice(start, s.indexOf("};", start));
  const out: Record<string, string> = {};
  for (const m of block.matchAll(/"(\d+)":\s*"([^"]+)"/g)) out[m[1]] = m[2];
  return out;
}

const CANONICAL = [
  "Communications", "Consumer", "Energy", "Financials", "Healthcare",
  "Industrials", "Real Estate", "Technology", "Utilities",
] as const;

// ── The three corrected SICs ────────────────────────────────────────────────

describe("the corrected SIC mappings", () => {
  const map = sicSector();

  for (const sic of ["4813", "4899", "7812"]) {
    it(`SIC ${sic} -> Communications`, () => {
      expect(map[sic]).toBe("Communications");
    });
  }

  it('"Media & Telecom" appears as no value anywhere in SIC_SECTOR', () => {
    expect(Object.values(map)).not.toContain("Media & Telecom");
  });

  it("exactly three codes map to Communications", () => {
    expect(Object.entries(map).filter(([, v]) => v === "Communications").map(([k]) => k).sort())
      .toEqual(["4813", "4899", "7812"]);
  });
});

// ── Everything else is unchanged ────────────────────────────────────────────

describe("the other 44 mappings are unchanged", () => {
  const map = sicSector();

  it("the map still holds 47 SIC codes", () => {
    expect(Object.keys(map)).toHaveLength(47);
  });

  const UNCHANGED: [string, string][] = [
    ["7372", "Technology"],  ["3674", "Technology"],
    ["2834", "Healthcare"],  ["3841", "Healthcare"],
    ["1311", "Energy"],      ["1382", "Energy"],
    ["4911", "Utilities"],   ["4941", "Utilities"],
    ["6020", "Financials"],  ["6211", "Financials"],
    ["5411", "Consumer"],    ["5700", "Consumer"],
    ["3559", "Industrials"], ["3761", "Industrials"],
    ["6512", "Real Estate"], ["6726", "Real Estate"],
  ];
  for (const [sic, sector] of UNCHANGED) {
    it(`SIC ${sic} still -> ${sector}`, () => expect(map[sic]).toBe(sector));
  }

  it("per-sector code counts are unchanged apart from the rename", () => {
    const counts = Object.values(map).reduce<Record<string, number>>(
      (a, v) => ((a[v] = (a[v] ?? 0) + 1), a), {});
    expect(counts).toEqual({
      Technology: 9, Healthcare: 8, Financials: 7, Consumer: 6,
      Industrials: 5, Energy: 3, Utilities: 3, "Real Estate": 3,
      Communications: 3,
    });
  });
});

// ── The full canonical vocabulary ───────────────────────────────────────────

describe("C2b can now emit all nine canonical Argus sectors", () => {
  it("the emitted value set equals the canonical taxonomy exactly", () => {
    expect([...new Set(Object.values(sicSector()))].sort())
      .toEqual([...CANONICAL].sort());
  });

  for (const sector of CANONICAL) {
    it(`${sector} is reachable`, () => {
      expect(Object.values(sicSector())).toContain(sector);
    });
  }
});

// ── Unmapped SICs still fall through to null ────────────────────────────────

describe("unmapped SICs remain null", () => {
  const map = sicSector();

  // Observed in a bounded production-shaped sample; deliberately NOT added.
  for (const [sic, what] of [
    ["6770", "Blank Checks (SPACs)"],
    ["3620", "Electrical Industrial Apparatus"],
    ["3480", "Ordnance & Accessories"],
    ["9999", "nonexistent"],
  ] as [string, string][]) {
    it(`SIC ${sic} (${what}) is unmapped`, () => {
      expect(map[sic]).toBeUndefined();
    });
  }

  it("the ?? null fallback is preserved", () => {
    expect(src()).toContain("sector: sic ? (SIC_SECTOR[sic] ?? null) : null");
  });

  it("the non-enriched tail still sets sector null", () => {
    expect(src()).toContain("sic: null, sicDescription: null, stateOfIncorp: null, sector: null");
  });
});

// ── C2b contract untouched ──────────────────────────────────────────────────

describe("the rest of the C2b contract is untouched", () => {
  it("the response schema still types sector as string | null", () => {
    expect(src()).toContain("sector:            string | null;");
  });

  it("sicDescription is unchanged", () => {
    expect(src()).toContain("sicDescription: json.sicDescription ?? null");
  });

  it("the EDGAR endpoints and query are unchanged", () => {
    expect(src()).toContain(
      "https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent&type=S-1&dateb=&owner=include&count=40&search_text=&output=atom");
    expect(src()).toContain("https://data.sec.gov/submissions/CIK${padded}.json");
  });

  it("S-1 vs S-1/A classification and slice bounds are unchanged", () => {
    expect(src()).toContain("S-1/A");
    expect(src()).toContain("parseAtomFeed(xml).slice(0, 30)");
    expect(src()).toContain("parsed.slice(0, 15)");
    expect(src()).toContain("parsed.slice(15)");
  });

  it("RC2-N4: the SEC identity path is unchanged", () => {
    expect(src()).toContain("secUserAgent()");
    expect(src()).toContain('_cache?.data ?? []');
  });

  it("the sicDescription fallback render is unchanged", () => {
    const page = readFileSync(resolve(ROOT, "src/app/private-markets/page.tsx"), "utf8");
    expect(page).toContain("{filer.sicDescription && !filer.sector && (");
    expect(page).toContain("{filer.sector}");
  });
});

// ── No C2b -> intelligence path exists ──────────────────────────────────────

describe("C2b sector never reaches the intelligence system", () => {
  it("IPO data is not a provisioning input", () => {
    const hook = readFileSync(resolve(ROOT, "src/hooks/useArgusIntelligence.ts"), "utf8");
    expect(hook).not.toContain("useIPOPipeline");
    expect(hook).not.toContain("filers");
    // The canonical input set, unchanged.
    expect(hook).toContain("canonicalGraphState({ themes, clusters, episodes, deals, snapshots, events, explanations })");
  });

  it("no adapter ingests IPO filers", () => {
    const adapters = readFileSync(resolve(ROOT, "src/lib/intelligenceGraphAdapters.ts"), "utf8");
    expect(adapters).not.toContain("IPOFiler");
    expect(adapters).not.toContain("ipo-pipeline");
  });

  it("private-markets consumes filers without minting graph nodes from sector", () => {
    const page = readFileSync(resolve(ROOT, "src/app/private-markets/page.tsx"), "utf8");
    // ipoObservation reads filingDate / formType / cik only.
    expect(page).toContain('filers.filter(f => f.formType === "S-1").map(f => f.cik)');
    expect(page).not.toContain("filer.sector, \"Sector\"");
    expect(page).not.toContain("addLabeled(filer.sector");
  });
});
