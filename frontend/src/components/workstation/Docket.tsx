"use client";

// Docket — the Workstation's entry state: "What's worth investigating right now?" A short,
// ranked list of subjects, one plain reason each. Opening one starts a case. Not a dashboard.

import type { DocketItem } from "@/lib/workstationView";

export function Docket({ items, onOpen }: { items: DocketItem[]; onOpen: (it: DocketItem) => void }) {
  return (
    <div>
      <span className="text-[9px] font-semibold uppercase tracking-[0.2em] text-accent">Workstation</span>
      <h1 className="mt-2 max-w-[24ch] font-serif text-[clamp(1.3rem,2.6vw,1.8rem)] font-normal leading-tight text-ink">What&rsquo;s worth investigating right now?</h1>
      <p className="mt-2 max-w-[60ch] text-[13px] leading-relaxed text-ink-secondary">Open a case to interrogate the view: how it transmits, what proves it, how much supports it, and where it breaks.</p>
      {items.length === 0 ? (
        <p className="mt-8 text-[13px] text-ink-muted">Nothing to investigate yet.</p>
      ) : (
        <ul className="mt-7 flex flex-col divide-y divide-edge-subtle/60">
          {items.map((it) => (
            <li key={it.id}>
              <button type="button" onClick={() => onOpen(it)} className="group flex w-full items-baseline justify-between gap-4 py-3 text-left">
                <span className="text-[15px] font-semibold text-ink transition-colors group-hover:text-accent">{it.label}</span>
                <span className="shrink-0 text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-faint">{it.reason}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
