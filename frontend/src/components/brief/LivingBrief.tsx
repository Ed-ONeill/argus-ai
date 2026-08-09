"use client";

// LivingBrief — the homepage as a market WORKSPACE (software, not a document). Visual
// hierarchy guides the eye: (1) the live tape band, always visible up top, tells you the
// state at a glance; (2) the lead story dominates the wide main column — the largest thing
// on the page, where the eye lands and stays; (3) secondary headlines sit compact in a
// side rail. Full desktop width, two columns on large screens, one column on mobile. No
// new information here versus the prior iteration — only hierarchy, density, and spacing.

import { useEffect, useMemo, useState } from "react";
import { buildHomeBriefing } from "@/lib/homeBriefing";
import { buildTopStories } from "@/lib/topStories";
import { planAdaptiveHero } from "@/lib/adaptiveHero";
import { resolveSession, type SessionInfo } from "@/lib/marketSession";
import { timeAgo } from "@/lib/utils";
import type { FeedResponse } from "@/lib/types";
import { MarketSummary } from "./MarketSummary";
import { AdaptiveHero } from "./AdaptiveHero";
import { TopStories } from "./TopStories";
import { MarketPulse } from "./MarketPulse";

/** Client-only session clock — avoids SSR/hydration drift; ticks each minute. */
function useSession(): SessionInfo | null {
  const [session, setSession] = useState<SessionInfo | null>(null);
  useEffect(() => {
    const tick = () => setSession(resolveSession(new Date()));
    tick();
    const id = setInterval(tick, 30_000);
    return () => clearInterval(id);
  }, []);
  return session;
}

function Header({ session, generatedAt, isStale }: {
  session: SessionInfo | null; generatedAt?: string; isStale?: boolean;
}) {
  const updated = timeAgo(generatedAt);
  return (
    <div className="mb-4 flex items-center justify-between gap-3">
      <div className="flex items-center gap-2.5">
        <span className="text-[13px] font-bold uppercase tracking-[0.32em] text-ink">Argus</span>
        <span className="h-3 w-px bg-edge-strong" />
        {session?.live ? (
          <span className="relative flex h-1.5 w-1.5" aria-hidden>
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400/60 motion-reduce:animate-none" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]" />
          </span>
        ) : (
          <span className="h-1.5 w-1.5 rounded-full bg-ink-faint" aria-hidden />
        )}
        <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-ink-secondary">
          {session ? session.label : "Brief"}
        </span>
        {session && <span className="font-mono text-[10px] tracking-tight text-ink-faint">{session.etClock}</span>}
      </div>
      {updated && (
        <span className={`font-mono text-[10px] tracking-tight ${isStale ? "text-amber-400/90" : "text-ink-faint"}`}>
          {isStale ? "delayed · " : "updated "}{updated}
        </span>
      )}
    </div>
  );
}

export function LivingBrief({ feed, generatedAt, isStale }: {
  feed: FeedResponse | undefined;
  generatedAt?: string;
  isStale?: boolean;
}) {
  const session = useSession();
  const vm = useMemo(() => buildHomeBriefing(feed), [feed]);
  const stories = useMemo(() => buildTopStories(feed), [feed]);
  const plan = useMemo(() => planAdaptiveHero(feed), [feed]);
  const lead = stories[0] ?? null;
  const rest = stories.slice(1);
  const hasContent = stories.length > 0 || vm.hasIntelligence;

  return (
    <div className="brief-dark overflow-hidden rounded-[26px] border border-edge/70 bg-canvas px-5 py-6 text-ink shadow-[0_40px_90px_-55px_rgba(0,0,0,0.85)] sm:px-8 sm:py-7">
      <Header session={session} generatedAt={generatedAt} isStale={isStale} />

      {!hasContent ? (
        <p className="max-w-[52ch] text-[15px] leading-relaxed text-ink-secondary">
          Argus is assembling this session&rsquo;s intelligence. The workspace populates as evidence accumulates.
        </p>
      ) : (
        <>
          {/* The market state — always visible, alive, full width. Summary is quiet
              context; the tape is the living element. */}
          <div className="flex flex-col gap-3 border-y border-edge-subtle py-4">
            <MarketSummary sessionLabel={session?.label ?? null} live={!!session?.live} />
            <MarketPulse />
          </div>

          {/* The workspace: the lead story dominates the wide main column; the rest of
              the tape sits compact in the side rail. */}
          <div className="mt-6 grid grid-cols-1 gap-x-9 gap-y-7 lg:grid-cols-[minmax(0,1fr)_17rem]">
            <div className="min-w-0">
              {lead && <AdaptiveHero story={lead} plan={plan} why={vm.why} watchLine={vm.watchLine} />}
            </div>
            {rest.length > 0 && (
              <aside className="lg:border-l lg:border-edge-subtle lg:pl-9">
                <TopStories items={rest} />
              </aside>
            )}
          </div>
        </>
      )}
    </div>
  );
}
