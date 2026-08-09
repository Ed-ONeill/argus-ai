"use client";

import { useState } from "react";
import { FileText, X } from "lucide-react";
import { useActiveContext, clearActiveContext } from "@/lib/intelligenceContext";
import { EvidenceDrawer } from "./EvidenceDrawer";

/**
 * IntelligenceOverlay - mounts the cross-page focus bar + intelligence drawer once
 * (in the root layout), so the active intelligence context is visible and openable
 * on every page. The "Focused on: X" bar is the Phase-2 surface; deeper per-card
 * highlighting is layered per page via useActiveContext. No em/en dashes.
 */

const KIND_LABEL: Record<string, string> = {
  theme: "Theme", company: "Company", etf: "ETF", sector: "Sector", driver: "Macro Driver", deal: "Deal", narrative: "Narrative",
};

export function IntelligenceOverlay() {
  const ctx = useActiveContext();
  const [open, setOpen] = useState(false);
  const accent = ctx?.color ?? "#52b0c8";

  return (
    <>
      {ctx && (
        <div className="fixed left-0 right-0 z-[60] flex justify-center px-4 pointer-events-none" style={{ top: "calc(3.5rem + 8px)" }}>
          <div className="pointer-events-auto flex items-center gap-2.5 rounded-full pl-3.5 pr-1.5 py-1.5"
            style={{ background: "rgba(8,12,20,0.94)", border: "1px solid rgba(255,255,255,0.12)", boxShadow: "0 8px 28px rgba(0,0,0,0.45)", backdropFilter: "blur(8px)" }}>
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: accent }} />
            <span className="text-[9px] font-bold uppercase tracking-[0.14em]" style={{ color: "rgba(255,255,255,0.42)" }}>Focused on</span>
            <span className="text-[8px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded" style={{ color: accent, background: `${accent}1f` }}>{KIND_LABEL[ctx.kind] ?? ctx.kind}</span>
            <span className="text-[12px] font-bold truncate max-w-[220px]" style={{ color: "rgba(255,255,255,0.94)" }}>{ctx.label}</span>
            <button onClick={() => setOpen(true)}
              className="flex items-center gap-1 text-[10px] font-semibold px-2.5 py-1 rounded-full transition-colors hover:bg-white/10"
              style={{ color: "#7cc7d8", border: "1px solid rgba(82,176,200,0.3)" }}>
              <FileText size={9} /> Evidence
            </button>
            <button onClick={() => { clearActiveContext(); setOpen(false); }}
              className="p-1 rounded-full transition-colors hover:bg-white/10" style={{ color: "rgba(255,255,255,0.45)" }} title="Clear focus">
              <X size={13} />
            </button>
          </div>
        </div>
      )}
      <EvidenceDrawer ctx={ctx} open={open && !!ctx} onClose={() => setOpen(false)} />
    </>
  );
}
