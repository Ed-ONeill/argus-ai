import { afterEach, describe, expect, it, vi } from "vitest";
import { setUnauthorizedHandler, notifyUnauthorized } from "../unauthorizedSignal";

afterEach(() => setUnauthorizedHandler(null));

describe("unauthorizedSignal — second 401 routes the user to sign-in (finding 4)", () => {
  it("invokes the registered handler exactly once per notify", () => {
    const handler = vi.fn();
    setUnauthorizedHandler(handler);
    notifyUnauthorized();
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("is a no-op when nothing is registered (does not throw)", () => {
    setUnauthorizedHandler(null);
    expect(() => notifyUnauthorized()).not.toThrow();
  });

  it("swallows handler errors so a fetch path never breaks", () => {
    setUnauthorizedHandler(() => { throw new Error("boom"); });
    expect(() => notifyUnauthorized()).not.toThrow();
  });

  it("uses the latest registered handler", () => {
    const first = vi.fn();
    const second = vi.fn();
    setUnauthorizedHandler(first);
    setUnauthorizedHandler(second);
    notifyUnauthorized();
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });
});
