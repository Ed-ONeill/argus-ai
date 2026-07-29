// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// REAL useListenRails runs here (NOT mocked) — only auth + transport + peripheral
// hooks/components are stubbed, so we exercise the real hook→page contract.
const { apiGet, UnauthorizedError } = vi.hoisted(() => {
  class UnauthorizedError extends Error { constructor() { super("unauthorized"); this.name = "UnauthorizedError"; } }
  return { apiGet: vi.fn(), UnauthorizedError };
});
const auth = vi.hoisted(() => ({ value: {} as Record<string, unknown> }));

vi.mock("@/lib/api", () => ({ apiGet, UnauthorizedError }));
vi.mock("@/context/AuthContext", () => ({ useAuth: () => auth.value }));
vi.mock("@/hooks/useArgusIntelligence", () => ({ useArgusIntelligence: () => ({ themes: [], clusters: [], ready: true }) }));
vi.mock("@/hooks/useThemeWatchlist", () => ({ useThemeWatchlist: () => ({ watchedIds: [], toggle: () => {}, isWatched: () => false }) }));
vi.mock("@/hooks/useFollowedThemes", () => ({ useFollowedThemes: () => ({ followed: [] }) }));
vi.mock("@/hooks/useWatchlist", () => ({ useWatchlist: () => ({ watchlist: [] }) }));
vi.mock("@/components/listen/ConversationHero", () => ({ ConversationHero: () => null }));
vi.mock("@/components/listen/IntelligenceLayer", () => ({ IntelligenceLayer: () => null }));
vi.mock("@/components/listen/IntelLedSections", () => ({ IntelLedSections: () => null }));
vi.mock("@/components/listen/MiniPlayer", () => ({ MiniPlayer: () => null }));
vi.mock("@/components/listen/ListenSections", () => ({
  ProprietarySignals: () => null, NarrativeRotation: () => null, HighestConviction: () => null,
  CrowdedAndMissing: () => null, CompaniesAndSectors: () => null, PeopleAndFunds: () => null,
  CompanyHeatmap: () => null, FirmsDriving: () => null, InfluentialEpisodes: () => null,
}));

import ListenPage from "@/app/listen/page";

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}><ListenPage /></QueryClientProvider>);
}

beforeEach(() => { apiGet.mockReset(); apiGet.mockResolvedValue([]); });
afterEach(() => cleanup());

describe("Listen page × REAL useListenRails (defect 4, item 5)", () => {
  it("during session invalidation renders the UNAUTHORIZED state, not the skeleton", async () => {
    auth.value = { authReady: true, accessToken: "old-token", invalidatingSession: true };
    const { container } = renderPage();
    // Real hook: enabled=false (invalidating) → no request, isUnauthorized=true.
    expect(screen.getByText(/session has expired/i)).toBeTruthy();
    expect(container.querySelector(".animate-pulse")).toBeNull();   // NOT the skeleton
    expect(apiGet).not.toHaveBeenCalled();
  });

  it("resolved signed-out (no token) renders unauthorized, not skeleton", () => {
    auth.value = { authReady: true, accessToken: null, invalidatingSession: false };
    const { container } = renderPage();
    expect(screen.getByText(/session has expired/i)).toBeTruthy();
    expect(container.querySelector(".animate-pulse")).toBeNull();
  });

  it("auth still resolving renders the skeleton (not unauthorized)", () => {
    auth.value = { authReady: false, accessToken: null, invalidatingSession: false };
    const { container } = renderPage();
    expect(container.querySelector(".animate-pulse")).toBeTruthy();
    expect(screen.queryByText(/session has expired/i)).toBeNull();
  });

  it("valid session with a genuine empty response renders empty, not unauthorized", async () => {
    auth.value = { authReady: true, accessToken: "tok", invalidatingSession: false };
    apiGet.mockResolvedValue([]);
    renderPage();
    await waitFor(() => expect(screen.getByText(/No episodes available/i)).toBeTruthy());
    expect(screen.queryByText(/session has expired/i)).toBeNull();
  });
});
