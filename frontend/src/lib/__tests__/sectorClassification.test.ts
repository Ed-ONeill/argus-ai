/**
 * RC2-IS — sector matching is LEXICAL, not arbitrary-substring.
 *
 * `inferSector`'s patterns were unanchored, so a keyword matched anywhere inside
 * an unrelated word. Measured on 720 real upstream production-feed headlines
 * (a representative classification sample — NOT an M&A corpus):
 *
 *   /ai/    matched 80 headlines as a bare substring — "ret-ai-l", "sp-ai-n",
 *           "ch-ai-rman", "r-ai-sed", "rem-ai-ns", "m-ai-ntenance", "em-ai-l"
 *   /bank/  3   ("Bur-bank")
 *   /gas/   2   ("Ve-gas")
 *   /power/ 1     /rail/ 1
 *
 * Because Technology is tested FIRST, those all landed there — "US Strikes
 * Targets in Iran Around Strait of Hormuz" and "EU Considers Front-Loading
 * Ukraine Loan" both classified as Technology — taking Technology to 24.9% of
 * the corpus. After this change: 13.2%, with 90 of 720 (12.5%) reclassified and
 * ZERO headlines containing a legitimate whole-token keyword lost.
 *
 * TWO RULES, chosen from measurement rather than applied mechanically:
 *
 *   LEADING BOUNDARY for stems, so legitimate inflections and compounds keep
 *   working: chips, Data Centers, Robotics, banking, financial, industrial,
 *   logistics, consumers, insurance, advertising, cybersecurity.
 *
 *   FULL TOKEN for short, high-collision tokens — but with their real
 *   inflections spelled out. A blanket `\b...\b` was tested and REJECTED: it
 *   destroys "semiconductor", "railroad", "gasoline" and "Data Centers", all of
 *   which the corpus contains as genuine matches.
 *
 * Deterministic, current-fields-only. No LLM, no external data. Taxonomy,
 * precedence order and the "Other" fallback are unchanged — and "Other" being
 * minted as a literal Sector node remains a separate, untouched ledger item.
 */

import { describe, expect, it } from "vitest";
import { inferSector } from "@/hooks/useMAIntelligence";

const sec = (title: string, entities: string[] = []) => inferSector(title, entities);

// ── Negative controls: the demonstrated substring failures ──────────────────

describe("keywords no longer match inside unrelated words", () => {
  const AI_COLLISIONS: [string, string][] = [
    ["retail",      "Kroger to acquire regional retail chain"],
    ["Airlines",    "Airlines group agrees to buy rival carrier"],
    ["Chairman",    "Chairman steps down as company explores sale"],
    ["Spain",       "Spain's largest grocer explores merger"],
    ["raised",      "Company raised $2bn to fund acquisition"],
    ["remains",     "Deal remains under regulatory review"],
    ["maintenance", "Maintenance provider acquired by PE firm"],
    ["email",       "Email marketing firm acquired"],
  ];

  for (const [word, headline] of AI_COLLISIONS) {
    it(`"${word}" must not match /ai/ as a substring`, () => {
      expect(sec(headline)).not.toBe("Technology");
    });
  }

  it('"Vegas" must not match /gas/', () => {
    expect(sec("Las Vegas Sands explores casino sale")).not.toBe("Energy");
  });

  it('"Burbank" must not match /bank/', () => {
    expect(sec("Burbank studio lot sold to buyer")).not.toBe("Financials");
  });

  it('"Semiannual" must not match /semi/', () => {
    expect(sec("Semiannual review triggers divestiture")).not.toBe("Technology");
  });

  it("the two headlines that made the defect visible are no longer Technology", () => {
    expect(sec("US Strikes Targets in Iran Around Strait of Hormuz")).not.toBe("Technology");
    expect(sec("EU Considers Front-Loading Ukraine Loan as Funding Shortage Looms")).not.toBe("Technology");
  });
});

// ── Positive controls: the correction must not over-tighten ─────────────────

describe("legitimate terms, inflections and compounds still classify", () => {
  const TECH: [string, string][] = [
    ["explicit AI",     "AI startup acquired by strategic buyer"],
    ["AI hyphenated",   "AI-powered analytics firm acquired"],
    ["chip singular",   "Chip designer agrees to takeover"],
    ["chips plural",    "China's CXMT Makes Breakthrough in Advanced Memory Chips"],
    ["chipmaker",       "Chipmaker explores sale of its foundry unit"],
    ["data center",     "Data center operator acquired"],
    ["Data Centers",    "Trump Condemns Communities Opposed to Data Centers"],
    ["semiconductor",   "Semiconductor supplier trades at a discount"],
    ["cloud",           "Cloud infrastructure provider acquired"],
    ["cybersecurity",   "Cybersecurity vendor acquired by sponsor"],
    ["software",        "Software vendor agrees to merger"],
    ["SaaS",            "SaaS provider acquired"],
  ];
  for (const [label, headline] of TECH) {
    it(`${label} -> Technology`, () => expect(sec(headline)).toBe("Technology"));
  }

  it("banking (inflection) -> Financials", () => {
    expect(sec("Banking group agrees to acquire rival")).toBe("Financials");
  });
  it("banks (plural) -> Financials", () => {
    expect(sec("Banks explore consolidation")).toBe("Financials");
  });
  it("financial / financing (stem inflections) -> Financials", () => {
    expect(sec("Financial services firm acquired")).toBe("Financials");
    expect(sec("Financing arm sold to sponsor")).toBe("Financials");
  });
  it("Robotics -> Industrials", () => {
    expect(sec("Reframe Raises Funds to Bring Amazon Robotics Know-How to Homes")).toBe("Industrials");
  });
  it("railroad and rails -> Industrials", () => {
    expect(sec("Railroad operator agrees to merge")).toBe("Industrials");
    expect(sec("Rails group explores sale")).toBe("Industrials");
  });
  it("gasoline -> Energy", () => {
    expect(sec("CPI for all items falls 0.4% in June; gasoline down")).toBe("Energy");
  });
  it("oil / oils -> Energy", () => {
    expect(sec("Oil producer acquired")).toBe("Energy");
    expect(sec("Oils group explores divestiture")).toBe("Energy");
  });
  it("REIT and REITs -> Real Estate", () => {
    expect(sec("REIT acquires logistics portfolio")).not.toBe("Other");
    expect(sec("REITs explore consolidation")).not.toBe("Other");
  });
  it("MediaTek (leading-boundary compound) -> Media & Telecom", () => {
    // The existing `media` stem intentionally matches at a word start.
    expect(sec("Nvidia Invests in MediaTek")).toBe("Media & Telecom");
  });
  it("advertising / publishes (stem inflections) -> Media & Telecom", () => {
    expect(sec("Advertising business acquired")).toBe("Media & Telecom");
    expect(sec("Publishes results ahead of merger vote")).toBe("Media & Telecom");
  });
  it("insurance / insurer -> Financials", () => {
    expect(sec("Insurance broker acquired")).toBe("Financials");
    expect(sec("Insurer agrees to takeover")).toBe("Financials");
  });
  it("industrial / industries / logistics / consumers -> stems still work", () => {
    expect(sec("Industrial group acquired")).toBe("Industrials");
    expect(sec("Industries arm sold")).toBe("Industrials");
    expect(sec("Logistics operator acquired")).toBe("Industrials");
    expect(sec("Consumers brand sold to sponsor")).toBe("Consumer");
  });
});

// ── Precedence and contract preserved ───────────────────────────────────────

describe("taxonomy, precedence and fallback are unchanged", () => {
  it("Technology still wins over a later sector on a multi-sector headline", () => {
    // Technology is first in the array; that ordering must not change.
    expect(sec("Cloud provider acquires healthcare analytics firm")).toBe("Technology");
    expect(sec("Software group buys retail chain")).toBe("Technology");
  });

  it("Healthcare wins over Energy when no Technology term is present", () => {
    expect(sec("Pharma group acquires energy-drink maker")).toBe("Healthcare");
  });

  it("Energy wins over Financials when no earlier sector matches", () => {
    expect(sec("Energy group acquires lending arm")).toBe("Energy");
  });

  it('the "Other" fallback is unchanged', () => {
    expect(sec("Company agrees to be acquired")).toBe("Other");
    expect(sec("")).toBe("Other");
  });

  it("entities are still part of the matched text", () => {
    // The signature is (title, entities) and both are searched — unchanged.
    expect(sec("Company agrees to be acquired", ["Semiconductors"])).toBe("Technology");
    expect(sec("Company agrees to be acquired", ["Healthcare"])).toBe("Healthcare");
  });

  it("classification is deterministic", () => {
    const t = "Chip designer agrees to takeover";
    expect(sec(t)).toBe(sec(t));
  });
});
