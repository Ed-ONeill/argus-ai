import { createBrowserClient } from "@supabase/ssr";

/**
 * Returns a Supabase client suitable for use in browser ("use client") components
 * and hooks. Safe to call multiple times — @supabase/ssr shares session state
 * via cookies across instances.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
