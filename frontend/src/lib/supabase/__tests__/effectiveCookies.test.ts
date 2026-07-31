import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createServerClient } from "@supabase/ssr";
import { NextResponse } from "next/server";

/**
 * Effective serialized-cookie contract driven through the REAL installed
 * @supabase/ssr cookie pipeline (no manual DEFAULT_COOKIE_OPTIONS merge). We give
 * the real createServerClient a capturing cookie adapter + cookieOptions:{secure},
 * trigger real auth events (setSession → SET, signOut → DELETE) that make the
 * package produce set/chunked/delete cookie mutations, then serialize each emitted
 * cookie with Next's real serializer and assert the attributes.
 */

const URL_ = "https://proj.supabase.co";
const KEY = "anon-key";
const STORAGE_KEY = "sb-proj-auth-token";

type Captured = { name: string; value: string; options: Record<string, unknown> };

function capturingAdapter(seed: { name: string; value: string }[] = []) {
  const captured: Captured[] = [];
  return {
    captured,
    adapter: {
      getAll: () => seed,
      setAll: (cookies: Captured[]) => { captured.push(...cookies); },
    },
  };
}

function serialize(c: Captured): string {
  const res = NextResponse.next();
  res.cookies.set(c.name, c.value, c.options);
  return res.headers.getSetCookie()[0];
}

function b64url(obj: unknown): string {
  return Buffer.from(JSON.stringify(obj)).toString("base64url");
}
function fakeJwt(big: boolean): string {
  const header = b64url({ alg: "HS256", typ: "JWT" });
  const payload = b64url({
    sub: "user-1",
    aud: "authenticated",
    role: "authenticated",
    exp: Math.floor(Date.now() / 1000) + 3600, // not expired → no refresh network call
    ...(big ? { padding: "x".repeat(4500) } : {}), // force chunking (> ~3180 chars)
  });
  return `${header}.${payload}.sig`;
}

const flush = () => new Promise((r) => setTimeout(r, 20));

async function realSetCookies(secure: boolean, big: boolean): Promise<Captured[]> {
  // setSession (non-expired token) calls GET /auth/v1/user; stub it so the SET
  // path completes deterministically without a real network.
  vi.stubGlobal("fetch", vi.fn(async (input: unknown) => {
    const url = String(typeof input === "string" ? input : (input as Request).url);
    if (url.includes("/auth/v1/user")) {
      return new Response(
        JSON.stringify({ id: "user-1", aud: "authenticated", role: "authenticated", app_metadata: {}, user_metadata: {}, created_at: "1970-01-01T00:00:00Z" }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    return new Response("{}", { status: 200 });
  }));

  const { captured, adapter } = capturingAdapter();
  const supabase = createServerClient(URL_, KEY, { cookieOptions: { secure }, cookies: adapter });
  await supabase.auth.setSession({ access_token: fakeJwt(big), refresh_token: "refresh-token" });
  await flush();
  return captured;
}

async function realDeleteCookies(secure: boolean): Promise<Captured[]> {
  // Seed chunked cookies so signOut's storage removal produces DELETE cookies for
  // each chunk through the real pipeline (no active session → no network).
  const { captured, adapter } = capturingAdapter([
    { name: `${STORAGE_KEY}.0`, value: "seed0" },
    { name: `${STORAGE_KEY}.1`, value: "seed1" },
  ]);
  const supabase = createServerClient(URL_, KEY, { cookieOptions: { secure }, cookies: adapter });
  await supabase.auth.signOut();
  await flush();
  return captured;
}

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", URL_);
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", KEY);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe.each([
  ["production", true],
  ["development/test", false],
])("real @supabase/ssr pipeline — %s (secure=%s)", (_label, secure) => {
  it("SET cookies (normal) carry the expected attributes", async () => {
    const captured = await realSetCookies(secure, false);
    const setCookies = captured.filter((c) => c.value !== "").map(serialize);
    expect(setCookies.length).toBeGreaterThan(0);
    for (const c of setCookies) {
      expect(/;\s*Secure(?:;|$)/i.test(c)).toBe(secure);
      expect(/;\s*SameSite=Lax/i.test(c)).toBe(true);
      expect(/;\s*Path=\//i.test(c)).toBe(true);
      expect(/;\s*HttpOnly/i.test(c)).toBe(false);
      expect(c).toContain("Max-Age=");
    }
  });

  it("SET cookies (chunked, large session) each carry the expected attributes", async () => {
    const captured = await realSetCookies(secure, true);
    const chunks = captured.filter((c) => /\.\d+$/.test(c.name));
    expect(chunks.length).toBeGreaterThan(1); // proves real chunking happened
    for (const c of chunks.map(serialize)) {
      expect(/;\s*Secure(?:;|$)/i.test(c)).toBe(secure);
      expect(/;\s*SameSite=Lax/i.test(c)).toBe(true);
      expect(/;\s*Path=\//i.test(c)).toBe(true);
      expect(/;\s*HttpOnly/i.test(c)).toBe(false);
    }
  });

  it("DELETE cookies (chunked removal) carry Secure per env and Max-Age=0", async () => {
    const captured = await realDeleteCookies(secure);
    const deletions = captured.filter((c) => c.value === "");
    expect(deletions.length).toBeGreaterThan(0);
    for (const c of deletions.map(serialize)) {
      expect(/;\s*Secure(?:;|$)/i.test(c)).toBe(secure);
      expect(/;\s*SameSite=Lax/i.test(c)).toBe(true);
      expect(/;\s*Path=\//i.test(c)).toBe(true);
      expect(/;\s*HttpOnly/i.test(c)).toBe(false);
      expect(c).toContain("Max-Age=0");
    }
  });
});
