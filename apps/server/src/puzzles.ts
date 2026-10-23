// Chess puzzles: the server holds the set and the ratings. It picks each
// member's next puzzle (one they have not tried, near their rating or in the
// level they asked for) and keeps every first try in puzzle_attempts with the
// rating before and after, so a member's rating is their latest row's — a
// second try at the same puzzle is practice and moves nothing. The page plays
// the puzzle and reports solved or not and how many hints it took; the
// rating maths is the engine's, so both ends agree.
import {
  Chess,
  type ChessPuzzle,
  type PuzzleLevel
} from "@isputnik/games-engine";
import type { Db } from "./db.js";
import { PUZZLE_DATA } from "./puzzle-set.js";

export interface PuzzleMe {
  rating: number;
  /** Puzzles tried (first tries only). */
  played: number;
  solved: number;
  /** Puzzles solved in a row, newest first, a full-hint solve breaking it. */
  streak: number;
}

export interface PuzzleOffer {
  puzzle: ChessPuzzle & { level: PuzzleLevel };
  /** Every puzzle in reach was tried already: this one is a repeat, for practice. */
  repeat: boolean;
  me: PuzzleMe;
}

let cache: ChessPuzzle[] | null = null;

/** The set, parsed once: one puzzle per line, "id,fen,moves,rating,mateIn". */
export function puzzleSet(): ChessPuzzle[] {
  if (!cache) {
    cache = PUZZLE_DATA.trim().split("\n").map((line) => {
      const [id, fen, moves, rating, mateIn] = line.split(",");
      return { id, fen, moves: moves.split(" "), rating: Number(rating), mateIn: mateIn ? Number(mateIn) : null };
    });
  }
  return cache;
}

function findPuzzle(id: string): ChessPuzzle | undefined {
  return puzzleSet().find((puzzle) => puzzle.id === id);
}

interface AttemptRow {
  puzzle_id: string;
  solved: number;
  hints: number;
  rating_after: number;
}

export function puzzleMe(db: Db, memberId: string): PuzzleMe {
  const rows = db.prepare(
    "SELECT puzzle_id, solved, hints, rating_after FROM puzzle_attempts WHERE member_id = ? ORDER BY id DESC"
  ).all(memberId) as AttemptRow[];
  let streak = 0;
  for (const row of rows) {
    if (!countsAsSolved(row)) break;
    streak++;
  }
  return {
    rating: rows[0]?.rating_after ?? Chess.PUZZLE_START_RATING,
    played: rows.length,
    solved: rows.filter(countsAsSolved).length,
    streak
  };
}

/** Solved on their own, or with the piece pointed out — not with the move shown. */
function countsAsSolved(row: { solved: number; hints: number }): boolean {
  return row.solved === 1 && row.hints < 2;
}

/**
 * The next puzzle for this member: in `level` when they chose one, else
 * near their rating — within 150 points, then wider until something is
 * left. Tried puzzles are skipped while untried ones remain.
 */
export function nextPuzzle(db: Db, memberId: string, level: PuzzleLevel | "auto", random: () => number = Math.random): PuzzleOffer {
  const me = puzzleMe(db, memberId);
  const tried = new Set((db.prepare("SELECT puzzle_id FROM puzzle_attempts WHERE member_id = ?").all(memberId) as { puzzle_id: string }[])
    .map((row) => row.puzzle_id));
  const all = puzzleSet();
  let pool: ChessPuzzle[];
  if (level === "auto") {
    pool = [];
    for (const spread of [150, 300, 600, Infinity]) {
      pool = all.filter((puzzle) => Math.abs(puzzle.rating - me.rating) <= spread);
      if (pool.some((puzzle) => !tried.has(puzzle.id))) break;
    }
  } else {
    pool = all.filter((puzzle) => Chess.puzzleLevel(puzzle.rating) === level);
  }
  const fresh = pool.filter((puzzle) => !tried.has(puzzle.id));
  const from = fresh.length ? fresh : pool.length ? pool : all;
  const puzzle = from[Math.floor(random() * from.length)];
  return { puzzle: { ...puzzle, level: Chess.puzzleLevel(puzzle.rating) }, repeat: fresh.length === 0, me };
}

export class UnknownPuzzleError extends Error {}

export interface PuzzleResult {
  /** False for a second try: practice, the rating stays. */
  recorded: boolean;
  before: number;
  after: number;
  me: PuzzleMe;
}

export function recordPuzzleResult(db: Db, memberId: string, puzzleId: string, input: { solved: boolean; hints: number }): PuzzleResult {
  const puzzle = findPuzzle(puzzleId);
  if (!puzzle) throw new UnknownPuzzleError("No such puzzle");
  return db.transaction((): PuzzleResult => {
    const me = puzzleMe(db, memberId);
    const score = Chess.puzzleScore(input.solved, input.hints);
    const after = Chess.nextPuzzleRating(me.rating, me.played, puzzle.rating, score);
    const info = db.prepare(`
      INSERT INTO puzzle_attempts (member_id, puzzle_id, solved, hints, rating_before, rating_after)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT (member_id, puzzle_id) DO NOTHING
    `).run(memberId, puzzleId, input.solved ? 1 : 0, input.hints, me.rating, after);
    if (info.changes === 0) return { recorded: false, before: me.rating, after: me.rating, me };
    return { recorded: true, before: me.rating, after, me: puzzleMe(db, memberId) };
  })();
}

export interface PuzzleRow {
  id: string;
  name: string;
  rating: number;
  played: number;
  solved: number;
  /** Solved since the start of the month the lobby asked about. */
  solvedSince: number;
}

/** Everyone who has tried a puzzle, for the leaderboard's Puzzles tab. */
export function puzzleStats(db: Db, names: Map<string, string>, since: string): PuzzleRow[] {
  const rows = db.prepare(
    "SELECT member_id, solved, hints, rating_after, finished_at FROM puzzle_attempts ORDER BY id"
  ).all() as (AttemptRow & { member_id: string; finished_at: string })[];
  const byMember = new Map<string, PuzzleRow>();
  for (const row of rows) {
    let entry = byMember.get(row.member_id);
    if (!entry) {
      entry = { id: row.member_id, name: names.get(row.member_id) ?? row.member_id, rating: 0, played: 0, solved: 0, solvedSince: 0 };
      byMember.set(row.member_id, entry);
    }
    entry.rating = row.rating_after;
    entry.played++;
    if (countsAsSolved(row)) {
      entry.solved++;
      if (row.finished_at >= since) entry.solvedSince++;
    }
  }
  return [...byMember.values()];
}
