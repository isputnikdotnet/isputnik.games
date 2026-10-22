import { describe, expect, it } from "vitest";
import { seededRandom } from "../src/random.js";
import { chooseMove } from "../src/dots/ai.js";
import { applyMove, createGame, fromDiagram, isPlayable, type DotsState } from "../src/dots/rules.js";

const empty = (size: number) => createGame({ size, targetCaptures: null });

describe("dots ai", () => {
  it("opens near the middle", () => {
    const move = chooseMove(empty(15), "easy", seededRandom(1))!;
    expect(move.x).toBeGreaterThanOrEqual(5);
    expect(move.x).toBeLessThanOrEqual(9);
    expect(move.y).toBeGreaterThanOrEqual(5);
    expect(move.y).toBeLessThanOrEqual(9);
  });

  it("always answers with a legal move", () => {
    let state: DotsState = empty(10);
    const random = seededRandom(7);
    for (let i = 0; i < 60 && state.status.kind === "playing"; i++) {
      const move = chooseMove(state, i % 2 ? "normal" : "easy", random)!;
      expect(isPlayable(state, move.x, move.y)).toBe(true);
      state = applyMove(state, move);
    }
    expect(chooseMove({ ...state, status: { kind: "finished", winner: null, reason: "agreed" } }, "easy", random)).toBeNull();
  });

  it("takes a capture that is on offer", () => {
    // Blue to move; (2,3) completes the diamond around red's (2,2).
    const state = fromDiagram([
      "..........",
      "..b.......",
      ".brb......",
      "..........",
      "..........",
      "..........",
      "..........",
      "..........",
      ".........r",
      "........r."
    ]);
    expect(state.status).toEqual({ kind: "playing", turn: 0 });
    for (const level of ["easy", "normal", "hard"] as const) {
      expect(chooseMove(state, level, seededRandom(3))).toEqual({ x: 2, y: 3 });
    }
  });

  it("at hard, prefers the move that sets up a capture over a plain one", () => {
    // Blue to move; (3,2) leaves red's (2,2) one move from captured; nothing else does.
    const state = fromDiagram([
      "..........",
      "..b.......",
      ".br.......",
      "..........",
      "..........",
      "..........",
      "..........",
      "..........",
      "........r.",
      ".........."
    ]);
    expect(state.status).toEqual({ kind: "playing", turn: 0 });
    let threatening = 0;
    for (let seed = 1; seed <= 6; seed++) {
      const move = chooseMove(state, "hard", seededRandom(seed))!;
      if ((move.x === 3 && move.y === 2) || (move.x === 2 && move.y === 3)) threatening++;
    }
    expect(threatening).toBe(6);
  });

  it("does not walk into a finished house", () => {
    // Red to move; (2,2) sits inside blue's closed diamond.
    const state = fromDiagram([
      "..........",
      "..b.......",
      ".b.b......",
      "..b.......",
      "..........",
      "..........",
      "..........",
      "........r.",
      ".........r",
      "........r."
    ]);
    expect(state.status).toEqual({ kind: "playing", turn: 1 });
    for (let seed = 1; seed <= 5; seed++) {
      const move = chooseMove(state, "normal", seededRandom(seed))!;
      expect(move).not.toEqual({ x: 2, y: 2 });
    }
  });

  it("blocks a capture the opponent could make next", () => {
    // Red to move; blue threatens to close the diamond around red's (2,2) at (2,3).
    const state = fromDiagram([
      "..........",
      "..b.......",
      ".brb......",
      "..........",
      "..........",
      "..........",
      "..........",
      "........r.",
      "..........",
      ".........."
    ]);
    expect(state.status).toEqual({ kind: "playing", turn: 1 });
    const move = chooseMove(state, "normal", seededRandom(11))!;
    expect(move).toEqual({ x: 2, y: 3 });
  });

  it("decides a 30×30 middle game quickly", () => {
    let state = empty(30);
    const random = seededRandom(99);
    for (let i = 0; i < 120 && state.status.kind === "playing"; i++) {
      state = applyMove(state, chooseMove(state, "easy", random)!);
    }
    const started = performance.now();
    const move = chooseMove(state, "normal", random)!;
    const took = performance.now() - started;
    expect(isPlayable(state, move.x, move.y)).toBe(true);
    expect(took).toBeLessThan(1500);

    const startedHard = performance.now();
    const hard = chooseMove(state, "hard", random)!;
    const tookHard = performance.now() - startedHard;
    expect(isPlayable(state, hard.x, hard.y)).toBe(true);
    expect(tookHard).toBeLessThan(4000);
  });
});
