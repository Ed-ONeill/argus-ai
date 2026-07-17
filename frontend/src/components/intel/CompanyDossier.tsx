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
import { buildCompanyDossier, type AttributedEvent, type CompanyDossier as Dossier } from "@/lib/intel/dossier";
import { buildNetworkModel } from "@/lib/network/model";
import type { MarketSnapshot } from "@/lib/marketMap";
import {
  fetchCalibrationStatus, fetchEntityMemory, fetchEntityPredictions,
  type CalibrationStatus, type EntityMemory, type PredictionRow,
} from "@/lib/api";
import { TYPE, INK, BORDER, FONT_MONO } from "@/lib/network/tokens";
import { timeAgo } from "@/lib/utils";
import type { MarketEvent } from "@/lib/types";
// shared dossier grammar primitives (extracted for IR-1 — one form, two kinds)
import { Section, Absence, Provenance, Fig, BODY, LEAD, CLASS_LABEL } from "@/components/intel/primitives";

// session caches — the file never hammers the M3 read APIs on re-render
const memCache = new Map<string, EntityMemory | null>();
const predCache = new Map<string, PredictionRow[] | null>();
let calCache: CalibrationStatus | null | undefined;

const DIR_COLOR = { bullish: "#34d399", bearish: "#f87171", neutral: "#8ea3c4" } as const;

// ── Event Record entry ──────────────────────────────────────────────────────────

function EventRow({ ev, reason }: { ev: MarketEvent; reason?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="py-3" style={{ borderBottom: `1px solid ${BORDER.hairline}` }}>
      <button onClick={() => setOpen(o => !o)} className="w-full text-left group">
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="uppercase font-bold shrink-0 rounded px-1.5 py-px"
            style={{ fontSize: 9, letterSpacing: "0.08em", color: INK.support, border: `1px solid ${BORDER.hairline}` }}>
            {CLASS_LABEL[ev.event_type] ?? ev.event_type}
          </span>
          {reason && (
            <span className="shrink-0 font-bold rounded px-1.5 py-px"
              style={{ fontSize: 9.5, color: "#c9a86a", border: "1px solid rgba(201,168,106,0.35)" }}>
              {reason}
            </span>
          )}
          <span className="font-semibold group-hover:underline decoration-1 underline-offset-2"
            style={{ fontSize: BODY, color: INK.primary, lineHeight: 1.45 }}>{ev.title}</span>
        </div>
        <div className="flex items-baseline gap-3 mt-1 flex-wrap" style={{ fontSize: 10.5, color: INK.whisper }}>
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
        <Link href={`/event/${encodeURIComponent(ev.id)}`}
          className="inline-block mt-1.5 font-bold uppercase hover:opacity-80"
          style={{ fontSize: 9, letterSpacing: "0.1em", color: "#7cc7d8" }}>
          Research note →
        </Link>
      )}
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
                style={{ fontSize: 11, color: INK.support }}>
                {e.title}
              </a>
              <span className="ml-auto tabular-nums shrink-0" style={{ fontFamily: FONT_MONO, fontSize: 8, color: INK.whisper }}>
                {e.published ? timeAgo(e.published) : ""}
              </span>
            </div>
          ))}
          {ev.why_it_matters && (
            <p className="mt-1.5 flex items-baseline gap-2" style={{ fontSize: 11.5, color: INK.support, lineHeight: 1.55 }}>
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
  // map height proportional to what it must hold — never a fixed slab
  const mapHeight = useMemo(
    () => model ? Math.max(300, Math.min(440, 220 + model.nodes.length * 14)) : 300,
    [model]);

  if (isLoading && !dossier) {
    return <div className="max-w-5xl mx-auto px-4 sm:px-6 py-12">
      <div className="h-40 rounded-lg border animate-pulse" style={{ borderColor: BORDER.frame, background: "rgba(5,9,16,0.6)" }} />
    </div>;
  }
  if (!dossier) {
    return <div className="max-w-5xl mx-auto px-4 sm:px-6 py-12">
      <Absence>The feed cycle is unreachable — the file cannot be read right now. Nothing is simulated in its place.</Absence>
    </div>;
  }

  const snapshots = memory?.snapshots ?? [];
  const snapDates = snapshots.map(s => s.snapshot_date).filter(Boolean).sort() as string[];

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">

      {/* A · MASTHEAD — identity + the coverage line (the file's credentials) */}
      <header id="identity">
        <div className="flex items-baseline gap-3 flex-wrap">
          <h1 className="font-black tracking-tight" style={{ fontSize: 32, color: INK.primary }}>{dossier.name}</h1>
          <span className="font-bold tabular-nums" style={{ fontFamily: FONT_MONO, fontSize: 20, color: "#7cc7d8" }}>
            {dossier.ticker}
          </span>
          <span className="uppercase font-bold rounded px-2 py-0.5"
            style={{ fontSize: TYPE.xs, letterSpacing: "0.1em", color: INK.support, border: `1px solid ${BORDER.frame}` }}>
            Company File
          </span>
        </div>
        <p className="mt-1" style={{ fontSize: BODY, color: INK.support }}>
          {dossier.identified
            ? [dossier.sector, dossier.exchange].filter(Boolean).join(" · ")
            : "Identity beyond the ticker is unresolved — Argus does not guess company details."}
        </p>
        <div className="flex items-baseline gap-5 mt-4 flex-wrap">
          <Fig value={dossier.coverage.events} label="direct events" href="#events" />
          <Fig value={dossier.coverage.related} label="related" href="#related" />
          <Fig value={dossier.coverage.evidence} label="documents" href="#events" />
          <Fig value={dossier.coverage.themes} label="theses" href="#standing" />
          <Fig value={snapshots.length} label="archive days" href="#memory" />
          <Fig value={predictions?.length ?? 0} label="predictions" href="#ledger" />
          {dossier.coverage.firstSeen && (
            <span style={{ fontSize: 10.5, color: INK.whisper }}>
              in the file since <span className="tabular-nums" style={{ fontFamily: FONT_MONO }}>{dossier.coverage.firstSeen.slice(0, 10)}</span>
            </span>
          )}
        </div>
      </header>

      {/* B · STANDING VIEW — what Argus believes, in investor language */}
      <Section id="standing" title="Standing View" note="derived from the live model — restated every cycle">
        <div className="flex items-start gap-2.5">
          <Provenance kind="derived" />
          <div style={{ maxWidth: "74ch" }}>
            {dossier.standing.sentences.map((s, i) => (
              <p key={i} className={i > 0 ? "mt-1.5" : ""}
                style={{ fontSize: i === 0 ? LEAD : BODY, color: i === 0 ? INK.primary : INK.secondary, lineHeight: 1.65 }}>{s}</p>
            ))}
          </div>
        </div>
        {dossier.exposures.length > 0 && (
          <div className="mt-5">
            {dossier.exposures.map(x => (
              <div key={x.themeId} className="py-3" style={{ borderBottom: `1px solid ${BORDER.hairline}` }}>
                <div className="flex items-baseline gap-3 flex-wrap">
                  <EntityChip kind="theme" label={x.themeName} className="font-semibold text-[13px]" color={DIR_COLOR[x.direction]} />
                  {x.dominant && (
                    <span className="uppercase font-bold" style={{ fontSize: 9, letterSpacing: "0.1em", color: "#7cc7d8" }}>dominant thesis</span>
                  )}
                  <span className="tabular-nums font-bold" style={{ fontFamily: FONT_MONO, fontSize: 14, color: INK.primary }}>{x.conviction}</span>
                  <span className="uppercase" style={{ fontSize: 10, color: INK.whisper, letterSpacing: "0.06em" }}>{x.momentumLabel}</span>
                  <span className="tabular-nums" style={{ fontFamily: FONT_MONO, fontSize: 10, color: INK.whisper }}>
                    {x.evidenceCount} sources
                  </span>
                  <span className="uppercase font-bold ml-auto" style={{ fontSize: 8.5, letterSpacing: "0.08em", color: INK.whisper }}>
                    {x.connection} exposure
                  </span>
                </div>
                <p className="mt-1.5" style={{ fontSize: BODY, color: INK.secondary, lineHeight: 1.6, maxWidth: "74ch" }}>
                  {x.whyConnected}
                </p>
                {x.transmission && (
                  <p className="mt-1 tabular-nums" style={{ fontFamily: FONT_MONO, fontSize: 10.5, color: INK.whisper }}>
                    {x.transmission}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* C · EVENT RECORD — what happened TO this company (direct only) */}
      <Section id="events" title="Event Record"
        note={dossier.record.length ? `events naming ${dossier.ticker} directly · evidence attached · one event, once` : undefined}>
        {dossier.record.length === 0 ? (
          <Absence>
            No events name {dossier.name} directly this cycle.
            {dossier.related.length > 0 && ` ${dossier.related.length} related development${dossier.related.length === 1 ? "" : "s"} that may affect it ${dossier.related.length === 1 ? "is" : "are"} listed below.`}
            {" "}The record covers what the editorial engine admitted — a quiet file is a short file, not a padded one.
          </Absence>
        ) : (
          <>
            {dossier.record.slice(0, eventLimit).map(r => <EventRow key={r.event.id} ev={r.event} />)}
            {dossier.record.length > eventLimit && (
              <button onClick={() => setEventLimit(l => l + PAGE_SIZE)}
                className="mt-3 font-bold uppercase hover:opacity-80"
                style={{ fontSize: TYPE.xs, letterSpacing: "0.1em", color: "#7cc7d8" }}>
                Show {Math.min(PAGE_SIZE, dossier.record.length - eventLimit)} more of {dossier.record.length}
              </button>
            )}
          </>
        )}
      </Section>

      {/* C2 · RELATED MARKET DEVELOPMENTS — what may AFFECT this company,
          each item stating why it is included (never mixed into the record) */}
      <Section id="related" title="Related Market Developments"
        note={dossier.related.length ? "indirect — connected through peers, industry, or thesis; the reason is stated on every item" : undefined}>
        {dossier.related.length === 0 ? (
          <Absence>No indirect developments connect to {dossier.name} this cycle.</Absence>
        ) : (
          dossier.related.map((r: AttributedEvent) => <EventRow key={r.event.id} ev={r.event} reason={r.reason} />)
        )}
      </Section>

      {/* D · RELATIONSHIP MAP — the theses naming this company, canonical grammar */}
      <Section id="map" title="Relationship Map"
        note={model ? "the canonical graph, scoped to the theses naming this company" : undefined}>
        {model && model.nodes.length > 2 ? (
          <IntelligenceNetwork model={model} height={mapHeight} focusId={focalId} />
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
          <div className="flex items-start gap-2.5">
            <Provenance kind="recorded" />
            <div>
              <p style={{ fontSize: BODY, color: INK.secondary, lineHeight: 1.6 }}>
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
                <span style={{ fontSize: BODY, color: INK.secondary, lineHeight: 1.55 }}>{p.statement}</span>
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

      {/* G · WATCH — company-specific questions from the exposure chains */}
      <Section id="watch" title="Watch" note="derived from the recorded exposure chains — deduplicated, nothing page-local">
        {dossier.watch.length === 0 ? (
          <Absence>No open conditions name {dossier.name}.</Absence>
        ) : (
          <div>
            {dossier.watch.map((w, i) => (
              <div key={i} className="py-2" style={{ borderBottom: `1px solid ${BORDER.hairline}` }}>
                <p style={{ fontSize: BODY, color: INK.secondary, lineHeight: 1.6, maxWidth: "74ch" }}>{w.text}</p>
                <p className="mt-0.5 uppercase font-bold" style={{ fontSize: 9, letterSpacing: "0.08em", color: INK.whisper }}>
                  from {w.sourceTheme}
                </p>
              </div>
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
