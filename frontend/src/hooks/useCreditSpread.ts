"use client";

import { useEffect, useState } from "react";
import type { CreditSpreadState } from "@/lib/creditSpread";

/**
 * RC2-C1 — the measured US HY OAS (FRED BAMLH0A0HYM2).
 *
 * Returns an explicit unavailable state until the first successful load, and on
 * any failure. There is deliberately no proxy or default: a consumer that cannot
 * get a real spread must render "not measured", never a credit claim inferred
 * from equities or rates.
 *
 * The series is daily/T+1, so this polls hourly rather than on the intraday
 * market-data cadence.
 */
const REFRESH_MS = 60 * 60 * 1000;

export function useCreditSpread(): CreditSpreadState {
  const [state, setState] = useState<CreditSpreadState>({
    measured: false,
    reason: "unavailable",
  });

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const res = await fetch("/api/credit-spread");
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as { credit?: CreditSpreadState };
        if (!cancelled && json?.credit) setState(json.credit);
        else if (!cancelled) setState({ measured: false, reason: "unparseable" });
      } catch {
        if (!cancelled) setState({ measured: false, reason: "unavailable" });
      }
    };

    load();
    const id = setInterval(load, REFRESH_MS);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  return state;
}
