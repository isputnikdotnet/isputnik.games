// Crossmath results: the page plays the puzzle on the device and sends the
// finished tiles here with the time and the hints it took. The tiles are checked
// through the rules, so only a real solve counts. A member's first solve of a
// puzzle moves their rating and is kept with the rating before and after, so
// their rating is their latest row's; solving it again is practice and can only
// better the puzzle's best time. The rating maths is the engine's.
import { Crossmath, type CrossmathLevel } from "@isputnik/games-engine";
import type { Db } from "./db.js";
import { MatchError } from "./matches.js";
import { UnknownPuzzleError } from "./puzzles.js";

export interface CrossmathLevelStats {
  solved: number;
  count: number;
  /** The quickest solve here with no hints; null before one. */
  bestSeconds: number | null;
  /** The latest first solves here have gone well: time to offer the next level. */
  ready: boolean;
}

export interface CrossmathSolve {
  seconds: number | null;
  hints: number;
  bestSeconds: number | null;
}

export interface CrossmathMe {
  rating: number;
  played: number;
  levels: Record<CrossmathLevel, CrossmathLevelStats>;
  /** By puzzle id ("easy-3"): what the first solve took, and the best time since. */
  puzzles: Record<string, CrossmathSolve>;
}

export interface CrossmathResult {
  /** False for a puzzle already solved: practice, the rating stays. */
  recorded: boolean;
  before: number;
  after: number;
  /** This solve bettered the puzzle's earlier best time. */
  newBest: boolean;
  me: CrossmathMe;
}

interface ResultRow {
  puzzle_id: string;
  level: CrossmathLevel;
  hints: number;
  seconds: number | null;
  best_seconds: number | null;
  rating_after: number;
}

const ID = /^(easy|medium|hard|expert)-([1-9]\d{0,3})$/;

function puzzleById(id: string) {
  const match = ID.exec(id);
  const level = match?.[1] as CrossmathLevel | undefined;
  const number = Number(match?.[2]);
  if (!level || number > Crossmath.puzzleCount(level)) throw new UnknownPuzzleError("No such puzzle");
  return Crossmath.puzzleOf(level, number);
}

export function crossmathMe(db: Db, memberId: string): CrossmathMe {
  const rows = db.prepare(
    "SELECT puzzle_id, level, hints, seconds, best_seconds, rating_after FROM crossmath_results WHERE member_id = ? ORDER BY id DESC"
  ).all(memberId) as ResultRow[];
  const levels = {} as CrossmathMe["levels"];
  for (const level of Crossmath.LEVELS) {
    const here = rows.filter((row) => row.level === level);
    const bests = here.flatMap((row) => (row.best_seconds === null ? [] : [row.best_seconds]));
    const latest = here.slice(0, Crossmath.WELL_RUN);
    levels[level] = {
      solved: here.length,
      count: Crossmath.puzzleCount(level),
      bestSeconds: bests.length ? Math.min(...bests) : null,
      ready: latest.length === Crossmath.WELL_RUN && latest.every(didWell)
    };
  }
  return {
    rating: rows[0]?.rating_after ?? Crossmath.START_RATING,
    played: rows.length,
    levels,
    puzzles: Object.fromEntries(rows.map((row) => [row.puzzle_id, { seconds: row.seconds, hints: row.hints, bestSeconds: row.best_seconds }]))
  };
}

function didWell(row: ResultRow): boolean {
  const blanks = Crossmath.blankCells(puzzleById(row.puzzle_id)).length;
  return Crossmath.solveScore(row.level, row.seconds, row.hints, blanks) >= Crossmath.WELL_SCORE;
}

export function recordCrossmathResult(
  db: Db,
  memberId: string,
  puzzleId: string,
  input: { play: unknown; hints: number; seconds: number | null }
): CrossmathResult {
  const puzzle = puzzleById(puzzleId);
  let hints: number;
  try {
    const play = Crossmath.parsePlay(puzzle, input.play);
    if (!Crossmath.isSolved(puzzle, play)) throw new Error("The lines do not work out");
    // A hint taken back still leaves its mark on the count the page keeps.
    hints = Math.max(input.hints, play.hinted.length);
  } catch (error) {
    throw new MatchError(400, `Not a solved puzzle: ${(error as Error).message}`);
  }
  const clean = hints === 0 ? input.seconds : null;

  return db.transaction((): CrossmathResult => {
    const me = crossmathMe(db, memberId);
    const earlier = me.puzzles[puzzleId];
    if (earlier) {
      const newBest = clean !== null && (earlier.bestSeconds === null || clean < earlier.bestSeconds);
      if (newBest) db.prepare("UPDATE crossmath_results SET best_seconds = ? WHERE member_id = ? AND puzzle_id = ?").run(clean, memberId, puzzleId);
      return { recorded: false, before: me.rating, after: me.rating, newBest, me: newBest ? crossmathMe(db, memberId) : me };
    }
    const score = Crossmath.solveScore(puzzle.level, input.seconds, hints, Crossmath.blankCells(puzzle).length);
    const after = Crossmath.nextRating(me.rating, me.played, puzzle.level, score);
    db.prepare(`
      INSERT INTO crossmath_results (member_id, puzzle_id, level, hints, seconds, best_seconds, rating_before, rating_after)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(memberId, puzzleId, puzzle.level, hints, input.seconds, clean, me.rating, after);
    return { recorded: true, before: me.rating, after, newBest: false, me: crossmathMe(db, memberId) };
  })();
}
