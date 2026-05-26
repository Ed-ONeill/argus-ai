import { NextResponse } from "next/server";

const TICKERS = [
  { key: "SPY",     symbol: "SPY",       label: "S&P 500"    },
  { key: "QQQ",     symbol: "QQQ",       label: "Nasdaq"     },
  { key: "IWM",     symbol: "IWM",       label: "Russell 2K" },
  { key: "TNX",     symbol: "%5ETNX",    label: "10Y Yield"  },
  { key: "BTC-USD", symbol: "BTC-USD",   label: "BTC/USD"    },
  { key: "BZ=F",    symbol: "BZ%3DF",    label: "Brent Oil"  },
  { key: "GC=F",    symbol: "GC%3DF",    label: "Gold"       },
  { key: "VIX",     symbol: "%5EVIX",    label: "VIX"        },
  { key: "DXY",     symbol: "DX-Y.NYB",  label: "DXY"        },
] as const;

export interface TickerData {
  key:           string;
  label:         string;
  price:         number;
  change:        number;
  changePercent: number;
  history:       number[];   // up to 30 intraday 5-min close values, oldest → newest
}

export interface MarketMeta {
  fetchedAt:    string;   // ISO timestamp
  isMarketOpen: boolean;
  tickerCount:  number;
  failCount:    number;
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

// ── Market hours (NYC) ────────────────────────────────────────────────────────

function isMarketOpen(): boolean {
  try {
    const now   = new Date();
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      weekday: "short", hour: "numeric", minute: "numeric", hour12: false,
    }).formatToParts(now);
    const weekday   = parts.find(p => p.type === "weekday")?.value  ?? "";
    const hour      = parseInt(parts.find(p => p.type === "hour")?.value    ?? "0", 10);
    const minute    = parseInt(parts.find(p => p.type === "minute")?.value  ?? "0", 10);
    const totalMin  = hour * 60 + minute;
    if (weekday === "Sat" || weekday === "Sun") return false;
    return totalMin >= 9 * 60 + 30 && totalMin < 16 * 60;
  } catch {
    return false;
  }
}

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
    console.log(`[market-data] crumb: cache hit crumb=${_crumbCache.crumb.slice(0, 8)}... expires_in=${Math.round((_crumbCache.expiresAt - now) / 1000)}s`);
    return { crumb: _crumbCache.crumb, cookies: _crumbCache.cookies };
  }

  // Step 1: Visit Yahoo Finance to receive session cookies (A1, A3, etc.).
  // NOTE: fc.yahoo.com (old GDPR consent endpoint) is now defunct — returns 404.
  // finance.yahoo.com is the correct seed URL. We try two URLs in case one is
  // rate-limited from cloud IPs (Railway/Vercel).
  const CONSENT_URLS = ["https://finance.yahoo.com", "https://yahoo.com"];
  let cookies = "";
  for (const consentUrl of CONSENT_URLS) {
    if (cookies) break;
    try {
      const consentRes = await fetch(consentUrl, {
        signal:   AbortSignal.timeout(12_000),
        headers: {
          "User-Agent":      YF_UA,
          "Accept":          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9",
          "Accept-Encoding": "gzip, deflate, br",
        },
        redirect: "follow",
      });
      const rawCookies = consentRes.headers.getSetCookie?.() ?? [];
      if (rawCookies.length > 0) {
        cookies = rawCookies.map(c => c.split(";")[0]).filter(Boolean).join("; ");
      }
      console.log(
        `[market-data] consent: url=${consentUrl} status=${consentRes.status}` +
        ` cookies=${rawCookies.length} keys=${rawCookies.map(c => c.split("=")[0]).join(",") || "(none)"}`,
      );
    } catch (err) {
      console.warn(`[market-data] consent: ${consentUrl} failed —`, String(err));
    }
  }

  // Step 2: Fetch crumb from both query hosts using the session cookies
  for (const host of YF_HOSTS) {
    try {
      const crumbRes = await fetch(`${host}/v1/test/getcrumb`, {
        signal: AbortSignal.timeout(8_000),
        headers: {
          ...YF_BASE_HEADERS,
          ...(cookies ? { Cookie: cookies } : {}),
        },
      });
      const body = await crumbRes.text();
      if (crumbRes.ok) {
        const crumb = body.trim();
        if (crumb && crumb.length < 60 && !crumb.startsWith("<") && !crumb.includes("{")) {
          _crumbCache = { crumb, cookies, expiresAt: now + 20 * 60 * 1000 };
          console.log(`[market-data] crumb: acquired from ${host} crumb=${crumb.slice(0, 8)}... cookies_present=${!!cookies}`);
          return { crumb, cookies };
        }
        console.warn(`[market-data] crumb: ${host} ok but unexpected body: ${body.slice(0, 80)}`);
      } else {
        console.warn(`[market-data] crumb: ${host} status=${crumbRes.status} body=${body.slice(0, 80)}`);
      }
    } catch (err) {
      console.warn(`[market-data] crumb: ${host} error —`, String(err));
    }
  }

  // Crumb unavailable — proceed without it; tickers will likely return 401
  console.warn("[market-data] crumb: could not acquire — proceeding without auth (expect 401s)");
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
    signal: AbortSignal.timeout(12_000),
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
  console.log(`[market-data] GET  tickers=${TICKERS.map(t => t.key).join(",")}`);
  // Acquire (or reuse cached) crumb before fetching any tickers
  const { crumb, cookies } = await getYahooCrumb();

  const results = await Promise.allSettled(
    TICKERS.map(({ key, symbol, label }) =>
      fetchTicker(key, symbol, label, crumb, cookies)
    )
  );

  const tickers: Record<string, TickerData | null> = {};
  let failCount = 0;
  for (let i = 0; i < TICKERS.length; i++) {
    const r = results[i];
    if (r.status === "rejected") {
      console.error(`[market-data] ${TICKERS[i].key} failed:`, (r.reason as Error)?.message ?? r.reason);
      failCount++;
    }
    tickers[TICKERS[i].key] = r.status === "fulfilled" ? r.value : null;
  }

  const meta: MarketMeta = {
    fetchedAt:    new Date().toISOString(),
    isMarketOpen: isMarketOpen(),
    tickerCount:  TICKERS.length - failCount,
    failCount,
  };

  console.log(`[market-data] complete  ok=${meta.tickerCount}/${TICKERS.length}  marketOpen=${meta.isMarketOpen}  crumb=${crumb ? "yes" : "no"}`);

  return NextResponse.json({ tickers, meta }, {
    headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=30" },
  });
}
