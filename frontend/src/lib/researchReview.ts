import type { SavedItemVM } from "./savedIntel";

export interface ReviewSnapshot {
  conviction: number | null; status: string | null; risk: string | null;
  watch: string | null; change: string | null;
}
export function reviewSnapshot(item: SavedItemVM): ReviewSnapshot {
  return { conviction: item.conviction, status: item.status, risk: item.risk,
    watch: item.watch, change: item.latestChange?.what ?? null };
}
export function reviewDifferences(before: ReviewSnapshot, now: ReviewSnapshot) {
  const labels: Record<keyof ReviewSnapshot, string> = {
    conviction: "Recorded score", status: "Recorded state", risk: "Risk read", watch: "Watch condition", change: "Latest recorded change",
  };
  return (Object.keys(labels) as (keyof ReviewSnapshot)[]).flatMap(key =>
    before[key] === now[key] ? [] : [{ label: labels[key], before: before[key], after: now[key] }]);
}
export function readReview(value: Record<string, unknown> | undefined) {
  if (!value || value.version !== 1 || typeof value.reviewedAt !== "string" || !Number.isFinite(Date.parse(value.reviewedAt))) return null;
  const s = value.snapshot as Partial<ReviewSnapshot> | undefined;
  if (!s || (s.conviction !== null && typeof s.conviction !== "number") ||
    !["status", "risk", "watch", "change"].every(k => s[k as keyof ReviewSnapshot] === null || typeof s[k as keyof ReviewSnapshot] === "string")) return null;
  return { reviewedAt: value.reviewedAt, snapshot: s as ReviewSnapshot,
    note: typeof value.note === "string" ? value.note : "",
    question: typeof value.question === "string" ? value.question : "" };
}
