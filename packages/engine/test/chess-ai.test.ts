import { describe, expect, it } from "vitest";
import { seededRandom } from "../src/random.js";
import { chooseMove, evaluate } from "../src/chess/ai.js";
import { Position, START_FEN } from "../src/chess/board.js";
import { applyMove, createGame, fromFen } from "../src/chess/rules.js";

describe("the computer at chess", () => {
  it("sees the start as even", () => {
    expect(evaluate(Position.fromFen(START_FEN))).toBe(0);
  });

  it("mates in one when it can", () => {
    const state = fromFen("6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1");
    for (const level of ["normal", "hard"] as const) {
      expect(chooseMove(state, level, seededRandom(1))).toEqual({ from: "a1", to: "a8" });
    }
  });

  it("finds a mate in two at hard", () => {
    // 1. Re8+ Rxe8 2. Rxe8#: the back rank, with the rooks doubled.
    const state = fromFen("1r4k1/5ppp/8/8/8/4R3/5PPP/4R1K1 w - - 0 1");
    const move = chooseMove(state, "hard", seededRandom(2));
    expect(move).toEqual({ from: "e3", to: "e8" });
  });

  it("takes a queen left hanging", () => {
    // Defended by the e5 pawn, but a queen for a knight is still a queen.
    const state = fromFen("rnb1kbnr/pppp1ppp/8/4p3/3q4/5N2/PPPPPPPP/RNBQKB1R w KQkq - 0 3");
    const move = chooseMove(state, "normal", seededRandom(3));
    expect(move).toEqual({ from: "f3", to: "d4" });
  });

  it("does not hang its queen at normal", () => {
    // Black's queen on d5 is attacked by the c4 pawn; it must step away.
    const state = fromFen("rnb1kbnr/ppp1pppp/8/3q4/2P5/8/PP1PPPPP/RNBQKBNR b KQkq - 0 3");
    const move = chooseMove(state, "normal", seededRandom(4));
    expect(move?.from).toBe("d5");
  });

  it("plays a whole game against itself without a wrong move", () => {
    let state = createGame();
    const random = seededRandom(7);
    for (let i = 0; i < 400 && state.status.kind === "playing"; i++) {
      const move = chooseMove(state, i % 2 ? "easy" : "normal", random);
      expect(move).not.toBeNull();
      state = applyMove(state, move!);
    }
    expect(state.moves.length).toBeGreaterThan(10);
  }, 60000);

  it("answers at hard within a few seconds", () => {
    const state = createGame();
    const started = Date.now();
    expect(chooseMove(state, "hard", seededRandom(9))).not.toBeNull();
    expect(Date.now() - started).toBeLessThan(5000);
  });
});
