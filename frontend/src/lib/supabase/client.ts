import { createBrowserClient } from "@supabase/ssr";

/**
 * Returns a Supabase client suitable for use in browser ("use client") components
 * and hooks. Safe to call multiple times — @supabase/ssr shares session state
 * via cookies across instances.
 */
export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    // Surface this clearly instead of letting fetch fail with a cryptic error
    throw new Error(
      "Supabase credentials not configured. " +
      "Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY " +
      "in .env.local (local) or your Vercel project environment variables (production).",
    );
  }

  return createBrowserClient(url, key);
}
