import { describe, expect, it } from "vitest";
import { Crossmath, type CrossmathPuzzle } from "../src/index.js";

const {
  LEVELS, LEVEL_RULES, countSolutions, decodePuzzle, emptyPlay, encodePuzzle, evaluate, generatePuzzle, hintFor,
  linesOf, parsePlay, placeTile, puzzleCount, puzzleOf, takeBack, tilesOf, verdictOf
} = Crossmath;

const sample = () => puzzleOf("easy", 1);
// The sample's squares in reading order: 0 is given (2), 4 is given (1), 8 is given (10).
const cell = (r: number, c: number, n = 3) => r * n + c;

/** Fills the board from the stored solution, tile by tile. */
function solve(puzzle: CrossmathPuzzle) {
  const tiles = tilesOf(puzzle);
  const free = new Set(tiles.map((_, index) => index));
  let play = emptyPlay(puzzle);
  for (const at of Crossmath.blankCells(puzzle)) {
    const tile = [...free].find((index) => tiles[index] === Crossmath.solutionAt(puzzle, at))!;
    free.delete(tile);
    play = placeTile(puzzle, play, tile, at);
  }
  return play;
}

describe("Crossmath equations", () => {
  it("does × and ÷ before + and −", () => {
    expect(evaluate([2, 3, 4], ["+", "*"])).toBe(14);
    expect(evaluate([8, 4, 2], ["/", "*"])).toBe(4);
    expect(evaluate([9, 3, 2, 1], ["-", "*", "+"])).toBe(4);
  });

  it("wants every step a whole number", () => {
    expect(evaluate([7, 2], ["/"])).toBeNull();
    expect(evaluate([6, 4, 3], ["*", "/"])).toBe(8);
    // 3 − 5 dips below zero on the way, however it ends.
    expect(evaluate([3, 5, 4], ["-", "+"])).toBeNull();
  });
});

describe("the sample puzzle", () => {
  it("is Easy No. 1 with the proposal's totals", () => {
    const puzzle = sample();
    expect(linesOf(puzzle).map((line) => line.total)).toEqual([10, 10, 20, 12, 8, 20]);
    expect(tilesOf(puzzle)).toEqual([3, 4, 4, 5, 5, 6]);
  });

  it("has exactly one solution, and none to spare without its givens", () => {
    const puzzle = sample();
    expect(countSolutions(puzzle, 10)).toBe(1);
    const bare = { ...puzzle, given: puzzle.given.map((row) => row.map(() => false)) };
    expect(countSolutions(bare, 10)).toBeGreaterThan(1);
  });

  it("round-trips through its text form", () => {
    const puzzle = sample();
    expect(decodePuzzle(encodePuzzle(puzzle), "easy", "easy-1")).toEqual(puzzle);
  });
});

describe("the shipped set", () => {
  for (const level of LEVELS) {
    it(`${level}: every puzzle fits its level and has exactly one solution`, () => {
      const rule = LEVEL_RULES[level];
      expect(puzzleCount(level)).toBeGreaterThanOrEqual(30);
      for (let number = 1; number <= puzzleCount(level); number++) {
        const puzzle = puzzleOf(level, number);
        expect(puzzle.n).toBe(rule.n);
        const ops = new Set([...puzzle.rowOps.flat(), ...puzzle.colOps.flat()]);
        for (const op of ops) expect(rule.ops).toContain(op);
        expect(linesOf(puzzle).every((line) => line.total >= 0)).toBe(true);
        if (!(level === "easy" && number === 1)) expect(tilesOf(puzzle)).toHaveLength(rule.blanks);
        expect(countSolutions(puzzle), puzzle.id).toBe(1);
      }
      // Expert alone takes 2 s on a desktop and past vitest's default 5 s on a CI runner.
    }, 30_000);
  }

  it("is what the seeded generator makes", () => {
    for (const level of LEVELS) {
      for (const number of [2, 3]) {
        expect(encodePuzzle(generatePuzzle(level, number))).toBe(encodePuzzle(puzzleOf(level, number)));
      }
    }
  });
});

describe("playing a puzzle", () => {
  it("places, moves and takes back tiles", () => {
    const puzzle = sample();
    let play = placeTile(puzzle, emptyPlay(puzzle), 0, cell(0, 1));
    expect(play.cells[cell(0, 1)]).toBe(0);
    // The same tile on another square moves there.
    play = placeTile(puzzle, play, 0, cell(0, 2));
    expect(play.cells[cell(0, 1)]).toBeNull();
    expect(play.cells[cell(0, 2)]).toBe(0);
    // Another tile on an occupied square sends the first back.
    play = placeTile(puzzle, play, 3, cell(0, 2));
    expect(play.cells.filter((tile) => tile !== null)).toEqual([3]);
    play = takeBack(play, cell(0, 2));
    expect(play.cells.every((tile) => tile === null)).toBe(true);
    expect(() => placeTile(puzzle, play, 0, cell(0, 0))).toThrow("given");
  });

  it("tells an unfinished board from a wrong one", () => {
    const puzzle = sample();
    let play = emptyPlay(puzzle);
    expect(verdictOf(puzzle, play)).toEqual({ kind: "incomplete", empty: 6 });
    // Row 1 as 2 + 5 + 3 = 10 holds; column 2 is not full yet.
    play = placeTile(puzzle, play, 3, cell(0, 1));
    play = placeTile(puzzle, play, 0, cell(0, 2));
    expect(verdictOf(puzzle, play)).toEqual({ kind: "incomplete", empty: 4 });
    // Column 3 as 3 + 4 + 10 = 17, not 20; row 2 still has a gap.
    play = placeTile(puzzle, play, 1, cell(1, 2));
    const verdict = verdictOf(puzzle, play);
    expect(verdict.kind).toBe("incorrect");
    if (verdict.kind === "incorrect") {
      expect(verdict.wrong.map((line) => `${line.kind}${line.index}`)).toEqual(["col2"]);
      expect(verdict.empty).toBe(3);
    }
  });

  it("is solved when every line holds", () => {
    const puzzle = sample();
    expect(verdictOf(puzzle, solve(puzzle))).toEqual({ kind: "solved" });
  });

  it("checks the equations, not the stored answer", () => {
    // 1 + 1 = 2 across, and down; either 1 is either tile — and with two 2s
    // two ways round. Not a shipped puzzle: it has more than one solution.
    const puzzle: CrossmathPuzzle = {
      id: "two-ways", level: "easy", n: 2,
      rowOps: [["+"], ["+"]], colOps: [["+", "+"]],
      values: [[1, 2], [2, 1]], given: [[false, false], [false, false]]
    };
    expect(countSolutions(puzzle, 10)).toBe(2);
    // tiles: [1, 1, 2, 2] — lay the other one: 2 1 / 1 2.
    let play = emptyPlay(puzzle);
    play = placeTile(puzzle, play, 2, 0);
    play = placeTile(puzzle, play, 0, 1);
    play = placeTile(puzzle, play, 1, 2);
    play = placeTile(puzzle, play, 3, 3);
    expect(verdictOf(puzzle, play)).toEqual({ kind: "solved" });
  });

  it("hints a wrong tile first, then one right placement", () => {
    const puzzle = sample();
    // A 6 where the 3 belongs.
    let play = placeTile(puzzle, emptyPlay(puzzle), 5, cell(0, 1));
    expect(hintFor(puzzle, play)).toEqual({ kind: "wrong", cell: cell(0, 1) });
    play = takeBack(play, cell(0, 1));
    expect(hintFor(puzzle, play)).toEqual({ kind: "place", cell: cell(0, 1), tile: 0 });
    // A preferred empty square is the one hinted.
    expect(hintFor(puzzle, play, cell(2, 1))).toEqual({ kind: "place", cell: cell(2, 1), tile: 1 });
    const hinted = placeTile(puzzle, play, 1, cell(2, 1), true);
    expect(hinted.hinted).toEqual([cell(2, 1)]);
    expect(hintFor(puzzle, solve(puzzle))).toBeNull();
  });

  it("reads a saved play back only when it fits the puzzle", () => {
    const puzzle = sample();
    const play = placeTile(puzzle, emptyPlay(puzzle), 2, cell(1, 0), true);
    expect(parsePlay(puzzle, JSON.parse(JSON.stringify(play)))).toEqual(play);
    const twice = { cells: [null, 1, 1, null, null, null, null, null, null], hinted: [] };
    expect(() => parsePlay(puzzle, twice)).toThrow();
    const onGiven = { cells: [1, null, null, null, null, null, null, null, null], hinted: [] };
    expect(() => parsePlay(puzzle, onGiven)).toThrow();
    expect(() => parsePlay(puzzle, { cells: [] })).toThrow();
  });
});
