// @vitest-environment happy-dom
// RC3-ET1a — rendered Event-page regression: an ungrounded transmission chain
// and every assertion derived from it (connection prose, chain chips, the
// chain-persistence watch line) disappear TOGETHER through the existing
// no-chain state, while grounded chains and all other sections render
// unchanged. Fixtures mirror retained-record analogues (see
// chainGrounding.test.ts for provenance); none is a production capture.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import type { EventEvidence, FeedResponse, MarketEvent, TransmissionHop } from "@/lib/types";
import EventPage from "@/components/intel/EventPage";

const current = vi.hoisted(() => ({ feed: null as FeedResponse | null }));
vi.mock("@/hooks/useFeed", () => ({ useFeed: () => ({ data: current.feed, error: null, isLoading: false }) }));
vi.mock("@/lib/platform/hooks/useSeries", () => ({ useSeries: () => ({ series: null }) }));
vi.mock("@/lib/platform/chart", () => ({ ArgusChart: () => null, toDisplayPoints: () => [], changeInfo: () => null }));
vi.mock("@/components/common/EntityChip", () => ({ EntityChip: ({ label }: { label: string }) => <span>{label}</span> }));
vi.mock("next/link", () => ({ default: ({ href, children }: { href: string; children: ReactNode }) => <a href={href}>{children}</a> }));

beforeEach(() => { current.feed = null; });
afterEach(() => { cleanup(); });

const evidence = (source: string, i: number): EventEvidence => ({
  source, title: `Report ${i}`, url: `https://example.test/r-${i}`,
  published: "2026-07-25T16:00:00Z", tier: 1, kind: "news", qualified: true,
});
const hop = (source_uid: string, relationship: string, target_uid: string, source_label: string | null = null): TransmissionHop =>
  ({ source_uid, relationship, target_uid, rel_uid: `rel:${source_uid}|${relationship}|${target_uid}`,
     basis: relationship === "exposed_to" ? "curated_ontology" : "recorded_graph",
     strength: null, confidence: 0.5, source_label });
const event = (over: Partial<MarketEvent> & { id: string }): MarketEvent => ({
  title: "", event_type: "policy", first_seen: "2026-07-25T15:00:00Z", last_updated: "2026-07-25T17:00:00Z",
  source_count: 2, corroboration_count: 2, evidence: [evidence("Bloomberg Markets", 1), evidence("BBC World", 2)],
  companies: [], companies_direct: [], industries: [], theme_ids: [], confidence: 0, editorial_score: 40,
  why_it_matters: "", transmission: null, dominant: false, developing: false, reporting_period: null,
  merged_event_ids: [], ...over,
} as MarketEvent);
const feed = (events: MarketEvent[]): FeedResponse =>
  ({ events, clusters: [], theme_intelligence: [], explanations: {} } as unknown as FeedResponse);

// Retained-record analogue: COST/"cost" collision recital (no event-named company).
const UNGROUNDED = event({
  id: "zel1", title: "Zelensky tries to fix crisis over removal of defence minister",
  theme_ids: ["consumer-stress"], companies: ["WMT", "TGT", "HD", "AMZN"], companies_direct: [],
  transmission_chain: [
    hop("theme:ontology:consumer-stress", "exposed_to", "company:ticker:AMZN"),
    hop("theme:ontology:consumer-stress", "exposed_to", "company:ticker:HD"),
    hop("theme:ontology:consumer-stress", "exposed_to", "company:ticker:TGT"),
  ],
});
// Positive control: direct exposure-target overlap.
const GROUNDED = event({
  id: "rot1", title: "Broadcom's AI order sparks rotation as Nvidia slips", event_type: "single_name",
  theme_ids: ["ai-compute-arms-race"], companies: ["AVGO", "NVDA", "AMD"], companies_direct: ["AVGO", "NVDA"],
  transmission_chain: [
    hop("driver:ontology:ai-capex-supercycle", "drives", "theme:ontology:ai-compute-arms-race", "AI Capex Supercycle"),
    hop("theme:ontology:ai-compute-arms-race", "exposed_to", "company:ticker:AVGO"),
    hop("theme:ontology:ai-compute-arms-race", "exposed_to", "company:ticker:NVDA"),
    hop("theme:ontology:ai-compute-arms-race", "exposed_to", "company:ticker:AMD"),
  ],
});

describe("Event page: ungrounded chain and its dependent assertions vanish together", () => {
  it("suppresses connection prose, chain chips, and the chain watch line via the existing no-chain state", () => {
    current.feed = feed([UNGROUNDED]);
    const before = JSON.stringify(current.feed);
    render(<EventPage clusterId="zel1" />);
    const body = document.body.textContent ?? "";
    expect(body).not.toContain("The connection runs");
    expect(body).not.toContain("Watch whether the link");
    // No orphaned chain chip row: the arrow separators exist only between chain chips.
    // (AMZN may still appear under "Who's affected" — existing propagation, out of scope.)
    expect(body).not.toContain("→");
    expect(body).toContain("2 source labels, 2 qualified");   // evidence counts untouched
    expect(JSON.stringify(current.feed)).toBe(before);        // payload invariant
  });

  it("renders a grounded control's chain, prose, and watch line exactly as before", () => {
    current.feed = feed([GROUNDED]);
    render(<EventPage clusterId="rot1" />);
    const body = document.body.textContent ?? "";
    expect(body).toContain("The connection runs from AI Capex Supercycle to AMD.");
    expect(body).toContain("Watch whether the link between AI Capex Supercycle and AMD persists.");
    for (const chipLabel of ["AI Capex Supercycle", "AVGO", "NVDA", "AMD"]) {
      expect(screen.getAllByText(chipLabel).length).toBeGreaterThan(0);
    }
    expect(body).toContain("2 source labels, 2 qualified");
  });
});
