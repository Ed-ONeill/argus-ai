// ── marketSession.ts — Living Intelligence Brief session clock (PX1.0) ──────────
//
// Pure, deterministic. Given a `Date`, resolves the US-equity market daypart
// (BriefState) in Eastern Time, holiday/half-day aware. The Living Brief is ONE
// continuous document whose emphasis shifts across these states; the state never
// resets the page. No wall-clock is read here — callers pass `now` so the result
// is fully testable and deterministic. (R-1: a backend session clock may later
// supply this verbatim; the shape is intentionally serializable.)

export type BriefState =
  | "overnight"
  | "premarket"
  | "open"
  | "midday"
  | "power_hour"
  | "close"
  | "afterhours"
  | "weekend"
  | "holiday";

export interface SessionInfo {
  state: BriefState;
  /** Short human label, e.g. "Pre-market", "Midday", "After hours". */
  label: string;
  /** True during the regular trading session (9:30–16:00 ET, trading day). */
  live: boolean;
  /** "Live · Midday" / "Closed · After hours" — the brief's status line. */
  statusLine: string;
  /** Current ET clock, e.g. "10:42 AM ET". */
  etClock: string;
  /** Framing verb for the executive summary at this state. */
  framing: string;
}

// US equity market full closures (extend yearly). YYYY-MM-DD in ET.
const HOLIDAYS = new Set<string>([
  "2026-01-01", "2026-01-19", "2026-02-16", "2026-04-03", "2026-05-25",
  "2026-06-19", "2026-07-03", "2026-09-07", "2026-11-26", "2026-12-25",
]);
// Early-close (13:00 ET) sessions.
const HALF_DAYS = new Set<string>(["2026-11-27", "2026-12-24"]);

const LABELS: Record<BriefState, string> = {
  overnight: "Overnight",
  premarket: "Pre-market",
  open: "Market open",
  midday: "Midday",
  power_hour: "Power hour",
  close: "Closing",
  afterhours: "After hours",
  weekend: "Weekend",
  holiday: "Market holiday",
};

const FRAMING: Record<BriefState, string> = {
  overnight: "Overnight watch",
  premarket: "Setup for today",
  open: "At the open",
  midday: "What's changed since the open",
  power_hour: "Into the close",
  close: "Session verdict",
  afterhours: "After the bell",
  weekend: "Week in review, next week",
  holiday: "Markets closed",
};

/** ET wall-clock parts for a given instant, via the platform tz database. */
function easternParts(now: Date): { y: number; m: number; d: number; minutes: number; weekday: number; clock: string } {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false, weekday: "short",
  });
  const parts = Object.fromEntries(fmt.formatToParts(now).map((p) => [p.type, p.value]));
  const y = Number(parts.year);
  const m = Number(parts.month);
  const d = Number(parts.day);
  let hour = Number(parts.hour);
  if (hour === 24) hour = 0; // some engines emit 24 for midnight
  const minute = Number(parts.minute);
  const weekdayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const weekday = weekdayMap[parts.weekday as string] ?? 1;
  const clock = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York", hour: "numeric", minute: "2-digit", hour12: true,
  }).format(now) + " ET";
  return { y, m, d, minutes: hour * 60 + minute, weekday, clock };
}

const iso = (y: number, m: number, d: number) =>
  `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

export function resolveSession(now: Date): SessionInfo {
  const { y, m, d, minutes, weekday, clock } = easternParts(now);
  const dayKey = iso(y, m, d);

  const build = (state: BriefState, live: boolean): SessionInfo => ({
    state,
    label: LABELS[state],
    live,
    statusLine: `${live ? "Live" : "Closed"} · ${LABELS[state]}`,
    etClock: clock,
    framing: FRAMING[state],
  });

  if (weekday === 0 || weekday === 6) return build("weekend", false);
  if (HOLIDAYS.has(dayKey)) return build("holiday", false);

  const OPEN = 9 * 60 + 30;
  const CLOSE = HALF_DAYS.has(dayKey) ? 13 * 60 : 16 * 60;

  if (minutes < 4 * 60) return build("overnight", false);
  if (minutes < OPEN) return build("premarket", false);
  if (minutes < OPEN + 30) return build("open", true);
  if (minutes < CLOSE - 60) return build("midday", true);
  if (minutes < CLOSE) return build("power_hour", true);
  if (minutes < CLOSE + 15) return build("close", false);
  if (minutes < 20 * 60) return build("afterhours", false);
  return build("overnight", false);
}
