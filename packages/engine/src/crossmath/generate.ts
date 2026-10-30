import { seededRandom } from "../random.js";
import { evaluate, type CrossmathLevel, type CrossmathPuzzle, type Op } from "./rules.js";
import { countSolutions } from "./solver.js";

// Makes the shipped puzzles, at build time (scripts/build-crossmath-set.mjs),
// never in the browser: a seeded grid of numbers and operators whose every line
// works out, then given numbers taken away one at a time, keeping each removal
// only while the solver still finds exactly one solution. The same level and
// seed always make the same puzzle, so the set can be rebuilt and checked.

export interface LevelRule {
  n: number;
  ops: readonly Op[];
  /** Numbers on the grid run from 1 to this. */
  max: number;
  /** Squares to leave for tiles. */
  blanks: number;
  /** No total above this: a line stays sums a person can do in their head. */
  maxTotal: number;
}

export const LEVEL_RULES: Record<CrossmathLevel, LevelRule> = {
  easy: { n: 3, ops: ["+", "-"], max: 9, blanks: 6, maxTotal: 30 },
  medium: { n: 4, ops: ["+", "-", "*"], max: 9, blanks: 10, maxTotal: 99 },
  hard: { n: 5, ops: ["+", "-", "*", "/"], max: 9, blanks: 15, maxTotal: 99 },
  expert: { n: 6, ops: ["+", "-", "*", "/"], max: 9, blanks: 22, maxTotal: 120 }
};

/** The seed of a level's puzzle number `number` (1-based). */
export function seedOf(level: CrossmathLevel, number: number): number {
  let hash = 2166136261;
  for (const char of `${level}:${number}`) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return hash >>> 0;
}

type Draft = Pick<CrossmathPuzzle, "n" | "rowOps" | "colOps" | "values" | "given">;

export function generatePuzzle(level: CrossmathLevel, number: number): CrossmathPuzzle {
  const rule = LEVEL_RULES[level];
  const random = seededRandom(seedOf(level, number));
  const pick = <T>(items: readonly T[]) => items[Math.floor(random() * items.length)];
  const { n } = rule;
  for (let attempt = 0; attempt < 1_000_000; attempt++) {
    // The numbers first, then each line's operators: a line's operators touch
    // only its own total, so each line can be dealt again until it works out.
    const values = Array.from({ length: n }, () => Array.from({ length: n }, () => 1 + Math.floor(random() * rule.max)));
    const lineOps = (numbers: number[]) => {
      for (let deal = 0; deal < 200; deal++) {
        const ops = Array.from({ length: n - 1 }, () => pick(rule.ops));
        const total = evaluate(numbers, ops);
        if (total !== null && total <= rule.maxTotal) return ops;
      }
      return null;
    };
    const rowOps = values.map((row) => lineOps(row));
    const columns = values[0].map((_, c) => lineOps(values.map((row) => row[c])));
    if (rowOps.some((ops) => !ops) || columns.some((ops) => !ops)) continue;
    const colOps = Array.from({ length: n - 1 }, (_, r) => columns.map((ops) => ops![r]));
    // Every operator the level brings shows up somewhere.
    const used = new Set([...rowOps.flat(), ...colOps.flat()]);
    if (rule.ops.some((op) => !used.has(op))) continue;
    const draft: Draft = { n, rowOps: rowOps as Op[][], colOps, values, given: values.map((row) => row.map(() => true)) };
    if (!clear(draft, rule.blanks, random)) continue;
    // Each line keeps at least one square to fill.
    const rowOpen = draft.given.every((row) => row.some((given) => !given));
    const colOpen = draft.given[0].every((_, c) => draft.given.some((row) => !row[c]));
    if (!rowOpen || !colOpen) continue;
    return { id: `${level}-${number}`, level, ...draft };
  }
  throw new Error(`No ${level} puzzle for number ${number}`);
}

/** Takes given numbers away in a seeded order while the puzzle stays unique;
 *  false when it stops short of `blanks`. */
function clear(draft: Draft, blanks: number, random: () => number): boolean {
  const { n } = draft;
  const order = Array.from({ length: n * n }, (_, cell) => cell);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  const probe: CrossmathPuzzle = { id: "draft", level: "easy", ...draft };
  let open = 0;
  for (const cell of order) {
    if (open === blanks) break;
    const r = Math.floor(cell / n);
    const c = cell % n;
    draft.given[r][c] = false;
    if (countSolutions(probe) === 1) open++;
    else draft.given[r][c] = true;
  }
  return open === blanks;
}
