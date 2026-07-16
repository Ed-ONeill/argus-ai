"use client";

/**
 * components/network/NetworkInspector.tsx — the Intelligence Inspector (M4.3A,
 * M5.1 typography pass).
 *
 * A professional intelligence dossier in seven stacked sections. M5.1: every
 * size comes from the shared ramp (lib/network/tokens), every ink from the
 * four-step ink system, every spacing value from the scale. The column reads
 * editorially — measured leading, whispering metadata, dominant figures —
 * rather than as dashboard chrome. Pure rendering; computes nothing.
 */

import type { DossierVM, ReasoningRow } from "@/lib/network/inspector";
import { TYPE, SPACE, INK, FONT_MONO } from "@/lib/network/tokens";

const S = {
  teal: "#2dd4bf",
  red: "#f87171",
  amber: "#fbbf24",
  accent: "#7cc7d8",
};

const dirColor = (d?: string) => d === "bullish" ? S.teal : d === "bearish" ? S.red : INK.support;

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <p className="font-bold uppercase"
      style={{ fontSize: TYPE.xs, letterSpacing: "0.12em", color: INK.whisper, marginBottom: SPACE.s2 }}>
      {children}
    </p>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ paddingTop: SPACE.s3, borderTop: `1px solid rgba(148,163,184,0.10)` }}>
      <Eyebrow>{label}</Eyebrow>
      {children}
    </div>
  );
}

const ROW_GLYPH: Record<ReasoningRow["kind"], string> = {
  driver: "◆", evidence: "▤", memory: "◷", structure: "▣",
};

const STATUS_GLYPH: Record<string, { glyph: string; color: string }> = {
  active: { glyph: "□", color: INK.support },
  resolved: { glyph: "✓", color: S.teal },
  invalidated: { glyph: "–", color: S.amber },
  expired_unresolved: { glyph: "–", color: S.amber },
  withdrawn_due_to_data_error: { glyph: "–", color: S.amber },
};

export default function NetworkInspector({ vm, onNavigate }: {
  vm: DossierVM;
  /** Chain-hop navigation back into the canvas (graph = navigation). */
  onNavigate?: (nodeId: string) => void;
}) {
  const id = vm.identity;
  return (
    <div className="flex flex-col" style={{ gap: SPACE.s4 }}>
      {/* 1 · identity — the figure is the boldest ink in the column */}
      <div>
        <p className="font-black uppercase"
          style={{ fontSize: TYPE.xs, letterSpacing: "0.14em", color: S.accent }}>
          {id.eyebrow}
        </p>
        <p className="font-bold" style={{ fontSize: TYPE.lg, lineHeight: 1.25, color: INK.primary, marginTop: SPACE.s1 }}>
          {id.title}
        </p>
        <div className="flex items-baseline" style={{ gap: SPACE.s2, marginTop: SPACE.s2 }}>
          {id.figure && (
            <span className="font-black tabular-nums leading-none"
              style={{ fontSize: TYPE.xxl, fontFamily: FONT_MONO, color: INK.primary }}>
              {id.figure.value}
              <span className="font-bold" style={{ fontSize: TYPE.xs, letterSpacing: "0.1em", color: INK.whisper, marginLeft: SPACE.s1 }}>
                {id.figure.label}
              </span>
            </span>
          )}
          {id.delta !== null && (
            <span className="font-bold tabular-nums"
              style={{ fontSize: TYPE.sm, fontFamily: FONT_MONO, color: id.delta > 0 ? S.teal : S.red }}>
              {id.delta > 0 ? "▲" : "▼"}{Math.abs(id.delta)} today
            </span>
          )}
          {id.stateLine && (
            <span className="uppercase" style={{ fontSize: TYPE.xs, color: INK.support }}>{id.stateLine}</span>
          )}
        </div>
        {id.archiveLine && (
          <p style={{ fontSize: TYPE.xs, color: INK.whisper, marginTop: SPACE.s1 }}>{id.archiveLine}</p>
        )}
        {vm.lead && (
          <p style={{ fontSize: TYPE.md, lineHeight: 1.55, color: INK.secondary, marginTop: SPACE.s2, maxWidth: "44ch" }}>
            {vm.lead}
          </p>
        )}
      </div>

      {/* 2 · why Argus believes this */}
      {vm.reasoning.length > 0 && (
        <Section label="Why Argus believes this">
          <div className="flex flex-col" style={{ gap: SPACE.s1 }}>
            {vm.reasoning.map((r, i) => (
              <div key={i} className="flex items-start" style={{ gap: SPACE.s2 }}>
                <span className="shrink-0" style={{ fontSize: TYPE.xs, color: INK.whisper, marginTop: 1 }}>{ROW_GLYPH[r.kind]}</span>
                <p style={{ fontSize: TYPE.sm, lineHeight: 1.45, color: INK.secondary }}>{r.text}</p>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* 3 · transmission (interactive causal flow) */}
      {vm.chain.length > 1 && (
        <Section label="Transmission">
          <div className="flex flex-col" style={{ gap: 2 }}>
            {vm.chain.map((h, i) => (
              <div key={h.id} className="flex items-center" style={{ gap: SPACE.s2 }}>
                <span className="w-3 text-center" style={{ fontSize: TYPE.xs, color: INK.whisper }}>
                  {i === 0 ? "◆" : "└"}
                </span>
                {h.relationship && (
                  <span className="font-bold uppercase"
                    style={{ fontSize: TYPE.xs, letterSpacing: "0.06em", fontFamily: FONT_MONO, color: INK.whisper }}>
                    {h.relationship.replace("_", " ")} →
                  </span>
                )}
                <button
                  onClick={onNavigate ? () => onNavigate(h.id) : undefined}
                  disabled={!onNavigate}
                  className="font-semibold text-left truncate transition-colors enabled:hover:underline"
                  style={{ fontSize: TYPE.sm, color: onNavigate ? INK.primary : INK.secondary }}>
                  {h.label}
                </button>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* 4 · market exposure */}
      {vm.exposure && (vm.exposure.industries.length > 0 || vm.exposure.companies.length > 0) && (
        <Section label="Market exposure">
          {vm.exposure.industries.length > 0 && (
            <div className="flex flex-wrap" style={{ gap: SPACE.s1, marginBottom: SPACE.s1 }}>
              {vm.exposure.industries.map(x => (
                <button key={x.label} onClick={x.id && onNavigate ? () => onNavigate(x.id!) : undefined}
                  className="font-semibold rounded border transition-colors enabled:hover:bg-white/5"
                  style={{ fontSize: TYPE.xs, padding: `2px ${SPACE.s2}px`, color: dirColor(x.direction), borderColor: "rgba(148,163,184,0.2)" }}>
                  {x.label}{x.direction === "bearish" ? " ▼" : x.direction === "bullish" ? " ▲" : ""}
                </button>
              ))}
            </div>
          )}
          {vm.exposure.companies.length > 0 && (
            <div className="flex flex-wrap" style={{ gap: SPACE.s1 }}>
              {vm.exposure.companies.map(x => (
                <button key={x.label} onClick={x.id && onNavigate ? () => onNavigate(x.id!) : undefined}
                  className="font-bold rounded transition-colors enabled:hover:bg-white/10 tabular-nums"
                  style={{ fontSize: TYPE.xs, fontFamily: FONT_MONO, padding: `2px ${SPACE.s2}px`,
                           background: "rgba(148,163,184,0.08)", color: dirColor(x.direction) }}>
                  {x.label}
                </button>
              ))}
            </div>
          )}
        </Section>
      )}

      {/* 5 · institutional memory */}
      <Section label="Institutional memory">
        {(vm.memory.firstSeen || vm.memory.sessions !== null) && (
          <p className="tabular-nums" style={{ fontSize: TYPE.sm, color: INK.secondary }}>
            {vm.memory.sessions !== null && <>{vm.memory.sessions} sessions tracked</>}
            {vm.memory.peak !== null && vm.memory.trough !== null && (
              <> · conviction {vm.memory.trough}–{vm.memory.peak} range</>
            )}
          </p>
        )}
        <p style={{ fontSize: TYPE.xs, lineHeight: 1.45, color: vm.memory.state === "ok" ? INK.support : INK.whisper, marginTop: 2 }}>
          {vm.memory.maturityLine}
        </p>
      </Section>

      {/* 6 · prediction ledger */}
      <Section label="Prediction ledger">
        <p className="tabular-nums" style={{ fontSize: TYPE.sm, fontFamily: FONT_MONO,
             color: vm.ledger.state === "active" ? INK.secondary : INK.whisper }}>
          {vm.ledger.line}
        </p>
        {vm.ledger.items.length > 0 && (
          <div className="flex flex-col" style={{ gap: SPACE.s1, marginTop: SPACE.s1 }}>
            {vm.ledger.items.map((p, i) => {
              const st = STATUS_GLYPH[p.status] ?? STATUS_GLYPH.active;
              return (
                <div key={i} className="flex items-start" style={{ gap: SPACE.s2 }}>
                  <span className="shrink-0 font-bold" style={{ fontSize: TYPE.xs, color: st.color, marginTop: 1 }}>{st.glyph}</span>
                  <p style={{ fontSize: TYPE.sm, lineHeight: 1.45, color: INK.secondary }}>{p.statement}</p>
                </div>
              );
            })}
          </div>
        )}
        {vm.ledger.gateNote && (
          <p style={{ fontSize: TYPE.xs, color: S.amber, marginTop: SPACE.s1 }}>{vm.ledger.gateNote}</p>
        )}
      </Section>

      {/* 7 · watch conditions / falsifiers — a dossier is not finished without them */}
      {vm.watch.length > 0 && (
        <Section label="What would change this view">
          <div className="flex flex-col" style={{ gap: SPACE.s1 }}>
            {vm.watch.map((w, i) => (
              <p key={i} style={{ fontSize: TYPE.sm, lineHeight: 1.45, color: INK.secondary }}>
                <span style={{ color: S.red }}>▼</span> {w}
              </p>
            ))}
          </div>
        </Section>
      )}
    </div>
  );
}
