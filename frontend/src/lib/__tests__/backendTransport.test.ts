import { describe, expect, it } from "vitest";
import {
  evaluateRedirect,
  isApprovedPrivateHttpHost,
  isRailwayInternalHost,
  isSafeInitialDestination,
  secureBackendFetch,
  transportPolicyFromEnv,
  type FetchImpl,
  type TransportPolicy,
} from "../backendTransport";

const PROD: TransportPolicy = { isProduction: true, privateHosts: [] };
const DEV: TransportPolicy = { isProduction: false, privateHosts: [] };
const PROD_WITH_LOCALHOST: TransportPolicy = { isProduction: true, privateHosts: ["localhost:8000"] };

// ── policy parsing ──────────────────────────────────────────────────────────────

describe("transportPolicyFromEnv", () => {
  it("reads production flag and comma-separated private host allowlist", () => {
    const p = transportPolicyFromEnv({
      NODE_ENV: "production",
      BACKEND_INTERNAL_HTTP_HOSTS: " Backend.internal:8000 , other.internal ",
    });
    expect(p.isProduction).toBe(true);
    expect(p.privateHosts).toEqual(["backend.internal:8000", "other.internal"]);
  });

  it("defaults to empty allowlist and dev when unset", () => {
    const p = transportPolicyFromEnv({});
    expect(p.isProduction).toBe(false);
    expect(p.privateHosts).toEqual([]);
  });
});

// ── private-host recognition ─────────────────────────────────────────────────────

describe("isRailwayInternalHost — exact dotted-suffix, not a substring", () => {
  it("accepts a real *.railway.internal host", () => {
    expect(isRailwayInternalHost("backend.railway.internal")).toBe(true);
    expect(isRailwayInternalHost("api-svc.railway.internal")).toBe(true);
  });
  it("rejects look-alikes and substrings", () => {
    expect(isRailwayInternalHost("railway.internal")).toBe(false);         // no service label
    expect(isRailwayInternalHost("evil-railway.internal.com")).toBe(false); // suffix not at end
    expect(isRailwayInternalHost("railway.internal.evil.com")).toBe(false);
    expect(isRailwayInternalHost("notrailwayinternal")).toBe(false);
  });
});

describe("isApprovedPrivateHttpHost", () => {
  it("matches an allowlisted hostname or hostname:port (case-insensitive)", () => {
    const policy: TransportPolicy = { isProduction: true, privateHosts: ["backend.internal", "svc.local:9000"] };
    expect(isApprovedPrivateHttpHost(new URL("http://backend.internal/x"), policy)).toBe(true);
    expect(isApprovedPrivateHttpHost(new URL("http://SVC.local:9000/x"), policy)).toBe(true);
    expect(isApprovedPrivateHttpHost(new URL("http://svc.local:9001/x"), policy)).toBe(false); // wrong port
  });
  it("matches Railway private domain without configuration", () => {
    expect(isApprovedPrivateHttpHost(new URL("http://backend.railway.internal:8000/x"), PROD)).toBe(true);
  });
});

// ── D. Initial-destination matrix ────────────────────────────────────────────────

describe("isSafeInitialDestination — initial authenticated destination", () => {
  it("HTTPS public host → allowed (prod and dev)", () => {
    expect(isSafeInitialDestination("https://api.example.com/api/feed", PROD)).toBe(true);
    expect(isSafeInitialDestination("https://api.example.com/api/feed", DEV)).toBe(true);
  });

  it("HTTP public host in production → rejected", () => {
    expect(isSafeInitialDestination("http://api.example.com/api/feed", PROD)).toBe(false);
  });

  it("approved private Railway/internal HTTP host → allowed", () => {
    expect(isSafeInitialDestination("http://backend.railway.internal:8000/api/feed", PROD)).toBe(true);
    const allow: TransportPolicy = { isProduction: true, privateHosts: ["backend.internal:8000"] };
    expect(isSafeInitialDestination("http://backend.internal:8000/api/feed", allow)).toBe(true);
  });

  it("localhost HTTP in development/test → allowed", () => {
    expect(isSafeInitialDestination("http://localhost:8000/api/feed", DEV)).toBe(true);
    expect(isSafeInitialDestination("http://127.0.0.1:8000/api/feed", DEV)).toBe(true);
  });

  it("localhost HTTP in production → rejected unless explicitly configured", () => {
    expect(isSafeInitialDestination("http://localhost:8000/api/feed", PROD)).toBe(false);
    expect(isSafeInitialDestination("http://localhost:8000/api/feed", PROD_WITH_LOCALHOST)).toBe(true);
  });

  it("malformed BACKEND_URL → rejected", () => {
    expect(isSafeInitialDestination("not-a-url", PROD)).toBe(false);
    expect(isSafeInitialDestination("http://", PROD)).toBe(false);
    expect(isSafeInitialDestination("", PROD)).toBe(false);
  });

  it("non-http(s) schemes → rejected", () => {
    expect(isSafeInitialDestination("ftp://api.example.com/x", PROD)).toBe(false);
    expect(isSafeInitialDestination("file:///etc/passwd", PROD)).toBe(false);
  });
});

// ── E. Redirect matrix ───────────────────────────────────────────────────────────

describe("evaluateRedirect — per-hop revalidation", () => {
  it("HTTPS same host → HTTPS same host → follow (bearer preserved)", () => {
    expect(evaluateRedirect("https://a.com/api/feed", "https://a.com/api/feed/", PROD).action).toBe("follow");
  });

  it("HTTPS same host → HTTP same host → rejected (downgrade)", () => {
    const d = evaluateRedirect("https://a.com/api/feed", "http://a.com/api/feed/", PROD);
    expect(d.action).toBe("reject");
    expect(d.reason).toBe("downgrade");
  });

  it("HTTPS host A → HTTPS host B → cross-host (no bearer)", () => {
    expect(evaluateRedirect("https://a.com/x", "https://b.com/x", PROD).action).toBe("cross-host");
  });

  it("private internal HTTP same host → same private internal HTTP → follow", () => {
    const d = evaluateRedirect(
      "http://svc.railway.internal/api/feed",
      "http://svc.railway.internal/api/feed/",
      PROD,
    );
    expect(d.action).toBe("follow");
  });

  it("approved private internal host → different host → cross-host", () => {
    expect(
      evaluateRedirect("http://a.railway.internal/x", "http://b.railway.internal/x", PROD).action,
    ).toBe("cross-host");
  });

  it("HTTP → HTTPS same host is an upgrade → follow (not a fix for an unsafe initial)", () => {
    expect(
      evaluateRedirect("http://svc.railway.internal/x", "https://svc.railway.internal/x", PROD).action,
    ).toBe("follow");
  });

  it("same-host HTTP→HTTP to a NON-approved public host is rejected", () => {
    // e.g. redirect stays same host but that host is public HTTP → unsafe destination
    const d = evaluateRedirect("http://public.example.com/x", "http://public.example.com/y", PROD);
    expect(d.action).toBe("reject");
    expect(d.reason).toBe("unsafe-destination");
  });

  it("redirect to malformed URL → rejected", () => {
    const d = evaluateRedirect("https://a.com/x", "http://[", PROD);
    expect(d.action).toBe("reject");
    expect(d.reason).toBe("malformed");
  });
});

// ── secureBackendFetch behavioral tests (F, G, and redirect following) ───────────

interface RecordedCall {
  url: string;
  auth: string | undefined;
}

function recordingFetch(script: Array<{ status: number; location?: string }>): {
  impl: FetchImpl;
  calls: RecordedCall[];
} {
  const calls: RecordedCall[] = [];
  let i = 0;
  const impl: FetchImpl = async (url, init) => {
    const headers = (init.headers ?? {}) as Record<string, string>;
    calls.push({ url, auth: headers.authorization });
    const step = script[Math.min(i, script.length - 1)];
    i += 1;
    const h = new Headers();
    if (step.location) h.set("location", step.location);
    return new Response(null, { status: step.status, headers: h });
  };
  return { impl, calls };
}

const AUTH_INIT = { method: "GET", headers: { authorization: "Bearer test-token" } };

describe("secureBackendFetch — transport enforcement", () => {
  it("F: unsafe initial destination makes ZERO backend fetches", async () => {
    const { impl, calls } = recordingFetch([{ status: 200 }]);
    const result = await secureBackendFetch("http://public.example.com/api/feed", AUTH_INIT, PROD, impl);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("unsafe-initial");
    expect(calls).toHaveLength(0);
  });

  it("safe HTTPS destination, no redirect → forwards with Authorization", async () => {
    const { impl, calls } = recordingFetch([{ status: 200 }]);
    const result = await secureBackendFetch("https://a.com/api/feed", AUTH_INIT, PROD, impl);
    expect(result.ok).toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0].auth).toBe("Bearer test-token");
  });

  it("safe same-host redirect PRESERVES Authorization on the followed hop", async () => {
    const { impl, calls } = recordingFetch([
      { status: 307, location: "https://a.com/api/feed/" },
      { status: 200 },
    ]);
    const result = await secureBackendFetch("https://a.com/api/feed", AUTH_INIT, PROD, impl);
    expect(result.ok).toBe(true);
    expect(calls).toHaveLength(2);
    expect(calls[1].url).toBe("https://a.com/api/feed/");
    expect(calls[1].auth).toBe("Bearer test-token"); // auth preserved across same-host redirect
  });

  it("G: HTTPS→HTTP downgrade redirect makes NO second fetch (bearer never sent to http)", async () => {
    const { impl, calls } = recordingFetch([
      { status: 307, location: "http://a.com/api/feed/" }, // downgrade
      { status: 200 },
    ]);
    const result = await secureBackendFetch("https://a.com/api/feed", AUTH_INIT, PROD, impl);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("downgrade");
    expect(calls).toHaveLength(1); // only the initial https fetch happened
    expect(calls.every((c) => c.url.startsWith("https://"))).toBe(true);
  });

  it("G: cross-host redirect makes NO second fetch and never forwards the bearer off-host", async () => {
    const { impl, calls } = recordingFetch([
      { status: 302, location: "https://evil.com/steal" },
      { status: 200 },
    ]);
    const result = await secureBackendFetch("https://a.com/api/feed", AUTH_INIT, PROD, impl);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("cross-host");
    expect(calls).toHaveLength(1);
    expect(calls.some((c) => c.url.includes("evil.com"))).toBe(false);
  });

  it("approved private-internal HTTP redirect (same host) is followed with auth", async () => {
    const { impl, calls } = recordingFetch([
      { status: 308, location: "http://svc.railway.internal/api/feed/" },
      { status: 200 },
    ]);
    const result = await secureBackendFetch("http://svc.railway.internal/api/feed", AUTH_INIT, PROD, impl);
    expect(result.ok).toBe(true);
    expect(calls).toHaveLength(2);
    expect(calls[1].auth).toBe("Bearer test-token");
  });

  it("redirect to a malformed Location is rejected without a further fetch", async () => {
    const { impl, calls } = recordingFetch([
      { status: 307, location: "http://[" },
      { status: 200 },
    ]);
    const result = await secureBackendFetch("https://a.com/api/feed", AUTH_INIT, PROD, impl);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("malformed");
    expect(calls).toHaveLength(1);
  });

  it("redirect exhaustion fails closed with a distinct error and bounded fetches", async () => {
    // Every hop redirects same-host https→https; the follower must FAIL CLOSED at
    // maxHops, never returning the still-redirecting response as success.
    const { impl, calls } = recordingFetch([{ status: 307, location: "https://a.com/next" }]);
    const result = await secureBackendFetch("https://a.com/api/feed", AUTH_INIT, PROD, impl, 5);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("too-many-redirects");
      expect(result.hops).toBe(5);
    }
    expect(calls).toHaveLength(6); // hops 0..5 inclusive, then stop — no 7th fetch
  });
});

// ── IPv6 loopback normalization (Codex fix #2) ───────────────────────────────────

describe("IPv6 loopback handling — WHATWG hostname is bracketed", () => {
  it("http://[::1]:8000 in development/test → allowed", () => {
    expect(isSafeInitialDestination("http://[::1]:8000/api/feed", DEV)).toBe(true);
  });

  it("http://[::1]:8000 in production → rejected unless explicitly allowlisted", () => {
    expect(isSafeInitialDestination("http://[::1]:8000/api/feed", PROD)).toBe(false);
  });

  it("explicitly allowlisted IPv6 loopback in production → allowed (bare ::1 or bracketed host:port)", () => {
    const bare: TransportPolicy = { isProduction: true, privateHosts: ["::1"] };
    expect(isSafeInitialDestination("http://[::1]:8000/api/feed", bare)).toBe(true);
    const bracketed: TransportPolicy = { isProduction: true, privateHosts: ["[::1]:8000"] };
    expect(isSafeInitialDestination("http://[::1]:8000/api/feed", bracketed)).toBe(true);
  });

  it("IPv4 loopback and localhost behavior is unchanged", () => {
    expect(isSafeInitialDestination("http://127.0.0.1:8000/api/feed", DEV)).toBe(true);
    expect(isSafeInitialDestination("http://127.0.0.1:8000/api/feed", PROD)).toBe(false);
    expect(isSafeInitialDestination("http://localhost:8000/api/feed", DEV)).toBe(true);
    expect(isSafeInitialDestination("http://localhost:8000/api/feed", PROD)).toBe(false);
  });
});
