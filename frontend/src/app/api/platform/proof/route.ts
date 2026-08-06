// app/api/platform/proof/route.ts — Stage 0 PROOF route (non-user-visible; dev only).
//
// Not linked from any UI. Demonstrates the platform foundation end-to-end WITHOUT
// calling any real or plan-gated endpoint: the per-domain resolver, the fallback ladder,
// honest absence, the ProviderObservation replay trail, DataQuality, and Provider Health.
// Uses a local registry + a no-network stub so it never mutates app-wide state.

import { NextResponse } from "next/server";
import { ProviderRegistry } from "@/lib/platform/registry";
import { eodhdProvider } from "@/lib/platform/providers/eodhd";
import { StubProvider } from "@/lib/platform/providers/stub";
import { providerHealth } from "@/lib/platform/health";
import { observations } from "@/lib/platform/observation";

export const dynamic = "force-dynamic";

export async function GET() {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const reg = new ProviderRegistry();
  reg.register(eodhdProvider);
  // A no-network stub standing in for the "fmp" fallback slot on `fundamentals`, so the
  // ladder shows: EODHD skipped (unentitled) → fallback returns a fact.
  reg.register(new StubProvider(["fundamentals"], { demo: true, symbol: "DEMO" }, "fmp"));

  // Ladder A — canonical skipped, fallback succeeds.
  const withFallback = await reg.fetchDomain("fundamentals", { symbol: "DEMO" });
  // Ladder B — canonical-only domain, nothing entitled → honest absence.
  const toAbsence = await reg.fetchDomain("movers", {});

  return NextResponse.json({
    stage: "stage-0-foundation",
    note: "No real or plan-gated endpoint was called. This proves the pipeline only.",
    fallbackLadder: {
      domain: withFallback.domain,
      absent: withFallback.absent,
      reason: withFallback.reason,
      quality: withFallback.quality,
      attemptCount: withFallback.observations.length,
      usedFallback: withFallback.observations.at(-1)?.attemptIndex ?? 0,
    },
    absenceLadder: {
      domain: toAbsence.domain,
      absent: toAbsence.absent,       // expect true
      reason: toAbsence.reason,       // expect "gated"
    },
    replaySample: observations.recent(4),   // params are key-redacted at record time
    providerHealth: providerHealth.all(),
  });
}
