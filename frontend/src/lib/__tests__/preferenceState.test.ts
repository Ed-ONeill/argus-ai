import { describe, expect, it } from "vitest";
import {
  PreferenceLoader, DEFAULT_PREFS, classifyPrefResult, queryUserPreferences,
  type PrefsRow, type PrefQuerySource, type PrefQueryResult,
} from "../preferenceState";

const rowFor = (label: string): PrefsRow => ({
  followed_themes:        [`${label}-theme`],
  followed_sectors:       [`${label}-sector`],
  followed_asset_classes: [],
  user_role:              `${label}-role`,
  region_focus:           `${label}-region`,
});

describe("PreferenceLoader — reset & stale-drop across identity changes (finding 3)", () => {
  it("auth resolving → not settled (ready=false, defaults)", () => {
    const l = new PreferenceLoader();
    const fetchId = l.beginIdentity(/* authLoading */ true, null);
    expect(fetchId).toBeNull();
    expect(l.snapshot.ready).toBe(false);
    expect(l.snapshot.prefs).toEqual(DEFAULT_PREFS);
  });

  it("signed out → ready=true with defaults only after auth resolution", () => {
    const l = new PreferenceLoader();
    expect(l.beginIdentity(false, null)).toBeNull();
    expect(l.snapshot.ready).toBe(true);
    expect(l.snapshot.prefs).toEqual(DEFAULT_PREFS);
  });

  it("signed-in user loads its own preferences", () => {
    const l = new PreferenceLoader();
    const fetchId = l.beginIdentity(false, "A");
    expect(fetchId).toBe("A");
    expect(l.snapshot.ready).toBe(false);      // not ready until resolved
    expect(l.snapshot.loading).toBe(true);
    l.resolve("A", rowFor("A"));
    expect(l.snapshot.ready).toBe(true);
    expect(l.snapshot.prefs.user_role).toBe("A-role");
  });

  it("user A → user B resets to defaults and readiness drops during the transition", () => {
    const l = new PreferenceLoader();
    l.beginIdentity(false, "A");
    l.resolve("A", rowFor("A"));
    expect(l.snapshot.prefs.followed_themes).toEqual(["A-theme"]);

    // switch to B
    const fetchB = l.beginIdentity(false, "B");
    expect(fetchB).toBe("B");
    expect(l.snapshot.ready).toBe(false);                 // not ready mid-transition
    expect(l.snapshot.prefs).toEqual(DEFAULT_PREFS);      // A's prefs gone immediately
    l.resolve("B", rowFor("B"));
    expect(l.snapshot.prefs.followed_themes).toEqual(["B-theme"]);
  });

  it("user A → logout clears A's preferences and settles with defaults", () => {
    const l = new PreferenceLoader();
    l.beginIdentity(false, "A");
    l.resolve("A", rowFor("A"));

    l.beginIdentity(false, null);                         // logout
    expect(l.snapshot.ready).toBe(true);
    expect(l.snapshot.prefs).toEqual(DEFAULT_PREFS);
  });

  it("stale user A request resolving AFTER user B is active is dropped", () => {
    const l = new PreferenceLoader();
    l.beginIdentity(false, "A");        // A begins loading
    l.beginIdentity(false, "B");        // B becomes active before A resolves
    const applied = l.resolve("A", rowFor("A"));   // A's late response
    expect(applied).toBe(false);                    // dropped
    // no A preferences leaked into the B context
    expect(l.snapshot.prefs).toEqual(DEFAULT_PREFS);
    expect(l.snapshot.prefs.user_role).not.toBe("A-role");
  });

  it("stale user A request resolving after LOGOUT is dropped", () => {
    const l = new PreferenceLoader();
    l.beginIdentity(false, "A");
    l.beginIdentity(false, null);       // logout before A resolves
    const applied = l.resolve("A", rowFor("A"));
    expect(applied).toBe(false);
    expect(l.snapshot.prefs).toEqual(DEFAULT_PREFS);
  });

  it("no user A preferences ever appear in user B's settled state", () => {
    const l = new PreferenceLoader();
    l.beginIdentity(false, "A");
    l.resolve("A", rowFor("A"));
    l.beginIdentity(false, "B");
    l.resolve("A", rowFor("A"));        // stale A tries to write during B
    l.resolve("B", rowFor("B"));        // B resolves
    const blob = JSON.stringify(l.snapshot.prefs);
    expect(blob).not.toContain("A-theme");
    expect(blob).not.toContain("A-role");
    expect(blob).toContain("B-theme");
  });
});

describe("PreferenceLoader — rejection settles cleanly (finding 1)", () => {
  it("active request rejection settles: loading=false, ready=true, defaults retained", () => {
    const l = new PreferenceLoader();
    l.beginIdentity(false, "A");
    expect(l.snapshot.loading).toBe(true);      // in-flight
    const applied = l.fail("A");                // promise rejected / network error
    expect(applied).toBe(true);
    expect(l.snapshot.loading).toBe(false);     // not left permanently pending
    expect(l.snapshot.ready).toBe(true);
    expect(l.snapshot.prefs).toEqual(DEFAULT_PREFS);
  });

  it("a stale rejected user-A request does not affect active user B", () => {
    const l = new PreferenceLoader();
    l.beginIdentity(false, "A");
    l.beginIdentity(false, "B");                // B active before A settles
    l.resolve("B", rowFor("B"));                // B loads its prefs
    const before = l.snapshot;
    const applied = l.fail("A");                // A's late rejection
    expect(applied).toBe(false);                // ignored completely
    expect(l.snapshot).toBe(before);            // B's state untouched
    expect(l.snapshot.prefs.followed_themes).toEqual(["B-theme"]);
    expect(l.snapshot.ready).toBe(true);
    expect(l.snapshot.loading).toBe(false);
  });
});

describe("PreferenceLoader — opaque revision counter (finding 2)", () => {
  it("starts at 0 for the initial/default state", () => {
    const l = new PreferenceLoader();
    expect(l.preferenceRevision).toBe(0);
    // auth resolving then signed-in loading — no material prefs change yet
    l.beginIdentity(true, null);
    l.beginIdentity(false, "A");
    expect(l.preferenceRevision).toBe(0);
  });

  it("increments when preferences materially settle", () => {
    const l = new PreferenceLoader();
    l.beginIdentity(false, "A");
    l.resolve("A", rowFor("A"));
    expect(l.preferenceRevision).toBe(1);
  });

  it("role/region change advances the revision (value-free)", () => {
    const l = new PreferenceLoader();
    l.beginIdentity(false, "A");
    l.resolve("A", { followed_themes: [], followed_sectors: [], followed_asset_classes: [],
                     user_role: "pm", region_focus: "US" });
    const r1 = l.preferenceRevision;
    // same user updates role/region → a fresh resolve materially changes prefs
    l.resolve("A", { followed_themes: [], followed_sectors: [], followed_asset_classes: [],
                     user_role: "analyst", region_focus: "EU" });
    expect(l.preferenceRevision).toBeGreaterThan(r1);
  });

  it("identity reset that clears prior prefs advances the revision", () => {
    const l = new PreferenceLoader();
    l.beginIdentity(false, "A");
    l.resolve("A", rowFor("A"));
    const r1 = l.preferenceRevision;
    l.beginIdentity(false, "B");                 // reset clears A's prefs
    expect(l.preferenceRevision).toBe(r1 + 1);
  });

  it("resolving identical preferences does not advance the revision", () => {
    const l = new PreferenceLoader();
    l.beginIdentity(false, "A");
    l.resolve("A", rowFor("A"));
    const r1 = l.preferenceRevision;
    l.resolve("A", rowFor("A"));                 // same values again
    expect(l.preferenceRevision).toBe(r1);
  });

  it("stale requests do not advance the active user's revision", () => {
    const l = new PreferenceLoader();
    l.beginIdentity(false, "A");
    l.beginIdentity(false, "B");
    l.resolve("B", rowFor("B"));
    const rB = l.preferenceRevision;
    l.resolve("A", rowFor("A"));                 // stale success
    l.fail("A");                                 // stale failure
    expect(l.preferenceRevision).toBe(rB);
  });

  it("a failure does not advance the revision (prefs unchanged from defaults)", () => {
    const l = new PreferenceLoader();
    l.beginIdentity(false, "A");                 // reset → defaults, revision unchanged
    const r0 = l.preferenceRevision;
    l.fail("A");                                 // settle failed, defaults retained
    expect(l.preferenceRevision).toBe(r0);       // no material prefs change → no bump
  });

  it("an empty result does not advance the revision", () => {
    const l = new PreferenceLoader();
    l.beginIdentity(false, "A");
    const r0 = l.preferenceRevision;
    l.empty("A");
    expect(l.preferenceRevision).toBe(r0);
  });
});

describe("classifyPrefResult — pure maybeSingle() response classifier (finding 1)", () => {
  const row = rowFor("A");

  it("{ data: row, error: null } → loaded", () => {
    expect(classifyPrefResult({ data: row, error: null })).toBe("loaded");
  });

  it("{ data: null, error: null } → empty (maybeSingle zero-row success)", () => {
    // With maybeSingle(), no rows is a SUCCESS with null data — never PGRST116.
    expect(classifyPrefResult({ data: null, error: null })).toBe("empty");
  });

  it("{ data: null, error: operational error } → failed", () => {
    // e.g. RLS denial / network / server fault surfaced as a PostgREST error.
    expect(classifyPrefResult({
      data: null, error: { code: "42501", message: "permission denied", hint: null, details: null },
    })).toBe("failed");
  });

  it("multiple-row error → failed", () => {
    // maybeSingle() returns an error (PGRST114-style) when more than one row matches.
    expect(classifyPrefResult({
      data: null, error: { code: "PGRST114", message: "multiple rows returned" },
    })).toBe("failed");
  });

  it("an error object always wins, even if a stray data is present → failed", () => {
    expect(classifyPrefResult({ data: row, error: { code: "42501" } })).toBe("failed");
  });
});

describe("queryUserPreferences — query contract (finding 1)", () => {
  /** A mock builder that records the chain and exposes maybeSingle but NOT single. */
  function mockDb(result: PrefQueryResult) {
    const calls: string[] = [];
    const db = {
      from(table: string) {
        calls.push(`from:${table}`);
        return {
          select(cols: string) {
            calls.push(`select:${cols}`);
            return {
              eq(col: string, val: string) {
                calls.push(`eq:${col}=${val}`);
                return {
                  maybeSingle() { calls.push("maybeSingle"); return Promise.resolve(result); },
                  // NOTE: no single() — if the hook used single() this would throw.
                };
              },
            };
          },
        };
      },
    };
    return { db: db as unknown as PrefQuerySource, calls };
  }

  it("the production query path calls maybeSingle(), not single()", async () => {
    const { db, calls } = mockDb({ data: null, error: null });
    const res = await queryUserPreferences(db, "user-A");
    expect(calls).toContain("from:user_preferences");
    expect(calls).toContain("maybeSingle");
    expect(calls).not.toContain("single");
    expect(calls).toContain("eq:user_id=user-A");
    expect(res).toEqual({ data: null, error: null });
  });

  it("propagates a zero-row success verbatim (data null, error null)", async () => {
    const { db } = mockDb({ data: null, error: null });
    expect(await queryUserPreferences(db, "A")).toEqual({ data: null, error: null });
  });

  it("propagates an operational error verbatim to the classifier boundary", async () => {
    const err = { code: "42501", message: "permission denied" };
    const { db } = mockDb({ data: null, error: err });
    const res = await queryUserPreferences(db, "A");
    expect(classifyPrefResult(res)).toBe("failed");
  });
});

describe("PreferenceLoader — load status enum (findings 1 & 2)", () => {
  it("initial state is idle; a fetch transitions to loading", () => {
    const l = new PreferenceLoader();
    expect(l.snapshot.status).toBe("idle");
    l.beginIdentity(false, "A");
    expect(l.snapshot.status).toBe("loading");
  });

  it("loaded / empty / failed are distinct terminal statuses (all settle)", () => {
    const loaded = new PreferenceLoader(); loaded.beginIdentity(false, "A");
    loaded.resolve("A", rowFor("A"));
    expect(loaded.snapshot.status).toBe("loaded");

    const empty = new PreferenceLoader(); empty.beginIdentity(false, "A");
    empty.empty("A");
    expect(empty.snapshot.status).toBe("empty");
    expect(empty.snapshot.prefs).toEqual(DEFAULT_PREFS);

    const failed = new PreferenceLoader(); failed.beginIdentity(false, "A");
    failed.fail("A");
    expect(failed.snapshot.status).toBe("failed");
    expect(failed.snapshot.prefs).toEqual(DEFAULT_PREFS);

    for (const l of [loaded, empty, failed]) {
      expect(l.snapshot.ready).toBe(true);
      expect(l.snapshot.loading).toBe(false);
    }
  });

  it("a stale returned-error (failed) from user A after user B is active is ignored", () => {
    const l = new PreferenceLoader();
    l.beginIdentity(false, "A");
    l.beginIdentity(false, "B");
    l.resolve("B", rowFor("B"));
    const before = l.snapshot;
    expect(l.fail("A")).toBe(false);             // A's late error settle
    expect(l.snapshot).toBe(before);             // B's status/state untouched
    expect(l.snapshot.status).toBe("loaded");
  });

  it("a stale empty result from user A after user B is active is ignored", () => {
    const l = new PreferenceLoader();
    l.beginIdentity(false, "A");
    l.beginIdentity(false, "B");
    l.resolve("B", rowFor("B"));
    expect(l.empty("A")).toBe(false);
    expect(l.snapshot.status).toBe("loaded");
    expect(l.snapshot.prefs.followed_themes).toEqual(["B-theme"]);
  });
});
