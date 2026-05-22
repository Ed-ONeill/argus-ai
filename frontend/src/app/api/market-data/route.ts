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

// Yahoo Finance rotates between query1 and query2 — cloud IPs are often blocked
// on query1 but accepted on query2. We try query1 first and fall back to query2
// on any non-2xx or network error so Railway deploys stay resilient.
const YF_HOSTS = [
  "https://query1.finance.yahoo.com",
  "https://query2.finance.yahoo.com",
];

// Headers that Yahoo Finance accepts from server environments.
// A bare "Mozilla/5.0" UA is frequently rate-limited; a fuller UA with Accept
// and Referer headers passes through reliably on cloud IPs.
const YF_HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
    "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Accept":          "application/json, text/plain, */*",
  "Accept-Language": "en-US,en;q=0.9",
  "Origin":          "https://finance.yahoo.com",
  "Referer":         "https://finance.yahoo.com/",
};

async function fetchFromHost(host: string, symbol: string): Promise<Response> {
  const url = `${host}/v8/finance/chart/${symbol}?interval=5m&range=1d`;
  return fetch(url, {
    headers: YF_HEADERS,
    next: { revalidate: 300 },
  });
}

async function fetchTicker(key: string, symbol: string, label: string): Promise<TickerData> {
  let lastError: Error = new Error("no hosts tried");

  for (const host of YF_HOSTS) {
    let res: Response;
    try {
      res = await fetchFromHost(host, symbol);
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      console.error(`[market-data] ${key} network error on ${host}:`, lastError.message);
      continue;
    }

    if (!res.ok) {
      lastError = new Error(`HTTP ${res.status}`);
      console.error(`[market-data] ${key} ${lastError.message} from ${host}`);
      continue;
    }

    const json   = await res.json();
    const result = json?.chart?.result?.[0];
    if (!result) {
      lastError = new Error("no chart result in response");
      console.error(`[market-data] ${key} ${lastError.message} from ${host}`);
      continue;
    }

    const meta = result.meta;

    // Try regularMarketPrice first, then fall back to pre/post-market and
    // last close so we always have a valid non-zero number.
    const rawPrice =
      (meta.regularMarketPrice as number | undefined) ||
      (meta.regularMarketPreviousClose as number | undefined) ||
      (meta.chartPreviousClose as number | undefined) ||
      (meta.previousClose as number | undefined) ||
      0;

    if (!rawPrice || !isFinite(rawPrice)) {
      throw new Error(`invalid price data for ${key}: ${rawPrice}`);
    }

    const price         = rawPrice;
    const previousClose = ((meta.chartPreviousClose ?? meta.previousClose) as number | undefined) ?? price;
    const change        = price - previousClose;
    const changePercent = previousClose > 0 ? (change / previousClose) * 100 : 0;

    const rawCloses = (result.indicators?.quote?.[0]?.close ?? []) as (number | null)[];
    const history   = rawCloses
      .filter((v): v is number => v !== null && isFinite(v) && v > 0)
      .slice(-30);

    return { key, label, price, change, changePercent, history };
  }

  throw lastError;
}

export async function GET() {
  const results = await Promise.allSettled(
    TICKERS.map(({ key, symbol, label }) => fetchTicker(key, symbol, label))
  );

  const data: Record<string, TickerData | null> = {};
  for (let i = 0; i < TICKERS.length; i++) {
    const r = results[i];
    if (r.status === "rejected") {
      console.error(`[market-data] ${TICKERS[i].key} failed all hosts:`, r.reason);
    }
    data[TICKERS[i].key] = r.status === "fulfilled" ? r.value : null;
  }

  return NextResponse.json(data, {
    headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=60" },
  });
}
