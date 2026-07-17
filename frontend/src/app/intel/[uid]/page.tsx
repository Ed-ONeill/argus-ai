"use client";

/**
 * app/intel/[uid]/page.tsx — the canonical Entity Intelligence route (EI1).
 *
 * ARGUS_ENTITY_INTELLIGENCE_V1 §2.3: the uid IS the address. EI1 admits the
 * company kind; every other valid uid renders the designed not-covered state
 * (admission requires identity + resolver + producing engine — stated, not
 * stubbed), and malformed uids render the invalid state. Never an empty shell,
 * never a 404 that pretends the concept doesn't exist.
 */

import { useParams } from "next/navigation";
import Link from "next/link";
import CompanyDossier from "@/components/intel/CompanyDossier";
import EventDossier from "@/components/intel/EventDossier";
import { admitUid } from "@/lib/intel/dossier";
import { TYPE, INK, BORDER, FONT_MONO } from "@/lib/network/tokens";

const RESERVED_COPY: Record<string, string> = {
  theme: "The theme kind lands with its own migration sprint — the Themes page is its current home.",
  industry: "The industry kind lands with its own migration sprint — the Industries page is its current home.",
  narrative: "The narrative kind lands with its own migration sprint — the Network is its current home.",
  driver: "The driver kind is admitted to the model but has no file page yet.",
  regime: "The regime kind is admitted to the model but has no file page yet — Markets carries the live regime.",
};

function State({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="relative" style={{ background: "#0A0F1C", minHeight: "calc(100vh - 3.5rem)" }}>
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-16">
        <h1 className="font-black tracking-tight" style={{ fontSize: 22, color: INK.primary }}>{title}</h1>
        <div className="mt-3" style={{ fontSize: TYPE.md, color: INK.support, lineHeight: 1.6 }}>{children}</div>
        <Link href="/feed" className="inline-block mt-6 font-bold uppercase hover:opacity-80"
          style={{ fontSize: TYPE.xs, letterSpacing: "0.1em", color: "#7cc7d8" }}>← Feed</Link>
      </div>
    </div>
  );
}

export default function IntelPage() {
  const params = useParams<{ uid: string }>();
  const raw = decodeURIComponent(String(params?.uid ?? ""));
  const admission = admitUid(raw);

  if (admission.state === "company") {
    return (
      <div className="relative" style={{ background: "#0A0F1C", minHeight: "calc(100vh - 3.5rem)" }}>
        <CompanyDossier ticker={admission.ticker} />
      </div>
    );
  }

  // IR-1: the event RECORD — the research note over one Market Event,
  // consuming the canonical backend Explanation.
  if (admission.state === "event") {
    return (
      <div className="relative" style={{ background: "#0A0F1C", minHeight: "calc(100vh - 3.5rem)" }}>
        <EventDossier clusterId={admission.clusterId} />
      </div>
    );
  }

  if (admission.state === "reserved") {
    return (
      <State title="Not covered as a file yet">
        <p>
          <span className="tabular-nums" style={{ fontFamily: FONT_MONO, color: INK.secondary }}>{raw}</span>
          {" "}is a valid identity, but the <b style={{ color: INK.secondary }}>{admission.kind}</b> kind has no
          Entity Intelligence file in this release.
        </p>
        <p className="mt-2">
          {RESERVED_COPY[admission.kind] ??
            "A kind is admitted only with an identity scheme, a resolver, and a producing engine — coverage grows by admission, not by guess."}
        </p>
        <p className="mt-2 pt-2" style={{ borderTop: `1px solid ${BORDER.hairline}`, fontSize: TYPE.xs, color: INK.whisper }}>
          ARGUS_ENTITY_INTELLIGENCE_V1 §1.3 — reserved means absent, not stubbed.
        </p>
      </State>
    );
  }

  return (
    <State title="Not a canonical identity">
      <p>
        <span className="tabular-nums" style={{ fontFamily: FONT_MONO, color: INK.secondary }}>{raw || "(empty)"}</span>
        {" "}does not parse as a canonical uid (<span style={{ fontFamily: FONT_MONO }}>type:namespace:key</span>).
        Argus never guesses an identity from a malformed address.
      </p>
      <p className="mt-2">
        Company files live at <span style={{ fontFamily: FONT_MONO, color: INK.secondary }}>/company/&lt;TICKER&gt;</span>.
      </p>
    </State>
  );
}
