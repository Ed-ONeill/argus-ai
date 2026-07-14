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
