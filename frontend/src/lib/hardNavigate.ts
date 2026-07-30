/**
 * lib/hardNavigate.ts — a real, full-document navigation.
 *
 * Used for the sign-in → app transition. A soft App Router navigation
 * (router.replace) issues an RSC request (`/?_rsc=…`) that races the Supabase
 * SSR cookie write, so the middleware's server-side getUser() does not yet see
 * the new session and 307-bounces back to /auth. A hard navigation issues a
 * fresh top-level request AFTER the browser has committed cookies, so the
 * middleware reads the established session and serves the protected page.
 *
 * `replace` (not `assign`) so /auth is not left in the back-history.
 * Extracted so the transition is unit-testable by mocking this module.
 */
export function hardNavigate(url: string): void {
  if (typeof window !== "undefined") {
    window.location.replace(url);
  }
}
