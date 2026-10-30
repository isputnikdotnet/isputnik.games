import { LEVELS, type CrossmathLevel } from "./rules.js";

// What a solved Crossmath is worth, here so the server and the page agree. Every
// level counts as an opponent of a fixed rating and a solve scores from 1 down:
// slower than par costs up to half, and hints take their share of the squares.
// The numbers are a first estimate, to tune once the family has played.

export const START_RATING = 800;
export const RATING_FLOOR = 400;
export const LEVEL_RATING: Record<CrossmathLevel, number> = { easy: 800, medium: 1100, hard: 1400, expert: 1700 };
/** A good time at each level; three times this is the slowest the clock can cost. */
export const PAR_SECONDS: Record<CrossmathLevel, number> = { easy: 60, medium: 180, hard: 420, expert: 900 };
/** A solve at this score or better is doing well: no hints inside twice par, or a hint or so inside par. */
export const WELL_SCORE = 0.75;
/** First solves in a row at a level, each doing well, before the next level is offered. */
export const WELL_RUN = 3;
/** A solve whose time is not known (from before the clock always ran) counts as twice par. */
const UNKNOWN_TIME_SCORE = 0.75;

export function solveScore(level: CrossmathLevel, seconds: number | null, hints: number, blanks: number): number {
  const par = PAR_SECONDS[level];
  const time = seconds === null ? UNKNOWN_TIME_SCORE : 1 - 0.5 * Math.min(1, Math.max(0, seconds - par) / (2 * par));
  return time * (1 - Math.min(hints, blanks) / blanks);
}

export function nextRating(rating: number, played: number, level: CrossmathLevel, score: number): number {
  const k = played < 20 ? 40 : 20;
  const expected = 1 / (1 + 10 ** ((LEVEL_RATING[level] - rating) / 400));
  return Math.max(RATING_FLOOR, Math.round(rating + k * (score - expected)));
}

/** The level above, or null at the top. */
export function harderLevel(level: CrossmathLevel): CrossmathLevel | null {
  return LEVELS[LEVELS.indexOf(level) + 1] ?? null;
}
