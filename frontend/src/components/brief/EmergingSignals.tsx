"use client";

// Emerging Signals — anticipatory intelligence (§EMERGE″/§EMERGE‴): what is becoming
// institutionally relevant BEFORE it becomes consensus. Each signal is labeled early
// and closes with a "watch for" curiosity hook (§A⁶) — the unanswered question that
// invites a click. Honest by omission: no real early signals → a calm, informative
// "no strong emerging signals" state, never fabricated.

import { EntityChip } from "@/components/common/EntityChip";
import { ExploreLink } from "./ExploreLink";
import type { EmergingSignal } from "@/lib/livingBrief";

function Signal({ signal }: { signal: EmergingSignal }) {
  return (
    <li className="flex flex-col gap-2 border-l border-edge-strong/50 pl-4">
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
        <span className="rounded-full bg-accent/12 px-2 py-0.5 text-[8.5px] font-semibold uppercase tracking-[0.14em] text-accent">
          Early
        </span>
        <EntityChip kind="theme" label={signal.headline} size="md"
          className="text-[15px] font-semibold text-ink" />
        <span className="font-mono text-[10px] text-ink-faint">
          {signal.confidence.band} conviction
        </span>
      </div>
      <p className="max-w-[56ch] text-[13px] leading-relaxed text-ink-secondary">{signal.pattern}</p>
      {signal.assets.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {signal.assets.map((a, i) => (
            <EntityChip key={`${a.label}-${i}`} kind={a.kind} label={a.label} size="md"
              className="rounded-md border border-edge-subtle bg-raised/50 px-1.5 py-0.5 font-semibold" />
          ))}
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[11.5px] text-ink-muted">
          <span className="text-ink-faint">Watch for → </span>{signal.watchFor}
        </p>
        <ExploreLink label="Track early" entity={signal.headline} />
      </div>
    </li>
  );
}

export function EmergingSignals({ signals }: { signals: EmergingSignal[] }) {
  return (
    <section aria-labelledby="emerging-heading">
      <div className="mb-1 flex items-baseline justify-between">
        <h2 id="emerging-heading" className="text-[12px] font-semibold uppercase tracking-[0.22em] text-ink">
          Emerging Signals
        </h2>
        <span className="text-[9.5px] uppercase tracking-[0.16em] text-ink-faint">Before consensus</span>
      </div>
      <hr className="brief-rule mb-6 mt-3" />
      {signals.length === 0 ? (
        <p className="text-[13px] leading-relaxed text-ink-muted">
          No strong emerging signals right now, the tape is quiet beneath the surface.
          Argus keeps watching for what starts before it&rsquo;s priced in.
        </p>
      ) : (
        <ul className="flex flex-col gap-7">
          {signals.map((s) => <Signal key={s.id} signal={s} />)}
        </ul>
      )}
    </section>
  );
}
