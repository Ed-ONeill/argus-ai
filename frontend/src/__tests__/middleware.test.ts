import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

type Cookie = { name: string; value: string; options: Record<string, unknown> };
type Batch = { cookies: Cookie[]; headers?: Record<string, string> };
type MockConfig = {
  cookieOptions?: { secure?: boolean; name?: string };
  cookies: { setAll: (cookies: Cookie[], headers?: Record<string, string>) => void };
};

// Control Supabase behavior: what getUser() returns, the sequence of setAll
// batches it drives (one entry per setAll call), and capture the cookieOptions
// the middleware passes to createServerClient.
const m = vi.hoisted(() => ({
  user: null as { id: string } | null,
  batches: [] as Batch[],
  capturedCookieOptions: undefined as { secure?: boolean; name?: string } | undefined,
}));

vi.mock("@supabase/ssr", () => ({
  createServerClient: vi.fn((_url: string, _key: string, config: MockConfig) => {
    m.capturedCookieOptions = config.cookieOptions;
    return {
      auth: {
        getUser: vi.fn(async () => {
          for (const batch of m.batches) config.cookies.setAll(batch.cookies, batch.headers);
          return { data: { user: m.user } };
        }),
      },
    };
  }),
}));

import { middleware } from "@/middleware";

const ANTI_CACHE = {
  "Cache-Control": "private, no-cache, no-store, must-revalidate, max-age=0",
  Expires: "0",
  Pragma: "no-cache",
};
const opts = { path: "/", sameSite: "lax", httpOnly: false, secure: true, maxAge: 34560000 };
const delOpts = { path: "/", sameSite: "lax", httpOnly: false, secure: true, maxAge: 0 };

const req = (path = "/feed") => new NextRequest(`https://app.example.com${path}`);
const names = (setCookies: string[]) => setCookies.map((c) => c.split("=")[0]);

beforeEach(() => {
  m.user = null;
  m.batches = [];
  m.capturedCookieOptions = undefined;
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://proj.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-key");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("middleware — A. authenticated refresh preserves cookies + all three headers", () => {
  it("returns every refreshed cookie and Cache-Control, Expires, Pragma", async () => {
    m.user = { id: "u1" };
    m.batches = [{
      cookies: [
        { name: "sb-proj-auth-token", value: "fresh", options: opts },
        { name: "sb-proj-auth-token.0", value: "chunk0", options: opts },
      ],
      headers: ANTI_CACHE,
    }];

    const res = await middleware(req("/feed"));

    expect(names(res.headers.getSetCookie())).toEqual(
      expect.arrayContaining(["sb-proj-auth-token", "sb-proj-auth-token.0"]),
    );
    expect(res.headers.get("cache-control")).toBe(ANTI_CACHE["Cache-Control"]);
    expect(res.headers.get("expires")).toBe("0");
    expect(res.headers.get("pragma")).toBe("no-cache");
  });
});

describe("middleware — B. setAll then unauthenticated redirect retains cookies + headers", () => {
  it("the /auth redirect keeps the session-clearing cookie and all three headers", async () => {
    m.user = null; // getUser cleared the session
    m.batches = [{
      cookies: [{ name: "sb-proj-auth-token", value: "", options: delOpts }],
      headers: ANTI_CACHE,
    }];

    const res = await middleware(req("/feed"));

    expect(res.status).toBe(307);
    const location = res.headers.get("location") ?? "";
    expect(location).toContain("/auth");
    expect(location).toContain("redirect=%2Ffeed");
    expect(res.headers.getSetCookie().some((c) => c.startsWith("sb-proj-auth-token=") && /Max-Age=0/i.test(c))).toBe(true);
    expect(res.headers.get("cache-control")).toContain("no-store");
    expect(res.headers.get("expires")).toBe("0");
    expect(res.headers.get("pragma")).toBe("no-cache");
  });
});

describe("middleware — C. no setAll leaves the response unchanged", () => {
  it("adds no anti-cache headers and no Set-Cookie when no refresh occurred", async () => {
    m.user = { id: "u1" };
    m.batches = [];

    const res = await middleware(req("/feed"));

    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBeNull();
    expect(res.headers.get("expires")).toBeNull();
    expect(res.headers.get("pragma")).toBeNull();
    expect(res.headers.getSetCookie()).toHaveLength(0);
  });
});

describe("middleware — D. multiple cookies in one setAll reach the response, no duplicates", () => {
  it("every cookie appears exactly once", async () => {
    m.user = { id: "u1" };
    m.batches = [{
      cookies: [
        { name: "sb-a", value: "1", options: opts },
        { name: "sb-b", value: "2", options: opts },
        { name: "sb-c", value: "3", options: opts },
      ],
      headers: ANTI_CACHE,
    }];

    const res = await middleware(req("/feed"));

    const emitted = names(res.headers.getSetCookie()).sort();
    expect(emitted).toEqual(["sb-a", "sb-b", "sb-c"]);
    expect(new Set(emitted).size).toBe(3);
  });
});

describe("middleware — E. accumulation across MULTIPLE setAll calls (last-write-wins)", () => {
  // batch 1 sets A,B; batch 2 updates A and adds C. Final response must contain
  // untouched B, the updated A (once), the new C, no stale A, and all headers.
  const twoBatches: Batch[] = [
    {
      cookies: [
        { name: "sb-a", value: "v1", options: opts },
        { name: "sb-b", value: "v1", options: opts },
      ],
      headers: { "Cache-Control": "old", Expires: "0" },
    },
    {
      cookies: [
        { name: "sb-a", value: "v2", options: opts }, // supersedes batch-1 sb-a
        { name: "sb-c", value: "v1", options: opts }, // added
      ],
      headers: ANTI_CACHE, // latest header values win
    },
  ];

  function assertAccumulated(setCookies: string[], res: Response) {
    const a = setCookies.filter((c) => c.startsWith("sb-a="));
    expect(a).toHaveLength(1); // no duplicate stale version
    expect(a[0]).toContain("sb-a=v2"); // updated final value
    expect(setCookies.some((c) => c.startsWith("sb-b=v1"))).toBe(true); // untouched from batch 1
    expect(setCookies.some((c) => c.startsWith("sb-c=v1"))).toBe(true); // new in batch 2
    expect(setCookies.some((c) => c.startsWith("sb-a=v1"))).toBe(false); // stale gone
    expect(res.headers.get("cache-control")).toBe(ANTI_CACHE["Cache-Control"]); // latest header wins
    expect(res.headers.get("expires")).toBe("0");
    expect(res.headers.get("pragma")).toBe("no-cache");
  }

  it("authenticated response accumulates across both setAll calls", async () => {
    m.user = { id: "u1" };
    m.batches = twoBatches;
    const res = await middleware(req("/feed"));
    expect(res.status).toBe(200);
    assertAccumulated(res.headers.getSetCookie(), res);
  });

  it("unauthenticated redirect accumulates across both setAll calls", async () => {
    m.user = null;
    m.batches = twoBatches;
    const res = await middleware(req("/feed"));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/auth");
    assertAccumulated(res.headers.getSetCookie(), res);
  });
});

describe("middleware — F. Secure configuration is gated on NODE_ENV", () => {
  it("production passes cookieOptions { secure: true }", async () => {
    vi.stubEnv("NODE_ENV", "production");
    m.user = { id: "u1" };
    m.batches = [];
    await middleware(req("/feed"));
    expect(m.capturedCookieOptions).toEqual({ secure: true });
  });

  it("development/test passes cookieOptions { secure: false }", async () => {
    vi.stubEnv("NODE_ENV", "test");
    m.user = { id: "u1" };
    m.batches = [];
    await middleware(req("/feed"));
    expect(m.capturedCookieOptions).toEqual({ secure: false });
  });
});
