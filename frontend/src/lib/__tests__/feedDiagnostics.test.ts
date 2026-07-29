import { describe, expect, it } from "vitest";
import { computeFeedFunnel, funnelSignature, type FunnelStages } from "../feedDiagnostics";
import type { UserPrefs } from "../feedRanker";
import type { StoryCluster } from "../types";

function cluster(id: string, signal: number): StoryCluster {
  return {
    id,
    primary: { id, title: `Story ${id}`, url: `https://t/${id}`, source: "Bloomberg Markets",
               category: "Markets", published: "1h ago", signal_score: signal,
               signal_strength: "strong", affected_entities: [], summary: "", why_it_matters: "",
               impact: "", snippet: "" } as never,
    related: [], cluster_score: 0, theme_label: "", story_count: 1,
  } as StoryCluster;
}

const EMPTY_PREFS: UserPrefs = {
  followed_themes: [], followed_sectors: [], followed_asset_classes: [],
  user_role: "", region_focus: "",
} as UserPrefs;

const stages = (r: number, d: number, c: number, f: number, v: number): FunnelStages => ({
  ranked: { length: r }, deduped: { length: d }, capped: { length: c },
  focused: { length: f }, visible: { length: v },
});

describe("computeFeedFunnel", () => {
  it("reports each filtering stage count from the page's stage arrays", () => {
    const clusters = [cluster("a", 80), cluster("b", 60), cluster("c", 73)];
    const f = computeFeedFunnel(clusters, EMPTY_PREFS, stages(3, 3, 3, 2, 2), "2026-07-28T00:00:00Z");
    expect(f.raw_clusters).toBe(3);
    expect(f.pass_both).toBe(3);
    expect(f.after_event_cap).toBe(3);
    expect(f.after_15_cap).toBe(3);
    expect(f.after_focus_filter).toBe(2);
    expect(f.final_visible).toBe(2);
    expect(f.generated_at).toBe("2026-07-28T00:00:00Z");
  });

  it("no preferences → no gate: relevance/conviction pass counts equal raw", () => {
    const clusters = [cluster("a", 40), cluster("b", 41)];   // both below 72
    const f = computeFeedFunnel(clusters, EMPTY_PREFS, stages(2, 2, 2, 2, 2));
    expect(f.personalization_active).toBe(false);
    expect(f.pass_conviction).toBe(2);   // gate not applied when no prefs
    expect(f.pass_relevance).toBe(2);
  });

  it("with preferences → conviction gate counts clusters at/above 72", () => {
    const prefs: UserPrefs = { ...EMPTY_PREFS, followed_sectors: ["Semiconductors"] } as UserPrefs;
    const clusters = [cluster("a", 80), cluster("b", 60), cluster("c", 72), cluster("d", 71)];
    const f = computeFeedFunnel(clusters, prefs, stages(2, 2, 2, 2, 2));
    expect(f.personalization_active).toBe(true);
    expect(f.pass_conviction).toBe(2);   // 80 and 72 clear; 60 and 71 do not
    expect(f.followed_sector_count).toBe(1);
    expect(f.thresholds).toEqual({ relevance: 70, conviction: 72 });
  });

  it("reports preference COUNTS, never labels (privacy)", () => {
    const prefs: UserPrefs = {
      ...EMPTY_PREFS,
      followed_themes: ["AI Infrastructure", "Rate Cuts"],
      followed_sectors: ["Semiconductors"],
    } as UserPrefs;
    const f = computeFeedFunnel([cluster("a", 80)], prefs, stages(1, 1, 1, 1, 1));
    expect(f.followed_theme_count).toBe(2);
    expect(f.followed_sector_count).toBe(1);
    // no label fields exist on the payload at all
    const blob = JSON.stringify(f);
    expect(blob).not.toContain("AI Infrastructure");
    expect(blob).not.toContain("Rate Cuts");
    expect(blob).not.toContain("Semiconductors");
    expect(f).not.toHaveProperty("active_followed_themes");
    expect(f).not.toHaveProperty("active_followed_sectors");
  });

  it("defaults preferences_ready to true, honors an explicit false", () => {
    const ready = computeFeedFunnel([cluster("a", 80)], EMPTY_PREFS, stages(1, 1, 1, 1, 1));
    expect(ready.preferences_ready).toBe(true);
    const notReady = computeFeedFunnel([cluster("a", 80)], EMPTY_PREFS,
      stages(1, 1, 1, 1, 1), null, { preferencesReady: false });
    expect(notReady.preferences_ready).toBe(false);
  });

  it("exposes the sanitized preference_load_status enum (default idle)", () => {
    const dflt = computeFeedFunnel([cluster("a", 80)], EMPTY_PREFS, stages(1, 1, 1, 1, 1));
    expect(dflt.preference_load_status).toBe("idle");
    for (const status of ["loading", "loaded", "empty", "failed"] as const) {
      const f = computeFeedFunnel([cluster("a", 80)], EMPTY_PREFS,
        stages(1, 1, 1, 1, 1), null, { preferenceLoadStatus: status });
      expect(f.preference_load_status).toBe(status);
    }
  });

  it("a failed status funnel carries NO raw error code/message (only the enum)", () => {
    const f = computeFeedFunnel([cluster("a", 80)], EMPTY_PREFS,
      stages(1, 1, 1, 1, 1), null, { preferenceLoadStatus: "failed" });
    const blob = JSON.stringify(f);
    expect(f.preference_load_status).toBe("failed");
    // no PostgREST error shapes leak into the diagnostic payload
    expect(blob).not.toContain("PGRST");
    expect(blob).not.toContain("message");
    expect(blob).not.toContain("hint");
    expect(blob).not.toContain("details");
    expect(f).not.toHaveProperty("preference_load_error");
  });
});

describe("funnelSignature (finding 2 dedup key)", () => {
  const GEN = "2026-07-28T00:00:00Z";

  it("empty and failed load statuses produce distinct signatures", () => {
    const base = (status: "empty" | "failed") => computeFeedFunnel(
      [cluster("a", 80)], EMPTY_PREFS, stages(1, 1, 1, 1, 1), GEN,
      { preferenceLoadStatus: status });
    expect(funnelSignature(base("empty"), null)).not.toBe(funnelSignature(base("failed"), null));
  });

  it("normal async-preferences sequence produces distinct signatures", () => {
    const clusters = [cluster("a", 80), cluster("b", 60), cluster("c", 73)];
    // 1) feed arrives, preferences still loading (defaults, gate not applied)
    const loading = computeFeedFunnel(clusters, EMPTY_PREFS, stages(3, 3, 3, 3, 3),
      GEN, { preferencesReady: false });
    // 2) preferences finish loading against the SAME feed generation, and the
    //    ranked set shrinks because the gate now runs
    const prefs: UserPrefs = { ...EMPTY_PREFS, followed_sectors: ["Semiconductors"] } as UserPrefs;
    const ready = computeFeedFunnel(clusters, prefs, stages(2, 2, 2, 2, 2),
      GEN, { preferencesReady: true });
    const sigLoading = funnelSignature(loading, null);
    const sigReady = funnelSignature(ready, null);
    expect(sigLoading).not.toBe(sigReady);        // corrected funnel re-emits
    expect(loading.preferences_ready).toBe(false);
    expect(ready.preferences_ready).toBe(true);
  });

  it("same inputs → identical signature (no re-emit on unrelated re-render)", () => {
    const clusters = [cluster("a", 80)];
    const f1 = computeFeedFunnel(clusters, EMPTY_PREFS, stages(1, 1, 1, 1, 1), GEN);
    const f2 = computeFeedFunnel(clusters, EMPTY_PREFS, stages(1, 1, 1, 1, 1), GEN);
    expect(funnelSignature(f1, null)).toBe(funnelSignature(f2, null));
  });

  it("focus change against the same feed yields a new signature", () => {
    const clusters = [cluster("a", 80), cluster("b", 73)];
    const nofocus = computeFeedFunnel(clusters, EMPTY_PREFS, stages(2, 2, 2, 2, 2), GEN);
    const focused = computeFeedFunnel(clusters, EMPTY_PREFS, stages(2, 2, 2, 1, 1), GEN);
    expect(funnelSignature(nofocus, null)).not.toBe(funnelSignature(focused, "theme:ai"));
  });

  it("pagination change (final_visible) yields a new signature", () => {
    const clusters = [cluster("a", 80), cluster("b", 73)];
    const page1 = computeFeedFunnel(clusters, EMPTY_PREFS, stages(2, 2, 2, 2, 1), GEN);
    const page2 = computeFeedFunnel(clusters, EMPTY_PREFS, stages(2, 2, 2, 2, 2), GEN);
    expect(funnelSignature(page1, null)).not.toBe(funnelSignature(page2, null));
  });

  it("same generated_at + final_visible but different gate counts → different signatures", () => {
    const clusters = [cluster("a", 80), cluster("b", 73)];
    // identical generation and pagination, but the gate stages differ
    const a = computeFeedFunnel(clusters, EMPTY_PREFS, stages(10, 8, 6, 5, 15), GEN);
    const b = computeFeedFunnel(clusters, EMPTY_PREFS, stages(4, 4, 3, 3, 15), GEN);
    expect(a.final_visible).toBe(15);
    expect(b.final_visible).toBe(15);
    expect(a.generated_at).toBe(b.generated_at);
    expect(funnelSignature(a, null)).not.toBe(funnelSignature(b, null));
  });

  it("preference_revision is a value-free number; a change flips the signature", () => {
    // The revision is supplied by the loader (opaque counter), NOT derived from
    // prefs. A role/region change surfaces as an incremented revision — never as
    // the label itself. Same prefs, differing revision → different signatures.
    const withRole: UserPrefs = { ...EMPTY_PREFS, user_role: "portfolio_manager", region_focus: "US" } as UserPrefs;
    const r0 = computeFeedFunnel([cluster("a", 80)], withRole, stages(1, 1, 1, 1, 1), GEN,
      { preferenceRevision: 0 });
    const r1 = computeFeedFunnel([cluster("a", 80)], withRole, stages(1, 1, 1, 1, 1), GEN,
      { preferenceRevision: 1 });
    expect(typeof r1.preference_revision).toBe("number");
    expect(funnelSignature(r0, null)).not.toBe(funnelSignature(r1, null));
    // No role/region label (or any string derived from them) is present anywhere.
    for (const f of [r0, r1]) {
      const blob = JSON.stringify(f) + "|" + funnelSignature(f, null);
      expect(blob).not.toContain("portfolio_manager");
      expect(blob).not.toContain("US");
    }
  });

  it("identical preference state (same revision) does not change the signature", () => {
    const withRole: UserPrefs = { ...EMPTY_PREFS, user_role: "analyst" } as UserPrefs;
    const a = computeFeedFunnel([cluster("a", 80)], withRole, stages(1, 1, 1, 1, 1), GEN,
      { preferenceRevision: 3 });
    const b = computeFeedFunnel([cluster("a", 80)], withRole, stages(1, 1, 1, 1, 1), GEN,
      { preferenceRevision: 3 });
    expect(funnelSignature(a, null)).toBe(funnelSignature(b, null));
  });

  it("asset-class count change yields a new signature", () => {
    const none: UserPrefs = { ...EMPTY_PREFS } as UserPrefs;
    const one: UserPrefs = { ...EMPTY_PREFS, followed_asset_classes: ["Equities"] } as UserPrefs;
    const fNone = computeFeedFunnel([cluster("a", 80)], none, stages(1, 1, 1, 1, 1), GEN);
    const fOne = computeFeedFunnel([cluster("a", 80)], one, stages(1, 1, 1, 1, 1), GEN);
    expect(fOne.followed_asset_class_count).toBe(1);
    expect(funnelSignature(fNone, null)).not.toBe(funnelSignature(fOne, null));
  });

  it("followed-count change yields a new signature; no labels in the signature", () => {
    const one: UserPrefs = { ...EMPTY_PREFS, followed_themes: ["AI Infrastructure"] } as UserPrefs;
    const two: UserPrefs = { ...EMPTY_PREFS, followed_themes: ["AI Infrastructure", "Rate Cuts"] } as UserPrefs;
    const fOne = computeFeedFunnel([cluster("a", 80)], one, stages(1, 1, 1, 1, 1), GEN);
    const fTwo = computeFeedFunnel([cluster("a", 80)], two, stages(1, 1, 1, 1, 1), GEN);
    const sigOne = funnelSignature(fOne, null);
    expect(sigOne).not.toBe(funnelSignature(fTwo, null));
    expect(sigOne).not.toContain("AI Infrastructure");
    expect(funnelSignature(fTwo, null)).not.toContain("Rate Cuts");
  });
});
