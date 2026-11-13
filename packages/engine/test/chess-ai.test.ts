import { describe, expect, it } from "vitest";
import { seededRandom } from "../src/random.js";
import { analyseMove, chooseMove, chooseMoveAt, evaluate, levelOfStrength, strengthElo, strengthFor, strengthSpec } from "../src/chess/ai.js";
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

describe("the coach", () => {
  it("calls a move that hangs the queen a big loss, and names the better move", () => {
    // Black to move can take a queen left on d5 with the pawn on e6.
    const state = fromFen("rnbqkbnr/pppp1ppp/4p3/3Q4/8/8/PPPPPPPP/RNB1KBNR b KQkq - 0 1");
    const missed = analyseMove(state, { from: "a7", to: "a6" })!;
    expect(missed.best).toEqual({ from: "e6", to: "d5" });
    expect(missed.loss).toBeGreaterThan(700);
    const taken = analyseMove(state, { from: "e6", to: "d5" })!;
    expect(taken.loss).toBe(0);
  });

  it("has nothing to say once the game is over", () => {
    const mated = fromFen("rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3");
    expect(analyseMove(mated, { from: "e2", to: "e3" })).toBeNull();
  });
});

describe("strength from 0 to 100", () => {
  it("maps strength to rating and back, and to the nearest named level", () => {
    expect(strengthElo(0)).toBe(400);
    expect(strengthElo(50)).toBe(1100);
    expect(strengthElo(100)).toBe(1800);
    expect(strengthElo(150)).toBe(1800);
    expect(strengthFor(1100)).toBe(50);
    expect(strengthFor(100)).toBe(0);
    expect(levelOfStrength(10)).toBe("easy");
    expect(levelOfStrength(50)).toBe("normal");
    expect(levelOfStrength(90)).toBe("hard");
  });

  it("searches deeper and plays less loosely as strength rises", () => {
    const low = strengthSpec(0);
    const high = strengthSpec(100);
    expect(low.depth).toBe(1);
    expect(low.wild).toBeGreaterThan(0);
    expect(high.depth).toBe(5);
    expect(high.blur).toBe(0);
    expect(high.wild).toBe(0);
    for (let s = 0; s < 100; s += 10) expect(strengthSpec(s + 10).depth).toBeGreaterThanOrEqual(strengthSpec(s).depth);
  });

  it("at full strength takes a hanging queen", () => {
    const state = fromFen("rnbqkbnr/pppp1ppp/4p3/3Q4/8/8/PPPPPPPP/RNB1KBNR b KQkq - 0 1");
    expect(chooseMoveAt(state, 100, seededRandom(1))).toEqual({ from: "e6", to: "d5" });
    expect(chooseMoveAt(state, 0, seededRandom(1))).not.toBeNull();
  });
});
