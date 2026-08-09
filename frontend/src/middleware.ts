import { NextResponse, type NextRequest } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";

// Identity that distinguishes otherwise-separate cookies: name + path + domain.
// Two setAll writes with the same identity are the same cookie (last wins);
// different identities are preserved side by side.
function cookieIdentity(name: string, options?: CookieOptions): string {
  return JSON.stringify([name, options?.path ?? "", options?.domain ?? ""]);
}

export async function middleware(request: NextRequest) {
  // Pending state produced by Supabase during getUser(): cookie mutations
  // (refresh/replace/CLEAR) and the anti-cache headers it passes as setAll's
  // second argument. Supabase may call setAll MORE THAN ONCE, so we accumulate
  // across calls (last-write-wins per cookie identity; latest value per header
  // name) and apply to WHICHEVER response is finally returned — including the
  // unauthenticated /auth redirect — so no mutation is lost or duplicated.
  const pendingCookies = new Map<string, { name: string; value: string; options: CookieOptions }>();
  const pendingHeaders: Record<string, string> = {};

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      // Production always marks the session cookie Secure (never inferred from
      // location.protocol); dev/test omit it. Only `secure` is set.
      cookieOptions: {
        secure: process.env.NODE_ENV === "production",
      },
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          // Keep the request cookies in sync so downstream getUser() reads the
          // refreshed values within this same invocation.
          cookiesToSet.forEach(({ name, value }) => {
            request.cookies.set(name, value);
          });
          // Accumulate — do not commit to a response here; a later branch decides
          // which response is returned. Later writes supersede earlier ones for
          // the same cookie identity; earlier untouched cookies are preserved.
          for (const cookie of cookiesToSet) {
            pendingCookies.set(cookieIdentity(cookie.name, cookie.options), cookie);
          }
          if (headers) Object.assign(pendingHeaders, headers);
        },
      },
    }
  );

  // Apply the accumulated cookie mutations + anti-cache headers exactly once to
  // the response that is actually returned. No-op when setAll never ran (both
  // stay empty), so ordinary responses are untouched and page caching preserved.
  const applyPending = (res: NextResponse): NextResponse => {
    for (const { name, value, options } of pendingCookies.values()) {
      res.cookies.set(name, value, options);
    }
    for (const [key, val] of Object.entries(pendingHeaders)) {
      res.headers.set(key, val);
    }
    return res;
  };

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
    pathname === "/privacy" ||
    pathname === "/terms" ||
    pathname === "/favicon.ico";

  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/auth";
    url.searchParams.set("redirect", pathname);
    // The redirect must still carry any cookie mutations (e.g. Supabase clearing
    // an invalid session) + anti-cache headers produced during getUser().
    return applyPending(NextResponse.redirect(url));
  }

  return applyPending(NextResponse.next({ request }));
}

export const config = {
  // Exclude Next internals, the API proxy, and any static-asset request (paths
  // with a file extension). Page routes still run the auth gate above; static
  // assets never reach it, which also avoids a getUser() round-trip per image.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|api/|.*\\.(?:png|jpe?g|gif|svg|webp|avif|ico|woff2?|ttf|otf|css|js|map|txt|json)$).*)",
  ],
};
