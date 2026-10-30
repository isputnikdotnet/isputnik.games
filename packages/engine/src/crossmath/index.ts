import type { SoloDefinition } from "../solo.js";
import { CROSSMATH_SET } from "./set.js";
import { LEVELS, decodePuzzle, type CrossmathLevel, type CrossmathPuzzle } from "./rules.js";

// The shipped puzzles: CROSSMATH_SET, built ahead of time and checked by the
// tests to have one solution each. A puzzle is addressed by its level and its
// number there, from 1.

export const crossmath: SoloDefinition<CrossmathLevel> = { id: "crossmath", levels: LEVELS };

export function puzzleCount(level: CrossmathLevel): number {
  return CROSSMATH_SET[level].length;
}

export function puzzleOf(level: CrossmathLevel, number: number): CrossmathPuzzle {
  const text = CROSSMATH_SET[level][number - 1];
  if (!text) throw new RangeError(`No ${level} puzzle number ${number}`);
  return decodePuzzle(text, level, `${level}-${number}`);
}

export function isLevel(value: unknown): value is CrossmathLevel {
  return (LEVELS as readonly unknown[]).includes(value);
}

/** The next puzzle after `number` that is not done, going round the level; null when none is left. */
export function nextUndone(level: CrossmathLevel, number: number, isDone: (id: string) => boolean): number | null {
  const count = puzzleCount(level);
  for (let step = 1; step < count; step++) {
    const candidate = ((number - 1 + step) % count) + 1;
    if (!isDone(`${level}-${candidate}`)) return candidate;
  }
  return null;
}

export * from "./rules.js";
export * from "./rating.js";
export { countSolutions } from "./solver.js";
export { generatePuzzle, LEVEL_RULES, seedOf } from "./generate.js";
