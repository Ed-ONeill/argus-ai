import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => {
            request.cookies.set(name, value);
          });
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options);
          });
        },
      },
    }
  );

  // PH2/C2 — server-side auth enforcement. getUser() validates the session
  // against Supabase (not just decoding a cookie), so this is a real gate, not
  // client-side theater. Unauthenticated requests to gated pages are redirected
  // to /auth; the data behind them lives on the backend, which independently
  // re-verifies the token forwarded by the proxy (defense in depth).
  //
  // This gate is only trustworthy on Next >= 15.2.3, which closes
  // CVE-2025-29927 (x-middleware-subrequest lets an attacker skip middleware).
  // PH4 upgrades Next; do not rely on this gate on older versions.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const isPublic =
    pathname === "/auth" ||
    pathname.startsWith("/auth/") ||
    pathname === "/favicon.ico";

  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/auth";
    url.searchParams.set("redirect", pathname);
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  // Exclude static assets and the API proxy (the proxy + backend enforce auth
  // themselves; page routes are gated above).
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|api/).*)",
  ],
};