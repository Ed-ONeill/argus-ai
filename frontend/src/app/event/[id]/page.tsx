/**
 * app/event/[id]/page.tsx — the human-ergonomic event alias (IR-1).
 *
 * ARGUS_ENTITY_INTELLIGENCE_V1 §2.3: kind aliases redirect to the canonical
 * uid address. /event/aaa111bbb222 → /intel/event:cluster:aaa111bbb222 — one
 * record, one URL of record, citable in memos. The id is an exact content-hash
 * key and is never transformed; malformed ids land on the canonical route's
 * designed invalid state.
 */

import { redirect } from "next/navigation";

export default async function EventAlias({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const raw = decodeURIComponent(id ?? "").trim();
  redirect(`/intel/${encodeURIComponent(`event:cluster:${raw || "unknown"}`)}`);
}
