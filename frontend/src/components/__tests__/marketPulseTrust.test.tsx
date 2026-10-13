// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MarketPulse } from "@/components/brief/MarketPulse";
vi.mock("@/lib/platform/hooks/useSeries", () => ({ useSeries: (symbol: string) => ({
  isLoading: false, stale: false,
  series: symbol === "IBIT" ? { symbol, exchange: "US", adjusted: true, asOf: "2026-10-13",
    quality: { freshness: "delayed", grade: "DELAYED" },
    points: [{ t: "2026-10-08", adjClose: 46 }, { t: "2026-10-09", adjClose: 46.86 }],
  } : null,
}) }));
vi.mock("@/lib/platform/chart", () => ({ ArgusChart: ({ ariaLabel }: { ariaLabel: string }) => <div role="img" aria-label={ariaLabel} /> }));
afterEach(cleanup);
it("identifies the IBIT share price and its date even when SPY is unavailable", () => {
  render(<MarketPulse />);
  expect(screen.getByText("IBIT · ETF")).toBeTruthy();
  expect(screen.getByText("Bitcoin proxy")).toBeTruthy();
  expect(screen.getByText("$46.86")).toBeTruthy();
  expect(screen.getByText("Adjusted close · USD/share")).toBeTruthy();
  expect(screen.getByText("As of 2026-10-09 UTC")).toBeTruthy();
  expect(screen.getAllByText("Price unavailable")).toHaveLength(7);
  expect(screen.getByRole("img").getAttribute("aria-label")).toContain("IBIT ETF adjusted close history");
});
