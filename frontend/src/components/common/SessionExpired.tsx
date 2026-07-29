"use client";

import { LogIn } from "lucide-react";

/**
 * Shared "resolved signed-out / session-expired" state for protected pages.
 * Rendered when a hook reports isUnauthorized (resolved no-session or an active
 * session invalidation) — so a resolved unauthenticated state shows a sign-in
 * action instead of a permanent skeleton. The global definitive-401 handler
 * also routes to /auth; this offers a direct action while that completes.
 */
export function SessionExpired({ label = "Sign in to continue" }: { label?: string }) {
  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-24 text-center">
      <LogIn size={30} className="mx-auto mb-3 text-ink-muted opacity-40" />
      <h1 className="text-base font-medium text-ink mb-1.5">Your session has expired</h1>
      <p className="text-sm text-ink-secondary mb-5">{label}</p>
      <a
        href="/auth"
        className="inline-flex items-center gap-2 px-4 py-2 rounded-md text-xs font-semibold tracking-wide text-white"
        style={{ background: "#2563EB" }}
      >
        <LogIn size={13} /> SIGN IN
      </a>
    </div>
  );
}
