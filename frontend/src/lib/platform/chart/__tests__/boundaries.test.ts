// Stage 1B(a) — architectural boundary regressions (Workstation Reuse Law, one-chart
// principle, no-network, single-renderer). Reads the chart source and enforces the
// contract structurally so a later surface can never quietly couple the primitive to a
// product, fork the renderer, add a charting dependency, or make it fetch.

import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";

const CHART_DIR = dirname(dirname(fileURLToPath(import.meta.url)));  // .../platform/chart

function sourceFiles(): { name: string; text: string }[] {
  return readdirSync(CHART_DIR)
    .filter((f) => (f.endsWith(".ts") || f.endsWith(".tsx")) && !f.endsWith(".d.ts"))
    .map((f) => ({ name: f, text: readFileSync(join(CHART_DIR, f), "utf8") }));
}

function importSpecifiers(text: string): string[] {
  const out: string[] = [];
  const re = /\b(?:import|export)\b[^;]*?\bfrom\s*["']([^"']+)["']/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) out.push(m[1]);
  // bare side-effect imports
  const re2 = /\bimport\s*["']([^"']+)["']/g;
  while ((m = re2.exec(text))) out.push(m[1]);
  return out;
}

const FILES = sourceFiles();

describe("chart platform boundaries", () => {
  it("has source files to check", () => {
    expect(FILES.length).toBeGreaterThanOrEqual(6);
  });

  it("imports ONLY react, @/lib/platform, or relative modules (product-agnostic reuse)", () => {
    const ALLOWED = (spec: string) =>
      spec === "react" ||
      spec.startsWith("react/") ||
      spec.startsWith("react-dom") ||
      spec.startsWith("@/lib/platform") ||
      spec.startsWith("./") ||
      spec.startsWith("../") ||
      spec.startsWith("node:");   // test-only files are excluded from FILES anyway
    for (const f of FILES) {
      for (const spec of importSpecifiers(f.text)) {
        expect(ALLOWED(spec), `${f.name} imports forbidden module: ${spec}`).toBe(true);
      }
    }
  });

  it("never imports a product surface (brief/feed/drawer/entity/intelligence/map/app)", () => {
    // Checked against IMPORT SPECIFIERS only — navigation-target enum values like
    // "marketMap"/"briefSection" are legitimate contract vocabulary, not imports.
    const FORBIDDEN = [
      "components/", "@/components", "@/app", "app/api", "/app/",
      "intelligenceGraph", "marketMap", "morningBrief", "livingBrief",
      "useMarketData", "useFeed", "MarketMap", "MorningBrief", "hooks/",
    ];
    for (const f of FILES) {
      for (const spec of importSpecifiers(f.text)) {
        for (const bad of FORBIDDEN) {
          expect(spec.includes(bad), `${f.name} imports ${spec} (matches ${bad})`).toBe(false);
        }
      }
    }
  });

  it("uses NO external charting library", () => {
    const LIBS = [
      "d3", "recharts", "lightweight-charts", "chart.js", "chartjs", "@visx", "visx",
      "victory", "echarts", "plotly", "apexcharts", "highcharts", "@nivo", "react-sparklines",
    ];
    for (const f of FILES) {
      for (const spec of importSpecifiers(f.text)) {
        expect(LIBS.includes(spec) || LIBS.some((l) => spec.startsWith(`${l}/`)), `${f.name} pulls ${spec}`).toBe(false);
      }
    }
  });

  it("never fetches or calls a provider/hook directly (data comes in as a prop)", () => {
    for (const f of FILES) {
      expect(f.text.includes("fetch("), `${f.name} calls fetch`).toBe(false);
      expect(f.text.includes("XMLHttpRequest"), `${f.name} uses XHR`).toBe(false);
      expect(f.text.includes("useSeries"), `${f.name} calls useSeries`).toBe(false);
      expect(f.text.includes("useQuery"), `${f.name} calls useQuery`).toBe(false);
    }
  });

  it("has exactly ONE canvas renderer (the single ArgusChart component)", () => {
    const withContext = FILES.filter((f) => f.text.includes("getContext("));
    expect(withContext.map((f) => f.name)).toEqual(["ArgusChart.tsx"]);
  });

  it("all presets flow through the single renderer (no preset draws anything)", () => {
    const presets = FILES.find((f) => f.name === "presets.ts")!;
    expect(presets.text.includes("getContext(")).toBe(false);
    expect(presets.text.includes("<canvas")).toBe(false);
  });

  it("reserves dimensions (no-layout-shift contract anchored in the component)", () => {
    const comp = FILES.find((f) => f.name === "ArgusChart.tsx")!;
    expect(comp.text.includes("height: cfg.height")).toBe(true);
    expect(comp.text.includes("minHeight: cfg.minHeight")).toBe(true);
  });
});
