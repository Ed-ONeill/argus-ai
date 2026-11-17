"use client";
import { useEffect, useState } from "react";
import { useResearchState } from "@/hooks/useResearchState";

function legacyThemes(): { id: string; name: string }[] {
  const out = new Map<string, string>();
  try {
    const follows: unknown = JSON.parse(localStorage.getItem("argus:followed-themes") ?? "[]");
    if (Array.isArray(follows)) for (const f of follows) if (typeof f?.id === "string" && typeof f?.name === "string") out.set(f.id, f.name);
    const watches: unknown = JSON.parse(localStorage.getItem("argus:theme-watchlist") ?? "[]");
    if (Array.isArray(watches)) for (const id of watches) if (typeof id === "string" && !out.has(id)) out.set(id, id);
  } catch { /* Leave malformed legacy data untouched. */ }
  return [...out].map(([id, name]) => ({ id, name }));
}
export function ResearchSyncStatus() {
  const state = useResearchState();
  const [legacy, setLegacy] = useState<{ id: string; name: string }[]>([]);
  const [failed, setFailed] = useState(false);
  useEffect(() => { setLegacy(legacyThemes()); }, []);
  const missing = legacy.filter(t => !state.rows.some(r => r.key === `theme:${t.id}`));
  async function importThemes() {
    setFailed(false);
    try {
      for (const t of missing) await state.put(`theme:${t.id}`, { name: t.name });
      // Retain the original data as a recovery copy, even after successful import.
    } catch { setFailed(true); }
  }
  return <div className="text-xs text-ink-secondary mb-4 space-y-2">
    {state.error && <p role="alert">Theme subscriptions and review history could not be synced. Existing browser data has been preserved.</p>}
    {state.ready && missing.length > 0 && <div>
      <p>{missing.length} themes were saved in this browser before account sync. Import only if they belong to you.</p>
      <button className="text-accent" disabled={state.isSaving} onClick={() => void importThemes()}>Import this browser’s themes</button>
    </div>}
    {failed && <p role="alert">Import did not finish. Retry to import the remaining themes.</p>}
  </div>;
}
