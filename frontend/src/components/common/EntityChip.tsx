"use client";

import { useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { resolveEntity, isSymbolKind, type EntityKind, type EntityInfo } from "@/lib/entity";

// Every entity tooltip is the SAME width — one Bloomberg-style visual language.
const TOOLTIP_WIDTH = 208;

/**
 * EntityChip — the standard entity primitive across Argus. Renders any entity
 * (ticker / company / sector / theme / macro / ETF / asset) and, on hover, shows
 * one consistent institutional tooltip resolved from the Entity system. Tickers
 * resolve statically; sector/theme/macro resolve from the runtime registry (or an
 * explicit `info`). Portaled to <body> with a fixed position, so it never shifts
 * layout and is never clipped by dense cards, graph panels or sidebars.
 */

type Size = "xs" | "sm" | "md";
const SIZE: Record<Size, string> = { xs: "text-[8.5px]", sm: "text-[9.5px]", md: "text-[11px]" };

interface Props {
  kind:       EntityKind;
  label:      string;               // visible text
  color?:     string;
  info?:      EntityInfo;           // explicit override — skips resolution
  size?:      Size;                 // omit to let `className` govern size (drop-in)
  mono?:      boolean;              // default: symbol kinds true, others false
  className?: string;
  style?:     React.CSSProperties;
}

export function EntityChip({ kind, label, color, info, size, mono, className = "", style }: Props) {
  const ref = useRef<HTMLSpanElement>(null);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);

  const show = useCallback(() => {
    const r = ref.current?.getBoundingClientRect();
    if (r) setPos({ x: r.left + r.width / 2, y: r.top });
  }, []);
  const hide = useCallback(() => setPos(null), []);

  const e = info ?? resolveEntity(kind, label, color);
  const symbol = isSymbolKind(e.kind);
  const useMono = mono ?? symbol;

  return (
    <span
      ref={ref}
      onMouseEnter={show}
      onMouseLeave={hide}
      className={`${size ? SIZE[size] : ""} ${useMono ? "font-mono font-bold" : ""} ${className}`.trim()}
      style={{ color, ...style }}
    >
      {label}
      {typeof document !== "undefined" && createPortal(
        <AnimatePresence>
          {pos && (
            <motion.div
              initial={{ opacity: 0, y: 3 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 3 }}
              transition={{ duration: 0.12, ease: "easeOut" }}
              className="pointer-events-none"
              style={{ position: "fixed", left: pos.x, top: pos.y - 8, transform: "translate(-50%, -100%)", zIndex: 9999 }}
            >
              <div className="rounded-md px-3 py-2.5"
                style={{ width: TOOLTIP_WIDTH, background: "rgba(8,12,20,0.98)", border: "1px solid rgba(255,255,255,0.13)", boxShadow: "0 12px 30px rgba(0,0,0,0.55)" }}>
                {/* Header — title, identity sub-line, category */}
                <p className="text-[12px] font-semibold leading-tight" style={{ color: "rgba(255,255,255,0.95)" }}>{e.name}</p>
                {e.subtitle && <p className="text-[9.5px] mt-0.5" style={{ color: "rgba(255,255,255,0.5)" }}>{e.subtitle}</p>}
                {e.category && <p className="text-[9.5px] mt-1.5" style={{ color: "rgba(255,255,255,0.62)" }}>{e.category}</p>}
                {/* Divider + stacked sections */}
                {e.rows && e.rows.length > 0 && (
                  <div className="mt-2.5 pt-2.5 space-y-2.5" style={{ borderTop: "1px solid rgba(255,255,255,0.08)" }}>
                    {e.rows.map((r, i) => (
                      <div key={i}>
                        <p className="text-[7.5px] font-bold uppercase tracking-[0.13em]" style={{ color: "rgba(255,255,255,0.38)" }}>{r.label}</p>
                        {r.values.map((v, j) => (
                          <p key={j} className="text-[10.5px] leading-snug mt-0.5 truncate" style={{ color: "rgba(255,255,255,0.84)" }}>{v}</p>
                        ))}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </span>
  );
}
