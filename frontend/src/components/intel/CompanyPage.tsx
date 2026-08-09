"use client";

// CompanyPage — the canonical Law-10 company experience (Surface #2B). One page, built
// around the company as a market concept: chart hero → why it matters today → what it's
// connected to → latest developments → earnings & filings → what to watch. The underlying
// intelligence (buildCompanyDossier + its memory/ledger/graph capabilities) is preserved
// and unchanged; buildCompanyView only re-voices it into plain investor language. No
// themes, conviction, transmission, ledger, or graph vocabulary reaches the surface.
// The defining "connected to" panel is enriched with recorded relationship memory (how long
// the company has been mapped, when its connections last grew) — the one durable memory a
// company actually has; all still in plain language, and silently omitted when unrecorded.

import { useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { useFeed } from "@/hooks/useFeed";
import { useEntityRelationships } from "@/hooks/useEntityRelationships";
import { buildCompanyDossier } from "@/lib/intel/dossier";
import { buildCompanyView, buildConnectionMemory, type CompanyDevelopment, type ConnectedConcept } from "@/lib/companyView";
import { useSeries } from "@/lib/platform/hooks/useSeries";
import { ArgusChart, changeInfo, toDisplayPoints } from "@/lib/platform/chart";
import { EntityChip } from "@/components/common/EntityChip";
import { fmtDate } from "@/lib/intelligenceShared";
import { cn, timeAgo } from "@/lib/utils";

const RANGES = ["1M", "3M", "6M", "1Y", "5Y"] as const;
type Range = (typeof RANGES)[number];
const RANGE_DAYS: Record<Range, number> = { "1M": 31, "3M": 93, "6M": 186, "1Y": 372, "5Y": 1830 };
const fromForRange = (r: Range): string => {
  const d = new Date();
  d.setDate(d.getDate() - RANGE_DAYS[r]);
  return d.toISOString().slice(0, 10);
};
const price = (v: number): string => (v >= 1000 ? v.toFixed(0) : v >= 1 ? v.toFixed(2) : v.toFixed(4));

function HeroChart({ ticker, name }: { ticker: string; name: string }) {
  const [range, setRange] = useState<Range>("6M");
  const from = useMemo(() => fromForRange(range), [range]);
  const { series } = useSeries(ticker, { from });
  const points = useMemo(() => toDisplayPoints(series), [series]);
  const change = useMemo(() => changeInfo(points), [points]);
  const up = change?.direction === "up";
  const down = change?.direction === "down";

  return (
    <div>
      <div className="flex items-baseline gap-3">
        {change ? (
          <>
            <span className="font-mono text-[26px] tabular-nums text-ink">{price(change.last)}</span>
            <span className={cn("font-mono text-[14px] tabular-nums", up ? "text-emerald-400" : down ? "text-rose-400" : "text-ink-muted")}>
              {up ? "+" : ""}{change.pctChange.toFixed(2)}%
            </span>
            <span className="text-[9px] font-semibold uppercase tracking-[0.14em] text-ink-faint">delayed</span>
          </>
        ) : (
          <span className="text-[13px] text-ink-muted">Price data unavailable for {ticker}.</span>
        )}
      </div>
      <div className="mt-2">
        <ArgusChart series={series} variant="full" config={{ height: 280, showLastValue: "hover" }}
          ariaLabel={`${name} price${change ? `, ${change.direction} ${Math.abs(change.pctChange).toFixed(2)} percent over ${points.length} sessions` : ""}, delayed`} />
      </div>
      <div className="mt-2 flex gap-1" role="group" aria-label="Timeframe">
        {RANGES.map((r) => (
          <button key={r} type="button" onClick={() => setRange(r)} aria-pressed={r === range}
            className={cn("rounded px-2 py-0.5 text-[10px] font-semibold tracking-wide transition-colors motion-reduce:transition-none",
              r === range ? "bg-raised text-ink" : "text-ink-faint hover:text-ink-secondary")}>
            {r}
          </button>
        ))}
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="mb-2.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-ink-faint">{title}</h2>
      {children}
    </section>
  );
}

// A relationship group inside the ecosystem panel — the defining content of the page.
function ConnectionGroup({ label, items }: { label: string; items: ConnectedConcept[] }) {
  if (items.length === 0) return null;
  return (
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1.5">
      <span className="w-24 shrink-0 text-[9px] font-semibold uppercase tracking-[0.16em] text-ink-faint">{label}</span>
      <div className="flex flex-wrap gap-1.5">
        {items.map((c, i) => (
          <EntityChip key={`${c.label}-${i}`} kind={c.kind} label={c.label} size="md"
            className="rounded-lg border border-edge-subtle bg-raised/60 px-2.5 py-1 text-[13px] font-semibold text-ink" />
        ))}
      </div>
    </div>
  );
}

const chipKind = (c: string): "ticker" | "company" => (/^[A-Z]{1,5}$/.test(c.trim()) ? "ticker" : "company");

function DevRow({ d }: { d: CompanyDevelopment }) {
  const meta = [d.sources ? `${d.sources} ${d.sources === 1 ? "source" : "sources"}` : null, timeAgo(d.when)].filter(Boolean).join(" · ");
  return (
    <li className="group">
      <Link href={d.href} className="-mx-2 flex flex-col gap-0.5 rounded-md px-2 py-3 transition-colors hover:bg-raised/30 motion-reduce:transition-none">
        <div className="flex items-center gap-2">
          <span className="text-[8px] font-semibold uppercase tracking-[0.14em] text-ink-faint">{d.category}</span>
          {!d.direct && d.reason && <span className="text-[8px] uppercase tracking-[0.1em] text-ink-faint/80">{d.reason}</span>}
        </div>
        <h3 className="text-[13.5px] font-medium leading-snug text-ink-secondary transition-colors group-hover:text-ink motion-reduce:transition-none">{d.headline}</h3>
        {d.why && <p className="max-w-[64ch] text-[12.5px] leading-relaxed text-ink-secondary">{d.why}</p>}
        {(d.companies.length > 0 || meta) && (
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1">
            {d.companies.map((c, i) => <EntityChip key={`${c}-${i}`} kind={chipKind(c)} label={c} size="md" className="text-[10.5px] font-medium text-ink-muted" />)}
            {meta && <span className="font-mono text-[9.5px] text-ink-faint">{meta}</span>}
          </div>
        )}
      </Link>
    </li>
  );
}

export default function CompanyPage({ ticker }: { ticker: string }) {
  const { data: feed, isLoading } = useFeed();
  const dossier = useMemo(() => buildCompanyDossier(ticker, feed ?? null), [ticker, feed]);
  const view = useMemo(() => buildCompanyView(dossier), [dossier]);
  // Recorded relationship memory: the temporal depth behind the ecosystem panel. Enriches the
  // defining section only; absent (and silently omitted) when the ticker is named by no active thesis.
  const { data: relationships } = useEntityRelationships(dossier?.uid ?? null);
  const connectionMemory = useMemo(() => buildConnectionMemory(relationships?.relationships), [relationships]);

  const shell = "brief-dark min-h-[calc(100vh-3.5rem)] bg-canvas text-ink";

  if (!view) {
    return (
      <div className={shell}>
        <div className="mx-auto max-w-3xl px-5 pt-16 sm:px-8">
          <p className="text-[14px] text-ink-secondary">
            {isLoading ? `Loading ${ticker}…` : `The market feed is unreachable right now, so ${ticker}'s page cannot be read. Nothing is shown in its place.`}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={shell}>
      <div className="mx-auto flex max-w-3xl flex-col gap-9 px-5 pb-16 pt-8 sm:px-8">
        {/* 1. Company hero */}
        <header>
          <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
            <h1 className="text-[22px] font-semibold tracking-tight text-ink">{view.name}</h1>
            <span className="font-mono text-[13px] text-ink-muted">{view.ticker}</span>
            {view.sector && <span className="text-[11px] uppercase tracking-[0.1em] text-ink-faint">{view.sector}</span>}
          </div>
          {!view.identified && <p className="mt-1 text-[11px] text-ink-faint">Company details beyond the ticker are unavailable.</p>}
          <div className="mt-4"><HeroChart ticker={view.ticker} name={view.name} /></div>
        </header>

        {/* 2. Why it matters today */}
        <Section title="Why it matters today">
          {view.whyItMatters ? (
            <p className="max-w-[64ch] font-serif text-[clamp(1.05rem,2vw,1.35rem)] leading-snug text-ink">{view.whyItMatters}</p>
          ) : (
            <p className="text-[13px] leading-relaxed text-ink-muted">No fresh developments name {view.name} today.</p>
          )}
        </Section>

        {/* 3. What it's connected to — the DEFINING section: the market ecosystem. Given
              the most visual weight on the page (a framed panel, grouped relationships,
              prominent chips), because understanding the ecosystem is the differentiator. */}
        {view.connections.length > 0 && (
          <section aria-labelledby="connected-heading" className="brief-panel overflow-hidden rounded-[20px] p-5 sm:p-7">
            <h2 id="connected-heading" className="text-[12px] font-semibold uppercase tracking-[0.22em] text-ink">
              What it&rsquo;s connected to
            </h2>
            <p className="mt-1.5 max-w-[58ch] font-serif text-[clamp(1.02rem,1.9vw,1.28rem)] leading-snug text-ink-secondary">
              The market ecosystem around {view.name}: the sectors it sits in, the companies it moves with, and the forces that drive it.
            </p>
            <div className="mt-5 flex flex-col gap-4">
              <ConnectionGroup label="Sectors" items={view.connections.filter((c) => c.kind === "sector")} />
              <ConnectionGroup label="Moves with" items={view.connections.filter((c) => c.kind === "ticker" || c.kind === "company")} />
              <ConnectionGroup label="Driven by" items={view.connections.filter((c) => c.kind === "macro")} />
            </div>
            {/* Recorded temporal depth of the connections above (relationship memory) — the one
                durable memory a company has. Subordinate to the chips; omitted when unrecorded. */}
            {connectionMemory.available && connectionMemory.trackedSince && (
              <p className="mt-5 border-t border-edge-subtle/40 pt-3.5 text-[11.5px] leading-relaxed text-ink-faint">
                Argus has tracked {view.name}&rsquo;s market connections since {fmtDate(connectionMemory.trackedSince)}
                {connectionMemory.mostRecentFormedAt ? `; the most recent formed ${timeAgo(connectionMemory.mostRecentFormedAt)}.` : "."}
              </p>
            )}
          </section>
        )}

        {/* 4. Latest developments — secondary to the ecosystem: a compact news list. */}
        <Section title="Latest developments">
          {view.developments.length > 0 ? (
            <ol className="flex flex-col divide-y divide-edge-subtle/50">{view.developments.map((d) => <DevRow key={d.id} d={d} />)}</ol>
          ) : (
            <p className="text-[13px] leading-relaxed text-ink-muted">No news names {view.name} this cycle. A quiet page is a short page, not a padded one.</p>
          )}
        </Section>

        {/* 5. Earnings & filings (only when there are real ones) */}
        {view.earningsFilings.length > 0 && (
          <Section title="Earnings &amp; filings">
            <ol className="flex flex-col divide-y divide-edge-subtle/60">{view.earningsFilings.map((d) => <DevRow key={d.id} d={d} />)}</ol>
          </Section>
        )}

        {/* 6. What to watch */}
        {view.watch.length > 0 && (
          <Section title="What to watch">
            <ul className="flex flex-col gap-2">
              {view.watch.map((w, i) => <li key={i} className="max-w-[60ch] font-serif text-[14px] italic leading-snug text-ink-secondary">{w}</li>)}
            </ul>
          </Section>
        )}
      </div>
    </div>
  );
}
