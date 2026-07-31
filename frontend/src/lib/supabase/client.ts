import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Browser Supabase client — a PROCESS-WIDE SINGLETON.
 *
 * Every call must return the SAME instance. Creating multiple browser clients
 * spins up multiple GoTrue auth managers that each run their own token-refresh
 * timer against the same refresh token; they race, and the loser gets
 * `refresh_token_already_used`, which silently invalidates the session. That is
 * the root of the "have to click Sign In repeatedly" symptom and of protected
 * requests intermittently going out with a stale/empty token. One client =>
 * one refresh loop => one coherent session.
 */
let _client: SupabaseClient | null = null;

export function createClient(): SupabaseClient {
  if (_client) return _client;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    // Surface this clearly instead of letting fetch fail with a cryptic error
    throw new Error(
      "Supabase credentials not configured. " +
      "Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY " +
      "in .env.local (local) or your Vercel project environment variables (production).",
    );
  }

  _client = createBrowserClient(url, key, {
    // Production always marks the session cookie Secure (never inferred from
    // location.protocol). In production this is fail-closed: a page reached over
    // HTTP simply cannot persist the cookie. Dev/test omit Secure so local HTTP
    // keeps the session. Only `secure` is set — SameSite/HttpOnly/Path/Max-Age
    // and the storage key are left to the @supabase/ssr defaults.
    cookieOptions: {
      secure: process.env.NODE_ENV === "production",
    },
  });
  return _client;
}
