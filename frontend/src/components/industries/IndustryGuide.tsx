"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowUpRight, BookOpen, ChevronDown } from "lucide-react";
import { INDUSTRY_GUIDES } from "@/lib/industryGuides";
import type { IndustryConfig } from "@/lib/industryConfig";
import type { StoryCluster } from "@/lib/types";
import { timeAgo } from "@/lib/utils";

export function IndustryGuide({ industry, clusters }: { industry: IndustryConfig; clusters: StoryCluster[] }) {
  const guide = INDUSTRY_GUIDES[industry.slug];
  const [selected, setSelected] = useState(0);
  if (!guide) return null;
  const segment = guide.segments[selected] ?? guide.segments[0];
  return (
    <section id="industry-guide" aria-label={`Understand ${industry.name}`} style={{ backgroundColor: "#080d18" }} className="scroll-mt-24 brief-dark discovery-page discovery-panel mb-8 overflow-hidden p-5 text-ink sm:p-8">
      <div className="discovery-enter">
        <p className="discovery-eyebrow flex items-center gap-2"><BookOpen size={13} /> The industry, explained</p>
        <div className="mt-4 grid gap-5 md:grid-cols-[1.25fr_1fr]">
          <h2 className="font-serif text-[clamp(1.8rem,3vw,2.7rem)] leading-tight">Understand the business.<br /><span className="text-cyan-200">Then read the signals.</span></h2>
          <div><p className="text-sm leading-relaxed text-ink-secondary">{guide.overview}</p><p className="mt-3 text-[11px] text-ink-muted">Background guide · reviewed October 13, 2026. Educational context, not a current market assessment.</p></div>
        </div>
      </div>

      <div className="mt-8 border-t border-edge pt-7">
        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2"><h3 className="font-serif text-2xl">Different businesses. Different economics.</h3><span className="text-xs text-cyan-200">Choose a segment ↓</span></div>
        <div role="group" aria-label="Business segments" className="grid gap-2 sm:grid-cols-3">
          {guide.segments.map((s, i) => <button key={s.name} type="button" aria-pressed={selected === i} aria-controls="industry-segment-detail" onClick={() => setSelected(i)} className={`rounded-xl border p-4 text-left text-sm transition-colors motion-reduce:transition-none ${selected === i ? "border-cyan-200/60 bg-cyan-200/10 text-cyan-100" : "border-edge bg-surface/40 text-ink-secondary hover:border-cyan-200/30"}`}><span className="mb-2 block font-mono text-[10px] text-ink-muted">0{i + 1}</span>{s.name}</button>)}
        </div>
        <div id="industry-segment-detail" aria-live="polite" aria-atomic="true" className="mt-3 rounded-2xl border border-edge bg-surface/40 p-5">
          <div key={segment.name} className="discovery-enter grid gap-5 md:grid-cols-3">
            <div><h4 className="discovery-eyebrow">What it does</h4><p className="mt-2 text-sm leading-relaxed text-ink-secondary">{segment.role}</p></div>
            <div><h4 className="discovery-eyebrow">How it earns</h4><p className="mt-2 text-sm leading-relaxed text-ink-secondary">{segment.revenue}</p></div>
            <div><h4 className="discovery-eyebrow">What to examine</h4><p className="mt-2 text-sm leading-relaxed text-ink-secondary">{segment.watch}</p></div>
          </div>
        </div>
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <section aria-label="Industry measures"><h3 className="mb-4 font-serif text-2xl">Know what to look for.</h3>
          <p className="mb-3 text-xs text-ink-secondary">Open a measure to see its meaning and a question to ask. These are definitions, not live readings.</p>
          <div className="space-y-2">{guide.measures.map(m => <details key={m.term} className="group rounded-xl border border-edge bg-surface/30 p-4"><summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-medium">{m.term}<ChevronDown aria-hidden size={15} className="shrink-0 text-cyan-200 group-open:rotate-180" /></summary><p className="mt-3 text-xs leading-relaxed text-ink-secondary">{m.meaning}</p><p className="mt-3 border-l border-cyan-200/50 pl-3 text-xs leading-relaxed text-cyan-100">Ask: {m.question}</p></details>)}</div>
        </section>
        <aside className="rounded-2xl border border-cyan-200/20 bg-cyan-200/5 p-5"><p className="discovery-eyebrow">An important distinction</p><p className="mt-4 font-serif text-xl leading-relaxed">{guide.distinction}</p><p className="mt-4 text-xs leading-relaxed text-ink-secondary">For a specific company, check its business segments, financial statements and risk disclosures. Companies within this industry can have very different exposures.</p></aside>
      </div>

      <section aria-label="Connect the guide to reporting" className="mt-8 border-t border-edge pt-6">
        <h3 className="font-serif text-2xl">Put a headline in context.</h3>
        <p className="mt-2 max-w-[75ch] text-xs leading-relaxed text-ink-secondary">Start with the affected business. Ask whether the report changes demand, pricing, costs or the ability to deliver. Then look for evidence of the size and timing. Industry or sector matching alone does not establish an effect.</p>
        <div className="mt-4 grid gap-3 md:grid-cols-2">{clusters.slice(0, 2).map(c => {
          const date = c.primary.published_ts ?? c.primary.published;
          const validDate = date && Number.isFinite(Date.parse(date));
          return <Link key={c.id} href={`/event/${encodeURIComponent(c.id)}`} className="group rounded-xl border border-edge bg-surface/30 p-4 hover:border-cyan-200/40"><span className="text-[10px] text-ink-secondary">From matched industry / sector coverage</span><h4 className="mt-2 text-sm leading-relaxed group-hover:text-cyan-100">{c.primary.title}</h4><span className="mt-3 block text-[10px] text-ink-muted" title={validDate ? date : undefined}>{c.primary.source || "Source label unavailable"} · {validDate ? `Published ${timeAgo(date)}` : "Publication time unavailable"}</span><span className="mt-3 flex items-center justify-between text-xs text-cyan-200">Inspect reporting & limits <ArrowUpRight size={14} /></span></Link>;
        })}</div>
        {clusters.length === 0 && <p className="mt-4 rounded-xl border border-edge p-4 text-xs text-ink-secondary">No matched reporting is available in this snapshot. The background guide remains useful; missing coverage does not imply that nothing is happening.</p>}
      </section>
      <details className="mt-6 border-t border-edge pt-4"><summary className="cursor-pointer text-xs text-ink-secondary">Background references & how to use this guide</summary><p className="mt-3 text-xs leading-relaxed text-ink-secondary">Argus editorial explanations summarize common business models. The references below provide industry background and help with company research; they do not validate a current signal or forecast. This is a simplified guide, not an exhaustive industry taxonomy.</p><div className="mt-3 flex flex-wrap gap-4 text-xs text-cyan-200"><a href={guide.source.url} target="_blank" rel="noopener noreferrer">{guide.source.label} ↗</a><a href="https://www.investor.gov/introduction-investing/getting-started/researching-investments/using-edgar-research-investments" target="_blank" rel="noopener noreferrer">Investor.gov: researching company filings ↗</a></div></details>
    </section>
  );
}
