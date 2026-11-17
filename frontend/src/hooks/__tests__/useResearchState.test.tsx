// @vitest-environment happy-dom
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor, act, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const mocks = vi.hoisted(() => ({ auth: { user: { id: "alice" } as { id: string } | null, loading: false, invalidatingSession: false }, fail: false,
  rows: new Map<string, { key: string; value: Record<string, unknown>; updated_at: string }[]>(), writes: [] as string[] }));
vi.mock("@/context/AuthContext", () => ({ useAuth: () => mocks.auth }));
vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({ from: () => ({
  select: () => ({ eq: (_: string, owner: string) => Promise.resolve({ data: mocks.rows.get(owner) ?? [], error: null }) }),
  upsert: (row: { user_id: string; key: string; value: Record<string, unknown>; updated_at: string }) => {
    if (mocks.fail) return Promise.resolve({ error: new Error("offline") });
    mocks.writes.push(row.user_id);
    mocks.rows.set(row.user_id, [...(mocks.rows.get(row.user_id) ?? []).filter(r => r.key !== row.key), row]);
    return Promise.resolve({ error: null });
  },
}) }) }));
import { useResearchState } from "../useResearchState";
function wrapper({ children }: { children: React.ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
let client: QueryClient;
beforeEach(() => {
  mocks.auth = { user: { id: "alice" }, loading: false, invalidatingSession: false };
  mocks.fail = false; mocks.rows.clear(); mocks.writes = []; localStorage.clear();
  client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
});
afterEach(() => { cleanup(); client.clear(); });

describe("account-owned research persistence", () => {
  it("persists a review and reads it after remount", async () => {
    const hook = renderHook(useResearchState, { wrapper });
    await waitFor(() => expect(hook.result.current.ready).toBe(true));
    await act(async () => { await hook.result.current.put("review:company:DIS", { note: "Check earnings" }); });
    hook.unmount(); client.clear();
    const again = renderHook(useResearchState, { wrapper });
    await waitFor(() => expect(again.result.current.rows[0]?.value.note).toBe("Check earnings"));
    expect(mocks.writes).toEqual(["alice"]);
  });
  it("never displays Alice's data after switching to Bob", async () => {
    mocks.rows.set("alice", [{ key: "theme:ai", value: { name: "Alice private theme" }, updated_at: "" }]);
    const hook = renderHook(useResearchState, { wrapper });
    await waitFor(() => expect(hook.result.current.rows).toHaveLength(1));
    mocks.auth.user = { id: "bob" }; hook.rerender();
    expect(hook.result.current.rows).toEqual([]);
    await waitFor(() => expect(hook.result.current.ready).toBe(true));
    expect(hook.result.current.rows).toEqual([]);
  });
  it("preserves legacy data without silently assigning it to the signed-in user", async () => {
    localStorage.setItem("argus:followed-themes", '[{"id":"old","name":"Legacy"}]');
    const hook = renderHook(useResearchState, { wrapper });
    await waitFor(() => expect(hook.result.current.ready).toBe(true));
    expect(hook.result.current.rows).toEqual([]);
    expect(mocks.writes).toEqual([]);
    expect(localStorage.getItem("argus:followed-themes")).toContain("Legacy");
  });
  it("does not claim a failed save succeeded", async () => {
    const hook = renderHook(useResearchState, { wrapper });
    await waitFor(() => expect(hook.result.current.ready).toBe(true));
    mocks.fail = true;
    await act(async () => { await expect(hook.result.current.put("theme:ai", { name: "AI" })).rejects.toThrow("offline"); });
    expect(hook.result.current.rows).toEqual([]);
  });
  it("hides state and prevents writes during auth restoration", async () => {
    mocks.auth.loading = true;
    const hook = renderHook(useResearchState, { wrapper });
    expect(hook.result.current.ready).toBe(false);
    await act(async () => { await expect(hook.result.current.put("theme:ai", {})).rejects.toThrow("account"); });
    expect(mocks.writes).toEqual([]);
  });
});
