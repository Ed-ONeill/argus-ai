/**
 * lib/authTiming.ts — TEMPORARY sign-in timing instrumentation.
 *
 * Emits one traceable timeline per sign-in attempt so we can see WHERE the delay
 * is: before signInWithPassword(), during the Supabase request, or after success.
 * Each attempt gets a short id; every mark logs performance.now() deltas
 * (t = since attempt start, dt = since previous mark). NEVER logs credentials,
 * email, token, or session — only structural booleans and the internal target.
 *
 * Remove once the sign-in responsiveness issue is resolved.
 */

export type SigninMark = (
  event: string,
  extra?: Record<string, string | number | boolean>,
) => void;

export function startSigninTrace(): SigninMark {
  const id = Math.random().toString(36).slice(2, 8);
  const t0 = typeof performance !== "undefined" ? performance.now() : Date.now();
  let last = t0;
  return function mark(event, extra) {
    const now = typeof performance !== "undefined" ? performance.now() : Date.now();
    const t = (now - t0).toFixed(1);
    const dt = (now - last).toFixed(1);
    last = now;
    const suffix = extra
      ? " " + Object.entries(extra).map(([k, v]) => `${k}=${v}`).join(" ")
      : "";
    // eslint-disable-next-line no-console
    console.log(`[signin-timing] attempt=${id} event=${event} t=+${t}ms dt=+${dt}ms${suffix}`);
  };
}
