"use client";

// CaseThread — the investigation thread (the centerpiece). Renders the frozen seven beats in
// order as one continuous case, each answering one question, with a tiny transition line carrying
// the reader to the next beat. Renders the View Model only; no intelligence logic.
//
// Stage 2 — the thread controls the exhibit. On desktop the transmission graph becomes STICKY
// across the evidence / support / breaks / history beats, and the beat the reader is on drives
// its progressive reveal (primary chain -> evidence-backed branches -> weak edges -> prior paths).
// The sticky region stays inside the thread column and releases before Watch. On narrow viewports
// there is no sticky graph: the exhibit sits inline (or degrades to the text chain), unchanged.

import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { MapVM } from "@/lib/causalMap";
import type { RevealStage } from "@/lib/graphReveal";
import { TransmissionGraph } from "./TransmissionGraph";
import type {
  Beat, BeatId, BreakConditions, EvidenceBeat, HistoricalRecord, Hypothesis, Support, TransmissionExhibit, Watch, WorkstationView,
} from "@/lib/workstationView";

const TITLE: Record<BeatId, string> = {
  hypothesis: "Current hypothesis", transmission: "How it transmits", evidence: "The evidence",
  support: "Support", breaks: "What breaks it", history: "How reasoning like this has performed", watch: "What to watch",
};
// Which reveal stage each beat drives the exhibit to (frozen mapping; see graphReveal.ts).
const STAGE_OF: Record<BeatId, RevealStage> = {
  hypothesis: "primary", transmission: "primary", evidence: "evidence", support: "evidence",
  breaks: "breaks", history: "history", watch: "history",
};
const ORDER: BeatId[] = ["hypothesis", "transmission", "evidence", "support", "breaks", "history", "watch"];
const SUPPORT_COLOR: Record<string, string> = { Strong: "text-emerald-400", Moderate: "text-accent", Thin: "text-amber-400/90", Insufficient: "text-ink-faint" };
const STRENGTH_COLOR: Record<string, string> = { strong: "text-emerald-400", moderate: "text-accent", thin: "text-amber-400/90" };

type Register = (id: BeatId) => (el: HTMLElement | null) => void;

function BeatShell({ id, title, question, register, children }: { id: BeatId; title: string; question: string; register: Register; children: ReactNode }) {
  return (
    <section ref={register(id)} data-beat={id}>
      <h2 className="text-[10px] font-semibold uppercase tracking-[0.2em] text-ink-faint">{title}</h2>
      <p className="mt-0.5 text-[11px] italic text-ink-faint/80">{question}</p>
      <div className="mt-2.5">{children}</div>
    </section>
  );
}

function Transition({ text }: { text: string | null }) {
  if (!text) return null;
  return <p className="text-center text-[10.5px] italic text-ink-faint/70">{text}&hellip;</p>;
}

// Body for every beat EXCEPT transmission (whose exhibit is hoisted into the sticky slot).
function body(b: Beat<unknown>): ReactNode {
  if (b.status === "insufficient" || b.data == null) return <p className="text-[12.5px] text-ink-muted">Not enough to assess yet.</p>;
  switch (b.id) {
    case "hypothesis": {
      const d = b.data as Hypothesis;
      return (<>
        <p className="max-w-[62ch] font-serif text-[clamp(1.05rem,1.9vw,1.3rem)] leading-snug text-ink">{d.statement}</p>
        {d.basis && <p className="mt-1.5 text-[12.5px] text-ink-muted">{d.basis}</p>}
      </>);
    }
    case "evidence": {
      const d = b.data as EvidenceBeat;
      return (<div className="flex flex-col gap-1.5">
        {d.links.map((l, i) => (
          <div key={`${l.link}-${i}`} className="flex flex-wrap items-baseline gap-x-2">
            <span className={cn("text-[9px] font-semibold uppercase tracking-[0.1em]", STRENGTH_COLOR[l.strength] ?? "text-ink-faint")}>{l.strength}</span>
            <span className="text-[13px] font-medium text-ink">{l.link}</span>
            <span className="text-[11px] text-ink-faint">{l.sources} {l.sources === 1 ? "source" : "sources"}</span>
          </div>
        ))}
        <p className="mt-1 text-[11px] text-ink-faint">{d.independentSources} independent sources across the chain.</p>
      </div>);
    }
    case "support": {
      const d = b.data as Support;
      return (<div>
        <p className={cn("text-[13px] font-semibold", SUPPORT_COLOR[d.level] ?? "text-ink")}>{d.level}</p>
        <ul className="mt-1.5 flex flex-col gap-0.5 text-[12.5px]">
          {d.supports.map((s, i) => <li key={`p-${i}`} className="text-emerald-400/90">+ {s}</li>)}
          {d.against.map((s, i) => <li key={`n-${i}`} className="text-rose-400/85">&minus; {s}</li>)}
        </ul>
      </div>);
    }
    case "breaks": {
      const d = b.data as BreakConditions;
      return (<div className="flex flex-col gap-1.5 text-[12.5px] leading-relaxed text-ink-secondary">
        {d.invalidation && <p><span className="mr-1 text-[9px] font-semibold uppercase tracking-[0.1em] text-rose-400/85">Invalidated if</span>{d.invalidation}</p>}
        {d.conflicts.map((c, i) => <p key={`c-${i}`} className="max-w-[62ch]">{c}</p>)}
      </div>);
    }
    case "history": {
      const d = b.data as HistoricalRecord;
      return (<div>
        {d.counts && <p className="text-[12.5px] text-ink-secondary">{d.counts.resolved} resolved &middot; {d.counts.confirmed} confirmed &middot; {d.counts.contradicted} contradicted</p>}
        <p className="mt-1 max-w-[62ch] text-[11.5px] italic leading-relaxed text-ink-faint">{d.note}</p>
      </div>);
    }
    case "watch": {
      const d = b.data as Watch;
      return <ul className="flex flex-col gap-1.5">{d.items.map((s, i) => <li key={`w-${i}`} className="max-w-[60ch] font-serif text-[13.5px] italic leading-snug text-ink-secondary">{s}</li>)}</ul>;
    }
    default:
      return null;
  }
}

export function CaseThread({ view, mapVM, onBack }: { view: WorkstationView; mapVM: MapVM | null; onBack: () => void }) {
  const beats = view.beats!;
  const [hyp, transmission, evidence, support, breaks, history, watch] = beats;
  const trans = transmission.data as TransmissionExhibit | null;

  // Which beat the reader is on drives the exhibit's reveal. The "reading line" is biased LOW
  // (a band ~55-62% down) so it sits inside the reading zone BELOW the pinned exhibit rather than
  // at the geometric centre; otherwise stages would flip a beat early, before the reader has
  // mentally arrived. The topmost beat crossing the band is active. The thread controls the
  // exhibit; the exhibit never scrolls the thread. (Tuning knob: rootMargin below.)
  const [active, setActive] = useState<BeatId>("hypothesis");
  const refs = useRef<Map<BeatId, HTMLElement>>(new Map());
  const register: Register = (id) => (el) => { if (el) refs.current.set(id, el); else refs.current.delete(id); };

  useEffect(() => {
    const visible = new Set<BeatId>();
    const obs = new IntersectionObserver((entries) => {
      for (const e of entries) {
        const id = (e.target as HTMLElement).dataset.beat as BeatId;
        if (e.isIntersecting) visible.add(id); else visible.delete(id);
      }
      const found = ORDER.find((id) => visible.has(id));
      if (found) setActive(found);
    }, { rootMargin: "-55% 0px -38% 0px", threshold: 0 });
    refs.current.forEach((el) => obs.observe(el));
    return () => obs.disconnect();
  }, [view]);

  const stage = useMemo(() => STAGE_OF[active], [active]);

  return (
    <div>
      <button type="button" onClick={onBack} className="text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-faint transition-colors hover:text-accent">&larr; Docket</button>
      <div className="mt-3">
        <span className="text-[9px] font-semibold uppercase tracking-[0.16em] text-accent">Investigating &middot; {view.header?.kindLabel}</span>
        <h1 className="mt-0.5 text-[22px] font-semibold tracking-tight text-ink">{view.header?.label}</h1>
      </div>

      <div className="mt-8 flex flex-col gap-6">
        {/* Beat 1 */}
        <BeatShell id="hypothesis" title={TITLE.hypothesis} question={hyp.question} register={register}>{body(hyp)}</BeatShell>
        <Transition text={hyp.transitionToNext} />

        {/* Beats 2-6: the sticky-exhibit region (desktop). The graph pins while the evidence,
            support, breaks, and history beats scroll beneath it; it releases before Watch. */}
        <div className="relative flex flex-col gap-6">
          <BeatShell id="transmission" title={TITLE.transmission} question={transmission.question} register={register}>
            {trans
              ? <p className="text-[13.5px] leading-relaxed text-ink-secondary">{trans.reading}</p>
              : <p className="text-[12.5px] text-ink-muted">Not enough to assess yet.</p>}
          </BeatShell>

          {/* The exhibit is kept deliberately SUBORDINATE to the thread: ~40vh, capped so it never
              dominates tall monitors. Larger and attention drifts from the case back to the graph. */}
          {trans && (
            <div className="z-10 h-[320px] bg-canvas md:sticky md:top-14 md:h-[40vh] md:max-h-[440px] md:pb-1 md:shadow-[0_14px_22px_-10px_rgba(0,0,0,0.55)]">
              <TransmissionGraph exhibit={trans} mapVM={mapVM} stage={stage} />
            </div>
          )}
          <Transition text={transmission.transitionToNext} />

          <BeatShell id="evidence" title={TITLE.evidence} question={evidence.question} register={register}>{body(evidence)}</BeatShell>
          <Transition text={evidence.transitionToNext} />
          <BeatShell id="support" title={TITLE.support} question={support.question} register={register}>{body(support)}</BeatShell>
          <Transition text={support.transitionToNext} />
          <BeatShell id="breaks" title={TITLE.breaks} question={breaks.question} register={register}>{body(breaks)}</BeatShell>
          <Transition text={breaks.transitionToNext} />
          <BeatShell id="history" title={TITLE.history} question={history.question} register={register}>{body(history)}</BeatShell>
        </div>

        <Transition text={history.transitionToNext} />
        {/* Beat 7 — Watch. Outside the sticky region: the exhibit has released by now. */}
        <BeatShell id="watch" title={TITLE.watch} question={watch.question} register={register}>{body(watch)}</BeatShell>
      </div>
    </div>
  );
}
