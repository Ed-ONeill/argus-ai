"use client";

// WorkstationPage — resolves the intelligence inputs (via the canonical engines) and renders
// the View Model. Two states only: the Docket, or a seven-beat Case. It performs no bespoke
// reasoning — it calls the canonical engines and hands their output to buildWorkstationView.

import { useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useFeed } from "@/hooks/useFeed";
import { useArgusIntelligence } from "@/hooks/useArgusIntelligence";
import { buildIntelligenceProfile, type ProfileKind, type IntelligenceProfile } from "@/lib/intelligenceProfile";
import { buildSectorForwardView, type SectorForwardView } from "@/lib/sectorForward";
import { sectorExposure, industriesOfSector } from "@/lib/sectorTaxonomy";
import { intelligenceGraph } from "@/lib/intelligenceGraph";
import { buildRelationshipMap, type MapVM } from "@/lib/causalMap";
import { buildWorkstationView, type DocketItem, type WorkstationView } from "@/lib/workstationView";
import { Docket } from "./Docket";
import { CaseThread } from "./CaseThread";

export default function WorkstationPage() {
  const router = useRouter();
  const params = useSearchParams();
  useArgusIntelligence();   // provisions the shared graph the engines read
  const { data: feed } = useFeed();
  const subjectLabel = params.get("subject");
  const kind = params.get("kind") ?? "theme";
  const themeData = feed?.theme_intelligence;

  const { view, mapVM }: { view: WorkstationView; mapVM: MapVM | null } = useMemo(() => {
    const themes = themeData ?? [];
    if (!subjectLabel) return { view: buildWorkstationView({ subject: null, profile: null, ledger: null, themes }), mapVM: null };
    const profile = buildIntelligenceProfile(subjectLabel, { kindHint: kind as ProfileKind });
    const map = buildRelationshipMap(subjectLabel);

    // RC2-G5: a Sector subject reads its chain from the CARRYING INDUSTRY and
    // its open question from the canonical forward projection. Both already
    // exist; the Workstation simply was not consuming them, so the hypothesis
    // was always "insufficient" and the chain collapsed to Theme -> Sector.
    let industryProfiles: Map<string, IntelligenceProfile> | undefined;
    let forward: SectorForwardView | null = null;
    if (kind === "sector") {
      forward = buildSectorForwardView({
        sector: subjectLabel, exposure: sectorExposure(subjectLabel), themes, leadership: null,
      });
      industryProfiles = new Map<string, IntelligenceProfile>();
      for (const ind of industriesOfSector(subjectLabel)) {
        const node = intelligenceGraph.getNodeOfType(ind, "Industry");
        if (node) industryProfiles.set(ind.toLowerCase(), buildIntelligenceProfile(node.id, { kindHint: "sector" }));
      }
    }

    const view = buildWorkstationView({
      subject: { kind, id: subjectLabel, label: subjectLabel },
      profile, ledger: null, themes, industryProfiles, forward,
    });
    return { view, mapVM: map };
  }, [subjectLabel, kind, themeData]);

  const openCase = (it: DocketItem) => router.push(`/workstation?kind=${it.kind}&subject=${encodeURIComponent(it.label)}`);

  return (
    <div className="brief-dark min-h-[calc(100vh-3.5rem)] bg-canvas text-ink">
      <div className="mx-auto max-w-3xl px-5 pb-16 pt-8 sm:px-8">
        {view.mode === "docket"
          ? <Docket items={view.docket} onOpen={openCase} />
          : <CaseThread view={view} mapVM={mapVM} onBack={() => router.push("/workstation")} />}
      </div>
    </div>
  );
}
