import { describe, expect, it } from "vitest";
import {
  profileIdentityKey, classifyProfileResult, shouldClearSessionOnProfileOutcome,
} from "../profileLoad";

describe("profileIdentityKey — one fetch per user identity (finding 5)", () => {
  it("is STABLE across a token refresh (same id, new user object)", () => {
    const beforeRefresh = { id: "user-1" };
    const afterRefresh  = { id: "user-1" };   // new object, same identity
    expect(profileIdentityKey(beforeRefresh)).toBe(profileIdentityKey(afterRefresh));
    expect(profileIdentityKey(afterRefresh)).toBe("user-1");
  });

  it("changes when the user actually changes", () => {
    expect(profileIdentityKey({ id: "user-1" }))
      .not.toBe(profileIdentityKey({ id: "user-2" }));
  });

  it("is null when signed out", () => {
    expect(profileIdentityKey(null)).toBeNull();
    expect(profileIdentityKey(undefined)).toBeNull();
  });
});

describe("classifyProfileResult", () => {
  it("row present → loaded", () => {
    expect(classifyProfileResult({ data: { id: "u1" }, error: null })).toBe("loaded");
  });
  it("no row → empty", () => {
    expect(classifyProfileResult({ data: null, error: null })).toBe("empty");
  });
  it("a returned error (e.g. 400) → error", () => {
    expect(classifyProfileResult({ data: null, error: { code: "400", message: "bad" } })).toBe("error");
  });
});

describe("a profile failure NEVER invalidates the session (finding 5)", () => {
  it("no outcome — including error — clears the session", () => {
    for (const outcome of ["loaded", "empty", "error"] as const) {
      expect(shouldClearSessionOnProfileOutcome(outcome)).toBe(false);
    }
  });
});
