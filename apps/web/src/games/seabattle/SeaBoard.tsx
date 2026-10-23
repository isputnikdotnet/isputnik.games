import { useState, type PointerEvent } from "react";
import { SeaBattle, type Ship } from "@isputnik/games-engine";

// One sea as an SVG, the way it is drawn on squared paper: lettered columns,
// numbered rows, ships as rounded bars, a dot for a miss, a cross for a hit, a
// darker bar for a sunk ship. The same component draws the viewer's own sea
// (every ship, the other side's shots on it) and the enemy's (only the shots
// fired so far and the ships already sunk). Coordinates are board units with
// one unit of margin for the labels, so it scales to any width.
export interface Cell {
  x: number;
  y: number;
}

export function cellName(x: number, y: number, columns: string): string {
  return `${columns[x] ?? "?"}${y + 1}`;
}

export function SeaBoard({
  size,
  shots,
  ships,
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
  /** What is known of this sea's squares: UNKNOWN, MISS or HIT per cell. */
  shots: readonly number[];
  /** The ships to draw: the whole fleet of an own sea, the sunk ones of an enemy's. */
  ships: readonly Ship[];
  kind: "own" | "enemy";
  lastShot?: Cell | null;
  /** A ship being laid, drawn where the pointer is. */
  ghost?: Ship | null;
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

  const shipRect = (ship: Ship, className: string, key: string) => (
    <rect
      key={key}
      className={className}
      x={ship.x + 1.12}
      y={ship.y + 1.12}
      width={(ship.horizontal ? ship.length : 1) - 0.24}
      height={(ship.horizontal ? 1 : ship.length) - 0.24}
      rx={0.3}
    />
  );

  const marks: React.ReactNode[] = [];
  for (let i = 0; i < shots.length; i++) {
    const x = i % size;
    const y = (i - x) / size;
    const cx = x + 1.5;
    const cy = y + 1.5;
    if (shots[i] === SeaBattle.MISS) {
      marks.push(<circle key={`m${i}`} className="sea-miss" cx={cx} cy={cy} r={0.12} />);
    } else if (shots[i] === SeaBattle.HIT) {
      marks.push(
        <g key={`h${i}`} className="sea-hit">
          <line x1={cx - 0.3} y1={cy - 0.3} x2={cx + 0.3} y2={cy + 0.3} />
          <line x1={cx - 0.3} y1={cy + 0.3} x2={cx + 0.3} y2={cy - 0.3} />
        </g>
      );
    }
  }

  return (
    <svg
      className={`sea-board is-${kind}${canTarget ? " is-live" : ""}`}
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
      <rect className="sea-bg" x={1} y={1} width={size} height={size} />
      <g className="sea-labels" aria-hidden="true">
        {Array.from({ length: size }, (_, i) => (
          <text key={`c${i}`} x={i + 1.5} y={0.72} textAnchor="middle">{columns[i] ?? ""}</text>
        ))}
        {Array.from({ length: size }, (_, i) => (
          <text key={`r${i}`} x={0.5} y={i + 1.72} textAnchor="middle">{i + 1}</text>
        ))}
      </g>
      <g className="sea-grid">
        {lines.map((v) => <line key={`v${v}`} x1={v} y1={1} x2={v} y2={span} />)}
        {lines.map((v) => <line key={`h${v}`} x1={1} y1={v} x2={span} y2={v} />)}
      </g>
      <g className="sea-ships">
        {ships.map((ship, index) => shipRect(
          ship,
          `sea-ship${kind === "enemy" || SeaBattle.isSunk(ship, shots, size) ? " is-sunk" : ""}`,
          `s${index}`
        ))}
        {ghost && shipRect(ghost, `sea-ghost${ghostValid ? "" : " is-invalid"}`, "ghost")}
      </g>
      <g className="sea-marks">{marks}</g>
      {lastShot && <rect className="sea-last" x={lastShot.x + 1.06} y={lastShot.y + 1.06} width={0.88} height={0.88} rx={0.15} />}
      {hover && <rect className="sea-aim" x={hover.x + 1.06} y={hover.y + 1.06} width={0.88} height={0.88} rx={0.15} />}
    </svg>
  );
}
