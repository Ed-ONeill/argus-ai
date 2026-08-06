// platform/wiring.ts — registers the real providers into the app-wide registry.
// Idempotent; called by server routes before fetching. FMP/SEC/FRED platform adapters
// register here in later stages; Stage 1A registers EODHD only, so any historical_prices
// failure resolves straight to honest absence (no fallback yet).

import { registry } from "./registry";
import { eodhdProvider } from "./providers/eodhd";

let wired = false;

export function ensureProvidersWired(): typeof registry {
  if (!wired) {
    registry.register(eodhdProvider);
    wired = true;
  }
  return registry;
}
