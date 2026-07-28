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
  // Static assets in /public (logos, fonts, icons, etc.) are PUBLIC. Without
  // this, an unauthenticated viewer — e.g. everyone on /auth — has every
  // `/argus-*.png` request redirected to /auth, so the <img> receives HTML and
  // renders a broken-image icon. (favicon.ico was already whitelisted; the
  // other logos were not.) Match by file extension so no /public asset is ever
  // gated by the auth redirect.
  const isStaticAsset =
    /\.(?:png|jpe?g|gif|svg|webp|avif|ico|woff2?|ttf|otf|css|js|map|txt|json)$/i.test(pathname);
  const isPublic =
    isStaticAsset ||
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
  // Exclude Next internals, the API proxy, and any static-asset request (paths
  // with a file extension). Page routes still run the auth gate above; static
  // assets never reach it, which also avoids a getUser() round-trip per image.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|api/|.*\\.(?:png|jpe?g|gif|svg|webp|avif|ico|woff2?|ttf|otf|css|js|map|txt|json)$).*)",
  ],
};