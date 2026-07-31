import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Returns a Supabase client for use in Route Handlers and Server Components.
 * Reads/writes session cookies via the Next.js `cookies()` API.
 *
 * Must be called inside an async context (Route Handler, Server Component,
 * or middleware) where `next/headers` is available.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      // Production always marks the session cookie Secure (never inferred from
      // location.protocol); dev/test omit it so local HTTP keeps the session.
      // Only `secure` is set — other attributes and the storage key stay default.
      cookieOptions: {
        secure: process.env.NODE_ENV === "production",
      },
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Called from a Server Component (read-only cookies) — ignore.
            // The middleware handles cookie refresh in that case.
          }
        },
      },
    },
  );
}
