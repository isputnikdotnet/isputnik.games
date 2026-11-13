// The "Your turn" card's backdrop: misty mountains under a ringed planet and a
// few stars, drawn in the theme's accent so it suits every board style and
// both light and dark. Decoration only — hidden from assistive technology.
const STARS: [number, number, number][] = [
  [118, 92, 1.6], [196, 70, 2.2], [262, 48, 1.4], [318, 74, 2.6], [372, 38, 1.5],
  [430, 58, 1.8], [446, 82, 1.2], [520, 96, 1.9], [560, 30, 1.3], [84, 40, 1.1]
];

export function Skyline() {
  return (
    <svg className="skyline" viewBox="0 0 640 200" preserveAspectRatio="xMaxYMax meet" aria-hidden="true" focusable="false">
      <defs>
        <radialGradient id="skyline-glow" cx="62%" cy="70%" r="60%">
          <stop offset="0" stopColor="var(--accent)" stopOpacity="0.38" />
          <stop offset="0.55" stopColor="var(--accent)" stopOpacity="0.12" />
          <stop offset="1" stopColor="var(--accent)" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="skyline-peak" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--accent)" stopOpacity="0.55" />
          <stop offset="1" stopColor="var(--accent)" stopOpacity="0.08" />
        </linearGradient>
        <linearGradient id="skyline-snow" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0.55" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="skyline-planet" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0.5" />
          <stop offset="1" stopColor="var(--accent)" stopOpacity="0.35" />
        </linearGradient>
      </defs>
      <rect width="640" height="200" fill="url(#skyline-glow)" />

      {/* Far range, then the tall peak, then the low hills in front. */}
      <path d="M150 170 L250 118 L320 148 L388 116 L450 150 L520 136 L640 160 L640 200 L150 200 Z" fill="var(--accent)" opacity="0.14" />
      <path d="M210 176 L300 132 L352 154 L432 74 L512 140 L556 124 L640 152 L640 200 L210 200 Z" fill="url(#skyline-peak)" />
      <path d="M432 74 L452 96 L440 94 L430 112 L418 98 L404 104 Z" fill="url(#skyline-snow)" />
      <path d="M300 132 L314 142 L304 141 L298 150 L290 140 Z" fill="url(#skyline-snow)" />
      <path d="M90 186 C170 160 250 178 330 168 C420 156 470 180 560 170 C600 166 626 170 640 172 L640 200 L90 200 Z" fill="var(--accent)" opacity="0.22" />
      <path d="M180 196 C260 182 340 194 420 186 C500 178 580 190 640 186 L640 200 L180 200 Z" fill="var(--accent)" opacity="0.3" />

      {/* The planet and its ring: the ring's far half behind, its near half in front. */}
      <g transform="translate(560 66)">
        <path d="M-40 6 A42 11 -14 0 1 40 -6" fill="none" stroke="var(--accent)" strokeOpacity="0.55" strokeWidth="2.4" />
        <circle r="24" fill="url(#skyline-planet)" />
        <path d="M40 -6 A42 11 -14 0 1 -40 6" fill="none" stroke="var(--accent)" strokeOpacity="0.9" strokeWidth="2.4" />
      </g>

      <g fill="var(--accent)">
        {STARS.map(([x, y, r]) => (
          <path key={`${x}-${y}`} d={`M${x} ${y - r * 2.4} L${x + r * 0.5} ${y - r * 0.5} L${x + r * 2.4} ${y} L${x + r * 0.5} ${y + r * 0.5} L${x} ${y + r * 2.4} L${x - r * 0.5} ${y + r * 0.5} L${x - r * 2.4} ${y} L${x - r * 0.5} ${y - r * 0.5} Z`} opacity="0.75" />
        ))}
      </g>
    </svg>
  );
}
