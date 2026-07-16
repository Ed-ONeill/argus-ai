/**
 * app/company/[ticker]/page.tsx — the human-ergonomic company alias (EI1).
 *
 * ARGUS_ENTITY_INTELLIGENCE_V1 §2.3: kind aliases redirect to the canonical
 * uid address. /company/vrt → /intel/company:ticker:VRT — one file, one URL
 * of record, citable in memos.
 */

import { redirect } from "next/navigation";

export default async function CompanyAlias({ params }: { params: Promise<{ ticker: string }> }) {
  const { ticker } = await params;
  const t = decodeURIComponent(ticker ?? "").toUpperCase().replace(/[^A-Z]/g, "").slice(0, 5);
  redirect(`/intel/${encodeURIComponent(`company:ticker:${t || "UNKNOWN"}`)}`);
}
