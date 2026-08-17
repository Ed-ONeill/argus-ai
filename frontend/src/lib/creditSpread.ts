/**
 * RC2-C1 — the product's ONLY credit-spread authority.
 *
 * Before this module, "credit" state was inferred from `riskRegime`, which is
 * `norm(avgEq, -3, 3)` — the average percent change of SPY/QQQ/IWM. The product
 * asserted "Compressed credit spreads enable leveraged financing at competitive
 * rates" because equities were up. No credit series existed anywhere.
 *
 * The series here is the real thing: ICE BofA US High Yield Index
 * Option-Adjusted Spread (FRED `BAMLH0A0HYM2`), published daily in percentage
 * points. Because it IS an option-adjusted spread, the product may honestly use
 * the word "spread" about it — that permission does not extend to any proxy.
 *
 * WHAT IT MEASURES: the market's compensation, in basis points, for holding
 * US high-yield corporate credit over duration-matched Treasuries.
 *
 * WHAT IT DOES NOT MEASURE: investment-grade spreads, European or EM credit,
 * leveraged-loan spreads specifically, or any individual issuer. It is one
 * index. Nothing here should be read as issuer-level credit intelligence.
 *
 * FRESHNESS: daily, T+1, end-of-day. It is NOT intraday and must never be
 * presented alongside intraday quotes as if it were live.
 */

/** Basis points. The ONLY place percentage points are converted. */
export type BasisPoints = number;

export type CreditDirection = "widening" | "tightening" | "stable";

/** Why a credit read is unavailable. Each is an honest, distinct state. */
export type CreditUnavailableReason =
  | "unavailable"      // fetch failed / no response
  | "unparseable"      // response did not yield usable observations
  | "stale";           // series exists but has not published recently enough

export interface CreditSpreadMeasured {
  measured: true;
  /** Latest observation, in basis points (2.67% -> 267). */
  level: BasisPoints;
  /** ISO date (YYYY-MM-DD) of the latest observation. */
  asOf: string;
  /** The previous VALID observation, in basis points. */
  priorLevel: BasisPoints;
  /** ISO date of the previous valid observation. */
  priorAsOf: string;
  /** level - priorLevel, in basis points. Positive = widening. */
  changeBp: BasisPoints;
  direction: CreditDirection;
  /** Business days between `asOf` and the evaluation date. Normal is 1 (T+1). */
  businessDaysStale: number;
}

export interface CreditSpreadUnavailable {
  measured: false;
  reason: CreditUnavailableReason;
  /** Present only for `stale` — the data we DID get, for honest disclosure. */
  asOf?: string;
  businessDaysStale?: number;
}

export type CreditSpreadState = CreditSpreadMeasured | CreditSpreadUnavailable;

// ── Locked parameters (RC2-C1) ───────────────────────────────────────────────

/**
 * Staleness is counted in BUSINESS days, never calendar days. That is what makes
 * weekends and holidays structurally incapable of producing a false failure: a
 * Friday print read on Monday is 3 calendar days but 1 business day, which is
 * simply the normal T+1 publication lag.
 *
 * Measured on 793 observations (2023-08..2026-08): consecutive-observation gaps
 * are 1d x623, 2d x16, 3d x143 (weekends), 4d x2 (stacked holidays). 5 business
 * days absorbs T+1 plus any weekend plus a stacked holiday, while still catching
 * a genuine outage inside a week.
 */
export const STALE_TOLERANCE_BUSINESS_DAYS = 5;

/**
 * A move smaller than the series' own median daily move is not directional.
 *
 * Measured |day-over-day change| on the same 784 transitions: median 3.0bp,
 * p75 6bp, p90 10bp, max 59bp. At +/-3bp roughly 47% of days read `stable` and
 * direction fires only when the day exceeds a typical day. 5bp would call 70% of
 * days stable and mask real moves; 1-2bp would flip direction on noise.
 *
 * This is one threshold justified by one measured statistic — deliberately not a
 * scoring model, and not an opaque "credit score".
 */
export const DIRECTION_THRESHOLD_BP = 3;

/** The series. Keyless CSV; no API key, no dormant ingestion system. */
export const FRED_SERIES_ID = "BAMLH0A0HYM2";
export const FRED_CSV_URL =
  `https://fred.stlouisfed.org/graph/fredgraph.csv?id=${FRED_SERIES_ID}`;

/** Display label. Honest only because the source IS an option-adjusted spread. */
export const CREDIT_SERIES_LABEL = "US HY OAS";

// ── Parsing ──────────────────────────────────────────────────────────────────

export interface Observation {
  date: string;      // YYYY-MM-DD
  valuePp: number;   // percentage points, as published
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Parse FRED's CSV into valid observations, oldest first.
 *
 * FRED prints `.` on index holidays (Good Friday, Christmas, New Year — 8 rows in
 * the measured window). Those are MISSING OBSERVATIONS and are skipped. Parsing
 * one as 0 would invent a 267bp single-day collapse, so the guard is explicit.
 *
 * Tolerates a truncated payload: a trailing partial line simply fails validation
 * and is dropped rather than throwing.
 */
export function parseFredCsv(text: string): Observation[] {
  if (!text || typeof text !== "string") return [];
  const out: Observation[] = [];

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;

    const parts = line.split(",");
    if (parts.length < 2) continue;                 // truncated / malformed row

    const date = parts[0].trim();
    const raw = parts[1].trim();

    if (!DATE_RE.test(date)) continue;              // header, or garbage
    if (raw === "." || raw === "" || raw === "NA") continue;   // holiday / no print

    const valuePp = Number(raw);
    if (!Number.isFinite(valuePp)) continue;        // never coerce to 0
    // A negative or absurd OAS is a corrupted payload, not a market event.
    if (valuePp < 0 || valuePp > 100) continue;

    out.push({ date, valuePp });
  }

  out.sort((a, b) => a.date.localeCompare(b.date));
  return out;
}

// ── Conversion (the single conversion site) ──────────────────────────────────

/** 2.67 (percentage points) -> 267 (basis points). Rounded to whole bp. */
export function ppToBp(pp: number): BasisPoints {
  return Math.round(pp * 100);
}

// ── Staleness ────────────────────────────────────────────────────────────────

/** Business days strictly after `from`, up to and including `to`. Weekends excluded. */
export function businessDaysBetween(from: Date, to: Date): number {
  const a = Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate());
  const b = Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate());
  if (b <= a) return 0;
  let count = 0;
  for (let t = a + 86_400_000; t <= b; t += 86_400_000) {
    const day = new Date(t).getUTCDay();
    if (day !== 0 && day !== 6) count += 1;
  }
  return count;
}

// ── Direction ────────────────────────────────────────────────────────────────

export function directionOf(changeBp: number): CreditDirection {
  if (changeBp >= DIRECTION_THRESHOLD_BP) return "widening";
  if (changeBp <= -DIRECTION_THRESHOLD_BP) return "tightening";
  return "stable";
}

// ── The contract ─────────────────────────────────────────────────────────────

/**
 * Build the credit state from parsed observations.
 *
 * Returns an explicit unavailable state rather than a default. There is no path
 * here that consults equities, `riskRegime`, Treasury yields, or an ETF proxy —
 * by construction, this function receives only the OAS series.
 */
export function buildCreditSpreadState(
  observations: Observation[],
  now: Date = new Date(),
): CreditSpreadState {
  if (!observations.length) return { measured: false, reason: "unparseable" };
  if (observations.length < 2) return { measured: false, reason: "unparseable" };

  const latest = observations[observations.length - 1];
  const prior = observations[observations.length - 2];

  const asOfDate = new Date(`${latest.date}T00:00:00Z`);
  if (Number.isNaN(asOfDate.getTime())) return { measured: false, reason: "unparseable" };

  const businessDaysStale = businessDaysBetween(asOfDate, now);
  if (businessDaysStale > STALE_TOLERANCE_BUSINESS_DAYS) {
    return { measured: false, reason: "stale", asOf: latest.date, businessDaysStale };
  }

  const level = ppToBp(latest.valuePp);
  const priorLevel = ppToBp(prior.valuePp);
  const changeBp = level - priorLevel;

  return {
    measured: true,
    level,
    asOf: latest.date,
    priorLevel,
    priorAsOf: prior.date,
    changeBp,
    direction: directionOf(changeBp),
    businessDaysStale,
  };
}

/** Convenience: raw CSV -> state. Used by the route and the live probe. */
export function creditStateFromCsv(text: string, now: Date = new Date()): CreditSpreadState {
  return buildCreditSpreadState(parseFredCsv(text), now);
}
