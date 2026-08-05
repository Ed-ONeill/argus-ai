"use client";

// LifecycleBadge — the narrative lifecycle stage made elegant (§LIFE″), not raw
// metadata. Emerging → Developing → Dominant → Cooling → Resolved, shown as a word
// with a quiet 5-step progress track. Deterministic; color-independent (a filled
// track segment, plus the word — never color alone).

import { cn } from "@/lib/utils";
import type { Lifecycle } from "@/lib/intelligenceScore";

const STAGES = ["Emerging", "Developing", "Dominant", "Cooling", "Resolved"] as const;

export function LifecycleBadge({ lifecycle, className }: { lifecycle: Lifecycle; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)} aria-label={`Lifecycle: ${lifecycle.label}`}>
      <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-secondary">
        {lifecycle.label}
      </span>
      <span className="inline-flex items-center gap-[3px]" aria-hidden>
        {STAGES.map((_, i) => (
          <span
            key={i}
            className={cn(
              "h-[3px] rounded-full transition-all duration-300 motion-reduce:transition-none",
              i === lifecycle.index ? "w-[14px] bg-accent shadow-[0_0_8px_rgba(37,99,235,0.7)]"
                : i < lifecycle.index ? "w-[9px] bg-accent/60" : "w-[9px] bg-edge-strong",
            )}
          />
        ))}
      </span>
    </span>
  );
}
