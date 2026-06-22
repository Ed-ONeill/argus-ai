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
  isStale?:      boolean;    // true when served from stale fallback cache
}

export interface MarketMeta {
  fetchedAt:    string;   // ISO timestamp
  isMarketOpen: boolean;
  tickerCount:  number;
  failCount:    number;
  staleCount:   number;   // tickers served from stale cache (all providers failed)
}

// ── Stale fallback ticker cache ───────────────────────────────────────────────
// Persists across requests in Railway's Node.js runtime.  Serves last known
// price when all live providers fail.  15-minute TTL.

interface TickerValueCache { value: TickerData; fetchedAt: number }
const _tickerValueCache = new Map<string, TickerValueCache>();
const TICKER_CACHE_TTL  = 15 * 60 * 1_000;

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

// ── Yahoo crumb cache ─────────────────────────────────────────────────────────
// Yahoo Finance requires a session cookie + crumb for the v8 chart API on
// cloud server IPs.  We cache the crumb for 20 min (well within Yahoo's TTL).

interface CrumbCache {
  crumb:     string;
  cookies:   string;
  expiresAt: number;
}

const CRUMB_TTL_MS           = 20 * 60 * 1000;
const CRUMB_REFRESH_AHEAD_MS = 3 * 60 * 1000;   // refresh in background this long before expiry

let _crumbCache: CrumbCache | null = null;
let _crumbInflight: Promise<{ crumb: string; cookies: string }> | null = null;

// Acquire a fresh crumb (consent cookies → getcrumb). Never throws — returns an
// empty crumb on failure so callers proceed (Yahoo may then 401 and fall back).
async function acquireCrumb(): Promise<{ crumb: string; cookies: string }> {
  const now = Date.now();

  // Step 1: Visit Yahoo Finance to receive session cookies (A1, A3, etc.).
  // NOTE: fc.yahoo.com (old GDPR consent endpoint) is now defunct — returns 404.
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
          _crumbCache = { crumb, cookies, expiresAt: now + CRUMB_TTL_MS };
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

  console.warn("[market-data] crumb: could not acquire — proceeding without auth (expect 401s)");
  return { crumb: "", cookies };
}

// Crumb accessor. (1) Cache hit returns instantly. (2) Refresh-ahead: when the
// cached crumb is close to expiry, a background refresh is kicked off while the
// still-valid crumb is returned, so no user request ever blocks on the ~1.3s
// acquisition. (3) In-flight dedup: concurrent cold callers share one
// acquisition instead of each stampeding Yahoo.
function getYahooCrumb(): Promise<{ crumb: string; cookies: string }> {
  const now = Date.now();
  if (_crumbCache && now < _crumbCache.expiresAt) {
    if (!_crumbInflight && _crumbCache.expiresAt - now < CRUMB_REFRESH_AHEAD_MS) {
      _crumbInflight = acquireCrumb().finally(() => { _crumbInflight = null; });
      _crumbInflight.catch(() => {});   // background; current cache stays valid
      console.log("[market-data] crumb: refresh-ahead kicked off in background");
    }
    return Promise.resolve({ crumb: _crumbCache.crumb, cookies: _crumbCache.cookies });
  }
  if (!_crumbInflight) {
    _crumbInflight = acquireCrumb().finally(() => { _crumbInflight = null; });
  }
  return _crumbInflight;
}

// Pre-warm at module load so the crumb is ready before the first client request
// on a persistent runtime (the container boots before traffic arrives).
getYahooCrumb().catch(() => {});

// ── Yahoo Finance v8/chart (fallback) ─────────────────────────────────────────

async function fetchFromYahooHost(
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
  });
}

async function fetchTickerFromYahoo(
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
      res = await fetchFromYahooHost(host, symbol, crumb, cookies);
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      console.error(`[market-data] provider=yahoo symbol=${key} host=${host} status=network_error:`, lastError.message);
      continue;
    }

    if (!res.ok) {
      lastError = new Error(`HTTP ${res.status}`);
      console.error(`[market-data] provider=yahoo symbol=${key} host=${host} status=${res.status}`);
      if (res.status === 401) _crumbCache = null;
      continue;
    }

    let json: unknown;
    try {
      json = await res.json();
    } catch (err) {
      lastError = new Error(`JSON parse error: ${String(err)}`);
      console.error(`[market-data] provider=yahoo symbol=${key} host=${host} status=json_error`);
      continue;
    }

    const result = (json as { chart?: { result?: unknown[] } })?.chart?.result?.[0] as Record<string, unknown> | undefined;
    if (!result) {
      const errMsg = ((json as { chart?: { error?: { description?: string } } })?.chart?.error?.description) ?? "no chart result";
      lastError = new Error(errMsg);
      console.error(`[market-data] provider=yahoo symbol=${key} host=${host} status=no_result:`, errMsg);
      continue;
    }

    const meta = result.meta as Record<string, unknown>;
    const rawPrice =
      (meta.regularMarketPrice            as number | undefined) ||
      (meta.regularMarketPreviousClose    as number | undefined) ||
      (meta.chartPreviousClose            as number | undefined) ||
      (meta.previousClose                 as number | undefined) ||
      0;

    if (!rawPrice || !isFinite(rawPrice)) throw new Error(`invalid price data for ${key}: ${rawPrice}`);

    const price         = rawPrice;
    const previousClose = ((meta.chartPreviousClose ?? meta.previousClose) as number | undefined) ?? price;
    const change        = price - previousClose;
    const changePercent = previousClose > 0 ? (change / previousClose) * 100 : 0;

    const indicators = result.indicators as { quote?: { close?: (number | null)[] }[] } | undefined;
    const rawCloses  = indicators?.quote?.[0]?.close ?? [];
    const history    = rawCloses
      .filter((v): v is number => v !== null && isFinite(v) && v > 0)
      .slice(-30);

    console.log(`[market-data] provider=yahoo symbol=${key} status=ok price=${price.toFixed(2)} host=${host}`);
    return { key, label, price, change, changePercent, history };
  }

  throw lastError;
}

// ── Stooq live-quote provider ─────────────────────────────────────────────────
// Uses /q/l/ (live quote endpoint), NOT /q/d/l/ (historical download, requires API key).
// Format: sd2t2ohlcv = Symbol, Date, Time, Open, High, Low, Close, Volume

const STOOQ_SYMBOLS: Partial<Record<string, string>> = {
  "SPY":  "spy.us",
  "QQQ":  "qqq.us",
  "IWM":  "iwm.us",
  "TNX":  "tnx.us",
  "GC=F": "gc.f",
  "BZ=F": "bz.f",
  "VIX":  "^vix",
  "DXY":  "dx.f",
};

async function fetchFromStooq(key: string, label: string): Promise<TickerData> {
  const stooqSym = STOOQ_SYMBOLS[key];
  if (!stooqSym) throw new Error(`no Stooq symbol mapping for ${key}`);

  const url = `https://stooq.com/q/l/?s=${encodeURIComponent(stooqSym)}&f=sd2t2ohlcv&h&e=csv`;
  const res = await fetch(url, {
    signal:  AbortSignal.timeout(8_000),
    headers: { "User-Agent": YF_UA, Accept: "text/csv,text/plain,*/*" },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  const text = await res.text();

  // Stooq returns API key instructions if the endpoint requires auth
  if (/apikey|api_key|captcha/i.test(text)) throw new Error("Stooq requires API key");

  const lines = text.trim().split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) throw new Error(`Stooq: no data rows for ${key}`);

  const headers = lines[0].split(",").map(h => h.trim().toLowerCase());
  const row     = lines[lines.length - 1].split(",").map(v => v.trim());
  const col     = (name: string) => row[headers.indexOf(name)] ?? "";

  const close = parseFloat(col("close"));
  const open  = parseFloat(col("open"));

  if (!close || !isFinite(close) || close <= 0) {
    throw new Error(`Stooq: invalid price for ${key}: "${col("close")}"`);
  }

  // Day open is used as proxy for previous close — directionally correct for intraday display
  const ref           = open > 0 && isFinite(open) ? open : close;
  const change        = close - ref;
  const changePercent = ref > 0 ? (change / ref) * 100 : 0;

  console.log(`[market-data] provider=stooq symbol=${key} status=ok price=${close.toFixed(2)}`);
  return { key, label, price: close, change, changePercent, history: [] };
}

// ── US Treasury provider for 10Y yield ───────────────────────────────────────
// Public OData feed, no auth required.
// Tries current month, then prior month to handle early-month publishing delays.

async function fetchTNXFromTreasury(): Promise<TickerData> {
  const now = new Date();

  for (let offset = 0; offset <= 1; offset++) {
    const d  = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - offset, 1));
    const ym = `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    const url = `https://home.treasury.gov/resource-center/data-chart-center/interest-rates/pages/xml?data=daily_treasury_yield_curve&field_tdr_date_value=${ym}`;

    try {
      const res = await fetch(url, {
        signal:  AbortSignal.timeout(10_000),
        headers: { Accept: "application/xml,text/xml,*/*" },
      });
      if (!res.ok) continue;

      const text = await res.text();
      // Matches <d:BC_10YEAR m:type="Edm.Double">4.51</d:BC_10YEAR>
      const matches = [...text.matchAll(/<d:BC_10YEAR[^>]*>([\d.]+)<\/d:BC_10YEAR>/g)];
      if (matches.length === 0) continue;

      const rate = parseFloat(matches[matches.length - 1][1]);
      if (!rate || !isFinite(rate)) continue;

      let change = 0, changePercent = 0;
      if (matches.length >= 2) {
        const prev = parseFloat(matches[matches.length - 2][1]);
        if (prev > 0) { change = rate - prev; changePercent = (change / prev) * 100; }
      }

      console.log(`[market-data] provider=treasury symbol=TNX status=ok rate=${rate.toFixed(3)}`);
      return { key: "TNX", label: "10Y Yield", price: rate, change, changePercent, history: [] };
    } catch {
      // try next offset
    }
  }

  throw new Error("Treasury: no 10Y yield data found");
}

// ── CoinGecko / Binance providers for BTC ────────────────────────────────────

async function fetchBTCFromCoinGecko(): Promise<TickerData> {
  const res = await fetch(
    "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd&include_24hr_change=true",
    { signal: AbortSignal.timeout(8_000), headers: { Accept: "application/json" } },
  );
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json() as { bitcoin?: { usd?: number; usd_24h_change?: number } };
  const price = json.bitcoin?.usd;
  const changePercent = json.bitcoin?.usd_24h_change ?? 0;
  if (!price || !isFinite(price)) throw new Error("invalid price");
  const change = price * (changePercent / 100);
  console.log(`[market-data] provider=coingecko symbol=BTC-USD status=ok price=${price.toFixed(2)}`);
  return { key: "BTC-USD", label: "BTC/USD", price, change, changePercent, history: [] };
}

async function fetchBTCFromBinance(): Promise<TickerData> {
  const res = await fetch(
    "https://api.binance.com/api/v3/ticker/24hr?symbol=BTCUSDT",
    { signal: AbortSignal.timeout(8_000), headers: { Accept: "application/json" } },
  );
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json() as { lastPrice?: string; priceChangePercent?: string };
  const price = parseFloat(json.lastPrice ?? "0");
  const changePercent = parseFloat(json.priceChangePercent ?? "0");
  if (!price || !isFinite(price)) throw new Error("invalid price");
  const change = price * (changePercent / 100);
  console.log(`[market-data] provider=binance symbol=BTC-USD status=ok price=${price.toFixed(2)}`);
  return { key: "BTC-USD", label: "BTC/USD", price, change, changePercent, history: [] };
}

// ── Ticker dispatch ───────────────────────────────────────────────────────────

async function fetchTicker(
  key:     string,
  symbol:  string,
  label:   string,
  crumb:   string,
  cookies: string,
): Promise<TickerData> {
  // BTC: CoinGecko → Binance → Yahoo fallback
  if (key === "BTC-USD") {
    try { return await fetchBTCFromCoinGecko(); }
    catch (err) { console.warn(`[market-data] provider=coingecko symbol=BTC-USD status=failed —`, String(err)); }
    try { return await fetchBTCFromBinance(); }
    catch (err) { console.warn(`[market-data] provider=binance symbol=BTC-USD status=failed —`, String(err)); }
    console.log(`[market-data] provider=yahoo symbol=BTC-USD status=fallback`);
    return fetchTickerFromYahoo(key, symbol, label, crumb, cookies);
  }

  // TNX: US Treasury XML → Yahoo → Stooq (last resort).
  // Stooq is no longer tried first: it returns HTTP 404 for these symbols from
  // cloud IPs, so a Stooq-first order added a guaranteed wasted round-trip
  // before every Yahoo call. It is kept only as a fallback if Yahoo also fails.
  if (key === "TNX") {
    try { return await fetchTNXFromTreasury(); }
    catch (err) { console.warn(`[market-data] provider=treasury symbol=TNX status=failed —`, String(err)); }
    try { return await fetchTickerFromYahoo(key, symbol, label, crumb, cookies); }
    catch (err) { console.warn(`[market-data] provider=yahoo symbol=TNX status=failed —`, String(err)); }
    console.log(`[market-data] provider=stooq symbol=TNX status=last_resort`);
    return fetchFromStooq(key, label);
  }

  // Equities / commodities / indices: Yahoo primary → Stooq last-resort fallback.
  try {
    return await fetchTickerFromYahoo(key, symbol, label, crumb, cookies);
  } catch (err) {
    if (STOOQ_SYMBOLS[key]) {
      console.warn(`[market-data] provider=yahoo symbol=${key} status=failed, trying stooq —`, String(err));
      return fetchFromStooq(key, label);
    }
    throw err;
  }
}

// ── Cached ticker fetch — stale fallback on total provider failure ────────────

async function fetchTickerCached(
  key:     string,
  symbol:  string,
  label:   string,
  crumb:   string,
  cookies: string,
): Promise<{ data: TickerData; stale: boolean }> {
  try {
    const value = await fetchTicker(key, symbol, label, crumb, cookies);
    _tickerValueCache.set(key, { value, fetchedAt: Date.now() });
    return { data: value, stale: false };
  } catch (err) {
    const cached = _tickerValueCache.get(key);
    if (cached && Date.now() - cached.fetchedAt < TICKER_CACHE_TTL) {
      const ageMin = Math.round((Date.now() - cached.fetchedAt) / 60_000);
      console.log(`[market-data] symbol=${key} status=stale_cache age=${ageMin}m`);
      return { data: { ...cached.value, isStale: true }, stale: true };
    }
    const msg = (err instanceof Error ? err.message : String(err));
    console.error(`[market-data] symbol=${key} exhausted all providers: ${msg}`);
    throw err;
  }
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function GET() {
  const t0 = Date.now();
  console.log(`[market-data] GET  tickers=${TICKERS.map(t => t.key).join(",")}`);

  const crumbStart = Date.now();
  const { crumb, cookies } = await getYahooCrumb();
  const crumbMs = Date.now() - crumbStart;

  const fetchStart = Date.now();
  const results = await Promise.allSettled(
    TICKERS.map(({ key, symbol, label }) =>
      fetchTickerCached(key, symbol, label, crumb, cookies)
    )
  );
  const fetchMs = Date.now() - fetchStart;

  const tickers: Record<string, TickerData | null> = {};
  let failCount = 0, staleCount = 0;
  for (let i = 0; i < TICKERS.length; i++) {
    const r = results[i];
    if (r.status === "rejected") {
      console.error(`[market-data] ${TICKERS[i].key} failed:`, (r.reason as Error)?.message ?? r.reason);
      failCount++;
      tickers[TICKERS[i].key] = null;
    } else {
      tickers[TICKERS[i].key] = r.value.data;
      if (r.value.stale) staleCount++;
    }
  }

  const meta: MarketMeta = {
    fetchedAt:    new Date().toISOString(),
    isMarketOpen: isMarketOpen(),
    tickerCount:  TICKERS.length - failCount,
    failCount,
    staleCount,
  };

  const totalMs = Date.now() - t0;
  console.log(
    `[perf] market-data total=${totalMs}ms crumb=${crumbMs}ms tickers=${fetchMs}ms` +
    ` ok=${meta.tickerCount}/${TICKERS.length} stale=${staleCount} failed=${failCount}`,
  );

  return NextResponse.json({ tickers, meta }, {
    headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=30" },
  });
}
