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

import { parseUid, admitUid, companyUid, buildCompanyDossier, classifyAttribution } from "./dossier";
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
    companies_direct: ["VRT"],
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

  ["event record: only direct events, engine order preserved", () => {
    const other = event({ id: "ccc333ddd444", title: "Fed decision", companies: [], companies_direct: [], theme_ids: [] });
    const second = event({ id: "eee555fff666", editorial_score: 12, title: "Vertiv follow-up" });
    const d = buildCompanyDossier("VRT", feed([theme()], [event(), other, second]));
    assert(d, "built");
    assert(d.record.length === 2, "only VRT-named events");
    assert(d.record[0].event.id === "aaa111bbb222" && d.record[1].event.id === "eee555fff666",
           "engine rank order preserved, never re-sorted");
    assert(d.record.every(r => r.attribution === "direct"), "the record is direct-only");
  }],

  ["coverage counts direct events, evidence, corroboration, earliest first_seen", () => {
    const older = event({ id: "eee555fff666", first_seen: "2026-07-15T08:00:00Z",
                          corroboration_count: 1, evidence: [evidence("Reuters", 1)] });
    const d = buildCompanyDossier("VRT", feed([theme()], [event(), older]));
    assert(d, "built");
    assert(d.coverage.events === 2, "direct event count");
    assert(d.coverage.evidence === 3, "evidence count sums over the direct record");
    assert(d.coverage.corroborated === 1, "corroborated = direct events with >=2 qualified");
    assert(d.coverage.firstSeen === "2026-07-15T08:00:00Z", "earliest first_seen wins");
    assert(d.coverage.themes === 1, "linked themes counted");
  }],

  ["standing view is honest when no thesis names the company", () => {
    const d = buildCompanyDossier("VRT", feed([theme({ related_assets: ["ETN"] })], [event()]));
    assert(d, "built");
    assert(!d.standing.hasThesis, "no thesis");
    assert(d.standing.sentences[0].includes("No standing thesis names"), "absence stated plainly");
    assert(d.standing.sentences.some(s => s.includes("no standing thesis transmits")),
           "direct events without transmission stated");
    assert(d.exposures.length === 0, "no exposures");
  }],

  ["standing view explains the connection in investor language (because-clause)", () => {
    const t = theme({ description: "AI data-center growth increases demand for electricity and grid investment." });
    const d = buildCompanyDossier("VRT", feed([t], [event()]));
    assert(d, "built");
    assert(d.standing.hasThesis, "has thesis");
    assert(d.standing.sentences[0].includes("conviction 78"), "figure over adjective");
    assert(d.standing.sentences[0].includes("because AI data-center growth increases demand"),
           "the WHY is stated, not just the theme name");
    const x = d.exposures[0];
    assert(x.meaning.includes("AI data-center growth"), "exposure carries what the thesis means");
    assert(x.whyConnected.includes("because") && x.whyConnected.includes("Vertiv"),
           "exposure explains why THIS company connects");
    assert(x.connection === "recorded", "ontology asset membership is a recorded connection");
  }],

  ["watch derives company-specific questions from the exposure chain", () => {
    const d = buildCompanyDossier("VRT", feed([theme()], []));
    assert(d, "built");
    assert(d.watch.length === 1 && d.watch[0].sourceTheme === "Power Infrastructure",
           "watch item cites its generating theme");
    assert(d.watch[0].text.includes("Datacenter Capex") && d.watch[0].text.includes("Grid equipment makers"),
           "question is built from the recorded chain, not generic fallback");
    assert(d.watch[0].text.includes("Vertiv"), "question names the company");
    const bare = buildCompanyDossier("VRT", feed([], []));
    assert(bare && bare.watch.length === 0, "no themes, no watch — empty, not invented");
  }],

  ["watch deduplicates: themes whose chains share head and tail share one question", () => {
    const a = theme({ id: "t-a", name: "Theme A", confidence: 75 });
    const b = theme({ id: "t-b", name: "Theme B", confidence: 56,
                      causal_narrative: "Datacenter Capex → Compute Arms Race → Grid equipment makers" });
    const c = theme({ id: "t-c", name: "Theme C", confidence: 40,
                      causal_narrative: "Rates → Duration → Growth equities" });
    const d = buildCompanyDossier("VRT", feed([a, b, c], []));
    assert(d, "built");
    assert(d.watch.length === 2, "shared head+tail folds; the distinct chain stays separate");
    const folded = d.watch.find(w => w.sourceTheme.includes("Theme A"));
    assert(folded, "folded item exists");
    assert(folded.sourceTheme.includes("Theme B"), "folded item cites both generating themes");
    assert(folded.text.includes("Theme A (75)") && folded.text.includes("Theme B (56)"),
           "one question names every thesis riding the chain, with figures");
    assert(!folded.text.includes("Theme C"), "the distinct chain is not swallowed");
  }],

  // ── EI1.1 attribution acceptance (the NVDA defects, pinned) ────────────────

  ["a Micron story is a peer event for Nvidia, never a direct one", () => {
    const micron = event({
      id: "micron000001", title: "Micron beats estimates on HBM demand",
      event_type: "earnings", companies: ["MU", "NVDA"], companies_direct: ["MU"],
      theme_ids: ["semi-capex"], industries: [],
    });
    const semi = theme({ id: "semi-capex", name: "Semiconductor Capex", related_assets: ["NVDA", "MU"] });
    const d = buildCompanyDossier("NVDA", feed([semi], [micron]));
    assert(d, "built");
    assert(d.record.length === 0, "Micron earnings are NOT an Nvidia event");
    assert(d.related.length === 1, "it appears as a related development");
    assert(d.related[0].attribution === "peer", "attributed as peer");
    assert(d.related[0].reason === "Peer event: Micron Technology", "the reason names the peer");
  }],

  ["an Anthropic IPO story never enters Nvidia's direct record", () => {
    const ipo = event({
      id: "anthropic001", title: "Anthropic inches toward a mega-IPO",
      event_type: "market_event", companies: ["NVDA"], companies_direct: [],
      theme_ids: ["ai-infra"], industries: [],
    });
    const ai = theme({ id: "ai-infra", name: "AI Infrastructure", related_assets: ["NVDA"] });
    const d = buildCompanyDossier("NVDA", feed([ai], [ipo]));
    assert(d, "built");
    assert(d.record.length === 0, "theme membership never implies involvement");
    assert(d.related[0].attribution === "theme_exposure", "attributed as theme exposure");
    assert(d.related[0].reason === "Theme exposure: AI Infrastructure", "the connecting theme is stated");
  }],

  ["a semiconductor selloff is industry exposure with the relationship stated", () => {
    const selloff = event({
      id: "selloff00001", title: "Chip stocks slide as AI spending fears mount",
      event_type: "market_event", companies: ["NVDA"], companies_direct: [],
      theme_ids: ["other-theme"], industries: ["Semiconductors"],
    });
    const semi = theme({ id: "semi-capex", name: "Semiconductor Capex",
                         related_assets: ["NVDA"], related_industries: ["Semiconductors"] });
    const d = buildCompanyDossier("NVDA", feed([semi], [selloff]));
    assert(d, "built");
    assert(d.record.length === 0, "a sector selloff is not an Nvidia event");
    assert(d.related[0].attribution === "industry_exposure", "attributed as industry exposure");
    assert(d.related[0].reason === "Industry exposure: Semiconductors", "the industry is stated");
  }],

  ["direct Nvidia news lands in the direct record", () => {
    const earnings = event({
      id: "nvdadirect01", title: "Nvidia reports Q2 earnings, data center revenue surges",
      event_type: "earnings", companies: ["NVDA"], companies_direct: ["NVDA"], theme_ids: [],
    });
    const d = buildCompanyDossier("NVDA", feed([], [earnings]));
    assert(d, "built");
    assert(d.record.length === 1 && d.record[0].attribution === "direct", "named → direct record");
    assert(d.related.length === 0, "nothing mislabeled as related");
  }],

  ["pre-EI1.1 events without provenance are labeled, not guessed", () => {
    const legacy = event({ id: "legacy000001" });
    delete (legacy as Partial<MarketEvent>).companies_direct;
    const d = buildCompanyDossier("VRT", feed([theme()], [legacy]));
    assert(d, "built");
    assert(d.record.length === 0, "unknown provenance never claims direct");
    assert(d.related[0].attribution === "unattributed", "labeled unattributed");
    assert(d.related[0].reason.includes("predates provenance"), "the reason says why");
  }],

  ["too-weak connections are excluded entirely", () => {
    const stray = event({
      id: "stray0000001", companies: ["VRT"], companies_direct: [],
      theme_ids: ["unrelated-theme"], industries: ["Airlines"],
    });
    const noOverlap = classifyAttribution(stray, {
      ticker: "VRT", sector: "Industrials",
      industries: new Set(["industrials", "utilities"]),
      themeIds: new Set(["power-infra"]),
      themeNameById: new Map([["power-infra", "Power Infrastructure"]]),
    });
    assert(noOverlap === null, "no direct, no peer, no industry, no theme → excluded");
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
