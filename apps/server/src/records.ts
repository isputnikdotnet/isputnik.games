// Finished chess games kept for review. An online match is already on the
// server, moves and all; a game played on one device (against the computer,
// or two at one screen) is sent here by the browser when it ends, keyed like
// a computer result so a resend changes nothing. The moves are replayed
// through the rules before they are kept, so a record is always a real game.
// The member's own games — both kinds — list together, newest first.
import { nanoid } from "nanoid";
import { Chess, chess, type AiLevel, type ChessMove, type PlayerIndex } from "@isputnik/games-engine";
import type { Db } from "./db.js";
import { MatchError } from "./matches.js";

export type RecordMode = "computer" | "local";

export interface RecordInput {
  game: "chess";
  key: string;
  mode: RecordMode;
  /** Against the computer: its level when the game ended, and the person's seat. */
  level?: AiLevel;
  seat?: PlayerIndex;
  moves: unknown[];
  /** How a game the rules did not end was ended: a draw agreed, or a resignation. */
  finish?: { reason: "agreed" | "resigned"; resigning?: PlayerIndex };
}

/** One line of "My games". */
export interface ReviewItem {
  source: "record" | "match";
  id: string;
  game: string;
  mode: RecordMode | "online";
  level: AiLevel | null;
  /** The member's seat; null at one screen, where they were both. */
  seat: PlayerIndex | null;
  /** The other side: a member's name online, else null (the computer, or the same screen). */
  opponent: string | null;
  winner: PlayerIndex | null;
  reason: string | null;
  moveCount: number;
  finishedAt: string;
}

export interface ReviewRecord extends ReviewItem {
  moves: ChessMove[];
}

export const RECORD_MAX_MOVES = 1000;

/** Keeps a finished local game; false when this member already sent it. */
export function saveRecord(db: Db, memberId: string, input: RecordInput): { recorded: boolean; id: string } {
  if (input.mode === "computer" && (input.level === undefined || input.seat === undefined)) {
    throw new MatchError(400, "A game against the computer needs its level and the player's seat");
  }
  if (input.moves.length > RECORD_MAX_MOVES) throw new MatchError(400, "Too many moves");
  let moves: ChessMove[];
  let state;
  try {
    moves = input.moves.map((move) => chess.parseMove(move));
    state = Chess.replay(moves);
    if (state.status.kind === "playing" && input.finish) state = Chess.finish(state, input.finish.reason, input.finish.resigning);
  } catch (error) {
    throw new MatchError(400, `Not a legal game: ${(error as Error).message}`);
  }
  if (state.status.kind !== "finished") throw new MatchError(400, "The game is not over");

  const existing = db.prepare("SELECT id FROM game_records WHERE member_id = ? AND game_key = ?").get(memberId, input.key) as { id: string } | undefined;
  if (existing) return { recorded: false, id: existing.id };
  const id = nanoid(16);
  db.prepare(`
    INSERT INTO game_records (id, member_id, game, game_key, mode, level, seat, moves, finish_reason, winner)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id, memberId, input.game, input.key, input.mode,
    input.mode === "computer" ? input.level : null,
    input.mode === "computer" ? input.seat : null,
    JSON.stringify(moves), state.status.reason, state.status.winner
  );
  return { recorded: true, id };
}

interface RecordRow {
  id: string;
  game: string;
  mode: RecordMode;
  level: AiLevel | null;
  seat: PlayerIndex | null;
  moves: string;
  finish_reason: string;
  winner: PlayerIndex | null;
  finished_at: string;
}

function recordItem(row: RecordRow): ReviewRecord {
  const moves = JSON.parse(row.moves) as ChessMove[];
  return {
    source: "record", id: row.id, game: row.game, mode: row.mode, level: row.level, seat: row.seat,
    opponent: null, winner: row.winner, reason: row.finish_reason, moveCount: moves.length, finishedAt: row.finished_at, moves
  };
}

interface MatchRow {
  id: string;
  game: string;
  blue_id: string;
  red_id: string;
  move_count: number;
  finish_reason: string | null;
  winner: PlayerIndex | null;
  finished_at: string | null;
  updated_at: string;
}

/** The member's finished games of `game`, online and local, newest first. */
export function listReviews(db: Db, memberId: string, game: string, limit = 50): ReviewItem[] {
  const names = new Map((db.prepare("SELECT id, name FROM members").all() as { id: string; name: string }[]).map((m) => [m.id, m.name]));
  const records = (db.prepare(
    "SELECT * FROM game_records WHERE member_id = ? AND game = ? ORDER BY finished_at DESC LIMIT ?"
  ).all(memberId, game, limit) as RecordRow[]).map((row): ReviewItem => {
    const { moves: _moves, ...item } = recordItem(row);
    return item;
  });
  const matches = (db.prepare(`
    SELECT id, game, blue_id, red_id, move_count, finish_reason, winner, finished_at, updated_at FROM matches
    WHERE status = 'finished' AND game = ? AND (blue_id = ? OR red_id = ?)
    ORDER BY COALESCE(finished_at, updated_at) DESC LIMIT ?
  `).all(game, memberId, memberId, limit) as MatchRow[]).map((row): ReviewItem => {
    const seat: PlayerIndex = row.blue_id === memberId ? 0 : 1;
    const other = seat === 0 ? row.red_id : row.blue_id;
    return {
      source: "match", id: row.id, game: row.game, mode: "online", level: null, seat,
      opponent: names.get(other) ?? other, winner: row.winner, reason: row.finish_reason,
      moveCount: row.move_count, finishedAt: row.finished_at ?? row.updated_at
    };
  });
  return [...records, ...matches].sort((a, b) => b.finishedAt.localeCompare(a.finishedAt)).slice(0, limit);
}

/** One of the member's own local games, moves and all; null for anyone else's. */
export function getRecord(db: Db, memberId: string, id: string): ReviewRecord | null {
  const row = db.prepare("SELECT * FROM game_records WHERE id = ? AND member_id = ?").get(id, memberId) as RecordRow | undefined;
  return row ? recordItem(row) : null;
}
