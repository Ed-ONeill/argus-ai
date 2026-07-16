/**
 * lib/network/tokens.ts — the Intelligence Network design tokens (M5.1).
 *
 * ONE system for DOM and Canvas. Every font size, ink, spacing step, and
 * border on the network surface comes from here; an arbitrary value in a
 * component is a violation (enforced by networkTests source scans).
 *
 * TYPE — the canonical ramp. Roles, not sizes, are the API:
 *   xs 9      metadata / eyebrows / legend — whispers by INK, never by shrinking
 *   sm 10.5   supporting rows, node labels
 *   md 12     body text, standard titles
 *   lg 14     primary titles, canvas figures
 *   xl 18     dossier figures
 *   xxl 24    the dominant figure — numbers own the largest ink on the surface
 *
 * INK — four steps of authority. Hierarchy is carried by ink and weight;
 * nothing whispers by becoming illegible.
 *
 * FIGURES are always tabular: the mono stack renders every numeral (canvas
 * cannot set font-variant, and mono guarantees tabular alignment everywhere).
 */

export const TYPE = { xs: 9, sm: 10.5, md: 12, lg: 14, xl: 18, xxl: 24 } as const;

export const SPACE = { s1: 4, s2: 8, s3: 12, s4: 16, s5: 24, s6: 32 } as const;

export const INK = {
  primary: "rgba(248,250,252,0.96)",    // titles, figures — the darkest ink
  secondary: "rgba(226,232,240,0.82)",  // body, node labels
  support: "rgba(148,163,184,0.78)",    // supporting labels, verbs
  whisper: "rgba(148,163,184,0.45)",    // metadata, eyebrows, legend
} as const;

export const BORDER = {
  frame: "rgba(148,163,184,0.16)",
  hairline: "rgba(148,163,184,0.10)",
  node: "rgba(51,65,85,0.90)",          // canvas plate borders (slate-700)
} as const;

export const FONT_SANS = "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif";
export const FONT_MONO = "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";

/** Canvas font string from the ramp — the only legal way to set canvas type.
    `scale` is the camera zoom multiplier (capped by the caller). */
export function canvasFont(size: number, weight: number, scale = 1, mono = false): string {
  return `${weight} ${size * scale}px ${mono ? FONT_MONO : FONT_SANS}`;
}

/** Line height for wrapped canvas titles (editorial 1.25). */
export function lineHeight(size: number, scale = 1): number {
  return Math.round(size * 1.25 * scale);
}
