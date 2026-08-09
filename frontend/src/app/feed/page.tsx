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
import { TopNav } from "@/components/layout/TopNav";
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
    error: { title: "Couldn't reach the market feed", body: "The pipeline is healthy; this is a temporary connection issue." },
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
      <TopNav onRefresh={() => refresh(true)} onOpenSettings={() => setSettingsOpen(true)} isRefreshing={isFetching} />
      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />

      <div className="brief-dark min-h-[calc(100vh-3.5rem)] bg-canvas text-ink">
        <NewStoriesBanner visible={hasNew && !isFetching} onLoad={() => refresh(false)} />

        <div className="mx-auto max-w-3xl px-5 pb-16 pt-8 sm:px-8">
          <header className="mb-5">
            <h1 className="text-[13px] font-bold uppercase tracking-[0.32em] text-ink">Feed</h1>
            <p className="mt-1.5 max-w-[52ch] text-[13px] leading-relaxed text-ink-secondary">
              Discover what you didn&rsquo;t know to look for. The market&rsquo;s developments beyond your briefing.
            </p>
          </header>

          {/* The visual centerpiece — today's market concepts and how events connect them. */}
          <div className="mb-7">
            <MarketLandscape feed={data} activeId={focusNode?.id ?? null} onFocus={setFocusNode} />
          </div>

          <MarketFeed
            feed={data}
            isLoading={isLoading}
            focus={focusNode ? { id: focusNode.id, label: focusNode.label, eventIds: focusNode.eventIds } : null}
            onClearFocus={() => setFocusNode(null)}
          />

          {data && !isLoading && (
            <p className="mt-10 text-center text-[10px] text-ink-faint">
              {data.sources.length} sources · updated {formatRelativeAge(cacheAgeSeconds)}
              {data.is_stale && <span className="text-amber-400/70"> · refreshing</span>}
            </p>
          )}
        </div>
      </div>
    </>
  );
}
