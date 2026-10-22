// Online matches (docs/plan.md → Phase 2). The server is the authority: it holds
// the move list, replays it through the engine on every read, and accepts a move
// only from the seat whose turn it is. Everything here is a plain function over
// the database so the routes stay thin and the tests need no HTTP.
import { nanoid } from "nanoid";
import { getGame, otherPlayer, type AnyGame, type GameStatus, type PlayerIndex } from "@isputnik/games-engine";
import type { Db } from "./db.js";

export type MatchStatus = "invited" | "playing" | "finished" | "declined" | "cancelled";

export interface MatchRow {
  id: string;
  game: string;
  options: string;
  blue_id: string;
  red_id: string;
  created_by: string;
  status: MatchStatus;
  moves: string;
  move_count: number;
  turn: number | null;
  finish_reason: string | null;
  winner: number | null;
  created_at: string;
  updated_at: string;
  finished_at: string | null;
}

export interface Member {
  id: string;
  name: string;
}

/** What a list shows: enough to name the match and say whether it waits on you. */
export interface MatchSummary {
  id: string;
  game: string;
  options: unknown;
  status: MatchStatus;
  players: [Member, Member];
  createdBy: string;
  moveCount: number;
  turn: PlayerIndex | null;
  winner: PlayerIndex | null;
  finishReason: string | null;
  score: [number, number] | null;
  createdAt: string;
  updatedAt: string;
  finishedAt: string | null;
}

export interface MatchDetail extends MatchSummary {
  state: { status: GameStatus };
}

export class MatchError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "MatchError";
  }
}

/** How long an unanswered invitation lives. */
const INVITATION_DAYS = 14;

export function rememberMember(db: Db, member: Member): void {
  db.prepare(`
    INSERT INTO members (id, name, last_seen_at) VALUES (?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    ON CONFLICT (id) DO UPDATE SET name = excluded.name, last_seen_at = excluded.last_seen_at
  `).run(member.id, member.name);
}

/** A name for someone who has not visited yet: kept only if nobody else is on record. */
function rememberIfUnknown(db: Db, member: Member): void {
  db.prepare("INSERT OR IGNORE INTO members (id, name) VALUES (?, ?)").run(member.id, member.name);
}

function memberOf(db: Db, id: string): Member {
  const row = db.prepare("SELECT id, name FROM members WHERE id = ?").get(id) as Member | undefined;
  return row ?? { id, name: id };
}

function gameOf(row: MatchRow): AnyGame {
  const game = getGame(row.game);
  if (!game) throw new MatchError(500, `Unknown game "${row.game}"`);
  return game;
}

function replay(row: MatchRow): { status: GameStatus } {
  const game = gameOf(row);
  let state = game.createGame(JSON.parse(row.options));
  for (const move of JSON.parse(row.moves) as unknown[]) state = game.applyMove(state, move);
  if (row.status === "finished" && state.status.kind === "playing" && (row.finish_reason === "agreed" || row.finish_reason === "resigned")) {
    state = game.finish(state, row.finish_reason, row.winner === null ? undefined : otherPlayer(row.winner as PlayerIndex));
  }
  return state;
}

function summarize(db: Db, row: MatchRow, state?: { status: GameStatus }): MatchSummary {
  const game = gameOf(row);
  const replayed = state ?? replay(row);
  return {
    id: row.id,
    game: row.game,
    options: JSON.parse(row.options),
    status: row.status,
    players: [memberOf(db, row.blue_id), memberOf(db, row.red_id)],
    createdBy: row.created_by,
    moveCount: row.move_count,
    turn: row.status === "playing" ? (row.turn as PlayerIndex) : null,
    winner: row.winner === null ? null : (row.winner as PlayerIndex),
    finishReason: row.finish_reason,
    score: game.scoreOf ? game.scoreOf(replayed) : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    finishedAt: row.finished_at
  };
}

function rowOf(db: Db, id: string): MatchRow {
  const row = db.prepare("SELECT * FROM matches WHERE id = ?").get(id) as MatchRow | undefined;
  if (!row) throw new MatchError(404, "Match not found");
  return row;
}

function seatOf(row: MatchRow, userId: string): PlayerIndex {
  if (row.blue_id === userId) return 0;
  if (row.red_id === userId) return 1;
  throw new MatchError(404, "Match not found");
}

export interface CreateMatchInput {
  game: string;
  options: unknown;
  opponent: Member;
  /** The seat the creator takes; the opponent gets the other. */
  seat: PlayerIndex;
}

export function createMatch(db: Db, me: Member, input: CreateMatchInput): MatchSummary {
  const game = getGame(input.game);
  if (!game) throw new MatchError(400, "Unknown game");
  if (input.opponent.id === me.id) throw new MatchError(400, "You cannot invite yourself");
  try {
    game.createGame(input.options);
  } catch (err) {
    throw new MatchError(400, err instanceof Error ? err.message : "Invalid options");
  }
  rememberIfUnknown(db, input.opponent);
  const id = nanoid(16);
  const [blue, red] = input.seat === 0 ? [me.id, input.opponent.id] : [input.opponent.id, me.id];
  db.prepare(`
    INSERT INTO matches (id, game, options, blue_id, red_id, created_by, status)
    VALUES (?, ?, ?, ?, ?, ?, 'invited')
  `).run(id, input.game, JSON.stringify(input.options), blue, red, me.id);
  return summarize(db, rowOf(db, id));
}

export function getMatch(db: Db, userId: string, id: string): MatchDetail {
  const row = rowOf(db, id);
  seatOf(row, userId);
  const state = replay(row);
  return { ...summarize(db, row, state), state };
}

export function listMatches(db: Db, userId: string): MatchSummary[] {
  expireInvitations(db);
  const rows = db.prepare(`
    SELECT * FROM matches
    WHERE (blue_id = ? OR red_id = ?) AND status IN ('invited', 'playing', 'finished')
    ORDER BY updated_at DESC, rowid DESC
    LIMIT 100
  `).all(userId, userId) as MatchRow[];
  return rows.map((row) => summarize(db, row));
}

/** An invitation nobody answered for INVITATION_DAYS is cancelled. */
export function expireInvitations(db: Db): number {
  const result = db.prepare(`
    UPDATE matches SET status = 'cancelled', updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
    WHERE status = 'invited' AND created_at < strftime('%Y-%m-%dT%H:%M:%fZ', 'now', ?)
  `).run(`-${INVITATION_DAYS} days`);
  return result.changes;
}

export function answerInvitation(db: Db, userId: string, id: string, answer: "accept" | "decline"): MatchSummary {
  const row = rowOf(db, id);
  seatOf(row, userId);
  if (row.status !== "invited") throw new MatchError(409, "This invitation has already been answered");
  if (row.created_by === userId) throw new MatchError(403, "You sent this invitation; the other player answers it");
  if (answer === "accept") {
    db.prepare("UPDATE matches SET status = 'playing', turn = 0, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?").run(id);
  } else {
    db.prepare("UPDATE matches SET status = 'declined', updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?").run(id);
  }
  return summarize(db, rowOf(db, id));
}

export function cancelInvitation(db: Db, userId: string, id: string): MatchSummary {
  const row = rowOf(db, id);
  seatOf(row, userId);
  if (row.status !== "invited") throw new MatchError(409, "Only an unanswered invitation can be withdrawn");
  if (row.created_by !== userId) throw new MatchError(403, "Only the sender can withdraw an invitation");
  db.prepare("UPDATE matches SET status = 'cancelled', updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?").run(id);
  return summarize(db, rowOf(db, id));
}

/**
 * One move. `expectedCount` is the move count the client saw; a mismatch means
 * the client is behind (the other player moved, or this is a double submit)
 * and answers 409 rather than applying a move to a position the player never saw.
 */
export function playMove(db: Db, userId: string, id: string, move: unknown, expectedCount: number): MatchDetail {
  return db.transaction(() => {
    const row = rowOf(db, id);
    const seat = seatOf(row, userId);
    if (row.status !== "playing") throw new MatchError(409, "This match is not being played");
    if (row.turn !== seat) throw new MatchError(409, "It is not your turn");
    if (row.move_count !== expectedCount) throw new MatchError(409, "The match has moved on; reload it");

    const game = gameOf(row);
    let state = replay(row);
    try {
      state = game.applyMove(state, move);
    } catch (err) {
      throw new MatchError(400, err instanceof Error ? err.message : "Illegal move");
    }
    const moves = [...(JSON.parse(row.moves) as unknown[]), move];
    if (state.status.kind === "finished") {
      db.prepare(`
        UPDATE matches SET moves = ?, move_count = ?, turn = NULL, status = 'finished', finish_reason = ?, winner = ?,
          updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), finished_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
        WHERE id = ?
      `).run(JSON.stringify(moves), moves.length, state.status.reason, state.status.winner, id);
    } else {
      db.prepare(`
        UPDATE matches SET moves = ?, move_count = ?, turn = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
        WHERE id = ?
      `).run(JSON.stringify(moves), moves.length, state.status.turn, id);
    }
    const updated = rowOf(db, id);
    return { ...summarize(db, updated, state), state };
  })();
}

export function resign(db: Db, userId: string, id: string): MatchDetail {
  return db.transaction(() => {
    const row = rowOf(db, id);
    const seat = seatOf(row, userId);
    if (row.status !== "playing") throw new MatchError(409, "This match is not being played");
    db.prepare(`
      UPDATE matches SET turn = NULL, status = 'finished', finish_reason = 'resigned', winner = ?,
        updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), finished_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
      WHERE id = ?
    `).run(otherPlayer(seat), id);
    const updated = rowOf(db, id);
    const state = replay(updated);
    return { ...summarize(db, updated, state), state };
  })();
}
