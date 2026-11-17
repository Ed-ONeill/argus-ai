"use client";
import { useState } from "react";
import type { SavedItemVM } from "@/lib/savedIntel";
import { useResearchState } from "@/hooks/useResearchState";
import { readReview, reviewDifferences, reviewSnapshot } from "@/lib/researchReview";

export function ResearchReview({ item }: { item: SavedItemVM }) {
  const state = useResearchState();
  const key = `review:${item.key}`;
  const review = readReview(state.rows.find(r => r.key === key)?.value);
  const [editing, setEditing] = useState(false);
  const [note, setNote] = useState("");
  const [question, setQuestion] = useState("");
  const [failed, setFailed] = useState(false);
  const differences = review && item.live ? reviewDifferences(review.snapshot, reviewSnapshot(item)) : [];
  async function save() {
    setFailed(false);
    try {
      await state.put(key, { version: 1, reviewedAt: new Date().toISOString(),
        snapshot: reviewSnapshot(item), note: note.trim(), question: question.trim() });
      setEditing(false);
    } catch { setFailed(true); }
  }
  if (state.isLoading) return <p role="status" className="text-xs p-3">Loading review history…</p>;
  return <div className="rounded-b-xl border border-t-0 border-edge px-4 py-3 text-xs space-y-2">
    <p className="text-ink-secondary">{!state.ready ? "Review history unavailable or loading."
      : !review ? "Not reviewed yet."
      : `Last reviewed ${new Date(review.reviewedAt).toLocaleString()}.`}</p>
    {review && item.live && <p>{differences.length ? `${differences.length} recorded fields changed since your review.` : "No recorded fields changed since your review."}</p>}
    {review && !item.live && <p>Current coverage is unavailable; no comparison can be made.</p>}
    {differences.map(d => <p key={d.label} className="text-ink-secondary"><b>{d.label}:</b> {String(d.before ?? "Not recorded")} → {String(d.after ?? "Not recorded")}</p>)}
    {!editing && review?.note && <p className="whitespace-pre-wrap"><b>Your research note:</b> {review.note}</p>}
    {!editing && review?.question && <p className="whitespace-pre-wrap"><b>Your open question:</b> {review.question}</p>}
    {editing ? <div className="space-y-2">
      <label className="block">Research note<textarea className="block w-full bg-surface border border-edge rounded p-2" value={note} maxLength={4000} onChange={e => setNote(e.target.value)} /></label>
      <label className="block">Next question to investigate<textarea className="block w-full bg-surface border border-edge rounded p-2" value={question} maxLength={1000} onChange={e => setQuestion(e.target.value)} /></label>
      <p>Saving records the current view as your review checkpoint. It does not change Argus’s assessment.</p>
      <button className="text-accent mr-4" disabled={state.isSaving || !item.live || !state.ready} onClick={() => void save()}>{state.isSaving ? "Saving…" : "Save review"}</button>
      <button onClick={() => setEditing(false)}>Cancel</button>
    </div> : <button className="text-accent" disabled={!state.ready || !item.live} onClick={() => {
      setNote(review?.note ?? ""); setQuestion(review?.question ?? ""); setEditing(true);
    }}>Review current evidence</button>}
    {failed && <p role="alert">Your review could not be saved. Your draft is still here; retry when the connection is available.</p>}
  </div>;
}
