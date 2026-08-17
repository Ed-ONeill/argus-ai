import { NextResponse } from "next/server";
import {
  CREDIT_SERIES_LABEL,
  FRED_CSV_URL,
  FRED_SERIES_ID,
  creditStateFromCsv,
  type CreditSpreadState,
} from "@/lib/creditSpread";

/**
 * RC2-C1 — the real credit-spread input.
 *
 * Deliberately a SEPARATE route from /api/market-data rather than another ticker
 * in that array. `market-data` is the intraday plane (Yahoo, 60s cache); this
 * series is daily and T+1. Keeping them apart is what stops a T+1 spread from
 * being rendered next to live quotes as though it were live — the separation is
 * structural, not a convention someone has to remember.
 *
 * Keyless: FRED's CSV endpoint needs no API key, so this activates none of the
 * dormant provider-adapter/ingestion machinery.
 *
 * On any failure this returns an explicit unavailable state. It never substitutes
 * equities, riskRegime, Treasury yields, or an ETF proxy — a credit claim without
 * credit data is the exact defect this slice removes.
 */

const FETCH_TIMEOUT_MS = 8_000;

export async function GET() {
  const t0 = Date.now();
  let state: CreditSpreadState;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch(FRED_CSV_URL, {
        signal: controller.signal,
        headers: { "User-Agent": "Argus-AI/1.0" },
        // Daily series: one fetch per hour is ample, and it cannot go stale
        // inside that window in any way that matters at T+1.
        next: { revalidate: 3600 },
      });
    } finally {
      clearTimeout(timer);
    }

    if (!res.ok) {
      console.warn(`[credit-spread] FRED ${FRED_SERIES_ID} HTTP ${res.status} — reporting unavailable`);
      state = { measured: false, reason: "unavailable" };
    } else {
      state = creditStateFromCsv(await res.text());
    }
  } catch (err) {
    console.warn(
      `[credit-spread] FRED ${FRED_SERIES_ID} fetch failed — reporting unavailable:`,
      (err as Error)?.message ?? err,
    );
    state = { measured: false, reason: "unavailable" };
  }

  if (state.measured) {
    console.log(
      `[credit-spread] ${CREDIT_SERIES_LABEL} ${state.level}bp asOf=${state.asOf} ` +
      `change=${state.changeBp >= 0 ? "+" : ""}${state.changeBp}bp ${state.direction} ` +
      `staleBusinessDays=${state.businessDaysStale} (${Date.now() - t0}ms)`,
    );
  } else {
    console.warn(
      `[credit-spread] UNMEASURED reason=${state.reason}` +
      (state.asOf ? ` asOf=${state.asOf} staleBusinessDays=${state.businessDaysStale}` : "") +
      ` (${Date.now() - t0}ms)`,
    );
  }

  return NextResponse.json(
    { credit: state, meta: { seriesId: FRED_SERIES_ID, label: CREDIT_SERIES_LABEL, cadence: "daily-t+1" } },
    { headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=1800" } },
  );
}
