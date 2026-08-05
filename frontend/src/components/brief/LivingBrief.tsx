"use client";

// LivingBrief — the Living Intelligence Brief (PX1.0–1.2 + visual identity pass).
// ONE continuous, calm, PREMIUM institutional document. Built on the token system
// (.brief-dark) with restrained depth (aurora + light-from-above panels), a
// confident typographic hero, and honest-by-omission sections. Pillars: What Matters
// Most + Market Map. Movers/Calendar/Analogs/Personalization stay absent until real.

import { useEffect, useMemo, useState } from "react";
import { buildLivingBrief } from "@/lib/livingBrief";
import { resolveSession, type SessionInfo } from "@/lib/marketSession";
import { timeAgo } from "@/lib/utils";
import type { FeedResponse } from "@/lib/types";
import { WhatMattersMost } from "./WhatMattersMost";
import { MarketMap } from "./MarketMap";
import { EmergingSignals } from "./EmergingSignals";
import { MarketMemory } from "./MarketMemory";

/** Client-only session clock — avoids SSR/hydration drift; ticks each minute. */
function useSession(): SessionInfo | null {
  const [session, setSession] = useState<SessionInfo | null>(null);
  useEffect(() => {
    // Tick often enough that the clock and relative timestamps visibly advance —
    // the brief should feel connected to now, not to when the page loaded.
    const tick = () => setSession(resolveSession(new Date()));
    tick();
    const id = setInterval(tick, 30_000);
    return () => clearInterval(id);
  }, []);
  return session;
}

function StatusBar({ session, generatedAt, isStale }: {
  session: SessionInfo | null; generatedAt?: string; isStale?: boolean;
}) {
  const updated = timeAgo(generatedAt);
  return (
    <div className="mb-9 flex items-center justify-between">
      <div className="flex items-center gap-2.5">
        {session?.live ? (
          <span className="relative flex h-1.5 w-1.5" aria-hidden>
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400/60 motion-reduce:animate-none" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]" />
          </span>
        ) : (
          <span className="h-1.5 w-1.5 rounded-full bg-ink-faint" aria-hidden />
        )}
        <span className="text-[10.5px] font-semibold uppercase tracking-[0.2em] text-ink-secondary">
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
  const vm = useMemo(() => buildLivingBrief(feed), [feed]);
  const themeCount = feed?.theme_intelligence?.length ?? 0;
  const sourceCount = feed?.sources?.length ?? 0;

  return (
    <div className="brief-dark overflow-hidden rounded-[26px] border border-edge/70 bg-canvas px-5 py-7 text-ink shadow-[0_40px_90px_-55px_rgba(0,0,0,0.85)] sm:px-11 sm:py-10">
      <StatusBar session={session} generatedAt={generatedAt} isStale={isStale} />

      <header className="mb-10">
        <div className="flex items-center gap-2.5">
          <span className="text-[13px] font-bold uppercase tracking-[0.34em] text-ink">Argus</span>
          <span className="h-3 w-px bg-edge-strong" />
          <span className="text-[11px] font-medium uppercase tracking-[0.28em] text-ink-muted">
            Intelligence Brief
          </span>
        </div>
        {vm.hasIntelligence && themeCount > 0 && (
          // A quiet, honest signal that Argus is watching the market for you — real
          // counts, so it reads as presence, not decoration.
          <p className="mt-2 text-[11px] text-ink-faint">
            Watching {themeCount} live {themeCount === 1 ? "theme" : "themes"}
            {sourceCount > 0 && <> across {sourceCount} sources</>}
          </p>
        )}
      </header>

      {!vm.hasIntelligence ? (
        <p className="max-w-[52ch] text-[15px] leading-relaxed text-ink-secondary">
          Argus is assembling this session&rsquo;s intelligence. The brief populates as
          evidence accumulates.
        </p>
      ) : (
        <div className="flex flex-col">
          {/* Masthead — the apex. The summary is the one statement the eye lands on. */}
          {vm.executiveSummary && (
            <p aria-label="Executive summary"
              className="max-w-[19ch] font-serif text-[clamp(1.6rem,3.4vw,2.6rem)] font-normal leading-[1.22] tracking-[-0.015em] text-ink">
              {vm.executiveSummary}
            </p>
          )}

          {/* The lead: understand what is happening. */}
          <div className="pt-16">
            <WhatMattersMost items={vm.whatMattersMost} />
          </div>

          {/* The signature visual: understand WHY, in three seconds. */}
          {vm.marketMap && (
            <div className="pt-16">
              <MarketMap map={vm.marketMap} live={session?.live} />
            </div>
          )}

          {/* Anticipation: what is beginning before consensus (permanent pillar). */}
          <div className="pt-16">
            <EmergingSignals signals={vm.emergingSignals} />
          </div>

          {/* Memory: Argus remembers the narrative's whole life, not just today. */}
          {vm.marketMemory && (
            <div className="pt-16">
              <MarketMemory memory={vm.marketMemory} />
            </div>
          )}

          {/* The closer — the question lands harder AFTER context. Once you see what
              and why, you naturally ask the institutional question worth resolving. */}
          {vm.institutionalQuestion && (
            <div className="mt-16 border-t border-edge/50 pt-8">
              <p className="mb-2 text-[9.5px] font-semibold uppercase tracking-[0.22em] text-ink-faint">
                The question this raises
              </p>
              <p className="max-w-[44ch] font-serif text-[clamp(1.1rem,2vw,1.4rem)] italic leading-snug text-ink-secondary">
                {vm.institutionalQuestion}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
