/**
 * RC2-TX — M&A emitted an INDUSTRY name in the SECTOR slot.
 *
 * The canonical taxonomy (`industryConfig`) is a two-level hierarchy:
 *
 *   Sector "Communications"  ->  Industry "Media & Telecom"  ->  slug media-telecom
 *
 * `inferSector`'s media/telecom branch emitted `"Media & Telecom"` — the
 * INDUSTRY name — as a sector. Measured, that minted a THIRD node identity
 * alongside the two canonical ones:
 *
 *   Industry  "Media & Telecom"   id=industry-media-telecom   canonical
 *   Sector    "Communications"    id=communications           canonical parent
 *   Sector    "Media & Telecom"   id=media-telecom            ARTIFACT
 *
 * So canonical Communications intelligence and M&A telecom activity attached to
 * different nodes. It also reproduced the RC2-OS false-resolved pattern:
 * `sectorExposure("Media & Telecom")` returned `resolved: true` with zero
 * industries, purely because a non-canonical Sector node existed.
 *
 * The correction renames only the EMITTED LABEL. The keyword set, matcher
 * semantics and precedence order are byte-identical, and the canonical Industry
 * "Media & Telecom" is untouched.
 *
 * Three consumers move with it, because all three are keyed on `deal.sector`:
 *   SECTOR_TO_INDUSTRY  key -> "Communications", value "media-telecom" UNCHANGED
 *   COMPARABLE_DEALS    key -> "Communications" (without this, curated telecom
 *                              comparables would have silently become [])
 *   comparablesFor()    GICS alias "Communication Services" now resolves to it
 *
 * Corpus delta on the same 720 upstream production-feed headlines used by RC2-IS:
 * Media & Telecom 6 -> 0, Communications 0 -> 6, EVERY other count identical.
 *
 * OUT OF SCOPE, recorded not fixed: M&A still cannot emit canonical "Utilities",
 * and `\butility` does not match the plural "utilities".
 */

import { beforeEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { intelligenceGraph as G } from "../intelligenceGraph";
import { ingestThemes, ingestStories, ingestMA, isClassifiedSector } from "../intelligenceGraphAdapters";
import { evaluateEvidenceForNode } from "../evidenceEngine";
import { predictThemeTrajectory } from "../predictionEngine";
import { buildIntelligenceProfile } from "../intelligenceProfile";
import { sectorExposure, parentSectorOf, industriesOfSector } from "../sectorTaxonomy";
import { comparablesFor } from "../maIntelligence";
import { inferSector } from "@/hooks/useMAIntelligence";

const sec = (t: string, e: string[] = []) => inferSector(t, e);

const theme = () => ({
  id: "t1", name: "Connectivity", description: "d", signal_strength: "strong", confidence: 70,
  momentum_direction: "bullish", related_industries: ["Media & Telecom"], related_assets: ["T"],
  related_macro_factors: [], contributing_cluster_ids: ["c1"], contributing_story_count: 1,
  second_order_effects: [], podcast_topics: [], last_updated: "2026-09-03T00:00:00Z",
  momentum_delta: 12,
}) as never;

const story = () => ({
  id: "c1", primary: { id: "c1", title: "Telecom demand surges", url: "https://x/c1",
    source: "Reuters", category: "Markets", published: "1h ago", signal_score: 80,
    signal_strength: "strong", affected_entities: ["T"], summary: "", why_it_matters: "",
    impact: "", snippet: "" },
  related: [], cluster_score: 0.9, theme_label: "Connectivity", story_count: 1,
}) as never;

/** Sector comes from the REAL classifier, exactly as `toMADeal` does. */
const deal = (id: string, title: string) => ({
  id, title, url: "u", source: "Reuters", published: "1h ago", entities: ["T"],
  dealType: "strategic", sector: inferSector(title, ["T"]), peFirm: null,
  signalScore: 80, summary: "", whyItMatters: "",
}) as never;

beforeEach(() => G.clear());

// ── The classifier emits the canonical SECTOR name ──────────────────────────

describe("existing media/telecom keywords now emit Communications", () => {
  // Drawn from the CURRENT keyword set — no new classifier coverage invented.
  const CASES: [string, string][] = [
    ["media",     "Media group agrees to be acquired"],
    ["telecom",   "Telecom operator acquired"],
    ["streaming", "Streaming service sold to strategic buyer"],
    ["broadcast", "Broadcast network explores sale"],
    ["advertis",  "Advertising business acquired"],
    ["publish",   "Publishing house agrees to merger"],
    ["wireless",  "Wireless carrier acquired"],
    ["social",    "Social platform acquired by sponsor"],
    ["MediaTek",  "Nvidia Invests in MediaTek"],
  ];
  for (const [kw, headline] of CASES) {
    it(`${kw} -> Communications`, () => {
      expect(sec(headline)).toBe("Communications");
    });
  }

  it('the classifier can never emit "Media & Telecom" as a sector', () => {
    for (const [, headline] of CASES) expect(sec(headline)).not.toBe("Media & Telecom");
  });

  it("the keyword set and precedence are unchanged", () => {
    const src = readFileSync(resolve(__dirname, "../../hooks/useMAIntelligence.ts"), "utf8");
    expect(src).toContain(
      '["Communications", /\\bmedia|\\btelecom|\\bstreaming|\\bbroadcast|\\badvertis|\\bpublish|\\bwireless|\\bsocial/i]');
    // Technology still first, Communications still last.
    expect(src.indexOf('["Technology",')).toBeLessThan(src.indexOf('["Communications",'));
  });

  it("Technology precedence still wins over a media term", () => {
    expect(sec("Cloud provider acquires media group")).toBe("Technology");
  });
});

// ── The canonical two-level hierarchy ───────────────────────────────────────

describe("the graph holds exactly the canonical hierarchy", () => {
  beforeEach(() => {
    ingestThemes([theme()]);
    ingestMA([deal("d1", "Telecom operator acquired by broadcast group")], [theme()]);
  });

  it("no Sector node named 'Media & Telecom' is minted", () => {
    expect(G.allNodes().filter(n => n.type === "Sector" && n.label === "Media & Telecom"))
      .toHaveLength(0);
  });

  it("the canonical Industry 'Media & Telecom' remains, untouched", () => {
    const ind = G.allNodes().find(n => n.type === "Industry" && n.label === "Media & Telecom");
    expect(ind).toBeTruthy();
    expect(ind!.id).toBe("industry-media-telecom");
  });

  it("Industry --belongs_to--> Communications is untouched", () => {
    const ind = G.allNodes().find(n => n.type === "Industry" && n.label === "Media & Telecom")!;
    const parents = G.getRelationships(ind.id)
      .filter(e => e.relationshipType === "belongs_to")
      .map(e => G.getNode(e.target)?.label);
    expect(parents).toContain("Communications");
    expect(parentSectorOf("Media & Telecom")).toBe("Communications");
  });

  it("the deal targets the canonical Communications Sector", () => {
    const comms = G.allNodes().find(n => n.type === "Sector" && n.label === "Communications")!;
    const fromDeal = G.getRelationships(comms.id)
      .filter(e => e.relationshipType === "affects" && G.getNode(e.source)?.type === "Deal");
    expect(fromDeal).toHaveLength(1);
    expect(fromDeal[0].originatingPages).toContain("M&A");
  });

  it("only two identities exist, not three", () => {
    const labelled = G.allNodes()
      .filter(n => /Media & Telecom|Communications/.test(n.label))
      .map(n => `${n.type}:${n.label}`).sort();
    expect(labelled).toEqual(["Industry:Media & Telecom", "Sector:Communications"]);
  });
});

// ── sectorExposure resolves on the canonical sector ─────────────────────────

describe("sectorExposure", () => {
  beforeEach(() => {
    ingestThemes([theme()]);
    ingestMA([deal("d1", "Telecom operator acquired")], [theme()]);
  });

  it("Communications resolves with its industry", () => {
    const ex = sectorExposure("Communications");
    expect(ex.resolved).toBe(true);
    expect(ex.industries).toContain("Media & Telecom");
    expect(industriesOfSector("Communications")).toContain("Media & Telecom");
  });

  it("the false-resolved 'Media & Telecom' sector identity is gone", () => {
    expect(sectorExposure("Media & Telecom").resolved).toBe(false);
  });
});

// ── Industry navigation still resolves ──────────────────────────────────────

describe("industry navigation", () => {
  const src = () => readFileSync(resolve(__dirname, "../../app/ma/page.tsx"), "utf8");

  it('SECTOR_TO_INDUSTRY maps Communications -> media-telecom', () => {
    const map = src().slice(src().indexOf("const SECTOR_TO_INDUSTRY"), src().indexOf("};", src().indexOf("const SECTOR_TO_INDUSTRY")));
    expect(map).toContain('"Communications": "media-telecom"');
    expect(map).not.toContain('"Media & Telecom"');
  });

  it("the destination slug is unchanged, so /industries/media-telecom still resolves", () => {
    expect(src()).toContain('href={`/industries/${industrySlug}`}');
  });
});

// ── Comparables ─────────────────────────────────────────────────────────────

describe("comparable grouping", () => {
  const sameSector = (a: string, b: string) => a === b && isClassifiedSector(a);

  it("two Communications deals are same-sector comparables", () => {
    expect(sameSector(sec("Telecom operator acquired"), sec("Broadcast group sold"))).toBe(true);
  });

  it("they do not mix with unrelated sectors", () => {
    expect(sameSector(sec("Telecom operator acquired"), sec("Chip designer acquired"))).toBe(false);
    expect(sameSector(sec("Telecom operator acquired"), sec("Oil producer acquired"))).toBe(false);
  });

  it('RC2-OS: "Other" remains excluded', () => {
    expect(sameSector("Other", "Other")).toBe(false);
  });

  it("existing legitimate sector comparables are unchanged", () => {
    expect(sameSector("Technology", "Technology")).toBe(true);
    expect(sameSector("Energy", "Energy")).toBe(true);
  });

  it("curated historical comparables survive the rename", () => {
    // COMPARABLE_DEALS is keyed on deal.sector. Renaming the classifier without
    // renaming the key would have silently reduced this to 0.
    expect(comparablesFor("Communications")).toHaveLength(3);
    expect(comparablesFor("Communication Services")).toHaveLength(3);  // GICS alias
    expect(comparablesFor("Media & Telecom")).toHaveLength(0);          // no longer a sector key
  });
});

// ── Zero-delta intelligence, and N1 still holds ─────────────────────────────

describe("intelligence is untouched", () => {
  beforeEach(() => {
    ingestThemes([theme()]);
    ingestStories([story()], [theme()]);
    ingestMA([deal("d1", "Telecom operator acquired")], [theme()]);
  });

  it("evidence, trust, verdict, forecasts and forwards are unaffected", () => {
    let items = 0, trust = 0, forecasts = 0, forwards = 0, sb = 0;
    for (const n of G.allNodes()) {
      if (n.type === "Sector") continue;
      const e = evaluateEvidenceForNode(n.id);
      items += e.supportingEvidence.length + e.contradictingEvidence.length;
      trust += e.overallTrust;
      sb += (e.sourceBreakdown ?? []).length;
      if (n.type === "Theme") {
        if (predictThemeTrajectory(n.id).predictedDirection !== "insufficient_signal") forecasts++;
        if (buildIntelligenceProfile(n.label, { kindHint: "theme" as never }).thesis.data?.forward) forwards++;
      }
    }
    expect({ items, trust, forecasts, forwards, sb })
      .toEqual({ items: 2, trust: 102, forecasts: 1, forwards: 1, sb: 2 });
  });

  it("RC2-N1: the M&A affects edge stays non-evidentiary", () => {
    const comms = G.allNodes().find(n => n.type === "Sector" && n.label === "Communications")!;
    const e = evaluateEvidenceForNode(comms.id);
    expect(e.supportingEvidence).toHaveLength(0);
    expect(e.verdict).toBe("insufficient_signal");
    expect(e.overallTrust).toBe(0);
  });
});

// ── Out of scope, pinned as unchanged ───────────────────────────────────────

describe("Utilities remains out of scope", () => {
  it("M&A still cannot emit canonical Utilities", () => {
    expect(sec("Regulated utility agrees to merger")).not.toBe("Utilities");
  });

  it("utility headlines still classify as Energy — precedence unchanged", () => {
    expect(sec("Regulated utility agrees to merger")).toBe("Energy");
    expect(sec("Electric utility acquired by infrastructure fund")).toBe("Energy");
  });

  it("the plural gap is unchanged: \\butility does not match 'utilities'", () => {
    // Recorded, deliberately NOT fixed here.
    expect(sec("Utilities holding company explores sale")).toBe("Other");
  });
});
