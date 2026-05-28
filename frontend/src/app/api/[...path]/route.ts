import { NextRequest, NextResponse } from "next/server";

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
      { error: "Backend not configured — BACKEND_URL missing." },
      { status: 503 },
    );
  }

  // Reconstruct the full upstream URL, preserving query string.
  const upstream = `${backendBase}/api/${segments.join("/")}${req.nextUrl.search}`;
  console.log(`[proxy] ${req.method} ${req.nextUrl.pathname} → ${upstream}`);

  const headers = new Headers(req.headers);
  headers.delete("host"); // let the upstream set its own Host

  const body =
    req.method !== "GET" && req.method !== "HEAD"
      ? await req.arrayBuffer()
      : undefined;

  const t0 = Date.now();
  let res: Response;
  try {
    res = await fetch(upstream, {
      method:  req.method,
      headers,
      body,
      redirect: "follow",
      signal:   AbortSignal.timeout(30_000),
    });
  } catch (err) {
    console.error("[proxy] fetch failed:", err);
    return NextResponse.json(
      { error: "Could not reach backend.", detail: String(err) },
      { status: 502 },
    );
  }

  console.log(`[perf] proxy ${req.method} ${req.nextUrl.pathname} status=${res.status} total=${Date.now() - t0}ms`);

  const resHeaders = new Headers(res.headers);
  resHeaders.delete("transfer-encoding"); // Next.js handles this itself

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
