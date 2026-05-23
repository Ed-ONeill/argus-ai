import { NextResponse } from "next/server";

const TICKERS = [
  { key: "SPY",     symbol: "SPY",       label: "S&P 500"   },
  { key: "QQQ",     symbol: "QQQ",       label: "Nasdaq"    },
  { key: "TNX",     symbol: "%5ETNX",    label: "10Y Yield" },
  { key: "BTC-USD", symbol: "BTC-USD",   label: "BTC/USD"   },
  { key: "BZ=F",    symbol: "BZ%3DF",    label: "Brent Oil" },
  { key: "GC=F",    symbol: "GC%3DF",    label: "Gold"      },
  { key: "VIX",     symbol: "%5EVIX",    label: "VIX"       },
] as const;

export interface TickerData {
  key:           string;
  label:         string;
  price:         number;
  change:        number;
  changePercent: number;
  history:       number[];   // up to 30 intraday 5-min close values, oldest → newest
}

const YF_HOSTS = [
  "https://query1.finance.yahoo.com",
  "https://query2.finance.yahoo.com",
];

const YF_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

const YF_BASE_HEADERS: Record<string, string> = {
  "User-Agent":      YF_UA,
  "Accept":          "application/json, text/plain, */*",
  "Accept-Language": "en-US,en;q=0.9",
  "Origin":          "https://finance.yahoo.com",
  "Referer":         "https://finance.yahoo.com/",
};

// ── Crumb cache ───────────────────────────────────────────────────────────────
// Yahoo Finance requires a session cookie + crumb for the v8 chart API on
// cloud server IPs.  We cache the crumb for 20 min (well within Yahoo's TTL).
// Module-level state persists across requests in Railway's Node.js runtime.

interface CrumbCache {
  crumb:     string;
  cookies:   string;
  expiresAt: number;
}

let _crumbCache: CrumbCache | null = null;

async function getYahooCrumb(): Promise<{ crumb: string; cookies: string }> {
  const now = Date.now();
  if (_crumbCache && now < _crumbCache.expiresAt) {
    return { crumb: _crumbCache.crumb, cookies: _crumbCache.cookies };
  }

  // Step 1: visit Yahoo Finance to receive the A3 consent cookie
  let cookies = "";
  try {
    const consentRes = await fetch("https://fc.yahoo.com", {
      headers: {
        "User-Agent":      YF_UA,
        "Accept":          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
      redirect: "follow",
    });
    const rawCookies = consentRes.headers.getSetCookie?.() ?? [];
    if (rawCookies.length > 0) {
      cookies = rawCookies.map(c => c.split(";")[0]).filter(Boolean).join("; ");
    }
    console.log(`[market-data] crumb: consent cookies=${rawCookies.length} status=${consentRes.status}`);
  } catch (err) {
    console.warn("[market-data] crumb: consent fetch failed —", String(err));
  }

  // Step 2: fetch crumb from both hosts
  for (const host of YF_HOSTS) {
    try {
      const crumbRes = await fetch(`${host}/v1/test/getcrumb`, {
        headers: {
          ...YF_BASE_HEADERS,
          ...(cookies ? { Cookie: cookies } : {}),
        },
      });
      if (crumbRes.ok) {
        const crumb = (await crumbRes.text()).trim();
        if (crumb && crumb.length < 60 && !crumb.startsWith("<")) {
          _crumbCache = { crumb, cookies, expiresAt: now + 20 * 60 * 1000 };
          console.log(`[market-data] crumb: acquired from ${host} crumb=${crumb.slice(0, 8)}...`);
          return { crumb, cookies };
        }
      }
      console.warn(`[market-data] crumb: ${host} returned status=${crumbRes.status}`);
    } catch (err) {
      console.warn(`[market-data] crumb: ${host} error —`, String(err));
    }
  }

  // Crumb unavailable — proceed without it (falls back to no-auth behavior)
  console.warn("[market-data] crumb: could not acquire — proceeding without authentication");
  return { crumb: "", cookies };
}

// ── Ticker fetch ──────────────────────────────────────────────────────────────

async function fetchFromHost(
  host:    string,
  symbol:  string,
  crumb:   string,
  cookies: string,
): Promise<Response> {
  const crumbParam = crumb ? `&crumb=${encodeURIComponent(crumb)}` : "";
  const url        = `${host}/v8/finance/chart/${symbol}?interval=5m&range=1d${crumbParam}`;
  return fetch(url, {
    headers: {
      ...YF_BASE_HEADERS,
      ...(cookies ? { Cookie: cookies } : {}),
    },
    // No next.revalidate here — the route's own Cache-Control header handles caching.
    // Per-fetch revalidate can poison the cache with a failed response for 5 min.
  });
}

async function fetchTicker(
  key:     string,
  symbol:  string,
  label:   string,
  crumb:   string,
  cookies: string,
): Promise<TickerData> {
  let lastError: Error = new Error("no hosts tried");

  for (const host of YF_HOSTS) {
    let res: Response;
    try {
      res = await fetchFromHost(host, symbol, crumb, cookies);
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      console.error(`[market-data] ${key} network error on ${host}:`, lastError.message);
      continue;
    }

    if (!res.ok) {
      lastError = new Error(`HTTP ${res.status}`);
      console.error(`[market-data] ${key} ${lastError.message} from ${host}`);
      // 401 = crumb expired/invalid — invalidate cache so next request re-fetches
      if (res.status === 401) _crumbCache = null;
      continue;
    }

    let json: unknown;
    try {
      json = await res.json();
    } catch (err) {
      lastError = new Error(`JSON parse error: ${String(err)}`);
      console.error(`[market-data] ${key} ${lastError.message} from ${host}`);
      continue;
    }

    const result = (json as { chart?: { result?: unknown[] } })?.chart?.result?.[0] as Record<string, unknown> | undefined;
    if (!result) {
      const errMsg = ((json as { chart?: { error?: { description?: string } } })?.chart?.error?.description) ?? "no chart result";
      lastError = new Error(errMsg);
      console.error(`[market-data] ${key} ${lastError.message} from ${host}`);
      continue;
    }

    const meta = result.meta as Record<string, unknown>;

    const rawPrice =
      (meta.regularMarketPrice            as number | undefined) ||
      (meta.regularMarketPreviousClose    as number | undefined) ||
      (meta.chartPreviousClose            as number | undefined) ||
      (meta.previousClose                 as number | undefined) ||
      0;

    if (!rawPrice || !isFinite(rawPrice)) {
      throw new Error(`invalid price data for ${key}: ${rawPrice}`);
    }

    const price         = rawPrice;
    const previousClose =
      ((meta.chartPreviousClose ?? meta.previousClose) as number | undefined) ?? price;
    const change        = price - previousClose;
    const changePercent = previousClose > 0 ? (change / previousClose) * 100 : 0;

    const indicators    = result.indicators as { quote?: { close?: (number | null)[] }[] } | undefined;
    const rawCloses     = indicators?.quote?.[0]?.close ?? [];
    const history       = rawCloses
      .filter((v): v is number => v !== null && isFinite(v) && v > 0)
      .slice(-30);

    console.log(`[market-data] ${key} OK  price=${price.toFixed(2)}  host=${host}`);
    return { key, label, price, change, changePercent, history };
  }

  throw lastError;
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function GET() {
  // Acquire (or reuse cached) crumb before fetching any tickers
  const { crumb, cookies } = await getYahooCrumb();

  const results = await Promise.allSettled(
    TICKERS.map(({ key, symbol, label }) =>
      fetchTicker(key, symbol, label, crumb, cookies)
    )
  );

  const data: Record<string, TickerData | null> = {};
  let failCount = 0;
  for (let i = 0; i < TICKERS.length; i++) {
    const r = results[i];
    if (r.status === "rejected") {
      console.error(`[market-data] ${TICKERS[i].key} failed:`, (r.reason as Error)?.message ?? r.reason);
      failCount++;
    }
    data[TICKERS[i].key] = r.status === "fulfilled" ? r.value : null;
  }

  console.log(`[market-data] complete  ok=${TICKERS.length - failCount}/${TICKERS.length}  crumb=${crumb ? "yes" : "no"}`);

  return NextResponse.json(data, {
    headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=60" },
  });
}
