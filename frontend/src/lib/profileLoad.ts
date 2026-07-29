/**
 * lib/profileLoad.ts — pure helpers for the profile fetch contract, so the
 * "once per identity", "empty vs error", and "a profile failure never clears
 * the session" rules are unit-testable and shared with useProfile.
 */

/**
 * The stable identity a profile fetch is keyed on. It depends ONLY on the user
 * id, so a token refresh (which produces a new user OBJECT with the same id)
 * does not change the key — the profile query therefore runs once per user
 * identity, not on every refresh/render. This is the fix for the repeated
 * `profiles?select=…` 400 loop.
 */
export function profileIdentityKey(user: { id?: string | null } | null | undefined): string | null {
  return user?.id ?? null;
}

export type ProfileOutcome = "loaded" | "empty" | "error";

/** Classify a Supabase maybeSingle() profile response. */
export function classifyProfileResult(
  result: { data: unknown | null; error: unknown | null },
): ProfileOutcome {
  if (result.error != null) return "error";   // operational/RLS/network fault
  if (result.data == null) return "empty";     // no profile row yet
  return "loaded";
}

/**
 * A profile-fetch failure must NEVER invalidate an otherwise-valid Supabase
 * session. This is always false — the session's validity is independent of
 * whether the profile row could be read.
 */
export function shouldClearSessionOnProfileOutcome(_outcome: ProfileOutcome): boolean {
  return false;
}
