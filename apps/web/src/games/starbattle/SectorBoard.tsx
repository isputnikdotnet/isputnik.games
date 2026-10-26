import { useRef, useState, type PointerEvent } from "react";
import { StarBattle, type Vessel } from "@isputnik/games-engine";

// One sector of the star chart as an SVG: a veil over the arena's space
// backdrop behind the grid, lettered columns and numbered rows, craft as
// capsules with a cockpit at the nose, a ringed beacon on a square known to be
// empty (a shot into space, or the debris field around a destroyed craft), a
// burst on a lit square for a hit, a dimmed hull for a destroyed craft. The
// same component draws the
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

/** How far a finger may drift (px) and still be a tap, not a swipe. */
const TAP_SLOP = 10;

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
  // A finger down on the board, until it lifts: a tap if it stayed put, the
  // start of a swipe between the boards if it travelled.
  const touch = useRef<{ id: number; x: number; y: number } | null>(null);
  const span = size + 1;

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
      marks.push(
        <g key={`m${i}`} className="star-miss">
          <circle className="star-miss-ring" cx={cx} cy={cy} r={0.19} />
          <circle className="star-miss-dot" cx={cx} cy={cy} r={0.055} />
        </g>
      );
    } else if (shots[i] === StarBattle.HIT) {
      marks.push(
        <g key={`h${i}`}>
          <rect className="star-hit-cell" x={x + 1.04} y={y + 1.04} width={0.92} height={0.92} rx={0.12} />
          <polygon className="star-hit" points={burst(cx, cy, 0.42, 0.19)} />
        </g>
      );
    }
  }

  return (
    <svg
      className={`star-board is-${kind}${canTarget ? " is-live" : ""}`}
      viewBox={`0 0 ${span} ${span}`}
      role="img"
      aria-label={label}
      onPointerMove={(event) => {
        if (event.pointerType === "touch") {
          const down = touch.current;
          if (down && down.id === event.pointerId && Math.hypot(event.clientX - down.x, event.clientY - down.y) > TAP_SLOP) touch.current = null;
          return;
        }
        const cell = cellFrom(event);
        setHover(targetable(cell) ? cell : null);
        onHover?.(cell);
      }}
      onPointerLeave={() => {
        setHover(null);
        onHover?.(null);
      }}
      onPointerDown={(event) => {
        if (event.button !== 0 || !onCell) return;
        // A finger lands on lift, so a swipe to the other board fires nothing.
        if (event.pointerType === "touch") {
          touch.current = { id: event.pointerId, x: event.clientX, y: event.clientY };
          return;
        }
        // A mouse or a pen: pointer down, not click, so the shot lands at once.
        const cell = cellFrom(event);
        if (cell) {
          setHover(null);
          onCell(cell.x, cell.y);
        }
      }}
      onPointerUp={(event) => {
        const down = touch.current;
        touch.current = null;
        if (!down || down.id !== event.pointerId || !onCell) return;
        const cell = cellFrom(event);
        if (cell) onCell(cell.x, cell.y);
      }}
      onPointerCancel={() => {
        // The browser took the gesture for a scroll.
        touch.current = null;
      }}
    >
      {/* A veil over the grid only; the labels sit on the arena's backdrop. */}
      <rect className="star-bg" x={1} y={1} width={size} height={size} />
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
      {lastShot && <rect className="star-last" x={lastShot.x + 1.08} y={lastShot.y + 1.08} width={0.84} height={0.84} rx={0.14} />}
      {hover && <rect className="star-aim" x={hover.x + 1.08} y={hover.y + 1.08} width={0.84} height={0.84} rx={0.14} />}
    </svg>
  );
}
