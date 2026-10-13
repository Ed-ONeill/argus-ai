// @vitest-environment happy-dom
// Controlled analogue of the Oct 13 J&J walkthrough, not a captured API payload.
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import type { FeedResponse, MarketEvent, ThemeIntelligence } from "@/lib/types";
import EventPage from "@/components/intel/EventPage";
import { buildHomeBriefing } from "@/lib/homeBriefing";
import { buildCardsForEventIds } from "@/lib/feedStream";
import { buildTopStories } from "@/lib/topStories";
import { buildMarketLandscape } from "@/lib/marketLandscape";
import { planAdaptiveHero } from "@/lib/adaptiveHero";
import { IMPLICATION_LIMIT, latestReportTime } from "@/lib/eventPresentation";

const state = vi.hoisted(() => ({ feed: null as FeedResponse | null }));
vi.mock("@/hooks/useFeed", () => ({ useFeed: () => ({ data: state.feed, isLoading: false }) }));
vi.mock("@/lib/platform/hooks/useSeries", () => ({ useSeries: () => ({ series: null }) }));
vi.mock("@/components/common/EntityChip", () => ({ EntityChip: ({ label }: { label: string }) => <span>{label}</span> }));
vi.mock("next/link", () => ({ default: ({ href, children }: { href: string; children: ReactNode }) => <a href={href}>{children}</a> }));
afterEach(cleanup);

const event = {
  id: "jnj-control", title: "J&J Medtech Sales Disappoint, Considers Orthopedic Spinoff", event_type: "market_event",
  first_seen: "2026-10-13T08:00:00Z", last_updated: "2026-10-13T14:00:00Z",
  companies_direct: ["JNJ"], companies: ["JNJ", "LLY"], industries: ["Healthcare", "Consumer"],
  theme_ids: ["health"], confidence: 95, editorial_score: 100, developing: true,
  why_it_matters: "This pressures J&J's stock price.", transmission: null, source_count: 1, corroboration_count: 1,
  evidence: [{ source: "Source A", title: "J&J reports", url: "https://example.test/jnj", published: "2026-10-13T09:00:00-04:00", kind: "news", tier: 1, qualified: true }],
} as MarketEvent;
const theme = { id: "health", name: "Healthcare", related_assets: ["LLY"], related_industries: ["Healthcare"],
  related_macro_factors: ["Rates"], confidence: 95, causal_narrative: "Healthcare drives Financials higher.",
  relationship_weights: { Financials: { weight: 1, direction: "positive" }, Consumer: { weight: 1, direction: "negative" } },
} as unknown as ThemeIntelligence;
function feed(ev = event): FeedResponse {
  return { events: [ev], theme_intelligence: [theme], explanations: {}, clusters: [], } as unknown as FeedResponse;
}

it("keeps sources and company navigation, but cannot promote theme weights or legacy prose to event impact", () => {
  state.feed = feed(); const original = JSON.stringify(state.feed);
  render(<EventPage clusterId={event.id} />);
  expect(screen.getByText(new RegExp(IMPLICATION_LIMIT.replaceAll(".", "\\.")))).toBeTruthy();
  expect(screen.getByRole("link", { name: "JNJ" }).getAttribute("href")).toBe("/company/JNJ");
  expect(screen.getByRole("link", { name: "J&J reports" }).getAttribute("href")).toBe("https://example.test/jnj");
  expect(screen.getByRole("link", { name: /Open Workstation/ }).getAttribute("href")).toBe("/workstation");
  expect(document.body.textContent).not.toMatch(/Beneficiaries|Losers|This pressures|trend behind it/);
  expect(document.body.textContent).toContain("Latest report");
  expect(JSON.stringify(state.feed)).toBe(original);
});

it("uses the same source publication time in Home, Feed and Event and never substitutes a pipeline clock", () => {
  const f = feed();
  expect(buildTopStories(f)[0].when).toBe(latestReportTime(event));
  expect(buildCardsForEventIds(f, new Set([event.id]))[0].when).toBe(latestReportTime(event));
  expect(latestReportTime({ ...event, evidence: [{ ...event.evidence[0], published: null }] })).toBeNull();
  expect(latestReportTime({ ...event, evidence: [{ ...event.evidence[0], published: "invalid" }] })).toBeNull();
  const offset = { ...event, evidence: [...event.evidence, { ...event.evidence[0], published: "2026-10-13T12:30:00Z" }] };
  expect(latestReportTime(offset)).toBe("2026-10-13T09:00:00-04:00");
});

it("empty direct involvement stays empty across all three surfaces and cannot choose a thematic company's chart", () => {
  const ev = { ...event, event_type: "ma" as const, title: "A private acquisition", companies_direct: [] };
  const f = feed(ev);
  expect(buildTopStories(f)[0].companies).toEqual([]);
  expect(buildCardsForEventIds(f, new Set([ev.id]))[0].entities).toEqual([]);
  expect(buildMarketLandscape(f).nodes.filter(n => n.kind === "company")).toEqual([]);
  expect(planAdaptiveHero(f).instrument).toBeNull();
  expect(buildHomeBriefing(f).why?.read).not.toContain("LLY");
  expect(buildHomeBriefing(f).why?.benefits).toEqual([]);
  expect(buildHomeBriefing(f).watchLine).toBeNull();
});

it("a high theme confidence cannot rescue unverified interpretation; exact source excerpts remain inspectable", () => {
  const f = feed();
  f.clusters = [{ primary: { title: "J&J reports", url: "https://example.test/jnj", snippet: "Sales rose 2.5%, below estimates." }, related: [] }] as unknown as FeedResponse["clusters"];
  state.feed = f;
  render(<EventPage clusterId={event.id} />);
  expect(screen.getByText("Sales rose 2.5%, below estimates.")).toBeTruthy();
  expect(buildCardsForEventIds(f, new Set([event.id]))[0].why).toBeNull();
  expect(buildHomeBriefing(f).why?.read).toContain(IMPLICATION_LIMIT);
});
