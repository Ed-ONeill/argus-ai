"use client";

// LeadStory — the centerpiece of the workspace. One REAL event, with its intelligence
// attached inline rather than split into separate sections: the headline answers WHAT
// HAPPENED, the causal read + actor chain answer WHY, the named companies and sector
// exposure answer WHO IS AFFECTED, and the forward line answers WHAT TO WATCH. All four
// investor questions, hung off a single real story. When the story has no linked
// interpretation, it degrades honestly to headline + who — never a bolted-on chain.

import { Fragment } from "react";
import Link from "next/link";
import { EntityChip } from "@/components/common/EntityChip";
import { timeAgo } from "@/lib/utils";
import type { WhyItsMoving, CausalActor } from "@/lib/homeBriefing";
import type { TopStory } from "@/lib/topStories";

const WIN = "#34D399";
const LOSE = "#F87171";
const isTicker = (s: string): boolean => /^[A-Z]{1,5}$/.test(s.trim());

function Exposure({ label, items, color }: { label: string; items: CausalActor[]; color: string }) {
  if (items.length === 0) return null;
  return (
    <span className="inline-flex flex-wrap items-baseline gap-x-1.5 gap-y-1">
      <span className="text-[8.5px] font-semibold uppercase tracking-[0.14em]" style={{ color }}>{label}</span>
      {items.map((a, i) => (
        <EntityChip key={`${a.label}-${i}`} kind={a.kind} label={a.label} color={color} size="md"
          className="text-[12px] font-medium" />
      ))}
    </span>
  );
}

export function LeadStory({ story, why, watchLine }: {
  story: TopStory;
  why: WhyItsMoving | null;
  watchLine: string | null;
}) {
  const meta = [
    story.sources ? `${story.sources} ${story.sources === 1 ? "source" : "sources"}` : null,
    timeAgo(story.when),
  ].filter(Boolean).join(" · ");

  return (
    <section aria-label="Lead story" className="flex flex-col gap-3">
      {/* What happened */}
      <div>
        <div className="flex items-baseline gap-2.5">
          <span className="mt-1 shrink-0 text-[8.5px] font-semibold uppercase tracking-[0.16em] text-accent">{story.tag}</span>
          <Link href={story.href}
            className="font-serif text-[clamp(1.15rem,2.2vw,1.5rem)] font-normal leading-[1.24] tracking-[-0.01em] text-ink transition-colors hover:text-accent motion-reduce:transition-none">
            {story.title}
          </Link>
        </div>
        {(story.companies.length > 0 || meta) && (
          <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 pl-[calc(0.625rem+8px)]">
            {story.companies.map((c, i) => (
              <EntityChip key={`${c}-${i}`} kind={isTicker(c) ? "ticker" : "company"} label={c} size="md"
                className="text-[11.5px] font-medium text-ink-secondary" />
            ))}
            {meta && <span className="font-mono text-[10px] text-ink-faint">{meta}</span>}
          </div>
        )}
      </div>

      {/* Why it's moving — attached to this story */}
      {why && (
        <div className="flex flex-col gap-2 border-l-2 border-accent/40 pl-3.5">
          <p className="max-w-[64ch] text-[13px] leading-relaxed text-ink-secondary">{why.read}</p>
          <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
            {why.chain.map((a, i) => (
              <Fragment key={`${a.label}-${i}`}>
                <EntityChip kind={a.kind} label={a.label} size="md"
                  className="rounded-md border border-edge-subtle bg-raised/50 px-1.5 py-0.5 text-[12px] font-semibold text-ink" />
                {i < why.chain.length - 1 && <span className="text-ink-faint" aria-hidden>&rarr;</span>}
              </Fragment>
            ))}
          </div>
          {(why.benefits.length > 0 || why.atRisk.length > 0) && (
            <div className="flex flex-wrap gap-x-6 gap-y-1.5">
              <Exposure label="Benefits" items={why.benefits} color={WIN} />
              <Exposure label="At risk" items={why.atRisk} color={LOSE} />
            </div>
          )}
        </div>
      )}

      {/* What to watch — the forward line */}
      {watchLine && (
        <p className="text-[11.5px] text-ink-muted">
          <span className="font-semibold uppercase tracking-[0.14em] text-ink-faint">Watch </span>{watchLine}
        </p>
      )}
    </section>
  );
}
