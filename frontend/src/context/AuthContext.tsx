"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { Session, User, AuthError } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";

// ── Types ─────────────────────────────────────────────────────────────────────

interface AuthContextValue {
  user:    User | null;
  session: Session | null;
  /** True while the initial session check is in flight. */
  loading: boolean;
  signUp:  (email: string, password: string, firstName?: string, lastName?: string) => Promise<AuthError | null>;
  signIn:  (email: string, password: string) => Promise<AuthError | null>;
  signOut: () => Promise<void>;
}

// ── Context ───────────────────────────────────────────────────────────────────

const AuthContext = createContext<AuthContextValue | null>(null);

// ── Provider ──────────────────────────────────────────────────────────────────

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user,    setUser]    = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  // One Supabase client for the lifetime of this provider
  const supabase = useMemo(() => createClient(), []);

  useEffect(() => {
    // 1. Hydrate from the existing cookie-based session on first mount
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    // 2. Keep in sync with any auth events (sign in, sign out, token refresh)
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, [supabase]);

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
  ): Promise<AuthError | null> {
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      return error;
    } catch (thrown) {
      const message = thrown instanceof Error ? thrown.message : "Unexpected error during sign-in.";
      return { message, name: "AuthError", status: 0 } as AuthError;
    }
  }

  async function signOut() {
    await supabase.auth.signOut();
  }

  return (
    <AuthContext.Provider
      value={{ user, session, loading, signUp, signIn, signOut }}
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
