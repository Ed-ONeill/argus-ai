import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// Hoisted state: cookie-session token + call counters so we can prove the
// transport guard runs BEFORE any Supabase session access.
const h = vi.hoisted(() => ({
  sessionToken: null as string | null,
  createClientCalls: 0,
  getSessionCalls: 0,
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => {
    h.createClientCalls += 1;
    return {
      auth: {
        getSession: vi.fn(async () => {
          h.getSessionCalls += 1;
          return { data: { session: h.sessionToken ? { access_token: h.sessionToken } : null } };
        }),
      },
    };
  }),
}));

import { GET, POST } from "../route";

interface Step {
  status: number;
  location?: string;
  headers?: Record<string, string>;
  body?: string;
}
interface OutgoingCall {
  url: string;
  method: string;
  auth: string | undefined;
  body: unknown;
}

function bodyText(b: unknown): string {
  if (b == null) return "";
  if (typeof b === "string") return b;
  if (b instanceof ArrayBuffer) return new TextDecoder().decode(b);
  if (ArrayBuffer.isView(b)) return new TextDecoder().decode(b as ArrayBufferView);
  return String(b);
}

/** Install a scripted global fetch; step N answers call N (last step repeats). */
function scriptedFetch(steps: Step[]): { calls: OutgoingCall[] } {
  const calls: OutgoingCall[] = [];
  const fn = vi.fn(async (url: string, init: RequestInit) => {
    const headers = (init.headers ?? {}) as Record<string, string>;
    calls.push({ url, method: init.method ?? "GET", auth: headers.authorization, body: init.body });
    const step = steps[Math.min(calls.length - 1, steps.length - 1)];
    const outHeaders = new Headers(step.headers ?? {});
    if (step.location) outHeaders.set("location", step.location);
    return new Response(step.body ?? null, { status: step.status, headers: outHeaders });
  });
  vi.stubGlobal("fetch", fn);
  return { calls };
}

function ctx(path: string[]) {
  return { params: Promise.resolve({ path }) };
}

beforeEach(() => {
  h.sessionToken = null;
  h.createClientCalls = 0;
  h.getSessionCalls = 0;
  vi.stubEnv("BACKEND_URL", "https://backend.example.com");
  vi.stubEnv("NODE_ENV", "test");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

// ── auth forwarding preserved ─────────────────────────────────────────────────

describe("proxy route — auth forwarding preserved", () => {
  it("client-supplied Bearer takes precedence over the cookie session", async () => {
    const { calls } = scriptedFetch([{ status: 200, body: "{}" }]);
    h.sessionToken = "cookie-token"; // present but must be ignored
    const req = new NextRequest("http://localhost:3000/api/feed/", {
      headers: { authorization: "Bearer client-token" },
    });

    const res = await GET(req, ctx(["feed"]));

    expect(res.status).toBe(200);
    expect(calls).toHaveLength(1);
    expect(calls[0].url.startsWith("https://backend.example.com/api/feed")).toBe(true);
    expect(calls[0].auth).toBe("Bearer client-token");
  });

  it("cookie-session fallback is used when no client Bearer is present", async () => {
    const { calls } = scriptedFetch([{ status: 200, body: "{}" }]);
    h.sessionToken = "cookie-token";
    const req = new NextRequest("http://localhost:3000/api/feed/");

    const res = await GET(req, ctx(["feed"]));

    expect(res.status).toBe(200);
    expect(calls).toHaveLength(1);
    expect(calls[0].auth).toBe("Bearer cookie-token");
    expect(h.getSessionCalls).toBe(1);
  });
});

// ── A. Initial guard precedes session access ──────────────────────────────────

describe("proxy route — A. transport guard runs before session access", () => {
  it("unsafe public-HTTP destination in production → 502, no fetch, no createClient, no getSession", async () => {
    const { calls } = scriptedFetch([{ status: 200, body: "{}" }]);
    vi.stubEnv("BACKEND_URL", "http://public-backend.example.com");
    vi.stubEnv("NODE_ENV", "production");
    h.sessionToken = "cookie-token";
    const req = new NextRequest("http://localhost:3000/api/feed/", {
      headers: { authorization: "Bearer client-token" },
    });

    const res = await GET(req, ctx(["feed"]));

    expect(res.status).toBe(502);
    expect(calls).toHaveLength(0);
    expect(h.createClientCalls).toBe(0);
    expect(h.getSessionCalls).toBe(0);
    expect((await res.json()).error).toMatch(/not secure/i);
  });
});

// ── B. Safe same-host redirect preserves method + body + bearer ────────────────

describe("proxy route — B. safe 307/308 preserves request semantics", () => {
  it("POST body + method + Authorization survive a safe same-host 307", async () => {
    const { calls } = scriptedFetch([
      { status: 307, location: "https://backend.example.com/api/analyze/" },
      { status: 200, body: '{"ok":true}' },
    ]);
    const req = new NextRequest("http://localhost:3000/api/analyze", {
      method: "POST",
      body: "payload-bytes-123",
      headers: { authorization: "Bearer client-token", "content-type": "text/plain" },
    });

    const res = await POST(req, ctx(["analyze"]));

    expect(res.status).toBe(200);
    expect(calls).toHaveLength(2);
    // second (followed) hop preserved everything:
    expect(calls[1].url).toBe("https://backend.example.com/api/analyze/");
    expect(calls[1].method).toBe("POST");
    expect(calls[1].auth).toBe("Bearer client-token");
    expect(bodyText(calls[1].body)).toBe("payload-bytes-123");
    // and the same body was sent on the first hop too:
    expect(bodyText(calls[0].body)).toBe("payload-bytes-123");
  });
});

// ── C. Upstream response headers forwarded ─────────────────────────────────────

describe("proxy route — C. response headers forwarded", () => {
  it("Set-Cookie, Content-Type and a custom header pass through", async () => {
    scriptedFetch([
      {
        status: 200,
        body: '{"ok":true}',
        headers: {
          "set-cookie": "sb-session=xyz; Path=/; HttpOnly",
          "content-type": "application/json",
          "x-argus-custom": "hello",
        },
      },
    ]);
    const req = new NextRequest("http://localhost:3000/api/feed/", {
      headers: { authorization: "Bearer client-token" },
    });

    const res = await GET(req, ctx(["feed"]));

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/json");
    expect(res.headers.get("x-argus-custom")).toBe("hello");
    const setCookie = res.headers.getSetCookie?.() ?? [res.headers.get("set-cookie")].filter(Boolean);
    expect(setCookie.join(";")).toContain("sb-session=xyz");
  });
});

// ── D. Unsafe redirect through the route ───────────────────────────────────────

describe("proxy route — D. unsafe redirect → 502, Location not forwarded", () => {
  it("HTTPS→HTTP downgrade redirect: 502, single fetch, no forwarded Location", async () => {
    const { calls } = scriptedFetch([
      { status: 307, location: "http://backend.example.com/api/feed/" }, // downgrade
      { status: 200, body: "{}" },
    ]);
    const req = new NextRequest("http://localhost:3000/api/feed/", {
      headers: { authorization: "Bearer client-token" },
    });

    const res = await GET(req, ctx(["feed"]));

    expect(res.status).toBe(502);
    expect(calls).toHaveLength(1); // no second fetch to the http downgrade
    expect(res.headers.get("location")).toBeNull();
  });

  it("cross-host redirect: 502, single fetch, no forwarded Location", async () => {
    const { calls } = scriptedFetch([
      { status: 302, location: "https://evil.example.com/steal" },
      { status: 200, body: "{}" },
    ]);
    const req = new NextRequest("http://localhost:3000/api/feed/", {
      headers: { authorization: "Bearer client-token" },
    });

    const res = await GET(req, ctx(["feed"]));

    expect(res.status).toBe(502);
    expect(calls).toHaveLength(1);
    expect(calls.some((c) => c.url.includes("evil.example.com"))).toBe(false);
    expect(res.headers.get("location")).toBeNull();
  });
});

// ── E. Redirect exhaustion through the route ───────────────────────────────────

describe("proxy route — E. redirect exhaustion → 502, bounded, Location not forwarded", () => {
  it("endless safe same-host redirects hit the hop limit and fail closed", async () => {
    const { calls } = scriptedFetch([
      { status: 307, location: "https://backend.example.com/api/feed/next" },
    ]);
    const req = new NextRequest("http://localhost:3000/api/feed/", {
      headers: { authorization: "Bearer client-token" },
    });

    const res = await GET(req, ctx(["feed"]));

    expect(res.status).toBe(502);
    expect(calls).toHaveLength(6); // default maxHops=5 → hops 0..5, then stop
    expect(res.headers.get("location")).toBeNull();
  });
});
