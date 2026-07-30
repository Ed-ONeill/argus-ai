// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { render, screen, fireEvent, waitFor, act, cleanup } from "@testing-library/react";

type Sess = { access_token: string; user: { id: string } } | null;

const h = vi.hoisted(() => ({
  signIn: vi.fn(),
  signUp: vi.fn(),
  session: { current: null as Sess },
  replace: vi.fn(),
  refresh: vi.fn(),
  push: vi.fn(),
  params: new URLSearchParams(""),
}));

vi.mock("@/context/AuthContext", () => ({
  useAuth: () => ({
    signIn: h.signIn, signUp: h.signUp,
    session: h.session.current, invalidatingSession: false,
  }),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: h.replace, refresh: h.refresh, push: h.push }),
  useSearchParams: () => h.params,
}));

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
  h.replace.mockReset();
  h.refresh.mockReset();
  h.session.current = null;
  h.params = new URLSearchParams("");
});
afterEach(() => cleanup());

describe("AuthPage — sign-in completion transition (single-flight + immediate navigation)", () => {
  it("one click calls signIn once and navigates once, even if session context is delayed", async () => {
    h.signIn.mockResolvedValue({ error: null, session: SESSION });
    h.session.current = null;   // context session update is delayed / never arrives
    const { container } = render(<AuthPage />);
    fill(container);
    fireEvent.click(submitBtn(container));

    await waitFor(() => expect(h.replace).toHaveBeenCalledWith("/"));
    expect(h.signIn).toHaveBeenCalledTimes(1);
    expect(h.replace).toHaveBeenCalledTimes(1);
  });

  it("navigates to the sanitized internal redirect target from the query", async () => {
    h.params = new URLSearchParams("redirect=/industries");
    h.signIn.mockResolvedValue({ error: null, session: SESSION });
    const { container } = render(<AuthPage />);
    fill(container);
    fireEvent.click(submitBtn(container));
    await waitFor(() => expect(h.replace).toHaveBeenCalledWith("/industries"));
    expect(h.replace).toHaveBeenCalledTimes(1);
  });

  it("a rapid second click does NOT make a second signIn request", async () => {
    let resolveSignIn!: (v: unknown) => void;
    h.signIn.mockImplementation(() => new Promise((r) => { resolveSignIn = r; }));
    const { container } = render(<AuthPage />);
    fill(container);
    const btn = submitBtn(container);
    fireEvent.click(btn);
    fireEvent.click(btn);   // rapid second click before the first resolves
    expect(h.signIn).toHaveBeenCalledTimes(1);

    await act(async () => { resolveSignIn({ error: null, session: SESSION }); });
    await waitFor(() => expect(h.replace).toHaveBeenCalledTimes(1));
    expect(h.signIn).toHaveBeenCalledTimes(1);
  });

  it("a delayed auth event does NOT cause a duplicate redirect", async () => {
    h.signIn.mockResolvedValue({ error: null, session: SESSION });
    const { container, rerender } = render(<AuthPage />);
    fill(container);
    fireEvent.click(submitBtn(container));
    await waitFor(() => expect(h.replace).toHaveBeenCalledTimes(1));

    // onAuthStateChange finally delivers the session to context → effect runs.
    h.session.current = SESSION;
    rerender(<AuthPage />);
    await act(async () => {});
    expect(h.replace).toHaveBeenCalledTimes(1);   // still exactly one navigation
  });

  it("failed signIn shows the sanitized error and does NOT navigate", async () => {
    h.signIn.mockResolvedValue({ error: { message: "Invalid login credentials" }, session: null });
    const { container } = render(<AuthPage />);
    fill(container);
    fireEvent.click(submitBtn(container));

    await waitFor(() => expect(screen.getByText(/incorrect email or password/i)).toBeTruthy());
    expect(h.replace).not.toHaveBeenCalled();
    expect(h.signIn).toHaveBeenCalledTimes(1);
  });

  it("disables the submit button and shows a signing-in state while pending", async () => {
    let resolveSignIn!: (v: unknown) => void;
    h.signIn.mockImplementation(() => new Promise((r) => { resolveSignIn = r; }));
    const { container } = render(<AuthPage />);
    fill(container);
    fireEvent.click(submitBtn(container));

    await waitFor(() => expect(submitBtn(container).disabled).toBe(true));
    expect(container.textContent).toMatch(/signing in/i);

    await act(async () => { resolveSignIn({ error: null, session: SESSION }); });
  });

  it("an already-present (restored) session navigates once via the fallback effect", async () => {
    h.session.current = SESSION;   // restored/external session on mount
    render(<AuthPage />);
    await waitFor(() => expect(h.replace).toHaveBeenCalledWith("/"));
    expect(h.replace).toHaveBeenCalledTimes(1);
    expect(h.signIn).not.toHaveBeenCalled();
  });
});
