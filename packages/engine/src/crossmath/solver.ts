import { blankCells, evaluate, isGiven, linesOf, solutionAt, tilesOf, type CrossmathPuzzle } from "./rules.js";

// Counts how many ways the tile bank fills the blanks so that every line works
// out, stopping at `limit` — the generator asks for 2 to learn "exactly one".
// It reads only the given numbers, the operators, the totals and the bank: the
// stored solution plays no part, or a second answer could hide behind it.
// Blanks fill in reading order. A line is checked as its last blank fills, and
// a line down to one empty square is looked ahead at: if no tile left in the
// bank would make it work out, the search turns back at once instead of after
// filling the rows between (it is what keeps a 6 × 6 down to seconds).
export function countSolutions(puzzle: CrossmathPuzzle, limit = 2): number {
  const { n } = puzzle;
  const lines = linesOf(puzzle);
  const rows = lines.filter((line) => line.kind === "row");
  const cols = lines.filter((line) => line.kind === "col");
  const grid: number[] = Array.from({ length: n * n }, (_, cell) => (isGiven(puzzle, cell) ? solutionAt(puzzle, cell) : 0));
  const blanks = blankCells(puzzle);

  const bag = new Map<number, number>();
  for (const value of tilesOf(puzzle)) bag.set(value, (bag.get(value) ?? 0) + 1);
  const values = [...bag.keys()];

  const holds = (line: (typeof lines)[number]) => evaluate(line.cells.map((cell) => grid[cell]), line.ops) === line.total;
  // Empty squares left on each line, kept as the search goes.
  const emptyRow = Array.from({ length: n }, () => 0);
  const emptyCol = Array.from({ length: n }, () => 0);
  for (const cell of blanks) {
    emptyRow[Math.floor(cell / n)]++;
    emptyCol[cell % n]++;
  }
  /** A line with one empty square: whether some tile still in the bank fits it. */
  const canFinish = (line: (typeof lines)[number]) => {
    const open = line.cells.find((cell) => grid[cell] === 0)!;
    for (const value of values) {
      if (!bag.get(value)) continue;
      grid[open] = value;
      const ok = holds(line);
      grid[open] = 0;
      if (ok) return true;
    }
    return false;
  };
  const viable = (line: (typeof lines)[number], empty: number) => (empty === 0 ? holds(line) : empty === 1 ? canFinish(line) : true);

  let found = 0;
  const fill = (i: number) => {
    if (found >= limit) return;
    if (i === blanks.length) {
      found++;
      return;
    }
    const cell = blanks[i];
    const r = Math.floor(cell / n);
    const c = cell % n;
    emptyRow[r]--;
    emptyCol[c]--;
    for (const value of values) {
      const left = bag.get(value)!;
      if (!left) continue;
      bag.set(value, left - 1);
      grid[cell] = value;
      if (viable(rows[r], emptyRow[r]) && viable(cols[c], emptyCol[c])) fill(i + 1);
      bag.set(value, left);
      if (found >= limit) break;
    }
    grid[cell] = 0;
    emptyRow[r]++;
    emptyCol[c]++;
  };
  fill(0);
  return found;
}
