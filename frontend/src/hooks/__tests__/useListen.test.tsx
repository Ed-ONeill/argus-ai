// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { renderHook, waitFor, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const { apiGet, UnauthorizedError } = vi.hoisted(() => {
  class UnauthorizedError extends Error {
    constructor() { super("unauthorized"); this.name = "UnauthorizedError"; }
  }
  return { apiGet: vi.fn(), UnauthorizedError };
});
const auth = vi.hoisted(() => ({ value: {} as Record<string, unknown> }));

vi.mock("@/lib/api", () => ({ apiGet, UnauthorizedError }));
vi.mock("@/context/AuthContext", () => ({ useAuth: () => auth.value }));

import { useListen, useListenRails } from "@/hooks/useListen";

function makeWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  }
  return Wrapper;
}

beforeEach(() => {
  apiGet.mockReset();
  auth.value = { authReady: true, accessToken: "tok", invalidatingSession: false };
});
afterEach(() => cleanup());

describe("useListen — auth failures are NOT empty content (defect 4)", () => {
  it("propagates UnauthorizedError from a protected request (not [])", async () => {
    apiGet.mockRejectedValue(new UnauthorizedError());
    const { result } = renderHook(() => useListen(""), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isUnauthorized).toBe(true));
    expect(result.current.isFallback).toBe(false);   // never labelled genuine empty
  });

  it("a genuine empty response stays distinguishable from a 401", async () => {
    apiGet.mockResolvedValue([]);   // both sources succeed with no episodes
    const { result } = renderHook(() => useListen(""), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isFallback).toBe(true));
    expect(result.current.isUnauthorized).toBe(false);
    expect(result.current.episodes).toEqual([]);
  });

  it("one non-auth source failing yields PARTIAL data, not empty/error", async () => {
    apiGet
      .mockResolvedValueOnce([{ id: "e1", title: "Ep", is_briefing: false, topics: [], entities: [],
        relevance_score: 10, published_at: "", duration_seconds: 0 }])
      .mockRejectedValueOnce(new Error("briefings 500"));   // non-auth failure
    const { result } = renderHook(() => useListen(""), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.episodes.length).toBe(1));
    expect(result.current.isPartial).toBe(true);
    expect(result.current.isFallback).toBe(false);
    expect(result.current.isUnauthorized).toBe(false);
  });
});

describe("useListenRails — must rethrow UnauthorizedError, not swallow (defect 4)", () => {
  it("propagates UnauthorizedError instead of returning []", async () => {
    apiGet.mockRejectedValue(new UnauthorizedError());
    const { result } = renderHook(() => useListenRails(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isUnauthorized).toBe(true));
  });

  it("a successful empty response is distinguishable from a 401", async () => {
    apiGet.mockResolvedValue([]);
    const { result } = renderHook(() => useListenRails(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.totalEpisodes).toBe(0));
    expect(result.current.isUnauthorized).toBe(false);
    expect(result.current.isApiError).toBe(false);
  });
});

describe("useListenRails — auth-state contract (defect 1 & 2)", () => {
  it("invalidatingSession with old token → unauthorized, NOT waiting, NO request", async () => {
    apiGet.mockResolvedValue([]);
    auth.value = { authReady: true, accessToken: "old", invalidatingSession: true };
    const { result } = renderHook(() => useListenRails(), { wrapper: makeWrapper() });
    expect(result.current.isUnauthorized).toBe(true);
    expect(result.current.isAuthWaiting).toBe(false);
    await new Promise((r) => setTimeout(r, 20));
    expect(apiGet).not.toHaveBeenCalled();
  });

  it("authReady=false → waiting, NOT unauthorized", () => {
    auth.value = { authReady: false, accessToken: null, invalidatingSession: false };
    const { result } = renderHook(() => useListenRails(), { wrapper: makeWrapper() });
    expect(result.current.isAuthWaiting).toBe(true);
    expect(result.current.isUnauthorized).toBe(false);
  });
});
