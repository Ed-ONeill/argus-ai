/**
 * lib/authClient.ts — the ONE authenticated-request core for all protected
 * backend calls. Every protected request goes through authedFetch, so there is
 * a single place that:
 *   - attaches a FRESH `Authorization: Bearer <access_token>` obtained at call
 *     time (never a token captured in a closure);
 *   - refuses to issue a request with a missing/empty token;
 *   - on a 401, refreshes the session ONCE and retries ONCE, then gives up;
 *   - classifies outcomes so the UI can tell unauthenticated from API-failure
 *     from success.
 *
 * The transport, token provider, and refresher are injected, so the retry/
 * classification contract is unit-testable without a network or Supabase.
 */

import { authLog } from "./authDebug";

/** Returns the current access token, or null if there is no usable session. */
export type TokenProvider = () => Promise<string | null>;
/** Forces a session refresh and returns the new access token (or null). */
export type TokenRefresher = () => Promise<string | null>;

export interface AuthedFetchDeps {
  getToken: TokenProvider;
  refreshToken: TokenRefresher;
  /** Injectable for tests; defaults to global fetch. */
  fetchImpl?: typeof fetch;
}

/** No usable session — the caller must route the user to sign-in. */
export class UnauthorizedError extends Error {
  constructor(message = "Authentication required.") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

/** A non-401 API failure (5xx, 4xx other than 401, transport error surfaced upstream). */
export class ApiError extends Error {
  readonly status: number;
  readonly bodyText: string;
  constructor(status: number, bodyText: string) {
    super(`API ${status}`);
    this.name = "ApiError";
    this.status = status;
    this.bodyText = bodyText;
  }
}

function withAuth(init: RequestInit | undefined, token: string): RequestInit {
  const headers = new Headers(init?.headers);
  headers.set("Authorization", `Bearer ${token}`);
  return { ...init, headers };
}

/**
 * Issue an authenticated request.
 *
 * Contract:
 *   1. Obtain a token. If none → UnauthorizedError (NEVER send an empty token).
 *   2. Send with the Bearer header.
 *   3. On 401 → refresh once. If refresh yields no token → UnauthorizedError.
 *      Retry once with the refreshed token. A second 401 → UnauthorizedError.
 *   4. Otherwise return the Response (caller inspects .ok / status).
 */
export async function authedFetch(
  url: string,
  init: RequestInit | undefined,
  deps: AuthedFetchDeps,
): Promise<Response> {
  const doFetch = deps.fetchImpl ?? fetch;
  const method = init?.method ?? "GET";
  authLog("API request started", { url, method });

  const token = await deps.getToken();
  if (!token) {
    authLog("API request aborted — no access token", { url });
    throw new UnauthorizedError();
  }
  authLog("Authorization header attached", { url, hasToken: true, tokenLength: token.length });

  let res = await doFetch(url, withAuth(init, token));
  authLog(`API returned ${res.status}`, { url, status: res.status });
  if (res.status !== 401) return res;

  // One refresh + one retry — never an infinite loop.
  authLog("Session refresh attempted (after 401)", { url });
  const refreshed = await deps.refreshToken();
  if (!refreshed) {
    authLog("Session refresh failed — no new token", { url });
    throw new UnauthorizedError();
  }
  authLog("Session refresh succeeded — retrying once", { url, tokenLength: refreshed.length });

  res = await doFetch(url, withAuth(init, refreshed));
  authLog(`API returned ${res.status} (after retry)`, { url, status: res.status });
  if (res.status === 401) {
    authLog("Still 401 after retry — routing to sign-in", { url });
    throw new UnauthorizedError();
  }
  return res;
}

/**
 * Run an authed request and parse JSON, mapping outcomes to typed errors:
 *   - 401 (after the refresh+retry above already ran) → UnauthorizedError
 *   - other non-2xx → ApiError(status)
 *   - 2xx → parsed JSON
 */
export async function authedJson<T>(
  url: string,
  init: RequestInit | undefined,
  deps: AuthedFetchDeps,
): Promise<T> {
  const res = await authedFetch(url, init, deps);
  if (res.status === 401) throw new UnauthorizedError();   // defensive; authedFetch already guards
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new ApiError(res.status, text.slice(0, 300));
  }
  return res.json() as Promise<T>;
}
