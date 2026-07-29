import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { sanitizeInternalRedirect } from "@/lib/safeRedirect";

/**
 * OAuth / magic-link callback handler.
 * Supabase redirects here with ?code=... after the user completes an OAuth
 * flow or clicks a magic-link.  We exchange the code for a session and set
 * the cookie, then redirect back to the app.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  // Same-origin internal path only (shared sanitizer rejects open-redirect escapes).
  const next = sanitizeInternalRedirect(searchParams.get("next"));

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  // Something went wrong — send the user to the auth page with an error flag
  return NextResponse.redirect(`${origin}/auth?error=auth_failed`);
}
