/**
 * lib/network/networkTests.ts — M4.1 Intelligence Network validation tests.
 *
 * Run directly with:  npx tsx src/lib/network/networkTests.ts
 * (same harness pattern as lib/intelligenceTests.ts)
 *
 * Covers the M4.1 acceptance criteria: deterministic layout, no time-derived
 * identity, stability under node insertion, in-bounds boxes, no synthetic
 * Market Center, class → column mapping, recorded vs derived provenance,
 * path tracing, reduced-motion behavior, sparse/dense handling, and the
 * removal of the fabricated replay from the Feed hero source.
 */

import { readFileSync } from "fs";
import { join } from "path";
import { buildNetworkModel, tracePath, transitionMs } from "./model";
import {
  computeLayout, boxesOverlap, contentBounds, focalNodeId, tierOf, wrapLabel,
  COLUMN_ORDER, type NetworkLayout,
} from "./layout";
import type { ThemeIntelligence } from "@/lib/types";
import type { MarketSnapshot } from "@/lib/marketMap";

interface TestResult { name: string; ok: boolean; detail?: string }

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

// ── fixtures ────────────────────────────────────────────────────────────────────

function theme(over: Partial<ThemeIntelligence> = {}): ThemeIntelligence {
  return {
    id: "ai-energy-demand",
    name: "Grid Bottleneck Trade",
    description: "test",
    signal_strength: "strong",
    confidence: 72,
    momentum_direction: "bullish",
    momentum_label: "strengthening",
    momentum_delta: 5,
    related_industries: ["Utilities", "Semiconductors"],
    related_assets: ["NVDA", "CEG", "VST"],
    related_macro_factors: ["Power Load Growth"],
    causal_narrative: "AI capex → power demand → merchant generators",
    relationship_weights: { Utilities: { weight: 0.85, type: "indirect", direction: "positive" } },
    second_order_effects: [],
    contributing_cluster_ids: [],
    ...over,
  } as unknown as ThemeIntelligence;
}

function themeSet(n: number): ThemeIntelligence[] {
  const dirs = ["bullish", "bearish", "neutral"] as const;
  const sectors = ["Utilities", "Financials", "Semiconductors", "Energy", "Real Estate", "Industrials"];
  return Array.from({ length: n }, (_, i) => theme({
    id: `theme-${i}`,
    name: `Test Theme ${String.fromCharCode(65 + i)}`,
    confidence: 80 - i * 6,
    momentum_direction: dirs[i % 3],
    related_industries: [sectors[i % sectors.length]],
    relationship_weights: { [sectors[i % sectors.length]]: { weight: 0.7, type: "direct", direction: i % 3 === 1 ? "negative" : "positive" } },
    related_assets: [`T${String.fromCharCode(65 + i)}A`, `T${String.fromCharCode(65 + i)}B`],
    related_macro_factors: [i < 3 ? "Power Load Growth" : "Terminal Rate"],
    causal_narrative: "",
  }));
}

const SNAP: MarketSnapshot = { riskRegime: "risk-on", regimeLabel: "Risk-On" };

const stripVolatile = (l: NetworkLayout) => ({
  key: l.key,
  boxes: [...l.boxes.values()].map(b => ({ ...b })),
  columns: l.columns,
});

// ── tests ───────────────────────────────────────────────────────────────────────

export async function runNetworkTests(): Promise<{ total: number; passed: number; failed: number; results: TestResult[] }> {
  const tests: Array<[string, () => void | Promise<void>]> = [];
  const test = (name: string, fn: () => void | Promise<void>) => tests.push([name, fn]);

  test("identical input yields identical model and layout", () => {
    const a = buildNetworkModel(themeSet(5), SNAP);
    const b = buildNetworkModel(themeSet(5), SNAP);
    assert(a.key === b.key, "model keys differ for identical input");
    const la = computeLayout(a, 960, 440), lb = computeLayout(b, 960, 440);
    assert(JSON.stringify(stripVolatile(la)) === JSON.stringify(stripVolatile(lb)),
      "layouts differ for identical input");
  });

  test("Date.now cannot change positions (no time in identity)", async () => {
    const a = buildNetworkModel(themeSet(4), SNAP);
    await new Promise(r => setTimeout(r, 25));
    const b = buildNetworkModel(themeSet(4), SNAP);
    assert(a.key === b.key, "model key changed with wall-clock time");
    assert(!a.key.includes(`${Date.now()}`.slice(0, 6)), "model key appears time-derived");
    const la = computeLayout(a, 960, 440), lb = computeLayout(b, 960, 440);
    for (const [id, box] of la.boxes) {
      const other = lb.boxes.get(id);
      assert(other && other.x === box.x && other.y === box.y, `position of ${id} moved across time`);
    }
  });

  test("no synthetic Market Center root by default", () => {
    const m = buildNetworkModel(themeSet(5), SNAP);
    assert(!m.nodes.some(n => n.id === "market" || n.kind === "event"),
      "synthetic market/event root present");
    // multiple aligned root drivers instead
    assert(m.nodes.filter(n => n.cls === "driver").length >= 1, "no driver roots");
  });

  test("node classes map to causally ordered columns (driver→theme→industry→asset)", () => {
    const m = buildNetworkModel(themeSet(5), SNAP);
    const l = computeLayout(m, 960, 440);
    const colX = new Map(l.columns.map(c => [c.cls, c.x]));
    const order = COLUMN_ORDER.filter(c => colX.has(c));
    for (let i = 1; i < order.length; i++)
      assert(colX.get(order[i - 1])! < colX.get(order[i])!, `column ${order[i]} not right of ${order[i - 1]}`);
    for (const n of m.nodes) {
      const b = l.boxes.get(n.id);
      assert(b && b.cls === n.cls, `node ${n.id} missing or misclassified in layout`);
    }
  });

  test("node insertion does not reshuffle surviving nodes (relative order stable)", () => {
    const before = computeLayout(buildNetworkModel(themeSet(4), SNAP), 960, 440);
    const after = computeLayout(buildNetworkModel(themeSet(5), SNAP), 960, 440);
    // themes keep their relative vertical order
    const orderOf = (l: typeof before) => [...l.boxes.values()]
      .filter(b => b.cls === "theme").sort((a, b) => a.y - b.y).map(b => b.id);
    const a = orderOf(before), b = orderOf(after).filter(id => a.includes(id));
    assert(JSON.stringify(a) === JSON.stringify(b), `theme order reshuffled: ${a} vs ${b}`);
  });

  test("boxes stay within canvas bounds", () => {
    for (const n of [1, 3, 6]) {
      const l = computeLayout(buildNetworkModel(themeSet(n), SNAP), 960, 440);
      for (const b of l.boxes.values()) {
        assert(b.x - b.w / 2 >= 0 && b.x + b.w / 2 <= 960, `${b.id} overflows horizontally`);
        assert(b.y - b.h / 2 >= 0 && b.y + b.h / 2 <= 440, `${b.id} overflows vertically`);
      }
    }
  });

  test("no node boxes overlap (sparse and dense)", () => {
    for (const n of [1, 2, 4, 6]) {
      const l = computeLayout(buildNetworkModel(themeSet(n), SNAP), 960, 440);
      const boxes = [...l.boxes.values()];
      for (let i = 0; i < boxes.length; i++)
        for (let j = i + 1; j < boxes.length; j++)
          assert(!boxesOverlap(boxes[i], boxes[j]),
            `${boxes[i].id} overlaps ${boxes[j].id} at n=${n}`);
    }
  });

  test("recorded and derived edges are distinguished honestly", () => {
    const m = buildNetworkModel(themeSet(4), SNAP);
    const byVerb = (v: string) => m.edges.filter(e => e.verb === v);
    // driver derivation is a heuristic → derived
    assert(byVerb("drives").filter(e => e.source.startsWith("drv:")).every(e => e.provenance === "derived"),
      "driver edges must be derived");
    // ontology relationship_weights → recorded
    const themeIndustry = m.edges.filter(e => e.source.startsWith("th:") && e.target.startsWith("sec:"));
    assert(themeIndustry.length > 0 && themeIndustry.every(e => e.provenance === "recorded"),
      "theme→industry edges with recorded ontology weights must be recorded");
    // curated related_assets / ThemeMemory sessions → recorded
    assert(byVerb("exposed_to").every(e => e.provenance === "recorded"),
      "exposure edges must be recorded");
    // negative recorded direction becomes `pressures`, never a renderer invention
    const m2 = buildNetworkModel(themeSet(5), SNAP);
    assert(m2.edges.some(e => e.verb === "pressures"), "negative ontology direction should yield pressures");
  });

  test("path tracing returns the full upstream+downstream chain", () => {
    const m = buildNetworkModel([theme()], SNAP);
    const th = m.nodes.find(n => n.cls === "theme")!;
    const path = tracePath(m, th.id);
    assert([...path.nodes].some(id => id.startsWith("drv:")), "trace missing upstream driver");
    assert([...path.nodes].some(id => id.startsWith("co:")), "trace missing downstream asset");
    const sec = m.nodes.find(n => n.cls === "industry")!;
    const secPath = tracePath(m, sec.id);
    assert(secPath.nodes.has(th.id), "industry trace missing upstream theme");
    // deterministic
    assert(JSON.stringify([...path.nodes].sort()) === JSON.stringify([...tracePath(m, th.id).nodes].sort()),
      "trace not deterministic");
  });

  test("reduced motion collapses transitions to zero duration", () => {
    assert(transitionMs(true) === 0, "reduced motion must disable transitions");
    assert(transitionMs(false) > 0 && transitionMs(false) <= 300, "transition must be short");
  });

  test("sparse graph (no usable themes) yields an empty, non-crashing model", () => {
    const m = buildNetworkModel([], SNAP);
    assert(m.nodes.length === 0 && m.edges.length === 0, "empty input must yield empty model");
    const l = computeLayout(m, 960, 440);
    assert(l.boxes.size === 0 && l.columns.length === 0, "empty layout expected");
  });

  test("fabricated replay is fully removed from the Feed hero", () => {
    const src = readFileSync(join(process.cwd(), "src/components/feed/ArgusMarketMap.tsx"), "utf-8");
    for (const forbidden of ["replayClock", "replayProgress", "Replay the day", "9:30", "startReplay"])
      assert(!src.includes(forbidden), `fabricated replay remnant found: ${forbidden}`);
    const graphSrc = readFileSync(join(process.cwd(), "src/components/network/IntelligenceNetwork.tsx"), "utf-8");
    assert(!graphSrc.includes("replay"), "new renderer must not carry replay state in M4.1");
  });

  test("resize preserves relative structure (column order and row order)", () => {
    const m = buildNetworkModel(themeSet(5), SNAP);
    const wide = computeLayout(m, 1200, 440), narrow = computeLayout(m, 700, 440);
    const orderOf = (l: NetworkLayout, cls: string) => [...l.boxes.values()]
      .filter(b => b.cls === cls).sort((a, b) => a.y - b.y).map(b => b.id);
    for (const cls of ["driver", "theme", "industry", "asset"])
      assert(JSON.stringify(orderOf(wide, cls)) === JSON.stringify(orderOf(narrow, cls)),
        `${cls} row order changed on resize`);
  });

  // ── M4.1A constellation tests ─────────────────────────────────────────────

  test("dominant node receives Tier 1 placement near the visual center", () => {
    const m = buildNetworkModel(themeSet(5), SNAP);
    const focal = focalNodeId(m);
    assert(focal, "no focal node");
    const focalNode = m.nodes.find(n => n.id === focal)!;
    const top = Math.max(...m.nodes.filter(n => n.cls === "theme").map(n => n.confidence ?? 0));
    assert(focalNode.confidence === top, "focal is not the highest-conviction theme");
    const l = computeLayout(m, 960, 440);
    const fb = l.boxes.get(focal!)!;
    assert(fb.tier === 1, "focal box is not tier 1");
    for (const b of l.boxes.values())
      if (b.cls === "theme" && b.id !== focal) assert(b.w * b.h < fb.w * fb.h, `theme ${b.id} outsizes the focal`);
    assert(Math.abs(fb.x - 960 / 2) < 960 * 0.32 && Math.abs(fb.y - 440 / 2) < 440 * 0.32,
      `focal not near center (${fb.x.toFixed(0)},${fb.y.toFixed(0)})`);
  });

  test("node tiers map consistently from canonical fields", () => {
    const m = buildNetworkModel(themeSet(4), SNAP);
    const focal = focalNodeId(m)!;
    for (const n of m.nodes) {
      const t = tierOf(n, n.id === focal);
      if (n.id === focal) assert(t === 1, "focal must be tier 1");
      else if (n.cls === "theme" || n.cls === "driver") assert(t === 2, `${n.cls} must be tier 2`);
      else if (n.cls === "industry") assert(t === 3, "industry must be tier 3");
      else assert(t === 4, "asset must be tier 4");
    }
  });

  test("assets form local constellations around their primary industry", () => {
    const m = buildNetworkModel(themeSet(5), SNAP);
    const l = computeLayout(m, 960, 440);
    const industries = [...l.boxes.values()].filter(b => b.cls === "industry");
    assert(industries.length >= 2, "need multiple industries for this test");
    const clusters = new Map<string, { xs: number[]; ys: number[] }>();
    for (const a of [...l.boxes.values()].filter(b => b.cls === "asset")) {
      const homeId = m.edges.filter(e => e.target === a.id && e.source.startsWith("sec:"))
        .sort((x, y) => y.strength - x.strength)[0]?.source;
      if (!homeId) continue;
      const home = l.boxes.get(homeId)!;
      const d = Math.hypot(a.x - home.x, a.y - home.y);
      assert(d <= 170, `${a.id} strayed ${d.toFixed(0)}px from its home ${homeId}`);
      assert(a.x > home.x - home.w / 2, `${a.id} not downstream of its home industry`);
      const c = clusters.get(homeId) ?? clusters.set(homeId, { xs: [], ys: [] }).get(homeId)!;
      c.xs.push(a.x); c.ys.push(a.y);
    }
    for (const [homeId, c] of clusters) {
      const home = l.boxes.get(homeId)!;
      const cx = c.xs.reduce((s, v) => s + v, 0) / c.xs.length;
      const cy = c.ys.reduce((s, v) => s + v, 0) / c.ys.length;
      assert(Math.hypot(cx - home.x, cy - home.y) <= 120,
        `cluster centroid of ${homeId} drifted from its hub`);
    }
  });

  test("content uses the canvas effectively and sparse graphs center", () => {
    const dense = computeLayout(buildNetworkModel(themeSet(5), SNAP), 960, 440);
    const db = contentBounds(dense);
    assert(Math.max(db.w / 960, db.h / 440) >= 0.7,
      `dense content underuses canvas (${(db.w / 960).toFixed(2)} x ${(db.h / 440).toFixed(2)})`);
    assert(Math.min(db.w / 960, db.h / 440) >= 0.45, "dense content too flat");
    const sparseL = computeLayout(buildNetworkModel(themeSet(1), SNAP), 960, 440);
    const sb = contentBounds(sparseL);
    const cx = sb.x + sb.w / 2, cy = sb.y + sb.h / 2;
    assert(Math.abs(cx - 480) < 960 * 0.15 && Math.abs(cy - 220) < 440 * 0.15,
      `sparse content not centered (${cx.toFixed(0)},${cy.toFixed(0)})`);
  });

  test("long theme names wrap with adequate node width", () => {
    // constructed directly: builder labels pass through cleanThemeName, which
    // canonicalizes most long strings — the layout must still handle the rest
    const m = buildNetworkModel([theme()], SNAP);
    const longLabel = "Institutional Duration Positioning Across Regional Bank Balance Sheets";
    m.nodes.filter(n => n.cls === "theme").forEach(n => { n.label = longLabel; });
    const l = computeLayout(m, 960, 440);
    const tb = [...l.boxes.values()].find(b => b.cls === "theme")!;
    assert(tb.lines.length === 2, `long name did not wrap (${tb.lines.length} lines: ${tb.lines})`);
    assert(tb.w >= 190, "tier-1 node too narrow for a long name");
    const wrapped = wrapLabel("Higher-for-Longer Duration Repricing", 11, 150, 2);
    assert(wrapped.lines.length === 2 && !wrapped.truncated, "wrapLabel should prefer wrapping over truncation");
  });

  test("stable nodes do not move materially after unrelated insertion", () => {
    const before = computeLayout(buildNetworkModel(themeSet(4), SNAP), 960, 440);
    const after = computeLayout(buildNetworkModel(themeSet(5), SNAP), 960, 440);
    for (const [id, b] of before.boxes) {
      if (b.cls !== "theme" && b.cls !== "driver") continue;
      const a = after.boxes.get(id);
      if (!a) continue;
      assert(Math.abs(a.x - b.x) < 960 * 0.22 && Math.abs(a.y - b.y) < 440 * 0.32,
        `${id} moved materially: (${b.x.toFixed(0)},${b.y.toFixed(0)}) → (${a.x.toFixed(0)},${a.y.toFixed(0)})`);
    }
  });

  test("renderer keeps the render-on-demand contract (no permanent loop)", () => {
    const src = readFileSync(join(process.cwd(), "src/components/network/IntelligenceNetwork.tsx"), "utf-8");
    assert(!src.includes("setInterval"), "renderer must not poll on an interval");
    assert(src.includes("if (animating)"), "continuation frames must be gated on active animation");
    assert(src.includes("prefers-reduced-motion"), "reduced motion must be honored");
    // constellation replaced the flowchart: no column rails/headers remain
    assert(!src.includes("col.label") && !src.includes("DRIVERS"), "column headers should be gone");
  });

  // ── M4.2: narrative-centered projection + inspector ───────────────────────

  const sec = <T,>(data: T | null, status = "live") => ({ status, data }) as { status: "live"; data: T };
  const makeNarrative = (memberNames: string[], coherence = 71) => ({
    version: 1, key: "drv-a+drv-b", label: "AI Capex + Power Demand",
    derived: true, generatedAt: 0,
    driverSet: sec(memberNames.length ? [
      { id: "drv-a", label: "AI Capex Supercycle", nodeType: "MacroFactor" },
      { id: "drv-b", label: "Power Load Growth", nodeType: "MacroFactor" },
    ] : []),
    members: sec(memberNames.map(l => ({ id: l, label: l, nodeType: "Theme", driverLinks: [] }))),
    exposure: sec(null), evidence: sec(null), forward: sec(null),
    coherence: sec({ score: coherence, sharedDriverStrength: 60, assetOverlap: null,
                     sectorOverlap: null, explanation: "structural overlap" }),
  }) as unknown as import("@/lib/narrativeDerivation").DerivedNarrative;

  test("dominant narrative projects as the single focal object", () => {
    const themes = themeSet(4);
    const narrative = makeNarrative(["Test Theme A", "Test Theme B"]);
    const m = buildNetworkModel(themes, SNAP, { narrative });
    const nars = m.nodes.filter(n => n.cls === "narrative");
    assert(nars.length === 1, `expected exactly one narrative node, got ${nars.length}`);
    const nar = nars[0];
    assert(focalNodeId(m) === nar.id, "narrative must be the focal object");
    assert(nar.coherence === 71, "narrative must carry coherence");
    assert(nar.confidence === undefined, "narrative must NOT carry a blended conviction");
    assert((nar.members ?? []).length === 2, "narrative must list member node ids");
    const memberEdges = m.edges.filter(e => e.verb === "member_of");
    assert(memberEdges.length === 2 && memberEdges.every(e => e.provenance === "derived"),
      "member_of edges must exist and be derived");
    assert(m.edges.some(e => e.verb === "drives" && e.target === nar.id),
      "driver-set edges must feed the narrative");
  });

  test("a one-theme narrative is a theme (never projected)", () => {
    const m = buildNetworkModel(themeSet(4), SNAP, { narrative: makeNarrative(["Test Theme A"]) });
    assert(m.nodes.every(n => n.cls !== "narrative"), "single-member narrative must not project");
    const focal = m.nodes.find(n => n.id === focalNodeId(m))!;
    assert(focal.cls === "theme", "fallback focal must be the top theme");
  });

  test("without a narrative the top theme honestly stands in as focal", () => {
    const m = buildNetworkModel(themeSet(4), SNAP);
    const focal = m.nodes.find(n => n.id === focalNodeId(m))!;
    assert(focal.cls === "theme" && focal.confidence === 80, "highest-conviction theme is focal");
  });

  test("member themes sit nearer the focal narrative than non-members", () => {
    const themes = themeSet(5);
    const m = buildNetworkModel(themes, SNAP, { narrative: makeNarrative(["Test Theme A", "Test Theme B"]) });
    const l = computeLayout(m, 960, 440);
    const nar = [...l.boxes.values()].find(b => b.cls === "narrative")!;
    assert(nar.tier === 1, "narrative must be tier 1");
    const narNode = m.nodes.find(n => n.cls === "narrative")!;
    const dist = (id: string) => {
      const b = l.boxes.get(id)!;
      return Math.hypot(b.x - nar.x, b.y - nar.y);
    };
    const memberD = (narNode.members ?? []).map(dist);
    const otherD = [...l.boxes.values()]
      .filter(b => b.cls === "theme" && !(narNode.members ?? []).includes(b.id))
      .map(b => dist(b.id));
    assert(memberD.length && otherD.length, "need both members and non-members");
    const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
    assert(avg(memberD) < avg(otherD),
      `members (${avg(memberD).toFixed(0)}) must sit nearer than non-members (${avg(otherD).toFixed(0)})`);
  });

  test("the dominant transmission chain spans driver → narrative → theme → industry → asset", () => {
    const m = buildNetworkModel(themeSet(4), SNAP, { narrative: makeNarrative(["Test Theme A", "Test Theme B"]) });
    const path = tracePath(m, focalNodeId(m)!);
    const classes = new Set([...path.nodes].map(id => m.nodes.find(n => n.id === id)?.cls));
    for (const cls of ["driver", "narrative", "theme", "industry", "asset"])
      assert(classes.has(cls as never), `dominant chain missing class ${cls}`);
  });

  test("representative chain is ordered, deterministic, and verb-annotated", async () => {
    const { representativeChain } = await import("./model");
    const m = buildNetworkModel(themeSet(4), SNAP, { narrative: makeNarrative(["Test Theme A", "Test Theme B"]) });
    const focal = focalNodeId(m)!;
    const chain = representativeChain(m, focal);
    assert(chain.length >= 4, `chain too short: ${chain.length}`);
    assert(chain[0].relationship === null, "anchor hop carries no incoming verb");
    assert(chain.slice(1).every(h => h.relationship !== null), "every downstream hop carries its verb");
    const order = chain.map(h => h.cls);
    assert(order[0] === "driver" && order.includes("narrative") && order[order.length - 1] === "asset",
      `chain order wrong: ${order}`);
    assert(JSON.stringify(chain) === JSON.stringify(representativeChain(m, focal)), "chain not deterministic");
  });

  test("entity UIDs map per class and never guess", async () => {
    const { entityUid } = await import("./inspector");
    const themes = themeSet(3);
    const m = buildNetworkModel(themes, SNAP);
    const themeNode = m.nodes.find(n => n.cls === "theme" && n.label === "Test Theme A")!;
    assert(entityUid(themeNode, themes) === "theme:ontology:theme-0", "theme uid must use the pipeline id");
    const asset = m.nodes.find(n => n.cls === "asset")!;
    assert(entityUid(asset, themes)?.startsWith("company:ticker:"), "asset uid must be company:ticker");
    const industry = m.nodes.find(n => n.cls === "industry")!;
    assert(entityUid(industry, themes)?.startsWith("industry:taxonomy:"), "industry uid must be taxonomy");
    const orphanTheme = { ...themeNode, label: "Unknown Theme X" };
    assert(entityUid(orphanTheme, themes) === null, "unmatched theme must return null, never guessed");
  });

  test("entity dossier projects sections honestly per class", async () => {
    const { buildEntityDossier } = await import("./inspector");
    const themes = themeSet(3).map((t, i) => i === 0
      ? { ...t, memory: { first_seen: "2026-06-30T09:00:00Z", sessions_observed: 41,
          confirming_total: 30, contradicting_total: 4, conviction_peak: 84,
          conviction_trough: 55 } as never } : t);
    const m = buildNetworkModel(themes, SNAP);
    const themeNode = m.nodes.find(n => n.cls === "theme" && n.label === "Test Theme A")!;
    const d = buildEntityDossier({ nodeId: themeNode.id, model: m, themes,
      historicalContext: { status: "insufficient_history",
        credibility: { met: false, gates: { min_archive_days: { required: 60, actual: 12, met: false } } } },
      calibration: null, predictions: [{ prediction_uid: "p", prediction_type: "conviction_threshold",
        statement: "Conviction expected to remain >= 77.", status: "resolved" }] })!;
    assert(d.scope === "entity" && d.identity.eyebrow.startsWith("THEME"), "theme identity eyebrow");
    assert(d.identity.figure?.label === "CONVICTION" && d.identity.figure.value === 80, "conviction figure");
    assert(d.reasoning.some(r => r.kind === "memory" && r.text.includes("30 vs 4")),
      "memory reasoning row must carry confirmation figures");
    assert(d.memory.state === "accruing" && d.memory.maturityLine.includes("12 of 60"),
      "gated maturity passes through verbatim");
    assert(d.memory.peak === 84 && d.memory.trough === 55, "conviction range from ThemeMemory");
    assert(d.ledger.items.length === 1 && d.ledger.items[0].status === "resolved",
      "per-entity ledger items project");
    assert(d.watch.length === 1, "theme dossier closes with a watch condition");
    assert(d.chain.length >= 3 && d.exposure !== null, "chain and exposure present");

    // an industry: no theme memory invented, linking themes explain it
    const industryNode = m.nodes.find(n => n.cls === "industry")!;
    const di = buildEntityDossier({ nodeId: industryNode.id, model: m, themes,
      historicalContext: null, calibration: null, predictions: [] })!;
    assert(di.memory.state === "none" && /No entity-level memory/i.test(di.memory.maturityLine),
      "non-theme memory states plain absence");
    assert(di.reasoning.length > 0 && di.reasoning.every(r => r.kind === "structure"),
      "industry reasoning = linking themes");
    assert(di.watch.length === 0, "no invented watch for non-themes");
  });

  test("inspector VM: honest memory maturity, never fabricated analogs", async () => {
    const { buildDominantInspector } = await import("./inspector");
    const read = {
      thesis: sec({ mode: "narrative", label: "AI Capex + Power Demand",
        thesisLine: "line", whyDominant: "Broadest recorded driver set.",
        coherence: { score: 71, explanation: "structural overlap" },
        contradiction: null,
        members: [{ name: "Test Theme A", conviction: 80, trend: "strengthening" }] }),
      evidence: sec([{ sourceClass: "story", assertion: "Power contracts signed", entity: "Test Theme A", reliability: null, strength: null }]),
      exposure: sec({ sectors: [], companies: [{ label: "NVDA", nodeType: "Company", memberCount: 2 }], other: [] }),
      chain: sec([{ label: "AI Capex", nodeType: "Macro", edge: null },
                  { label: "Utilities", nodeType: "Sector", edge: { relationship: "drives", strength: 70, trend: "stable" } }]),
      watch: sec([{ text: "Watch 10Y above 4.6", theme: "t", binding: "b", derived: true }]),
      falsifiers: sec({ invalidations: [{ text: "Power capex slows", theme: "t" }] }),
      priorities: sec(null), catalysts: sec(null), queue: sec(null),
    } as unknown as import("@/lib/theRead").ReadVM;
    const themes = [theme({ id: "theme-0", name: "Test Theme A",
      memory: { first_seen: "2026-06-30T09:00:00Z", sessions_observed: 41 } as never })];
    const story = { paragraph: "The market is repricing power.", watch: "w", movers: [], mode: "narrative" as const };
    const model = buildNetworkModel(themes, SNAP);
    const base = { read, story, themes, model, regimeLabel: "Risk-On" };

    const accruing = buildDominantInspector({
      ...base,
      historicalContext: { status: "insufficient_history",
        credibility: { met: false, gates: { min_archive_days: { required: 60, actual: 12, met: false } } } },
      calibration: null,
    })!;
    assert(accruing.scope === "dominant", "default dossier is dominant-scoped");
    assert(accruing.memory.state === "accruing", "gated history must read as accruing");
    assert(accruing.memory.maturityLine.includes("12 of 60"), "maturity line must state the real gate figures");
    assert(accruing.memory.sessions === 41 && accruing.memory.firstSeen !== null, "ThemeMemory facts pass through");
    assert(accruing.ledger.state === "unavailable", "null calibration must read unreachable");
    assert(accruing.lead === "The market is repricing power.", "lead must reuse the voiced story");
    assert(accruing.reasoning.some(r => r.kind === "structure" && r.text === "Broadest recorded driver set."),
      "whyDominant becomes a structured reasoning row");
    assert(accruing.reasoning.some(r => r.kind === "memory" && r.text.includes("conviction 80")),
      "member convictions become reasoning rows");
    assert(accruing.exposure !== null && accruing.exposure.companies.length > 0,
      "exposure projects from the model");
    assert(accruing.watch.length >= 1, "falsifiers close the dossier");
    assert(accruing.identity.archiveLine?.includes("41 sessions"), "identity carries archive age");

    const unreachable = buildDominantInspector({ ...base, historicalContext: null, calibration: null })!;
    assert(unreachable.memory.state === "unavailable"
      && /unreachable/i.test(unreachable.memory.maturityLine), "null context must read unreachable");

    const gated = buildDominantInspector({
      ...base, historicalContext: { status: "ok", episodes: [] },
      calibration: { ledger_enabled: true, open_predictions: 14,
        overall: { sample_size: 20, tested: 11, untested: 9, credible: false,
                   by_verdict: { confirmed: 9, contradicted: 2 } } },
    })!;
    assert(gated.ledger.state === "active" && gated.ledger.line.includes("14 open"),
      "active ledger must summarize itself");
    assert(gated.ledger.gateNote !== null && /no accuracy claim/i.test(gated.ledger.gateNote),
      "uncredible calibration must carry the diagnostics note");
  });

  // ── M5.1: one typography system, enforced ─────────────────────────────────

  test("no arbitrary font sizes — every size comes from the shared ramp", async () => {
    const { TYPE } = await import("./tokens");
    const ramp = new Set(Object.values(TYPE));
    const files = [
      "src/components/network/IntelligenceNetwork.tsx",
      "src/components/network/NetworkInspector.tsx",
      "src/components/feed/ArgusMarketMap.tsx",
    ];
    for (const f of files) {
      const src = readFileSync(join(process.cwd(), f), "utf-8");
      const arbitrary = src.match(/text-\[[0-9.]+px\]/g) ?? [];
      assert(arbitrary.length === 0, `${f} has arbitrary Tailwind sizes: ${arbitrary.slice(0, 4)}`);
      const rawCanvasFonts = src.match(/["'`]\d{3}? ?[0-9.]+px [^"'`]*(sans|mono)[^"'`]*["'`]/g) ?? [];
      assert(rawCanvasFonts.length === 0, `${f} has raw canvas font strings: ${rawCanvasFonts.slice(0, 3)}`);
    }
    // layout metrics fonts are on the ramp
    const layoutSrc = readFileSync(join(process.cwd(), "src/lib/network/layout.ts"), "utf-8");
    const metricFonts = [...layoutSrc.matchAll(/font: ([A-Z.]+|[0-9.]+)/g)].map(m => m[1]);
    assert(metricFonts.length > 0 && metricFonts.every(v => v.startsWith("TYPE.")),
      `layout metrics carry off-ramp fonts: ${metricFonts}`);
    assert(ramp.size === 6, "the ramp is exactly six steps");
  });

  const results: TestResult[] = [];
  for (const [name, fn] of tests) {
    try { await fn(); results.push({ name, ok: true }); }
    catch (e) { results.push({ name, ok: false, detail: e instanceof Error ? e.message : String(e) }); }
  }
  const passed = results.filter(r => r.ok).length;
  return { total: results.length, passed, failed: results.length - passed, results };
}

// Allow direct execution: `npx tsx src/lib/network/networkTests.ts`
const proc = (globalThis as { process?: { argv?: string[]; exit?: (code: number) => void } }).process;
if (proc && Array.isArray(proc.argv) && /networkTests\.(ts|js)$/.test(proc.argv[1] ?? "")) {
  runNetworkTests().then(summary => {
    for (const r of summary.results) console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.name}${r.detail ? "  :: " + r.detail : ""}`);
    console.log(`\n${summary.passed}/${summary.total} passed`);
    proc.exit?.(summary.failed ? 1 : 0);
  });
}
