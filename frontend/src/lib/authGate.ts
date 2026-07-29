/**
 * lib/authGate.ts — the single rule for "may a protected query run yet?".
 *
 * A protected query may run ONLY once the initial auth resolution is complete
 * AND a session with an access token exists. This prevents the initial-session
 * race where feed/listen/industries fire before the session is available and
 * come back 401 (which then reads as an empty feed and makes the user click
 * Refresh/Sign In repeatedly). Pure so it is directly unit-testable.
 */

export interface AuthGateInput {
  authReady: boolean;
  accessToken?: string | null;
  session?: { access_token?: string | null } | null;
  /** True while a definitive-401 sign-out is in progress — hold all queries. */
  invalidatingSession?: boolean;
}

/**
 * The three lifecycle facts a protected hook needs — kept DISTINCT so a resolved
 * signed-out state is never confused with "still resolving". `isAuthWaiting` is
 * NOT `!enabled`: a query can be disabled because auth is still resolving
 * (waiting) OR because it resolved to no session / an invalidation (unauthenticated).
 */
export interface AuthedQueryState {
  enabled: boolean;
  isAuthWaiting: boolean;
  isUnauthenticated: boolean;
}

export function authedQueryState(input: AuthGateInput): AuthedQueryState {
  // 1. Auth still resolving → waiting (regardless of any stale token).
  if (!input.authReady) {
    return { enabled: false, isAuthWaiting: true, isUnauthenticated: false };
  }
  // 2. Definitive-401 teardown → unauthenticated even if an old token lingers.
  if (input.invalidatingSession) {
    return { enabled: false, isAuthWaiting: false, isUnauthenticated: true };
  }
  // 3. Resolved but no usable token → unauthenticated.
  const token = input.accessToken ?? input.session?.access_token ?? null;
  const hasToken = typeof token === "string" && token.length > 0;
  if (!hasToken) {
    return { enabled: false, isAuthWaiting: false, isUnauthenticated: true };
  }
  // 4. Resolved, token present, not invalidating → runnable.
  return { enabled: true, isAuthWaiting: false, isUnauthenticated: false };
}

/** Backward-compatible boolean gate (derived from the shared state helper). */
export function canRunAuthedQuery(input: AuthGateInput): boolean {
  return authedQueryState(input).enabled;
}
