// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { render, screen, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// REAL useSectors + useFeed run here — only auth + transport are stubbed.
const { fetchFeed } = vi.hoisted(() => ({ fetchFeed: vi.fn() }));
const auth = vi.hoisted(() => ({ value: {} as Record<string, unknown> }));

vi.mock("@/lib/api", () => ({
  fetchFeed,
  UnauthorizedError: class UnauthorizedError extends Error {},
}));
vi.mock("@/context/AuthContext", () => ({ useAuth: () => auth.value }));

import IndustriesPage from "@/app/industries/page";

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}><IndustriesPage /></QueryClientProvider>);
}

beforeEach(() => { fetchFeed.mockReset(); fetchFeed.mockResolvedValue({ sector_data: null, clusters: [], theme_intelligence: [], industry_activation: [] }); });
afterEach(() => cleanup());

describe("Industries page × REAL useSectors (defect 4, item 7)", () => {
  it("resolved signed-out does NOT remain on skeleton — shows sign-in", () => {
    auth.value = { authReady: true, accessToken: null, invalidatingSession: false };
    const { container } = renderPage();
    expect(screen.getByText(/session has expired/i)).toBeTruthy();
    expect(screen.getByText("SIGN IN")).toBeTruthy();
    // no permanent skeleton
    expect(container.querySelector(".animate-pulse")).toBeNull();
    expect(fetchFeed).not.toHaveBeenCalled();
  });

  it("session invalidation shows sign-in, not skeleton", () => {
    auth.value = { authReady: true, accessToken: "old", invalidatingSession: true };
    const { container } = renderPage();
    expect(screen.getByText(/session has expired/i)).toBeTruthy();
    expect(container.querySelector(".animate-pulse")).toBeNull();
  });

  it("initial auth restoration MAY show a skeleton (waiting, not unauthorized)", () => {
    auth.value = { authReady: false, accessToken: null, invalidatingSession: false };
    renderPage();
    // waiting → not the sign-in state
    expect(screen.queryByText(/session has expired/i)).toBeNull();
  });
});
