"use client";

// IntelligenceScore — three orthogonal axes (§SCORE′/§SCORE‴), now quiet by default.
// Only the Importance band shows on the surface; Confidence, Evidence, and the full
// decomposition live one click away — so the score informs without competing with the
// story. Importance uses a neutral scale (green/red stay reserved for gain/loss).

import { useState } from "react";
import { cn } from "@/lib/utils";
import type { Importance, ConfidenceView, EvidenceStrength } from "@/lib/intelligenceScore";

const BAND_TONE: Record<Importance["band"], string> = {
  Critical: "text-accent",
  High: "text-ink",
  Moderate: "text-ink-secondary",
  Watch: "text-ink-muted",
};

function EvidenceDots({ strength }: { strength: EvidenceStrength }) {
  const filled = strength === "Strong" ? 3 : strength === "Mixed" ? 2 : 1;
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="inline-flex gap-[3px]">
        {[0, 1, 2].map((i) => (
          <span key={i} className={cn("h-[6px] w-[6px] rounded-full", i < filled ? "bg-ink-secondary" : "bg-edge-strong")} />
        ))}
      </span>
      <span className="text-ink-secondary">{strength}</span>
    </span>
  );
}

function Axis({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[9px] font-semibold uppercase tracking-[0.14em] text-ink-faint">{label}</span>
      <span className="text-[12px] font-medium leading-none">{children}</span>
    </div>
  );
}

export function IntelligenceScore({
  importance, confidence, evidence, expandable = true,
}: {
  importance: Importance;
  confidence: ConfidenceView;
  evidence: EvidenceStrength;
  expandable?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex flex-col gap-2.5">
      {/* Surface: one quiet Importance chip. Everything else is one click away. */}
      <button
        type="button"
        disabled={!expandable}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className={cn("group inline-flex w-fit items-center gap-2", expandable && "cursor-pointer")}
      >
        <span className="text-[9px] font-semibold uppercase tracking-[0.14em] text-ink-faint">Importance</span>
        <span className={cn("text-[12px] font-semibold", BAND_TONE[importance.band])}>{importance.band}</span>
        <span className="font-mono text-[11px] text-ink-muted">{importance.score}</span>
        {expandable && (
          <span className="text-ink-faint transition-transform group-hover:text-ink-muted motion-reduce:transition-none"
            style={{ transform: open ? "rotate(90deg)" : "none" }}>›</span>
        )}
      </button>

      {open && expandable && (
        <div className="rounded-xl border border-edge-subtle bg-raised/40 p-3.5">
          <div className="mb-3 flex flex-wrap items-start gap-x-8 gap-y-2">
            <Axis label="Confidence">
              <span className="text-ink">{confidence.band}</span>
              <span className="ml-1 font-mono text-[11px] text-ink-muted">{confidence.value}</span>
            </Axis>
            <Axis label="Evidence"><EvidenceDots strength={evidence} /></Axis>
          </div>
          <p className="mb-2.5 text-[9px] font-semibold uppercase tracking-[0.16em] text-ink-faint">Why this ranks here</p>
          <div className="flex flex-col gap-2">
            {[...importance.factors].sort((a, b) => b.value - a.value).map((f) => (
              <div key={f.key} className="flex items-center gap-3">
                <span className="w-24 shrink-0 text-[11px] text-ink-secondary">{f.label}</span>
                <span className="relative h-[5px] flex-1 overflow-hidden rounded-full bg-edge-subtle">
                  <span className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-accent/70 to-accent"
                    style={{ width: `${Math.round(f.value * 100)}%` }} />
                </span>
                <span className="w-40 shrink-0 text-right text-[10px] text-ink-faint">{f.detail}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
