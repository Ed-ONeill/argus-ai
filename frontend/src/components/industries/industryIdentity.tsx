"use client";

import {
  Cpu, Code2, Satellite, Flame, Landmark, Factory,
  ShoppingBag, Dna, Building2, Bitcoin, Zap, RadioTower,
  type LucideIcon,
} from "lucide-react";

/**
 * Industry identity system — gives every industry a distinct visual signature so
 * a page is recognisable before a word is read. Two pieces:
 *   • INDUSTRY_ICON — a thin-line institutional lucide icon per industry.
 *   • IndustryArtwork — an extremely faint (~6%), monochrome, schematic line
 *     motif rendered behind the hero. Abstract engineering schematics, never
 *     stock imagery; drawn with currentColor so the caller controls tint+opacity.
 */

// ── Icons ────────────────────────────────────────────────────────────────────────

export const INDUSTRY_ICON: Record<string, LucideIcon> = {
  "semiconductors":    Cpu,
  "software":          Code2,
  "aerospace-defense": Satellite,
  "energy":            Flame,
  "financials":        Landmark,
  "industrials":       Factory,
  "consumer":          ShoppingBag,
  "healthcare":        Dna,
  "real-estate":       Building2,
  "crypto":            Bitcoin,
  "utilities":         Zap,
  "media-telecom":     RadioTower,
};

export function industryIcon(slug: string): LucideIcon {
  return INDUSTRY_ICON[slug] ?? Building2;
}

// ── Artwork — abstract monochrome schematics (currentColor, thin strokes) ───────

function Wafer() {
  // Semiconductors — silicon wafer + die grid
  return (
    <g fill="none" stroke="currentColor" strokeWidth={1}>
      <circle cx={150} cy={120} r={104} />
      <circle cx={150} cy={120} r={70} strokeOpacity={0.6} />
      {Array.from({ length: 7 }).map((_, r) =>
        Array.from({ length: 7 }).map((_, c) => {
          const x = 80 + c * 23, y = 50 + r * 23;
          return <rect key={`${r}-${c}`} x={x} y={y} width={18} height={18} rx={2} strokeOpacity={0.5} />;
        }),
      )}
    </g>
  );
}

function CodeSchematic() {
  // Software — nested brackets + flow nodes
  return (
    <g fill="none" stroke="currentColor" strokeWidth={1.1} strokeLinecap="round">
      <path d="M70 50 L30 120 L70 190" />
      <path d="M230 50 L270 120 L230 190" />
      <path d="M120 60 L180 180" strokeOpacity={0.5} />
      {[60, 120, 180].map((y, i) => <circle key={i} cx={150} cy={y} r={6} fill="currentColor" fillOpacity={0.25} stroke="none" />)}
      <path d="M150 66 L150 114 M150 126 L150 174" strokeOpacity={0.45} />
    </g>
  );
}

function Radar() {
  // Aerospace & Defense — radar sweep + orbit
  return (
    <g fill="none" stroke="currentColor" strokeWidth={1}>
      {[40, 72, 104].map(r => <circle key={r} cx={150} cy={130} r={r} strokeOpacity={0.55} />)}
      <path d="M150 130 L150 26 M150 130 L246 178" strokeOpacity={0.7} />
      <ellipse cx={150} cy={130} rx={120} ry={42} strokeOpacity={0.4} transform="rotate(-18 150 130)" />
      <circle cx={244} cy={86} r={4} fill="currentColor" stroke="none" />
    </g>
  );
}

function Pylon() {
  // Energy / Utilities — transmission pylons + power lines
  return (
    <g fill="none" stroke="currentColor" strokeWidth={1} strokeLinecap="round">
      {[70, 160, 250].map((x, i) => (
        <g key={i}>
          <path d={`M${x - 18} 200 L${x} 60 L${x + 18} 200 M${x - 12} 150 L${x + 12} 150 M${x - 8} 110 L${x + 8} 110`} />
        </g>
      ))}
      <path d="M52 78 Q160 110 268 78 M52 96 Q160 128 268 96" strokeOpacity={0.5} />
    </g>
  );
}

function Exchange() {
  // Financials — candlesticks + market grid
  return (
    <g stroke="currentColor" strokeWidth={1} fill="none">
      <path d="M30 180 L270 180 M30 60 L270 60" strokeOpacity={0.4} />
      {[55, 95, 135, 175, 215, 255].map((x, i) => {
        const h = [70, 40, 90, 55, 110, 75][i], y = 180 - h;
        return (
          <g key={x}>
            <path d={`M${x} ${y - 14} L${x} ${y + h + 14}`} strokeOpacity={0.6} />
            <rect x={x - 9} y={y} width={18} height={h} rx={1} strokeOpacity={0.7} />
          </g>
        );
      })}
    </g>
  );
}

function Gears() {
  // Industrials — concentric machinery
  const cog = (cx: number, cy: number, r: number) => (
    <g>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="currentColor" strokeWidth={1} />
      <circle cx={cx} cy={cy} r={r * 0.45} fill="none" stroke="currentColor" strokeWidth={1} strokeOpacity={0.6} />
      {Array.from({ length: 10 }).map((_, i) => {
        const a = (i / 10) * Math.PI * 2;
        return <line key={i} x1={cx + Math.cos(a) * r} y1={cy + Math.sin(a) * r} x2={cx + Math.cos(a) * (r + 9)} y2={cy + Math.sin(a) * (r + 9)} stroke="currentColor" strokeWidth={1} />;
      })}
    </g>
  );
  return <>{cog(120, 110, 56)}{cog(214, 168, 34)}</>;
}

function Molecule() {
  // Healthcare — hexagonal molecular lattice
  const hex = (cx: number, cy: number, r = 30) => {
    const pts = Array.from({ length: 6 }).map((_, i) => {
      const a = (i / 6) * Math.PI * 2 - Math.PI / 2;
      return `${(cx + Math.cos(a) * r).toFixed(1)},${(cy + Math.sin(a) * r).toFixed(1)}`;
    }).join(" ");
    return <polygon points={pts} fill="none" stroke="currentColor" strokeWidth={1} />;
  };
  return (
    <g>
      {hex(110, 90)}{hex(162, 120)}{hex(110, 150)}{hex(214, 90)}
      <g stroke="currentColor" strokeWidth={1} strokeOpacity={0.5}>
        <line x1={132} y1={102} x2={140} y2={108} /><line x1={140} y1={132} x2={132} y2={138} />
        <line x1={184} y1={108} x2={192} y2={102} />
      </g>
      {[110, 162, 214].map((x, i) => <circle key={i} cx={x} cy={[90, 120, 90][i]} r={3.5} fill="currentColor" stroke="none" />)}
    </g>
  );
}

function Cart() {
  // Consumer — abstract retail flow
  return (
    <g fill="none" stroke="currentColor" strokeWidth={1.1} strokeLinecap="round">
      <path d="M60 70 L90 70 L112 160 L210 160 L228 96 L104 96" />
      <circle cx={120} cy={188} r={10} /><circle cx={200} cy={188} r={10} />
      <path d="M130 70 L138 130 M160 70 L164 130 M190 70 L188 130" strokeOpacity={0.45} />
    </g>
  );
}

function Skyline() {
  // Real Estate — building elevations
  return (
    <g fill="none" stroke="currentColor" strokeWidth={1}>
      {[[50, 110, 40], [98, 60, 46], [150, 140, 44], [200, 84, 42], [248, 120, 40]].map(([x, h, w], i) => (
        <g key={i}>
          <rect x={x} y={210 - h} width={w} height={h} />
          {Array.from({ length: Math.floor(h / 22) }).map((_, r) =>
            [0, 1].map(c => <rect key={`${r}-${c}`} x={x + 8 + c * (w - 22)} y={210 - h + 12 + r * 22} width={6} height={8} strokeOpacity={0.4} />),
          )}
        </g>
      ))}
    </g>
  );
}

function Blockchain() {
  // Crypto — linked blocks
  return (
    <g fill="none" stroke="currentColor" strokeWidth={1}>
      {[[70, 80], [180, 80], [125, 170], [235, 150]].map(([x, y], i) => (
        <rect key={i} x={x} y={y} width={48} height={48} rx={4} transform={`rotate(45 ${x + 24} ${y + 24})`} strokeOpacity={0.7} />
      ))}
      <g stroke="currentColor" strokeWidth={1} strokeOpacity={0.45}>
        <line x1={118} y1={104} x2={180} y2={104} /><line x1={118} y1={120} x2={149} y2={170} /><line x1={228} y1={104} x2={235} y2={150} />
      </g>
    </g>
  );
}

function Broadcast() {
  // Media & Telecom — broadcast tower + signal arcs
  return (
    <g fill="none" stroke="currentColor" strokeWidth={1} strokeLinecap="round">
      <path d="M150 60 L120 210 M150 60 L180 210 M132 150 L168 150 M126 180 L174 180" />
      <circle cx={150} cy={60} r={5} fill="currentColor" stroke="none" />
      {[26, 48, 70].map((r, i) => (
        <g key={i} strokeOpacity={0.6 - i * 0.15}>
          <path d={`M${150 - r} ${60} A ${r} ${r} 0 0 1 ${150} ${60 - r}`} />
          <path d={`M${150 + r} ${60} A ${r} ${r} 0 0 0 ${150} ${60 - r}`} />
        </g>
      ))}
    </g>
  );
}

const ARTWORK: Record<string, () => React.ReactElement> = {
  "semiconductors":    Wafer,
  "software":          CodeSchematic,
  "aerospace-defense": Radar,
  "energy":            Pylon,
  "financials":        Exchange,
  "industrials":       Gears,
  "consumer":          Cart,
  "healthcare":        Molecule,
  "real-estate":       Skyline,
  "crypto":            Blockchain,
  "utilities":         Pylon,
  "media-telecom":     Broadcast,
};

/** Faint monochrome industry schematic for behind a hero. Caller positions it
 *  (e.g. absolute, right side) and sets `color`; opacity stays ≤ ~7%. */
export function IndustryArtwork({ slug, color, className, style }: {
  slug: string; color?: string; className?: string; style?: React.CSSProperties;
}) {
  const Motif = ARTWORK[slug] ?? Wafer;
  return (
    <svg
      viewBox="0 0 300 240"
      aria-hidden
      className={className}
      style={{ color: color ?? "#ffffff", opacity: 0.06, ...style }}
      preserveAspectRatio="xMidYMid meet"
    >
      <Motif />
    </svg>
  );
}
