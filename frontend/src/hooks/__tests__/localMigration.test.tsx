// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

const auth = vi.hoisted(() => ({ user: { id: "A" } as { id: string } | null }));
const cloud = vi.hoisted(() => ({
  rows: [] as Record<string, unknown>[],
  upsert: vi.fn(),
  read: vi.fn(),
}));
vi.mock("@/context/AuthContext", () => ({ useAuth: () => auth }));
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({ from: () => ({
    upsert: cloud.upsert,
    select: () => ({ eq: () => ({ order: cloud.read }) }),
  }) }),
}));

import { useSaved } from "@/hooks/useSaved";
import { useWatchlist } from "@/hooks/useWatchlist";

const clients: QueryClient[] = [];
function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  clients.push(client);
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}
const cases = [
  {
    name: "saved research", key: "argus_saved_items", query: "saved",
    item: { id: "local-item", title: "Local research" },
    row: { item_id: "local-item", title: "Local research" },
    useIds: function useSavedIds() { return useSaved().savedIds; },
  },
  {
    name: "watchlist", key: "argus_watchlist", query: "watchlist",
    item: { id: "local-item", type: "ticker", addedAt: "2026-09-15" },
    row: { item_id: "local-item", item_type: "ticker", added_at: "2026-09-15" },
    useIds: function useWatchIds() { return useWatchlist().watchlist.map(item => item.id); },
  },
];

beforeEach(() => {
  localStorage.clear();
  auth.user = { id: "A" };
  cloud.rows = [];
  cloud.upsert.mockReset();
  cloud.read.mockReset().mockImplementation(() => Promise.resolve({ data: [...cloud.rows], error: null }));
});
afterEach(() => {
  cleanup();
  clients.splice(0).forEach(client => client.clear());
});

describe.each(cases)("$name login migration", ({ key, item, row, useIds, query }) => {
  function seed() {
    localStorage.setItem(key, JSON.stringify([item]));
    if (query === "saved") localStorage.setItem("argus_saved_ids", JSON.stringify([item.id]));
  }

  it("retains local research when Supabase returns an error, including after logout", async () => {
    seed();
    cloud.upsert.mockResolvedValue({ error: { message: "write unavailable" } });
    const { rerender } = renderHook(useIds, { wrapper: wrapper() });
    await waitFor(() => expect(cloud.upsert).toHaveBeenCalled());
    expect(JSON.parse(localStorage.getItem(key)!)).toEqual([item]);
    if (query === "saved") expect(JSON.parse(localStorage.getItem("argus_saved_ids")!)).toEqual([item.id]);
    auth.user = null;
    rerender();
    expect(JSON.parse(localStorage.getItem(key)!)).toEqual([item]);
  });

  it("keeps local data until commit, then refreshes the signed-in list without a reload", async () => {
    seed();
    let commit!: (value: { error: null }) => void;
    cloud.upsert.mockReturnValue(new Promise(resolve => { commit = resolve; }));
    const { result } = renderHook(useIds, { wrapper: wrapper() });
    await waitFor(() => expect(cloud.read).toHaveBeenCalled());
    expect(localStorage.getItem(key)).not.toBeNull();
    expect(result.current).toEqual([]);
    await act(async () => {
      cloud.rows = [row];
      commit({ error: null });
    });
    await waitFor(() => expect(result.current).toEqual([item.id]));
    expect(localStorage.getItem(key)).toBeNull();
    if (query === "saved") expect(localStorage.getItem("argus_saved_ids")).toBeNull();
    expect(cloud.upsert.mock.calls[0][0][0].user_id).toBe("A");
    expect(cloud.upsert.mock.calls[0][1]).toEqual({ onConflict: "user_id,item_id", ignoreDuplicates: true });
  });

  it("does not migrate when there is no local data", async () => {
    renderHook(useIds, { wrapper: wrapper() });
    await waitFor(() => expect(cloud.read).toHaveBeenCalled());
    expect(cloud.upsert).not.toHaveBeenCalled();
  });

  it("retains the local copy when the transport rejects", async () => {
    seed();
    cloud.upsert.mockRejectedValue(new Error("network unavailable"));
    renderHook(useIds, { wrapper: wrapper() });
    await waitFor(() => expect(cloud.upsert).toHaveBeenCalled());
    expect(JSON.parse(localStorage.getItem(key)!)).toEqual([item]);
  });

  it("retries preserved items on the next login and only refreshes the owning account", async () => {
    seed();
    cloud.upsert.mockResolvedValue({ error: { message: "temporarily unavailable" } });
    const { result, rerender } = renderHook(useIds, { wrapper: wrapper() });
    await waitFor(() => expect(cloud.upsert).toHaveBeenCalledTimes(1));
    auth.user = null;
    rerender();
    cloud.upsert.mockImplementation(async () => {
      cloud.rows = [row];
      return { error: null };
    });
    const invalidate = vi.spyOn(clients[clients.length - 1], "invalidateQueries");
    auth.user = { id: "A" };
    rerender();
    await waitFor(() => expect(result.current).toEqual([item.id]));
    expect(cloud.upsert).toHaveBeenCalledTimes(2);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: [query, "A"] });
    expect(localStorage.getItem(key)).toBeNull();
  });
});
