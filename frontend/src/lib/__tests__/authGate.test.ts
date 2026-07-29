import { describe, expect, it } from "vitest";
import { canRunAuthedQuery, authedQueryState } from "../authGate";

describe("authedQueryState — distinct waiting / unauthenticated / enabled", () => {
  it("authReady=false, no token → waiting, NOT unauthenticated, disabled", () => {
    expect(authedQueryState({ authReady: false, accessToken: null }))
      .toEqual({ enabled: false, isAuthWaiting: true, isUnauthenticated: false });
    // a lingering stale token while still resolving is still 'waiting'
    expect(authedQueryState({ authReady: false, accessToken: "stale" }))
      .toEqual({ enabled: false, isAuthWaiting: true, isUnauthenticated: false });
  });

  it("authReady=true, no token → unauthenticated, NOT waiting, disabled", () => {
    expect(authedQueryState({ authReady: true, accessToken: null }))
      .toEqual({ enabled: false, isAuthWaiting: false, isUnauthenticated: true });
    expect(authedQueryState({ authReady: true, accessToken: "" }))
      .toEqual({ enabled: false, isAuthWaiting: false, isUnauthenticated: true });
  });

  it("invalidatingSession=true (old token present) → unauthenticated, NOT waiting, disabled", () => {
    expect(authedQueryState({ authReady: true, accessToken: "old-token", invalidatingSession: true }))
      .toEqual({ enabled: false, isAuthWaiting: false, isUnauthenticated: true });
  });

  it("valid session → enabled, NOT waiting, NOT unauthenticated", () => {
    expect(authedQueryState({ authReady: true, accessToken: "tok" }))
      .toEqual({ enabled: true, isAuthWaiting: false, isUnauthenticated: false });
  });

  it("waiting is NOT derived from !enabled (the two are independent facts)", () => {
    const unauth = authedQueryState({ authReady: true, accessToken: null });
    expect(unauth.enabled).toBe(false);
    expect(unauth.isAuthWaiting).toBe(false);        // disabled, but NOT waiting
    expect(unauth.isUnauthenticated).toBe(true);
  });
});

describe("canRunAuthedQuery — the single gate for protected queries (finding 3)", () => {
  it("initial auth loading (authReady=false) → false: does NOT trigger /api/feed", () => {
    expect(canRunAuthedQuery({ authReady: false, accessToken: "tok" })).toBe(false);
    expect(canRunAuthedQuery({ authReady: false, accessToken: null })).toBe(false);
  });

  it("authReady with a token → true: a valid session triggers the query", () => {
    expect(canRunAuthedQuery({ authReady: true, accessToken: "tok" })).toBe(true);
  });

  it("authReady but missing/empty token → false: never an unauthenticated request", () => {
    expect(canRunAuthedQuery({ authReady: true, accessToken: null })).toBe(false);
    expect(canRunAuthedQuery({ authReady: true, accessToken: "" })).toBe(false);
    expect(canRunAuthedQuery({ authReady: true })).toBe(false);
  });

  it("reads the token from session.access_token too", () => {
    expect(canRunAuthedQuery({ authReady: true, session: { access_token: "tok" } })).toBe(true);
    expect(canRunAuthedQuery({ authReady: true, session: { access_token: null } })).toBe(false);
    expect(canRunAuthedQuery({ authReady: true, session: null })).toBe(false);
  });

  it("a restored session enables the query with no manual refresh", () => {
    // page reload → auth resolves with a restored session → gate opens once
    expect(canRunAuthedQuery({ authReady: true, accessToken: "restored-token" })).toBe(true);
  });
});
