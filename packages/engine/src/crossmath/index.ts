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

export * from "./rules.js";
export { countSolutions } from "./solver.js";
export { generatePuzzle, LEVEL_RULES, seedOf } from "./generate.js";
