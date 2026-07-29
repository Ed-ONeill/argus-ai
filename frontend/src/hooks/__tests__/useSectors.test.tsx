// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { renderHook, waitFor, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const { fetchFeed } = vi.hoisted(() => ({ fetchFeed: vi.fn() }));
const auth = vi.hoisted(() => ({ value: {} as Record<string, unknown> }));

vi.mock("@/lib/api", () => ({
  fetchFeed,
  UnauthorizedError: class UnauthorizedError extends Error {},
}));
vi.mock("@/context/AuthContext", () => ({ useAuth: () => auth.value }));

import { useSectors } from "@/hooks/useSectors";

function makeWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  }
  return Wrapper;
}

beforeEach(() => {
  fetchFeed.mockReset();
  fetchFeed.mockResolvedValue({ sector_data: null, clusters: [], market_brief: null });
});
afterEach(() => cleanup());

describe("useSectors — gated on a usable session (defect 1)", () => {
  it("does NOT call fetchFeed before authReady", async () => {
    auth.value = { authReady: false, accessToken: null, invalidatingSession: false };
    renderHook(() => useSectors(), { wrapper: makeWrapper() });
    await new Promise((r) => setTimeout(r, 30));
    expect(fetchFeed).not.toHaveBeenCalled();
  });

  it("does NOT call fetchFeed when signed in but token is missing", async () => {
    auth.value = { authReady: true, accessToken: null, invalidatingSession: false };
    renderHook(() => useSectors(), { wrapper: makeWrapper() });
    await new Promise((r) => setTimeout(r, 30));
    expect(fetchFeed).not.toHaveBeenCalled();
  });

  it("does NOT call fetchFeed while a session is being invalidated", async () => {
    auth.value = { authReady: true, accessToken: "tok", invalidatingSession: true };
    renderHook(() => useSectors(), { wrapper: makeWrapper() });
    await new Promise((r) => setTimeout(r, 30));
    expect(fetchFeed).not.toHaveBeenCalled();
  });

  it("a valid restored session fetches once, automatically", async () => {
    auth.value = { authReady: true, accessToken: "restored-tok", invalidatingSession: false };
    renderHook(() => useSectors(), { wrapper: makeWrapper() });
    await waitFor(() => expect(fetchFeed).toHaveBeenCalledTimes(1));
  });
});

describe("useSectors — real-hook auth-state contract (defect 1)", () => {
  it("authReady=false, no token → waiting, NOT unauthorized, disabled", () => {
    auth.value = { authReady: false, accessToken: null, invalidatingSession: false };
    const { result } = renderHook(() => useSectors(), { wrapper: makeWrapper() });
    expect(result.current.isAuthWaiting).toBe(true);
    expect(result.current.isUnauthorized).toBe(false);
    expect(result.current.isLoading).toBe(true);   // waiting shows skeleton
  });

  it("authReady=true, no token → unauthorized, NOT waiting, NOT permanent skeleton", () => {
    auth.value = { authReady: true, accessToken: null, invalidatingSession: false };
    const { result } = renderHook(() => useSectors(), { wrapper: makeWrapper() });
    expect(result.current.isUnauthorized).toBe(true);
    expect(result.current.isAuthWaiting).toBe(false);
    expect(result.current.isLoading).toBe(false);  // resolved signed-out ≠ loading
  });

  it("invalidatingSession=true with old token → unauthorized, NOT waiting", () => {
    auth.value = { authReady: true, accessToken: "old", invalidatingSession: true };
    const { result } = renderHook(() => useSectors(), { wrapper: makeWrapper() });
    expect(result.current.isUnauthorized).toBe(true);
    expect(result.current.isAuthWaiting).toBe(false);
    expect(result.current.isLoading).toBe(false);
  });

  it("valid session → not waiting, not unauthorized", async () => {
    auth.value = { authReady: true, accessToken: "tok", invalidatingSession: false };
    const { result } = renderHook(() => useSectors(), { wrapper: makeWrapper() });
    expect(result.current.isAuthWaiting).toBe(false);
    expect(result.current.isUnauthorized).toBe(false);
    await waitFor(() => expect(fetchFeed).toHaveBeenCalled());
  });
});
