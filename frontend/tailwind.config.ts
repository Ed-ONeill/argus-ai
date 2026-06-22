import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // ── Brand ──────────────────────────────────────────────
        navy: {
          DEFAULT: "#1A2B5F",
          50:  "#EEF1FA",
          100: "#D4DCEF",
          200: "#A9B9DF",
          300: "#7E96CF",
          400: "#5373BF",
          500: "#2850AF",
          600: "#1A3A8C",
          700: "#1A2B5F",   // primary brand
          800: "#111E42",
          900: "#090F21",
        },
        // ── Backgrounds ────────────────────────────────────────
        // Variable-driven so a scope (e.g. .markets-dark) can flip the whole
        // surface to dark without touching component classes. Channels live in
        // globals.css (:root = the original light values for every other page).
        canvas:  "rgb(var(--canvas) / <alpha-value>)",   // page background
        surface: "rgb(var(--surface) / <alpha-value>)",  // card / panel surface
        raised:  "rgb(var(--raised) / <alpha-value>)",   // hover / subtle lift
        // ── Borders ────────────────────────────────────────────
        edge: {
          DEFAULT: "rgb(var(--edge) / <alpha-value>)",
          subtle:  "rgb(var(--edge-subtle) / <alpha-value>)",
          strong:  "rgb(var(--edge-strong) / <alpha-value>)",
        },
        // ── Text ───────────────────────────────────────────────
        ink: {
          DEFAULT:   "rgb(var(--ink) / <alpha-value>)",
          secondary: "rgb(var(--ink-secondary) / <alpha-value>)",
          muted:     "rgb(var(--ink-muted) / <alpha-value>)",
          faint:     "rgb(var(--ink-faint) / <alpha-value>)",
        },
        // ── Accent ─────────────────────────────────────────────
        accent: {
          DEFAULT: "#2563EB",
          hover:   "#1D4ED8",
          subtle:  "#EFF4FF",
        },
        // ── Category colours ───────────────────────────────────
        cat: {
          markets:    "#2563EB",   // blue
          ma:         "#7C3AED",   // purple
          geo:        "#DC2626",   // red
          company:    "#0891B2",   // teal
          policy:     "#D97706",   // amber
        },
        // ── Impact colours ─────────────────────────────────────
        impact: {
          bullish:      "#D1FAE5",
          "bullish-fg": "#059669",
          bearish:      "#FEE2E2",
          "bearish-fg": "#DC2626",
          neutral:      "#F3F4F6",
          "neutral-fg": "#6B7280",
          mixed:        "#FEF9C3",
          "mixed-fg":   "#D97706",
        },
      },
      fontFamily: {
        sans:  ["Inter", "system-ui", "sans-serif"],
        serif: ["Georgia", "serif"],
        mono:  ["JetBrains Mono", "monospace"],
      },
      fontSize: {
        "2xs": ["0.625rem", { lineHeight: "1rem" }],
        "xs":  ["0.75rem",  { lineHeight: "1.125rem" }],
      },
      boxShadow: {
        card:         "0 1px 3px rgba(0,0,0,0.05), 0 1px 2px rgba(0,0,0,0.04)",
        "card-hover": "0 6px 20px rgba(0,0,0,0.09), 0 2px 6px rgba(0,0,0,0.05)",
        "card-lift":  "0 10px 30px rgba(0,0,0,0.10), 0 4px 10px rgba(0,0,0,0.06)",
        "top-story":  "0 2px 8px rgba(26,43,95,0.07), 0 1px 3px rgba(0,0,0,0.04)",
        drawer:       "-4px 0 32px rgba(0,0,0,0.12)",
        modal:        "0 24px 64px rgba(0,0,0,0.18)",
        nav:          "0 1px 0 rgba(0,0,0,0.06), 0 2px 12px rgba(0,0,0,0.04)",
      },
      borderRadius: {
        "4xl": "2rem",
      },
      transitionTimingFunction: {
        spring: "cubic-bezier(0.34, 1.56, 0.64, 1)",
      },
    },
  },
  plugins: [],
};

export default config;
