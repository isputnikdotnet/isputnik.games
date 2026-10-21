import { useState, type PointerEvent } from "react";
import { useTranslation } from "react-i18next";
import { Dots, type DotsMove, type DotsState, type PlayerIndex } from "@isputnik/games-engine";

// The board as one SVG: grid lines, each side's territory as tinted cells, the
// dots (captured ones dimmed), a ring on the last move, and a ghost dot under the
// pointer where a move is possible. Coordinates are board units — one point per
// unit, centred at (x+0.5, y+0.5) — so it scales to whatever width it is given.
export function DotsBoard({
  state,
  onPlace,
  disabled = false
}: {
  state: DotsState;
  onPlace: (move: DotsMove) => void;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  const [hover, setHover] = useState<DotsMove | null>(null);
  const size = state.size;
  const last = state.moves.length ? state.moves[state.moves.length - 1] : null;
  const turn: PlayerIndex | null = state.status.kind === "playing" ? state.status.turn : null;

  const pointFrom = (event: PointerEvent<SVGSVGElement>): DotsMove | null => {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = Math.floor(((event.clientX - rect.left) / rect.width) * size);
    const y = Math.floor(((event.clientY - rect.top) / rect.height) * size);
    if (x < 0 || y < 0 || x >= size || y >= size) return null;
    return { x, y };
  };

  const canPlay = (p: DotsMove | null): p is DotsMove => Boolean(p && !disabled && turn !== null && Dots.isPlayable(state, p.x, p.y));

  const territories: { x: number; y: number; owner: number }[] = [];
  const dots: { x: number; y: number; owner: number; captured: boolean }[] = [];
  for (let i = 0; i < state.dots.length; i++) {
    const x = i % size;
    const y = (i - x) / size;
    if (state.territory[i]) territories.push({ x, y, owner: state.territory[i] });
    if (state.dots[i]) dots.push({ x, y, owner: state.dots[i], captured: Dots.isCaptured(state, i) });
  }

  const lines: number[] = [];
  for (let i = 0; i < size; i++) lines.push(i + 0.5);

  return (
    <svg
      className={`dots-board${disabled || turn === null ? " is-idle" : ""}`}
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label={t("dots.boardAria", { size })}
      onPointerMove={(event) => {
        if (event.pointerType === "touch") return;
        const p = pointFrom(event);
        setHover(canPlay(p) ? p : null);
      }}
      onPointerLeave={() => setHover(null)}
      onPointerDown={(event) => {
        // Pointer down, not click: a tap on a phone should place at once, with
        // no 300 ms wait and no synthetic click landing after a re-render.
        if (event.button !== 0) return;
        const p = pointFrom(event);
        if (canPlay(p)) {
          setHover(null);
          onPlace(p);
        }
      }}
    >
      <rect className="dots-board-bg" x="0" y="0" width={size} height={size} />
      <g className="dots-grid">
        {lines.map((v) => (
          <line key={`v${v}`} x1={v} y1={0.5} x2={v} y2={size - 0.5} />
        ))}
        {lines.map((v) => (
          <line key={`h${v}`} x1={0.5} y1={v} x2={size - 0.5} y2={v} />
        ))}
      </g>
      <g className="dots-territory">
        {territories.map(({ x, y, owner }) => (
          <rect key={`t${x},${y}`} className={`is-p${owner}`} x={x} y={y} width={1} height={1} />
        ))}
      </g>
      <g className="dots-dots">
        {dots.map(({ x, y, owner, captured }) => (
          <circle
            key={`d${x},${y}`}
            className={`is-p${owner}${captured ? " is-captured" : ""}`}
            cx={x + 0.5}
            cy={y + 0.5}
            r={captured ? 0.2 : 0.3}
          />
        ))}
        {last && <circle className="dots-last" cx={last.x + 0.5} cy={last.y + 0.5} r={0.42} />}
        {hover && turn !== null && (
          <circle className={`dots-ghost is-p${turn + 1}`} cx={hover.x + 0.5} cy={hover.y + 0.5} r={0.3} />
        )}
      </g>
    </svg>
  );
}
