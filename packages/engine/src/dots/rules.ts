// Dots (Точки): the paper-and-pencil territory game. Two players take turns
// placing a dot on a grid point; a closed chain of your dots around the
// opponent's dots captures them. The variant implemented is the common computer
// one (docs/plan.md → Dots rules):
//
//  - A move goes on an empty point that lies in nobody's territory.
//  - After a move, every region next to the new dot that cannot reach the board
//    edge through non-mover cells — a 4-connected flood fill, which is the same
//    thing as being ringed by an 8-connected chain of the mover's live dots —
//    and that contains at least one live opponent dot becomes the mover's
//    territory. A ringed region with no opponent dot stays open.
//  - A move that captures is never itself captured. Otherwise, if the new dot
//    sits in a region the opponent had already ringed, the opponent captures that
//    region at once: playing into a "house" loses the dot.
//  - A captured dot no longer counts as chain material. Ringing a region that
//    holds the opponent's territory takes it over.
//  - Edge points can't be captured: a region touching the edge is never ringed.
//  - Score is captured dots. The game ends when no playable point remains or a
//    player reaches the optional capture target.
import { IllegalMoveError, otherPlayer, type GameStatus, type PlayerIndex } from "../game.js";

export const BOARD_SIZES = [10, 15, 20, 25, 30] as const;
export type BoardSize = (typeof BOARD_SIZES)[number];

export interface DotsOptions {
  /** Points per side. */
  size: number;
  /** First to capture this many wins; null plays to a full board. */
  targetCaptures: number | null;
}

export interface DotsMove {
  x: number;
  y: number;
}

/** Cell codes: 0 empty, 1 player 0 (blue), 2 player 1 (red). */
export const EMPTY = 0;

export interface DotsState {
  size: number;
  targetCaptures: number | null;
  /** size*size cells, row-major: 0 empty, 1 blue dot, 2 red dot. */
  dots: number[];
  /** size*size cells: 0 free, 1 blue territory, 2 red territory. A dot inside the
   *  other player's territory is captured; an empty point in any territory is
   *  unplayable. */
  territory: number[];
  /** Captured opponent dots, per player. Derived from the board after every move. */
  captures: [number, number];
  /** Every move so far, in order — the record of the game, and what undo replays. */
  moves: DotsMove[];
  status: GameStatus;
}

export const DEFAULT_OPTIONS: DotsOptions = { size: 15, targetCaptures: null };

const code = (player: PlayerIndex) => player + 1;

export function createGame(options: DotsOptions): DotsState {
  const size = options.size;
  if (!(BOARD_SIZES as readonly number[]).includes(size)) {
    throw new Error(`Board size must be one of ${BOARD_SIZES.join(", ")}`);
  }
  const target = options.targetCaptures;
  if (target !== null && (!Number.isInteger(target) || target < 1 || target > size * size)) {
    throw new Error("Capture target must be a whole number of dots that fits on the board");
  }
  const cells = size * size;
  return {
    size,
    targetCaptures: target,
    dots: new Array<number>(cells).fill(EMPTY),
    territory: new Array<number>(cells).fill(0),
    captures: [0, 0],
    moves: [],
    status: { kind: "playing", turn: 0 }
  };
}

export function indexOf(state: { size: number }, x: number, y: number): number {
  return y * state.size + x;
}

export function pointOf(state: { size: number }, index: number): DotsMove {
  return { x: index % state.size, y: Math.floor(index / state.size) };
}

export function isPlayable(state: DotsState, x: number, y: number): boolean {
  if (x < 0 || y < 0 || x >= state.size || y >= state.size) return false;
  const i = indexOf(state, x, y);
  return state.dots[i] === EMPTY && state.territory[i] === 0;
}

export function legalMoves(state: DotsState): DotsMove[] {
  if (state.status.kind !== "playing") return [];
  const moves: DotsMove[] = [];
  for (let i = 0; i < state.dots.length; i++) {
    if (state.dots[i] === EMPTY && state.territory[i] === 0) moves.push(pointOf(state, i));
  }
  return moves;
}

/** Whether the dot at `i` is a live dot of `player` — part of their chains. */
export function isLiveDot(state: Pick<DotsState, "dots" | "territory">, i: number, player: PlayerIndex): boolean {
  return state.dots[i] === code(player) && state.territory[i] !== code(otherPlayer(player));
}

/** Whether the dot at `i` has been captured (sits in the other side's territory). */
export function isCaptured(state: Pick<DotsState, "dots" | "territory">, i: number): boolean {
  const dot = state.dots[i];
  return dot !== EMPTY && state.territory[i] !== 0 && state.territory[i] !== dot;
}

interface Region {
  cells: number[];
  touchesEdge: boolean;
}

// The 4-connected region of non-wall cells containing `start`. Marks `visited`
// as it goes, so a caller sweeping several seeds never walks a region twice.
function floodRegion(
  size: number,
  start: number,
  isWall: (i: number) => boolean,
  visited: Uint8Array
): Region {
  const cells: number[] = [];
  let touchesEdge = false;
  const stack = [start];
  visited[start] = 1;
  while (stack.length > 0) {
    const i = stack.pop()!;
    cells.push(i);
    const x = i % size;
    const y = (i - x) / size;
    if (x === 0 || y === 0 || x === size - 1 || y === size - 1) touchesEdge = true;
    const step = (nx: number, ny: number) => {
      if (nx < 0 || ny < 0 || nx >= size || ny >= size) return;
      const n = ny * size + nx;
      if (visited[n] || isWall(n)) return;
      visited[n] = 1;
      stack.push(n);
    };
    step(x - 1, y);
    step(x + 1, y);
    step(x, y - 1);
    step(x, y + 1);
  }
  return { cells, touchesEdge };
}

function recount(state: DotsState): [number, number] {
  let blue = 0;
  let red = 0;
  for (let i = 0; i < state.dots.length; i++) {
    const dot = state.dots[i];
    const owner = state.territory[i];
    if (dot === 2 && owner === 1) blue++;
    else if (dot === 1 && owner === 2) red++;
  }
  return [blue, red];
}

export function applyMove(state: DotsState, move: DotsMove): DotsState {
  if (state.status.kind !== "playing") throw new IllegalMoveError("The game is over");
  const { x, y } = move;
  if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= state.size || y >= state.size) {
    throw new IllegalMoveError("That point is off the board");
  }
  if (!isPlayable(state, x, y)) throw new IllegalMoveError("That point is taken");

  const mover = state.status.turn;
  const opponent = otherPlayer(mover);
  const size = state.size;
  const next: DotsState = {
    ...state,
    dots: state.dots.slice(),
    territory: state.territory.slice(),
    moves: [...state.moves, { x, y }]
  };
  const c = indexOf(next, x, y);
  next.dots[c] = code(mover);

  // 1. The mover's captures: every region beside the new dot that is ringed by
  //    the mover's live dots and holds a live opponent dot.
  const moverWall = (i: number) => isLiveDot(next, i, mover);
  const visited = new Uint8Array(size * size);
  let captured = false;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
      const n = ny * size + nx;
      if (visited[n] || moverWall(n)) continue;
      const region = floodRegion(size, n, moverWall, visited);
      if (region.touchesEdge) continue;
      if (!region.cells.some((i) => isLiveDot(next, i, opponent))) continue;
      for (const i of region.cells) next.territory[i] = code(mover);
      captured = true;
    }
  }

  // 2. Otherwise, did the dot land in a house the opponent had already ringed?
  if (!captured) {
    const opponentWall = (i: number) => isLiveDot(next, i, opponent);
    const region = floodRegion(size, c, opponentWall, new Uint8Array(size * size));
    if (!region.touchesEdge) {
      for (const i of region.cells) next.territory[i] = code(opponent);
    }
  }

  next.captures = recount(next);

  if (next.targetCaptures !== null) {
    for (const player of [mover, opponent] as PlayerIndex[]) {
      if (next.captures[player] >= next.targetCaptures) {
        next.status = { kind: "finished", winner: player, reason: "target" };
        return next;
      }
    }
  }
  if (!next.dots.some((dot, i) => dot === EMPTY && next.territory[i] === 0)) {
    next.status = { kind: "finished", winner: leader(next.captures), reason: "board-full" };
    return next;
  }
  next.status = { kind: "playing", turn: opponent };
  return next;
}

function leader(captures: [number, number]): PlayerIndex | null {
  if (captures[0] === captures[1]) return null;
  return captures[0] > captures[1] ? 0 : 1;
}

export function finish(state: DotsState, reason: "agreed" | "resigned", resigning?: PlayerIndex): DotsState {
  if (state.status.kind !== "playing") return state;
  if (reason === "resigned") {
    const loser = resigning ?? state.status.turn;
    return { ...state, status: { kind: "finished", winner: otherPlayer(loser), reason } };
  }
  return { ...state, status: { kind: "finished", winner: leader(state.captures), reason } };
}

/** Rebuilds a game from its options and move list — the undo, and the way a
 *  stored match (phase 2) is restored. */
export function replay(options: DotsOptions, moves: readonly DotsMove[]): DotsState {
  let state = createGame(options);
  for (const move of moves) state = applyMove(state, move);
  return state;
}

export function undoMove(state: DotsState): DotsState {
  if (state.moves.length === 0) return state;
  return replay({ size: state.size, targetCaptures: state.targetCaptures }, state.moves.slice(0, -1));
}

/** Parses a drawing of a position for tests and docs: one row per line, `.` an
 *  empty point, `b`/`r` a blue/red dot. The dots are placed by replaying in
 *  reading order, blue and red taking turns — pad with the `moves` list when the
 *  order matters. Only shapes with equal counts (or one extra blue) are legal. */
export function fromDiagram(rows: string[], targetCaptures: number | null = null): DotsState {
  const size = rows.length;
  const blue: DotsMove[] = [];
  const red: DotsMove[] = [];
  rows.forEach((row, y) => {
    if (row.length !== size) throw new Error(`Row ${y} is ${row.length} wide, the board ${size}`);
    for (let x = 0; x < size; x++) {
      if (row[x] === "b") blue.push({ x, y });
      else if (row[x] === "r") red.push({ x, y });
      else if (row[x] !== ".") throw new Error(`Unknown cell "${row[x]}" at ${x},${y}`);
    }
  });
  if (blue.length < red.length || blue.length > red.length + 1) {
    throw new Error("A diagram needs as many blue dots as red, or one more");
  }
  const moves: DotsMove[] = [];
  for (let i = 0; i < blue.length; i++) {
    moves.push(blue[i]);
    if (i < red.length) moves.push(red[i]);
  }
  return replay({ size, targetCaptures }, moves);
}

/** The reverse of fromDiagram, for readable assertions: dots as b/r, captured
 *  dots as B/R, empty territory as `+` (blue) or `-` (red). */
export function toDiagram(state: DotsState): string[] {
  const rows: string[] = [];
  for (let y = 0; y < state.size; y++) {
    let row = "";
    for (let x = 0; x < state.size; x++) {
      const i = indexOf(state, x, y);
      const dot = state.dots[i];
      const owner = state.territory[i];
      if (dot === 1) row += owner === 2 ? "B" : "b";
      else if (dot === 2) row += owner === 1 ? "R" : "r";
      else row += owner === 1 ? "+" : owner === 2 ? "-" : ".";
    }
    rows.push(row);
  }
  return rows;
}
