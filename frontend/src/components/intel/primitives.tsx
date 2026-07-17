"use client";

/**
 * components/intel/primitives.tsx — the dossier grammar's shared form (EI1/IR-1).
 *
 * One set of section primitives for every Entity Intelligence file and record,
 * so a company file and an event record are identically shaped and can never
 * drift typographically. Extracted verbatim from CompanyDossier (EI1); no new
 * design language.
 */

import { TYPE, INK, BORDER, FONT_MONO } from "@/lib/network/tokens";

// Body type for the dossier: primary intelligence reads at document sizes;
// the micro ramp stays reserved for metadata (EI1.1 legibility law).
export const BODY = 13.5;
export const LEAD = 15.5;

export const CLASS_LABEL: Record<string, string> = {
  macro: "Macro", policy: "Policy", earnings: "Earnings", ma: "M&A",
  market_event: "Market", single_name: "Company", price_echo: "Price Echo",
};

export function Section({ id, title, note, children }: {
  id: string; title: string; note?: string; children: React.ReactNode;
}) {
  return (
    <section id={id} className="pt-6 mt-6" style={{ borderTop: `1px solid ${BORDER.hairline}` }}>
      <div className="flex items-baseline gap-3 mb-3 flex-wrap">
        <h2 className="font-bold uppercase" style={{ fontSize: 11, letterSpacing: "0.14em", color: INK.secondary }}>
          {title}
        </h2>
        {note && <span style={{ fontSize: TYPE.xs, color: INK.whisper }}>{note}</span>}
      </div>
      {children}
    </section>
  );
}

/** Designed absence — the honest state rendered at full quality (4B voice). */
export function Absence({ children }: { children: React.ReactNode }) {
  return <p style={{ fontSize: BODY, color: INK.support, lineHeight: 1.6, maxWidth: "62ch" }}>{children}</p>;
}

export function Provenance({ kind }: { kind: "recorded" | "derived" }) {
  return (
    <span className="uppercase font-bold rounded px-1.5 py-px shrink-0"
      style={{ fontSize: 8, letterSpacing: "0.08em",
               color: kind === "recorded" ? "#7cc7d8" : INK.whisper,
               border: `1px solid ${kind === "recorded" ? "rgba(82,176,200,0.35)" : BORDER.hairline}` }}>
      {kind}
    </span>
  );
}

export function Fig({ value, label, href }: { value: string | number; label: string; href?: string }) {
  const body = (
    <span className="flex items-baseline gap-1.5">
      <span className="font-bold tabular-nums" style={{ fontFamily: FONT_MONO, fontSize: TYPE.lg, color: INK.primary }}>{value}</span>
      <span className="uppercase" style={{ fontSize: TYPE.xs, letterSpacing: "0.08em", color: INK.whisper }}>{label}</span>
    </span>
  );
  return href ? <a href={href} className="hover:opacity-80">{body}</a> : body;
}
