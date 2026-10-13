// @vitest-environment happy-dom
import { afterEach, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { IndustryGuide } from "@/components/industries/IndustryGuide";
import { INDUSTRIES } from "@/lib/industryConfig";
import { INDUSTRY_GUIDES } from "@/lib/industryGuides";
import type { StoryCluster } from "@/lib/types";
afterEach(cleanup);

it.each(INDUSTRIES)("provides a usable distinct guide for $slug even without reporting", industry => {
  const guide = INDUSTRY_GUIDES[industry.slug];
  expect(guide).toBeTruthy();
  expect(guide.segments).toHaveLength(3);
  expect(guide.measures).toHaveLength(3);
  render(<IndustryGuide industry={industry} clusters={[]} />);
  expect(screen.getByRole("region", { name: `Understand ${industry.name}` })).toBeTruthy();
  expect(screen.getByText(/No matched reporting is available/)).toBeTruthy();
  const next = screen.getByRole("button", { name: new RegExp(guide.segments[1].name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")) });
  fireEvent.click(next);
  expect(next.getAttribute("aria-pressed")).toBe("true");
  expect(screen.getByText(guide.segments[1].revenue)).toBeTruthy();
  expect(screen.queryByText(guide.segments[0].revenue)).toBeNull();
  expect(screen.getByText(/definitions, not live readings/)).toBeTruthy();
});

it("links reporting to its Event and preserves unknown publication time rather than inventing freshness", () => {
  const cluster = { id: "fixture-event", primary: { title: "A test report", source: "Example label", published: "invalid", published_ts: null }, related: [] } as unknown as StoryCluster;
  render(<IndustryGuide industry={INDUSTRIES[0]} clusters={[cluster]} />);
  expect(screen.getByRole("link", { name: /A test report/ }).getAttribute("href")).toBe("/event/fixture-event");
  expect(screen.getByText(/Publication time unavailable/)).toBeTruthy();
  expect(screen.getByText(/Industry or sector matching alone does not establish an effect/)).toBeTruthy();
});
