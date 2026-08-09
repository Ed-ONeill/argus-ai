"use client";

// More Stories — the side rail: the rest of the day's real developments beneath the lead,
// as compact, scannable headlines with a full-row hover target. Deliberately quiet (tag +
// headline + meta, no chips) so the lead story in the main column keeps the eye. Each row
// links into its event. Real news only; the lead and its attached intelligence render
// separately (see LeadStory).

import Link from "next/link";
import { timeAgo } from "@/lib/utils";
import type { TopStory } from "@/lib/topStories";

function Story({ story }: { story: TopStory }) {
  const meta = [
    story.sources ? `${story.sources} ${story.sources === 1 ? "source" : "sources"}` : null,
    timeAgo(story.when),
  ].filter(Boolean).join(" · ");

  return (
    <li className="group">
      <Link href={story.href}
        className="-mx-2 flex flex-col gap-0.5 rounded-md px-2 py-2 transition-colors hover:bg-raised/30 motion-reduce:transition-none">
        <span className="text-[8px] font-semibold uppercase tracking-[0.14em] text-ink-faint">{story.tag}</span>
        <span className="text-[12.5px] font-medium leading-snug text-ink-secondary transition-colors group-hover:text-ink motion-reduce:transition-none">
          {story.title}
        </span>
        {meta && <span className="font-mono text-[9.5px] text-ink-faint">{meta}</span>}
      </Link>
    </li>
  );
}

export function TopStories({ items }: { items: TopStory[] }) {
  if (items.length === 0) return null;
  return (
    <section aria-labelledby="more-stories-heading">
      <h2 id="more-stories-heading" className="mb-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-ink-faint">
        More stories
      </h2>
      <ol className="flex flex-col divide-y divide-edge-subtle/60">
        {items.map((s) => <Story key={s.id} story={s} />)}
      </ol>
    </section>
  );
}
