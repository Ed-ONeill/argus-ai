// @vitest-environment happy-dom
// RC3-EA2a: explicitly authorized honesty edits to the frozen Event/Drawer
// surfaces. Render the real view builders; counts, states, and input records
// must survive unchanged while copy distinguishes labels, reports, and pages.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import type { EventEvidence, FeedResponse, MarketEvent, StoryCluster } from "@/lib/types";
import type { IntelligenceProfile } from "@/lib/intelligenceProfile";
import { buildDrawerView } from "@/lib/drawerView";
import { buildWorkstationView } from "@/lib/workstationView";
import EventPage from "@/components/intel/EventPage";
import { EvidenceDrawer } from "@/components/common/EvidenceDrawer";
import { CaseThread } from "@/components/workstation/CaseThread";

const current = vi.hoisted(() => ({ feed: null as FeedResponse | null, clusters: [] as StoryCluster[] }));
vi.mock("@/hooks/useFeed", () => ({ useFeed: () => ({ data: current.feed, error: null, isLoading: false }) }));
vi.mock("@/hooks/useArgusIntelligence", () => ({
  useArgusIntelligence: () => ({ clusters: current.clusters, themes: [], deals: [], episodes: [] }),
}));
vi.mock("@/lib/drawerEntity", () => ({ resolveDrawerEntity: () => ({ node: null }) }));
vi.mock("@/lib/platform/hooks/useSeries", () => ({ useSeries: () => ({ series: null }) }));
vi.mock("@/lib/platform/chart", () => ({ ArgusChart: () => null, toDisplayPoints: () => [], changeInfo: () => null }));
vi.mock("@/components/common/EntityChip", () => ({ EntityChip: ({ label }: { label: string }) => <span>{label}</span> }));
vi.mock("@/components/workstation/TransmissionGraph", () => ({ TransmissionGraph: () => null }));
vi.mock("next/link", () => ({ default: ({ href, children }: { href: string; children: ReactNode }) => <a href={href}>{children}</a> }));
vi.mock("framer-motion", () => ({
  AnimatePresence: ({ children }: { children: ReactNode }) => <>{children}</>,
  motion: {
    div: ({ children }: { children: ReactNode }) => <div>{children}</div>,
    aside: ({ children }: { children: ReactNode }) => <aside role="dialog">{children}</aside>,
  },
}));

beforeEach(() => {
  current.feed = null;
  current.clusters = [];
  vi.stubGlobal("IntersectionObserver", class {
    observe() {}
    disconnect() {}
  });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const ctx = { kind: "company" as const, id: "NVDA", label: "NVDA" };
const evidence = (source: string, i: number, qualified = true): EventEvidence => ({
  source, title: `Company reports results ${i}`, url: `https://example.test/report-${i}`,
  published: "2026-09-15T12:00:00Z", tier: qualified ? 1 : 4, kind: "news", qualified,
});
const event = (over: Partial<MarketEvent> = {}): MarketEvent => ({
  id: "e1", title: "Company reports quarterly results", event_type: "policy",
  first_seen: "2026-09-15T12:00:00Z", last_updated: "2026-09-15T12:00:00Z",
  source_count: 3, corroboration_count: 2,
  evidence: [evidence("FT Companies", 1), evidence("BBC World", 2), evidence("Other label", 3, false)],
  companies: ["NVDA"], companies_direct: ["NVDA"], industries: [], theme_ids: [],
  confidence: 0, editorial_score: 40, why_it_matters: "", transmission: null,
  dominant: false, developing: false, reporting_period: null, merged_event_ids: [], ...over,
} as MarketEvent);
const feed = (events: MarketEvent[]): FeedResponse => ({ events, clusters: [], theme_intelligence: [], explanations: {} } as unknown as FeedResponse);
const assertHonestCopy = (text: string) => expect(text).not.toMatch(/\b(?:agree|agreement|independent|confirmed)\b/i);

describe("Event page source-label wording", () => {
  it.each([
    [3, 2, "3 source labels, 2 qualified"],
    [4, 3, "4 source labels, 3 qualified"],
    [1, 1, "1 source label"],
    [2, 1, "2 source labels"],
  ])("preserves %i total and %i qualified, including the existing visibility threshold", (total, qualified, copy) => {
    const record = event({ source_count: total, corroboration_count: qualified });
    current.feed = feed([record]);
    const before = JSON.stringify(current.feed);
    render(<EventPage clusterId="e1" />);
    expect(screen.getByText(copy)).toBeTruthy();
    assertHonestCopy(document.body.textContent ?? "");
    expect(JSON.stringify(current.feed)).toBe(before);
  });

  it("retains full counts when the existing eight-record evidence preview is capped", () => {
    current.feed = feed([event({ source_count: 10, corroboration_count: 9,
      evidence: Array.from({ length: 10 }, (_, i) => evidence(`Label ${i}`, i, i < 9)) })]);
    render(<EventPage clusterId="e1" />);
    expect(screen.getByText("10 source labels, 9 qualified")).toBeTruthy();
    expect(document.querySelectorAll("ol > li")).toHaveLength(8);
  });

  it("keeps the developing state and asks for qualified reporting without asserting agreement", () => {
    current.feed = feed([event({ source_count: 1, corroboration_count: 1, developing: true,
      evidence: [evidence("FT Companies", 1)] })]);
    render(<EventPage clusterId="e1" />);
    expect(screen.getByText("Developing")).toBeTruthy();
    expect(screen.getByText("Watch for reporting from a second qualified source label.")).toBeTruthy();
    assertHonestCopy(document.body.textContent ?? "");
  });
});

describe("Evidence Drawer labels and reports", () => {
  it("counts displayed labels without upgrading them to qualified or independent publishers", () => {
    const record = event({ source_count: 3, corroboration_count: 2, evidence: [
      evidence("FT Companies", 1), evidence("FT Deals", 2),
      evidence("Other label", 3, false), evidence("FT Companies", 4),
    ] });
    current.feed = feed([record]);
    const before = JSON.stringify(current.feed);
    render(<EvidenceDrawer ctx={ctx} open onClose={() => {}} />);
    expect(screen.getByText("Reported by 3 source labels")).toBeTruthy();
    expect(screen.getAllByRole("link").filter(a => a.textContent?.startsWith("Company reports results"))).toHaveLength(4);
    assertHonestCopy(screen.getByRole("dialog").textContent ?? "");
    expect(JSON.stringify(current.feed)).toBe(before);
  });

  it.each([false, true])("preserves the single-label state (developing=%s)", (developing) => {
    current.feed = feed([event({ source_count: 1, corroboration_count: 1, developing,
      evidence: [evidence("FT Companies", 1)] })]);
    render(<EvidenceDrawer ctx={ctx} open onClose={() => {}} />);
    expect(screen.getByText(developing
      ? "Still developing, awaiting another qualified source label"
      : "Single source label")).toBeTruthy();
    assertHonestCopy(screen.getByRole("dialog").textContent ?? "");
  });

  it.each([1, 3])("calls a %i-article cluster reports even when every article uses one label", (count) => {
    const cluster = {
      id: "c1", primary: { id: "p1", title: "Company reports results", url: "https://example.test/report",
        source: "FT Companies", affected_entities: ["NVDA"], published: "2026-09-15T12:00:00Z" },
      related: Array.from({ length: count - 1 }, (_, i) => ({ source: "FT Companies", title: `Related ${i}` })),
      story_count: count, cluster_score: 40, theme_label: "Results",
    } as StoryCluster;
    current.feed = feed([]);
    current.clusters = [cluster];
    const input = { context: ctx, events: [], clusters: [cluster], themes: [], deals: [], episodes: [], market: null };
    const story = buildDrawerView(input)!.stories[0];
    expect(story).toMatchObject({ sourceCount: count, state: count >= 2 ? "corroborated" : "single" });
    expect(story.docs).toHaveLength(1);
    render(<EvidenceDrawer ctx={ctx} open onClose={() => {}} />);
    expect(screen.getByText(count >= 2 ? `${count} reports` : "Single report")).toBeTruthy();
    assertHonestCopy(screen.getByRole("dialog").textContent ?? "");
  });
});

const section = (data: unknown) => ({ status: data == null ? "unavailable" : "live", data });
const profile = (pages: string[][]): IntelligenceProfile => ({
  identity: section({ label: "AI spending", description: "" }), thesis: section({ headline: "Spending may grow", forward: null }),
  transmission: section(null), drivers: section([]), beneficiaries: section([]),
  evidence: section({ supporting: pages.map((p, i) => ({ from: `Link ${i + 1}`, pages: p })) }),
  risks: section({ contradictions: [], weakening: [], invalidation: null }), evolution: section(null),
  confidence: section(null), watch: section(null),
} as unknown as IntelligenceProfile);

describe("Workstation product-surface wording", () => {
  it.each([
    [[[]], 0, [0], "Insufficient"],
    [[["feed"]], 1, [1], "Thin"],
    [[["feed", "markets", "feed"], ["listen"]], 3, [2, 1], "Strong"],
  ] as [string[][], number, number[], string][])("preserves page counts and strength for %j", (pages, total, perLink, level) => {
    const p = profile(pages);
    const before = JSON.stringify(p);
    const view = buildWorkstationView({ subject: { kind: "theme", id: "ai", label: "AI spending" }, profile: p, ledger: null, themes: [] });
    expect(view.beats![2].data).toMatchObject({ independentSources: total, links: perLink.map(sources => ({ sources })) });
    expect(view.beats![3].data).toMatchObject({ level });
    render(<CaseThread view={view} mapVM={null} onBack={() => {}} />);
    expect(screen.getByText(`${total} product ${total === 1 ? "surface" : "surfaces"} across the chain.`)).toBeTruthy();
    for (const n of perLink) expect(screen.getAllByText(`${n} product ${n === 1 ? "surface" : "surfaces"}`).length).toBeGreaterThan(0);
    if (perLink.some(n => n <= 1)) expect(screen.getByText(/one link appears on at most one product surface/)).toBeTruthy();
    assertHonestCopy(document.body.textContent ?? "");
    expect(JSON.stringify(p)).toBe(before);
  });
});
