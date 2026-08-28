/**
 * lib/secIdentity.ts — the canonical SEC fair-access identity (RC2-N4).
 *
 * SEC requires every automated caller to identify itself with a real, monitored
 * contact address. Before this module the tree carried FOUR independently
 * constructed identities across THREE domains:
 *
 *   app/feeds.py                        "Argus-AI/1.0 (contact: research@argus.example)"
 *   app/api/ipo-pipeline/route.ts       "Argus Intelligence research@argusintel.com"
 *   lib/dataAdapters/sec/index.ts       "Argus Research argus-data@example.com"
 *   scripts/refresh_sec_tickers.py      its own literal
 *
 * `argus.example` and `example.com` are RFC 2606 reserved and can never be a
 * valid fair-access contact.
 *
 * The contact now comes from ARGUS_SEC_CONTACT, and there is deliberately NO
 * default. Backend Python and these Next route handlers cannot import one shared
 * constant, so both runtimes read the SAME environment variable and build the
 * SAME string; equality is pinned by tests on each side.
 *
 * Server-side only. `process.env.ARGUS_SEC_CONTACT` is not a NEXT_PUBLIC_
 * variable, so a browser cannot read it — which is correct: no SEC request
 * should originate from a browser, and if one tried it would decline rather than
 * send a false identity.
 */

/** One application identity across every SEC caller, in both runtimes. */
export const SEC_APP_IDENTITY = "Argus Market Intelligence";

/** The configured contact, or "" when unset. Never defaulted. */
export function secContact(): string {
  const proc = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process;
  return (proc?.env?.ARGUS_SEC_CONTACT ?? "").trim();
}

/**
 * The canonical SEC User-Agent, or null when no real contact is configured.
 *
 * Callers must DECLINE the request on null. Sending a fabricated identity to SEC
 * is worse than fetching nothing — the contact is the whole point of the header,
 * and a placeholder actively misrepresents who is calling.
 */
export function secUserAgent(): string | null {
  const contact = secContact();
  return contact ? `${SEC_APP_IDENTITY} ${contact}` : null;
}

/** Thrown by callers that cannot degrade gracefully. */
export class SecContactMissingError extends Error {
  constructor() {
    super("ARGUS_SEC_CONTACT is not set; refusing to send a SEC request without a real fair-access contact.");
    this.name = "SecContactMissingError";
  }
}

/** The canonical UA, or throw. For callers whose pipeline already tolerates throws. */
export function requireSecUserAgent(): string {
  const ua = secUserAgent();
  if (!ua) throw new SecContactMissingError();
  return ua;
}
