// app/privacy/page.tsx — Privacy Policy (public). LAUNCH-DRAFT: every statement is grounded in
// the application's actual behavior; items that require founder/legal confirmation are shown as
// conspicuous [ ... TO BE CONFIRMED] / [LEGAL REVIEW] placeholders rather than fabricated claims.

import Link from "next/link";

export const metadata = { title: "Privacy Policy · Argus" };

function H({ children }: { children: React.ReactNode }) {
  return <h2 className="mt-8 mb-2 text-[13px] font-semibold uppercase tracking-[0.14em] text-ink">{children}</h2>;
}
function P({ children }: { children: React.ReactNode }) {
  return <p className="mb-3 max-w-[70ch] text-[13.5px] leading-relaxed text-ink-secondary">{children}</p>;
}

export default function PrivacyPage() {
  return (
    <div className="brief-dark min-h-[calc(100vh-3.5rem)] bg-canvas text-ink">
      <div className="mx-auto max-w-3xl px-5 pb-20 pt-8 sm:px-8">
        <Link href="/" className="text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-faint hover:text-accent">&larr; Argus</Link>
        <h1 className="mt-4 text-[26px] font-semibold tracking-tight text-ink">Privacy Policy</h1>
        <p className="mt-1 text-[11px] text-ink-faint">Last updated: August 9, 2026</p>

        <H>Who we are</H>
        <P>Argus (&ldquo;Argus&rdquo;, &ldquo;we&rdquo;, &ldquo;us&rdquo;) operates the Argus market-intelligence service. This policy explains how we handle data when you use it.</P>

        <H>Information we store</H>
        <P>&bull; <b>Account:</b> your email address and any name you provide at sign-up.</P>
        <P>&bull; <b>Your research:</b> items you save, your watchlist, and your intelligence preferences (followed sectors, themes, and asset classes; role; region).</P>
        <P>&bull; <b>Device-local data:</b> some preferences and caches are stored only in your browser&rsquo;s local storage on the device you use.</P>

        <H>How you sign in</H>
        <P>Authentication uses a session stored in a secure browser cookie. We do not keep your session in browser local storage.</P>

        <H>AI processing</H>
        <P>The optional &ldquo;Analyze&rdquo; feature sends the title and a short snippet of a public news item to OpenAI&rsquo;s API to produce a brief summary &mdash; public news-story content, not text you author. For this feature, Argus does not intentionally include your Argus account information in the model request.</P>

        <H>Market-data sources</H>
        <P>Argus retrieves market and reference data from third-party providers, including Yahoo Finance, EODHD, Financial Modeling Prep, the U.S. SEC EDGAR system, and the U.S. Federal Reserve (FRED). We request data such as ticker symbols and identifiers from these providers; we do not send them your personal information.</P>

        <H>Analytics and tracking</H>
        <P>Argus does not use third-party analytics, advertising, or tracking technologies. We keep standard server logs to operate and secure the service; these are not used to build advertising profiles.</P>

        <H>Service providers</H>
        <P>The service providers Argus currently uses are Supabase for authentication and database infrastructure, Railway for application hosting/infrastructure, and OpenAI for the &ldquo;Analyze&rdquo; processing described above.</P>

        <H>Data retention</H>
        <P>Your active account data is retained while your account exists and is deleted when you permanently delete your account (below). Residual copies may persist for a limited time in our infrastructure providers&rsquo; encrypted backups under their retention practices, and are not removed immediately.</P>

        <H>Your choices and account deletion</H>
        <P>You can update your profile and preferences in Settings, and permanently delete your account at any time from <b>Settings &rarr; Danger Zone</b>. Deletion permanently removes your authentication identity and your profile, saved items, watchlist, and preferences, and clears Argus&rsquo;s locally-stored data on the device you use to delete. Local data on other devices is cleared only when you sign out or clear that browser. Deletion does not immediately remove data from encrypted infrastructure backups (see retention).</P>

        <H>Changes and contact</H>
        <P>We may update this policy; the &ldquo;last updated&rdquo; date reflects the latest version. Questions: <a href="mailto:privacy@argus-market-intelligence.com" className="text-accent hover:underline">privacy@argus-market-intelligence.com</a></P>

        <p className="mt-10 border-t border-edge-subtle/50 pt-4 text-[11px] text-ink-faint">
          See also the <Link href="/terms" className="text-accent hover:underline">Terms of Service</Link>.
        </p>
      </div>
    </div>
  );
}
