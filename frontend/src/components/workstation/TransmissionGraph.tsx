"use client";

// TransmissionGraph — the case's EXHIBIT. A thin wrapper that ADAPTS the existing ExplorerGraph
// to the investigation thread (it does not replace it). Stage 2: the thread controls the exhibit.
// The active beat supplies a reveal STAGE; this wrapper resolves it against the map (a pure
// projection) and hands ExplorerGraph the resulting emphasis. When the graph has no data it
// degrades honestly to the primary chain as text.

import { useRouter } from "next/navigation";
import { ExplorerGraph } from "@/components/explore/ExplorerGraph";
import { computeReveal, type RevealStage } from "@/lib/graphReveal";
import type { MapVM } from "@/lib/causalMap";
import type { TransmissionExhibit } from "@/lib/workstationView";

export function TransmissionGraph({ exhibit, mapVM, stage }: { exhibit: TransmissionExhibit; mapVM: MapVM | null; stage: RevealStage }) {
  const router = useRouter();
  const reveal = mapVM?.available
    ? computeReveal(mapVM, stage, { primaryChain: exhibit.primaryChain, weakLinks: exhibit.weakLinks })
    : undefined;
  const stressLit = stage === "breaks" || stage === "history";

  return (
    <div className="flex h-full min-h-0 flex-col">
      {mapVM?.available ? (
        <div className="min-h-0 flex-1 overflow-hidden rounded-lg border border-edge-subtle bg-canvas">
          <ExplorerGraph map={mapVM} accent="#7cc7d8" reveal={reveal} onNavigate={(href) => router.push(href)} />
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-1.5">
          {exhibit.primaryChain.map((n, i) => (
            <span key={`${n}-${i}`} className="flex items-center gap-1.5">
              <span className="rounded-md border border-edge-subtle bg-raised/50 px-2 py-0.5 text-[12px] font-semibold text-ink">{n}</span>
              {i < exhibit.primaryChain.length - 1 && <span className="text-ink-faint" aria-hidden>&rarr;</span>}
            </span>
          ))}
        </div>
      )}
      {exhibit.weakLinks.length > 0 && (
        <p className="mt-2 shrink-0 text-[11px] text-ink-faint">
          Watch these links for stress: <span className={stressLit ? "font-semibold text-rose-400" : "text-rose-400/85"}>{exhibit.weakLinks.join(", ")}</span>
        </p>
      )}
    </div>
  );
}
