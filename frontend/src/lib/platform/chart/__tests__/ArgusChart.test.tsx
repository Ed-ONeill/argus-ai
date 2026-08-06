// @vitest-environment happy-dom
// Stage 1B(a) — <ArgusChart> rendering behavior: honest absence, real-series drawing,
// DataQuality labeling, non-live-never-live styling, reduced-motion, ResizeObserver,
// high-DPI canvas sizing, and no network. Canvas 2D is mocked (happy-dom has no raster
// context); we assert the draw contract, not pixels.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, waitFor } from "@testing-library/react";

import type { PricePoint, PriceSeries } from "@/lib/platform/types/prices";
import { makeQuality, type QualityGrade } from "@/lib/platform/quality";
import { ArgusChart } from "@/lib/platform/chart/ArgusChart";

// ── fixtures ──
function pt(t: string, c: number, adj = c): PricePoint {
  return { t, o: c, h: c, l: c, c, adjClose: adj, v: 100 };
}
function makeSeries(grade: QualityGrade = "DELAYED", delayMs = 60_000): PriceSeries {
  return {
    symbol: "AAPL",
    exchange: "US",
    points: [pt("2026-07-27", 100, 50), pt("2026-07-28", 104, 52), pt("2026-07-29", 108, 54)],
    adjusted: true,
    asOf: "2026-07-29",
    quality: makeQuality("eodhd", "2026-08-01T00:00:00.000Z", { grade, delayMs }),
  };
}

// ── canvas 2D stub ──
function installCanvas() {
  const calls = { stroke: 0, fill: 0, arc: 0, clear: 0, setTransform: 0 };
  const ctx = {
    setTransform: vi.fn(() => { calls.setTransform++; }),
    clearRect: vi.fn(() => { calls.clear++; }),
    save: vi.fn(), restore: vi.fn(), beginPath: vi.fn(), rect: vi.fn(), clip: vi.fn(),
    moveTo: vi.fn(), lineTo: vi.fn(), closePath: vi.fn(),
    stroke: vi.fn(() => { calls.stroke++; }),
    fill: vi.fn(() => { calls.fill++; }),
    arc: vi.fn(() => { calls.arc++; }),
    createLinearGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
    strokeStyle: "", fillStyle: "", lineWidth: 0, lineJoin: "", lineCap: "",
  };
  HTMLCanvasElement.prototype.getContext = vi.fn(() => ctx) as unknown as HTMLCanvasElement["getContext"];
  return calls;
}

let observeCalls = 0;
function setup({ reduce = true, dpr = 1, width = 200, height = 40 } = {}) {
  observeCalls = 0;
  class RO {
    constructor(private cb: () => void) {}
    observe() { observeCalls++; }
    unobserve() {}
    disconnect() {}
  }
  vi.stubGlobal("ResizeObserver", RO as unknown as typeof ResizeObserver);
  window.matchMedia = vi.fn().mockImplementation((q: string) => ({
    matches: reduce, media: q, onchange: null,
    addEventListener: vi.fn(), removeEventListener: vi.fn(), addListener: vi.fn(), removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia;
  Object.defineProperty(window, "devicePixelRatio", { value: dpr, configurable: true });
  Object.defineProperty(HTMLElement.prototype, "getBoundingClientRect", {
    configurable: true,
    value: () => ({ width, height, top: 0, left: 0, right: width, bottom: height, x: 0, y: 0, toJSON() {} }),
  });
}

beforeEach(() => { setup(); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("honest absence", () => {
  it("renders no canvas and an honest label when there is no series", () => {
    installCanvas();
    const { container } = render(<ArgusChart series={null} />);
    const root = container.querySelector("[data-argus-chart]")!;
    expect(root.getAttribute("data-absent")).toBe("true");
    expect(container.querySelector("canvas")).toBeNull();
    expect(root.getAttribute("aria-label")).toContain("unavailable");
  });

  it("renders absent for a malformed series with no plottable points", () => {
    installCanvas();
    const bad = makeSeries();
    bad.points = [{ ...pt("2026-07-28", 1), adjClose: Number.NaN }];
    const { container } = render(<ArgusChart series={bad} />);
    expect(container.querySelector("[data-argus-chart]")!.getAttribute("data-absent")).toBe("true");
  });

  it("reserves the same height whether present or absent (no layout shift)", () => {
    installCanvas();
    const a = render(<ArgusChart series={null} config={{ height: 40 }} />);
    const absentH = (a.container.querySelector("[data-argus-chart]") as HTMLElement).style.height;
    cleanup();
    const b = render(<ArgusChart series={makeSeries()} config={{ height: 40 }} />);
    const presentH = (b.container.querySelector("[data-argus-chart]") as HTMLElement).style.height;
    expect(absentH).toBe("40px");
    expect(presentH).toBe("40px");
  });
});

describe("drawing a real series", () => {
  it("draws the path from the real series (stroke called)", async () => {
    const calls = installCanvas();
    render(<ArgusChart series={makeSeries()} />);
    await waitFor(() => expect(calls.stroke).toBeGreaterThan(0));
    expect(calls.clear).toBeGreaterThan(0);
  });

  it("scales the canvas for high-DPI (backing store = css size x dpr)", async () => {
    installCanvas();
    setup({ reduce: true, dpr: 2, width: 200, height: 40 });
    installCanvas();
    const { container } = render(<ArgusChart series={makeSeries()} />);
    await waitFor(() => {
      const c = container.querySelector("canvas") as HTMLCanvasElement;
      expect(c.width).toBe(400);   // 200 css x dpr 2
      expect(c.height).toBe(80);
    });
  });

  it("observes its container for responsive resizing", () => {
    installCanvas();
    render(<ArgusChart series={makeSeries()} />);
    expect(observeCalls).toBe(1);
  });
});

describe("DataQuality labeling (honesty)", () => {
  it("shows a non-live grade label and never live styling for delayed data", async () => {
    installCanvas();
    const { container } = render(<ArgusChart series={makeSeries("DELAYED", 60_000)} />);
    await waitFor(() => {
      const q = container.querySelector("[data-quality]");
      expect(q?.getAttribute("data-quality")).toBe("Delayed");
      expect(q?.getAttribute("data-live")).toBe("false");
    });
  });

  it("labels a stale series as Stale, not live", async () => {
    installCanvas();
    const { container } = render(<ArgusChart series={makeSeries("STALE", 9_999_999)} />);
    await waitFor(() => {
      expect(container.querySelector("[data-quality]")?.getAttribute("data-quality")).toBe("Stale");
    });
  });

  it("draws NO live dot for non-live data (arc never called)", async () => {
    const calls = installCanvas();
    render(<ArgusChart series={makeSeries("DELAYED", 60_000)} />);
    await waitFor(() => expect(calls.stroke).toBeGreaterThan(0));
    expect(calls.arc).toBe(0);   // the live affordance is gated on genuine liveness
  });
});

describe("reduced motion", () => {
  it("paints immediately and does not start an animation loop when reduce is set", async () => {
    setup({ reduce: true });
    const calls = installCanvas();
    const raf = vi.fn();
    vi.stubGlobal("requestAnimationFrame", raf);
    render(<ArgusChart series={makeSeries()} />);
    await waitFor(() => expect(calls.stroke).toBeGreaterThan(0));
    expect(raf).not.toHaveBeenCalled();
  });

  it("uses the animation path when motion is allowed", async () => {
    setup({ reduce: false });
    installCanvas();
    const raf = vi.fn().mockReturnValue(1);   // does not invoke the callback (no recursion)
    vi.stubGlobal("requestAnimationFrame", raf);
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    render(<ArgusChart series={makeSeries()} />);
    await waitFor(() => expect(raf).toHaveBeenCalled());
  });
});

describe("no network / no provider", () => {
  it("never calls fetch", async () => {
    const calls = installCanvas();
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    render(<ArgusChart series={makeSeries()} />);
    await waitFor(() => expect(calls.stroke).toBeGreaterThan(0));
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("accessibility summary", () => {
  it("labels direction and magnitude without relying on color", () => {
    installCanvas();
    const { container } = render(<ArgusChart series={makeSeries()} />);
    const label = container.querySelector("[data-argus-chart]")!.getAttribute("aria-label")!;
    expect(label).toContain("AAPL");
    expect(label).toContain("up");
    expect(label).toMatch(/percent/);
  });
});
