// platform/config.ts — the SERVER-ONLY configuration boundary (DX3 §1).
//
// Provider keys are read from non-public env vars (never NEXT_PUBLIC_*), so Next.js
// cannot bundle them into client code. A runtime guard additionally refuses any
// browser-context access — defense in depth for key secrecy. This module must be
// imported only by server routes / adapters, never by a client component.

function assertServer(what: string): void {
  if (typeof window !== "undefined") {
    throw new Error(`${what} is server-only and must never be accessed in the browser`);
  }
}

import type { DataDomain } from "./domain";

// Per-domain entitlement — the ONLY domains the current EODHD subscription is licensed
// to call. Plan: "EOD Historical Data — All World" ⇒ End-of-Day only. Every other
// domain stays unentitled (adapter returns skipped → honest absence) until the plan is
// upgraded and DX authorizes the specific endpoint.
export const EODHD_ENTITLED_DOMAINS: DataDomain[] = ["historical_prices"];

export interface EodhdConfig {
  baseUrl: string;
  /** Present server-side only; never serialized into a response or observation. */
  apiToken: string;
  configured: boolean;
  entitledDomains: DataDomain[];
}

export function eodhdConfig(): EodhdConfig {
  assertServer("EODHD configuration");
  const apiToken = process.env.EODHD_API_KEY ?? "";
  return {
    baseUrl: "https://eodhd.com/api",
    apiToken,
    configured: apiToken.length > 0,
    entitledDomains: EODHD_ENTITLED_DOMAINS,
  };
}
