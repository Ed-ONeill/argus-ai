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

/**
 * RC2-CC — a failure must not be shared-cached for an hour.
 *
 * Every response left this route with the SAME header, because there is one
 * return path:
 *
 *   Cache-Control: public, s-maxage=3600, stale-while-revalidate=1800
 *
 * That is correct for a measured T+1 daily series. It is wrong for a failure:
 * `public` + `s-maxage=3600` makes an `unavailable` payload shared-cacheable for
 * 60 minutes, and `stale-while-revalidate=1800` permits a further 30 while
 * revalidating — so one transient FRED blip can be served back to users long
 * after FRED itself has recovered. That matches the observed signature across
 * three recorded occurrences: `unavailable` stable over many minutes, then
 * autonomous recovery with no deploy.
 *
 * This is DISTINCT from `next: { revalidate: 3600 }` on the outbound fetch. That
 * is Next's Data Cache, keyed on the FRED request, and it stores only successful
 * responses — a failed fetch caches nothing there. The header below is a
 * downstream cache of this route's own output, and it did not discriminate
 * success from failure. Only the header is changed here; the fetch is untouched.
 *
 * `stale` keeps the shared policy deliberately: it is a SUCCESSFUL measurement
 * carrying a real `asOf` and business-day age, which C1 already treats as honest
 * data. `unparseable` joins `unavailable` because it means FRED served something
 * unreadable — a transient upstream condition, not a datum worth pinning.
 *
 * This does not prove any particular CDN honours the header. It proves Argus no
 * longer INSTRUCTS intermediaries to cache the failure. The FRED root cause
 * remains unproven and is a separate, blocked ledger item.
 */
const SHARED_CACHE = "public, s-maxage=3600, stale-while-revalidate=1800";
const NO_CACHE = "no-store";

/** Failures must not be preserved downstream; measurements may be. */
function cacheControlFor(state: CreditSpreadState): string {
  if (state.measured) return SHARED_CACHE;
  return state.reason === "stale" ? SHARED_CACHE : NO_CACHE;
}

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
    { headers: { "Cache-Control": cacheControlFor(state) } },
  );
}
