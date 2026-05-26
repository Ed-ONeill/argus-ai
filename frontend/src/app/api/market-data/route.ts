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

// ── Yahoo crumb cache ─────────────────────────────────────────────────────────
// Yahoo Finance requires a session cookie + crumb for the v8 chart API on
// cloud server IPs.  We cache the crumb for 20 min (well within Yahoo's TTL).

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

  console.warn("[market-data] crumb: could not acquire — proceeding without auth (expect 401s)");
  return { crumb: "", cookies };
}

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

  // TNX: US Treasury XML → Stooq → Yahoo fallback
  if (key === "TNX") {
    try { return await fetchTNXFromTreasury(); }
    catch (err) { console.warn(`[market-data] provider=treasury symbol=TNX status=failed —`, String(err)); }
    try { return await fetchFromStooq(key, label); }
    catch (err) { console.warn(`[market-data] provider=stooq symbol=TNX status=failed —`, String(err)); }
    console.log(`[market-data] provider=yahoo symbol=TNX status=fallback`);
    return fetchTickerFromYahoo(key, symbol, label, crumb, cookies);
  }

  // Equities / commodities / indices: Stooq → Yahoo fallback
  if (STOOQ_SYMBOLS[key]) {
    try { return await fetchFromStooq(key, label); }
    catch (err) { console.warn(`[market-data] provider=stooq symbol=${key} status=failed —`, String(err)); }
    console.log(`[market-data] provider=yahoo symbol=${key} status=fallback`);
  }

  return fetchTickerFromYahoo(key, symbol, label, crumb, cookies);
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function GET() {
  console.log(`[market-data] GET  tickers=${TICKERS.map(t => t.key).join(",")}`);
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
