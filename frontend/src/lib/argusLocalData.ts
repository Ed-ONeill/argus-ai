// lib/argusLocalData.ts — clear the Argus-owned device-local caches on THIS browser.
//
// Used after account deletion. It only ever touches keys inside the app's own "argus" namespace
// (prefix `argus_` / `argus:`) — never another site's storage, and never the Supabase auth cookie
// (that is cleared by signOut()). Device-local caches on OTHER browsers/devices are not reachable
// from here and are disclosed as such in the Privacy Policy.

const KNOWN_KEYS = [
  "argus_saved_ids",
  "argus_saved_items",
  "argus_watchlist",
  "argus:followed-themes",
  "argus_onboarding_v1",
  "argus_terminal_settings",
];

export function clearArgusLocalData(): void {
  if (typeof window === "undefined") return;
  try {
    for (const k of KNOWN_KEYS) window.localStorage.removeItem(k);
    // Sweep any remaining Argus-namespaced keys (theme watchlist / memory / diagnostics caches).
    for (let i = window.localStorage.length - 1; i >= 0; i--) {
      const key = window.localStorage.key(i);
      if (key && /^argus[_:]/i.test(key)) window.localStorage.removeItem(key);
    }
  } catch {
    // localStorage unavailable (private mode / disabled) — nothing to clear.
  }
}
