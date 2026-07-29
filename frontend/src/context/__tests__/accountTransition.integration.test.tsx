// @vitest-environment happy-dom
//
// Provider-plus-consumer integration: REAL AuthProvider + REAL useSaved, mounted
// together, exercising the true ordering between an identity change and a
// user-scoped query. Proves the account-transition regression is fixed — no
// global clear discards B's freshly-started query.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { render, screen, act, waitFor, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

type AuthCb = (event: string, session: unknown) => void;

const h = vi.hoisted(() => ({
  getSession: vi.fn(),
  onAuthStateChange: vi.fn(),
  signOut: vi.fn(() => Promise.resolve()),
  refreshSession: vi.fn(async () => ({ data: { session: null }, error: null })),
  replace: vi.fn(),
  refresh: vi.fn(),
  authCb: { current: null as AuthCb | null },
  // Per-user saved rows + fetch bookkeeping for the useSaved query.
  fetchCount: {} as Record<string, number>,
  deferB: { resolve: null as null | ((rows: unknown[]) => void) },
}));

const savedRow = (id: string) => ({ item_id: id, title: id });

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    auth: {
      getSession: h.getSession,
      onAuthStateChange: h.onAuthStateChange,
      signOut: h.signOut,
      refreshSession: h.refreshSession,
    },
    from: () => ({
      select: () => ({
        eq: (_col: string, uid: string) => ({
          order: () => {
            h.fetchCount[uid] = (h.fetchCount[uid] ?? 0) + 1;
            if (uid === "B") {
              // Deferred so we can observe B pending before it resolves.
              return new Promise((r) => { h.deferB.resolve = (rows) => r({ data: rows, error: null }); });
            }
            return Promise.resolve({ data: [savedRow("a-item")], error: null });
          },
        }),
      }),
      upsert: () => Promise.resolve({ error: null }),
      delete: () => ({ eq: () => ({ eq: () => Promise.resolve({ error: null }) }) }),
    }),
  }),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: h.replace, refresh: h.refresh }) }));

import { AuthProvider } from "@/context/AuthContext";
import { useSaved } from "@/hooks/useSaved";
import { setUnauthorizedHandler } from "@/lib/unauthorizedSignal";

const sessionOf = (id: string) => ({ access_token: `tok-${id}`, user: { id } });
const FEED_KEY = ["feed", { categories: "", sources: "", fresh_only: false }];

function SavedProbe() {
  const { savedIds } = useSaved();
  return <div data-testid="saved">{savedIds.join(",")}</div>;
}

function mountApp(qc: QueryClient) {
  const utils = render(
    <QueryClientProvider client={qc}>
      <AuthProvider><SavedProbe /></AuthProvider>
    </QueryClientProvider>,
  );
  const saved = () => screen.getByTestId("saved").textContent ?? "";
  return { ...utils, saved };
}

beforeEach(() => {
  h.getSession.mockReset();
  h.getSession.mockResolvedValue({ data: { session: sessionOf("A") }, error: null });
  h.authCb.current = null;
  h.onAuthStateChange.mockReset();
  h.onAuthStateChange.mockImplementation((cb: AuthCb) => {
    h.authCb.current = cb;
    return { data: { subscription: { unsubscribe: vi.fn() } } };
  });
  h.fetchCount = {};
  h.deferB.resolve = null;
  setUnauthorizedHandler(null);
  try { window.localStorage.clear(); } catch { /* ignore */ }
});
afterEach(() => { cleanup(); setUnauthorizedHandler(null); });

describe("account transition A→B (real AuthProvider + real useSaved)", () => {
  it("B's query starts, resolves, and renders; A's data never shows for B", async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { saved } = mountApp(qc);

    // 1-2. User A established, A's saved query resolves and renders.
    await waitFor(() => expect(saved()).toContain("a-item"));

    // 3. Direct A→B (no logout). 4. B's query starts (deferred).
    await act(async () => { h.authCb.current!("SIGNED_IN", sessionOf("B")); });
    // 8. A's data must NOT render for B — B uses the ["saved","B"] key.
    expect(saved()).not.toContain("a-item");
    // B's query is in flight against its own key.
    await waitFor(() => expect(qc.getQueryState(["saved", "B"])?.fetchStatus).toBe("fetching"));

    // 5. Resolve B's request.
    await act(async () => { h.deferB.resolve!([savedRow("b-item")]); await Promise.resolve(); });

    // 6. B's result renders. 7. observer is settled (idle + success). 8. no A.
    await waitFor(() => expect(saved()).toContain("b-item"));
    expect(saved()).not.toContain("a-item");
    const st = qc.getQueryState(["saved", "B"]);
    expect(st?.fetchStatus).toBe("idle");
    expect(st?.status).toBe("success");
  });

  it("same-user token refresh does NOT restart or remove the query", async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { saved } = mountApp(qc);
    await waitFor(() => expect(saved()).toContain("a-item"));
    expect(h.fetchCount["A"]).toBe(1);

    // TOKEN_REFRESHED for the SAME id → same query key → no refetch/removal.
    await act(async () => { h.authCb.current!("TOKEN_REFRESHED", sessionOf("A")); await Promise.resolve(); });
    expect(saved()).toContain("a-item");
    expect(h.fetchCount["A"]).toBe(1);
    expect(qc.getQueryState(["saved", "A"])?.status).toBe("success");
  });

  it("A → logout leaves no A data visible", async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { saved } = mountApp(qc);
    await waitFor(() => expect(saved()).toContain("a-item"));

    // logout → useSaved key becomes ["saved","anon"] (localStorage empty → []).
    await act(async () => { h.authCb.current!("SIGNED_OUT", null); await Promise.resolve(); });
    expect(saved()).not.toContain("a-item");
  });

  it("global shared feed cache remains available across A→B (intentional)", async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    qc.setQueryData(FEED_KEY, { marker: "global-feed" });
    const { saved } = mountApp(qc);
    await waitFor(() => expect(saved()).toContain("a-item"));

    await act(async () => { h.authCb.current!("SIGNED_IN", sessionOf("B")); await Promise.resolve(); });
    // The shared market-intelligence cache is NOT cleared on account switch.
    expect(qc.getQueryData(FEED_KEY)).toEqual({ marker: "global-feed" });
  });
});
