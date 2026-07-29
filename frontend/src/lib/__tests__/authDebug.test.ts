import { afterEach, describe, expect, it, vi } from "vitest";
import { authDebugEnabled, authLog, sessionShape, redactAuthDetail } from "../authDebug";

afterEach(() => vi.restoreAllMocks());

describe("authDebug — flag-gated, never leaks secrets", () => {
  it("is disabled in a windowless (SSR/test) environment", () => {
    expect(typeof window).toBe("undefined");
    expect(authDebugEnabled()).toBe(false);
  });

  it("authLog is a no-op when disabled (no console output)", () => {
    const spy = vi.spyOn(console, "debug").mockImplementation(() => {});
    authLog("API request started", { url: "/api/feed" });
    expect(spy).not.toHaveBeenCalled();
  });

  it("sessionShape exposes presence + length + expiry, never the token itself", () => {
    const shape = sessionShape({ access_token: "eyJreal.token.value", expires_at: 123 });
    expect(shape).toEqual({
      hasSession: true,
      hasAccessToken: true,
      accessTokenLength: "eyJreal.token.value".length,
      expiresAt: 123,
    });
    expect(JSON.stringify(shape)).not.toContain("eyJreal.token.value");
  });

  it("sessionShape handles a null session", () => {
    expect(sessionShape(null)).toEqual({
      hasSession: false, hasAccessToken: false, accessTokenLength: 0, expiresAt: null,
    });
  });

  it("redactAuthDetail strips credential-named keys and token-shaped values", () => {
    const jwt = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.sig-value";
    const redacted = redactAuthDetail({
      url: "/api/feed",
      access_token: jwt,
      authorization: `Bearer ${jwt}`,
      strayValue: jwt,          // token-shaped value under an innocuous key
      status: 200,
    });
    expect(redacted.url).toBe("/api/feed");
    expect(redacted.status).toBe(200);
    expect(redacted.access_token).toBe("[redacted]");
    expect(redacted.authorization).toBe("[redacted]");
    expect(redacted.strayValue).toBe("[redacted]");
    expect(JSON.stringify(redacted)).not.toContain("sig-value");
  });
});
