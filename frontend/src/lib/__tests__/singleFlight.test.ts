import { describe, expect, it, vi } from "vitest";
import { createSingleFlight } from "../singleFlight";

describe("createSingleFlight — one request for rapid repeated clicks (finding 6)", () => {
  it("collapses concurrent calls into a SINGLE underlying execution", async () => {
    const run = createSingleFlight<number>();
    let resolve!: (n: number) => void;
    const fn = vi.fn(() => new Promise<number>((r) => { resolve = r; }));

    const p1 = run(fn);
    const p2 = run(fn);   // rapid repeat click
    const p3 = run(fn);   // and another
    expect(fn).toHaveBeenCalledTimes(1);   // only one sign-in request issued

    resolve(7);
    expect(await p1).toBe(7);
    expect(await p2).toBe(7);
    expect(await p3).toBe(7);
  });

  it("allows a fresh execution after the previous one settles", async () => {
    const run = createSingleFlight<number>();
    const fn = vi.fn(async () => 1);
    await run(fn);
    await run(fn);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("clears in-flight state even when the call rejects (not stuck pending)", async () => {
    const run = createSingleFlight<number>();
    const fn = vi.fn(async () => { throw new Error("nope"); });
    await expect(run(fn)).rejects.toThrow("nope");
    await expect(run(fn)).rejects.toThrow("nope");
    expect(fn).toHaveBeenCalledTimes(2);
  });
});
