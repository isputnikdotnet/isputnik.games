// Each member's chess rating, worked out from the games already kept: their
// games against the computer (computer_results, where each level counts as
// an opponent of a fixed rating) and their finished online chess matches with
// another member (both sides move). Two at one screen never counts — one
// person may be playing both sides — and neither does a game with a guest.
// Nothing is stored: the games are replayed in the order they finished, so
// the levels' ratings below can be retuned and every rating follows.
import type { AiLevel, PlayerIndex } from "@isputnik/games-engine";
import type { Db } from "./db.js";
import { isGuestId } from "./identity.js";

/** The computer at each level, as a rated opponent — a first estimate, to tune once the family has played. */
export const COMPUTER_RATING: Record<AiLevel, number> = { easy: 600, normal: 1100, hard: 1500 };
export const CHESS_START_RATING = 1000;
/** Games until a rating settles: until then it moves faster and shows as provisional. */
export const PROVISIONAL_GAMES = 10;
const RATING_FLOOR = 100;

export interface ChessRating {
  rating: number;
  games: number;
  provisional: boolean;
  /** What the latest game did to it; null before any. */
  change: number | null;
}

interface Entry {
  rating: number;
  games: number;
  change: number | null;
}

type Game =
  | { at: string; kind: "computer"; member: string; level: AiLevel; score: number }
  | { at: string; kind: "online"; white: string; black: string; winner: PlayerIndex | null };

function expected(rating: number, opponent: number): number {
  return 1 / (1 + 10 ** ((opponent - rating) / 400));
}

function step(entry: Entry, opponent: number, score: number): number {
  const k = entry.games < PROVISIONAL_GAMES ? 40 : 24;
  return Math.max(RATING_FLOOR, Math.round(entry.rating + k * (score - expected(entry.rating, opponent))));
}

export function chessRatings(db: Db): Map<string, ChessRating> {
  const games: Game[] = [];
  for (const row of db.prepare(
    "SELECT member_id, level, result, finished_at FROM computer_results WHERE game = 'chess'"
  ).all() as { member_id: string; level: AiLevel; result: "won" | "lost" | "drawn"; finished_at: string }[]) {
    games.push({ at: row.finished_at, kind: "computer", member: row.member_id, level: row.level, score: row.result === "won" ? 1 : row.result === "drawn" ? 0.5 : 0 });
  }
  for (const row of db.prepare(`
    SELECT blue_id, red_id, winner, COALESCE(finished_at, updated_at) AS at FROM matches
    WHERE game = 'chess' AND status = 'finished'
  `).all() as { blue_id: string; red_id: string; winner: PlayerIndex | null; at: string }[]) {
    if (isGuestId(row.blue_id) || isGuestId(row.red_id) || row.blue_id === row.red_id) continue;
    games.push({ at: row.at, kind: "online", white: row.blue_id, black: row.red_id, winner: row.winner });
  }
  games.sort((a, b) => a.at.localeCompare(b.at));

  const table = new Map<string, Entry>();
  const of = (id: string) => {
    let entry = table.get(id);
    if (!entry) table.set(id, (entry = { rating: CHESS_START_RATING, games: 0, change: null }));
    return entry;
  };
  const apply = (entry: Entry, next: number) => {
    entry.change = next - entry.rating;
    entry.rating = next;
    entry.games++;
  };
  for (const game of games) {
    if (game.kind === "computer") {
      const entry = of(game.member);
      apply(entry, step(entry, COMPUTER_RATING[game.level], game.score));
    } else {
      const white = of(game.white);
      const black = of(game.black);
      const whiteScore = game.winner === null ? 0.5 : game.winner === 0 ? 1 : 0;
      // Both from the ratings before the game.
      const nextWhite = step(white, black.rating, whiteScore);
      const nextBlack = step(black, white.rating, 1 - whiteScore);
      apply(white, nextWhite);
      apply(black, nextBlack);
    }
  }

  const out = new Map<string, ChessRating>();
  for (const [id, entry] of table) out.set(id, { ...entry, provisional: entry.games < PROVISIONAL_GAMES });
  return out;
}

export function chessRatingOf(db: Db, memberId: string): ChessRating {
  return chessRatings(db).get(memberId) ?? { rating: CHESS_START_RATING, games: 0, provisional: true, change: null };
}

export interface ChessRatingRow extends ChessRating {
  id: string;
  name: string;
}

/** Everyone with a rated game, for the leaderboard's Chess rating tab. */
export function chessRatingRows(db: Db, names: Map<string, string>): ChessRatingRow[] {
  return [...chessRatings(db)].map(([id, rating]) => ({ id, name: names.get(id) ?? id, ...rating }));
}
