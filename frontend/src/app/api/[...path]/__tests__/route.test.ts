import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

// Hoisted state: cookie-session token + call counters so we can prove the
// transport guard runs BEFORE any Supabase session access.
const h = vi.hoisted(() => ({
  sessionToken: null as string | null,
  createClientCalls: 0,
  getSessionCalls: 0,
  // Raw Set-Cookie strings the Next route runtime would APPEND to the response
  // after the handler returns (framework glue from a getSession refresh/clear).
  pendingSetCookies: [] as string[],
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
  setCookies?: string[]; // multiple backend Set-Cookie values
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
    (step.setCookies ?? []).forEach((c) => outHeaders.append("set-cookie", c));
    return new Response(step.body ?? null, { status: step.status, headers: outHeaders });
  });
  vi.stubGlobal("fetch", fn);
  return { calls };
}

function ctx(path: string[]) {
  return { params: Promise.resolve({ path }) };
}

// The exact Phase 4 anti-cache policy every catch-all response must carry.
function expectAntiCache(res: Response) {
  expect(res.headers.get("cache-control")).toBe("private, no-cache, no-store, must-revalidate, max-age=0");
  expect(res.headers.get("expires")).toBe("0");
  expect(res.headers.get("pragma")).toBe("no-cache");
}

// Mimic the Next route runtime appending framework Set-Cookie mutations (from a
// getSession refresh/clear) to the response AFTER the handler returned.
function applyFrameworkCookies(res: NextResponse): NextResponse {
  for (const c of h.pendingSetCookies) res.headers.append("set-cookie", c);
  return res;
}

beforeEach(() => {
  h.sessionToken = null;
  h.createClientCalls = 0;
  h.getSessionCalls = 0;
  h.pendingSetCookies = [];
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

// ══ Phase 4 — uniform anti-cache policy on EVERY catch-all response ═════════════

const bearerReq = (path = "/api/feed/") =>
  new NextRequest(`http://localhost:3000${path}`, { headers: { authorization: "Bearer client-token" } });

describe("proxy route — Phase 4 anti-cache policy", () => {
  it("A. client-Bearer success → full policy, status/body/headers preserved", async () => {
    scriptedFetch([{ status: 200, body: '{"ok":true}', headers: { "content-type": "application/json", "x-argus-custom": "keep" } }]);
    const res = await GET(bearerReq(), ctx(["feed"]));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/json");
    expect(res.headers.get("x-argus-custom")).toBe("keep");
    expect(await res.text()).toBe('{"ok":true}');
    expectAntiCache(res);
  });

  it("B. no Bearer, no session, no cookie mutation → policy still unconditional", async () => {
    scriptedFetch([{ status: 200, body: "{}" }]);
    h.sessionToken = null; // fallback runs getSession, finds nothing
    const res = await GET(new NextRequest("http://localhost:3000/api/feed/"), ctx(["feed"]));
    expect(res.status).toBe(200);
    expect(h.getSessionCalls).toBe(1);
    expect(res.headers.getSetCookie()).toHaveLength(0);
    expectAntiCache(res);
  });

  it("C. cookie fallback WITH refresh → framework Set-Cookie + policy coexist", async () => {
    scriptedFetch([{ status: 200, body: "{}" }]);
    h.sessionToken = "refreshed-token"; // getSession refreshed
    h.pendingSetCookies = ["sb-proj-auth-token=fresh; Path=/; Secure; SameSite=Lax"];
    const res = applyFrameworkCookies(await GET(new NextRequest("http://localhost:3000/api/feed/"), ctx(["feed"])));
    expect(res.headers.getSetCookie().some((c) => c.startsWith("sb-proj-auth-token=fresh"))).toBe(true);
    expectAntiCache(res);
  });

  it("D. cookie fallback WITH session clearing → clearing Set-Cookie + policy coexist", async () => {
    scriptedFetch([{ status: 200, body: "{}" }]);
    h.sessionToken = null; // refresh failed → session cleared
    h.pendingSetCookies = ["sb-proj-auth-token=; Path=/; Max-Age=0; Secure"];
    const res = applyFrameworkCookies(await GET(new NextRequest("http://localhost:3000/api/feed/"), ctx(["feed"])));
    expect(res.headers.getSetCookie().some((c) => /sb-proj-auth-token=;.*Max-Age=0/i.test(c))).toBe(true);
    expectAntiCache(res);
  });

  it("E. backend unsafe cache directives are OVERWRITTEN with the policy", async () => {
    scriptedFetch([{
      status: 200,
      body: "{}",
      headers: {
        "cache-control": "public, max-age=3600",
        expires: "Wed, 21 Oct 2099 07:28:00 GMT",
        pragma: "something-else",
      },
    }]);
    const res = await GET(bearerReq(), ctx(["feed"]));
    expectAntiCache(res); // exact policy, not the backend's public/max-age/future-expires
  });

  it("F. multiple backend Set-Cookie values remain separate + policy coexists", async () => {
    scriptedFetch([{ status: 200, body: "{}", setCookies: ["a=1; Path=/", "b=2; Path=/", "c=3; Path=/"] }]);
    const res = await GET(bearerReq(), ctx(["feed"]));
    const cookies = res.headers.getSetCookie();
    expect(cookies).toEqual(["a=1; Path=/", "b=2; Path=/", "c=3; Path=/"]); // separate, ordered, no fold/dup/loss
    expectAntiCache(res);
  });

  it("G. backend Set-Cookie + normal response → cookie/body/headers preserved + policy", async () => {
    scriptedFetch([{ status: 201, body: '{"created":true}', headers: { "content-type": "application/json", "x-req-id": "abc" }, setCookies: ["sess=z; Path=/"] }]);
    const res = await GET(bearerReq(), ctx(["feed"]));
    expect(res.status).toBe(201);
    expect(await res.text()).toBe('{"created":true}');
    expect(res.headers.get("x-req-id")).toBe("abc");
    expect(res.headers.getSetCookie()).toEqual(["sess=z; Path=/"]);
    expectAntiCache(res);
  });

  it("H. backend fetch failure → normalized 502 + policy", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("ECONNREFUSED"); }));
    const res = await GET(bearerReq(), ctx(["feed"]));
    expect(res.status).toBe(502);
    expect((await res.json()).error).toMatch(/could not reach backend/i);
    expectAntiCache(res);
  });

  it("I. unsafe initial destination → normalized 502 + policy", async () => {
    scriptedFetch([{ status: 200, body: "{}" }]);
    vi.stubEnv("BACKEND_URL", "http://public-backend.example.com");
    vi.stubEnv("NODE_ENV", "production");
    const res = await GET(bearerReq(), ctx(["feed"]));
    expect(res.status).toBe(502);
    expect((await res.json()).error).toMatch(/not secure/i);
    expectAntiCache(res);
  });

  it("J. downgrade refusal → normalized 502 + policy", async () => {
    scriptedFetch([{ status: 307, location: "http://backend.example.com/api/feed/" }]);
    const res = await GET(bearerReq(), ctx(["feed"]));
    expect(res.status).toBe(502);
    expectAntiCache(res);
  });

  it("K. cross-host refusal → normalized 502 + policy", async () => {
    scriptedFetch([{ status: 302, location: "https://evil.example.com/steal" }]);
    const res = await GET(bearerReq(), ctx(["feed"]));
    expect(res.status).toBe(502);
    expectAntiCache(res);
  });

  it("L. malformed redirect → normalized 502 + policy", async () => {
    scriptedFetch([{ status: 307, location: "http://[" }]);
    const res = await GET(bearerReq(), ctx(["feed"]));
    expect(res.status).toBe(502);
    expectAntiCache(res);
  });

  it("M. redirect exhaustion → normalized 502 + policy", async () => {
    scriptedFetch([{ status: 307, location: "https://backend.example.com/api/feed/next" }]);
    const res = await GET(bearerReq(), ctx(["feed"]));
    expect(res.status).toBe(502);
    expectAntiCache(res);
  });

  it("N. missing BACKEND_URL → 503 + policy", async () => {
    scriptedFetch([{ status: 200, body: "{}" }]);
    vi.stubEnv("BACKEND_URL", "");
    vi.stubEnv("NODE_ENV", "production");
    const res = await GET(bearerReq(), ctx(["feed"]));
    expect(res.status).toBe(503);
    expectAntiCache(res);
  });

  it("O. forwarded 304 → status + headers preserved + policy", async () => {
    scriptedFetch([{ status: 304, headers: { "x-cache-tag": "v1" } }]);
    const res = await GET(bearerReq(), ctx(["feed"]));
    expect(res.status).toBe(304);
    expect(res.headers.get("x-cache-tag")).toBe("v1");
    expectAntiCache(res);
  });

  it("P. forwarded 3xx without Location → status + headers preserved + policy", async () => {
    scriptedFetch([{ status: 302, body: "moved", headers: { "x-note": "no-location" } }]);
    const res = await GET(bearerReq(), ctx(["feed"]));
    expect(res.status).toBe(302);
    expect(res.headers.get("x-note")).toBe("no-location");
    expectAntiCache(res);
  });

  it("Q. streaming preserved — route never buffers the backend body", async () => {
    // Backend response whose body-consuming methods THROW if the route calls them.
    const backendRes = new Response(
      new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode("streamed")); c.close(); } }),
      { status: 200, headers: { "content-type": "application/json", "x-custom": "keep" } },
    );
    const guard = backendRes as unknown as Record<string, () => never>;
    for (const m of ["text", "json", "arrayBuffer", "blob", "formData"]) {
      guard[m] = () => { throw new Error(`route buffered via ${m}()`); };
    }
    vi.stubGlobal("fetch", vi.fn(async () => backendRes));

    const res = await GET(bearerReq(), ctx(["feed"]));
    expect(res.status).toBe(200);
    expect(res.body).not.toBeNull(); // still a stream, passed through
    expect(res.headers.get("content-type")).toBe("application/json");
    expect(res.headers.get("x-custom")).toBe("keep");
    expectAntiCache(res);
    expect(await res.text()).toBe("streamed"); // the test (not the route) drains it
  });
});
