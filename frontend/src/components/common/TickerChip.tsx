"use client";

import { EntityChip } from "./EntityChip";

/**
 * TickerChip — the symbol-shaped entry into the unified Entity system. A thin
 * delegate to <EntityChip kind="ticker">, kept as its own export so the many
 * existing ticker call sites stay unchanged while inheriting the shared hover
 * tooltip + future entity behaviour automatically.
 */

type Size = "xs" | "sm" | "md";

interface Props {
  ticker:     string;
  color?:     string;
  size?:      Size;                 // omit to let `className` govern the size (drop-in)
  mono?:      boolean;              // default true (font-mono font-bold)
  className?: string;
  style?:     React.CSSProperties;
}

export function TickerChip({ ticker, color, size, mono = true, className = "", style }: Props) {
  return (
    <EntityChip kind="ticker" label={ticker} color={color} size={size} mono={mono} className={className} style={style} />
  );
}
