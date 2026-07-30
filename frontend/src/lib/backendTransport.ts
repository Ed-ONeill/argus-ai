/**
 * lib/backendTransport.ts — secure transport validation for the authenticated
 * backend proxy (Phase 2, security-hardening backlog).
 *
 * The catch-all proxy (`app/api/[...path]/route.ts`) attaches a Supabase bearer
 * token to backend requests. A bearer must NEVER cross a plaintext hop. This
 * module answers three questions, all pure and network-free (no DNS):
 *
 *   1. isSafeInitialDestination(url, policy)
 *        Is this URL safe as the FIRST authenticated destination?
 *   2. evaluateRedirect(from, to, policy)
 *        Is a manually-followed redirect safe to follow WITH Authorization?
 *   3. isApprovedPrivateHttpHost(url, policy)
 *        Is this host an explicitly approved private internal endpoint?
 *
 * Transport rules
 * ---------------
 *   • HTTPS is always permitted.
 *   • HTTP is permitted ONLY for:
 *       - a host on the explicit allowlist (`BACKEND_INTERNAL_HTTP_HOSTS`), or
 *       - Railway's private-networking domain (`*.railway.internal`), which is
 *         a structurally non-internet-routable domain, or
 *       - loopback (localhost / 127.0.0.1 / ::1) in development/test ONLY
 *         (in production, loopback HTTP is refused unless explicitly allowlisted).
 *   • Any other HTTP host — i.e. public HTTP — fails closed.
 *   • A scheme downgrade (https → http) is rejected even on the same host.
 *   • A cross-host redirect never receives Authorization.
 *   • HTTP → HTTPS is treated as an upgrade of an ALREADY-safe request; it is
 *     never presented as a fix for an unsafe initial public-HTTP destination
 *     (the initial destination is validated independently, before any fetch).
 *   • Malformed URLs fail closed.
 *
 * Configuration contract (approved private internal HTTP)
 * -------------------------------------------------------
 *   BACKEND_INTERNAL_HTTP_HOSTS
 *     Comma-separated list of exact hosts (`hostname` or `hostname:port`) that
 *     are permitted over HTTP because they are private/internal (e.g. a Railway
 *     private-networking address, or a fixed internal load-balancer). Matching
 *     is exact and case-insensitive — never a substring test.
 *   `*.railway.internal`
 *     Recognized structurally (exact dotted-suffix, at a label boundary) as
 *     Railway private networking. This is a documented platform domain, not a
 *     hardcoded personal hostname.
 *
 * NOTE: passing source validation here does NOT prove the deployed backend is
 * actually private — the real Railway BACKEND_URL must be verified in production
 * (see the Phase 2 verification note in the backlog).
 */

export interface TransportPolicy {
  /** True in production — gates the loopback-HTTP development exception. */
  isProduction: boolean;
  /** Lowercased exact `hostname` or `hostname:port` entries allowed over HTTP. */
  privateHosts: string[];
}

/** Build a policy from environment variables (defaults to process.env). */
export function transportPolicyFromEnv(
  env: Record<string, string | undefined> = process.env,
): TransportPolicy {
  return {
    isProduction: env.NODE_ENV === "production",
    privateHosts: (env.BACKEND_INTERNAL_HTTP_HOSTS ?? "")
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  };
}

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0"]);
const RAILWAY_INTERNAL_SUFFIX = ".railway.internal";

function parseUrl(raw: string): URL | null {
  try {
    return new URL(raw);
  } catch {
    return null;
  }
}

/**
 * Normalize a URL hostname for comparison. WHATWG `URL.hostname` returns IPv6
 * addresses bracketed (e.g. `[::1]`); strip the brackets so they match bare
 * allowlist/loopback entries like `::1`. Lowercased. Deterministic, no other
 * transformation.
 */
function normalizeHostname(hostname: string): string {
  const h = hostname.toLowerCase();
  return h.startsWith("[") && h.endsWith("]") ? h.slice(1, -1) : h;
}

/** Exact dotted-suffix match at a label boundary — NOT a substring test. */
export function isRailwayInternalHost(host: string): boolean {
  const h = host.toLowerCase();
  return h.endsWith(RAILWAY_INTERNAL_SUFFIX) && h.length > RAILWAY_INTERNAL_SUFFIX.length;
}

/** Is this URL's host an explicitly approved private internal endpoint? */
export function isApprovedPrivateHttpHost(u: URL, policy: TransportPolicy): boolean {
  const hostname = normalizeHostname(u.hostname); // IPv6-bracket-normalized
  const hostWithPort = u.host.toLowerCase();      // WHATWG form, e.g. [::1]:8000
  if (policy.privateHosts.includes(hostname) || policy.privateHosts.includes(hostWithPort)) {
    return true;
  }
  return isRailwayInternalHost(hostname);
}

/** Is this URL safe to receive the FIRST authenticated request? */
export function isSafeInitialDestination(rawUrl: string, policy: TransportPolicy): boolean {
  const u = parseUrl(rawUrl);
  if (!u) return false; // malformed → fail closed
  if (u.protocol === "https:") return true;
  if (u.protocol !== "http:") return false; // no data:/ftp:/etc.
  if (isApprovedPrivateHttpHost(u, policy)) return true;
  if (LOOPBACK_HOSTS.has(normalizeHostname(u.hostname))) return !policy.isProduction;
  return false; // public HTTP → fail closed
}

export type RedirectAction = "follow" | "cross-host" | "reject";
export interface RedirectDecision {
  action: RedirectAction;
  reason?: "downgrade" | "unsafe-destination" | "malformed";
}

/**
 * Decide whether a manually-followed redirect may be re-issued WITH the same
 * Authorization header. Revalidates the destination on every hop.
 */
export function evaluateRedirect(
  fromUrl: string,
  toUrl: string,
  policy: TransportPolicy,
): RedirectDecision {
  const from = parseUrl(fromUrl);
  const to = parseUrl(toUrl);
  if (!from || !to) return { action: "reject", reason: "malformed" };
  // Host (hostname:port) must be identical, else the token must be withheld.
  if (to.host.toLowerCase() !== from.host.toLowerCase()) return { action: "cross-host" };
  // Scheme downgrade on the same host is never allowed.
  if (from.protocol === "https:" && to.protocol === "http:") {
    return { action: "reject", reason: "downgrade" };
  }
  // The destination must independently be a safe authenticated destination.
  if (!isSafeInitialDestination(to.toString(), policy)) {
    return { action: "reject", reason: "unsafe-destination" };
  }
  return { action: "follow" };
}

// ── Secure redirect-following fetch ─────────────────────────────────────────────

export type TransportError =
  | "unsafe-initial"
  | "cross-host"
  | "downgrade"
  | "unsafe-destination"
  | "malformed"
  | "too-many-redirects";

export interface SecureFetchInit {
  method: string;
  headers: Record<string, string>;
  body?: BodyInit;
  signal?: AbortSignal;
}

export type FetchImpl = (url: string, init: RequestInit) => Promise<Response>;

export type SecureFetchResult =
  | { ok: true; res: Response; hops: number }
  | { ok: false; error: TransportError; hops: number };

/**
 * Fetch that FOLLOWS same-host redirects manually so `Authorization` survives a
 * TLS-terminating edge (which `fetch(redirect:"follow")` would strip), while
 * refusing every UNSAFE hop:
 *   - the initial destination is validated before any request is sent;
 *   - cross-host, scheme-downgrade, unsafe-destination, and malformed redirects
 *     are refused BEFORE issuing the next request, so the bearer never reaches
 *     an unsafe URL;
 *   - the hop count is bounded by `maxHops`.
 *
 * `fetchImpl` is injected for testability (defaults to global `fetch`).
 */
export async function secureBackendFetch(
  startUrl: string,
  init: SecureFetchInit,
  policy: TransportPolicy,
  fetchImpl: FetchImpl = fetch,
  maxHops = 5,
): Promise<SecureFetchResult> {
  // (1) Validate the initial destination BEFORE any fetch — an unsafe public
  //     HTTP upstream must never receive the bearer, even on hop 0.
  if (!isSafeInitialDestination(startUrl, policy)) {
    return { ok: false, error: "unsafe-initial", hops: 0 };
  }

  let url = startUrl;
  for (let hop = 0; hop <= maxHops; hop++) {
    const res = await fetchImpl(url, { ...init, redirect: "manual" });
    const isRedirect = res.status >= 300 && res.status < 400;
    const loc = isRedirect ? res.headers.get("location") : null;
    if (!loc) return { ok: true, res, hops: hop };

    // Bounded: at the hop limit while STILL redirecting, fail closed. Do NOT
    // return the redirecting response as success — its unchecked `Location`
    // must never be forwarded to the browser, and no further fetch occurs.
    if (hop === maxHops) return { ok: false, error: "too-many-redirects", hops: hop };

    let nextUrl: string;
    try {
      nextUrl = new URL(loc, url).toString();
    } catch {
      return { ok: false, error: "malformed", hops: hop };
    }

    const decision = evaluateRedirect(url, nextUrl, policy);
    if (decision.action === "cross-host") return { ok: false, error: "cross-host", hops: hop };
    if (decision.action === "reject") {
      const error: TransportError =
        decision.reason === "downgrade" ? "downgrade"
          : decision.reason === "malformed" ? "malformed"
            : "unsafe-destination";
      return { ok: false, error, hops: hop };
    }
    // Safe same-host redirect → follow WITH Authorization intact.
    url = nextUrl;
  }

  // Unreachable (the loop returns), but fail closed if it ever falls through.
  return { ok: false, error: "unsafe-destination", hops: maxHops };
}
