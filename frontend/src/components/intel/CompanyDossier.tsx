"use client";

/**
 * components/intel/CompanyDossier.tsx — the company kind of the canonical
 * Entity Intelligence dossier (EI1, ARGUS_ENTITY_INTELLIGENCE_V1).
 *
 * The analyst's file, opened: identity → standing view → event record →
 * relationship map → institutional memory → prediction ledger → watch. One
 * column, fixed order, no tabs, no grids. PURE PROJECTION — every section
 * renders records existing engines own (F1/F2 events, theme intelligence,
 * ThemeMemory, the M3 archive and ledger, the M4 network grammar); nothing
 * here computes meaning, and every absence is a designed state in the 4B
 * voice, never a spinner-as-answer.
 */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import IntelligenceNetwork from "@/components/network/IntelligenceNetwork";
import { EntityChip } from "@/components/common/EntityChip";
import { useFeed } from "@/hooks/useFeed";
import { buildCompanyDossier, type CompanyDossier as Dossier } from "@/lib/intel/dossier";
import { buildNetworkModel } from "@/lib/network/model";
import type { MarketSnapshot } from "@/lib/marketMap";
import {
  fetchCalibrationStatus, fetchEntityMemory, fetchEntityPredictions,
  type CalibrationStatus, type EntityMemory, type PredictionRow,
} from "@/lib/api";
import { TYPE, INK, BORDER, FONT_MONO } from "@/lib/network/tokens";
import { timeAgo } from "@/lib/utils";
import type { MarketEvent } from "@/lib/types";

// session caches — the file never hammers the M3 read APIs on re-render
const memCache = new Map<string, EntityMemory | null>();
const predCache = new Map<string, PredictionRow[] | null>();
let calCache: CalibrationStatus | null | undefined;

const CLASS_LABEL: Record<string, string> = {
  macro: "Macro", policy: "Policy", earnings: "Earnings", ma: "M&A",
  market_event: "Market", single_name: "Company", price_echo: "Price Echo",
};
const DIR_COLOR = { bullish: "#34d399", bearish: "#f87171", neutral: "#8ea3c4" } as const;

// ── shared section primitives (the grammar's form, not new design language) ────

function Section({ id, title, note, children }: {
  id: string; title: string; note?: string; children: React.ReactNode;
}) {
  return (
    <section id={id} className="pt-7 mt-7" style={{ borderTop: `1px solid ${BORDER.hairline}` }}>
      <div className="flex items-baseline gap-3 mb-3">
        <h2 className="font-bold uppercase" style={{ fontSize: TYPE.sm, letterSpacing: "0.14em", color: INK.support }}>
          {title}
        </h2>
        {note && <span style={{ fontSize: TYPE.xs, color: INK.whisper }}>{note}</span>}
      </div>
      {children}
    </section>
  );
}

/** Designed absence — the honest state rendered at full quality (4B voice). */
function Absence({ children }: { children: React.ReactNode }) {
  return <p style={{ fontSize: TYPE.md, color: INK.support, lineHeight: 1.55 }}>{children}</p>;
}

function Provenance({ kind }: { kind: "recorded" | "derived" }) {
  return (
    <span className="uppercase font-bold rounded px-1.5 py-px shrink-0"
      style={{ fontSize: 8, letterSpacing: "0.08em",
               color: kind === "recorded" ? "#7cc7d8" : INK.whisper,
               border: `1px solid ${kind === "recorded" ? "rgba(82,176,200,0.35)" : BORDER.hairline}` }}>
      {kind}
    </span>
  );
}

function Fig({ value, label, href }: { value: string | number; label: string; href?: string }) {
  const body = (
    <span className="flex items-baseline gap-1.5">
      <span className="font-bold tabular-nums" style={{ fontFamily: FONT_MONO, fontSize: TYPE.lg, color: INK.primary }}>{value}</span>
      <span className="uppercase" style={{ fontSize: TYPE.xs, letterSpacing: "0.08em", color: INK.whisper }}>{label}</span>
    </span>
  );
  return href ? <a href={href} className="hover:opacity-80">{body}</a> : body;
}

// ── Event Record entry ──────────────────────────────────────────────────────────

function EventRow({ ev }: { ev: MarketEvent }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="py-2.5" style={{ borderBottom: `1px solid ${BORDER.hairline}` }}>
      <button onClick={() => setOpen(o => !o)} className="w-full text-left group">
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="uppercase font-bold shrink-0 rounded px-1.5 py-px"
            style={{ fontSize: 8, letterSpacing: "0.08em", color: INK.support, border: `1px solid ${BORDER.hairline}` }}>
            {CLASS_LABEL[ev.event_type] ?? ev.event_type}
          </span>
          <span className="font-semibold group-hover:underline decoration-1 underline-offset-2"
            style={{ fontSize: TYPE.md, color: INK.primary }}>{ev.title}</span>
        </div>
        <div className="flex items-baseline gap-3 mt-1 flex-wrap" style={{ fontSize: TYPE.xs, color: INK.whisper }}>
          <span className="tabular-nums" style={{ fontFamily: FONT_MONO }}>{timeAgo(ev.first_seen) || "—"}</span>
          <span className="tabular-nums" style={{ fontFamily: FONT_MONO, color: ev.corroboration_count >= 2 ? "#7cc7d8" : INK.whisper }}>
            {ev.source_count} source{ev.source_count === 1 ? "" : "s"}
          </span>
          {ev.developing && (
            <span className="uppercase font-bold" style={{ letterSpacing: "0.08em", color: "#f59e0b" }}>
              One source · not yet corroborated
            </span>
          )}
          {ev.reporting_period && (
            <span className="tabular-nums uppercase" style={{ fontFamily: FONT_MONO }}>{ev.reporting_period}</span>
          )}
          <span className="ml-auto" style={{ color: INK.whisper }}>{open ? "close" : `evidence (${ev.evidence.length})`}</span>
        </div>
      </button>
      {open && (
        <div className="mt-2 ml-1 pl-3" style={{ borderLeft: `2px solid ${BORDER.frame}` }}>
          {ev.evidence.map(e => (
            <div key={e.url} className="flex items-baseline gap-2 py-1 flex-wrap">
              <span className="font-bold shrink-0" style={{ fontSize: TYPE.xs, color: e.qualified ? INK.secondary : INK.whisper }}>
                {e.source}
              </span>
              <span className="uppercase shrink-0" style={{ fontSize: 8, letterSpacing: "0.06em", color: INK.whisper }}>
                T{e.tier}{e.kind !== "news" ? ` · ${e.kind.replace("_", " ")}` : ""}{e.qualified ? "" : " · not corroborating"}
              </span>
              <a href={e.url} target="_blank" rel="noopener noreferrer" className="hover:underline min-w-0 truncate"
                style={{ fontSize: TYPE.xs, color: INK.support }}>
                {e.title}
              </a>
              <span className="ml-auto tabular-nums shrink-0" style={{ fontFamily: FONT_MONO, fontSize: 8, color: INK.whisper }}>
                {e.published ? timeAgo(e.published) : ""}
              </span>
            </div>
          ))}
          {ev.why_it_matters && (
            <p className="mt-1.5 flex items-baseline gap-2" style={{ fontSize: TYPE.xs, color: INK.support, lineHeight: 1.5 }}>
              <Provenance kind="derived" /> <span>{ev.why_it_matters}</span>
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ── the file ────────────────────────────────────────────────────────────────────

const PAGE_SIZE = 12;

export default function CompanyDossier({ ticker }: { ticker: string }) {
  const { data, isLoading } = useFeed();
  const dossier: Dossier | null = useMemo(() => buildCompanyDossier(ticker, data ?? null), [ticker, data]);

  // M3 archive + ledger (honest-null contract; session-cached)
  const uid = dossier?.uid ?? `company:ticker:${ticker.toUpperCase()}`;
  const [memory, setMemory] = useState<EntityMemory | null | undefined>(memCache.get(uid));
  const [predictions, setPredictions] = useState<PredictionRow[] | null | undefined>(predCache.get(uid));
  const [calibration, setCalibration] = useState<CalibrationStatus | null | undefined>(calCache);
  useEffect(() => {
    let alive = true;
    if (!memCache.has(uid)) fetchEntityMemory(uid).then(m => { memCache.set(uid, m); if (alive) setMemory(m); });
    if (!predCache.has(uid)) fetchEntityPredictions(uid, 8).then(p => { predCache.set(uid, p); if (alive) setPredictions(p); });
    if (calCache === undefined) fetchCalibrationStatus().then(c => { calCache = c; if (alive) setCalibration(c); });
    return () => { alive = false; };
  }, [uid]);

  const [eventLimit, setEventLimit] = useState(PAGE_SIZE);

  // relationship map: the theses naming this company, in the canonical grammar
  const snapshot: MarketSnapshot = useMemo(() => {
    const label = data?.sector_data?.derived_regime || "";
    const risk = /risk-?off/i.test(label) ? "risk-off" : /risk-?on/i.test(label) ? "risk-on" : "neutral";
    return { riskRegime: risk, regimeLabel: label || undefined };
  }, [data]);
  const model = useMemo(
    () => (dossier && dossier.linkedThemes.length ? buildNetworkModel(dossier.linkedThemes, snapshot) : null),
    [dossier, snapshot]);
  const focalId = useMemo(
    () => model?.nodes.find(n => n.cls === "asset" && n.ticker === ticker.toUpperCase())?.id ?? null,
    [model, ticker]);

  if (isLoading && !dossier) {
    return <div className="max-w-4xl mx-auto px-4 sm:px-6 py-12">
      <div className="h-40 rounded-lg border animate-pulse" style={{ borderColor: BORDER.frame, background: "rgba(5,9,16,0.6)" }} />
    </div>;
  }
  if (!dossier) {
    return <div className="max-w-4xl mx-auto px-4 sm:px-6 py-12">
      <Absence>The feed cycle is unreachable — the file cannot be read right now. Nothing is simulated in its place.</Absence>
    </div>;
  }

  const snapshots = memory?.snapshots ?? [];
  const snapDates = snapshots.map(s => s.snapshot_date).filter(Boolean).sort() as string[];

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">

      {/* A · MASTHEAD — identity + the coverage line (the file's credentials) */}
      <header id="identity">
        <div className="flex items-baseline gap-3 flex-wrap">
          <h1 className="font-black tracking-tight" style={{ fontSize: 28, color: INK.primary }}>{dossier.name}</h1>
          <span className="font-bold tabular-nums" style={{ fontFamily: FONT_MONO, fontSize: TYPE.xl, color: "#7cc7d8" }}>
            {dossier.ticker}
          </span>
          <span className="uppercase font-bold rounded px-2 py-0.5"
            style={{ fontSize: TYPE.xs, letterSpacing: "0.1em", color: INK.support, border: `1px solid ${BORDER.frame}` }}>
            Company File
          </span>
        </div>
        <p className="mt-1" style={{ fontSize: TYPE.md, color: INK.support }}>
          {dossier.identified
            ? [dossier.sector, dossier.exchange].filter(Boolean).join(" · ")
            : "Identity beyond the ticker is unresolved — Argus does not guess company details."}
        </p>
        <div className="flex items-baseline gap-5 mt-4 flex-wrap">
          <Fig value={dossier.coverage.events} label="events" href="#events" />
          <Fig value={dossier.coverage.evidence} label="documents" href="#events" />
          <Fig value={dossier.coverage.themes} label="theses" href="#standing" />
          <Fig value={snapshots.length} label="archive days" href="#memory" />
          <Fig value={predictions?.length ?? 0} label="predictions" href="#ledger" />
          {dossier.coverage.firstSeen && (
            <span style={{ fontSize: TYPE.xs, color: INK.whisper }}>
              in the file since <span className="tabular-nums" style={{ fontFamily: FONT_MONO }}>{dossier.coverage.firstSeen.slice(0, 10)}</span>
            </span>
          )}
        </div>
      </header>

      {/* B · STANDING VIEW — what Argus currently believes, and on what */}
      <Section id="standing" title="Standing View" note="derived from the live model — restated every cycle">
        <div className="flex items-start gap-2">
          <Provenance kind="derived" />
          <div>
            {dossier.standing.sentences.map((s, i) => (
              <p key={i} style={{ fontSize: i === 0 ? TYPE.lg : TYPE.md, color: i === 0 ? INK.primary : INK.secondary, lineHeight: 1.6 }}>{s}</p>
            ))}
          </div>
        </div>
        {dossier.exposures.length > 0 && (
          <div className="mt-4">
            {dossier.exposures.map(x => (
              <div key={x.themeId} className="flex items-baseline gap-3 py-2 flex-wrap"
                style={{ borderBottom: `1px solid ${BORDER.hairline}` }}>
                <EntityChip kind="theme" label={x.themeName} size="md" className="font-semibold" color={DIR_COLOR[x.direction]} />
                {x.dominant && (
                  <span className="uppercase font-bold" style={{ fontSize: 8, letterSpacing: "0.1em", color: "#7cc7d8" }}>dominant thesis</span>
                )}
                <span className="tabular-nums font-bold" style={{ fontFamily: FONT_MONO, fontSize: TYPE.md, color: INK.primary }}>{x.conviction}</span>
                <span className="uppercase" style={{ fontSize: TYPE.xs, color: INK.whisper, letterSpacing: "0.06em" }}>{x.momentumLabel}</span>
                <span className="tabular-nums" style={{ fontFamily: FONT_MONO, fontSize: TYPE.xs, color: INK.whisper }}>
                  {x.evidenceCount} sources
                </span>
                {x.transmission && (
                  <span className="w-full mt-0.5" style={{ fontSize: TYPE.xs, color: INK.support }}>{x.transmission}</span>
                )}
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* C · EVENT RECORD — dated events with their documents (the file's spine) */}
      <Section id="events" title="Event Record"
        note={dossier.events.length ? "editorial rank · evidence attached · one event, once" : undefined}>
        {dossier.events.length === 0 ? (
          <Absence>
            No events in the current cycle name {dossier.name}. The record covers what the editorial
            engine admitted — a quiet file is a short file, not a padded one.
          </Absence>
        ) : (
          <>
            {dossier.events.slice(0, eventLimit).map(ev => <EventRow key={ev.id} ev={ev} />)}
            {dossier.events.length > eventLimit && (
              <button onClick={() => setEventLimit(l => l + PAGE_SIZE)}
                className="mt-3 font-bold uppercase hover:opacity-80"
                style={{ fontSize: TYPE.xs, letterSpacing: "0.1em", color: "#7cc7d8" }}>
                Show {Math.min(PAGE_SIZE, dossier.events.length - eventLimit)} more of {dossier.events.length}
              </button>
            )}
          </>
        )}
      </Section>

      {/* D · RELATIONSHIP MAP — the theses naming this company, canonical grammar */}
      <Section id="map" title="Relationship Map"
        note={model ? "the canonical graph, scoped to the theses naming this company" : undefined}>
        {model && model.nodes.length > 2 ? (
          <IntelligenceNetwork model={model} height={360} focusId={focalId} />
        ) : (
          <Absence>
            No standing thesis places {dossier.name} in the transmission structure this cycle,
            so there is no map to draw — an empty graph would be decoration.
          </Absence>
        )}
      </Section>

      {/* E · INSTITUTIONAL MEMORY — the archive trail (recorded, never recalled) */}
      <Section id="memory" title="Institutional Memory" note="sealed daily snapshots — the M3 archive">
        {memory === undefined ? (
          <Absence>Reading the archive…</Absence>
        ) : memory === null ? (
          <Absence>The institutional archive is unreachable. The file shows nothing in its place.</Absence>
        ) : snapshots.length === 0 ? (
          <Absence>
            No archived observations for {dossier.name} yet. The archive seals entity snapshots daily
            once a subject enters the recorded model; this file is younger than that bar.
          </Absence>
        ) : (
          <div className="flex items-start gap-2">
            <Provenance kind="recorded" />
            <div>
              <p style={{ fontSize: TYPE.md, color: INK.secondary, lineHeight: 1.6 }}>
                <span className="tabular-nums font-bold" style={{ fontFamily: FONT_MONO, color: INK.primary }}>{memory.count}</span>
                {" "}archived day{memory.count === 1 ? "" : "s"}
                {snapDates.length > 0 && (
                  <> · <span className="tabular-nums" style={{ fontFamily: FONT_MONO }}>{snapDates[0]}</span>
                  {" "}→ <span className="tabular-nums" style={{ fontFamily: FONT_MONO }}>{snapDates[snapDates.length - 1]}</span></>
                )}
              </p>
              <p className="mt-1" style={{ fontSize: TYPE.xs, color: INK.whisper }}>
                Snapshots are sealed as recorded — the archive is what Argus knew each day, not a recollection.
              </p>
            </div>
          </div>
        )}
      </Section>

      {/* F · PREDICTION LEDGER — accountability outranks narrative pride */}
      <Section id="ledger" title="Prediction Ledger" note="registered wording · verdicts unabridged">
        {predictions === undefined ? (
          <Absence>Reading the ledger…</Absence>
        ) : predictions === null ? (
          <Absence>The prediction ledger is unreachable. No entries are simulated.</Absence>
        ) : predictions.length === 0 ? (
          <Absence>
            No predictions name {dossier.name}. Argus registers predictions only where admission
            rules pass — an empty ledger is a fact, not a gap.
          </Absence>
        ) : (
          <div>
            {predictions.map(p => (
              <div key={p.prediction_uid} className="flex items-baseline gap-3 py-2 flex-wrap"
                style={{ borderBottom: `1px solid ${BORDER.hairline}` }}>
                <span className="uppercase font-bold tabular-nums shrink-0 rounded px-1.5 py-px"
                  style={{ fontSize: 8, letterSpacing: "0.08em", fontFamily: FONT_MONO,
                           color: p.status === "confirmed" ? "#34d399"
                                : p.status === "contradicted" ? "#f87171" : INK.support,
                           border: `1px solid ${BORDER.hairline}` }}>
                  {p.status.replaceAll("_", " ")}
                </span>
                <span style={{ fontSize: TYPE.md, color: INK.secondary, lineHeight: 1.5 }}>{p.statement}</span>
              </div>
            ))}
            <p className="mt-2" style={{ fontSize: TYPE.xs, color: INK.whisper }}>
              {calibration?.overall?.credible
                ? `Calibration: ${calibration.overall.tested} tested outcomes platform-wide — diagnostics, not an accuracy claim.`
                : calibration?.overall
                  ? `Calibration withheld: ${calibration.overall.tested} tested outcomes platform-wide; credibility requires 30.`
                  : "Calibration status unavailable."}
            </p>
          </div>
        )}
      </Section>

      {/* G · WATCH — what would change the read (derived-only, cited) */}
      <Section id="watch" title="Watch" note="derived from live thesis conditions — nothing page-local">
        {dossier.watch.length === 0 ? (
          <Absence>No open conditions name {dossier.name}.</Absence>
        ) : (
          <div>
            {dossier.watch.map((w, i) => (
              <p key={i} className="py-1.5 flex items-baseline gap-2" style={{ fontSize: TYPE.md, color: INK.secondary, lineHeight: 1.55 }}>
                <span className="shrink-0 uppercase font-bold" style={{ fontSize: 8, letterSpacing: "0.08em", color: INK.whisper }}>
                  {w.sourceTheme}
                </span>
                <span>{w.text}</span>
              </p>
            ))}
          </div>
        )}
      </Section>

      <footer className="mt-10 pt-4 flex items-baseline gap-4 flex-wrap"
        style={{ borderTop: `1px solid ${BORDER.hairline}`, fontSize: TYPE.xs, color: INK.whisper }}>
        <span className="tabular-nums" style={{ fontFamily: FONT_MONO }}>{dossier.uid}</span>
        <span>Everything above is read from recorded engines; absences are stated, never filled.</span>
        <Link href="/feed" className="ml-auto hover:opacity-80 font-bold uppercase"
          style={{ letterSpacing: "0.08em", color: "#7cc7d8" }}>← Feed</Link>
      </footer>
    </div>
  );
}
