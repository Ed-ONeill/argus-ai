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

async function fetchTicker(key: string, symbol: string, label: string): Promise<TickerData> {
  // 5-min interval gives intraday history for sparklines + current price
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=5m&range=1d`;
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0" },
    next: { revalidate: 300 },
  });

  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  const json   = await res.json();
  const result = json?.chart?.result?.[0];
  if (!result) throw new Error("No result");

  const meta          = result.meta;
  const price         = meta.regularMarketPrice as number;
  const previousClose = (meta.chartPreviousClose ?? meta.previousClose) as number;
  const change        = price - previousClose;
  const changePercent = previousClose > 0 ? (change / previousClose) * 100 : 0;

  // Extract sparkline: last 30 non-null intraday close prices
  const rawCloses = (result.indicators?.quote?.[0]?.close ?? []) as (number | null)[];
  const history   = rawCloses
    .filter((v): v is number => v !== null && isFinite(v))
    .slice(-30);

  return { key, label, price, change, changePercent, history };
}

export async function GET() {
  const results = await Promise.allSettled(
    TICKERS.map(({ key, symbol, label }) => fetchTicker(key, symbol, label))
  );

  const data: Record<string, TickerData | null> = {};
  for (let i = 0; i < TICKERS.length; i++) {
    const r = results[i];
    data[TICKERS[i].key] = r.status === "fulfilled" ? r.value : null;
  }

  return NextResponse.json(data, {
    headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=60" },
  });
}
