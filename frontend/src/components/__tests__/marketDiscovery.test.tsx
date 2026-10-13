// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MarketInspector } from "@/components/markets/MarketInspector";
import { RotationMap } from "@/components/markets/RotationMap";
import type { RotationBlock } from "@/lib/marketView";
import type { PriceSeries } from "@/lib/platform/types/prices";

vi.mock("@/lib/platform/chart", () => ({ ArgusChart: ({ series }: { series: PriceSeries }) => <div data-testid="history">{series.points.map(p => p.t).join(",")}</div> }));
afterEach(cleanup);
const block: RotationBlock = { id: "stocks", label: "Stocks", kind: "asset-class", bucket: "cyclical", relStrength: 1, direction: "falling", leadDelta: -0.2, absPct: 5, absent: false, nav: { kind: "focus-block", id: "stocks" } };
const series = { symbol: "SPY", exchange: "US", adjusted: true, asOf: "2026-10-13", quality: { freshness: "stale", grade: "STALE" }, points: Array.from({ length: 8 }, (_, i) => ({ t: `2026-10-${String(i + 1).padStart(2, "0")}`, adjClose: 100 + i })) } as PriceSeries;

it("explains losing leadership with a positive price change using only the current observation", () => {
  render(<MarketInspector block={block} series={series} zoom="whole-market" state="Losing leadership" stale={false} />);
  expect(screen.getByText("Losing leadership")).toBeTruthy();
  expect(screen.getByText("+5.00%")).toBeTruthy();
  expect(screen.getByText("-0.20 score")).toBeTruthy();
  expect(screen.getByTestId("history").textContent).toBe("2026-10-05,2026-10-06,2026-10-07,2026-10-08");
  expect(screen.getByText(/Marked stale/)).toBeTruthy();
  expect(screen.getByText(/A rising price can still lose leadership/)).toBeTruthy();
});

it("converts sector leadership changes to percentage points and offers explicit depth navigation", () => {
  const sector = { ...block, label: "Technology", kind: "sector", leadDelta: 0.012, nav: { kind: "sector", id: "tech", slug: "software" } } as RotationBlock;
  render(<MarketInspector block={sector} series={null} zoom="inside-stocks" state="Gaining leadership" stale={false} />);
  expect(screen.getByText("+1.20 pp")).toBeTruthy();
  expect(screen.getByText("Observation dates unavailable")).toBeTruthy();
  expect(screen.getByRole("link", { name: /Explore related industry/ }).getAttribute("href")).toBe("/industries/software");
});

it("selection is accessible and passes the actual block without treating price sign as leadership", () => {
  const select = vi.fn();
  render(<RotationMap viz={{ kind: "rotation-map", zoom: "whole-market", window: "1M", rising: [], falling: [block], steady: [], unavailable: [] }} onSelect={select} focusedId="stocks" />);
  const tile = screen.getByRole("button", { name: /Stocks/ });
  expect(tile.getAttribute("aria-pressed")).toBe("true");
  fireEvent.click(tile);
  expect(select).toHaveBeenCalledWith(block);
  expect(screen.getByText("+5.0%")).toBeTruthy();
  expect(screen.getByText("Losing leadership")).toBeTruthy();
});
