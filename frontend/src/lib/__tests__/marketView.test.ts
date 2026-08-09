// Market surface (Surface #4) measurement + View Model. The critical proof: this is a
// ROTATION map, not a heatmap — a block can rise in absolute terms while LOSING leadership,
// and fall in absolute terms while GAINING it. Also: whole-market leadership is normalized so
// volatility can't dominate; sector leadership is relative to SPY; the View Model exposes NO
// engine vocabulary and never explains causes. Pure, node-env.

import { describe, expect, it } from "vitest";

import type { PricePoint } from "@/lib/platform/types/prices";
import { measureCrossAsset, measureSector } from "@/lib/marketRotation";
import { buildMarketView, type BlockInput } from "@/lib/marketView";
import type { MarketBlock } from "@/lib/marketBlocks";

// build a windowed PriceSeries points array from adjClose values (t is ignored by measurement)
const pts = (vals: number[]): PricePoint[] =>
  vals.map((c, i) => ({ t: `2026-02-${String(i + 1).padStart(2, "0")}`, o: c, h: c, l: c, c, adjClose: c, v: 100 }));

// ── divergence fixtures (8 points → halves of 4/5, sharing the midpoint) ──
// X: rises hard early, flat late → UP overall but leadership fades as peers accelerate.
const X_UP_LOSING = pts([100, 108, 116, 124, 124, 125, 124, 125]);
const Y_LATE = pts([100, 101, 100, 101, 101, 110, 120, 132]);
const Z_LATE = pts([100, 100, 101, 100, 100, 112, 124, 138]);
// W: falls hard early, flat late → DOWN overall but leadership improves as peers roll over.
const W_DOWN_GAINING = pts([100, 94, 88, 82, 82, 83, 82, 83]);
const P_LATE_CRASH = pts([100, 101, 100, 101, 101, 92, 84, 76]);
const Q_LATE_CRASH = pts([100, 100, 101, 100, 100, 90, 82, 74]);

describe("cross-asset rotation measurement — relative-first, not absolute", () => {
  it("CASE A: an asset RISING in absolute terms can be FALLING in leadership", () => {
    const [x] = measureCrossAsset([X_UP_LOSING, Y_LATE, Z_LATE]);
    expect(x.absPct).toBeGreaterThan(0);          // price rose
    expect(x.direction).toBe("falling");          // but leadership faded
  });

  it("CASE B: an asset FALLING in absolute terms can be RISING in leadership", () => {
    const [w] = measureCrossAsset([W_DOWN_GAINING, P_LATE_CRASH, Q_LATE_CRASH]);
    expect(w.absPct).toBeLessThan(0);             // price fell
    expect(w.direction).toBe("rising");           // but leadership improved
  });

  it("normalizes so volatility cannot dominate: equal absolute return, steadier asset leads", () => {
    const smooth = pts([100, 102, 104, 106, 108, 110]);          // +10%, low volatility
    const wild = pts([100, 120, 90, 125, 85, 110]);              // +10%, high volatility
    const [s, h] = measureCrossAsset([smooth, wild]);
    expect(Math.round(s.absPct)).toBe(Math.round(h.absPct));      // same absolute return (~10%)
    expect(s.relStrength).toBeGreaterThan(h.relStrength);         // yet the steadier asset leads
  });

  it("degrades per block: an absent series is marked absent, others still measured", () => {
    const r = measureCrossAsset([X_UP_LOSING, null, Z_LATE]);
    expect(r[1].absent).toBe(true);
    expect(r[0].absent).toBe(false);
    expect(r[2].absent).toBe(false);
  });
});

describe("sector rotation measurement — relative to SPY", () => {
  const SPY = pts([100, 101, 102, 103, 104, 106, 108, 110]);
  it("CASE C: a sector UP in absolute terms can be LOSING leadership vs SPY", () => {
    const sec = measureSector(pts([100, 104, 108, 112, 112, 112, 113, 113]), SPY);
    expect(sec.absPct).toBeGreaterThan(0);
    expect(sec.direction).toBe("falling");
  });
  it("CASE D: a sector DOWN in absolute terms can be GAINING leadership vs SPY", () => {
    const sec = measureSector(pts([100, 95, 90, 86, 86, 88, 89, 90]), SPY);
    expect(sec.absPct).toBeLessThan(0);
    expect(sec.direction).toBe("rising");
  });
  it("is absent when the sector or the benchmark series is missing", () => {
    expect(measureSector(null, SPY).absent).toBe(true);
    expect(measureSector(SPY, null).absent).toBe(true);
  });
});

// ── View Model — the Rotation Map is the product ──
const block = (over: Partial<MarketBlock> & { id: string; label: string }): MarketBlock => ({
  symbol: over.id.toUpperCase(), exchange: "US", kind: "asset-class", bucket: "cyclical", ...over,
});
// The View Model fetches 2x the window and splits it; so a buildMarketView fixture is
// [previous half, current half]. The current half is what the map measures.
const FLAT8 = [100, 100, 100, 100, 100, 100, 100, 100];
const V = { X: [100, 108, 116, 124, 124, 125, 124, 125], Y: [100, 101, 100, 101, 101, 110, 120, 132], Z: [100, 100, 101, 100, 100, 112, 124, 138] };
const dbl = (cur: number[], prev: number[] = FLAT8): number[] => [...prev, ...cur];
const wholeMarket = (blocks: BlockInput[]) => buildMarketView({ zoom: "whole-market", window: "1M", blocks, benchmark: null });

describe("buildMarketView — the Rotation Map is the product", () => {
  const B = [
    { block: block({ id: "oil", label: "Oil", bucket: "cyclical" }), points: pts(dbl(V.X)) },
    { block: block({ id: "stocks", label: "Stocks", bucket: "cyclical" }), points: pts(dbl(V.Y)) },
    { block: block({ id: "gold", label: "Gold", bucket: "defensive" }), points: pts(dbl(V.Z)) },
  ];

  it("puts the up-but-losing block in the falling column (rotation, not heatmap)", () => {
    const v = wholeMarket(B);
    expect(v.visualization.kind).toBe("rotation-map");
    if (v.visualization.kind !== "rotation-map") throw new Error("unreachable");
    expect(v.visualization.falling.map((r) => r.id)).toContain("oil");
  });

  it("has exactly four sections — Leading & Lagging is gone", () => {
    const v = wholeMarket(B);
    expect(v).not.toHaveProperty("leading");
    expect(v).not.toHaveProperty("lagging");
    expect(Object.keys(v).sort()).toEqual(["posture", "visualization", "whatChanged", "whatCouldChange", "window", "zoom"]);
  });

  it("routes asset-class blocks to in-surface focus, never to a proxy ETF page", () => {
    const v = wholeMarket(B);
    if (v.visualization.kind !== "rotation-map") throw new Error("unreachable");
    for (const r of [...v.visualization.rising, ...v.visualization.falling, ...v.visualization.steady]) {
      expect(r.nav.kind).toBe("focus-block");
    }
  });

  it("routes sectors to sector/industry depth, measured relative to SPY", () => {
    const v = buildMarketView({
      zoom: "inside-stocks", window: "1M", benchmark: pts(dbl([100, 101, 102, 103, 104, 106, 108, 110])),
      blocks: [
        { block: block({ id: "tech", label: "Technology", kind: "sector", navSlug: "technology" }), points: pts(dbl([100, 104, 108, 112, 112, 112, 113, 113])) },
        { block: block({ id: "utilities", label: "Utilities", kind: "sector", bucket: "defensive", navSlug: "utilities" }), points: pts(dbl([100, 99, 100, 101, 103, 106, 108, 111])) },
      ],
    });
    if (v.visualization.kind !== "rotation-map") throw new Error("unreachable");
    const tech = [...v.visualization.rising, ...v.visualization.falling, ...v.visualization.steady].find((r) => r.id === "tech")!;
    expect(tech.nav).toEqual({ kind: "sector", id: "tech", slug: "technology" });
  });

  it("headline is a faithful caption of the map — 'led by' names a GAINING block, never a losing one", () => {
    const v = wholeMarket(B);
    if (v.visualization.kind !== "rotation-map") throw new Error("unreachable");
    const led = v.visualization.rising[0]?.label;
    if (led) expect(v.posture.sentence).toContain(`led by ${led}`);
    for (const f of v.visualization.falling.map((r) => r.label)) {
      expect(v.posture.sentence).not.toContain(`led by ${f}`);
    }
  });

  it("ONE definition of leadership: the log speaks the map's language and can never contradict a column", () => {
    const oil = pts([...V.Y, ...V.X]);    // prev rising, cur falling  -> reversed lower  (Losing column)
    const stk = pts([...V.X, ...V.Y]);    // prev falling, cur rising  -> reversed higher (Gaining column)
    const gld = pts([...V.Z, ...V.Z]);    // steady
    const v = wholeMarket([
      { block: block({ id: "oil", label: "Oil" }), points: oil },
      { block: block({ id: "stocks", label: "Stocks" }), points: stk },
      { block: block({ id: "gold", label: "Gold", bucket: "defensive" }), points: gld },
    ]);
    if (v.visualization.kind !== "rotation-map") throw new Error("unreachable");
    const joined = v.whatChanged.join(" ");
    expect(joined).not.toMatch(/entered|dropped out/i);        // the second (level) model is gone
    expect(joined).toMatch(/reversed (higher|lower)|began (improving|fading)|continued (improving|fading)/);
    expect(joined).not.toMatch(/because|due to|driven by/i);   // transitions, never causes
    // Every log line agrees with the column its block sits in — one definition of leadership.
    const rising = v.visualization.rising.map((r) => r.label);
    const falling = v.visualization.falling.map((r) => r.label);
    for (const label of ["Oil", "Stocks", "Gold"]) {
      const line = v.whatChanged.find((l) => l.startsWith(label));
      if (!line) continue;
      if (/improving|reversed higher/.test(line)) expect(rising).toContain(label);
      if (/fading|reversed lower/.test(line)) expect(falling).toContain(label);
    }
  });

  it("reads like an editorial log: an unchanged leadership picture reports no continuation noise", () => {
    // Prices move (NOT a quiet tape) but the leadership picture is identical to the prior
    // observation, so no state change and no MATERIAL continuation fires — nothing to report.
    const same = (v: number[]) => pts([...v, ...v]);
    const v = wholeMarket([
      { block: block({ id: "a", label: "Alpha" }), points: same([100, 101, 102, 103, 104, 105, 106, 107]) },
      { block: block({ id: "b", label: "Beta" }), points: same(FLAT8) },
      { block: block({ id: "c", label: "Gamma" }), points: same([100, 99, 98, 97, 96, 95, 94, 93]) },
    ]);
    expect(v.whatChanged).toEqual(["No leadership changes since the prior month."]);
  });

  it("degrades per block: one missing series still yields a rotation-map, block marked unavailable", () => {
    const v = wholeMarket([B[0], B[1], { block: block({ id: "dollar", label: "US Dollar", bucket: "defensive" }), points: null }]);
    expect(v.visualization.kind).toBe("rotation-map");
    if (v.visualization.kind !== "rotation-map") throw new Error("unreachable");
    expect(v.visualization.unavailable.map((r) => r.id)).toEqual(["dollar"]);
  });

  it("is honestly empty when fewer than two blocks have data", () => {
    const v = wholeMarket([B[0], { block: block({ id: "gold", label: "Gold" }), points: null }]);
    expect(v.visualization).toEqual({ kind: "none" });
    expect(v.posture.tone).toBe("unavailable");
    expect(v.posture.sentence).toBe("Market data is unavailable right now.");
  });

  it("quiet tape: stable headline, map all 'little changed', and NO manufactured transitions", () => {
    const flat = (n: number) => pts([100, 100.1, 100.2, 100.1, 100.2, 100.3, 100.2, 100.1 + n]);
    const v = wholeMarket([
      { block: block({ id: "oil", label: "Oil" }), points: flat(0.1) },
      { block: block({ id: "stocks", label: "Stocks" }), points: flat(0.2) },
      { block: block({ id: "gold", label: "Gold", bucket: "defensive" }), points: flat(0.05) },
    ]);
    expect(v.posture.tone).toBe("quiet");
    expect(v.posture.sentence).toBe("Market leadership is broadly stable.");
    if (v.visualization.kind !== "rotation-map") throw new Error("unreachable");
    expect(v.visualization.rising).toEqual([]);
    expect(v.visualization.falling).toEqual([]);
    expect(v.visualization.steady.length).toBeGreaterThan(0);
    expect(v.whatChanged).toEqual(["No leadership changes since the prior month."]);
  });

  it("phrases posture as price LEADERSHIP only — never broader market understanding", () => {
    const s = wholeMarket(B).posture.sentence.toLowerCase();
    expect(s).toContain("leadership");
    for (const overclaim of ["the market is", "the market was", "risk appetite", "barely moved", "defensive market", "risk-on market"]) {
      expect(s, `overclaimed: ${overclaim}`).not.toContain(overclaim);
    }
  });

  it("exposes NO engine vocabulary and never names the regime", () => {
    const v = wholeMarket(B);
    const json = JSON.stringify(v).toLowerCase();
    for (const banned of ["theme", "conviction", "transmission", "momentum", "signal", "regime", "lifecycle", "thesis", "ledger", "breadth", "narrative", "evidence engine", "provenance"]) {
      expect(json, `leaked ${banned}`).not.toContain(banned);
    }
  });
});
