import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { classifyImpact } from "./types";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// ── Copy normalization ──────────────────────────────────────────────────────
// House style: no em dashes ("—") or en dashes ("–") in displayed copy. Run any
// generated or backend-sourced string through this before render. Em dash becomes
// a comma; en dash becomes a spaced hyphen; double spaces collapse. Plain ASCII
// arrows ("->") and unicode arrows ("→") are left untouched.
export function sanitizeCopy<T extends string | null | undefined>(s: T): T {
  if (typeof s !== "string") return s;
  return (s as string)
    .replace(/\s*—\s*/g, ", ")          // em dash -> comma
    .replace(/\s*–\s*/g, " - ")          // en dash -> spaced hyphen
    .replace(/^[\s,]+/, "")               // no leading comma/space from a leading dash
    .replace(/\s+([,;:.!?])/g, "$1")      // no space before punctuation
    .replace(/ {2,}/g, " ")               // collapse double spaces
    .trim() as T;
}

// ── Relative time ─────────────────────────────────────────────────────────────
// One implementation for the whole product, so timestamps read identically on
// every page and can never render "NaN" / "NaNd ago". Invalid or missing input
// yields "" so a caller can simply omit the stamp.

/** Relative "time ago" from elapsed SECONDS. Pass `{ suffix: false }` for a
 *  compact form ("5m", "3h", "now") used inside tight tiles. */
export function formatRelativeAge(
  seconds: number | null | undefined,
  opts: { suffix?: boolean } = {},
): string {
  const { suffix = true } = opts;
  if (seconds == null || !Number.isFinite(seconds) || seconds < 0) return "";
  const ago = suffix ? " ago" : "";
  if (seconds < 60)     return suffix ? "just now" : "now";
  if (seconds < 3600)   return `${Math.floor(seconds / 60)}m${ago}`;
  if (seconds < 86_400) return `${Math.floor(seconds / 3600)}h${ago}`;
  if (seconds < 604_800) return `${Math.floor(seconds / 86_400)}d${ago}`;
  return `${Math.floor(seconds / 604_800)}w${ago}`;
}

/** Seconds elapsed since a timestamp (ISO string, epoch ms, or Date). Returns
 *  null when missing or unparseable. A numeric input is treated as epoch ms. */
export function secondsSince(input: string | number | Date | null | undefined): number | null {
  if (input == null || input === "") return null;
  const ms =
    input instanceof Date ? input.getTime() :
    typeof input === "number" ? input :
    Date.parse(input);
  if (!Number.isFinite(ms)) return null;
  const s = (Date.now() - ms) / 1000;
  return Number.isFinite(s) ? s : null;
}

/** Relative "time ago" directly from a timestamp (ISO / epoch ms / Date). */
export function timeAgo(
  input: string | number | Date | null | undefined,
  opts?: { suffix?: boolean },
): string {
  return formatRelativeAge(secondsSince(input), opts);
}

// ── Category colour map ───────────────────────────────────────────────────────

const CAT_HEX: Record<string, string> = {
  "Markets":        "#2563EB",
  "M&A":            "#7C3AED",
  "Geopolitical":   "#DC2626",
  "Company":        "#0891B2",
  "Policy / Risk":  "#D97706",
};

export function catColor(category: string): string {
  return CAT_HEX[category] ?? "#6B7280";
}

export function catPillStyle(category: string): string {
  return {
    "Markets":       "bg-cat-markets/10 text-cat-markets",
    "M&A":           "bg-cat-ma/10 text-cat-ma",
    "Geopolitical":  "bg-cat-geo/10 text-cat-geo",
    "Company":       "bg-cat-company/10 text-cat-company",
    "Policy / Risk": "bg-cat-policy/10 text-cat-policy",
  }[category] ?? "bg-gray-100 text-gray-500";
}

export function catBorderStyle(category: string): string {
  return {
    "Markets":       "border-t-cat-markets",
    "M&A":           "border-t-cat-ma",
    "Geopolitical":  "border-t-cat-geo",
    "Company":       "border-t-cat-company",
    "Policy / Risk": "border-t-cat-policy",
  }[category] ?? "border-t-edge-strong";
}

// ── Impact styling helpers ────────────────────────────────────────────────────

interface ImpactStyle {
  bg:   string;
  text: string;
  dot:  string;
}

export function impactStyle(impact: string): ImpactStyle {
  const s = classifyImpact(impact);
  return {
    bullish: { bg: "bg-impact-bullish",  text: "text-impact-bullish-fg",  dot: "bg-impact-bullish-fg"  },
    bearish: { bg: "bg-impact-bearish",  text: "text-impact-bearish-fg",  dot: "bg-impact-bearish-fg"  },
    neutral: { bg: "bg-impact-neutral",  text: "text-impact-neutral-fg",  dot: "bg-impact-neutral-fg"  },
    mixed:   { bg: "bg-impact-mixed",    text: "text-impact-mixed-fg",    dot: "bg-impact-mixed-fg"    },
  }[s];
}

