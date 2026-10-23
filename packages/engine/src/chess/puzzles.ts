import { applyMove, describeMove, fromFen, type ChessMove, type ChessState, type Promotion } from "./rules.js";
import type { PlayerIndex } from "../game.js";

// Chess puzzles: a position, the move that led to it, and the line that wins
// from there. The set is Lichess's (CC0), so a puzzle keeps their shape —
// the FEN is the position BEFORE the other side's move, and `moves` starts
// with that move; the solver's moves and the replies alternate after it.
// Checking an answer and moving a rating are here so the server (which keeps
// the ratings) and the page (which plays the replies) agree on both.

export interface ChessPuzzle {
  id: string;
  fen: string;
  /** UCI, "e2e4" / "e7e8q": the setup move first, then solver, reply, solver… */
  moves: string[];
  /** How hard it is, on Lichess's puzzle scale. */
  rating: number;
  /** A mate the solver is to find, in that many of their moves; null for
   *  anything else (win material, a fork…). */
  mateIn: number | null;
}

export const PUZZLE_LEVELS = ["veryEasy", "easy", "medium", "hard", "expert"] as const;
export type PuzzleLevel = (typeof PUZZLE_LEVELS)[number];

/** The lowest puzzle rating of each level; the next level's is its ceiling. */
export const PUZZLE_LEVEL_FLOOR: Record<PuzzleLevel, number> = {
  veryEasy: 0,
  easy: 900,
  medium: 1300,
  hard: 1700,
  expert: 2100
};

export function puzzleLevel(rating: number): PuzzleLevel {
  let level: PuzzleLevel = "veryEasy";
  for (const candidate of PUZZLE_LEVELS) if (rating >= PUZZLE_LEVEL_FLOOR[candidate]) level = candidate;
  return level;
}

export function uciMove(uci: string): ChessMove {
  const move: ChessMove = { from: uci.slice(0, 2), to: uci.slice(2, 4) };
  if (uci.length > 4) move.promotion = uci[4] as Promotion;
  return move;
}

export function sameMove(a: ChessMove, b: ChessMove): boolean {
  return a.from === b.from && a.to === b.to && (a.promotion ?? null) === (b.promotion ?? null);
}

/** The position the solver faces: the setup move already played. */
export function puzzleStart(puzzle: ChessPuzzle): { before: ChessState; state: ChessState; setup: ChessMove; solver: PlayerIndex } {
  const before = fromFen(puzzle.fen);
  const setup = uciMove(puzzle.moves[0]);
  const state = applyMove(before, setup);
  return { before, state, setup, solver: state.toMove };
}

/** How many moves the solver makes in the whole line. */
export function solverMoves(puzzle: ChessPuzzle): number {
  return Math.floor(puzzle.moves.length / 2);
}

export type PuzzleAnswer =
  /** Right, and the line goes on: `reply` is the other side's answer. */
  | { kind: "correct"; reply: ChessMove }
  /** Right, and that was the last move. */
  | { kind: "solved" }
  | { kind: "wrong" };

/**
 * The solver's `step`-th move (0 for their first) played in `state`. A move
 * that mates is right even when it is not the one in the line — a puzzle
 * with two mates has two answers, as on Lichess.
 */
export function checkPuzzleMove(puzzle: ChessPuzzle, step: number, state: ChessState, move: ChessMove): PuzzleAnswer {
  const index = 1 + step * 2;
  const expected = puzzle.moves[index];
  if (!expected) return { kind: "wrong" };
  if (!sameMove(move, uciMove(expected))) {
    return describeMove(state, move)?.mate ? { kind: "solved" } : { kind: "wrong" };
  }
  const reply = puzzle.moves[index + 1];
  return reply ? { kind: "correct", reply: uciMove(reply) } : { kind: "solved" };
}

// ── The rating ─────────────────────────────────────────────────────────────
// Elo against the puzzle: a solve against a harder puzzle moves you further.
// The piece pointed out (one hint) scores 0.75, so at your own level it earns
// half what a clean solve does; the move shown in full (two hints) or a wrong
// move scores nothing. New solvers move faster until they settle.

export const PUZZLE_START_RATING = 800;
export const PUZZLE_RATING_FLOOR = 400;

export function puzzleScore(solved: boolean, hints: number): number {
  if (!solved) return 0;
  if (hints <= 0) return 1;
  return hints === 1 ? 0.75 : 0;
}

export function nextPuzzleRating(rating: number, played: number, puzzleRating: number, score: number): number {
  const k = played < 20 ? 40 : 20;
  const expected = 1 / (1 + 10 ** ((puzzleRating - rating) / 400));
  return Math.max(PUZZLE_RATING_FLOOR, Math.round(rating + k * (score - expected)));
}
