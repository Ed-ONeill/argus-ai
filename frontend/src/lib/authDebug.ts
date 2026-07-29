/**
 * lib/authDebug.ts — TEMPORARY, flag-gated auth-flow tracing.
 *
 * Prints the sequence of the auth → API path (state changes, session restore,
 * token availability, request start, header attach, response status, refresh
 * attempts) so the live flow can be verified WITHOUT exposing secrets. It never
 * logs a token, refresh token, or Authorization value — only booleans, lengths,
 * and expiry timestamps. A defensive sanitizer redacts anything token-shaped
 * even if a caller passes it by mistake.
 *
 * Enabled: automatically in development, or in any build via `?authdebug=1` /
 * localStorage `argus:authdebug=1`. Safe to leave in place behind this flag; to
 * remove, delete this file and its `authLog(...)` call sites.
 */

export function authDebugEnabled(): boolean {
  // No server/SSR/test spam — only trace in the browser.
  if (typeof window === "undefined") return false;
  try {
    if (new URLSearchParams(window.location.search).get("authdebug") === "1") return true;
    if (window.localStorage.getItem("argus:authdebug") === "1") return true;
  } catch {
    /* ignore access errors */
  }
  return process.env.NODE_ENV !== "production";   // dev builds: on by default
}

// Redact anything that looks like a JWT or bearer value, and drop any field
// whose key names a credential — belt-and-suspenders so a token can never leak.
const _SECRET_KEY = /(^|_)(access_token|refresh_token|token|authorization|bearer|password|secret|apikey|api_key)$/i;
const _JWT = /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/;

export function redactAuthDetail(detail: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(detail)) {
    if (_SECRET_KEY.test(k)) { out[k] = "[redacted]"; continue; }
    if (typeof v === "string" && (_JWT.test(v) || /^Bearer\s/i.test(v))) { out[k] = "[redacted]"; continue; }
    out[k] = v;
  }
  return out;
}

export function authLog(event: string, detail?: Record<string, unknown>): void {
  if (!authDebugEnabled()) return;
  // eslint-disable-next-line no-console
  if (detail) console.debug(`[argus:auth] ${event}`, redactAuthDetail(detail));
  // eslint-disable-next-line no-console
  else console.debug(`[argus:auth] ${event}`);
}

/** Non-sensitive descriptor of a session: presence + token length + expiry. */
export function sessionShape(session: { access_token?: string | null; expires_at?: number | null } | null | undefined) {
  return {
    hasSession: !!session,
    hasAccessToken: !!session?.access_token,
    accessTokenLength: session?.access_token ? session.access_token.length : 0,
    expiresAt: session?.expires_at ?? null,
  };
}
