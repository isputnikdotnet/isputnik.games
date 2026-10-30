import { IllegalMoveError, otherPlayer, type GameStatus, type PlayerIndex } from "../game.js";

// Russian draughts-64. Captured pieces block their squares until the entire
// sequence ends; crowning during a sequence immediately enables king jumps.
// Reference: https://fmjd64.org/rules-of-the-game/ (sections 3, 4 and 7).
export type CheckersOptions = Record<string, never>;
export interface CheckersPiece {
  player: PlayerIndex;
  king: boolean;
}
export interface CheckersMove {
  path: number[];
}
export interface CheckersState {
  board: (CheckersPiece | null)[];
  status: GameStatus;
  moves: CheckersMove[];
  positions: string[];
  quietKings: number;
  stable: number;
  ending: { signature: string; plies: number };
}
const DIRECTIONS = [
  [-1, -1],
  [-1, 1],
  [1, -1],
  [1, 1]
] as const;
const inside = (r: number, c: number) => r >= 0 && r < 8 && c >= 0 && c < 8;
const crown = (piece: CheckersPiece, square: number): CheckersPiece => ({
  ...piece,
  king: piece.king || Math.floor(square / 8) === (piece.player === 0 ? 0 : 7)
});
export const squareName = (square: number) => `${"abcdefgh"[square % 8]}${8 - Math.floor(square / 8)}`;
const keyOf = (board: CheckersState["board"], turn: PlayerIndex) =>
  `${turn}:${board.map((p) => (p ? `${p.player}${p.king ? "K" : "m"}` : ".")).join("")}`;
export function parseOptions(input: unknown): CheckersOptions {
  if (!input || typeof input !== "object" || Array.isArray(input) || Object.keys(input).length)
    throw new IllegalMoveError("Checkers takes no options");
  return {};
}
export function parseMove(input: unknown): CheckersMove {
  const path = input && typeof input === "object" ? (input as { path?: unknown }).path : null;
  if (
    !Array.isArray(path) ||
    path.length < 2 ||
    path.length > 13 ||
    path.some((s) => !Number.isInteger(s) || s < 0 || s >= 64 || (Math.floor(s / 8) + (s % 8)) % 2 !== 1)
  )
    throw new IllegalMoveError("Invalid checkers path");
  return { path: [...path] };
}
export function createGame(_options: CheckersOptions = {}): CheckersState {
  const board: CheckersState["board"] = Array.from({ length: 64 }, (_, i) => {
    const r = Math.floor(i / 8);
    return (r + (i % 8)) % 2 === 1 && (r < 3 || r > 4) ? { player: r < 3 ? 1 : 0, king: false } : null;
  });
  return {
    board,
    status: { kind: "playing", turn: 0 },
    moves: [],
    positions: [keyOf(board, 0)],
    quietKings: 0,
    stable: 0,
    ending: { signature: "", plies: 0 }
  };
}
interface Sequence {
  path: number[];
  captured: number[];
  piece: CheckersPiece;
}
/** The empty squares a piece may land on after jumping the enemy one step
 *  beyond `at` along a direction: the next square for a man, any square up
 *  to the next piece for a king. Empty when there is nothing to take. */
function landings(
  board: CheckersState["board"],
  at: number,
  piece: CheckersPiece,
  captured: number[],
  [dr, dc]: readonly [number, number]
): { over: number; squares: number[] } | null {
  let rr = Math.floor(at / 8) + dr,
    cc = (at % 8) + dc;
  if (piece.king)
    while (inside(rr, cc) && !board[rr * 8 + cc]) {
      rr += dr;
      cc += dc;
    }
  if (!inside(rr, cc)) return null;
  const over = rr * 8 + cc,
    enemy = board[over];
  if (!enemy || enemy.player === piece.player || captured.includes(over)) return null;
  const squares: number[] = [];
  rr += dr;
  cc += dc;
  while (inside(rr, cc) && !board[rr * 8 + cc]) {
    squares.push(rr * 8 + cc);
    if (!piece.king) break;
    rr += dr;
    cc += dc;
  }
  return squares.length ? { over, squares } : null;
}
/** The board with a piece moved from `at` to `to`, the jumped piece left in
 *  place: captured pieces block until the whole sequence ends. */
const landed = (board: CheckersState["board"], at: number, to: number, piece: CheckersPiece) => {
  const next = [...board];
  next[at] = null;
  next[to] = piece;
  return next;
};
/** Whether a piece standing on `at` has another capture to make. */
const canCapture = (board: CheckersState["board"], at: number, piece: CheckersPiece, captured: number[]) =>
  DIRECTIONS.some((direction) => landings(board, at, piece, captured, direction));
function sequences(state: CheckersState): Sequence[] {
  if (state.status.kind !== "playing") return [];
  const captures: Sequence[] = [],
    quiet: Sequence[] = [];
  const visit = (
    board: CheckersState["board"],
    at: number,
    piece: CheckersPiece,
    path: number[],
    captured: number[]
  ) => {
    let continued = false;
    for (const direction of DIRECTIONS) {
      const jump = landings(board, at, piece, captured, direction);
      if (!jump) continue;
      const after = [...captured, jump.over];
      const options = jump.squares.map((to) => {
        const nextPiece = crown(piece, to);
        const next = landed(board, at, to, nextPiece);
        return { to, nextPiece, next, more: canCapture(next, to, nextPiece, after) };
      });
      // A king that can go on capturing must stop on a square it can capture
      // from; only when none can may it stop on any of them.
      const onward = options.some((option) => option.more);
      for (const option of options) {
        if (onward && !option.more) continue;
        continued = true;
        visit(option.next, option.to, option.nextPiece, [...path, option.to], after);
      }
    }
    if (!continued && captured.length) captures.push({ path, captured, piece });
  };
  state.board.forEach((piece, from) => {
    if (!piece || state.status.kind !== "playing" || piece.player !== state.status.turn) return;
    visit(state.board, from, piece, [from], []);
    for (const [dr, dc] of DIRECTIONS) {
      if (!piece.king && dr !== (piece.player === 0 ? -1 : 1)) continue;
      let r = Math.floor(from / 8) + dr,
        c = (from % 8) + dc;
      while (inside(r, c) && !state.board[r * 8 + c]) {
        const to = r * 8 + c;
        quiet.push({ path: [from, to], captured: [], piece: crown(piece, to) });
        if (!piece.king) break;
        r += dr;
        c += dc;
      }
    }
  });
  return captures.length ? captures : quiet;
}
export const legalMoves = (state: CheckersState): CheckersMove[] => sequences(state).map(({ path }) => ({ path }));
export function applyMove(state: CheckersState, input: CheckersMove): CheckersState {
  const move = parseMove(input);
  const sequence = sequences(state).find(
    (s) => s.path.length === move.path.length && s.path.every((sq, i) => sq === move.path[i])
  );
  if (!sequence || state.status.kind !== "playing") throw new IllegalMoveError("Illegal checkers move");
  const board = [...state.board],
    from = move.path[0]!,
    to = move.path[move.path.length - 1]!;
  const original = board[from]!;
  board[from] = null;
  for (const sq of sequence.captured) board[sq] = null;
  board[to] = sequence.piece;
  const turn = otherPlayer(state.status.turn),
    position = keyOf(board, turn);
  const changed = sequence.captured.length > 0 || original.king !== sequence.piece.king;
  const next: CheckersState = {
    board,
    status: { kind: "playing", turn },
    moves: [...state.moves, move],
    positions: [...state.positions, position],
    quietKings: original.king && !sequence.captured.length ? state.quietKings + 1 : 0,
    stable: changed ? 0 : state.stable + 1,
    ending: { signature: "", plies: 0 }
  };
  if (!legalMoves(next).length) {
    next.status = {
      kind: "finished",
      winner: original.player,
      reason: "board-full"
    };
    return next;
  }
  const sides = ([0, 1] as const).map((player) =>
    board.flatMap((p, i) => (p?.player === player ? [{ ...p, square: i }] : []))
  );
  let limit = 0,
    signature = "";
  for (const lone of [0, 1] as const) {
    const one = sides[lone]!,
      many = sides[otherPlayer(lone)]!;
    if (one.length !== 1 || !one[0]!.king) continue;
    const longDiagonal = Math.floor(one[0]!.square / 8) + (one[0]!.square % 8) === 7;
    const kings = many.filter((p) => p.king).length;
    if ((many.length <= 2 && kings > 0) || (many.length === 3 && longDiagonal && kings > 0)) limit = 10;
    else if (kings >= 3) limit = 30;
    if (limit) {
      signature = `${lone}:${many.length}:${kings}:${limit}`;
      break;
    }
  }
  next.ending = {
    signature,
    plies: signature && signature === state.ending.signature ? state.ending.plies + 1 : 0
  };
  const total = sides[0]!.length + sides[1]!.length;
  const bothKings = sides.every((side) => side.some((p) => p.king));
  if (next.positions.filter((p) => p === position).length >= 3)
    next.status = { kind: "finished", winner: null, reason: "repetition" };
  else if (
    next.quietKings >= 30 ||
    (limit > 0 && next.ending.plies >= limit) ||
    (bothKings && ((total <= 5 && next.stable >= 60) || (total <= 7 && next.stable >= 120)))
  )
    next.status = { kind: "finished", winner: null, reason: "agreed" };
  return next;
}
export function finish(state: CheckersState, reason: "agreed" | "resigned", resigning?: PlayerIndex): CheckersState {
  if (state.status.kind !== "playing") return state;
  if (reason === "resigned" && resigning !== 0 && resigning !== 1)
    throw new IllegalMoveError("Missing resigning player");
  return {
    ...state,
    status: {
      kind: "finished",
      reason,
      winner: reason === "agreed" ? null : otherPlayer(resigning!)
    }
  };
}
export const notation = (move: CheckersMove, capture = move.path.length > 2) =>
  move.path.map(squareName).join(capture ? ":" : "–");
export function replay(moves: readonly CheckersMove[]): CheckersState {
  return moves.reduce(applyMove, createGame());
}
