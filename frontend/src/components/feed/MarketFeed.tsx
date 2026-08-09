"use client";

// MarketFeed — the Law-10 Feed: an editorial stream of real market developments organized
// around companies, markets, and events. Each card stands alone (category · headline · why
// it matters · who · source) and is understandable if sent on its own. It teaches only what
// the homepage Brief did not already show (see buildFeedStream). No graphs, no dashboards,
// no engine vocabulary — the Feed is editorial; analysis lives elsewhere. Brief typography
// and semantic tokens throughout.

import { useMemo, useState } from "react";
import Link from "next/link";
import { EntityChip } from "@/components/common/EntityChip";
import { cn, timeAgo } from "@/lib/utils";
import { buildCardsForEventIds, buildFeedStream, categoriesOf, type FeedCard, type FeedCategory } from "@/lib/feedStream";
import type { FeedResponse } from "@/lib/types";

export interface FeedFocus { id: string; label: string; eventIds: string[]; }

const PAGE = 20;

function Card({ card }: { card: FeedCard }) {
  const meta = [
    card.sources ? `${card.sources} ${card.sources === 1 ? "source" : "sources"}` : null,
    timeAgo(card.when),
  ].filter(Boolean).join(" · ");

  return (
    <li className="group">
      <Link href={card.href}
        className="-mx-3 flex flex-col gap-1.5 rounded-lg px-3 py-3.5 transition-colors hover:bg-raised/30 motion-reduce:transition-none">
        <div className="flex items-center gap-2">
          <span className="text-[8.5px] font-semibold uppercase tracking-[0.16em] text-ink-faint">{card.category}</span>
          {card.developing && (
            <span className="rounded-full bg-amber-400/12 px-1.5 py-0.5 text-[8px] font-semibold uppercase tracking-[0.12em] text-amber-400/90">
              Developing
            </span>
          )}
        </div>
        <h3 className="text-[15px] font-semibold leading-snug text-ink transition-colors group-hover:text-accent motion-reduce:transition-none">
          {card.headline}
        </h3>
        {card.why && <p className="max-w-[70ch] text-[12.5px] leading-relaxed text-ink-secondary">{card.why}</p>}
        {(card.entities.length > 0 || meta) && (
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 pt-0.5">
            {card.entities.map((e, i) => (
              <EntityChip key={`${e.label}-${i}`} kind={e.kind} label={e.label} size="md" className="text-[11px] font-medium text-ink-muted" />
            ))}
            {meta && <span className="font-mono text-[10px] text-ink-faint">{meta}</span>}
          </div>
        )}
      </Link>
    </li>
  );
}

export function MarketFeed({ feed, isLoading, focus, onClearFocus }: {
  feed: FeedResponse | undefined;
  isLoading?: boolean;
  focus?: FeedFocus | null;
  onClearFocus?: () => void;
}) {
  const stream = useMemo(() => buildFeedStream(feed), [feed]);
  const focused = useMemo(
    () => (focus ? buildCardsForEventIds(feed, new Set(focus.eventIds)) : null),
    [feed, focus],
  );
  const cats = useMemo(() => categoriesOf(stream), [stream]);
  const [active, setActive] = useState<FeedCategory | "All">("All");
  const [count, setCount] = useState(PAGE);

  // Focus mode — the full picture for the clicked landscape concept.
  if (focus && focused) {
    return (
      <div>
        <div className="mb-4 flex items-center justify-between gap-3 border-b border-edge-subtle pb-3">
          <p className="text-[13px] text-ink">
            <span className="font-semibold">{focus.label}</span>
            <span className="text-ink-muted"> · {focused.length} {focused.length === 1 ? "development" : "developments"}</span>
          </p>
          <button type="button" onClick={onClearFocus}
            className="text-[11px] font-medium text-ink-muted transition-colors hover:text-ink motion-reduce:transition-none">
            Clear
          </button>
        </div>
        {focused.length > 0 ? (
          <ol className="flex flex-col divide-y divide-edge-subtle/60">{focused.map((c) => <Card key={c.id} card={c} />)}</ol>
        ) : (
          <p className="text-[13px] leading-relaxed text-ink-muted">Everything on {focus.label} today is in your briefing above.</p>
        )}
      </div>
    );
  }

  const visible = active === "All" ? stream : stream.filter((c) => c.category === active);
  const shown = visible.slice(0, count);

  if (isLoading && stream.length === 0) {
    return <div className="space-y-3" aria-hidden>{[0, 1, 2, 3].map((i) => <div key={i} className="h-20 animate-pulse rounded-lg bg-surface/40" />)}</div>;
  }
  if (stream.length === 0) {
    return (
      <p className="text-[13px] leading-relaxed text-ink-muted">
        Nothing new beyond your briefing yet. The feed fills in as fresh events clear corroboration.
      </p>
    );
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-1.5" role="tablist" aria-label="Categories">
        {(["All", ...cats] as const).map((c) => (
          <button key={c} type="button" role="tab" aria-selected={active === c}
            onClick={() => { setActive(c); setCount(PAGE); }}
            className={cn(
              "rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.1em] transition-colors motion-reduce:transition-none",
              active === c ? "bg-raised text-ink" : "text-ink-faint hover:text-ink-secondary",
            )}>
            {c}
          </button>
        ))}
      </div>

      <ol className="flex flex-col divide-y divide-edge-subtle/60">
        {shown.map((c) => <Card key={c.id} card={c} />)}
      </ol>

      {visible.length > count && (
        <div className="mt-5 flex justify-center">
          <button type="button" onClick={() => setCount((n) => n + PAGE)}
            className="rounded-lg border border-edge-subtle px-4 py-1.5 text-[11px] font-medium text-ink-secondary transition-colors hover:border-edge hover:text-ink motion-reduce:transition-none">
            Show more
          </button>
        </div>
      )}
    </div>
  );
}
