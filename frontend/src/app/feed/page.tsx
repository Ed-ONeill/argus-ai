"use client";

// The Feed (Law-10 compliant) — editorial discovery, not a dashboard.
//
// "The Feed lets you discover what you didn't know to look for." It is one continuous,
// token-styled editorial stream of real market developments (companies, markets, events),
// each card standing alone, each teaching something the homepage Brief did not already
// show. The market-map graph, the theme workspace, the signal-pick grid, and the nine-panel
// dossiers are removed from this surface — the reasoning components remain in the repo
// (capability preserved, relocated to advanced-analysis surfaces later, not deleted here).

import { useEffect, useState } from "react";
import { useFeed } from "@/hooks/useFeed";
import { useFeedFreshness } from "@/hooks/useFeedFreshness";
import { NewStoriesBanner } from "@/components/feed/NewStoriesBanner";
import { SettingsModal } from "@/components/layout/SettingsModal";
import Link from "next/link";
import { ArrowUpRight, RefreshCw, SlidersHorizontal } from "lucide-react";
import { MarketFeed } from "@/components/feed/MarketFeed";
import { MarketLandscape } from "@/components/feed/MarketLandscape";
import type { LandscapeNode } from "@/lib/marketLandscape";
import { formatRelativeAge } from "@/lib/utils";

/**
 * Distinct, non-empty top-level states. A 401 (unauthenticated) or an API failure must
 * never be shown as "no stories" — each has its own view.
 */
function FeedGateView({ kind, onRetry }: { kind: "loading" | "unauthenticated" | "error"; onRetry?: () => void }) {
  const copy = {
    loading: { title: "Preparing your feed…", body: "Establishing your secure session." },
    unauthenticated: { title: "Sign in to open your feed", body: "Your session has expired. Redirecting you to sign in…" },
    error: { title: "Couldn't reach the market feed", body: "We couldn't load reporting. Try again in a moment." },
  }[kind];
  return (
    <div className="brief-dark flex min-h-[calc(100vh-3.5rem)] items-center justify-center bg-canvas px-4 py-8 text-ink">
      <div className="max-w-[420px] text-center">
        {kind === "loading" && (
          <span className="mb-4 inline-block h-4 w-4 animate-spin rounded-full border border-ink-faint border-t-ink-secondary" />
        )}
        <h1 className="mb-2 text-[16px] font-medium text-ink">{copy.title}</h1>
        <p className="text-[13px] leading-relaxed text-ink-secondary">{copy.body}</p>
        {kind === "unauthenticated" && (
          <a href="/auth" className="mt-4 inline-block text-[12px] font-bold uppercase tracking-[0.08em] text-accent">
            Go to sign in →
          </a>
        )}
        {kind === "error" && onRetry && (
          <button onClick={onRetry}
            className="mt-4 rounded bg-accent px-4 py-2 text-[10.5px] font-bold uppercase tracking-[0.12em] text-white">
            Retry
          </button>
        )}
      </div>
    </div>
  );
}

export default function FeedPage() {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [focusNode, setFocusNode] = useState<LandscapeNode | null>(null);
  const { data, isLoading, isFetching, error, refresh, isAuthWaiting, isUnauthorized } = useFeed();
  const { hasNew, cacheAgeSeconds } = useFeedFreshness({ currentGeneratedAt: data?.generated_at });

  useEffect(() => {
    if (error) console.error("[feed] query error:", error);
  }, [error]);

  if (isUnauthorized) return <FeedGateView kind="unauthenticated" />;
  if (isAuthWaiting) return <FeedGateView kind="loading" />;
  if (error && !data) return <FeedGateView kind="error" onRetry={() => refresh(true)} />;

  return (
    <>
      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />

      <div className="brief-dark discovery-page min-h-[calc(100vh-3.5rem)] bg-canvas text-ink">
        <NewStoriesBanner visible={hasNew && !isFetching} onLoad={() => refresh(false)} />

        <div className="relative mx-auto max-w-6xl px-5 pb-20 pt-10 sm:px-8 sm:pt-14">
          <header className="discovery-enter mb-8 flex flex-wrap items-end justify-between gap-6">
            <div>
              <p className="discovery-eyebrow">Argus / Feed</p>
              <h1 className="mt-4 font-serif text-[clamp(2.4rem,5vw,4.2rem)] leading-[1.06] tracking-tight">Follow the story.<br /><span className="text-cyan-200">See the connections.</span></h1>
              <p className="mt-5 max-w-[52ch] text-sm leading-relaxed text-ink-secondary">Explore the people, companies and markets in the reporting. Start with a connection, then open the evidence.</p>
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={() => refresh(true)} disabled={isFetching} className="discovery-control" aria-label="Refresh feed"><RefreshCw size={14} className={isFetching ? "animate-spin motion-reduce:animate-none" : ""} />{isFetching ? "Refreshing" : "Refresh"}</button>
              <button type="button" onClick={() => setSettingsOpen(true)} className="discovery-control"><SlidersHorizontal size={14} />Settings</button>
            </div>
          </header>

          {/* The visual centerpiece — today's market concepts and how events connect them. */}
          <div className="mb-7">
            <MarketLandscape feed={data} activeId={focusNode?.id ?? null} onFocus={setFocusNode} />
          </div>

          <div className="mt-10 grid items-start gap-10 lg:grid-cols-[minmax(0,1fr)_250px]">
          <MarketFeed
            feed={data}
            isLoading={isLoading}
            focus={focusNode ? { id: focusNode.id, label: focusNode.label, eventIds: focusNode.eventIds } : null}
            onClearFocus={() => setFocusNode(null)}
          />
          <aside className="discovery-panel p-6 lg:sticky lg:top-24">
            <p className="discovery-eyebrow">A closer look</p>
            <h2 className="mt-3 font-serif text-2xl">From headline<br />to understanding.</h2>
            <ol className="mt-6 space-y-5 text-xs leading-relaxed text-ink-secondary">
              <li><span className="mb-1 block font-mono text-cyan-200">01 / Explore</span>Select a name in the landscape to reveal its reporting.</li>
              <li><span className="mb-1 block font-mono text-cyan-200">02 / Inspect</span>Open a story for source reports, publication times and evidence.</li>
              <li><span className="mb-1 block font-mono text-cyan-200">03 / Distinguish</span>A connection is an association. A financial implication needs its own support.</li>
            </ol>
            <Link href="/markets" className="mt-7 flex items-center justify-between border-t border-edge pt-5 text-sm text-cyan-200">Explore market movement <ArrowUpRight size={17} /></Link>
          </aside>
          </div>

          {data && !isLoading && (
            <p className="mt-10 text-center text-[10px] text-ink-faint">
              {data.sources.length} source labels · Feed snapshot updated {formatRelativeAge(cacheAgeSeconds)}
              {data.is_stale && <span className="text-amber-400/70"> · refreshing</span>}
            </p>
          )}
        </div>
      </div>
    </>
  );
}
