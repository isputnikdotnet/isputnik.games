// The family's results, for the lobby's leaderboard and "Your month". Only
// finished online matches between two members count: a game against the
// computer never reaches the server, and a match with a guest is a visit, not
// a family result. The numbers are per member and per game, for this month and
// for all time; the lobby sums or filters them as its switches say, so one
// small answer serves every view.
import type { Db } from "./db.js";
import { isGuestId } from "./identity.js";

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
}

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
    streak
  };
}
