// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { render, act, waitFor, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// ── Supabase client mock (controllable auth surface) ────────────────────────
type AuthCb = (event: string, session: unknown) => void;
const h = vi.hoisted(() => ({
  signOut: vi.fn(() => Promise.resolve()),
  getSession: vi.fn(),
  onAuthStateChange: vi.fn(),
  refreshSession: vi.fn(async () => ({ data: { session: null }, error: null })),
  replace: vi.fn(),
  refresh: vi.fn(),
  authCb: { current: null as AuthCb | null },
}));

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    auth: {
      signOut: h.signOut,
      getSession: h.getSession,
      onAuthStateChange: h.onAuthStateChange,
      refreshSession: h.refreshSession,
    },
  }),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: h.replace, refresh: h.refresh }) }));

import { AuthProvider, useAuth } from "@/context/AuthContext";
import { notifyUnauthorized, setUnauthorizedHandler } from "@/lib/unauthorizedSignal";

const FEED_KEY = ["feed", { categories: "", sources: "", fresh_only: false }];
const sessionOf = (id: string) => ({ access_token: `tok-${id}`, user: { id } });

function Probe() {
  const { authReady, user, session, authInitError } = useAuth();
  return (
    <div
      data-testid="probe"
      data-ready={String(authReady)}
      data-user={user?.id ?? ""}
      data-token={session?.access_token ?? ""}
      data-err={authInitError ?? ""}
    />
  );
}

function renderWithQC(qc?: QueryClient) {
  const client = qc ?? new QueryClient();
  const utils = render(
    <QueryClientProvider client={client}>
      <AuthProvider><Probe /></AuthProvider>
    </QueryClientProvider>,
  );
  const probe = () => utils.container.querySelector('[data-testid="probe"]')!;
  return { ...utils, client, probe };
}

beforeEach(() => {
  h.signOut.mockReset(); h.signOut.mockResolvedValue(undefined);
  h.replace.mockReset();
  h.getSession.mockReset();
  h.getSession.mockResolvedValue({ data: { session: sessionOf("A") } });
  h.authCb.current = null;
  h.onAuthStateChange.mockReset();
  h.onAuthStateChange.mockImplementation((cb: AuthCb) => {
    h.authCb.current = cb;
    return { data: { subscription: { unsubscribe: vi.fn() } } };
  });
  setUnauthorizedHandler(null);
});
afterEach(() => cleanup());

// ── Issue 2: initial session resolution ALWAYS settles ──────────────────────
describe("AuthContext — initial resolution always settles (issue 2)", () => {
  it("getSession REJECTS → authReady=true, signed-out, sanitized error", async () => {
    h.getSession.mockRejectedValue(new Error("network"));
    const { probe } = renderWithQC();
    await waitFor(() => expect(probe().getAttribute("data-ready")).toBe("true"));
    expect(probe().getAttribute("data-user")).toBe("");
    expect(probe().getAttribute("data-err")).toBe("Session initialization failed.");
  });

  it("getSession THROWS synchronously → authReady=true, signed-out", async () => {
    h.getSession.mockImplementation(() => { throw new Error("sync boom"); });
    const { probe } = renderWithQC();
    await waitFor(() => expect(probe().getAttribute("data-ready")).toBe("true"));
    expect(probe().getAttribute("data-user")).toBe("");
    expect(probe().getAttribute("data-err")).toBe("Session initialization failed.");
  });

  it("MALFORMED response → authReady=true, signed-out, sanitized error", async () => {
    h.getSession.mockResolvedValue({ nonsense: true } as unknown);
    const { probe } = renderWithQC();
    await waitFor(() => expect(probe().getAttribute("data-ready")).toBe("true"));
    expect(probe().getAttribute("data-user")).toBe("");
    expect(probe().getAttribute("data-err")).toBe("Session initialization failed.");
  });

  it("no session → authReady=true, signed-out, NO error", async () => {
    h.getSession.mockResolvedValue({ data: { session: null }, error: null });
    const { probe } = renderWithQC();
    await waitFor(() => expect(probe().getAttribute("data-ready")).toBe("true"));
    expect(probe().getAttribute("data-user")).toBe("");
    expect(probe().getAttribute("data-err")).toBe("");
  });

  it("normal restored session works", async () => {
    h.getSession.mockResolvedValue({ data: { session: sessionOf("A") }, error: null });
    const { probe } = renderWithQC();
    await waitFor(() => expect(probe().getAttribute("data-user")).toBe("A"));
    expect(probe().getAttribute("data-ready")).toBe("true");
    expect(probe().getAttribute("data-token")).toBe("tok-A");
  });

  it("auth event (valid session) arriving BEFORE getSession resolves stays authoritative", async () => {
    let resolveGet!: (v: unknown) => void;
    h.getSession.mockImplementation(() => new Promise((r) => { resolveGet = r; }));
    const { probe } = renderWithQC();
    await waitFor(() => expect(h.authCb.current).toBeTruthy());

    // Event delivers session B first.
    await act(async () => { h.authCb.current!("SIGNED_IN", sessionOf("B")); });
    await waitFor(() => expect(probe().getAttribute("data-user")).toBe("B"));

    // Stale getSession(A) resolves AFTER — must be ignored.
    await act(async () => { resolveGet({ data: { session: sessionOf("A") } }); await Promise.resolve(); });
    expect(probe().getAttribute("data-user")).toBe("B");
  });

  it("auth SIGN-OUT event before getSession resolves → later stale session cannot restore user", async () => {
    let resolveGet!: (v: unknown) => void;
    h.getSession.mockImplementation(() => new Promise((r) => { resolveGet = r; }));
    const { probe } = renderWithQC();
    await waitFor(() => expect(h.authCb.current).toBeTruthy());

    await act(async () => { h.authCb.current!("SIGNED_OUT", null); });
    await waitFor(() => expect(probe().getAttribute("data-ready")).toBe("true"));
    expect(probe().getAttribute("data-user")).toBe("");

    // Stale restored A must NOT overwrite the newer signed-out state.
    await act(async () => { resolveGet({ data: { session: sessionOf("A") } }); await Promise.resolve(); });
    expect(probe().getAttribute("data-user")).toBe("");
  });
});

// ── Issue 3: classify getSession { data, error } correctly ──────────────────
describe("AuthContext — getSession error/malformed classification (issue 3)", () => {
  const expectFailure = async (mock: unknown) => {
    h.getSession.mockResolvedValue(mock);
    const { probe } = renderWithQC();
    await waitFor(() => expect(probe().getAttribute("data-ready")).toBe("true"));
    expect(probe().getAttribute("data-user")).toBe("");
    expect(probe().getAttribute("data-token")).toBe("");
    expect(probe().getAttribute("data-err")).toBe("Session initialization failed.");
  };

  it("{ data:{session:null}, error: ErrorLike } → init failure (error is NOT signed-out)", async () => {
    await expectFailure({ data: { session: null }, error: { name: "AuthError", message: "boom" } });
  });

  it("{ data:{session:valid-looking}, error: ErrorLike } → init failure (error wins)", async () => {
    await expectFailure({ data: { session: sessionOf("A") }, error: { message: "boom" } });
  });

  it("malformed session with NO user → init failure", async () => {
    await expectFailure({ data: { session: { access_token: "tok" } }, error: null });
  });

  it("malformed user with NO id → init failure", async () => {
    await expectFailure({ data: { session: { access_token: "tok", user: {} } }, error: null });
  });

  it("empty access_token → init failure", async () => {
    await expectFailure({ data: { session: { access_token: "", user: { id: "A" } } }, error: null });
  });

  it("non-string user.id → init failure", async () => {
    await expectFailure({ data: { session: { access_token: "tok", user: { id: 123 } } }, error: null });
  });

  it("valid no-session response → signed-out, NO error", async () => {
    h.getSession.mockResolvedValue({ data: { session: null }, error: null });
    const { probe } = renderWithQC();
    await waitFor(() => expect(probe().getAttribute("data-ready")).toBe("true"));
    expect(probe().getAttribute("data-user")).toBe("");
    expect(probe().getAttribute("data-err")).toBe("");
  });

  it("valid restored session → user set, NO error", async () => {
    h.getSession.mockResolvedValue({ data: { session: sessionOf("A") }, error: null });
    const { probe } = renderWithQC();
    await waitFor(() => expect(probe().getAttribute("data-user")).toBe("A"));
    expect(probe().getAttribute("data-err")).toBe("");
    expect(probe().getAttribute("data-token")).toBe("tok-A");
  });
});

// ── Account transition does NOT globally clear the cache (regression fix) ────
describe("AuthContext — no global query-cache clear on identity change", () => {
  it("global feed cache is PRESERVED across A → logout → B (shared market data)", async () => {
    const qc = new QueryClient();
    qc.setQueryData(FEED_KEY, { marker: "global-feed" });
    const { probe } = renderWithQC(qc);

    await waitFor(() => expect(probe().getAttribute("data-user")).toBe("A"));
    expect(qc.getQueryData(FEED_KEY)).toEqual({ marker: "global-feed" });

    // logout → the shared global feed cache must NOT be wiped.
    await act(async () => { h.authCb.current!("SIGNED_OUT", null); });
    await waitFor(() => expect(probe().getAttribute("data-user")).toBe(""));
    expect(qc.getQueryData(FEED_KEY)).toEqual({ marker: "global-feed" });

    // login B → global cache still intact (identical for every user).
    await act(async () => { h.authCb.current!("SIGNED_IN", sessionOf("B")); });
    await waitFor(() => expect(probe().getAttribute("data-user")).toBe("B"));
    expect(qc.getQueryData(FEED_KEY)).toEqual({ marker: "global-feed" });
  });

  it("a token refresh (same id) does not disturb the cache", async () => {
    const qc = new QueryClient();
    const { probe } = renderWithQC(qc);
    await waitFor(() => expect(probe().getAttribute("data-user")).toBe("A"));
    qc.setQueryData(FEED_KEY, { marker: "global-feed" });

    await act(async () => { h.authCb.current!("TOKEN_REFRESHED", sessionOf("A")); });
    expect(qc.getQueryData(FEED_KEY)).toEqual({ marker: "global-feed" });
  });
});

// ── Existing: definitive-401 teardown (unchanged behavior) ──────────────────
describe("AuthContext — definitive-401 tears down cleanly", () => {
  it("redirect happens ONLY after signOut resolves", async () => {
    let signedOut = false;
    h.signOut.mockImplementation(() => new Promise<void>((res) => {
      setTimeout(() => { signedOut = true; res(); }, 20);
    }));
    h.replace.mockImplementation(() => { expect(signedOut).toBe(true); });

    renderWithQC();
    await waitFor(() => expect(h.onAuthStateChange).toHaveBeenCalled());
    await act(async () => { notifyUnauthorized(); await new Promise((r) => setTimeout(r, 60)); });

    expect(h.signOut).toHaveBeenCalledTimes(1);
    expect(h.replace).toHaveBeenCalledWith("/auth");
  });

  it("two SIMULTANEOUS definitive 401s trigger ONE signOut", async () => {
    h.signOut.mockImplementation(() => new Promise<void>((res) => setTimeout(res, 20)));
    renderWithQC();
    await waitFor(() => expect(h.onAuthStateChange).toHaveBeenCalled());
    await act(async () => {
      notifyUnauthorized(); notifyUnauthorized(); notifyUnauthorized();
      await new Promise((r) => setTimeout(r, 60));
    });
    expect(h.signOut).toHaveBeenCalledTimes(1);
    expect(h.replace).toHaveBeenCalledWith("/auth");
  });

  it("a signOut FAILURE still clears local state and lands on /auth", async () => {
    h.signOut.mockRejectedValue(new Error("network down"));
    renderWithQC();
    await waitFor(() => expect(h.onAuthStateChange).toHaveBeenCalled());
    await act(async () => { notifyUnauthorized(); await new Promise((r) => setTimeout(r, 40)); });
    expect(h.signOut).toHaveBeenCalledTimes(1);
    expect(h.replace).toHaveBeenCalledWith("/auth");
  });
});
