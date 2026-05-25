interface ArgusLogoProps {
  variant?: "icon" | "full";
  iconSize?: number;
  wordmarkSize?: number;
  className?: string;
}

function MarkSVG({ width, height }: { width: number; height: number }) {
  return (
    <svg width={width} height={height} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M12 3 L2.5 22"  stroke="rgba(255,255,255,0.90)" strokeWidth="2.2" strokeLinecap="round" />
      <path d="M12 3 L21.5 22" stroke="rgba(255,255,255,0.90)" strokeWidth="2.2" strokeLinecap="round" />
      <line x1="6" y1="15" x2="18" y2="15" stroke="rgba(255,255,255,0.90)" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

export function ArgusLogo({
  variant    = "icon",
  iconSize   = 28,
  wordmarkSize = 36,
  className,
}: ArgusLogoProps) {
  const radius = Math.round(iconSize * 0.225);
  const svgW   = Math.round(iconSize * 0.52);
  const svgH   = Math.round(iconSize * 0.60);

  const mark = (
    <div
      style={{
        width: iconSize,
        height: iconSize,
        borderRadius: radius,
        background: "linear-gradient(145deg, #1a3060 0%, #1e4888 100%)",
        boxShadow: "0 1px 8px rgba(30,72,136,0.45), inset 0 1px 0 rgba(255,255,255,0.10)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
      }}
    >
      <MarkSVG width={svgW} height={svgH} />
    </div>
  );

  if (variant === "icon") {
    return <div className={className}>{mark}</div>;
  }

  return (
    <div className={className} style={{ display: "flex", alignItems: "center", gap: Math.round(iconSize * 0.48) }}>
      {mark}
      <div style={{
        width: 1,
        height: Math.round(iconSize * 0.72),
        background: "rgba(255,255,255,0.10)",
        flexShrink: 0,
      }} />
      <span style={{
        fontSize: wordmarkSize,
        fontWeight: 700,
        letterSpacing: "0.22em",
        color: "rgba(255,255,255,0.94)",
        lineHeight: 1,
      }}>
        ARGUS
      </span>
    </div>
  );
}
