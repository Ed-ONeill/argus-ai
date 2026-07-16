/**
 * lib/intel/intelTests.ts — EI1 Entity Intelligence dossier model tests.
 *
 * Run directly with:  npx tsx src/lib/intel/intelTests.ts
 * (same harness pattern as lib/network/networkTests.ts)
 *
 * Covers the canonical dossier grammar's data layer: strict uid parsing, the
 * admission law (company admitted; reserved kinds honest; invalid never
 * guessed), the company builder (exposures, event record, coverage, standing
 * view honesty, watch derivation), and determinism.
 */

import { parseUid, admitUid, companyUid, buildCompanyDossier } from "./dossier";
import type { FeedResponse, MarketEvent, ThemeIntelligence, EventEvidence } from "@/lib/types";

interface TestResult { name: string; ok: boolean; detail?: string }

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

// ── fixtures ────────────────────────────────────────────────────────────────────

function theme(over: Partial<ThemeIntelligence> = {}): ThemeIntelligence {
  return {
    id: "power-infra",
    name: "Power Infrastructure",
    description: "test",
    signal_strength: "strong",
    confidence: 78,
    momentum_direction: "bullish",
    related_industries: ["Utilities"],
    related_assets: ["VRT", "ETN"],
    related_macro_factors: ["Datacenter Capex"],
    contributing_cluster_ids: ["aaa111bbb222"],
    contributing_story_count: 6,
    second_order_effects: [],
    podcast_topics: [],
    last_updated: "2026-07-16T12:00:00Z",
    relationship_weights: {},
    confidence_label: "Elevated",
    signal_quality: "confirmed",
    evidence_count: 9,
    persistence_score: 60,
    volatility_score: 20,
    cross_category_confirmed: true,
    momentum_label: "strengthening",
    momentum_delta: 4,
    persistence_cycles: 5,
    competition_penalty: 0,
    causal_narrative: "Datacenter Capex → Power Infrastructure → Grid equipment makers",
    breadth_score: 3,
    persistence_days: 6,
    ...over,
  };
}

function evidence(source: string, tier: number, qualified = tier <= 2): EventEvidence {
  return { source, title: `${source} coverage`, url: `https://x/${source}`,
           published: "2026-07-16T09:00:00Z", tier, kind: "news", qualified };
}

function event(over: Partial<MarketEvent> = {}): MarketEvent {
  return {
    id: "aaa111bbb222",
    title: "Vertiv wins record datacenter order",
    event_type: "single_name",
    first_seen: "2026-07-16T08:00:00Z",
    last_updated: "2026-07-16T10:00:00Z",
    corroboration_count: 2,
    source_count: 2,
    evidence: [evidence("Reuters", 1), evidence("Bloomberg Markets", 1)],
    companies: ["VRT"],
    industries: ["Utilities"],
    theme_ids: ["power-infra"],
    confidence: 78,
    editorial_score: 40,
    why_it_matters: "",
    transmission: null,
    dominant: false,
    developing: false,
    reporting_period: null,
    merged_event_ids: [],
    ...over,
  };
}

function feed(themes: ThemeIntelligence[], events: MarketEvent[]): FeedResponse {
  return { theme_intelligence: themes, events } as unknown as FeedResponse;
}

// ── tests ───────────────────────────────────────────────────────────────────────

const tests: Array<[string, () => void]> = [

  ["parseUid accepts canonical uids and rejects malformed ones", () => {
    const p = parseUid("company:ticker:VRT");
    assert(p && p.type === "company" && p.namespace === "ticker" && p.key === "VRT", "canonical parse");
    assert(parseUid("theme:ontology:power-infra")?.type === "theme", "theme parse");
    assert(parseUid("notauid") === null, "no colons rejected");
    assert(parseUid("company:VRT") === null, "two segments rejected");
    assert(parseUid("") === null, "empty rejected");
  }],

  ["admission law: company admitted, other kinds reserved, garbage invalid", () => {
    const c = admitUid("company:ticker:vrt");
    assert(c.state === "company" && c.ticker === "VRT", "company admitted + normalized");
    const r = admitUid("theme:ontology:power-infra");
    assert(r.state === "reserved" && r.kind === "theme", "theme reserved in EI1 (file page lands with its kind sprint)");
    assert(admitUid("person:name:someone").state === "reserved", "unknown kind reserved, never guessed");
    assert(admitUid("company:ticker:TOOLONGX").state === "invalid", "non-ticker-shaped key invalid");
    assert(admitUid("garbage").state === "invalid", "malformed invalid");
  }],

  ["companyUid normalizes to uppercase canonical form", () => {
    assert(companyUid("vrt") === "company:ticker:VRT", "uppercased");
  }],

  ["company builder: exposures ranked by conviction, dominant only for the top theme", () => {
    const weak = theme({ id: "weak", name: "Weak Theme", confidence: 40, related_assets: ["VRT"] });
    const d = buildCompanyDossier("VRT", feed([theme(), weak], [event()]));
    assert(d, "dossier built");
    assert(d.exposures.length === 2, "both linked themes exposed");
    assert(d.exposures[0].themeId === "power-infra", "sorted by conviction");
    assert(d.exposures[0].dominant === true, "top-conviction theme is dominant");
    assert(d.exposures[1].dominant === false, "weak theme not dominant");
    assert(d.standing.onDominantPath === true, "on dominant path");
  }],

  ["event record: only events naming the company, engine order preserved", () => {
    const other = event({ id: "ccc333ddd444", title: "Fed decision", companies: [], theme_ids: [] });
    const second = event({ id: "eee555fff666", editorial_score: 12, title: "Vertiv follow-up" });
    const d = buildCompanyDossier("VRT", feed([theme()], [event(), other, second]));
    assert(d, "built");
    assert(d.events.length === 2, "only VRT events");
    assert(d.events[0].id === "aaa111bbb222" && d.events[1].id === "eee555fff666",
           "engine rank order preserved, never re-sorted");
  }],

  ["coverage counts events, evidence, corroboration, earliest first_seen", () => {
    const older = event({ id: "eee555fff666", first_seen: "2026-07-15T08:00:00Z",
                          corroboration_count: 1, evidence: [evidence("Reuters", 1)] });
    const d = buildCompanyDossier("VRT", feed([theme()], [event(), older]));
    assert(d, "built");
    assert(d.coverage.events === 2, "event count");
    assert(d.coverage.evidence === 3, "evidence count sums");
    assert(d.coverage.corroborated === 1, "corroborated = events with >=2 qualified");
    assert(d.coverage.firstSeen === "2026-07-15T08:00:00Z", "earliest first_seen wins");
    assert(d.coverage.themes === 1, "linked themes counted");
  }],

  ["standing view is honest when no thesis names the company", () => {
    const d = buildCompanyDossier("VRT", feed([theme({ related_assets: ["ETN"] })], [event()]));
    assert(d, "built");
    assert(!d.standing.hasThesis, "no thesis");
    assert(d.standing.sentences[0].includes("No standing thesis names"), "absence stated plainly");
    assert(d.standing.sentences.some(s => s.includes("none currently transmit")),
           "events without transmission stated");
    assert(d.exposures.length === 0, "no exposures");
  }],

  ["standing view carries conviction figure and recorded transmission when themed", () => {
    const d = buildCompanyDossier("VRT", feed([theme()], [event()]));
    assert(d, "built");
    assert(d.standing.hasThesis, "has thesis");
    assert(d.standing.sentences[0].includes("conviction 78"), "figure over adjective");
    assert(d.standing.sentences.some(s => s.includes("Datacenter Capex →")), "recorded causal narrative shown");
  }],

  ["watch derives from linked themes only — no page-local speculation", () => {
    const d = buildCompanyDossier("VRT", feed([theme()], []));
    assert(d, "built");
    assert(d.watch.length === 1 && d.watch[0].sourceTheme === "Power Infrastructure",
           "watch item cites its generating theme");
    const bare = buildCompanyDossier("VRT", feed([], []));
    assert(bare && bare.watch.length === 0, "no themes, no watch — empty, not invented");
  }],

  ["unknown ticker stays honest: name falls back to the ticker, identity unresolved", () => {
    const d = buildCompanyDossier("QQXYZ", feed([], []));
    assert(d, "built even when thin — thin is honest");
    assert(d.name === "QQXYZ" && d.identified === false, "no fabricated company name");
    assert(d.coverage.events === 0 && d.coverage.firstSeen === null, "empty coverage");
  }],

  ["null feed yields null (loading), deterministic outputs for fixed inputs", () => {
    assert(buildCompanyDossier("VRT", null) === null, "null feed → null");
    const f = feed([theme()], [event()]);
    assert(JSON.stringify(buildCompanyDossier("VRT", f)) === JSON.stringify(buildCompanyDossier("VRT", f)),
           "deterministic");
  }],
];

// ── harness ─────────────────────────────────────────────────────────────────────

const results: TestResult[] = tests.map(([name, fn]) => {
  try { fn(); return { name, ok: true }; }
  catch (e) { return { name, ok: false, detail: (e as Error).message }; }
});

for (const r of results) {
  console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.name}${r.detail ? ` — ${r.detail}` : ""}`);
}
const passed = results.filter(r => r.ok).length;
console.log(`\n${passed}/${results.length} passed`);
if (passed !== results.length) process.exit(1);
