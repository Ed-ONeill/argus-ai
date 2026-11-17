import { describe, expect, it } from "vitest";
import { readReview, reviewDifferences, reviewSnapshot } from "../researchReview";
import type { SavedItemVM } from "../savedIntel";

const item = { conviction: 50, status: "developing", risk: null, watch: "Watch orders", latestChange: null } as SavedItemVM;
describe("personal review checkpoints", () => {
  it("compares with the user's actual saved view, not an inferred earlier cycle", () => {
    const before = reviewSnapshot(item);
    const after = reviewSnapshot({ ...item, conviction: 70 });
    expect(reviewDifferences(before, after)).toEqual([{ label: "Recorded score", before: 50, after: 70 }]);
    expect(reviewDifferences(before, before)).toEqual([]);
  });
  it("distinguishes missing measurements from zero", () => {
    expect(reviewDifferences(reviewSnapshot({ ...item, conviction: null }), reviewSnapshot({ ...item, conviction: 0 }))[0])
      .toMatchObject({ before: null, after: 0 });
  });
  it("rejects incomplete or invented checkpoints", () => {
    expect(readReview(undefined)).toBeNull();
    expect(readReview({ version: 1, reviewedAt: "not a date", snapshot: reviewSnapshot(item) })).toBeNull();
    expect(readReview({ version: 1, reviewedAt: "2026-11-17T12:00:00Z", snapshot: {} })).toBeNull();
  });
  it("preserves user notes separately from computed intelligence", () => {
    const snapshot = reviewSnapshot(item);
    const review = readReview({ version: 1, reviewedAt: "2026-11-17T12:00:00Z", snapshot, note: "My hypothesis", question: "Check orders" });
    expect(review?.note).toBe("My hypothesis");
    expect(review?.snapshot).toEqual(snapshot);
  });
});
