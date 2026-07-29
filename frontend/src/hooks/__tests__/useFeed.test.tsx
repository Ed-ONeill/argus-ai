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

import { useFeed } from "@/hooks/useFeed";

function makeWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  }
  return Wrapper;
}

beforeEach(() => {
  fetchFeed.mockReset();
  fetchFeed.mockResolvedValue({ clusters: [], theme_intelligence: [] });
});
afterEach(() => cleanup());

describe("useFeed — real-hook auth-state contract (defect 1 & 2)", () => {
  it("authReady=false, no token → waiting=true, unauthorized=false, no fetch", async () => {
    auth.value = { authReady: false, accessToken: null, invalidatingSession: false };
    const { result } = renderHook(() => useFeed(), { wrapper: makeWrapper() });
    expect(result.current.isAuthWaiting).toBe(true);
    expect(result.current.isUnauthorized).toBe(false);
    await new Promise((r) => setTimeout(r, 20));
    expect(fetchFeed).not.toHaveBeenCalled();
  });

  it("authReady=true, no token → unauthorized=true, waiting=false (Feed shows signed-out, not loading)", async () => {
    auth.value = { authReady: true, accessToken: null, invalidatingSession: false };
    const { result } = renderHook(() => useFeed(), { wrapper: makeWrapper() });
    expect(result.current.isUnauthorized).toBe(true);
    expect(result.current.isAuthWaiting).toBe(false);
    await new Promise((r) => setTimeout(r, 20));
    expect(fetchFeed).not.toHaveBeenCalled();
  });

  it("invalidatingSession=true with old token → unauthorized=true, waiting=false", () => {
    auth.value = { authReady: true, accessToken: "old", invalidatingSession: true };
    const { result } = renderHook(() => useFeed(), { wrapper: makeWrapper() });
    expect(result.current.isUnauthorized).toBe(true);
    expect(result.current.isAuthWaiting).toBe(false);
  });

  it("valid session → waiting=false, unauthorized=false, fetches once", async () => {
    auth.value = { authReady: true, accessToken: "tok", invalidatingSession: false };
    const { result } = renderHook(() => useFeed(), { wrapper: makeWrapper() });
    expect(result.current.isAuthWaiting).toBe(false);
    expect(result.current.isUnauthorized).toBe(false);
    await waitFor(() => expect(fetchFeed).toHaveBeenCalledTimes(1));
  });
});
