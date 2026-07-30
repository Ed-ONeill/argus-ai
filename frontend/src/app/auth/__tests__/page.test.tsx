// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { render, screen, fireEvent, waitFor, act, cleanup } from "@testing-library/react";

type Sess = { access_token: string; user: { id: string } } | null;

const h = vi.hoisted(() => ({
  signIn: vi.fn(),
  signUp: vi.fn(),
  session: { current: null as Sess },
  hard: vi.fn(),          // hard navigation spy
  params: new URLSearchParams(""),
}));

vi.mock("@/context/AuthContext", () => ({
  useAuth: () => ({
    signIn: h.signIn, signUp: h.signUp,
    session: h.session.current, invalidatingSession: false,
  }),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), refresh: vi.fn(), push: vi.fn() }),
  useSearchParams: () => h.params,
}));
// Navigation now goes through a HARD navigation (real request → server sees the
// session cookies). Mock it so tests observe the transition without reloading.
vi.mock("@/lib/hardNavigate", () => ({ hardNavigate: (url: string) => h.hard(url) }));

import AuthPage from "@/app/auth/page";

const SESSION: Sess = { access_token: "tok-A", user: { id: "A" } };

function fill(container: HTMLElement) {
  const email = container.querySelector('input[name="argus_identifier_signal"]') as HTMLInputElement;
  const pwd   = container.querySelector('input[name="argus_secret_signal"]') as HTMLInputElement;
  fireEvent.change(email, { target: { value: "edward@example.com" } });
  fireEvent.change(pwd,   { target: { value: "password123" } });
}
const submitBtn = (c: HTMLElement) => c.querySelector('button[type="submit"]') as HTMLButtonElement;

beforeEach(() => {
  h.signIn.mockReset();
  h.signUp.mockReset();
  h.hard.mockReset();
  h.session.current = null;
  h.params = new URLSearchParams("");
  try { window.sessionStorage.clear(); } catch { /* ignore */ }
});
afterEach(() => cleanup());

describe("AuthPage — first-click sign-in sequence (browser-level)", () => {
  it("one real submit: onSubmit fires, button disables + says Signing in, signIn once, resolves→hard-navigates, no 2nd click", async () => {
    let resolveSignIn!: (v: unknown) => void;
    h.signIn.mockImplementation(() => new Promise((r) => { resolveSignIn = r; }));
    const { container } = render(<AuthPage />);
    fill(container);

    fireEvent.click(submitBtn(container));   // FIRST click only

    expect(h.signIn).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(submitBtn(container).disabled).toBe(true));
    expect(container.textContent).toMatch(/signing in/i);
    expect(h.hard).not.toHaveBeenCalled();   // no premature navigation while pending

    await act(async () => { resolveSignIn({ error: null, session: SESSION }); });
    await waitFor(() => expect(h.hard).toHaveBeenCalledWith("/"));
    expect(h.hard).toHaveBeenCalledTimes(1);
    expect(h.signIn).toHaveBeenCalledTimes(1);
  });
});

describe("AuthPage — sign-in completion transition", () => {
  it("navigates once via hard navigation even if the session context is delayed", async () => {
    h.signIn.mockResolvedValue({ error: null, session: SESSION });
    h.session.current = null;   // context session never arrives
    const { container } = render(<AuthPage />);
    fill(container);
    fireEvent.click(submitBtn(container));
    await waitFor(() => expect(h.hard).toHaveBeenCalledWith("/"));
    expect(h.signIn).toHaveBeenCalledTimes(1);
    expect(h.hard).toHaveBeenCalledTimes(1);
  });

  it("navigates to the sanitized internal redirect target from the query", async () => {
    h.params = new URLSearchParams("redirect=/industries");
    h.signIn.mockResolvedValue({ error: null, session: SESSION });
    const { container } = render(<AuthPage />);
    fill(container);
    fireEvent.click(submitBtn(container));
    await waitFor(() => expect(h.hard).toHaveBeenCalledWith("/industries"));
    expect(h.hard).toHaveBeenCalledTimes(1);
  });

  it("a rapid second click does NOT make a second signIn request", async () => {
    let resolveSignIn!: (v: unknown) => void;
    h.signIn.mockImplementation(() => new Promise((r) => { resolveSignIn = r; }));
    const { container } = render(<AuthPage />);
    fill(container);
    const btn = submitBtn(container);
    fireEvent.click(btn);
    fireEvent.click(btn);
    expect(h.signIn).toHaveBeenCalledTimes(1);
    await act(async () => { resolveSignIn({ error: null, session: SESSION }); });
    await waitFor(() => expect(h.hard).toHaveBeenCalledTimes(1));
    expect(h.signIn).toHaveBeenCalledTimes(1);
  });

  it("a delayed auth event does NOT cause a duplicate navigation within the same page instance", async () => {
    h.signIn.mockResolvedValue({ error: null, session: SESSION });
    const { container, rerender } = render(<AuthPage />);
    fill(container);
    fireEvent.click(submitBtn(container));
    await waitFor(() => expect(h.hard).toHaveBeenCalledTimes(1));

    h.session.current = SESSION;   // onAuthStateChange delivers session to context
    rerender(<AuthPage />);
    await act(async () => {});
    expect(h.hard).toHaveBeenCalledTimes(1);   // deduped within the instance
  });

  it("failed signIn shows the sanitized error and does NOT navigate", async () => {
    h.signIn.mockResolvedValue({ error: { message: "Invalid login credentials" }, session: null });
    const { container } = render(<AuthPage />);
    fill(container);
    fireEvent.click(submitBtn(container));
    await waitFor(() => expect(screen.getByText(/incorrect email or password/i)).toBeTruthy());
    expect(h.hard).not.toHaveBeenCalled();
    expect(h.signIn).toHaveBeenCalledTimes(1);
  });

  it("normal case: server auth immediately available → one hard navigation to /", async () => {
    h.session.current = SESSION;   // restored/valid session, server can read it
    render(<AuthPage />);
    await waitFor(() => expect(h.hard).toHaveBeenCalledWith("/"));
    expect(h.hard).toHaveBeenCalledTimes(1);
    expect(h.signIn).not.toHaveBeenCalled();
  });
});

describe("AuthPage — bounce/retry across the browser↔server session boundary", () => {
  it("first nav rejected by middleware (bounce) → page RETRIES on the /auth reload → eventually lands", async () => {
    // A valid session exists client-side, but the server can't read it yet.
    h.session.current = SESSION;

    // Mount 1: attempt navigation (hard nav to "/").
    const first = render(<AuthPage />);
    await waitFor(() => expect(h.hard).toHaveBeenCalledTimes(1));
    // Middleware 307s "/" → "/auth?redirect=/" → /auth fully reloads:
    first.unmount();

    // Fresh /auth instance after the bounce — the latch is NOT permanent, so it
    // retries instead of getting stuck on /auth.
    render(<AuthPage />);
    await waitFor(() => expect(h.hard).toHaveBeenCalledTimes(2));
    // In production the server now reads the committed cookie and serves "/".
  });

  it("bounded: after MAX bounces it STOPS (no infinite loop) and shows an error", async () => {
    h.session.current = SESSION;
    // Three bounces = three hard-nav attempts.
    for (let i = 1; i <= 3; i++) {
      const inst = render(<AuthPage />);
      await waitFor(() => expect(h.hard).toHaveBeenCalledTimes(i));
      inst.unmount();
    }
    // Fourth /auth load: budget exhausted → NO fourth navigation, error surfaced.
    render(<AuthPage />);
    await waitFor(() => expect(screen.getByText(/couldn't be reached|please reload/i)).toBeTruthy());
    expect(h.hard).toHaveBeenCalledTimes(3);
  });

  it("a fresh explicit sign-in resets the bounce budget", async () => {
    // Exhaust the budget via bounces.
    h.session.current = SESSION;
    for (let i = 1; i <= 3; i++) {
      const inst = render(<AuthPage />);
      await waitFor(() => expect(h.hard).toHaveBeenCalledTimes(i));
      inst.unmount();
    }
    // Now a real sign-in submit should reset the budget and navigate again.
    h.session.current = null;
    h.signIn.mockResolvedValue({ error: null, session: SESSION });
    const { container } = render(<AuthPage />);
    fill(container);
    fireEvent.click(submitBtn(container));
    await waitFor(() => expect(h.hard).toHaveBeenCalledTimes(4));   // reset → navigates again
  });
});
