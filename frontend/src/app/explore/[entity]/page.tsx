"use client";

// /explore is RETIRED. This is a thin COMPATIBILITY REDIRECT kept for a deprecation window so
// old bookmarks and deep links still resolve: it parses the historical `kind:id` segment and
// forwards to the canonical surface — company/event to /intel, every investigatable kind
// (theme/sector/driver/narrative/etf/market) to the Workstation. No Explorer shell renders.
// The reusable network graph (ExplorerGraph) lives on; only the route/terminal is gone.

import { useEffect } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { parseExplorerEntity, canonicalEntityHref } from "@/lib/intelligenceShared";

export default function ExploreRedirect() {
  const params = useParams();
  const router = useRouter();
  const search = useSearchParams();

  useEffect(() => {
    const raw = params?.entity;
    const seg = Array.isArray(raw) ? raw[0] : (raw ?? "");
    const ctx = parseExplorerEntity(seg, search);
    router.replace(ctx ? canonicalEntityHref(ctx.kind, ctx.id, ctx.label) : "/feed");
  }, [params, router, search]);

  return null;
}
