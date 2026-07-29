import { describe, expect, it, vi } from "vitest";
import { authedFetch, authedJson, UnauthorizedError } from "../authClient";

/** Minimal Response-like mock (only the fields authedFetch/authedJson read). */
function res(status: number, body: unknown = {}): Response {
  return {
    status,
    ok: status >= 200 && status < 300,
    json: async () => body,
    text: async () => (typeof body === "string" ? body : JSON.stringify(body)),
  } as unknown as Response;
}

const asFetch = (fn: unknown) => fn as unknown as typeof fetch;

describe("authedFetch — token attach + 401 refresh/retry (findings 2 & 4)", () => {
  it("attaches Authorization: Bearer <token> and returns the response", async () => {
    const seen: string[] = [];
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      seen.push(new Headers(init?.headers).get("Authorization") ?? "");
      return res(200, { ok: true });
    });
    const r = await authedFetch("/api/feed", undefined, {
      getToken: async () => "tok-123",
      refreshToken: async () => "unused",
      fetchImpl: asFetch(fetchImpl),
    });
    expect(r.status).toBe(200);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(seen).toEqual(["Bearer tok-123"]);
  });

  it("NEVER issues a request with a missing/empty token → UnauthorizedError", async () => {
    const fetchImpl = vi.fn();
    await expect(authedFetch("/api/feed", undefined, {
      getToken: async () => null,
      refreshToken: async () => null,
      fetchImpl: asFetch(fetchImpl),
    })).rejects.toBeInstanceOf(UnauthorizedError);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("on 401 refreshes ONCE and retries ONCE with the refreshed token", async () => {
    const seen: string[] = [];
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      seen.push(new Headers(init?.headers).get("Authorization") ?? "");
      return res(seen.length === 1 ? 401 : 200, {});
    });
    const refreshToken = vi.fn(async () => "fresh-tok");
    const r = await authedFetch("/api/feed", undefined, {
      getToken: async () => "stale-tok",
      refreshToken,
      fetchImpl: asFetch(fetchImpl),
    });
    expect(r.status).toBe(200);
    expect(refreshToken).toHaveBeenCalledTimes(1);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(seen).toEqual(["Bearer stale-tok", "Bearer fresh-tok"]);
  });

  it("a SECOND 401 after retry → UnauthorizedError (no infinite loop)", async () => {
    const fetchImpl = vi.fn(async () => res(401, {}));
    await expect(authedFetch("/api/feed", undefined, {
      getToken: async () => "t1",
      refreshToken: async () => "t2",
      fetchImpl: asFetch(fetchImpl),
    })).rejects.toBeInstanceOf(UnauthorizedError);
    expect(fetchImpl).toHaveBeenCalledTimes(2);   // original + one retry, then stop
  });

  it("refresh yielding no token → UnauthorizedError, no retry attempted", async () => {
    const fetchImpl = vi.fn(async () => res(401, {}));
    await expect(authedFetch("/api/feed", undefined, {
      getToken: async () => "t1",
      refreshToken: async () => null,
      fetchImpl: asFetch(fetchImpl),
    })).rejects.toBeInstanceOf(UnauthorizedError);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});

describe("authedJson — outcome classification", () => {
  it("returns parsed JSON on success", async () => {
    const out = await authedJson<{ x: number }>("/api/feed", undefined, {
      getToken: async () => "t",
      refreshToken: async () => "t",
      fetchImpl: asFetch(async () => res(200, { x: 42 })),
    });
    expect(out).toEqual({ x: 42 });
  });

  it("non-401 failure → ApiError with the status (not a 401, not empty data)", async () => {
    await expect(authedJson("/api/feed", undefined, {
      getToken: async () => "t",
      refreshToken: async () => "t",
      fetchImpl: asFetch(async () => res(500, "boom")),
    })).rejects.toMatchObject({ name: "ApiError", status: 500 });
  });

  it("a 401 surfaces as UnauthorizedError — never as data/empty feed", async () => {
    await expect(authedJson("/api/feed", undefined, {
      getToken: async () => "t",
      refreshToken: async () => "t2",
      fetchImpl: asFetch(async () => res(401, {})),
    })).rejects.toBeInstanceOf(UnauthorizedError);
  });
});
