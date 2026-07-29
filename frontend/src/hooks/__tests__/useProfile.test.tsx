// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor, cleanup } from "@testing-library/react";

// Controllable Supabase query chain: from().select().eq().maybeSingle().
const { maybeSingle, upsert } = vi.hoisted(() => ({
  maybeSingle: vi.fn(),
  upsert: vi.fn(() => Promise.resolve({ error: null })),
}));
const auth = vi.hoisted(() => ({ value: {} as Record<string, unknown> }));

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle }) }),
      upsert,
    }),
  }),
}));
vi.mock("@/context/AuthContext", () => ({ useAuth: () => auth.value }));

import { useProfile } from "@/hooks/useProfile";

const readyFor = (id: string | null) => ({
  user: id ? { id, user_metadata: {} } : null,
  authReady: true,
  accessToken: id ? "tok" : null,
  authLoading: false,
});

const row = (name: string) => ({
  data: { display_name: name, first_name: name, last_name: null, avatar_url: null,
          created_at: null, onboarding_completed: false },
  error: null,
});

beforeEach(() => { maybeSingle.mockReset(); upsert.mockClear(); });
afterEach(() => cleanup());

describe("useProfile — profile scoped to userId (defect 2)", () => {
  it("A→B: A's profile disappears IMMEDIATELY on identity change, then B loads", async () => {
    auth.value = readyFor("A");
    maybeSingle.mockResolvedValueOnce(row("Alice"));
    const { result, rerender } = renderHook(() => useProfile());
    await waitFor(() => expect(result.current.profile?.display_name).toBe("Alice"));

    // Switch to B — B's fetch is deferred so we can observe the immediate clear.
    let resolveB!: (v: unknown) => void;
    maybeSingle.mockImplementationOnce(() => new Promise((r) => { resolveB = r; }));
    auth.value = readyFor("B");
    rerender();
    expect(result.current.profile).toBeNull();   // A gone immediately, before B resolves

    await act(async () => { resolveB(row("Bob")); });
    await waitFor(() => expect(result.current.profile?.display_name).toBe("Bob"));
  });

  it("B fetch failure leaves profile null — never retains A", async () => {
    auth.value = readyFor("A");
    maybeSingle.mockResolvedValueOnce(row("Alice"));
    const { result, rerender } = renderHook(() => useProfile());
    await waitFor(() => expect(result.current.profile?.display_name).toBe("Alice"));

    maybeSingle.mockResolvedValueOnce({ data: null, error: { code: "400", message: "bad" } });
    auth.value = readyFor("B");
    rerender();
    // Immediately null, and stays null after the failed fetch settles.
    expect(result.current.profile).toBeNull();
    await new Promise((r) => setTimeout(r, 20));
    expect(result.current.profile).toBeNull();
  });

  it("a LATE user-A response never populates user B's profile", async () => {
    auth.value = readyFor("A");
    let resolveA!: (v: unknown) => void;
    maybeSingle.mockImplementationOnce(() => new Promise((r) => { resolveA = r; }));
    const { result, rerender } = renderHook(() => useProfile());

    // Switch to B (whose fetch resolves normally) BEFORE A resolves.
    maybeSingle.mockResolvedValueOnce(row("Bob"));
    auth.value = readyFor("B");
    rerender();
    await waitFor(() => expect(result.current.profile?.display_name).toBe("Bob"));

    // A resolves late — must be ignored (cancelled).
    await act(async () => { resolveA(row("Alice")); });
    expect(result.current.profile?.display_name).toBe("Bob");
  });

  it("logout clears the profile immediately", async () => {
    auth.value = readyFor("A");
    maybeSingle.mockResolvedValueOnce(row("Alice"));
    const { result, rerender } = renderHook(() => useProfile());
    await waitFor(() => expect(result.current.profile?.display_name).toBe("Alice"));

    auth.value = readyFor(null);   // logout
    rerender();
    expect(result.current.profile).toBeNull();
  });
});

describe("useProfile — synchronous ownership gate (pre-effect, defect 2)", () => {
  it("returned profile is null on the FIRST B render, before any effect flush", async () => {
    // Load A fully.
    auth.value = readyFor("A");
    maybeSingle.mockResolvedValueOnce(row("Alice"));
    const { result, rerender } = renderHook(() => useProfile());
    await waitFor(() => expect(result.current.profile?.display_name).toBe("Alice"));

    // B's fetch stays pending, so `owned` can never update to B before we assert.
    maybeSingle.mockImplementationOnce(() => new Promise(() => {}));
    // Switch identity to B and rerender. Assert IMMEDIATELY — NOT wrapped in
    // act()/waitFor(), which would flush effects and miss the stale frame. The
    // synchronous ownership gate must already return null for B.
    auth.value = readyFor("B");
    rerender();
    expect(result.current.profile).toBeNull();   // A must NEVER paint for B
  });

  it("logout returns null synchronously (no effect needed)", async () => {
    auth.value = readyFor("A");
    maybeSingle.mockResolvedValueOnce(row("Alice"));
    const { result, rerender } = renderHook(() => useProfile());
    await waitFor(() => expect(result.current.profile?.display_name).toBe("Alice"));

    auth.value = readyFor(null);
    rerender();
    expect(result.current.profile).toBeNull();
  });
});
