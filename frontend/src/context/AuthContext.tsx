"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import type { Session, User, AuthError } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { setUnauthorizedHandler } from "@/lib/authSession";
import { authLog, sessionShape } from "@/lib/authDebug";

// ── Types ─────────────────────────────────────────────────────────────────────

interface SignInResult {
  error: AuthError | null;
  /** The session established by a successful sign-in (null on failure). */
  session: Session | null;
}

interface AuthContextValue {
  user:    User | null;
  session: Session | null;
  /** The current access token, or null when there is no usable session. */
  accessToken: string | null;
  /** True while the INITIAL session resolution is in flight. */
  authLoading: boolean;
  /** Back-compat alias of authLoading. */
  loading: boolean;
  /**
   * True once Supabase has completed the initial session resolution. Gate all
   * protected requests / signed-in UI on this — a cached user/avatar is NOT
   * proof of a usable session.
   */
  authReady: boolean;
  /**
   * True while a definitive-401 sign-out is in progress. While true, app pages
   * must not render authenticated content and the auth page must not redirect
   * based on the (about-to-be-cleared) old session.
   */
  invalidatingSession: boolean;
  /**
   * Sanitized initialization status — set when the initial session resolution
   * failed (getSession rejected/threw/returned malformed data). Never contains a
   * token or raw Supabase response content. authReady still becomes true so the
   * app settles into a signed-out state rather than hanging.
   */
  authInitError: string | null;
  signUp:  (email: string, password: string, firstName?: string, lastName?: string) => Promise<AuthError | null>;
  signIn:  (email: string, password: string) => Promise<SignInResult>;
  signOut: () => Promise<void>;
}

// ── Context ───────────────────────────────────────────────────────────────────

const AuthContext = createContext<AuthContextValue | null>(null);

// ── Provider ──────────────────────────────────────────────────────────────────

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user,      setUser]      = useState<User | null>(null);
  const [session,   setSession]   = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [authInitError, setAuthInitError] = useState<string | null>(null);
  const [invalidatingSession, setInvalidatingSession] = useState(false);
  // Guards against duplicate concurrent definitive-401 handlers → one signOut.
  const invalidatingRef = useRef(false);
  const router = useRouter();

  // One Supabase client for the lifetime of this provider (and process — the
  // browser client is a singleton, so this is THE session authority).
  const supabase = useMemo(() => createClient(), []);

  useEffect(() => {
    let active = true;
    // Monotonic guard so the NEWEST authoritative update wins. If an auth event
    // arrives before the initial getSession() resolves, the event bumps `gen`
    // and the later (stale) getSession result is ignored.
    const genRef = { current: 0 };

    // A VALID session must carry a non-empty access token AND a user object with
    // a non-empty string id. Anything missing / wrong-typed is NOT a valid
    // session (it is a malformed init failure, distinct from "no session").
    const isValidSession = (s: unknown): s is Session => {
      if (!s || typeof s !== "object") return false;
      const obj = s as Record<string, unknown>;
      if (typeof obj.access_token !== "string" || obj.access_token.length === 0) return false;
      const u = obj.user;
      if (!u || typeof u !== "object") return false;
      const uid = (u as Record<string, unknown>).id;
      return typeof uid === "string" && uid.length > 0;
    };

    const applyAuth = (nextSession: Session | null, gen: number) => {
      if (!active) return;
      if (gen < genRef.current) return;   // a newer update already won → drop stale
      genRef.current = gen;
      setSession(nextSession);
      setUser(nextSession?.user ?? null);
      setAuthReady(true);                 // initial resolution has settled
    };

    const fail = (gen: number) => {
      // No raw error / response / token / session is logged or stored.
      if (active) setAuthInitError("Session initialization failed.");
      authLog("Initial session resolution failed — settling signed-out");
      applyAuth(null, gen);
    };

    // Keep in sync with sign in / out / token refresh. Events are always newer
    // than the in-flight getSession, so they take a higher generation. An event
    // session is applied only if valid; otherwise it settles signed-out.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, evtSession) => {
      authLog(`Auth state changed: ${event}`, sessionShape(evtSession));
      applyAuth(isValidSession(evtSession) ? evtSession : null, genRef.current + 1);
    });

    // Resolve the existing session. ALWAYS settle authReady. getSession returns
    // { data, error }; classify explicitly (issue 3):
    //   - non-null error                     → init failure
    //   - malformed envelope / session       → init failure
    //   - data.session == null               → legitimate signed-out (no error)
    //   - data.session valid                 → restored
    const sessionGen = genRef.current;
    (async () => {
      try {
        const res = await supabase.auth.getSession();
        const err = (res as { error?: unknown } | null | undefined)?.error;
        if (err != null) { fail(sessionGen); return; }             // error wins

        const data = (res as { data?: unknown } | null | undefined)?.data;
        if (!data || typeof data !== "object") { fail(sessionGen); return; }  // malformed envelope

        const raw = (data as { session?: unknown }).session;
        if (raw == null) {                                          // legitimate signed-out
          authLog("No session on initial resolution", sessionShape(null));
          applyAuth(null, sessionGen);
          return;
        }
        if (!isValidSession(raw)) { fail(sessionGen); return; }     // present but malformed

        authLog("Session restored", sessionShape(raw));
        applyAuth(raw, sessionGen);
      } catch {
        fail(sessionGen);   // reject or synchronous throw
      }
    })();

    return () => { active = false; subscription.unsubscribe(); };
  }, [supabase]);

  // React Query cache isolation across identities is provided ENTIRELY by the
  // QUERY KEYS — there is NO global cache clear on identity change (a clear would
  // race a direct A→B transition and discard B's freshly-started query, leaving
  // the observer pending). User-scoped queries embed the user id in their key, so
  // a B consumer reads a B key and can never synchronously read A's cache:
  //   - useSaved      → ["saved", user.id]
  //   - useWatchlist  → ["watchlist", user.id]
  // A's now-inactive entries are bounded by React Query's normal gcTime.
  // Global MARKET-INTELLIGENCE queries are intentionally SHARED (identical for
  // every authenticated user — personalization is client-side only), so
  // cross-user reads are not a leak and must NOT be cleared on account switch:
  //   - ["feed", …] (useFeed, useSectors), ["feed-freshness", …], ["listen", …],
  //     ["listen-rails"], ["intelligence","network"], ["market-data"],
  //     ["ipo-pipeline"], ["explorer-market", …].

  // Register the invalid-session handler used by the shared API client: on a
  // definitive 401 (after refresh+retry) tear the session down cleanly. The
  // handler is single-flight (simultaneous 401s cause ONE signOut) and AWAITS
  // signOut + clears local state BEFORE routing to /auth, so a stale session can
  // never bounce the auth page back into the app mid-cleanup.
  useEffect(() => {
    setUnauthorizedHandler(async () => {
      if (invalidatingRef.current) return;   // already tearing down → dedup
      invalidatingRef.current = true;
      setInvalidatingSession(true);
      try {
        authLog("Definitive 401 — invalidating session");
        await supabase.auth.signOut();
      } catch {
        // Even if signOut fails, we still clear local state and land on /auth.
        authLog("signOut failed during invalidation — clearing locally anyway");
      } finally {
        setSession(null);
        setUser(null);
        router.replace("/auth");
        setInvalidatingSession(false);
        invalidatingRef.current = false;
        authLog("Session invalidation complete — routed to /auth");
      }
    });
    return () => setUnauthorizedHandler(null);
  }, [supabase, router]);

  // ── Auth actions ────────────────────────────────────────────────────────────

  async function signUp(
    email: string,
    password: string,
    firstName?: string,
    lastName?: string,
  ): Promise<AuthError | null> {
    try {
      const first = firstName?.trim();
      const last  = lastName?.trim();
      const full  = [first, last].filter(Boolean).join(" ");
      const { error } = await supabase.auth.signUp({
        email,
        password,
        ...(first || last
          ? { options: { data: { first_name: first ?? "", last_name: last ?? "", full_name: full } } }
          : {}),
      });
      return error;
    } catch (thrown) {
      const message = thrown instanceof Error ? thrown.message : "Unexpected error during sign-up.";
      return { message, name: "AuthError", status: 0 } as AuthError;
    }
  }

  async function signIn(
    email: string,
    password: string,
  ): Promise<SignInResult> {
    try {
      authLog("Sign in requested");
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      authLog("Sign in result", { ok: !error, ...sessionShape(data?.session) });
      // Reflect the new session immediately so consumers gate correctly even
      // before onAuthStateChange fires.
      if (data?.session) {
        setSession(data.session);
        setUser(data.session.user);
        setAuthReady(true);
      }
      return { error, session: data?.session ?? null };
    } catch (thrown) {
      const message = thrown instanceof Error ? thrown.message : "Unexpected error during sign-in.";
      return { error: { message, name: "AuthError", status: 0 } as AuthError, session: null };
    }
  }

  async function signOut() {
    await supabase.auth.signOut();
  }

  const accessToken = session?.access_token ?? null;

  return (
    <AuthContext.Provider
      value={{
        user, session, accessToken,
        authLoading: !authReady, loading: !authReady, authReady,
        invalidatingSession, authInitError,
        signUp, signIn, signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
