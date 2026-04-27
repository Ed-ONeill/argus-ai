import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { classifyImpact } from "./types";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
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

