// One domino as SVG, ivory with black pips on every theme (or its oxblood back,
// face down). It fills whatever box it is given; the tone is a class the
// stylesheet dresses (a lit tile that fits, the one picked up, one that does
// not fit, the last one laid).
export type TileTone = "plain" | "playable" | "selected" | "dim" | "last";

const C: [number, number] = [50, 50];
const TL: [number, number] = [25, 25];
const TR: [number, number] = [75, 25];
const BL: [number, number] = [25, 75];
const BR: [number, number] = [75, 75];

/** The pips of one half, in a 100 × 100 square. A six runs along the tile. */
export function pipsOf(n: number, vertical: boolean): [number, number][] {
  const six: [number, number][] = vertical
    ? [[25, 25], [25, 50], [25, 75], [75, 25], [75, 50], [75, 75]]
    : [[25, 25], [50, 25], [75, 25], [25, 75], [50, 75], [75, 75]];
  const sets: [number, number][][] = [[], [C], [TL, BR], [TL, C, BR], [TL, TR, BL, BR], [TL, TR, C, BL, BR], six];
  return sets[n] ?? [];
}

export function DominoTile({
  a,
  b,
  vertical,
  faceDown = false,
  tone = "plain",
  className = ""
}: {
  a: number;
  b: number;
  vertical: boolean;
  faceDown?: boolean;
  tone?: TileTone;
  className?: string;
}) {
  const w = vertical ? 100 : 200;
  const h = vertical ? 200 : 100;
  const second = vertical ? "translate(0 100)" : "translate(100 0)";
  return (
    <svg
      className={`dom-tile is-${tone}${faceDown ? " is-down" : ""} ${className}`.trim()}
      viewBox={`0 0 ${w} ${h}`}
      aria-hidden="true"
      focusable="false"
    >
      <rect className="dom-tile-body" x="2" y="2" width={w - 4} height={h - 4} rx="14" />
      {faceDown ? (
        <>
          <rect className="dom-tile-inlay" x="12" y="12" width={w - 24} height={h - 24} rx="8" />
          <circle className="dom-tile-rivet" cx={w / 2} cy={h / 2} r="7" />
        </>
      ) : (
        <>
          <line className="dom-tile-divider" x1={vertical ? 14 : 100} y1={vertical ? 100 : 14} x2={vertical ? 86 : 100} y2={vertical ? 100 : 86} />
          <g className="dom-tile-pips">
            {pipsOf(a, vertical).map(([x, y]) => <circle key={`a${x},${y}`} cx={x} cy={y} r="9" />)}
            <g transform={second}>
              {pipsOf(b, vertical).map(([x, y]) => <circle key={`b${x},${y}`} cx={x} cy={y} r="9" />)}
            </g>
          </g>
          <circle className="dom-tile-rivet" cx={w / 2} cy={h / 2} r="6" />
        </>
      )}
    </svg>
  );
}
