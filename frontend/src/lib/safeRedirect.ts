/**
 * lib/safeRedirect.ts — the ONE internal-redirect sanitizer.
 *
 * Accepts only a same-origin ABSOLUTE PATH and returns it; anything that could
 * escape the current origin — protocol-relative, backslash tricks, encoded
 * slash/backslash, DOT-SEGMENTS (raw OR encoded) that normalize into "//host",
 * absolute or javascript: URLs, malformed percent-encoding — falls back to "/".
 *
 * The critical property: we validate the FINAL NORMALIZED destination, not the
 * raw input. Dot-segment collapsing ("/.//evil" -> "//evil", "/%2e//evil" ->
 * "//evil") is exactly what the browser does at navigation time, so we let the
 * URL parser normalize and then require the result to stay a single-slash,
 * same-origin path.
 */

// A fixed, known-local base used purely for parsing. Its exact value is
// irrelevant beyond providing a stable origin to compare against.
const LOCAL_BASE = "http://localhost";

// Control characters (U+0000..U+001F and U+007F) — never valid in a path.
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;

export function sanitizeInternalRedirect(raw: string | null | undefined): string {
  if (typeof raw !== "string" || raw.length === 0) return "/";

  // 1. Control characters (incl. NUL, tab, newline, DEL).
  if (CONTROL_CHARS.test(raw)) return "/";

  // 2. Backslashes — raw and encoded (%5c). Browsers fold "\" into "/".
  if (raw.includes("\\")) return "/";
  if (/%5c/i.test(raw)) return "/";

  // 3. Malformed percent-encoding → reject. The decoded form is also re-checked
  //    for backslash / control chars an encoding might have hidden.
  let rawDecoded: string;
  try {
    rawDecoded = decodeURIComponent(raw);
  } catch {
    return "/";
  }
  if (rawDecoded.includes("\\") || CONTROL_CHARS.test(rawDecoded)) return "/";

  // 4. Must be an absolute path: exactly one leading forward slash.
  if (!raw.startsWith("/") || raw.startsWith("//")) return "/";

  let base: URL;
  try {
    base = new URL(LOCAL_BASE);
  } catch {
    return "/";
  }

  // 5. Parse the RAW input so the URL parser collapses RAW dot-segments while
  //    preserving the original query/hash for the returned value.
  let parsed: URL;
  try {
    parsed = new URL(raw, LOCAL_BASE);
  } catch {
    return "/";
  }
  if (parsed.origin !== base.origin) return "/";
  if (!parsed.pathname.startsWith("/") || parsed.pathname.startsWith("//")) return "/";

  // 6. Re-normalize the DECODED pathname so ENCODED dot-segments / separators
  //    (%2e, %2f, …) collapse the same way a browser would, and validate that
  //    final destination too. A protocol-relative decode ("//host") re-parses
  //    to an EXTERNAL origin and is rejected here.
  let normalized: URL;
  try {
    normalized = new URL(decodeURIComponent(parsed.pathname), LOCAL_BASE);
  } catch {
    return "/";
  }
  if (normalized.origin !== base.origin) return "/";
  if (!normalized.pathname.startsWith("/") || normalized.pathname.startsWith("//")) return "/";

  // Return the normalized, same-origin internal path (path + query + fragment).
  return parsed.pathname + parsed.search + parsed.hash;
}
