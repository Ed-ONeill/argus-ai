"use client";

// EventPage — the Event surface (Surface #3): "Why did this happen?" in plain investor
// language. The hero LAYOUT is an event-local descriptor (chart-dominant / balanced /
// explanation-dominant) that maps to the shared ArgusChart + explanation primitives; the
// frozen PX3.1 HeroMode set is untouched. Grammar, in order: What changed · Evidence ·
// Why investors care · Who's affected · The other side · What to watch. Confidence lives in
// evidence depth, the developing tag, the presence of an other side, and honest omission.
// All reasoning infrastructure (theses, conviction, transmission uids, statuses, hashes) is
// invisible. buildEventDossier and the Explanation engine are used unchanged.

import { useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { useFeed } from "@/hooks/useFeed";
import { buildEventDossier } from "@/lib/intel/dossier";
import { buildEventView, type EventChip, type EvidenceItem, type PriceChartViz } from "@/lib/eventView";
import { useSeries } from "@/lib/platform/hooks/useSeries";
import { ArgusChart, changeInfo, toDisplayPoints } from "@/lib/platform/chart";
import { EntityChip } from "@/components/common/EntityChip";
import { cn, timeAgo } from "@/lib/utils";

const RANGES = ["1M", "3M", "6M", "1Y", "5Y"] as const;
type Range = (typeof RANGES)[number];
const RANGE_DAYS: Record<Range, number> = { "1M": 31, "3M": 93, "6M": 186, "1Y": 372, "5Y": 1830 };
const fromForRange = (r: Range): string => {
  const d = new Date();
  d.setDate(d.getDate() - RANGE_DAYS[r]);
  return d.toISOString().slice(0, 10);
};

function HeroChart({ viz }: { viz: PriceChartViz }) {
  const dominant = viz.prominence !== "supporting";
  const [range, setRange] = useState<Range>("6M");
  const from = useMemo(() => fromForRange(range), [range]);
  const { series } = useSeries(viz.symbol, { exchange: viz.exchange, from });
  const points = useMemo(() => toDisplayPoints(series), [series]);
  const change = useMemo(() => changeInfo(points), [points]);
  if (points.length < 2) return null;   // honest: no real series -> no chart
  const up = change?.direction === "up";
  const down = change?.direction === "down";

  return (
    <figure className="m-0">
      <figcaption className="mb-1.5 flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <EntityChip kind="ticker" label={viz.symbol} size="md" className="text-[14px] font-semibold text-ink" />
        {viz.representative && (
          <span className="text-[9px] font-semibold uppercase tracking-[0.14em] text-ink-faint">representative for {viz.representativeOf}</span>
        )}
        {change && (
          <span className={cn("font-mono text-[13px] tabular-nums", up ? "text-emerald-400" : down ? "text-rose-400" : "text-ink-muted")}>
            {up ? "+" : ""}{change.pctChange.toFixed(2)}% <span className="text-[8px] uppercase tracking-[0.12em] text-ink-faint">delayed</span>
          </span>
        )}
      </figcaption>
      <ArgusChart series={series} variant={dominant ? "full" : "compact"}
        config={{ height: viz.prominence === "dominant" ? 260 : viz.prominence === "balanced" ? 200 : 110, showLastValue: "hover" }}
        ariaLabel={`${viz.symbol} price, delayed`} />
      {dominant && (
        <div className="mt-2 flex gap-1" role="group" aria-label="Timeframe">
          {RANGES.map((r) => (
            <button key={r} type="button" onClick={() => setRange(r)} aria-pressed={r === range}
              className={cn("rounded px-2 py-0.5 text-[10px] font-semibold tracking-wide transition-colors motion-reduce:transition-none",
                r === range ? "bg-raised text-ink" : "text-ink-faint hover:text-ink-secondary")}>
              {r}
            </button>
          ))}
        </div>
      )}
    </figure>
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

function ChipRow({ label, items, color }: { label: string; items: EventChip[]; color?: string }) {
  if (items.length === 0) return null;
  return (
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1.5">
      <span className="w-28 shrink-0 text-[9px] font-semibold uppercase tracking-[0.14em]" style={color ? { color } : undefined}>{label}</span>
      <div className="flex flex-wrap gap-1.5">
        {items.map((c, i) => (
          <EntityChip key={`${c.label}-${i}`} kind={c.kind} label={c.label} color={color} size="md"
            className="rounded-lg border border-edge-subtle bg-raised/60 px-2 py-0.5 text-[12px] font-medium text-ink-secondary" />
        ))}
      </div>
    </div>
  );
}

function EvidenceRow({ e }: { e: EvidenceItem }) {
  const kind = e.kind && e.kind !== "news" ? e.kind.replace(/_/g, " ") : null;
  return (
    <li className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 py-2">
      <span className="text-[11px] font-semibold text-ink-secondary">{e.source}</span>
      {kind && <span className="text-[8px] uppercase tracking-[0.1em] text-ink-faint">{kind}</span>}
      <a href={e.url} target="_blank" rel="noopener noreferrer" className="min-w-0 flex-1 truncate text-[12px] text-ink-muted hover:text-accent">{e.title}</a>
      {e.when && <span className="font-mono text-[9.5px] text-ink-faint">{timeAgo(e.when)}</span>}
    </li>
  );
}

function Shell({ children }: { children: ReactNode }) {
  return <div className="brief-dark min-h-[calc(100vh-3.5rem)] bg-canvas text-ink"><div className="mx-auto max-w-3xl px-5 pb-16 pt-8 sm:px-8">{children}</div></div>;
}

export default function EventPage({ clusterId }: { clusterId: string }) {
  const { data: feed, isLoading } = useFeed();
  const dossier = useMemo(() => buildEventDossier(clusterId, feed ?? null), [clusterId, feed]);
  const view = useMemo(() => buildEventView(dossier, feed), [dossier, feed]);

  if (!dossier) {
    return <Shell><p className="pt-8 text-[14px] text-ink-secondary">{isLoading ? "Loading…" : "The market feed is unreachable right now, so this event cannot be read. Nothing is shown in its place."}</p></Shell>;
  }
  if (!view) {
    return (
      <Shell>
        <h1 className="pt-8 text-[20px] font-semibold text-ink">This event isn&rsquo;t in the current cycle</h1>
        <p className="mt-3 max-w-[60ch] text-[13.5px] leading-relaxed text-ink-secondary">Event pages are built from the live market feed. This one isn&rsquo;t in it right now.</p>
        <Link href="/feed" className="mt-6 inline-block text-[11px] font-semibold uppercase tracking-[0.1em] text-accent">&larr; Feed</Link>
      </Shell>
    );
  }

  const { hero, whoAffected: who } = view;

  return (
    <Shell>
      <div className="flex flex-col gap-9">
        {/* Adaptive hero */}
        <header>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[9px] font-semibold uppercase tracking-[0.18em] text-accent">{hero.typeTag}</span>
            {hero.whenISO && <span className="font-mono text-[10px] text-ink-faint">{timeAgo(hero.whenISO)}</span>}
            {hero.developing && <span className="rounded-full bg-amber-400/12 px-1.5 py-0.5 text-[8px] font-semibold uppercase tracking-[0.12em] text-amber-400/90">Developing</span>}
          </div>
          <h1 className="mt-1.5 max-w-[34ch] font-serif text-[clamp(1.35rem,3vw,2rem)] font-normal leading-[1.2] tracking-[-0.01em] text-ink">{hero.headline}</h1>
          {hero.visualization.kind === "price-chart" && (
            <div className="mt-4">
              <HeroChart viz={hero.visualization} />
            </div>
          )}
        </header>

        {/* 1. What changed */}
        {hero.summary && (
          <Section title="What changed">
            <p className="max-w-[64ch] font-serif text-[clamp(1.02rem,1.9vw,1.28rem)] leading-snug text-ink">{hero.summary}</p>
          </Section>
        )}

        {/* 2. Evidence */}
        <Section title="Evidence">
          {view.evidence ? (
            <>
              <p className="mb-1 text-[11px] text-ink-muted">{view.evidence.sourceCount} {view.evidence.sourceCount === 1 ? "source" : "sources"}{view.evidence.corroboration >= 2 ? `, ${view.evidence.corroboration} agree` : ""}</p>
              <ol className="flex flex-col divide-y divide-edge-subtle/50">{view.evidence.items.map((e, i) => <EvidenceRow key={`${e.url}-${i}`} e={e} />)}</ol>
            </>
          ) : (
            <p className="text-[13px] text-ink-muted">No sources are on record for this event yet.</p>
          )}
        </Section>

        {/* 3. Why investors care */}
        {view.whyInvestorsCare && (
          <Section title="Why investors care">
            <p className="max-w-[64ch] text-[13.5px] leading-relaxed text-ink-secondary">{view.whyInvestorsCare.read}</p>
            {view.whyInvestorsCare.chain.length > 0 && (
              <div className="mt-2 flex flex-wrap items-center gap-x-1.5 gap-y-1">
                {view.whyInvestorsCare.chain.map((a, i) => (
                  <span key={`${a.label}-${i}`} className="flex items-center gap-1.5">
                    <EntityChip kind={a.kind} label={a.label} size="md" className="rounded-md border border-edge-subtle bg-raised/50 px-1.5 py-0.5 text-[12px] font-semibold text-ink" />
                    {i < view.whyInvestorsCare!.chain.length - 1 && <span className="text-ink-faint" aria-hidden>&rarr;</span>}
                  </span>
                ))}
              </div>
            )}
          </Section>
        )}

        {/* 4. Who's affected (required) */}
        <Section title="Who&rsquo;s affected">
          {(who.beneficiaries.length || who.losers.length || who.companies.length || who.industries.length || who.markets.length) ? (
            <div className="flex flex-col gap-3">
              <ChipRow label="Beneficiaries" items={who.beneficiaries} color="#34D399" />
              <ChipRow label="Losers" items={who.losers} color="#F87171" />
              <ChipRow label="Companies involved" items={who.companies} />
              <ChipRow label="Industries exposed" items={who.industries} />
              <ChipRow label="Markets affected" items={who.markets} />
            </div>
          ) : (
            <p className="text-[13px] text-ink-muted">No specific companies or markets are named by this event yet.</p>
          )}
        </Section>

        {/* 5. The other side (only when a credible one exists) */}
        {view.theOtherSide && (
          <Section title="The other side">
            <ul className="flex flex-col gap-1.5">{view.theOtherSide.map((s, i) => <li key={i} className="max-w-[62ch] text-[13px] leading-relaxed text-ink-secondary">{s}</li>)}</ul>
          </Section>
        )}

        {/* 6. What to watch */}
        {view.watch.length > 0 && (
          <Section title="What to watch">
            <ul className="flex flex-col gap-2">{view.watch.map((w, i) => <li key={i} className="max-w-[60ch] font-serif text-[14px] italic leading-snug text-ink-secondary">{w}</li>)}</ul>
          </Section>
        )}
      </div>
    </Shell>
  );
}
