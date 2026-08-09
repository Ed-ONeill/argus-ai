// app/terms/page.tsx — Terms of Service (public). LAUNCH-DRAFT: substantive product terms are
// stated now; jurisdiction-sensitive clauses (liability, indemnity, arbitration/class waiver,
// governing law, venue) are conspicuous [LEGAL REVIEW] placeholders rather than fabricated text.

import Link from "next/link";

export const metadata = { title: "Terms of Service · Argus" };

function H({ children }: { children: React.ReactNode }) {
  return <h2 className="mt-8 mb-2 text-[13px] font-semibold uppercase tracking-[0.14em] text-ink">{children}</h2>;
}
function P({ children }: { children: React.ReactNode }) {
  return <p className="mb-3 max-w-[70ch] text-[13.5px] leading-relaxed text-ink-secondary">{children}</p>;
}
const REVIEW = () => <span className="rounded bg-amber-400/10 px-1 text-amber-300/90">[LEGAL REVIEW]</span>;

export default function TermsPage() {
  return (
    <div className="brief-dark min-h-[calc(100vh-3.5rem)] bg-canvas text-ink">
      <div className="mx-auto max-w-3xl px-5 pb-20 pt-8 sm:px-8">
        <Link href="/" className="text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-faint hover:text-accent">&larr; Argus</Link>
        <h1 className="mt-4 text-[26px] font-semibold tracking-tight text-ink">Terms of Service</h1>
        <p className="mt-1 text-[11px] text-ink-faint">Last updated: August 9, 2026</p>

        <div className="mt-4 rounded-lg border border-amber-400/25 bg-amber-400/[0.06] px-4 py-3">
          <p className="text-[12px] leading-relaxed text-amber-200/80">
            Launch draft. The clauses marked [LEGAL REVIEW] are pending review by counsel and are not final legal terms.
          </p>
        </div>

        <H>Agreement</H>
        <P>These Terms govern your use of the Argus market-intelligence service, operated by Argus. By using Argus you agree to them.</P>

        <H>Informational use only &mdash; not investment advice</H>
        <P>Argus is an informational market-intelligence tool. It is <b>not investment advice</b>, and Argus is <b>not a broker-dealer, investment adviser, or fiduciary</b>. Nothing in Argus is a recommendation to buy, sell, or hold any security or to pursue any strategy. You are solely responsible for your own decisions and should consult a qualified professional before acting.</P>

        <H>Market data &mdash; limitations</H>
        <P>Market and reference data may be delayed or end-of-day, is provided &ldquo;as is,&rdquo; and may be incomplete, inaccurate, or unavailable. Do not rely on it for time-sensitive trading decisions.</P>

        <H>Availability</H>
        <P>The service is provided on an &ldquo;as available&rdquo; basis. We may add, change, suspend, or discontinue features at any time, and we do not guarantee uninterrupted availability.</P>

        <H>Acceptable use</H>
        <P>You agree not to misuse the service &mdash; including disrupting or overloading it, scraping or harvesting at scale, reverse-engineering it, attempting unauthorized access, or using it for unlawful purposes.</P>

        <H>Your account</H>
        <P>You are responsible for your account, your credentials, and activity under your account. Keep your login secure. You may delete your account at any time from Settings.</P>

        <H>Intellectual property</H>
        <P>The Argus application, its design, and its original content are owned by Argus and its licensors. Third-party data and content remain the property of their respective owners and are used subject to their terms.</P>

        <H>Termination</H>
        <P>You may stop using Argus and delete your account at any time. We may suspend or terminate access for violation of these Terms or to protect the service or other users.</P>

        <H>Disclaimers and limitation of liability</H>
        <P>The service and all data are provided &ldquo;as is&rdquo; and &ldquo;as available,&rdquo; without warranties of any kind to the extent permitted by law. <REVIEW /> &mdash; the warranty disclaimer and limitation-of-liability terms will be finalized by counsel.</P>

        <H>Indemnification</H>
        <P><REVIEW /></P>

        <H>Dispute resolution</H>
        <P>Arbitration and class-action-waiver terms, if any. <REVIEW /></P>

        <H>Governing law and venue</H>
        <P><REVIEW /></P>

        <H>Changes and contact</H>
        <P>We may update these Terms; the &ldquo;last updated&rdquo; date reflects the latest version, and continued use means acceptance. Questions: <a href="mailto:legal@argus-market-intelligence.com" className="text-accent hover:underline">legal@argus-market-intelligence.com</a></P>

        <p className="mt-10 border-t border-edge-subtle/50 pt-4 text-[11px] text-ink-faint">
          See also the <Link href="/privacy" className="text-accent hover:underline">Privacy Policy</Link>.
        </p>
      </div>
    </div>
  );
}
