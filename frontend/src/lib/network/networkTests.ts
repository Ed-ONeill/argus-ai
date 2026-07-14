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
import { computeLayout, boxesOverlap, COLUMN_ORDER, type NetworkLayout } from "./layout";
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
