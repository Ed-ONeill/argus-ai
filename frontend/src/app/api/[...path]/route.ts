import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  isSafeInitialDestination,
  secureBackendFetch,
  transportPolicyFromEnv,
} from "@/lib/backendTransport";

// Reads BACKEND_URL at request time (runtime), not at build time.
// This means you can update the Railway env var and restart without rebuilding.
function resolveBackendUrl(): string {
  const url = process.env.BACKEND_URL;
  if (url) return url.replace(/\/$/, "");

  if (process.env.NODE_ENV !== "production") return "http://localhost:8000";

  // Fail loudly in production so Railway logs surface the misconfiguration.
  throw new Error(
    "BACKEND_URL is not set. Add it to the Railway frontend service variables " +
      "(e.g. https://your-backend.up.railway.app) and redeploy.",
  );
}

async function proxy(
  req: NextRequest,
  segments: string[],
): Promise<NextResponse> {
  let backendBase: string;
  try {
    backendBase = resolveBackendUrl();
  } catch (err) {
    console.error("[proxy] configuration error:", (err as Error).message);
    return NextResponse.json(
      { error: "Backend not configured, BACKEND_URL missing." },
      { status: 503 },
    );
  }

  // Reconstruct the full upstream URL, preserving query string.
  const upstream = `${backendBase}/api/${segments.join("/")}${req.nextUrl.search}`;
  console.log(`[proxy] ${req.method} ${req.nextUrl.pathname} → ${upstream}`);

  // TRANSPORT GUARD (Phase 2): validate the backend destination BEFORE building
  // auth headers or reading the session — an unsafe public-HTTP upstream must
  // never receive the bearer, and HTTP→HTTPS redirecting does NOT retroactively
  // make an initial plaintext hop safe. Fails closed. (secureBackendFetch
  // re-checks; this early guard avoids a needless session read for a doomed req.)
  const transportPolicy = transportPolicyFromEnv();
  if (!isSafeInitialDestination(upstream, transportPolicy)) {
    console.error(
      `[proxy] refused: backend transport is not secure (must be HTTPS or an ` +
      `approved private internal host). path=${req.nextUrl.pathname} ` +
      `backend_host=${(() => { try { return new URL(backendBase).host; } catch { return "invalid"; } })()}`,
    );
    return NextResponse.json(
      { error: "Backend transport is not secure (must be HTTPS or an approved private internal host). Check BACKEND_URL." },
      { status: 502 },
    );
  }

  const headers = new Headers(req.headers);
  headers.delete("host");            // let the upstream set its own Host
  headers.delete("accept-encoding"); // prevent backend from compressing; Node fetch auto-decompresses
                                     // but forwards the original Content-Encoding header, causing
                                     // ERR_CONTENT_DECODING_FAILED in the browser (double decompression)

  // Auth token forwarding. The backend INDEPENDENTLY verifies the JWT signature
  // (ES256/JWKS in app/auth.py), so a forged token can never pass — which means
  // we can safely trust a client-supplied Bearer as the *freshest* token.
  //
  // Order matters and fixes the production 401: this route is EXCLUDED from the
  // middleware (see middleware matcher), so the server-side cookie session here
  // is never refreshed and its access_token routinely goes stale between page
  // load and a later /api call. The browser's Supabase client, by contrast,
  // auto-refreshes and hands us a live token via the Authorization header. So:
  //   1. prefer the caller's Bearer (fresh, from the live browser session);
  //   2. otherwise fall back to the server cookie session (SSR/no-JS callers).
  const forwarded = req.headers.get("authorization");
  const hasClientBearer = !!forwarded && /^Bearer\s+\S+/i.test(forwarded);
  let usedCookieFallback = false;
  if (!hasClientBearer) {
    headers.delete("authorization");
    try {
      const supabase = await createClient();
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (token) { headers.set("authorization", `Bearer ${token}`); usedCookieFallback = true; }
    } catch (err) {
      console.error("[proxy] session read failed (forwarding unauthenticated):", err);
    }
  }
  // else: leave the caller's fresh Bearer in place.

  // TEMP sanitized boundary diagnostic — inspect the FINAL Headers object that
  // is about to be sent upstream. NEVER logs the token value.
  const finalAuth = headers.get("authorization");
  const bearerFormatValid = !!finalAuth && /^Bearer\s+\S+/i.test(finalAuth);
  const tokenLength = bearerFormatValid ? finalAuth!.replace(/^Bearer\s+/i, "").length : 0;
  const backendHost = (() => { try { return new URL(backendBase).host; } catch { return "invalid"; } })();
  console.log(
    `[proxy-auth] path=${req.nextUrl.pathname} has_authorization=${!!finalAuth} ` +
    `bearer_format_valid=${bearerFormatValid} token_length=${tokenLength} ` +
    `used_client_header=${hasClientBearer} used_cookie_fallback=${usedCookieFallback} ` +
    `backend_target_host=${backendHost}`,
  );

  const body =
    req.method !== "GET" && req.method !== "HEAD"
      ? await req.arrayBuffer()
      : undefined;

  // Build the outbound headers as a PLAIN OBJECT (not the incoming Headers
  // instance). This forwards a clean, explicit set — Authorization included —
  // and removes any dependence on how the runtime carries a Headers instance.
  const outHeaders: Record<string, string> = {};
  headers.forEach((value, key) => { outHeaders[key] = value; });

  const t0 = Date.now();
  let result;
  try {
    result = await secureBackendFetch(
      upstream,
      {
        method:  req.method,
        headers: outHeaders,
        body:    body as BodyInit | undefined,
        signal:  AbortSignal.timeout(30_000),
      },
      transportPolicy,
      fetch,
    );
  } catch (err) {
    console.error("[proxy] fetch failed:", err);
    return NextResponse.json(
      { error: "Could not reach backend.", detail: String(err) },
      { status: 502 },
    );
  }

  if (!result.ok) {
    // The bearer was NEVER sent to the unsafe hop — secureBackendFetch refuses
    // before issuing the request. Surface a normalized 502; never forward.
    console.error(
      `[proxy] refused unsafe backend transport: reason=${result.error} ` +
      `path=${req.nextUrl.pathname} hops=${result.hops}`,
    );
    const message =
      result.error === "cross-host"
        ? "Backend issued a cross-host redirect; Authorization was withheld. Check BACKEND_URL."
        : result.error === "unsafe-initial"
          ? "Backend transport is not secure (must be HTTPS or an approved private internal host). Check BACKEND_URL."
          : result.error === "too-many-redirects"
            ? "Backend exceeded the redirect limit; the request was refused."
            : "Backend issued an unsafe redirect (scheme downgrade or disallowed destination); Authorization was withheld.";
    return NextResponse.json({ error: message }, { status: 502 });
  }

  const { res, hops } = result;
  if (hops > 0) {
    // Diagnostic: a validated same-host redirect was followed WITH auth preserved.
    console.log(`[proxy-auth] followed_redirect hops=${hops} auth_preserved=true path=${req.nextUrl.pathname}`);
  }

  console.log(`[perf] proxy ${req.method} ${req.nextUrl.pathname} status=${res.status} total=${Date.now() - t0}ms`);

  const resHeaders = new Headers(res.headers);
  resHeaders.delete("transfer-encoding"); // Next.js handles this itself
  resHeaders.delete("content-encoding");  // body already decoded by Node fetch; header would lie to browser
  resHeaders.delete("content-length");    // decoded body length differs from compressed; let Next.js recalculate

  return new NextResponse(res.body, {
    status: res.status,
    statusText: res.statusText,
    headers: resHeaders,
  });
}

// Next.js 15: params is a Promise — must be awaited.
type Context = { params: Promise<{ path: string[] }> };

export async function GET(req: NextRequest, ctx: Context) {
  return proxy(req, (await ctx.params).path);
}
export async function POST(req: NextRequest, ctx: Context) {
  return proxy(req, (await ctx.params).path);
}
export async function PUT(req: NextRequest, ctx: Context) {
  return proxy(req, (await ctx.params).path);
}
export async function PATCH(req: NextRequest, ctx: Context) {
  return proxy(req, (await ctx.params).path);
}
export async function DELETE(req: NextRequest, ctx: Context) {
  return proxy(req, (await ctx.params).path);
}
