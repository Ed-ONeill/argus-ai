"use client";

/**
 * components/intel/EventDossier.tsx — the event RECORD of the canonical
 * Entity Intelligence dossier (IR-1, ARGUS_ENTITY_INTELLIGENCE_V1 §2.2,
 * ARGUS_INSTITUTIONAL_REASONING_ENGINE_V1).
 *
 * The first production consumer of the canonical backend Explanation: a
 * professional research note over one Market Event. Fixed order — executive
 * summary → what changed → why it matters → evidence → transmission chain →
 * counterarguments → confidence → what to watch next. PURE PROJECTION: every
 * section renders the engine's status, data, and notes verbatim; nothing here
 * computes meaning, re-ranks evidence, or invents a sentence. Non-available
 * statuses render the engine's own note as the designed state — the page
 * voices the engine; it never speaks for it.
 */

import Link from "next/link";
import { useFeed } from "@/hooks/useFeed";
import { useMemo } from "react";
import {
  buildEventDossier, sectionData,
  type XIdentity, type XEvidence, type XPosition, type XDelta,
  type XCounter, type XConfidence,
} from "@/lib/intel/dossier";
import { Section, Absence, Provenance, Fig, BODY, LEAD, CLASS_LABEL } from "@/components/intel/primitives";
import { TYPE, INK, BORDER, FONT_MONO } from "@/lib/network/tokens";
import { timeAgo } from "@/lib/utils";
import { buildTransmissionView } from "@/lib/transmissionView";
import type { ExplanationSection, TransmissionHop } from "@/lib/types";

const ACCENT = "#7cc7d8";
const AMBER = "#f59e0b";
const RED = "#f87171";
const GREEN = "#34d399";

const BAND_COLOR: Record<string, string> = {
  strong: GREEN, moderate: ACCENT, weak: AMBER, insufficient_signal: INK.whisper,
};

/** The engine's status, worn as a chip — the section's honesty at a glance. */
function StatusChip({ s }: { s: ExplanationSection }) {
  const color =
    s.status === "available" ? ACCENT
    : s.status === "conflicting" ? RED
    : s.status === "developing" ? AMBER
    : INK.whisper;
  return (
    <span className="uppercase font-bold rounded px-1.5 py-px shrink-0"
      style={{ fontSize: 8, letterSpacing: "0.08em", color, border: `1px solid ${BORDER.hairline}` }}>
      {s.status.replaceAll("_", " ")}
    </span>
  );
}

/** Non-available sections render the ENGINE's note verbatim — the designed
    state comes from the reasoning contract, not from page copy. */
function EngineAbsence({ s }: { s: ExplanationSection }) {
  return <Absence>{s.note || "This section carries no content this cycle."}</Absence>;
}

function uidLabel(uid: string): string {
  const key = uid.split(":").pop() ?? uid;
  return key.replace(/-/g, " ");
}

function Hop({ hop, last }: { hop: TransmissionHop; last: boolean }) {
  const isCompany = hop.target_uid.startsWith("company:");
  const target = isCompany ? (
    <Link href={`/intel/${encodeURIComponent(hop.target_uid)}`} className="hover:underline font-bold"
      style={{ color: INK.primary }}>
      {hop.target_uid.split(":").pop()}
    </Link>
  ) : (
    <span className="font-bold capitalize" style={{ color: INK.primary }}>{uidLabel(hop.target_uid)}</span>
  );
  return (
    <div className="flex items-baseline gap-2 py-1.5 flex-wrap" style={!last ? { borderBottom: `1px dashed ${BORDER.hairline}` } : undefined}>
      <span className="font-semibold capitalize" style={{ fontSize: BODY, color: INK.secondary }}>
        {hop.source_label ?? uidLabel(hop.source_uid)}
      </span>
      <span className="uppercase font-bold tabular-nums" style={{ fontFamily: FONT_MONO, fontSize: 9.5, letterSpacing: "0.06em", color: ACCENT }}>
        —{hop.relationship.replaceAll("_", " ")}→
      </span>
      <span style={{ fontSize: BODY }}>{target}</span>
      <span className="uppercase font-bold ml-auto shrink-0" style={{ fontSize: 8, letterSpacing: "0.08em", color: hop.basis === "recorded_graph" ? ACCENT : INK.whisper }}>
        {hop.basis === "recorded_graph" ? "recorded" : "curated"}
      </span>
      {hop.confidence !== null && (
        <span className="tabular-nums shrink-0" style={{ fontFamily: FONT_MONO, fontSize: 9.5, color: INK.whisper }}>
          conf {Math.round(hop.confidence * 100)}
        </span>
      )}
    </div>
  );
}

export default function EventDossier({ clusterId }: { clusterId: string }) {
  const { data, isLoading } = useFeed();
  const dossier = useMemo(() => buildEventDossier(clusterId, data ?? null), [clusterId, data]);

  if (isLoading && !dossier) {
    return <div className="max-w-4xl mx-auto px-4 sm:px-6 py-12">
      <div className="h-40 rounded-lg border animate-pulse" style={{ borderColor: BORDER.frame, background: "rgba(5,9,16,0.6)" }} />
    </div>;
  }
  if (!dossier) {
    return <div className="max-w-4xl mx-auto px-4 sm:px-6 py-12">
      <Absence>The feed cycle is unreachable — the record cannot be read right now. Nothing is simulated in its place.</Absence>
    </div>;
  }

  // The designed not-in-cycle state: honest about what persists and what doesn't.
  if (!dossier.found || !dossier.event) {
    return (
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-12">
        <h1 className="font-black tracking-tight" style={{ fontSize: 22, color: INK.primary }}>
          Not in the current cycle
        </h1>
        <div className="mt-3" style={{ fontSize: BODY, color: INK.support, lineHeight: 1.65, maxWidth: "62ch" }}>
          <p>
            <span className="tabular-nums" style={{ fontFamily: FONT_MONO, color: INK.secondary }}>{dossier.uid}</span>
            {" "}is a valid event identity, but the event is not in the live feed cycle. Event records are built
            from the current editorial cycle; the id itself persists in the institutional archive as an evidence
            reference on the themes it confirmed.
          </p>
          <p className="mt-2" style={{ fontSize: TYPE.xs, color: INK.whisper }}>
            A durable event archive (re-openable records beyond the live cycle) is future work — this state is
            honest, not broken.
          </p>
        </div>
        <Link href="/feed" className="inline-block mt-6 font-bold uppercase hover:opacity-80"
          style={{ fontSize: TYPE.xs, letterSpacing: "0.1em", color: ACCENT }}>← Feed</Link>
      </div>
    );
  }

  const ev = dossier.event;
  const ex = dossier.explanation;
  const identity = ex ? sectionData<XIdentity>(ex.sections.identity) : null;
  const evidence = ex ? sectionData<XEvidence>(ex.sections.evidence) : null;
  const position = ex ? sectionData<XPosition>(ex.sections.position) : null;
  const delta = ex ? sectionData<XDelta>(ex.sections.delta) : null;
  const counter = ex ? sectionData<XCounter>(ex.sections.counter) : null;
  const confidence = ex ? sectionData<XConfidence>(ex.sections.confidence) : null;

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">

      {/* MASTHEAD — the note's credentials: identity, lane, basis figures */}
      <header id="identity">
        <div className="flex items-baseline gap-2.5 flex-wrap">
          <span className="uppercase font-bold rounded px-2 py-0.5"
            style={{ fontSize: TYPE.xs, letterSpacing: "0.1em", color: INK.support, border: `1px solid ${BORDER.frame}` }}>
            Event Record
          </span>
          <span className="uppercase font-bold rounded px-1.5 py-px"
            style={{ fontSize: 9, letterSpacing: "0.08em", color: INK.support, border: `1px solid ${BORDER.hairline}` }}>
            {CLASS_LABEL[ev.event_type] ?? ev.event_type}
          </span>
          {ev.developing && (
            <span className="uppercase font-bold" style={{ fontSize: 9, letterSpacing: "0.08em", color: AMBER }}>
              One source · not yet corroborated
            </span>
          )}
          {ev.dominant && (
            <span className="uppercase font-bold" style={{ fontSize: 9, letterSpacing: "0.1em", color: ACCENT }}>
              feeds the dominant thesis
            </span>
          )}
        </div>
        <h1 className="font-black tracking-tight mt-2" style={{ fontSize: 26, color: INK.primary, lineHeight: 1.25, maxWidth: "30ch" }}>
          {ev.title}
        </h1>
        <p className="mt-1.5 tabular-nums" style={{ fontFamily: FONT_MONO, fontSize: 10.5, color: INK.whisper }}>
          first recorded {ev.first_seen.slice(0, 16).replace("T", " ")} UTC
          {ev.last_updated !== ev.first_seen && <> · last evidence {timeAgo(ev.last_updated) || ev.last_updated.slice(0, 10)}</>}
          {ev.reporting_period && <> · {ev.reporting_period}</>}
        </p>
        <div className="flex items-baseline gap-5 mt-4 flex-wrap">
          <Fig value={ev.corroboration_count} label="qualified sources" href="#evidence" />
          <Fig value={ev.source_count} label="sources" href="#evidence" />
          <Fig value={ev.evidence.length} label="documents" href="#evidence" />
          <Fig value={position?.themes.length ?? ev.theme_ids.length} label="theses" href="#why" />
          <Fig value={identity?.attribution.filter(a => a.class === "direct").length ?? ev.companies_direct.length} label="named companies" href="#why" />
        </div>
      </header>

      {!ex ? (
        <Section id="explanation" title="Explanation">
          <Absence>
            No canonical Explanation accompanies this event in the current cycle (the cycle may predate the
            reasoning engine). The note renders nothing in its place — reasoning is consumed, never recomputed
            page-side.
          </Absence>
        </Section>
      ) : (
        <>
          {/* 1 · EXECUTIVE SUMMARY — deterministic glue over the engine's sections */}
          <Section id="executive" title="Executive Summary" note="composed from the recorded sections below — no generated prose">
            <div className="flex items-start gap-2.5">
              <Provenance kind="derived" />
              <div style={{ maxWidth: "70ch" }}>
                {dossier.executive.map((s, i) => (
                  <p key={i} className={i > 0 ? "mt-1.5" : ""}
                    style={{ fontSize: i === 0 ? LEAD : BODY, color: i === 0 ? INK.primary : INK.secondary, lineHeight: 1.65 }}>
                    {s}
                  </p>
                ))}
              </div>
            </div>
          </Section>

          {/* 2 · WHAT CHANGED — the delta section; the quiet answer at full quality */}
          <Section id="changed" title="What Changed" note="recorded theme-state deltas this cycle">
            <div className="flex items-start gap-2.5">
              <StatusChip s={ex.sections.delta} />
              <div className="min-w-0 flex-1">
                {ex.sections.delta.status === "available" && delta ? (
                  <div>
                    {delta.changes.map(c => (
                      <div key={c.theme_uid} className="flex items-baseline gap-3 py-1.5 flex-wrap"
                        style={{ borderBottom: `1px solid ${BORDER.hairline}` }}>
                        <span className="font-semibold" style={{ fontSize: BODY, color: INK.primary }}>{c.theme}</span>
                        <span className="tabular-nums font-bold" style={{ fontFamily: FONT_MONO, fontSize: BODY, color: c.momentum_delta > 0 ? GREEN : c.momentum_delta < 0 ? RED : INK.support }}>
                          {c.momentum_delta > 0 ? "+" : ""}{c.momentum_delta}
                        </span>
                        <span className="uppercase" style={{ fontSize: 10, letterSpacing: "0.06em", color: INK.whisper }}>{c.momentum_label}</span>
                        {c.material && (
                          <span className="uppercase font-bold ml-auto" style={{ fontSize: 8.5, letterSpacing: "0.08em", color: AMBER }}>
                            material · beyond ±{delta.deadband}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <EngineAbsence s={ex.sections.delta} />
                )}
              </div>
            </div>
          </Section>

          {/* 3 · WHY IT MATTERS — position in the model: theses, regime, involvement */}
          <Section id="why" title="Why It Matters" note="the event's recorded position in the model — not generated commentary">
            <div className="flex items-start gap-2.5">
              <StatusChip s={ex.sections.position} />
              <div className="min-w-0 flex-1">
                {position && position.themes.length > 0 ? (
                  <div>
                    {position.themes.map(t => (
                      <div key={t.uid} className="flex items-baseline gap-3 py-1.5 flex-wrap"
                        style={{ borderBottom: `1px solid ${BORDER.hairline}` }}>
                        <span className="font-semibold" style={{ fontSize: BODY, color: INK.primary }}>{t.name}</span>
                        <span className="tabular-nums font-bold" style={{ fontFamily: FONT_MONO, fontSize: 13, color: INK.primary }}>{t.confidence}</span>
                        <span className="uppercase" style={{ fontSize: 10, letterSpacing: "0.06em", color: INK.whisper }}>{t.momentum_label}</span>
                        <span className="uppercase ml-auto" style={{ fontSize: 8.5, letterSpacing: "0.08em", color: INK.whisper }}>{t.signal_quality}</span>
                      </div>
                    ))}
                    {position.regime && (
                      <p className="mt-2" style={{ fontSize: TYPE.xs, color: INK.whisper }}>
                        Regime context: <span style={{ color: INK.support }}>{position.regime.label}</span>
                        <span className="tabular-nums ml-2" style={{ fontFamily: FONT_MONO, fontSize: 8.5 }}>{position.regime.uid}</span>
                      </p>
                    )}
                  </div>
                ) : (
                  <EngineAbsence s={ex.sections.position} />
                )}
                {identity && identity.attribution.length > 0 && (
                  <div className="mt-3">
                    <p className="uppercase font-bold mb-1" style={{ fontSize: 9, letterSpacing: "0.1em", color: INK.whisper }}>
                      Companies — involvement stated, never inferred
                    </p>
                    <div className="flex items-baseline gap-x-4 gap-y-1 flex-wrap">
                      {identity.attribution.map(a => (
                        <span key={a.uid} className="flex items-baseline gap-1.5">
                          <Link href={`/intel/${encodeURIComponent(a.uid)}`} className="font-bold hover:underline tabular-nums"
                            style={{ fontFamily: FONT_MONO, fontSize: 12, color: a.class === "direct" ? ACCENT : INK.support }}>
                            {a.company}
                          </Link>
                          <span className="uppercase" style={{ fontSize: 8, letterSpacing: "0.06em", color: INK.whisper }}>
                            {a.class === "direct" ? "named" : (a.reason ?? a.class.replaceAll("_", " "))}
                          </span>
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </Section>

          {/* 4 · EVIDENCE — the record's basis, tiered, qualified marks explicit */}
          <Section id="evidence" title="Evidence"
            note={evidence ? `${evidence.corroboration_count} qualified of ${evidence.source_count} distinct sources · independence counted by source, not article` : undefined}>
            <div className="flex items-start gap-2.5">
              <StatusChip s={ex.sections.evidence} />
              <div className="min-w-0 flex-1">
                {evidence && evidence.items.length > 0 ? (
                  <div>
                    {evidence.items.map(e => (
                      <div key={e.url} className="flex items-baseline gap-2 py-1.5 flex-wrap"
                        style={{ borderBottom: `1px solid ${BORDER.hairline}` }}>
                        <span className="font-bold shrink-0" style={{ fontSize: TYPE.xs, color: e.qualified ? INK.secondary : INK.whisper }}>
                          {e.source}
                        </span>
                        <span className="uppercase shrink-0" style={{ fontSize: 8, letterSpacing: "0.06em", color: INK.whisper }}>
                          T{e.tier}{e.kind !== "news" ? ` · ${e.kind.replace("_", " ")}` : ""}{e.qualified ? "" : " · not corroborating"}
                        </span>
                        <a href={e.url} target="_blank" rel="noopener noreferrer" className="hover:underline min-w-0 truncate"
                          style={{ fontSize: 11.5, color: INK.support }}>
                          {e.title}
                        </a>
                        <span className="ml-auto tabular-nums shrink-0" style={{ fontFamily: FONT_MONO, fontSize: 8, color: INK.whisper }}>
                          {e.published ? timeAgo(e.published) : ""}
                        </span>
                      </div>
                    ))}
                    <p className="mt-2 tabular-nums" style={{ fontFamily: FONT_MONO, fontSize: 8.5, color: INK.whisper }}>
                      evidence refs: {evidence.evidence_refs.join(" · ")}
                    </p>
                  </div>
                ) : (
                  <EngineAbsence s={ex.sections.evidence} />
                )}
              </div>
            </div>
          </Section>

          {/* 5 · TRANSMISSION CHAIN — typed hops, every one a recorded edge or
              curated association, relationship UIDs preserved */}
          <Section id="transmission" title="Transmission Chain" note="every hop carries its relationship UID — nothing is invented between nodes">
            <div className="flex items-start gap-2.5">
              <StatusChip s={ex.sections.position} />
              <div className="min-w-0 flex-1">
                {position && position.chains.length > 0 ? (
                  <div>
                    {/* OP4.2: the typed chain stands alone — prose never
                        renders beside it; the two epistemologies don't mix. */}
                    {position.chains.map(c => (
                      <div key={c.theme_uid} className="mb-4">
                        <p className="uppercase font-bold mb-1" style={{ fontSize: 9, letterSpacing: "0.1em", color: INK.whisper }}>
                          via {c.theme}
                          {c.weakest_hop_confidence !== null && (
                            <span className="tabular-nums ml-2" style={{ fontFamily: FONT_MONO, letterSpacing: 0 }}>
                              weakest hop {Math.round(c.weakest_hop_confidence * 100)} — the chain is never stronger than this
                            </span>
                          )}
                        </p>
                        {c.hops.map((h, i) => <Hop key={h.rel_uid + i} hop={h} last={i === c.hops.length - 1} />)}
                      </div>
                    ))}
                  </div>
                ) : (() => {
                  // OP4.2 fallback ladder: the event's own typed chain (the
                  // strongest theme's, populated by build_explanations) →
                  // legacy prose tagged as unverified → the engine's honest
                  // absence note. Never both chain and prose.
                  const view = buildTransmissionView(ev.transmission_chain, ev.transmission);
                  if (view.kind === "chain") {
                    return (
                      <div>
                        <p className="uppercase font-bold mb-1" style={{ fontSize: 9, letterSpacing: "0.1em", color: INK.whisper }}>
                          event record chain — strongest linked theme
                          {view.weakestHopConfidence !== null && (
                            <span className="tabular-nums ml-2" style={{ fontFamily: FONT_MONO, letterSpacing: 0 }}>
                              weakest hop {Math.round(view.weakestHopConfidence * 100)} — the chain is never stronger than this
                            </span>
                          )}
                        </p>
                        {view.hops.map((h, i) => <Hop key={h.rel_uid + i} hop={h} last={i === view.hops.length - 1} />)}
                      </div>
                    );
                  }
                  if (view.kind === "prose") {
                    return (
                      <p className="flex items-baseline gap-2" style={{ fontSize: BODY, color: INK.support, lineHeight: 1.6 }}>
                        <span className="uppercase font-bold shrink-0 rounded px-1.5 py-px"
                          style={{ fontSize: 8, letterSpacing: "0.08em", color: AMBER, border: `1px solid ${BORDER.hairline}` }}>
                          unverified narrative
                        </span>
                        <span>{view.text}</span>
                      </p>
                    );
                  }
                  return <EngineAbsence s={ex.sections.position} />;
                })()}
              </div>
            </div>
          </Section>

          {/* 6 · COUNTERARGUMENTS — the symmetric search, verbatim */}
          <Section id="counter" title="Counterarguments" note="searched with the same machinery as support — absence is a coverage statement">
            <div className="flex items-start gap-2.5">
              <StatusChip s={ex.sections.counter} />
              <div className="min-w-0 flex-1">
                {counter && counter.items.length > 0 ? (
                  <div>
                    {counter.items.map((it, i) => (
                      <div key={i} className="py-2" style={{ borderBottom: `1px solid ${BORDER.hairline}` }}>
                        {it.kind === "recorded_pressure" ? (
                          <>
                            <p style={{ fontSize: BODY, color: INK.secondary, lineHeight: 1.6 }}>
                              <span className="font-semibold capitalize" style={{ color: RED }}>{it.source_label ?? uidLabel(it.source_uid ?? "")}</span>
                              {" "}pressures <span className="font-semibold">{it.theme}</span> on the recorded graph
                              {typeof it.confidence === "number" && <> (edge confidence {Math.round(it.confidence * 100)})</>}.
                            </p>
                            {it.rel_uid && (
                              <p className="mt-0.5 tabular-nums" style={{ fontFamily: FONT_MONO, fontSize: 8.5, color: INK.whisper }}>{it.rel_uid}</p>
                            )}
                          </>
                        ) : (
                          <p style={{ fontSize: BODY, color: INK.secondary, lineHeight: 1.6 }}>
                            <span className="font-semibold">{it.theme}</span> — the thesis this event feeds — is itself weakening on the record:
                            {" "}<span className="tabular-nums font-bold" style={{ fontFamily: FONT_MONO, color: RED }}>{it.momentum_delta}</span>
                            {" "}this cycle ({it.momentum_label}).
                          </p>
                        )}
                      </div>
                    ))}
                    <p className="mt-2" style={{ fontSize: TYPE.xs, color: INK.whisper }}>{ex.sections.counter.note}</p>
                  </div>
                ) : (
                  <EngineAbsence s={ex.sections.counter} />
                )}
              </div>
            </div>
          </Section>

          {/* 7 · CONFIDENCE — a band and its decomposition, never a bare number */}
          <Section id="confidence" title="Confidence" note="decomposed — a figure that cannot explain itself is not printed">
            <div className="flex items-start gap-2.5">
              <StatusChip s={ex.sections.confidence} />
              <div className="min-w-0 flex-1">
                {confidence ? (
                  <div>
                    <p className="font-black uppercase" style={{ fontSize: 18, letterSpacing: "0.06em", color: BAND_COLOR[confidence.band] ?? INK.primary }}>
                      {confidence.band.replaceAll("_", " ")}
                    </p>
                    {confidence.cap && (
                      <p className="mt-1" style={{ fontSize: BODY, color: RED, lineHeight: 1.55, maxWidth: "70ch" }}>
                        {confidence.cap.reason}
                      </p>
                    )}
                    <div className="mt-2">
                      {confidence.factors.map(f => (
                        <div key={f.factor} className="flex items-baseline gap-3 py-1 flex-wrap" style={{ borderBottom: `1px solid ${BORDER.hairline}` }}>
                          <span className="uppercase font-bold shrink-0" style={{ fontSize: 9, letterSpacing: "0.08em", color: INK.support }}>
                            {f.factor.replaceAll("_", " ")}
                          </span>
                          <span className="tabular-nums font-bold shrink-0" style={{ fontFamily: FONT_MONO, fontSize: 12, color: INK.primary }}>
                            {f.value === null ? "—" : String(f.value)}
                          </span>
                          <span style={{ fontSize: 10.5, color: INK.whisper }}>{f.detail}</span>
                        </div>
                      ))}
                    </div>
                    <p className="mt-2" style={{ fontSize: TYPE.xs, color: INK.whisper }}>
                      No probability is issued — no decomposable canonical method exists. Predictions are never inputs.
                    </p>
                  </div>
                ) : (
                  <EngineAbsence s={ex.sections.confidence} />
                )}
              </div>
            </div>
          </Section>

          {/* 8 · WHAT TO WATCH NEXT — recorded thresholds and lane rules only,
              plus the engine's reserved sections rendered as honest gates */}
          <Section id="watch" title="What to Watch Next" note="recorded conditions only — nothing speculative, gates stated verbatim">
            {dossier.watch.length === 0 ? (
              <Absence>No recorded forward condition names this event.</Absence>
            ) : (
              <div>
                {dossier.watch.map((w, i) => (
                  <div key={i} className="py-2" style={{ borderBottom: `1px solid ${BORDER.hairline}` }}>
                    <p style={{ fontSize: BODY, color: w.gated ? INK.support : INK.secondary, lineHeight: 1.6, maxWidth: "72ch" }}>
                      {w.text}
                    </p>
                    <p className="mt-0.5 uppercase font-bold" style={{ fontSize: 9, letterSpacing: "0.08em", color: INK.whisper }}>
                      {w.gated ? "gated · " : ""}{w.source}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </Section>
        </>
      )}

      <footer className="mt-10 pt-4 flex items-baseline gap-4 flex-wrap"
        style={{ borderTop: `1px solid ${BORDER.hairline}`, fontSize: TYPE.xs, color: INK.whisper }}>
        <span className="tabular-nums" style={{ fontFamily: FONT_MONO }}>{dossier.uid}</span>
        {ex && (
          <span className="tabular-nums" style={{ fontFamily: FONT_MONO }}>
            {ex.engine_version} · {ex.content_hash.slice(0, 12)}
          </span>
        )}
        <span>Every section above is the canonical Explanation, rendered — reasoning is consumed here, never computed.</span>
        <Link href="/feed" className="ml-auto hover:opacity-80 font-bold uppercase"
          style={{ letterSpacing: "0.08em", color: ACCENT }}>← Feed</Link>
      </footer>
    </div>
  );
}
