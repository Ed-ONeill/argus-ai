"use client";

/**
 * lib/entity.ts — the unified Entity system.
 *
 * One vocabulary for every "thing" Argus references — ticker / company / ETF /
 * asset (resolved statically from tickerMetadata) and sector / theme / macro
 * (resolved from a light runtime registry that pages populate). Every entity
 * collapses to ONE descriptor shape so every <EntityChip> tooltip shares the
 * exact same Bloomberg-style visual language (header → divider → stacked rows).
 *
 * Dependency-light (only tickerMetadata) so the shared chip never pulls a heavy
 * engine into a page's bundle.
 */

import { useEffect } from "react";
import { tickerInfo } from "./tickerMetadata";

export type EntityKind = "ticker" | "company" | "sector" | "theme" | "macro" | "etf" | "asset";

/** A labelled section in the tooltip body. Values stack vertically under the label. */
export interface EntityRow { label: string; values: string[] }

/** The single render-ready descriptor every entity resolves to. */
export interface EntityInfo {
  kind:      EntityKind;
  name:      string;        // title — company name / theme / sector / macro label
  subtitle?: string;        // "NVDA • NASDAQ" / "Theme" / "Sector" / "Macro Driver"
  category?: string;        // ticker: its sector; otherwise optional
  rows?:     EntityRow[];   // stacked label → value(s) sections
  id?:       string;        // registry key (e.g. a ticker symbol); defaults to name
  color?:    string;
}

const KIND_LABEL: Record<EntityKind, string> = {
  ticker: "Equity", company: "Company", sector: "Sector",
  theme: "Theme", macro: "Macro Driver", etf: "ETF", asset: "Asset",
};
export const isSymbolKind = (k: EntityKind) => k === "ticker" || k === "company" || k === "etf" || k === "asset";

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const cap  = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

// ── Runtime registry for dynamic / enriched entities ──────────────────────────
const registry = new Map<string, EntityInfo>();

export function registerEntities(infos: EntityInfo[]): void {
  for (const e of infos) {
    const key = norm(e.id ?? e.name);
    registry.set(`${e.kind}:${key}`, e);
    if (!registry.has(key)) registry.set(key, e); // kind-agnostic alias
  }
}

/** Register the entities a page knows about. Memoize `infos` to avoid re-runs. */
export function useRegisterEntities(infos: EntityInfo[]): void {
  useEffect(() => { registerEntities(infos); }, [infos]);
}

// ── Resolution ────────────────────────────────────────────────────────────────
function symbolEntity(label: string, kind: EntityKind, color?: string): EntityInfo {
  const info = tickerInfo(label);
  if (!info) return { kind, name: label.toUpperCase(), subtitle: label.toUpperCase(), category: "Company details unavailable", color };
  const etf = /\b(ETF|Fund|Shares|Treasury|Index)\b/i.test(info.name);
  return {
    kind: etf ? "etf" : kind,
    name: info.name,
    subtitle: [label.toUpperCase(), info.exchange].filter(Boolean).join(" • "),
    category: info.sector,
    color,
  };
}

/** Resolve any (kind, label) to a render-ready EntityInfo. Registry wins (enriched). */
export function resolveEntity(kind: EntityKind, label: string, color?: string): EntityInfo {
  const key = norm(label);
  const hit = registry.get(`${kind}:${key}`) ?? registry.get(key);
  if (hit) return color ? { ...hit, color } : hit;
  if (isSymbolKind(kind)) return symbolEntity(label, kind, color);
  return { kind, name: label, subtitle: KIND_LABEL[kind], color };
}

// ── Builders — let any page produce dynamic entities without heavy deps ────────
export function themeEntity(label: string, o: { confidence?: number; momentum?: string; beneficiaries?: string[]; primarySector?: string; color?: string }): EntityInfo {
  const rows: EntityRow[] = [];
  if (o.confidence != null) rows.push({ label: "Current Conviction", values: [String(Math.round(o.confidence))] });
  if (o.momentum) rows.push({ label: "Momentum", values: [cap(o.momentum)] });
  if (o.beneficiaries?.length) rows.push({ label: "Top Beneficiaries", values: o.beneficiaries.slice(0, 3) });
  if (o.primarySector) rows.push({ label: "Primary Sector", values: [o.primarySector] });
  return { kind: "theme", name: label, subtitle: "Theme", rows, color: o.color };
}

export function sectorEntity(label: string, o: { conviction?: number; leadingThemes?: string[]; topCompanies?: string[]; color?: string }): EntityInfo {
  const rows: EntityRow[] = [];
  if (o.conviction != null) rows.push({ label: "Current Conviction", values: [String(Math.round(o.conviction))] });
  if (o.leadingThemes?.length) rows.push({ label: "Leading Themes", values: o.leadingThemes.slice(0, 2) });
  if (o.topCompanies?.length) rows.push({ label: "Top Companies", values: o.topCompanies.slice(0, 3) });
  return { kind: "sector", name: label, subtitle: "Sector", rows, color: o.color };
}

/** Enriched ticker (e.g. on the Feed): static identity + its theme exposure. */
export function tickerEntity(symbol: string, o: { exposureTheme?: string; conviction?: number; relatedThemes?: string[]; color?: string }): EntityInfo {
  const info = tickerInfo(symbol);
  const rows: EntityRow[] = [];
  if (o.exposureTheme) rows.push({ label: "Theme Exposure", values: [o.exposureTheme] });
  if (o.conviction != null) rows.push({ label: "Current Conviction", values: [String(Math.round(o.conviction))] });
  if (o.relatedThemes?.length) rows.push({ label: "Related Themes", values: o.relatedThemes.slice(0, 3) });
  return {
    kind: "ticker",
    id: symbol.toUpperCase(),
    name: info?.name ?? symbol.toUpperCase(),
    subtitle: [symbol.toUpperCase(), info?.exchange].filter(Boolean).join(" • "),
    category: info?.sector,
    rows,
    color: o.color,
  };
}

export function macroEntity(label: string, note?: string): EntityInfo {
  return { kind: "macro", name: label, subtitle: "Macro Driver", rows: note ? [{ label: "Drives", values: [note] }] : undefined };
}
