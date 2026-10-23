import { describe, expect, it } from "vitest";
import { applyMove } from "../src/chess/rules.js";
import {
  checkPuzzleMove,
  nextPuzzleRating,
  puzzleLevel,
  puzzleScore,
  puzzleStart,
  solverMoves,
  uciMove,
  type ChessPuzzle
} from "../src/chess/puzzles.js";

// Scholar's mate as a puzzle: Black's last move …Nf6?? lets Qxf7 mate.
const scholar: ChessPuzzle = {
  id: "t1",
  fen: "r1bqkbnr/pppp1ppp/2n5/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR b KQkq - 3 3",
  moves: ["g8f6", "h5f7"],
  rating: 700,
  mateIn: 1
};

// A two-move line: the setup, the solver, the reply, the solver.
const line: ChessPuzzle = {
  id: "t2",
  fen: "6k1/5ppp/8/8/8/8/5PPP/R5K1 b - - 0 1",
  moves: ["h7h6", "a1a8", "g8h7", "a8a7"],
  rating: 1000,
  mateIn: null
};

describe("chess puzzles", () => {
  it("starts after the other side's move, the solver to play", () => {
    const start = puzzleStart(scholar);
    expect(start.setup).toEqual({ from: "g8", to: "f6" });
    expect(start.solver).toBe(0);
    expect(start.state.moves).toHaveLength(1);
    expect(solverMoves(scholar)).toBe(1);
    expect(solverMoves(line)).toBe(2);
  });

  it("takes the line's move, refuses another, and answers with the reply", () => {
    const { state } = puzzleStart(line);
    expect(checkPuzzleMove(line, 0, state, uciMove("a1a7"))).toEqual({ kind: "wrong" });
    const answer = checkPuzzleMove(line, 0, state, uciMove("a1a8"));
    expect(answer).toEqual({ kind: "correct", reply: { from: "g8", to: "h7" } });
    const after = applyMove(applyMove(state, uciMove("a1a8")), uciMove("g8h7"));
    expect(checkPuzzleMove(line, 1, after, uciMove("a8a7"))).toEqual({ kind: "solved" });
  });

  it("takes any mate as the answer", () => {
    const { state } = puzzleStart(scholar);
    expect(checkPuzzleMove(scholar, 0, state, uciMove("h5f7"))).toEqual({ kind: "solved" });
    // Bxf7+ is check, not mate: wrong.
    expect(checkPuzzleMove(scholar, 0, state, uciMove("c4f7"))).toEqual({ kind: "wrong" });
  });

  it("reads promotions in UCI", () => {
    expect(uciMove("e7e8q")).toEqual({ from: "e7", to: "e8", promotion: "q" });
  });

  it("places a rating in its level", () => {
    expect(puzzleLevel(600)).toBe("veryEasy");
    expect(puzzleLevel(900)).toBe("easy");
    expect(puzzleLevel(1699)).toBe("medium");
    expect(puzzleLevel(1700)).toBe("hard");
    expect(puzzleLevel(2500)).toBe("expert");
  });

  it("moves the rating by the result, a hint halving the gain", () => {
    expect(puzzleScore(true, 0)).toBe(1);
    expect(puzzleScore(true, 1)).toBe(0.75);
    expect(puzzleScore(true, 2)).toBe(0);
    expect(puzzleScore(false, 0)).toBe(0);
    // Equal ratings: a win is +20 for a newcomer, a loss −20.
    expect(nextPuzzleRating(800, 0, 800, 1)).toBe(820);
    expect(nextPuzzleRating(800, 0, 800, 0)).toBe(780);
    expect(nextPuzzleRating(800, 0, 800, 0.75)).toBe(810);
    // Settled solvers move half as fast; a harder puzzle pays more.
    expect(nextPuzzleRating(800, 50, 800, 1)).toBe(810);
    expect(nextPuzzleRating(800, 50, 1200, 1)).toBeGreaterThan(nextPuzzleRating(800, 50, 800, 1));
    // Never below the floor.
    expect(nextPuzzleRating(400, 0, 400, 0)).toBe(400);
  });
});
