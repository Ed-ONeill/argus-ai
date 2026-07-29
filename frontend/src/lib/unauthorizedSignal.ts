/**
 * lib/unauthorizedSignal.ts — a tiny, dependency-free registry so low-level lib
 * code (the shared API client) can tell the app "this session is definitively
 * unauthenticated" without importing React/router. A client component
 * (AuthProvider) registers a handler that clears auth and routes to sign-in.
 *
 * Kept import-free so it is trivially unit-testable.
 */
let handler: (() => void) | null = null;

export function setUnauthorizedHandler(fn: (() => void) | null): void {
  handler = fn;
}

export function notifyUnauthorized(): void {
  try {
    handler?.();
  } catch {
    // never let the handler throw back into a fetch path
  }
}
