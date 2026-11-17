// @vitest-environment happy-dom
// Exercise the real useFeed/query lifecycle; only auth and transport are stubbed.
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import type { FeedResponse, MarketEvent } from "@/lib/types";
import EventPage from "@/components/intel/EventPage";
import { UnauthorizedError } from "@/lib/api";

const { fetchFeed } = vi.hoisted(() => ({ fetchFeed: vi.fn() }));
const auth = vi.hoisted(() => ({
  value: { authReady: false, accessToken: null as string | null, invalidatingSession: false },
}));
vi.mock("@/lib/api", () => ({
  fetchFeed,
  UnauthorizedError: class UnauthorizedError extends Error {},
}));
vi.mock("@/context/AuthContext", () => ({ useAuth: () => auth.value }));
vi.mock("@/lib/platform/hooks/useSeries", () => ({ useSeries: () => ({ series: null }) }));
vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: ReactNode }) => <a href={href}>{children}</a>,
}));

const event: MarketEvent = {
  id: "startup-control", title: "Startup control reporting", event_type: "policy",
  first_seen: "2026-11-17T18:00:00Z", last_updated: "2026-11-17T18:00:00Z",
  source_count: 1, corroboration_count: 1,
  evidence: [{ source: "Example publisher", title: "Source report", url: "https://example.test/report",
    published: "2026-11-17T18:00:00Z", tier: 1, kind: "news", qualified: true }],
  companies: [], companies_direct: [], industries: [], theme_ids: [], confidence: 0,
  editorial_score: 40, why_it_matters: "", transmission: null, dominant: false,
  developing: true, reporting_period: null, merged_event_ids: [],
};
const feed = { events: [event], clusters: [], theme_intelligence: [], explanations: {} } as unknown as FeedResponse;
const feedKey = ["feed", { categories: "", sources: "", fresh_only: false }];
const clients: QueryClient[] = [];

function mount(cached?: FeedResponse) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  clients.push(client);
  if (cached) client.setQueryData(feedKey, cached);
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { client, ...render(<EventPage clusterId={event.id} />, { wrapper }) };
}

beforeEach(() => {
  auth.value = { authReady: false, accessToken: null, invalidatingSession: false };
  fetchFeed.mockReset().mockResolvedValue(feed);
});
afterEach(() => {
  cleanup();
  clients.splice(0).forEach(client => client.clear());
});

it("shows loading with zero requests while auth resolves, then fetches and renders the event", async () => {
  let resolveFeed!: (data: FeedResponse) => void;
  fetchFeed.mockReturnValue(new Promise<FeedResponse>(resolve => { resolveFeed = resolve; }));
  const { rerender } = mount();
  expect(screen.getByText("Loading…")).toBeTruthy();
  expect(screen.queryByText(/unreachable/)).toBeNull();
  expect(fetchFeed).not.toHaveBeenCalled();

  auth.value = { authReady: true, accessToken: "test-session", invalidatingSession: false };
  rerender(<EventPage clusterId={event.id} />);
  await waitFor(() => expect(fetchFeed).toHaveBeenCalledTimes(1));
  expect(screen.getByText("Loading…")).toBeTruthy();
  expect(screen.queryByText(/unreachable/)).toBeNull();

  await act(async () => { resolveFeed(feed); });
  expect(await screen.findByRole("heading", { name: event.title })).toBeTruthy();
  expect(screen.getByText("1 source label")).toBeTruthy();
  expect(screen.getByRole("link", { name: "Source report" }).getAttribute("href")).toBe(event.evidence[0].url);
  expect(screen.queryByText("Loading…")).toBeNull();
});

it("shows sign-in when session resolution finishes signed out, without issuing a request", () => {
  const { rerender } = mount();
  auth.value = { authReady: true, accessToken: null, invalidatingSession: false };
  rerender(<EventPage clusterId={event.id} />);
  expect(screen.getByRole("link", { name: "Sign in" }).getAttribute("href")).toBe("/auth");
  expect(screen.queryByText(/unreachable/)).toBeNull();
  expect(screen.queryByText("Loading…")).toBeNull();
  expect(fetchFeed).not.toHaveBeenCalled();
});

it.each(["session pending", "signed out", "invalidating session"])(
  "does not expose cached event content during %s", state => {
    auth.value = { authReady: state !== "session pending", accessToken: state === "invalidating session" ? "old-session" : null,
      invalidatingSession: state === "invalidating session" };
    mount(feed);
    expect(screen.queryByRole("heading", { name: event.title })).toBeNull();
    expect(screen.queryByText(/unreachable/)).toBeNull();
    if (state === "session pending") expect(screen.getByText("Loading…")).toBeTruthy();
    else expect(screen.getByRole("link", { name: "Sign in" })).toBeTruthy();
    expect(fetchFeed).not.toHaveBeenCalled();
  },
);

it.each([new TypeError("Failed to fetch"), new Error("API 503")])(
  "shows the outage message for an actual request failure with no data: %s", async error => {
    auth.value = { authReady: true, accessToken: "test-session", invalidatingSession: false };
    fetchFeed.mockRejectedValue(error);
    mount();
    expect(await screen.findByText(/The market feed is unreachable/)).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Sign in" })).toBeNull();
    expect(fetchFeed).toHaveBeenCalledTimes(1);
  },
);

it("shows sign-in for a definitive unauthorized result instead of a feed outage", async () => {
  auth.value = { authReady: true, accessToken: "test-session", invalidatingSession: false };
  fetchFeed.mockRejectedValue(new UnauthorizedError());
  mount();
  expect(await screen.findByRole("link", { name: "Sign in" })).toBeTruthy();
  expect(screen.queryByText(/unreachable/)).toBeNull();
});

it("preserves the missing-event state after a successful feed response", async () => {
  auth.value = { authReady: true, accessToken: "test-session", invalidatingSession: false };
  fetchFeed.mockResolvedValue({ ...feed, events: [] });
  mount();
  expect(await screen.findByRole("heading", { name: "This event isn’t in the current cycle" })).toBeTruthy();
  expect(screen.queryByText(/unreachable/)).toBeNull();
});

it("keeps available event evidence visible after a background request failure", async () => {
  auth.value = { authReady: true, accessToken: "test-session", invalidatingSession: false };
  fetchFeed.mockRejectedValue(new Error("API 503"));
  const { client } = mount(feed);
  await act(async () => { await client.invalidateQueries({ queryKey: feedKey }); });
  await waitFor(() => expect(client.getQueryState(feedKey)?.status).toBe("error"));
  expect(screen.getByRole("heading", { name: event.title })).toBeTruthy();
  expect(screen.getByRole("link", { name: "Source report" })).toBeTruthy();
  expect(screen.queryByText(/unreachable/)).toBeNull();
});
