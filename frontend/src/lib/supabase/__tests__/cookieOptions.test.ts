import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Capture the args each factory passes to the real @supabase/ssr create fns,
// while PRESERVING the real module (so DEFAULT_COOKIE_OPTIONS stays authentic).
type CapturedOptions = { cookieOptions?: { secure?: boolean; name?: string } };

const h = vi.hoisted(() => ({
  browserArgs: [] as { url: string; key: string; options: Record<string, unknown> }[],
  serverArgs: [] as { url: string; key: string; options: Record<string, unknown> }[],
  browserInstances: 0,
}));

vi.mock("@supabase/ssr", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@supabase/ssr")>();
  return {
    ...actual,
    createBrowserClient: vi.fn((url: string, key: string, options: Record<string, unknown>) => {
      h.browserArgs.push({ url, key, options });
      h.browserInstances += 1;
      return { __instance: h.browserInstances };
    }),
    createServerClient: vi.fn((url: string, key: string, options: Record<string, unknown>) => {
      h.serverArgs.push({ url, key, options });
      return {};
    }),
  };
});

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({ getAll: () => [], set: () => {} })),
}));

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://proj.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-key");
  h.browserArgs.length = 0;
  h.serverArgs.length = 0;
  h.browserInstances = 0;
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

// The effective serialized-cookie contract is proven through the REAL installed
// @supabase/ssr pipeline in effectiveCookies.test.ts. This file keeps the
// SUPPLEMENTAL factory-option capture + browser-singleton coverage.

// ── Argus's secure decision is production-build-gated (supplemental capture) ──────

describe.each([
  ["production", true],
  ["test", false],
])("factory passes cookieOptions.secure gated on NODE_ENV — %s", (env, expectSecure) => {
  it("server factory: secure per env, only `secure`, no name/storage-key change", async () => {
    vi.resetModules();
    vi.stubEnv("NODE_ENV", env);
    h.serverArgs.length = 0;
    const { createClient } = await import("@/lib/supabase/server");
    await createClient();
    const { cookieOptions } = h.serverArgs.at(-1)!.options as CapturedOptions;
    expect(cookieOptions).toEqual({ secure: expectSecure });
    expect(cookieOptions?.name).toBeUndefined();
  });

  it("browser factory: secure per env, singleton, no name/storage-key change", async () => {
    vi.resetModules();
    vi.stubEnv("NODE_ENV", env);
    h.browserArgs.length = 0;
    h.browserInstances = 0;
    const mod = await import("@/lib/supabase/client");
    const a = mod.createClient();
    const b = mod.createClient();
    expect(a).toBe(b); // singleton preserved
    expect(h.browserArgs).toHaveLength(1); // createBrowserClient called exactly once
    const { cookieOptions } = h.browserArgs[0].options as CapturedOptions;
    expect(cookieOptions).toEqual({ secure: expectSecure });
    expect(cookieOptions?.name).toBeUndefined();
  });
});
