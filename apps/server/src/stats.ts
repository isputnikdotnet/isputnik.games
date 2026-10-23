// The family's results, for the lobby's leaderboard and "Your month". The
// leaderboard's Each other tab counts finished online matches between two
// members (a match with a guest is a visit, not a family result); its vs
// Computer tab counts the games against the computer the members' browsers
// reported (computer_results), scored by the level beaten. The numbers are per
// member and per game, for this month and for all time; the lobby sums or
// filters them as its switches say, so one small answer serves every view.
// Its Puzzles tab ranks the members' chess puzzle ratings (puzzles.ts).
import type { AiLevel } from "@isputnik/games-engine";
import type { Db } from "./db.js";
import { isGuestId } from "./identity.js";
import { puzzleStats, type PuzzleRow } from "./puzzles.js";

export interface StatsRow {
  id: string;
  name: string;
  game: string;
  played: number;
  won: number;
  drawn: number;
}

export interface FamilyStats {
  /** Where "this month" began, as the server took it. */
  since: string;
  month: StatsRow[];
  all: StatsRow[];
  /** The asking member's current run of wins, newest match first, any game. */
  streak: number;
  /** Games against the computer, the same two periods. */
  computer: { month: ComputerRow[]; all: ComputerRow[] };
  /** Chess puzzles: each member's rating and solves, all time and since `since`. */
  puzzles: PuzzleRow[];
}

export interface ComputerRow {
  id: string;
  name: string;
  game: string;
  played: number;
  won: number;
  drawn: number;
  /** A win scores its level's points (LEVEL_POINTS); a loss or a draw, none. */
  score: number;
  /** The hardest level this member has beaten at this game, if any. */
  best: AiLevel | null;
}

/** Beating Hard is worth three wins on Easy: piling up easy wins should not
 *  top the board over someone who beats the computer at its best. */
export const LEVEL_POINTS: Record<AiLevel, number> = { easy: 1, normal: 2, hard: 3 };

/** The first moment of this month in UTC — the default when the client sends none. */
export function monthStart(now = new Date()): string {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
}

interface FinishedRow {
  game: string;
  blue_id: string;
  red_id: string;
  winner: number | null;
  finished_at: string | null;
  updated_at: string;
}

export function familyStats(db: Db, userId: string, since: string = monthStart()): FamilyStats {
  const rows = (db.prepare(`
    SELECT game, blue_id, red_id, winner, finished_at, updated_at FROM matches
    WHERE status = 'finished'
    ORDER BY COALESCE(finished_at, updated_at) DESC, rowid DESC
  `).all() as FinishedRow[]).filter((row) => !isGuestId(row.blue_id) && !isGuestId(row.red_id));

  const names = new Map<string, string>();
  for (const member of db.prepare("SELECT id, name FROM members").all() as { id: string; name: string }[]) {
    names.set(member.id, member.name);
  }

  const tally = (list: FinishedRow[]): StatsRow[] => {
    const byKey = new Map<string, StatsRow>();
    for (const row of list) {
      [row.blue_id, row.red_id].forEach((id, seat) => {
        const key = `${id}\u0000${row.game}`;
        let entry = byKey.get(key);
        if (!entry) {
          entry = { id, name: names.get(id) ?? id, game: row.game, played: 0, won: 0, drawn: 0 };
          byKey.set(key, entry);
        }
        entry.played++;
        if (row.winner === null) entry.drawn++;
        else if (row.winner === seat) entry.won++;
      });
    }
    return [...byKey.values()];
  };

  const finishedAt = (row: FinishedRow) => row.finished_at ?? row.updated_at;
  let streak = 0;
  for (const row of rows) {
    const seat = row.blue_id === userId ? 0 : row.red_id === userId ? 1 : null;
    if (seat === null) continue;
    if (row.winner !== seat) break;
    streak++;
  }

  return {
    since,
    month: tally(rows.filter((row) => finishedAt(row) >= since)),
    all: tally(rows),
    streak,
    computer: computerStats(db, names, since),
    puzzles: puzzleStats(db, names, since)
  };
}

interface ComputerResultRow {
  member_id: string;
  game: string;
  level: AiLevel;
  result: "won" | "lost" | "drawn";
  finished_at: string;
}

function computerStats(db: Db, names: Map<string, string>, since: string): FamilyStats["computer"] {
  const rows = db.prepare("SELECT member_id, game, level, result, finished_at FROM computer_results").all() as ComputerResultRow[];
  const tally = (list: ComputerResultRow[]): ComputerRow[] => {
    const byKey = new Map<string, ComputerRow>();
    for (const row of list) {
      const key = `${row.member_id}\u0000${row.game}`;
      let entry = byKey.get(key);
      if (!entry) {
        entry = { id: row.member_id, name: names.get(row.member_id) ?? row.member_id, game: row.game, played: 0, won: 0, drawn: 0, score: 0, best: null };
        byKey.set(key, entry);
      }
      entry.played++;
      if (row.result === "drawn") entry.drawn++;
      if (row.result === "won") {
        entry.won++;
        entry.score += LEVEL_POINTS[row.level];
        if (!entry.best || LEVEL_POINTS[row.level] > LEVEL_POINTS[entry.best]) entry.best = row.level;
      }
    }
    return [...byKey.values()];
  };
  return { month: tally(rows.filter((row) => row.finished_at >= since)), all: tally(rows) };
}

export interface ComputerResult {
  game: string;
  level: AiLevel;
  result: "won" | "lost" | "drawn";
  key: string;
}

/** Keeps a finished game against the computer; false when this member already
 *  reported the game with this key. */
export function recordComputerResult(db: Db, memberId: string, input: ComputerResult): boolean {
  const info = db.prepare(`
    INSERT INTO computer_results (member_id, game, level, result, game_key) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT (member_id, game_key) DO NOTHING
  `).run(memberId, input.game, input.level, input.result, input.key);
  return info.changes > 0;
}
