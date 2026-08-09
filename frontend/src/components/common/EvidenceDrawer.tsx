"use client";

// EvidenceDrawer — the Drawer surface (Surface #5): the product's PROOF LAYER. One question:
// "What evidence supports this?" It leads with the actual sourced records behind the focused
// entity, grouped by story, documents within. No Signal, conviction, momentum, graph, timeline,
// prediction, or provenance labels (that deeper analytical read now belongs to the Workstation).
// It renders the pure drawerView View Model and computes nothing itself.

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import Link from "next/link";
import type { IntelContext } from "@/lib/intelligenceContext";
import { useFeed } from "@/hooks/useFeed";
import { useArgusIntelligence } from "@/hooks/useArgusIntelligence";
import { resolveDrawerEntity } from "@/lib/drawerEntity";
import { buildMarketStructure } from "@/lib/intelligenceShared";
import { buildDrawerView, type DocKind, type DrawerView, type EvidenceStory, type TrustState } from "@/lib/drawerView";
import { cn, timeAgo } from "@/lib/utils";

const DOC_TAG: Record<DocKind, string> = { news: "News", filing: "Filing", transcript: "Transcript", ir: "IR", deal: "Deal", conversation: "Conversation" };
const STATE_COLOR: Record<TrustState, string> = { primary: "text-emerald-400", corroborated: "text-accent", developing: "text-amber-400/90", single: "text-ink-faint" };

function useDrawerView(ctx: IntelContext | null): DrawerView | null {
  const intel = useArgusIntelligence();
  const { data: feed } = useFeed();
  return useMemo(() => {
    if (!ctx) return null;
    const entity = resolveDrawerEntity(ctx, {});
    const lmd = entity.node?.metadata?.latestMarketData;
    const market = lmd && typeof lmd === "object" ? buildMarketStructure(lmd as Record<string, unknown>) : null;
    return buildDrawerView({ context: ctx, events: feed?.events ?? [], clusters: intel.clusters, deals: intel.deals, episodes: intel.episodes, themes: intel.themes, market });
  }, [ctx, feed?.events, intel.clusters, intel.deals, intel.episodes, intel.themes]);
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="px-5 py-4 border-t border-edge-subtle">
      <h3 className="mb-2.5 text-[9px] font-semibold uppercase tracking-[0.18em] text-ink-faint">{title}</h3>
      {children}
    </section>
  );
}

function StoryBlock({ story }: { story: EvidenceStory }) {
  return (
    <div className="py-4 first:pt-0">
      {/* The claim leads: dominant headline, then the documents that prove it, clearly subordinate. */}
      <h4 className="text-[15.5px] font-semibold leading-[1.25] tracking-[-0.01em] text-ink">{story.headline}</h4>
      <p className={cn("mt-1 text-[9.5px] font-semibold uppercase tracking-[0.11em]", STATE_COLOR[story.state])}>{story.stateLabel}</p>
      <ul className="mt-2.5 flex flex-col gap-1.5 pl-3 border-l border-edge-subtle">
        {story.docs.map((d, i) => (
          <li key={`${d.url}-${i}`} className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <span className="text-[8px] font-semibold uppercase tracking-[0.1em] text-ink-faint">{DOC_TAG[d.kind]}</span>
            <span className="text-[10.5px] font-semibold text-ink-secondary">{d.outlet}</span>
            <a href={d.url} target="_blank" rel="noopener noreferrer" className="min-w-0 flex-1 truncate text-[11.5px] text-ink-muted hover:text-accent">{d.title}</a>
            {d.dateISO && <span className="font-mono text-[9px] text-ink-faint">{timeAgo(d.dateISO)}</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Body({ view, onClose }: { view: DrawerView; onClose: () => void }) {
  const ref = view.referencedIn;
  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 px-5 pt-5 pb-3">
        <div className="min-w-0">
          <span className="text-[9px] font-semibold uppercase tracking-[0.16em] text-ink-faint">{view.head.kindLabel}</span>
          <h2 className="mt-0.5 truncate text-[19px] font-semibold tracking-tight text-ink">{view.head.label}</h2>
          {view.orientation && <p className="mt-1.5 max-w-[44ch] text-[12.5px] leading-relaxed text-ink-secondary">{view.orientation}</p>}
          {view.price && (
            <p className="mt-2 flex items-baseline gap-2 font-mono text-[11px] text-ink-muted">
              <span className="font-semibold text-ink-secondary">{view.price.symbol}</span>
              <span>{view.price.price}</span>
              {view.price.changePct != null && (
                <span className={view.price.changePct >= 0 ? "text-emerald-400" : "text-rose-400"}>
                  {view.price.changePct >= 0 ? "+" : ""}{view.price.changePct.toFixed(2)}%
                </span>
              )}
              <span className="text-[8px] uppercase tracking-[0.12em] text-ink-faint">{view.price.freshness}</span>
            </p>
          )}
        </div>
        <button onClick={onClose} className="rounded-full p-1 text-ink-faint transition-colors hover:bg-raised hover:text-ink-secondary" title="Close"><X size={16} /></button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {/* Referenced in */}
        {ref && (
          <Section title="Referenced in">
            <ul className="flex flex-col gap-1 text-[12.5px] text-ink-secondary">
              {ref.events > 0 && <li>{ref.events} current market {ref.events === 1 ? "event" : "events"}</li>}
              {ref.earnings > 0 && <li>{ref.earnings} earnings {ref.earnings === 1 ? "report" : "reports"}</li>}
              {ref.stories > 0 && <li>{ref.stories} ongoing {ref.stories === 1 ? "story" : "stories"}</li>}
              {ref.deals > 0 && <li>{ref.deals} {ref.deals === 1 ? "deal" : "deals"}</li>}
            </ul>
          </Section>
        )}

        {/* Evidence — the hero */}
        <Section title="Evidence">
          {view.hasEvidence
            ? <div className="flex flex-col divide-y divide-edge-subtle/60">{view.stories.map((s) => <StoryBlock key={s.id} story={s} />)}</div>
            : <p className="text-[13px] text-ink-muted">No sourced evidence available yet.</p>}
        </Section>
      </div>

      {/* Continue research */}
      {view.continueHref && (
        <div className="border-t border-edge-subtle px-5 py-3">
          <Link href={view.continueHref} onClick={onClose} className="text-[11px] font-semibold uppercase tracking-[0.1em] text-accent hover:text-ink">Continue research &rarr;</Link>
        </div>
      )}
    </div>
  );
}

export function EvidenceDrawer({ ctx, open, onClose }: { ctx: IntelContext | null; open: boolean; onClose: () => void }) {
  const view = useDrawerView(ctx);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  return createPortal(
    <AnimatePresence>
      {open && ctx && (
        <>
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[70] bg-black/50" onClick={onClose} />
          <motion.aside
            initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }} transition={{ type: "tween", duration: 0.22 }}
            className="brief-dark fixed right-0 top-0 z-[71] h-full w-[380px] max-w-[92vw] overflow-hidden border-l border-edge-subtle bg-canvas text-ink shadow-2xl"
            role="dialog" aria-label="Evidence">
            {view ? <Body view={view} onClose={onClose} /> : null}
          </motion.aside>
        </>
      )}
    </AnimatePresence>,
    document.body,
  );
}
