import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";

// Harness that connects the mutable next/headers cookies() state to the response:
//  - real server.ts createClient (spied, so we can assert call count)
//  - @supabase/ssr mocked so exchangeCodeForSession drives server.ts's real
//    setAll -> cookieStore.set, writing into `jar` (the cookies() state)
//  - next/headers cookies() backed by `jar`
//  - after GET, applyCookieGlue applies jar -> the returned response, exactly as
//    the Next runtime applies cookie mutations to a route's response.
const H = vi.hoisted(() => ({
  jar: new Map<string, { name: string; value: string; options: Record<string, unknown> }>(),
  fail: false,
  exchangeCalls: 0,
}));

vi.mock("@/lib/supabase/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/supabase/server")>();
  return { createClient: vi.fn(actual.createClient) };
});

type MockConfig = {
  cookies: {
    setAll: (
      cookies: { name: string; value: string; options: Record<string, unknown> }[],
      headers?: Record<string, string>,
    ) => void;
  };
};

vi.mock("@supabase/ssr", () => ({
  createServerClient: vi.fn((_url: string, _key: string, config: MockConfig) => ({
    auth: {
      exchangeCodeForSession: vi.fn(async () => {
        H.exchangeCalls += 1;
        if (H.fail) return { error: { message: "invalid code" } };
        // server.ts's setAll writes these into cookieStore (jar); the second-arg
        // headers are intentionally dropped by server.ts (Phase 3 design).
        config.cookies.setAll(
          [{
            name: "sb-proj-auth-token",
            value: "session-jwt",
            options: { path: "/", sameSite: "lax", httpOnly: false, secure: true, maxAge: 34560000 },
          }],
          { "Cache-Control": "private, no-store", Expires: "0", Pragma: "no-cache" },
        );
        return { error: null };
      }),
    },
  })),
}));

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    getAll: () => [...H.jar.values()].map((c) => ({ name: c.name, value: c.value })),
    set: (name: string, value: string, options: Record<string, unknown>) => {
      H.jar.set(name, { name, value, options });
    },
  })),
}));

import { GET } from "../route";
import { createClient } from "@/lib/supabase/server";

const ORIGIN = "https://app.example.com";

// Mimic the Next runtime applying cookies() mutations to the route's response.
function applyCookieGlue(res: NextResponse): NextResponse {
  for (const c of H.jar.values()) res.cookies.set(c.name, c.value, c.options);
  return res;
}

beforeEach(() => {
  H.jar.clear();
  H.fail = false;
  H.exchangeCalls = 0;
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://proj.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-key");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("auth callback — success", () => {
  it("returned redirect carries Set-Cookie, Location, and all three anti-cache headers", async () => {
    const res = applyCookieGlue(await GET(new Request(`${ORIGIN}/auth/callback?code=abc&next=%2Ffeed`)));

    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe(`${ORIGIN}/feed`);
    // Set-Cookie is on the ACTUAL returned response (via cookies() glue):
    expect(res.headers.getSetCookie().some((c) => c.startsWith("sb-proj-auth-token=session-jwt"))).toBe(true);
    // full anti-cache set (added by the callback route on its owned response):
    expect(res.headers.get("cache-control")).toBe("private, no-cache, no-store, must-revalidate, max-age=0");
    expect(res.headers.get("expires")).toBe("0");
    expect(res.headers.get("pragma")).toBe("no-cache");
    expect(createClient).toHaveBeenCalledTimes(1);
    expect(H.exchangeCalls).toBe(1);
  });
});

describe("auth callback — failure / no-code (unchanged, no false success)", () => {
  it("exchange error → /auth?error=auth_failed, no Set-Cookie, not the success target", async () => {
    H.fail = true;
    const res = applyCookieGlue(await GET(new Request(`${ORIGIN}/auth/callback?code=abc&next=%2Ffeed`)));

    expect(res.headers.get("location")).toBe(`${ORIGIN}/auth?error=auth_failed`);
    expect(res.headers.get("location")).not.toContain("/feed");
    expect(res.headers.getSetCookie()).toHaveLength(0);
    expect(H.exchangeCalls).toBe(1);
  });

  it("no code → /auth?error=auth_failed, no Set-Cookie, createClient + exchange never called", async () => {
    const res = applyCookieGlue(await GET(new Request(`${ORIGIN}/auth/callback`)));

    expect(res.headers.get("location")).toBe(`${ORIGIN}/auth?error=auth_failed`);
    expect(res.headers.getSetCookie()).toHaveLength(0);
    expect(createClient).not.toHaveBeenCalled();
    expect(H.exchangeCalls).toBe(0);
  });
});
