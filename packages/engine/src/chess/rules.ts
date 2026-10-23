// Chess, by the FIDE rules, with the draws a family game needs to end on its
// own: stalemate, the third repetition of a position, fifty moves each without
// a capture or a pawn move, and a position where neither side can mate. (Over
// the board the repetition and fifty-move draws are claimed; here they simply
// happen — nobody has to know to ask.) Seat 0 is White and moves first.
//
// The state is plain JSON — the board as 64 letters, the rights, the move
// list — and every move goes through board.ts, which does the real work.
import { IllegalMoveError, otherPlayer, type GameStatus, type PlayerIndex } from "../game.js";
import {
  FLAG_CASTLE,
  FLAG_EN_PASSANT,
  PAWN,
  Position,
  START_FEN,
  moveFlag,
  moveFrom,
  movePromotion,
  moveTo,
  squareIndex,
  squareName,
  type Move
} from "./board.js";

/** Chess has no settings; the object is there for the platform's shape. */
export type ChessOptions = Record<string, never>;

export type Promotion = "q" | "r" | "b" | "n";
export const PROMOTIONS: readonly Promotion[] = ["q", "r", "b", "n"];

export interface ChessMove {
  /** Squares by name: "e2", "e4". */
  from: string;
  to: string;
  /** The piece a pawn becomes on the last rank; required there, refused elsewhere. */
  promotion?: Promotion;
}

export interface ChessState {
  /** a1, b1 … h8 as letters: PNBRQK White, pnbrqk Black, "." empty. */
  board: string;
  /** The side to move in the position (also once the game is over). */
  toMove: PlayerIndex;
  /** "KQkq", a subset, or "-". */
  castling: string;
  /** The square a pawn may take onto en passant, by name. */
  enPassant: string | null;
  /** Half-moves since the last capture or pawn move. */
  halfmoveClock: number;
  fullmove: number;
  /** Whether the side to move is in check. */
  check: boolean;
  /** Every move so far, in order — the record of the game, and what undo replays. */
  moves: ChessMove[];
  /** The positions since the last capture or pawn move (none can come back
   *  after one), for the repetition draw. */
  history: string[];
  status: GameStatus;
}

export const DEFAULT_OPTIONS: ChessOptions = {};

export function parseOptions(input: unknown): ChessOptions {
  if (input !== undefined && input !== null && typeof input !== "object") throw new Error("Options must be an object");
  return {};
}

const PROMOTION_PIECE: Record<Promotion, number> = { n: 2, b: 3, r: 4, q: 5 };
const PROMOTION_LETTER = ["", "", "n", "b", "r", "q"] as const;

/** Two square names and, for a pawn reaching the end, the piece it becomes. */
export function parseMove(input: unknown): ChessMove {
  if (typeof input !== "object" || input === null) throw new IllegalMoveError("A move names two squares");
  const { from, to, promotion } = input as Record<string, unknown>;
  if (typeof from !== "string" || typeof to !== "string" || squareIndex(from) < 0 || squareIndex(to) < 0) {
    throw new IllegalMoveError("A move is from one square to another, by name");
  }
  if (promotion === undefined || promotion === null) return { from, to };
  if (typeof promotion !== "string" || !(PROMOTIONS as readonly string[]).includes(promotion)) {
    throw new IllegalMoveError("A pawn becomes a queen, rook, bishop or knight");
  }
  return { from, to, promotion: promotion as Promotion };
}

/** The position the state describes, ready for move generation. */
export function positionOf(state: ChessState): Position {
  const position = Position.fromBoardString(state.board);
  position.turn = state.toMove;
  position.castling = 0;
  for (const ch of state.castling) {
    position.castling |= ch === "K" ? 1 : ch === "Q" ? 2 : ch === "k" ? 4 : ch === "q" ? 8 : 0;
  }
  position.ep = state.enPassant ? squareIndex(state.enPassant) : -1;
  position.halfmove = state.halfmoveClock;
  position.fullmove = state.fullmove;
  return position;
}

function stateOf(position: Position, moves: ChessMove[], history: string[]): ChessState {
  const state: ChessState = {
    board: position.boardString(),
    toMove: position.turn,
    castling: position.castlingString(),
    enPassant: position.ep >= 0 ? squareName(position.ep) : null,
    halfmoveClock: position.halfmove,
    fullmove: position.fullmove,
    check: position.inCheck(),
    moves,
    history,
    status: { kind: "playing", turn: position.turn }
  };
  state.status = judge(position, history);
  return state;
}

/** Whether the game goes on, and if not, how it ended. */
function judge(position: Position, history: string[]): GameStatus {
  const mover = otherPlayer(position.turn);
  if (position.legalMoves().length === 0) {
    return position.inCheck()
      ? { kind: "finished", winner: mover, reason: "checkmate" }
      : { kind: "finished", winner: null, reason: "stalemate" };
  }
  if (position.insufficientMaterial()) return { kind: "finished", winner: null, reason: "material" };
  const key = history[history.length - 1];
  if (history.filter((seen) => seen === key).length >= 3) return { kind: "finished", winner: null, reason: "repetition" };
  if (position.halfmove >= 100) return { kind: "finished", winner: null, reason: "fifty-moves" };
  return { kind: "playing", turn: position.turn };
}

export function createGame(options: ChessOptions = {}): ChessState {
  parseOptions(options);
  return fromFen(START_FEN);
}

/** A game from a position, for tests and puzzles; its move list starts empty. */
export function fromFen(fen: string): ChessState {
  const position = Position.fromFen(fen);
  return stateOf(position, [], [position.repetitionKey()]);
}

export function toFen(state: ChessState): string {
  return positionOf(state).fen();
}

/** The JSON move for one of board.ts's packed moves. */
export function toChessMove(move: Move): ChessMove {
  const out: ChessMove = { from: squareName(moveFrom(move)), to: squareName(moveTo(move)) };
  const promotion = movePromotion(move);
  if (promotion) out.promotion = PROMOTION_LETTER[promotion] as Promotion;
  return out;
}

/** The engine's move for a ChessMove, or null when it is not legal here. */
function find(position: Position, move: ChessMove): Move | null {
  const from = squareIndex(move.from);
  const to = squareIndex(move.to);
  const promotion = move.promotion ? PROMOTION_PIECE[move.promotion] : 0;
  return position.legalMoves().find((m) => moveFrom(m) === from && moveTo(m) === to && movePromotion(m) === promotion) ?? null;
}

export function legalMoves(state: ChessState): ChessMove[] {
  if (state.status.kind !== "playing") return [];
  return positionOf(state).legalMoves().map(toChessMove);
}

/** Where the piece on `square` may go — the board's highlights. Promotions
 *  appear once per square (the piece is asked for afterwards). */
export function targetsFrom(state: ChessState, square: string): string[] {
  if (state.status.kind !== "playing") return [];
  const from = squareIndex(square);
  const out = new Set<string>();
  for (const move of positionOf(state).legalMoves()) {
    if (moveFrom(move) === from) out.add(squareName(moveTo(move)));
  }
  return [...out];
}

/** Whether moving from → to is a pawn reaching the last rank (and so needs a piece). */
export function isPromotion(state: ChessState, from: string, to: string): boolean {
  const piece = pieceAt(state, from);
  const rank = to[1];
  return (piece === "P" && rank === "8") || (piece === "p" && rank === "1");
}

/** The letter on a square ("P", "k"), or null when it is empty. */
export function pieceAt(state: ChessState, square: string): string | null {
  const sq = squareIndex(square);
  if (sq < 0) return null;
  const letter = state.board[sq];
  return letter === "." ? null : letter;
}

/** Which seat a piece letter belongs to. */
export function ownerOf(letter: string): PlayerIndex {
  return letter === letter.toUpperCase() ? 0 : 1;
}

export function applyMove(state: ChessState, move: ChessMove): ChessState {
  if (state.status.kind !== "playing") throw new IllegalMoveError("The game is over");
  const position = positionOf(state);
  const found = find(position, move);
  if (found === null) {
    if (!move.promotion && isPromotion(state, move.from, move.to)
      && find(position, { ...move, promotion: "q" }) !== null) {
      throw new IllegalMoveError("Choose the piece the pawn becomes");
    }
    throw new IllegalMoveError("That move is not allowed here");
  }
  const irreversible = position.board[moveFrom(found)] * (position.turn === 0 ? 1 : -1) === PAWN
    || position.board[moveTo(found)] !== 0 || moveFlag(found) === FLAG_EN_PASSANT;
  position.make(found);
  // A capture or a pawn move can never be undone, so no earlier position can
  // come back: the repetition count starts again.
  const key = position.repetitionKey();
  const history = irreversible ? [key] : [...state.history, key];
  return stateOf(position, [...state.moves, toChessMove(found)], history);
}

export function finish(state: ChessState, reason: "agreed" | "resigned", resigning?: PlayerIndex): ChessState {
  if (state.status.kind !== "playing") return state;
  if (reason === "resigned") {
    const loser = resigning ?? state.status.turn;
    return { ...state, status: { kind: "finished", winner: otherPlayer(loser), reason } };
  }
  return { ...state, status: { kind: "finished", winner: null, reason } };
}

/** Rebuilds a game from its move list — the undo, and a saved game's restore. */
export function replay(moves: readonly ChessMove[]): ChessState {
  let state = createGame();
  for (const move of moves) state = applyMove(state, move);
  return state;
}

export function undoMove(state: ChessState): ChessState {
  if (state.moves.length === 0) return state;
  return replay(state.moves.slice(0, -1));
}

/** What a move was, for the game's log: its standard notation (English piece
 *  letters — the web app swaps in the reader's) and what kind of move it was. */
export interface ChessMoveNote {
  san: string;
  capture: boolean;
  castle: boolean;
  promotion: boolean;
  check: boolean;
  mate: boolean;
}

export function describeMove(state: ChessState, move: ChessMove): ChessMoveNote | null {
  const position = positionOf(state);
  const found = find(position, move);
  if (found === null) return null;
  const san = position.san(found);
  return {
    san,
    capture: position.board[moveTo(found)] !== 0 || moveFlag(found) === FLAG_EN_PASSANT,
    castle: moveFlag(found) === FLAG_CASTLE,
    promotion: movePromotion(found) !== 0,
    check: san.endsWith("+") || san.endsWith("#"),
    mate: san.endsWith("#")
  };
}

/** The standard notation of every move in the game, in order. */
export function sanList(moves: readonly ChessMove[]): string[] {
  const out: string[] = [];
  let state = createGame();
  for (const move of moves) {
    out.push(describeMove(state, move)?.san ?? "?");
    state = applyMove(state, move);
  }
  return out;
}

const VALUES: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
const FULL_SET: Record<string, number> = { p: 8, n: 2, b: 2, r: 2, q: 1 };

/** The pieces each seat has taken from the other ("pnb" — the taken pieces'
 *  letters, lower case), and each side's material in pawns, for the panel.
 *  Counted from the board, so a promoted pawn shows as the piece it became. */
export function material(state: ChessState): { taken: [string, string]; points: [number, number] } {
  const counts = [{} as Record<string, number>, {} as Record<string, number>];
  const points: [number, number] = [0, 0];
  for (const letter of state.board) {
    if (letter === ".") continue;
    const seat = ownerOf(letter);
    const kind = letter.toLowerCase();
    counts[seat][kind] = (counts[seat][kind] ?? 0) + 1;
    points[seat] += VALUES[kind];
  }
  const takenFrom = (seat: PlayerIndex) => Object.entries(FULL_SET)
    .map(([kind, full]) => kind.repeat(Math.max(0, full - (counts[seat][kind] ?? 0))))
    .join("");
  return { taken: [takenFrom(1), takenFrom(0)], points };
}
