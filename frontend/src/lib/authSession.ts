/**
 * lib/authSession.ts — Supabase-backed token providers for authedFetch, plus a
 * registerable "session is invalid" handler so low-level lib code can send the
 * user to sign-in without importing React/router (which would create cycles).
 */

import { createClient } from "@/lib/supabase/client";
import { authLog } from "@/lib/authDebug";
import type { TokenProvider, TokenRefresher } from "@/lib/authClient";

// Re-exported so callers keep a single import surface for the auth-session API.
export { setUnauthorizedHandler, notifyUnauthorized } from "@/lib/unauthorizedSignal";

/** Current access token from the live (auto-refreshing) browser session. */
export const getAccessToken: TokenProvider = async () => {
  const supabase = createClient();
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token ?? null;
  authLog("Access token requested", { available: !!token, tokenLength: token?.length ?? 0 });
  return token;
};

/** Force a one-shot refresh and return the new token (null if it failed). */
export const refreshAccessToken: TokenRefresher = async () => {
  const supabase = createClient();
  authLog("Session refresh attempted (Supabase)");
  const { data, error } = await supabase.auth.refreshSession();
  if (error) {
    authLog("Session refresh error", { failed: true });
    return null;
  }
  const token = data.session?.access_token ?? null;
  authLog("Session refresh result", { available: !!token, tokenLength: token?.length ?? 0 });
  return token;
};
