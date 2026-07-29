// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { renderHook, waitFor, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { FeedItem } from "@/lib/types";

// Controllable auth + supabase so useSaved runs its REAL query-key logic.
const auth = vi.hoisted(() => ({ value: {} as Record<string, unknown> }));
const supa = vi.hoisted(() => ({ orderResult: { data: [] as unknown[], error: null as unknown } }));

vi.mock("@/context/AuthContext", () => ({ useAuth: () => auth.value }));
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    from: () => ({
      select: () => ({ eq: () => ({ order: () => Promise.resolve(supa.orderResult) }) }),
      upsert: () => Promise.resolve({ error: null }),
      delete: () => ({ eq: () => ({ eq: () => Promise.resolve({ error: null }) }) }),
    }),
  }),
}));

import { useSaved } from "@/hooks/useSaved";

const feedItem = (id: string): FeedItem => ({ id, title: id } as FeedItem);
const savedRow = (id: string) => ({ item_id: id, title: id });

function makeWrapper(qc: QueryClient) {
  function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  }
  return Wrapper;
}

beforeEach(() => {
  supa.orderResult = { data: [], error: null };
  try { window.localStorage.clear(); } catch { /* ignore */ }
});
afterEach(() => cleanup());

describe("useSaved — account switch A→B is synchronously isolated by user-id key (issue 2)", () => {
  it("B does not receive or paint A's cached saved items before B's request resolves", async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    // A already has cached saved data visible.
    qc.setQueryData(["saved", "A"], [feedItem("a-item")]);

    auth.value = { user: { id: "A" } };
    const { result, rerender } = renderHook(() => useSaved(), { wrapper: makeWrapper(qc) });
    expect(result.current.savedIds).toContain("a-item");

    // B's own request will (later) return B's items.
    supa.orderResult = { data: [savedRow("b-item")], error: null };

    // Direct A→B, no logout. Assert IMMEDIATELY after rerender — NOT wrapped in
    // waitFor/act — so no effect flush can hide a first-render leak. B uses the
    // ["saved","B"] key, which has no cache, so A's data cannot paint.
    auth.value = { user: { id: "B" } };
    rerender();
    expect(result.current.savedIds).not.toContain("a-item");
    expect(result.current.savedIds).toEqual([]);

    // B's request resolves → B's own items become visible.
    await waitFor(() => expect(result.current.savedIds).toContain("b-item"));
    expect(result.current.savedIds).not.toContain("a-item");
  });

  it("logout (A→anon) does not expose A's cached items either", async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    qc.setQueryData(["saved", "A"], [feedItem("a-item")]);
    auth.value = { user: { id: "A" } };
    const { result, rerender } = renderHook(() => useSaved(), { wrapper: makeWrapper(qc) });
    expect(result.current.savedIds).toContain("a-item");

    auth.value = { user: null };   // logout → key becomes ["saved","anon"]
    rerender();
    expect(result.current.savedIds).not.toContain("a-item");
  });
});
