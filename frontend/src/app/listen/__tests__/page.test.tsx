// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

// ── Control the listen hook's propagated state ──────────────────────────────
const rails = vi.hoisted(() => ({ value: {} as Record<string, unknown> }));
vi.mock("@/hooks/useListen", () => ({ useListenRails: () => rails.value }));

// ── Stub peripheral hooks + presentational children so the page's STATE logic
//    is what's under test (not unrelated synthesis). ──────────────────────────
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

const base = {
  isLoading: false, isAuthWaiting: false, isUnauthorized: false, isApiError: false,
  isPartial: false, totalEpisodes: 0, allEpisodes: [], rails: {}, refetch: vi.fn(),
};
const ep = (id: string) => ({
  id, title: `Ep ${id}`, is_briefing: false, topics: [], entities: [],
  relevance_score: 10, published_at: "", duration_seconds: 0,
});

beforeEach(() => { rails.value = { ...base }; });
afterEach(() => cleanup());

describe("ListenPage — renders propagated auth/API states (defect 1)", () => {
  it("auth-waiting / loading → skeleton (not empty content)", () => {
    rails.value = { ...base, isAuthWaiting: true };
    const { container } = render(<ListenPage />);
    expect(container.querySelector(".animate-pulse")).toBeTruthy();
    expect(screen.queryByText(/No episodes available/i)).toBeNull();
  });

  it("UnauthorizedError → signed-out state, NOT zero episodes", () => {
    rails.value = { ...base, isUnauthorized: true };
    render(<ListenPage />);
    expect(screen.getByText(/session has expired/i)).toBeTruthy();
    expect(screen.getByText("SIGN IN")).toBeTruthy();
    expect(screen.getByRole("link", { name: /sign in/i }).getAttribute("href")).toBe("/auth");
    expect(screen.queryByText(/No episodes available/i)).toBeNull();
  });

  it("API error → explicit error state with retry, NOT zero episodes", () => {
    rails.value = { ...base, isApiError: true };
    render(<ListenPage />);
    expect(screen.getByText(/Couldn't load Listen/i)).toBeTruthy();
    expect(screen.getByText("RETRY")).toBeTruthy();
    expect(screen.queryByText(/No episodes available/i)).toBeNull();
  });

  it("successful [] → genuine empty-content state", () => {
    rails.value = { ...base, totalEpisodes: 0, allEpisodes: [] };
    render(<ListenPage />);
    expect(screen.getByText(/No episodes available/i)).toBeTruthy();
    // must NOT be the unauthorized/error branches
    expect(screen.queryByText(/session has expired/i)).toBeNull();
    expect(screen.queryByText(/Couldn't load Listen/i)).toBeNull();
  });

  it("partial results → episodes rendered plus a non-blocking partial notice", () => {
    rails.value = { ...base, isPartial: true, totalEpisodes: 2, allEpisodes: [ep("a"), ep("b")] };
    render(<ListenPage />);
    expect(screen.getByText(/partial results/i)).toBeTruthy();
    expect(screen.getAllByText(/2 podcasts/i).length).toBeGreaterThan(0);   // episodes present
    expect(screen.queryByText(/No episodes available/i)).toBeNull();
  });

  it("success with episodes → normal page (no error/empty/partial notices)", () => {
    rails.value = { ...base, totalEpisodes: 3, allEpisodes: [ep("a"), ep("b"), ep("c")] };
    render(<ListenPage />);
    expect(screen.getAllByText(/3 podcasts/i).length).toBeGreaterThan(0);
    expect(screen.queryByText(/No episodes available/i)).toBeNull();
    expect(screen.queryByText(/partial results/i)).toBeNull();
  });
});
