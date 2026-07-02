/**
 * lib/intelligenceUtils.ts - small pure helpers shared across the intelligence
 * engines (inference, narrative transmission, health, tests). Extracted to remove
 * verbatim duplication. Pure, dependency-free, no UI, no em/en dashes in output.
 */

/** Coerce to a finite number, falling back to `d` (default 0). */
export const num = (v: unknown, d = 0): number => (typeof v === "number" && Number.isFinite(v) ? v : d);

/** Clamp to the 0..1 range. */
export const clamp01 = (n: number): number => Math.max(0, Math.min(1, n));

export const round = (n: number): number => Math.round(n);

/** Mean of a list, 0 when empty. */
export const avg = (a: number[]): number => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);

/** Stable de-duplication preserving first-seen order. */
export const uniq = <T,>(a: Iterable<T>): T[] => Array.from(new Set(a));

/** Join labels into readable prose without dashes: "a, b and c". */
export function list(items: string[]): string {
  const f = uniq(items.filter(Boolean));
  if (f.length === 0) return "";
  if (f.length === 1) return f[0];
  if (f.length === 2) return `${f[0]} and ${f[1]}`;
  return `${f.slice(0, -1).join(", ")} and ${f[f.length - 1]}`;
}

/** Pluralize a count: `plural(2, "story", "stories")` => "2 stories". */
export const plural = (n: number, one: string, many = `${one}s`): string => `${n} ${n === 1 ? one : many}`;
