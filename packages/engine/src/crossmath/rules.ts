// Crossmath: a crossword of sums for one player (docs/plan.md → Crossmath). An
// n × n grid of numbers; every row and every column is an equation with its
// operators and its total printed. Some numbers are given; the rest are tiles
// from a fixed bank, each placed once. Solved when every square is filled and
// every line works out — the equations are what is checked, not a stored answer.
//
// One reading of an equation everywhere (rules, solver, generator, page):
// × and ÷ before + and −, then left to right, and every step a whole number —
// a ÷ that leaves a remainder, or a running total below zero, makes the line
// fail however it ends. A published puzzle has exactly one solution under that
// reading (solver.ts), so the hint can lean on the stored one.

export type Op = "+" | "-" | "*" | "/";
export const OPS: readonly Op[] = ["+", "-", "*", "/"];

export const LEVELS = ["easy", "medium", "hard", "expert"] as const;
export type CrossmathLevel = (typeof LEVELS)[number];

export interface CrossmathPuzzle {
  /** "easy-1": the level and the puzzle's number in it. */
  id: string;
  level: CrossmathLevel;
  /** Numbers to a side. */
  n: number;
  /** rowOps[r][c] stands between columns c and c + 1 of row r. */
  rowOps: Op[][];
  /** colOps[r][c] stands between rows r and r + 1 of column c. */
  colOps: Op[][];
  /** The solution, row by row. */
  values: number[][];
  /** The numbers printed on the grid. */
  given: boolean[][];
}

export interface Line {
  kind: "row" | "col";
  index: number;
  /** Cell indices (r * n + c) in reading order. */
  cells: number[];
  ops: Op[];
  total: number;
}

/** What an equation comes to, × ÷ first; null when a step is not a whole number. */
export function evaluate(numbers: readonly number[], ops: readonly Op[]): number | null {
  const terms = [numbers[0]];
  const joins: Op[] = [];
  for (let i = 0; i < ops.length; i++) {
    const op = ops[i];
    const next = numbers[i + 1];
    const last = terms.length - 1;
    if (op === "*") terms[last] *= next;
    else if (op === "/") {
      if (next === 0 || terms[last] % next !== 0) return null;
      terms[last] /= next;
    } else {
      terms.push(next);
      joins.push(op);
    }
  }
  let value = terms[0];
  for (let i = 0; i < joins.length; i++) {
    value = joins[i] === "+" ? value + terms[i + 1] : value - terms[i + 1];
    if (value < 0) return null;
  }
  return value;
}

/** Every row, then every column, with its total worked out from the solution. */
export function linesOf(puzzle: CrossmathPuzzle): Line[] {
  const { n } = puzzle;
  const lines: Line[] = [];
  for (let r = 0; r < n; r++) {
    const cells = Array.from({ length: n }, (_, c) => r * n + c);
    lines.push({ kind: "row", index: r, cells, ops: puzzle.rowOps[r], total: 0 });
  }
  for (let c = 0; c < n; c++) {
    const cells = Array.from({ length: n }, (_, r) => r * n + c);
    lines.push({ kind: "col", index: c, cells, ops: puzzle.colOps.map((row) => row[c]), total: 0 });
  }
  const flat = puzzle.values.flat();
  for (const line of lines) {
    const total = evaluate(line.cells.map((cell) => flat[cell]), line.ops);
    if (total === null) throw new Error(`${puzzle.id}: ${line.kind} ${line.index} has no whole-number total`);
    line.total = total;
  }
  return lines;
}

export const isGiven = (puzzle: CrossmathPuzzle, cell: number) => puzzle.given[Math.floor(cell / puzzle.n)][cell % puzzle.n];
export const solutionAt = (puzzle: CrossmathPuzzle, cell: number) => puzzle.values[Math.floor(cell / puzzle.n)][cell % puzzle.n];

/** The squares the player fills, in reading order. */
export function blankCells(puzzle: CrossmathPuzzle): number[] {
  const cells: number[] = [];
  for (let cell = 0; cell < puzzle.n * puzzle.n; cell++) if (!isGiven(puzzle, cell)) cells.push(cell);
  return cells;
}

/** The tile bank, smallest first. Two 5s are two tiles: a tile is its index here. */
export function tilesOf(puzzle: CrossmathPuzzle): number[] {
  return blankCells(puzzle).map((cell) => solutionAt(puzzle, cell)).sort((a, b) => a - b);
}

// ── A puzzle in play ───────────────────────────────────────────────────────

/** Where the tiles are: cells[cell] is the tile on that square, or null. Given
 *  squares stay null. Plain JSON, so a page can keep it as it is. */
export interface CrossmathPlay {
  cells: (number | null)[];
  /** Squares filled by a hint, in the order they were. */
  hinted: number[];
}

export function emptyPlay(puzzle: CrossmathPuzzle): CrossmathPlay {
  return { cells: Array.from({ length: puzzle.n * puzzle.n }, () => null), hinted: [] };
}

export class CrossmathMoveError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CrossmathMoveError";
  }
}

/** Puts a tile on a square. A tile already elsewhere moves; a tile already on
 *  the square goes back to the bank. Never mutates `play`. */
export function placeTile(puzzle: CrossmathPuzzle, play: CrossmathPlay, tile: number, cell: number, byHint = false): CrossmathPlay {
  const tiles = tilesOf(puzzle);
  if (!Number.isInteger(tile) || tile < 0 || tile >= tiles.length) throw new CrossmathMoveError("No such tile");
  if (!Number.isInteger(cell) || cell < 0 || cell >= play.cells.length) throw new CrossmathMoveError("No such square");
  if (isGiven(puzzle, cell)) throw new CrossmathMoveError("That number is given");
  const cells = play.cells.map((on) => (on === tile ? null : on));
  cells[cell] = tile;
  const hinted = play.hinted.filter((at) => at !== cell && cells[at] !== null);
  if (byHint) hinted.push(cell);
  return { cells, hinted };
}

/** Sends the tile on a square back to the bank. */
export function takeBack(play: CrossmathPlay, cell: number): CrossmathPlay {
  if (play.cells[cell] == null) return play;
  const cells = [...play.cells];
  cells[cell] = null;
  return { cells, hinted: play.hinted.filter((at) => at !== cell) };
}

/** The number on each square: given, a tile, or null for an empty one. */
export function gridValues(puzzle: CrossmathPuzzle, play: CrossmathPlay): (number | null)[] {
  const tiles = tilesOf(puzzle);
  return play.cells.map((tile, cell) => (isGiven(puzzle, cell) ? solutionAt(puzzle, cell) : tile == null ? null : tiles[tile]));
}

export function usedTiles(play: CrossmathPlay): Set<number> {
  return new Set(play.cells.filter((tile): tile is number => tile != null));
}

export interface LineResult {
  line: Line;
  /** Every square on it filled. */
  full: boolean;
  /** Full and working out to its total. */
  holds: boolean;
}

export function lineResults(puzzle: CrossmathPuzzle, play: CrossmathPlay, lines = linesOf(puzzle)): LineResult[] {
  const grid = gridValues(puzzle, play);
  return lines.map((line) => {
    const numbers = line.cells.map((cell) => grid[cell]);
    const full = numbers.every((value) => value != null);
    return { line, full, holds: full && evaluate(numbers as number[], line.ops) === line.total };
  });
}

/** What Check says. Wrong lines come first: a board with a mistake on it is
 *  incorrect however much of it is still empty. */
export type Verdict =
  | { kind: "solved" }
  | { kind: "incorrect"; wrong: Line[]; empty: number }
  | { kind: "incomplete"; empty: number };

export function verdictOf(puzzle: CrossmathPuzzle, play: CrossmathPlay): Verdict {
  const results = lineResults(puzzle, play);
  const empty = blankCells(puzzle).filter((cell) => play.cells[cell] == null).length;
  const wrong = results.filter((result) => result.full && !result.holds).map((result) => result.line);
  if (wrong.length) return { kind: "incorrect", wrong, empty };
  if (empty) return { kind: "incomplete", empty };
  // Every square filled means every tile used: there are as many tiles as squares.
  return { kind: "solved" };
}

export function isSolved(puzzle: CrossmathPuzzle, play: CrossmathPlay): boolean {
  return verdictOf(puzzle, play).kind === "solved";
}

/** What Hint does: first a tile that is in the wrong place, then one correct
 *  placement — on `prefer` when that square is empty, else the first empty one. */
export type Hint = { kind: "wrong"; cell: number } | { kind: "place"; cell: number; tile: number };

export function hintFor(puzzle: CrossmathPuzzle, play: CrossmathPlay, prefer?: number | null): Hint | null {
  const tiles = tilesOf(puzzle);
  const blanks = blankCells(puzzle);
  const wrong = blanks.find((cell) => play.cells[cell] != null && tiles[play.cells[cell]!] !== solutionAt(puzzle, cell));
  if (wrong !== undefined) return { kind: "wrong", cell: wrong };
  const cell = prefer != null && blanks.includes(prefer) && play.cells[prefer] == null ? prefer : blanks.find((at) => play.cells[at] == null);
  if (cell === undefined) return null;
  const used = usedTiles(play);
  const tile = tiles.findIndex((value, index) => value === solutionAt(puzzle, cell) && !used.has(index));
  // Every placed tile is right, so the free ones are exactly the missing values.
  return tile < 0 ? null : { kind: "place", cell, tile };
}

/** A saved play as it came back from storage, checked against its puzzle. */
export function parsePlay(puzzle: CrossmathPuzzle, input: unknown): CrossmathPlay {
  const value = input as Partial<CrossmathPlay> | null;
  const size = puzzle.n * puzzle.n;
  const count = tilesOf(puzzle).length;
  if (!value || !Array.isArray(value.cells) || value.cells.length !== size || !Array.isArray(value.hinted)) throw new CrossmathMoveError("Not a saved puzzle");
  const seen = new Set<number>();
  const cells = value.cells.map((tile, cell) => {
    if (tile == null) return null;
    if (!Number.isInteger(tile) || tile < 0 || tile >= count || seen.has(tile) || isGiven(puzzle, cell)) throw new CrossmathMoveError("A saved tile is out of place");
    seen.add(tile);
    return tile;
  });
  const hinted = value.hinted.filter((cell): cell is number => Number.isInteger(cell) && cells[cell] != null);
  return { cells, hinted: [...new Set(hinted)] };
}

// ── Puzzles as text ────────────────────────────────────────────────────────
// One line per puzzle in the shipped set: "n|row ops|col ops|values|given",
// e.g. "3|++,++,++|+++,+++|2.3.5,4.1.5,6.4.10|100,010,001".

export function encodePuzzle(puzzle: Omit<CrossmathPuzzle, "id" | "level">): string {
  return [
    puzzle.n,
    puzzle.rowOps.map((row) => row.join("")).join(","),
    puzzle.colOps.map((row) => row.join("")).join(","),
    puzzle.values.map((row) => row.join(".")).join(","),
    puzzle.given.map((row) => row.map((given) => (given ? "1" : "0")).join("")).join(",")
  ].join("|");
}

export function decodePuzzle(text: string, level: CrossmathLevel, id: string): CrossmathPuzzle {
  const [size, rows, cols, values, given] = text.split("|");
  const n = Number(size);
  const ops = (part: string) => part.split(",").map((row) => [...row] as Op[]);
  return {
    id,
    level,
    n,
    rowOps: ops(rows),
    colOps: ops(cols),
    values: values.split(",").map((row) => row.split(".").map(Number)),
    given: given.split(",").map((row) => [...row].map((flag) => flag === "1"))
  };
}
