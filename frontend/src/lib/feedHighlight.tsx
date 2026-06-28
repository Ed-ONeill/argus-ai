"use client";

/**
 * lib/feedHighlight.tsx — the Feed's nervous system.
 *
 * One shared "beam" store lets every entity on the page communicate by hover:
 * hovering a sector / theme / company / driver / signal softly highlights every
 * matching node, story, chip, sector, impact and prediction across the page, and
 * dims everything unrelated. Nothing exists independently.
 *
 * Mechanics: each highlightable element registers its identity + context tokens.
 * On hover it broadcasts that token set as the active beam; every other element
 * checks for a token intersection and resolves to match / dim / idle. The store
 * is read through useSyncExternalStore with a PRIMITIVE selector, so only the
 * handful of elements whose state actually flips re-render — no page-wide churn,
 * no flashing. Smooth opacity transitions do the rest.
 */

import { useCallback, useMemo, useSyncExternalStore } from "react";
import type { GraphNode } from "@/lib/graph/types";

interface Beacon { id: number; tokens: Set<string> }

let active: Beacon | null = null;
let seq = 0;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach(l => l());
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };

// Deferred clear: when the pointer leaves an element we schedule the clear a couple
// frames out, so sliding straight onto an adjacent entity cancels it — the beam
// hands off without a flash of everything-lit in between.
let pendingClear = 0;
const raf = (fn: () => void) => (typeof requestAnimationFrame === "function" ? requestAnimationFrame(fn) : (fn(), 0));
const cancelClear = () => { if (pendingClear && typeof cancelAnimationFrame === "function") cancelAnimationFrame(pendingClear); pendingClear = 0; };
function scheduleClear() { cancelClear(); pendingClear = raf(() => { pendingClear = raf(clearBeacon); }); }

/** Normalize a raw label/ticker into a comparable token ("Private Credit" → "private credit"). */
export function normToken(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function toSet(raw: Iterable<string | undefined | null>): Set<string> {
  const s = new Set<string>();
  for (const t of raw) { if (!t) continue; const n = normToken(t); if (n) s.add(n); }
  return s;
}

export function setBeacon(raw: Iterable<string | undefined | null>): void {
  cancelClear();
  const tokens = toSet(raw);
  if (tokens.size === 0) return clearBeacon();
  active = { id: ++seq, tokens };
  emit();
}
export function clearBeacon(): void { pendingClear = 0; if (active) { active = null; emit(); } }
/** Release the beam a couple frames out (cancelled if a new hover lands first). */
export { scheduleClear as releaseBeacon };

function intersects(a: Set<string>, b: Set<string>): boolean {
  const [small, big] = a.size <= b.size ? [a, b] : [b, a];
  for (const x of small) if (big.has(x)) return true;
  return false;
}

// 0 = idle (no beam), 1 = match, 2 = dim
function matchCode(tokens: Set<string>): 0 | 1 | 2 {
  if (!active) return 0;
  return intersects(active.tokens, tokens) ? 1 : 2;
}

/** Identity + context tokens for a graph node (label, ticker, name, sector, themes). */
export function nodeTokens(n: GraphNode): string[] {
  return [n.ticker, n.label, n.name, n.sector, ...(n.themes ?? [])].filter(Boolean) as string[];
}

export type BeamState = "idle" | "match" | "dim";
const DIM = { opacity: 0.28, transition: "opacity 220ms ease" } as const;
const LIT = { opacity: 1, transition: "opacity 220ms ease" } as const;

/**
 * Subscribe an element to the beam. Pass identity + context tokens; get back the
 * resolved state, ready-to-spread hover handlers, and a dim/lit style.
 */
export function useBeam(rawTokens: (string | undefined | null)[]) {
  const key = rawTokens.filter(Boolean).join("|");
  const tokenSet = useMemo(() => toSet(rawTokens), [key]); // eslint-disable-line react-hooks/exhaustive-deps
  const getSnap = useCallback(() => matchCode(tokenSet), [tokenSet]);
  const code = useSyncExternalStore(subscribe, getSnap, () => 0 as 0 | 1 | 2);
  const state: BeamState = code === 1 ? "match" : code === 2 ? "dim" : "idle";

  const onMouseEnter = useCallback(() => { cancelClear(); active = { id: ++seq, tokens: tokenSet }; emit(); }, [tokenSet]);
  const onMouseLeave = useCallback(() => scheduleClear(), []);

  return { state, dimStyle: state === "dim" ? DIM : LIT, handlers: { onMouseEnter, onMouseLeave } };
}

/** Read the active beam's tokens (for non-React consumers like the canvas graph). */
export function useActiveBeamTokens(): Set<string> | null {
  const a = useSyncExternalStore(subscribe, () => active, () => null);
  return a ? a.tokens : null;
}

/** Convenience wrapper for a highlightable inline chip. */
export function Beam({ tokens, className, style, title, children }: {
  tokens: (string | undefined | null)[];
  className?: string;
  style?: React.CSSProperties;
  title?: string;
  children: React.ReactNode;
}) {
  const { dimStyle, handlers } = useBeam(tokens);
  return (
    <span {...handlers} className={className} title={title} style={{ ...style, ...dimStyle }}>
      {children}
    </span>
  );
}
