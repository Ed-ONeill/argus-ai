/**
 * RC2-G5.1 fix 4 — a sector is never a party to a deal.
 *
 * getIndustryAcquirers iterated `d.entities` and treated every value as an
 * acquirer NAME. Since RC2-A that list is "resolved company tickers, then at
 * most one curated SECTOR LABEL", so the label was admitted as a party and the
 * Healthcare page rendered "Healthcare -> Healthcare" (the sector label as the
 * acquirer, its own sector as the target).
 *
 * Same authority the graph adapters use (isSectorEntityLabel). Entity-resolution
 * semantics are unchanged: this only stops a known non-company value from being
 * read as a company name.
 */

import { describe, expect, it } from "vitest";
import { getIndustryAcquirers } from "../industryIntelligence";
import { isSectorEntityLabel } from "../intelligenceGraphAdapters";

type Deal = Parameters<typeof getIndustryAcquirers>[0][number];

const deal = (id: string, entities: string[], sector: string, dealType = "strategic"): Deal => ({
  id, title: `${id} deal`, sector, dealType, peFirm: null,
  entities, url: "https://x/1", published: "1h ago",
} as unknown as Deal);

describe("sector labels are never acquirers", () => {
  it("Healthcare no longer appears as its own acquirer", () => {
    const out = getIndustryAcquirers([deal("d1", ["Healthcare"], "Healthcare")]);
    expect(out.map((a) => a.name)).not.toContain("Healthcare");
  });

  it("the confirmed production case yields no self-referential row", () => {
    const out = getIndustryAcquirers([
      deal("d1", ["Healthcare"], "Healthcare"),
      deal("d2", ["Healthcare", "LLY"], "Healthcare"),
    ]);
    for (const a of out) expect(a.sectors).not.toContain(a.name);
  });

  it("every curated sector label is excluded", () => {
    const labels = ["Banks", "Insurance", "Energy", "Defense", "Retail", "Healthcare",
                    "Technology", "Media", "Autos", "Airlines", "Commodities",
                    "Real Estate", "Telecom", "Semiconductors"];
    for (const l of labels) expect(isSectorEntityLabel(l)).toBe(true);
    const out = getIndustryAcquirers(labels.map((l, i) => deal(`d${i}`, [l], l)));
    expect(out).toEqual([]);
  });

  it("real companies are still surfaced", () => {
    const out = getIndustryAcquirers([deal("d1", ["LLY", "Healthcare"], "Healthcare")]);
    expect(out.map((a) => a.name)).toContain("LLY");
    expect(out.map((a) => a.name)).not.toContain("Healthcare");
  });

  it("the sector label does not consume a slot from a real party", () => {
    // entities are sliced to the first 2 - the label used to displace a company.
    const out = getIndustryAcquirers([deal("d1", ["Healthcare", "LLY", "MRK"], "Healthcare")]);
    const names = out.map((a) => a.name);
    expect(names).toContain("LLY");
    expect(names).toContain("MRK");
  });

  it("deal counts are computed over the filtered parties", () => {
    const out = getIndustryAcquirers([
      deal("d1", ["LLY", "Healthcare"], "Healthcare"),
      deal("d2", ["LLY"], "Healthcare"),
    ]);
    expect(out.find((a) => a.name === "LLY")?.dealCount).toBe(2);
  });

  it("a deal with only a sector label yields nothing rather than a fake party", () => {
    expect(getIndustryAcquirers([deal("d1", ["Energy"], "Energy")])).toEqual([]);
  });

  it("non-strategic deals are still excluded (unchanged behaviour)", () => {
    expect(getIndustryAcquirers([deal("d1", ["LLY"], "Healthcare", "sponsor")])).toEqual([]);
  });
});
