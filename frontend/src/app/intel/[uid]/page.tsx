"use client";

/**
 * app/intel/[uid]/page.tsx — the canonical Entity route. The company kind renders the
 * Law-10 company page (Surface #2B); the event kind renders its record; other identities
 * get plain, honest not-available states. No engine vocabulary, no internal spec strings.
 */

import { useParams } from "next/navigation";
import type { ReactNode } from "react";
import Link from "next/link";
import CompanyPage from "@/components/intel/CompanyPage";
import EventPage from "@/components/intel/EventPage";
import { admitUid } from "@/lib/intel/dossier";

function State({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="brief-dark min-h-[calc(100vh-3.5rem)] bg-canvas text-ink">
      <div className="mx-auto max-w-3xl px-5 py-16 sm:px-8">
        <h1 className="text-[22px] font-semibold tracking-tight text-ink">{title}</h1>
        <div className="mt-3 max-w-[60ch] text-[13.5px] leading-relaxed text-ink-secondary">{children}</div>
        <Link href="/feed" className="mt-6 inline-block text-[11px] font-semibold uppercase tracking-[0.1em] text-accent">&larr; Feed</Link>
      </div>
    </div>
  );
}

export default function IntelPage() {
  const params = useParams<{ uid: string }>();
  const raw = decodeURIComponent(String(params?.uid ?? ""));
  const admission = admitUid(raw);

  if (admission.state === "company") return <CompanyPage ticker={admission.ticker} />;

  if (admission.state === "event") return <EventPage clusterId={admission.clusterId} />;

  if (admission.state === "reserved") {
    return (
      <State title="Not a page yet">
        <p>This isn&rsquo;t a company. Argus covers it elsewhere for now. Look for it in the Feed or Markets.</p>
      </State>
    );
  }

  return (
    <State title="Page not found">
      <p>That address isn&rsquo;t a company we can open. Company pages live at{" "}
        <span className="font-mono text-ink-secondary">/company/&lt;TICKER&gt;</span>.</p>
    </State>
  );
}
