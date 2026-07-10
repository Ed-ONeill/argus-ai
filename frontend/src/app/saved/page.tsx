"use client";

/**
 * Saved - the user's STANDING INTELLIGENCE WATCH (Phase 2.1 Saved
 * unification). "What am I monitoring, and what changed since I last
 * checked?"
 *
 * Every intelligence value on this page is a shared-engine read projected
 * through lib/savedIntel (canonical provisioning, profiles, the change
 * ledger, riskRead, derived narratives, research priorities). The page owns
 * ONLY: the user's saved/followed selection (useSaved / useWatchlist /
 * useFollowedThemes / useThemeWatchlist), ordering, and presentation. Saving
 * an item never alters intelligence - prioritization, never truth.
 */

import { useMemo } from "react";
import { motion } from "framer-motion";
import { Bookmark, Eye, ArrowUpRight, AlertTriangle } from "lucide-react";
import Link from "next/link";
import { useSaved } from "@/hooks/useSaved";
import { useWatchlist } from "@/hooks/useWatchlist";
import { useFollowedThemes } from "@/hooks/useFollowedThemes";
import { useThemeWatchlist } from "@/hooks/useThemeWatchlist";
import { useAuth } from "@/context/AuthContext";
import { useArgusIntelligence } from "@/hooks/useArgusIntelligence";
import { StoryCard } from "@/components/feed/StoryCard";
import { buildSavedIntel, type SavedEntityInput, type SavedItemVM } from "@/lib/savedIntel";
import { deriveMorningBriefDeltas, type MorningBriefDelta } from "@/lib/intelligenceDeltas";
import { getTrackedThemes } from "@/lib/themeSnapshots";
import { buildTheRead } from "@/lib/theRead";
import { buildIntelligenceProfile, type IntelligenceProfile } from "@/lib/intelligenceProfile";
import { buildRiskRead, type RiskRead } from "@/lib/riskRead";
import { findNarrativeForTheme } from "@/lib/narrativeDerivation";
import { explorerHrefForNode } from "@/lib/intelligenceShared";
import { cleanThemeName } from "@/app/markets/marketsShared";

const DELTA_COLOR: Record<MorningBriefDelta["kind"], string> = {
  CONTRADICTED: "#dc2626", BROKEN: "#dc2626", WEAKENED: "#d97706",
  STRENGTHENED: "#059669", NEW: "#2563eb", EXPANDED: "#0891b2", REMOVED: "#64748b",
};

const KIND_LABEL: Record<SavedItemVM["kind"], string> = {
  company: "Company", etf: "ETF", theme: "Theme", sector: "Sector", narrative: "Narrative", story: "Story",
};

function trendArrow(trend: SavedItemVM["trend"]): { glyph: string; color: string } | null {
  if (trend === "rising") return { glyph: "▲", color: "#059669" };
  if (trend === "falling") return { glyph: "▼", color: "#dc2626" };
  if (trend === "stable") return { glyph: "→", color: "#64748b" };
  return null;
}

function MonitoredRow({ item }: { item: SavedItemVM }) {
  const href = explorerHrefForNode({ type: item.nodeType, label: item.entityKey });
  const arrow = trendArrow(item.trend);
  const changeColor = item.latestChange ? DELTA_COLOR[item.latestChange.kind] : null;

  const body = (
    <div className="rounded-xl border border-edge bg-surface px-4 py-3 hover:border-edge-strong transition-colors group">
      {/* identity row */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[9px] font-bold uppercase tracking-[0.14em] px-1.5 py-0.5 rounded bg-raised border border-edge text-ink-muted shrink-0">
          {KIND_LABEL[item.kind]}
        </span>
        <span className="text-[13.5px] font-semibold text-ink group-hover:text-accent transition-colors">
          {item.kind === "theme" || item.kind === "narrative" ? cleanThemeName(item.label) : item.label}
        </span>
        {item.narrative && (
          <span className="text-[8.5px] font-semibold px-1.5 py-0.5 rounded-full bg-accent/10 text-accent border border-accent/20"
            title="Derived-narrative membership (shared narrative model)">
            {cleanThemeName(item.narrative)}
          </span>
        )}
        {!item.live && (
          <span className="text-[8.5px] font-semibold px-1.5 py-0.5 rounded-full bg-raised text-ink-muted border border-edge"
            title="Not present in today's intelligence cycle; reads degrade honestly">
            not in today&apos;s cycle
          </span>
        )}
        <span className="ml-auto flex items-center gap-2 shrink-0">
          {item.conviction !== null && (
            <span className="text-[12px] font-black tabular-nums text-ink"
              title={`Conviction ${item.conviction} (${item.convictionBasis}) - the same number Explorer shows`}>
              {item.conviction}
              {arrow && <span className="ml-1 text-[10px]" style={{ color: arrow.color }}>{arrow.glyph}</span>}
            </span>
          )}
          {item.status && (
            <span className="text-[8.5px] font-bold uppercase tracking-wide text-ink-muted">{item.status}</span>
          )}
          {href && <ArrowUpRight size={12} className="text-ink-muted/40 group-hover:text-accent transition-colors" />}
        </span>
      </div>

      {/* latest meaningful change - the canonical ledger record, verbatim */}
      {item.latestChange && (
        <p className="text-[11.5px] text-ink-secondary leading-snug mt-1.5 break-words" title={item.latestChange.why}>
          <span className="text-[7.5px] font-bold tracking-[0.12em] px-1 py-0.5 rounded border mr-1.5 align-middle"
            style={{ color: changeColor ?? undefined, borderColor: changeColor ? `${changeColor}55` : undefined }}>
            {item.latestChange.kind}
          </span>
          {item.latestChange.what}
        </p>
      )}

      {/* risk + watch, from the shared risk read */}
      {(item.risk || item.watch) && (
        <div className="mt-1.5 space-y-0.5">
          {item.risk && (
            <p className="text-[10.5px] text-ink-muted leading-snug break-words">
              <span className="font-bold uppercase tracking-wide text-[8px] text-red-600/70 mr-1">Risk</span>
              {item.risk}
            </p>
          )}
          {item.watch && (
            <p className="text-[10.5px] text-ink-muted leading-snug break-words">
              <span className="font-bold uppercase tracking-wide text-[8px] text-accent/70 mr-1">Watch</span>
              {item.watch}
              <span className="ml-1.5 text-[7px] font-bold tracking-[0.12em] px-1 py-px rounded border border-accent/30 text-accent/70 align-middle">DERIVED</span>
            </p>
          )}
        </div>
      )}
    </div>
  );

  return href ? <Link href={href} className="block">{body}</Link> : body;
}

export default function SavedPage() {
  const { savedItems, toggleSave } = useSaved();
  const { user, loading }          = useAuth();
  const { watchlist }              = useWatchlist();
  const { followed }               = useFollowedThemes();
  const { watchedIds }             = useThemeWatchlist();

  // Canonical provisioning: the ONE hook every surface mounts (A1).
  const argus = useArgusIntelligence();

  /* -- the monitored selection (user state only) -- */
  const followedInputs = useMemo<SavedEntityInput[]>(() => {
    const out: SavedEntityInput[] = followed.map(f => ({ id: f.id, label: f.name, kind: "theme", savedAt: f.followedAt }));
    const have = new Set(followed.map(f => f.id));
    for (const id of watchedIds) {
      if (have.has(id)) continue;
      const t = argus.themes.find(x => x.id === id);
      out.push({ id, label: t ? t.name : id, kind: "theme" });
    }
    return out;
  }, [followed, watchedIds, argus.themes]);

  const entityInputs = useMemo<SavedEntityInput[]>(
    () => watchlist.map(w => ({
      id: w.id, label: w.id,
      kind: w.type === "ticker" ? "company" as const : w.type === "sector" ? "sector" as const : "theme" as const,
      savedAt: w.addedAt,
    })),
    [watchlist],
  );

  /* -- shared intelligence, gathered once and injected into the pure VM -- */
  const deltaResult = useMemo(
    () => deriveMorningBriefDeltas({ themes: argus.themes, previouslyTracked: getTrackedThemes(), graphReady: argus.ready }),
    [argus.themes, argus.ready],
  );

  const read = useMemo(
    () => buildTheRead({
      themes: argus.themes, deltas: deltaResult.deltas, graphReady: argus.ready,
      followedThemeNames: followed.map(f => f.name),
    }),
    [argus.themes, deltaResult.deltas, argus.ready, followed],
  );

  const { profiles, risks } = useMemo(() => {
    const p = new Map<string, IntelligenceProfile>();
    const r = new Map<string, RiskRead>();
    for (const e of [...followedInputs, ...entityInputs]) {
      const liveTheme = e.kind === "theme"
        ? argus.themes.find(t => t.id === e.id || t.name.toLowerCase() === e.label.toLowerCase()) ?? null
        : null;
      const label = liveTheme?.name ?? e.label;
      const key = label.toLowerCase();
      if (r.has(key)) continue;
      if (argus.ready) p.set(key, buildIntelligenceProfile(label));
      r.set(key, buildRiskRead(label, liveTheme));
    }
    return { profiles: p, risks: r };
  }, [followedInputs, entityInputs, argus.themes, argus.ready]);

  const vm = useMemo(
    () => buildSavedIntel({
      savedEntities: entityInputs,
      followedThemes: followedInputs,
      themes: argus.themes,
      profiles, risks,
      deltas: deltaResult.deltas,
      hadMemory: deltaResult.hadMemory,
      narrativeOf: argus.ready ? (name: string) => findNarrativeForTheme(name) : undefined,
      researchPriorities: read.priorities.data ?? [],
      graphReady: argus.ready,
    }),
    [entityInputs, followedInputs, argus.themes, profiles, risks, deltaResult, read.priorities.data, argus.ready],
  );

  const summary = vm.summary.data;
  const monitoredItems = vm.items.data ?? [];

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6">
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 mb-1">
        <Bookmark size={18} className="text-navy" />
        <h1 className="text-xl font-semibold text-ink">Saved</h1>
      </div>

      <div className="flex items-center gap-2 mb-6">
        <p className="text-sm text-ink-secondary">
          {loading
            ? "Loading…"
            : user
            ? "Synced across all your devices."
            : "Saved locally on this device."}
        </p>
        {!loading && !user && (
          <Link
            href="/auth"
            className="text-sm text-accent font-medium hover:underline shrink-0"
          >
            Sign in to sync →
          </Link>
        )}
      </div>

      {/* ── Standing Watch summary - a projection of the shared ledger and
             research priorities over the monitored set ─────────────────── */}
      {summary && (
        <div className="mb-5 rounded-xl border border-edge bg-surface px-4 py-3">
          <div className="flex items-center gap-2 mb-2">
            <Eye size={12} className="text-accent shrink-0" />
            <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-ink-secondary">Standing Watch</span>
            <span className="text-[9.5px] text-ink-muted">
              {summary.monitored} monitored · {summary.changed} changed this cycle
            </span>
            {vm.summary.note && <span className="ml-auto text-[8.5px] text-ink-muted/70 italic">{vm.summary.note}</span>}
          </div>
          <div className="space-y-1">
            {summary.contradicted.length > 0 && (
              <p className="text-[11px] text-ink-secondary flex items-start gap-1.5">
                <AlertTriangle size={11} className="text-red-500/80 shrink-0 mt-0.5" />
                <span>Contradicted: <b>{summary.contradicted.map(cleanThemeName).join(", ")}</b></span>
              </p>
            )}
            {summary.strengthening.length > 0 && (
              <p className="text-[11px] text-ink-secondary">
                <span className="text-emerald-600 font-bold mr-1">▲</span>
                Strengthening: <b>{summary.strengthening.map(cleanThemeName).join(", ")}</b>
              </p>
            )}
            {summary.weakening.length > 0 && (
              <p className="text-[11px] text-ink-secondary">
                <span className="text-red-500 font-bold mr-1">▼</span>
                Weakening: <b>{summary.weakening.map(cleanThemeName).join(", ")}</b>
              </p>
            )}
            {summary.priorities.length > 0 && (
              <p className="text-[11px] text-ink-secondary">
                <span className="text-[8px] font-bold uppercase tracking-wide text-accent/70 mr-1">Research priority</span>
                {summary.priorities.map(p => `${cleanThemeName(p.entity.label)} (${p.score})`).join(" · ")}
              </p>
            )}
            {summary.changed === 0 && summary.contradicted.length === 0 && (
              <p className="text-[11px] text-ink-muted">No material changes recorded against your watch this cycle.</p>
            )}
          </div>
        </div>
      )}

      {/* ── Monitored intelligence ──────────────────────────────────────── */}
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-ink-secondary">Monitored Intelligence</span>
          <span className="h-px flex-1 bg-edge" />
        </div>
        {vm.items.status === "unavailable" ? (
          <p className="text-[11.5px] text-ink-muted py-4">
            {vm.items.note ?? "Nothing monitored yet."} Follow themes from Markets or the Theme Terminal, or watch entities from the feed.
          </p>
        ) : (
          <>
            {vm.items.note && <p className="text-[9px] text-ink-muted/70 italic mb-2">{vm.items.note}</p>}
            <div className="space-y-2">
              {monitoredItems.map(item => <MonitoredRow key={item.key} item={item} />)}
            </div>
          </>
        )}
      </div>

      {/* ── Saved stories (bookmarks, user state preserved) ─────────────── */}
      <div className="flex items-center gap-2 mb-2">
        <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-ink-secondary">Saved Stories</span>
        <span className="h-px flex-1 bg-edge" />
      </div>
      {savedItems.length === 0 ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-center py-12 text-ink-muted"
        >
          <Bookmark size={32} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm">No saved stories yet.</p>
          <p className="text-xs mt-1 opacity-70">
            Bookmark articles from the feed using the save button.
          </p>
        </motion.div>
      ) : (
        <div className="space-y-3">
          {savedItems.map((item, i) => (
            <motion.div
              key={item.id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04 }}
            >
              <StoryCard
                item={item}
                isSaved={true}
                onSave={() => toggleSave(item)}
              />
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
