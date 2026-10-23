import { useMemo, useState, type PointerEvent } from "react";
import { StarBattle, seededRandom, type Vessel } from "@isputnik/games-engine";

// One sector of the star chart as an SVG: a dark field with a scatter of stars
// behind the grid, lettered columns and numbered rows, craft as capsules with
// a cockpit at the nose, a faint dot for a shot into empty space, a burst for a
// hit, a dimmed hull for a destroyed craft. The same component draws the
// viewer's own sector (every craft, the other side's shots on it) and the
// enemy's (only the shots fired so far and the craft already destroyed).
// Coordinates are board units with one unit of margin for the labels, so it
// scales to any width.
export interface Cell {
  x: number;
  y: number;
}

export function cellName(x: number, y: number, columns: string): string {
  return `${columns[x] ?? "?"}${y + 1}`;
}

/** A fixed scatter of stars, the same for every board of a size. */
function starfield(size: number): { x: number; y: number; r: number }[] {
  const random = seededRandom(size * 7919);
  const stars: { x: number; y: number; r: number }[] = [];
  for (let i = 0; i < size * size * 0.6; i++) {
    stars.push({ x: random() * (size + 1), y: random() * (size + 1), r: 0.03 + random() * 0.05 });
  }
  return stars;
}

/** An eight-point burst around a centre, for a hit. */
function burst(cx: number, cy: number, outer: number, inner: number): string {
  const points: string[] = [];
  for (let i = 0; i < 16; i++) {
    const angle = (Math.PI * i) / 8;
    const radius = i % 2 === 0 ? outer : inner;
    points.push(`${(cx + Math.cos(angle) * radius).toFixed(3)},${(cy + Math.sin(angle) * radius).toFixed(3)}`);
  }
  return points.join(" ");
}

export function SectorBoard({
  size,
  shots,
  vessels,
  kind,
  lastShot = null,
  ghost = null,
  ghostValid = true,
  canTarget,
  onCell,
  onHover,
  columns,
  label
}: {
  size: number;
  /** What is known of this sector's squares: UNKNOWN, MISS or HIT per cell. */
  shots: readonly number[];
  /** The craft to draw: the whole fleet of an own sector, the destroyed ones of an enemy's. */
  vessels: readonly Vessel[];
  kind: "own" | "enemy";
  lastShot?: Cell | null;
  /** A craft being deployed, drawn where the pointer is. */
  ghost?: Vessel | null;
  ghostValid?: boolean;
  /** Whether a square may be tapped now — shows the aim under the pointer. */
  canTarget?: (x: number, y: number) => boolean;
  onCell?: (x: number, y: number) => void;
  onHover?: (cell: Cell | null) => void;
  /** The ten column letters, in the interface language. */
  columns: string;
  label: string;
}) {
  const [hover, setHover] = useState<Cell | null>(null);
  const span = size + 1;
  const stars = useMemo(() => starfield(size), [size]);

  const cellFrom = (event: PointerEvent<SVGSVGElement>): Cell | null => {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = Math.floor(((event.clientX - rect.left) / rect.width) * span) - 1;
    const y = Math.floor(((event.clientY - rect.top) / rect.height) * span) - 1;
    if (x < 0 || y < 0 || x >= size || y >= size) return null;
    return { x, y };
  };
  const targetable = (cell: Cell | null): cell is Cell => Boolean(cell && canTarget && canTarget(cell.x, cell.y));

  const lines: number[] = [];
  for (let i = 0; i <= size; i++) lines.push(i + 1);

  // A capsule along the craft's length with a cockpit dot at the nose.
  const craft = (vessel: Vessel, className: string, key: string) => {
    const w = (vessel.horizontal ? vessel.length : 1) - 0.3;
    const h = (vessel.horizontal ? 1 : vessel.length) - 0.3;
    return (
      <g key={key} className={className}>
        <rect x={vessel.x + 1.15} y={vessel.y + 1.15} width={w} height={h} rx={0.35} />
        <circle className="star-cockpit" cx={vessel.x + 1.5} cy={vessel.y + 1.5} r={0.14} />
      </g>
    );
  };

  const marks: React.ReactNode[] = [];
  for (let i = 0; i < shots.length; i++) {
    const x = i % size;
    const y = (i - x) / size;
    const cx = x + 1.5;
    const cy = y + 1.5;
    if (shots[i] === StarBattle.MISS) {
      marks.push(<circle key={`m${i}`} className="star-miss" cx={cx} cy={cy} r={0.13} />);
    } else if (shots[i] === StarBattle.HIT) {
      marks.push(<polygon key={`h${i}`} className="star-hit" points={burst(cx, cy, 0.4, 0.17)} />);
    }
  }

  return (
    <svg
      className={`star-board is-${kind}${canTarget ? " is-live" : ""}`}
      viewBox={`0 0 ${span} ${span}`}
      role="img"
      aria-label={label}
      onPointerMove={(event) => {
        if (event.pointerType === "touch") return;
        const cell = cellFrom(event);
        setHover(targetable(cell) ? cell : null);
        onHover?.(cell);
      }}
      onPointerLeave={() => {
        setHover(null);
        onHover?.(null);
      }}
      onPointerDown={(event) => {
        // Pointer down, not click: a tap on a phone should land at once.
        if (event.button !== 0 || !onCell) return;
        const cell = cellFrom(event);
        if (cell) {
          setHover(null);
          onCell(cell.x, cell.y);
        }
      }}
    >
      {/* The field covers the labels too, so they read on a light page. */}
      <rect className="star-bg" x={0} y={0} width={span} height={span} rx={0.3} />
      <g className="star-stars" aria-hidden="true">
        {stars.map((star, index) => <circle key={index} cx={star.x} cy={star.y} r={star.r} />)}
      </g>
      <g className="star-labels" aria-hidden="true">
        {Array.from({ length: size }, (_, i) => (
          <text key={`c${i}`} x={i + 1.5} y={0.72} textAnchor="middle">{columns[i] ?? ""}</text>
        ))}
        {Array.from({ length: size }, (_, i) => (
          <text key={`r${i}`} x={0.5} y={i + 1.72} textAnchor="middle">{i + 1}</text>
        ))}
      </g>
      <g className="star-grid">
        {lines.map((v) => <line key={`v${v}`} x1={v} y1={1} x2={v} y2={span} />)}
        {lines.map((v) => <line key={`h${v}`} x1={1} y1={v} x2={span} y2={v} />)}
      </g>
      <g className="star-vessels">
        {vessels.map((vessel, index) => craft(
          vessel,
          `star-vessel${kind === "enemy" || StarBattle.isDestroyed(vessel, shots, size) ? " is-destroyed" : ""}`,
          `s${index}`
        ))}
        {ghost && craft(ghost, `star-ghost${ghostValid ? "" : " is-invalid"}`, "ghost")}
      </g>
      <g className="star-marks">{marks}</g>
      {lastShot && <rect className="star-last" x={lastShot.x + 1.06} y={lastShot.y + 1.06} width={0.88} height={0.88} rx={0.15} />}
      {hover && <rect className="star-aim" x={hover.x + 1.06} y={hover.y + 1.06} width={0.88} height={0.88} rx={0.15} />}
    </svg>
  );
}
