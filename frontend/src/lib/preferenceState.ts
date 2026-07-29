/**
 * lib/preferenceState.ts — pure, framework-free logic for loading user
 * preferences safely across identity changes. Extracted from useUserPreferences
 * so the reset-on-user-change and stale-request-drop behavior is unit-testable
 * without a React/DOM environment. The hook drives this loader; this module is
 * the single source of truth for the state transitions.
 */

import type { UserPrefs } from "./feedRanker";

export const DEFAULT_PREFS: UserPrefs = {
  followed_themes:        [],
  followed_sectors:       [],
  followed_asset_classes: [],
  user_role:              "",
  region_focus:           "",
};

/** Raw row shape returned by the user_preferences query (all nullable). */
export interface PrefsRow {
  followed_themes:        string[] | null;
  followed_sectors:       string[] | null;
  followed_asset_classes: string[] | null;
  user_role:              string   | null;
  region_focus:           string   | null;
}

/**
 * Sanitized, low-cardinality load status. Safe to emit in diagnostics — it
 * never carries a Supabase/PostgREST error code, message, hint, or any raw
 * response content.
 *   idle    — no active fetch (auth resolving, or signed out)
 *   loading — a fetch is in flight
 *   loaded  — a preferences row was returned and applied
 *   empty   — the query legitimately returned no row (defaults retained)
 *   failed  — the query returned an error, or the request threw/rejected
 */
export type PreferenceLoadStatus = "idle" | "loading" | "loaded" | "empty" | "failed";

/** The terminal classification of a settled request. */
export type PrefResultKind = Extract<PreferenceLoadStatus, "loaded" | "empty" | "failed">;

export interface PrefState {
  prefs:   UserPrefs;
  ready:   boolean;
  loading: boolean;
  status:  PreferenceLoadStatus;
}

/**
 * Pure classifier for a Supabase single-row response. This is the actual
 * production contract used by the hook, so tests can cover it directly. It
 * inspects ONLY the presence of `error` and `data` — it never reads any field
 * of the error, so no message/code/hint can leak downstream.
 */
export function classifyPrefResult(
  result: { data: PrefsRow | null; error: unknown | null },
): PrefResultKind {
  if (result.error != null) return "failed";   // any Supabase/PostgREST error
  if (result.data == null) return "empty";      // legitimate no-row
  return "loaded";
}

/** Settled outcome shape of the preferences query (data XOR error). */
export interface PrefQueryResult {
  data:  PrefsRow | null;
  error: unknown | null;
}

/** Minimal structural view of the Supabase query builder we depend on. */
interface EqStep     { maybeSingle(): Promise<PrefQueryResult>; }
interface SelectStep { eq(column: string, value: string): EqStep; }
interface FromStep   { select(columns: string): SelectStep; }
export interface PrefQuerySource { from(table: string): FromStep; }

/** The exact column projection the hook reads. */
export const PREF_COLUMNS =
  "followed_themes, followed_sectors, followed_asset_classes, user_role, region_focus";

/**
 * Build and run the user_preferences query — the single production query path,
 * used by the real hook. It MUST use maybeSingle() (zero rows → success with
 * null data), never single() (zero rows → PGRST116 error). Extracted so the
 * query contract is directly unit-testable with a mock builder.
 */
export function queryUserPreferences(db: PrefQuerySource, userId: string): Promise<PrefQueryResult> {
  return db.from("user_preferences").select(PREF_COLUMNS).eq("user_id", userId).maybeSingle();
}

/** Normalize a nullable DB row into a fully-populated UserPrefs. */
export function applyLoadedPrefs(row: PrefsRow): UserPrefs {
  return {
    followed_themes:        row.followed_themes        ?? [],
    followed_sectors:       row.followed_sectors       ?? [],
    followed_asset_classes: row.followed_asset_classes ?? [],
    user_role:              row.user_role              ?? "",
    region_focus:           row.region_focus           ?? "",
  };
}

function arrEq(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

/** Value-equality of two preference sets (no derivation is exposed). */
function prefsEqual(a: UserPrefs, b: UserPrefs): boolean {
  return arrEq(a.followed_themes, b.followed_themes)
    && arrEq(a.followed_sectors, b.followed_sectors)
    && arrEq(a.followed_asset_classes, b.followed_asset_classes)
    && a.user_role === b.user_role
    && a.region_focus === b.region_focus;
}

/**
 * Authoritative loader for one hook instance. Guarantees:
 *  - identity change resets to DEFAULT_PREFS and ready=false BEFORE any load,
 *    so no previous user's preferences can bleed into a new context;
 *  - a fetch that resolves after the identity has changed (or logged out) is
 *    dropped — it can never write stale preferences;
 *  - signed-out becomes ready=true with defaults only after auth resolution.
 */
export class PreferenceLoader {
  private state: PrefState = { prefs: DEFAULT_PREFS, ready: false, loading: false, status: "idle" };
  private activeUserId: string | null = null;
  // Monotonic "preference state changed" counter. It encodes NOTHING about the
  // preference values — it only advances when the effective preferences
  // materially change (a load settling to new prefs, or an identity reset that
  // clears prior prefs). Stale requests and status-only changes never advance
  // it. Starts at 0 for the initial/default state.
  private revision = 0;

  get snapshot(): PrefState {
    return this.state;
  }

  /** Opaque change counter — safe to emit; reveals no preference content. */
  get preferenceRevision(): number {
    return this.revision;
  }

  /**
   * Central state transition. Bumps the revision ONLY on a material prefs value
   * change — a status-only change (e.g. loading → failed with defaults retained)
   * never advances it.
   */
  private commit(prefs: UserPrefs, ready: boolean, loading: boolean,
                 status: PreferenceLoadStatus): void {
    if (!prefsEqual(prefs, this.state.prefs)) this.revision += 1;
    this.state = { prefs, ready, loading, status };
  }

  /**
   * Register the current (settled or in-transition) identity. Always resets to
   * a clean slate. Returns the userId whose preferences should be fetched, or
   * null when no fetch is warranted (auth still resolving, or signed out).
   */
  beginIdentity(authLoading: boolean, userId: string | null): string | null {
    this.activeUserId = userId;
    if (authLoading) { this.commit(DEFAULT_PREFS, false, false, "idle"); return null; }  // not settled
    if (!userId) { this.commit(DEFAULT_PREFS, true, false, "idle"); return null; }       // signed out: final
    this.commit(DEFAULT_PREFS, false, true, "loading");
    return userId;
  }

  /**
   * Apply a successfully loaded preferences row (status "loaded"). Ignored
   * (returns false) if the active identity has changed since the request began
   * — the stale result is dropped and never advances the revision.
   */
  resolve(requestUserId: string, row: PrefsRow): boolean {
    if (requestUserId !== this.activeUserId) return false;
    this.commit(applyLoadedPrefs(row), true, false, "loaded");
    return true;
  }

  /**
   * Settle a legitimate no-row result (status "empty"): retain DEFAULT_PREFS,
   * mark ready. Distinct from a failure. Ignored if the identity has changed.
   */
  empty(requestUserId: string): boolean {
    if (requestUserId !== this.activeUserId) return false;
    this.commit(DEFAULT_PREFS, true, false, "empty");
    return true;
  }

  /**
   * Settle a FAILED request (Supabase error object, or a promise rejection /
   * thrown network error) as status "failed" WITHOUT accepting or storing any
   * raw error content: retain DEFAULT_PREFS, mark ready. Ignored if the active
   * identity has changed (a stale failure can't touch the new user).
   */
  fail(requestUserId: string): boolean {
    if (requestUserId !== this.activeUserId) return false;
    this.commit(DEFAULT_PREFS, true, false, "failed");
    return true;
  }
}
