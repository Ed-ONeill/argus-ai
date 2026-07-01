"use client";

/**
 * lib/intelligenceContext.tsx - the shared cross-page intelligence context.
 *
 * One active selection (theme / company / sector / driver / deal / narrative) that
 * lives above every page, so clicking an entity anywhere in Argus becomes the
 * active intelligence lens across the whole product. Module-singleton store read
 * via useSyncExternalStore, so it survives route navigation with no provider and
 * no over-engineering.
 */

import { useSyncExternalStore } from "react";
import type { EntityKind } from "./entity";

export type IntelKind = "theme" | "company" | "sector" | "driver" | "deal" | "narrative";

export interface IntelContext {
  kind:   IntelKind;
  id:     string;    // stable normalized key
  label:  string;    // display text
  color?: string;
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

// Map the unified entity kinds onto intelligence kinds.
export function entityKindToIntel(k: EntityKind): IntelKind {
  if (k === "sector") return "sector";
  if (k === "theme") return "theme";
  if (k === "macro") return "driver";
  return "company"; // ticker / company / etf / asset
}

let active: IntelContext | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach(l => l());
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };

export function setActiveContext(ctx: IntelContext | null): void {
  if (!ctx || !ctx.label) return clearActiveContext();
  active = { ...ctx, id: ctx.id || norm(ctx.label) };
  emit();
}
export function clearActiveContext(): void { if (active) { active = null; emit(); } }
export function getActiveContext(): IntelContext | null { return active; }

/** Subscribe a component to the active intelligence context. */
export function useActiveContext(): IntelContext | null {
  return useSyncExternalStore(subscribe, () => active, () => null);
}

// Named convenience setters (mirror the requested activeTheme / activeCompany / ...).
export const setActiveTheme    = (label: string, color?: string, id?: string) => setActiveContext({ kind: "theme",    label, color, id: id ?? norm(label) });
export const setActiveCompany  = (label: string, color?: string) => setActiveContext({ kind: "company",  label, color, id: label.toUpperCase() });
export const setActiveSector   = (label: string, color?: string) => setActiveContext({ kind: "sector",   label, color, id: norm(label) });
export const setActiveDriver   = (label: string, color?: string) => setActiveContext({ kind: "driver",   label, color, id: norm(label) });
export const setActiveDeal     = (label: string, id: string)     => setActiveContext({ kind: "deal",     label, id });
export const setActiveNarrative= (label: string, color?: string) => setActiveContext({ kind: "narrative",label, color, id: norm(label) });

/** Does a normalized token set intersect the active context? (light matcher.) */
export function contextMatchesTokens(ctx: IntelContext, tokens: (string | null | undefined)[]): boolean {
  const set = new Set(tokens.filter(Boolean).map(t => norm(t as string)));
  if (set.has(ctx.id) || set.has(norm(ctx.label))) return true;
  // company id is an uppercase ticker; also test the lowercased ticker
  if (ctx.kind === "company" && set.has(norm(ctx.id))) return true;
  return false;
}
