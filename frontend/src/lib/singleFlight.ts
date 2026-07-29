/**
 * lib/singleFlight.ts — collapse concurrent calls into ONE in-flight execution.
 *
 * Used to make the Sign In button submit exactly once: while a sign-in request
 * is pending, every additional click returns the SAME promise instead of firing
 * a duplicate request. Pure and framework-free, so it is unit-testable.
 */
export function createSingleFlight<T>() {
  let inflight: Promise<T> | null = null;

  return function run(fn: () => Promise<T>): Promise<T> {
    if (inflight) return inflight;          // a call is already running → share it
    inflight = (async () => {
      try {
        return await fn();
      } finally {
        inflight = null;                    // allow the next distinct submission
      }
    })();
    return inflight;
  };
}
