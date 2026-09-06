/**
 * Decorative football pitch outline. Scalable, inherits color via `currentColor`.
 */
export function PitchSVG({ className = "", opacity = 0.06 }: { className?: string; opacity?: number }) {
  return (
    <svg className={className} viewBox="0 0 800 500" fill="none"
      xmlns="http://www.w3.org/2000/svg" style={{ opacity }}>
      {/* Outer boundary */}
      <rect x="20" y="20" width="760" height="460" stroke="currentColor" strokeWidth="2" />
      {/* Halfway line */}
      <line x1="400" y1="20" x2="400" y2="480" stroke="currentColor" strokeWidth="2" />
      {/* Centre circle */}
      <circle cx="400" cy="250" r="80" stroke="currentColor" strokeWidth="2" />
      <circle cx="400" cy="250" r="4" fill="currentColor" />
      {/* Left penalty box */}
      <rect x="20" y="155" width="110" height="190" stroke="currentColor" strokeWidth="2" />
      <rect x="20" y="205" width="50" height="90" stroke="currentColor" strokeWidth="2" />
      <circle cx="130" cy="250" r="35" stroke="currentColor" strokeWidth="2" strokeDasharray="8 4" />
      {/* Right penalty box */}
      <rect x="670" y="155" width="110" height="190" stroke="currentColor" strokeWidth="2" />
      <rect x="730" y="205" width="50" height="90" stroke="currentColor" strokeWidth="2" />
      <circle cx="670" cy="250" r="35" stroke="currentColor" strokeWidth="2" strokeDasharray="8 4" />
      {/* Corner arcs */}
      <path d="M20,20 Q30,20 30,30" stroke="currentColor" strokeWidth="2" />
      <path d="M780,20 Q770,20 770,30" stroke="currentColor" strokeWidth="2" />
      <path d="M20,480 Q30,480 30,470" stroke="currentColor" strokeWidth="2" />
      <path d="M780,480 Q770,480 770,470" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}